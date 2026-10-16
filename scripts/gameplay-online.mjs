/**
 * Two-tab online room probe against a deployed build.
 *
 * The solo path is covered by the vitest UI suite and the gameplay check, but the claim
 * that actually needs two browsers is the realtime one: two seats, host-authoritative
 * snapshots, and a bomb planted by the guest reaching the host's world.
 *
 * Usage: npm run gameplay:online [baseUrl]
 */

import { existsSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

// The vendor preview host must never appear in shipped code (guard:check enforces that),
// so the target is an argument.
const BASE = process.argv[2];
if (!BASE) {
  console.error('usage: node scripts/gameplay-online.mjs <games base url>');
  process.exit(2);
}

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

const executablePath = findBrowser();
if (!executablePath) {
  console.error('No cached Chromium found.');
  process.exit(2);
}

const browser = await chromium.launch({ executablePath });
const mk = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript((n) => {
    try {
      window.localStorage.setItem('ij_player_name', n);
    } catch {
      /* storage may be blocked; the app falls back to a generated name */
    }
  }, name);
  return { ctx, page, errors };
};

const host = await mk('Kehost');
const guest = await mk('Kiguest');

console.log(`target: ${BASE}\n`);

await host.page.goto(`${BASE}/bomberman`, { waitUntil: 'load' });
await host.page.click('[data-testid="bomberman-tab-online"]');
await host.page.click('[data-testid="bomberman-seats-4"]');
await host.page.click('[data-testid="bomberman-size-besar"]');
const createBtn = host.page.locator('[data-testid="bomberman-create"]');
check('lobby offers a usable create button on this deployment', (await createBtn.isEnabled()) === true);

await createBtn.click();
await host.page.waitForURL(/\/bomberman\/m\//, { timeout: 20000 });
const url = new URL(host.page.url());
const code = url.pathname.split('/').pop();
check('room created and reachable by code', /^[A-Z2-9]{6}$/.test(code), code);

await host.page.waitForSelector('[data-testid="bomberman-waiting"]', { timeout: 20000 });
check('host sees the waiting screen', true);

// The guest picks its character in the lobby, then joins by code: the pick has to survive
// the page change and reach the host as one broadcast claim.
await guest.page.goto(`${BASE}/bomberman`, { waitUntil: 'load' });
await guest.page.click('[data-testid="bomberman-char-lampu"]');
await guest.page.goto(`${BASE}/bomberman/m/${code}`, { waitUntil: 'load' });
await guest.page.waitForSelector('[data-testid="bomberman-waiting"]', { timeout: 20000 });

/* The first sync can land before the roster row is readable, so poll for the guest by
   name rather than trusting one snapshot of the chip count. */
/* polling: 'mutation' and the default rAF both stall in a background tab, and the host
   tab is backgrounded as soon as the guest page opens. An interval keeps measuring. */
const rosterSeen = await host.page
  .waitForFunction(() => document.querySelectorAll('[data-testid="bomberman-roster"] .bm-chip').length >= 2,
    { timeout: 60000, polling: 1000 })
  .then(() => true)
  .catch(() => false);
check('both seats appear in the host roster', rosterSeen);

await host.page.click('[data-testid="bomberman-begin"]');
await Promise.all([
  host.page.waitForSelector('[data-testid="bomberman-match"]', { timeout: 30000 }),
  guest.page.waitForSelector('[data-testid="bomberman-match"]', { timeout: 30000 }),
]);
check('both tabs entered the arena', true);

/* The HUD is React at 10 Hz and the claim lands on the next tick, so these read on an
   interval rather than once. rAF polling stalls in the host tab the moment the guest tab
   is focused, which is exactly when this runs. */
const until = async (page, fn, ms = 20000) => {
  try {
    await page.waitForFunction(fn, null, { timeout: ms, polling: 1000 });
    return true;
  } catch {
    return false;
  }
};

const fourSeats = await Promise.all([
  until(host.page, () => document.querySelectorAll('[data-testid^="bomberman-chip-"]').length === 4),
  until(guest.page, () => document.querySelectorAll('[data-testid^="bomberman-chip-"]').length === 4),
]);
check('two humans plus two bots are on the board', fourSeats.every(Boolean), fourSeats.join(' / '));

const botLabel = await until(host.page, () => /2 bot/.test(document.querySelector('.bm-title')?.textContent ?? ''));
check('the room names the bots it filled in', botLabel);

const claim = await Promise.all([
  until(host.page, () => (document.querySelector('[data-testid="bomberman-chip-1"]')?.innerText ?? '').includes('Lampu Sorot')),
  until(guest.page, () => (document.querySelector('[data-testid="bomberman-chip-1"]')?.innerText ?? '').includes('Lampu Sorot')),
]);
check("the guest's character pick reached the host world", claim.every(Boolean), claim.join(' / '));

const large = await Promise.all([
  until(host.page, () => document.querySelector('[data-testid="bomberman-board"]')?.getAttribute('viewBox') === '0 0 840 600'),
  until(guest.page, () => document.querySelector('[data-testid="bomberman-board"]')?.getAttribute('viewBox') === '0 0 840 600'),
]);
check('both tabs play the large board the lobby asked for', large.every(Boolean), large.join(' / '));

// Let the countdown finish, then have the guest plant a bomb.
await host.page.waitForTimeout(3200);
await guest.page.keyboard.press('Space');
await guest.page.waitForTimeout(600);

/* Counted by owner, so a bomb a bot planted cannot be mistaken for the guest's. The arena
   writes the seat into the node signature for exactly this kind of question. */
const bombOnHost = await host.page.evaluate(() => document.querySelectorAll('[data-sig^="bomb:1"]').length);
check('a bomb planted by the guest is visible in the host world', bombOnHost >= 1, `${bombOnHost} guest bombs`);

const bombOnGuest = await guest.page.evaluate(() => document.querySelectorAll('[data-sig^="bomb:1"]').length);
check('the guest also renders it', bombOnGuest >= 1, `${bombOnGuest} guest bombs`);

// Movement from the host must reach the guest.
const before = await guest.page.evaluate(() => document.querySelector('[data-sig*=":idle:"], [data-sig*=":walk:"]')?.getAttribute('transform'));
await host.page.keyboard.down('ArrowRight');
await host.page.waitForTimeout(700);
await host.page.keyboard.up('ArrowRight');
await host.page.waitForTimeout(900);
const after = await guest.page.evaluate(() => document.querySelector('[data-sig*=":idle:"], [data-sig*=":walk:"]')?.getAttribute('transform'));
check('host movement is visible to the guest', before !== after, `${before} -> ${after}`);

// Both boards must agree on the map after a few seconds of play.
await host.page.waitForTimeout(2500);
const same = await Promise.all([
  host.page.evaluate(() => document.querySelector('[data-testid="bomberman-board"]')?.getAttribute('viewBox')),
  guest.page.evaluate(() => document.querySelector('[data-testid="bomberman-board"]')?.getAttribute('viewBox')),
]);
check('both tabs share one board geometry', same[0] === same[1], `${same[0]} / ${same[1]}`);

check('host tab had no page errors', host.errors.length === 0, host.errors.slice(0, 2).join(' | '));
check('guest tab had no page errors', guest.errors.length === 0, guest.errors.slice(0, 2).join(' | '));

await host.page.screenshot({ path: 'docs/bomberman/shots/online-host.png' });
await guest.page.screenshot({ path: 'docs/bomberman/shots/online-guest.png' });

await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} online checks passed`);
process.exit(passed === results.length ? 0 : 1);
