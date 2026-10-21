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
  /* The large board is a choice a player can make per seat count, so the worst case gets
     measured rather than guessed: 21 columns of a four-seat arena on a 375 px phone. */
  { name: 'desktop-large', width: 1280, height: 800, floor: 'stone', size: 'besar', seats: 4 },
  { name: 'phone-portrait-large', width: 375, height: 667, touch: true, floor: 'grass', size: 'besar', seats: 4 },
  { name: 'phone-landscape-large', width: 667, height: 375, touch: true, floor: 'sand', size: 'besar', seats: 4 },
  /* The widest board is measured on both a desktop and the screen that will actually
     shrink it: 25 columns of a four-seat arena on a phone. */
  { name: 'desktop-luas', width: 1280, height: 800, floor: 'grass', size: 'luas', seats: 4 },
  { name: 'phone-landscape-luas', width: 667, height: 375, touch: true, floor: 'sand', size: 'luas', seats: 4 },
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
  /* The element box and the drawing inside it are different things: an svg with
     preserveAspectRatio="meet" shrinks its content into the box, so dividing the box width
     by the column count reports a cell that was never painted. This is the scale the
     browser actually used. */
  const scale = rect && parts[2] ? Math.min(rect.width / parts[2], rect.height / parts[3]) : 0;
  const bom = document.querySelector('[data-testid="bomberman-bom"]')?.getBoundingClientRect();
  const status = document.querySelector('[data-testid="bomberman-status"]')?.getBoundingClientRect();
  return {
    scrollWidth: doc.scrollWidth,
    clientWidth: doc.clientWidth,
    boardWidth: rect ? Math.round(rect.width) : 0,
    boardHeight: rect ? Math.round(rect.height) : 0,
    boardTop: rect ? Math.round(rect.top) : 0,
    cols,
    cellPx: +(scale * 40).toFixed(1),
    drawnWidth: Math.round(parts[2] * scale),
    drawnHeight: Math.round(parts[3] * scale),
    bomW: bom ? Math.round(bom.width) : 0,
    bomH: bom ? Math.round(bom.height) : 0,
    statusH: status ? Math.round(status.height) : 0,
    sprites: document.querySelectorAll('[data-testid="bomberman-board"] svg').length,
  };
};

/* WallGo on a desktop pointer.
 *
 * jsdom dispatches fireEvent.click straight onto the node that carries the handler, so it
 * cannot see a browser behaviour where pointer capture moves the click somewhere else. The
 * one-click mouse rule only has a real meaning in a real browser, which is why it lives here
 * instead of in tests/ui.
 */
