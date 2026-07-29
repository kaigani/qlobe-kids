#!/usr/bin/env node
// tools/qa/build-assemble-sweep.mjs
//
// Regression sweep for the WHOLE build-assemble engine family — the 14 old-shape
// sibling games (config.js, `export default { engine: 'build-assemble', ... }`,
// art refs as plain emoji:/text:/swatch:/shared: strings, voice values as plain
// strings) plus blend-train (config.json, the new art/voice shapes the engine
// change was built for). This net did not exist before the engine rewrite in
// this branch; every one of the 15 games depends on shared/js/engines/build-assemble.js
// and none of them had a live-browser end-to-end check.
//
// Discovery is NOT hardcoded: every games/<id>/ directory is scanned for a
// config.js and/or config.json declaring `engine: 'build-assemble'` (either
// object-literal or JSON quoting). Whatever that turns up is what gets swept —
// currently 15 (14 siblings + blend-train), but the sweep does not assume that
// number going in, only reports it.
//
// For each discovered game, in REAL Chrome (headless-shell cannot decode AAC,
// so recorded .m4a teacher-voice clips would silently fall back to Web Speech
// and every audio-adjacent assertion in this family would be worthless):
//   1. open games/<id>/, wait for window.QLOBE_DEBUG, await .ready
//   2. fastTimers(0.05), mute(), seed(7)
//   3. assert the splash rendered SOME art (cheap guard against a splashGlyph()
//      regression silently leaving emoji-only games with an empty splash card)
//   4. for every mode from listModes(): startMode(id), then loop winRound()
//      until getState().screen === 'end', guarding against a stall
//   5. assert zero console errors, zero pageerrors, zero responses >= 400
//      across the whole run (splash through every mode's end screen)
//
// Usage:
//   python3 -m http.server 8000                     # NOT this — 8000 is taken
//   node tools/qa/build-assemble-sweep.mjs --playwright /private/tmp/pw/node_modules
//
// The sweep serves the site itself (see --port / findFreePort below) unless
// --base is passed, so no server needs to be running first. Playwright 1.52 is
// loaded out-of-tree exactly the way the existing suites do (createRequire
// against a `noop.js` path that need not exist — only its directory matters —
// under a --playwright dir defaulting to $PLAYWRIGHT_MODULE_PATH). No npm
// install, no package.json: zero new dependencies, per the repo's platform rule.
//
// Only ONE WebGL context survives at a time in this environment. Games are
// swept strictly SEQUENTIALLY — each game gets its own context+page, closed
// before the next game's context is opened — never in parallel.
//
// Exit code is non-zero if any game fails.

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GAMES_DIR = path.join(ROOT, 'games');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const pwDir = flag('playwright', process.env.PLAYWRIGHT_MODULE_PATH);
if (!pwDir) {
  console.error('need --playwright <node_modules dir holding playwright@1.52.0> (or set PLAYWRIGHT_MODULE_PATH)');
  process.exit(2);
}
const require = createRequire(path.join(pwDir, 'noop.js'));
const { chromium } = require('playwright');

const BANNED_PORTS = new Set([8000, 8123]); // already in use by other processes — never touch these
const explicitBase = flag('base', null);
const onlyFilter = flag('only', null); // comma-separated game ids, for a fast rerun while debugging

// ---------------------------------------------------------------------------
// Discovery — no hardcoded game list. A game is "in" if config.js and/or
// config.json in its directory declares engine: 'build-assemble', in either
// JS-object-literal or JSON quoting.
// ---------------------------------------------------------------------------

function readIfExists(p) {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
}

