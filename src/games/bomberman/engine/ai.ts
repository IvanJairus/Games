/**
 * Bot seats.
 *
 * The bot only ever returns an InputState, exactly like a human client. That keeps
 * one code path through the sim and means a test can feed a recorded input trace to
 * either seat and get the same match.
 */

import { blastCells, bombPlan, dangerCells, firstStepToward } from './blast';
import {
  BombermanState,
  Coord,
  DIRS,
  FUSE_SECONDS,
  Facing,
  InputState,
  PlayerState,
  aliveSeats,
  bombAt,
  bombsOf,
  teamOf,
  walkable,
} from './types';

export type BotLevel = 'santai' | 'sedang' | 'sempurna';

export interface BotLevelSpec {
  id: BotLevel;
  label: string;
  note: string;
}

export const BOMBER_BOT_LEVELS: BotLevelSpec[] = [
  { id: 'santai', label: 'Santai', note: 'Jarang menanam bom dan tidak mencari petak aman.' },
  { id: 'sedang', label: 'Sedang', note: 'Menanam teratur, kabur ke luar jangkauan apinya sendiri.' },
  { id: 'sempurna', label: 'Sempurna', note: 'Mencari petak tanam terbaik lalu mengejar lawannya.' },
];

export const describeBombermanBot = (level: BotLevel): string =>
  BOMBER_BOT_LEVELS.find((l) => l.id === level)?.note ?? '';

interface Personality {
  think: number;
  bombChance: number;
  seekSpot: boolean;
  chase: number;
  flees: boolean;
}

const PERSONA: Record<BotLevel, Personality> = {
  santai: { think: 0.55, bombChance: 0.18, seekSpot: false, chase: 0.35, flees: false },
  sedang: { think: 0.34, bombChance: 0.45, seekSpot: true, chase: 0.62, flees: true },
  sempurna: { think: 0.22, bombChance: 0.6, seekSpot: true, chase: 0.85, flees: true },
};

/**
 * A plan is only worth planting if the bot can really be outside the fire when the fuse
 * runs out. Three things have to hold: a route to the safe cell exists, that route crosses
 * no live flame, and the cell is reachable inside a fraction of the fuse at this bot's own
 * speed. Distance alone let the bot start a run it could not finish.
 */
function survivable(state: BombermanState, p: PlayerState, target: Coord, danger: Set<string>): boolean {
  if (danger.has(`${target.x},${target.y}`)) return false;
  const steps = Math.max(1, Math.floor(FUSE_SECONDS * 0.55 * p.speed));
  return reachableWithin(state, { x: p.x, y: p.y }, steps, danger).has(`${target.x},${target.y}`);
}

