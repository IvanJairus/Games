#!/usr/bin/env node
// Runs the Supabase migrations and the protocol assertions against a throwaway Postgres in Docker.
// It never touches the project's hosted database.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTAINER = 'ij-games-pg';
const PORT = '55433';
const IMAGE = 'postgres:16-alpine';

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });

const psql = (sql, extra = []) =>
  sh('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', ...extra], { input: sql });

const psqlFile = (path) => {
  const sql = readFileSync(path, 'utf8');
  return psql(sql, ['-v', 'ON_ERROR_STOP=1', '-q']);
};

const log = (line) => console.log(line);

let createdHere = false;

try {
  sh('docker', ['info', '-f', '{{.ServerVersion}}']);
} catch {
  console.error('Docker daemon tidak berjalan. Nyalakan Docker Desktop lalu ulangi npm run db:verify.');
  process.exit(2);
}

try {
  sh('docker', ['inspect', CONTAINER]);
  log(`memakai container ${CONTAINER} yang sudah ada`);
} catch {
  log(`mengangkat ${IMAGE} di port ${PORT}`);
  sh('docker', ['run', '-d', '--name', CONTAINER, '-e', 'POSTGRES_PASSWORD=postgres', '-p', `${PORT}:5432`, IMAGE]);
  createdHere = true;
}

const fail = (message, detail) => {
  console.error(`GAGAL: ${message}`);
  if (detail) console.error(detail);
  if (createdHere) sh('docker', ['rm', '-f', CONTAINER]);
  process.exit(1);
};

try {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      psql('select 1;', ['-q']);
      break;
    } catch (err) {
      if (attempt === 39) fail('Postgres tidak siap dalam 40 percobaan', String(err));
      await sleep(1000);
    }
  }
} catch {}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

log('menyiapkan peran anon dan publication seperti lingkungan Supabase');
psql(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon nologin;
    end if;
  end $$;
  do $$ begin
    if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
      create publication supabase_realtime;
    end if;
  end $$;
  grant usage on schema public to anon;
  grant select, insert, update, delete on all tables in schema public to anon;
  grant usage on all sequences in schema public to anon;
  alter default privileges in schema public grant select, insert, update, delete on tables to anon;
`);

log('menerapkan migrasi');
psqlFile(join(root, 'supabase/migrations/001_multiplayer_rooms.sql'));
psqlFile(join(root, 'supabase/migrations/002_match_protocol.sql'));

psql(`
  grant usage on schema public to anon;
  grant select, insert, update, delete on all tables in schema public to anon;
  grant usage on all sequences in schema public to anon;
`);

log('menjalankan assertion protokol sebagai role anon');
try {
  psqlFile(join(root, 'supabase/tests/protocol.sql'));
} catch (err) {
  fail('asserti protokol gagal', String(err.stderr || err.stdout || err.message));
}

log('menguji rollback: pemicu harus benar-benar hilang');
psqlFile(join(root, 'supabase/rollback/002_match_protocol.sql'));

const after = psql(`
  do $$ begin
    if exists (select 1 from pg_trigger where tgname = 'enforce_match_protocol') then
      raise exception 'ROLLBACK FAIL: the trigger is still attached';
    end if;
    -- Tanpa pemicu, aturan lama harus bisa ditulisi lagi.
    perform pg_temp.reset_fixture();
    update public.matches set status = 'finished' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    if (select status from public.matches where id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 'finished' then
      raise exception 'ROLLBACK FAIL: status rule still enforced';
    end if;
  end $$;
  select count(*) as trigger_count from pg_trigger where tgname = 'enforce_match_protocol';
`, ['-q', '-t', '-A']);

if (!/\n0\s*$/.test('\n' + after.trim())) fail('rollback tidak menghabiskan pemicu', after);
log('rollback terbukti: pemicu hilang dan aturan tidak lagi menegah');

psqlFile(join(root, 'supabase/migrations/002_match_protocol.sql'));
log('pemicu dipasang kembali agar container meninggalkan state yang sama dengan produksi');

const blocks = (readFileSync(join(root, 'supabase/tests/protocol.sql'), 'utf8').match(/do \$\$/g) || []).length;
log(`OK: ${blocks} blok assertion protokol lulus di Postgres nyata`);

if (createdHere) {
  sh('docker', ['rm', '-f', CONTAINER]);
  log(`container ${CONTAINER} dibersihkan`);
}
