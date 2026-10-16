import {
  PlayerSymbol,
  CellValue,
  WinLine,
  Piece,
  TicTacToeState,
  ScoreBoard,
} from './types';

export * from './types';

export const MAX_PIECES_PER_PLAYER = 3;

// Measured: with holds unlimited, perfect-versus-perfect play went from 16 to 88 moves on average
// and one run reached the 400-move cap. Two per round keeps the save available and the round finite.
export const MAX_HOLDS_PER_ROUND = 2;

export const WINNING_LINES: WinLine[] = [
  // Rows
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  // Columns
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  // Diagonals
  [0, 4, 8],
  [2, 4, 6],
];

export function createInitialScore(): ScoreBoard {
  return { X: 0, O: 0 };
}

export function createTicTacToeGame(initialScore?: ScoreBoard): TicTacToeState {
  return {
    board: Array(9).fill(null),
    pieces: [],
    currentTurn: 'X',
    status: 'IN_PROGRESS',
    winner: null,
    winningLine: null,
    moveCount: 0,
    score: initialScore ? { ...initialScore } : createInitialScore(),
    holdsLeft: { X: MAX_HOLDS_PER_ROUND, O: MAX_HOLDS_PER_ROUND },
  };
}

export function getPlayerPieces(pieces: Piece[], player: PlayerSymbol): Piece[] {
  return pieces.filter((p) => p.player === player).sort((a, b) => a.order - b.order);
}

export function getOldestPiece(pieces: Piece[], player: PlayerSymbol): Piece | null {
  const playerPieces = getPlayerPieces(pieces, player);
  if (playerPieces.length >= MAX_PIECES_PER_PLAYER) {
    return playerPieces[0];
  }
  return null;
}

// The square holding the mover's own expiring piece. Tapping it keeps the piece but sends it to the
// back of the queue, which is how a blocker that FIFO was about to eat survives one more round.
// Rooms opened before this rule carry no holdsLeft, so an absent counter reads as a full budget.
export function getHoldCell(state: TicTacToeState, player: PlayerSymbol = state.currentTurn): number | null {
  if (state.status !== 'IN_PROGRESS') return null;
  if ((state.holdsLeft?.[player] ?? MAX_HOLDS_PER_ROUND) <= 0) return null;
  const oldest = getOldestPiece(state.pieces, player);
  return oldest ? oldest.cellIndex : null;
}

export function checkWinner(
  board: CellValue[]
): { winner: PlayerSymbol; line: WinLine } | null {
  for (const line of WINNING_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a]!, line };
    }
  }
  return null;
}

export function applyMove(state: TicTacToeState, index: number): TicTacToeState {
  if (state.status !== 'IN_PROGRESS') {
    throw new Error('Game is already over');
  }

  if (index < 0 || index > 8) {
    throw new Error(`Invalid board index: ${index}`);
  }

  const mover = state.currentTurn;
  const nextTurn: PlayerSymbol = mover === 'X' ? 'O' : 'X';
  const nextMoveCount = state.moveCount + 1;
  // Materialised so a room state saved before this rule cannot keep spending an unlimited budget.
  const holdsLeft: Record<PlayerSymbol, number> = {
    X: state.holdsLeft?.X ?? MAX_HOLDS_PER_ROUND,
    O: state.holdsLeft?.O ?? MAX_HOLDS_PER_ROUND,
  };

  // Hold: the clicked square carries the mover's own oldest piece, so nothing is placed and nothing
  // vanishes. The board is unchanged, which means no line can appear on this move.
  if (index === getHoldCell(state, mover)) {
    const held = getOldestPiece(state.pieces, mover)!;
    const refreshed: Piece = { ...held, id: nextMoveCount, order: nextMoveCount };
    return {
      ...state,
      pieces: state.pieces.map((p) => (p.id === held.id ? refreshed : p)),
      currentTurn: nextTurn,
      moveCount: nextMoveCount,
      holdsLeft: { ...holdsLeft, [mover]: holdsLeft[mover] - 1 },
    };
  }

  // The clicked square must currently be empty
  if (state.board[index] !== null) {
    throw new Error(`Cell ${index} is already occupied`);
  }

  const nextBoard = [...state.board];
  let nextPieces = [...state.pieces];

  const playerPieces = getPlayerPieces(state.pieces, mover);

  // FIFO eviction: placing a 4th piece clears the player's oldest active mark.
  if (playerPieces.length >= MAX_PIECES_PER_PLAYER) {
    const oldest = playerPieces[0];
    nextBoard[oldest.cellIndex] = null;
    nextPieces = nextPieces.filter((p) => p.id !== oldest.id);
  }

  const newPiece: Piece = {
    id: nextMoveCount,
    player: mover,
    cellIndex: index,
    order: nextMoveCount,
  };

  nextBoard[index] = mover;
  nextPieces.push(newPiece);

  const winResult = checkWinner(nextBoard);

  if (winResult) {
    const nextScore = {
      ...state.score,
      [winResult.winner]: state.score[winResult.winner] + 1,
    };

    return {
      ...state,
      board: nextBoard,
      pieces: nextPieces,
      status: 'WIN',
      winner: winResult.winner,
      winningLine: winResult.line,
      moveCount: nextMoveCount,
      score: nextScore,
      holdsLeft,
    };
  }

  return {
    ...state,
    board: nextBoard,
    pieces: nextPieces,
    currentTurn: nextTurn,
    moveCount: nextMoveCount,
    holdsLeft,
  };
}

// Which seat spent a hold between two snapshots, and on which square. A room only ever receives the
// new state, so the event has to be read off the budget dropping; a refill on resetRound is an
// increase and cannot be mistaken for one.
export function holdEvent(
  before: TicTacToeState,
  after: TicTacToeState
): { player: PlayerSymbol; cellIndex: number } | null {
  const budget = (state: TicTacToeState, p: PlayerSymbol) =>
    state.holdsLeft?.[p] ?? MAX_HOLDS_PER_ROUND;

  const spent = (['X', 'O'] as PlayerSymbol[]).find((p) => budget(after, p) < budget(before, p));
  if (!spent) return null;

  // A hold moves the mover's oldest piece to the back of the queue without changing its square.
  const pieces = getPlayerPieces(after.pieces, spent);
  const held = pieces[pieces.length - 1];
  return held ? { player: spent, cellIndex: held.cellIndex } : null;
}

export function resetRound(state: TicTacToeState): TicTacToeState {
  return {
    board: Array(9).fill(null),
    pieces: [],
    currentTurn: 'X',
    status: 'IN_PROGRESS',
    winner: null,
    winningLine: null,
    moveCount: 0,
    score: { ...state.score },
    holdsLeft: { X: MAX_HOLDS_PER_ROUND, O: MAX_HOLDS_PER_ROUND },
  };
}
