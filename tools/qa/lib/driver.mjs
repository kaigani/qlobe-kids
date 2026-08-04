// tools/qa/lib/driver.mjs — shared plumbing for the per-game Chrome QA drivers.
//
// Every game's tools/qa.mjs used to re-derive the same ~60 lines: argv parsing,
// out-of-tree Playwright resolution, a real-Chrome launch, a monitored page with
// console/request capture, the QLOBE_DEBUG handshake, a shots directory and a
// pass/fail reporter. That plumbing lives here now; the game files keep only
// their own scenarios and assertions.
//
// This is a NO-BUILD repo: Playwright is never a dependency of it. It is loaded
// out of tree with createRequire against `<dir>/noop.js` — only the directory has
// to exist, not the file. Resolution order, first hit wins:
//
//   1. an explicit `dir` passed to loadPlaywright()
//   2. --playwright <dir> / --pw-module <dir> on the command line
//   3. $PLAYWRIGHT_MODULE_PATH / $PW_MODULE
//   4. ../../tools-local/playwright/node_modules, relative to the repo root —
//      a sibling of this checkout, outside the repo but not in /private/tmp
//      (which gets wiped on reboot). It is its own isolated npm project (has
//      its own package.json) so `npm install` there never walks upward and
//      touches an unrelated node_modules — see tools-local/playwright/README
//      if that directory doesn't exist yet. (the default on this machine)
//
// **channel: 'chrome' is load-bearing.** Playwright's bundled Chromium ships
// without an AAC decoder, so every .m4a in a game's assets/audio silently fails
// to decode there and any recorded-clip assertion would quietly pass against the
// Web Speech fallback instead of the real teacher clip. launchChrome() defaults
// to the system Chrome for that reason; a driver that genuinely does not need
// audio decoding can pass `channel: null`.
//
// Run long drives under `caffeinate -dims` — a Mac that sleeps mid-run freezes
// Chrome without failing the run.
//
// See tools/qa/README.md for usage and a conversion recipe.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// ─────────────────────────────────────────────────────────────── arguments ──

/**
 * Positional-value flag parsing, the dialect every driver already used:
 * `--name value` returns the value, a bare `--name` is a boolean.
 *
 * @param {string[]} [argv] defaults to process.argv.slice(2)
 * @returns {{raw: string[], flag: Function, has: Function, num: Function}}
 */
export function createArgs(argv = process.argv.slice(2)) {
  const flag = (name, fallback = null, { allowDashed = false } = {}) => {
    const i = argv.indexOf(`--${name}`);
    if (i < 0) return fallback;
    const next = argv[i + 1];
    if (!next) return fallback;
    if (!allowDashed && next.startsWith('--')) return fallback;
    return next;
  };
  const has = (name) => argv.includes(`--${name}`);
  const num = (name, fallback = null) => {
    const raw = flag(name);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
  };
  /** First flag name that carries a value, else the fallback. */
  const first = (names, fallback = null) => {
    for (const name of names) {
      const value = flag(name);
      if (value !== null) return value;
    }
    return fallback;
  };
  return { raw: argv, flag, has, num, first };
}

/** The process-wide argv, parsed once. */
export const args = createArgs();

/** Trailing slash stripped — every driver builds `${base}/games/<id>/` by hand. */
export function baseUrl(fallback = 'http://127.0.0.1:8000', { argv = args, envVar = 'QLOBE_BASE' } = {}) {
  const raw = argv.flag('base') || (envVar ? process.env[envVar] : null) || fallback;
  return String(raw).replace(/\/$/, '');
}

// ────────────────────────────────────────────────────────────── playwright ──

// tools-local/playwright/ is a sibling of the repo checkout (this file lives at
// <repo>/tools/qa/lib/driver.mjs), not inside it — the repo must never grow a
// node_modules. It's its own isolated npm project (its own package.json) so an
// `npm install` there can't walk upward and clobber an unrelated node_modules
// higher up the tree the way it would from a bare, package-json-less directory.
export const DEFAULT_PLAYWRIGHT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../tools-local/playwright/node_modules',
);

/**
 * Resolve the out-of-tree Playwright node_modules directory. Never reads the
 * repo — this repo has no package.json and must never grow one.
 */
