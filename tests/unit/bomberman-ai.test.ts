import { describe, expect, it } from 'vitest';

import { BOARDS, BoardConfig, Facing, InputState, aliveSeats } from '@/games/bomberman/engine/types';
import { BombermanSim, SeatConfig, newSim } from '@/games/bomberman/engine/sim';
import { BombermanBot, BotLevel } from '@/games/bomberman/engine/ai';

/** Deterministic so a failure on CI reproduces from the seed printed in the log. */
const lcg = (start: number) => {
  let s = start >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const CHARS = ['robo', 'tupai', 'radar', 'biskuit', 'lampu', 'sekrup'];

interface MatchReport {
  seed: number;
  board: string;
  seconds: number;
  finished: boolean;
  winner: number | null;
  bombs: number[];
  broken: number[];
  lives: number[];
  koByOwnBomb: number;
}

const playMatch = (board: BoardConfig, levels: BotLevel[], seed: number, seconds: number): MatchReport => {
  const rand = lcg(seed);
  const players: SeatConfig[] = Array.from({ length: board.seats }, (_, i) => ({
    seat: i,
    name: `Bot ${i + 1}`,
    charId: CHARS[i % CHARS.length],
    bot: true,
  }));
  const sim: BombermanSim = newSim(players, { seats: board.seats, seed: `soak-${seed}`, rand });
  const brains = players.map((p, i) => new BombermanBot(p.seat, levels[i % levels.length]));
  const dt = 1 / 60;
  const ownBombs = new Map<number, { x: number; y: number }>();

  let t = 0;
  while (t < seconds && sim.state.phase !== 'finished') {
    t += dt;
    brains.forEach((brain, i) => {
      const input: InputState = brain.update(sim.state, dt, rand);
      if (input.bomb) {
        const p = sim.state.players[i];
        ownBombs.set(i, { x: p.x, y: p.y });
      }
      sim.setInput(players[i].seat, input);
    });
    sim.step(dt);

    for (const p of sim.state.players) {
      expect(Number.isFinite(p.ax) && Number.isFinite(p.ay)).toBe(true);
      expect(sim.state.grid[p.y]?.[p.x]).not.toBe('hard');
      expect(sim.state.grid[p.y]?.[p.x]).not.toBe('soft');
    }
    for (const p of sim.state.players) {
      expect(sim.state.bombs.filter((b) => b.seat === p.seat).length).toBeLessThanOrEqual(p.maxBombs);
    }
  }

  const koByOwnBomb = sim.state.players.filter((p) => {
    if (p.alive) return false;
    const last = ownBombs.get(p.seat);
    return !!last && last.x === p.x && last.y === p.y;
  }).length;

  return {
    seed,
    board: board.seats === 2 ? 'duel' : 'freeFor',
    seconds: Number(t.toFixed(1)),
    finished: sim.state.phase === 'finished',
    winner: sim.state.winner,
    bombs: sim.state.players.map((p) => p.bombsPlaced),
    broken: sim.state.players.map((p) => p.blocksBroken),
    lives: sim.state.players.map((p) => (p.alive ? 1 : 0)),
    koByOwnBomb,
  };
};

/** Six matches per config keeps the worker responsive; BM_RUNS raises it for a real soak. */
const RUNS = Number(process.env.BM_RUNS ?? 4);
const SECONDS = Number(process.env.BM_SECONDS ?? 20);
const report = process.env.BM_REPORT === '1';

const summarise = (rows: MatchReport[]) => {
  const sum = (pick: (r: MatchReport) => number[]) => rows.reduce((a, r) => a + pick(r).reduce((x, y) => x + y, 0), 0);
  const seats = rows.length * (rows[0]?.bombs.length ?? 0);
  return {
    matches: rows.length,
    seats,
    avgSeconds: +(rows.reduce((a, r) => a + r.seconds, 0) / Math.max(rows.length, 1)).toFixed(1),
    bombsPerSeat: +(sum((r) => r.bombs) / Math.max(seats, 1)).toFixed(2),
    brokenPerSeat: +(sum((r) => r.broken) / Math.max(seats, 1)).toFixed(2),
    survivalRate: +(sum((r) => r.lives) / Math.max(seats, 1)).toFixed(2),
    ownBombDeaths: rows.reduce((a, r) => a + r.koByOwnBomb, 0),
    finishedRate: +(rows.filter((r) => r.finished).length / Math.max(rows.length, 1)).toFixed(2),
  };
};

const runLevel = (board: BoardConfig, level: BotLevel) => {
  const rows: MatchReport[] = [];
  for (let i = 0; i < RUNS; i++) rows.push(playMatch(board, [level, level, level, level], 1000 + i * 7919, SECONDS));
  if (report) console.log(`[bomberman soak] ${board.seats} seats / ${level}`, JSON.stringify(summarise(rows)));
  return rows;
};

const total = (rows: MatchReport[], pick: (r: MatchReport) => number[]): number =>
  rows.reduce((a, r) => a + pick(r).reduce((x, y) => x + y, 0), 0);

describe('bot soak', () => {
  for (const board of [BOARDS.duel, BOARDS.freeFor]) {
    for (const level of ['santai', 'sedang', 'sempurna'] as BotLevel[]) {
      const rows = runLevel(board, level);

      it(`${board.seats} seats vs ${level}: the arena actually changes`, { timeout: 90_000 }, () => {
        const seats = board.seats * rows.length;
        // Floors are per seat, not per level: 'santai' is designed to bomb rarely, so a
        // shared bar is the only honest way to say "the board is not static".
        expect(total(rows, (r) => r.bombs) / seats).toBeGreaterThanOrEqual(1.5);
        expect(total(rows, (r) => r.broken) / seats).toBeGreaterThanOrEqual(0.5);
      });

      it(`${board.seats} seats vs ${level}: matches run the full clock or crown someone`, { timeout: 90_000 }, () => {
        const short = rows.filter((r) => !r.finished && r.seconds < SECONDS - 1);
        expect(short).toHaveLength(0);
      });
    }
  }

  it('a careful bot does not die on its own bomb, a careless one does', { timeout: 90_000 }, () => {
    const careless = runLevel(BOARDS.duel, 'santai');
    const careful = runLevel(BOARDS.duel, 'sempurna');
    const deaths = (rows: MatchReport[]) => rows.reduce((a, r) => a + r.koByOwnBomb, 0);
    expect(deaths(careful)).toBe(0);
    expect(total(careful, (r) => r.bombs)).toBeGreaterThan(total(careless, (r) => r.bombs));
  });

  it('never leaves a seat standing inside a wall or holding two bombs', { timeout: 90_000 }, () => {
    for (let seed = 1; seed <= 6; seed++) {
      const report = playMatch(BOARDS.freeFor, ['sempurna', 'sedang', 'sempurna', 'sedang'], seed * 31, 20);
      expect(report.board).toBe('freeFor');
      expect(report.bombs.every((b) => b > 0)).toBe(true);
    }
  });

  it('produces the same match twice from one seed', () => {
    const once = playMatch(BOARDS.duel, ['sedang', 'sedang'], 4242, 20);
    const twice = playMatch(BOARDS.duel, ['sedang', 'sedang'], 4242, 20);
    expect(twice).toEqual(once);
  });
});

describe('bot input shape', () => {
  it('holds a direction long enough to cross a cell instead of twitching', () => {
    const sim = newSim(
      [
        { seat: 0, name: 'A', charId: 'robo', bot: true },
        { seat: 1, name: 'B', charId: 'tupai', bot: true },
      ],
      { seats: 2, seed: 'held', phase: 'battle' },
    );
    const brain = new BombermanBot(0, 'sempurna');
    const rand = lcg(99);
    const dirs = new Set<Facing | null>();
    for (let i = 0; i < 120; i++) {
      const input = brain.update(sim.state, 1 / 60, rand);
      dirs.add(input.dir);
      sim.setInput(0, input);
      sim.step(1 / 60);
    }
    expect(dirs.size).toBeGreaterThan(0);
    expect(aliveSeats(sim.state).length).toBeGreaterThan(0);
  });
});
