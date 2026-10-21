/**
 * Blast geometry and survival maths.
 *
 * Every function here is read-only over the state. That is not style: the renderer
 * and the bot ask for the blast preview on every frame, and a version of this file
 * that also smashed blocks and ignited fuses quietly destroyed the arena while
 * nobody was exploding anything. Side effects belong to the sim.
 */

import {
  Bomb,
  BombermanState,
  Coord,
  DIRS,
  ESCAPE_DEPTH,
  Facing,
  PowerPickup,
  SHRINK_WARN_SECONDS,
  VENT_WARN_SECONDS,
  bombAt,
  cellAt,
  nextShrinkCells,
  walkable,
} from './types';

export interface BlastCell extends Coord {
  core?: boolean;
  end?: boolean;
}

export interface Blast {
  cells: BlastCell[];
  softs: Coord[];
  lit: Bomb[];
  powers: PowerPickup[];
}

const key = (x: number, y: number): string => `${x},${y}`;

/**
 * A soft block absorbs the flame: its cell is destroyed but never burns. Getting
 * this wrong makes every bomb look like suicide, because the block's cell was the
 * only escape route and it was being counted as lethal.
 */
export const blastCells = (
  state: BombermanState,
  bomb: { x: number; y: number; range: number },
  pierce = false,
): Blast => {
  const cells: BlastCell[] = [{ x: bomb.x, y: bomb.y, core: true }];
  const softs: Coord[] = [];
  const lit: Bomb[] = [];
  const powers: PowerPickup[] = [];

  for (const d of Object.values(DIRS)) {
    for (let i = 1; i <= bomb.range; i++) {
      const x = bomb.x + d.x * i;
      const y = bomb.y + d.y * i;
      const kind = cellAt(state, x, y);
      if (kind === 'hard') break;
      if (kind === 'soft') {
        softs.push({ x, y });
        /* A piercing blast spends a block and keeps the arm going. The block cell itself
           is not flame: nothing can stand there, and drawing fire inside the rubble read
           as if the block survived. */
        if (!pierce) break;
        continue;
      }
      cells.push({ x, y, end: i === bomb.range });
      const other = bombAt(state, x, y);
      if (other) lit.push(other);
      const power = state.powers.find((p) => p.x === x && p.y === y);
      if (power) powers.push(power);
    }
  }

  return { cells, softs, lit, powers };
};

export const burnSet = (blast: Blast): Set<string> =>
  new Set(blast.cells.map((c) => key(c.x, c.y)));

/**
 * Every neighbour of a bomb burns, so "step to a free adjacent cell" is never a
 * survival plan. What saves you is distance: the first cell outside the blast that
 * is reachable over walkable ground, within the fuse.
 */
export const escapeTarget = (
  state: BombermanState,
  from: Coord,
  burn: Set<string>,
  maxSteps: number = ESCAPE_DEPTH,
  avoid?: Set<string>,
): (Coord & { d: number }) | null => {
  const seen = new Set<string>([key(from.x, from.y)]);
  const queue: Array<{ x: number; y: number; d: number }> = [{ x: from.x, y: from.y, d: 0 }];

  while (queue.length) {
    const cur = queue.shift() as { x: number; y: number; d: number };
    if (cur.d > 0 && !burn.has(key(cur.x, cur.y))) return cur;
    if (cur.d >= maxSteps) continue;
    for (const dir of Object.values(DIRS)) {
      const nx = cur.x + dir.x;
      const ny = cur.y + dir.y;
      const k = key(nx, ny);
      if (seen.has(k) || !walkable(state, nx, ny)) continue;
      /* A route that crosses a blast that already exists is not an escape. Only the new
         bomb's own arms may be crossed, and the caller keeps those out of `avoid`. */
      if (avoid?.has(k)) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny, d: cur.d + 1 });
    }
  }
  return null;
};

