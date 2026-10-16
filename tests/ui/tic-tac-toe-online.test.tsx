import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { applyMove, createTicTacToeGame, TicTacToeState } from '@/games/tic-tac-toe/engine';
import { TicTacToeMatch } from '@/games/tic-tac-toe/pages/TicTacToeMatch';

// The room is delivered through the subscribe callback, so the test keeps hold of it and pushes
// one snapshot at a time, the way realtime would.
let pushSync: (data: unknown) => void = () => {};

vi.mock('@/games/common/multiplayer', () => ({
  subscribeToMatch: (_code: string, onSync: (data: unknown) => void) => {
    pushSync = onSync;
    return { unsubscribe: () => {} };
  },
  submitOnlineMove: vi.fn(async () => ({ ok: true })),
  joinOnlineRoom: vi.fn(async () => ({ matchId: 'm1', playerIndex: 1, isHost: false })),
  leaveOnlineMatch: vi.fn(async () => {}),
  describeMoveFailure: vi.fn(() => 'Langkah tidak diterima.'),
}));

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => true,
  getStoredPlayerName: () => 'Saya',
  setStoredPlayerName: () => {},
}));

// Only the BroadcastChannel watcher is stood in for; the peer warning copy stays the real one.
vi.mock('@/games/common/roomPresence', async () => {
  const real = await vi.importActual<typeof import('@/games/common/roomPresence')>(
    '@/games/common/roomPresence'
  );
  return { ...real, watchRoomPeers: () => () => {} };
});

const syncFor = (game: TicTacToeState, myPlayerIndex: number) => ({
  match: {
    id: 'm1',
    room_code: 'FULQAM',
    game_type: 'tic-tac-toe',
    status: 'playing',
    max_players: 2,
    current_turn: game.currentTurn === 'X' ? 0 : 1,
    game_state: game,
    winner_index: null,
    created_at: '2026-10-16T00:00:00Z',
    updated_at: '2026-10-16T00:00:00Z',
  },
  players: [
    {
      id: 'p0',
      match_id: 'm1',
      player_index: 0,
      session_id: 's0',
      name: 'Pemain 703',
      is_host: true,
      connected: true,
      created_at: '2026-10-16T00:00:00Z',
    },
    {
      id: 'p1',
      match_id: 'm1',
      player_index: 1,
      session_id: 's1',
      name: 'Saya',
      is_host: false,
      connected: true,
      created_at: '2026-10-16T00:00:00Z',
    },
  ],
  myPlayerIndex,
  isHost: myPlayerIndex === 0,
});

// Both seats end up with three pieces and nothing lined up, so either of them can hold.
const SETUP = [0, 3, 1, 4, 8, 7];

const seated = () => SETUP.reduce((g, cell) => applyMove(g, cell), createTicTacToeGame());

const renderRoom = () =>
  render(
    <MemoryRouter initialEntries={['/tic-tac-toe/m/FULQAM']}>
      <Routes>
        <Route path="/tic-tac-toe/m/:code" element={<TicTacToeMatch />} />
      </Routes>
    </MemoryRouter>
  );

// The page hands its own setter to the subscription, so a snapshot arriving from realtime has to be
// pushed inside act() to keep React happy about the state update.
const deliver = (data: unknown) => {
  act(() => {
    pushSync(data);
  });
};

describe('Tic Tac Toe online room', () => {
  beforeEach(() => {
    pushSync = () => {};
  });

  it('shows the hold budget from the first move, before any piece is at risk', () => {
    renderRoom();
    deliver(syncFor(createTicTacToeGame(), 1));

    expect(screen.getByTestId('ttt-hold-chip')).toHaveTextContent('Tahan 2/2');
  });

  it('shows a spent budget as zero rather than hiding the chip', () => {
    renderRoom();
    const spent = { ...seated(), holdsLeft: { X: 2, O: 0 } } as TicTacToeState;
    deliver(syncFor(spent, 1));

    expect(screen.getByTestId('ttt-hold-chip')).toHaveTextContent('Tahan 0/2');
  });

  it('keeps the vanishing-piece sentence in a slot that does not move the board', () => {
    renderRoom();
    deliver(syncFor(seated(), 1));

    expect(screen.getByTestId('ttt-online-hint')).toHaveStyle({ minHeight: '44px' });
    expect(screen.getByTestId('ttt-online-hint')).toHaveTextContent('menahan bidak tertua Anda');
  });

  it('announces a hold made by the opponent', () => {
    renderRoom();
    const before = seated();
    deliver(syncFor(before, 1));
    deliver(syncFor(applyMove(before, 0), 1));

    expect(screen.getByTestId('ttt-hold-notice')).toHaveTextContent('Lawan menahan bidaknya di petak #1');
    expect(screen.getByTestId('ttt-hold-notice')).toHaveTextContent('Sisa tahan mereka 1/2');
  });

  it('announces my own hold with my remaining budget', () => {
    renderRoom();
    const before = seated();
    deliver(syncFor(before, 0));
    deliver(syncFor(applyMove(before, 0), 0));

    expect(screen.getByTestId('ttt-hold-notice')).toHaveTextContent('Anda menahan bidak di petak #1');
    expect(screen.getByTestId('ttt-hold-notice')).toHaveTextContent('Sisa tahan Anda 1/2');
  });

  it('says nothing for an ordinary placement', () => {
    renderRoom();
    const before = seated();
    deliver(syncFor(before, 1));
    deliver(syncFor(applyMove(before, 2), 1));

    expect(screen.queryByTestId('ttt-hold-notice')).not.toBeInTheDocument();
  });
});
