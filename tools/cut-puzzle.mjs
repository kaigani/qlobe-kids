#!/usr/bin/env node
// tools/cut-puzzle.mjs — pre-cut an image into jigsaw piece PNGs.
//
// The asset-pipeline face of shared/js/puzzle-cutter.js: give it any image and
// a grid, get back one transparent PNG per piece plus a pieces.json manifest a
// game can load, the full cut pattern as outline.svg, and two QA renders —
// assembled.png (must look identical to the source: proves the pieces
// reassemble seamlessly) and preview.png (exploded, shows the interlocking
// shapes).
//
// Geometry is seeded and deterministic, but the rendered PNGs are the durable
// artifact — commit those with the game, not just the seed (see the seed
// contract note in shared/js/puzzle-cutter.js).
//
// Rendering happens in a real browser page (canvas), launched the way every
// QA driver here does it: Playwright loaded out of tree, no npm, no
// package.json. A throwaway local HTTP server serves the repo so the shared
// module can be imported under an http origin (file:// blocks ES modules).
//
// Usage:
//   node tools/cut-puzzle.mjs <image> [--grid 3x2] [--seed name-or-number]
//     [--out <dir>]            default: <image dir>/<stem>-pieces/
//     [--max <px>]             downscale so the longest side ≤ px (default: keep)
//     [--tab-depth 0.3] [--wobble 0.045] [--pos-jitter 0.07] [--corner-jitter 0.05]
//     [--no-outline] [--no-bevel]
//     [--playwright <node_modules dir>]   (or $PLAYWRIGHT_MODULE_PATH; defaults
//                                          to ../tools-local/playwright/node_modules)
//
// Example:
//   node tools/cut-puzzle.mjs assets/hub/tiles/sound-sprouts.jpg --grid 4x3 \
//     --seed sprouts-1 --out games/my-game/assets/puzzle

import http from 'node:http';
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createArgs, launchChrome } from './qa/lib/driver.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = createArgs();

// Positional = anything that is neither a --flag nor the value of the flag
// right before it. Put the image first and this never guesses wrong.
const positional = args.raw.filter((a, i) => !a.startsWith('--') && (i === 0 || !args.raw[i - 1].startsWith('--')));
if (!positional[0]) {
  console.error('usage: node tools/cut-puzzle.mjs <image> [--grid 3x2] [--seed n] [--out dir]');
  process.exit(2);
}
const source = path.resolve(positional[0]);
const grid = (args.flag('grid') || '3x2').toLowerCase().split('x').map(Number);
if (grid.length !== 2 || !grid.every((n) => Number.isInteger(n) && n >= 1)) {
  console.error(`bad --grid ${args.flag('grid')} — expected COLSxROWS like 3x2`);
  process.exit(2);
}
const [cols, rows] = grid;
const rawSeed = args.flag('seed') ?? '1';
const seed = /^\d+$/.test(rawSeed) ? Number(rawSeed) : rawSeed;
const outDir = path.resolve(args.flag('out')
  || path.join(path.dirname(source), `${path.parse(source).name}-pieces`));
const maxDim = args.num('max', 0);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
};

