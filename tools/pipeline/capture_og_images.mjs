#!/usr/bin/env node
// tools/pipeline/capture_og_images.mjs — the og:image splash-shot pipeline.
//
// Every live/beta game ships a 1200×630 link preview at
// `games/<id>/assets/og-image.jpg`. That file is NOT hand-drawn art: it is a
// screenshot of the game's own splash/menu screen, taken by this tool against a
// locally served copy of the repo, and it is what the per-game Open Graph /
// Twitter meta block points at (and what the Studio Games workspace shows as a
// game's preview tile). Regenerate rather than edit.
//
//   # serve the repo first (any static server on the repo root)
//   python3 -m http.server 8000
//
//   # playwright is NOT a repo dependency — it resolves by default from
//   # tools-local/playwright/node_modules (a sibling of this repo checkout;
//   # see tools/qa/README.md), or pass --playwright <dir> to point elsewhere
//   # (must match the cached Chromium build: 1.52.0)
//   node tools/pipeline/capture_og_images.mjs --playwright /tmp/pw/node_modules
//
// Flags
//   --playwright <dir>  node_modules dir holding playwright@1.52.0 (or set
//                       PLAYWRIGHT_MODULE_PATH / NODE_PATH)
//   --base <url>        base URL of the served repo   (default http://localhost:8000)
//   --status a,b        registry statuses to capture  (default live,beta)
//   --only a,b          capture just these game ids   (overrides --status)
//   --force             re-capture games that already have an og-image.jpg
//                       (default: skip existing, so curated shots survive)
//   --settle <ms>       extra wait after network-idle  (default 2500)
//   --layout-scale <n>  lay the page out at n× the og size and shrink the shot
//                       back down (default 2: 2400×1260 CSS px → 1200×630 px).
//                       1 captures at natural size — that reads as a zoomed,
//                       cropped "fullscreen" shot, not a reduced tile (the
//                       2026-07-25 batch-1 mistake); 2 shows the whole splash.
//   --concurrency <n>   parallel pages                 (default 3)
//   --quality <n>       starting JPEG quality          (default 82)
//   --max-kb <n>        re-encode softer above this    (default 200)
//   --json <path>       write the machine report here
//   --root <path>       repo root (default: two levels up from this file)
//
// QA: a capture whose luma standard deviation is near zero is a page that
// failed to render (blank canvas, dead splash, 404). Those are REPORTED and
// the file is NOT written — a game without a trustworthy shot ships its meta
// block without og:image rather than shipping a grey rectangle.
//
// Provenance: see docs/asset-provenance.md and each game's ASSETS.md.

import { mkdir, writeFile, access } from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---- args ------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);
const list = (value) => (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : []);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(flag('root') || path.join(HERE, '..', '..'));
const BASE = (flag('base') || 'http://localhost:8000').replace(/\/$/, '');
const ONLY = list(flag('only'));
const STATUSES = list(flag('status') || 'live,beta');
const FORCE = has('force');
const SETTLE = Number(flag('settle', '2500'));
const CONCURRENCY = Math.max(1, Number(flag('concurrency', '3')));
const QUALITY = Number(flag('quality', '82'));
const MAX_KB = Number(flag('max-kb', '200'));
const JSON_OUT = flag('json');

const WIDTH = 1200;
const HEIGHT = 630;
// Lay out at LAYOUT_SCALE× and emulate deviceScaleFactor 1/LAYOUT_SCALE so the
// screenshot buffer stays exactly WIDTH×HEIGHT physical pixels while the page
// sees a larger viewport — the whole splash lands in frame, reduced.
const LAYOUT_SCALE = Math.max(1, Number(flag('layout-scale', '2')));
const BLANK_STDDEV = 2.0; // luma stddev at or below this = the page never rendered

// ---- playwright ------------------------------------------------------------
// Playwright is deliberately NOT a repo dependency (this is a no-build repo).
// Install it in a scratch dir and point this tool at it. ESM ignores NODE_PATH,
// so an out-of-tree install is loaded by explicit path.
async function loadChromium() {
  const dirs = [
    flag('playwright'),
    process.env.PLAYWRIGHT_MODULE_PATH,
    ...String(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean),
    // tools-local/playwright/ is a sibling of the repo checkout, outside the
    // repo but not in /private/tmp (wiped on reboot). See tools/qa/README.md.
    path.resolve(ROOT, '..', 'tools-local/playwright/node_modules'),
  ].filter(Boolean);
  const candidates = [
    'playwright',
    ...dirs.flatMap((dir) => {
      const base = /(^|\/)playwright$/.test(dir) ? dir : path.join(dir, 'playwright');
      return [path.join(base, 'index.mjs'), path.join(base, 'index.js')];
    }),
  ];
  for (const candidate of candidates) {
    try {
      const specifier = candidate === 'playwright' ? candidate : pathToFileURL(candidate).href;
      const mod = await import(specifier);
      const chromium = mod.chromium || mod.default?.chromium;
      if (chromium) return chromium;
    } catch { /* try the next candidate */ }
  }
  return null;
}

const chromium = await loadChromium();
if (!chromium) {
  console.error(
    'playwright is not resolvable. It is deliberately not a repo dependency.\n' +
    'See tools/qa/README.md to install it into tools-local/playwright/ (a sibling\n' +
    'of this repo checkout), or point at another copy with --playwright <dir>.\n' +
    '(the version must match the cached Chromium build in ~/Library/Caches/ms-playwright)');
  process.exit(2);
}

