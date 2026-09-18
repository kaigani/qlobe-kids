#!/usr/bin/env node
// Balance Beam Trail: real-Chrome smoke and visual-QC driver.

import {
  baseUrl, checkSessionClean, createReporter, debug, ensureShots,
  launchChrome, openSession, resolveShots, shooter,
} from '../../../tools/qa/lib/driver.mjs';

const positionalBase = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const base = (positionalBase || baseUrl()).replace(/\/$/, '');
const shots = resolveShots('artifacts/qa/balance-beam-trail');
const shot = shooter(shots);
const reporter = createReporter({ detailOnFail: true });
const { check, finish } = reporter;
const sessions = [];
const PLATFORM_ANALYTICS = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
];

function checkClean(session, label) {
  checkSessionClean({ check }, {
    ...session,
    failed: session.failed.filter((url) => !PLATFORM_ANALYTICS.some((prefix) => url.startsWith(prefix))),
    remote: session.remote.filter((url) => !PLATFORM_ANALYTICS.some((prefix) => url.startsWith(prefix))),
  }, label);
}

async function openGame(browser, viewport, reducedMotion = 'no-preference') {
  const session = await openSession(browser, {
    url: `${base}/games/balance-beam-trail/`, base, viewport, reducedMotion,
    seed: 42, fastTimers: 0.05, mute: true, allowAbortedMedia: true,
  });
  sessions.push(session);
  await session.page.waitForFunction(() => [...document.images].every((image) => image.complete));
  return session;
}

async function advance(page, mode, values) {
  await debug.startMode(page, mode);
  for (const value of values) {
    if (mode === 'hop') await debug.tap(page, `hop-${value}`);
    else {
      await debug.call(page, 'setBalance', value);
      await debug.call(page, 'advanceCheckpoint');
    }
  }
}

async function drive(browser) {
  const session = await openGame(browser, { width: 1366, height: 1024 });
  const { page } = session;
  let state = await debug.getState(page);
  check('ready and select screen', state.screen === 'select' && (await debug.listModes(page)).length === 3, JSON.stringify(state));
  check('three authored mode cards and title are visible', await page.locator('[data-mode]').count() === 3 && await page.locator('img[alt*="Balance Beam"]').count() > 0);
  await shot(page, '01-select-landscape');

  await debug.startMode(page, 'log');
  await debug.call(page, 'setBalance', 1, 1200);
  await page.waitForTimeout(650);
  state = await debug.getState(page);
  check('off-target balance hold does not advance', state.checkpoint === 0, JSON.stringify(state));
  await debug.call(page, 'setBalance', 0, 1500);
  await page.waitForFunction(() => QLOBE_DEBUG.getState().checkpoint >= 1, null, { timeout: 2500 });
  await debug.call(page, 'advanceCheckpoint');
  await debug.call(page, 'setBalance', 0, 800);
  state = await debug.getState(page);
  check('centered hold advances through the live mechanic', state.screen === 'play' && state.mode === 'log' && state.checkpoint === 2, JSON.stringify(state));
  await page.waitForTimeout(480);
  await shot(page, '02-log-play');

  await debug.call(page, 'resetProgress');
  await debug.startMode(page, 'lava');
  for (const value of [-0.45, 0.38, -0.28, 0.48]) {
    await debug.call(page, 'setBalance', value);
    await debug.call(page, 'advanceCheckpoint');
  }
  state = await debug.getState(page);
  check('lava follows its offset target sequence', state.screen === 'play' && state.mode === 'lava' && state.checkpoint === 4 && state.target === 0, JSON.stringify(state));
  await page.waitForTimeout(480);
  await shot(page, '03-lava-play');

  await debug.call(page, 'resetProgress');
  await debug.startMode(page, 'hop');
  const beforeWrong = await debug.getState(page);
  const wrongAccepted = await debug.tap(page, 'hop-4');
  const afterWrong = await debug.getState(page);
  check('hop wrong-input probe is gentle and does not advance', wrongAccepted === true && afterWrong.checkpoint === beforeWrong.checkpoint && afterWrong.misses === 1, JSON.stringify(afterWrong));
  for (const value of [0, 1, 2]) await debug.tap(page, `hop-${value}`);
  state = await debug.getState(page);
  check('hop sequence advances only in order', state.screen === 'play' && state.mode === 'hop' && state.checkpoint === 3, JSON.stringify(state));
  await page.waitForTimeout(480);
  await shot(page, '04-hop-play');

  // Exercise the whole reward/next loop independently of checkpoint timing.
  await debug.call(page, 'resetProgress');
  await debug.startMode(page, 'log');
  await debug.winRound(page);
  await debug.tap(page, 'next');
  await page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'play' && QLOBE_DEBUG.getState().mode === 'lava');
  await debug.winRound(page);
  await debug.tap(page, 'next');
  await page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'play' && QLOBE_DEBUG.getState().mode === 'hop');
  await debug.winRound(page);
  state = await debug.getState(page);
  check('all three trails reach the all-complete reward', state.screen === 'complete' && state.allDone === true && state.completed.length === 3, JSON.stringify(state));
  await page.waitForTimeout(700);
  await shot(page, '05-completion');
  check('next/back navigation targets exist', (await debug.getTargets(page)).some(({ id }) => /next|back|home/i.test(id)));
  await debug.call(page, 'mute', false);
  check('mute hook is reversible', (await debug.getState(page)).muted === false, JSON.stringify(await debug.getState(page)));
  checkClean(session, 'landscape');

  const portrait = await openGame(browser, { width: 820, height: 1180 });
  check('portrait select boots without overflow', await portrait.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight));
  await shot(portrait.page, '06-select-portrait');
  await debug.startMode(portrait.page, 'log');
  await debug.call(portrait.page, 'advanceCheckpoint');
  await shot(portrait.page, '07-log-portrait');
  checkClean(portrait, 'portrait');

  const reduced = await openGame(browser, { width: 1366, height: 1024 }, 'reduce');
  check('reduced-motion select boots', (await debug.getState(reduced.page)).screen === 'select');
  checkClean(reduced, 'reduced-motion');
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome();
  try { await drive(browser); }
  finally { await browser.close(); finish(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
