-- ============================================================
-- Supabase Schema for Multiplayer Rooms (Wall Game & Tic-Tac-Toe)
-- ============================================================

-- 1. Matches / Rooms table
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,
  game_type text not null, -- 'wall-game' | 'tic-tac-toe'
  status text not null default 'waiting', -- 'waiting' | 'playing' | 'completed' | 'abandoned'
  max_players int not null default 2,
  current_turn int not null default 0,
  game_state jsonb not null default '{}'::jsonb,
  winner_index int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Match Players table
create table if not exists public.match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references public.matches(id) on delete cascade not null,
  player_index int not null,
  session_id text not null,
  name text not null,
  is_host boolean not null default false,
  connected boolean not null default true,
  created_at timestamptz not null default now(),
  unique (match_id, player_index),
  unique (match_id, session_id)
);

-- 3. Match Moves Log table (audit & replay)
create table if not exists public.match_moves (
  id bigint generated always as identity primary key,
  match_id uuid references public.matches(id) on delete cascade not null,
  player_index int not null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Indices for performance
create index if not exists idx_matches_room_code on public.matches(room_code);
create index if not exists idx_match_players_match_id on public.match_players(match_id);
create index if not exists idx_match_moves_match_id on public.match_moves(match_id);

-- Enable Row Level Security (RLS)
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.match_moves enable row level security;

-- Open policies for anon client access (games are room-code protected)
drop policy if exists "Allow anon read matches" on public.matches;
create policy "Allow anon read matches" on public.matches for select using (true);

drop policy if exists "Allow anon insert matches" on public.matches;
create policy "Allow anon insert matches" on public.matches for insert with check (true);

drop policy if exists "Allow anon update matches" on public.matches;
create policy "Allow anon update matches" on public.matches for update using (true);

drop policy if exists "Allow anon read match_players" on public.match_players;
create policy "Allow anon read match_players" on public.match_players for select using (true);

drop policy if exists "Allow anon insert match_players" on public.match_players;
create policy "Allow anon insert match_players" on public.match_players for insert with check (true);

drop policy if exists "Allow anon update match_players" on public.match_players;
create policy "Allow anon update match_players" on public.match_players for update using (true);

drop policy if exists "Allow anon delete match_players" on public.match_players;
create policy "Allow anon delete match_players" on public.match_players for delete using (true);

drop policy if exists "Allow anon read match_moves" on public.match_moves;
create policy "Allow anon read match_moves" on public.match_moves for select using (true);

drop policy if exists "Allow anon insert match_moves" on public.match_moves;
create policy "Allow anon insert match_moves" on public.match_moves for insert with check (true);

-- Enable Supabase Realtime publication
begin;
  -- Add tables to realtime publication if not already added
  alter publication supabase_realtime add table public.matches;
  alter publication supabase_realtime add table public.match_players;
  alter publication supabase_realtime add table public.match_moves;
commit;
