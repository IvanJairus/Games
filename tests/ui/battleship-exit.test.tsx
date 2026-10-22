import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BattleshipMatch } from '@/games/battleship/pages/BattleshipMatch';
import { createInitialState } from '@/games/battleship/engine';
import type { BattleshipState } from '@/games/battleship/engine/types';
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

const battleState = (): BattleshipState => ({
  ...createInitialState(),
  phase: 'BATTLE',
  commitment: ['c0', 'c1'],
});

const syncFor = (game: BattleshipState, myPlayerIndex: number): MatchSyncData => ({
  match: {
    id: 'm1',
    room_code: 'BTA999',
    game_type: 'battleship',
    status: 'playing',
    max_players: 2,
    current_turn: myPlayerIndex,
    game_state: game,
    winner_index: null,
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

const renderMatch = () =>
  render(
    <MemoryRouter initialEntries={['/battleship/m/BTA999']}>
      <Routes>
        <Route path="/battleship/m/:code" element={<BattleshipMatch />} />
        <Route path="/battleship" element={<h2>Lobi Battleship</h2>} />
      </Routes>
    </MemoryRouter>
  );

describe('Battleship leaving a live room', () => {
  beforeEach(() => {
    vi.mocked(submitOnlineMove).mockReset();
    vi.mocked(submitOnlineMove).mockResolvedValue({ ok: true });
    vi.mocked(subscribeToMatch).mockReset();
    vi.mocked(leaveOnlineMatch).mockReset();
    vi.mocked(leaveOnlineMatch).mockResolvedValue(undefined as never);
    window.confirm = vi.fn(() => true) as never;
  });

  it('walks the player back to the lobby when the header exit is pressed mid-battle', async () => {
    deliver(syncFor(battleState(), 0));
    renderMatch();
    expect(screen.getByRole('heading', { name: 'Battleship Online' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Keluar dari room BTA999/i }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Lobi Battleship' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Battleship Online' })).not.toBeInTheDocument();
  });

  it('hands the win over with a status the protocol accepts', async () => {
    deliver(syncFor(battleState(), 0));
    renderMatch();

    fireEvent.click(screen.getByRole('button', { name: /Keluar dari room BTA999/i }));

    await waitFor(() => expect(submitOnlineMove).toHaveBeenCalled());
    const payload = vi.mocked(submitOnlineMove).mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(payload.action).toBe('ABANDON');
    expect(payload.newStatus).toBe('abandoned');
  });
});
