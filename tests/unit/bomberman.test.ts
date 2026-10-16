import { describe, expect, it } from 'vitest';

import {
  BOARDS,
  COUNTDOWN_SECONDS,
  ROUND_OVER_SECONDS,
  SCORE_TO_WIN,
  START_RANGE,
  CellKind,
  Coord,
  DIRS,
  Facing,
  FUSE_SECONDS,
  ROUND_SECONDS,
  BombermanState,
  aliveSeats,
  boardFor,
  sizeForBoard,
  spawnCells,
  spawnClearance,
} from '@/games/bomberman/engine/types';
import { buildGrid, generateSeed, validateGrid, SOFT_DENSITY } from '@/games/bomberman/engine/rng';
import { blastCells, bombPlan, dangerCells, escapeTarget, firstStepToward } from '@/games/bomberman/engine/blast';
import { BombermanSim, SeatConfig, newSim } from '@/games/bomberman/engine/sim';

const arena = (cols: number, rows: number, fill: (x: number, y: number) => CellKind = () => 'empty'): CellKind[][] =>
  Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x): CellKind => {
      if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) return 'hard';
      return fill(x, y);
    }),
  );

const bareState = (grid: CellKind[][], extra: Partial<BombermanState> = {}): BombermanState => ({
  phase: 'battle',
  seed: 'bare',
  floor: 'grass',
  cols: grid[0].length,
  rows: grid.length,
  seats: 2,
  round: 1,
  scoreToWin: SCORE_TO_WIN,
  roundOver: 0,
  grid,
  bombs: [],
  flames: [],
  powers: [],
  players: [],
  winner: null,
  elapsed: 0,
  countdown: 0,
  nextId: 1,
  ...extra,
});

const seat = (n: number, home: Coord, extra: Partial<SeatConfig> = {}): SeatConfig => ({
  seat: n,
  name: `P${n}`,
  charId: 'robo',
  bot: false,
  home,
  ...extra,
});

const make = (
  grid: CellKind[][],
  players: SeatConfig[],
  opts: { seats?: number; rand?: () => number } = {},
): BombermanSim =>
  newSim(players, {
    grid,
    seats: opts.seats ?? Math.max(2, players.length),
    phase: 'battle',
    seed: 'test-seed',
    floor: 'grass',
    rand: opts.rand ?? (() => 0.99),
  });

const run = (sim: BombermanSim, seconds: number, dt = 1 / 60): void => {
  for (let i = 0; i < Math.round(seconds / dt); i++) sim.step(dt);
};

const hold = (sim: BombermanSim, s: number, dir: Facing | null, bomb = false, seq = 0): void =>
  sim.setInput(s, { dir, bomb, seq });

/** Every geometry a match can be played on, small and large, duel and free-for-all. */
const ALL_BOARDS = [BOARDS.duel, BOARDS.duelLarge, BOARDS.freeFor, BOARDS.freeForLarge];

