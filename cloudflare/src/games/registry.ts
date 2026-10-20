import type { Env, GameAdapter } from '../types';
import { selfTestGame } from './selfTest';

export function createAdapter(code: string, env: Env): GameAdapter | null {
  if (code === 'selftest' && env.TEST_MODE === '1') return selfTestGame();
  return null;
}
