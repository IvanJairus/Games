import { GameType } from './multiplayer';
import { getSupabase } from '../../lib/supabase';

export type CompletedCounts = Partial<Record<GameType, number>>;

/**
 * How many online matches each game has finished. Aggregate only: the hub must not
 * put anyone's chosen nickname or room code on a public page to prove the backend
 * is used. Head requests return a count without transferring rows.
 */
export async function fetchCompletedCounts(types: GameType[]): Promise<CompletedCounts> {
  const supabase = getSupabase();
  if (!supabase) return {};

  const results = await Promise.all(
    types.map((type) =>
      supabase
        .from('matches')
        .select('id', { count: 'exact', head: true })
        .eq('game_type', type)
        .eq('status', 'completed')
    )
  );

  const out: CompletedCounts = {};
  types.forEach((type, i) => {
    const result = results[i];
    if (!result.error && typeof result.count === 'number') out[type] = result.count;
  });
  return out;
}
