-- 003: a finished match is history, not scratch space.
--
-- The hub now publishes a completed-match count per game, which makes two writes
-- worth blocking for anyone holding the public anon key:
--
--   1. UPDATE that moves a finished row to another status. The count would quietly
--      drop, and the winner recorded there would stop matching the games played.
--   2. INSERT of a row that claims to be finished. The count would quietly grow.
--
-- Deleting was never open on matches: 001 defines no delete policy for it, so anon
-- already cannot remove a match. match_players keeps its delete policy because
-- leaving a room depends on it.
--
-- One behaviour change to expect: leaving a room after its match had ended used to
-- rewrite that match as 'abandoned'. The update now matches zero rows. The client
-- never inspected that result, so the flow still completes and the finished record
-- survives.
--
-- Role scope is left exactly as 001 had it (no TO clause) so no role loses access
-- it has today. The service role bypasses row level security regardless.

drop policy if exists "Allow anon update matches" on public.matches;
drop policy if exists "Allow anon insert matches" on public.matches;

create policy "Allow anon update matches"
  on public.matches for update
  using (status <> 'completed')
  with check (true);

create policy "Allow anon insert matches"
  on public.matches for insert
  with check (status = 'waiting');