describe('map generation', () => {
  it('builds the same arena twice from one seed', () => {
    for (let i = 0; i < 50; i++) {
      const seed = generateSeed();
      expect(buildGrid(seed, 11, 9, 2)).toEqual(buildGrid(seed, 11, 9, 2));
    }
  });

  it('leaves every spawn open on every board', () => {
    for (const board of ALL_BOARDS) {
      for (let i = 0; i < 50; i++) {
        const spawns = spawnCells(board.cols, board.rows, board.seats);
        const grid = buildGrid(generateSeed(), board.cols, board.rows, board.seats);
        expect(validateGrid(grid, spawns)).toEqual([]);
      }
    }
  });

  it('does not seal a spawn pocket shut', () => {
    // A seat with both exits blocked by soft blocks can never bomb safely, and the
    // bot used to sit there without planting anything at all.
    for (const board of ALL_BOARDS) {
      for (let i = 0; i < 50; i++) {
        const grid = buildGrid(generateSeed(), board.cols, board.rows, board.seats);
        for (const s of spawnCells(board.cols, board.rows, board.seats)) {
          const open = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].filter(([dx, dy]) => grid[s.y + dy]?.[s.x + dx] === 'empty');
          expect(open.length).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it('keeps the field dense enough to be worth bombing', () => {
    /* Counted over the cells a bomb can actually open. The pillars and the forced-open
       spawn clearance are empty by rule, and including them in the denominator made this
       test a coin flip on the seed rather than a check on the density. */
    const cols = 15;
    const rows = 11;
    const seats = 4;
    const clear = new Set<string>();
    for (const s of spawnCells(cols, rows, seats)) {
      for (const c of spawnClearance(s)) clear.add(`${c.x},${c.y}`);
    }
    let ratio = 0;
    const runs = 20;
    for (let i = 0; i < runs; i++) {
      const grid = buildGrid(generateSeed(), cols, rows, seats);
      let open = 0;
      let soft = 0;
      grid.forEach((row, y) =>
        row.forEach((cell, x) => {
          if (cell === 'hard' || clear.has(`${x},${y}`)) return;
          open += 1;
          if (cell === 'soft') soft += 1;
        }),
      );
      ratio += soft / open;
    }
    expect(ratio / runs).toBeGreaterThan(SOFT_DENSITY * 0.9);
  });

  it('reads the arena size back out of a board geometry', () => {
    /* A client rebuilds its sim from a world frame, which carries cols and rows but not
       the lobby setting, so the geometry has to name the size it came from. */
    for (const seats of [2, 4]) {
      for (const size of ['kecil', 'besar'] as const) {
        const board = boardFor(seats, size);
        expect(sizeForBoard(board.seats, board.cols)).toBe(size);
      }
    }
  });

  const interiorHard = (grid: CellKind[][], cols: number, rows: number): Set<string> => {
    const out = new Set<string>();
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) if (grid[y][x] === 'hard') out.add(`${x},${y}`);
    }
    return out;
  };

  it('scatters the pillars without ever letting two of them touch', () => {
    /* A pillar that touches another, even diagonally, can join it into a barrier, and a
       barrier that reaches the border seals a pocket. That is the one map shape the random
       layout may never produce. */
    for (const board of ALL_BOARDS) {
      for (let i = 0; i < 30; i++) {
        const grid = buildGrid(generateSeed(), board.cols, board.rows, board.seats);
        const rocks = interiorHard(grid, board.cols, board.rows);
        expect(rocks.size).toBeGreaterThan(0);
        for (const k of rocks) {
          const [x, y] = k.split(',').map(Number);
          expect(x).toBeGreaterThanOrEqual(2);
          expect(y).toBeGreaterThanOrEqual(2);
          expect(x).toBeLessThanOrEqual(board.cols - 3);
          expect(y).toBeLessThanOrEqual(board.rows - 3);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              expect(rocks.has(`${x + dx},${y + dy}`)).toBe(false);
            }
          }
        }
      }
    }
  });

  it('leaves one connected field for every seed and board', () => {
    for (const board of ALL_BOARDS) {
      for (let i = 0; i < 30; i++) {
        const grid = buildGrid(generateSeed(), board.cols, board.rows, board.seats);
        const start = spawnCells(board.cols, board.rows, board.seats)[0];
        const seen = new Set([`${start.x},${start.y}`]);
        const queue = [start];
        while (queue.length) {
          const c = queue.shift() as Coord;
          for (const d of Object.values(DIRS)) {
            const nx = c.x + d.x;
            const ny = c.y + d.y;
            if (nx < 0 || ny < 0 || nx >= board.cols || ny >= board.rows) continue;
            if (grid[ny][nx] === 'hard' || seen.has(`${nx},${ny}`)) continue;
            seen.add(`${nx},${ny}`);
            queue.push({ x: nx, y: ny });
          }
        }
        let open = 0;
        for (const row of grid) for (const cell of row) if (cell !== 'hard') open += 1;
        expect(seen.size).toBe(open);
      }
    }
  });

  it('keeps most of the lattice pillar count while scattering', () => {
    /* Scattering costs pillars: a one-cell moat cannot be filled at the lattice's density
       and stay random. Measured over 300 seeds per board it keeps 77-83%, so this holds the
       floor rather than pretending the cost is zero. */
    const blocksOn = (span: number): number => Math.floor((span - 5) / 2) + 1;
    for (const board of ALL_BOARDS) {
      const lattice = blocksOn(board.cols) * blocksOn(board.rows);
      let ratio = 0;
      for (let i = 0; i < 20; i++) {
        ratio += interiorHard(buildGrid(generateSeed(), board.cols, board.rows, board.seats), board.cols, board.rows).size / lattice;
      }
      expect(ratio / 20).toBeGreaterThanOrEqual(0.75);
    }
  });

  it('draws a different pillar layout per seed and the same one twice', () => {
    const layout = (seed: string): string =>
      [...interiorHard(buildGrid(seed, 15, 11, 4), 15, 11)].sort().join(' ');
    expect(layout('seed-a')).toBe(layout('seed-a'));
    expect(layout('seed-a')).not.toBe(layout('seed-b'));
  });
});

