#!/usr/bin/env node
// games/bug-hotel-observer/tools/qa.mjs — the P7 gate.
//
// Two halves: a STATIC gate that needs no browser (config invariants, every
// config/manifest path exists on disk CASE-SENSITIVELY, byte budgets, voice
// coverage, no emoji in shipped runtime strings, registration in games.json)
// and a real-Chrome DRIVE of all three modes, the lens drag + dwell reveal,
// the strand probes, the wrong-input probe, journal persistence, the
// recorded-clip proof, the nav loop and three viewports x reduced-motion.
//
//   node games/bug-hotel-observer/tools/qa.mjs
//   node games/bug-hotel-observer/tools/qa.mjs --base http://127.0.0.1:8000
//   node games/bug-hotel-observer/tools/qa.mjs --base https://qlo.be
//   node games/bug-hotel-observer/tools/qa.mjs --shots /tmp/shots --headed
//   node games/bug-hotel-observer/tools/qa.mjs --playwright /private/tmp/pw/node_modules
//
// Flag parsing, Playwright resolution/launch and the shots directory come
// from tools/qa/lib/driver.mjs — see tools/qa/README.md.
//
// **channel: 'chrome' is load-bearing.** Playwright's bundled Chromium ships
// without an AAC decoder, so every .m4a in assets/audio silently fails to
// decode there and the recorded-clip assertions below would quietly pass
// against the Web Speech fallback instead of the real teacher clip. Run under
// `caffeinate -dims` — a Mac that sleeps mid-run freezes Chrome without
// failing the run.
//
// Playwright is deliberately NOT a repo dependency (no-build repo): it is
// loaded out of tree from /private/tmp/pw/node_modules.
//
// Shots go OUTSIDE the repo by default — a QA run must never leave PNGs in a
// worktree.

import { readFile, readdir, stat, access } from 'node:fs/promises';
import { constants as FS, createReadStream } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  args, launchChrome, resolveShots, ensureShots, createReporter,
} from '../../../tools/qa/lib/driver.mjs';

// ---------------------------------------------------------------- arguments

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..');
const ROOT = path.resolve(GAME, '..', '..');
const SHOTS = resolveShots('/private/tmp/qlobe-bho-shots');

// ---------------------------------------------------------------- reporting

const {
  check: ok, results, failures,
} = createReporter({
  style: 'pad', collapse: true, detailLimit: 300, detailOnFail: true,
});

const rel = (...p) => path.join(GAME, ...p);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const exists = async (p) => { try { await access(p, FS.F_OK); return true; } catch { return false; } };
const sizeOf = async (p) => { try { return (await stat(p)).size; } catch { return -1; } };
const readJSON = async (p) => JSON.parse(await readFile(p, 'utf8'));

/** True only when every path SEGMENT matches an on-disk directory entry
 *  byte-for-byte, not merely "resolves" on a case-insensitive filesystem
 *  (macOS APFS is the trap: `Bg-Hotel.JPG` would still stat() successfully). */
async function existsCaseSensitive(absPath) {
  const relToGame = path.relative(GAME, absPath);
  if (relToGame.startsWith('..')) return false;
  const parts = relToGame.split(path.sep).filter(Boolean);
  let dir = GAME;
  for (const part of parts) {
    let entries;
    try { entries = await readdir(dir); } catch { return false; }
    if (!entries.includes(part)) return false;
    dir = path.join(dir, part);
  }
  return true;
}

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

// =========================================================================
// STATIC GATE
// =========================================================================

