import { getSafeStorage } from '../../../lib/storage';

/** What the player picked. `auto` lets the renderer follow the measured frame rate. */
export type FxMode = 'auto' | 'high' | 'low';
/** What the renderer settled on for this frame budget. */
export type FxLevel = 'high' | 'low';

export const FX_MODE_KEY = 'ij_slap_fx';

export function readFxMode(): FxMode {
  const raw = getSafeStorage().getItem(FX_MODE_KEY);
  return raw === 'high' || raw === 'low' ? raw : 'auto';
}

export function writeFxMode(mode: FxMode): void {
  getSafeStorage().setItem(FX_MODE_KEY, mode);
}

/**
 * WebGL cannot change `antialias` after the context exists, so the mount-time level
 * has to be guessable without a measured frame rate. A narrow viewport is the phone
 * case, where the extra samples cost more than the edge quality buys.
 */
export function levelAtMount(mode: FxMode, viewportWidth: number): FxLevel {
  if (mode !== 'auto') return mode;
  return viewportWidth < 720 ? 'low' : 'high';
}

/**
 * Every visual flourish the player can switch off reads exactly one field here, so a
 * new effect cannot quietly escape the toggle.
 */
export interface FxGates {
  shake: boolean;
  particles: boolean;
  /** Multiplies burst counts; low keeps a stub impact instead of none at all. */
  particleScale: number;
  hitFreezeMs: number;
  outlines: boolean;
  shadows: boolean;
  /** Full charge wind-up, including the tremble at the end of a hold. */
  windup: boolean;
  maxPixelRatio: number;
  antialias: boolean;
  popTextMax: number;
  /** Low skips every other name tag, which is the cheapest per-frame DOM write left. */
  labelEveryFrame: boolean;
}

const GATES: Record<FxLevel, FxGates> = {
  high: {
    shake: true,
    particles: true,
    particleScale: 1,
    hitFreezeMs: 60,
    outlines: true,
    shadows: true,
    windup: true,
    maxPixelRatio: 1.5,
    antialias: true,
    popTextMax: 4,
    labelEveryFrame: true,
  },
  low: {
    shake: false,
    particles: false,
    particleScale: 0.34,
    hitFreezeMs: 0,
    outlines: false,
    shadows: false,
    windup: false,
    maxPixelRatio: 1,
    antialias: false,
    popTextMax: 1,
    labelEveryFrame: false,
  },
};

export function fxGates(level: FxLevel): FxGates {
  return GATES[level];
}