export function playwrightDir({
  dir = null,
  argv = args,
  flags = ['playwright', 'pw-module'],
  envVars = ['PLAYWRIGHT_MODULE_PATH', 'PW_MODULE'],
  fallback = DEFAULT_PLAYWRIGHT_DIR,
  required = false,
} = {}) {
  const resolved = dir
    || argv.first(flags)
    || envVars.map((name) => process.env[name]).find(Boolean)
    || (required ? null : fallback);
  if (!resolved) {
    console.error(`need --${flags[0]} <node_modules dir holding playwright> (or $${envVars[0]})`);
    process.exit(2);
  }
  return resolved;
}

/**
 * @returns {{chromium: object, firefox: object, webkit: object, dir: string}}
 */
export function loadPlaywright(options = {}) {
  const dir = playwrightDir(options);
  const require = createRequire(path.join(dir, 'noop.js'));
  let pw;
  try {
    pw = require('playwright');
  } catch (error) {
    try {
      pw = require('playwright-core');
    } catch {
      console.error(`could not load playwright from ${dir}\n${error.message}`);
      process.exit(2);
    }
  }
  return { chromium: pw.chromium, firefox: pw.firefox, webkit: pw.webkit, dir };
}

/**
 * Launch real Chrome. `channel: 'chrome'` is the default and is load-bearing for
 * every m4a assertion in the platform (see the header note).
 * `--headed` on the command line flips headless off.
 */
export async function launchChrome({
  chromium = null,
  channel = 'chrome',
  headless = !args.has('headed'),
  playwright: pwOptions = {},
  ...launchOptions
} = {}) {
  const browserType = chromium || loadPlaywright(pwOptions).chromium;
  const options = { headless, ...launchOptions };
  if (channel) options.channel = channel;
  return browserType.launch(options);
}

// ─────────────────────────────────────────────────────────────── reporting ──

/**
 * Prefix pairs for the pass/fail line. Note these are the marks WITHOUT the
 * separator space — check() prints `${mark} ${name}`, so a mark must not carry
 * its own trailing space or the column shifts by one.
 *
 *   'ok'    ` ok ` / `FAIL`      — the majority of the fleet
 *   'pad'   `  ok  ` / `  FAIL`  — blend-train, sink-or-float, flashlight-cave,
 *                                 counting-treasure-cups, and (with
 *                                 detailOnFail) bug-hotel-observer
 *   'wide'  `  ok   ` / `  FAIL ` — world-music-dance's smoke suite
 *
 * The three differ only in column width; nothing else in the lib branches on
 * style. New drivers should take the default 'ok'.
 */
export const REPORT_STYLES = {
  ok: { pass: ' ok ', fail: 'FAIL' },
  pad: { pass: '  ok  ', fail: '  FAIL' },
  wide: { pass: '  ok   ', fail: '  FAIL ' },
};

/**
 * The tiny assertion recorder every driver ends with.
 *
 * @param {object}  [opts]
 * @param {string}  [opts.style='ok']        key of REPORT_STYLES; unknown throws
 *                                           rather than silently reformatting
 * @param {number}  [opts.detailLimit=0]     truncate detail text (0 = no limit)
 * @param {boolean} [opts.collapse=false]    collapse whitespace runs in detail
 * @param {boolean} [opts.detailOnFail=false] print detail only for failures
 * @param {Function}[opts.log=console.log]
 * @returns {{check: Function, note: Function, head: Function, results: Array,
 *            notes: string[], failures: Function, summary: Function, finish: Function}}
 */
export function createReporter({
  style = 'ok',
  detailLimit = 0,
  collapse = false,
  detailOnFail = false,
  log = console.log,
} = {}) {
  // Loud, not lenient: a typo'd style would silently shift every line's column
  // and only show up as an unexplained A/B diff.
  const marks = REPORT_STYLES[style];
  if (!marks) {
    throw new Error(`unknown report style ${JSON.stringify(style)} — expected one of ${Object.keys(REPORT_STYLES).join(', ')}`);
  }
  const results = [];
  const notes = [];

  const format = (detail) => {
    let text = detail === undefined || detail === null ? '' : String(detail);
    if (collapse) text = text.replace(/\s+/g, ' ');
    if (detailLimit > 0) text = text.slice(0, detailLimit);
    return text;
  };

  /** @returns {boolean} the truthiness of the condition, so callers can branch. */
  const check = (name, condition, detail = '') => {
    const ok = Boolean(condition);
    const text = format(detail);
    results.push({ name, ok, detail: text });
    const show = ok && detailOnFail ? '' : text;
    log(`${ok ? marks.pass : marks.fail} ${name}${show ? ` — ${show}` : ''}`);
    return ok;
  };

  const note = (line) => { notes.push(line); log(`  note  ${line}`); };
  const head = (title) => log(`\n=== ${title}`);
  const failures = () => results.filter((result) => !result.ok);

  /**
   * The `N/M checks passed` line. `suffix` appends e.g. `; shots in <dir>`.
   * @returns {number} the failure count.
   */
  const summary = ({ suffix = '', prefix = '\n', label = '' } = {}) => {
    const failed = failures();
    log(`${prefix}${label}${results.length - failed.length}/${results.length} checks passed${suffix}`);
    return failed.length;
  };

  /** summary() + the FAILED roll-call + a non-zero exit code. */
  const finish = ({ suffix = '', prefix = '\n', label = '', listFailures = true, exit = false } = {}) => {
    const failed = summary({ suffix, prefix, label });
    if (failed && listFailures) log(`FAILED: ${failures().map((result) => result.name).join(', ')}`);
    if (exit) process.exit(failed ? 1 : 0);
    process.exitCode = failed ? 1 : 0;
    return failed;
  };

  return { check, note, head, results, notes, failures, summary, finish };
}