// Minimal repo server: only exists so /shared/js/puzzle-cutter.js can be
// imported as a module under an http origin. /__blank__.html is the page.
async function serveRepo(root) {
  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    if (pathname === '/__blank__.html') {
      res.setHeader('content-type', 'text/html');
      res.end('<!doctype html><meta charset="utf-8"><title>cut-puzzle</title>');
      return;
    }
    const file = path.resolve(root, `.${pathname}`);
    const relative = path.relative(root, file);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      res.statusCode = 403;
      res.end();
      return;
    }
    try {
      const data = await readFile(file);
      res.setHeader('content-type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
      res.end(data);
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

const imageBytes = await readFile(source);
const dataUrl = `data:${MIME[path.extname(source).toLowerCase()] || 'image/png'};base64,${imageBytes.toString('base64')}`;

const geometry = {
  rows, cols, seed,
  tabDepth: args.num('tab-depth', 0.3),
  wobble: args.num('wobble', 0.045),
  posJitter: args.num('pos-jitter', 0.07),
  cornerJitter: args.num('corner-jitter', 0.05),
};
const render = {
  outline: args.has('no-outline') ? false : {},
  bevel: args.has('no-bevel') ? false : {},
};

const { server, base } = await serveRepo(REPO_ROOT);
const browser = await launchChrome();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (error) => { console.error(`pageerror: ${error}`); process.exitCode = 1; });
  await page.goto(`${base}/__blank__.html`);

  const result = await page.evaluate(async ({ dataUrl: url, geometry: geo, render: look, maxDim: max }) => {
    const mod = await import('/shared/js/puzzle-cutter.js');
    let img = new Image();
    img.src = url;
    await img.decode();
    let sourceEl = img;
    if (max > 0 && Math.max(img.naturalWidth, img.naturalHeight) > max) {
      const scale = max / Math.max(img.naturalWidth, img.naturalHeight);
      const scaled = document.createElement('canvas');
      scaled.width = Math.round(img.naturalWidth * scale);
      scaled.height = Math.round(img.naturalHeight * scale);
      scaled.getContext('2d').drawImage(img, 0, 0, scaled.width, scaled.height);
      sourceEl = scaled;
    }

    const puzzle = mod.cutImage(sourceEl, { ...geo, ...look });

    // assembled.png — every piece back at its (x, y). If this doesn't look
    // exactly like the source (minus outline/bevel shading), the cut is wrong.
    const assembled = document.createElement('canvas');
    assembled.width = puzzle.width;
    assembled.height = puzzle.height;
    const actx = assembled.getContext('2d');
    for (const piece of puzzle.pieces) actx.drawImage(piece.canvas, piece.x, piece.y);

    // preview.png — pieces pushed apart radially so the knobs read clearly.
    const pad = Math.round(Math.min(puzzle.cellWidth, puzzle.cellHeight) * 0.6);
    const preview = document.createElement('canvas');
    preview.width = puzzle.width + pad * 2;
    preview.height = puzzle.height + pad * 2;
    const pctx = preview.getContext('2d');
    pctx.fillStyle = '#fffef7';
    pctx.fillRect(0, 0, preview.width, preview.height);
    for (const piece of puzzle.pieces) {
      const dx = (piece.cell.x + piece.cell.width / 2 - puzzle.width / 2) * 0.16;
      const dy = (piece.cell.y + piece.cell.height / 2 - puzzle.height / 2) * 0.16;
      pctx.drawImage(piece.canvas, pad + piece.x + dx, pad + piece.y + dy);
    }

    return {
      width: puzzle.width,
      height: puzzle.height,
      seed: puzzle.seed,
      outlineSvg: mod.outlineSvg(puzzle),
      assembled: assembled.toDataURL('image/png'),
      preview: preview.toDataURL('image/png'),
      pieces: puzzle.pieces.map((piece) => ({
        row: piece.row,
        col: piece.col,
        index: piece.index,
        x: piece.x,
        y: piece.y,
        width: piece.canvas.width,
        height: piece.canvas.height,
        cell: piece.cell,
        edges: piece.edges,
        path: piece.path,
        png: piece.canvas.toDataURL('image/png'),
      })),
    };
  }, { dataUrl, geometry, render, maxDim });

  await mkdir(outDir, { recursive: true });
  const writePng = (name, url) => writeFile(path.join(outDir, name), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));

  const manifest = {
    source: path.relative(REPO_ROOT, source),
    width: result.width,
    height: result.height,
    rows,
    cols,
    seed: result.seed,
    seedInput: rawSeed,
    tabDepth: geometry.tabDepth,
    wobble: geometry.wobble,
    posJitter: geometry.posJitter,
    cornerJitter: geometry.cornerJitter,
    pieces: [],
  };
  for (const piece of result.pieces) {
    const file = `piece-r${piece.row}c${piece.col}.png`;
    await writePng(file, piece.png);
    manifest.pieces.push({
      file,
      row: piece.row,
      col: piece.col,
      index: piece.index,
      x: piece.x,
      y: piece.y,
      width: piece.width,
      height: piece.height,
      cell: piece.cell,
      edges: piece.edges,
      path: piece.path,
    });
  }
  await writePng('assembled.png', result.assembled);
  await writePng('preview.png', result.preview);
  await writeFile(path.join(outDir, 'outline.svg'), result.outlineSvg);
  await writeFile(path.join(outDir, 'pieces.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`${cols}x${rows} · seed ${rawSeed} · ${result.pieces.length} pieces · ${result.width}×${result.height}`);
  console.log(`wrote ${result.pieces.length} piece PNGs + pieces.json + outline.svg + assembled.png + preview.png`);
  console.log(`→ ${outDir}`);
} finally {
  await browser.close();
  server.close();
}
