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
//     POND mode, not from the predict round. A predict round is a seeded
//     BALANCED draw of 6 from the mode's pool (3 floaters, 3 sinkers), so which
//     six objects turn up is a property of the seed, not something to hard-code;
//     pond mode deals a 16-object shelf and this script picks one known floater
//     and one known sinker OFF THAT SHELF by asking the engine what it dealt
//     (QLOBE_DEBUG.getRound().shelf) — so those three screenshots are
//     deterministic without either pass assuming a fixed object list. Pond's own
//     physics tick is driven by the Pixi ticker, not by state.fast-gated JS
//     delays, so it takes real wall-clock time to fall and settle either way —
//     that's what gives us an actual mid-fall frame to catch.
//
//   - The object catalogue is 54 strong and its art/voice are produced in
//     parallel with the code, so a plate or clip that is not on disk YET must
//     not be reported as a broken game. Requests under assets/objects/ and
//     assets/audio/ are matched against the real directory listing: a 404 for a
//     file that does not exist yet is counted as "pending production" and
//     noted; a 404 for anything that DOES exist, or for any other path, is a
//     failure exactly as before. The exemption disappears on its own the moment
//     the asset lands.
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
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const GAME_DIR = path.resolve(HERE, '..');
const SHOTS = path.join(GAME_DIR, 'qa-shots');
// Shots for the v2 feature pass (spoken badge order, pop-sync, 54-object pools)
// land in their own folder so the original review set stays comparable.
const SHOTS_V2 = path.join(SHOTS, 'v2');

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
const ROUND_SIZE = (PREDICT_MODE && PREDICT_MODE.rounds) || 6;
const POND_SHELF = ((MODES.find((m) => m.id === 'pond') || {}).shelf) || 16;
const SEEDS = [11, 7, 1234, 99, 20260728]; // the seeded-draw balance sweep

// What is actually on disk right now, so a not-yet-produced plate or clip can
// be told apart from a broken path. See the header note.
const onDisk = (dir) => {
  try { return new Set(readdirSync(path.join(GAME_DIR, 'assets', dir))); } catch { return new Set(); }
};
const HAVE_OBJECT_ART = onDisk('objects');
const HAVE_AUDIO = onDisk('audio');

