/**
 * Where a remote brawler should be drawn between two host snapshots.
 *
 * The host speaks 20 times a second and the screen draws 60. Without this the drawn body
 * creeps toward the last reported point and then jumps when the next one lands, which reads
 * as stutter on every seat that is not the host.
 */

/** Past this the reckoning is a guess, so the body is held instead of flown. */
export const MAX_RECKON = 0.15;

export interface ReckonState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Seconds since the last authoritative report. */
  age: number;
}

export interface ReckonInput {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

/**
 * Feeds one snapshot in, or ages the current one, and returns where the body should be.
 * `maxRadius` keeps a reckoned launch from drawing a brawler standing on the ocean: the
 * host may already have stopped that body against another one.
 */
export function advanceReckon(prev: ReckonState, p: ReckonInput, dt: number, maxRadius: number): { state: ReckonState; x: number; z: number } {
  const reported = p.x !== prev.x || p.z !== prev.z || p.vx !== prev.vx || p.vz !== prev.vz;
  const state: ReckonState = reported
    ? { x: p.x, z: p.z, vx: p.vx, vz: p.vz, age: 0 }
    : { ...prev, age: Math.min(prev.age + dt, MAX_RECKON) };

  let x = state.x + state.vx * state.age;
  let z = state.z + state.vz * state.age;
  const r = Math.hypot(x, z);
  if (r > maxRadius) {
    x *= maxRadius / r;
    z *= maxRadius / r;
  }
  return { state, x, z };
}
