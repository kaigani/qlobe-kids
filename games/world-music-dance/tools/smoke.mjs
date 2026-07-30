#!/usr/bin/env node
// games/world-music-dance/tools/smoke.mjs — production smoke suite for
// World Music Dance.
//
// Drives the real game in real Chrome through window.QLOBE_DEBUG (v1 +
// extras) AND real DOM gestures where the spec calls for them (the splash
// Dance button, the HUD back button, and a synthetic pointer drag for two of
// the six placements) — never a shortcut that proves the harness instead of
// the game. Every debug call that can legitimately fail a round (tap,
// winRound, placeCard) goes through the same code a child's finger goes
// through; see js/debug.js's header for that contract.
//
// Usage:
//   node games/world-music-dance/tools/smoke.mjs \
//        [--base http://127.0.0.1:8917/games/world-music-dance/] \
//        [--shots DIR] [--pw-module /private/tmp/pw/node_modules]
//
// If --base's origin isn't already serving, this script starts
// `python3 -m http.server 8917` from the repo root itself (left running —
// this mirrors the documented dev-server restart command, not a scratch
// child this script owns and must clean up).
//
// Design notes on a few non-obvious choices:
//
//   - fastTimers() never speeds up waiting for a song LOOP (waitLoops() in
//     dance.js) or the listen-phase auto-advance: both are driven by real
//     AudioContext time (or a performance.now() fallback clock), not by the
//     ctx.wait()/ctx.ms() timers fastTimers() scales. So the "wait for
//     'your-turn' to appear" step below is ALWAYS real wall-clock (up to
//     ~21s for India's 8-bar loop at 92bpm) regardless of the timeScale set.
//     fastTimers(1) is set explicitly during the listen-phase beat-sync
//     checks per the task spec (so tween/animation durations are real too,
//     which is what makes the two canvas screenshots meaningfully
//     different), then fastTimers(0.05) once the copy phase starts, where
//     ctx.wait(barMs) between steps genuinely benefits from being fast.
//
//   - The dancer-pose-changed check is a real pixel diff between two
//     Playwright element screenshots of the Pixi canvas, 2.5s apart. Reading
//     WebGL pixels back via canvas.toDataURL()/getImageData() is unreliable
//     without preserveDrawingBuffer; Playwright's screenshot goes through the
//     compositor instead, so it is captured here as a PNG and decoded with a
//     hand-rolled ~40-line 8-bit non-interlaced PNG reader built on node's
//     core `zlib` — no extra dependency for one pixel diff.
//
//   - The India/Ghana placements are a REAL synthetic pointer drag
//     (mouse.move -> mouse.down -> mouse.move({steps:8}) -> mouse.up) using
//     the card and target-lantern rects straight from getTargets(), so the
//     actual createDragToSlot() controller in shared/js/stage/drag-to-slot.js
//     is exercised (DRAG_SLOP, window-level pointermove/up, onDrop's real
//     attemptPlace()). The other four cultures use QLOBE_DEBUG.placeCard(),
//     which is the documented "real placement path, not collection.place()"
//     debug contract — see js/debug.js.
//
//   - Every check records true/false and never throws the whole run: a pass
//     that throws unexpectedly is caught and logged as one failing check so
//     the rest of the suite still runs and reports.
//
// Exit code is non-zero if any check fails.

import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import zlib from 'node:zlib';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME_DIR = path.resolve(HERE, '..');
const ROOT = path.resolve(GAME_DIR, '..', '..');

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const BASE = flag('base', 'http://127.0.0.1:8917/games/world-music-dance/');
const SHOTS = flag('shots', '/private/tmp/claude-501/-Users-kaigani-Documents-PROJECTS-DEVELOPMENT-260703-QLOBE-Kids/7f196e63-72b3-4fd1-96b1-55b8ad5cc0b6/scratchpad/shots-smoke');
const PW_MODULE = flag('pw-module', process.env.PW_MODULE || '/private/tmp/pw/node_modules');

const require = createRequire(path.join(PW_MODULE, 'noop.js'));
const { chromium } = require('playwright');

const CONFIG = JSON.parse(readFileSync(path.join(GAME_DIR, 'config.json'), 'utf8'));
const CULTURES = Array.isArray(CONFIG.cultures) ? CONFIG.cultures : [];
const DRAG_CULTURE_IDS = new Set(['india', 'ghana']);

