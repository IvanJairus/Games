import type { Facing } from './types';

export type PadAxis = 'h' | 'v' | null;

/**
 * Resolves a thumb drag into one of the four board directions and keeps that choice
 * stable.
 *
 * The arena only has four directions, so a diagonal push has to become one of them.
 * Taking the larger axis outright makes the answer flip on a pixel of jitter near 45
 * degrees, and the character steps one cell up, one cell right, and reads as lost. Once
 * an axis is chosen the other has to beat it by `lock` before the answer changes.
 */
export function resolvePadAxis(
  dx: number,
  dy: number,
  locked: PadAxis,
  lock: number,
): { dir: Facing | null; axis: PadAxis } {
  const horizontal = Math.abs(dx);
  const vertical = Math.abs(dy);

  let axis = locked;
  if (axis === 'h' && vertical > horizontal * lock) axis = 'v';
  else if (axis === 'v' && horizontal > vertical * lock) axis = 'h';
  else if (!axis) axis = horizontal >= vertical ? 'h' : 'v';

  const dir: Facing = axis === 'h' ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  return { dir, axis };
}