// ──────────────────────────────────────────────────────────────── sessions ──

/**
 * A monitored page: one browser context, one page, and the three collectors the
 * whole platform asserts on afterwards.
 *
 *   errors  — pageerrors + console.error text
 *   failed  — requestfailed + any response >= 400
 *   remote  — any request that left the local base (a shipped game makes no
 *             model/service call, ever)
 *
 * @returns {Promise<{context, page, errors: string[], failed: string[],
 *                    remote: string[], diagnostics: string[], close: Function}>}
 */
export async function openSession(browser, {
  url,
  base = null,
  viewport = { width: 1180, height: 820 },
  reducedMotion = 'no-preference',
  deviceScaleFactor = 1,
  context: contextOptions = {},
  initScript = null,
  waitUntil = 'networkidle',
  goto = true,
  // capture switches
  captureConsole = true,
  captureRequestFailures = true,
  captureResponses = true,
  captureRemote = true,
  allowDataUrls = false,
  allowAbortedMedia = false,
  allowRemote = [],
  ignoreConsole = [],
  // QLOBE_DEBUG handshake
  ready = true,
  readyWhen = null,
  seed = null,
  fastTimers = null,
  mute = null,
  after = null,
} = {}) {
  const origin = (base || url || '').replace(/\/$/, '');
  const context = await browser.newContext({
    viewport, reducedMotion, deviceScaleFactor, ...contextOptions,
  });
  const page = await context.newPage();
  if (initScript) await page.addInitScript(initScript);

  const errors = [];
  const failed = [];
  const remote = [];
  const diagnostics = [];

  page.on('pageerror', (error) => errors.push(String(error)));
  if (captureConsole) {
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      if (ignoreConsole.some((needle) => text.includes(needle))) diagnostics.push(text);
      else errors.push(text);
    });
  }
  if (captureRemote) {
    page.on('request', (request) => {
      const requestUrl = request.url();
      if (origin && requestUrl.startsWith(origin)) return;
      if (allowDataUrls && requestUrl.startsWith('data:')) return;
      if (allowRemote.some((prefix) => requestUrl.startsWith(prefix))) return;
      remote.push(requestUrl);
    });
  }
  if (captureRequestFailures) {
    page.on('requestfailed', (request) => {
      const reason = request.failure()?.errorText || '';
      // Switching a spoken line intentionally aborts the previous media request.
      if (allowAbortedMedia && reason === 'net::ERR_ABORTED' && request.url().endsWith('.m4a')) return;
      failed.push(`${request.url()} ${reason}`);
    });
  }
  if (captureResponses) {
    page.on('response', (response) => {
      if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
    });
  }

  if (goto) await page.goto(url, { waitUntil });
  if (readyWhen) await page.waitForFunction(readyWhen);
  else if (ready) await page.evaluate(() => window.QLOBE_DEBUG.ready);

  if (seed !== null) await debug.seed(page, seed);
  if (fastTimers !== null) await debug.fastTimers(page, fastTimers);
  if (mute !== null) await debug.mute(page, mute);
  if (after) await after(page);

  const session = {
    context, page, errors, failed, remote, diagnostics,
    close: () => context.close(),
  };
  return session;
}

/** The three end-of-run hygiene checks, in the platform's usual wording. */
export function checkSessionClean(reporter, session, label = 'session') {
  reporter.check(`${label} has no page errors`, session.errors.length === 0, session.errors.join(' | '));
  reporter.check(`${label} has no failed requests or HTTP errors`, session.failed.length === 0, session.failed.join(' | '));
  reporter.check(`${label} makes no remote runtime requests`, session.remote.length === 0, session.remote.join(' | '));
}

