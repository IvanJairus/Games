import { applyMove, checkWinner } from './index';
import { PlayerSymbol, TicTacToeState } from './types';

export type BotLevel = 'santai' | 'sedang' | 'sempurna';

export const BOT_LEVELS: { id: BotLevel; label: string; note: string }[] = [
  { id: 'santai', label: 'Santai', note: 'Jarang memblokir, cocok untuk kenalan pertama dengan aturannya.' },
  { id: 'sedang', label: 'Sedang', note: 'Mengambil peluang menang dan menutup ancaman satu langkah.' },
  { id: 'sempurna', label: 'Sempurna', note: 'Mencari sepuluh langkah ke depan dan mengambil kemenangan tercepat.' },
];

export function getValidMoves(state: TicTacToeState): number[] {
  const cells: number[] = [];
  for (let index = 0; index < 9; index++) {
    if (state.board[index] === null) cells.push(index);
  }
  return cells;
}

// Board plus turn is not enough to identify a position: FIFO evicts the oldest piece, so the
// insertion order changes which cell frees up next.
function stateKey(state: TicTacToeState): string {
  return `${state.board.map((c) => c ?? '.').join('')}|${state.currentTurn}|${state.pieces
    .map((p) => `${p.player}${p.cellIndex}`)
    .join('')}`;
}

const MAX_DEPTH = 10;
const CACHE_LIMIT = 60_000;

// Values are stored from the point of view of the side to move. The remaining depth is part of the
// key: this game loops because of the FIFO eviction, so a value only holds for the horizon it was
// searched with.
const valueCache = new Map<string, number>();

function orderedMoves(state: TicTacToeState): number[] {
  const cells = getValidMoves(state);
  const winning = cells.filter(
    (cell) => checkWinner(applyMove(state, cell).board)?.winner === state.currentTurn
  );
  return [...winning, ...cells.filter((cell) => !winning.includes(cell))];
}

function solve(state: TicTacToeState, depth: number, alpha: number, beta: number): number {
  const win = checkWinner(state.board);
  if (win) {
    // applyMove leaves currentTurn on the winner when a round ends, so matching the side to move
    // means the player about to move is the one who just lost.
    return win.winner === state.currentTurn ? depth - 100 : 100 - depth;
  }
  if (depth >= MAX_DEPTH) return 0;

  const key = `${stateKey(state)}#${depth}`;
  const cached = valueCache.get(key);
  if (cached !== undefined) return cached;

  const window = alpha;
  let best = -Infinity;

  for (const cell of orderedMoves(state)) {
    const value = -solve(applyMove(state, cell), depth + 1, -beta, -alpha);
    if (value > best) best = value;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }

  // A cutoff value depends on the window it came from, so only exact values may be reused.
  if (valueCache.size < CACHE_LIMIT && best > window && best < beta) valueCache.set(key, best);
  return best;
}

const pickFrom = (cells: number[], rand: () => number): number => cells[Math.floor(rand() * cells.length)];

const winsFor = (state: TicTacToeState, player: PlayerSymbol): number[] => {
  const asPlayer: TicTacToeState = { ...state, currentTurn: player, status: 'IN_PROGRESS', winner: null };
  return getValidMoves(state).filter((cell) => checkWinner(applyMove(asPlayer, cell).board)?.winner === player);
};

function relaxedMove(state: TicTacToeState, rand: () => number): number {
  const cells = getValidMoves(state);
  const centre = cells.filter((c) => c === 4);
  const corners = cells.filter((c) => c === 0 || c === 2 || c === 6 || c === 8);
  const roll = rand();
  if (centre.length && roll < 0.35) return centre[0];
  if (corners.length && roll < 0.75) return pickFrom(corners, rand);
  return pickFrom(cells, rand);
}

const other = (player: PlayerSymbol): PlayerSymbol => (player === 'X' ? 'O' : 'X');

function positionalChoice(cells: number[], rand: () => number): number {
  const centre = cells.filter((c) => c === 4);
  const corners = cells.filter((c) => c === 0 || c === 2 || c === 6 || c === 8);
  if (centre.length) return centre[0];
  if (corners.length) return pickFrom(corners, rand);
  return pickFrom(cells, rand);
}

function lookaheadMove(state: TicTacToeState, me: PlayerSymbol, rand: () => number): number {
  const cells = getValidMoves(state);

  const winning = winsFor(state, me);
  if (winning.length) return pickFrom(winning, rand);

  const blocking = winsFor(state, other(me));
  if (blocking.length) return pickFrom(blocking, rand);

  // Do not hand the opponent a winning square on the next turn.
  const safe = cells.filter(
    (cell) => winsFor(applyMove({ ...state, currentTurn: me }, cell), other(me)).length === 0
  );

  return positionalChoice(safe.length ? safe : cells, rand);
}

// Test hook: exposes the scored root moves so a check can prove the search sees forced wins.
export function rootValues(state: TicTacToeState): { cell: number; value: number }[] {
  return orderedMoves(state).map((cell) => ({
    cell,
    value: -solve(applyMove(state, cell), 1, -Infinity, Infinity),
  }));
}

export function chooseBotMove(
  state: TicTacToeState,
  level: BotLevel,
  rand: () => number = Math.random
): number {
  const cells = getValidMoves(state);
  if (cells.length === 0 || state.status !== 'IN_PROGRESS') {
    throw new Error('Tidak ada langkah legal untuk bot');
  }

  const me = state.currentTurn;

  if (level === 'santai') return relaxedMove(state, rand);
  if (level === 'sedang') return lookaheadMove(state, me, rand);

  let best = -Infinity;
  let choices: number[] = [];

  for (const cell of orderedMoves(state)) {
    // Full window at the root: a narrow window returns bounds, and a bound that happens to equal
    // the current best would fake a tie and let a losing move through.
    const value = -solve(applyMove(state, cell), 1, -Infinity, Infinity);
    if (value > best) {
      best = value;
      choices = [cell];
    } else if (value === best) {
      choices.push(cell);
    }
  }

  return pickFrom(choices, rand);
}

export function describeBotLevel(level: BotLevel): string {
  return BOT_LEVELS.find((l) => l.id === level)?.note ?? '';
}
