#!/usr/bin/env node
// tools/qa.mjs — the QA gate for Blend Train.
//
// Drives both modes end to end through window.QLOBE_DEBUG in REAL Chrome
// (channel 'chrome' — headless-shell cannot decode AAC, so every recorded .m4a
// would silently fall back to Web Speech and the audio assertions below would
// be worthless).
//
//   python3 -m http.server 8177          # from the repo root
//   node games/blend-train/tools/qa.mjs --playwright /tmp/pw/node_modules \
//        [--base http://localhost:8177] [--shots games/blend-train/qa-shots]
//
// Only ONE WebGL context can be alive at a time in practice, so every pass
// below runs sequentially and closes its context before the next opens.
//
// Checks, in order:
//   1. zero console errors, zero pageerrors, zero failed requests and zero
//      responses >= 400 on the splash, both modes and the end screen — and no
//      request to any host other than the local base (a shipped game makes no
//      model/service calls, ever)
//   2. both modes complete all five rounds via winRound() and reach 'end'
//   3. RECORDED AUDIO IS REAL, proved three ways from getAudioLog():
//        a. a placed car's own sound is kind 'clip' with ref 'letter:<x>'
//        b. the round-complete blend readout fires IN ORDER
//           (letter:m → letter:a → letter:t → cheer:mat), every one a clip
//        c. the mode prompt is 'clip:prompt-sounds' / 'clip:prompt-couple'
//      plus the decode proof: the one voice-channel <audio> element really
//      played an .m4a (played range > 0, finite duration, el.error === null).
//      mute() suppresses speakLine() entirely, so the audio pass runs UNMUTED
//      with fastTimers() to stay quick; every other pass is muted.
//   4. gentle retry: a wrong coupling and an out-of-order car are both refused
//      and the game RECOVERS — still on 'play', awaitingInput true, round and
//      placed count unchanged, and a correct placement still lands afterwards
//   5. REAL POINTER DRAG (page.mouse), covering: correct coupling places;
//      wrong coupling nudges and returns the car; release back over the tray;
//      release outside the canvas; pointercancel mid-drag. After every one,
//      nothing is stranded (no active drag, tray + placed === slotsTotal)
//   6. resize mid-drag: begin a drag, flip to the other orientation, finish it
//   7. navigation: a.qk-build-home exists ONLY on the splash
//   8. touch targets: every slot and tray-part rect is >= 96px on both axes
//   9. layout sanity via getLayout(): the board rect carries the build space's
//      aspect (read from config.json) in BOTH orientations, so the backdrop maps 1:1 and no
//      car floats off the rails
//  10. screenshots for human review in landscape, portrait and reduced motion,
//      plus qa.json
//
// Note on getState().dragging: the engine reports the dragged part's id or
// null (not a boolean), so "nothing stranded" is asserted as `dragging == null`
// together with the tray/placed invariant.
//
// Exit code is non-zero if any check fails.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const BASE = flag('base', 'http://localhost:8177');
const URL_GAME = `${BASE}/games/blend-train/`;
const SHOTS = flag('shots', path.resolve(HERE, '..', 'qa-shots'));
const pwDir = flag('playwright', process.env.PLAYWRIGHT_MODULE_PATH);
if (!pwDir) {
  console.error('need --playwright <node_modules dir holding playwright@1.52.0>');
  process.exit(2);
}
const require = createRequire(path.join(pwDir, 'noop.js'));
const { chromium } = require('playwright');

const LANDSCAPE = { width: 1180, height: 820 };
const PORTRAIT = { width: 820, height: 1180 };
// Read the authored build space from config.json rather than hardcoding it: the space
// is a design decision that gets retuned during polish, and a test that pins it to one
// literal fails for the wrong reason every time the art is recomposed.
const GAME_CONFIG = JSON.parse(
  readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const [SPACE_W, SPACE_H] = GAME_CONFIG.space;
const SPACE_ASPECT = SPACE_W / SPACE_H;
const MIN_TOUCH = 96;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) });
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  return !!ok;
};
const notes = [];
const note = (line) => { notes.push(line); console.log(`  note  ${line}`); };

