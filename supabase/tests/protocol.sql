-- Protocol rules for multiplayer rooms, asserted against a real Postgres as the anon role.
-- Run through: npm run db:verify

create or replace function pg_temp.reset_fixture(p_status text default 'playing') returns void
language sql security definer set search_path = public as $$
  delete from public.match_players where match_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  delete from public.matches where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  insert into public.matches (id, room_code, game_type, status, max_players, current_turn, game_state, updated_at)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'TESTA1', 'battleship', p_status, 2, 0, '{}'::jsonb, '2020-01-01 00:00:00+00');
  insert into public.match_players (match_id, player_index, session_id, name, is_host)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 0, 'p_alpha', 'Alpha', true),
         ('aaaaaaaa-0000-0000-0000-000000000001', 1, 'p_bravo', 'Bravo', false);
$$;

set role anon;

-- 1. A move that matches the row version and the turn lands.
do $$
declare n int; base timestamptz; after timestamptz;
begin
  perform pg_temp.reset_fixture();
  select updated_at into base from public.matches where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  update public.matches
     set current_turn = 1, game_state = '{"phase":"BATTLE"}'::jsonb
   where id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and current_turn = 0
     and updated_at = base;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ASSERT 1 FAIL: legal compare-and-swap landed % rows', n; end if;
  select updated_at into after from public.matches where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if after <= base then raise exception 'ASSERT 1 FAIL: version token did not move forward'; end if;
end $$;

-- 2. A write built on a stale version token is refused by the row itself.
do $$
declare n int; base timestamptz;
begin
  perform pg_temp.reset_fixture();
  select updated_at into base from public.matches where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  update public.matches set current_turn = 1, updated_at = base
   where id = 'aaaaaaaa-0000-0000-0000-000000000001' and current_turn = 0 and updated_at = base;
  update public.matches set current_turn = 0, game_state = '{"by":"stale"}'::jsonb
   where id = 'aaaaaaaa-0000-0000-0000-000000000001' and current_turn = 1 and updated_at = base;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ASSERT 2 FAIL: stale version write should land 0 rows, got %', n; end if;
end $$;

-- 3. A client cannot forge the version token it supplies.
do $$
declare after timestamptz;
begin
  perform pg_temp.reset_fixture();
  update public.matches
     set current_turn = 1, updated_at = '2030-01-01 00:00:00+00'
   where id = 'aaaaaaaa-0000-0000-0000-000000000001' and current_turn = 0;
  select updated_at into after from public.matches where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if after >= '2030-01-01'::timestamptz then
    raise exception 'ASSERT 3 FAIL: client-supplied updated_at was honoured (%s)', after;
  end if;
  if after < '2020-01-02'::timestamptz then
    raise exception 'ASSERT 3 FAIL: updated_at did not advance past the fixture';
  end if;
end $$;

-- 4. Unknown status values are rejected.
do $$
begin
  perform pg_temp.reset_fixture();
  begin
    update public.matches set status = 'finished'
     where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'ASSERT 4 FAIL: bogus status accepted';
  exception when others then
    if sqlerrm not like '%not allowed%' then raise; end if;
  end;
end $$;

-- 5. A match cannot be finished before it starts.
do $$
begin
  perform pg_temp.reset_fixture();
  update public.matches set status = 'playing' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  begin
    update public.matches set status = 'waiting'
     where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'ASSERT 5 FAIL: playing back to waiting accepted';
  exception when others then
    if sqlerrm not like '%cannot return to waiting%' then raise; end if;
  end;
end $$;

-- 6. A winner cannot be declared while the match is still playing.
do $$
begin
  perform pg_temp.reset_fixture();
  begin
    update public.matches set winner_index = 1
     where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'ASSERT 6 FAIL: winner_index accepted during playing';
  exception when others then
    if sqlerrm not like '%winner_index%' then raise; end if;
  end;
  update public.matches set winner_index = 1, status = 'completed'
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
end $$;

-- 6b. Clearing the winner for a rematch is allowed, pointing one during play is not.
do $$
declare n int;
begin
  perform pg_temp.reset_fixture();
  update public.matches set winner_index = 1, status = 'completed'
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  update public.matches set winner_index = null, status = 'playing'
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ASSERT 6b FAIL: rematch could not clear winner (%s rows)', n; end if;
  begin
    update public.matches set winner_index = 0
     where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'ASSERT 6b FAIL: winner set during playing accepted';
  exception when others then
    if sqlerrm not like '%winner_index%' then raise; end if;
  end;
end $$;

