import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BattleshipLocal } from '@/games/battleship/pages/BattleshipLocal';
import { BattleshipMatch } from '@/games/battleship/pages/BattleshipMatch';
import { FLEET, type BattleshipState } from '@/games/battleship/engine/types';
import { createInitialState } from '@/games/battleship/engine';
import {
  leaveOnlineMatch,
  submitOnlineMove,
  subscribeToMatch,
  type MatchSyncData,
} from '@/games/common/multiplayer';

vi.mock('@/games/common/multiplayer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/games/common/multiplayer')>();
  return { ...actual, submitOnlineMove: vi.fn(), subscribeToMatch: vi.fn(), leaveOnlineMatch: vi.fn() };
});

vi.mock('@/games/common/roomPresence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/games/common/roomPresence')>();
  return { ...actual, watchRoomPeers: vi.fn(() => () => {}) };
});

vi.mock('@/lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase')>();
  return {
    ...actual,
    isSupabaseConfigured: () => true,
    getSupabase: () => null,
    getStoredPlayerName: () => 'Nakhoda',
  };
});

const tick = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

const openCells = (container: HTMLElement): HTMLButtonElement[] =>
  [...container.querySelectorAll<HTMLButtonElement>('.bs-board-target .bs-cell:not([data-static])')];

const fireButton = (container: HTMLElement): HTMLButtonElement =>
  [...container.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Tembak')) as HTMLButtonElement;

/** Plays a real solo game to its end so the popup is reached through the engine, not a fixture. */
const playSoloToFinish = (container: HTMLElement) => {
  fireEvent.click(screen.getByRole('button', { name: /Acak Ulang/i }));
  fireEvent.click(screen.getByRole('button', { name: /Kunci Armada/i }));
  tick(60);

  for (let shot = 0; shot < 140; shot++) {
    if (screen.queryByTestId('bs-finish-dialog')?.hasAttribute('open')) return;
    const targets = openCells(container);
    if (targets.length === 0) {
      tick(600);
      continue;
    }
    fireEvent.click(targets[0]);
    const fire = fireButton(container);
    expect(fire.disabled).toBe(false);
    fireEvent.click(fire);
    tick(600);
  }
  throw new Error('Permainan solo tidak sampai ke layar selesai');
};

const finishedState = (): BattleshipState => {
  const sunkKinds = FLEET.map((ship) => ship.kind);
  const marks: Record<string, 'hit'> = {};
  sunkKinds.forEach((_, i) => (marks[`${i}`] = 'hit'));
  return {
    ...createInitialState(),
    phase: 'FINISHED',
    commitment: ['c0', 'c1'],
    winner: 0,
    endReason: 'fleet-destroyed',
    shotsTaken: [14, 9],
    sunk: [[], sunkKinds],
    marks: [{}, marks],
  };
};

const syncFor = (game: BattleshipState, myPlayerIndex: number): MatchSyncData => ({
  match: {
    id: 'm1',
    room_code: 'BTA999',
    game_type: 'battleship',
    status: 'completed',
    max_players: 2,
    current_turn: myPlayerIndex,
    game_state: game,
    winner_index: game.winner,
    created_at: '',
    updated_at: 'v1',
  },
  players: [
    {
      id: 'r0',
      match_id: 'm1',
      player_index: 0,
      session_id: 'p0',
      name: 'Nakhoda',
      is_host: true,
      connected: true,
      created_at: '',
    },
    {
      id: 'r1',
      match_id: 'm1',
      player_index: 1,
      session_id: 'p1',
      name: 'Piracy',
      is_host: false,
      connected: true,
      created_at: '',
    },
  ],
  myPlayerIndex,
  isHost: myPlayerIndex === 0,
});

const deliver = (data: MatchSyncData) => {
  vi.mocked(subscribeToMatch).mockImplementation((_code, onSync) => {
    onSync(data);
    return { unsubscribe: vi.fn(), channel: null };
  });
};

const renderLocal = () =>
  render(
    <MemoryRouter initialEntries={['/battleship/local?mode=solo']}>
      <Routes>
        <Route path="/battleship/local" element={<BattleshipLocal />} />
      </Routes>
    </MemoryRouter>
  );

const renderMatch = () =>
  render(
    <MemoryRouter initialEntries={['/battleship/m/BTA999']}>
      <Routes>
        <Route path="/battleship/m/:code" element={<BattleshipMatch />} />
      </Routes>
    </MemoryRouter>
  );

describe('Battleship finish popup', () => {
  beforeEach(() => {
    vi.mocked(submitOnlineMove).mockReset();
    vi.mocked(submitOnlineMove).mockResolvedValue({ ok: true });
    vi.mocked(subscribeToMatch).mockReset();
    vi.mocked(leaveOnlineMatch).mockReset();
    vi.mocked(leaveOnlineMatch).mockResolvedValue(undefined as any);
    window.confirm = vi.fn(() => true) as any;
  });

  describe('local modes', () => {
    // The AI paces itself with timers, so the whole game is played against fake clocks.
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('pops the result with retry, lobby, and home actions in a solo game', () => {
      const { container } = renderLocal();
      playSoloToFinish(container);

      const dialog = screen.getByTestId('bs-finish-dialog');
      expect(dialog).toHaveAttribute('open');
      expect(within(dialog).getByRole('heading').textContent).toMatch(/menang/i);
      expect(within(dialog).getByTestId('bs-finish-retry')).toBeInTheDocument();
      expect(within(dialog).getByRole('link', { name: /Lobi Battleship/i })).toBeInTheDocument();
      expect(within(dialog).getByRole('link', { name: /Halaman utama/i })).toBeInTheDocument();

      fireEvent.click(within(dialog).getByRole('button', { name: /Lihat bukti armada/i }));
      expect(dialog).not.toHaveAttribute('open');
      expect(container.textContent).toMatch(/menang dalam \d+ tembakan/);
    });

    it('starts a fresh local game from the popup without leaving the page', () => {
      const { container } = renderLocal();
      playSoloToFinish(container);

      fireEvent.click(screen.getByTestId('bs-finish-retry'));

      expect(screen.queryByTestId('bs-finish-dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Susun armada Pemain 1/i })).toBeInTheDocument();
      expect(container.querySelectorAll('.bs-cell').length).toBeGreaterThan(0);
    });
  });

  describe('online room', () => {
    it('reopens the room for a rematch when a finished game asks for one', async () => {
      deliver(syncFor(finishedState(), 0));
      renderMatch();

      const dialog = screen.getByTestId('bs-finish-dialog');
      expect(within(dialog).getByRole('heading')).toHaveTextContent('Anda menang');
      expect(within(dialog).getByText('Tembakan Lawan')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('bs-rematch-btn'));

      await waitFor(() => expect(submitOnlineMove).toHaveBeenCalled());
      const payload = vi.mocked(submitOnlineMove).mock.calls.at(-1)?.[0] as any;
      expect(payload.action).toBe('REMATCH');
      expect(payload.newStatus).toBe('playing');
      expect(payload.nextState.phase).toBe('PLACEMENT');
      expect(payload.nextState.winner).toBeNull();
      expect(payload.winnerIndex).toBeNull();
    });

    it('keeps a spectator out of the rematch and hands them an exit instead', () => {
      deliver(syncFor(finishedState(), -1));
      renderMatch();

      const dialog = screen.getByTestId('bs-finish-dialog');
      expect(screen.queryByTestId('bs-rematch-btn')).not.toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: /Keluar dari room/i })).toBeInTheDocument();
      expect(within(dialog).getByRole('heading')).toHaveTextContent('Nakhoda menang');
    });
  });
});
