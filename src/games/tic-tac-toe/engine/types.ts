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
  // Holds are a pass that only re-orders the queue, so each seat gets a limited number per round.
  // Without a limit both seats can hold a blocker forever and the no-draw promise stops being true.
  holdsLeft: Record<PlayerSymbol, number>;
}
