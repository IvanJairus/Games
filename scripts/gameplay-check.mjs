/**
 * Real-browser gameplay check.
 *
 * The vitest suites run in jsdom, which has no layout engine: it can prove a component
 * rendered the right nodes but cannot prove the arena fits a phone, that a control is
 * big enough to hit, or that the frame rate survives a board full of fire. Those are the
 * claims this script exists to measure.
 *
 * Usage: npm run gameplay:check [baseUrl]
 */

import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'http://localhost:5199/games';
const OUT = resolve(process.cwd(), 'docs/bomberman/shots');
const CACHE = process.env.PLAYWRIGHT_BROWSERS_PATH ?? `${process.env.HOME}/Library/Caches/ms-playwright`;

function findBrowser() {
  if (process.env.BM_CHROME) return process.env.BM_CHROME;
  if (!existsSync(CACHE)) return undefined;
  const dirs = readdirSync(CACHE).filter((d) => d.startsWith('chromium-')).sort().reverse();
  for (const dir of dirs) {
    const candidates = [
      `${CACHE}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
      `${CACHE}/${dir}/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
      `${CACHE}/${dir}/chrome-linux/chrome`,
    ];
    const hit = candidates.find((p) => existsSync(p));
    if (hit) return hit;
  }
  return undefined;
}

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800, touch: false, floor: 'grass' },
  { name: 'phone-portrait', width: 375, height: 667, touch: true, floor: 'sand' },
  { name: 'phone-landscape', width: 667, height: 375, touch: true, floor: 'stone' },
  { name: 'small-phone', width: 360, height: 640, touch: true },
];

const results = [];
let failed = 0;