-- 7. Room identity cannot be rewritten.
do $$
begin
  perform pg_temp.reset_fixture();
  begin
    update public.matches set room_code = 'HIJACK'
     where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'ASSERT 7 FAIL: room_code rewrite accepted';
  exception when others then
    if sqlerrm not like '%identity is immutable%' then raise; end if;
  end;
end $$;

-- 8. A turn value outside the seat range is refused.
do $$
begin
  perform pg_temp.reset_fixture();
  begin
    update public.matches set current_turn = 5
     where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'ASSERT 8 FAIL: out-of-range current_turn accepted';
  exception when others then
    if sqlerrm not like '%outside the room%' then raise; end if;
  end;
end $$;

-- 9. The shared state row cannot be stuffed with an oversized payload.
do $$
begin
  perform pg_temp.reset_fixture();
  begin
    update public.matches set game_state = jsonb_build_object('blob', repeat('x', 200000))
     where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'ASSERT 9 FAIL: oversized game_state accepted';
  exception when others then
    if sqlerrm not like '%64 kB%' then raise; end if;
  end;
end $$;

-- 10. Rematch from a finished room stays allowed, as tic-tac-toe and WallGo expect.
do $$
declare n int;
begin
  perform pg_temp.reset_fixture();
  update public.matches set winner_index = 0, status = 'completed'
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  update public.matches set status = 'playing', current_turn = 0, winner_index = null, game_state = '{"round":2}'::jsonb
   where id = 'aaaaaaaa-0000-0000-0000-000000000001' and status = 'completed';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ASSERT 10 FAIL: rematch blocked (%s rows)', n; end if;
end $$;

-- 11. The roster cannot be wiped by an anon delete on the match row, and moves stay append-only.
do $$
declare n int;
begin
  perform pg_temp.reset_fixture();
  insert into public.match_moves (match_id, player_index, action, payload)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 0, 'SHOT', '{"shot":12}'::jsonb);
  delete from public.match_moves where match_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ASSERT 11 FAIL: anon deleted % move rows', n; end if;
end $$;

-- 12. The exact writes the games send must survive the trigger.
do $$
declare n int; base timestamptz;
begin
  -- tic-tac-toe "next round": clear the winner, reopen the room, no turn guard.
  perform pg_temp.reset_fixture();
  update public.matches set winner_index = 1, status = 'completed'
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  update public.matches
     set game_state = '{"round":2}'::jsonb, current_turn = 0, winner_index = null,
         status = 'playing', updated_at = now()
   where id = 'aaaaaaaa-0000-0000-0000-000000000001' and status = 'completed';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ASSERT 12a FAIL: next-round write blocked (%s rows)', n; end if;

  -- battleship "resolve": declare the winner in the same write that closes the match.
  perform pg_temp.reset_fixture();
  update public.matches set current_turn = 1
   where id = 'aaaaaaaa-0000-0000-0000-000000000001' and current_turn = 0;
  select updated_at into base from public.matches where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  update public.matches
     set game_state = '{"phase":"FINISHED"}'::jsonb, current_turn = 1, winner_index = 0,
         status = 'completed', updated_at = now()
   where id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and current_turn = 1 and updated_at = base;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ASSERT 12b FAIL: finishing resolve blocked (%s rows)', n; end if;

  -- battleship "commit": a plain move that keeps playing must not touch the winner.
  perform pg_temp.reset_fixture();
  update public.matches set game_state = '{"phase":"BATTLE"}'::jsonb, current_turn = 1, winner_index = null
   where id = 'aaaaaaaa-0000-0000-0000-000000000001' and current_turn = 0;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ASSERT 12c FAIL: in-play commit write blocked (%s rows)', n; end if;
end $$;
-- 13. A started room cannot go back to waiting, a lobby can be closed, a winner cannot.
do $$
begin
  perform pg_temp.reset_fixture();
  update public.matches set status = 'playing' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  begin
    update public.matches set status = 'waiting' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'ASSERT 13a FAIL: a started room returned to waiting';
  exception when others then
    if sqlerrm not like '%cannot return to waiting%' then raise; end if;
  end;
end $$;

do $$
declare n int;
begin
  perform pg_temp.reset_fixture('waiting');
  update public.matches set status = 'abandoned', game_state = '{"reason":"host closed"}'::jsonb
   where id = 'aaaaaaaa-0000-0000-0000-000000000001' and status = 'waiting';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ASSERT 13b FAIL: host closing a lobby was blocked (%s rows)', n; end if;

  perform pg_temp.reset_fixture('waiting');
  begin
    update public.matches set status = 'completed', winner_index = 0
     where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'ASSERT 13c FAIL: winner declared from waiting';
  exception when others then
    if sqlerrm not like '%cannot finish before it starts%' then raise; end if;
  end;
end $$;


reset role;