// ───────────────────────────────────────────────────────────── QLOBE_DEBUG ──

/**
 * Thin wrappers over the `window.QLOBE_DEBUG` v1 contract. Each one is a single
 * page.evaluate, so `await` them individually — several engines reject a second
 * state-changing hook fired before the previous one resolves.
 *
 * `call()` is the escape hatch for a game's own extras (tracePoints(),
 * getRound(), placeCard(), clearSaved(), …) and for the handful of games whose
 * hook names diverge (setFastTimers vs fastTimers).
 */
export const debug = {
  /** Resolves the harness's own ready promise. */
  waitForReady: (page) => page.evaluate(() => window.QLOBE_DEBUG.ready),

  /** Waits for the hook to exist at all, for games that install it late. */
  waitForHook: (page, timeout = 15000) =>
    page.waitForFunction(() => Boolean(window.QLOBE_DEBUG), null, { timeout }),

  call: (page, method, ...params) =>
    page.evaluate(([name, values]) => window.QLOBE_DEBUG[name](...values), [method, params]),

  getState: (page) => page.evaluate(() => window.QLOBE_DEBUG.getState()),
  listModes: (page) => page.evaluate(() => window.QLOBE_DEBUG.listModes()),
  startMode: (page, id) => page.evaluate((value) => window.QLOBE_DEBUG.startMode(value), id),
  winRound: (page) => page.evaluate(() => window.QLOBE_DEBUG.winRound()),

  /** [{ id, role, rect: {x, y, w, h} }] — zero-size targets already filtered out. */
  getTargets: (page) => page.evaluate(() => window.QLOBE_DEBUG.getTargets()),
  /** Taps a target BY ID through the game's real input handler. */
  tap: (page, id) => page.evaluate((value) => window.QLOBE_DEBUG.tap(value), id),

  seed: (page, value) => page.evaluate((n) => window.QLOBE_DEBUG.seed(n), value),

  /** Accepts the platform's scale argument; falls back to the legacy setFastTimers name. */
  fastTimers: (page, value = undefined) => page.evaluate((v) => {
    const hook = window.QLOBE_DEBUG;
    const fn = hook.fastTimers || hook.setFastTimers;
    return v === undefined ? fn.call(hook) : fn.call(hook, v);
  }, value),

  mute: (page, value = undefined) => page.evaluate((v) => (
    v === undefined ? window.QLOBE_DEBUG.mute() : window.QLOBE_DEBUG.mute(v)
  ), value),

  /** Ring buffer of {key, text, kind: 'clip'|'speech', at}. */
  getAudioLog: (page) => page.evaluate(() => window.QLOBE_DEBUG.getAudioLog()),
  clearAudioLog: (page) => page.evaluate(() => window.QLOBE_DEBUG.clearAudioLog()),

  /** Waits until getState()[key] deep-equals `value` (JSON comparison). */
  waitForState: (page, key, value, options = {}) => page.waitForFunction(
    ([k, v]) => JSON.stringify(window.QLOBE_DEBUG.getState()[k]) === v,
    [key, JSON.stringify(value)],
    options,
  ),

  waitForScreen: (page, screen, options = {}) => page.waitForFunction(
    (name) => window.QLOBE_DEBUG.getState().screen === name, screen, options,
  ),

  waitForInput: (page, options = {}) => page.waitForFunction(
    () => window.QLOBE_DEBUG.getState().awaitingInput, null, options,
  ),

  /** Waits for an audio-log entry whose key (or blend-train's `ref`) matches. */
  waitForAudio: (page, key, options = {}) => page.waitForFunction(
    (needle) => window.QLOBE_DEBUG.getAudioLog().some((e) => (e.key ?? e.ref) === needle),
    key, options,
  ),
};

// ─────────────────────────────────────────────────────────── audio-log ──────

/**
 * Assertions over getAudioLog(). Entries are `{key, text, kind, at}` where
 *
 *   kind  'clip'   a real recorded .m4a decoded and played
 *         'speech' the Web Speech fallback — indistinguishable in a screenshot,
 *                  which is the whole reason these helpers exist
 *   at    MILLISECONDS SINCE PAGE LOAD (performance.now()), *not* a wall clock
 *         timestamp. Never compare it against Date.now() or a Node-side clock;
 *         only against other `at` values from the same page.
 *
 * A few games extend the entry with their own `ref` field; keyOf() reads either.
 */
