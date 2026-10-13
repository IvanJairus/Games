export type PlayerSymbol = 'X' | 'O';

export type CellValue = PlayerSymbol | null;

export type GameStatus = 'IN_PROGRESS' | 'WIN';

export type WinLine = [number, number, number];

export interface Piece {
  id: number;
  player: PlayerSymbol;
  cellIndex: number;
  order: number;
}

export interface ScoreBoard {
  X: number;
  O: number;
}

export interface TicTacToeState {
  board: CellValue[];
  pieces: Piece[];
  currentTurn: PlayerSymbol;
  status: GameStatus;
  winner: PlayerSymbol | null;
  winningLine: WinLine | null;
  moveCount: number;
  score: ScoreBoard;
}
