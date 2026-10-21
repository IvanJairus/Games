import { describe, expect, it } from 'vitest';

import {
  CellKind,
  VENT_SECONDS,
  VENT_WARN_SECONDS,
  spawnCells,
  spawnClearance,
} from '@/games/bomberman/engine/types';
import { dangerCells } from '@/games/bomberman/engine/blast';
import { BombermanSim, SeatConfig, newSim } from '@/games/bomberman/engine/sim';

const arena = (cols: number, rows: number): CellKind[][] =>
  Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x): CellKind => (x === 0 || y === 0 || x === cols - 1 || y === rows - 1 ? 'hard' : 'empty')),
  );

const seat = (n: number, x: number, y: number): SeatConfig => ({
  seat: n,
  name: `P${n}`,
  charId: 'robo',
  bot: false,
  home: { x, y },
});

const stone = (): BombermanSim =>
  newSim([seat(0, 1, 1), seat(1, 9, 7)], {
    grid: arena(11, 9),
    seats: 2,
    phase: 'battle',
    seed: 'vents',
    floor: 'stone',
    rand: () => 0.37,
  });

const run = (sim: BombermanSim, seconds: number): void => {
  for (let i = 0; i < Math.round(seconds * 60); i++) sim.step(1 / 60);
};

describe('stone vents', () => {
  it('places vents on open floor away from every spawn', () => {
    const sim = stone();
    const spawns = spawnCells(11, 9, 2);
    const cleared = new Set(spawns.flatMap((s) => spawnClearance(s)).map((c) => `${c.x},${c.y}`));

    expect(sim.state.vents.length).toBeGreaterThanOrEqual(2);
    for (const v of sim.state.vents) {
      expect(sim.state.grid[v.y][v.x]).toBe('empty');
      expect(cleared.has(`${v.x},${v.y}`)).toBe(false);
    }
  });

  it('leaves the other floors without vents', () => {
    const sim = newSim([seat(0, 1, 1), seat(1, 9, 7)], {
      grid: arena(11, 9),
      seats: 2,
      phase: 'battle',
      seed: 'vents',
      floor: 'grass',
      rand: () => 0.37,
    });
    expect(sim.state.vents).toEqual([]);
    run(sim, VENT_SECONDS + 0.2);
    expect(sim.state.flames).toEqual([]);
  });

  it('burns the seat standing on a vent when it fires', () => {
    const sim = stone();
    const v = sim.state.vents[0];
    const p = sim.player(1)!;
    p.x = v.x;
    p.y = v.y;
    p.ax = v.x;
    p.ay = v.y;
    sim.state.vent = 0.01;
    run(sim, 0.1);

    expect(sim.player(1)?.alive).toBe(false);
    expect(sim.state.vent).toBeGreaterThan(VENT_SECONDS - 1);
  });

  it('warns before the eruption by marking the vents as danger', () => {
    const sim = stone();
    sim.state.vent = VENT_WARN_SECONDS - 0.2;
    const danger = dangerCells(sim.state);
    for (const v of sim.state.vents) expect(danger.has(`${v.x},${v.y}`)).toBe(true);

    sim.state.vent = VENT_WARN_SECONDS + 1;
    const calm = dangerCells(sim.state);
    for (const v of sim.state.vents) expect(calm.has(`${v.x},${v.y}`)).toBe(false);
  });
});