export interface Plan {
  x: number;
  y: number;
  target: Coord & { d: number };
  burn: Set<string>;
}

/** Is planting here survivable, and where do we run afterwards? */
export const bombPlan = (
  state: BombermanState,
  x: number,
  y: number,
  range: number,
  avoid?: Set<string>,
): Plan | null => {
  if (!walkable(state, x, y)) return null;
  const blast = blastCells(state, { x, y, range });
  const burn = burnSet(blast);
  const target = escapeTarget(state, { x, y }, burn, ESCAPE_DEPTH, avoid);
  return target ? { x, y, target, burn } : null;
};

/** Cells that will burn if every live bomb goes off right now. */
export const dangerCells = (state: BombermanState): Set<string> => {
  const out = new Set<string>();
  for (const f of state.flames) out.add(key(f.x, f.y));
  for (const b of state.bombs) {
    for (const c of blastCells(state, b).cells) out.add(key(c.x, c.y));
  }
  /* The ring that is about to become wall is just as lethal as fire, and it is
     announced first, so a bot that ignores it would walk into the collapse. */
  if (state.sudden > 0 && state.sudden <= SHRINK_WARN_SECONDS) {
    for (const c of nextShrinkCells(state)) out.add(key(c.x, c.y));
  }
  /* A vent about to fire is a hazard the bot can see coming. Before the warning it is
     just floor, so walking over one early is a risk, not a mistake. */
  if (state.vent > 0 && state.vent <= VENT_WARN_SECONDS) {
    for (const v of state.vents) out.add(key(v.x, v.y));
  }
  return out;
};

export const isTrapped = (state: BombermanState, seat: number): boolean => {
  const p = state.players.find((q) => q.seat === seat);
  if (!p) return false;
  return dangerCells(state).has(key(p.x, p.y));
};

export const bombOf = (state: BombermanState, seat: number): Bomb[] =>
  state.bombs.filter((b) => b.seat === seat);

export const facingFor = (dx: number, dy: number): Facing =>
  dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down';

/**
 * First step of a real path, not a greedy Manhattan nudge. A greedy step walks
 * straight into the pillar lattice and leaves a bot standing in the fire while it
 * decides what to do next.
 */
/**
 * `avoid` is what makes this usable for fleeing. A plain shortest path happily walks a
 * bot straight through a fire that is still burning from the bomb it planted two seconds
 * ago, which is how the "careful" bot kept dying: not on the new blast, but on the embers
 * of the last one. When no hazard-free route exists the caller gets the plain path back,
 * because standing still inside a blast is never better than crossing one.
 */
export const firstStepToward = (
  state: BombermanState,
  from: Coord,
  to: Coord,
  avoid?: Set<string>,
): Facing | null =>
  routeStep(state, from, to, avoid) ?? (avoid ? routeStep(state, from, to) : null);

function routeStep(
  state: BombermanState,
  from: Coord,
  to: Coord,
  avoid?: Set<string>,
): Facing | null {
  if (from.x === to.x && from.y === to.y) return null;
  const start = key(from.x, from.y);
  const goal = key(to.x, to.y);
  const prev = new Map<string, string | null>([[start, null]]);
  const queue: Coord[] = [{ x: from.x, y: from.y }];

  while (queue.length) {
    const cur = queue.shift() as Coord;
    for (const dir of Object.values(DIRS)) {
      const nx = cur.x + dir.x;
      const ny = cur.y + dir.y;
      const k = key(nx, ny);
      if (prev.has(k) || !walkable(state, nx, ny)) continue;
      if (avoid?.has(k)) continue;
      prev.set(k, key(cur.x, cur.y));
      if (k === goal) {
        let step: string = k;
        let parent = prev.get(step) ?? null;
        while (parent && parent !== start) {
          step = parent;
          parent = prev.get(step) ?? null;
        }
        const [sx, sy] = step.split(',').map(Number);
        return facingFor(sx - from.x, sy - from.y);
      }
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}
