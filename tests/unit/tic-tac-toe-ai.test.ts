import { describe, it, expect } from 'vitest';
import {
  applyMove,
  createTicTacToeGame,
  checkWinner,
  getHoldCell,
  TicTacToeState,
  PlayerSymbol,
} from '@/games/tic-tac-toe/engine';
import {
  BOT_LEVELS,
  chooseBotMove,
  describeBotLevel,
  getLegalMoves,
  getValidMoves,
  BotLevel,
} from '@/games/tic-tac-toe/engine/ai';

const other = (p: PlayerSymbol): PlayerSymbol => (p === 'X' ? 'O' : 'X');

// The position read off the 2026-10-15 recording: X's oldest piece on cell 6 was the only blocker
// on O's 7 + 8, and every placement handed the bot the bottom row.
const RECORDED = [7, 1, 0, 4, 6, 3, 5, 8, 1, 7];

// X holds the win on 0 + 1 + 2 while its oldest piece on cell 6 is also available to hold.
const WINNABLE = [6, 3, 0, 4, 1, 7];

const randFrom = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const emptyBoardWith = (marks: Partial<Record<number, PlayerSymbol>>, turn: PlayerSymbol): TicTacToeState => {
  const board: (PlayerSymbol | null)[] = Array(9).fill(null);
  const state = createTicTacToeGame();
  for (const [cell, player] of Object.entries(marks)) {
    if (player === 'X' || player === 'O') board[Number(cell)] = player;
  }
  return { ...state, board, currentTurn: turn };
};

function playGame(levels: [BotLevel, BotLevel], seed: number, maxPlies = 200) {
  const rand = randFrom(seed);
  let state = createTicTacToeGame();
  let plies = 0;

  while (state.status === 'IN_PROGRESS' && plies < maxPlies) {
    const level = state.currentTurn === 'X' ? levels[0] : levels[1];
    const cell = chooseBotMove(state, level, rand);
    expect(getLegalMoves(state)).toContain(cell);
    state = applyMove(state, cell);
    plies += 1;
  }

  return { state, plies };
}

describe('Tic Tac Toe bot', () => {
  it('lists only empty cells as legal', () => {
    const state = emptyBoardWith({ 0: 'X', 4: 'O' }, 'X');
    expect(getValidMoves(state)).toEqual([1, 2, 3, 5, 6, 7, 8]);
  });

  it('refuses to move in a finished game', () => {
    const finished: TicTacToeState = {
      ...createTicTacToeGame(),
      board: ['X', 'X', 'X', null, null, null, null, null, null],
      status: 'WIN',
      winner: 'X',
    };
    expect(() => chooseBotMove(finished, 'sempurna')).toThrow(/Tidak ada langkah legal/);
  });

  it('offers three levels with readable copy', () => {
    expect(BOT_LEVELS.map((l) => l.id)).toEqual(['santai', 'sedang', 'sempurna']);
    expect(describeBotLevel('sedang')).toContain('ancaman');
    expect(describeBotLevel('sempurna')).toContain('kemenangan tercepat');
  });

  it('takes an immediate win and blocks an immediate loss at the middle level', () => {
    const canWin = emptyBoardWith({ 0: 'O', 1: 'O', 4: 'X', 8: 'X' }, 'O');
    expect(chooseBotMove(canWin, 'sedang', () => 0)).toBe(2);

    const mustBlock = emptyBoardWith({ 0: 'X', 1: 'X', 4: 'O' }, 'O');
    expect(chooseBotMove(mustBlock, 'sedang', () => 0)).toBe(2);
  });

  it('always takes an immediate win and always blocks an immediate loss', () => {
    const levels: BotLevel[] = ['sedang', 'sempurna'];
    let checked = 0;

    for (let seed = 1; seed <= 60; seed++) {
      const { state } = playGame(['santai', 'santai'], seed, 12);
      if (state.status !== 'IN_PROGRESS') continue;

      const cells = getValidMoves(state);
      const winning = cells.filter((c) => checkWinner(applyMove(state, c).board)?.winner === state.currentTurn);
      const threatCells = getValidMoves({ ...state, currentTurn: other(state.currentTurn) }).filter(
        (c) => checkWinner(applyMove({ ...state, currentTurn: other(state.currentTurn) }, c).board)?.winner === other(state.currentTurn)
      );

      for (const level of levels) {
        const move = chooseBotMove(state, level, randFrom(seed));
        if (winning.length) {
          expect(winning).toContain(move);
          checked += 1;
        } else if (threatCells.length) {
          expect(threatCells).toContain(move);
          checked += 1;
        }
      }
    }

    expect(checked).toBeGreaterThan(20);
  });

  it('beats the easy bot in almost every game as either side', () => {
    let perfectWins = 0;
    let losses = 0;

    for (let seed = 1; seed <= 120; seed++) {
      const asX = playGame(['sempurna', 'santai'], seed);
      if (asX.state.winner === 'X') perfectWins += 1;
      if (asX.state.winner === 'O') losses += 1;

      const asO = playGame(['santai', 'sempurna'], seed + 5000);
      if (asO.state.winner === 'O') perfectWins += 1;
      if (asO.state.winner === 'X') losses += 1;
    }

    expect(losses).toBe(0);
    expect(perfectWins).toBeGreaterThanOrEqual(200);
  }, 40_000);

  it('settles a perfect-versus-perfect game quickly without looping forever', () => {
    const started = Date.now();
    const { state, plies } = playGame(['sempurna', 'sempurna'], 77, 200);
    const elapsed = Date.now() - started;

    expect(plies).toBeGreaterThan(3);
    expect(elapsed).toBeLessThan(8000);
    if (state.status === 'WIN') {
      expect(checkWinner(state.board)?.winner).toBe(state.winner);
    }
  });

  it('offers the bot the hold square as well as the empty ones', () => {
    const g = RECORDED.reduce((state, cell) => applyMove(state, cell), createTicTacToeGame());
    expect(getHoldCell(g)).toBe(6);
    expect(getLegalMoves(g)).toEqual([...getValidMoves(g), 6]);
  });

  it('holds the blocker the recorded game lost, at both thinking levels', () => {
    const g = RECORDED.reduce((state, cell) => applyMove(state, cell), createTicTacToeGame());
    expect(chooseBotMove(g, 'sempurna', () => 0.5)).toBe(6);
    expect(chooseBotMove(g, 'sedang', () => 0.5)).toBe(6);
  });

  it('leaves the easy level placing only, so the tiers stay distinguishable', () => {
    const g = RECORDED.reduce((state, cell) => applyMove(state, cell), createTicTacToeGame());
    for (let seed = 1; seed <= 30; seed++) {
      expect(getValidMoves(g)).toContain(chooseBotMove(g, 'santai', randFrom(seed)));
    }
  });

  it('still takes the win instead of holding when both are available', () => {
    const g = WINNABLE.reduce((state, cell) => applyMove(state, cell), createTicTacToeGame());
    expect(getHoldCell(g)).toBe(6);
    expect(chooseBotMove(g, 'sempurna', () => 0.5)).toBe(2);
    expect(chooseBotMove(g, 'sedang', () => 0.5)).toBe(2);
  });

  it('keeps every level inside the rules over many games', () => {
    const levels = BOT_LEVELS.map((l) => l.id) as BotLevel[];
    for (const a of levels) {
      for (const b of levels) {
        const { state } = playGame([a, b], 1234);
        expect(['IN_PROGRESS', 'WIN']).toContain(state.status);
        for (const cell of state.board) {
          expect([null, 'X', 'O']).toContain(cell);
        }
      }
    }
  });
});
