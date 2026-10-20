import { describe, expect, it } from 'vitest';

import { SnapshotBuffer } from '@/games/slap-arena/engine/interpolate';

describe('SnapshotBuffer', () => {
  it('returns null until the first report lands', () => {
    const buf = new SnapshotBuffer();
    expect(buf.sample(1)).toBeNull();
  });

  it('holds the oldest sample when the playhead has not reached it', () => {
    const buf = new SnapshotBuffer(0.1);
    buf.push(1, 2, 3);
    expect(buf.sample(1)).toEqual({ x: 2, z: 3, stale: false });
  });

  it('interpolates between two known states instead of guessing', () => {
    const buf = new SnapshotBuffer(0.1);
    buf.push(1.0, 0, 0);
    buf.push(1.2, 10, 0);
    // Playhead at 1.1 -> exactly halfway between the two reports.
    const mid = buf.sample(1.2);
    expect(mid?.stale).toBe(false);
    expect(mid?.x).toBeCloseTo(5, 5);
    expect(mid?.z).toBeCloseTo(0, 5);
  });

  it('holds the newest sample when time runs past it, and says so', () => {
    const buf = new SnapshotBuffer(0.1);
    buf.push(1.0, 0, 0);
    buf.push(1.2, 10, 0);
    const late = buf.sample(5);
    expect(late).toEqual({ x: 10, z: 0, stale: true });
  });

  it('ignores an identical consecutive report so a standing body keeps its span', () => {
    const buf = new SnapshotBuffer(0.1);
    buf.push(1.0, 4, 4);
    buf.push(1.2, 4, 4);
    buf.push(1.4, 8, 4);
    // If the duplicate had been stored, the 1.2 -> 1.4 span would be the only moving one
    // and the playhead at 1.3 would already read 6.
    const mid = buf.sample(1.3);
    expect(mid?.x).toBeGreaterThan(4);
    expect(mid?.x).toBeLessThan(8);
  });

  it('drops samples that fall outside the window', () => {
    const buf = new SnapshotBuffer(0.1, 3);
    for (let i = 0; i < 6; i += 1) buf.push(i, i, 0);
    // Only 3..5 survive; the playhead past the newest holds it.
    expect(buf.sample(5.15)?.x).toBeCloseTo(5, 5);
    expect(buf.sample(0)?.x).toBe(3);
  });

  it('resets cleanly for a new round', () => {
    const buf = new SnapshotBuffer();
    buf.push(1, 1, 1);
    buf.reset();
    expect(buf.sample(1)).toBeNull();
  });
});
