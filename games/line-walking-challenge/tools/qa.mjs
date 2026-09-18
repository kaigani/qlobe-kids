#!/usr/bin/env node

import {
  baseUrl,
  checkSessionClean,
  createReporter,
  debug,
  ensureShots,
  launchChrome,
  openSession,
  resolveShots,
  shooter,
} from '../../../tools/qa/lib/driver.mjs';

const base = (process.argv[2] || baseUrl()).replace(/\/$/, '');
const shots = resolveShots('artifacts/qa/line-walking-challenge');
const shot = shooter(shots);
const reporter = createReporter({ detailOnFail: true });
const { check, finish } = reporter;
const analyticsPrefixes = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
];

function withoutPlatformAnalytics(url) {
  return !analyticsPrefixes.some((prefix) => url.startsWith(prefix));
}

function checkClean(session, label) {
  checkSessionClean(reporter, {
    ...session,
    failed: session.failed.filter(withoutPlatformAnalytics),
    remote: session.remote.filter(withoutPlatformAnalytics),
  }, label);
}

async function openGame(browser, viewport, reducedMotion = 'no-preference') {
  const session = await openSession(browser, {
    url: `${base}/games/line-walking-challenge/`,
    base,
    viewport,
    reducedMotion,
    seed: 42,
    fastTimers: .05,
    mute: true,
    allowAbortedMedia: true,
  });
  await session.page.waitForFunction(() => [...document.images].every((image) => image.complete));
  return session;
}

async function checkVisualBasics(page, label) {
  const state = await debug.getState(page);
  const debugVersion = await page.evaluate(() => window.QLOBE_DEBUG?.version);
  check(`${label}: debug v1`, debugVersion === 1, String(debugVersion));
  check(`${label}: all authored art loaded`, state.artFailures?.length === 0, JSON.stringify(state.artFailures));
  check(`${label}: no page overflow`, await page.evaluate(() => (
    document.documentElement.scrollWidth <= innerWidth
      && document.documentElement.scrollHeight <= innerHeight
  )));
  const liveRegions = await page.locator('[aria-live]').count();
  check(`${label}: exactly one live region`, liveRegions === 1, String(liveRegions));
  const undersized = await page.evaluate(() => [...document.querySelectorAll('[data-target]')]
    .map((node) => {
      const box = node.getBoundingClientRect();
      return { id: node.dataset.target, width: box.width, height: box.height };
    })
    .filter((target) => target.width > 0 && target.height > 0)
    .filter((target) => target.width < 96 || target.height < 96));
  check(`${label}: visible targets are at least 96px`, undersized.length === 0, JSON.stringify(undersized));
}

async function runTrail(page, id, number) {
  await debug.startMode(page, id);
  await page.waitForFunction(() => document.querySelector('#stage-art')?.complete);
  let state = await debug.getState(page);
  check(`${id}: starts in play`, state.screen === 'play' && state.mode === id, JSON.stringify(state));

  const before = {
    checkpoint: state.checkpoint,
    progress: state.progress,
    misses: state.misses,
  };
  await debug.call(page, 'probeOffPath');
  state = await debug.getState(page);
  check(
    `${id}: off-path pauses without regression`,
    state.misses > before.misses
      && state.checkpoint === before.checkpoint
      && state.progress === before.progress,
    JSON.stringify(state),
  );

  await debug.call(page, 'traceFraction', .52);
  state = await debug.getState(page);
  check(`${id}: midpoint remains playable`, state.screen === 'play' && state.checkpoint >= 2, JSON.stringify(state));
  await page.waitForTimeout(180);
  await shot(page, `${String(number).padStart(2, '0')}-${id}-mid-play`);

  await debug.winRound(page);
  state = await debug.getState(page);
  check(
    `${id}: all five flowers complete`,
    state.screen === 'complete' && state.checkpoint === 5 && state.progress === 1,
    JSON.stringify(state),
  );
  await page.waitForTimeout(260);
  await shot(page, `${String(number + 1).padStart(2, '0')}-${id}-complete`);
  return state;
}

