export type PlayerSymbol = 'X' | 'O';

export type CellValue = PlayerSymbol | null;

export type GameStatus = 'IN_PROGRESS' | 'WIN' | 'DRAW';

export type WinLine = [number, number, number];

export interface ScoreBoard {
  X: number;
  O: number;
  draws: number;
}

export interface TicTacToeState {
  board: CellValue[];
  currentTurn: PlayerSymbol;
  status: GameStatus;
  winner: PlayerSymbol | null;
  winningLine: WinLine | null;
  moveCount: number;
  score: ScoreBoard;
}