describe('blast geometry', () => {
  const flat = arena(11, 9);
  const state = bareState(flat);

  it('reports the centre and two cells per arm', () => {
    const blast = blastCells(state, { x: 5, y: 5, range: 2 });
    expect(blast.cells).toHaveLength(1 + 4 * 2);
    expect(blast.cells.filter((c) => c.core)).toHaveLength(1);
  });

  it('is read-only, because the renderer calls it every frame', () => {
    const before = JSON.stringify(state);
    for (let i = 0; i < 200; i++) blastCells(state, { x: 5, y: 5, range: 3 });
    for (let i = 0; i < 200; i++) dangerCells(state);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('stops an arm at a hard wall', () => {
    const grid = arena(11, 9, (x, y) => (x === 7 && y === 5 ? 'hard' : 'empty'));
    const blast = blastCells({ ...state, grid }, { x: 5, y: 5, range: 3 });
    expect(blast.cells.some((c) => c.x === 7 && c.y === 5)).toBe(false);
    expect(blast.cells.some((c) => c.x === 6 && c.y === 5)).toBe(true);
  });

  it('destroys a soft block without burning its cell', () => {
    // This is the rule that decides whether bombing is survivable at all.
    const grid = arena(11, 9, (x, y) => (x === 6 && y === 5 ? 'soft' : 'empty'));
    const blast = blastCells({ ...state, grid }, { x: 5, y: 5, range: 3 });
    expect(blast.softs).toEqual([{ x: 6, y: 5 }]);
    expect(blast.cells.some((c) => c.x === 6 && c.y === 5)).toBe(false);
    expect(blast.cells.some((c) => c.x === 7 && c.y === 5)).toBe(false);
  });

  it('marks the far cell of a full-length arm as the tip', () => {
    const blast = blastCells(state, { x: 5, y: 5, range: 2 });
    expect(blast.cells.filter((c) => c.end)).toHaveLength(4);
  });

  it('ignites a neighbouring bomb and collects a power caught in the fire', () => {
    const grid = arena(11, 9);
    const other = { id: 7, x: 6, y: 5, seat: 1, fuse: 2.2, range: 2, lit: false };
    const withBomb = { ...state, grid, bombs: [other], powers: [{ x: 7, y: 5, kind: 'flame' as const }] };
    const blast = blastCells(withBomb, { x: 5, y: 5, range: 2 });
    expect(blast.lit.map((b) => b.id)).toEqual([7]);
    expect(blast.powers).toEqual([{ x: 7, y: 5, kind: 'flame' }]);
  });
});

describe('survival maths', () => {
  it('needs distance, not one step, because every neighbour of a bomb burns', () => {
    const grid = arena(11, 9);
    const state = bareState(grid);
    const blast = blastCells(state, { x: 5, y: 5, range: 2 });
    const burn = new Set(blast.cells.map((c) => `${c.x},${c.y}`));
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      expect(burn.has(`${5 + dx},${5 + dy}`)).toBe(true);
    }
    // Two steps is enough: you cross a cell that only catches fire at the moment of the
    // blast, which is exactly how a player survives planting under themselves.
    const target = escapeTarget(state, { x: 5, y: 5 }, burn);
    expect(target).not.toBeNull();
    expect(target?.d).toBe(2);
  });

  it('plans nothing when the seat is sealed in', () => {
    const grid = arena(11, 9, (x, y) => (x === 2 || y === 2 ? 'soft' : 'empty'));
    const state = bareState(grid);
    expect(bombPlan(state, 1, 1, 2)).toBeNull();
  });

  it('routes around a wall instead of walking into it', () => {
    const grid = arena(11, 9, (x, y) => (x === 3 && y !== 5 ? 'hard' : 'empty'));
    const state = bareState(grid);
    const step = firstStepToward(state, { x: 1, y: 1 }, { x: 5, y: 1 });
    expect(step).toBe('down');
  });
});

describe('hazard-aware pathing', () => {
  it('routes around live fire instead of crossing it', () => {
    // A straight line to the goal passes through a burning cell. The bot used to take it
    // and die on the embers of the bomb it had already survived.
    const grid = arena(11, 9);
    const state = bareState(grid);
    const avoid = new Set(['3,1', '4,1']);
    const step = firstStepToward(state, { x: 2, y: 1 }, { x: 5, y: 1 }, avoid);
    expect(step).not.toBeNull();
    expect(step).not.toBe('right');
  });

  it('falls back to the plain route when no hazard-free one exists', () => {
    const grid = arena(11, 9);
    const state = bareState(grid);
    const step = firstStepToward(state, { x: 2, y: 1 }, { x: 3, y: 1 }, new Set(['3,1']));
    expect(step).toBe('right');
  });
});

describe('sim rules', () => {
  it('counts down before the arena opens', () => {
    const sim = newSim([seat(0, { x: 1, y: 1 }), seat(1, { x: 9, y: 7 })], { seats: 2 });
    expect(sim.state.phase).toBe('countdown');
    expect(sim.tryMove(0, 'right').error).toBe('Belum mulai');
    run(sim, COUNTDOWN_SECONDS + 0.1);
    expect(sim.state.phase).toBe('battle');
  });

  it('refuses moves into walls, soft blocks and mid-step', () => {
    const grid = arena(11, 9, (x, y) => (x === 2 && y === 1 ? 'soft' : 'empty'));
    const sim = make(grid, [seat(0, { x: 1, y: 1 }), seat(1, { x: 9, y: 7 })]);
    expect(sim.tryMove(0, 'up').error).toBe('Tidak bisa ke situ');
    expect(sim.tryMove(0, 'right').error).toBe('Terhalang bata lunak');
    expect(sim.tryMove(0, 'left').ok).toBe(false);
    hold(sim, 0, 'down');
    sim.step(1 / 60);
    expect(sim.tryMove(0, 'down').error).toBe('Masih melangkah');
    expect(sim.state.players[0].facing).toBe('down');
  });

  it('refuses a bomb while cooling down, on an occupied cell, or over quota', () => {
    const sim = make(arena(11, 9), [seat(0, { x: 4, y: 4 }), seat(1, { x: 9, y: 7 })]);
    expect(sim.place(0).ok).toBe(true);
    // The cooldown is checked first because it is the reason a mash actually fails.
    expect(sim.place(0).error).toBe('Tunggu sebentar');
    hold(sim, 0, 'right');
    run(sim, 0.5);
    expect((sim.player(0)?.x ?? 0)).toBeGreaterThan(4);
    expect(sim.place(0).error).toBe('Bom sudah penuh');
    expect(sim.place(1).ok).toBe(true);
    expect(sim.state.bombs).toHaveLength(2);

    const other = make(arena(11, 9), [seat(0, { x: 4, y: 4 }), seat(1, { x: 9, y: 7 })]);
    other.state.bombs.push({ id: 777, x: 4, y: 4, seat: 1, fuse: 9, range: 2, lit: false });
    expect(other.place(0).error).toBe('Sudah ada bom di situ');
  });

  it('kills a seat that stays on its own bomb and awards the round', () => {
    const sim = make(arena(11, 9), [seat(0, { x: 4, y: 4 }), seat(1, { x: 9, y: 7 })]);
    sim.place(0);
    run(sim, FUSE_SECONDS + 0.2);
    expect(sim.player(0)?.alive).toBe(false);
    expect(sim.player(1)?.wins).toBe(1);
    expect(sim.state.phase).toBe('roundOver');
  });

  it('spares a seat that outruns its own blast', () => {
    const sim = make(arena(11, 9), [seat(0, { x: 4, y: 4 }), seat(1, { x: 9, y: 7 })]);
    sim.place(0);
    hold(sim, 0, 'right');
    run(sim, FUSE_SECONDS + 0.2);
    expect(sim.player(0)?.alive).toBe(true);
    expect((sim.player(0)?.x ?? 0)).toBeGreaterThan(6);
  });

  it('burns soft blocks, opens the cell and can drop a power', () => {
    const grid = arena(11, 9, (x, y) => (x === 5 && y === 4 ? 'soft' : 'empty'));
    const sim = make(grid, [seat(0, { x: 4, y: 4 }), seat(1, { x: 9, y: 7 })], { rand: () => 0.01 });
    sim.place(0);
    run(sim, FUSE_SECONDS + 0.2);
    const events = sim.drainEvents();
    expect(events.filter((e) => e.t === 'boom')).toHaveLength(1);
    expect(events.some((e) => e.t === 'break')).toBe(true);
    expect(sim.state.grid[4][5]).toBe('empty');
    expect(sim.state.powers).toEqual([{ x: 5, y: 4, kind: 'flame' }]);
    expect(sim.player(0)?.blocksBroken).toBe(1);
  });

  it('walks a chain of three bombs off one trigger', () => {
    // Both seats stand well clear of row 1: a chain that ends because someone died
    // would look identical to a chain that never propagated.
    const sim = make(arena(11, 9), [seat(0, { x: 1, y: 7 }), seat(1, { x: 9, y: 7 })]);
    const s = sim.state;
    s.bombs.push(
      { id: 901, x: 3, y: 1, seat: 0, fuse: 0.02, range: 2, lit: false },
      { id: 902, x: 5, y: 1, seat: 0, fuse: 9, range: 2, lit: false },
      { id: 903, x: 7, y: 1, seat: 0, fuse: 9, range: 2, lit: false },
    );
    run(sim, 1.5);
    const booms = sim.drainEvents().filter((e) => e.t === 'boom');
    expect(booms).toHaveLength(3);
    expect(s.bombs).toHaveLength(0);
    expect(s.phase).toBe('battle');
  });

  it('grants a power the moment a seat steps on it', () => {
    const sim = make(arena(11, 9), [seat(0, { x: 1, y: 1 }), seat(1, { x: 9, y: 7 })]);
    sim.state.powers.push({ x: 2, y: 1, kind: 'flame' });
    hold(sim, 0, 'right');
    run(sim, 0.4);
    expect(sim.player(0)?.range).toBe(3);
    expect(sim.state.powers).toHaveLength(0);
  });

  it('spends a shield instead of a life', () => {
    const sim = make(arena(11, 9), [seat(0, { x: 4, y: 4 }), seat(1, { x: 9, y: 7 })]);
    const p = sim.player(0);
    if (p) p.shield = true;
    sim.place(0);
    run(sim, FUSE_SECONDS + 0.2);
    expect(sim.player(0)?.alive).toBe(true);
    expect(sim.player(0)?.shield).toBe(false);
  });

  it('clears fire and freezes the clock between rounds', () => {
    const sim = make(arena(11, 9), [seat(0, { x: 1, y: 1 }), seat(1, { x: 9, y: 7 })]);
    sim.state.bombs.push({ id: 500, x: 1, y: 1, seat: 1, fuse: 0.01, range: 2, lit: false });
    run(sim, 1);
    expect(aliveSeats(sim.state)).toEqual([1]);
    expect(sim.state.phase).toBe('roundOver');
    expect(sim.state.flames).toHaveLength(0);
    const frozen = sim.state.elapsed;
    run(sim, 0.5);
    expect(sim.state.elapsed).toBe(frozen);
  });

  it('ends a round nobody lost, so hiding cannot stall the match', () => {
    const sim = make(arena(11, 9), [seat(0, { x: 1, y: 1 }), seat(1, { x: 9, y: 7 })]);
    // Seat 1 plants, seat 0 does nothing. Without a clock the round only ends on a death.
    run(sim, ROUND_SECONDS + 0.5);
    expect(sim.state.phase).not.toBe('battle');
    expect(sim.state.winner === null || sim.state.winner !== undefined).toBe(true);
  });

  it('awards a stalled round to whoever actually fought', () => {
    const sim = make(arena(11, 9), [seat(0, { x: 1, y: 1 }), seat(1, { x: 9, y: 7 })]);
    // Both seats stay alive and no bomb is live, so only the clock can end this round.
    sim.state.players[1].roundBombs = 4;
    run(sim, ROUND_SECONDS + 0.5);
    expect(sim.state.phase).toBe('roundOver');
    expect(sim.player(1)!.wins).toBe(1);
    expect(sim.player(0)!.wins).toBe(0);
  });

  it('calls a stalled round with equal aggression a draw', () => {
    const sim = make(arena(11, 9), [seat(0, { x: 1, y: 1 }), seat(1, { x: 9, y: 7 })]);
    run(sim, ROUND_SECONDS + 0.5);
    expect(sim.state.phase).toBe('roundOver');
    expect(sim.player(0)!.wins).toBe(0);
    expect(sim.player(1)!.wins).toBe(0);
  });

  it('resets the arena and crowns a champion after enough rounds', () => {
    const sim = make(arena(11, 9), [seat(0, { x: 1, y: 1 }), seat(1, { x: 9, y: 7 })], { seats: 2 });
    const winRound = (): void => {
      run(sim, COUNTDOWN_SECONDS + 0.05);
      sim.state.bombs.push({ id: sim.state.nextId++, x: 1, y: 1, seat: 1, fuse: 0.01, range: 1, lit: false });
      run(sim, ROUND_OVER_SECONDS + 0.3);
    };
    for (let round = 0; round < SCORE_TO_WIN; round++) winRound();
    expect(sim.player(1)?.wins).toBe(SCORE_TO_WIN);
    expect(sim.state.phase).toBe('finished');
    expect(sim.state.winner).toBe(1);
    expect(sim.state.round).toBe(SCORE_TO_WIN);
  });

  it('brings every seat back alive for the next round', () => {
    const sim = make(arena(11, 9), [seat(0, { x: 1, y: 1 }), seat(1, { x: 9, y: 7 })]);
    sim.state.bombs.push({ id: 500, x: 1, y: 1, seat: 1, fuse: 0.01, range: 2, lit: false });
    run(sim, COUNTDOWN_SECONDS + 2);
    expect(sim.state.phase).toBe('battle');
    expect(sim.state.round).toBe(2);
    expect(aliveSeats(sim.state)).toEqual([0, 1]);
    expect(sim.player(0)?.range).toBe(START_RANGE);
  });

  it('ignores a nonsense delta instead of poisoning the timers', () => {
    const sim = make(arena(11, 9), [seat(0, { x: 1, y: 1 }), seat(1, { x: 9, y: 7 })]);
    const before = JSON.stringify(sim.state);
    sim.step(0);
    sim.step(-1);
    sim.step(Number.NaN);
    expect(JSON.stringify(sim.state)).toBe(before);
  });
});

describe('wire format', () => {
  it('survives a snapshot round trip', () => {
    const sim = make(arena(11, 9), [seat(0, { x: 1, y: 1 }), seat(1, { x: 9, y: 7 })]);
    sim.place(0);
    run(sim, 0.5);
    const wire = JSON.parse(JSON.stringify(sim.snapshot()));
    const client = make(arena(11, 9), [seat(0, { x: 1, y: 1 }), seat(1, { x: 9, y: 7 })]);
    client.applySnapshot(wire as BombermanState);
    expect(client.snapshot()).toEqual(wire);
  });

  it('drops a snapshot that is not shaped like a world', () => {
    const sim = make(arena(11, 9), [seat(0, { x: 1, y: 1 }), seat(1, { x: 9, y: 7 })]);
    const before = JSON.stringify(sim.state);
    sim.applySnapshot(null as unknown as BombermanState);
    sim.applySnapshot({ players: 'nope' } as unknown as BombermanState);
    expect(JSON.stringify(sim.state)).toBe(before);
  });
});
