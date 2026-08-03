#!/usr/bin/env node
// tools/pipeline/gen-head-meta.mjs — keep each games/<id>/index.html <head>
// share-meta block in step with that game's game.json.
//
//   node tools/pipeline/gen-head-meta.mjs                       # --check (default)
//   node tools/pipeline/gen-head-meta.mjs --check --only pattern-train,blend-train
//   node tools/pipeline/gen-head-meta.mjs --write
//   node tools/pipeline/gen-head-meta.mjs --write --only smell-jars
//   node tools/pipeline/gen-head-meta.mjs --check --root /path/to/qlobe-kids
//   node tools/pipeline/gen-head-meta.mjs --diff                # show the line-level drift
//
// WHAT IT OWNS
//   One contiguous run of tags in every game's <head>: from `<meta charset>`
//   down to and including `<link rel="apple-touch-icon">` — the viewport /
//   web-app / theme-color trio, <title>, description, the full Open Graph card,
//   the Twitter/X card, and the two icon links. See games/pattern-train/ for the
//   copy this generator was distilled from. Everything OUTSIDE that run —
//   <style>, <link rel="preload">, a game's own stylesheet, <body>, scripts — is
//   preserved byte-for-byte; the tool splices the block and re-joins the file.
//
// WHERE THE VALUES COME FROM
//   games/<id>/game.json is CANONICAL for the derived fields:
//     <title>, og:title, twitter:title      <- shareTitle (falls back to title)
//     og:site_name                          <- title
//     description, og:description,
//       twitter:description                 <- description
//   games.json owns `path`, so the absolute urls come from there:
//     og:url                                <- https://qlo.be/<path>
//     og:image, twitter:image               <- https://qlo.be/<path>assets/og-image.jpg
//   Constants the platform never varies: og:type=website, image type/width/
//   height (image/jpeg, 1200x630), twitter:card=summary_large_image, viewport,
//   both apple/mobile web-app capable flags, and the two icon hrefs.
//
// WHAT IT DELIBERATELY DOES NOT DERIVE  (page-owned, carried forward verbatim)
//   theme-color   — the browser-chrome colour, which tracks the PAGE's --qk-bg,
//                   not game.json's `accent` (they agree in most games and
//                   disagree in several, e.g. letter-road-driving: accent
//                   #1677d2 on a #a8d5ff page). Carried forward from the file;
//                   if the page has none, `accent` is used and the game is
//                   flagged so a human can confirm.
//   og:image:alt  — a hand-written sentence describing the share card. There is
//                   no field in game.json that holds it. Carried forward; a page
//                   that lacks one is BLOCKED from --write and reported, because
//                   the generator has nothing truthful to put there.
//
//   A game whose og:image points somewhere other than <path>assets/og-image.jpg
//   is likewise blocked from --write and reported (lunchbox-pack ships a
//   splash.jpg card) — that is a deliberate per-game choice, not drift.
//
// ESCAPING
//   Attribute and <title> text are escaped &, <, >, " -> entities; apostrophes
//   are left raw, matching every hand-written head in the repo.
//
// EXIT CODES
//   --check: 0 = every game agrees, 1 = drift and/or blocked games.
//   --write: 0 = clean, 1 = one or more games were skipped (blocked).
//   2 = bad usage.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://qlo.be/';

// The run of tags this tool owns, in order. Anything the head carries outside
// this list survives untouched because it lives outside the spliced block.
const BLOCK_START = /^[ \t]*<meta\s+charset=/im;
const BLOCK_END = /^[ \t]*<link\s+rel="apple-touch-icon"[^>]*>[ \t]*$/im;

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const opts = { mode: 'check', only: null, root: null, diff: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--write') opts.mode = 'write';
    else if (arg === '--check') opts.mode = 'check';
    else if (arg === '--diff') opts.diff = true;
    else if (arg === '--only') opts.only = splitIds(argv[++i]);
    else if (arg.startsWith('--only=')) opts.only = splitIds(arg.slice(7));
    else if (arg === '--root') opts.root = argv[++i];
    else if (arg.startsWith('--root=')) opts.root = arg.slice(7);
    else if (arg === '-h' || arg === '--help') opts.mode = 'help';
    else if (arg.startsWith('-')) fail(`unknown flag: ${arg}`);
    else if (!opts.root) opts.root = arg; // bare positional = repo root
    else fail(`unexpected argument: ${arg}`);
  }
  return opts;
}

const splitIds = (raw) => String(raw || '').split(/[\s,]+/).filter(Boolean);
function fail(message) { console.error(`gen-head-meta: ${message}`); process.exit(2); }

