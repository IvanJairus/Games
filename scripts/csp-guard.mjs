/**
 * Menjaga header Content-Security-Policy tetap mengizinkan Worker room.
 *
 * Alasannya konkret: saat `VITE_TRANSPORT=cloudflare` aktif dan CSP tidak memuat
 * `*.workers.dev`, browser menolak mint tiket sebelum request keluar, dan pemain melihat
 * "Pertandingan berhenti". Tidak ada tes Node yang bisa menangkap itu, karena Node tidak
 * menegakkan CSP maupun CORS.
 */
import { readFileSync } from 'node:fs';

const REQUIRED = ['https://*.workers.dev', 'wss://*.workers.dev'];
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf-8'));
const headers = (config.headers ?? []).flatMap((entry) => entry.headers ?? []);
const policies = headers.filter((h) => (h.key ?? '').toLowerCase() === 'content-security-policy').map((h) => h.value ?? '');

if (policies.length === 0) {
  console.error('csp:check gagal: vercel.json tidak memuat header Content-Security-Policy.');
  process.exit(1);
}

const missing = REQUIRED.filter((host) => !policies.some((p) => p.includes(host)));
if (missing.length) {
  console.error(`csp:check gagal: connect-src tidak mengizinkan ${missing.join(', ')}.`);
  console.error('Ini membuat jalur Worker ditolak browser sebelum request keluar.');
  process.exit(1);
}

console.log(`csp:check lolos: ${policies.length} policy mengizinkan ${REQUIRED.join(' dan ')}.`);
