import { describe, expect, it } from 'vitest';

import { CellKind, Coord } from '@/games/bomberman/engine/types';
import { BombermanSim, SeatConfig, newSim } from '@/games/bomberman/engine/sim';
import { createGame, parseRoomConfig } from '@/games/bomberman/engine/gameApi';

const arena = (cols: number, rows: number): CellKind[][] =>
  Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x): CellKind => (x === 0 || y === 0 || x === cols - 1 || y === rows - 1 ? 'hard' : 'empty')),
  );

const seat = (n: number, home: Coord): SeatConfig => ({ seat: n, name: `P${n}`, charId: 'robo', bot: false, home });

const four = (teams: boolean): BombermanSim =>
  newSim([seat(0, { x: 3, y: 3 }), seat(1, { x: 5, y: 3 }), seat(2, { x: 7, y: 3 }), seat(3, { x: 5, y: 7 })], {
    grid: arena(11, 9),
    seats: 4,
    teams,
    phase: 'battle',
    seed: 'teams',
    floor: 'grass',
    rand: () => 0.99,
  });

const run = (sim: BombermanSim, seconds: number): void => {
  for (let i = 0; i < Math.round(seconds * 60); i++) sim.step(1 / 60);
};

const bombAt = (sim: BombermanSim, x: number, y: number, range = 1): void => {
  sim.state.bombs.push({ id: sim.state.nextId++, x, y, seat: 0, fuse: 0.01, range, lit: false });
};

describe('team mode', () => {
  it('keeps the round going while either team still has a survivor', () => {
    const sim = four(true);
    bombAt(sim, 5, 3);
    run(sim, 0.1);

    expect(sim.player(1)?.alive).toBe(false);
    expect(sim.state.phase).toBe('battle');
    expect(sim.player(0)?.wins).toBe(0);
  });

  it('ends the round for the whole team and scores both members', () => {
    const sim = four(true);
    bombAt(sim, 5, 3);
    run(sim, 0.1);
    bombAt(sim, 5, 7);
    run(sim, 0.1);

    expect(sim.state.phase).toBe('roundOver');
    expect(sim.player(0)?.wins).toBe(1);
    expect(sim.player(2)?.wins).toBe(1);
    expect(sim.player(1)?.wins).toBe(0);
    expect(sim.player(3)?.wins).toBe(0);
  });

  it('lets a teammate stand in the fire, but not in their own', () => {
    const ally = four(true);
    bombAt(ally, 7, 3);
    run(ally, 0.1);
    expect(ally.player(2)?.alive).toBe(true);

    const self = four(true);
    self.state.bombs.push({ id: 9, x: 3, y: 3, seat: 0, fuse: 0.01, range: 1, lit: false });
    run(self, 0.1);
    expect(self.player(0)?.alive).toBe(false);
  });

  it('keeps friendly fire on for a free-for-all', () => {
    const sim = four(false);
    bombAt(sim, 7, 3);
    run(sim, 0.1);
    expect(sim.player(2)?.alive).toBe(false);
  });
});

describe('room options', () => {
  const parse = (query: Record<string, string>) => parseRoomConfig((k) => query[k] ?? null);

  it('carries the team flag for four seats and drops it for a duel', () => {
    expect(parse({ seats: '4', size: 'luas', teams: '1' })).toEqual({
      ok: true,
      config: { seats: 4, size: 'luas', teams: true },
      provided: true,
    });
    expect(parse({ seats: '2', teams: '1' })).toEqual({
      ok: true,
      config: { seats: 2, size: 'kecil', teams: false },
      provided: true,
    });
  });

  it('rejects a team flag that is not a flag', () => {
    expect(parse({ seats: '4', teams: '2' })).toEqual({ ok: false, reason: 'bad_room_options' });
  });

  it('forces the room config through the same rule', () => {
    expect(createGame({ seats: 4, size: 'besar', teams: true }).config.teams).toBe(true);
    expect(createGame({ seats: 2, size: 'besar', teams: true }).config.teams).toBe(false);
  });
});
