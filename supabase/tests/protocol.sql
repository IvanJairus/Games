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

-- 14. A player cannot erase a match row, so audit history survives a leaving client.
do $$
declare n int;
begin
  perform pg_temp.reset_fixture();
  delete from public.matches where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ASSERT 14 FAIL: anon deleted % match rows', n; end if;
end $$;


reset role;

-- 15. Pembersihan room basi. Fungsi ini dicabut dari anon dan authenticated, jadi blok ini
--     berjalan sebagai pemilik tabel, sama seperti penjadwal yang akan memanggilnya.
do $$
declare
  room_stale uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  room_fresh uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  match_done uuid := 'bbbbbbbb-0000-0000-0000-000000000003';
  game_stale uuid := 'bbbbbbbb-0000-0000-0000-000000000004';
  game_live uuid := 'bbbbbbbb-0000-0000-0000-000000000005';
  game_rematch uuid := 'bbbbbbbb-0000-0000-0000-000000000006';
  ids uuid[] := array['bbbbbbbb-0000-0000-0000-000000000001',
                      'bbbbbbbb-0000-0000-0000-000000000002',
                      'bbbbbbbb-0000-0000-0000-000000000003',
                      'bbbbbbbb-0000-0000-0000-000000000004',
                      'bbbbbbbb-0000-0000-0000-000000000005',
                      'bbbbbbbb-0000-0000-0000-000000000006'];
  results_before int;
  results_after int;
  hub_before bigint;
  hub_after bigint;
  rows_before bigint;
  rows_after bigint;
  got_rooms int;
  got_moves int;
  n int;