// ---------------------------------------------------------------- page driver
// Everything here runs INSIDE the page so every input goes through the real
// handler, exactly as a child's finger would.
const DRIVER = `
window.__qa = {
  clipStarts: [],
  channel: null,
  lastPointerId: null,
  config: null,

  init: async function () {
    window.addEventListener('pointerdown', (e) => { window.__qa.lastPointerId = e.pointerId; }, true);
    const voice = await import('../../shared/js/voice-clips.js');
    voice.onClip((key, el) => {
      window.__qa.clipStarts.push({ key: key, src: (el && el.currentSrc) || '' });
      window.__qa.channel = el;
    });
    window.__qa.config = await fetch('./config.json').then((r) => r.json());
  },

  state: function () { return window.QLOBE_DEBUG.getState(); },

  /** tray parts still in the tray + cars already coupled must always equal the
   *  number of couplings: that is what "nothing stranded" means here. */
  inventory: function () {
    const D = window.QLOBE_DEBUG;
    const s = D.getState();
    const targets = D.getTargets();
    return {
      screen: s.screen,
      round: s.round,
      build: s.build,
      placed: s.placed,
      slotsTotal: s.slotsTotal,
      awaitingInput: s.awaitingInput,
      dragging: s.dragging,
      tray: targets.filter((t) => t.id.indexOf('part:') === 0).length,
      consistent: targets.filter((t) => t.id.indexOf('part:') === 0).length + s.placed === s.slotsTotal,
      strayClones: document.querySelectorAll('.drag-clone').length,
      catalogLinks: document.querySelectorAll('a.qk-build-home').length,
    };
  },

  tap: async function (id) {
    const r = await Promise.race([
      window.QLOBE_DEBUG.tap(id),
      new Promise((res) => setTimeout(() => res({ accepted: null, timedOut: true }), 15000)),
    ]);
    return r || { accepted: null };
  },

  /** Play a whole mode with winRound(), one round at a time. */
  runMode: async function (modeId, seed) {
    const D = window.QLOBE_DEBUG;
    const log = [];
    let rounds = 0;
    if (seed != null) D.seed(seed);
    await D.startMode(modeId);
    D.fastTimers(0.05);
    let guard = 0;
    while (guard++ < 12) {
      const s = D.getState();
      if (s.screen !== 'play') break;
      const before = s.round;
      rounds++;
      log.push('r' + before + ' ' + s.build + ' slots=' + s.slotsTotal);
      await Promise.race([
        D.winRound(),
        new Promise((res) => setTimeout(res, 20000)),
      ]);
      const after = D.getState();
      if (after.screen !== 'play') { log.push('-> ' + after.screen); break; }
      if (after.round === before) { log.push('NO PROGRESS at r' + before); break; }
    }
    const s = D.getState();
    return {
      log,
      screen: s.screen,
      roundsPlayed: rounds,
      roundsTotal: s.roundsTotal,
      catalogLinks: document.querySelectorAll('a.qk-build-home').length,
      strayClones: document.querySelectorAll('.drag-clone').length,
    };
  },

  /** Fill every coupling but leave the screen on the completed train. */
  freezeCompleted: function () {
    window.__qa.pending = window.QLOBE_DEBUG.winRound();
  },

  cancelPointer: function () {
    const id = window.__qa.lastPointerId;
    window.dispatchEvent(new PointerEvent('pointercancel', {
      pointerId: id == null ? 1 : id, bubbles: true, cancelable: true, isPrimary: true,
    }));
  },

  /** Did the voice channel really decode and play an AAC file? */
  decodeProof: function () {
    const el = window.__qa.channel;
    if (!el) return { ok: false, why: 'no clip ever started' };
    const played = el.played && el.played.length ? el.played.end(el.played.length - 1) : 0;
    return {
      ok: !el.error && played > 0 && Number.isFinite(el.duration) && el.duration > 0,
      error: el.error ? el.error.code : null,
      src: el.currentSrc || '',
      played: played,
      duration: Number.isFinite(el.duration) ? el.duration : null,
      starts: window.__qa.clipStarts.length,
    };
  },
};
`;

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.viewport || LANDSCAPE,
    reducedMotion: opts.reducedMotion || 'no-preference',
    deviceScaleFactor: 2,
  });
  const errors = [];
  const failed = [];
  const aborted = [];
  const foreign = [];
  const page = await ctx.newPage();
  // One abort is by design and is counted separately rather than ignored:
  // a recorded line that supersedes another src-swaps the ONE unlocked <audio>
  // element, which cancels the clip it interrupted. That IS the voice channel
  // working. Anything else that fails is a genuinely broken asset.
  const isExpectedAbort = (url, err) => /\.m4a(\?|$)/.test(url) && /ABORTED/i.test(err || '');
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => {
    const url = r.url();
    if (!/^https?:/i.test(url)) return;          // data:/blob: are ours
    if (url.startsWith(BASE)) return;
    foreign.push(`${r.method()} ${url}`);
  });
  page.on('requestfailed', (r) => {
    const err = r.failure()?.errorText;
    (isExpectedAbort(r.url(), err) ? aborted : failed).push(`${r.url()} ${err}`);
  });
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.url()} ${r.status()}`); });
  return { ctx, page, errors, failed, aborted, foreign };
}

async function boot(page, { mute = true } = {}) {
  await page.goto(URL_GAME, { waitUntil: 'networkidle' });
  await page.addScriptTag({ content: DRIVER });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  await page.evaluate(() => window.__qa.init());
  // A real gesture on bare splash art (well clear of the mode buttons at the
  // bottom) so the clip channel unlocks exactly as a child's first tap does.
  await page.mouse.click(page.viewportSize().width / 2, 90);
  await page.waitForTimeout(120);
  if (mute) await page.evaluate(() => window.QLOBE_DEBUG.mute());
  await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(0.05));
}

const inventory = (page) => page.evaluate(() => window.__qa.inventory());
const targets = (page) => page.evaluate(() => window.QLOBE_DEBUG.getTargets());
const layout = (page) => page.evaluate(() => window.QLOBE_DEBUG.getLayout());
const tap = (page, id) => page.evaluate((tid) => window.__qa.tap(tid), id);

async function startMode(page, modeId, seed) {
  await page.evaluate(([id, s]) => {
    if (s != null) window.QLOBE_DEBUG.seed(s);
    window.QLOBE_DEBUG.startMode(id);
  }, [modeId, seed ?? null]);
  await waitForInput(page);
  await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(0.05));
}

const waitForInput = (page, timeout = 30000) => page.waitForFunction(() => {
  const D = window.QLOBE_DEBUG;
  const s = D.getState();
  return s.screen === 'play' && s.awaitingInput && D.getTargets().length > 0 && !s.dragging;
}, null, { timeout, polling: 60 });

const waitSettled = (page, timeout = 25000) => page.waitForFunction(() => {
  const s = window.QLOBE_DEBUG.getState();
  return s.dragging == null && (s.screen !== 'play' || s.awaitingInput);
}, null, { timeout, polling: 60 });

const centre = (t) => ({ x: t.rect.x + t.rect.w / 2, y: t.rect.y + t.rect.h / 2 });

/** A real pointer drag: press, cross DRAG_SLOP, glide, release. */
async function drag(page, from, to, opts = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 12, from.y + 10);   // > DRAG_SLOP (8px)
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 10 });
  if (opts.atPeak) await opts.atPeak();
  if (opts.instead) { await opts.instead(); return; }
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await page.mouse.up();
}

// --------------------------------------------------------------- screenshots
async function captureRun(page, tag) {
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}-${tag}.png`) });
  await page.evaluate(() => window.QLOBE_DEBUG.home());
  await page.waitForTimeout(350);
  await shot('01-splash');

  await startMode(page, 'couple', 1);
  await shot('02-couple-round1');

  // a drag that ends in a real coupling, photographed at its peak
  const t = await targets(page);
  const part = t.find((x) => x.id === 'part:0');
  const slot = t.find((x) => x.id === 'slot:0');
  if (part && slot) {
    await drag(page, centre(part), centre(slot), { atPeak: () => shot('04-drag-peak') });
    await waitSettled(page);
  }

  // A completed train, caught mid-celebration. Real timers for this one beat:
  // under fastTimers() the celebration is over and the next round is already
  // dealt within ~50ms, so the "finished train" frame does not exist to shoot.
  await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(1));
  await page.evaluate(() => window.__qa.freezeCompleted());
  await page.waitForFunction(() => {
    const s = window.QLOBE_DEBUG.getState();
    return s.placed === s.slotsTotal;
  }, null, { timeout: 15000, polling: 20 });
  // Assert on the state at the MOMENT completion was detected, not after a sleep. The
  // celebration is a race by nature — reveal hold, blend line, then the next deal — so a
  // fixed wait can re-read once the next round has already reset `placed` and report a
  // failure that never happened.
  const filled = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check(`${tag}: the completed-train frame really shows a full train`,
    filled.placed === filled.slotsTotal && filled.screen === 'play',
    `${filled.placed}/${filled.slotsTotal} on ${filled.screen}`);
  await page.waitForTimeout(260);
  await shot('05-completed-train');
  await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(0.05));
  await page.waitForFunction(() => {
    const s = window.QLOBE_DEBUG.getState();
    return s.screen !== 'play' || (s.awaitingInput && s.placed === 0);
  }, null, { timeout: 25000 });

  const run = await page.evaluate(() => window.__qa.runMode('couple', 1));
  await page.waitForTimeout(300);
  await shot('06-end');

  await page.evaluate(() => window.QLOBE_DEBUG.home());
  await startMode(page, 'sounds', 1);
  await shot('03-sounds-round1');
  return run;
}

