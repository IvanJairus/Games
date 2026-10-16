import { describe, expect, it } from 'vitest';

import { BombermanSim } from '@/games/bomberman/engine/sim';
import { smooth } from '@/games/bomberman/engine/smooth';
import { TICK_MS } from '@/games/bomberman/engine/net';
import type { Facing } from '@/games/bomberman/engine/types';

const seatInfo = (seat: number) => ({ seat, name: `P${seat}`, charId: 'robo', bot: false });

const makeSim = (seats: number): BombermanSim =>
  new BombermanSim({
    seats,
    seed: 'smooth-seed',
    floor: 'grass',
    players: Array.from({ length: seats }, (_, i) => seatInfo(i)),
    phase: 'battle',
  });

/* Mirrors the page: the host branch of the rAF loop only calls step(), the client branch only
   calls smooth(). Frames are 16 ms and the host world is broadcast every TICK_MS. */
const FRAME_MS = 16;
const DIRS: Facing[] = ['right', 'down', 'left', 'up'];
const SIGN: Record<Facing, [number, number]> = {
  right: [1, 0],
  left: [-1, 0],
  up: [0, -1],
  down: [0, 1],
};

interface Trace {
  nFrames: number;
  movingFrames: number;
  snapshotsApplied: number;
  oneFrameStepCells: number;
  retreatFrames: number;
  worstRetreatCells: number;
  worstRetreatInFrameSteps: number;
  largestForwardJumpCells: number;
  largestForwardJumpRatio: number;
  overshoot1_2: number;
  overshoot2: number;
  overshoot4: number;
  overshootOnSnapshotFrames: number;
  overshootOffSnapshotFrames: number;
  worstSnapBackInFrameSteps: number;
  snapBackCount: number;
}

/**
 * Streams one host walking continuously into one client that only smooths. The host turns at the
 * next step boundary when its way is blocked, because a straight walk on a seeded board dies
 * against the first soft block after about two cells and would measure almost nothing.
 */
function stream(preferred: Facing, totalMs: number): Trace {
  const host = makeSim(2);
  const client = makeSim(2);
  let dir = preferred;

  const ax: number[] = [];
  const ay: number[] = [];
  const stepDir: [number, number][] = [];
  const wasSnap: boolean[] = [];
  let nextSnapshot = 0;
  let snapshots = 0;
  let worstSnap = 0;

  for (let ms = 0; ms < totalMs; ms += FRAME_MS) {
    const p = host.state.players[0];
    // Turning only between steps keeps one move in flight, the way a held key does.
    if (!p.step) {
      if (!host.tryMove(p.seat, dir).ok) dir = DIRS[(DIRS.indexOf(dir) + 1) % DIRS.length];
    }
    host.setInput(0, { dir, bomb: false, seq: 0 });
    host.step(FRAME_MS / 1000);

    let snapped = false;
    if (ms >= nextSnapshot) {
      const beforeX = client.state.players[0].ax;
      const beforeY = client.state.players[0].ay;
      client.applySnapshot(host.snapshot());
      nextSnapshot = ms + TICK_MS;
      snapshots += 1;
      snapped = true;
      const c = client.state.players[0];
      const [sx, sy] = c.step ? SIGN[dirOf(c)] : [0, 0];
      if (sx || sy) {
        const back = (beforeX - c.ax) * sx + (beforeY - c.ay) * sy;
        worstSnap = Math.max(worstSnap, back);
      }
    }
    smooth(client.state, FRAME_MS / 1000);
    const c = client.state.players[0];
    ax.push(c.ax);
    ay.push(c.ay);
    stepDir.push(c.step ? SIGN[dirOf(c)] : [0, 0]);
    wasSnap.push(snapped);
  }

  const frameStep = client.state.players[0].speed * (FRAME_MS / 1000);
  let moving = 0;
  let retreats = 0;
  let worstRetreat = 0;
  let largestForward = 0;
  let over12 = 0;
  let over2 = 0;
  let over4 = 0;
  let overOnSnap = 0;
  let overOffSnap = 0;
  for (let i = 1; i < ax.length; i += 1) {
    let [sx, sy] = stepDir[i];
    if (!sx && !sy) [sx, sy] = stepDir[i - 1];
    const signed = (ax[i] - ax[i - 1]) * sx + (ay[i] - ay[i - 1]) * sy;
    if (signed > 0) moving += 1;
    if (signed < 0) {
      retreats += 1;
      worstRetreat = Math.min(worstRetreat, signed);
    } else {
      largestForward = Math.max(largestForward, signed);
    }
    if (signed > frameStep * 1.2) {
      over12 += 1;
      if (signed > frameStep * 2) over2 += 1;
      if (signed > frameStep * 4) over4 += 1;
      if (wasSnap[i]) overOnSnap += 1;
      else overOffSnap += 1;
    }
  }

  const r = (v: number): number => Number(v.toFixed(6));
  return {
    nFrames: ax.length,
    movingFrames: moving,
    snapshotsApplied: snapshots,
    oneFrameStepCells: r(frameStep),
    retreatFrames: retreats,
    worstRetreatCells: r(worstRetreat),
    worstRetreatInFrameSteps: r(worstRetreat / frameStep),
    largestForwardJumpCells: r(largestForward),
    largestForwardJumpRatio: r(largestForward / frameStep),
    overshoot1_2: over12,
    overshoot2: over2,
    overshoot4: over4,
    overshootOnSnapshotFrames: overOnSnap,
    overshootOffSnapshotFrames: overOffSnap,
    worstSnapBackInFrameSteps: r(worstSnap / frameStep),
    snapBackCount: worstSnap > 0 ? 1 : 0,
  };
}

