/**
 * The authoritative arena simulation.
 *
 * One seat owns this object at a time: in a local match that is the page, in an
 * online match it is the host, and everyone else just renders snapshots. The sim
 * never picks a random number of its own except through the injected `rand`, so a
 * test can replay a whole match from a seed.
 */

import {
  CHAIN_FUSE,
  COOLDOWN_SECONDS,
  COUNTDOWN_SECONDS,
  Bomb,
  CellKind,
  Coord,
  DIRS,
  FUSE_SECONDS,
  FLAME_SECONDS,
  Facing,
  FloorKind,
  InputState,
  POWER_CHANCE,
  PlayerState,
  PowerKind,
  ROUND_OVER_SECONDS,
  SCORE_TO_WIN,
  SHIELD_GRACE,
  SimEvent,
  START_MAX_BOMBS,
  START_RANGE,
  START_SPEED,
  BombermanState,
  bombAt,
  bombsOf,
  cellAt,
  aliveSeats,
  spawnCells,
  walkable,
} from './types';
import { buildGrid, generateSeed } from './rng';
import { blastCells } from './blast';

export interface SeatConfig {
  seat: number;
  name: string;
  charId: string;
  bot: boolean;
  /** Overrides the spawn corner. Rule tests hand the sim an exact board. */
  home?: Coord;
}

export interface SimOptions {
  seed?: string;
  seats?: number;
  floor?: FloorKind;
  players: SeatConfig[];
  rand?: () => number;
  /** Overrides the seeded map. Used by tests that assert one rule at a time. */
  grid?: CellKind[][];
  phase?: BombermanState['phase'];
  scoreToWin?: number;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const FLOORS: FloorKind[] = ['grass', 'sand', 'stone'];

export class BombermanSim {
  readonly state: BombermanState;
  private inputs = new Map<number, InputState>();
  private lastSeq = new Map<number, number>();
  private queue: SimEvent[] = [];
  private lastCountdown = 0;
  private rand: () => number;
  readonly spawns: Coord[];
  private homes: Coord[] = [];
  private baseSeed: string;
  private gridOverride?: CellKind[][];
  private roundNumber = 1;

  constructor(opts: SimOptions) {
    const seats = opts.seats ?? opts.players.length;
    const cols = seats >= 4 ? 15 : 11;
    const rows = seats >= 4 ? 11 : 9;
    const seed = opts.seed ?? generateSeed();
    this.rand = opts.rand ?? Math.random;
    this.spawns = spawnCells(cols, rows, seats);
    this.baseSeed = seed;
    this.gridOverride = opts.grid;

    this.state = {
      phase: opts.phase ?? 'countdown',
      seed,
      floor: opts.floor ?? FLOORS[Math.floor(this.rand() * FLOORS.length)],
      cols,
      rows,
      seats,
      round: 1,
      scoreToWin: opts.scoreToWin ?? SCORE_TO_WIN,
      roundOver: 0,
      grid: opts.grid ?? buildGrid(seed, cols, rows, seats),
      bombs: [],
      flames: [],
      powers: [],
      players: [],
      winner: null,
      elapsed: 0,
      countdown: COUNTDOWN_SECONDS,
      nextId: 1,
    };
    this.lastCountdown = this.state.countdown;

    opts.players.forEach((cfg, i) => {
      const home = cfg.home ?? this.spawns[Math.min(i, this.spawns.length - 1)];
      this.homes.push(home);
      this.state.players.push({
        seat: cfg.seat,
        name: cfg.name,
        charId: cfg.charId,
        bot: cfg.bot,
        alive: true,
        x: home.x,
        y: home.y,
        ax: home.x,
        ay: home.y,
        facing: 'down',
        range: START_RANGE,
        maxBombs: START_MAX_BOMBS,
        speed: START_SPEED,
        shield: false,
        grace: 0,
        wins: 0,
        step: null,
        cool: 0,
        bombsPlaced: 0,
        blocksBroken: 0,
      });
    });
  }

  /* ---------- input ---------- */

  setInput(seat: number, input: InputState): void {
    this.inputs.set(seat, input);
    if (input.bomb && input.seq !== (this.lastSeq.get(seat) ?? 0)) {
      this.lastSeq.set(seat, input.seq);
      this.place(seat);
    }
  }

  player(seat: number): PlayerState | undefined {
    return this.state.players.find((p) => p.seat === seat);
  }

  /* ---------- rules, also called straight from the local page ---------- */

