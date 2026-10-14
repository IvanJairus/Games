import { describe, it, expect, vi, afterEach } from 'vitest';
import * as supabaseModule from '../../src/lib/supabase';
import { fetchCompletedCounts } from '../../src/games/common/matchStats';
import type { GameType } from '../../src/games/common/multiplayer';

const TYPES: GameType[] = ['slap-arena', 'wall-game', 'tic-tac-toe', 'battleship'];

function fakeRpc(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { client: { rpc }, rpc };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('hub match counts', () => {
  it('takes every game from one call and fills the games that never finished', async () => {
    const { client, rpc } = fakeRpc([
      { game_type: 'slap-arena', completed: '7' },
      { game_type: 'wall-game', completed: 1 },
      { game_type: 'games-from-an-old-migration', completed: 99 },
    ]);
    vi.spyOn(supabaseModule, 'getSupabase').mockReturnValue(client as never);

    const counts = await fetchCompletedCounts(TYPES);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('match_completion_counts');
    expect(counts).toEqual({ 'slap-arena': 7, 'wall-game': 1, 'tic-tac-toe': 0, battleship: 0 });
  });

  it('returns nothing when Supabase is not configured', async () => {
    vi.spyOn(supabaseModule, 'getSupabase').mockReturnValue(null as never);
    await expect(fetchCompletedCounts(TYPES)).resolves.toEqual({});
  });

  it('shows no numbers rather than wrong ones when the call fails', async () => {
    const { client } = fakeRpc(null, { message: 'function does not exist' });
    vi.spyOn(supabaseModule, 'getSupabase').mockReturnValue(client as never);
    await expect(fetchCompletedCounts(TYPES)).resolves.toEqual({});
  });
});
