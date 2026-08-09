#!/usr/bin/env node
// games/rhyming-detective/tools/qa.mjs — the gate.
//
// game-design.md §11.2's required coverage, in two halves: static assertions
// that need no browser (config invariants, rime truth derived from
// shared/data/words.json, asset existence and budgets, voice coverage, no
// emoji, relative-lowercase paths) and a real-Chrome drive of both modes at
// three viewports with and without reduced motion.
//
//   node games/rhyming-detective/tools/qa.mjs
//   node games/rhyming-detective/tools/qa.mjs --base https://qlo.be
//   node games/rhyming-detective/tools/qa.mjs --shots /tmp/shots --keep-open
//
// Flags
//   --base <url>    test a URL instead of the self-served worktree
//   --shots <dir>   screenshot directory
//   --headed        run Chrome headed
//
// Plumbing (flags, Playwright resolution, launch, monitored pages, reporter)
// comes from tools/qa/lib/driver.mjs — see tools/qa/README.md.
//
// **channel: 'chrome' is load-bearing.** Playwright's bundled Chromium ships
// without the AAC decoder, so every .m4a silently fails to decode and every
// recorded-voice assertion below would pass against the Web Speech fallback
// instead of the real teacher clip. Run under `caffeinate -dims` — a Mac that
// sleeps mid-run freezes the browser without failing it.
//
// Shots go OUTSIDE the repo by default: qa-shots/ is not in the root
// .gitignore, and a QA run must never leave 40 untracked PNGs in a worktree.

import { readFile, readdir, stat, access } from 'node:fs/promises';
import { constants as FS, createReadStream } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  args, launchChrome, createReporter, openSession,
  resolveShots, ensureShots, debug,
} from '../../../tools/qa/lib/driver.mjs';

// ---------------------------------------------------------------- arguments

const { flag } = args;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..');
const ROOT = path.resolve(GAME, '..', '..');
const SHOTS = resolveShots('/private/tmp/qlobe-rd-shots');

// ---------------------------------------------------------------- reporting

// The lib reporter owns the printed ' ok '/'FAIL' line (collapsed, 220-char
// detail); `checks` keeps its own RAW (uncollapsed, untruncated) copy because
// the failure roll-call at the bottom of main() slices detail to 300 chars
// on its own terms — a second, different truncation the lib does not do.
const { check: reportCheck } = createReporter({ style: 'ok', collapse: true, detailLimit: 220 });
const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, ok: Boolean(condition), detail });
  reportCheck(name, condition, detail);
}

const rel = (p) => path.join(GAME, p);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const exists = async (p) => { try { await access(p, FS.F_OK); return true; } catch { return false; } };
const sizeOf = async (p) => { try { return (await stat(p)).size; } catch { return -1; } };
const readJSON = async (p) => JSON.parse(await readFile(p, 'utf8'));

// =========================================================================
// STATIC ASSERTIONS (§11.2 items 1-8)
// =========================================================================

const NEW_CLIP_KEYS = [
  'welcome', 'mode-rhyme-hunt', 'mode-sound-detective', 'again',
  'case-stem', 'sound-listen',
  'yes-1', 'yes-2', 'yes-3', 'they-rhyme',
  'no-1', 'no-2', 'no-3',
  'two-more', 'one-more',
  'great-job', 'case-closed', 'next-case',
  'idle-1', 'idle-2', 'hint-look',
  'end', 'end-tip', 'sound-again',
];

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