// ---- subjects --------------------------------------------------------------
const registry = JSON.parse(readFileSync(path.join(ROOT, 'games.json'), 'utf8'));
const allGames = Array.isArray(registry.games) ? registry.games : [];
const subjects = ONLY.length
  ? ONLY.map((id) => allGames.find((g) => g.id === id) || { id, status: '(unregistered)' })
  : allGames.filter((g) => STATUSES.includes(g.status));

if (!subjects.length) { console.error('no games matched the selection'); process.exit(2); }

const outPath = (id) => path.join(ROOT, 'games', id, 'assets', 'og-image.jpg');
const fileExists = async (p) => { try { await access(p, FS.F_OK); return true; } catch { return false; } };

// ---- blank detection -------------------------------------------------------
// Decode the JPEG we just produced inside a scratch page and measure the luma
// standard deviation over a downsampled grid. data: URLs do not taint a canvas,
// so getImageData works without any native image dependency.
async function lumaStats(scratchPage, buffer) {
  const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
  return scratchPage.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const w = 160, h = 84;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    let sum = 0, sumSq = 0;
    const n = w * h;
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += luma; sumSq += luma * luma;
    }
    const mean = sum / n;
    return { mean, stddev: Math.sqrt(Math.max(0, sumSq / n - mean * mean)) };
  }, dataUrl);
}

// ---- capture ---------------------------------------------------------------
async function captureOne(context, scratchPage, game) {
  const id = game.id;
  const result = { id, status: game.status, ok: false, skipped: false, bytes: 0, consoleErrors: 0 };
  const target = outPath(id);

  if (!FORCE && await fileExists(target)) {
    result.skipped = true; result.reason = 'exists (use --force to replace)';
    return result;
  }

  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (error) => errors.push(String(error.message || error)));

  try {
    const url = `${BASE}/games/${id}/`;
    const response = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    if (response && response.status() >= 400) throw new Error(`HTTP ${response.status()} for ${url}`);
    // Splash art, webfonts and engine boot all land after `load`.
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null)).catch(() => {});
    await page.waitForTimeout(SETTLE);

    let quality = QUALITY;
    let buffer = await page.screenshot({ type: 'jpeg', quality });
    // Illustrated splashes can blow past the size budget at q82 — step down
    // rather than ship a 400KB link preview.
    for (const softer of [68, 55, 45]) {
      if (buffer.length <= MAX_KB * 1024) break;
      quality = softer;
      buffer = await page.screenshot({ type: 'jpeg', quality });
    }

    const stats = await lumaStats(scratchPage, buffer);
    result.stddev = Number(stats.stddev.toFixed(2));
    result.mean = Number(stats.mean.toFixed(1));
    result.quality = quality;
    result.consoleErrors = errors.length;
    result.consoleSample = errors.slice(0, 2);

    if (stats.stddev <= BLANK_STDDEV) {
      result.reason = `blank render (luma stddev ${result.stddev})`;
      return result;
    }

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buffer);
    result.ok = true;
    result.bytes = buffer.length;
    return result;
  } catch (error) {
    result.reason = String(error.message || error).split('\n')[0];
    result.consoleErrors = errors.length;
    return result;
  } finally {
    await page.close().catch(() => {});
  }
}

// ---- run -------------------------------------------------------------------
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: WIDTH * LAYOUT_SCALE, height: HEIGHT * LAYOUT_SCALE },
  deviceScaleFactor: 1 / LAYOUT_SCALE,
  reducedMotion: 'reduce',
});
const scratchPage = await context.newPage();
await scratchPage.goto('about:blank');

const queue = subjects.slice();
const results = [];
async function worker() {
  for (;;) {
    const game = queue.shift();
    if (!game) return;
    const r = await captureOne(context, scratchPage, game);
    results.push(r);
    const mark = r.ok ? 'ok  ' : (r.skipped ? 'skip' : 'FAIL');
    const size = r.bytes ? ` ${(r.bytes / 1024).toFixed(0)}KB q${r.quality}` : '';
    console.log(`${mark} ${r.id}${size}${r.reason ? ` — ${r.reason}` : ''}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

await context.close();
await browser.close();

results.sort((a, b) => a.id.localeCompare(b.id));
const captured = results.filter((r) => r.ok);
const failed = results.filter((r) => !r.ok && !r.skipped);
const skipped = results.filter((r) => r.skipped);
const totalBytes = captured.reduce((sum, r) => sum + r.bytes, 0);

console.log(`\ncapture_og_images: ${results.length} game(s) · ${captured.length} captured · ` +
  `${skipped.length} skipped · ${failed.length} failed · ${(totalBytes / 1024 / 1024).toFixed(2)} MB written`);
if (failed.length) console.log(`failed: ${failed.map((r) => r.id).join(', ')}`);

if (JSON_OUT) {
  await writeFile(JSON_OUT, JSON.stringify({
    base: BASE, settle: SETTLE,
    counts: { total: results.length, captured: captured.length, skipped: skipped.length, failed: failed.length },
    totalBytes, results,
  }, null, 2));
  console.log(`report → ${JSON_OUT}`);
}

process.exit(failed.length ? 1 : 0);
