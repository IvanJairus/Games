-- Membatalkan 006_cleanup_stale_rooms.sql. Aman dijalankan berulang.
-- Baris yang terlanjur dihapus tidak dikembalikan: yang dihapus hanya jadwal dan fungsinya.
-- Ekstensi pg_cron dibiarkan, karena bisa dipakai job lain.

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('cleanup-stale-rooms');
    exception when others then
      raise notice 'job cleanup-stale-rooms belum pernah dijadwalkan: %', sqlerrm;
    end;
  end if;
end $$;

drop function if exists public.cleanup_stale_rooms();
