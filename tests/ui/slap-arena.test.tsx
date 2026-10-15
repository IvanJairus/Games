import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// jsdom has no WebGL, so the 3D stage is replaced with a stub. Everything under
// test here is the wiring that used to break silently: phase flow, HUD binding,
// touch reveal, and the lobby's join/create paths.
const stageStub = vi.hoisted(() => vi.fn());
vi.mock('@/games/slap-arena/components/Arena3D', () => ({
  Arena3D: React.forwardRef<unknown, Record<string, unknown>>((props, ref) => {
    stageStub(props);
    React.useImperativeHandle(ref, () => ({
      impact: vi.fn(),
      koBurst: vi.fn(),
      confetti: vi.fn(),
      shake: vi.fn(),
      float: vi.fn(),
      freeze: vi.fn(),
    }));
    return <div data-testid="slap-stage-stub" />;
  }),
}));

import { SlapArenaLobby } from '@/games/slap-arena/pages/SlapArenaLobby';
import { SlapArenaMatch } from '@/games/slap-arena/pages/SlapArenaMatch';
import {
  createOnlineRoom,
  joinOnlineRoom,
  leaveOnlineMatch,
  subscribeToMatch,
  type MatchSyncData,
} from '@/games/common/multiplayer';
import { getSupabase } from '@/lib/supabase';

vi.mock('@/games/common/multiplayer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/games/common/multiplayer')>();
  return {
    ...actual,
    createOnlineRoom: vi.fn(),
    joinOnlineRoom: vi.fn(),
    leaveOnlineMatch: vi.fn(),
    subscribeToMatch: vi.fn(),
  };
});

vi.mock('@/lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase')>();
  return { ...actual, getSupabase: vi.fn(() => ({ channel: vi.fn() })) };
});

function sync(overrides: {
  status?: 'waiting' | 'playing' | 'completed' | 'abandoned';
  gameState?: Record<string, unknown>;
  players: Array<{ session_id: string; name: string; is_host: boolean; player_index: number }>;
  myPlayerIndex: number;
}): MatchSyncData {
  return {
    match: {
      id: 'm1',
      room_code: 'ABC123',
      game_type: 'slap-arena',
      status: overrides.status ?? 'playing',
      max_players: 4,
      current_turn: 0,
      game_state: overrides.gameState ?? {},
      winner_index: null,
      created_at: '',
      updated_at: '',
    },
    players: overrides.players.map((p) => ({
      ...p,
      id: `row_${p.session_id}`,
      match_id: 'm1',
      connected: true,
      created_at: '',
    })),
    myPlayerIndex: overrides.myPlayerIndex,
    isHost: overrides.myPlayerIndex === 0,
  };
}

function setViewport(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: h });
  window.dispatchEvent(new Event('resize'));
}

const renderMatch = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/slap-arena/solo" element={<SlapArenaMatch />} />
        <Route path="/slap-arena/m/:code" element={<SlapArenaMatch />} />
        <Route path="/slap-arena" element={<SlapArenaLobby />} />
      </Routes>
    </MemoryRouter>
  );

function battleSnapshot() {
  return {
    round: 1,
    phase: 'BATTLE',
    countdown: 0,
    scoreToWin: 3,
    winnerId: null,
    matchWinnerId: null,
    t: 1,
    players: [
      {
        id: 'host_one',
        name: 'Host',
        color: '#ff5d5d',
        isBot: false,
        x: 3,
        z: 0,
        vx: 0,
        vz: 0,
        angle: 0,
        score: 0,
        isFalling: false,
        eliminated: false,
        slapCooldown: 0,
        dashCooldown: 0,
      },
    ],
  };
}

/**
 * Renders the page as a guest on a channel that keeps what goes out, and pushes one
 * battle snapshot in so the client's own prediction loop has a live round to work on.
 */
async function mountClient() {
  const sent: Array<{ event: string; payload: any }> = [];
  const handlers: Record<string, Array<(m: { payload: unknown }) => void>> = {};
  vi.mocked(joinOnlineRoom).mockResolvedValueOnce({ matchId: 'm1', playerIndex: 1, isHost: false });
  const fakeChannel = {
    on: vi.fn(),
    send: vi.fn((args: { event: string; payload: unknown }) => {
      sent.push(args);
      return Promise.resolve('ok');
    }),
    track: vi.fn(),
    presenceState: vi.fn(() => ({})),
  };
  fakeChannel.on.mockImplementation(
    (
      _type: string,
      filter: { event: string },
      cb: (m: { payload: unknown }) => void
    ) => {
      (handlers[filter.event] ??= []).push(cb);
      return fakeChannel;
    }
  );
  let onStatus: (s: string) => void = () => {};
  vi.mocked(subscribeToMatch).mockImplementation((_code, _sync, _move, _leave, _conn, extras) => {
    onStatus = extras?.onStatus ?? (() => {});
    return { unsubscribe: vi.fn(), channel: fakeChannel as never };
  });

  renderMatch('/slap-arena/m/ABC123');
  await waitFor(() => expect(subscribeToMatch).toHaveBeenCalled());
  act(() => onStatus('SUBSCRIBED'));
  act(() => (handlers['sa_snap'] ?? []).forEach((h) => h({ payload: battleSnapshot() })));

  return {
    sent,
    inputs: () => sent.filter((m) => m.event === 'sa_in'),
    press: () => act(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }))),
    lift: () => act(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }))),
  };
}

