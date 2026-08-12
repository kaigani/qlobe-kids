#!/usr/bin/env node
// Rhythm Copycat rebuild-3 QA drive. Real Chrome (AAC decoding is load-bearing).
// Usage: QLOBE_PLAYWRIGHT_REQUIRE=<.../node_modules/noop.js> node tools/qa.mjs
// Optional: QLOBE_BASE, QLOBE_SHOTS. Run under `caffeinate -dims`.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const DEFAULT_PW = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../tools-local/playwright/node_modules/noop.js',
);
const require = createRequire(process.env.QLOBE_PLAYWRIGHT_REQUIRE || DEFAULT_PW);
const { chromium } = require('playwright');
const base = (process.env.QLOBE_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');
const shots = path.resolve(process.env.QLOBE_SHOTS || '/private/tmp/rhythm-copycat-qa');
const checks = [];

function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  checks.push({ name, ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function openGame(browser, viewport, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport, reducedMotion, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = []; const failed = []; const remote = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(base) && !url.startsWith('data:') && !url.includes('googletagmanager.com') && !url.includes('google-analytics.com')) remote.push(url);
  });
  await page.goto(`${base}/games/rhythm-copycat/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  return { context, page, errors, failed, remote };
}

const shot = (page, name) => page.screenshot({ path: path.join(shots, name) });

async function main() {
  await mkdir(shots, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  // ── landscape main drive ────────────────────────────────────────────────
  const run = await openGame(browser, { width: 1180, height: 820 });
  const { page } = run;
  check('splash boots', (await page.evaluate(() => QLOBE_DEBUG.getState().screen)) === 'splash');
  check('debug v1 with three modes', await page.evaluate(() =>
    QLOBE_DEBUG.version === 1 && QLOBE_DEBUG.listModes().length === 3));
  check('generated title carries accessible name', (await page.locator('.rc-title').getAttribute('alt')) === 'Rhythm Copycat');
  check('all splash images decode', await page.evaluate(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0)));
  check('no svg/canvas primary art', await page.evaluate(() => !document.querySelector('#game svg, #game canvas')));
  check('splash home is the only catalog link', await page.evaluate(() => {
    const links = [...document.querySelectorAll('[data-screen] a')];
    return links.length === 1 && links[0].closest('[data-screen="splash"]') && links[0].getAttribute('href') === '../../';
  }));
  const splashTargets = await page.evaluate(() => QLOBE_DEBUG.getTargets());
  check('splash targets clear 96px', splashTargets.every(({ rect }) => rect.w >= 96 && rect.h >= 96));
  await shot(page, '01-splash-landscape.png');

  // first real gesture unlocks audio and speaks the recorded greeting
  await page.locator('[data-target="card-drum-beat"]').click();
  await page.waitForTimeout(2600);
  const log1 = await page.evaluate(() => QLOBE_DEBUG.getAudioLog());
  check('greeting + mode line are recorded clips, not synth', log1.voice.some((e) => e.kind === 'clip'),
    JSON.stringify(log1.voice.slice(0, 4)));
  await shot(page, '02-splash-selected.png');

  await page.evaluate(() => { QLOBE_DEBUG.seed(7); QLOBE_DEBUG.fastTimers(0.3); });
  await page.evaluate(() => QLOBE_DEBUG.startMode('drum-beat'));
  await page.waitForFunction(() => QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 20000 });
  const st1 = await page.evaluate(() => QLOBE_DEBUG.getState());
  check('demo ran and awaits copy input', st1.screen === 'play' && st1.phase === 'copy' && st1.pattern.length >= 2, JSON.stringify(st1.pattern));
  const playTargets = await page.evaluate(() => QLOBE_DEBUG.getTargets());
  const pads = playTargets.filter((t) => t.id.startsWith('pad-'));
  check('four pads present and clear 96px', pads.length === 4 && pads.every(({ rect }) => rect.w >= 96 && rect.h >= 96));
  check('pad roles truthful for current step', pads.filter((t) => t.role === 'correct').length === 1);
  await shot(page, '03-play-copy.png');

  // wrong-pad probe: gentle, no advance, nudge line spoken
  const wrong = pads.find((t) => t.role === 'wrong');
  const before = await page.evaluate(() => QLOBE_DEBUG.getState().stepIndex);
  const wrongResult = await page.evaluate((id) => QLOBE_DEBUG.tap(id), wrong.id);
  await page.waitForTimeout(1800);
  const afterWrong = await page.evaluate(() => QLOBE_DEBUG.getState());
  check('wrong pad is rejected without advancing', wrongResult?.accepted === false && afterWrong.stepIndex === before && afterWrong.missCount >= 1);
  const log2 = await page.evaluate(() => QLOBE_DEBUG.getAudioLog());
  check('wrong tap spoke oops/nudge', log2.voice.some((e) => e.key === 'oops' || String(e.key).startsWith('nudge-')),
    JSON.stringify(log2.voice.slice(-3)));
  await shot(page, '04-play-wrong.png');
  // second miss lights the hint
  await page.evaluate((id) => QLOBE_DEBUG.tap(id), wrong.id);
  await page.waitForTimeout(1600);
  check('second miss pulses the correct pad', await page.evaluate(() => !!document.querySelector('.rc-pad.is-hint')));
  await shot(page, '05-play-hint.png');

  // LISTEN replays the demo (fire without awaiting the full replay promise)
  await page.evaluate(() => { QLOBE_DEBUG.tap('listen'); });
  await page.waitForFunction(() => QLOBE_DEBUG.getState().phase === 'demo', null, { timeout: 5000 })
    .then(() => check('LISTEN replays the demo', true))
    .catch(() => check('LISTEN replays the demo', false));
  await page.waitForFunction(() => QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 20000 });

  // drive all four rounds through the real input path
  for (let round = 0; round < 4; round += 1) {
    await page.evaluate(() => QLOBE_DEBUG.winRound());
    await page.waitForFunction(() => {
      const s = QLOBE_DEBUG.getState();
      return s.screen === 'end' || (s.awaitingInput && !s.busy);
    }, null, { timeout: 30000 });
    if ((await page.evaluate(() => QLOBE_DEBUG.getState().screen)) === 'end') break;
  }
  const endState = await page.evaluate(() => QLOBE_DEBUG.getState());
  check('four rounds complete the set', endState.screen === 'end' && endState.progress['drum-beat'] === 4, JSON.stringify(endState.progress));
  await page.waitForTimeout(900);
  check('three stars pop in', (await page.evaluate(() => document.querySelectorAll('.rc-stars img.is-in').length)) === 3);
  await shot(page, '06-end.png');

  // navigation loop: end back → splash; play back → splash
  await page.evaluate(() => QLOBE_DEBUG.tap('back-end'));
  check('end back returns to splash', (await page.evaluate(() => QLOBE_DEBUG.getState().screen)) === 'splash');
  await page.evaluate(() => QLOBE_DEBUG.startMode('jingle-beat'));
  await page.waitForFunction(() => QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 20000 });
  await page.evaluate(() => QLOBE_DEBUG.tap('back-play'));
  check('play back returns to splash', (await page.evaluate(() => QLOBE_DEBUG.getState().screen)) === 'splash');
  check('splash card dots persist session progress', (await page.evaluate(() => document.querySelectorAll('[data-dots="drum-beat"] .rc-dot.is-filled').length)) === 4);
  await shot(page, '07-splash-progress.png');

  // parade mode exercises all four actions
  await page.evaluate(() => QLOBE_DEBUG.startMode('parade-beat'));
  await page.waitForFunction(() => QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 20000 });
  check('parade mode wakes all four pads', await page.evaluate(() => document.querySelectorAll('.rc-pad.is-resting').length === 0));
  check('mute silences and unmutes', await page.evaluate(() => { const a = QLOBE_DEBUG.mute(); const b = QLOBE_DEBUG.mute(); return a === true && b === false; }));

  check('no page errors', run.errors.length === 0, run.errors.join(' | '));
  check('no failed requests', run.failed.length === 0, run.failed.join(' | '));
  check('no unexpected remote requests', run.remote.length === 0, run.remote.join(' | '));
  await run.context.close();

  // ── portrait ────────────────────────────────────────────────────────────
  const portrait = await openGame(browser, { width: 820, height: 1180 });
  await portrait.page.evaluate(() => { QLOBE_DEBUG.seed(11); QLOBE_DEBUG.fastTimers(0.3); });
  await shot(portrait.page, '08-splash-portrait.png');
  await portrait.page.evaluate(() => QLOBE_DEBUG.startMode('parade-beat'));
  await portrait.page.waitForFunction(() => QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 20000 });
  const portraitPads = (await portrait.page.evaluate(() => QLOBE_DEBUG.getTargets())).filter((t) => t.id.startsWith('pad-'));
  check('portrait pads clear 96px', portraitPads.length === 4 && portraitPads.every(({ rect }) => rect.w >= 96 && rect.h >= 96));
  await shot(portrait.page, '09-play-portrait.png');
  check('portrait run clean', portrait.errors.length === 0 && portrait.failed.length === 0,
    [...portrait.errors, ...portrait.failed].join(' | '));
  await portrait.context.close();

  // ── reduced motion ──────────────────────────────────────────────────────
  const reduced = await openGame(browser, { width: 1180, height: 820 }, 'reduce');
  await reduced.page.evaluate(() => { QLOBE_DEBUG.seed(5); QLOBE_DEBUG.fastTimers(0.3); });
  await reduced.page.evaluate(() => QLOBE_DEBUG.startMode('drum-beat'));
  await reduced.page.waitForFunction(() => QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 20000 });
  for (let round = 0; round < 4; round += 1) {
    await reduced.page.evaluate(() => QLOBE_DEBUG.winRound());
    await reduced.page.waitForFunction(() => {
      const s = QLOBE_DEBUG.getState();
      return s.screen === 'end' || (s.awaitingInput && !s.busy);
    }, null, { timeout: 30000 });
    if ((await reduced.page.evaluate(() => QLOBE_DEBUG.getState().screen)) === 'end') break;
  }
  check('reduced-motion run reaches the end', (await reduced.page.evaluate(() => QLOBE_DEBUG.getState().screen)) === 'end');
  await shot(reduced.page, '10-end-reduced-motion.png');
  check('reduced-motion run clean', reduced.errors.length === 0 && reduced.failed.length === 0,
    [...reduced.errors, ...reduced.failed].join(' | '));
  await reduced.context.close();

  await browser.close();
  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed; shots in ${shots}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
