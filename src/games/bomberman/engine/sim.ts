/**
 * The authoritative arena simulation.
 *
 * One seat owns this object at a time: in a local match that is the page, in an
 * online match it is the host, and everyone else just renders snapshots. The sim
 * never picks a random number of its own except through the injected `rand`, so a
 * test can replay a whole match from a seed.
 */

import {
  BoardSize,
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
  ROUND_SECONDS,
  PowerKind,
  ROUND_OVER_SECONDS,
  SCORE_TO_WIN,
  SHIELD_GRACE,
  SHRINK_INTERVAL,
  VENT_SECONDS,
  SimEvent,
  START_MAX_BOMBS,
  START_RANGE,
  START_SPEED,
  BombermanState,
  bombAt,
  bombsOf,
  cellAt,
  aliveSeats,
  aliveTeams,
  teamOf,
  maxShrinkRings,
  nextShrinkCells,
  spawnCells,
  spawnClearance,
  walkable,
  boardFor,
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
  /** Arena geometry. Omitted, the seat count picks the small board. */
  size?: BoardSize;
  floor?: FloorKind;
  /** Two teams of two. Ignored for anything but four seats. */
  teams?: boolean;
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
  private roundStarted = 0;

  constructor(opts: SimOptions) {
    const seats = opts.seats ?? opts.players.length;
    const board = boardFor(seats, opts.size);
    const cols = board.cols;
    const rows = board.rows;
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
      teams: seats >= 4 && opts.teams === true,
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
      sudden: 0,
      ring: 0,
      vents: [],
      vent: VENT_SECONDS,
    };
    this.lastCountdown = this.state.countdown;
    this.state.vents = this.pickVents();

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
        kick: false,
        remote: false,
        pierce: false,
        grace: 0,
        wins: 0,
        roundBombs: 0,
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
    const blocking = bombAt(s, nx, ny);
    if (blocking) {
      /* A kicked bomb moves one cell and the seat takes the cell it left, so the push
         costs the same step as walking into an empty cell. */
      if (!p.kick) return { ok: false, error: 'Bom menghalangi' };
      const tx = nx + DIRS[dir].x;
      const ty = ny + DIRS[dir].y;
      if (!walkable(s, tx, ty)) return { ok: false, error: 'Bom tidak bisa didorong' };
      blocking.x = tx;
      blocking.y = ty;
      p.step = { fx: p.x, fy: p.y, tx: nx, ty: ny, t: 0 };
      return { ok: true };
    }
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
    /* With a remote in hand the same button that plants also fires, which is why it is
       checked before the cooldown: a second press right after planting has to work. */
    if (p.remote && bombsOf(s, seat) > 0) return this.detonate(seat);
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
    p.roundBombs++;
    this.queue.push({ t: 'place', seat, x: p.x, y: p.y });
    return { ok: true };
  }

  /**
   * Remote detonation. The fuse is shortened rather than zeroed so the blast still runs
   * through the normal chain rules and the renderer gets its usual lit-bomb frame.
   */
  private detonate(seat: number): ActionResult {
    let any = false;
    for (const b of this.state.bombs) {
      if (b.seat !== seat) continue;
      b.lit = true;
      b.fuse = Math.min(b.fuse, CHAIN_FUSE);
      any = true;
    }
    return any ? { ok: true } : { ok: false, error: 'Tidak ada bom' };
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

    this.tickVents(dt);
    this.tickBombs(dt);
    this.tickFlames(dt);
    this.tickSudden(dt);
    this.judge();
  }

  /**
   * Vents are picked from open floor away from every spawn, so the hazard never opens
   * under a seat at the bell. They stay put for the round, which is what makes them a
   * pattern to read rather than a random death.
   */
  private pickVents(): Coord[] {
    const s = this.state;
    if (s.floor !== 'stone') return [];
    const clear = new Set<string>();
    for (const spawn of this.spawns) {
      for (const c of spawnClearance(spawn)) clear.add(`${c.x},${c.y}`);
    }
    const pool: Coord[] = [];
    for (let y = 2; y < s.rows - 2; y++) {
      for (let x = 2; x < s.cols - 2; x++) {
        if (s.grid[y][x] !== 'empty' || clear.has(`${x},${y}`)) continue;
        pool.push({ x, y });
      }
    }
    const count = Math.min(5, Math.max(2, Math.round((s.cols * s.rows) / 90)));
    const out: Coord[] = [];
    /* One random start, then a walk over the pool: random picks alone stalled whenever the
       same cell came up twice, which left a wide board with a single vent. */
    const start = Math.floor(this.rand() * pool.length);
    for (let i = 0; i < pool.length && out.length < count; i++) {
      const c = pool[(start + i) % pool.length];
      if (out.some((o) => Math.abs(o.x - c.x) + Math.abs(o.y - c.y) < 3)) continue;
      out.push(c);
    }
    return out;
  }

  private tickVents(dt: number): void {
    const s = this.state;
    if (!s.vents.length) return;
    s.vent -= dt;
    if (s.vent > 0) return;
    s.vent = VENT_SECONDS;
    for (const v of s.vents) {
      if (cellAt(s, v.x, v.y) === 'hard') continue;
      s.flames.push({
        id: s.nextId++,
        x: v.x,
        y: v.y,
        life: FLAME_SECONDS,
        kind: 'core',
        owner: -1,
      });
    }
    this.queue.push({ t: 'vent', cells: s.vents.length });
  }

  /**
   * Past ROUND_SECONDS the arena starts closing in one ring at a time. The countdown is
   * published through `state.sudden` so the HUD can warn before a wall replaces the floor
   * a player is standing on. Nothing is decided by a machine score: the round ends when
   * the collapsing wall, or a bomb, leaves one seat alive.
   */
  private tickSudden(dt: number): void {
    const s = this.state;
    if (s.elapsed - this.roundStarted < ROUND_SECONDS) return;
    const lastRing = maxShrinkRings(s.cols, s.rows);
    if (s.ring > lastRing) return;
    if (s.sudden <= 0) s.sudden = SHRINK_INTERVAL;
    s.sudden -= dt;
    if (s.sudden > 0) return;
    if (s.ring === lastRing) this.collapseToCore();
    else this.collapseRing();
    s.sudden = SHRINK_INTERVAL;
  }

  private collapseRing(): void {
    const cells = nextShrinkCells(this.state);
    if (!cells.length) return;
    this.state.ring += 1;
    this.wallCells(cells);
  }

  /**
   * The rings stop when one line of cells is left, and two players can still stand at
   * opposite ends of that line forever. The last collapse keeps a single cell so a round
   * always resolves; a draw remains possible only if nobody is standing on it.
   */
  private collapseToCore(): void {
    const s = this.state;
    const open: Coord[] = [];
    for (let y = 1; y < s.rows - 1; y++) {
      for (let x = 1; x < s.cols - 1; x++) {
        if (s.grid[y][x] !== 'hard') open.push({ x, y });
      }
    }
    if (!open.length) return;
    const cx = Math.floor(s.cols / 2);
    const cy = Math.floor(s.rows / 2);
    const keep = open.reduce((best, c) => {
      const d = Math.abs(c.x - cx) + Math.abs(c.y - cy);
      const bd = Math.abs(best.x - cx) + Math.abs(best.y - cy);
      return d < bd ? c : best;
    });
    s.ring += 1;
    this.wallCells(open.filter((c) => c !== keep));
  }

  private wallCells(cells: Coord[]): void {
    const s = this.state;
    if (!cells.length) return;
    const wall = new Set(cells.map((c) => `${c.x},${c.y}`));
    for (const c of cells) {
      s.grid[c.y][c.x] = 'hard';
    }
    s.bombs = s.bombs.filter((b) => !wall.has(`${b.x},${b.y}`));
    s.powers = s.powers.filter((u) => !wall.has(`${u.x},${u.y}`));
    s.flames = s.flames.filter((f) => !wall.has(`${f.x},${f.y}`));
    for (const p of s.players) {
      if (!p.alive || !wall.has(`${p.x},${p.y}`)) continue;
      // The wall does not care about shields: the point of sudden death is that this
      // ring is gone, not that it dealt one hit.
      p.alive = false;
      p.step = null;
      this.queue.push({ t: 'ko', seat: p.seat, by: -1 });
    }
    this.queue.push({ t: 'shrink', ring: s.ring, cells: cells.length });
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
    this.queue.push({ t: 'take', seat: p.seat, kind: power.kind, x: power.x, y: power.y });
  }

  private grant(p: PlayerState, kind: PowerKind): void {
    if (kind === 'flame') p.range += 1;
    if (kind === 'count') p.maxBombs += 1;
    if (kind === 'speed') p.speed += 1.1;
    if (kind === 'shield') p.shield = true;
    if (kind === 'kick') p.kick = true;
    if (kind === 'remote') p.remote = true;
    if (kind === 'pierce') p.pierce = true;
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

    const blast = blastCells(s, bomb, this.player(bomb.seat)?.pierce === true);
    for (const c of blast.cells) {
      s.flames.push({
        id: s.nextId++,
        x: c.x,
        y: c.y,
        life: FLAME_SECONDS,
        kind: c.core ? 'core' : c.end ? 'tip' : 'arm',
        owner: bomb.seat,
      });
    }
    for (const soft of blast.softs) {
      s.grid[soft.y][soft.x] = 'empty';
      const owner = this.player(bomb.seat);
      if (owner) owner.blocksBroken++;
      this.queue.push({ t: 'break', x: soft.x, y: soft.y });
      if (this.rand() < POWER_CHANCE) {
        const kinds: PowerKind[] = ['flame', 'speed', 'count', 'shield', 'kick', 'remote', 'pierce'];
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
        /* Team fire is friendly: a teammate's flame is not a threat, but your own bomb
           still is. Without the owner check the mode would remove the only risk that
           makes planting a bomb a decision. */
        if (s.teams && f.owner !== p.seat && teamOf(f.owner) === teamOf(p.seat)) continue;
        if (p.shield) {
          p.shield = false;
          p.grace = SHIELD_GRACE;
          continue;
        }
        p.alive = false;
        p.step = null;
        this.queue.push({ t: 'ko', seat: p.seat, by: f.owner });
      }
    }
  }

  private judge(): void {
    const s = this.state;
    if (s.teams) {
      const sides = aliveTeams(s);
      if (sides.length > 1) return;
      if (sides.length === 0) {
        this.endRound(null);
        return;
      }
      const team = sides[0];
      const survivor = s.players.filter((p) => p.alive && teamOf(p.seat) === team).sort((a, b) => a.seat - b.seat)[0];
      this.endRound(survivor ? survivor.seat : null);
      return;
    }
    const left = aliveSeats(s);
    if (left.length > 1) return;
    this.endRound(left.length === 1 ? left[0] : null);
  }

  private endRound(winner: number | null): void {
    const s = this.state;
    if (s.phase !== 'battle') return;
    if (winner !== null) {
      /* A team round is won by the team, so every member gets the point, including the
         one that died earlier in the round. Free-for-all keeps the single winner. */
      const team = s.teams ? teamOf(winner) : null;
      const winners = team === null ? s.players.filter((p) => p.seat === winner) : s.players.filter((p) => teamOf(p.seat) === team);
      for (const p of winners) p.wins += 1;
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
    s.sudden = 0;
    s.ring = 0;
    s.vents = this.pickVents();
    s.vent = VENT_SECONDS;
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
      p.kick = false;
      p.remote = false;
      p.pierce = false;
      p.grace = 0;
      p.step = null;
      p.cool = 0;
      p.roundBombs = 0;
    });
    this.roundStarted = s.elapsed;
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
    target.teams = next.teams === true;
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
    target.sudden = next.sudden ?? 0;
    target.ring = next.ring ?? 0;
    target.vents = Array.isArray(next.vents) ? next.vents : [];
    target.vent = typeof next.vent === 'number' ? next.vent : VENT_SECONDS;
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
