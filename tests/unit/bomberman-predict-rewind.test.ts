import { describe, expect, it } from 'vitest';

import { MovementPredictor } from '@/games/bomberman/engine/predict';
import { BombermanSim } from '@/games/bomberman/engine/sim';
import { smooth } from '@/games/bomberman/engine/smooth';
import type { CellKind } from '@/games/bomberman/engine/types';

const openArena = (cols: number, rows: number): CellKind[][] =>
  Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x): CellKind => (x === 0 || y === 0 || x === cols - 1 || y === rows - 1 ? 'hard' : 'empty')),
  );

const makeSim = (): BombermanSim =>
  new BombermanSim({
    seats: 2,
    seed: 'predict-rewind',
    floor: 'grass',
    phase: 'battle',
    grid: openArena(11, 9),
    players: [
      { seat: 0, name: 'A', charId: 'robo', bot: false, home: { x: 5, y: 4 } },
      { seat: 1, name: 'B', charId: 'tupai', bot: false, home: { x: 9, y: 7 } },
    ],
  });

/** Mirrors the door page: the server frame is smoothed first, then the view is adjusted. */
const frame = (sim: BombermanSim, pred: MovementPredictor, now: number): void => {
  smooth(sim.state, 1 / 60);
  pred.reconcile(sim.state, 0, now);
  pred.apply(sim.state, 0, now);
};

describe('prediction never walks the view backward', () => {
  it('turns on the spot when the player presses the other direction mid-lead', () => {
    const sim = makeSim();
    const pred = new MovementPredictor();
    const p = sim.state.players[0];

    expect(pred.observe(sim.state, 0, 'right', 0)).toBe(true);
    for (let now = 0; now < 60; now += 16) frame(sim, pred, now);
    const ahead = p.ax;
    expect(ahead).toBeGreaterThan(5.2);

    /* A second press while the first step is still only predicted. The server has not
       confirmed the right step, so the view must follow the new direction, not finish the
       old guess and then snap back. */
    pred.observe(sim.state, 0, 'left', 64);
    frame(sim, pred, 80);
    frame(sim, pred, 96);

    expect(p.ax).toBeLessThan(ahead);
  });

  it('does not jump back when the server step is ahead of the drawn lead', () => {
    const sim = makeSim();
    const pred = new MovementPredictor();
    const p = sim.state.players[0];

    pred.observe(sim.state, 0, 'right', 0);
    frame(sim, pred, 16);
    const drawn = p.ax;

    /* A late frame finds the server already deeper into the same step than the view is.
       The view must stay where it is, not be pulled back to the younger prediction. */
    p.step = { fx: 5, fy: 4, tx: 6, ty: 4, t: 0.7 };
    p.ax = 5.7;
    p.ay = 4;
    pred.reconcile(sim.state, 0, 40);
    pred.apply(sim.state, 0, 40);

    expect(p.ax).toBeGreaterThanOrEqual(drawn - 0.001);
  });
});

describe('released taps', () => {
  it('drops a guess the server never applied instead of sliding it back', () => {
    const sim = makeSim();
    const pred = new MovementPredictor();
    const p = sim.state.players[0];

    pred.observe(sim.state, 0, 'right', 0);
    for (let now = 0; now <= 90; now += 16) frame(sim, pred, now);
    expect(p.ax).toBeGreaterThan(5.3);

    pred.release(96);
    // The grace has not passed yet: the server may still have received the press.
    frame(sim, pred, 110);
    expect(p.ax).toBeGreaterThan(5.3);
    // Nobody confirmed it, so the view returns to the cell the server actually holds.
    frame(sim, pred, 260);
    expect(Math.abs(p.ax - p.x)).toBeLessThan(0.001);
  });

  it('still completes a press the server applied just after the key went up', () => {
    const sim = makeSim();
    const pred = new MovementPredictor();
    const p = sim.state.players[0];

    pred.observe(sim.state, 0, 'right', 0);
    for (let now = 0; now <= 48; now += 16) frame(sim, pred, now);
    pred.release(48);

    // The server got the input anyway and starts the matching step inside the grace.
    sim.setInput(0, { dir: 'right', bomb: false, seq: 1 });
    sim.step(1 / 60);
    sim.setInput(0, { dir: null, bomb: false, seq: 2 });
    expect(p.step?.tx).toBe(6);
    for (let now = 64; now <= 400; now += 16) {
      sim.step(1 / 60);
      frame(sim, pred, now);
    }

    expect(p.x).toBe(6);
    expect(p.ax).toBeGreaterThan(5.9);
  });
});
