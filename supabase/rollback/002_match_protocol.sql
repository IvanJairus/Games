-- Membatalkan 002_match_protocol.sql. Aman dijalankan berulang.
-- Isi tabel tidak tersentuh: yang dihapus hanya pemicu, fungsi, dan dua index.

drop trigger if exists enforce_match_protocol on public.matches;
drop function if exists public.enforce_match_protocol();
drop index if exists public.idx_matches_status;
drop index if exists public.idx_match_moves_action;