/** Every slot and tray-part rect must clear the 96px floor on both axes. */
async function checkTouchTargets(page, label) {
  const list = await targets(page);
  const small = list.filter((t) => t.rect.w < MIN_TOUCH - 0.5 || t.rect.h < MIN_TOUCH - 0.5);
  check(`${label}: every target clears the 96px floor`, list.length > 0 && small.length === 0,
    `${list.length} targets, smallest ${Math.min(...list.map((t) => Math.min(t.rect.w, t.rect.h))).toFixed(1)}px`
    + (small.length ? ` — offenders ${small.map((t) => t.id).join(',')}` : ''));
}

/** The board rect must carry the build space's aspect, or the backdrop cannot
 *  map 1:1 onto it and every car floats off the rails. */
async function checkBoardAspect(page, label) {
  const snap = await layout(page);
  if (!snap) return check(`${label}: layout snapshot available`, false, 'getLayout() returned null');
  const aspect = snap.boardW / snap.boardH;
  const drift = Math.abs(aspect - SPACE_ASPECT) / SPACE_ASPECT;
  check(`${label}: space matches config (${SPACE_W}x${SPACE_H})`, snap.space[0] === SPACE_W && snap.space[1] === SPACE_H, snap.space.join('x'));
  return check(`${label}: board aspect matches the build space (backdrop maps 1:1)`,
    drift < 0.005,
    `board ${snap.boardW.toFixed(1)}x${snap.boardH.toFixed(1)} = ${aspect.toFixed(4)} vs ${SPACE_ASPECT.toFixed(4)} (${(drift * 100).toFixed(3)}% off)`);
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const runs = {};
  let audio = null;

  // ================= pass 1: landscape — interaction, drag, navigation ======
  const A = await newPage(browser, { viewport: LANDSCAPE });
  await boot(A.page);

  const modes = await A.page.evaluate(() => window.QLOBE_DEBUG.listModes());
  check('both modes registered', modes.length === 2 && modes[0].id === 'couple' && modes[1].id === 'sounds',
    modes.map((m) => m.id).join(', '));

  const splash = await inventory(A.page);
  check('splash carries the catalog link', splash.catalogLinks === 1, String(splash.catalogLinks));

  await startMode(A.page, 'couple', 1);
  const playNav = await inventory(A.page);
  check('play screen has NO catalog link', playNav.catalogLinks === 0, String(playNav.catalogLinks));

  await checkBoardAspect(A.page, 'landscape');
  await checkTouchTargets(A.page, 'landscape');

  // ---- 4. gentle retry -----------------------------------------------------
  const selected = await tap(A.page, 'part:0');
  check('gentle retry: the first car can be picked up', selected.accepted === true, JSON.stringify(selected));
  const withSelection = await targets(A.page);
  const wrongTarget = withSelection.find((t) => t.role === 'wrong');
  check('gentle retry: a wrong coupling is reported by getTargets()', !!wrongTarget,
    withSelection.map((t) => `${t.id}:${t.role}`).join(' '));
  const beforeWrong = await inventory(A.page);
  const wrongResult = wrongTarget ? await tap(A.page, wrongTarget.id) : { accepted: null };
  check('gentle retry: tapping a wrong coupling is refused (accepted === false)',
    wrongResult.accepted === false, `tap('${wrongTarget && wrongTarget.id}') -> ${JSON.stringify(wrongResult)}`);
  await waitSettled(A.page);
  const afterWrong = await inventory(A.page);
  check('gentle retry: the round survives a wrong coupling',
    afterWrong.screen === 'play' && afterWrong.awaitingInput === true
    && afterWrong.round === beforeWrong.round && afterWrong.placed === beforeWrong.placed
    && afterWrong.consistent && afterWrong.dragging == null,
    JSON.stringify(afterWrong));

  // Builds are UNORDERED by design: a child may pick up whichever car they notice first,
  // so every tray car must be selectable. What stays enforced is the destination — a car
  // only couples at its own position — which the wrong-coupling check above covers.
  const anyCar = await tap(A.page, `part:${afterWrong.slotsTotal - 1}`);
  check('any car in the tray can be picked up, whatever its position in the word',
    anyCar.accepted === true, JSON.stringify(anyCar));
  const lateTargets = await targets(A.page);
  const ownCoupling = lateTargets.find((x) => x.role === 'correct');
  check('a later car lights up its OWN coupling, not the leftmost one',
    !!ownCoupling && ownCoupling.id === `slot:${afterWrong.slotsTotal - 1}`,
    lateTargets.filter((x) => x.id.startsWith('slot:')).map((x) => `${x.id}:${x.role}`).join(' '));
  await waitSettled(A.page);
  const afterLate = await inventory(A.page);
  check('the round survives selecting a later car',
    afterLate.screen === 'play' && afterLate.awaitingInput && afterLate.placed === beforeWrong.placed
    && afterLate.consistent, JSON.stringify(afterLate));

  // never a dead end: a correct placement still lands right afterwards
  await tap(A.page, 'part:0');
  await tap(A.page, 'slot:0');
  await waitSettled(A.page);
  const recovered = await inventory(A.page);
  check('gentle retry: the game recovers — a correct coupling still lands',
    recovered.placed === beforeWrong.placed + 1 && recovered.consistent,
    `placed ${beforeWrong.placed} -> ${recovered.placed}`);

  // ---- 5. real pointer drag ------------------------------------------------
  await A.page.evaluate(() => window.QLOBE_DEBUG.home());
  await startMode(A.page, 'sounds', 1);

  // (a) drag onto the correct coupling
  let t = await targets(A.page);
  const before5a = await inventory(A.page);
  await drag(A.page, centre(t.find((x) => x.id === 'part:0')), centre(t.find((x) => x.id === 'slot:0')));
  await waitSettled(A.page);
  const after5a = await inventory(A.page);
  check('drag: onto the correct coupling, the car places',
    after5a.placed === before5a.placed + 1 && after5a.dragging == null && after5a.consistent
    && after5a.strayClones === 0, `placed ${before5a.placed} -> ${after5a.placed}`);

  // (b) drag onto a WRONG coupling — gentle nudge, the car goes home
  t = await targets(A.page);
  const wrongSlot = t.find((x) => x.id === `slot:${after5a.placed + 1}`);
  const before5b = await inventory(A.page);
  await drag(A.page, centre(t.find((x) => x.id === `part:${after5a.placed}`)), centre(wrongSlot));
  await waitSettled(A.page);
  const after5b = await inventory(A.page);
  check('drag: onto a wrong coupling, nothing is stranded',
    after5b.placed === before5b.placed && after5b.tray === before5b.tray
    && after5b.dragging == null && after5b.consistent && after5b.strayClones === 0
    && after5b.screen === 'play' && after5b.awaitingInput,
    JSON.stringify(after5b));

  // (c) press, drag, release back over the tray
  t = await targets(A.page);
  const trayCar = t.find((x) => x.id === `part:${after5b.placed}`);
  const trayHome = centre(trayCar);
  const before5c = await inventory(A.page);
  await drag(A.page, trayHome, { x: trayHome.x + 40, y: trayHome.y + 14 });
  await waitSettled(A.page);
  const after5c = await inventory(A.page);
  check('drag: released back over the tray, nothing is stranded',
    after5c.placed === before5c.placed && after5c.tray === before5c.tray
    && after5c.dragging == null && after5c.consistent && after5c.strayClones === 0,
    JSON.stringify(after5c));

  // (d) press, drag, release OUTSIDE the canvas entirely (up in the HUD strip)
  t = await targets(A.page);
  const before5d = await inventory(A.page);
  await drag(A.page, centre(t.find((x) => x.id === `part:${after5c.placed}`)), { x: 20, y: 14 });
  await waitSettled(A.page);
  const after5d = await inventory(A.page);
  check('drag: released outside the canvas, nothing is stranded',
    after5d.placed === before5d.placed && after5d.tray === before5d.tray
    && after5d.dragging == null && after5d.consistent && after5d.strayClones === 0
    && after5d.awaitingInput, JSON.stringify(after5d));

  // (e) pointercancel mid-drag (iOS gesture takeover)
  t = await targets(A.page);
  const before5e = await inventory(A.page);
  const cancelCar = centre(t.find((x) => x.id === `part:${after5d.placed}`));
  const cancelSlot = centre(t.find((x) => x.id === `slot:${after5d.placed}`));
  let midDragSeen = false;
  await drag(A.page, cancelCar, cancelSlot, {
    instead: async () => {
      midDragSeen = (await inventory(A.page)).dragging != null;
      await A.page.evaluate(() => window.__qa.cancelPointer());
      await A.page.mouse.up();
    },
  });
  await waitSettled(A.page);
  const after5e = await inventory(A.page);
  check('drag: the drag is really live before pointercancel', midDragSeen, `dragging=${midDragSeen}`);
  check('drag: pointercancel mid-drag strands nothing',
    after5e.placed === before5e.placed && after5e.tray === before5e.tray
    && after5e.dragging == null && after5e.consistent && after5e.strayClones === 0
    && after5e.awaitingInput, JSON.stringify(after5e));

  // ---- 5f. a round completed BY HAND deals the next one ---------------------
  // This is the check that was missing, and a real bug lived in the gap: every other
  // round assertion drives winRound(), which is a debug shortcut. Real play finishes a
  // round through handleCorrectPlacement, which used to AWAIT the placed car's sound —
  // so when that promise never settled the round never completed, and the child was left
  // looking at a finished train with an empty tray and no way forward. Complete a whole
  // round with real pointer drags and assert the next one actually deals.
  await startMode(A.page, 'sounds', 7);
  const roundBefore = (await inventory(A.page)).round;
  for (let guard = 0; guard < 8; guard++) {
    const st = await inventory(A.page);
    if (st.round !== roundBefore) break;
    const tt = await targets(A.page);
    const trayCars = tt.filter((x) => x.id.startsWith('part:'));
    if (!trayCars.length) { await A.page.waitForTimeout(400); continue; }
    // The build is ordered, so only ONE tray car is live. Select each in turn until the
    // engine accepts one, then drag that car to the coupling it lit up.
    let live = null;
    for (const car of trayCars) {
      const res = await A.page.evaluate((id) => window.QLOBE_DEBUG.tap(id), car.id);
      if (res && res.accepted) { live = car; break; }
    }
    if (!live) { await A.page.waitForTimeout(300); continue; }
    const after = await targets(A.page);
    const slot = after.find((x) => x.role === 'correct');
    if (!slot) { await A.page.waitForTimeout(300); continue; }
    await drag(A.page, centre(live), centre(slot));
    await A.page.waitForTimeout(600);
  }
  // Wait for the next round to be READY rather than guessing a duration: the celebration,
  // the blend readout and the deal animation all take real time, and a fixed sleep either
  // samples mid-deal (a false failure) or hides a genuine stall behind a generous pad.
  // Wait for THIS round to be superseded and the next one to be ready to play. Naming the
  // previous round explicitly matters: a condition like "awaiting && placed === 0" is also
  // true of the round we started from, so it can be satisfied before anything advanced.
  await A.page.waitForFunction((prev) => {
    const s = window.QLOBE_DEBUG.getState();
    return s.screen === 'end' || (s.round > prev && s.awaitingInput);
  }, roundBefore, { timeout: 30000 }).catch(() => { /* let the assertion report reality */ });
  const dealt = await inventory(A.page);
  const roundAfter = (await inventory(A.page)).round;
  check('a round finished by hand deals the next round with fresh cars',
    roundAfter === roundBefore + 1 && dealt.tray > 0 && dealt.placed === 0
    && dealt.awaitingInput,
    `round ${roundBefore} -> ${roundAfter}, tray ${dealt.tray}, placed ${dealt.placed}, awaiting ${dealt.awaitingInput}`);

  // ---- 5g. tapping a coupled car replays its sound -------------------------
  const tPlaced = await targets(A.page);
  const anyPlaced = tPlaced.find((x) => x.id.startsWith('placed:'));
  if (anyPlaced) {
    await A.page.evaluate(() => window.QLOBE_DEBUG.clearAudioLog());
    await A.page.evaluate((id) => window.QLOBE_DEBUG.tap(id), anyPlaced.id);
    await A.page.waitForTimeout(700);
    const tapLog = await A.page.evaluate(() => window.QLOBE_DEBUG.getAudioLog());
    check('tapping a coupled car replays its sound', tapLog.length > 0,
      JSON.stringify(tapLog.slice(-2)));
  }

  // ---- 6. resize mid-drag --------------------------------------------------
  // Start a fresh round first. The checks above deliberately finish a round, so without
  // this the resize test inherits a half-played or just-dealt board and grabs a car that
  // is not there — a failure that says nothing about resizing.
  await startMode(A.page, 'sounds', 7);
  t = await targets(A.page);
  const before6 = await inventory(A.page);
  const grabCar = centre(t.find((x) => x.id === `part:${before6.placed}`));
  await A.page.mouse.move(grabCar.x, grabCar.y);
  await A.page.mouse.down();
  await A.page.mouse.move(grabCar.x + 12, grabCar.y + 10);
  await A.page.mouse.move(grabCar.x + 40, grabCar.y - 30, { steps: 8 });
  await A.page.setViewportSize(PORTRAIT);
  await A.page.waitForFunction(() => {
    const l = window.QLOBE_DEBUG.getLayout();
    return l && l.stage.h > l.stage.w;
  }, null, { timeout: 15000 });
  const flipped = await inventory(A.page);
  check('resize mid-drag: the drag survives the orientation flip', flipped.dragging != null,
    `dragging=${flipped.dragging}`);
  const portraitSlot = (await targets(A.page)).find((x) => x.id === `slot:${before6.placed}`);
  await A.page.mouse.move(centre(portraitSlot).x, centre(portraitSlot).y, { steps: 20 });
  await A.page.mouse.up();
  await waitSettled(A.page);
  const after6 = await inventory(A.page);
  check('resize mid-drag: the car still places, nothing stranded',
    after6.placed === before6.placed + 1 && after6.dragging == null && after6.consistent
    && after6.strayClones === 0, `placed ${before6.placed} -> ${after6.placed}`);
  await A.page.setViewportSize(LANDSCAPE);
  await A.page.waitForTimeout(400);

  // ---- 2. both modes complete every round ---------------------------------
  for (const mode of ['couple', 'sounds']) {
    await A.page.evaluate(() => window.QLOBE_DEBUG.home());
    const run = await A.page.evaluate(([id, s]) => window.__qa.runMode(id, s), [mode, 1]);
    runs[mode] = run;
    console.log(`\n[${mode}]`);
    run.log.forEach((l) => console.log('     ' + l));
    check(`${mode}: reaches the end screen`, run.screen === 'end', run.screen);
    check(`${mode}: plays all five rounds`, run.roundsPlayed === 5 && run.roundsTotal === 5,
      `${run.roundsPlayed}/${run.roundsTotal}`);
    check(`${mode}: no stuck round`, !run.log.some((l) => /NO PROGRESS/.test(l)));
    check(`${mode}: end screen has NO catalog link`, run.catalogLinks === 0, String(run.catalogLinks));
    check(`${mode}: nothing stranded after a full run`, run.strayClones === 0, String(run.strayClones));
  }

  // back to the splash: the catalog link comes back, and only there
  await A.page.evaluate(() => window.QLOBE_DEBUG.home());
  await A.page.waitForTimeout(300);
  const backHome = await inventory(A.page);
  check('splash is the only screen with the catalog link', backHome.catalogLinks === 1,
    String(backHome.catalogLinks));

  check('landscape: no console errors or pageerrors', A.errors.length === 0, A.errors.slice(0, 3).join(' | '));
  check('landscape: no failed requests', A.failed.length === 0, A.failed.slice(0, 5).join(' | '));
  check('landscape: no request leaves the local host', A.foreign.length === 0, A.foreign.slice(0, 5).join(' | '));
  if (A.aborted.length) note(`${A.aborted.length} interrupted clip load(s) in the interaction pass — expected, see isExpectedAbort`);
  await A.ctx.close();

  // ================= pass 2: landscape screenshots =========================
  const S = await newPage(browser, { viewport: LANDSCAPE });
  await boot(S.page);
  runs['shots-landscape'] = await captureRun(S.page, 'landscape');
  check('landscape shots: no console errors', S.errors.length === 0, S.errors.slice(0, 3).join(' | '));
  check('landscape shots: no failed requests', S.failed.length === 0, S.failed.slice(0, 5).join(' | '));
  await S.ctx.close();

  // ================= pass 3: portrait =======================================
  const P = await newPage(browser, { viewport: PORTRAIT });
  await boot(P.page);
  await startMode(P.page, 'sounds', 1);
  await checkBoardAspect(P.page, 'portrait');
  await checkTouchTargets(P.page, 'portrait');
  runs['shots-portrait'] = await captureRun(P.page, 'portrait');
  check('portrait: reaches the end screen', runs['shots-portrait'].screen === 'end',
    runs['shots-portrait'].screen);
  check('portrait: no console errors', P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
  check('portrait: no failed requests', P.failed.length === 0, P.failed.slice(0, 5).join(' | '));
  check('portrait: no request leaves the local host', P.foreign.length === 0, P.foreign.slice(0, 5).join(' | '));
  await P.ctx.close();

  // ================= pass 4: reduced motion =================================
  const R = await newPage(browser, { viewport: LANDSCAPE, reducedMotion: 'reduce' });
  await boot(R.page);
  runs['reduced-motion'] = await captureRun(R.page, 'reduced-motion');
  check('reduced motion: the mode still completes', runs['reduced-motion'].screen === 'end',
    runs['reduced-motion'].log.slice(-2).join(' | '));
  check('reduced motion: no console errors', R.errors.length === 0, R.errors.slice(0, 3).join(' | '));
  check('reduced motion: no failed requests', R.failed.length === 0, R.failed.slice(0, 5).join(' | '));
  await R.ctx.close();

  // ================= pass 5: RECORDED AUDIO IS REAL =========================
  // Unmuted on purpose: mute() makes speakLine() return before it logs or plays
  // anything, so a muted run proves nothing about the voice channel.
  const V = await newPage(browser, { viewport: LANDSCAPE });
  await boot(V.page, { mute: false });

  // Round order is shuffled from seed(n); find the seed that deals 'mat' first
  // so the assertions below can name the exact expected sequence.
  let matSeed = null;
  for (let n = 1; n <= 12 && matSeed == null; n++) {
    await V.page.evaluate(() => window.QLOBE_DEBUG.home());
    await startMode(V.page, 'sounds', n);
    const s = await inventory(V.page);
    if (s.build === 'mat-sounds') matSeed = n;
  }
  check('a seed deals mat first (deterministic audio assertions)', matSeed != null, `seed ${matSeed}`);

  const audioRun = async (modeId, expectPrompt, expectSeq, expectFirstCar) => {
    await V.page.evaluate(() => window.QLOBE_DEBUG.home());
    await V.page.evaluate(() => window.QLOBE_DEBUG.clearAudioLog());
    await startMode(V.page, modeId, matSeed);
    const promptLog = await V.page.evaluate(() => window.QLOBE_DEBUG.getAudioLog());
    const prompt = promptLog[0] || {};
    check(`${modeId}: the mode prompt is a recorded clip`,
      prompt.kind === 'clip' && prompt.ref === expectPrompt,
      `first line ${JSON.stringify(prompt)}`);

    // place the first car and listen for its own sound
    await V.page.evaluate(() => window.QLOBE_DEBUG.clearAudioLog());
    const inv = await inventory(V.page);
    await tap(V.page, 'part:0');
    await tap(V.page, 'slot:0');
    await V.page.waitForFunction((ref) => window.QLOBE_DEBUG.getAudioLog().some((e) => e.ref === ref),
      expectFirstCar, { timeout: 20000 });
    const placeLog = await V.page.evaluate(() => window.QLOBE_DEBUG.getAudioLog());
    const carLine = placeLog.find((e) => e.ref === expectFirstCar);
    check(`${modeId}: the placed car speaks its own sound as a CLIP, not speech`,
      !!carLine && carLine.kind === 'clip' && !placeLog.some((e) => e.kind === 'speech'),
      `${inv.build}: ${placeLog.map((e) => e.kind + ':' + e.ref).join(' -> ') || '(nothing)'}`);

    // finish the round and listen to the whole blend readout
    for (let i = 1; i < inv.slotsTotal; i++) {
      await tap(V.page, `part:${i}`);
      await tap(V.page, `slot:${i}`);
    }
    const cheerRef = expectSeq[expectSeq.length - 1];
    await V.page.waitForFunction((ref) => window.QLOBE_DEBUG.getAudioLog().some((e) => e.ref === ref),
      cheerRef, { timeout: 30000 });
    // Filter by tag, not by position. Cars now speak their own sound when they are
    // introduced, tapped and coupled, so the tail of the log is full of legitimate
    // 'piece' entries; only the entries the engine tagged 'blend' are the readout.
    const full = await V.page.evaluate(() => window.QLOBE_DEBUG.getAudioLog());
    const blend = full.filter((e) => e.tag === 'blend');
    const end = blend.map((e) => e.ref).lastIndexOf(cheerRef);
    const readout = blend.slice(Math.max(0, end - expectSeq.length + 1), end + 1);
    const refs = readout.map((e) => e.ref);
    check(`${modeId}: the blend readout plays in order, every line a clip`,
      refs.join(' -> ') === expectSeq.join(' -> ') && readout.every((e) => e.kind === 'clip'),
      `${readout.map((e) => e.kind + ':' + e.ref).join(' -> ')}  (expected ${expectSeq.join(' -> ')})`);
    return { build: inv.build, log: full.map((e) => e.kind + ':' + e.ref) };
  };

  const sounds = await audioRun('sounds', 'clip:prompt-sounds',
    ['letter:m', 'letter:a', 'letter:t', 'cheer:mat'], 'letter:m');
  const couple = await audioRun('couple', 'clip:prompt-couple',
    ['letter:m', 'letter:at', 'cheer:mat'], 'letter:m');

  const proof = await V.page.evaluate(() => window.__qa.decodeProof());
  check('the voice channel really decoded and played an .m4a',
    proof.ok && /\.m4a$/.test(proof.src),
    `src=${proof.src.split('/').slice(-2).join('/')} played=${proof.played} dur=${proof.duration} err=${proof.error} starts=${proof.starts}`);
  audio = { matSeed, sounds, couple, proof };

  check('audio pass: no console errors', V.errors.length === 0, V.errors.slice(0, 3).join(' | '));
  check('audio pass: no failed requests', V.failed.length === 0, V.failed.slice(0, 5).join(' | '));
  check('audio pass: no request leaves the local host', V.foreign.length === 0, V.foreign.slice(0, 5).join(' | '));
  if (V.aborted.length) note(`${V.aborted.length} interrupted clip load(s) in the audio pass — expected, see isExpectedAbort`);
  await V.ctx.close();

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  await writeFile(path.join(SHOTS, 'qa.json'),
    JSON.stringify({ game: 'blend-train', base: BASE, when: new Date().toISOString(), results, runs, audio, notes }, null, 1));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed; shots in ${SHOTS}`);
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.name).join(', '));
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
