-- 004: close the writes nobody uses, and count finished matches in one round trip.
--
-- Part 1, match_players.
--
-- 001 gave this table an UPDATE policy, but no code path has ever updated a player
-- row: joining inserts, leaving deletes scoped to (match_id, session_id), and
-- reconnection is handled by finding the existing row. Dropping it removes a write
-- surface with zero callers.
--
-- The INSERT policy was `with check (true)`, which let anyone attach a player row to
-- any match, including one that had already finished. Joining a live room is already
-- refused client side, so requiring an unfinished match is the same rule enforced
-- where it cannot be skipped. It deliberately allows 'waiting', 'playing' and
-- 'abandoned': a guest inserting its seat while the host starts the match is a real
-- race, and blocking it would turn a harmless retry into an RLS error.
--
-- Part 2, the hub counter.
--
-- The hub asked one HEAD request per game for a number it shows on four cards. This
-- returns the same rows in one call. It runs as the invoking role on purpose, so the
-- numbers a visitor sees are exactly the rows that visitor is allowed to read.

drop policy if exists "Allow anon update match_players" on public.match_players;
drop policy if exists "Allow anon insert match_players" on public.match_players;

create policy "Allow anon insert match_players"
  on public.match_players for insert
  with check (
    exists (
      select 1 from public.matches m
      where m.id = match_players.match_id
        and m.status <> 'completed'
    )
  );

create or replace function public.match_completion_counts()
returns table (game_type text, completed bigint)
language sql
stable
as $$
  select m.game_type, count(*)
  from public.matches m
  where m.status = 'completed'
  group by m.game_type;
$$;

alter function public.match_completion_counts() owner to postgres;
revoke all on function public.match_completion_counts() from public;
grant execute on function public.match_completion_counts() to anon, authenticated;