async function staticChecks() {
  console.log('\n--- static ---');

  const config = await readJSON(rel('config.json'));
  check('config.json parses and is this game', config.id === 'rhyming-detective');

  // 1. §6.1 invariants -----------------------------------------------------
  const roomIds = Object.keys(config.rooms || {});
  const zoneProblems = [];
  for (const [id, room] of Object.entries(config.rooms || {})) {
    const names = (room.zones || []).map((z) => z.name);
    if (names.length !== 8) zoneProblems.push(`${id} has ${names.length} zones`);
    if (new Set(names).size !== names.length) zoneProblems.push(`${id} has duplicate zone names`);
    for (const zone of room.zones || []) {
      if (!(zone.w > 0 && zone.h > 0)) zoneProblems.push(`${id}/${zone.name} has no size`);
    }
  }
  check('every room has exactly 8 uniquely named zones', zoneProblems.length === 0, zoneProblems.join('; '));

  const caseProblems = [];
  for (const c of config.cases || []) {
    const words = [...c.rhymes, ...c.distractors];
    const keys = Object.keys(c.placements || {});
    if (keys.length !== 5) caseProblems.push(`${c.id} has ${keys.length} placements`);
    for (const w of words) if (!keys.includes(w)) caseProblems.push(`${c.id} does not place ${w}`);
    const zoneNames = (config.rooms[c.room]?.zones || []).map((z) => z.name);
    for (const [w, zone] of Object.entries(c.placements || {})) {
      if (!zoneNames.includes(zone)) caseProblems.push(`${c.id}/${w} -> unknown zone ${zone}`);
    }
    if (!config.rooms[c.room]) caseProblems.push(`${c.id} names unknown room ${c.room}`);
  }
  check('every case places exactly its 5 words into zones of its own room',
    caseProblems.length === 0, caseProblems.join('; '));

  // 1b. GROUNDING (Phase 3). A zone declares the surface it belongs to, and
  // anything that rests on something declares the art y of the line it rests
  // on. Without this every object is centred in its box, which is what made a
  // 150 px pen and a 240 px van hover at two different heights over one shelf.
  const artH = (config.art && config.art.h) || 1200;
  const maxSize = Math.max(...Object.values(config.sizes || { d: 200 }));
  const groundProblems = [];
  for (const [id, room] of Object.entries(config.rooms || {})) {
    for (const zone of room.zones || []) {
      const where = `${id}/${zone.name}`;
      if (!['wall', 'shelf', 'floor'].includes(zone.surface)) {
        groundProblems.push(`${where} has no surface`);
        continue;
      }
      if (zone.surface === 'wall') {
        if ('base' in zone) groundProblems.push(`${where} hangs but declares a base`);
        continue;
      }
      if (!Number.isFinite(zone.base)) { groundProblems.push(`${where} rests on nothing`); continue; }
      if (zone.base <= 0 || zone.base > artH) groundProblems.push(`${where} base ${zone.base} is off the plate`);
      // The box is the allowed area; if the contact line is not inside it, the
      // authored rect and the authored grounding disagree about the same object.
      if (zone.base < zone.y || zone.base > zone.y + zone.h) {
        groundProblems.push(`${where} base ${zone.base} outside its box ${zone.y}..${zone.y + zone.h}`);
      }
      // The biggest word that can land here must still fit above the line.
      if (zone.base - maxSize < 0) groundProblems.push(`${where} base ${zone.base} cannot seat a ${maxSize} px object`);
    }
  }
  check('every zone declares its surface, and every resting zone a contact line inside its box',
    groundProblems.length === 0, groundProblems.join('; '));
  const surfaceMix = Object.values(config.rooms).every((room) => {
    const kinds = new Set((room.zones || []).map((z) => z.surface));
    return kinds.has('floor') && (kinds.has('shelf') || kinds.has('wall'));
  });
  check('every room mixes floor with shelf or wall zones', surfaceMix);

  const mag = config.tuning.magnifierArt;
  // §8.2 ships 780 x 582 of art. The prop is drawn `object-fit: contain`, so a
  // box at any other ratio letterboxes it and it renders smaller than the box
  // suggests — the exact bug that left mockup 02's big bottom-right lens as a
  // thumbnail on the floor.
  check('the magnifier box keeps the shipped art ratio and reads as a foreground prop',
    Math.abs((mag.w / mag.h) - (780 / 582)) < 0.02 && mag.w >= 520,
    JSON.stringify(mag));
  check('tuning.dotCount equals the case count',
    config.tuning.dotCount === config.cases.length, `${config.tuning.dotCount} vs ${config.cases.length}`);
  check('three rooms serve five cases', roomIds.length === 3 && config.cases.length === 5);

  // 2. rime truth, derived from shared/data/words.json ----------------------
  const wordsFile = await readJSON(path.join(ROOT, 'shared/data/words.json'));
  const wordList = Array.isArray(wordsFile) ? wordsFile : (wordsFile.words || []);
  const rimeOf = new Map(wordList.map((w) => [w.word || w.id, w.rime]));
  const allWords = [...new Set(config.cases.flatMap((c) => [c.target, ...c.rhymes, ...c.distractors]))];
  const unknown = allWords.filter((w) => !rimeOf.has(w));
  check('every game word exists in shared/data/words.json',
    unknown.length === 0, unknown.join(', '));
  check('the game uses 27 distinct words', allWords.length === 27, String(allWords.length));

  const rimeProblems = [];
  for (const c of config.cases) {
    const target = rimeOf.get(c.target);
    if (target !== c.rime) rimeProblems.push(`${c.id}: target ${c.target} rime ${target} != declared ${c.rime}`);
    for (const r of c.rhymes) {
      if (rimeOf.get(r) !== target) rimeProblems.push(`${c.id}: ${r} rime ${rimeOf.get(r)} != ${target}`);
    }
    for (const d of c.distractors) {
      if (rimeOf.get(d) === target) rimeProblems.push(`${c.id}: distractor ${d} rhymes with the target`);
    }
    const [d1, d2] = c.distractors;
    if (rimeOf.get(d1) === rimeOf.get(d2)) rimeProblems.push(`${c.id}: distractors ${d1}/${d2} rhyme with each other`);
  }
  check('rime truth holds for every case (from words.json, not the design doc)',
    rimeProblems.length === 0, rimeProblems.join('; '));

  // 3 + 4. files exist, inside budget --------------------------------------
  const BUDGETS = [
    ['assets/splash-bg.jpg', 300], ['assets/bg-study.jpg', 300],
    ['assets/bg-kitchen.jpg', 300], ['assets/bg-bedroom.jpg', 300],
    ['assets/title.webp', 150],
    ['assets/mascots/cat-present.webp', 90], ['assets/mascots/cat-cheer.webp', 90],
    ['assets/mascots/bat-fly.webp', 90], ['assets/mascots/bat-cheer.webp', 90],
    ['assets/props/magnifier.webp', 70],
    ['assets/lockups/great-job.webp', 90], ['assets/lockups/they-rhyme.webp', 60],
    ['assets/og-image.jpg', 200],
  ];
  const missing = [];
  const over = [];
  for (const [file, capKb] of BUDGETS) {
    const bytes = await sizeOf(rel(file));
    if (bytes < 0) { missing.push(file); continue; }
    if (bytes > capKb * 1024) over.push(`${file} ${kb(bytes)} > ${capKb} KB`);
  }
  const spriteReport = [];
  for (const word of allWords) {
    const bytes = await sizeOf(rel(`assets/sprites/${word}.webp`));
    if (bytes < 0) { missing.push(`assets/sprites/${word}.webp`); continue; }
    if (bytes > 80 * 1024) over.push(`sprites/${word}.webp ${kb(bytes)} > 80 KB`);
    if (bytes < 30 * 1024) spriteReport.push(`${word} ${kb(bytes)}`);
  }
  check('every referenced art file is on disk', missing.length === 0, missing.join(', '));
  check('every art file is inside its §8.2 budget', over.length === 0, over.join('; '));
  // §11.2 names 30 KB as the sprite floor. A small file is a thin-art signal for
  // the visual pass, not a shippability failure — reported, never fatal.
  console.log(`note  ${spriteReport.length} sprite(s) under the 30 KB detail floor${spriteReport.length ? `: ${spriteReport.join(', ')}` : ''}`);
  check('the stale stub plate assets/bg.jpg is gone', !(await exists(rel('assets/bg.jpg'))));

  // 5. lines.json ----------------------------------------------------------
  const lines = await readJSON(rel('data/lines.json'));
  const wantKeys = [...NEW_CLIP_KEYS, ...allWords.map((w) => `word-${w}`)];
  const missingLines = wantKeys.filter((k) => !lines[k] || !String(lines[k]).trim());
  check('data/lines.json speaks all 24 new keys and all 27 word keys',
    missingLines.length === 0, missingLines.join(', '));
  check('lines.json carries no stray keys',
    Object.keys(lines).length === wantKeys.length, `${Object.keys(lines).length} vs ${wantKeys.length}`);

  // 6. audio manifest resolves --------------------------------------------
  const manifest = await readJSON(rel('assets/audio/manifest.json'));
  const badClips = [];
  let sharedRefs = 0;
  for (const [key, entry] of Object.entries(manifest)) {
    if (key.startsWith('_')) continue;
    const file = entry && entry.file;
    if (!file) { badClips.push(`${key} has no file`); continue; }
    // voice-clips.js:clipUrl — a plain name resolves against the game's own
    // audio dir; a ../-escaping path is passed through DOCUMENT-relative, i.e.
    // against games/rhyming-detective/. That is what lets the 27 shared word
    // clips be referenced rather than copied (§3.3).
    const escapes = /^(?:https?:|\/|\.\.\/)/.test(file);
    if (file.startsWith('../')) sharedRefs += 1;
    const onDisk = path.resolve(escapes ? GAME : rel('assets/audio'), file);
    if (!(await exists(onDisk))) badClips.push(`${key} -> ${file}`);
  }
  check('every manifest entry resolves on disk', badClips.length === 0, badClips.join(', '));
  check('the 27 shared word clips are referenced by ../-path, not copied',
    sharedRefs === 27, `${sharedRefs} shared refs`);
  const unrecorded = wantKeys.filter((k) => !manifest[k]);
  check('every spoken key has a manifest entry', unrecorded.length === 0, unrecorded.join(', '));

  // 7 + 8. no emoji; every path relative and lowercase ----------------------
  const sources = ['index.html', 'css/style.css', 'js/main.js', 'js/game.js', 'js/voice.js',
    'config.js', 'config.json', 'data/lines.json'];
  const emojiHits = [];
  const pathHits = [];
  for (const file of sources) {
    const text = await readFile(rel(file), 'utf8');
    text.split('\n').forEach((line, i) => { if (EMOJI.test(line)) emojiHits.push(`${file}:${i + 1}`); });
    // src=/href= attributes, CSS url(), and ES import specifiers. The og:/twitter
    // meta block is `content=` and is deliberately absolute — a social card URL
    // is not a shipped path.
    const specs = [
      ...[...text.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]),
      ...[...text.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map((m) => m[1]),
      ...[...text.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]),
    ];
    for (const spec of specs) {
      if (/^(https?:)?\/\//.test(spec) || spec.startsWith('/')) pathHits.push(`${file}: absolute ${spec}`);
      else if (spec !== spec.toLowerCase()) pathHits.push(`${file}: uppercase ${spec}`);
    }
  }
  check('no emoji anywhere in the shipped source', emojiHits.length === 0, emojiHits.join(', '));
  check('every shipped path is relative and lowercase', pathHits.length === 0, pathHits.join('; '));

  // registration -----------------------------------------------------------
  const manifestJson = await readJSON(rel('game.json'));
  check('game.json declares the §11.1 identity',
    manifestJson.title === 'Rhyming Detective'
    && manifestJson.category === 'reading-phonics'
    && manifestJson.age.min === 3 && manifestJson.age.max === 6
    && manifestJson.status === 'in-design' && manifestJson.accent === '#2f6fd0',
    JSON.stringify({ age: manifestJson.age, status: manifestJson.status, accent: manifestJson.accent }));
  check('game.json declares both modes with a one-skill description',
    manifestJson.modes.map((m) => m.id).join(',') === 'rhyme-hunt,sound-detective'
    && manifestJson.modes.every((m) => m.skill && m.skill.length > 10));
  const wantUses = ['shared/js/hotspot-scene.js', 'shared/js/voice-clips.js', 'shared/js/tap.js',
    'shared/js/sfx.js', 'shared/assets/audio/words/', 'shared/assets/ui/'];
  const missingUses = wantUses.filter((u) => !manifestJson.uses.includes(u));
  check('game.json uses[] names every shared dependency', missingUses.length === 0, missingUses.join(', '));
  const badUses = [];
  for (const u of manifestJson.uses) if (!(await exists(path.join(ROOT, u)))) badUses.push(u);
  check('every uses[] path exists in the repo', badUses.length === 0, badUses.join(', '));

  const registry = await readJSON(path.join(ROOT, 'games.json'));
  const entry = registry.games.find((g) => g.id === 'rhyming-detective');
  check('games.json mirrors the manifest',
    entry && entry.title === manifestJson.title && entry.accent === manifestJson.accent
    && entry.age.min === 3 && entry.status === 'in-design'
    && entry.modes.map((m) => m.id).join(',') === 'rhyme-hunt,sound-detective');
  check('the curated hub tile is on disk and untouched by this build',
    await exists(path.join(ROOT, entry.icon)), entry && entry.icon);
}

