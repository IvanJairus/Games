import { GameType } from './multiplayer';
import { getSupabase } from '../../lib/supabase';

export type CompletedCounts = Partial<Record<GameType, number>>;

/**
 * How many online matches each game has finished. Aggregate only: the hub must not
 * put anyone's chosen nickname or room code on a public page to prove the backend
 * is used. One RPC carries every game, and the database function runs under the
 * caller's own row level security, so a visitor only sees counts of rows they may read.
 */
export async function fetchCompletedCounts(types: GameType[]): Promise<CompletedCounts> {
  const supabase = getSupabase();
  if (!supabase) return {};

  const { data, error } = await supabase.rpc('match_completion_counts');
  if (error || !Array.isArray(data)) return {};

  const known = new Set<string>(types);
  const out: CompletedCounts = {};
  for (const type of types) out[type] = 0;
  for (const row of data as Array<{ game_type: string; completed: number | string }>) {
    if (known.has(row.game_type)) out[row.game_type as GameType] = Number(row.completed);
  }
  return out;
}
