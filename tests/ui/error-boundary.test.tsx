import { describe, it, expect, vi } from 'vitest';
import { retryChunkLoad } from '@/components/ErrorBoundary';

const CHUNK_ERROR =
  'Failed to fetch dynamically imported module: https://www.ivanjairus.xyz/games/assets/v2/BattleshipLobby-xYmZFIsl.js';
const NOW = 1_700_000_000_000;

describe('recovery from a stale deployment', () => {
  it('reloads once when a chunk from an older build is gone', () => {
    const reload = vi.fn();
    expect(retryChunkLoad(reload, CHUNK_ERROR, 0, NOW)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('leaves an unrelated error to the boundary screen', () => {
    const reload = vi.fn();
    expect(retryChunkLoad(reload, 'Cannot read properties of undefined', 0, NOW)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('refuses a second reload inside the cooldown, so a broken build cannot loop', () => {
    const reload = vi.fn();
    expect(retryChunkLoad(reload, CHUNK_ERROR, NOW - 10_000, NOW)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('tries again once the cooldown has passed', () => {
    const reload = vi.fn();
    expect(retryChunkLoad(reload, CHUNK_ERROR, NOW - 20_001, NOW)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
