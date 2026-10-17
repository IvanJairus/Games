-- 006: bersihkan room basi tanpa menyentuh riwayat.
--
-- Tidak ada mekanisme pembersihan sama sekali: tidak ada TTL, tidak ada penjadwal, dan tabel
-- `matches` tidak punya policy delete (001), jadi baris menumpuk selamanya di free tier.
--
-- Yang dihapus hanya tiga hal yang tidak pernah dibaca lagi:
--
--   1. Room `waiting` yang tidak pernah ada yang gabung selama 24 jam. Ia tidak punya riwayat
--      karena `match_results` hanya ditulis saat status berpindah ke `completed` (005).
--   2. Log `match_moves` dari laga yang sudah final dan tidak berubah selama 30 hari. Baris
--      `matches` dan `match_results`-nya dibiarkan, karena angka laga selesai di Hub dibaca dari
--      sana.
--   3. Laga `playing` yang tidak lagi ditulis selama 7 hari: laga yang ditinggalkan di tengah
--      jalan. Tidak ada jalur lain yang menutupnya, jadi tanpa aturan ini barisnya abadi.
--
-- Kenapa `playing` aman dihapus meski statusnya aktif:
--
--   * `updated_at` selalu dimajukan pemicu `enforce_match_protocol` (002_match_protocol.sql:53)
--     dan nilai kiriman klien dibuang, terbukti di assertion 3 test protokol. Jadi "7 hari tanpa
--     tulisan" berarti "7 hari tanpa satu langkah pun", bukan "7 hari tanpa sentuhan".
--   * Baris ini tidak pernah menyentuh `completed`, terbukti dari syarat `not exists` di bawah,
--     jadi tidak ada riwayat yang ikut hilang dan angka laga selesai di Hub tidak bergerak.
--     `winner_index`-nya pasti null: pemicu menolak winner saat status masih `playing`
--     (002_match_protocol.sql:36) dan assertion 6 menjaganya.
--   * Yang ikut hilang hanya `match_players` dan `match_moves` milik room itu (cascade 001).
--     Keduanya tidak dibaca setelah roomnya tidak ada; yang dibaca orang lain adalah
--     `match_results`, dan itu sengaja tidak disentuh.
--
-- Syarat `not exists` pada `match_results` bukan hiasan. `playing` BISA punya riwayat: 005
-- membebaskan siklus `completed -> playing` supaya "Ronde Berikutnya" bekerja
-- (005_match_results_are_history.sql:17), dan riwayat lama tidak dihapus siapa pun. Room yang
-- di-rematch lalu ditinggalkan adalah baris `playing` yang punya sejarah, dan ia harus tetap
-- ada. Assertion 15i membangun jalur itu lewat protokol sungguhan, bukan lewat insert manual.
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
  stale_games constant interval := interval '7 days';
  rooms int;
  games int;
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

  -- Rule 3, the abandoned match. Counted before the delete for the same reason as rule 1: the
  -- moved log of a removed room must not be reported twice.
  select count(*) into games
    from public.matches m
   where m.status = 'playing'
     and m.updated_at < now() - stale_games
     and not exists (select 1 from public.match_results r where r.match_id = m.id);

  delete from public.matches m
   where m.status = 'playing'
     and m.updated_at < now() - stale_games
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

  deleted_rooms := rooms + games;
  deleted_moves := moves;
  return next;
end;
$$;

alter function public.cleanup_stale_rooms() owner to postgres;

revoke execute on function public.cleanup_stale_rooms() from public, anon, authenticated;

-- Penjadwalan hanya hidup di Supabase. Postgres CI tidak punya pg_cron, jadi blok ini dilewati
-- tanpa membuat migrasi gagal.
--
-- Blok ini harus aman dijalankan ulang, karena file inilah yang ditempel manual di SQL editor dan
-- job `cleanup-stale-rooms` sudah ada di DB tayang: `cron.schedule` dengan jobname yang sama akan
-- melempar error dan menghentikan seluruh batch, padahal fungsinya sudah terganti. Job lama
-- dilepas lebih dulu supaya jadwal yang tertinggal di DB selalu sama dengan yang tertulis di file
-- ini, mengikuti pola drop-policy-then-create dan drop-trigger-then-create di atas. Konsekuensinya:
-- kalau suatu saat jadwal job ini diubah langsung di DB, menjalankan file ini mengembalikannya ke
-- `17 3 * * *`.
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    begin
      perform cron.unschedule('cleanup-stale-rooms');
    exception when others then
      -- Belum ada job dengan nama itu: ini penerapan pertama. Kegagalan di sini sengaja tidak
      -- menghentikan apa pun, karena statement di bawah yang menentukan keadaan akhir.
      null;
    end;
    perform cron.schedule('cleanup-stale-rooms', '17 3 * * *', 'select public.cleanup_stale_rooms()');
  end if;
end $$;