// Repo root: --root / bare arg, else the nearest ancestor of cwd holding both
// games.json and games/, else the tools/pipeline/../.. that ships this script.
function resolveRoot(hint) {
  const looksRight = (dir) => {
    try { return fs.statSync(path.join(dir, 'games.json')).isFile() && fs.statSync(path.join(dir, 'games')).isDirectory(); }
    catch { return false; }
  };
  if (hint) {
    const dir = path.resolve(hint);
    if (!looksRight(dir)) fail(`${dir} does not look like the repo root (no games.json + games/)`);
    return dir;
  }
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    if (looksRight(dir)) return dir;
    if (dir === path.dirname(dir)) break;
  }
  const shipped = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  if (looksRight(shipped)) return shipped;
  fail('could not find the repo root; pass --root <path>');
}

// ---------------------------------------------------------------- rendering

// Apostrophes stay raw: every hand-written head in the repo has them raw inside
// double-quoted attributes, and escaping them would show as drift in 40 games.
const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// `themeColor`, `image` and `imageAlt` arrive as the SOURCE text already in the
// file (see readCarried) and are spliced back verbatim — they are html-escaped
// already, and re-escaping would turn a carried `&amp;` into `&amp;amp;`.
// Everything else arrives as plain text out of game.json and gets escaped here.
function renderBlock({ themeColor, shareTitle, title, description, url, image, imageAlt }) {
  return [
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />',
    '  <meta name="apple-mobile-web-app-capable" content="yes" />',
    '  <meta name="mobile-web-app-capable" content="yes" />',
    `  <meta name="theme-color" content="${themeColor ?? ''}" />`,
    `  <title>${esc(shareTitle)}</title>`,
    `  <meta name="description" content="${esc(description)}" />`,
    '',
    '  <!-- Open Graph (Facebook, iMessage, Slack, WhatsApp, LinkedIn…) -->',
    '  <meta property="og:type" content="website" />',
    `  <meta property="og:site_name" content="${esc(title)}" />`,
    `  <meta property="og:title" content="${esc(shareTitle)}" />`,
    `  <meta property="og:description" content="${esc(description)}" />`,
    `  <meta property="og:url" content="${esc(url)}" />`,
    `  <meta property="og:image" content="${image ?? ''}" />`,
    '  <meta property="og:image:type" content="image/jpeg" />',
    '  <meta property="og:image:width" content="1200" />',
    '  <meta property="og:image:height" content="630" />',
    `  <meta property="og:image:alt" content="${imageAlt ?? ''}" />`,
    '',
    '  <!-- Twitter / X card -->',
    '  <meta name="twitter:card" content="summary_large_image" />',
    `  <meta name="twitter:title" content="${esc(shareTitle)}" />`,
    `  <meta name="twitter:description" content="${esc(description)}" />`,
    `  <meta name="twitter:image" content="${image ?? ''}" />`,
    '',
    '  <link rel="icon" type="image/png" href="../../assets/favicon.png" />',
    '  <link rel="apple-touch-icon" href="../../assets/apple-touch-icon.png" />',
  ].join('\n');
}

// ---------------------------------------------------------------- splicing

// Locate the owned run inside <head>. Returns {before, block, after} or null.
function locateBlock(html) {
  const headOpen = html.search(/<head\b[^>]*>/i);
  const headClose = html.search(/<\/head>/i);
  if (headOpen === -1 || headClose === -1) return null;
  const head = html.slice(headOpen, headClose);

  const startRel = head.search(BLOCK_START);
  if (startRel === -1) return null;
  const endMatch = head.match(BLOCK_END);
  if (!endMatch) return null;
  const endRel = head.indexOf(endMatch[0], startRel);
  if (endRel === -1) return null;

  const start = headOpen + startRel;
  const end = headOpen + endRel + endMatch[0].length;
  return { before: html.slice(0, start), block: html.slice(start, end), after: html.slice(end) };
}

const attr = (block, re) => { const m = block.match(re); return m ? m[1] : null; };

// The two page-owned values, read back out of whatever the file already has.
function readCarried(block) {
  return {
    themeColor: attr(block, /<meta\s+name="theme-color"\s+content="([^"]*)"/i),
    imageAlt: attr(block, /<meta\s+property="og:image:alt"\s+content="([^"]*)"/i),
    image: attr(block, /<meta\s+property="og:image"\s+content="([^"]*)"/i),
  };
}

// ---------------------------------------------------------------- comparison

function lineDiff(current, next) {
  const a = current.split('\n');
  const b = next.split('\n');
  const out = [];
  const max = Math.max(a.length, b.length);
  // Cheap positional diff is enough: the block is a fixed-order template, so a
  // real drift shows up as changed/added/removed lines, never as a reflow.
  const setA = new Set(a.map((l) => l.trim()));
  const setB = new Set(b.map((l) => l.trim()));
  for (const line of a) if (!setB.has(line.trim())) out.push(`- ${line.trim()}`);
  for (const line of b) if (!setA.has(line.trim())) out.push(`+ ${line.trim()}`);
  void max;
  return out;
}

