#!/usr/bin/env node
// Fails when shipped code names the vendor preview host, or when a game engine reaches for shared
// modules or the Supabase client. Engines must stay pure functions so the CI suites can run them.
import { execFileSync } from 'node:child_process';

const HOST_NEEDLE = String.raw`\.vercel[.]app`;
const HOST_SCOPE = ['--', 'src', 'tests', 'index.html', 'vite.config.ts', 'scripts'];

// The trailing slash form matches nothing in git grep, so the glob has to name the files.
const ENGINE_SCOPE = ['--', 'src/games/*/engine/*'];
const SHARED_NEEDLE = String.raw`from ['"][^'"]*(games/common|/common/|lib/supabase)['"]`;
const CLIENT_NEEDLE = String.raw`^import .*@supabase/supabase-js`;

const grep = (needle, scope) => {
  let out = '';
  try {
    out = execFileSync('git', ['grep', '--untracked', '-nE', needle, ...scope], { encoding: 'utf8' });
  } catch (err) {
    out = String(err.stdout || '');
  }
  return out.split('\n').filter(Boolean);
};

const isTypeOnlyImport = (hit) => /^[^:]+:\d+:import type\b/.test(hit);

const CHECKS = [
  {
    id: 1,
    title: 'host pratinjau vendor di kode aktif',
    hits: grep(HOST_NEEDLE, HOST_SCOPE),
  },
  {
    id: 2,
    title: 'modul bersama diimpor dari engine game',
    hits: grep(SHARED_NEEDLE, ENGINE_SCOPE),
  },
  {
    id: 3,
    title: 'klien Supabase runtime diimpor dari engine game',
    hits: grep(CLIENT_NEEDLE, ENGINE_SCOPE).filter((hit) => !isTypeOnlyImport(hit)),
  },
];

const failed = CHECKS.filter((check) => check.hits.length > 0);

if (failed.length > 0) {
  console.error(`guard:check gagal di ${failed.length} dari ${CHECKS.length} cek:`);
  for (const check of failed) {
    console.error(`  cek ${check.id}: ${check.title}, ${check.hits.length} pelanggaran`);
    for (const hit of check.hits) console.error(`    ${hit}`);
  }
  process.exit(1);
}

console.log(
  `guard:check bersih, ${CHECKS.length} cek lolos: ` +
    CHECKS.map((check) => check.title).join(', ') +
    '.'
);