// =========================================================================
// A tiny static server, so the gate needs no external process.
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
// BROWSER
// =========================================================================

const sessions = [];
let base = '';

// Every session is watched for the §11.2 item 22 trio: page/console errors,
// failed or 4xx requests, and any request that leaves the base origin.
// openSession's `allowAbortedMedia` only names .m4a (the lib's platform-wide
// exemption for an interrupted clip fetch) — this game's audio is entirely
// .m4a (assets/audio/manifest.json), so it is a faithful match for the
// original's broader `/\.(m4a|mp3|wav)$/` guard, which never actually had an
// mp3 or wav to match here.
async function openGame(browser, viewport, reducedMotion = 'no-preference', label = '') {
  const session = await openSession(browser, {
    url: `${base}/games/rhyming-detective/`,
    base,
    viewport,
    reducedMotion,
    allowAbortedMedia: true,
  });
  session.label = label || `${viewport.width}x${viewport.height}`;
  sessions.push(session);
  return session.page;
}

const state = debug.getState;
const targets = debug.getTargets;
const awaitPlay = (page, timeout = 25000) => debug.waitForInput(page, { timeout });

// The recorded-clip probe. voice-clips.onClip fires with the <audio> element at
// the moment a real file is handed to the decoder, so a key in this list came
// from the m4a channel and NOT from the Web Speech fallback.
async function armClipProbe(page) {
  await page.evaluate(async () => {
    const clips = await import('../../../shared/js/voice-clips.js');
    window.__rdClips = [];
    if (window.__rdClipOff) window.__rdClipOff();
    window.__rdClipOff = clips.onClip((key) => window.__rdClips.push(key));
  });
}
const clipLog = (page) => page.evaluate(() => window.__rdClips.slice());
const resetClips = (page) => page.evaluate(() => { window.__rdClips.length = 0; });

// Clips are chained on the PREVIOUS clip's own end event (§3.4 gaps are pauses
// between recordings, not offsets from the tap), so a composed line lands whole
// seconds after the visual beat that started it — and fastTimers does not scale
// audio. Every recorded-clip assertion therefore waits for the clip rather than
// sampling the log at an arbitrary moment.
async function waitForClip(page, pattern, count = 1, timeout = 14000) {
  try {
    await page.waitForFunction(([p, want]) =>
      window.__rdClips.filter((k) => new RegExp(p).test(k)).length >= want,
    [pattern, count], { timeout });
    return true;
  } catch { return false; }
}

// Start a mode without awaiting it, so the case-intro can be observed.
async function beginMode(page, id) {
  await page.evaluate((mode) => { window.QLOBE_DEBUG.startMode(mode); }, id);
}

// Drive one whole mode to the end screen through the real controls.
async function runModeToEnd(page, mode, tag) {
  await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(0.04));
  await beginMode(page, mode);
  await awaitPlay(page);
  for (let i = 0; i < 5; i += 1) {
    const won = await page.evaluate(() => window.QLOBE_DEBUG.winRound());
    if (!won) { check(`${tag} case ${i + 1} completes`, false, 'winRound returned false'); return false; }
    const filled = await page.locator('#celebration-dots .dot.filled').count();
    if (filled !== i + 1) {
      check(`${tag} case ${i + 1} fills exactly ${i + 1} dot(s)`, false, `${filled} filled`);
      return false;
    }
    await page.evaluate(() => window.QLOBE_DEBUG.nextCase());
    if (i < 4) await awaitPlay(page);
  }
  const finished = (await state(page)).screen;
  check(`${tag} runs all five cases to the end screen`, finished === 'end', finished);
  check(`${tag} end screen fills all five dots`,
    (await page.locator('#end-dots .dot.filled').count()) === 5);
  return finished === 'end';
}

// Reserve overlap: no hotspot may sit under a HUD box by more than 25 % of its
// own area (§5.4). This is the one mechanism keeping art and HUD apart.
function overlapReport(items, reserves) {
  const bad = [];
  for (const { id, rect } of items) {
    const area = rect.w * rect.h;
    if (!area) continue;
    for (const r of reserves) {
      const ox = Math.max(0, Math.min(rect.x + rect.w, r.x + r.width) - Math.max(rect.x, r.x));
      const oy = Math.max(0, Math.min(rect.y + rect.h, r.y + r.height) - Math.max(rect.y, r.y));
      const frac = (ox * oy) / area;
      if (frac > 0.25) bad.push(`${id} ${(frac * 100).toFixed(0)}%`);
    }
  }
  return bad;
}

async function viewportChecks(page, tag, wantLayout) {
  const layout = await page.evaluate(() => window.QLOBE_DEBUG.getLayout());
  check(`${tag} reports layout '${wantLayout}'`, layout.layout === wantLayout, layout.layout);
  const items = await targets(page);
  check(`${tag} shows 5 hotspots plus the target sprite`, items.length === 6, String(items.length));
  check(`${tag} roles are truthful (3 correct, 2 wrong, 1 neutral)`,
    items.filter((t) => t.role === 'correct').length === 3
    && items.filter((t) => t.role === 'wrong').length === 2
    && items.filter((t) => t.role === 'neutral').length === 1,
    items.map((t) => `${t.id}:${t.role}`).join(' '));
  const small = items.filter((t) => t.rect.w < 96 || t.rect.h < 96);
  check(`${tag} every tap target is at least 96 CSS px on both axes`,
    small.length === 0, small.map((t) => `${t.id} ${Math.round(t.rect.w)}x${Math.round(t.rect.h)}`).join(', '));
  const hud = await page.evaluate(() => ['#btn-back', '#btn-sound', '#word-card'].map((sel) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    return { id: sel, w: r.width, h: r.height };
  }));
  check(`${tag} every HUD control is at least 96 CSS px`,
    hud.every((b) => b.w >= 96 && b.h >= 96),
    hud.map((b) => `${b.id} ${Math.round(b.w)}x${Math.round(b.h)}`).join(', '));
  const bad = overlapReport(items, layout.reserves);
  check(`${tag} no hotspot hides under the HUD by more than 25 %`, bad.length === 0, bad.join(', '));
  const vp = page.viewportSize();
  const off = items.filter((t) => t.rect.x < -2 || t.rect.y < -2
    || t.rect.x + t.rect.w > vp.width + 2 || t.rect.y + t.rect.h > vp.height + 2);
  check(`${tag} every hotspot stays on screen`, off.length === 0,
    off.map((t) => `${t.id} ${Math.round(t.rect.x)},${Math.round(t.rect.y)} ${Math.round(t.rect.w)}x${Math.round(t.rect.h)}`).join(', '));

  // Phase 3 — grounding and findability are drawn by game CSS on the module's
  // frozen classes, from two custom properties the game publishes per hotspot.
  // If those stop being written the shadow and the halo silently fall back to
  // a 120 px default on every object, at every scale.
  const dressing = await page.evaluate(() => {
    const out = { missingVars: [], noShadow: [], noHalo: [], targetHalo: false, surfaces: {} };
    for (const el of document.querySelectorAll('.rd-scene .hs-hotspot')) {
      const id = el.dataset.id;
      const s = getComputedStyle(el);
      const sw = parseFloat(s.getPropertyValue('--rd-sw'));
      const sh = parseFloat(s.getPropertyValue('--rd-sh'));
      if (!(sw > 0) || !(sh > 0)) out.missingVars.push(id);
      const after = getComputedStyle(el, '::after');
      if (!(parseFloat(after.width) > 8) || after.content === 'none') out.noShadow.push(id);
      const before = getComputedStyle(el, '::before');
      const lit = before.content !== 'none' && parseFloat(before.opacity) > 0.5;
      if (el.classList.contains('rd-target')) { if (lit) out.targetHalo = true; }
      else if (el.classList.contains('is-idle') && !lit) out.noHalo.push(id);
      out.surfaces[id] = ['rd-surf-wall', 'rd-surf-shelf', 'rd-surf-floor']
        .filter((c) => el.classList.contains(c)).join('|');
    }
    return out;
  });
  check(`${tag} every hotspot publishes its live sprite size to the CSS dressing`,
    dressing.missingVars.length === 0, dressing.missingVars.join(', '));
  check(`${tag} every hotspot draws a contact shadow`,
    dressing.noShadow.length === 0, dressing.noShadow.join(', '));
  check(`${tag} every idle candidate wears the findable halo`,
    dressing.noHalo.length === 0, dressing.noHalo.join(', '));
  check(`${tag} the target sprite never wears the halo (it is the question, not an answer)`,
    dressing.targetHalo === false);
  check(`${tag} every object carries exactly one surface class`,
    Object.values(dressing.surfaces).every((v) => /^rd-surf-(wall|shelf|floor)$/.test(v)),
    JSON.stringify(dressing.surfaces));

  const clash = await spriteClash(page);
  check(`${tag} nothing is placed on top of the target sprite`,
    clash.onTarget.length === 0, clash.onTarget.join(', '));

  // 2.5's banner is one sentence on ONE line. When it wraps, the target word —
  // the only coloured word in it, and the point of the whole sentence — drops
  // onto a second line on its own and reads as a separate label. The `min-height`
  // is one line plus padding, so a banner taller than its own minimum wrapped.
  const bannerFit = await page.evaluate(() => {
    const el = document.getElementById('banner');
    const min = parseFloat(getComputedStyle(el).minHeight);
    return { h: el.getBoundingClientRect().height, min, text: el.textContent.trim() };
  });
  check(`${tag} the prompt banner holds its sentence on one line`,
    bannerFit.h <= bannerFit.min + 2,
    JSON.stringify({ h: Math.round(bannerFit.h), min: bannerFit.min, text: bannerFit.text }));

  // The prop may be large now, so it has to be provably harmless: below the
  // objects in paint order and never the top element over a hotspot centre.
  const magOk = await page.evaluate(() => {
    const el = document.querySelector('.rd-magnifier');
    if (!el || el.hidden) return { skipped: true };
    const m = el.getBoundingClientRect();
    const hit = [];
    for (const spot of document.querySelectorAll('.rd-scene .hs-hotspot')) {
      const r = spot.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      if (top && top !== spot && !spot.contains(top)) hit.push(`${spot.dataset.id} -> ${top.className}`);
    }
    return {
      skipped: false,
      w: Math.round(m.width),
      z: Number(getComputedStyle(el).zIndex),
      hotspotZ: Number(getComputedStyle(document.querySelector('.hs-hotspot')).zIndex),
      hit,
    };
  });
  if (!magOk.skipped) {
    check(`${tag} the magnifier prop paints under the objects`,
      magOk.z < magOk.hotspotZ, `magnifier z${magOk.z} vs hotspot z${magOk.hotspotZ}`);
    check(`${tag} nothing covers the centre of any tap target`,
      magOk.hit.length === 0, magOk.hit.join(', '));
  }
}

