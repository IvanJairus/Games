/**
 * Bomberman engine types and tuning.
 *
 * Everything here is plain data so a match can be serialised into a Realtime
 * broadcast without walking class instances.
 */

export type CellKind = 'empty' | 'hard' | 'soft';
export type Facing = 'up' | 'down' | 'left' | 'right';
export type PowerKind = 'flame' | 'speed' | 'count' | 'shield';
export type Phase = 'waiting' | 'countdown' | 'battle' | 'roundOver' | 'finished';
export type FloorKind = 'grass' | 'sand' | 'stone';

export interface Coord {
  x: number;
  y: number;
}

export const DIRS: Record<Facing, Coord> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const FUSE_SECONDS = 2.2;
export const FLAME_SECONDS = 0.42;
/** A chain hit shortens the fuse to this instead of detonating at once, so the cascade is visible. */
export const CHAIN_FUSE = 0.08;
export const START_RANGE = 2;
export const START_MAX_BOMBS = 1;
export const START_SPEED = 6.6;
export const STEP_T_MIN = 1;
export const COOLDOWN_SECONDS = 0.38;
export const POWER_CHANCE = 0.22;
export const COUNTDOWN_SECONDS = 2.4;
/** Pause between rounds, long enough to read who took it. */
export const ROUND_OVER_SECONDS = 1.8;
/**
 * One death ending the whole match made the arena barely open before it was over:
 * measured duel matches finished in seconds with ~1 bomb per seat. Rounds fix that.
 */
export const SCORE_TO_WIN = 3;
/**
 * A shield pops once, but the flame that broke it keeps burning for FLAME_SECONDS.
 * Without a grace window the same fire kills the seat on the very next frame.
 */
export const SHIELD_GRACE = 0.6;
/** BFS depth cap when a seat looks for a cell outside its own blast. */
export const ESCAPE_DEPTH = 9;

export interface BoardConfig {
  seats: number;
  cols: number;
  rows: number;
}

/**
 * Two arenas, chosen in the lobby. The 15x11 board exists so four seats get
 * real elbow room; every rule in the engine reads cols/rows off the state.
 */
export const BOARDS: Record<'duel' | 'freeFor', BoardConfig> = {
  duel: { seats: 2, cols: 11, rows: 9 },
  freeFor: { seats: 4, cols: 15, rows: 11 },
};

export const boardFor = (seats: number): BoardConfig => (seats >= 4 ? BOARDS.freeFor : BOARDS.duel);

export interface Bomb extends Coord {
  id: number;
  seat: number;
  fuse: number;
  range: number;
  lit: boolean;
}

export interface Flame extends Coord {
  id: number;
  kind: 'core' | 'arm' | 'tip';
  life: number;
}

export interface PowerPickup extends Coord {
  kind: PowerKind;
}

export interface StepAnim {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  t: number;
}

export interface PlayerState {
  seat: number;
  name: string;
  charId: string;
  bot: boolean;
  alive: boolean;
  x: number;
  y: number;
  ax: number;
  ay: number;
  facing: Facing;
  range: number;
  maxBombs: number;
  speed: number;
  shield: boolean;
  grace: number;
  wins: number;
  step: StepAnim | null;
  cool: number;
  bombsPlaced: number;
  blocksBroken: number;
}

export type SimEvent =
  | { t: 'place'; seat: number; x: number; y: number }
  | { t: 'boom'; x: number; y: number; range: number }
  | { t: 'break'; x: number; y: number }
  | { t: 'power'; x: number; y: number; kind: PowerKind }
  | { t: 'take'; seat: number; kind: PowerKind; x: number; y: number }
  | { t: 'reject'; seat: number; reason: string }
  | { t: 'ko'; seat: number }
  | { t: 'countdown'; value: number }
  | { t: 'start' }
  | { t: 'round'; winner: number | null; round: number }
  | { t: 'end'; winner: number | null };

export interface BombermanState {
  phase: Phase;
  seed: string;
  floor: FloorKind;
  cols: number;
  rows: number;
  seats: number;
  round: number;
  scoreToWin: number;
  roundOver: number;
  grid: CellKind[][];
  bombs: Bomb[];
  flames: Flame[];
  powers: PowerPickup[];
  players: PlayerState[];
  winner: number | null;
  elapsed: number;
  countdown: number;
  nextId: number;
}

export interface InputState {
  dir: Facing | null;
  bomb: boolean;
  /** Bumped by the sender on every press so a held key is not read as a new action. */
  seq: number;
}

export const emptyInput = (): InputState => ({ dir: null, bomb: false, seq: 0 });

export const isOnBoard = (state: BombermanState, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < state.cols && y < state.rows;

export const cellAt = (state: BombermanState, x: number, y: number): CellKind =>
  isOnBoard(state, x, y) ? state.grid[y][x] : 'hard';

export const bombAt = (state: BombermanState, x: number, y: number): Bomb | undefined =>
  state.bombs.find((b) => b.x === x && b.y === y);

export const walkable = (state: BombermanState, x: number, y: number): boolean =>
  cellAt(state, x, y) === 'empty' && !bombAt(state, x, y);

export const aliveSeats = (state: BombermanState): number[] =>
  state.players.filter((p) => p.alive).map((p) => p.seat);

export const bombsOf = (state: BombermanState, seat: number): number =>
  state.bombs.reduce((n, b) => (b.seat === seat ? n + 1 : n), 0);

/**
 * Spawn cells for a board: the four corners, or two diagonal corners for a duel.
 * Exported because the map generator, the bot and the tests must agree on it.
 */
export const spawnCells = (cols: number, rows: number, seats: number): Coord[] => {
  const corners: Coord[] = [
    { x: 1, y: 1 },
    { x: cols - 2, y: rows - 2 },
    { x: cols - 2, y: 1 },
    { x: 1, y: rows - 2 },
  ];
  return seats >= 4 ? corners : [corners[0], corners[1]];
};

/** The cells a spawn needs clear so a seat is never sealed in by soft blocks. */
export const spawnClearance = (spawn: Coord): Coord[] => {
  const out: Coord[] = [spawn];
  for (const d of Object.values(DIRS)) {
    out.push({ x: spawn.x + d.x, y: spawn.y + d.y });
    out.push({ x: spawn.x + d.x * 2, y: spawn.y + d.y * 2 });
  }
  return out;
};
