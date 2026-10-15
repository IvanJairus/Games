/**
 * Bot seats.
 *
 * The bot only ever returns an InputState, exactly like a human client. That keeps
 * one code path through the sim and means a test can feed a recorded input trace to
 * either seat and get the same match.
 */

import { bombPlan, dangerCells, firstStepToward } from './blast';
import {
  BombermanState,
  Coord,
  DIRS,
  Facing,
  InputState,
  PlayerState,
  aliveSeats,
  bombAt,
  bombsOf,
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

const neighbours = (state: BombermanState, p: PlayerState): Array<{ dir: Facing; x: number; y: number }> =>
  Object.entries(DIRS)
    .map(([dir, d]) => ({ dir: dir as Facing, x: p.x + d.x, y: p.y + d.y }))
    .filter((o) => walkable(state, o.x, o.y));

export class BombermanBot {
  private held: InputState = { dir: null, bomb: false, seq: 0 };
  private timer = 0;
  private cooldown = 0;
  private escape: Coord | null = null;

  constructor(private seat: number, private level: BotLevel) {}

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
    if (this.timer > 0 && !this.escape) return this.held;
    this.timer = PERSONA[this.level].think;

    const p = state.players.find((q) => q.seat === this.seat);
    if (!p || !p.alive || state.phase !== 'battle') return { ...this.held, dir: null, bomb: false };

    const me = PERSONA[this.level];
    const open = neighbours(state, p);
    if (!open.length) return { ...this.held, dir: null, bomb: false };
    const danger = dangerCells(state);

    /* Kabur sampai keluar dari zona api, lalu berhenti di situ.
       Menarget satu petak spesifik membuat bot melewatkannya: satu keputusan menahan
       arah sekitar 1,5 petak, jadi ia bolak-balik di seberang petak aman dan kadang
       masih berdiri di dalam apinya sendiri saat bomnya habis. */
    if (this.escape) {
      if (!bombsOf(state, this.seat)) this.escape = null;
      else if (!danger.has(`${p.x},${p.y}`)) {
        return (this.held = { dir: null, bomb: false, seq: this.held.seq });
      } else {
        const step =
          firstStepToward(state, p, this.escape) ?? this.pickSafeDir(open, danger, rand) ?? open[0].dir;
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
      const plan = bombPlan(state, p.x, p.y, p.range);
      if (plan && rand() < me.bombChance) {
        this.escape = plan.target;
        this.cooldown = 1 + rand() * 1.5;
        this.held = { dir: null, bomb: true, seq: this.held.seq + 1 };
        return this.held;
      }
      if (me.seekSpot) {
        const rival = this.rival(state);
        const spots = open
          .map((o) => ({ o, plan: bombPlan(state, o.x, o.y, p.range) }))
          .filter((s): s is { o: (typeof open)[number]; plan: NonNullable<typeof s.plan> } => !!s.plan)
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
    const others = aliveSeats(state).filter((s) => s !== this.seat);
    const target = others.length ? state.players.find((p) => p.seat === others[0]) : null;
    return target ? { x: target.x, y: target.y } : { x: 0, y: 0 };
  }

  private distance(a: Coord, b: Coord): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }
}

export const facingDelta = (dir: Facing): Coord => DIRS[dir];
