-- 005: history moves to its own table so a rematch can reopen a room.
--
-- Migration 003 blocked UPDATE on any `matches` row already marked 'completed'. That
-- silently broke "Ronde Berikutnya" in the online games: a rematch writes
-- completed -> playing on the SAME row, and the update stopped matching anything.
-- Reproduced as the anon role: the finish landed, the rematch returned zero rows.
--
-- The guard was protecting the hub counter, so the counter moves somewhere it does
-- not have to share a row with live room state.
--
--   * `match_results` holds one row per finish, written only by a trigger when a
--     match transitions into 'completed'.
--   * Anon gets SELECT and nothing else: no INSERT, UPDATE or DELETE policy, so a
--     client cannot inflate or erase the history. The trigger is SECURITY DEFINER
--     because a trigger otherwise runs as the calling role, which is exactly the
--     role that must not be able to write here.
--   * `matches` is free to cycle waiting -> playing -> completed -> playing again.
--     Room state is not history, and pretending otherwise broke a feature.
--
-- The INSERT guard from 003 stays: a room is still born 'waiting'.

create table if not exists public.match_results (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  game_type text not null,
  winner_index int,
  finished_at timestamptz not null default now()
);

create index if not exists idx_match_results_game_finished
  on public.match_results (game_type, finished_at desc);

alter table public.match_results enable row level security;

grant select on public.match_results to anon, authenticated;

drop policy if exists "Allow anon read match_results" on public.match_results;
create policy "Allow anon read match_results" on public.match_results for select using (true);

create or replace function public.record_match_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.match_results (match_id, game_type, winner_index)
  values (NEW.id, NEW.game_type, NEW.winner_index);
  return NEW;
end;
$$;

drop trigger if exists record_match_result on public.matches;
create trigger record_match_result
  after update of status on public.matches
  for each row
  when (new.status = 'completed' and old.status <> 'completed')
  execute function public.record_match_result();

drop policy if exists "Allow anon update matches" on public.matches;
create policy "Allow anon update matches" on public.matches for update using (true) with check (true);

-- Matches that finished before this table existed are still real history. Without
-- this the hub counter would visibly drop on deploy.
insert into public.match_results (match_id, game_type, winner_index)
  select m.id, m.game_type, m.winner_index
  from public.matches m
  where m.status = 'completed'
    and not exists (select 1 from public.match_results r where r.match_id = m.id);

create or replace function public.match_completion_counts()
returns table (game_type text, completed bigint)
language sql
stable
as $$
  select r.game_type, count(*)
  from public.match_results r
  group by r.game_type;
$$;