  tryMove(seat: number, dir: Facing): ActionResult {
    const s = this.state;
    const p = this.player(seat);
    if (!p) return { ok: false, error: 'Kursi tidak ada' };
    if (s.phase !== 'battle') return { ok: false, error: 'Belum mulai' };
    if (!p.alive) return { ok: false, error: 'Sudah KO' };
    p.facing = dir;
    if (p.step) return { ok: false, error: 'Masih melangkah' };

    const nx = p.x + DIRS[dir].x;
    const ny = p.y + DIRS[dir].y;
    if (!walkable(s, nx, ny)) {
      if (cellAt(s, nx, ny) === 'soft') return { ok: false, error: 'Terhalang bata lunak' };
      return { ok: false, error: 'Tidak bisa ke situ' };
    }
    p.step = { fx: p.x, fy: p.y, tx: nx, ty: ny, t: 0 };
    return { ok: true };
  }

  place(seat: number): ActionResult {
    const s = this.state;
    const p = this.player(seat);
    if (!p) return { ok: false, error: 'Kursi tidak ada' };
    if (s.phase !== 'battle') return { ok: false, error: 'Belum mulai' };
    if (!p.alive) return { ok: false, error: 'Sudah KO' };
    if (p.cool > 0) return { ok: false, error: 'Tunggu sebentar' };
    if (bombAt(s, p.x, p.y)) return { ok: false, error: 'Sudah ada bom di situ' };
    if (bombsOf(s, seat) >= p.maxBombs) return { ok: false, error: 'Bom sudah penuh' };

    s.bombs.push({
      id: s.nextId++,
      x: p.x,
      y: p.y,
      seat,
      fuse: FUSE_SECONDS,
      range: p.range,
      lit: false,
    });
    p.cool = COOLDOWN_SECONDS;
    p.bombsPlaced++;
    this.queue.push({ t: 'place', seat, x: p.x, y: p.y });
    return { ok: true };
  }

  /* ---------- ticking ---------- */

  step(dt: number): void {
    const s = this.state;
    if (dt <= 0 || Number.isFinite(dt) === false) return;

    if (s.phase === 'countdown') {
      s.countdown = Math.max(0, s.countdown - dt);
      const whole = Math.ceil(s.countdown);
      if (whole !== this.lastCountdown) {
        this.lastCountdown = whole;
        this.queue.push({ t: 'countdown', value: whole });
      }
      if (s.countdown <= 0) {
        s.phase = 'battle';
        this.queue.push({ t: 'start' });
      }
      return;
    }
    if (s.phase === 'roundOver') {
      s.roundOver = Math.max(0, s.roundOver - dt);
      if (s.roundOver <= 0) this.nextRound();
      return;
    }
    if (s.phase !== 'battle') return;

    s.elapsed += dt;
    for (const p of s.players) {
      p.cool = Math.max(0, p.cool - dt);
      p.grace = Math.max(0, p.grace - dt);
      this.advanceStep(p, dt);
      if (!p.alive) continue;
      const input = this.inputs.get(p.seat);
      if (input?.dir) this.tryMove(p.seat, input.dir);
      this.pickUp(p);
    }

    this.tickBombs(dt);
    this.tickFlames(dt);
    this.judge();
  }

  private advanceStep(p: PlayerState, dt: number): void {
    if (!p.step) {
      p.ax = p.x;
      p.ay = p.y;
      return;
    }
    p.step.t += dt * p.speed;
    if (p.step.t >= 1) {
      p.x = p.step.tx;
      p.y = p.step.ty;
      p.step = null;
      p.ax = p.x;
      p.ay = p.y;
      return;
    }
    p.ax = p.step.fx + (p.step.tx - p.step.fx) * p.step.t;
    p.ay = p.step.fy + (p.step.ty - p.step.fy) * p.step.t;
  }

  private pickUp(p: PlayerState): void {
    const s = this.state;
    const i = s.powers.findIndex((u) => u.x === p.x && u.y === p.y);
    if (i < 0) return;
    const power = s.powers[i];
    s.powers.splice(i, 1);
    this.grant(p, power.kind);
    this.queue.push({ t: 'take', seat: p.seat, kind: power.kind });
  }

  private grant(p: PlayerState, kind: PowerKind): void {
    if (kind === 'flame') p.range += 1;
    if (kind === 'count') p.maxBombs += 1;
    if (kind === 'speed') p.speed += 1.1;
    if (kind === 'shield') p.shield = true;
  }

  private tickBombs(dt: number): void {
    const s = this.state;
    for (const b of s.bombs.slice()) {
      b.fuse -= dt;
      if (b.fuse <= 0) this.explode(b);
    }
  }