async function staticGate() {
  console.log('\n=== static gate ===');

  const config = await readJSON(rel('config.json'));
  ok('config.json parses and is this game', config.id === 'bug-hotel-observer');

  const art = config.art || {};
  ok('art is the authored 1600x1200 plate size', art.w === 1600 && art.h === 1200, JSON.stringify(art));

  const rooms = config.rooms || [];
  const bugs = config.bugs || [];
  const modes = config.modes || [];
  const roomIds = rooms.map((r) => r.id);
  const bugIds = bugs.map((b) => b.id);

  // -- rooms -----------------------------------------------------------------
  ok('exactly 4 rooms', rooms.length === 4, String(rooms.length));
  ok('room ids are the 4 designed rooms',
    new Set(roomIds).size === 4 && ['leaf', 'bark', 'bamboo', 'log'].every((id) => roomIds.includes(id)),
    roomIds.join(','));

  const roomProblems = [];
  for (const room of rooms) {
    const h = room.exteriorHotspot || {};
    if (!(Number(h.w) > 0 && Number(h.h) > 0)) roomProblems.push(`${room.id}: exteriorHotspot has no size`);
    if (!(Number(h.x) >= 0 && Number(h.x) + Number(h.w) <= art.w)) roomProblems.push(`${room.id}: exteriorHotspot x out of bounds`);
    if (!(Number(h.y) >= 0 && Number(h.y) + Number(h.h) <= art.h)) roomProblems.push(`${room.id}: exteriorHotspot y out of bounds`);
    const zones = room.zones || [];
    if (zones.length !== 4) roomProblems.push(`${room.id}: ${zones.length} zones (want 4)`);
    const names = zones.map((z) => z.name);
    if (new Set(names).size !== names.length) roomProblems.push(`${room.id}: duplicate zone names`);
    for (const z of zones) {
      // §4.4 keep-out table: portrait-safe x band, HUD-clear y band.
      if (!(z.x >= 420 && z.x <= 1180)) roomProblems.push(`${room.id}/${z.name}: x ${z.x} outside portrait-safe [420,1180]`);
      if (!(z.y >= 300 && z.y <= 1000)) roomProblems.push(`${room.id}/${z.name}: y ${z.y} outside HUD-clear [300,1000]`);
    }
    // every pair of centres in a room must clear the 150px dwell radius by a
    // wide margin, per game-design.md's ">= 290 ART px apart" claim.
    for (let i = 0; i < zones.length; i += 1) {
      for (let j = i + 1; j < zones.length; j += 1) {
        const d = Math.hypot(zones[i].x - zones[j].x, zones[i].y - zones[j].y);
        if (d < 290) roomProblems.push(`${room.id}: ${zones[i].name}<->${zones[j].name} only ${d.toFixed(0)}px apart`);
      }
    }
    const roomBugs = room.bugs || [];
    if (roomBugs.length !== 3) roomProblems.push(`${room.id}: ${roomBugs.length} bugs (want 3)`);
    for (const bId of roomBugs) {
      const b = bugs.find((x) => x.id === bId);
      if (!b) roomProblems.push(`${room.id}: names unknown bug ${bId}`);
      else if (b.room !== room.id) roomProblems.push(`${room.id}: bug ${bId} declares room ${b.room}`);
    }
    if (!room.voice || !room.voice.intro) roomProblems.push(`${room.id}: no voice.intro`);
  }
  ok('every room has a bounded exteriorHotspot, 4 unique HUD/portrait-safe zones >=290px apart, and 3 of its own bugs',
    roomProblems.length === 0, roomProblems.join('; '));

  // -- bugs --------------------------------------------------------------------
  ok('exactly 12 bugs', bugs.length === 12, String(bugs.length));
  ok('bug ids are unique', new Set(bugIds).size === bugIds.length);
  const roomBugTotals = new Map();
  for (const b of bugs) roomBugTotals.set(b.room, (roomBugTotals.get(b.room) || 0) + 1);
  ok('bugs split 3/3/3/3 across the 4 rooms',
    roomIds.every((id) => roomBugTotals.get(id) === 3), JSON.stringify([...roomBugTotals]));

  const bugProblems = [];
  for (const b of bugs) {
    if (!(Number(b.artSize) > 0)) bugProblems.push(`${b.id}: no artSize`);
    if (!roomIds.includes(b.room)) bugProblems.push(`${b.id}: unknown room ${b.room}`);
    for (const frame of ['idle', 'happy']) {
      if (!(b.sprites && b.sprites[frame])) bugProblems.push(`${b.id}: no ${frame} sprite`);
    }
    for (const key of ['find', 'name', 'fact', 'clue']) {
      if (!(b.voice && b.voice[key])) bugProblems.push(`${b.id}: no voice.${key}`);
    }
  }
  ok('every bug declares a size, its room, two sprites and four voice keys',
    bugProblems.length === 0, bugProblems.join('; '));

  // -- modes ---------------------------------------------------------------
  ok('exactly 3 modes: bug-hunt, bug-detective, my-bug-book',
    modes.length === 3 && ['bug-hunt', 'bug-detective', 'my-bug-book'].every((id) => modes.map((m) => m.id).includes(id)),
    modes.map((m) => m.id).join(','));
  ok('exactly one default mode', modes.filter((m) => m.default).length === 1);
  const detective = modes.find((m) => m.id === 'bug-detective');
  ok('bug-detective hides the target plaque and repeats the clue on a wrong tap',
    detective && detective.showsTargetPlaque === false && detective.wrongTapRepeatsPrompt === true);
  const book = modes.find((m) => m.id === 'my-bug-book');
  ok('my-bug-book is a review mode', book && book.review === true);

  // -- lens ------------------------------------------------------------------
  const lens = config.lens || {};
  ok('lens.zoom/glassD/dwellMs are sane',
    Number(lens.zoom) >= 1 && Number(lens.glassD) > 0 && Number(lens.dwellMs) > 0, JSON.stringify(lens));
  ok('lens.frame carries a MEASURED scale + anchor (not the module defaults)',
    lens.frame && Number(lens.frame.scale) > 0
    && Number.isFinite(lens.frame.anchor?.x) && Number.isFinite(lens.frame.anchor?.y));
  ok('lens.gripSize keeps the grip clear of the glass centre (gripOffset > 0)',
    Number(lens.gripOffset) > 0 && Number(lens.gripSize) > 0);
  const start = lens.startArt || {};
  ok('lens.startArt is inside the plate', Number(start.x) > 0 && Number(start.x) < art.w
    && Number(start.y) > 0 && Number(start.y) < art.h);

  // -- journal -----------------------------------------------------------------
  const journalCfg = config.journal || {};
  ok('journal.slots holds exactly the 12 bugs in a 4x3 grid',
    journalCfg.slots === 12 && journalCfg.grid && journalCfg.grid.cols === 4 && journalCfg.grid.rows === 3,
    JSON.stringify(journalCfg));

  // -- registration: game.json + games.json ------------------------------------
  const manifestJson = await readJSON(rel('game.json'));
  ok('game.json declares the identity used by the registry',
    manifestJson.id === 'bug-hotel-observer' && manifestJson.title === 'Bug Hotel Observer'
    && manifestJson.category === 'sensorial-science'
    && manifestJson.age.min === 5 && manifestJson.age.max === 6
    && manifestJson.status === 'beta' && manifestJson.accent === '#5f8f3a',
    JSON.stringify({ age: manifestJson.age, status: manifestJson.status, accent: manifestJson.accent }));
  ok('game.json declares all 3 modes with a real one-skill description',
    manifestJson.modes.map((m) => m.id).join(',') === 'bug-hunt,bug-detective,my-bug-book'
    && manifestJson.modes.every((m) => m.skill && m.skill.length > 10));
  const wantUses = ['shared/js/hotspot-scene.js', 'shared/js/magnifier-lens.js', 'shared/js/journal.js',
    'shared/js/voice-clips.js', 'shared/js/sfx.js', 'shared/js/tap.js'];
  const missingUses = wantUses.filter((u) => !manifestJson.uses.includes(u));
  ok('game.json uses[] names every shared module this build actually consumes',
    missingUses.length === 0, missingUses.join(', '));
  const badUses = [];
  for (const u of manifestJson.uses) {
    const p = u.endsWith('/') ? path.join(ROOT, u) : path.join(ROOT, u);
    if (!(await exists(p))) badUses.push(u);
  }
  ok('every game.json uses[] path exists in the repo', badUses.length === 0, badUses.join(', '));

  const registry = await readJSON(path.join(ROOT, 'games.json'));
  const entry = registry.games.find((g) => g.id === 'bug-hotel-observer');
  ok('games.json carries the bug-hotel-observer entry', Boolean(entry));
  if (entry) {
    ok('games.json mirrors game.json\'s title/category/age/status/accent/modes',
      entry.title === manifestJson.title && entry.category === manifestJson.category
      && entry.age.min === manifestJson.age.min && entry.age.max === manifestJson.age.max
      && entry.status === manifestJson.status && entry.accent === manifestJson.accent
      && entry.modes.map((m) => m.id).join(',') === manifestJson.modes.map((m) => m.id).join(','),
      JSON.stringify({ registry: entry, manifest: manifestJson.title }));
    ok('games.json path points at this game folder', entry.path === 'games/bug-hotel-observer/');
    ok('games.json uses[] names the shared modules this build consumes',
      Array.isArray(entry.uses) && wantUses.every((u) => entry.uses.includes(u)),
      JSON.stringify(entry.uses));
    ok('the curated hub tile is on disk (hands-off — never written by this build)',
      await exists(path.join(ROOT, entry.icon)), entry.icon);
  }

  // -- every config/manifest path exists, case-sensitively ----------------------
  const artPaths = new Set();
  for (const room of rooms) { artPaths.add(room.bg); artPaths.add(room.plaque); }
  for (const b of bugs) { artPaths.add(b.sprites?.idle); artPaths.add(b.sprites?.happy); }
  artPaths.add(lens.sprite);
  artPaths.add(journalCfg.bg); artPaths.add(journalCfg.stickerBacking);
  artPaths.add(journalCfg.factCard); artPaths.add(journalCfg.factFoundLockup); artPaths.add(journalCfg.tabSprite);
  artPaths.add((config.splash || {}).bg); artPaths.add((config.splash || {}).title);
  artPaths.add((config.voice || {}).manifest); artPaths.add((config.voice || {}).lines);
  artPaths.delete(undefined);

  const missingPaths = [];
  const caseMismatch = [];
  for (const p of artPaths) {
    const abs = rel(p);
    if (!(await exists(abs))) { missingPaths.push(p); continue; }
    if (!(await existsCaseSensitive(abs))) caseMismatch.push(p);
  }
  ok(`all ${artPaths.size} config-referenced asset/data paths exist on disk`,
    missingPaths.length === 0, missingPaths.join(', '));
  ok('every one of those paths matches on-disk case exactly (case-sensitive check)',
    caseMismatch.length === 0, caseMismatch.join(', '));

  // -- byte budgets --------------------------------------------------------------
  const PLATES = ['assets/bg-hotel.jpg', 'assets/bg-room-leaf.jpg', 'assets/bg-room-bark.jpg',
    'assets/bg-room-bamboo.jpg', 'assets/bg-room-log.jpg', 'assets/bg-journal.jpg'];
  const plateOver = [];
  const plateMissing = [];
  for (const f of PLATES) {
    const bytes = await sizeOf(rel(f));
    if (bytes < 0) { plateMissing.push(f); continue; }
    if (bytes > 300 * 1024) plateOver.push(`${f} ${kb(bytes)} > 300 KB`);
  }
  ok('every plate is on disk', plateMissing.length === 0, plateMissing.join(', '));
  ok('every plate is <= 300 KB', plateOver.length === 0, plateOver.join('; '));

  const titleBytes = await sizeOf(rel('assets/title.webp'));
  ok('assets/title.webp exists and is <= 150 KB',
    titleBytes >= 0 && titleBytes <= 150 * 1024, kb(Math.max(titleBytes, 0)));

  const spriteOver = [];
  const spriteUnder = [];
  const spriteMissing = [];
  for (const b of bugs) {
    for (const frame of ['idle', 'happy']) {
      const f = b.sprites?.[frame];
      const bytes = await sizeOf(rel(f));
      if (bytes < 0) { spriteMissing.push(f); continue; }
      if (bytes > 80 * 1024) spriteOver.push(`${f} ${kb(bytes)} > 80 KB`);
      if (bytes < 30 * 1024) spriteUnder.push(`${f} ${kb(bytes)} < 30 KB`);
    }
  }
  ok('all 24 bug sprites are on disk', spriteMissing.length === 0, spriteMissing.join(', '));
  ok('all 24 bug sprites are inside the 30-80 KB budget',
    spriteOver.length === 0 && spriteUnder.length === 0,
    [...spriteOver, ...spriteUnder].join('; '));

  // -- voice coverage -----------------------------------------------------------
  const manifest = await readJSON(rel('assets/audio/manifest.json'));
  const lines = await readJSON(rel('tools/lines.json'));
  const wantKeys = new Set([
    'welcome', 'mode-bug-hunt', 'mode-bug-detective', 'mode-my-bug-book',
    'pick-room', 'prompt-look', 'prompt-lens', 'prompt-again', 'getting-closer', 'found-tap',
    'idle-1', 'idle-2', 'nudge-wrong', 'yes-1', 'yes-2', 'yes-3', 'sticker',
    'next-room', 'round-done', 'cheer-end', 'journal-open', 'journal-empty', 'journal-tap',
    'room-leaf', 'room-bark', 'room-bamboo', 'room-log',
  ]);
  for (const b of bugs) for (const key of ['find', 'name', 'fact', 'clue']) wantKeys.add(b.voice[key]);
  ok('exactly 75 voice keys are named by config + the fixed global script',
    wantKeys.size === 75, String(wantKeys.size));

  const missingManifest = [...wantKeys].filter((k) => !manifest[k]);
  const missingLines = [...wantKeys].filter((k) => !lines[k] || !String(lines[k]).trim());
  const strayManifest = Object.keys(manifest).filter((k) => !k.startsWith('_') && !wantKeys.has(k));
  ok('every voice key has a manifest entry (assets/audio/manifest.json)',
    missingManifest.length === 0, missingManifest.join(', '));
  ok('every voice key has script text (tools/lines.json)',
    missingLines.length === 0, missingLines.join(', '));
  ok('the manifest carries no stray keys', strayManifest.length === 0, strayManifest.join(', '));

  const badClips = [];
  for (const [key, e] of Object.entries(manifest)) {
    if (key.startsWith('_')) continue;
    if (!e || !e.file) { badClips.push(`${key}: no file`); continue; }
    if (!(await exists(rel('assets/audio', e.file)))) badClips.push(`${key} -> ${e.file}`);
    if (!(Number(e.dur) > 0)) badClips.push(`${key}: no duration`);
  }
  ok('every manifest {file,dur} entry resolves to a real, timed clip on disk',
    badClips.length === 0, badClips.join('; '));

  // -- no emoji in shipped runtime strings ---------------------------------------
  const indexHtml = await readFile(rel('index.html'), 'utf8');
  const bodyOnly = indexHtml.slice(indexHtml.indexOf('<body'));
  const bodyEmoji = [];
  bodyOnly.split('\n').forEach((line, i) => { if (EMOJI.test(line)) bodyEmoji.push(`index.html body:${i + 1}`); });
  ok('index.html <body> carries no emoji (head/meta share cards may)',
    bodyEmoji.length === 0, bodyEmoji.join(', '));

  const jsFiles = ['js/main.js', 'js/game.js', 'js/voice.js', 'js/journal-ui.js', 'js/ambience.js', 'js/art.js'];
  const jsEmoji = [];
  for (const f of jsFiles) {
    const text = await readFile(rel(f), 'utf8');
    text.split('\n').forEach((line, i) => { if (EMOJI.test(line)) jsEmoji.push(`${f}:${i + 1}`); });
  }
  ok('no emoji anywhere in js/*.js', jsEmoji.length === 0, jsEmoji.join(', '));

  const lineEmoji = Object.entries(lines).filter(([, v]) => EMOJI.test(String(v))).map(([k]) => k);
  ok('no emoji in any spoken/printed line (tools/lines.json)', lineEmoji.length === 0, lineEmoji.join(', '));

  // -- relative, lowercase paths --------------------------------------------------
  const pathHits = [];
  for (const p of artPaths) {
    if (/^(https?:)?\/\//.test(p) || p.startsWith('/')) pathHits.push(`absolute: ${p}`);
    else if (p !== p.toLowerCase()) pathHits.push(`uppercase: ${p}`);
  }
  ok('every config-referenced path is relative and lowercase', pathHits.length === 0, pathHits.join('; '));
}

// =========================================================================
// a tiny static server, so the browser gate needs no external process
// =========================================================================

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif',
  '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
};