function reachableWithin(state: BombermanState, from: Coord, steps: number, fire: Set<string>): Set<string> {
  const seen = new Set<string>([`${from.x},${from.y}`]);
  let frontier: Coord[] = [from];
  for (let d = 0; d < steps; d++) {
    const next: Coord[] = [];
    for (const cur of frontier) {
      for (const dir of Object.values(DIRS)) {
        const nx = cur.x + dir.x;
        const ny = cur.y + dir.y;
        const k = `${nx},${ny}`;
        if (seen.has(k) || !walkable(state, nx, ny) || fire.has(k)) continue;
        seen.add(k);
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return seen;
}

const neighbours = (state: BombermanState, p: PlayerState): Array<{ dir: Facing; x: number; y: number }> =>
  Object.entries(DIRS)
    .map(([dir, d]) => ({ dir: dir as Facing, x: p.x + d.x, y: p.y + d.y }))
    .filter((o) => walkable(state, o.x, o.y));

export class BombermanBot {
  private held: InputState = { dir: null, bomb: false, seq: 0 };
  private timer = 0;
  private cooldown = 0;
  private escape: Coord | null = null;

  constructor(readonly seat: number, private level: BotLevel) {}

  /**
   * Decide at most every `think` seconds, but keep returning the held direction in
   * between: the sim reads a held dir every frame, so a decision that only lived one
   * tick would move the bot one cell and stop.
   *
   * While a bomb the bot planted is still ticking the cadence is thrown away and the
   * bot re-decides every frame. A held direction carries roughly 1.5 cells, which is
   * fine for wandering and fatal for dodging: the bot walked past the edge of its own
   * fire and back into it between two decisions.
   */
  update(state: BombermanState, dt: number, rand: () => number = Math.random): InputState {
    // Drained before the gate: a cooldown that only ticks on decisions would last
    // think-intervals times longer than the seconds it is written in.
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.timer -= dt;
    if (this.timer > 0 && !this.escape && !this.heldStillSafe(state)) return this.held;
    this.timer = PERSONA[this.level].think;

    const p = state.players.find((q) => q.seat === this.seat);
    if (!p || !p.alive || state.phase !== 'battle') return { ...this.held, dir: null, bomb: false };

    const me = PERSONA[this.level];
    const walkableOpen = neighbours(state, p);
    /* Fire kills the moment it is stepped on, so a burning cell is a wall to a bot, not a
       cost to weigh. Filtering only the route was not enough: a held direction is applied
       every frame until the next decision, so the bot still walked into the embers. */
    const fire = new Set(state.flames.map((f) => `${f.x},${f.y}`));
    const fireFree = walkableOpen.filter((o) => !fire.has(`${o.x},${o.y}`));
    const open = fireFree.length ? fireFree : walkableOpen;
    if (!open.length) return { ...this.held, dir: null, bomb: false };
    /* Two different questions, so two different sets.
       `danger` is where the bot must not remain: live flames plus every blast that
       exists, including its own. `othersDanger` is what makes a *new* plan unsafe, and
       there its own blast must be ignored, because every neighbour of a bomb burns and
       fleeing always crosses it. Collapsing the two made the bot wait on top of its own
       bomb, which is the single reason it then died on it. */
    const danger = dangerCells(state);
    const othersDanger = new Set<string>(state.flames.map((f) => `${f.x},${f.y}`));
    for (const b of state.bombs) {
      if (b.seat === this.seat) continue;
      for (const c of blastCells(state, b).cells) othersDanger.add(`${c.x},${c.y}`);
    }

    /* Kabur sampai keluar dari zona api, lalu berhenti di situ.
       Menarget satu petak spesifik membuat bot melewatkannya: satu keputusan menahan
       arah sekitar 1,5 petak, jadi ia bolak-balik di seberang petak aman dan kadang
       masih berdiri di dalam apinya sendiri saat bomnya habis. */
    if (this.escape) {
      /* The bomb leaving the floor is not the end of the danger: its flames keep burning
         for FLAME_SECONDS, and a step takes 1/speed seconds. A bot that started walking
         the instant its bomb went off walked straight back onto its own embers and died
         on arrival, which is what every recorded "suicide" turned out to be. Hold the
         safe cell until the fire this bot lit is out. */
      if (!bombsOf(state, this.seat) && !state.flames.some((f) => f.owner === this.seat)) this.escape = null;
      else if (!danger.has(`${p.x},${p.y}`)) {
        return (this.held = { dir: null, bomb: false, seq: this.held.seq });
      } else {
        /* Avoid only other hazards. The bot's own blast must be crossed on the way out,
           because every neighbour of a bomb burns; excluding it made the route
           unfindable and the bot then wandered on a random heading straight into the
           fire it was supposed to be leaving. */
        const step =
          firstStepToward(state, p, this.escape, othersDanger) ?? this.pickSafeDir(open, othersDanger, rand) ?? open[0].dir;
        return (this.held = { dir: step, bomb: false, seq: this.held.seq });
      }
    }

    if (me.flees && danger.has(`${p.x},${p.y}`)) {
      const clear = open.filter((o) => !danger.has(`${o.x},${o.y}`));
      const pool = clear.length ? clear : open;
      const m = pool[Math.floor(rand() * pool.length)];
      return (this.held = { dir: m.dir, bomb: false, seq: this.held.seq });
    }

    const armed = bombsOf(state, this.seat) < p.maxBombs && this.cooldown <= 0 && !bombAt(state, p.x, p.y);
    if (armed) {
      if (danger.has(`${p.x},${p.y}`)) return (this.held = { dir: null, bomb: false, seq: this.held.seq });
      const plan = bombPlan(state, p.x, p.y, p.range, othersDanger);
      if (plan && survivable(state, p, plan.target, othersDanger) && rand() < me.bombChance) {
        this.escape = plan.target;
        this.cooldown = 1 + rand() * 1.5;
        this.held = { dir: null, bomb: true, seq: this.held.seq + 1 };
        return this.held;
      }
      if (me.seekSpot) {
        const rival = this.rival(state);
        const spots = open
          .map((o) => ({ o, plan: bombPlan(state, o.x, o.y, p.range, othersDanger) }))
          .filter((s): s is { o: (typeof open)[number]; plan: NonNullable<typeof s.plan> } =>
            !!s.plan && survivable(state, { ...p, x: s.o.x, y: s.o.y }, s.plan.target, othersDanger))
          .sort((a, b) => this.distance(a.plan.target, rival) - this.distance(b.plan.target, rival));
        if (spots.length) {
          const mv = open.find((o) => o.x === spots[0].o.x && o.y === spots[0].o.y);
          if (mv) return (this.held = { dir: mv.dir, bomb: false, seq: this.held.seq });
        }
      }
    }

    const rival = this.rival(state);
    const scored = open
      .map((o) => ({ o, d: Math.abs(o.x - rival.x) + Math.abs(o.y - rival.y) }))
      .sort((a, b) => a.d - b.d);
    const chase = rand() < me.chase ? scored[0].o : open[Math.floor(rand() * open.length)];
    return (this.held = { dir: chase.dir, bomb: false, seq: this.held.seq });
  }

  /**
   * A held direction is a commitment of about 1.5 cells, and a bomb can go off in the
   * middle of it. Without this check the bot keeps walking the way it chose before the
   * fire existed, which is how it died on embers rather than on a blast: the route was
   * planned when the cell ahead was floor.
   */
  private heldStillSafe(state: BombermanState): boolean {
    const dir = this.held.dir;
    if (!dir) return true;
    const p = state.players.find((q) => q.seat === this.seat);
    if (!p) return true;
    const d = DIRS[dir];
    const k = `${p.x + d.x},${p.y + d.y}`;
    if (state.flames.some((f) => `${f.x},${f.y}` === k)) return false;
    for (const b of state.bombs) {
      if (b.seat === this.seat) continue;
      if (blastCells(state, b).cells.some((c) => `${c.x},${c.y}` === k)) return false;
    }
    return true;
  }

  private pickSafeDir(
    open: Array<{ dir: Facing; x: number; y: number }>,
    danger: Set<string>,
    rand: () => number,
  ): Facing | null {
    const clear = open.filter((o) => !danger.has(`${o.x},${o.y}`));
    if (!clear.length) return null;
    return clear[Math.floor(rand() * clear.length)].dir;
  }

  private rival(state: BombermanState): Coord {
    /* In team mode the nearest enemy is the target; a teammate's body is not something to
       walk into, and chasing it made both bots of one side ignore the other side. */
    const enemies = aliveSeats(state).filter((s) => s !== this.seat && (!state.teams || teamOf(s) !== teamOf(this.seat)));
    const others = enemies.length ? enemies : aliveSeats(state).filter((s) => s !== this.seat);
    const me = state.players.find((p) => p.seat === this.seat);
    const pick = others
      .map((s) => state.players.find((p) => p.seat === s))
      .filter((p): p is PlayerState => !!p)
      .sort((a, b) => (me ? this.distance(me, a) - this.distance(me, b) : 0))[0];
    return pick ? { x: pick.x, y: pick.y } : { x: 0, y: 0 };
  }

  private distance(a: Coord, b: Coord): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }
}

export const facingDelta = (dir: Facing): Coord => DIRS[dir];
