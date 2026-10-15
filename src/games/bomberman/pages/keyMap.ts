import type { Facing } from '../engine/types';

/** Shared by the solo and online pages so both read the same keys. */
export const KEYS: Record<string, Facing> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};
