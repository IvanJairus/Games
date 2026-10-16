#!/usr/bin/env node
// Runs the Supabase migrations and the protocol assertions against a throwaway Postgres in Docker.
// It never touches the project's hosted database.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTAINER = 'ij-games-pg';
const PORT = '55433';
const IMAGE = 'postgres:16-alpine';
const READY_LINE = 'database system is ready to accept connections';

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const readyLines = () => {
  /* The postgres server logs to its stderr, and `docker logs` forwards that to the CLI's
     stderr, so execFileSync would hand back an empty stdout and count zero ready lines
     forever. Both streams are joined here. */
  try {
    const r = spawnSync('docker', ['logs', CONTAINER], { encoding: 'utf8' });
    const both = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    return (both.match(new RegExp(READY_LINE, 'g')) || []).length;
  } catch {
    return 0;
  }
};

const tcpOpen = () =>
  new Promise((resolve) => {
    const sock = createConnection({ host: '127.0.0.1', port: Number(PORT) });
    const done = (ok) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(1500);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
  });

/* postgres:16-alpine raises a temporary server to run initdb, stops it, then starts the real
   server. The probe used to ask "can I run a query?" through docker exec against the Unix
   socket inside the container, and the temporary server answers that too, so the loop could
   finish inside the restart gap and the very next statement fell over. Two ready lines in the
   log plus a TCP connection from the host is the real signal: the temporary server never
   binds the published port. */
const startedAt = Date.now();
let ready = false;
for (let attempt = 1; attempt <= 60; attempt++) {
  if (readyLines() >= 2 && (await tcpOpen())) {
    ready = true;
    log(`postgres siap dalam ${((Date.now() - startedAt) / 1000).toFixed(1)} s (${attempt} percobaan)`);
    break;
  }
  await sleep(1000);
}
if (!ready) {
  fail(
    'Postgres tidak siap dalam 60 detik',
    'butuh dua baris "database system is ready to accept connections" di log container dan port TCP 55433 bisa dibuka dari host',
  );
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
