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

  // The clicked square must currently be empty
  if (state.board[index] !== null) {
    throw new Error(`Cell ${index} is already occupied`);
  }

  const nextBoard = [...state.board];
  let nextPieces = [...state.pieces];

  const playerPieces = getPlayerPieces(state.pieces, state.currentTurn);

  // NO-DRAW 3-PIECES FIFO MECHANIC:
  // If the active player already has 3 pieces, their oldest piece vanishes!
  if (playerPieces.length >= MAX_PIECES_PER_PLAYER) {
    const oldest = playerPieces[0];
    nextBoard[oldest.cellIndex] = null;
    nextPieces = nextPieces.filter((p) => p.id !== oldest.id);
  }

  // Place the new piece
  const newOrder = state.moveCount + 1;
  const newPiece: Piece = {
    id: newOrder,
    player: state.currentTurn,
    cellIndex: index,
    order: newOrder,
  };

  nextBoard[index] = state.currentTurn;
  nextPieces.push(newPiece);

  const winResult = checkWinner(nextBoard);
  const nextMoveCount = state.moveCount + 1;

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
    };
  }

  // Turn alternates to the other player
  const nextTurn: PlayerSymbol = state.currentTurn === 'X' ? 'O' : 'X';
  return {
    ...state,
    board: nextBoard,
    pieces: nextPieces,
    currentTurn: nextTurn,
    moveCount: nextMoveCount,
  };
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
  };
}
