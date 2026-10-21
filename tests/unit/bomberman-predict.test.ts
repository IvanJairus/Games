import { describe, expect, it } from 'vitest';

import { MovementPredictor } from '@/games/bomberman/engine/predict';
import { BombermanSim } from '@/games/bomberman/engine/sim';
import { smooth } from '@/games/bomberman/engine/smooth';

const makeSim = (phase: 'battle' | 'countdown' = 'battle') =>
  new BombermanSim({
    seats: 2,
    seed: 'predict-seed',
    floor: 'grass',
    phase,
    players: [
      { seat: 0, name: 'A', charId: 'robo', bot: false },
      { seat: 1, name: 'B', charId: 'tupai', bot: false },
    ],
  });

/** Mirrors the page order: smooth the server frame, reconcile, then draw the view. */
const frame = (sim: BombermanSim, pred: MovementPredictor, now: number): void => {
  smooth(sim.state, 1 / 60);
  pred.reconcile(sim.state, 0, now);
  pred.apply(sim.state, 0, now);
};

describe('view-only movement prediction', () => {
  it('starts a lead only for a fresh, walkable step from rest', () => {
    const sim = makeSim();
    const pred = new MovementPredictor();
    const player = sim.state.players[0];
    expect(player.x).toBe(1);
    expect(pred.observe(sim.state, 0, 'up', 0)).toBe(false); // the border
    expect(pred.observe(sim.state, 0, 'right', 0)).toBe(true);
    // A second observation while the lead is alive does not restack.
    expect(pred.observe(sim.state, 0, 'right', 10)).toBe(false);
    expect(pred.observe(sim.state, 0, null, 20)).toBe(false);
  });

  it('shows the step before the server confirms it, without moving the authoritative cell', () => {
    const sim = makeSim();
    const pred = new MovementPredictor();
    const player = sim.state.players[0];
    pred.observe(sim.state, 0, 'right', 0);
    pred.apply(sim.state, 0, 80);
    expect(player.x).toBe(1);
    expect(player.y).toBe(1);
    expect(player.ax).toBeGreaterThan(1.2);
    expect(player.ax).toBeLessThan(1.9);
  });

  it('reconciles to the authoritative step instead of leaving the client ahead', () => {
    const sim = makeSim();
    const pred = new MovementPredictor();
    const player = sim.state.players[0];
    pred.observe(sim.state, 0, 'right', 0);
    pred.apply(sim.state, 0, 100);
    expect(player.ax).toBeGreaterThan(1);

    // The server accepted the same move: the step it owns points at the same target.
    sim.setInput(0, { dir: 'right', bomb: false, seq: 1 });
    sim.step(1 / 60);
    expect(player.step?.tx).toBe(2);

    for (let now = 110; now < 500; now += 16) frame(sim, pred, now);
    // The client never writes `x`; the step target is the authoritative cell this frame animates.
    expect(player.step?.tx ?? player.x).toBe(2);
    expect(Math.abs(player.ax - 2)).toBeLessThan(0.25);
  });

  it('slides back to the server cell when the deadline expires without a move', () => {
    const sim = makeSim();
    const pred = new MovementPredictor();
    const player = sim.state.players[0];
    pred.observe(sim.state, 0, 'right', 0);
    for (let now = 16; now <= 300; now += 16) frame(sim, pred, now);
    // The server never moved; the prediction must not leave the sprite a cell away.
    expect(player.x).toBe(1);
    for (let now = 316; now <= 700; now += 16) frame(sim, pred, now);
    expect(Math.abs(player.ax - player.x)).toBeLessThan(0.05);
  });

  it('never predicts for a dead seat, another phase, or a non-walkable target', () => {
    const countdown = makeSim('countdown');
    const pred = new MovementPredictor();
    expect(pred.observe(countdown.state, 0, 'right', 0)).toBe(false);

    const sim = makeSim();
    sim.state.players[0].alive = false;
    expect(pred.observe(sim.state, 0, 'right', 0)).toBe(false);

    const other = makeSim();
    // Seat 1 starts at the far corner; a prediction for seat 0 must not touch it.
    const before = { ...other.state.players[1] };
    pred.observe(other.state, 0, 'right', 0);
    pred.apply(other.state, 0, 80);
    expect(other.state.players[1].ax).toBe(before.ax);
    expect(other.state.players[1].ay).toBe(before.ay);
  });
});
