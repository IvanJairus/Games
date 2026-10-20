/**
 * Verifikasi dua tab di browser nyata untuk jalur Worker (VITE_TRANSPORT=cloudflare).
 *
 * Yang dibuktikan di sini bukan kompilasi, tapi perilaku: dua konteks Chrome terpisah masuk satu
 * kamar, dan tab yang TIDAK menekan mulai tetap menerima dunia dari server. Bukunya sengaja tidak
 * memakai selector teks game, karena yang diukur adalah frame WebSocket, bukan copy UI.
 *
 * Pemakaian:
 *   node scripts/gameplay-cloudflare.mjs http://localhost:5199/games/
 * Butuh build dengan VITE_TRANSPORT=cloudflare, VITE_CF_ROOMS_URL, dan env Supabase terisi.
 */
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'http://localhost:5199/games/';
const WORKER = (process.env.VITE_CF_ROOMS_URL ?? 'https://ij-game-rooms.filemonivanjairus.workers.dev').replace(/^https:/, '');
const OUT = process.env.SHOT_DIR ?? '/tmp/cf-browser';

function findBrowser() {
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? `${process.env.HOME}/Library/Caches/ms-playwright`;
  if (!existsSync(cache)) return undefined;
  for (const dir of readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const app = `${cache}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
    if (existsSync(app)) return app;
  }
  return undefined;
}

const results = [];
const check = (label, ok, detail) => {
  results.push({ label, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `   [${detail}]` : ''}`);
};

mkdirSync(OUT, { recursive: true });
const executablePath = findBrowser();
if (!executablePath) {
  console.error('Tidak ada Chromium di cache playwright. Set PLAYWRIGHT_BROWSERS_PATH atau install browser.');
  process.exit(2);
}

const browser = await chromium.launch({ executablePath });

/** Satu tab: catat koneksi Worker, frame masuk yang berbentuk state, dan error halaman. */
const mkTab = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 } });
  const page = await ctx.newPage();
  const t = { name, page, ctx, states: [], wsUrls: [], mints: [], errors: [], fatalText: null };
  page.on('pageerror', (e) => t.errors.push(String(e)));
  page.on('websocket', (ws) => {
    if (!ws.url().includes(WORKER)) return;
    t.wsUrls.push(ws.url());
    ws.on('framereceived', (frame) => {
      let msg;
      try {
        msg = JSON.parse(frame.payload);
      } catch {
        return;
      }
      if (msg?.t === 'state') t.states.push(msg);
    });
  });
  page.on('response', async (res) => {
    if (res.url().includes(WORKER) && res.url().includes('/ticket')) t.mints.push(res.status());
  });
  await page.addInitScript((n) => {
    try {
      window.localStorage.setItem('ij_player_name', n);
    } catch {
      /* storage bisa diblokir */
    }
  }, name);
  return t;
};

const host = await mkTab('HostTab');
const guest = await mkTab('GuestTab');

const origin = new URL(BASE).origin;
await host.page.goto(`${origin}/games/slap-arena`, { waitUntil: 'networkidle' });
check('lobby Slap Arena terbuka', /\/slap-arena/.test(host.page.url()), host.page.url());

// Lobby punya saklar mode; tombol 'Buat room' baru ada setelah mode online dipilih.
await host.page.locator('button:has-text("Online")').first().click();
await host.page.waitForTimeout(600);
const create = host.page.locator('button:has-text("Buat room")').first();
if (await create.count()) {
  await create.click();
  await host.page.waitForURL(/\/slap-arena\/m\/[A-Z0-9]{4,12}/, { timeout: 25000 }).catch(() => {});
} else {
  check('tombol buat kamar ditemukan', false, 'tidak ada');
}
const roomPath = new URL(host.page.url()).pathname;
const code = roomPath.split('/').pop();
check('kode kamar terbentuk', /^[A-Z0-9]{4,12}$/.test(code), code);

await guest.page.goto(`${origin}${roomPath}`, { waitUntil: 'networkidle' });

// Mulai lewat host, lalu biarkan keduanya diam: frame state harus tetap masuk ke tab tamu.
const startBtn = host.page.locator('button:has-text("Mulai")').first();
if (await startBtn.count()) await startBtn.click().catch(() => {});
await Promise.all([host.page.waitForTimeout(4000), guest.page.waitForTimeout(4000)]);

const peerCount = (s) => (s?.world && Array.isArray(s.world.players) ? s.world.players.length : 0);
const lastGuest = guest.states.at(-1);

check('host membuka koneksi Worker', host.wsUrls.length > 0, host.wsUrls[0] ?? 'tidak ada');
check('tamu membuka koneksi Worker', guest.wsUrls.length > 0, guest.wsUrls[0] ?? 'tidak ada');
check('mint tiket 200 di kedua tab', host.mints.concat(guest.mints).every((s) => s === 200) && host.mints.length + guest.mints.length >= 2,
  `${[...host.mints, ...guest.mints].join(',')}`);
check('host menerima state dari server', host.states.length > 20, `${host.states.length} frame, fase ${lastPhase(host)}`);
check('tamu menerima state dari server tanpa menekan apa pun', guest.states.length > 20, `${guest.states.length} frame`);
check('dunia memuat dua kursi', peerCount(lastGuest) === 2, `tamu melihat ${peerCount(lastGuest)} kursi, fase ${lastGuest?.world?.phase ?? '-'}`);
check('fase dunia bergerak dari WAITING', ['COUNTDOWN', 'BATTLE'].includes(lastGuest?.world?.phase), lastGuest?.world?.phase);
check('tidak ada pageerror di host', host.errors.length === 0, host.errors[0] ?? '');
check('tidak ada pageerror di tamu', guest.errors.length === 0, guest.errors[0] ?? '');

await host.page.screenshot({ path: `${OUT}/host.png` }).catch(() => {});
await guest.page.screenshot({ path: `${OUT}/guest.png` }).catch(() => {});
console.log(`tangkapan layar: ${OUT}/host.png dan ${OUT}/guest.png`);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} lulus dari ${results.length}`);
await browser.close();
process.exit(failed ? 1 : 0);

function lastPhase(tab) {
  return tab.states.at(-1)?.world?.phase ?? tab.states.at(-1)?.phase ?? '-';
}
