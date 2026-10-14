import { describe, it, expect, vi, afterEach } from 'vitest';
import * as supabaseModule from '../../src/lib/supabase';
import { fetchCompletedCounts } from '../../src/games/common/matchStats';
import type { GameType } from '../../src/games/common/multiplayer';

const TYPES: GameType[] = ['slap-arena', 'wall-game', 'tic-tac-toe', 'battleship'];

interface FakeResult {
  count?: number;
  error?: string;
}

/** The chain has to be awaitable at its tail, which is what `then` provides here. */
function fakeClient(perType: Record<string, FakeResult>) {
  const seen: Array<{ table: string; selectArgs: unknown; filters: string[][] }> = [];
  const client = {
    from: (table: string) => {
      const record = { table, selectArgs: null as unknown, filters: [] as string[][] };
      seen.push(record);
      const chain: Record<string, unknown> = {
        select: (...args: unknown[]) => {
          record.selectArgs = args;
          return chain;
        },
        eq: (col: string, value: string) => {
          record.filters.push([col, value]);
          return chain;
        },
        then: (resolve: (value: { count: number | null; error: { message: string } | null }) => unknown) => {
          const type = record.filters.find(([col]) => col === 'game_type')?.[1] ?? '';
          const result = perType[type] ?? {};
          return Promise.resolve({
            count: result.count ?? null,
            error: result.error ? { message: result.error } : null,
          }).then(resolve);
        },
      };
      return chain;
    },
  };
  return { client, seen };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('hub match counts', () => {
  it('asks for one completed count per game and reports what came back', async () => {
    const { client, seen } = fakeClient({
      'slap-arena': { count: 7 },
      'wall-game': { count: 1 },
      'tic-tac-toe': { count: 0 },
      battleship: { count: 3 },
    });
    vi.spyOn(supabaseModule, 'getSupabase').mockReturnValue(client as never);

    const counts = await fetchCompletedCounts(TYPES);

    expect(counts).toEqual({ 'slap-arena': 7, 'wall-game': 1, 'tic-tac-toe': 0, battleship: 3 });
    expect(seen).toHaveLength(4);
    for (const query of seen) {
      expect(query.table).toBe('matches');
      expect(query.filters).toContainEqual(['status', 'completed']);
    }
    expect(seen[0].selectArgs).toEqual(['id', { count: 'exact', head: true }]);
  });

  it('returns nothing when Supabase is not configured', async () => {
    vi.spyOn(supabaseModule, 'getSupabase').mockReturnValue(null as never);
    await expect(fetchCompletedCounts(TYPES)).resolves.toEqual({});
  });

  it('drops a failed game instead of reporting it as zero matches', async () => {
    const { client } = fakeClient({
      'wall-game': { count: 2 },
      'slap-arena': { error: 'relation does not exist' },
    });
    vi.spyOn(supabaseModule, 'getSupabase').mockReturnValue(client as never);

    const counts = await fetchCompletedCounts(TYPES);

    expect(counts['wall-game']).toBe(2);
    expect('slap-arena' in counts).toBe(false);
  });
});
