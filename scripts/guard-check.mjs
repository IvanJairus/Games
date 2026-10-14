#!/usr/bin/env node
// Fails when a *.vercel.app URL is referenced in shipped code.
// README and CI docs may name the preview host on purpose; source files may not.
import { execFileSync } from 'node:child_process';

const SCOPE = ['--', 'src', 'tests', 'index.html', 'vite.config.ts', 'scripts'];

let hits = '';
try {
  hits = execFileSync('git', ['grep', '-nE', '\\.vercel\\.app', ...SCOPE], { encoding: 'utf8' });
} catch (err) {
  hits = String(err.stdout || '');
}

const lines = hits.split('\n').filter(Boolean);

if (lines.length > 0) {
  console.error(`guard:check menemukan ${lines.length} referensi *.vercel.app di kode aktif:`);
  lines.forEach((line) => console.error('  ' + line));
  process.exit(1);
}

console.log('guard:check bersih, tidak ada *.vercel.app di src, tests, index.html, vite.config.ts, scripts.');
