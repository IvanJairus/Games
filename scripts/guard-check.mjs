#!/usr/bin/env node
// Fails when the vendor preview host is referenced in shipped code.
// README and CI docs may name it on purpose; source files may not.
import { execFileSync } from 'node:child_process';

const NEEDLE = String.raw`\.vercel[.]app`;
const SCOPE = ['--', 'src', 'tests', 'index.html', 'vite.config.ts', 'scripts'];

let hits = '';
try {
  hits = execFileSync('git', ['grep', '--untracked', '-nE', NEEDLE, ...SCOPE], { encoding: 'utf8' });
} catch (err) {
  hits = String(err.stdout || '');
}

const lines = hits.split('\n').filter(Boolean);

if (lines.length > 0) {
  console.error(`guard:check menemukan ${lines.length} referensi host pratinjau vendor di kode aktif:`);
  lines.forEach((line) => console.error('  ' + line));
  process.exit(1);
}

console.log('guard:check bersih, tidak ada host pratinjau vendor di src, tests, index.html, vite.config.ts, scripts.');
