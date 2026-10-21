import { describe, expect, it } from 'vitest';

import {
  CellKind,
  Coord,
  FUSE_SECONDS,
  ROUND_OVER_SECONDS,
  COUNTDOWN_SECONDS,
  type PowerKind,
} from '@/games/bomberman/engine/types';
import { BombermanSim, SeatConfig, newSim } from '@/games/bomberman/engine/sim';

const arena = (cols: number, rows: number, fill: (x: number, y: number) => CellKind = () => 'empty'): CellKind[][] =>
  Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x): CellKind => {
      if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) return 'hard';
      return fill(x, y);
    }),
  );

const seat = (n: number, home: Coord, extra: Partial<SeatConfig> = {}): SeatConfig => ({
  seat: n,
  name: `P${n}`,
  charId: 'robo',
  bot: false,
  home,
  ...extra,
});

const make = (grid: CellKind[][], players: SeatConfig[]): BombermanSim =>
  newSim(players, {
    grid,
    seats: Math.max(2, players.length),
    phase: 'battle',
    seed: 'powers',
    floor: 'grass',
    rand: () => 0.99,
  });

const run = (sim: BombermanSim, seconds: number, dt = 1 / 60): void => {
  for (let i = 0; i < Math.round(seconds / dt); i++) sim.step(dt);
};

const flamesOf = (sim: BombermanSim): string[] => sim.state.flames.map((f) => `${f.x},${f.y}`);

describe('kick', () => {
  it('pushes the bomb one cell and takes the cell it left', () => {
    const sim = make(arena(11, 9), [seat(0, { x: 3, y: 4 }), seat(1, { x: 9, y: 7 })]);
    sim.player(0)!.kick = true;
    sim.state.bombs.push({ id: 1, x: 4, y: 4, seat: 1, fuse: FUSE_SECONDS, range: 2, lit: false });

    expect(sim.tryMove(0, 'right')).toEqual({ ok: true });
    run(sim, 0.4);

    expect(sim.player(0)?.x).toBe(4);
    expect(sim.state.bombs[0].x).toBe(5);
  });

  it('refuses the push when the far side is wall', () => {
    const grid = arena(11, 9, (x, y) => (x === 5 && y === 4 ? 'hard' : 'empty'));
    const sim = make(grid, [seat(0, { x: 3, y: 4 }), seat(1, { x: 9, y: 7 })]);
    sim.player(0)!.kick = true;
    sim.state.bombs.push({ id: 1, x: 4, y: 4, seat: 1, fuse: FUSE_SECONDS, range: 2, lit: false });

    const result = sim.tryMove(0, 'right');

    expect(result.ok).toBe(false);
    expect(sim.player(0)?.x).toBe(3);
    expect(sim.state.bombs[0].x).toBe(4);
  });

  it('is a wall without the power', () => {
    const sim = make(arena(11, 9), [seat(0, { x: 3, y: 4 }), seat(1, { x: 9, y: 7 })]);
    sim.state.bombs.push({ id: 1, x: 4, y: 4, seat: 1, fuse: FUSE_SECONDS, range: 2, lit: false });

    expect(sim.tryMove(0, 'right').ok).toBe(false);
    expect(sim.state.bombs[0].x).toBe(4);
  });
});

describe('remote', () => {
  it('fires the planted bomb on the next press instead of planting another', () => {
    const sim = make(arena(11, 9), [seat(0, { x: 4, y: 4 }), seat(1, { x: 9, y: 7 })]);
    sim.player(0)!.remote = true;
    sim.player(0)!.maxBombs = 3;

    expect(sim.place(0).ok).toBe(true);
    expect(sim.state.bombs).toHaveLength(1);
    const fuse = sim.state.bombs[0].fuse;

    expect(sim.place(0).ok).toBe(true);
    expect(sim.state.bombs).toHaveLength(1);
    expect(sim.state.bombs[0].lit).toBe(true);
    expect(sim.state.bombs[0].fuse).toBeLessThan(fuse);

    run(sim, 0.2);
    expect(sim.state.bombs).toHaveLength(0);
    // Standing on the bomb when it fires is the point of the test: the seat dies, which
    // is what proves the press detonated instead of planting a second bomb.
    expect(sim.player(0)?.alive).toBe(false);
    expect(sim.state.phase).toBe('roundOver');
  });

  it('plants normally when no bomb is out yet', () => {
    const sim = make(arena(11, 9), [seat(0, { x: 4, y: 4 }), seat(1, { x: 9, y: 7 })]);
    sim.player(0)!.remote = true;
    expect(sim.place(0).ok).toBe(true);
    expect(sim.state.bombs).toHaveLength(1);
  });
});

describe('pierce', () => {
  const board = (): CellKind[][] => arena(11, 9, (x, y) => (x === 5 && y === 4 ? 'soft' : 'empty'));

  /* The bomb is pushed onto the floor rather than planted at a seat's feet: a seat that
     dies in its own blast ends the round, and ending the round clears the flames this
     test needs to read. */
  const blast = (pierce: boolean): BombermanSim => {
    const sim = make(board(), [seat(0, { x: 1, y: 1 }), seat(1, { x: 9, y: 7 })]);
    sim.player(0)!.pierce = pierce;
    sim.state.bombs.push({ id: 1, x: 4, y: 4, seat: 0, fuse: 0.01, range: 3, lit: false });
    run(sim, 0.12);
    return sim;
  };

  it('destroys the brick and keeps the arm going', () => {
    const sim = blast(true);

    expect(sim.state.grid[4][5]).toBe('empty');
    expect(flamesOf(sim)).toContain('6,4');
  });

  it('stops at the brick without the power', () => {
    const sim = blast(false);

    expect(sim.state.grid[4][5]).toBe('empty');
    expect(flamesOf(sim)).not.toContain('6,4');
  });
});

describe('pickups', () => {
  const take = (kind: PowerKind): BombermanSim => {
    const sim = make(arena(11, 9), [seat(0, { x: 4, y: 4 }), seat(1, { x: 9, y: 7 })]);
    sim.state.powers.push({ x: 4, y: 4, kind });
    sim.step(1 / 60);
    return sim;
  };

  it('grants each new power to the seat standing on it', () => {
    expect(take('kick').player(0)?.kick).toBe(true);
    expect(take('remote').player(0)?.remote).toBe(true);
    expect(take('pierce').player(0)?.pierce).toBe(true);
  });

  it('does not leave the new powers behind at the start of the next round', () => {
    const sim = make(arena(11, 9), [seat(0, { x: 1, y: 1 }), seat(1, { x: 9, y: 7 })]);
    sim.player(0)!.kick = true;
    sim.player(0)!.remote = true;
    sim.player(0)!.pierce = true;
    sim.state.bombs.push({ id: 500, x: 1, y: 1, seat: 1, fuse: 0.01, range: 2, lit: false });
    run(sim, ROUND_OVER_SECONDS + COUNTDOWN_SECONDS + 0.2);

    expect(sim.state.phase).toBe('battle');
    const p = sim.player(0)!;
    expect([p.kick, p.remote, p.pierce]).toEqual([false, false, false]);
  });
});

describe('pickup art', () => {
  it('has a glyph for every power that can drop', async () => {
    const { POWER_KINDS, powerMarkup, powerLabel } = await import('@/games/bomberman/sprites');
    expect(POWER_KINDS).toHaveLength(7);
    for (const kind of POWER_KINDS) {
      expect(powerMarkup(kind)).toContain('<svg');
      expect(powerLabel(kind).length).toBeGreaterThan(0);
    }
  });
});
