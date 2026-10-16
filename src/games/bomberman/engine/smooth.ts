import type { BombermanState } from './types';

/**
 * A client keeps advancing its own animation between host frames. Without this a 15 Hz
 * snapshot renders a 6.6 cell/s walk as a visible 15 fps slide.
 */
export function smooth(state: BombermanState, dt: number): void {
  for (const p of state.players) {
    if (!p.step) {
      p.ax = p.x;
      p.ay = p.y;
      continue;
    }
    p.step.t = Math.min(1, p.step.t + dt * p.speed);
    p.ax = p.step.fx + (p.step.tx - p.step.fx) * p.step.t;
    p.ay = p.step.fy + (p.step.ty - p.step.fy) * p.step.t;
  }
}