/** The axis a step runs along, read off its own from/to cells. */
function dirOf(p: { step: { fx: number; fy: number; tx: number; ty: number } | null }): Facing {
  const s = p.step;
  if (!s) return 'right';
  if (s.tx !== s.fx) return s.tx > s.fx ? 'right' : 'left';
  return s.ty > s.fy ? 'down' : 'up';
}

describe('remote actor animation on a Bomberman client', () => {
  it('measures the client animated position against 15 Hz snapshots', () => {
    const runs = [2000, 8000].map((totalMs) => ({
      totalMs,
      rows: DIRS.map((dir) => ({ startDir: dir, ...stream(dir, totalMs) })),
    }));

    const all = runs.flatMap((run) => run.rows);
    const sum = (key: keyof Trace): number => all.reduce((acc, row) => acc + (row[key] as number), 0);
    const totals = {
      rows: all.length,
      frames: sum('nFrames'),
      movingFrames: sum('movingFrames'),
      snapshots: sum('snapshotsApplied'),
      retreatFrames: sum('retreatFrames'),
      overshoot1_2: sum('overshoot1_2'),
      overshoot2: sum('overshoot2'),
      overshoot4: sum('overshoot4'),
      overshootOnSnapshotFrames: sum('overshootOnSnapshotFrames'),
      overshootOffSnapshotFrames: sum('overshootOffSnapshotFrames'),
      worstForwardRatio: Math.max(...all.map((row) => row.largestForwardJumpRatio)),
    };

    /* console.log on purpose: this is the measurement asked for by the card, kept in the suite
       output so a later change can be compared against the same numbers. */
    console.log(JSON.stringify({ frameMs: FRAME_MS, tickMs: TICK_MS, totals, runs }, null, 2));

    // Describes what the current implementation does in every row printed above.
    for (const run of runs) {
      for (const row of run.rows) {
        expect(row.retreatFrames).toBe(0);
        expect(row.snapBackCount).toBe(0);
        /* The forward snap is the defect this measurement found, and it only ever lands on a frame
           that applied a snapshot. Both lines are here to be flipped on purpose by the fix card. */
        expect(row.overshoot1_2).toBeGreaterThan(0);
        expect(row.overshootOffSnapshotFrames).toBe(0);
      }
    }
  });
});
