export type WallOrientation = 'H' | 'V';

export interface Position {
  x: number;
  y: number;
}

export interface Wall {
  orientation: WallOrientation;
  x: number; // Intersection coordinate 0 <= x < gridSize - 1
  y: number; // Intersection coordinate 0 <= y < gridSize - 1
  // Written by applyWall from the active seat so the board can paint the wall in its owner's
  // colours. Rooms saved before this field existed have none and stay neutral.
  owner?: number;
}

export interface PlayerTheme {
  name: string;
  hex: string;
  label: string;
  border: string;
  text: string;
}

export interface Player {
  id: number;
  name: string;
  theme: PlayerTheme;
  position: Position;
  wallsRemaining: number;
  distanceToCore: number;
  movesTaken: number;
}

export type GamePhase = 'ACTION' | 'GAME_OVER';

export interface GameActionLog {
  turn: number;
  playerId: number;
  type: 'MOVE' | 'WALL';
  detail: string;
}

export interface GameState {
  gridSize: number;
  playerCount: number;
  corePosition: Position;
  players: Player[];
  walls: Wall[];
  activePlayerIndex: number;
  phase: GamePhase;
  turn: number;
  winnerId: number | null;
  history: GameActionLog[];
}

export interface CreateGameOptions {
  playerCount: number;
  gridSize?: number;
  playerNames?: string[];
}