// One asset can be reported twice (a console error AND a 404 response), so
// pending lists are always counted by file name.
const pendingNames = (lines) => [...new Set(lines.map((line) => line.replace(/^.*\//, '')))].sort();

function isPendingAsset(url) {
  const m = /\/assets\/(objects|audio)\/([^/?#]+)/.exec(url);
  if (!m) return false;
  const have = m[1] === 'objects' ? HAVE_OBJECT_ART : HAVE_AUDIO;
  return !have.has(decodeURIComponent(m[2]));
}

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

async function shotV2(page, name) {
  await page.screenshot({ path: path.join(SHOTS_V2, `${name}.png`) });
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
  const pending = []; // assets still in production — noted, never a failure
  // A recorded line that supersedes another mid-flight src-swaps the one
  // unlocked <audio> element, which cancels the clip it interrupted — that IS
  // the voice channel working, not a bug. Counted separately, never as a fail.
  const isExpectedAbort = (url, err) => /\.m4a(\?|$)/.test(url) && /ABORTED/i.test(err || '');
  // Chromium reports a failed resource load as a console error as well as a
  // failed response, so the pending-asset rule has to be applied here too or
  // one unproduced plate shows up as "the game is throwing".
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const from = (m.location() && m.location().url) || '';
    if (isPendingAsset(from)) { pending.push(`console ${from}`); return; }
    errors.push(`${m.text()} @ ${from}`);
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => {
    const url = r.url();
    if (!/^https?:/i.test(url)) return;
    if (!url.startsWith(GAME_URL.split('/games/')[0])) foreign.push(`${r.method()} ${url}`);
  });
  page.on('requestfailed', (r) => {
    const err = r.failure()?.errorText;
    if (isPendingAsset(r.url())) { pending.push(r.url()); return; }
    (isExpectedAbort(r.url(), err) ? aborted : failed).push(`${r.url()} ${err}`);
  });
  page.on('response', (r) => {
    if (r.status() < 400) return;
    (isPendingAsset(r.url()) ? pending : failed).push(`${r.status()} ${r.url()}`);
  });
  return { ctx, page, errors, failed, foreign, aborted, pending };
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

  const title = await page.locator('.title-art').evaluate((img) => ({
    complete: img.complete,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
  }));
  check('splash: approved graphic title is loaded',
    title.complete && title.naturalWidth === 620 && title.naturalHeight === 560,
    `${title.naturalWidth}x${title.naturalHeight}`);
  check('splash: title remains an accessible heading',
    (await page.locator('.title-lockup h1').textContent())?.trim() === 'Sink or Float Lab');
  check('splash: legacy HTML wordmark is absent',
    (await page.locator('.title-top, .title-bottom').count()) === 0);

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

  // Spoken order, read off real layout geometry rather than DOM order — a
  // stray `row-reverse` would still have to fail this.
  const badges = await page.evaluate(() => Array.from(document.querySelectorAll('.guess-row .badge'))
    .map((el) => ({ guess: el.dataset.guess, left: Math.round(el.getBoundingClientRect().left) })));
  const sinkBadge = badges.find((b) => b.guess === 'sink');
  const floatBadge = badges.find((b) => b.guess === 'float');
  check(`${tag}: guess badges sit in spoken order — SINK left, FLOAT right`,
    !!sinkBadge && !!floatBadge && sinkBadge.left < floatBadge.left, JSON.stringify(badges));

  const targetIds = await page.evaluate(() => window.QLOBE_DEBUG.getTargets().map((t) => t.id));
  check(`${tag}: getTargets lists the badges in that same order`,
    targetIds.join(',') === 'guess-sink,guess-float', targetIds.join(','));

  const dealt = await page.evaluate(() => window.QLOBE_DEBUG.getRound());
  check(`${tag}: the round is dealt 3 floaters and 3 sinkers, no repeats`,
    dealt.floats === ROUND_SIZE / 2 && dealt.sinks === ROUND_SIZE / 2
      && new Set(dealt.queue.map((o) => o.id)).size === ROUND_SIZE,
    dealt.queue.map((o) => `${o.id}:${o.truth}`).join(' '));
  check(`${tag}: the shelf shows exactly this round's objects`,
    dealt.shelf.join(',') === dealt.queue.map((o) => o.id).join(','), dealt.shelf.join(','));

  // The two pops must have fired, sink first, before the child can answer.
  const popped = await page.waitForFunction(() => window.QLOBE_DEBUG.getPrompt().pops.length >= 2,
    null, { timeout: 6000 }).then(() => true).catch(() => false);
  const prompt = await page.evaluate(() => window.QLOBE_DEBUG.getPrompt());
  const pops = prompt.pops.slice(-2);
  check(`${tag}: the prompt pops the sink badge, then the float badge`,
    popped && pops.length === 2 && pops[0].guess === 'sink' && pops[1].guess === 'float',
    JSON.stringify(prompt));

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

  // The shelf is a seeded draw of 16 from all 54, so the objects to play with
  // are whatever THIS visit dealt — ask the engine rather than assuming.
  const dealt = await page.evaluate(() => window.QLOBE_DEBUG.getRound());
  const shelf = dealt.shelf.map((id) => OBJECTS.find((o) => o.id === id)).filter(Boolean);
  check(`${tag} pond: the shelf shows ${POND_SHELF} of the ${OBJECTS.length} objects, no repeats`,
    shelf.length === POND_SHELF && new Set(dealt.shelf).size === POND_SHELF, dealt.shelf.join(','));
  const shelfChips = await page.locator('.shelf .obj-chip').count();
  check(`${tag} pond: every dealt object is on the rail`, shelfChips === POND_SHELF, String(shelfChips));
  check(`${tag} pond: the shelf mixes floaters and sinkers`,
    shelf.some((o) => o.truth === 'float') && shelf.some((o) => o.truth === 'sink'),
    shelf.map((o) => o.truth).join(','));

  const floatObj = shelf.find((o) => o.truth === 'float');
  const sinkObj = shelf.find((o) => o.truth === 'sink');
  const thirdObj = shelf.find((o) => o.id !== floatObj.id && o.id !== sinkObj.id);

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

// ------------------------------------------- pass: badge pop-sync + v2 shots
//
// The pop has to land WITH the words, so it is captured the way a reviewer
// would see it: fire the prompt, wait for the engine to report each pop, then
// take the frame ~180ms later — inside the .35s badge-pop animation, close to
// its peak. Runs UNMUTED with the clause path forced on, so each half of the
// question is a separate utterance and the two pops are seconds apart even
// before the clause clips exist.
async function promptPopPass(browser, tag, viewport, reduced = false) {
  const { ctx, page, errors, failed, pending } = await openPage(
    browser, viewport, reduced ? 'reduce' : 'no-preference',
  );
  await bootBasic(page, { mute: false, fast: false });
  await page.mouse.click(viewport.width / 2, 60); // real gesture: unlock audio
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('predict'));
  await waitForPredictReady(page);

  const forced = await page.evaluate(() => window.QLOBE_DEBUG.forcePromptParts(true));
  check(`${tag}: the two-clause prompt path can be driven`, forced === true, String(forced));
  const prompt0 = await page.evaluate(() => window.QLOBE_DEBUG.getPrompt());
  note(`${tag}: clause clips recorded = [${prompt0.recorded.join(', ')}] (${prompt0.keys.join(', ')})`);

  await shotV2(page, `predict-step-${tag}${reduced ? '-reduced' : ''}`);

  await page.evaluate(() => {
    window.__popMark = window.QLOBE_DEBUG.getPrompt().pops.length;
    window.QLOBE_DEBUG.sayPrompt();          // deliberately not awaited
  });

  for (const [index, guess] of ['sink', 'float'].entries()) {
    const seen = await page.waitForFunction((want) => {
      const pops = window.QLOBE_DEBUG.getPrompt().pops;
      return pops.length >= window.__popMark + want;
    }, index + 1, { timeout: 9000 }).then(() => true).catch(() => false);
    check(`${tag}: pop ${index + 1} ("${guess}") fires with its clause`, seen);
    if (!seen) break;
    await page.waitForTimeout(180);
    const state = await page.evaluate((want) => {
      const badge = document.querySelector(`.guess-row .badge[data-guess="${want}"]`);
      return badge ? { cls: badge.className, rect: badge.getBoundingClientRect().width } : null;
    }, guess);
    check(`${tag}: the ${guess} badge is mid-${reduced ? 'cue' : 'pop'} when captured`,
      !!state && /is-(pop|cued)/.test(state.cls), JSON.stringify(state));
    check(`${tag}: reduced motion swaps the scale for an outline cue`,
      !reduced || (state && state.cls.includes('is-cued')), state ? state.cls : '(none)');
    await shotV2(page, `pop-${guess}-${tag}${reduced ? '-reduced' : ''}`);
  }

  check(`${tag} pop-sync pass: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  check(`${tag} pop-sync pass: no failed requests`, failed.length === 0, failed.slice(0, 5).join(' | '));
  if (pending.length) note(`${tag} pop-sync: ${pendingNames(pending).length} asset(s) still in production`);
  await ctx.close();
}

// ------------------------------------------------- pass: seeded balanced draw
//
// Five seeds × both predict modes. Every draw must be six distinct objects,
// three floaters and three sinkers, all from the mode's own pool; a replay in
// the same session must not repeat the set; and setSeed(n) must make the whole
// thing reproducible.
async function seededDrawPass(browser) {
  const { ctx, page, errors, failed, pending } = await openPage(browser, LANDSCAPE);
  await bootBasic(page);

  const draws = [];
  for (const modeId of ['predict', 'tricky']) {
    const poolIds = new Set(OBJECTS.filter((o) => o.pool === (modeId === 'predict' ? 'classic' : 'tricky'))
      .map((o) => o.id));
    for (const seed of SEEDS) {
      const dealt = await page.evaluate(async ([id, s]) => {
        window.QLOBE_DEBUG.setSeed(s);
        await window.QLOBE_DEBUG.startMode(id);
        return window.QLOBE_DEBUG.getRound();
      }, [modeId, seed]);
      const ids = dealt.queue.map((o) => o.id);
      draws.push({ mode: modeId, seed, ids, floats: dealt.floats, sinks: dealt.sinks });
      console.log(`  draw  ${modeId} seed ${seed}: ${dealt.floats}F/${dealt.sinks}S — ${ids.join(', ')}`);
      check(`draw ${modeId}/${seed}: 3 floaters + 3 sinkers, 6 distinct, all in pool`,
        dealt.floats === ROUND_SIZE / 2 && dealt.sinks === ROUND_SIZE / 2
        && new Set(ids).size === ROUND_SIZE && ids.every((id) => poolIds.has(id)),
        `${dealt.floats}F/${dealt.sinks}S ${ids.join(',')}`);
    }
  }
  notes.push(`seeded draws: ${draws.map((d) => `${d.mode}/${d.seed}=[${d.ids.join('|')}]`).join(' ')}`);

  // Same seed, fresh: the draw reproduces exactly.
  const repeat = await page.evaluate(async () => {
    window.QLOBE_DEBUG.setSeed(11);
    await window.QLOBE_DEBUG.startMode('predict');
    return window.QLOBE_DEBUG.getRound().queue.map((o) => o.id);
  });
  const first = draws.find((d) => d.mode === 'predict' && d.seed === 11);
  check('setSeed(n) makes the draw reproducible',
    repeat.join(',') === first.ids.join(','), `${repeat.join(',')} vs ${first.ids.join(',')}`);

  // Play again WITHOUT re-seeding: a genuinely different experiment set.
  const again = await page.evaluate(async () => {
    await window.QLOBE_DEBUG.startMode('predict');
    return window.QLOBE_DEBUG.getRound().queue.map((o) => o.id);
  });
  const same = again.slice().sort().join(',') === repeat.slice().sort().join(',');
  check('playing again in the same session deals a different set', !same,
    `${repeat.join(',')} -> ${again.join(',')}`);

  // The playground shelf: 16 of the 54, mixed, per visit.
  const pond = await page.evaluate(async () => {
    await window.QLOBE_DEBUG.startMode('pond');
    return window.QLOBE_DEBUG.getRound().shelf;
  });
  const pondTruths = pond.map((id) => (OBJECTS.find((o) => o.id === id) || {}).truth);
  check(`pond: the shelf is a mixed ${POND_SHELF} of ${OBJECTS.length}`,
    pond.length === POND_SHELF && new Set(pond).size === POND_SHELF
    && pondTruths.includes('float') && pondTruths.includes('sink'),
    `${pond.length}: ${pond.join(',')}`);

  check('seeded-draw pass: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('seeded-draw pass: no failed requests', failed.length === 0, failed.slice(0, 5).join(' | '));
  // This pass touches every mode, so its pending list is the whole picture:
  // print the file names once, so a reviewer can see that the ONLY things
  // missing are plates for objects added ahead of their art.
  const stillMissing = pendingNames(pending);
  if (stillMissing.length) {
    note(`assets still in production (${stillMissing.length}): ${stillMissing.join(', ')}`);
  }
  await ctx.close();
}

// -------------------------------------------------------------------- main

async function main() {
  await mkdir(SHOTS, { recursive: true });
  await mkdir(SHOTS_V2, { recursive: true });

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
    ['seeded balanced draw', () => seededDrawPass(browser)],
    ['badge pop-sync (landscape)', () => promptPopPass(browser, 'landscape', LANDSCAPE)],
    ['badge pop-sync (portrait)', () => promptPopPass(browser, 'portrait', PORTRAIT)],
    ['badge pop-sync (reduced motion)', () => promptPopPass(browser, 'landscape', LANDSCAPE, true)],
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
