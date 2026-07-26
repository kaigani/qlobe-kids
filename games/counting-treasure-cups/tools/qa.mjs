#!/usr/bin/env node
// tools/qa.mjs — the QA gate for Counting Treasure Cups.
//
// Drives every mode end to end through window.QLOBE_DEBUG in REAL Chrome
// (channel 'chrome' — headless-shell cannot decode AAC, so recorded clips would
// silently fall back to Web Speech and the audio assertion would be worthless).
//
//   python3 -m http.server 8000          # from the repo root
//   npm install playwright@1.52.0        # in a scratch dir
//   node games/counting-treasure-cups/tools/qa.mjs --playwright /tmp/pw/node_modules
//
// Checks, in order:
//   1. zero console errors and zero failed requests, on every screen
//   2. every mode completes every round through the real input handler
//   3. wrong-input probes take the gentle-retry path and never lock the game
//   4. recorded clips actually PLAY (asserted via the voice onClip hook — a
//      Web Speech fallback looks identical in a screenshot)
//   5. navigation: the catalog link exists ONLY on the splash
//   6. no stranded drag clones or fliers after a full run
//   7. portrait + landscape + reduced-motion screenshots for human review
//
// Exit code is non-zero if any check fails.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const BASE = flag('base', 'http://localhost:8000');
const URL_GAME = `${BASE}/games/counting-treasure-cups/`;
const SHOTS = flag('shots', path.resolve('qa-shots'));
const pwDir = flag('playwright', process.env.PLAYWRIGHT_MODULE_PATH);
if (!pwDir) {
  console.error('need --playwright <node_modules dir holding playwright@1.52.0>');
  process.exit(2);
}
const require = createRequire(path.join(pwDir, 'noop.js'));
const { chromium } = require('playwright');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  return ok;
};