function check(label, ok, detail) {
  results.push({ label, ok, detail });
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `   [${detail}]` : ''}`);
}

const MEASURE = () => {
  const doc = document.documentElement;
  const board = document.querySelector('[data-testid="bomberman-board"]');
  const rect = board?.getBoundingClientRect();
  const parts = (board?.getAttribute('viewBox') ?? '0 0 440 360').split(' ').map(Number);
  const cols = parts[2] / 40;
  const bom = document.querySelector('[data-testid="bomberman-bom"]')?.getBoundingClientRect();
  const status = document.querySelector('[data-testid="bomberman-status"]')?.getBoundingClientRect();
  return {
    scrollWidth: doc.scrollWidth,
    clientWidth: doc.clientWidth,
    boardWidth: rect ? Math.round(rect.width) : 0,
    boardHeight: rect ? Math.round(rect.height) : 0,
    boardTop: rect ? Math.round(rect.top) : 0,
    cols,
    cellPx: rect && cols ? +(rect.width / cols).toFixed(1) : 0,
    bomW: bom ? Math.round(bom.width) : 0,
    bomH: bom ? Math.round(bom.height) : 0,
    statusH: status ? Math.round(status.height) : 0,
    sprites: document.querySelectorAll('[data-testid="bomberman-board"] svg').length,
  };
};

async function run() {
  const executablePath = findBrowser();
  if (!executablePath) {
    console.error('No cached Chromium found. Set BM_CHROME=/path/to/chrome.');
    process.exit(2);
  }
  mkdirSync(OUT, { recursive: true });
  console.log(`browser: ${executablePath}`);
  console.log(`target:  ${BASE}\n`);

  const browser = await chromium.launch({ executablePath });

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.touch,
      isMobile: vp.touch,
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    const errors = [];
    /* Vercel injects its analytics bundle at /_vercel/*, which only exists when Vercel
       is the one serving. Against a local preview it 404s for every page, so counting it
       would fail the build for something unrelated to this game. */
    const noise = (text) => /_vercel\/(insights|speed-insights)/.test(text ?? '');
    /* A failed subresource reaches the console as "Failed to load resource" with no URL
       in the text, so the location and the response event carry the only usable signal. */
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      if (noise(m.text()) || noise(m.location()?.url)) return;
      errors.push(`${m.text()} @ ${m.location()?.url ?? '?'}`);
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('response', (r) => {
      if (r.status() >= 400 && !noise(r.url())) errors.push(`HTTP ${r.status()} ${r.url()}`);
    });

    await page.goto(`${BASE}/bomberman/local${vp.floor ? `?floor=${vp.floor}` : ''}`, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid="bomberman-start"]', { timeout: 15000 });
    check(`${vp.name}: setup screen renders`, true);

    await page.click('[data-testid="bomberman-start"]');
    await page.waitForSelector('[data-testid="bomberman-board"]', { timeout: 5000 });
    if (vp.touch) {
      /* The pad appears because a real touch was seen, not because the screen is small.
         Playwright's click() reports pointerType "mouse", so this tap is the thing under test. */
      await page.touchscreen.tap(Math.round(vp.width / 2), Math.round(vp.height / 2));
    }
    await page.waitForTimeout(2800);

    const before = await page.evaluate(MEASURE);
    check(
      `${vp.name}: no horizontal overflow`,
      before.scrollWidth <= before.clientWidth + 1,
      `scroll ${before.scrollWidth} / client ${before.clientWidth}`,
    );
    check(`${vp.name}: board has real pixels`, before.boardWidth > 100, `${before.boardWidth}x${before.boardHeight}`);
    check(`${vp.name}: sprites are painted`, before.sprites >= 20, `${before.sprites} svg nodes, cell ${before.cellPx}px`);

    const fps = await page.evaluate(
      () =>
        new Promise((done) => {
          let frames = 0;
          const t0 = performance.now();
          const tick = () => {
            frames += 1;
            if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
            else done(Math.round((frames * 1000) / (performance.now() - t0)));
          };
          requestAnimationFrame(tick);
        }),
    );
    check(`${vp.name}: frame rate stays playable`, fps >= 40, `${fps} fps`);

    // The floor texture is a real asset request; a wrong path returns index.html with
    // a 200, so the decoded image, not the status, is the thing to check.
    const floorOk = await page.evaluate(() => {
      const img = document.querySelector('.bm-board image');
      const href = img?.getAttribute('href');
      if (!href) return Promise.resolve('no texture');
      // SVGImageElement has no decode(); load the same URL through a real Image instead.
      const probe = new Image();
      return new Promise((done) => {
        probe.onload = () => done(`${probe.naturalWidth}x${probe.naturalHeight}`);
        probe.onerror = () => done('broken');
        probe.src = href;
      });
    });
    check(`${vp.name}: floor texture decodes`, floorOk !== 'broken' && floorOk !== 'no texture', String(floorOk));

    await page.screenshot({ path: `${OUT}/${vp.name}-board.png` });
    const topBefore = before.boardTop;
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      await page.keyboard.down(key);
      await page.waitForTimeout(280);
      await page.keyboard.up(key);
      await page.keyboard.press('Space');
    }
    await page.waitForTimeout(400);

    // Abnormal: a burst of presses must not put more bombs on the floor than the quota.
    for (let i = 0; i < 40; i++) await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    const bombs = await page.evaluate(() => document.querySelectorAll('[data-sig^="bomb"]').length);
    check(`${vp.name}: key spam cannot beat the bomb quota`, bombs <= 2, `${bombs} bombs`);

    // Abnormal: the board must not slide when the status line changes length.
    const afterMove = await page.evaluate(MEASURE);
    check(`${vp.name}: board does not shift during play`, Math.abs(afterMove.boardTop - topBefore) <= 1, `${topBefore} -> ${afterMove.boardTop}`);

    // Abnormal: resize mid-match.
    await page.setViewportSize({ width: Math.round(vp.width * 0.78), height: Math.round(vp.height * 0.88) });
    await page.waitForTimeout(500);
    const after = await page.evaluate(MEASURE);
    check(`${vp.name}: survives a mid-match resize`, after.boardWidth > 80, `board ${after.boardWidth}px`);

    if (vp.touch) {
      check(`${vp.name}: touch pad is offered`, after.bomW >= 60, `BOM button ${after.bomW}x${after.bomH}`);
      const box = await page.locator('[data-testid="bomberman-stick"]').boundingBox();
      check(`${vp.name}: drag zone covers the left half`, !!box && box.width > vp.width * 0.4, box ? `${Math.round(box.width)}px wide` : 'missing');
    }

    await page.screenshot({ path: `${OUT}/${vp.name}.png` });
    check(`${vp.name}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));

    await ctx.close();
  }

  await browser.close();
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  console.log(`screenshots: ${OUT}`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(2);
});