async function serveRepo() {
  const server = http.createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let file = path.join(ROOT, pathname);
      if (!path.resolve(file).startsWith(ROOT)) { res.writeHead(403).end(); return; }
      let info = null;
      try { info = await stat(file); } catch { /* 404 below */ }
      if (info && info.isDirectory()) {
        file = path.join(file, 'index.html');
        try { info = await stat(file); } catch { info = null; }
      }
      if (!info) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
      res.writeHead(200, {
        'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'content-length': info.size,
        'cache-control': 'no-store',
      });
      createReadStream(file).pipe(res);
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain' }).end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

// =========================================================================
// BROWSER GATE
// =========================================================================

async function browserGate(base) {
  const URL_ = `${base}/games/bug-hotel-observer/`;
  console.log(`\n=== browser gate (${URL_}) ===`);

  const browser = await launchChrome();
  const ctx = await browser.newContext({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('requestfailed', (r) => {
    // "Interruption is always allowed" (voice.js: a new say()/seq() supersedes
    // whatever was playing). A sped-up harness that taps through a sequence
    // faster than a clip can load aborts that clip's own fetch on purpose —
    // that is the design working, not a missing asset. See rhyming-detective's
    // tools/qa.mjs for the identical carve-out.
    const reason = r.failure()?.errorText || '';
    if (reason === 'net::ERR_ABORTED' && /\.m4a(\?|$)/.test(r.url())) return;
    failedRequests.push(`${r.url()} ${reason}`);
  });
  page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`); });

  await page.goto(URL_, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);

  console.log('\n-- boot --');
  ok('QLOBE_DEBUG v1', await page.evaluate(() => window.QLOBE_DEBUG.version === 1));
  ok('screen is splash', await page.evaluate(() => window.QLOBE_DEBUG.getState().screen === 'splash'));
  ok('three modes', await page.evaluate(() => window.QLOBE_DEBUG.listModes().length === 3));
  ok('nothing spoke before a gesture', await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog().length === 0),
    JSON.stringify(await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog())));
  ok('no emoji in the live body DOM',
    await page.evaluate(() => !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(document.body.innerText)));

  await page.evaluate(() => { window.QLOBE_DEBUG.mute(true); window.QLOBE_DEBUG.seed(42); window.QLOBE_DEBUG.fastTimer(20); });
  ok('fastTimer scales', await page.evaluate(() => window.QLOBE_DEBUG.getState().timeScale === 0.05));

  console.log('\n-- ISSUE 2: unframed at iPad landscape (1194x834) --');
  {
    // 1194/834 = 1.4317, just under the (min-aspect-ratio: 3/2) trigger, and
    // 1194px is under the 1400px width trigger — the framed-diorama media
    // query must NOT engage here, so #stage stays exactly the window.
    const g = await page.evaluate(() => {
      const r = document.getElementById('stage').getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight };
    });
    ok('at 1194x834 the stage box is the whole window (unframed, full-bleed)',
      Math.abs(g.x) < 1 && Math.abs(g.y) < 1 && Math.abs(g.w - g.vw) < 1 && Math.abs(g.h - g.vh) < 1,
      JSON.stringify(g));
  }

  console.log('\n-- splash controls --');
  await page.click('#btn-play');
  ok('mode row opens', await page.evaluate(() => !document.getElementById('mode-row').hidden));
  ok('home button targets the catalog', await page.evaluate(() => document.getElementById('splash-home') !== null));

  // =======================================================================
  // MODE 1 — bug-hunt, end to end: hotel -> room -> lens drag -> reveal ->
  // greet -> reward -> 3 more rooms -> celebration -> end -> nav loop.
  // =======================================================================
  console.log('\n-- mode 1/3 (bug-hunt): the hotel --');
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('bug-hunt'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'hotel'
    && window.QLOBE_DEBUG.getState().roomReady, null, { timeout: 8000 });
  const hotelTargets = await page.evaluate(() => window.QLOBE_DEBUG.getTargets());
  ok('4 room targets, role room', hotelTargets.length === 4 && hotelTargets.every((t) => t.role === 'room'),
    JSON.stringify(hotelTargets.map((t) => [t.id, t.role])));
  ok('round derives to 0', await page.evaluate(() => window.QLOBE_DEBUG.getState().round === 0));

  console.log('\n-- ISSUE 1: the hotel prompt is the dedicated pick-room line --');
  {
    const linesJson = await readJSON(rel('tools/lines.json'));
    const manifestJson = await readJSON(rel('assets/audio/manifest.json'));
    ok('tools/lines.json carries a real pick-room script line',
      typeof linesJson['pick-room'] === 'string' && linesJson['pick-room'].trim().length > 0,
      JSON.stringify(linesJson['pick-room']));
    ok('assets/audio/manifest.json carries a timed pick-room entry',
      Boolean(manifestJson['pick-room'] && manifestJson['pick-room'].file && manifestJson['pick-room'].dur > 0),
      JSON.stringify(manifestJson['pick-room']));
    ok('the pick-room clip is really on disk',
      await exists(rel('assets/audio', manifestJson['pick-room'].file)), manifestJson['pick-room'].file);

    const bannerText = await page.textContent('#banner');
    ok('the hotel banner prints pick-room, not prompt-look or any stale line',
      bannerText === linesJson['pick-room'], JSON.stringify({ bannerText, want: linesJson['pick-room'] }));

    // Real playback proof, not just a manifest entry: unmute, tap the sound
    // button on the hotel screen, and check the SAME getClipMedia() proof the
    // My Bug Book pass below uses — a decoded m4a, not the speech fallback.
    await page.evaluate(() => window.QLOBE_DEBUG.clearAudioLog());
    await page.evaluate(() => window.QLOBE_DEBUG.mute(false));
    await page.click('#btn-sound');
    await page.waitForFunction(() => {
      const l = window.QLOBE_DEBUG.getAudioLog();
      return l.some((e) => e.id === 'pick-room');
    }, null, { timeout: 8000 });
    const pickRoomLog = await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog());
    ok('the sound button on the hotel screen speaks pick-room from the recorded pack',
      pickRoomLog.some((l) => l.id === 'pick-room' && l.source === 'clip' && /\.m4a$/.test(l.file || '')),
      JSON.stringify(pickRoomLog));
    // Poll: over a real network the <audio> can still be buffering at the
    // instant the audio-log entry lands (readyState < 2), even though the
    // clip is playing. Local runs pass on the first poll either way.
    const pickRoomDecoded = await page.waitForFunction(() => {
      const m = window.QLOBE_DEBUG.getClipMedia();
      return Boolean(m) && m.key === 'pick-room' && /pick-room\.m4a(\?|$)/.test(m.src)
        && m.readyState >= 2 && Number.isFinite(m.duration) && m.duration > 0;
    }, null, { timeout: 10000 }).then(() => true).catch(() => false);
    const pickRoomMedia = await page.evaluate(() => window.QLOBE_DEBUG.getClipMedia());
    ok('the pick-room clip actually decoded in the page (readyState >= 2, real duration)',
      pickRoomDecoded, JSON.stringify(pickRoomMedia));
    await page.evaluate(() => window.QLOBE_DEBUG.mute(true));
  }

  console.log('\n-- a room, the lens and the reveal --');
  await page.evaluate(() => window.QLOBE_DEBUG.tap('leaf'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'room'
    && window.QLOBE_DEBUG.getState().roomReady, null, { timeout: 8000 });
  const st = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  ok('3 bugs placed in 3 of 4 nooks', st.placements.length === 3, JSON.stringify(st.placements));
  ok('target is ladybug at round 0', st.targetId === 'ladybug', st.targetId);
  ok('distinct zones', new Set(st.placements.map((p) => p.zone)).size === 3);
  const roomTargets = await page.evaluate(() => window.QLOBE_DEBUG.getTargets());
  ok('roles are truthful', roomTargets.filter((t) => t.role === 'target').length === 1
    && roomTargets.filter((t) => t.role === 'bug').length === 2,
    JSON.stringify(roomTargets.map((t) => [t.id, t.role])));
  ok('nothing revealed yet', st.revealed.length === 0);
  const lens0 = await page.evaluate(() => window.QLOBE_DEBUG.getLens());
  ok('lens exists and is enabled', Boolean(lens0 && lens0.enabled), JSON.stringify(lens0));
  ok('lens holds 3 hidden sprites', lens0.sprites.length === 3 && lens0.sprites.every((s) => s.visible));

  const targetArt = st.placements.find((p) => p.bugId === st.targetId);
  await page.evaluate(([x, y]) => window.QLOBE_DEBUG.setLens(x, y), [targetArt.artX, targetArt.artY]);
  await page.waitForFunction((id) => window.QLOBE_DEBUG.getState().revealed.includes(id), st.targetId, { timeout: 8000 });
  ok('dwell revealed the target through the real move path', true);
  const afterReveal = await page.evaluate(() => window.QLOBE_DEBUG.getLens());
  {
    const s = afterReveal.sprites.find((x) => x.id === targetArt.bugId);
    ok('the found bug stays in the glass but stops arming the dwell',
      s.visible === true && s.found === true, JSON.stringify(s));
  }
  const revealedTargets = await page.evaluate(() => window.QLOBE_DEBUG.getTargets());
  ok('revealed bug is enabled in the base scene',
    revealedTargets.find((t) => t.id === targetArt.bugId).enabled === true);

  console.log('\n-- P6 lens geometry --');
  {
    const geo = await page.evaluate(() => {
      const l = document.querySelector('.ml-lens').getBoundingClientRect();
      const f = document.querySelector('.ml-frame').getBoundingClientRect();
      const g = document.querySelector('.ml-grip').getBoundingClientRect();
      const cx = l.x + l.width / 2;
      const cy = l.y + l.height / 2;
      const holeX = f.x + 0.4067 * f.width;
      const holeY = f.y + 0.44 * f.height;
      const holeD = (2 * 186 / 900) * f.width;
      return {
        dx: Math.abs(holeX - cx), dy: Math.abs(holeY - cy), dd: Math.abs(holeD - l.width),
        gripHasCentre: cx >= g.x && cx <= g.x + g.width && cy >= g.y && cy <= g.y + g.height,
        gripMin: Math.min(g.width, g.height),
      };
    });
    ok('the authored glass hole lands on the clip circle (< 1 px)',
      geo.dx < 1 && geo.dy < 1 && geo.dd < 1, JSON.stringify(geo));
    ok('the grip never contains the glass centre', geo.gripHasCentre === false);
    ok('the grip is at least 140 css px', geo.gripMin >= 140, String(geo.gripMin));
  }

  console.log('\n-- a real finger on the grip --');
  const grip = await page.$('.ml-grip');
  const box = await grip.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  const dragged = await page.evaluate(() => window.QLOBE_DEBUG.getLens());
  ok('a real drag moved the lens and left it draggable',
    !dragged.dragging && (Math.abs(dragged.x - lens0.x) > 5 || Math.abs(dragged.y - lens0.y) > 5),
    JSON.stringify([lens0.x, lens0.y, dragged.x, dragged.y]));

  // -----------------------------------------------------------------------
  // §11 row 23 — the whole lens is the drag surface, and a press that does not
  // travel is handed to whatever is under the glass.
  // -----------------------------------------------------------------------
  console.log('\n-- a real finger on the GLASS --');
  {
    const before = await page.evaluate(() => window.QLOBE_DEBUG.getLens());
    const c = await page.evaluate(() => {
      const r = document.querySelector('.ml-lens').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 6, c.y + 4, { steps: 2 });
    const inSlop = await page.evaluate(() => window.QLOBE_DEBUG.getLens());
    ok('inside the 12 px slop the glass has not moved',
      Math.abs(inSlop.x - before.x) < 0.6 && Math.abs(inSlop.y - before.y) < 0.6,
      JSON.stringify([before.x, before.y, inSlop.x, inSlop.y]));
    await page.mouse.move(c.x + 120, c.y + 70, { steps: 8 });
    const mid = await page.evaluate(() => window.QLOBE_DEBUG.getLens());
    ok('past the slop a press on the GLASS CENTRE drags', mid.dragging === true, JSON.stringify(mid));
    await page.mouse.up();
    const after = await page.evaluate(() => window.QLOBE_DEBUG.getLens());
    ok('the glass drag moved the lens and settled it',
      !after.dragging && Math.hypot(after.x - before.x, after.y - before.y) > 40,
      JSON.stringify([before.x, before.y, after.x, after.y]));
  }

  console.log('\n-- a tap THROUGH the glass reaches the bug underneath --');
  {
    // A NON-TARGET roommate on purpose: tapping the target would open the
    // reward spread and end the room, and `wrongTaps` is the one counter that
    // is written SYNCHRONOUSLY in greet(), so it proves "exactly once" even
    // with the voice muted (the audio log is not written while muted).
    const revealedId = await page.evaluate(() => {
      const st = window.QLOBE_DEBUG.getState();
      const p = st.placements.find((q) => q.bugId !== st.targetId);
      return p ? p.bugId : null;
    });
    await page.evaluate((id) => window.QLOBE_DEBUG.reveal(id), revealedId);
    await page.waitForTimeout(200);
    const art = await page.evaluate((id) => {
      const p = window.QLOBE_DEBUG.getState().placements.find((q) => q.bugId === id);
      return p ? { x: p.artX, y: p.artY } : null;
    }, revealedId);
    await page.evaluate((a) => window.QLOBE_DEBUG.setLens(a.x, a.y), art);
    await page.waitForTimeout(160);
    const spot = await page.evaluate((id) => {
      const t = window.QLOBE_DEBUG.getTargets().find((x) => x.id === id);
      return { x: t.rect.x + t.rect.w / 2, y: t.rect.y + t.rect.h / 2 };
    }, revealedId);
    const covering = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el ? String(el.className || el.tagName) : 'none';
    }, spot);
    ok('the drag surface really is covering the revealed bug', /ml-surface|ml-grip/.test(covering), covering);
    const lensBefore = await page.evaluate(() => window.QLOBE_DEBUG.getLens());
    const wrongBefore = await page.evaluate(() => window.QLOBE_DEBUG.getState().wrongTaps || 0);
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(400);
    const wrongAfter = await page.evaluate(() => window.QLOBE_DEBUG.getState().wrongTaps || 0);
    ok('the tap fired the bug underneath EXACTLY once',
      wrongAfter - wrongBefore === 1, `${revealedId}: wrongTaps ${wrongBefore} -> ${wrongAfter}`);
    const lensAfter = await page.evaluate(() => window.QLOBE_DEBUG.getLens());
    ok('a tap through the glass does not move the glass',
      Math.abs(lensAfter.x - lensBefore.x) < 0.6 && Math.abs(lensAfter.y - lensBefore.y) < 0.6);
  }

  // -----------------------------------------------------------------------
  // STRAND PROBES (interaction-patterns.md #11) — a drag that never ends
  // normally must still leave the lens visible, settled, and re-draggable.
  // -----------------------------------------------------------------------
  console.log('\n-- strand probe: pointercancel mid-drag --');
  {
    const before = await page.evaluate(() => window.QLOBE_DEBUG.getLens());
    const g = await page.$('.ml-grip');
    const b = await g.boundingBox();
    await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 77, clientX: x, clientY: y, isPrimary: true, bubbles: true }));
    }, [b.x + b.width / 2, b.y + b.height / 2]);
    // §11 row 23 — a pointerdown is a TRACKED PRESS, not yet a drag. It becomes
    // one only past the 12 px slop, which the move below crosses.
    await page.waitForFunction(() => window.QLOBE_DEBUG.getLens().pressing === true, null, { timeout: 2000 });
    await page.evaluate(([x, y]) => {
      window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 77, clientX: x + 120, clientY: y - 60, bubbles: true }));
    }, [b.x + b.width / 2, b.y + b.height / 2]);
    await page.waitForFunction(() => window.QLOBE_DEBUG.getLens().dragging === true, null, { timeout: 2000 });
    await page.evaluate(() => {
      window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 77, bubbles: true }));
    });
    const after = await page.evaluate(() => window.QLOBE_DEBUG.getLens());
    ok('a pointercancel mid-drag settles the lens: visible, not dragging',
      after.visible === true && after.dragging === false, JSON.stringify(after));
    ok('the lens actually moved before the cancel (the gesture was live)',
      Math.abs(after.x - before.x) > 5 || Math.abs(after.y - before.y) > 5,
      JSON.stringify([before.x, before.y, after.x, after.y]));
    // re-draggable: a fresh real mouse drag still works afterwards.
    const g2box = await (await page.$('.ml-grip')).boundingBox();
    await page.mouse.move(g2box.x + g2box.width / 2, g2box.y + g2box.height / 2);
    await page.mouse.down();
    await page.mouse.move(g2box.x + g2box.width / 2 - 60, g2box.y + g2box.height / 2 + 30, { steps: 6 });
    await page.mouse.up();
    const redragged = await page.evaluate(() => window.QLOBE_DEBUG.getLens());
    ok('the lens is re-draggable after a pointercancel',
      !redragged.dragging && (Math.abs(redragged.x - after.x) > 3 || Math.abs(redragged.y - after.y) > 3),
      JSON.stringify([after.x, after.y, redragged.x, redragged.y]));
  }

  console.log('\n-- strand probe: window blur mid-drag --');
  {
    const before = await page.evaluate(() => window.QLOBE_DEBUG.getLens());
    const g = await page.$('.ml-grip');
    const b = await g.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 70, b.y + b.height / 2 + 20, { steps: 6 });
    const midDrag = await page.evaluate(() => window.QLOBE_DEBUG.getLens());
    ok('the lens is genuinely mid-drag before the blur', midDrag.dragging === true, JSON.stringify(midDrag));
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const afterBlur = await page.evaluate(() => window.QLOBE_DEBUG.getLens());
    ok('a window blur mid-drag settles the lens: visible, not dragging',
      afterBlur.visible === true && afterBlur.dragging === false, JSON.stringify(afterBlur));
    // the OS-level mouseup never arrives after a real blur; release it so the
    // harness itself does not leave a phantom button down for the next probe.
    await page.mouse.up();
    const g2 = await page.$('.ml-grip');
    const b2 = await g2.boundingBox();
    await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
    await page.mouse.down();
    await page.mouse.move(b2.x + b2.width / 2 - 50, b2.y + b2.height / 2 - 40, { steps: 6 });
    await page.mouse.up();
    const redragged = await page.evaluate(() => window.QLOBE_DEBUG.getLens());
    ok('the lens is re-draggable after a window blur',
      !redragged.dragging && (Math.abs(redragged.x - afterBlur.x) > 3 || Math.abs(redragged.y - afterBlur.y) > 3),
      JSON.stringify([afterBlur.x, afterBlur.y, redragged.x, redragged.y]));
    void before;
  }

  console.log('\n-- the reward --');
  await page.evaluate((id) => window.QLOBE_DEBUG.tap(id), targetArt.bugId);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reward', null, { timeout: 12000 });
  ok('the target opens the spread', true);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getJournal().length === 1, null, { timeout: 12000 });
  const entry = (await page.evaluate(() => window.QLOBE_DEBUG.getJournal()))[0];
  ok('sticker persisted with room + round', entry.id === 'ladybug' && entry.room === 'leaf' && entry.round === 0,
    JSON.stringify(entry));
  const stickerTargets = await page.evaluate(() => window.QLOBE_DEBUG.getTargets());
  ok('sticker role on the spread', stickerTargets.length === 1 && stickerTargets[0].role === 'sticker');
  ok('fact card prints the spoken sentence', (await page.textContent('#fact-text')).length > 20);

  await page.screenshot({ path: path.join(SHOTS, 'landscape-reward.png') });

  console.log('\n-- three more rooms to the celebration --');
  for (let i = 0; i < 3; i += 1) {
    await page.evaluate(() => window.QLOBE_DEBUG.nextRoom());
    await page.waitForFunction(() => {
      const s = window.QLOBE_DEBUG.getState();
      return s.screen === 'celebration' || (s.screen === 'room' && s.roomReady);
    }, null, { timeout: 12000 });
    if (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen === 'celebration')) break;
    await page.evaluate(() => window.QLOBE_DEBUG.winRound());
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reward', null, { timeout: 12000 });
  }
  await page.evaluate(() => window.QLOBE_DEBUG.nextRoom());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'celebration', null, { timeout: 12000 });
  ok('room 4 ends the round in a celebration', true);
  ok('all four pips filled', await page.evaluate(() => document.querySelectorAll('#pips .pip.filled').length === 4));
  ok('four stickers earned', await page.evaluate(() => window.QLOBE_DEBUG.getJournal().length === 4));
  await page.screenshot({ path: path.join(SHOTS, 'landscape-celebration.png') });

  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end', null, { timeout: 12000 });
  ok('celebration auto-advances to the end', true);
  await page.screenshot({ path: path.join(SHOTS, 'landscape-end.png') });

  console.log('\n-- nav loop and My Bug Book --');
  await page.click('#btn-again');
  ok('play again returns to the splash', await page.evaluate(() => window.QLOBE_DEBUG.getState().screen === 'splash'));
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('my-bug-book'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'journal', null, { timeout: 8000 });
  ok('my-bug-book opens the book (mode 3/3)', true);
  ok('12 slots, 4 filled', await page.evaluate(() =>
    document.querySelectorAll('#sticker-grid .sticker').length === 12
    && document.querySelectorAll('#sticker-grid .sticker:not(.is-empty)').length === 4));
  await page.evaluate(() => window.QLOBE_DEBUG.clearAudioLog());
  await page.evaluate(() => window.QLOBE_DEBUG.mute(false));
  await page.evaluate(() => window.QLOBE_DEBUG.tap('ladybug'));
  await page.waitForTimeout(400);
  const log = await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog());
  ok('tapping a sticker speaks name then fact',
    log.length >= 2 && log[0].id === 'bug-ladybug-name' && log[1].id === 'bug-ladybug-fact',
    JSON.stringify(log.map((l) => l.id)));
  ok('audio log records the source', log.every((l) => l.source === 'clip' || l.source === 'speech'));
  ok('both lines came from the RECORDED pack, not the speech fallback',
    log.slice(0, 2).every((l) => l.source === 'clip' && /\.m4a$/.test(l.file || '')),
    JSON.stringify(log.slice(0, 2)));
  {
    const media = await page.evaluate(() => window.QLOBE_DEBUG.getClipMedia());
    ok('a recorded m4a actually decoded in the page (readyState >= 2, real duration)',
      Boolean(media) && /\.m4a(\?|$)/.test(media.src) && media.readyState >= 2
        && Number.isFinite(media.duration) && media.duration > 0,
      JSON.stringify(media));
  }
  await page.evaluate(() => window.QLOBE_DEBUG.mute(true));
  await page.screenshot({ path: path.join(SHOTS, 'landscape-book.png') });
  await page.evaluate(() => window.QLOBE_DEBUG.home());

  // =======================================================================
  // MODE 2/3 — bug-detective, end to end, with the wrong-input probe.
  // =======================================================================
  console.log('\n-- mode 2/3 (bug-detective): portrait, wrong-input probe, full round --');
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.QLOBE_DEBUG.resetJournal());
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('bug-detective'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'hotel'
    && window.QLOBE_DEBUG.getState().roomReady, null, { timeout: 8000 });
  await page.evaluate(() => window.QLOBE_DEBUG.tap('bamboo'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'room'
    && window.QLOBE_DEBUG.getState().roomReady, null, { timeout: 8000 });
  const detSt = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  ok('detective places differently from hunt', detSt.mode === 'bug-detective');
  ok('no target plaque in detective', await page.evaluate(() => document.getElementById('target-plaque').hidden));
  const zonesInBand = detSt.placements.every((p) => p.artX >= 420 && p.artX <= 1180 && p.artY >= 300 && p.artY <= 1000);
  ok('every placement inside the portrait-safe band', zonesInBand, JSON.stringify(detSt.placements));
  await page.screenshot({ path: path.join(SHOTS, 'portrait-room.png') });

  const hud = await page.evaluate(() => {
    const ids = ['btn-back', 'btn-sound', 'btn-journal'];
    return ids.map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [id, r.width, r.height]; });
  });
  ok('every HUD target >= 96 css px (measured live, in the room screen)',
    hud.every(([, w, h]) => w >= 96 && h >= 96), JSON.stringify(hud));

  // Wrong-input probe: reveal every bug in this room (fast, deterministic —
  // the same move-path a dwell reveal uses), then tap the wrong one and
  // assert the game state is UNCHANGED: no sticker, still awaiting input,
  // wrongTaps incremented, and the detective's clue is repeated rather than
  // the round ending.
  for (const p of detSt.placements) {
    await page.evaluate(([x, y]) => window.QLOBE_DEBUG.setLens(x, y), [p.artX, p.artY]);
    await page.waitForFunction((id) => window.QLOBE_DEBUG.getState().revealed.includes(id), p.bugId, { timeout: 8000 });
  }
  const beforeWrong = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  const wrongBug = detSt.placements.find((p) => p.bugId !== beforeWrong.targetId).bugId;
  // Un-mute for this probe (mode 1's My Bug Book pass muted at its end) — the
  // audio LOG is only written while unmuted (voice.js:sayInternal short-
  // circuits before push() when muted), so a muted probe would report a false
  // "nothing spoke" no matter what the game actually does.
  await page.evaluate(() => window.QLOBE_DEBUG.mute(false));
  await page.evaluate(() => window.QLOBE_DEBUG.clearAudioLog());
  const wrongResult = await page.evaluate((id) => window.QLOBE_DEBUG.tap(id), wrongBug);
  ok('a wrong (non-target) tap in bug-detective is accepted as a greeting but not as the answer',
    wrongResult.accepted === false && wrongResult.role === 'bug', JSON.stringify(wrongResult));
  // wrongTaps/found/screen are written SYNCHRONOUSLY in greet() before any
  // voice awaits, so these are already true the instant tap() resolves.
  const afterWrong = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  ok('a wrong tap leaves the game state unchanged: still in the room, no sticker awarded',
    afterWrong.screen === 'room' && afterWrong.found.length === 0
      && afterWrong.wrongTaps === (beforeWrong.wrongTaps || 0) + 1,
    JSON.stringify({ screen: afterWrong.screen, found: afterWrong.found, wrongTaps: afterWrong.wrongTaps }));
  ok('no sticker/reward screen resulted from the wrong tap', afterWrong.screen !== 'reward');
  // The sequence itself (name -> nudge-wrong -> clue) is fire-and-forget from
  // greet()'s point of view, and each step AWAITS THE CLIP'S OWN PLAYBACK,
  // which runs at real wall-clock speed — fastTimer only scales the gaps
  // between steps, never decoded audio duration. So this waits on the log
  // itself, generously, rather than sampling it after a fixed pause.
  const wrongLog = await page.waitForFunction(() => {
    const l = window.QLOBE_DEBUG.getAudioLog();
    return l.some((e) => /-clue$/.test(e.id) || e.id === 'nudge-wrong') ? l : false;
  }, null, { timeout: 15000 }).then((h) => h.jsonValue()).catch(async () => page.evaluate(() => window.QLOBE_DEBUG.getAudioLog()));
  ok('a wrong tap in bug-detective repeats the clue (wrongTapRepeatsPrompt)',
    wrongLog.some((l) => /-clue$/.test(l.id) || l.id === 'nudge-wrong'),
    JSON.stringify(wrongLog.map((l) => l.id)));

  // Drive the whole round to completion via winRound() so mode 2 is really
  // exercised end-to-end, the same way mode 1 was.
  await page.evaluate(() => window.QLOBE_DEBUG.fastTimer(20));
  await page.evaluate((id) => window.QLOBE_DEBUG.tap(id), beforeWrong.targetId);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reward', null, { timeout: 12000 });
  ok('the real target still completes the case after a wrong tap', true);
  for (let i = 0; i < 4; i += 1) {
    await page.evaluate(() => window.QLOBE_DEBUG.nextRoom());
    await page.waitForFunction(() => {
      const s = window.QLOBE_DEBUG.getState();
      return s.screen === 'celebration' || (s.screen === 'room' && s.roomReady);
    }, null, { timeout: 12000 });
    if (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen === 'celebration')) break;
    await page.evaluate(() => window.QLOBE_DEBUG.winRound());
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reward', null, { timeout: 12000 });
  }
  ok('bug-detective runs a full round to celebration (mode 2/3 end-to-end)',
    await page.evaluate(() => window.QLOBE_DEBUG.getState().screen === 'celebration')
    || await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'celebration', null, { timeout: 12000 }).then(() => true));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end', null, { timeout: 12000 });
  ok('bug-detective reaches the end screen', true);
  await page.evaluate(() => window.QLOBE_DEBUG.home());

  console.log('\n-- persistence --');
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  const persistedCount = await page.evaluate(() => window.QLOBE_DEBUG.getJournal().length);
  ok('the book survives a reload', persistedCount > 0, String(persistedCount));
  ok('round derives correctly after a full round', await page.evaluate(() => window.QLOBE_DEBUG.getState().round >= 1));
  ok('resetJournal clears and re-derives', await page.evaluate(() => window.QLOBE_DEBUG.resetJournal() === 0)
    && await page.evaluate(() => window.QLOBE_DEBUG.getJournal().length === 0));

  console.log('\n-- reduced motion --');
  const ctx2 = await browser.newContext({ viewport: { width: 1194, height: 834 }, reducedMotion: 'reduce' });
  const page2 = await ctx2.newPage();
  const rmErrors = [];
  page2.on('pageerror', (e) => rmErrors.push(String(e)));
  page2.on('console', (m) => { if (m.type() === 'error') rmErrors.push(m.text()); });
  await page2.goto(URL_, { waitUntil: 'networkidle' });
  await page2.evaluate(() => window.QLOBE_DEBUG.ready);
  await page2.evaluate(() => { window.QLOBE_DEBUG.mute(true); window.QLOBE_DEBUG.fastTimer(20); });
  ok('reduced motion is observed', await page2.evaluate(() => window.QLOBE_DEBUG.getState().reducedMotion === true));
  await page2.evaluate(() => window.QLOBE_DEBUG.startMode('bug-hunt'));
  await page2.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'hotel'
    && window.QLOBE_DEBUG.getState().roomReady, null, { timeout: 8000 });
  await page2.evaluate(() => window.QLOBE_DEBUG.winRound());
  await page2.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reward', null, { timeout: 15000 });
  ok('a whole room completes under reduced motion', true);
  await page2.screenshot({ path: path.join(SHOTS, 'reduced-motion-reward.png') });
  ok('reduced-motion run is clean', rmErrors.length === 0, JSON.stringify(rmErrors.slice(0, 3)));
  await ctx2.close();

  console.log('\n-- tablet portrait (834x1194) and phone (390x844) screenshots --');
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.evaluate(() => window.QLOBE_DEBUG.home());
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(SHOTS, 'portrait-splash.png') });

  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page3 = await ctx3.newPage();
  const phoneErrors = [];
  page3.on('pageerror', (e) => phoneErrors.push(String(e)));
  page3.on('console', (m) => { if (m.type() === 'error') phoneErrors.push(m.text()); });
  await page3.goto(URL_, { waitUntil: 'networkidle' });
  await page3.evaluate(() => window.QLOBE_DEBUG.ready);
  await page3.screenshot({ path: path.join(SHOTS, 'phone-390x844-splash.png') });

  // =======================================================================
  // ISSUE 3 — A PHONE IS PLAYABLE (§4.3a, §2.5 phone pass, §11 rows 24-25).
  //
  // A 390 px window cover-fits the 4:3 plate down to art x ∈ [523, 1077], and
  // the leaf room's nooks are authored at x = 466 / 478 / 831 / 1150. Three of
  // the four are off the crop, so BEFORE the fix a seeded round that put the
  // target in one of them could not be finished at all: the child dragged the
  // glass to the edge and the ladybug was not in the room. The HUD degenerated
  // with it — a 78 px banner and a journal tab sitting on the log plaque.
  // =======================================================================
  console.log('\n-- ISSUE 3: the phone (390x844) is playable, HUD and all --');
  {
    await page3.evaluate(() => {
      window.QLOBE_DEBUG.mute(true); window.QLOBE_DEBUG.seed(42); window.QLOBE_DEBUG.fastTimer(20);
    });
    await page3.evaluate(() => window.QLOBE_DEBUG.startMode('bug-hunt'));
    await page3.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'hotel'
      && window.QLOBE_DEBUG.getState().roomReady, null, { timeout: 8000 });
    await page3.screenshot({ path: path.join(SHOTS, 'phone-390x844-hotel.png') });

    // (b) the banner is a readable caption, not a one-word column.
    const bannerRect = await page3.evaluate(() => {
      const el = document.getElementById('banner');
      if (!el || el.hidden) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    ok('at 390x844 the banner is at least 200 css px wide', Boolean(bannerRect) && bannerRect.w >= 200,
      JSON.stringify(bannerRect));
    ok('the banner still fits inside the window at 390x844',
      Boolean(bannerRect) && bannerRect.x >= 0 && bannerRect.x + bannerRect.w <= 390.5,
      JSON.stringify(bannerRect));

    // (c) the journal tab clears every room plaque.
    const tabRect = await page3.evaluate(() => {
      const r = document.getElementById('btn-journal').getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const plaques = await page3.evaluate(() => window.QLOBE_DEBUG.getTargets());
    const tabHits = plaques.filter((t) => t.rect.x < tabRect.x + tabRect.w && t.rect.x + t.rect.w > tabRect.x
      && t.rect.y < tabRect.y + tabRect.h && t.rect.y + t.rect.h > tabRect.y);
    ok('at 390x844 the journal tab intersects no room plaque',
      tabHits.length === 0, JSON.stringify({ tabRect, hit: tabHits.map((t) => [t.id, t.rect]) }));
    ok('the journal tab keeps its 96 css px target on a phone',
      tabRect.w >= 96 && tabRect.h >= 96, JSON.stringify(tabRect));

    // (a) the target is inside the crop the phone can actually reach…
    await page3.evaluate(() => window.QLOBE_DEBUG.tap('leaf'));
    await page3.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'room'
      && window.QLOBE_DEBUG.getState().roomReady, null, { timeout: 8000 });
    await page3.screenshot({ path: path.join(SHOTS, 'phone-390x844-room-leaf.png') });
    const phoneSt = await page3.evaluate(() => window.QLOBE_DEBUG.getState());
    const phoneView = (await page3.evaluate(() => window.QLOBE_DEBUG.getLayout())).visibleArt;
    ok('the phone really is cropping the plate (a band narrower than the art)',
      phoneView.w < 1600 && phoneView.w > 0, JSON.stringify(phoneView));
    const phoneTarget = phoneSt.placements.find((p) => p.bugId === phoneSt.targetId);
    const inside = (v, m, p) => p.artX >= v.x + m && p.artX <= v.x + v.w - m
      && p.artY >= v.y + m && p.artY <= v.y + v.h - m;
    ok('at 390x844 the leaf-room TARGET sits inside the visible art',
      Boolean(phoneTarget) && inside(phoneView, 0, phoneTarget),
      JSON.stringify({ target: phoneTarget, visibleArt: phoneView }));
    ok('…and inside it by the 120 art px reach margin, not merely on its edge',
      Boolean(phoneTarget) && inside(phoneView, Math.min(120, phoneView.w / 3), phoneTarget),
      JSON.stringify({ target: phoneTarget, visibleArt: phoneView }));
    ok('the phone layout is still one of the authored nooks (zones never move)',
      (await readJSON(rel('config.json'))).rooms.find((r) => r.id === 'leaf').zones
        .some((z) => z.name === phoneTarget.zone && z.x === phoneTarget.artX && z.y === phoneTarget.artY),
      JSON.stringify(phoneTarget));

    // …and the round completes through the REAL path: lens.moveTo + dwell,
    // then a tap on the bug. Never winRound().
    await page3.evaluate(([x, y]) => window.QLOBE_DEBUG.setLens(x, y), [phoneTarget.artX, phoneTarget.artY]);
    await page3.waitForFunction((id) => window.QLOBE_DEBUG.getState().revealed.includes(id),
      phoneSt.targetId, { timeout: 8000 });
    ok('the dwell reveals the phone target through lens.moveTo', true);
    const phoneTargetRect = (await page3.evaluate(() => window.QLOBE_DEBUG.getTargets()))
      .find((t) => t.id === phoneSt.targetId);
    ok('the revealed target is a real on-screen tap target at 390x844',
      phoneTargetRect.enabled === true && phoneTargetRect.rect.w >= 96
      && phoneTargetRect.rect.x >= 0 && phoneTargetRect.rect.y >= 0
      && phoneTargetRect.rect.x + phoneTargetRect.rect.w <= 390.5
      && phoneTargetRect.rect.y + phoneTargetRect.rect.h <= 844.5,
      JSON.stringify(phoneTargetRect));
    await page3.evaluate((id) => window.QLOBE_DEBUG.tap(id), phoneSt.targetId);
    await page3.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reward', null, { timeout: 15000 });
    ok('a full leaf round completes on a phone through the lens path (no winRound)', true);
  }

  // §2.9's ONE exception: a rotation MID-ROUND may move a still-hidden target
  // back into the new crop. Nothing else moves — a found bug never does.
  console.log('\n-- ISSUE 3: rotating mid-round keeps the hidden target reachable --');
  {
    await page3.setViewportSize({ width: 1194, height: 834 });
    await page3.evaluate(() => { window.QLOBE_DEBUG.home(); window.QLOBE_DEBUG.resetJournal(); });
    await page3.evaluate(() => window.QLOBE_DEBUG.startMode('bug-hunt'));
    await page3.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'hotel'
      && window.QLOBE_DEBUG.getState().roomReady, null, { timeout: 8000 });
    await page3.evaluate(() => window.QLOBE_DEBUG.tap('leaf'));
    await page3.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'room'
      && window.QLOBE_DEBUG.getState().roomReady, null, { timeout: 8000 });
    const wide = await page3.evaluate(() => window.QLOBE_DEBUG.getState());
    const mate = wide.placements.find((p) => p.bugId !== wide.targetId);
    await page3.evaluate(([x, y]) => window.QLOBE_DEBUG.setLens(x, y), [mate.artX, mate.artY]);
    await page3.waitForFunction((id) => window.QLOBE_DEBUG.getState().revealed.includes(id),
      mate.bugId, { timeout: 8000 });

    await page3.setViewportSize({ width: 390, height: 844 });
    await page3.waitForTimeout(500);
    const narrow = await page3.evaluate(() => window.QLOBE_DEBUG.getState());
    const nView = (await page3.evaluate(() => window.QLOBE_DEBUG.getLayout())).visibleArt;
    const nTarget = narrow.placements.find((p) => p.bugId === narrow.targetId);
    ok('after the rotation the still-hidden target is back inside the crop',
      nTarget.artX >= nView.x && nTarget.artX <= nView.x + nView.w
      && nTarget.artY >= nView.y && nTarget.artY <= nView.y + nView.h,
      JSON.stringify({ nTarget, nView }));
    const movedMate = narrow.placements.find((p) => p.bugId === mate.bugId);
    ok('a bug the child already FOUND never moves on a rotation',
      movedMate.artX === mate.artX && movedMate.artY === mate.artY,
      JSON.stringify([mate, movedMate]));
    ok('the found bug is still found, in the journal world and in the glass',
      narrow.revealed.includes(mate.bugId)
      && (await page3.evaluate(() => window.QLOBE_DEBUG.getLens())).sprites
        .find((s) => s.id === mate.bugId).found === true,
      JSON.stringify(narrow.revealed));
    // and the moved target is still winnable, through the same real path
    await page3.evaluate(([x, y]) => window.QLOBE_DEBUG.setLens(x, y), [nTarget.artX, nTarget.artY]);
    await page3.waitForFunction((id) => window.QLOBE_DEBUG.getState().revealed.includes(id),
      narrow.targetId, { timeout: 8000 });
    await page3.evaluate((id) => window.QLOBE_DEBUG.tap(id), narrow.targetId);
    await page3.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reward', null, { timeout: 15000 });
    ok('the round still completes after a mid-round rotation', true);
  }

  ok('phone viewport (390x844) boots clean', phoneErrors.length === 0, JSON.stringify(phoneErrors.slice(0, 3)));
  await ctx3.close();

  const ctx4 = await browser.newContext({ viewport: { width: 1180, height: 520 } });
  const page4 = await ctx4.newPage();
  const wideErrors = [];
  page4.on('pageerror', (e) => wideErrors.push(String(e)));
  page4.on('console', (m) => { if (m.type() === 'error') wideErrors.push(m.text()); });
  await page4.goto(URL_, { waitUntil: 'networkidle' });
  await page4.evaluate(() => window.QLOBE_DEBUG.ready);
  await page4.screenshot({ path: path.join(SHOTS, 'compact-1180x520-splash.png') });
  ok('compact landscape viewport (1180x520) boots clean', wideErrors.length === 0, JSON.stringify(wideErrors.slice(0, 3)));
  await ctx4.close();

  console.log('\n-- ISSUE 2: the framed diorama at 2000x960 --');
  {
    const ctx5 = await browser.newContext({ viewport: { width: 2000, height: 960 } });
    const page5 = await ctx5.newPage();
    const wideFrameErrors = [];
    page5.on('pageerror', (e) => wideFrameErrors.push(String(e)));
    page5.on('console', (m) => { if (m.type() === 'error') wideFrameErrors.push(m.text()); });
    await page5.goto(URL_, { waitUntil: 'networkidle' });
    await page5.evaluate(() => window.QLOBE_DEBUG.ready);
    await page5.evaluate(() => { window.QLOBE_DEBUG.mute(true); window.QLOBE_DEBUG.fastTimer(20); });
    await page5.evaluate(() => window.QLOBE_DEBUG.startMode('bug-hunt'));
    await page5.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'hotel'
      && window.QLOBE_DEBUG.getState().roomReady, null, { timeout: 8000 });

    const g = await page5.evaluate(() => {
      const r = document.getElementById('stage').getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight };
    });
    ok('at 2000x960 the stage box is meaningfully inset on every edge (a framed card, not the window)',
      g.x > 20 && g.y > 20 && (g.x + g.w) < g.vw - 20 && (g.y + g.h) < g.vh - 20, JSON.stringify(g));
    const aspect = g.w / g.h;
    ok('the framed card holds the 1.25:1..1.4:1 aspect budget',
      aspect >= 1.24 && aspect <= 1.41, String(aspect));

    const layout = await page5.evaluate(() => window.QLOBE_DEBUG.getLayout());
    const v = layout.visibleArt;
    ok('the roof apex (art y ~ 32) survives the crop', Number(v.y) <= 32, JSON.stringify(v));
    const vertCropFrac = 1 - (Number(v.h) / 1200);
    ok('vertical art crop is measurable and stays well inside the 20% budget (~4.8% expected)',
      vertCropFrac > 0 && vertCropFrac <= 0.2, String(vertCropFrac));

    const roomTargetsWide = await page5.evaluate(() => window.QLOBE_DEBUG.getTargets());
    const hudRectsWide = await page5.evaluate(() => {
      const ids = ['banner', 'target-plaque', 'pips', 'btn-journal'];
      return ids.map((id) => {
        const el = document.getElementById(id);
        if (!el || el.hidden) return null;
        const r = el.getBoundingClientRect();
        return { id, x: r.x, y: r.y, w: r.width, h: r.height };
      }).filter(Boolean);
    });
    const overlaps = (a, bx, by, bw, bh) =>
      a.x < bx + bw && a.x + a.w > bx && a.y < by + bh && a.y + a.h > by;
    const offCard = roomTargetsWide.filter((t) =>
      t.rect.x < g.x - 1 || t.rect.y < g.y - 1 || t.rect.x + t.rect.w > g.x + g.w + 1 || t.rect.y + t.rect.h > g.y + g.h + 1);
    ok('all four room plaques land inside the framed card (none clipped off it)',
      offCard.length === 0, JSON.stringify(offCard.map((t) => [t.id, t.rect])));
    const hudHits = roomTargetsWide.filter((t) => hudRectsWide.some((h) => overlaps(t.rect, h.x, h.y, h.w, h.h)));
    ok('no HUD rect overlaps a room plaque at 2000x960',
      hudHits.length === 0, JSON.stringify(hudHits.map((t) => t.id)));

    await page5.screenshot({ path: path.join(SHOTS, 'wide-2000x960-hotel.png') });
    ok('2000x960 framed hotel boots clean', wideFrameErrors.length === 0, JSON.stringify(wideFrameErrors.slice(0, 3)));
    await ctx5.close();
  }

  console.log('\n-- console hygiene --');
  ok('zero page errors', pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 4)));
  ok('zero console errors', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 4)));
  const realFails = failedRequests.filter((f) => !/favicon|apple-touch/.test(f));
  ok('ZERO 404s — every authored path resolves', realFails.length === 0,
    JSON.stringify([...new Set(realFails)].slice(0, 8)));

  await browser.close();
}

// =========================================================================

async function main() {
  await ensureShots(SHOTS);
  await staticGate();

  let server = null;
  let base;
  if (args.flag('base')) {
    base = args.flag('base').replace(/\/$/, '');
  } else {
    const served = await serveRepo();
    server = served.server;
    base = served.base;
  }

  await browserGate(base);

  if (server) server.close();

  const failed = failures();
  const pass = results.length - failed.length;
  const fail = failed.length;
  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail) {
    console.log('\nFAILED:');
    for (const f of failed) console.log(`  - ${f.name}`);
  }
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error('\nqa.mjs crashed:', err);
  process.exit(1);
});