export const audio = {
  keyOf: (entry) => entry?.key ?? entry?.ref ?? null,
  keys: (log) => log.map((entry) => audio.keyOf(entry)),
  clips: (log) => log.filter((entry) => entry.kind === 'clip'),
  speech: (log) => log.filter((entry) => entry.kind === 'speech'),

  /** Was `key` heard at all? */
  heard: (log, key) => log.some((entry) => audio.keyOf(entry) === key),
  /** Was `key` heard as a REAL recorded clip (not the speech fallback)? */
  heardClip: (log, key) => log.some((entry) => audio.keyOf(entry) === key && entry.kind === 'clip'),
  /** How many times `key` fired — the guard against a prompt speaking twice. */
  count: (log, key) => log.filter((entry) => audio.keyOf(entry) === key).length,

  /** Did these keys appear in this relative order (other entries may interleave)? */
  inOrder: (log, keys) => {
    let cursor = 0;
    for (const entry of log) {
      if (audio.keyOf(entry) === keys[cursor]) cursor += 1;
      if (cursor === keys.length) return true;
    }
    return keys.length === 0;
  },
  /** Same, and every one of them was a recorded clip. */
  clipsInOrder: (log, keys) => audio.inOrder(audio.clips(log), keys),

  /** Entries logged at or after `at` ms since page load. */
  since: (log, at) => log.filter((entry) => entry.at >= at),

  /** One-line summary for a check's detail column. */
  describe: (log) => log.map((entry) => `${entry.kind}:${audio.keyOf(entry)}`).join(' → '),
};

// ────────────────────────────────────────────────────────────── screenshots ──

/**
 * Screenshot directory convention: `qa-shots/<gameId>` under the repo root, or
 * whatever `--shots` / $QLOBE_SHOTS says. Some drivers deliberately default
 * OUTSIDE the repo so a run never leaves untracked PNGs in a worktree — pass
 * that path as `fallback`.
 */
export function resolveShots(fallback, { argv = args, envVar = 'QLOBE_SHOTS' } = {}) {
  return path.resolve(argv.flag('shots') || (envVar ? process.env[envVar] : null) || fallback);
}

export async function ensureShots(dir) {
  await mkdir(dir, { recursive: true });
  return dir;
}

/** `const shot = shooter(SHOTS); await shot(page, '01-splash');` */
export function shooter(dir) {
  return async (page, name, options = {}) => {
    const file = path.join(dir, name.endsWith('.png') ? name : `${name}.png`);
    await page.screenshot({ path: file, ...options });
    return file;
  };
}

// ────────────────────────────────────────────────────── pointer utilities ──

/**
 * The centre of a rect, in either spelling the platform uses: Playwright's
 * `boundingBox()` returns {x, y, width, height}; QLOBE_DEBUG.getTargets()
 * returns {x, y, w, h}. A bare {x, y} is already a point and passes through.
 */
export function centerOf(box) {
  const w = box.width ?? box.w;
  const h = box.height ?? box.h;
  if (w === undefined || h === undefined) return { x: box.x, y: box.y };
  return { x: box.x + w / 2, y: box.y + h / 2 };
}

/** A real pointer drag between two rects (either spelling) or {x, y} points. */
export async function dragBetween(page, from, to, { steps = 10, hold = null } = {}) {
  const center = centerOf;
  const start = center(from);
  const end = center(to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  if (hold) await hold({ start, end });
  await page.mouse.move(end.x, end.y, { steps });
  await page.mouse.up();
}

/** A real pointer stroke along a polyline — the trace/fold/beam gesture. */
export async function dragPath(page, points, { steps = 1 } = {}) {
  if (!points || points.length < 2) return;
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(point.x, point.y, { steps });
  await page.mouse.up();
}

/** Visible `[data-target]` rects — the ≥96px touch-target audit every game runs. */
export async function targetSizes(page, selector = '[data-target]') {
  return page.locator(selector).evaluateAll((nodes) => nodes
    .filter((node) => node.getClientRects().length
      && getComputedStyle(node).visibility !== 'hidden'
      && !node.disabled)
    .map((node) => {
      const rect = node.getBoundingClientRect();
      return { id: node.dataset.target, w: rect.width, h: rect.height };
    }));
}

/** Rects smaller than the platform's 96px minimum, for a check's detail column. */
export function undersized(rects, min = 96) {
  return rects.filter((rect) => {
    const w = rect.w ?? rect.width ?? rect.rect?.w;
    const h = rect.h ?? rect.height ?? rect.rect?.h;
    return !(w >= min && h >= min);
  });
}
