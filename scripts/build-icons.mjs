/**
 * App icon build.
 *
 * public/favicon.svg is the only artwork the hub has for itself, and a web manifest needs
 * real PNGs: Safari reads apple-touch-icon as a bitmap and will not use an SVG for the
 * home-screen icon. This machine has no ImageMagick and no PIL, so the raster step runs in
 * the same headless Chromium the gameplay checks already use.
 *
 * One-time tool, not part of CI: the three PNGs are committed, so a runner never needs a
 * browser binary to build the site.
 *
 * Usage: npm run icons:build
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const SRC = resolve(process.cwd(), 'public/favicon.svg');
const OUT = resolve(process.cwd(), 'public');

/** The same white the favicon's own plate uses and the manifest declares as theme_color. */
const BACKGROUND = '#ffffff';

const ICONS = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

function findBrowser() {
  if (process.env.BM_CHROME) return process.env.BM_CHROME;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? `${process.env.HOME}/Library/Caches/ms-playwright`;
  if (!existsSync(cache)) return undefined;
  for (const dir of readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const candidates = [
      `${cache}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
      `${cache}/${dir}/chrome-linux/chrome`,
    ];
    const hit = candidates.find((p) => existsSync(p));
    if (hit) return hit;
  }
  return undefined;
}

const executablePath = findBrowser();
if (!executablePath) {
  console.error('Tidak ada Chromium di cache. Set BM_CHROME=/path/to/chrome lalu ulangi npm run icons:build.');
  process.exit(2);
}

const svg = readFileSync(SRC, 'utf8');
const browser = await chromium.launch({ executablePath });
let failed = 0;

for (const { file, size } of ICONS) {
  const ctx = await browser.newContext({ viewport: { width: size, height: size } });
  const page = await ctx.newPage();
  const doc =
    `<!doctype html><html><head><meta charset="utf-8"></head>` +
    `<body style="margin:0;padding:0;background:${BACKGROUND}">${svg}</body></html>`;
  await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(doc)}`, { waitUntil: 'load' });
  const to = resolve(OUT, file);
  await page.screenshot({ path: to });
  await ctx.close();

  const bytes = readFileSync(to).length;
  if (!bytes) failed += 1;
  console.log(`${bytes ? 'OK  ' : 'KOSONG'} ${file}  ${size}x${size}  ${(bytes / 1024).toFixed(1)} kB`);
}

await browser.close();
console.log(`\ntotal: ${ICONS.length} ikon di ${OUT}`);
process.exit(failed ? 1 : 0);
