/**
 * Floor texture build.
 *
 * The three arena textures arrive as 1024 px PNGs totalling 3.6 MB, against a whole-repo
 * budget of a 353 kB main chunk and a 581 kB lazy arena chunk. This shrinks each one to a
 * tileable 256 px WebP and writes it where Vite will fingerprint it, so a missing texture
 * is a build error rather than a 200 response full of HTML.
 *
 * Usage: npm run floors:build
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const SRC = resolve(process.cwd(), 'docs/bomberman');
const OUT = resolve(process.cwd(), 'src/games/bomberman/assets');
const SIZE = 256;
const QUALITY = 0.72;
const LIMIT = 40 * 1024;

const FLOORS = ['grass', 'sand', 'stone'];

function findBrowser() {
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? `${process.env.HOME}/Library/Caches/ms-playwright`;
  if (!existsSync(cache)) return undefined;
  const dirs = readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().reverse();
  for (const dir of dirs) {
    const app = `${cache}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
    if (existsSync(app)) return app;
  }
  return undefined;
}

const executablePath = findBrowser();
if (!executablePath) {
  console.error('No cached Chromium. Set PLAYWRIGHT_BROWSERS_PATH or run the browser install first.');
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath });
const page = await (await browser.newContext()).newPage();
await page.goto('about:blank');

let failed = 0;

for (const name of FLOORS) {
  const from = `${SRC}/floor-${name}.png`;
  if (!existsSync(from)) {
    console.error(`missing ${from}`);
    failed += 1;
    continue;
  }
  // The page cannot read local files, so the source bytes travel as a data URL instead.
  const source = `data:image/png;base64,${readFileSync(from).toString('base64')}`;
  const dataUrl = await page.evaluate(
    async ({ src, size, quality }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, size, size);
      return canvas.toDataURL('image/webp', quality);
    },
    { src: source, size: SIZE, quality: QUALITY },
  );

  const base64 = dataUrl.split(',')[1];
  const buf = Buffer.from(base64, 'base64');
  const to = `${OUT}/floor-${name}.webp`;
  writeFileSync(to, buf);
  const kb = buf.length / 1024;
  const ok = buf.length <= LIMIT;
  if (!ok) failed += 1;
  console.log(`${ok ? 'OK  ' : 'OVER'} floor-${name}.webp  ${kb.toFixed(1)} kB  (limit ${LIMIT / 1024} kB)`);
}

await browser.close();
console.log(`\ntotal: ${FLOORS.length} textures in ${OUT}`);
process.exit(failed ? 1 : 0);