async function runLandscape(browser) {
  const session = await openGame(browser, { width: 1366, height: 1024 });
  const { page } = session;
  let state = await debug.getState(page);
  const modes = await debug.listModes(page);
  check('landscape: select and three modes', state.screen === 'select' && modes.length === 3, JSON.stringify({ state, modes }));
  await checkVisualBasics(page, 'landscape select');
  await shot(page, '01-select-landscape');

  await runTrail(page, 'forest', 2);
  await debug.tap(page, 'next');
  state = await debug.getState(page);
  check('Next Trail enters river', state.screen === 'play' && state.mode === 'river', JSON.stringify(state));

  await runTrail(page, 'river', 4);
  await runTrail(page, 'rainbow', 6);
  state = await debug.getState(page);
  check('landscape: all modes completed', state.completed?.length === 3, JSON.stringify(state));

  await debug.call(page, 'home');
  state = await debug.getState(page);
  const badges = await page.locator('.mode-badge:not([hidden])').count();
  check('landscape: three completion badges visible', state.screen === 'select' && badges === 3, JSON.stringify({ state, badges }));
  await shot(page, '08-all-badges-landscape');

  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  await debug.mute(page, true);
  state = await debug.getState(page);
  const restoredBadges = await page.locator('.mode-badge:not([hidden])').count();
  check(
    'landscape: completion persists after reload',
    state.completed?.length === 3 && restoredBadges === 3,
    JSON.stringify({ state, restoredBadges }),
  );
  checkClean(session, 'landscape');
}

async function runPortrait(browser) {
  const session = await openGame(browser, { width: 820, height: 1180 });
  const { page } = session;
  check('portrait: select screen', (await debug.getState(page)).screen === 'select');
  await checkVisualBasics(page, 'portrait select');
  await shot(page, '09-select-portrait');

  await debug.startMode(page, 'forest');
  await debug.call(page, 'traceFraction', .52);
  await page.waitForTimeout(180);
  await shot(page, '10-forest-mid-play-portrait');
  let state = await debug.getState(page);
  check('portrait: midpoint remains play', state.screen === 'play' && state.checkpoint >= 2, JSON.stringify(state));

  await debug.winRound(page);
  await page.waitForTimeout(260);
  state = await debug.getState(page);
  check('portrait: completion screen', state.screen === 'complete' && state.checkpoint === 5, JSON.stringify(state));
  await shot(page, '11-forest-complete-portrait');

  await debug.startMode(page, 'river');
  await debug.call(page, 'traceFraction', .52);
  await page.waitForTimeout(180);
  check('portrait: river midpoint remains play', (await debug.getState(page)).screen === 'play');
  await shot(page, '12-river-mid-play-portrait');

  await debug.startMode(page, 'rainbow');
  await debug.call(page, 'traceFraction', .52);
  await page.waitForTimeout(180);
  check('portrait: rainbow midpoint remains play', (await debug.getState(page)).screen === 'play');
  await shot(page, '13-rainbow-mid-play-portrait');
  checkClean(session, 'portrait');
}

async function runReducedMotion(browser) {
  const session = await openGame(browser, { width: 1366, height: 1024 }, 'reduce');
  const reduced = await session.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  check('reduced motion: boots to select', reduced && (await debug.getState(session.page)).screen === 'select');
  await debug.startMode(session.page, 'rainbow');
  await debug.winRound(session.page);
  check('reduced motion: trail completes', (await debug.getState(session.page)).screen === 'complete');
  checkClean(session, 'reduced-motion');
}

async function runNarrowKeyboard(browser) {
  const session = await openGame(browser, { width: 320, height: 568 });
  const { page } = session;
  check('narrow: select screen', (await debug.getState(page)).screen === 'select');
  await checkVisualBasics(page, 'narrow select');
  const clippedCards = await page.evaluate(() => [...document.querySelectorAll('.mode-card')]
    .map((card) => card.getBoundingClientRect())
    .filter((box) => box.left < 0 || box.right > innerWidth));
  check('narrow: all trail cards fit the viewport', clippedCards.length === 0, JSON.stringify(clippedCards));
  await shot(page, '14-narrow-select');

  await debug.startMode(page, 'forest');
  await page.locator('#trail-canvas').focus();
  for (let step = 0; step < 5; step += 1) await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'complete');
  const state = await debug.getState(page);
  check(
    'keyboard: five careful steps complete the trail',
    state.screen === 'complete' && state.checkpoint === 5 && state.progress === 1,
    JSON.stringify(state),
  );
  checkClean(session, 'narrow-keyboard');
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome();
  try {
    await runLandscape(browser);
    await runPortrait(browser);
    await runNarrowKeyboard(browser);
    await runReducedMotion(browser);
  } finally {
    await browser.close();
    finish();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
