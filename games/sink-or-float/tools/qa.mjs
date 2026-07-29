#!/usr/bin/env node
// games/sink-or-float/tools/qa.mjs — the QA gate for Sink or Float Lab.
//
// Drives the game end to end through window.QLOBE_DEBUG in real Chromium.
// Every state-changing hook (startMode/predict/drop/tap/winRound) is ASYNC —
// each call is always awaited before the next one fires, exactly as the
// engine's header comment requires ("firing them without awaiting the
// previous one gets rejected as ill-timed input, by design"). Reads
// (getState/getTarget/getTargets/water) are safe to interleave freely.
//
// Usage:
//   python3 -m http.server 8000                      # optional — omit --base
//                                                      # and this script serves
//                                                      # the repo itself on a
//                                                      # free port instead
//   node games/sink-or-float/tools/qa.mjs \
//        [--base http://localhost:8000] \
//        [--pw-module /private/tmp/pw/node_modules] \
//        [--channel chrome]
//
// Playwright is loaded out-of-tree (createRequire against a noop.js path that
// need not exist — only its directory matters) from --pw-module, or the
// PW_MODULE env var, defaulting to /private/tmp/pw/node_modules. Chromium is
// the default browser; --channel chrome opts into the system Chrome install
// (needed elsewhere in this repo for AAC decoding, but NOT required here: the
// recorded-audio check below only asserts that the .m4a is REQUESTED over the
// network after a real gesture, not that it decodes — so bundled Chromium is
// fine and is kept as the default per this game's QA spec).
//
// Design notes on a few non-obvious choices:
//
//   - mid-fall / settled-float / settled-sink screenshots are captured from
//     POND mode, not from the predict round. Predict mode's 6 rounds are dealt
//     from a SEEDED SHUFFLE of the 12 "classic" objects (6 float + 6 sink), so
//     a fixed seed's first 6 could — with vanishingly small but nonzero
//     odds — turn out to be all one truth value. Pond mode carries the whole
//     18-object pool and lets us choose one known float object and one known
//     sink object by name, so those three screenshots are deterministic
//     regardless of any seed. Pond's own physics tick is driven by the Pixi
//     ticker, not by state.fast-gated JS delays, so it takes real wall-clock
//     time to fall and settle either way — that's what gives us an actual
//     mid-fall frame to catch.
//
//   - The "warm surprise path" after a deliberately wrong prediction is
//     verified with a MutationObserver on #announcer, installed BEFORE the
//     wrong round's drop() call and read back AFTER it resolves. drop()'s
//     returned promise, once awaited, has already run the ENTIRE reveal chain
//     (result line, surprise/praise line, journal stamp, round increment, and
//     the next round's own object-name line) — so by the time control returns
//     to Node, announcer.textContent has already been overwritten by the next
//     round. Only a running transcript survives that race.
//
//   - The idle-nudge check intentionally runs with QLOBE_DEBUG.fastTimers(false)
//     and real wall-clock time (~11–13s), because scheduleIdle() in main.js
//     no-ops entirely when state.fast is true (`if (state.fast || ...) return;`)
//     — the engine deliberately never arms an idle timer during an
//     accelerated/automated run. Proving the real nudge fires means turning
//     fast timers off and actually waiting past IDLE_MS. It shares its browser
//     context with the recorded-audio network check (both need sound UNMUTED
//     and both start from a real synthetic gesture on the splash screen).
//
//   - Every other pass mutes audio (state.muted stops voice.say() from firing
//     at all — cheap and silent) and runs QLOBE_DEBUG.fastTimers(true) to stay
//     fast, since the engine's own announcer text still updates when muted
//     (used for the surprise-path check above) even though no clip plays.
//
// Exit code is non-zero if any check fails.

import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const GAME_DIR = path.resolve(HERE, '..');
const SHOTS = path.join(GAME_DIR, 'qa-shots');

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const explicitBase = flag('base', null);
const pwDir = flag('pw-module', process.env.PW_MODULE || '/private/tmp/pw/node_modules');
const channel = flag('channel', null); // opt-in: `--channel chrome`

const require = createRequire(path.join(pwDir, 'noop.js'));
const { chromium } = require('playwright');