begin
  delete from public.match_moves where match_id = any (ids);
  delete from public.match_results where match_id = any (ids);
  delete from public.matches where id = any (ids);

  insert into public.matches (id, room_code, game_type, status, max_players, current_turn, game_state, updated_at)
  values (room_stale, 'STALE1', 'wall-game', 'waiting', 2, 0, '{}'::jsonb, now() - interval '25 hours'),
         (room_fresh, 'FRESH1', 'wall-game', 'waiting', 2, 0, '{}'::jsonb, now() - interval '1 hour'),
         (match_done, 'DONE40', 'battleship', 'completed', 2, 0, '{}'::jsonb, now() - interval '40 days'),
         (game_stale, 'PLAY8', 'bomberman', 'playing', 2, 0, '{}'::jsonb, now() - interval '8 days'),
         (game_live, 'PLAY1H', 'bomberman', 'playing', 2, 0, '{}'::jsonb, now() - interval '1 hour');

  insert into public.match_results (match_id, game_type, winner_index) values (match_done, 'battleship', 1);
  insert into public.match_moves (match_id, player_index, action, payload)
  values (match_done, 0, 'SHOT', '{}'::jsonb), (match_done, 1, 'SHOT', '{}'::jsonb),
         (game_stale, 0, 'MOVE', '{}'::jsonb);

  -- Laga yang di-rematch lalu ditinggalkan: statusnya `playing` lagi, tapi sejarahnya tinggal.
  -- Jalur ini dibangun lewat protokol sungguhan, bukan insert manual, supaya klaimnya bisa
  -- dibela: pemicu 005 yang menulis riwayat saat status pindah ke `completed`.
  insert into public.matches (id, room_code, game_type, status, max_players, current_turn, game_state, updated_at)
  values (game_rematch, 'REPLAY6', 'tic-tac-toe', 'waiting', 2, 0, '{}'::jsonb, now());
  update public.matches set status = 'playing' where id = game_rematch;
  update public.matches set status = 'completed', winner_index = 0 where id = game_rematch;
  update public.matches set status = 'playing', winner_index = null, current_turn = 0 where id = game_rematch;

  select count(*) into n from public.match_results where match_id = game_rematch;
  if n <> 1 then raise exception 'ASSERT 15i FAIL: jalur rematch tidak meninggalkan riwayat, % baris', n; end if;

  -- Pemicu protokol selalu memajukan `updated_at`, jadi menua baris ini harus melewati dia
  -- sebentar. Dua pernyataan alter hanya menutupi satu update, dan blok ini berjalan dalam satu
  -- transaksi, jadi kalau ada assertion yang gagal pemicunya ikut kembali aktif.
  alter table public.matches disable trigger enforce_match_protocol;
  update public.matches set updated_at = now() - interval '8 days' where id = game_rematch;
  alter table public.matches enable trigger enforce_match_protocol;

  select count(*) into rows_before from public.matches;
  select count(*) into results_before from public.match_results;
  select coalesce(sum(completed), 0) into hub_before from public.match_completion_counts();

  select deleted_rooms, deleted_moves into got_rooms, got_moves from public.cleanup_stale_rooms();
  select count(*) into rows_after from public.matches;

  select count(*) into n from public.matches where id = room_stale;
  if n <> 0 then raise exception 'ASSERT 15a FAIL: room waiting 25 jam masih ada, sisa % baris', n; end if;

  select count(*) into n from public.matches where id = room_fresh;
  if n <> 1 then raise exception 'ASSERT 15b FAIL: room waiting 1 jam ikut terhapus, sisa % baris', n; end if;

  select count(*) into n from public.matches where id = match_done;
  if n <> 1 then raise exception 'ASSERT 15c FAIL: laga final 40 hari ikut terhapus, sisa % baris', n; end if;

  select count(*) into n from public.match_results where match_id = match_done;
  if n <> 1 then raise exception 'ASSERT 15d FAIL: riwayat laga final hilang, sisa % baris', n; end if;

  select count(*) into n from public.match_moves where match_id = match_done;
  if n <> 0 then raise exception 'ASSERT 15e FAIL: log laga final tidak dibersihkan, sisa % baris', n; end if;

  select count(*) into results_after from public.match_results;
  if results_after < results_before then
    raise exception 'ASSERT 15f FAIL: jumlah riwayat turun dari % menjadi %', results_before, results_after;
  end if;

  -- Laporan fungsi harus sama dengan jumlah baris yang benar-benar hilang. Jumlahnya tidak
  -- di-hardcode di sini: sisa fixture blok 14 juga sebuah `playing` berumur bertahun-tahun tanpa
  -- riwayat, jadi ia ikut menjadi mangsa aturan baru dan angkanya bergerak kalau urutannya berubah.
  if got_rooms <> rows_before - rows_after then
    raise exception 'ASSERT 15g FAIL: deleted_rooms melapor % tapi baris matches berkurang %',
      got_rooms, rows_before - rows_after;
  end if;

  if got_rooms < 2 then
    raise exception 'ASSERT 15g-2 FAIL: deleted_rooms melapor % padahal dua fixture basi seharusnya hilang', got_rooms;
  end if;

  if got_moves <> 2 then raise exception 'ASSERT 15h FAIL: deleted_moves melapor %, seharusnya 2', got_moves; end if;

  -- Laga `playing` yang 8 hari tidak disentuh dan tidak pernah selesai: inilah yang dulu abadi.
  select count(*) into n from public.matches where id = game_stale;
  if n <> 0 then raise exception 'ASSERT 15j FAIL: laga playing 8 hari tanpa riwayat masih ada, sisa % baris', n; end if;

  select count(*) into n from public.match_moves where match_id = game_stale;
  if n <> 0 then raise exception 'ASSERT 15k FAIL: log laga playing ikut tertinggal, sisa % baris', n; end if;

  -- Laga yang masih jelas dipakai: baru satu jam tidak disentuh.
  select count(*) into n from public.matches where id = game_live;
  if n <> 1 then
    raise exception 'ASSERT 15l FAIL: laga playing 1 jam ikut terhapus, padahal ambangnya 7 hari, sisa % baris', n;
  end if;

  -- Penjaga utama: `playing` yang PUNYA riwayat harus tetap ada, cascade riwayat tidak boleh
  -- terjadi hanya karena statusnya belum final.
  select count(*) into n from public.matches where id = game_rematch;
  if n <> 1 then raise exception 'ASSERT 15m FAIL: laga playing berumur 8 hari yang punya riwayat ikut terhapus, % baris', n; end if;

  select count(*) into n from public.match_results where match_id = game_rematch;
  if n <> 1 then raise exception 'ASSERT 15n FAIL: riwayat hasil rematch hilang, sisa % baris', n; end if;

  -- Angka yang dilihat pengunjung di Hub tidak boleh bergerak oleh pembersihan apa pun.
  select coalesce(sum(completed), 0) into hub_after from public.match_completion_counts();
  if hub_after <> hub_before then
    raise exception 'ASSERT 15o FAIL: angka laga selesai di Hub berubah dari % menjadi %', hub_before, hub_after;
  end if;

  select count(*) into n from pg_trigger where tgname = 'enforce_match_protocol' and tgenabled = 'O';
  if n <> 1 then raise exception 'ASSERT 15p FAIL: pemicu protokol tidak diaktifkan kembali, % baris', n; end if;

  delete from public.matches where id = any (ids);
end $$;

-- 16. Pengunjung tidak boleh bisa memanggil pembersihnya sendiri.
do $$
declare allowed boolean;
begin
  select pg_catalog.has_function_privilege('anon', 'public.cleanup_stale_rooms()', 'execute') into allowed;
  if allowed then
    raise exception 'ASSERT 16 FAIL: anon masih memegang execute atas cleanup_stale_rooms';
  end if;
  select pg_catalog.has_function_privilege('authenticated', 'public.cleanup_stale_rooms()', 'execute') into allowed;
  if allowed then
    raise exception 'ASSERT 16 FAIL: authenticated masih memegang execute atas cleanup_stale_rooms';
  end if;
end $$;

reset role;
