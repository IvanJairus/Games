/**
 * Snapshot interpolation for remote brawlers.
 *
 * The host speaks at 30 Hz and the screen draws at 60. Extrapolating forward from the last
 * report guesses, and a guess overshoots on a charged knockback and then snaps back when the
 * next report lands. Drawing a tick or so in the past instead interpolates between two
 * states that are already known, so a fast body bends instead of jumping.
 */

/**
 * How far behind real time a remote brawler is drawn. One and a half host ticks: enough
 * that a packet delayed by a few tens of milliseconds still lands before the playhead
 * reaches it. It is also the second half of the lag-compensation window, because this is
 * the delay the attacker was looking through when they pressed the button.
 */
export const REMOTE_DELAY_SECONDS = 0.05;

export interface SnapshotSample {
  /** Local receive time, seconds. */
  t: number;
  x: number;
  z: number;
}

export interface Interpolated {
  x: number;
  z: number;
  /** True while the renderer is holding the newest sample because time ran past it. */
  stale: boolean;
}

export class SnapshotBuffer {
  private samples: SnapshotSample[] = [];

  constructor(
    private readonly delay = REMOTE_DELAY_SECONDS,
    /** Older than the render window is dead weight. */
    private readonly max = 16
  ) {}

  push(t: number, x: number, z: number): void {
    if (!Number.isFinite(t) || !Number.isFinite(x) || !Number.isFinite(z)) return;
    const last = this.samples[this.samples.length - 1];
    // Identical consecutive reports add nothing and would flatten the interpolation.
    if (last && last.x === x && last.z === z) return;
    this.samples.push({ t, x, z });
    if (this.samples.length > this.max) this.samples.shift();
  }

  reset(): void {
    this.samples.length = 0;
  }

  /** Where to draw at `now`, or null before the first report arrives. */
  sample(now: number): Interpolated | null {
    const buf = this.samples;
    if (!buf.length) return null;

    const target = now - this.delay;
    if (target <= buf[0].t) return { x: buf[0].x, z: buf[0].z, stale: false };

    const newest = buf[buf.length - 1];
    if (target >= newest.t) return { x: newest.x, z: newest.z, stale: true };

    for (let i = buf.length - 2; i >= 0; i -= 1) {
      const a = buf[i];
      const b = buf[i + 1];
      if (target >= a.t && target <= b.t) {
        const span = b.t - a.t;
        const k = span > 0 ? (target - a.t) / span : 1;
        return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, stale: false };
      }
    }

    return { x: newest.x, z: newest.z, stale: true };
  }
}