beforeEach(() => {
  // jsdom ships a window.localStorage without its methods, and the app's own guards
  // swallow that failure. Stub the shape so the stored preferences are tested for real.
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k) : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
  vi.mocked(createOnlineRoom).mockReset();
  vi.mocked(joinOnlineRoom).mockReset();
  vi.mocked(leaveOnlineMatch).mockReset();
  vi.mocked(subscribeToMatch).mockReset();
  vi.mocked(subscribeToMatch).mockReturnValue({ unsubscribe: vi.fn(), channel: null });
  stageStub.mockReset();
});

describe('Slap Arena lobby (desktop 1280px)', () => {
  beforeEach(() => setViewport(1280, 800));

  it('offers both modes and keeps the profile form usable', () => {
    render(
      <MemoryRouter>
        <SlapArenaLobby />
      </MemoryRouter>
    );
    expect(screen.getByTestId('slap-tab-solo')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('slap-start-solo')).toBeInTheDocument();
    expect((screen.getByTestId('slap-name-input') as HTMLInputElement).value).not.toBe('');

    fireEvent.click(screen.getByTestId('slap-tab-online'));
    expect(screen.getByTestId('slap-create-room')).toBeInTheDocument();
    expect(screen.getByTestId('slap-join-input')).toBeInTheDocument();
  });

  it('links back to the games hub', () => {
    render(
      <MemoryRouter>
        <SlapArenaLobby />
      </MemoryRouter>
    );
    const back = screen.getByRole('link', { name: /kembali ke \/games\//i });
    expect(back).toHaveAttribute('href', '/');
    expect(back).toHaveTextContent('/games/');
  });

  it('refuses a short room code before spending a network call', () => {
    render(
      <MemoryRouter>
        <SlapArenaLobby />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId('slap-tab-online'));
    fireEvent.change(screen.getByTestId('slap-join-input'), { target: { value: 'AB' } });
    fireEvent.click(screen.getByTestId('slap-join-room'));
    expect(screen.getByTestId('slap-error')).toHaveTextContent(/6 huruf atau angka/i);
  });

  it('shows the real failure message when room creation is refused', async () => {
    vi.mocked(createOnlineRoom).mockRejectedValueOnce(new Error('Room sudah penuh'));
    render(
      <MemoryRouter>
        <SlapArenaLobby />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId('slap-tab-online'));
    fireEvent.click(screen.getByTestId('slap-create-room'));
    await waitFor(() => expect(screen.getByTestId('slap-error')).toHaveTextContent('Room sudah penuh'));
  });
});

describe('Slap Arena solo match (desktop)', () => {
  beforeEach(() => setViewport(1280, 800));

  it('counts down into battle with four brawlers on the scoreboard', async () => {
    renderMatch('/slap-arena/solo');
    expect(screen.getByTestId('slap-scores')).toBeInTheDocument();
    await waitFor(
      () => {
        expect(screen.getByTestId('slap-round')).toHaveTextContent('RONDE 1');
        expect(screen.getAllByTestId('slap-chip-bot')).toHaveLength(3);
      },
      { timeout: 6000 }
    );
  });

  it('exposes live cooldown readouts instead of a frozen label', async () => {
    renderMatch('/slap-arena/solo');
    await waitFor(() => expect(screen.getByTestId('slap-keys')).toBeInTheDocument(), { timeout: 6000 });
    expect(screen.getByTestId('slap-cd')).toHaveTextContent(/siap|\d+\.\d+s/);
  });

  it('keeps the keyboard legend on desktop and never paints the touch pad', () => {
    renderMatch('/slap-arena/solo');
    expect(screen.getByTestId('slap-keys')).toBeInTheDocument();
    expect(screen.queryByTestId('slap-touch')).not.toBeInTheDocument();
  });

  it('mutes and unmutes from the HUD', () => {
    renderMatch('/slap-arena/solo');
    const mute = screen.getByTestId('slap-mute');
    const before = mute.getAttribute('aria-pressed');
    fireEvent.click(mute);
    expect(mute.getAttribute('aria-pressed')).not.toBe(before);
  });

  it('starts the effects preference on auto', () => {
    renderMatch('/slap-arena/solo');
    expect(screen.getByTestId('slap-fx')).toHaveTextContent('AUTO');
    expect(stageStub.mock.calls.at(-1)?.[0]).toMatchObject({ fxMode: 'auto' });
  });

  it('reads a stored effects preference and cycles it in place', () => {
    window.localStorage.setItem('ij_slap_fx', 'low');
    renderMatch('/slap-arena/solo');
    const fx = screen.getByTestId('slap-fx');
    expect(fx).toHaveTextContent('RENDAH');
    expect(stageStub.mock.calls.at(-1)?.[0]).toMatchObject({ fxMode: 'low' });
    fireEvent.click(fx);
    expect(fx).toHaveTextContent('AUTO');
    expect(window.localStorage.getItem('ij_slap_fx')).toBe('auto');
    fireEvent.click(fx);
    expect(fx).toHaveTextContent('TINGGI');
    expect(window.localStorage.getItem('ij_slap_fx')).toBe('high');
  });
});

describe('Slap Arena on touch viewport (375x667)', () => {
  beforeEach(() => setViewport(375, 667));

  it('reveals the floating stick and action buttons only after a real touch', async () => {
    renderMatch('/slap-arena/solo');
    expect(screen.queryByTestId('slap-touch')).not.toBeInTheDocument();

    fireEvent.pointerDown(window, { pointerType: 'touch' });
    await waitFor(() => expect(screen.getByTestId('slap-touch')).toBeInTheDocument(), { timeout: 6000 });
    expect(screen.getByTestId('slap-btn-slap')).toBeInTheDocument();
    expect(screen.getByTestId('slap-btn-dash')).toBeInTheDocument();
  });

  it('hides the keyboard legend once the player is on touch', async () => {
    renderMatch('/slap-arena/solo');
    fireEvent.pointerDown(window, { pointerType: 'touch' });
    await waitFor(() => expect(screen.queryByTestId('slap-keys')).not.toBeInTheDocument(), { timeout: 6000 });
  });
});

describe('Slap Arena multiplayer wiring', () => {
  beforeEach(() => setViewport(1280, 800));

  it('registers the joining player before subscribing to the room', async () => {
    vi.mocked(joinOnlineRoom).mockResolvedValueOnce({ matchId: 'm1', playerIndex: 1, isHost: false });
    renderMatch('/slap-arena/m/ABC123');
    await waitFor(() => expect(joinOnlineRoom).toHaveBeenCalledWith({ roomCode: 'ABC123', playerName: expect.any(String) }));
    expect(subscribeToMatch).toHaveBeenCalledWith(
      'ABC123',
      expect.any(Function),
      undefined,
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ presence: expect.any(Object), onStatus: expect.any(Function) })
    );
  });

  it('surfaces a room error instead of freezing on an empty island', async () => {
    vi.mocked(joinOnlineRoom).mockRejectedValueOnce(new Error('Room tidak ditemukan. Pastikan kode room benar.'));
    renderMatch('/slap-arena/m/ZZZZZZ');
    await waitFor(() => expect(screen.getByTestId('slap-fatal')).toBeInTheDocument());
    expect(screen.getByTestId('slap-fatal')).toHaveTextContent('Room tidak ditemukan');
  });

  it('reports a missing Supabase configuration rather than a silent stall', async () => {
    vi.mocked(getSupabase).mockReturnValueOnce(null);
    renderMatch('/slap-arena/m/ABC123');
    await waitFor(() => expect(screen.getByTestId('slap-fatal')).toBeInTheDocument());
    expect(screen.getByTestId('slap-fatal')).toHaveTextContent(/Supabase belum dikonfigurasi/);
  });

  it('shows the abandoned-room notice when the sync says so', async () => {
    vi.mocked(joinOnlineRoom).mockResolvedValueOnce({ matchId: 'm1', playerIndex: 0, isHost: true });
    let onSync: (sync: MatchSyncData) => void = () => {};
    vi.mocked(subscribeToMatch).mockImplementation((_code, sync) => {
      onSync = sync;
      return { unsubscribe: vi.fn(), channel: null };
    });
    renderMatch('/slap-arena/m/ABC123');
    await waitFor(() => expect(subscribeToMatch).toHaveBeenCalled());
    act(() => {
      onSync(
        sync({
          status: 'abandoned',
          gameState: { abandonedReason: 'Bob keluar dari pertandingan' },
          players: [{ session_id: 'x', name: 'Bob', is_host: true, player_index: 0 }],
          myPlayerIndex: 0,
        })
      );
    });
    await waitFor(() => expect(screen.getByTestId('slap-disconnected')).toBeInTheDocument());
    expect(screen.getByTestId('slap-disconnected')).toHaveTextContent('Bob keluar dari pertandingan');
  });

  it('sends the movement vector the player actually pressed', async () => {
    // Regression: the loop used to keep the keyboard vector in a local, so every
    // sa_in went out with x:0 and the host never saw anyone move.
    vi.mocked(joinOnlineRoom).mockResolvedValueOnce({ matchId: 'm1', playerIndex: 1, isHost: false });
    const sent: Array<{ event: string; payload: any }> = [];
    const fakeChannel = {
      on: vi.fn(),
      send: vi.fn((args: { event: string; payload: unknown }) => {
        sent.push({ event: args.event, payload: args.payload });
        return Promise.resolve('ok');
      }),
      track: vi.fn(),
      presenceState: vi.fn(() => ({})),
    };
    let onStatus: (s: string) => void = () => {};
    vi.mocked(subscribeToMatch).mockImplementation((_code, _sync, _move, _leave, _conn, extras) => {
      onStatus = extras?.onStatus ?? (() => {});
      return { unsubscribe: vi.fn(), channel: fakeChannel as never };
    });

    renderMatch('/slap-arena/m/ABC123');
    await waitFor(() => expect(subscribeToMatch).toHaveBeenCalled());
    act(() => onStatus('SUBSCRIBED'));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
    });
    await waitFor(
      () => {
        const inputs = sent.filter((m) => m.event === 'sa_in');
        expect(inputs.length).toBeGreaterThan(0);
        expect(Math.max(...inputs.map((m) => m.payload.x))).toBeGreaterThan(0);
      },
      { timeout: 4000 }
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd' }));
    });
  });

  it('sends a banked charge when the slap key is held', async () => {
    const client = await mountClient();
    client.press();
    await new Promise((r) => setTimeout(r, 500));
    client.lift();

    await waitFor(() => {
      expect(client.inputs().some((m) => m.payload.slap === true)).toBe(true);
    });
    expect(Math.max(...client.inputs().map((m) => m.payload.charge ?? 0))).toBeGreaterThan(0.3);
    // The wind-up has to reach the host too, or the peer never sees the tell.
    expect(client.inputs().some((m) => m.payload.held === true)).toBe(true);
  });

  it('waits for the release instead of firing at the top of the meter', async () => {
    const client = await mountClient();
    client.press();
    await new Promise((r) => setTimeout(r, 900));
    // Past the 0.7 s the meter is already full. A full meter is not an order to swing.
    expect(client.inputs().some((m) => m.payload.slap === true)).toBe(false);
    client.lift();
    await waitFor(() => {
      expect(client.inputs().some((m) => m.payload.slap === true)).toBe(true);
    });
    expect(Math.max(...client.inputs().map((m) => m.payload.charge ?? 0))).toBe(1);
  });

  it('fires a stuck hold on its own only past the safety limit', async () => {
    const client = await mountClient();
    client.press();
    await new Promise((r) => setTimeout(r, 2400));
    expect(client.inputs().some((m) => m.payload.slap === true)).toBe(true);
    client.lift();
  });

  it('sends no charge for a tap', async () => {
    const client = await mountClient();
    client.press();
    client.lift();

    await waitFor(() => {
      expect(client.inputs().some((m) => m.payload.slap === true)).toBe(true);
    });
    expect(Math.max(...client.inputs().map((m) => m.payload.charge ?? 0))).toBe(0);
  });

  it('leaves the room through the shared helper on the way out', async () => {
    vi.mocked(joinOnlineRoom).mockResolvedValueOnce({ matchId: 'm1', playerIndex: 0, isHost: true });
    let onSync: (sync: MatchSyncData) => void = () => {};
    vi.mocked(subscribeToMatch).mockImplementation((_code, sync) => {
      onSync = sync;
      return { unsubscribe: vi.fn(), channel: null };
    });
    renderMatch('/slap-arena/m/ABC123');
    await waitFor(() => expect(subscribeToMatch).toHaveBeenCalled());
    act(() => {
      onSync(
        sync({
          players: [{ session_id: 'x', name: 'Me', is_host: true, player_index: 0 }],
          myPlayerIndex: 0,
        })
      );
    });
    fireEvent.click(screen.getByTestId('slap-exit'));
    await waitFor(() => expect(leaveOnlineMatch).toHaveBeenCalledWith(expect.objectContaining({ matchId: 'm1', roomCode: 'ABC123' })));
  });
});
