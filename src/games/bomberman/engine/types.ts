/**
 * Bomberman engine types and tuning.
 *
 * Everything here is plain data so a match can be serialised into a Realtime
 * broadcast without walking class instances.
 */

export type CellKind = 'empty' | 'hard' | 'soft';
export type Facing = 'up' | 'down' | 'left' | 'right';
/**
 * The cast, as data. The renderer's `CHARACTERS` table and the server's roster validation
 * both read this list, so a seat cannot claim a character the other side does not know.
 */
export const CHARACTER_IDS = ['robo', 'tupai', 'radar', 'biskuit', 'lampu', 'sekrup'] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];
export type PowerKind = 'flame' | 'speed' | 'count' | 'shield' | 'kick' | 'remote' | 'pierce';
export type Phase = 'waiting' | 'countdown' | 'battle' | 'roundOver' | 'finished';
export type FloorKind = 'grass' | 'sand' | 'stone';

/** Seats alternate teams, so the four corners put each pair on one side of the board. */
export const teamOf = (seat: number): number => seat % 2;

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
 * A round has to end even if nobody dies, but not by handing the win to a machine
 * pick. Past this mark the arena starts closing in, and the ring that is about to
 * collapse is announced first, so a death there is a choice the player could see.
 */
export const ROUND_SECONDS = 90;
/** Seconds between two ring collapses once the arena starts closing. */
export const SHRINK_INTERVAL = 8;
/** How long before a collapse the target ring is announced and counted down. */
export const SHRINK_WARN_SECONDS = 3;
/** Seconds between eruptions of a stone-floor vent. */
export const VENT_SECONDS = 9;
/** How long before an eruption the vent counts as danger, for the bots and the HUD. */
export const VENT_WARN_SECONDS = 1.6;
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
 * Three arenas, chosen in the lobby. `luas` exists because two humans plus two bots on
 * 21x15 still meet in the middle quickly; the extra width buys flanking routes, paid for
 * with smaller cells. Only the four-seat board has it, since a duel already fits one.
 */
export type BoardSize = 'kecil' | 'besar' | 'luas';

/**
 * The large pair is about twice the cell count of the small one. 25x17 is the third
 * step: on a 375 px phone its cells are about 15 px, which is the floor where a sprite
 * with a face still reads.
 */
export const BOARDS = {
  duel: { seats: 2, cols: 11, rows: 9 },
  duelLarge: { seats: 2, cols: 15, rows: 13 },
  freeFor: { seats: 4, cols: 15, rows: 11 },
  freeForLarge: { seats: 4, cols: 21, rows: 15 },
  freeForHuge: { seats: 4, cols: 25, rows: 17 },
} satisfies Record<string, BoardConfig>;

export const boardFor = (seats: number, size: BoardSize = 'kecil'): BoardConfig => {
  if (seats >= 4) {
    if (size === 'luas') return BOARDS.freeForHuge;
    return size === 'besar' ? BOARDS.freeForLarge : BOARDS.freeFor;
  }
  return size === 'kecil' ? BOARDS.duel : BOARDS.duelLarge;
};

/**
 * Reads the size back out of a board geometry. A client builds its arena from the first
 * world frame it receives, which carries cols and rows but not the lobby setting.
 */
export const sizeForBoard = (seats: number, cols: number): BoardSize => {
  if (seats >= 4) {
    if (cols >= BOARDS.freeForHuge.cols) return 'luas';
    return cols >= BOARDS.freeForLarge.cols ? 'besar' : 'kecil';
  }
  return cols >= BOARDS.duelLarge.cols ? 'besar' : 'kecil';
};

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
  /** Which seat's bomb lit this cell. Needed to tell a kill from a suicide. */
  owner: number;
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
  /** Walking into a bomb pushes it one cell, if the far side is free. */
  kick: boolean;
  /** A second bomb press detonates this seat's bombs instead of planting. */
  remote: boolean;
  /** Blast destroys a soft block and keeps going through the cell behind it. */
  pierce: boolean;
  grace: number;
  wins: number;
  /** Bombs planted in the current round, used to break a timeout without a death. */
  roundBombs: number;
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
  | { t: 'ko'; seat: number; by: number }
  | { t: 'countdown'; value: number }
  | { t: 'start' }
  | { t: 'round'; winner: number | null; round: number }
  | { t: 'shrink'; ring: number; cells: number }
  | { t: 'vent'; cells: number }
  | { t: 'end'; winner: number | null };

export interface BombermanState {
  phase: Phase;
  seed: string;
  floor: FloorKind;
  cols: number;
  rows: number;
  seats: number;
  /** Four seats are split into two teams; three or fewer always play free-for-all. */
  teams: boolean;
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
  /** Seconds until the next ring collapses. Zero until the arena starts closing. */
  sudden: number;
  /** How many outer rings have already become wall this round. */
  ring: number;
  /** Stone-floor vents that erupt on a timer. Empty on the other floors. */
  vents: Coord[];
  /** Seconds until the vents fire again. */
  vent: number;
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

/** Teams that still have at least one seat standing. Empty when the mode is free-for-all. */
export const aliveTeams = (state: BombermanState): number[] => {
  const out = new Set<number>();
  for (const p of state.players) if (p.alive) out.add(teamOf(p.seat));
  return [...out];
};

/** Distance of a cell from the outer wall, in rings. The wall itself is ring 0. */
export const ringDistance = (state: BombermanState, x: number, y: number): number =>
  Math.min(x, y, state.cols - 1 - x, state.rows - 1 - y);

/**
 * The last ring allowed to collapse. Stopping at a 1x1 core leaves somewhere to stand,
 * so the walls never eat the board out from under a round.
 */
export const maxShrinkRings = (cols: number, rows: number): number =>
  Math.max(0, Math.floor((Math.min(cols, rows) - 1) / 2) - 1);

/** Cells of the ring that collapses next, so the HUD and the bots can react to it. */
export const nextShrinkCells = (state: BombermanState): Coord[] => {
  const ring = state.ring + 1;
  if (ring > maxShrinkRings(state.cols, state.rows)) return [];
  const out: Coord[] = [];
  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      if (ringDistance(state, x, y) === ring) out.push({ x, y });
    }
  }
  return out;
};

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