const GAME_CONFIG = JSON.parse(readFileSync(path.join(GAME_DIR, 'config.json'), 'utf8'));
const LINES = GAME_CONFIG.voice.lines || {};
const MODES = GAME_CONFIG.modes || [];
const OBJECTS = GAME_CONFIG.objects || [];
const PREDICT_MODE = MODES.find((m) => m.id === 'predict');

const LANDSCAPE = { width: 1200, height: 900 };
const PORTRAIT = { width: 800, height: 1067 };
const SEED = 11;
const WRONG_ROUND_INDEX = 1; // deliberately mis-predict the second object of the round

let GAME_URL = ''; // filled in once BASE is known

// --------------------------------------------------------------- bookkeeping

const results = [];
const notes = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) });
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  return !!ok;
};
const note = (line) => { notes.push(line); console.log(`  note  ${line}`); };

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

function waitForNodeCondition(fn, timeout = 8000, interval = 100) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      let hit = false;
      try { hit = !!fn(); } catch { hit = false; }
      if (hit) { resolve(true); return; }
      if (Date.now() - t0 > timeout) { resolve(false); return; }
      setTimeout(tick, interval);
    };
    tick();
  });
}

// ---------------------------------------------------------------- server up

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForServer(base, timeoutMs = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(`${base}/games.json`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

async function startServer() {
  const port = await findFreePort();
  const child = spawn('python3', ['-m', 'http.server', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  const base = `http://127.0.0.1:${port}`;
  const up = await waitForServer(base);
  if (!up) {
    child.kill();
    throw new Error(`static server on ${base} never came up:\n${stderr}`);
  }
  return { base, stop: () => { child.kill(); } };
}

// ------------------------------------------------------------ page plumbing

async function openPage(browser, viewport, reducedMotion = 'no-preference') {
  const ctx = await browser.newContext({ viewport, reducedMotion, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  const failed = [];
  const foreign = [];
  const aborted = [];
  // A recorded line that supersedes another mid-flight src-swaps the one
  // unlocked <audio> element, which cancels the clip it interrupted — that IS
  // the voice channel working, not a bug. Counted separately, never as a fail.
  const isExpectedAbort = (url, err) => /\.m4a(\?|$)/.test(url) && /ABORTED/i.test(err || '');
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => {
    const url = r.url();
    if (!/^https?:/i.test(url)) return;
    if (!url.startsWith(GAME_URL.split('/games/')[0])) foreign.push(`${r.method()} ${url}`);
  });
  page.on('requestfailed', (r) => {
    const err = r.failure()?.errorText;
    (isExpectedAbort(r.url(), err) ? aborted : failed).push(`${r.url()} ${err}`);
  });
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  return { ctx, page, errors, failed, foreign, aborted };
}

async function bootBasic(page, { mute = true, seed = SEED, fast = true } = {}) {
  await page.goto(GAME_URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.QLOBE_DEBUG, null, { timeout: 20000 });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  await page.evaluate(([s, f]) => {
    window.QLOBE_DEBUG.seed(s);
    window.QLOBE_DEBUG.fastTimers(f);
  }, [seed, fast]);
  if (mute) await page.evaluate(() => window.QLOBE_DEBUG.mute());
}

const waitForPredictReady = (page, timeout = 8000) => page.waitForFunction(() => {
  const s = window.QLOBE_DEBUG.getState();
  return s.screen === 'play' && s.step === 'predict' && s.awaitingInput === true;
}, null, { timeout, polling: 40 });

// --------------------------------------------------------------- pass: hub

async function hubPass(browser, base) {
  const { ctx, page, errors, failed } = await openPage(browser, LANDSCAPE);
  await page.goto(`${base}/#sensorial-science`, { waitUntil: 'networkidle' });
  const tile = page.locator('a.tile[aria-label*="Sink or Float"]');
  const count = await tile.count();
  check('hub: lists exactly one Sink or Float tile', count === 1, `count=${count}`);
  if (count === 1) {
    await Promise.all([
      page.waitForURL('**/games/sink-or-float/'),
      tile.click(),
    ]);
    await page.waitForFunction(() => !!window.QLOBE_DEBUG, null, { timeout: 15000 });
    await page.evaluate(() => window.QLOBE_DEBUG.ready);
    check('hub: launches the game at its route', page.url().endsWith('/games/sink-or-float/'), page.url());
  }
  check('hub boot: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('hub boot: no failed requests', failed.length === 0, failed.slice(0, 5).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------- pass: splash/modes

async function splashModesPass(browser) {
  const { ctx, page, errors, failed } = await openPage(browser, LANDSCAPE);
  await bootBasic(page);

  check('splash: boots to the splash screen',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'splash');

  const modes = await page.evaluate(() => window.QLOBE_DEBUG.listModes());
  const expectedIds = MODES.map((m) => m.id);
  check('splash: three distinct modes registered',
    modes.length === 3 && modes.map((m) => m.id).join(',') === expectedIds.join(','),
    modes.map((m) => m.id).join(','));

  const titles = await page.locator('.mode-title').allTextContents();
  const expectedTitles = MODES.map((m) => m.title);
  check('splash: mode titles match config',
    titles.join('|') === expectedTitles.join('|'), titles.join('|'));

  await shot(page, '01-splash-landscape');

  for (const m of MODES) {
    await page.evaluate((id) => window.QLOBE_DEBUG.startMode(id), m.id);
    const started = await page.waitForFunction((id) => {
      const s = window.QLOBE_DEBUG.getState();
      return s.screen === 'play' && s.mode === id && s.awaitingInput === true;
    }, m.id, { timeout: 8000 }).then(() => true).catch(() => false);
    check(`mode "${m.id}" starts into play with input awaited`, started,
      JSON.stringify(await page.evaluate(() => window.QLOBE_DEBUG.getState())));
    await page.evaluate(() => window.QLOBE_DEBUG.home());
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'splash', null, { timeout: 5000 });
  }

  check('splash/modes pass: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('splash/modes pass: no failed requests', failed.length === 0, failed.slice(0, 5).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------ pass: predict round

async function predictRoundPass(browser, tag, viewport) {
  const { ctx, page, errors, failed } = await openPage(browser, viewport);
  await bootBasic(page);
  await shot(page, `01-splash-${tag}`);

  // Running transcript of every line the announcer carries, so the "warm
  // surprise" line can be found even though it is long overwritten by the
  // time drop()'s promise resolves (see header note).
  await page.evaluate(() => {
    window.__qaLog = [];
    const node = document.getElementById('announcer');
    const mo = new MutationObserver(() => window.__qaLog.push(node.textContent));
    mo.observe(node, { childList: true, characterData: true, subtree: true });
  });

  const started = await page.evaluate(() => window.QLOBE_DEBUG.startMode('predict'));
  check(`${tag}: startMode("predict") accepted`, started === true, String(started));
  await waitForPredictReady(page);

  const roundsTotal = await page.evaluate(() => window.QLOBE_DEBUG.getState().roundsTotal);
  check(`${tag}: predict mode deals ${PREDICT_MODE.rounds} rounds`,
    roundsTotal === PREDICT_MODE.rounds, String(roundsTotal));

  for (let i = 0; i < roundsTotal; i += 1) {
    const screenNow = await page.evaluate(() => window.QLOBE_DEBUG.getState().screen);
    if (screenNow !== 'play') break;
    await waitForPredictReady(page);
    const target = await page.evaluate(() => window.QLOBE_DEBUG.getTarget());
    if (i === 0) await shot(page, `02-predict-step-${tag}`);

    const wrong = i === WRONG_ROUND_INDEX;
    const guess = wrong ? (target.truth === 'float' ? 'sink' : 'float') : target.truth;

    const before = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    // QLOBE_DEBUG.predict() is the raw predict() function, not the
    // {accepted} wrapper tap()/debugTap() use — it resolves straight to a
    // boolean.
    const predictRes = await page.evaluate((g) => window.QLOBE_DEBUG.predict(g), guess);
    check(`${tag} round ${i}: predict("${guess}") accepted`,
      predictRes === true, JSON.stringify(predictRes));

    await page.evaluate(() => window.QLOBE_DEBUG.drop());
    const after = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    check(`${tag} round ${i}: the round advances after the drop`,
      after.round === before.round + 1 || after.screen === 'end',
      `round ${before.round} -> ${after.round}, screen ${after.screen}`);

    if (wrong) {
      const entry = after.results[i];
      check(`${tag}: the wrong prediction is recorded honestly`,
        !!entry && entry.hit === false && entry.guess !== entry.truth, JSON.stringify(entry));
      const log = await page.evaluate(() => window.__qaLog.slice());
      const surpriseLines = [LINES['surprise-1'], LINES['surprise-2']].filter(Boolean);
      check(`${tag}: a miss gets the warm "surprise" line, not an error`,
        log.some((line) => surpriseLines.includes(line)), log.slice(-6).join(' / '));
      const stampCount = entry
        ? await page.locator(`.journal-zone[data-zone="${entry.truth}"] .journal-stamp[data-obj="${entry.id}"]`).count()
        : 0;
      check(`${tag}: the journal stamps the TRUTH, not the child's guess`,
        stampCount === 1, `zone=${entry && entry.truth} obj=${entry && entry.id} count=${stampCount}`);
    }

    if (after.round === 3 && after.screen === 'play') {
      // A mid-round look at the field journal with several stamps already in it.
      // The tab-toggle drawer only exists in the portrait layout (`.journal-tab`
      // is display:none in landscape, where the journal page is always visible).
      if (tag === 'portrait') {
        const tab = page.locator('.journal-tab');
        if (await tab.isVisible().catch(() => false)) {
          await tab.click();
          await page.waitForTimeout(150);
        }
      }
      await shot(page, `06-journal-stamps-${tag}`);
    }
  }

  const reachedEnd = await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end', null, { timeout: 10000 })
    .then(() => true).catch(() => false);
  const endState = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check(`${tag}: the full predict round reaches the end screen`, reachedEnd && endState.screen === 'end',
    JSON.stringify(endState));

  const stampCount = await page.locator('.journal-zone .journal-stamp').count();
  check(`${tag}: the journal carries one stamp per round played`,
    stampCount === endState.results.length && stampCount > 0,
    `${stampCount} stamps, ${endState.results.length} results`);

  await shot(page, `07-round-end-${tag}`);

  check(`${tag} predict pass: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  check(`${tag} predict pass: no failed requests`, failed.length === 0, failed.slice(0, 5).join(' | '));
  await ctx.close();
  return { endState };
}

// -------------------------------------------------------------- pass: tricky

async function trickyPass(browser) {
  const { ctx, page, errors, failed } = await openPage(browser, LANDSCAPE);
  await bootBasic(page);
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('tricky'));
  await waitForPredictReady(page);

  const target = await page.evaluate(() => window.QLOBE_DEBUG.getTarget());
  const trickyIds = OBJECTS.filter((o) => o.pool === 'tricky').map((o) => o.id);
  check('tricky: deals an object from the tricky pool',
    trickyIds.includes(target.id), `${target.id} in [${trickyIds.join(',')}]`);

  const res = await page.evaluate((g) => window.QLOBE_DEBUG.predict(g), target.truth);
  check('tricky: predict() is accepted', res === true, JSON.stringify(res));
  const before = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  await page.evaluate(() => window.QLOBE_DEBUG.drop());
  const after = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('tricky: the round advances after a drop',
    after.round === before.round + 1 || after.screen === 'end',
    `round ${before.round} -> ${after.round}`);

  check('tricky pass: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('tricky pass: no failed requests', failed.length === 0, failed.slice(0, 5).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- pass: pond

async function pondPass(browser, tag, viewport) {
  const { ctx, page, errors, failed } = await openPage(browser, viewport);
  await bootBasic(page);
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('pond'));
  const started = await page.waitForFunction(() => {
    const s = window.QLOBE_DEBUG.getState();
    return s.screen === 'play' && s.mode === 'pond' && s.awaitingInput === true;
  }, null, { timeout: 8000 }).then(() => true).catch(() => false);
  check(`${tag}: pond mode starts awaiting input`, started);

  const floatObj = OBJECTS.find((o) => o.truth === 'float');
  const sinkObj = OBJECTS.find((o) => o.truth === 'sink');
  const thirdObj = OBJECTS.find((o) => o.truth === 'float' && o.id !== floatObj.id) || OBJECTS[2];

  async function canvasBox() {
    return page.locator('.jar-slot canvas').boundingBox();
  }

  async function jarDropPoint(offsetX) {
    const w = await page.evaluate(() => window.QLOBE_DEBUG.water());
    const box = await canvasBox();
    return { x: box.x + w.jar.x + w.jar.w / 2 + offsetX, y: box.y + w.jar.y + w.jar.h * 0.55 };
  }

  async function selectAndDrop(objId, offsetX) {
    const before = await page.evaluate(() => window.QLOBE_DEBUG.getState().inJar);
    const sel = await page.evaluate((id) => window.QLOBE_DEBUG.tap(`chip-${id}`), objId);
    check(`${tag} pond: chip "${objId}" selects`, sel && sel.accepted === true, JSON.stringify(sel));
    const pt = await jarDropPoint(offsetX);
    await page.mouse.click(pt.x, pt.y);
    const grew = await page.waitForFunction((n) => window.QLOBE_DEBUG.getState().inJar === n, before + 1, { timeout: 4000 })
      .then(() => true).catch(() => false);
    check(`${tag} pond: "${objId}" lands in the jar`, grew, `inJar before=${before}`);
  }

  await selectAndDrop(floatObj.id, -60);
  await page.waitForTimeout(280);
  await shot(page, `03-mid-fall-${tag}`);
  await page.waitForFunction((id) => {
    const w = window.QLOBE_DEBUG.water();
    const it = w.items.find((x) => x.id === id);
    return it && it.settled;
  }, floatObj.id, { timeout: 6000 }).catch(() => {});
  await shot(page, `04-settled-float-${tag}`);

  await selectAndDrop(sinkObj.id, 0);
  await page.waitForFunction((id) => {
    const w = window.QLOBE_DEBUG.water();
    const it = w.items.find((x) => x.id === id);
    return it && it.settled;
  }, sinkObj.id, { timeout: 6000 }).catch(() => {});
  await shot(page, `05-settled-sink-${tag}`);

  await selectAndDrop(thirdObj.id, 60);

  const beforeLift = await page.evaluate(() => window.QLOBE_DEBUG.getState().inJar);
  check(`${tag} pond: three objects are in the jar`, beforeLift === 3, String(beforeLift));

  // Lift the float object back out: press on it, drag clear of the canvas
  // entirely, release. dropLifted() only keeps an item that lands back over
  // the water — anywhere off-canvas is unambiguously "not water".
  const w = await page.evaluate(() => window.QLOBE_DEBUG.water());
  const item = w.items.find((x) => x.id === floatObj.id);
  const box = await canvasBox();
  check(`${tag} pond: the float object is findable in the water state`, !!item, JSON.stringify(w.items.map((x) => x.id)));
  if (item) {
    const px = box.x + item.x;
    const py = box.y + item.y;
    const outX = Math.max(2, box.x - 80);
    const outY = Math.max(2, box.y - 80);
    await page.mouse.move(px, py);
    await page.mouse.down();
    await page.mouse.move(px + 12, py - 10);
    await page.mouse.move(outX, outY, { steps: 10 });
    await page.mouse.up();
    const shrank = await page.waitForFunction((n) => window.QLOBE_DEBUG.getState().inJar === n, beforeLift - 1, { timeout: 4000 })
      .then(() => true).catch(() => false);
    const afterLift = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    check(`${tag} pond: lifting an object back out removes it from the jar`,
      shrank && afterLift.inJar === beforeLift - 1 && afterLift.dragging === false,
      `inJar ${beforeLift} -> ${afterLift.inJar}, dragging=${afterLift.dragging}`);
  }

  check(`${tag} pond pass: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  check(`${tag} pond pass: no failed requests`, failed.length === 0, failed.slice(0, 5).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------- pass: reduced motion

async function reducedMotionPass(browser) {
  const { ctx, page, errors, failed } = await openPage(browser, LANDSCAPE, 'reduce');
  await bootBasic(page);
  check('reduced motion: the engine reports reducedMotion true',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().reducedMotion)) === true);

  await page.evaluate(() => window.QLOBE_DEBUG.startMode('predict'));
  await waitForPredictReady(page);
  const target = await page.evaluate(() => window.QLOBE_DEBUG.getTarget());
  await page.evaluate((g) => window.QLOBE_DEBUG.predict(g), target.truth);
  const before = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  await page.evaluate(() => window.QLOBE_DEBUG.drop());
  const after = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('reduced motion: one drop completes with no exceptions and the round advances',
    after.round === before.round + 1 || after.screen === 'end', JSON.stringify(after));

  check('reduced motion: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('reduced motion: no failed requests', failed.length === 0, failed.slice(0, 5).join(' | '));
  await ctx.close();
}

// --------------------------------------------------- pass: audio + idle nudge

async function idleAndAudioPass(browser) {
  const { ctx, page, errors, failed, aborted } = await openPage(browser, LANDSCAPE);
  await page.goto(GAME_URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.QLOBE_DEBUG, null, { timeout: 20000 });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  await page.evaluate((s) => {
    window.QLOBE_DEBUG.seed(s);
    window.QLOBE_DEBUG.fastTimers(false); // real timers: this pass needs IDLE_MS to actually elapse
  }, SEED);
  // deliberately NOT muted — this pass proves the recorded-clip network path

  const m4aRequests = [];
  page.on('request', (r) => {
    if (/\/assets\/audio\/.*\.m4a(\?|$)/.test(r.url())) m4aRequests.push(r.url());
  });

  // A real gesture on bare splash art, well clear of the mode cards and the
  // home button — unlockAudio() defers to the tap that is already navigating
  // away when it lands on those, so this must land elsewhere on the splash.
  const vp = page.viewportSize();
  await page.mouse.click(vp.width / 2, 60);

  const gotClip = await waitForNodeCondition(() => m4aRequests.length > 0, 5000);
  check('audio: a synthetic first gesture triggers a recorded-clip network request',
    gotClip, m4aRequests[0] || '(none)');

  await page.evaluate(() => window.QLOBE_DEBUG.startMode('predict'));
  await waitForPredictReady(page);

  const before = m4aRequests.length;
  const beforeState = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  // Real wall-clock wait past IDLE_MS (11000ms) — see header note on why
  // fastTimers stays off for this one pass.
  const gotRepeat = await waitForNodeCondition(() => m4aRequests.length > before, 13000);
  check('idle nudge: a silent child gets the prompt repeated after IDLE_MS (real timers)',
    gotRepeat, `m4a requests ${before} -> ${m4aRequests.length}`);
  const afterState = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('idle nudge: the round survives — still awaiting the same prediction',
    afterState.screen === 'play' && afterState.step === 'predict' && afterState.awaitingInput === true,
    JSON.stringify({ before: beforeState, after: afterState }));

  check('audio/idle pass: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('audio/idle pass: no failed requests', failed.length === 0, failed.slice(0, 5).join(' | '));
  if (aborted.length) note(`${aborted.length} interrupted clip load(s) in the audio/idle pass — expected (a newer line supersedes the channel)`);
  await ctx.close();
}

// -------------------------------------------------------------------- main

async function main() {
  await mkdir(SHOTS, { recursive: true });

  let base = explicitBase;
  let stopServer = null;
  if (!base) {
    const server = await startServer();
    base = server.base;
    stopServer = server.stop;
    console.log(`serving ${ROOT} at ${base}`);
  } else {
    console.log(`using externally-supplied --base ${base}`);
  }
  GAME_URL = `${base}/games/sink-or-float/`;

  const launchOpts = { headless: true };
  if (channel) launchOpts.channel = channel;
  const browser = await chromium.launch(launchOpts);

  const runs = {};
  const passes = [
    ['hub', () => hubPass(browser, base)],
    ['splash/modes', () => splashModesPass(browser)],
    ['predict round (landscape)', async () => { runs.predictLandscape = await predictRoundPass(browser, 'landscape', LANDSCAPE); }],
    ['pond (landscape)', () => pondPass(browser, 'landscape', LANDSCAPE)],
    ['tricky', () => trickyPass(browser)],
    ['predict round (portrait)', async () => { runs.predictPortrait = await predictRoundPass(browser, 'portrait', PORTRAIT); }],
    ['pond (portrait)', () => pondPass(browser, 'portrait', PORTRAIT)],
    ['reduced motion', () => reducedMotionPass(browser)],
    ['audio + idle nudge', () => idleAndAudioPass(browser)],
  ];

  try {
    for (const [name, run] of passes) {
      try {
        await run();
      } catch (error) {
        check(`${name}: pass completed without throwing`, false, String((error && error.stack) || error));
        console.error(`  !! ${name} pass threw — see detail above`);
      }
    }
  } finally {
    await browser.close();
    if (stopServer) stopServer();
  }

  const failures = results.filter((r) => !r.ok);
  await writeFile(path.join(SHOTS, 'qa.json'), JSON.stringify({
    game: 'sink-or-float',
    base,
    when: new Date().toISOString(),
    results,
    notes,
  }, null, 2));

  console.log(`\n${results.length - failures.length}/${results.length} checks passed; shots in ${SHOTS}`);
  if (failures.length) {
    console.log('FAILED: ' + failures.map((f) => f.name).join(', '));
  }
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
