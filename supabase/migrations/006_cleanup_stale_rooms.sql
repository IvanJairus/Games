-- 006: bersihkan room basi tanpa menyentuh riwayat.
--
-- Tidak ada mekanisme pembersihan sama sekali: tidak ada TTL, tidak ada penjadwal, dan tabel
-- `matches` tidak punya policy delete (001), jadi baris menumpuk selamanya di free tier.
--
-- Yang dihapus hanya dua hal yang tidak pernah dibaca lagi:
--
--   1. Room `waiting` yang tidak pernah ada yang gabung selama 24 jam. Ia tidak punya riwayat
--      karena `match_results` hanya ditulis saat status berpindah ke `completed` (005).
--   2. Log `match_moves` dari laga yang sudah final dan tidak berubah selama 30 hari. Baris
--      `matches` dan `match_results`-nya dibiarkan, karena angka laga selesai di Hub dibaca dari
--      sana.
--
-- Bahaya yang dijaga: `match_results.match_id` memakai `on delete cascade`
-- (005_match_results_are_history.sql:24), jadi menghapus `matches` yang punya riwayat ikut
-- menghapus riwayat itu. Karena itu penghapusan room mensyaratkan tidak ada baris di
-- `match_results` untuk room tersebut, dan test protokol menghitung ulang jumlah riwayat sebelum
-- dan sesudah.
--
-- Fungsinya `security definer` dengan search_path terkunci: penghapusan butuh hak yang sengaja
-- tidak diberikan ke klien, dan kemampuannya dicabut dari peran publik supaya pengunjung tidak bisa
-- memanggilnya sendiri.

create or replace function public.cleanup_stale_rooms()
returns table (deleted_rooms int, deleted_moves int)
language plpgsql
security definer
set search_path = public
as $$
declare
  stale_rooms constant interval := interval '24 hours';
  stale_moves constant interval := interval '30 days';
  rooms int;
  moves int;
begin
  select count(*) into rooms
    from public.matches m
   where m.status = 'waiting'
     and m.updated_at < now() - stale_rooms
     and not exists (select 1 from public.match_results r where r.match_id = m.id);

  delete from public.matches m
   where m.status = 'waiting'
     and m.updated_at < now() - stale_rooms
     and not exists (select 1 from public.match_results r where r.match_id = m.id);

  -- Counted after the rooms are gone, so rows that cascade with a deleted room are not reported
  -- twice under two different rules.
  select count(*) into moves
    from public.match_moves mm
    join public.matches m on m.id = mm.match_id
   where m.status in ('completed', 'abandoned')
     and m.updated_at < now() - stale_moves;

  delete from public.match_moves mm
   using public.matches m
   where m.id = mm.match_id
     and m.status in ('completed', 'abandoned')
     and m.updated_at < now() - stale_moves;

  deleted_rooms := rooms;
  deleted_moves := moves;
  return next;
end;
$$;

alter function public.cleanup_stale_rooms() owner to postgres;

revoke execute on function public.cleanup_stale_rooms() from public, anon, authenticated;

-- Penjadwalan hanya hidup di Supabase. Postgres CI tidak punya pg_cron, jadi blok ini dilewati
-- tanpa membuat migrasi gagal.
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('cleanup-stale-rooms', '17 3 * * *', 'select public.cleanup_stale_rooms()');
  end if;
end $$;
