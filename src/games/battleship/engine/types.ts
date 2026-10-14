export const BOARD_SIZE = 8;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;

export type ShipKind = 'Battleship' | 'Cruiser' | 'Frigate' | 'Submarine' | 'Patrol';

export interface ShipSpec {
  kind: ShipKind;
  size: number;
}

export const FLEET: ShipSpec[] = [
  { kind: 'Battleship', size: 4 },
  { kind: 'Cruiser', size: 3 },
  { kind: 'Frigate', size: 3 },
  { kind: 'Submarine', size: 2 },
  { kind: 'Patrol', size: 2 },
];

export type Orientation = 'H' | 'V';

export interface Placement {
  kind: ShipKind;
  cells: number[];
}

export type Mark = 'miss' | 'hit';

export type Phase = 'PLACEMENT' | 'BATTLE' | 'FINISHED';

export interface PendingShot {
  by: 0 | 1;
  cell: number;
}

export interface RevealPayload {
  seed: string;
  layout: string;
}

export interface BattleshipState {
  phase: Phase;
  commitment: [string | null, string | null];
  marks: [Record<string, Mark>, Record<string, Mark>];
  sunk: [ShipKind[], ShipKind[]];
  pendingShot: PendingShot | null;
  shotsTaken: [number, number];
  currentTurn: 0 | 1;
  winner: 0 | 1 | null;
  reveal: [RevealPayload | null, RevealPayload | null];
  tampered: [boolean, boolean];
  endReason: string | null;
}

export const otherSeat = (seat: 0 | 1): 0 | 1 => (seat === 0 ? 1 : 0);

export const cellKey = (cell: number): string => String(cell);

export const rowOf = (cell: number): number => Math.floor(cell / BOARD_SIZE);
export const colOf = (cell: number): number => cell % BOARD_SIZE;

export const isOnBoard = (row: number, col: number): boolean =>
  row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;

export const cellLabel = (cell: number): string =>
  `${String.fromCharCode(65 + colOf(cell))}${rowOf(cell) + 1}`;