// The driver runs inside the page so every tap goes through the real handler.
const DRIVER = `
window.__qa = {
  clips: [],
  drive: async function (modeId) {
    const D = window.QLOBE_DEBUG;
    const log = [];
    const settle = async (ms = 8000) => {
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        const s = D.getState();
        if (s.screen !== 'play' || s.awaitingInput) return s;
        await new Promise(r => setTimeout(r, 25));
      }
      return Object.assign(D.getState(), { _timedOut: true });
    };
    await D.startMode(modeId);
    D.fastTimers(0.05);
    let guard = 0, wrongProbes = 0, gentle = 0;
    while (guard++ < 30) {
      const s = await settle();
      if (s.screen !== 'play') { log.push('end -> ' + s.screen); break; }
      if (s._timedOut) { log.push('STUCK ' + JSON.stringify(s)); break; }
      const wrong = D.getTargets().find(t => t.role === 'wrong');
      if (wrong) {
        wrongProbes++;
        const r = await D.tap(wrong.id);
        if (r.accepted === false) gentle++;
        const a = await settle();
        if (a._timedOut) { log.push('STUCK after wrong probe'); break; }
      }
      const before = s.round;
      let inner = 0;
      while (inner++ < 20) {
        const st = await settle();
        if (st._timedOut || st.screen !== 'play' || st.round !== before) break;
        const t = D.getTargets().find(x => x.role === 'correct');
        if (!t) { log.push('r' + before + ' NO CORRECT TARGET'); break; }
        await D.tap(t.id);
        const now = D.getState();
        if (now.round !== before || now.screen !== 'play') break;
        if (now.placed >= st.target) break;
      }
      const after = await settle();
      log.push('r' + before + ' target=' + s.target + ' -> r' + after.round + ' ' + after.screen);
      if (after.screen !== 'play') break;
      if (after._timedOut || after.round === before) { log.push('NO PROGRESS'); break; }
    }
    return { log, wrongProbes, gentle,
      screens: [...document.querySelectorAll('.ctc-screen')].map(e => e.className.replace('ctc-screen ', '').trim()),
      catalogLinks: document.querySelectorAll('a.hud-home').length,
      stray: document.querySelectorAll('.drag-clone, .ctc-flier').length };
  }
};
`;

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.viewport || { width: 1180, height: 820 },
    reducedMotion: opts.reducedMotion || 'no-preference',
    deviceScaleFactor: 2,
  });
  const errors = [];
  const failed = [];
  const aborted = [];
  const page = await ctx.newPage();
  // Two kinds of abort are by design, counted separately rather than ignored:
  //   .m4a  — say() src-swaps the one unlocked <audio> element, cancelling the
  //           clip it superseded. That IS the voice channel working.
  //   .webp — a pose swap can land while the idle preloader is fetching the same
  //           pose; one of the two identical requests is cancelled and the other
  //           completes. Verified: actors still end up with real art.
  // Anything else failing is a genuine broken asset and fails the run.
  const isExpectedAbort = (url, err) =>
    /\.(m4a|webp)$/.test(url) && /ABORTED/i.test(err || '');
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (r) => {
    const err = r.failure()?.errorText;
    (isExpectedAbort(r.url(), err) ? aborted : failed).push(`${r.url()} ${err}`);
  });
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.url()} ${r.status()}`); });
  return { ctx, page, errors, failed, aborted };
}

async function boot(page) {
  await page.goto(URL_GAME, { waitUntil: 'networkidle' });
  await page.addScriptTag({ content: DRIVER });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  // A real gesture, so the clip channel is unlocked exactly as a child's tap
  // would — on bare splash art, well clear of the mode buttons at the bottom.
  await page.mouse.click(page.viewportSize().width / 2, 120);
  await page.evaluate(() => {
    window.__qa.clips = [];
    return import('./js/voice.js').then((v) => v.onClip((key) => window.__qa.clips.push(key)));
  });
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: false });

  // ---- pass 1: full playthrough, audio live -------------------------------
  const A = await newPage(browser);
  await boot(A.page);

  const modes = await A.page.evaluate(() => window.QLOBE_DEBUG.listModes());
  check('three modes registered', modes.length === 3, modes.map((m) => m.id).join(', '));

  // recorded clips, not the synth fallback
  await A.page.evaluate(() => window.QLOBE_DEBUG.startMode('cup'));
  await A.page.waitForTimeout(2500);
  const clips = await A.page.evaluate(() => window.__qa.clips.slice());
  check('recorded clips play (onClip fired)', clips.length > 0, clips.join(','));

  await A.page.screenshot({ path: path.join(SHOTS, 'landscape-cup.png') });

  // ---- real pointer drag, not just tap ------------------------------------
  // Both paths must reach the same attempt() handler (interaction-pattern #11).
  await A.page.evaluate(() => window.QLOBE_DEBUG.home());
  await A.page.evaluate(() => window.QLOBE_DEBUG.startMode('cup'));
  await A.page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 15000 });
  const before = await A.page.evaluate(() => window.QLOBE_DEBUG.getState().placed);
  const tile = await A.page.evaluate(() => {
    const t = document.querySelector('.ctc-tile');
    const r = t.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const drop = await A.page.evaluate(() => {
    const r = document.querySelector('.ctc-stage').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height * 0.35 };
  });
  await A.page.mouse.move(tile.x, tile.y);
  await A.page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await A.page.mouse.move(tile.x + (drop.x - tile.x) * i / 12, tile.y + (drop.y - tile.y) * i / 12);
    await A.page.waitForTimeout(12);
  }
  await A.page.mouse.up();
  await A.page.waitForTimeout(1200);
  const afterDrag = await A.page.evaluate(() => window.QLOBE_DEBUG.getState().placed);
  check('drag-to-container places a treasure', afterDrag === before + 1, `${before} -> ${afterDrag}`);
  const strandedAfterDrag = await A.page.evaluate(
    () => document.querySelectorAll('.drag-clone').length);
  check('drag leaves no stranded clone', strandedAfterDrag === 0);

  // a drag released back over the tray must NOT count, and must not strand
  const before2 = await A.page.evaluate(() => window.QLOBE_DEBUG.getState().placed);
  await A.page.mouse.move(tile.x, tile.y);
  await A.page.mouse.down();
  await A.page.mouse.move(tile.x + 30, tile.y + 6);
  await A.page.mouse.move(tile.x + 60, tile.y + 10);
  await A.page.mouse.up();
  await A.page.waitForTimeout(700);
  const after2 = await A.page.evaluate(() => ({
    placed: window.QLOBE_DEBUG.getState().placed,
    stray: document.querySelectorAll('.drag-clone').length,
  }));
  check('drag dropped on the tray does not count', after2.placed === before2, `${before2} -> ${after2.placed}`);
  check('cancelled drag leaves no stranded clone', after2.stray === 0);

  // ---- rapid taps must all land ------------------------------------------
  // A 4-year-old jabs. Picks are accepted on a reservation counter rather than a
  // lock held across the arc and the count word, so every tap up to the target
  // counts and nothing beyond it does.
  await A.page.evaluate(() => window.QLOBE_DEBUG.home());
  await A.page.evaluate(() => window.QLOBE_DEBUG.startMode('chest'));
  await A.page.evaluate(() => window.QLOBE_DEBUG.fastTimers(1));
  await A.page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput,
    null, { timeout: 20000 });
  const rapid = await A.page.evaluate(async () => {
    const D = window.QLOBE_DEBUG;
    const target = D.getState().target;
    const taps = [];
    for (let i = 0; i < target + 3; i++) {
      const t = D.getTargets().find((x) => x.role === 'correct');
      const r = t ? await D.tap(t.id) : { accepted: false, reason: 'no-target' };
      taps.push(r.accepted);
      await new Promise((z) => setTimeout(z, 90));       // faster than the arc
    }
    await new Promise((z) => setTimeout(z, 1800));
    const s = D.getState();
    return { target, accepted: taps.filter(Boolean).length, refused: taps.filter((x) => !x).length,
             placed: s.placed, sprites: document.querySelectorAll('.ctc-treasure-item').length };
  });
  check('rapid taps 90ms apart all count', rapid.accepted === rapid.target,
    `${rapid.accepted}/${rapid.target} accepted, ${rapid.refused} refused`);
  check('rapid taps cannot over-count', rapid.placed === rapid.target && rapid.sprites === rapid.target,
    `placed ${rapid.placed}, ${rapid.sprites} sprites, target ${rapid.target}`);

  const runs = {};
  for (const m of ['cup', 'chest', 'howmany']) {
    await A.page.evaluate(() => window.QLOBE_DEBUG.home());
    runs[m] = await A.page.evaluate((id) => window.__qa.drive(id), m);
    console.log(`\n[${m}]`);
    runs[m].log.forEach((l) => console.log('     ' + l));
    check(`${m}: reaches the end screen`, runs[m].screens.includes('ctc-end'), runs[m].screens.join('|'));
    check(`${m}: no stuck round`, !runs[m].log.some((l) => /STUCK|NO PROGRESS|NO CORRECT/.test(l)));
    check(`${m}: end screen has no catalog link`, runs[m].catalogLinks === 0);
    check(`${m}: nothing stranded`, runs[m].stray === 0, `${runs[m].stray} leftover`);
    if (m !== 'cup') {
      check(`${m}: wrong picks take the gentle path`,
        runs[m].wrongProbes > 0 && runs[m].gentle === runs[m].wrongProbes,
        `${runs[m].gentle}/${runs[m].wrongProbes}`);
    }
  }
  await A.page.screenshot({ path: path.join(SHOTS, 'landscape-end.png') });

  // The end-of-game button returns to the mode choice, not into the same mode.
  const endBtn = await A.page.locator('.ctc-end-again').boundingBox();
  if (endBtn) {
    await A.page.mouse.click(endBtn.x + endBtn.width / 2, endBtn.y + endBtn.height / 2);
    await A.page.waitForTimeout(900);
  }
  const afterEnd = await A.page.evaluate(() => ({
    screens: [...document.querySelectorAll('.ctc-screen')].map((e) => e.className.replace('ctc-screen ', '').trim()),
    modes: document.querySelectorAll('.ctc-mode').length,
  }));
  check('end-screen button returns to the mode choice',
    afterEnd.screens.includes('ctc-splash') && afterEnd.modes === 3,
    `${afterEnd.screens.join('|')} with ${afterEnd.modes} modes`);

  // splash is the ONLY screen with a catalog link
  await A.page.evaluate(() => window.QLOBE_DEBUG.home());
  await A.page.waitForTimeout(400);
  const splashLinks = await A.page.evaluate(() => document.querySelectorAll('a.hud-home').length);
  check('splash carries the catalog link', splashLinks === 1, String(splashLinks));
  await A.page.screenshot({ path: path.join(SHOTS, 'landscape-splash.png') });

  check('no console errors', A.errors.length === 0, A.errors.slice(0, 3).join(' | '));
  check('no failed requests', A.failed.length === 0, A.failed.slice(0, 5).join(' | '));
  console.log(`  note  ${A.aborted.length} interrupted clip load(s) — expected, see isExpectedAbort`);
  await A.ctx.close();

  // ---- pass 2: portrait ----------------------------------------------------
  const B = await newPage(browser, { viewport: { width: 834, height: 1194 } });
  await boot(B.page);
  for (const [name, mode] of [['portrait-splash', null], ['portrait-cup', 'cup'], ['portrait-chest', 'chest'], ['portrait-howmany', 'howmany']]) {
    if (mode) {
      await B.page.evaluate((id) => window.QLOBE_DEBUG.startMode(id), mode);
      await B.page.waitForTimeout(1600);
    }
    await B.page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  }
  check('portrait: no console errors', B.errors.length === 0, B.errors.slice(0, 3).join(' | '));
  await B.ctx.close();

  // ---- pass 3: reduced motion ---------------------------------------------
  const C = await newPage(browser, { reducedMotion: 'reduce' });
  await boot(C.page);
  await C.page.evaluate(() => window.QLOBE_DEBUG.startMode('cup'));
  await C.page.waitForTimeout(1800);
  const rm = await C.page.evaluate(() => ({
    videoHidden: getComputedStyle(document.querySelector('.ctc-video')).display === 'none',
    state: window.QLOBE_DEBUG.getState(),
  }));
  check('reduced motion: video suppressed', rm.videoHidden);
  const rmRun = await C.page.evaluate(() => window.__qa.drive('cup'));
  check('reduced motion: mode still completes', rmRun.screens.includes('ctc-end'), rmRun.log.slice(-2).join(' | '));
  await C.page.screenshot({ path: path.join(SHOTS, 'reduced-motion.png') });
  check('reduced motion: no console errors', C.errors.length === 0, C.errors.slice(0, 3).join(' | '));
  await C.ctx.close();

  await browser.close();

  const failedChecks = results.filter((r) => !r.ok);
  await writeFile(path.join(SHOTS, 'qa.json'), JSON.stringify({ results, runs }, null, 1));
  console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed; shots in ${SHOTS}`);
  if (failedChecks.length) {
    console.log('FAILED: ' + failedChecks.map((f) => f.name).join(', '));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