const LANDSCAPE = { width: 1200, height: 900 };
const SEED = 7;

// --------------------------------------------------------------- bookkeeping

const results = [];
const notes = [];
const allTrackers = []; // every openPage() tracker across the whole run — item 10's tally

function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail: String(detail) });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  return !!ok;
}
function note(line) { notes.push(line); console.log(`  note  ${line}`); }

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

// ------------------------------------------------------------- PNG pixel diff
//
// Minimal 8-bit, non-interlaced PNG decoder (color type 2 = RGB, 6 = RGBA),
// which is exactly what Chrome's screenshot encoder produces. Built on node's
// core zlib only — no image library needed for one canvas-changed check.

function decodePNG(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let offset = 8;
  let width = 0, height = 0, colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const len = buffer.readUInt32BE(offset); offset += 4;
    const type = buffer.toString('ascii', offset, offset + 4); offset += 4;
    const data = buffer.subarray(offset, offset + len); offset += len;
    offset += 4; // CRC
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      const interlace = data.readUInt8(12);
      if (interlace !== 0) throw new Error('interlaced PNG not supported');
      if (bitDepth !== 8) throw new Error(`only 8-bit PNG supported, got ${bitDepth}`);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : (() => { throw new Error(`unsupported color type ${colorType}`); })();
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let pos = 0;
  let prevLine = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos]; pos += 1;
    const line = raw.subarray(pos, pos + stride); pos += stride;
    const out = Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? out[x - channels] : 0;
      const b = prevLine[x];
      const c = x >= channels ? prevLine[x - channels] : 0;
      let val = line[x];
      switch (filter) {
        case 0: break;
        case 1: val = (val + a) & 0xff; break;
        case 2: val = (val + b) & 0xff; break;
        case 3: val = (val + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pr = pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
          val = (val + pr) & 0xff;
          break;
        }
        default: throw new Error(`unsupported PNG filter ${filter}`);
      }
      out[x] = val;
    }
    out.copy(pixels, y * stride);
    prevLine = out;
  }
  return { width, height, channels, pixels };
}

/** Percentage of pixels whose RGB differs by more than a small noise floor. */
function pngDiffPercent(bufA, bufB) {
  const a = decodePNG(bufA);
  const b = decodePNG(bufB);
  if (a.width !== b.width || a.height !== b.height) return 100;
  const total = a.width * a.height;
  if (total === 0) return 0;
  let diff = 0;
  for (let i = 0; i < total; i += 1) {
    const oa = i * a.channels, ob = i * b.channels;
    const dr = Math.abs(a.pixels[oa] - b.pixels[ob]);
    const dg = Math.abs(a.pixels[oa + 1] - b.pixels[ob + 1]);
    const db = Math.abs(a.pixels[oa + 2] - b.pixels[ob + 2]);
    if (dr + dg + db > 24) diff += 1;
  }
  return (diff / total) * 100;
}

// ---------------------------------------------------------------- server up

async function ensureServer() {
  const origin = new URL(BASE).origin;
  try {
    const res = await fetch(`${origin}/games.json`);
    if (res.ok) { console.log(`server already up at ${origin}`); return null; }
  } catch { /* not up */ }
  console.log(`starting dev server: cd ${ROOT} && python3 -m http.server 8917 &`);
  const child = spawn('python3', ['-m', 'http.server', '8917'], {
    cwd: ROOT, stdio: 'ignore', detached: true,
  });
  child.unref();
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    try {
      const res = await fetch(`${origin}/games.json`);
      if (res.ok) return child;
    } catch { /* still coming up */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`dev server on ${origin} never came up`);
}

// ------------------------------------------------------------ page plumbing