// The target sprite is pinned at `tuning.targetSpriteArt` and owns the middle
// of every room, so a zone drawn through it collides in EVERY case that lands
// an object there — and sound-detective shuffles all five objects across all
// eight zones, so one bad zone is a bug in five cases, not in the one that
// happens to name it. Two rooms shipped one: case 3's hen stood on the
// ladybug's back and case 5's net crossed the jet's nose. Measured on the live
// rects, because the reserve lifts the target clear of the word card and the
// authored numbers alone do not say where it ends up.
async function spriteClash(page) {
  return page.evaluate(() => {
    const boxes = [...document.querySelectorAll('.rd-scene .hs-hotspot')].map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.dataset.id, x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const t = boxes.find((b) => b.id === 'target');
    if (!t) return { onTarget: [] };
    const area = t.w * t.h;
    const onTarget = [];
    for (const b of boxes) {
      if (b === t) continue;
      const ox = Math.min(b.x + b.w, t.x + t.w) - Math.max(b.x, t.x);
      const oy = Math.min(b.y + b.h, t.y + t.h) - Math.max(b.y, t.y);
      if (ox > 0 && oy > 0 && (ox * oy) / area > 0.02) {
        onTarget.push(`${b.id} covers ${Math.round((100 * ox * oy) / area)}% of the target`);
      }
    }
    return { onTarget };
  });
}

// §9.3 — the yes bubble rides its sprite to the tray. The tray is HUD, so for
// as long as the scene root was its own stacking context the bubble spent the
// whole flight painted BEHIND the word card: animating, opaque, invisible.
// Sampled mid-flight, where the failure actually lives.
async function flightProbe(page) {
  return page.evaluate(() => {
    const b = document.querySelector('.hs-bubble');
    const hud = document.getElementById('hud');
    const root = document.querySelector('.hs-root');
    if (!b) return { present: false };
    const r = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    return {
      present: true,
      opacity: Number(cs.opacity),
      z: Number(cs.zIndex),
      hudZ: Number(getComputedStyle(hud).zIndex),
      rootZ: getComputedStyle(root).zIndex,
      moved: cs.transform !== 'none' && cs.transform !== 'matrix(1, 0, 0, 1, 0, 0)',
      onScreen: r.width > 40 && r.height > 20
        && r.right > 0 && r.bottom > 0
        && r.left < window.innerWidth && r.top < window.innerHeight,
    };
  });
}

