import {
  PlayerSymbol,
  CellValue,
  WinLine,
  TicTacToeState,
  ScoreBoard,
} from './types';

export * from './types';

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
  return { X: 0, O: 0, draws: 0 };
}

export function createTicTacToeGame(initialScore?: ScoreBoard): TicTacToeState {
  return {
    board: Array(9).fill(null),
    currentTurn: 'X',
    status: 'IN_PROGRESS',
    winner: null,
    winningLine: null,
    moveCount: 0,
    score: initialScore ? { ...initialScore } : createInitialScore(),
  };
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

  if (state.board[index] !== null) {
    throw new Error(`Cell ${index} is already occupied`);
  }

  const nextBoard = [...state.board];
  nextBoard[index] = state.currentTurn;

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
      status: 'WIN',
      winner: winResult.winner,
      winningLine: winResult.line,
      moveCount: nextMoveCount,
      score: nextScore,
    };
  }

  if (nextMoveCount === 9) {
    // Board is completely full with no winner -> Draw
    return {
      ...state,
      board: nextBoard,
      status: 'DRAW',
      winner: null,
      winningLine: null,
      moveCount: nextMoveCount,
      score: {
        ...state.score,
        draws: state.score.draws + 1,
      },
    };
  }

  // Turn alternates to the other player
  const nextTurn: PlayerSymbol = state.currentTurn === 'X' ? 'O' : 'X';
  return {
    ...state,
    board: nextBoard,
    currentTurn: nextTurn,
    moveCount: nextMoveCount,
  };
}

export function resetRound(state: TicTacToeState): TicTacToeState {
  return {
    board: Array(9).fill(null),
    currentTurn: 'X',
    status: 'IN_PROGRESS',
    winner: null,
    winningLine: null,
    moveCount: 0,
    score: { ...state.score },
  };
}