async function openPage(browser, viewport, opts = {}) {
  const context = await browser.newContext({
    viewport, reducedMotion: opts.reducedMotion || 'no-preference', deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const tracker = { context, page, pageErrors: [], consoleErrors: [], failedRequests: [] };
  page.on('pageerror', (e) => tracker.pageErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const from = (m.location() && m.location().url) || '';
    tracker.consoleErrors.push(`${m.text()} @ ${from}`);
  });
  page.on('requestfailed', (r) => {
    tracker.failedRequests.push(`${r.url()} ${(r.failure() && r.failure().errorText) || ''}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) tracker.failedRequests.push(`${r.status()} ${r.url()}`);
  });
  allTrackers.push(tracker);
  return tracker;
}

async function bootDebug(page, { seed = SEED, mute = true, fast = 0.05 } = {}) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.QLOBE_DEBUG, null, { timeout: 20000 });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  await page.evaluate(([s, m, f]) => {
    window.QLOBE_DEBUG.seed(s);
    if (m) window.QLOBE_DEBUG.mute();
    window.QLOBE_DEBUG.fastTimers(f);
  }, [seed, mute, fast]);
}

const call = (page, method, ...args) => page.evaluate(
  ({ method, args }) => window.QLOBE_DEBUG[method](...args),
  { method, args },
);
const getState = (page) => call(page, 'getState');
const getTargets = (page) => call(page, 'getTargets');

function waitState(page, predicateSrc, arg, timeout = 8000) {
  return page.waitForFunction(predicateSrc, arg, { timeout }).then(() => true).catch(() => false);
}

// --------------------------------------------------------- pass: boot + gesture

async function bootAndGesturePass(browser) {
  const t = await openPage(browser, LANDSCAPE);
  const { page } = t;

  await page.goto(BASE, { waitUntil: 'networkidle' });
  const hasDebug = await waitState(page, () => !!window.QLOBE_DEBUG, null, 20000);
  check('boot: window.QLOBE_DEBUG is installed', hasDebug);

  let readyOk = false;
  try { await page.evaluate(() => window.QLOBE_DEBUG.ready); readyOk = true; } catch { readyOk = false; }
  check('boot: QLOBE_DEBUG.ready resolves', readyOk);

  check('boot: zero pageerrors at boot', t.pageErrors.length === 0, t.pageErrors.slice(0, 3).join(' | '));
  check('boot: zero console errors at boot', t.consoleErrors.length === 0, t.consoleErrors.slice(0, 3).join(' | '));
  check('boot: every HTTP response < 400 at boot', t.failedRequests.length === 0, t.failedRequests.slice(0, 5).join(' | '));

  await shot(page, '00-splash-before-dance');

  await page.evaluate((s) => { window.QLOBE_DEBUG.seed(s); window.QLOBE_DEBUG.mute(); }, SEED);

  // Real gesture: click the splash Dance button (real pointerdown/up), not debug.tap.
  await page.locator('.wmd-cta').click();
  const wentToMap = await waitState(page, () => {
    const s = window.QLOBE_DEBUG.getState();
    return s.screen === 'map' && s.phase === 'choose';
  }, null, 10000);
  check('gesture: real click on Dance reaches map/choose', wentToMap, JSON.stringify(await getState(page)));
  await shot(page, '01-map-choose');

  return t;
}

// ------------------------------------------------------------ pass: per-culture

async function runCulture(page, culture) {
  const id = culture.id;

  const before = await getState(page);
  if (!(before.screen === 'map' && before.phase === 'choose')) {
    await call(page, 'goto', 'map', { mode: 'choose' });
    await waitState(page, () => {
      const s = window.QLOBE_DEBUG.getState();
      return s.screen === 'map' && s.phase === 'choose';
    }, null, 5000);
  }

  // Real wall-clock timing for the beat-sync checks below (see header note).
  await call(page, 'fastTimers', 1);

  const tapRes = await call(page, 'tap', `lantern:${id}`);
  check(`${id}: tap('lantern:${id}') from the map is accepted`, tapRes && tapRes.accepted === true, JSON.stringify(tapRes));

  const enteredDance = await waitState(page, (cid) => {
    const s = window.QLOBE_DEBUG.getState();
    return s.screen === 'dance' && s.culture === cid && s.phase === 'listen';
  }, id, 8000);
  check(`${id}: enters dance/listen`, enteredDance, JSON.stringify(await getState(page)));
  await shot(page, `dance-listen-${id}`);

  // -- music stats: playing, notesScheduled increases, songId matches config --
  const stats1 = await call(page, 'getMusicStats');
  await page.waitForTimeout(1500);
  const stats2 = await call(page, 'getMusicStats');
  check(`${id}: music reports playing`, stats1.playing === true && stats2.playing === true, JSON.stringify({ stats1, stats2 }));
  check(`${id}: notesScheduled increases over 1.5s`, stats2.notesScheduled > stats1.notesScheduled,
    `${stats1.notesScheduled} -> ${stats2.notesScheduled}`);
  check(`${id}: songId matches config ("${culture.song}")`, stats2.songId === culture.song, String(stats2.songId));

  // -- dancer pose changes within ~2 bars: two real canvas screenshots, 2.5s apart --
  let diffPct = -1;
  try {
    const canvas = page.locator('canvas').first();
    const shotA = await canvas.screenshot();
    await page.waitForTimeout(2500);
    const shotB = await canvas.screenshot();
    diffPct = pngDiffPercent(shotA, shotB);
  } catch (error) {
    note(`${id}: canvas diff capture threw — ${error}`);
  }
  check(`${id}: dancer canvas changes over 2.5s (>0.5% of pixels)`, diffPct > 0.5, `${diffPct.toFixed(2)}%`);

  // -- 'your-turn' appears (real wall clock — see header note) --
  const turnReady = await waitState(page, () => {
    const s = window.QLOBE_DEBUG.getState();
    return s.screen === 'dance' && s.phase === 'listen' && s.awaitingInput === true;
  }, null, 30000);
  check(`${id}: 'your-turn' becomes available`, turnReady);

  const turnTap = await call(page, 'tap', 'your-turn');
  check(`${id}: tap('your-turn') is accepted`, turnTap && turnTap.accepted === true, JSON.stringify(turnTap));

  // Copy-phase pacing genuinely benefits from fast timers; beat-sync is behind us.
  await call(page, 'fastTimers', 0.05);

  const enteredCopy = await waitState(page, (cid) => {
    const s = window.QLOBE_DEBUG.getState();
    return s.screen === 'dance' && s.culture === cid && s.phase === 'copy' && s.awaitingInput === true;
  }, id, 8000);
  check(`${id}: enters copy phase awaiting input`, enteredCopy, JSON.stringify(await getState(page)));
  await shot(page, `dance-copy-${id}`);

  // -- WRONG-TAP PROBE: a role:'wrong' card is accepted but changes nothing --
  const targetsBefore = await getTargets(page);
  const stateBefore = await getState(page);
  const wrongTarget = (targetsBefore || []).find((tg) => tg.role === 'wrong');
  if (check(`${id}: a role:'wrong' target exists at step ${stateBefore.step}`, !!wrongTarget, JSON.stringify(targetsBefore))) {
    const wrongRes = await call(page, 'tap', wrongTarget.id);
    check(`${id}: wrong-tap probe is accepted`, wrongRes && wrongRes.accepted === true, JSON.stringify(wrongRes));
    await waitState(page, () => window.QLOBE_DEBUG.getState().awaitingInput === true, null, 5000);
    const stateAfter = await getState(page);
    check(`${id}: wrong tap does not advance the step`, stateAfter.step === stateBefore.step,
      `${stateBefore.step} -> ${stateAfter.step}`);
    check(`${id}: still awaitingInput after the wrong tap`, stateAfter.awaitingInput === true, JSON.stringify(stateAfter));
  }

  // -- complete all 3 steps via role:'correct' targets --
  let stepsOk = true;
  for (let i = 0; i < 3; i += 1) {
    const ready = await waitState(page, () => window.QLOBE_DEBUG.getState().awaitingInput === true, null, 5000);
    if (!ready) { stepsOk = false; break; }
    const targets = await getTargets(page);
    const correct = (targets || []).find((tg) => tg.role === 'correct');
    if (!correct) { stepsOk = false; break; }
    const stepBefore = (await getState(page)).step;
    const res = await call(page, 'tap', correct.id);
    if (!res || res.accepted !== true) { stepsOk = false; break; }
    await waitState(page, (prevStep) => {
      const s = window.QLOBE_DEBUG.getState();
      return s.step > prevStep || s.screen !== 'dance';
    }, stepBefore, 8000);
  }
  check(`${id}: all 3 correct-tap steps advance the round`, stepsOk);

  const atPlace = await waitState(page, (cid) => {
    const s = window.QLOBE_DEBUG.getState();
    return s.screen === 'map' && s.phase === 'place' && s.culture === cid;
  }, id, 8000);
  check(`${id}: round completion lands on map/place`, atPlace, JSON.stringify(await getState(page)));

  const placedBefore = (await getState(page)).placedCount;

  if (DRAG_CULTURE_IDS.has(id)) {
    const targets = await getTargets(page);
    const cardT = (targets || []).find((tg) => tg.id === 'card');
    const pinT = (targets || []).find((tg) => tg.id === `lantern:${id}` && tg.role === 'correct');
    if (check(`${id}: getTargets() offers a draggable card + its own lantern`, !!(cardT && pinT), JSON.stringify(targets))) {
      const cardCx = cardT.rect.x + cardT.rect.w / 2, cardCy = cardT.rect.y + cardT.rect.h / 2;
      const pinCx = pinT.rect.x + pinT.rect.w / 2, pinCy = pinT.rect.y + pinT.rect.h / 2;
      await page.mouse.move(cardCx, cardCy);
      await page.mouse.down();
      await page.mouse.move(pinCx, pinCy, { steps: 8 });
      await page.mouse.up();
    }
  } else {
    const placed = await call(page, 'placeCard', id);
    check(`${id}: placeCard('${id}') returns true`, placed === true, String(placed));
  }

  const placedAfterOk = await waitState(page, (n) => window.QLOBE_DEBUG.getState().placedCount > n, placedBefore, 10000);
  const method = DRAG_CULTURE_IDS.has(id) ? 'real pointer drag' : 'placeCard()';
  check(`${id}: placedCount increments after placement (${method})`, placedAfterOk, `before=${placedBefore}`);

  if (id === 'india') {
    const log = await call(page, 'getAudioLog');
    const hasClip = (log || []).some((e) => e.kind === 'clip');
    check('audio log: recorded-clip entries present after india completes', hasClip,
      JSON.stringify((log || []).slice(-10)));
  }

  // Let the celebration auto-return to map/choose before the next culture.
  await waitState(page, () => {
    const s = window.QLOBE_DEBUG.getState();
    return s.screen === 'map' && s.phase === 'choose';
  }, null, 10000);
}

async function cultureLoopPass(page) {
  for (const culture of CULTURES) {
    try {
      await runCulture(page, culture);
    } catch (error) {
      check(`${culture.id}: culture pass completed without throwing`, false, String((error && error.stack) || error));
    }
  }
}

// ------------------------------------------------------------- pass: persistence

async function persistencePass(page) {
  const before = await call(page, 'getCollection');
  const beforeCount = Object.keys((before && before.placed) || {}).length;
  check('persistence: all cultures are placed before reload',
    beforeCount === CULTURES.length, `${beforeCount}/${CULTURES.length}`);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.QLOBE_DEBUG, null, { timeout: 20000 });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);

  const after = await call(page, 'getCollection');
  const afterCount = Object.keys((after && after.placed) || {}).length;
  check('persistence: reload still shows all cultures placed',
    afterCount === CULTURES.length, `${afterCount}/${CULTURES.length}`);

  await page.evaluate((s) => {
    window.QLOBE_DEBUG.seed(s);
    window.QLOBE_DEBUG.mute();
    window.QLOBE_DEBUG.fastTimers(0.05);
  }, SEED);

  const resetOk = await call(page, 'resetCollection');
  const afterReset = await call(page, 'getCollection');
  const afterResetCount = Object.keys((afterReset && afterReset.placed) || {}).length;
  check('persistence: resetCollection() clears to 0',
    resetOk === true && afterResetCount === 0, `count=${afterResetCount}`);
}

// -------------------------------------------------------------- pass: navigation

async function navigationPass(page) {
  await call(page, 'goto', 'splash');
  await waitState(page, () => window.QLOBE_DEBUG.getState().screen === 'splash', null, 5000);

  const links = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]'))
    .map((a) => ({ cls: a.className, href: a.getAttribute('href') })));
  check('nav: splash has exactly one link', links.length === 1, JSON.stringify(links));
  check('nav: the one link is home, pointing to ../..',
    links.length === 1 && links[0].cls.includes('wmd-home') && links[0].href === '../../',
    JSON.stringify(links));

  const first = CULTURES[0].id;
  await call(page, 'goto', 'dance', { cultureId: first });
  const inDance = await waitState(page, () => window.QLOBE_DEBUG.getState().screen === 'dance', null, 8000);
  check('nav: debug.goto(dance) lands on the dance screen', inDance);

  await page.locator('.wmd-back').click();
  const backToMap = await waitState(page, () => window.QLOBE_DEBUG.getState().screen === 'map', null, 5000);
  check('nav: back button from dance goes to map', backToMap, JSON.stringify(await getState(page)));

  await page.locator('.wmd-back').click();
  const backToSplash = await waitState(page, () => window.QLOBE_DEBUG.getState().screen === 'splash', null, 5000);
  check('nav: back button from map goes to splash', backToSplash, JSON.stringify(await getState(page)));
}

// -------------------------------------------------------- pass: all-six celebration

async function allSixPass(page) {
  await page.evaluate((s) => {
    window.QLOBE_DEBUG.seed(s);
    window.QLOBE_DEBUG.mute();
    window.QLOBE_DEBUG.fastTimers(0.05);
    window.QLOBE_DEBUG.clearAudioLog();
  }, SEED);

  let allOk = true;
  for (const culture of CULTURES) {
    const placed = await call(page, 'placeCard', culture.id);
    if (!check(`all-six: placeCard('${culture.id}') places the card`, placed === true, String(placed))) allOk = false;
  }
  check('all-six: every placeCard() call succeeded', allOk);

  const finalState = await getState(page);
  check('all-six: placedCount reaches all 6 cultures',
    finalState.placedCount === CULTURES.length, JSON.stringify(finalState));

  const log = await call(page, 'getAudioLog');
  const hasComplete = (log || []).some((e) => e.key === 'collection-complete');
  check('all-six: the collection-complete line fires on the 6th placement',
    hasComplete, JSON.stringify((log || []).map((e) => e.key)));

  await shot(page, 'map-all-six-stamps');
}

// -------------------------------------------------------------- pass: viewports

async function viewportPass(browser, tag, viewport) {
  const t = await openPage(browser, viewport);
  const { page } = t;
  await bootDebug(page, { seed: SEED, mute: true, fast: 0.05 });

  await call(page, 'goto', 'dance', { cultureId: 'japan' });
  const inDance = await waitState(page, () => window.QLOBE_DEBUG.getState().screen === 'dance', null, 8000);
  check(`${tag}: japan enters dance`, inDance);

  const turnReady = await waitState(page, () => {
    const s = window.QLOBE_DEBUG.getState();
    return s.phase === 'listen' && s.awaitingInput === true;
  }, null, 30000);
  check(`${tag}: reaches listen/awaiting`, turnReady);

  await call(page, 'tap', 'your-turn');
  const inCopy = await waitState(page, () => window.QLOBE_DEBUG.getState().phase === 'copy', null, 8000);
  check(`${tag}: reaches copy phase`, inCopy);
  await shot(page, `dance-copy-${tag}`);

  check(`${tag}: no pageerrors`, t.pageErrors.length === 0, t.pageErrors.slice(0, 3).join(' | '));
  check(`${tag}: no console errors`, t.consoleErrors.length === 0, t.consoleErrors.slice(0, 3).join(' | '));
  check(`${tag}: no failed requests`, t.failedRequests.length === 0, t.failedRequests.slice(0, 5).join(' | '));

  await t.context.close();
}

// --------------------------------------------------------- pass: reduced motion

async function reducedMotionPass(browser) {
  const t = await openPage(browser, LANDSCAPE, { reducedMotion: 'reduce' });
  const { page } = t;
  await bootDebug(page, { seed: SEED, mute: true, fast: 0.05 });

  const reducedFlag = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  check('reduced motion: the media query reports reduce', reducedFlag === true);

  await call(page, 'goto', 'dance', { cultureId: 'brazil' });
  const inDance = await waitState(page, () => window.QLOBE_DEBUG.getState().screen === 'dance', null, 8000);
  check('reduced motion: brazil enters dance', inDance);

  const turnReady = await waitState(page, () => {
    const s = window.QLOBE_DEBUG.getState();
    return s.phase === 'listen' && s.awaitingInput === true;
  }, null, 30000);
  check('reduced motion: reaches listen/awaiting', turnReady);

  await call(page, 'tap', 'your-turn');
  const inCopy = await waitState(page, () => window.QLOBE_DEBUG.getState().phase === 'copy', null, 8000);
  check('reduced motion: reaches copy phase', inCopy);
  await shot(page, 'dance-copy-reduced-motion');

  check('reduced motion: no pageerrors', t.pageErrors.length === 0, t.pageErrors.slice(0, 3).join(' | '));
  check('reduced motion: no console errors', t.consoleErrors.length === 0, t.consoleErrors.slice(0, 3).join(' | '));
  check('reduced motion: no failed requests', t.failedRequests.length === 0, t.failedRequests.slice(0, 5).join(' | '));

  await t.context.close();
}

// -------------------------------------------------------------------- tally

function tallyPass() {
  let pageErrors = 0, consoleErrors = 0, failedRequests = 0;
  const detail = [];
  for (const t of allTrackers) {
    pageErrors += t.pageErrors.length;
    consoleErrors += t.consoleErrors.length;
    failedRequests += t.failedRequests.length;
    detail.push(...t.pageErrors, ...t.consoleErrors, ...t.failedRequests);
  }
  check('full run: zero pageerrors across every pass', pageErrors === 0, `${pageErrors} total`);
  check('full run: zero console errors across every pass', consoleErrors === 0, `${consoleErrors} total`);
  check('full run: zero failed HTTP responses across every pass', failedRequests === 0, `${failedRequests} total`);
  if (detail.length) note(`full-run error detail (first 10 of ${detail.length}): ${detail.slice(0, 10).join(' | ')}`);
}

// -------------------------------------------------------------------- main

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const serverChild = await ensureServer();

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  let mainTracker = null;

  const passes = [
    ['boot + real-gesture flow (items 1-2)', async () => { mainTracker = await bootAndGesturePass(browser); }],
    ['six cultures: dance + copy + placement (items 3-4)', async () => { await cultureLoopPass(mainTracker.page); }],
    ['persistence (item 5)', async () => { await persistencePass(mainTracker.page); }],
    ['navigation (item 6)', async () => { await navigationPass(mainTracker.page); }],
    ['all-six celebration (item 9)', async () => { await allSixPass(mainTracker.page); }],
    ['viewport: portrait 820x1180 (item 7)', () => viewportPass(browser, 'portrait-820x1180', { width: 820, height: 1180 })],
    ['viewport: landscape 1024x768 (item 7)', () => viewportPass(browser, 'landscape-1024x768', { width: 1024, height: 768 })],
    ['reduced motion (item 8)', () => reducedMotionPass(browser)],
  ];

  try {
    for (const [name, run] of passes) {
      console.log(`\n--- ${name} ---`);
      try {
        await run();
      } catch (error) {
        check(`${name}: pass completed without throwing`, false, String((error && error.stack) || error));
        console.error(`  !! ${name} threw — see detail above`);
      }
    }
    if (mainTracker) { try { await mainTracker.context.close(); } catch { /* already closing */ } }
    console.log('\n--- full-run error tally (item 10) ---');
    tallyPass();
  } finally {
    await browser.close();
  }

  const failures = results.filter((r) => !r.ok);
  await writeFile(path.join(SHOTS, 'smoke.json'), JSON.stringify({
    game: 'world-music-dance', base: BASE, when: new Date().toISOString(), results, notes,
  }, null, 2));

  console.log('\n============================== PASS/FAIL TABLE ==============================');
  const nameWidth = Math.min(70, Math.max(...results.map((r) => r.name.length), 10));
  for (const r of results) {
    const status = r.ok ? 'PASS' : 'FAIL';
    const name = r.name.length > nameWidth ? r.name.slice(0, nameWidth - 1) + '…' : r.name.padEnd(nameWidth);
    const detail = r.ok ? '' : `  ${r.detail.slice(0, 90)}`;
    console.log(`${status}  ${name}${detail}`);
  }
  console.log('===============================================================================');
  console.log(`\n${results.length - failures.length}/${results.length} checks passed; screenshots + smoke.json in ${SHOTS}`);
  if (failures.length) console.log('FAILED: ' + failures.map((f) => f.name).join(', '));
  if (serverChild) console.log(`\n(dev server left running on 8917 — this script started it)`);

  process.exitCode = failures.length ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