const ENGINE_RE = /["']?engine["']?\s*:\s*["']build-assemble["']/;

function discoverBuildAssembleGames() {
  const ids = readdirSync(GAMES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const found = [];
  for (const id of ids) {
    const dir = path.join(GAMES_DIR, id);
    if (!statSync(path.join(dir, 'index.html'), { throwIfNoEntry: false })) continue;
    const text = readIfExists(path.join(dir, 'config.js')) + '\n' + readIfExists(path.join(dir, 'config.json'));
    if (ENGINE_RE.test(text)) found.push(id);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Static server (unless --base was given)
// ---------------------------------------------------------------------------

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
  let port = await findFreePort();
  if (BANNED_PORTS.has(port)) port = await findFreePort(); // vanishingly unlikely, but never touch 8000/8123
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

// ---------------------------------------------------------------------------
// In-page driver — injected once per page, calls only the QLOBE_DEBUG surface
// the engine already exposes. No engine-internal knowledge duplicated here.
// ---------------------------------------------------------------------------

const DRIVER = `
window.__qaSweep = {
  splashArtNonEmpty() {
    const el = document.querySelector('.qk-build-splash-art');
    if (!el || !el.firstElementChild) return false;
    const hasImg = !!el.querySelector('img[src]');
    const hasSwatch = !!el.querySelector('.qk-art-swatch');
    const hasText = (el.textContent || '').trim().length > 0;
    return hasImg || hasSwatch || hasText;
  },
  async playMode(modeId) {
    const D = window.QLOBE_DEBUG;
    const log = [];
    await D.startMode(modeId);
    let s = D.getState();
    if (s.screen === 'end') return { modeId, rounds: 0, stalled: false, state: s, log: ['0-round mode, finished immediately on startMode()'] };
    const maxRounds = (s.roundsTotal || 20) + 5; // generous guard, never trusted to loop forever
    let rounds = 0;
    while (true) {
      const waitStart = performance.now();
      while (s.screen === 'play' && !s.awaitingInput) {
        if (performance.now() - waitStart > 8000) {
          return { modeId, rounds, stalled: true, reason: 'timed out waiting for awaitingInput', state: s, log };
        }
        await new Promise((r) => setTimeout(r, 20));
        s = D.getState();
      }
      if (s.screen === 'end') return { modeId, rounds, stalled: false, state: s, log };
      if (s.screen !== 'play') {
        return { modeId, rounds, stalled: true, reason: 'unexpected screen "' + s.screen + '"', state: s, log };
      }
      if (rounds >= maxRounds) {
        return { modeId, rounds, stalled: true, reason: 'round guard (' + maxRounds + ') exceeded', state: s, log };
      }
      rounds += 1;
      log.push('round ' + (s.round + 1) + '/' + s.roundsTotal + ' build=' + s.build);
      try {
        await Promise.race([
          D.winRound(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('winRound() did not resolve within 10s')), 10000)),
        ]);
      } catch (err) {
        return { modeId, rounds, stalled: true, reason: String((err && err.message) || err), state: D.getState(), log };
      }
      s = D.getState();
    }
  },
};
`;

// ---------------------------------------------------------------------------
// Per-game run
// ---------------------------------------------------------------------------

async function runGame(browser, base, id) {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const badResponses = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('response', (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`); });

  const detail = {
    id, splashArtOk: null, modeList: [], modes: [], error: null,
    consoleErrors, pageErrors, badResponses,
  };

  try {
    const url = `${base}/games/${id}/`;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    } catch {
      await page.goto(url, { waitUntil: 'load', timeout: 45000 }); // networkidle can be slow/flaky; load already fired either way
    }
    await page.addScriptTag({ content: DRIVER });
    await page.waitForFunction(() => !!window.QLOBE_DEBUG, null, { timeout: 20000 });
    await page.evaluate(() => window.QLOBE_DEBUG.ready);

    await page.evaluate(() => {
      window.QLOBE_DEBUG.fastTimers(0.05);
      window.QLOBE_DEBUG.mute();
      window.QLOBE_DEBUG.seed(7);
    });

    detail.splashArtOk = await page.evaluate(() => window.__qaSweep.splashArtNonEmpty());

    const modes = await page.evaluate(() => window.QLOBE_DEBUG.listModes());
    detail.modeList = modes;

    for (const mode of modes) {
      const result = await page.evaluate((mid) => window.__qaSweep.playMode(mid), mode.id);
      detail.modes.push(result);
      if (result.stalled) break; // no point continuing this game once one mode is stuck
    }
  } catch (err) {
    detail.error = String((err && err.stack) || err);
  }

  await page.close();
  await ctx.close();
  return detail;
}

function gamePassed(detail, expectedModeCount) {
  if (detail.error) return false;
  if (detail.splashArtOk !== true) return false;
  if (detail.modes.length !== expectedModeCount) return false; // broke out early on a stall
  if (detail.modes.some((m) => m.stalled)) return false;
  if (detail.consoleErrors.length) return false;
  if (detail.pageErrors.length) return false;
  if (detail.badResponses.length) return false;
  return true;
}

function printGameResult(detail) {
  const expectedModeCount = detail.modeList.length;
  const ok = gamePassed(detail, expectedModeCount);
  if (ok) {
    const rounds = detail.modes.reduce((n, m) => n + m.rounds, 0);
    console.log(`  ok    ${detail.id.padEnd(24)} ${detail.modeList.length} mode(s), ${rounds} round(s), splash art ok`);
    return true;
  }

  console.log(`  FAIL  ${detail.id}`);
  if (detail.error) {
    console.log(`        driver error: ${detail.error}`);
  }
  if (detail.splashArtOk !== true) {
    console.log(`        splash art container empty (splashArtOk=${detail.splashArtOk})`);
  }
  for (const m of detail.modes) {
    if (m.stalled) {
      console.log(`        mode "${m.modeId}" stalled after ${m.rounds} round(s): ${m.reason}`);
      console.log(`        state at stall: ${JSON.stringify(m.state)}`);
      if (m.log.length) console.log(`        log: ${m.log.slice(-5).join(' | ')}`);
    }
  }
  if (detail.modes.length < expectedModeCount) {
    const missing = detail.modeList.slice(detail.modes.length).map((m) => m.id);
    console.log(`        never attempted: ${missing.join(', ')} (run aborted after earlier stall)`);
  }
  if (detail.consoleErrors.length) {
    console.log(`        console errors (${detail.consoleErrors.length}): ${detail.consoleErrors.slice(0, 5).join(' | ')}`);
  }
  if (detail.pageErrors.length) {
    console.log(`        pageerrors (${detail.pageErrors.length}): ${detail.pageErrors.slice(0, 5).join(' | ')}`);
  }
  if (detail.badResponses.length) {
    console.log(`        responses >= 400 (${detail.badResponses.length}): ${detail.badResponses.slice(0, 5).join(' | ')}`);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let gameIds = discoverBuildAssembleGames();
  console.log(`discovered ${gameIds.length} build-assemble game(s): ${gameIds.join(', ')}`);
  if (gameIds.length !== 15) {
    console.log(`  NOTE: expected 15 (14 siblings + blend-train) — found ${gameIds.length}. Continuing with what was discovered.`);
  }

  if (onlyFilter) {
    const wanted = new Set(onlyFilter.split(',').map((s) => s.trim()).filter(Boolean));
    gameIds = gameIds.filter((id) => wanted.has(id));
    console.log(`--only filter applied: running ${gameIds.length} — ${gameIds.join(', ')}`);
  }

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

  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  let passed = 0;
  const failedIds = [];
  try {
    // Strictly sequential: only one WebGL context survives at a time. Each
    // game's context+page is fully closed (inside runGame) before the next
    // game's context is opened.
    for (const id of gameIds) {
      const detail = await runGame(browser, base, id);
      const ok = printGameResult(detail);
      if (ok) passed += 1;
      else failedIds.push(id);
    }
  } finally {
    await browser.close();
    if (stopServer) stopServer();
  }

  console.log('');
  console.log(`${passed}/${gameIds.length} games passed`);
  if (failedIds.length) {
    console.log(`FAILED: ${failedIds.join(', ')}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