// ---------------------------------------------------------------- main

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.mode === 'help') {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')
      .split('\n').filter((l) => l.startsWith('//')).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return 0;
  }

  const root = resolveRoot(opts.root);
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'games.json'), 'utf8'));
  const paths = new Map((registry.games || []).map((g) => [g.id, g.path]));

  const gamesDir = path.join(root, 'games');
  const only = opts.only ? new Set(opts.only) : null;
  const ids = fs.readdirSync(gamesDir).sort()
    .filter((id) => fs.statSync(path.join(gamesDir, id)).isDirectory())
    .filter((id) => !only || only.has(id));
  if (only) for (const id of only) if (!ids.includes(id)) console.log(`? ${id} — no games/${id}/ (--only)`);

  const drifted = [];
  const blocked = [];
  const wrote = [];
  const problems = [];

  for (const id of ids) {
    const dir = path.join(gamesDir, id);
    const indexPath = path.join(dir, 'index.html');
    const manifestPath = path.join(dir, 'game.json');
    if (!fs.existsSync(indexPath)) { problems.push(`${id}: no index.html`); continue; }
    if (!fs.existsSync(manifestPath)) { problems.push(`${id}: no game.json (canonical source) — nothing to derive from`); continue; }

    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
    catch (err) { problems.push(`${id}: game.json is not valid JSON (${err.message})`); continue; }

    const html = fs.readFileSync(indexPath, 'utf8');
    const found = locateBlock(html);
    if (!found) { problems.push(`${id}: could not locate the <meta charset> … <link rel="apple-touch-icon"> run in <head>`); continue; }

    const carried = readCarried(found.block);
    const gamePath = paths.get(id) || manifest.path || `games/${id}/`;
    const url = SITE + String(gamePath).replace(/^\/+/, '');
    const image = `${url}assets/og-image.jpg`;

    // Reasons this game must not be rewritten automatically.
    const reasons = [];
    if (!carried.imageAlt) reasons.push('no og:image:alt in the page and none derivable from game.json — write it by hand first');
    if (carried.image && carried.image !== image) reasons.push(`og:image is custom (${carried.image}), not ${image}`);
    if (!carried.themeColor && !manifest.accent) reasons.push('no theme-color in the page and no accent in game.json');

    const themeColor = carried.themeColor || manifest.accent;
    if (!carried.themeColor && manifest.accent) reasons.push(`theme-color absent; would fall back to accent ${manifest.accent} — confirm it matches the page background`);

    const next = renderBlock({
      themeColor,
      shareTitle: manifest.shareTitle || manifest.title,
      title: manifest.title,
      description: manifest.description,
      url,
      image: carried.image && reasons.length ? carried.image : image,
      imageAlt: carried.imageAlt,
    });

    if (next === found.block) continue;

    const diff = lineDiff(found.block, next);
    drifted.push({ id, diff, reasons });

    if (reasons.length) { blocked.push({ id, reasons }); continue; }

    if (opts.mode === 'write') {
      const out = found.before + next + found.after;
      const tmp = `${indexPath}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, out, 'utf8');
      fs.renameSync(tmp, indexPath);
      wrote.push(id);
    }
  }

  for (const d of drifted) {
    const tag = d.reasons.length ? ' [BLOCKED]' : '';
    console.log(`${d.id}${tag}`);
    for (const line of (opts.diff || d.reasons.length ? d.diff : d.diff.slice(0, 8))) console.log(`    ${line}`);
    if (!opts.diff && !d.reasons.length && d.diff.length > 8) console.log(`    … ${d.diff.length - 8} more line(s); rerun with --diff`);
    for (const r of d.reasons) console.log(`    ! ${r}`);
  }
  for (const message of problems) console.log(`! ${message}`);

  const scope = only ? ` (--only ${[...only].join(', ')})` : '';
  if (opts.mode === 'write') {
    console.log(`\nrewrote the head block in ${wrote.length} game(s)${scope}` + (wrote.length ? `: ${wrote.join(', ')}` : ''));
    if (blocked.length) console.log(`skipped ${blocked.length} game(s) that carry something the generator cannot derive: ${blocked.map((b) => b.id).join(', ')}`);
  } else if (drifted.length) {
    console.log(`\n${drifted.length} game(s) drifted from game.json${scope}` +
      (blocked.length ? `; ${blocked.length} of them BLOCKED from --write` : ''));
    console.log('fix: node tools/pipeline/gen-head-meta.mjs --write   (game.json is canonical)');
  } else {
    console.log(`every head block agrees with its game.json${scope}`);
  }
  if (problems.length) console.log(`${problems.length} problem(s) reported above need a human`);

  if (opts.mode === 'write') return blocked.length || problems.length ? 1 : 0;
  return drifted.length || problems.length ? 1 : 0;
}

process.exit(main());
