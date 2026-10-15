/**
 * Effect budget.
 *
 * One field per flourish, so a new effect cannot quietly escape the toggle. The tier
 * is chosen from measured frame rate rather than from screen width: judging a phone by
 * its width put every phone into the emergency tier before it had done anything wrong.
 */

import { getSafeStorage } from '../../../lib/storage';

export type FxMode = 'auto' | 'high' | 'low';
export type FxLevel = 'high' | 'low';

const KEY = 'ij_bomberman_fx';

export function readFxMode(): FxMode {
  const raw = getSafeStorage().getItem(KEY);
  return raw === 'high' || raw === 'low' ? raw : 'auto';
}

export function writeFxMode(mode: FxMode): void {
  getSafeStorage().setItem(KEY, mode);
}

export interface FxGates {
  shake: boolean;
  fragments: number;
  puffs: number;
  ringPop: boolean;
  bob: boolean;
}

const GATES: Record<FxLevel, FxGates> = {
  high: { shake: true, fragments: 5, puffs: 6, ringPop: true, bob: true },
  low: { shake: false, fragments: 0, puffs: 2, ringPop: false, bob: false },
};

export const fxGates = (level: FxLevel): FxGates => GATES[level];

/** Auto starts high and lets the measured frame rate demote it. */
export const levelAtMount = (mode: FxMode): FxLevel => (mode === 'auto' ? 'high' : mode);

export interface FpsController {
  /** Feed one second's frame count. Returns the level after any automatic change. */
  sample(frames: number): FxLevel;
  level: FxLevel;
  autoDropped: boolean;
}

export function createFpsController(
  mode: FxMode,
  start: FxLevel,
  onChange: (level: FxLevel) => void,
): FpsController {
  let level = start;
  let slow = 0;
  let fast = 0;
  let autoDropped = false;
  const drops: number[] = [];

  return {
    get level() {
      return level;
    },
    get autoDropped() {
      return autoDropped;
    },
    sample(frames: number) {
      if (mode !== 'auto') return level;
      if (frames < 44) {
        slow += 1;
        fast = 0;
      } else if (frames > 56) {
        fast += 1;
        slow = 0;
      } else {
        slow = 0;
        fast = 0;
      }
      const now = Date.now();
      // Three demotions in a minute means the trip line sits on what this device
      // actually measures; stop touching quality and leave the player alone.
      const thrashed = drops.filter((t) => now - t < 60_000).length >= 3;
      if (level === 'high' && slow >= 2 && !thrashed) {
        level = 'low';
        autoDropped = true;
        slow = 0;
        drops.push(now);
        onChange(level);
      } else if (level === 'low' && fast >= 6 && autoDropped) {
        level = 'high';
        autoDropped = false;
        fast = 0;
        onChange(level);
      }
      return level;
    },
  };
}