  /** All state mutation caused by a blast lives here, never in blastCells. */
  private explode(bomb: Bomb): void {
    const s = this.state;
    const at = s.bombs.indexOf(bomb);
    if (at < 0) return;
    s.bombs.splice(at, 1);

    const blast = blastCells(s, bomb);
    for (const c of blast.cells) {
      s.flames.push({
        id: s.nextId++,
        x: c.x,
        y: c.y,
        life: FLAME_SECONDS,
        kind: c.core ? 'core' : c.end ? 'tip' : 'arm',
      });
    }
    for (const soft of blast.softs) {
      s.grid[soft.y][soft.x] = 'empty';
      const owner = this.player(bomb.seat);
      if (owner) owner.blocksBroken++;
      this.queue.push({ t: 'break', x: soft.x, y: soft.y });
      if (this.rand() < POWER_CHANCE) {
        const kinds: PowerKind[] = ['flame', 'speed', 'count', 'shield'];
        const kind = kinds[Math.floor(this.rand() * kinds.length)];
        s.powers.push({ x: soft.x, y: soft.y, kind });
      }
    }
    for (const power of blast.powers) {
      const i = s.powers.findIndex((u) => u.x === power.x && u.y === power.y);
      if (i >= 0) s.powers.splice(i, 1);
    }
    for (const other of blast.lit) {
      other.lit = true;
      other.fuse = Math.min(other.fuse, CHAIN_FUSE);
    }
    this.queue.push({ t: 'boom', x: bomb.x, y: bomb.y, range: bomb.range });
  }

  private tickFlames(dt: number): void {
    const s = this.state;
    for (const f of s.flames.slice()) {
      f.life -= dt;
      if (f.life <= 0) {
        const i = s.flames.indexOf(f);
        if (i >= 0) s.flames.splice(i, 1);
        continue;
      }
      for (const p of s.players) {
        if (!p.alive || p.grace > 0 || p.x !== f.x || p.y !== f.y) continue;
        if (p.shield) {
          p.shield = false;
          p.grace = SHIELD_GRACE;
          continue;
        }
        p.alive = false;
        p.step = null;
        this.queue.push({ t: 'ko', seat: p.seat });
      }
    }
  }

  private judge(): void {
    const s = this.state;
    const left = aliveSeats(s);
    if (left.length > 1) return;
    const winner = left.length === 1 ? left[0] : null;
    if (winner !== null) {
      const p = this.player(winner);
      if (p) p.wins += 1;
    }
    s.flames = [];
    s.bombs = [];
    s.phase = 'roundOver';
    s.roundOver = ROUND_OVER_SECONDS;
    this.queue.push({ t: 'round', winner, round: s.round });
  }

  private nextRound(): void {
    const s = this.state;
    const champion = s.players.find((p) => p.wins >= s.scoreToWin);
    if (champion) {
      s.phase = 'finished';
      s.winner = champion.seat;
      this.queue.push({ t: 'end', winner: champion.seat });
      return;
    }

    this.roundNumber += 1;
    s.round = this.roundNumber;
    s.seed = `${this.baseSeed}-r${this.roundNumber}`;
    // A fresh layout each round unless the caller pinned the map, which is what
    // the rule tests do to assert one behaviour at a time.
    s.grid = this.gridOverride ?? buildGrid(s.seed, s.cols, s.rows, s.seats);
    s.bombs = [];
    s.flames = [];
    s.powers = [];
    s.players.forEach((p, i) => {
      const home = this.homes[i];
      p.alive = true;
      p.x = home.x;
      p.y = home.y;
      p.ax = home.x;
      p.ay = home.y;
      p.facing = 'down';
      p.range = START_RANGE;
      p.maxBombs = START_MAX_BOMBS;
      p.speed = START_SPEED;
      p.shield = false;
      p.grace = 0;
      p.step = null;
      p.cool = 0;
    });
    s.phase = 'countdown';
    s.countdown = COUNTDOWN_SECONDS;
    this.lastCountdown = s.countdown;
  }

  /* ---------- wire format ---------- */

  snapshot(): BombermanState {
    return JSON.parse(JSON.stringify(this.state)) as BombermanState;
  }

  /** A client replaces its whole world; the host owns the clock. */
  applySnapshot(next: BombermanState): void {
    if (!next || !Array.isArray(next.players) || typeof next.phase !== 'string') return;
    const target = this.state;
    target.phase = next.phase;
    target.seed = next.seed;
    target.floor = next.floor;
    target.cols = next.cols;
    target.rows = next.rows;
    target.seats = next.seats;
    target.round = next.round;
    target.scoreToWin = next.scoreToWin;
    target.roundOver = next.roundOver;
    target.grid = next.grid;
    target.bombs = next.bombs;
    target.flames = next.flames;
    target.powers = next.powers;
    target.players = next.players;
    target.winner = next.winner;
    target.elapsed = next.elapsed;
    target.countdown = next.countdown;
    target.nextId = next.nextId;
  }

  drainEvents(): SimEvent[] {
    if (!this.queue.length) return [];
    const out = this.queue;
    this.queue = [];
    return out;
  }
}

export const newSim = (players: SeatConfig[], opts: Omit<SimOptions, 'players'> = {}): BombermanSim =>
  new BombermanSim({ ...opts, players });
