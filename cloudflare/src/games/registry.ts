import type { Env, GameAdapter } from '../types';
import { selfTestGame } from './selfTest';
import { slapArenaGame } from './slapArena';

export function createAdapter(code: string, env: Env): GameAdapter | null {
  if (code === 'slap-arena') return slapArenaGame();
  if (code === 'selftest' && env.TEST_MODE === '1') return selfTestGame();
  return null;
}
