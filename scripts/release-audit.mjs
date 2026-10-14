#!/usr/bin/env node
/**
 * Release Readiness & Viewport Audit Script
 * Evaluates whether Games suite is publish-ready across Desktop & Mobile.
 */

import { execSync } from 'child_process';
import process from 'process';

const STAGES = [
  {
    name: 'TypeScript Typecheck',
    desc: 'Memastikan tidak ada type error di engine, komponen, atau rute',
    cmd: 'npx tsc -b',
  },
  {
    name: 'Unit Tests (Game Engines)',
    desc: 'Verifikasi engine WallGo (anti-trap BFS, quota, lompat bidak) & Tic Tac Toe (3x3 win lines)',
    cmd: 'npx vitest run tests/unit',
  },
  {
    // Runs the whole directory on purpose. Naming files one by one silently skips
    // every suite added later, which is how the Slap Arena UI tests stayed unrun.
    name: 'UI Suites (desktop + mobile, semua game)',
    desc: 'Simulasi desktop 1024px dan layar HP 375px untuk setiap game: reflow, kontrol, modal, ErrorBoundary',
    cmd: 'npx vitest run tests/ui',
  },
  {
    name: 'Production Build Bundle',
    desc: 'Verifikasi bundling Vite menghasilkan artefak produksi yang bersih tanpa error',
    cmd: 'npx vite build',
  },
  {
    name: 'Security & Domain Guards',
    desc: 'Memastikan tidak ada domain pratinjau vendor di kode aktif yang shipped',
    cmd: 'node scripts/guard-check.mjs',
  },
];

console.log('═══════════════════════════════════════════════════════════════');
console.log(' 🎮 IJ-GAMES RELEASE AUDIT & AUTOMATION CHECK');
console.log(' Target Platform: Web Desktop (>=1024px) & Mobile (<=430px)');
console.log('═══════════════════════════════════════════════════════════════\n');

let allPassed = true;
const results = [];

for (const [idx, stage] of STAGES.entries()) {
  const stepNum = `[${idx + 1}/${STAGES.length}]`;
  process.stdout.write(`${stepNum} Menjalankan: ${stage.name}...\n  ↳ ${stage.desc}\n`);

  const startTime = Date.now();
  try {
    const output = execSync(stage.cmd, { stdio: 'pipe', encoding: 'utf-8' });
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`  ✓ LULUS (${duration}s)\n`);
    results.push({ name: stage.name, status: 'PASSED', duration });
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`  ✗ GAGAL (${duration}s)\n`);
    if (error.stdout) console.error(error.stdout.toString().slice(0, 1000));
    if (error.stderr) console.error(error.stderr.toString().slice(0, 1000));
    results.push({ name: stage.name, status: 'FAILED', duration });
    allPassed = false;
    break;
  }
}

console.log('───────────────────────────────────────────────────────────────');
console.log(' 📋 RINGKASAN AUDIT KELAYAKAN PUBLIKASI:');
for (const r of results) {
  const icon = r.status === 'PASSED' ? '✓' : '✗';
  console.log(`  ${icon} ${r.name.padEnd(35)} : ${r.status} (${r.duration}s)`);
}
console.log('───────────────────────────────────────────────────────────────');

if (allPassed) {
  console.log('\n✨ SEMUA TAHAP LULUS: GAME SIAP DAN LAYAK DIPUBLIKASIKAN! (Desktop & Mobile Ready)\n');
  process.exit(0);
} else {
  console.error('\n❌ AUDIT GAGAL: Mohon perbaiki kendala di atas sebelum mempublikasikan game.\n');
  process.exit(1);
}