// The nine distinct screen states of §11.2 item 23, at real speed.
async function captureStates(page, tag, assertFlight = false) {
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${tag}-${name}.png`) });
  await page.evaluate(() => { window.QLOBE_DEBUG.home(); window.QLOBE_DEBUG.fastTimers(1); });
  await page.waitForTimeout(260);
  await shot('01-splash');
  await page.locator('#btn-play').click();
  await page.waitForTimeout(400);
  await shot('02-splash-modes');

  await beginMode(page, 'rhyme-hunt');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'case-intro', null, { timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  await shot('03-case-intro');
  await awaitPlay(page);
  await page.waitForTimeout(600);
  await shot('04-play');

  const items = await targets(page);
  // neutral: the target sprite is a free "what am I looking for again?"
  await page.evaluate(() => { window.QLOBE_DEBUG.tap('target'); });
  await page.waitForTimeout(340);
  await shot('05-bubble-neutral');
  await page.waitForTimeout(1600);

  const wrong = items.find((t) => t.role === 'wrong').id;
  await page.evaluate((id) => { window.QLOBE_DEBUG.tap(id); }, wrong);
  await page.waitForTimeout(520);
  await shot('06-bubble-no');
  await page.waitForTimeout(1800);

  // §9.3's flight runs t+520 .. t+1140 on the real clock, and a screenshot
  // costs a few hundred ms of it — so BOTH probes are taken before the first
  // shot, or the second lands after the sprite has settled in the tray and
  // reports an absent bubble that was never absent.
  const rights = items.filter((t) => t.role === 'correct').map((t) => t.id);
  await page.evaluate((id) => { window.QLOBE_DEBUG.tap(id); }, rights[0]);
  await page.waitForTimeout(600);          // just after the flight starts
  const flight = await flightProbe(page);
  await page.waitForTimeout(170);          // deeper into the arc
  const flightLate = await flightProbe(page);
  await shot('07-bubble-yes-flight');
  await page.waitForTimeout(900);
  // A second flight, sampled late, when the bubble is over the word card: the
  // exact frame that used to be blank.
  await page.evaluate((id) => { window.QLOBE_DEBUG.tap(id); }, rights[1]);
  await page.waitForTimeout(790);
  await shot('13-flight-mid');
  if (assertFlight) {
    check(`${tag} the yes bubble is still on screen mid-flight`,
      flight.present && flight.onScreen && flight.opacity > 0.5,
      JSON.stringify(flight));
    check(`${tag} the yes bubble travels with its sprite`,
      flightLate.present && flightLate.moved && flightLate.onScreen,
      JSON.stringify(flightLate));
    check(`${tag} the bubble layer paints above the HUD it flies over`,
      flight.z > flight.hudZ && flight.rootZ === 'auto',
      `bubble z${flight.z} hud z${flight.hudZ} sceneRoot z${flight.rootZ}`);
  }
  await page.waitForTimeout(700);

  await page.evaluate(() => window.QLOBE_DEBUG.winRound());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'celebration', null, { timeout: 15000 });
  await page.waitForTimeout(2400);
  await shot('08-celebration');

  // Mode 2's play screen is a distinct look: no printed words anywhere.
  await page.evaluate(() => { window.QLOBE_DEBUG.home(); window.QLOBE_DEBUG.fastTimers(0.05); });
  await beginMode(page, 'sound-detective');
  await awaitPlay(page);
  await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(1));
  await page.waitForTimeout(500);
  await shot('09-play-sound-detective');
  const soundItems = await targets(page);
  await page.evaluate((id) => { window.QLOBE_DEBUG.tap(id); }, soundItems.find((t) => t.role === 'wrong').id);
  await page.waitForTimeout(520);
  await shot('10-bubble-glyph');
  await page.waitForTimeout(1800);
  // fastTimers has to be back to 1 BEFORE the round is won, not after. The 12 s
  // auto-advance is armed the moment the overlay mounts, at whatever scale is
  // in force THEN — at 0.04 that is 480 ms, and changing the scale afterwards
  // cannot un-arm a timer already set. The shot below (mount + 2.4 s) therefore
  // landed two screens later, on case 2's dimmed case-intro, and
  // `11-celebration-sound-detective.png` never once showed a celebration.
  await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(1));
  await page.evaluate(() => window.QLOBE_DEBUG.winRound());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'celebration', null, { timeout: 25000 });
  await page.waitForTimeout(2400);
  check(`${tag} the mode 2 celebration capture really is a celebration`,
    (await state(page)).screen === 'celebration'
    && (await page.locator('#celebration.show').count()) === 1
    && (await page.locator('#finds .find-label').count()) === 3,
    `screen ${(await state(page)).screen}`);
  await shot('11-celebration-sound-detective');

  await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(0.04));
  for (let i = 1; i < 5; i += 1) {
    await page.evaluate(() => window.QLOBE_DEBUG.nextCase());
    await awaitPlay(page);
    await page.evaluate(() => window.QLOBE_DEBUG.winRound());
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'celebration', null, { timeout: 15000 });
  }
  await page.evaluate(() => window.QLOBE_DEBUG.nextCase());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end', null, { timeout: 15000 });
  await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(1));
  await page.waitForTimeout(900);
  await shot('12-end');
  await page.evaluate(() => window.QLOBE_DEBUG.home());
  await page.waitForTimeout(300);
}

async function main() {
  await ensureShots(SHOTS);
  await staticChecks();

  let server = null;
  if (flag('base')) {
    base = flag('base').replace(/\/$/, '');
  } else {
    const served = await serveRepo();
    server = served.server;
    base = served.base;
  }
  console.log(`\n--- browser (${base}) ---`);

  const browser = await launchChrome();

  // -- the hub route -------------------------------------------------------
  const hubContext = await browser.newContext({ viewport: { width: 1194, height: 834 } });
  const hubPage = await hubContext.newPage();
  const hubFailed = [];
  hubPage.on('response', (r) => { if (r.status() >= 400) hubFailed.push(`${r.status()} ${r.url()}`); });
  await hubPage.goto(`${base}/#reading-phonics`, { waitUntil: 'networkidle' });
  const tile = hubPage.locator('a.tile[aria-label^="Rhyming Detective"]');
  check('the hub lists Rhyming Detective exactly once', (await tile.count()) === 1);
  check('the hub tile routes to the game folder',
    (await tile.getAttribute('href')) === 'games/rhyming-detective/');
  check('the hub tile uses the curated production art',
    (await tile.locator('img').getAttribute('src')) === 'assets/hub/tiles/rhyming-detective.jpg');
  await tile.click();
  await hubPage.waitForLoadState('networkidle');
  await hubPage.evaluate(() => window.QLOBE_DEBUG.ready);
  check('the game boots from its hub tile route',
    (await hubPage.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'splash');
  check('booting via the hub raises no 404', hubFailed.length === 0, hubFailed.join(' | '));
  await hubContext.close();

  // -- the deep session: 1194 x 834, motion on ------------------------------
  const page = await openGame(browser, { width: 1194, height: 834 }, 'no-preference', 'landscape');
  check('the splash paints on a direct boot',
    (await state(page)).screen === 'splash');

  // 2.3's composition, measured. The title is authored at min(72vw, 900px) but
  // a vh cap is what actually binds on a landscape tablet, so the cap IS the
  // size — at 24vh the wordmark drew at 381 px, a third of mockup 01's, and the
  // column was pinned to the top with the tile row's dead box under it.
  const splashGeom = await page.evaluate(() => {
    const r = (sel) => document.querySelector(sel).getBoundingClientRect();
    const t = r('.lockup.title');
    const band = r('#mascot-band');
    const play = document.getElementById('btn-play');
    const p = play.getBoundingClientRect();
    return {
      titleW: t.width, titleTop: t.top, bandTop: band.top, bandBottom: band.bottom,
      playW: play.offsetWidth, playH: play.offsetHeight,
      playRing: parseFloat(getComputedStyle(play).borderTopWidth),
      catH: r('#mascot-band .cat').height,
      vw: window.innerWidth, vh: window.innerHeight,
    };
  });
  check('the title lockup is the dominant element on the splash',
    splashGeom.titleW >= splashGeom.vw * 0.34 && splashGeom.titleW > splashGeom.playW * 1.4,
    JSON.stringify({ title: Math.round(splashGeom.titleW), vw: splashGeom.vw, play: splashGeom.playW }));
  check('the splash column is balanced, not pinned to the top edge',
    splashGeom.titleTop >= 12 && splashGeom.bandTop > splashGeom.titleTop
    && splashGeom.bandBottom < splashGeom.vh,
    JSON.stringify({ titleTop: Math.round(splashGeom.titleTop), bandBottom: Math.round(splashGeom.bandBottom) }));
  check('Play keeps its authored 300 x 132 and mockup 01 cream ring',
    splashGeom.playW >= 300 && splashGeom.playH >= 132 && splashGeom.playRing >= 4,
    JSON.stringify({ w: splashGeom.playW, h: splashGeom.playH, ring: splashGeom.playRing }));
  check('the detective cat presents the game rather than decorating it',
    splashGeom.catH >= 180, String(Math.round(splashGeom.catH)));
  const modes = await page.evaluate(() => window.QLOBE_DEBUG.listModes());
  check('listModes() reports both modes from config',
    modes.map((m) => m.id).join(',') === 'rhyme-hunt,sound-detective', JSON.stringify(modes));
  check('getTargets() is empty off the play screen', (await targets(page)).length === 0);

  // §3.1 — nothing speaks before the first gesture.
  check('no audio before the first gesture',
    (await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog())).length === 0);
  await armClipProbe(page);
  await page.evaluate(() => { window.QLOBE_DEBUG.seed(42); window.QLOBE_DEBUG.fastTimers(1); });
  await page.locator('#btn-play').click();
  await page.waitForFunction(() => window.__rdClips.includes('welcome'), null, { timeout: 8000 })
    .catch(() => {});
  const bootLog = await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog());
  check('tapping Play speaks the recorded welcome clip',
    bootLog.some((e) => e.key === 'welcome' && e.kind === 'clip')
    && (await clipLog(page)).includes('welcome'),
    JSON.stringify(bootLog.slice(0, 3)));
  check('the mode tiles are revealed by Play', await page.locator('#mode-row.show').count() === 1);

  // -- Mode 1 case 1, at real speed ---------------------------------------
  await resetClips(page);
  await page.locator('.mode-tile.mode-rhyme-hunt').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'case-intro', null, { timeout: 8000 });
  const intro = await state(page);
  check('a mode tile enters the case-intro of case 1',
    intro.screen === 'case-intro' && intro.mode === 'rhyme-hunt' && intro.caseIndex === 0
    && intro.target === 'cat', JSON.stringify(intro));
  await awaitPlay(page);
  check('the case-intro hands over to play with the case armed',
    (await state(page)).awaitingInput === true);
  const promptClips = await clipLog(page);
  check('the case prompt is composed from recorded clips (case-stem + word-cat)',
    promptClips.includes('case-stem') && promptClips.includes('word-cat'), promptClips.join(', '));

  await viewportChecks(page, 'landscape/rhyme-hunt', 'wide');
  check('the banner prints the target word in Mode 1',
    (await page.locator('#banner').textContent()).trim() === 'Find a word that rhymes with cat');
  check('the word card prints the target in Mode 1',
    (await page.locator('#word-card .card-word').textContent()) === 'cat');
  check('the magnifier prop is decoration, never a control',
    await page.evaluate(() => {
      const el = document.querySelector('.rd-magnifier');
      return !el.hidden && getComputedStyle(el).pointerEvents === 'none';
    }));

  // §11.2 item 13 — the wrong-tap probe, at real speed so "within 1.5 s" means it.
  const play1 = await targets(page);
  const distractor = play1.find((t) => t.role === 'wrong').id;
  await resetClips(page);
  const wrongResult = await page.evaluate((id) => window.QLOBE_DEBUG.tap(id), distractor);
  check('a distractor tap is refused, gently',
    wrongResult.accepted === false && wrongResult.role === 'wrong', JSON.stringify(wrongResult));
  const afterWrong = await state(page);
  check('a wrong tap consumes nothing',
    afterWrong.found.length === 0 && afterWrong.awaitingInput === true && afterWrong.wrongTaps === 1,
    JSON.stringify({ found: afterWrong.found, awaiting: afterWrong.awaitingInput, wrong: afterWrong.wrongTaps }));
  const wrongClips = await clipLog(page);
  check('a wrong tap speaks the object name then a recorded no-line',
    wrongClips.includes(`word-${distractor}`) && wrongClips.some((k) => /^no-\d$/.test(k)),
    wrongClips.join(', '));
  await page.waitForFunction((id) => {
    const t = window.QLOBE_DEBUG.getTargets().find((x) => x.id === id);
    return t && t.state === 'idle';
  }, distractor, { timeout: 1500 });
  check('the declined object returns to idle within 1.5 s and stays tappable',
    (await targets(page)).find((t) => t.id === distractor).state === 'idle'
    && await page.evaluate((id) => !document.querySelector(`.hs-hotspot[data-id="${id}"]`).disabled, distractor));

  // §11.2 item 15 — the recorded-voice assertion on a correct tap.
  await resetClips(page);
  const rhyme = play1.find((t) => t.role === 'correct').id;
  const rightResult = await page.evaluate((id) => window.QLOBE_DEBUG.tap(id), rhyme);
  check('a rhyme tap is accepted', rightResult.accepted === true && rightResult.role === 'correct',
    JSON.stringify(rightResult));
  await waitForClip(page, '^yes-\\d$');
  const yesClips = await clipLog(page);
  check('a correct tap plays the recorded word clip and a recorded yes-line',
    yesClips.includes(`word-${rhyme}`) && yesClips.some((k) => /^yes-\d$/.test(k)), yesClips.join(', '));
  const afterRight = await state(page);
  check('the found rhyme lands in the tray', afterRight.found.join(',') === rhyme, JSON.stringify(afterRight.found));
  check('the tray shows the found sprite',
    await page.locator('#tray .slot.filled .slot-sprite').count() === 1);

  // §11.2 item 14 — a found object is inert.
  const repeat = await page.evaluate((id) => window.QLOBE_DEBUG.tap(id), rhyme);
  check('an already-found rhyme is inert',
    repeat.accepted === false && repeat.role === 'correct'
    && (await state(page)).found.length === 1, JSON.stringify(repeat));
  check('unknown ids are refused', JSON.stringify(await page.evaluate(() => window.QLOBE_DEBUG.tap('nope')))
    === JSON.stringify({ accepted: false, role: 'none' }));

  // §11.2 item 16 — finish the case by hand, then winRound() for the rest.
  await resetClips(page);
  await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(0.2));
  check('winRound() closes the case', await page.evaluate(() => window.QLOBE_DEBUG.winRound()));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'celebration', null, { timeout: 15000 });
  const celebrationState = await state(page);
  check('the third rhyme mounts the celebration',
    celebrationState.screen === 'celebration' && celebrationState.found.length === 3,
    JSON.stringify(celebrationState.found));
  await page.waitForFunction(() => window.__rdClips.includes('great-job'), null, { timeout: 8000 }).catch(() => {});
  check('the celebration speaks the recorded great-job clip',
    (await clipLog(page)).includes('great-job'), (await clipLog(page)).join(', '));
  await page.waitForTimeout(900);
  check('the celebration pairs the target with the last rhyme found',
    (await page.locator('#pair-left').textContent()) === celebrationState.target
    && (await page.locator('#pair-right').textContent()) === celebrationState.found[2],
    `${await page.locator('#pair-left').textContent()} + ${await page.locator('#pair-right').textContent()}`);
  check('the celebration lifts the three collected sprites',
    await page.locator('#finds .find-sprite').count() === 3);
  check('one progress dot is filled after case 1',
    await page.locator('#celebration-dots .dot.filled').count() === 1);

  // 2.6 composition — the three finds sit ON a shelf strip between the ribbon
  // and the button, flanked by two mascots that are visibly the larger figures.
  // Without the strip the five cut-outs read as one scattered row.
  // Wait out the 9.5 pop-in first: Next Case mounts at scale(.5), and a
  // getBoundingClientRect taken mid-transition measures the ANIMATION, not the
  // control. The pill's own size assertions therefore use the layout box.
  await page.waitForSelector('#btn-next.in');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const celebrationBox = await page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, top: r.top };
    };
    const finds = document.getElementById('finds');
    const cs = getComputedStyle(finds);
    return {
      finds: box('#finds'),
      cat: box('#cat-cheer'),
      bat: box('#bat-cheer'),
      ribbon: box('#they-rhyme'),
      next: box('#btn-next'),
      shelfBg: cs.backgroundColor,
      shelfRadius: parseFloat(cs.borderTopLeftRadius),
      shelfShadow: cs.boxShadow !== 'none',
      nextText: document.getElementById('btn-next').textContent.trim(),
      nextLabel: document.getElementById('btn-next').getAttribute('aria-label'),
      nextW: document.getElementById('btn-next').offsetWidth,
      nextH: document.getElementById('btn-next').offsetHeight,
      plus: getComputedStyle(document.getElementById('pair-plus')).color,
      plusSize: parseFloat(getComputedStyle(document.getElementById('pair-plus')).fontSize),
    };
  });
  check('the found sprites sit on a cream shelf strip, not on the bare background',
    celebrationBox.shelfRadius >= 20 && celebrationBox.shelfShadow
    && /^rgba?\(255, 25[0-9]/.test(celebrationBox.shelfBg),
    `${celebrationBox.shelfBg} r${celebrationBox.shelfRadius}`);
  check('the shelf strip sits between the ribbon and the advance button',
    celebrationBox.finds.top >= celebrationBox.ribbon.bottom - 2
    && celebrationBox.finds.bottom <= celebrationBox.next.top + 2,
    JSON.stringify({ ribbon: Math.round(celebrationBox.ribbon.bottom), finds: [Math.round(celebrationBox.finds.top), Math.round(celebrationBox.finds.bottom)], next: Math.round(celebrationBox.next.top) }));
  check('the mascots flank the shelf and are the larger figures',
    celebrationBox.cat.x < celebrationBox.finds.x
    && celebrationBox.bat.x > celebrationBox.finds.x
    && celebrationBox.cat.h > celebrationBox.finds.h * 0.9,
    JSON.stringify({ cat: Math.round(celebrationBox.cat.h), finds: Math.round(celebrationBox.finds.h) }));
  check('Next Case is a labelled pill that keeps its accessible name',
    celebrationBox.nextText === 'Next Case' && celebrationBox.nextLabel === 'Next case'
    && celebrationBox.nextW >= 240 && celebrationBox.nextH >= 96,
    JSON.stringify({ text: celebrationBox.nextText, w: celebrationBox.nextW, h: celebrationBox.nextH }));
  check('the pair plus is a chunky purple mark',
    celebrationBox.plusSize >= 60 && /^rgb\(12[0-9], 79, 16[0-9]\)$/.test(celebrationBox.plus),
    `${celebrationBox.plus} ${celebrationBox.plusSize}px`);

  // §11.2 item 17 — four more cases through the real Next Case handler.
  await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(0.04));
  for (let i = 1; i < 5; i += 1) {
    await page.evaluate(() => window.QLOBE_DEBUG.nextCase());
    await awaitPlay(page);
    check(`Next Case advances to case ${i + 1}`, (await state(page)).caseIndex === i);
    const clash = await spriteClash(page);
    check(`case ${i + 1} places nothing on top of the target sprite`,
      clash.onTarget.length === 0, clash.onTarget.join(', '));
    await page.evaluate(() => window.QLOBE_DEBUG.winRound());
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'celebration', null, { timeout: 15000 });
  }
  await page.evaluate(() => window.QLOBE_DEBUG.nextCase());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end', null, { timeout: 15000 });
  check('case 5 ends the mode', (await state(page)).screen === 'end');
  check('the end screen fills all five dots',
    await page.locator('#end-dots .dot.filled').count() === 5);
  check('the end screen shows the five case targets with their words',
    (await page.locator('#end-row .end-label').allTextContents()).join(',') === 'cat,pan,bug,hat,jet');
  check('the end screen shows both cheering mascots',
    await page.locator('#end-stage .mascot').count() === 2);

  // 2.7 — one cell is one sprite plus its word. The cell now has a width, so
  // the two share a centre line; when the cell was auto-width the wider of the
  // pair set it and the label slid off its picture by half a slot.
  const endGeom = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.end-cell')].map((cell) => {
      const c = cell.getBoundingClientRect();
      const s = cell.querySelector('.end-sprite').getBoundingClientRect();
      const l = cell.querySelector('.end-label').getBoundingClientRect();
      return {
        word: cell.querySelector('.end-label').textContent,
        cellMid: c.x + c.width / 2,
        spriteMid: s.x + s.width / 2,
        labelMid: l.x + l.width / 2,
        spriteBottom: s.bottom,
        labelTop: l.top,
      };
    });
    const row = document.getElementById('end-row').getBoundingClientRect();
    const dots = document.getElementById('end-dots').getBoundingClientRect();
    const again = document.getElementById('btn-again');
    const ar = again.getBoundingClientRect();
    return {
      cells,
      rowBottom: row.bottom,
      dotsTop: dots.top,
      dotsBottom: dots.bottom,
      againTop: ar.top,
      againW: again.offsetWidth,
      againH: again.offsetHeight,
      againText: again.textContent.trim(),
      againLabel: again.getAttribute('aria-label'),
    };
  });
  const skew = endGeom.cells.filter((c) =>
    Math.abs(c.spriteMid - c.cellMid) > 2 || Math.abs(c.labelMid - c.cellMid) > 2);
  check('every end cell centres its sprite and its word on one line',
    skew.length === 0,
    skew.map((c) => `${c.word} sprite${Math.round(c.spriteMid - c.cellMid)} label${Math.round(c.labelMid - c.cellMid)}`).join(', '));
  check('every end word sits below its own sprite, never across it',
    endGeom.cells.every((c) => c.labelTop >= c.spriteBottom - 1));
  check('the five progress dots clear the row above them',
    endGeom.dotsTop >= endGeom.rowBottom + 8 && endGeom.dotsBottom <= endGeom.againTop - 8,
    JSON.stringify({ row: Math.round(endGeom.rowBottom), dots: [Math.round(endGeom.dotsTop), Math.round(endGeom.dotsBottom)], again: Math.round(endGeom.againTop) }));
  check('Play Again is a labelled pill that keeps its accessible name',
    endGeom.againText === 'Play Again' && endGeom.againLabel === 'Play again'
    && endGeom.againW >= 240 && endGeom.againH >= 96,
    JSON.stringify({ text: endGeom.againText, w: endGeom.againW, h: endGeom.againH }));

  // §11.2 item 18 — Play Again returns to the mode menu, one page load.
  await page.locator('#btn-again').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'splash', null, { timeout: 8000 });
  const replay = await state(page);
  check('Play Again returns to the splash, not into the mode just played',
    replay.screen === 'splash' && replay.mode === null && replay.caseIndex === -1, JSON.stringify(replay));

  // -- Mode 2, the same page --------------------------------------------
  // Real clock: Mode 2's prompt is three chained recordings (sound-listen +
  // the target twice) and only the real clock lets all three finish before the
  // idle ladder supersedes them.
  await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(1));
  await resetClips(page);
  await beginMode(page, 'sound-detective');
  await awaitPlay(page);
  await viewportChecks(page, 'landscape/sound-detective', 'wide');
  const soundBanner = await page.locator('#banner').textContent();
  check('Mode 2 prints no target word in the banner',
    soundBanner.trim() === 'Find a word that rhymes with'
    && await page.locator('#banner .banner-glyph').count() === 1, soundBanner);
  check('Mode 2 shows the magnifier glyph on the target card instead of the word',
    await page.locator('#word-card .card-word').count() === 0
    && await page.locator('#word-card .card-glyph-img, #word-card .card-glyph').count() === 1);
  // 10.1 asks for an 88 px glyph. props/magnifier.webp is 780 x 582 of canvas
  // whose lens is ~57 % of the width — the rest is the prop's own cast shadow —
  // so an 88 px box drew a 50 px lens in a 430 px card. The box is sized for
  // what the child sees, and it still has to fit inside the card.
  const glyphGeom = await page.evaluate(() => {
    const g = document.querySelector('#word-card .card-glyph-img, #word-card .card-glyph');
    const card = document.getElementById('word-card');
    const r = g.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const border = parseFloat(getComputedStyle(card).borderTopWidth) * 2;
    const padX = parseFloat(getComputedStyle(card).paddingLeft) * 2;
    return { w: r.width, h: r.height, cardW: c.width - border - padX, cardH: c.height - border };
  });
  check('the Mode 2 card glyph is drawn large enough to read, and fits its card',
    glyphGeom.w >= 130 && glyphGeom.w <= glyphGeom.cardW && glyphGeom.h <= glyphGeom.cardH,
    JSON.stringify({ w: Math.round(glyphGeom.w), h: Math.round(glyphGeom.h), fitW: Math.round(glyphGeom.cardW), fitH: Math.round(glyphGeom.cardH) }));
  await waitForClip(page, '^word-cat$', 2);
  const soundPrompt = await clipLog(page);
  const targetSpeaks = soundPrompt.filter((k) => k === 'word-cat').length;
  check('Mode 2 speaks the target twice after sound-listen',
    soundPrompt.includes('sound-listen') && targetSpeaks >= 2, soundPrompt.join(', '));

  // The bubble hold scales with fastTimers, so this one look happens at real speed.
  await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(1));
  const soundTargets = await targets(page);
  await page.evaluate((id) => { window.QLOBE_DEBUG.tap(id); }, soundTargets.find((t) => t.role === 'wrong').id);
  await page.waitForTimeout(560);
  check('Mode 2 speech bubbles carry the sound glyph and no text',
    await page.evaluate(() => {
      const b = document.querySelector('.hs-bubble');
      return Boolean(b) && b.querySelector('svg') !== null && b.textContent.trim() === '';
    }), await page.evaluate(() => {
      const b = document.querySelector('.hs-bubble');
      return b ? b.outerHTML.slice(0, 160) : 'no bubble on screen';
    }));
  await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(0.04));
  check('Mode 2 keeps the word as the accessible name (§5.8)',
    await page.evaluate(() => {
      const el = document.querySelector('.hs-hotspot[data-id="hat"]');
      return el && el.getAttribute('aria-label') === 'hat';
    }));

  // §11.2 item 19 — seeded placement determinism.
  const zonesA = await page.evaluate(() => JSON.stringify(window.QLOBE_DEBUG.getZones().map((z) => [z.name, z.word])));
  await page.evaluate(() => { window.QLOBE_DEBUG.home(); window.QLOBE_DEBUG.seed(42); });
  await beginMode(page, 'sound-detective');
  await awaitPlay(page);
  const zonesB = await page.evaluate(() => JSON.stringify(window.QLOBE_DEBUG.getZones().map((z) => [z.name, z.word])));
  check('seed(42) reproduces the Mode 2 placement exactly', zonesA === zonesB, zonesB);
  await page.evaluate(() => { window.QLOBE_DEBUG.home(); window.QLOBE_DEBUG.seed(1337); });
  await beginMode(page, 'sound-detective');
  await awaitPlay(page);
  const zonesC = await page.evaluate(() => JSON.stringify(window.QLOBE_DEBUG.getZones().map((z) => [z.name, z.word])));
  check('a different seed shuffles Mode 2 onto different zones', zonesA !== zonesC, zonesC);
  check('every case word is placed in exactly one zone',
    (await page.evaluate(() => window.QLOBE_DEBUG.getZones().filter((z) => z.word).length)) === 5);
  check('fastTimers clamps to [0.01, 1]',
    (await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(9))) === 1
    && (await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(0))) === 0.01);
  await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(0.04));

  // §2.8 — the back button tears the case down without navigating.
  const beforeBack = page.url();
  await beginMode(page, 'rhyme-hunt');
  await awaitPlay(page);
  await page.locator('#btn-back').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'splash', null, { timeout: 8000 });
  const afterBack = await state(page);
  check('back tears the case down and returns to the splash in-page',
    afterBack.screen === 'splash' && afterBack.mode === null && afterBack.caseIndex === -1
    && (await targets(page)).length === 0 && page.url() === beforeBack, JSON.stringify(afterBack));
  check('back leaves no hotspot behind',
    await page.locator('.hs-hotspot').count() === 0);
  check('mute() silences every channel',
    (await page.evaluate(() => window.QLOBE_DEBUG.mute())) === true
    && (await state(page)).muted === true);
  await page.evaluate(() => window.QLOBE_DEBUG.mute(false));

  // -- screenshots, at real speed -----------------------------------------
  await captureStates(page, 'landscape', true);

  // -- portrait ------------------------------------------------------------
  const portrait = await openGame(browser, { width: 834, height: 1194 }, 'no-preference', 'portrait');
  await portrait.evaluate(() => { window.QLOBE_DEBUG.mute(); window.QLOBE_DEBUG.seed(42); window.QLOBE_DEBUG.fastTimers(0.04); });
  await beginMode(portrait, 'rhyme-hunt');
  await awaitPlay(portrait);
  await viewportChecks(portrait, 'portrait/rhyme-hunt', 'compact');

  // Chrome suspends rendering for a page that is not the frontmost one in the
  // browser, and a CSS transition that has never had a frame resolves to its
  // START value — so the word card's 2.4 slide-up reads as a live 60 px offset
  // to any geometry probe taken on a background tab. Screenshots force a frame;
  // getComputedStyle does not. Front the page before measuring the layout.
  await portrait.bringToFront();
  await portrait.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  // §4.7 in PORTRAIT. The compact HUD used to move to the top band, which put
  // the dashed tray in the painted sky, crowded the word card against the
  // window and left the whole bottom half of the room empty. Portrait now
  // keeps the landscape anchoring: card over tray over dots, bottom-centred,
  // and the derived grid spreads through the lower part of the room.
  const portraitHud = await portrait.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, mid: r.x + r.width / 2, cls: el.className, tf: getComputedStyle(el).transform };
    };
    const spots = [...document.querySelectorAll('.rd-scene .hs-hotspot')]
      .filter((el) => el.dataset.id !== 'target')
      .map((el) => { const r = el.getBoundingClientRect(); return r.y + r.height / 2; });
    return {
      h: window.innerHeight,
      card: box('#word-card'),
      tray: box('#tray'),
      dots: box('#dots'),
      banner: box('#banner'),
      spotsLow: spots.filter((cy) => cy > window.innerHeight * 0.33).length,
      spotsTotal: spots.length,
      lowestSpot: Math.max(...spots),
    };
  });
  check('portrait stacks the HUD bottom-centre: card over tray over dots',
    portraitHud.card.bottom <= portraitHud.tray.top + 1
    && portraitHud.tray.bottom <= portraitHud.dots.top + 1
    && portraitHud.card.top > portraitHud.h * 0.6,
    JSON.stringify({ card: [Math.round(portraitHud.card.top), Math.round(portraitHud.card.bottom), portraitHud.card.cls, portraitHud.card.tf], tray: Math.round(portraitHud.tray.top), dots: Math.round(portraitHud.dots.top) }));
  check('portrait keeps the tray out of the top band entirely',
    portraitHud.tray.top > portraitHud.h * 0.6, String(Math.round(portraitHud.tray.top)));
  check('portrait spreads every object below the banner band',
    portraitHud.spotsLow === portraitHud.spotsTotal,
    `${portraitHud.spotsLow}/${portraitHud.spotsTotal}`);
  check('portrait uses the room down to the HUD, not just a strip',
    portraitHud.lowestSpot > portraitHud.h * 0.6,
    String(Math.round(portraitHud.lowestSpot)));

  check('portrait completes a case', await portrait.evaluate(() => window.QLOBE_DEBUG.winRound()));
  await portrait.evaluate(() => window.QLOBE_DEBUG.mute(false));
  await captureStates(portrait, 'portrait', true);

  // -- the short landscape band -------------------------------------------
  const short = await openGame(browser, { width: 1180, height: 520 }, 'no-preference', 'short');
  await short.evaluate(() => { window.QLOBE_DEBUG.mute(); window.QLOBE_DEBUG.seed(42); window.QLOBE_DEBUG.fastTimers(0.04); });
  check('the mode tiles are reachable at 1180 x 520',
    await short.evaluate(() => {
      document.getElementById('btn-play').click();
      const tile = document.querySelector('.mode-tile');
      const r = tile.getBoundingClientRect();
      return r.bottom <= window.innerHeight && r.width >= 96 && r.height >= 96;
    }));
  await beginMode(short, 'sound-detective');
  await awaitPlay(short);
  await viewportChecks(short, 'short/sound-detective', 'compact');
  // The other compact crop: wide and short. Its HUD stays in the top band, so
  // the two compact layouts have to be looked at side by side.
  await short.evaluate(() => window.QLOBE_DEBUG.fastTimers(1));
  await short.waitForTimeout(400);
  await short.screenshot({ path: path.join(SHOTS, 'short-04-play-compact.png') });
  await short.evaluate(() => window.QLOBE_DEBUG.fastTimers(0.04));
  // Real speed BEFORE the case closes: the 12 s auto-advance is armed when the
  // celebration mounts, so at 0.04 it fires in 480 ms and there is nothing left
  // to measure. Scaling up afterwards does not re-arm the timer that already ran.
  await short.evaluate(() => window.QLOBE_DEBUG.fastTimers(1));
  check('the short band completes a case', await short.evaluate(() => window.QLOBE_DEBUG.winRound()));
  await short.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'celebration', null, { timeout: 20000 });
  await short.waitForTimeout(2600);
  // Same rule as the landscape celebration: Next Case mounts at scale(.5) and
  // pops in at 9.5's t = 2300, so a rect taken on a wall-clock timeout measures
  // whatever frame of the ANIMATION it happened to land on. Wait for the class
  // and two frames, then measure the control.
  await short.waitForSelector('#btn-next.in');
  await short.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  check('Next Case stays a real 96 px target at 1180 x 520',
    await short.evaluate(() => {
      const r = document.getElementById('btn-next').getBoundingClientRect();
      return r.width >= 96 && r.height >= 96 && r.bottom <= window.innerHeight;
    }), JSON.stringify(await short.evaluate(() => {
      const r = document.getElementById('btn-next').getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), bot: Math.round(r.bottom) };
    })));
  await short.screenshot({ path: path.join(SHOTS, 'short-08-celebration.png') });
  await short.evaluate(() => window.QLOBE_DEBUG.fastTimers(0.04));

  // -- reduced motion, both orientations ----------------------------------
  for (const [tag, viewport] of [['landscape-rm', { width: 1194, height: 834 }],
    ['portrait-rm', { width: 834, height: 1194 }]]) {
    const rm = await openGame(browser, viewport, 'reduce', tag);
    check(`${tag} reports reducedMotion`, (await state(rm)).reducedMotion === true);
    await rm.evaluate(() => { window.QLOBE_DEBUG.seed(42); });
    await armClipProbe(rm);
    for (const mode of ['rhyme-hunt', 'sound-detective']) {
      // Real speed through the case-intro. fastTimers scales the idle ladder but
      // NOT audio — a recording is however long it is — so at 0.04 the 8 s idle
      // tier fires 320 ms in, interrupts the still-playing case-stem, and the
      // composed `word-<target>` half of the prompt never gets to start. That is
      // correct product behaviour (§3.1: a new line always supersedes) and a
      // harness trap: a recorded-clip assertion has to run on the real clock.
      await rm.evaluate(() => window.QLOBE_DEBUG.fastTimers(1));
      await resetClips(rm);
      await beginMode(rm, mode);
      await awaitPlay(rm);
      check(`${tag} ${mode} still reaches play`, (await state(rm)).awaitingInput === true);
      await waitForClip(rm, '^word-');
      const clips = await clipLog(rm);
      check(`${tag} ${mode} still speaks recorded clips`,
        clips.some((k) => k.startsWith('word-')), clips.join(', '));
      await rm.evaluate(() => window.QLOBE_DEBUG.fastTimers(0.04));
      check(`${tag} ${mode} still completes and celebrates`,
        await rm.evaluate(() => window.QLOBE_DEBUG.winRound()));
      await rm.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'celebration', null, { timeout: 15000 });
      await rm.evaluate(() => window.QLOBE_DEBUG.home());
    }
    await captureStates(rm, tag);
  }

  // -- §11.2 item 22 -------------------------------------------------------
  console.log('\n--- session hygiene ---');
  for (const session of sessions) {
    check(`${session.label}: no page or console errors`, session.errors.length === 0, session.errors.join(' | '));
    check(`${session.label}: no failed requests or 4xx responses`, session.failed.length === 0, session.failed.join(' | '));
    check(`${session.label}: no remote requests`, session.remote.length === 0, session.remote.join(' | '));
    await session.context.close();
  }

  await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));

  const shotFiles = (await readdir(SHOTS)).filter((f) => f.endsWith('.png'));
  console.log(`\n${shotFiles.length} screenshots in ${SHOTS}`);
  const failures = checks.filter((c) => !c.ok);
  console.log(`${checks.length - failures.length}/${checks.length} checks passed`);
  if (failures.length) {
    console.log('\nfailed:');
    for (const f of failures) console.log(`  - ${f.name}${f.detail ? ` — ${String(f.detail).slice(0, 300)}` : ''}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