async function checkWallGamePlacement(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    hasTouch: false,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const errors = [];
  const noise = (text) => /_vercel\/(insights|speed-insights)/.test(text ?? '');
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (noise(m.text()) || noise(m.location()?.url)) return;
    errors.push(`${m.text()} @ ${m.location()?.url ?? '?'}`);
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('response', (r) => {
    if (r.status() >= 400 && !noise(r.url())) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });

  await page.goto(`${BASE}/wall-game/local`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="start-game-btn"]', { timeout: 15000 });
  await page.click('[data-testid="start-game-btn"]');
  await page.waitForSelector('[data-testid="wall-slots-layer"]', { timeout: 15000 });

  const read = () =>
    page.evaluate(() => {
      const roster = document.querySelector('[data-testid="roster-player-0"]')?.textContent ?? '';
      const m = /Sisa:\s*(\d+)/.exec(roster);
      return {
        placed: document.querySelectorAll('[data-testid^="placed-wall-"]').length,
        left: m ? Number(m[1]) : -1,
        staged: document.querySelectorAll('[data-testid="staged-wall-preview"]').length,
      };
    });

  // The middle grooves are the ones a fresh board cannot turn into a trap, so try them first.
  const targets = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="wallgame-board-svg"]')?.getBoundingClientRect();
    if (!box) return [];
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    return Array.from(document.querySelectorAll('[data-testid^="groove-cross-"]'))
      .map((el) => {
        const b = el.getBoundingClientRect();
        const x = b.left + b.width / 2;
        const y = b.top + b.height / 2;
        return { id: el.getAttribute('data-testid'), x, y, d: Math.hypot(x - cx, y - cy) };
      })
      .sort((a, b) => a.d - b.d)
      .slice(0, 5)
      .map(({ id, x, y }) => ({ id, x: Math.round(x), y: Math.round(y) }));
  });

  const before = await read();
  let hit = null;
  for (const t of targets) {
    await page.mouse.move(t.x, t.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(120);
    const now = await read();
    if (now.placed > before.placed) {
      hit = { ...t, after: now };
      break;
    }
  }

  check(
    'wallgo desktop: one mouse click places a wall',
    !!hit && hit.after.placed === before.placed + 1 && hit.after.left === before.left - 1,
    `placed ${before.placed} -> ${hit ? hit.after.placed : before.placed}, seat0 ${before.left} -> ${
      hit ? hit.after.left : before.left
    }, hovered ${targets.map((t) => t.id).join(' ')}`,
  );

  await page.screenshot({ path: `${OUT}/wallgo-desktop.png` });
  check('wallgo desktop: no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));

  await ctx.close();
}

/* The setup screen is a normal document flow page, so "is the column centered" is a
   measurement, not a snapshot: the widest block defines the column, and the two gaps
   between it and the viewport edges must be equal. */
const SETUP_COLUMN = () => {
  const root = document.querySelector('[data-testid="bomberman-setup"]');
  const nodes = Array.from(root ? root.querySelectorAll('.bm-back--page, h2, .bm-lede, .bm-pick, .bm-go') : []);
  const boxes = nodes.map((el) => el.getBoundingClientRect());
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((b) => b.left));
  const right = Math.max(...boxes.map((b) => b.right));
  return {
    blocks: boxes.length,
    x: Math.round(left),
    width: Math.round(right - left),
    leftGap: Math.round(left),
    rightGap: Math.round(window.innerWidth - right),
    viewport: window.innerWidth,
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

    const query = new URLSearchParams();
    if (vp.floor) query.set('floor', vp.floor);
    if (vp.size) query.set('size', vp.size);
    if (vp.seats) query.set('seats', String(vp.seats));
    const qs = query.toString();
    await page.goto(`${BASE}/bomberman/local${qs ? `?${qs}` : ''}`, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid="bomberman-start"]', { timeout: 15000 });
    check(`${vp.name}: setup screen renders`, true);
    await page.screenshot({ path: `${OUT}/${vp.name}-setup.png` });

    /* Centering has to be measured before the arena replaces this page. The 4 px allowance
       covers rounding at deviceScaleFactor 2; the bug this catches is a 500 px+ imbalance. */
    const column = await page.evaluate(SETUP_COLUMN);
    check(
      `${vp.name}: setup column is centered`,
      !!column && Math.abs(column.leftGap - column.rightGap) <= 4,
      column
        ? `x ${column.x}, width ${column.width} of ${column.viewport}, gap ${column.leftGap} / ${column.rightGap}, ${column.blocks} blocks`
        : 'no setup blocks measured',
    );

    await page.click('[data-testid="bomberman-start"]');
    await page.waitForSelector('[data-testid="bomberman-board"]', { timeout: 5000 });
    if (vp.size || vp.seats) {
      const box = await page.evaluate(() => document.querySelector('[data-testid="bomberman-board"]')?.getAttribute('viewBox'));
      const want =
        vp.seats === 4
          ? vp.size === 'luas'
            ? '0 0 1000 680'
            : vp.size === 'besar'
              ? '0 0 840 600'
              : '0 0 600 440'
          : vp.size === 'besar'
            ? '0 0 600 520'
            : '0 0 440 360';
      check(`${vp.name}: opens the arena it was asked for`, box === want, `${box} vs ${want}`);
    }
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
    check(
      `${vp.name}: the board box is the grid, no letterbox`,
      Math.abs(before.drawnWidth - before.boardWidth) <= 2 && Math.abs(before.drawnHeight - before.boardHeight) <= 2,
      `box ${before.boardWidth}x${before.boardHeight}, drawn ${before.drawnWidth}x${before.drawnHeight}`,
    );
    check(`${vp.name}: sprites are painted`, before.sprites >= 20, `${before.sprites} svg nodes, cell ${before.cellPx}px`);

    /* Four buttons for four directions, pressed and held one at a time, straight after the
       countdown: later in the run a round break can start ignoring input, and a facing that
       never changes would pass for the wrong reason. The facing is written into the player
       node signature by the movement rule itself, so this reads the game, not the widget.
       The walk is tested on right-then-left from the spawn corner, where the clearance ring
       guarantees two open cells; the other two arrows face the border by design, and an
       arrow blocked by a pillar is the map, not a broken control. */
    if (vp.touch) {
      const press = async (d) => {
        const bb = await page.locator(`[data-testid="bomberman-dir-${d}"]`).boundingBox();
        const start = await page.evaluate(() => document.querySelector('[data-sig^="player"]')?.getAttribute('transform') ?? '');
        await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(420);
        const r = await page.evaluate(() => {
          const node = document.querySelector('[data-sig^="player"]');
          const sig = node?.getAttribute('data-sig') ?? '';
          return {
            facing: /^player:[^:]+:[^:]+:([^:]+)/.exec(sig)?.[1] ?? '',
            transform: node?.getAttribute('transform') ?? '',
          };
        });
        await page.mouse.up();
        return { facing: r.facing, moved: r.transform !== start };
      };

      const out = [];
      out.push(await press('right'));
      out.push(await press('left'));
      const facings = { right: out[0].facing, left: out[1].facing };
      for (const d of ['up', 'down']) facings[d] = (await press(d)).facing;
      check(
        `${vp.name}: every arrow turns the runner the way it points`,
        ['up', 'down', 'left', 'right'].every((d) => facings[d] === d),
        JSON.stringify(facings),
      );
      check(`${vp.name}: holding an arrow walks`, out.every((o) => o.moved), `right ${out[0].moved}, left ${out[1].moved}`);

      const padBox = await page.locator('[data-testid="bomberman-dpad"]').boundingBox();
      const boardBox = await page.locator('[data-testid="bomberman-board"]').boundingBox();
      const ox = Math.max(0, Math.min(padBox.x + padBox.width, boardBox.x + boardBox.width) - Math.max(padBox.x, boardBox.x));
      const oy = Math.max(0, Math.min(padBox.y + padBox.height, boardBox.y + boardBox.height) - Math.max(padBox.y, boardBox.y));
      check(
        `${vp.name}: the arrows sit beside the arena, not on it`,
        ox * oy === 0,
        `${Math.round(ox * oy)} px2 of ${padBox.width}x${padBox.height} pad over the board`,
      );
      const cells = await page.locator('[data-testid^="bomberman-dir-"]').evaluateAll((nodes) =>
        nodes.map((n) => {
          const r = n.getBoundingClientRect();
          return `${Math.round(r.width)}x${Math.round(r.height)}`;
        }),
      );
      check(`${vp.name}: arrows clear the touch floor`, cells.every((c) => parseInt(c, 10) >= 44), cells.join(' '));
      /* The three numbers come from sweeping --bm-dir upward and measuring where the cross
         starts covering the arena: 92 px is the largest clean value on a tall portrait
         screen, 64 px on a short one (360x640 covers 21419 px2 at 92), and 48 px in
         landscape (52 px covers 993 px2 of the 21x15 board). Pinned here so a later change
         that quietly trades arena for buttons shows up as a failure. */
      const expectArrow = vp.height > vp.width ? (vp.height > 700 ? 92 : 64) : 48;
      check(
        `${vp.name}: arrows are the size the sweep allowed`,
        cells.every((c) => parseInt(c, 10) === expectArrow),
        `${cells.join(' ')}, expected ${expectArrow}px`,
      );
    }

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
    // Counted per owner, because the other seats are bots that plant their own bombs, and
    // the quota under test is the one the human seat holds.
    for (let i = 0; i < 40; i++) await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    const quota = await page.evaluate(() => {
      const text = document.querySelector('[data-testid="bomberman-status"]')?.textContent ?? '';
      const m = /Bom \d+\/(\d+)/.exec(text);
      return {
        mine: document.querySelectorAll('[data-sig^="bomb:0"]').length,
        all: document.querySelectorAll('[data-sig^="bomb"]').length,
        max: m ? Number(m[1]) : 1,
        text,
      };
    });
    check(
      `${vp.name}: key spam cannot beat the bomb quota`,
      quota.mine <= quota.max,
      `${quota.mine} own bombs, quota ${quota.max}, ${quota.all} on the floor [${quota.text}]`,
    );

    // Abnormal: the board must not slide when the status line changes length.
    const afterMove = await page.evaluate(MEASURE);
    check(`${vp.name}: board does not shift during play`, Math.abs(afterMove.boardTop - topBefore) <= 1, `${topBefore} -> ${afterMove.boardTop}`);

    // Abnormal: resize mid-match.
    await page.setViewportSize({ width: Math.round(vp.width * 0.78), height: Math.round(vp.height * 0.88) });
    await page.waitForTimeout(500);
    const after = await page.evaluate(MEASURE);
    check(`${vp.name}: survives a mid-match resize`, after.boardWidth > 80, `board ${after.boardWidth}px`);

    if (vp.touch) {
      check(`${vp.name}: BOM button is offered`, after.bomW >= 60, `BOM button ${after.bomW}x${after.bomH}`);
      const pad = await page.locator('[data-testid="bomberman-dpad"]').boundingBox();
      const size = page.viewportSize();
      const fits =
        !!pad && pad.x >= 0 && pad.y >= 0 && pad.x + pad.width <= size.width + 1 && pad.y + pad.height <= size.height + 1;
      check(
        `${vp.name}: the arrows stay on screen after a resize`,
        fits,
        pad ? `${Math.round(pad.x)},${Math.round(pad.y)} ${Math.round(pad.width)}x${Math.round(pad.height)} in ${size.width}x${size.height}` : 'missing',
      );
    }

    await page.screenshot({ path: `${OUT}/${vp.name}.png` });
    check(`${vp.name}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));

    await ctx.close();
  }

  await checkWallGamePlacement(browser);

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
