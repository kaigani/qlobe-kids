#!/usr/bin/env node

import {
  audio,
  baseUrl,
  checkSessionClean,
  createReporter,
  debug,
  dragBetween,
  ensureShots,
  launchChrome,
  openSession,
  resolveShots,
  shooter,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const url = `${base}/games/smell-jars/`;
const shots = resolveShots('qa-shots/smell-jars');
await ensureShots(shots);
const shot = shooter(shots);
const reporter = createReporter({ detailLimit: 800, collapse: true });
const { check, finish } = reporter;
const sessions = [];

async function open(browser, label, viewport, reducedMotion = 'no-preference', fastTimers = 20) {
  const session = await openSession(browser, {
    url,
    base,
    viewport,
    reducedMotion,
    seed: 42,
    fastTimers,
    allowAbortedMedia: true,
    allowRemote: [
      'https://www.googletagmanager.com/',
      'https://www.google-analytics.com/',
    ],
  });
  session.label = label;
  sessions.push(session);
  return session;
}

async function state(page) {
  return debug.getState(page);
}

async function waitForPhase(page, phase, timeout = 5000) {
  await page.waitForFunction(
    (expected) => window.QLOBE_DEBUG.getState().phase === expected,
    phase,
    { timeout },
  );
}

async function settledShot(page, name, delay = 900) {
  await page.waitForTimeout(delay);
  await shot(page, name);
}

async function checkLayout(page, label) {
  const result = await page.evaluate(() => {
    const active = document.querySelector('[data-qk-screen]:not([hidden])');
    const rect = active?.getBoundingClientRect();
    return {
      viewport: [innerWidth, innerHeight],
      scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      offset: [scrollX, scrollY],
      active: rect ? { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom } : null,
      failures: window.QLOBE_DEBUG.getArtFailures(),
    };
  });
  check(`${label} has no page overflow`,
    result.scroll[0] <= result.viewport[0] + 1 && result.scroll[1] <= result.viewport[1] + 1
      && Math.abs(result.offset[0]) <= 1 && Math.abs(result.offset[1]) <= 1,
    JSON.stringify(result));
  check(`${label} active screen fills viewport`,
    result.active && result.active.x >= -1 && result.active.y >= -1
      && result.active.right <= result.viewport[0] + 1
      && result.active.bottom <= result.viewport[1] + 1,
    JSON.stringify(result.active));
  check(`${label} has no art failures`, result.failures.length === 0, result.failures.join(' | '));
}

async function checkPrimaryTargets(page, label) {
  const targets = await debug.getTargets(page);
  const primary = targets.filter((target) => (
    target.id.startsWith('mystery-')
    || target.id.startsWith('token-')
    || ['lid', 'jar-label', 'next', 'again'].includes(target.id)
  ));
  const small = primary.filter((target) => target.rect.w < 95.5 || target.rect.h < 95.5);
  check(`${label} primary targets meet 96px floor`, primary.length > 0 && small.length === 0,
    JSON.stringify(small));
  const viewport = page.viewportSize();
  const clipped = primary.filter((target) => (
    target.rect.x < -0.5
    || target.rect.y < -0.5
    || target.rect.x + target.rect.w > viewport.width + 0.5
    || target.rect.y + target.rect.h > viewport.height + 0.5
  ));
  check(`${label} primary targets are fully visible`, clipped.length === 0,
    JSON.stringify(clipped));
}

async function startWithGesture(page, modeId) {
  await page.locator(`[data-target="mode-${modeId}"]`).click();
  await waitForPhase(page, 'select');
}

async function driveFourRounds(page, modeId, prefix, { wrongProbe = true } = {}) {
  const started = await state(page);
  if (started.modeId !== modeId || started.phase !== 'select') {
    await debug.startMode(page, modeId);
    await waitForPhase(page, 'select');
  }
  check(`${modeId} starts at selection`, (await state(page)).phase === 'select');

  for (let round = 0; round < 4; round += 1) {
    const before = await state(page);
    check(`${prefix} round ${round + 1} offers three jars`, before.selectionIds.length === 3,
      JSON.stringify(before.selectionIds));
    if (round === 0) {
      await checkPrimaryTargets(page, `${prefix} selection`);
      await checkLayout(page, `${prefix} selection`);
      await shot(page, `${prefix}-01-select`);
    }

    await debug.tap(page, 'mystery-1');
    await waitForPhase(page, 'closed');
    check(`${prefix} round ${round + 1} closes chosen jar`, (await state(page)).currentId !== null);
    if (round === 0) await shot(page, `${prefix}-02-closed`);

    await debug.call(page, 'openJar');
    await waitForPhase(page, 'match');
    const matching = await state(page);
    check(`${prefix} round ${round + 1} shows expected choices`,
      matching.choiceIds.length === (modeId === 'nose-memory' ? 4 : 3),
      JSON.stringify(matching.choiceIds));
    if (round === 0) {
      await checkPrimaryTargets(page, `${prefix} match`);
      await checkLayout(page, `${prefix} match`);
      await settledShot(page, `${prefix}-03-match`);
    }

    if (wrongProbe && round === 0) {
      const wrong = matching.choiceIds.find((id) => id !== matching.currentId);
      const targets = await debug.getTargets(page);
      const from = targets.find((target) => target.id === `token-${wrong}`)?.rect;
      const to = targets.find((target) => target.id === 'jar-label')?.rect;
      await dragBetween(page, from, to, { steps: 12 });
      await page.waitForFunction(() => window.QLOBE_DEBUG.getState().misses === 1);
      const afterWrong = await state(page);
      check(`${prefix} wrong answer stays gentle`, afterWrong.phase === 'match' && afterWrong.misses === 1,
        JSON.stringify(afterWrong));
      await shot(page, `${prefix}-04-wrong`);
    }

    const current = (await state(page)).currentId;
    await debug.call(page, 'chooseScent', current);
    await waitForPhase(page, 'success');
    check(`${prefix} round ${round + 1} succeeds`, (await state(page)).completed.length === round + 1);
    if (round === 0) {
      await checkPrimaryTargets(page, `${prefix} success`);
      await checkLayout(page, `${prefix} success`);
      await settledShot(page, `${prefix}-05-success`, 1000);
    }

    await debug.call(page, 'next');
    if (round < 3) await waitForPhase(page, 'select');
    else await debug.waitForScreen(page, 'end');
  }

  const ended = await state(page);
  check(`${modeId} reaches shelf ending`, ended.screen === 'end' && ended.completed.length === 4,
    JSON.stringify(ended));
  await checkPrimaryTargets(page, `${prefix} ending`);
  await settledShot(page, `${prefix}-06-end`, 1100);
}

async function memoryRevealProbe(page) {
  await startWithGesture(page, 'nose-memory');
  await debug.fastTimers(page, 1);
  await debug.tap(page, 'mystery-1');
  await waitForPhase(page, 'closed');
  await page.evaluate(() => { void window.QLOBE_DEBUG.openJar(); });
  await waitForPhase(page, 'scent', 2500);
  check('reduced-motion memory reveal has visible plume',
    await page.locator('.scent-plume').isVisible());
  await shot(page, 'reduced-02-memory-reveal');
  await waitForPhase(page, 'match', 2500);
  const faded = await page.locator('.scent-plume').evaluate((node) => node.classList.contains('is-memory-faded'));
  check('memory clue fades before four choices', faded && (await state(page)).choiceIds.length === 4);
  await shot(page, 'reduced-03-memory-match');
}

async function main() {
  const browser = await launchChrome();
  try {
    const landscape = await open(browser, 'landscape', { width: 1180, height: 820 });
    const landscapePage = landscape.page;
    check('splash boots', (await state(landscapePage)).screen === 'splash');
    await checkLayout(landscapePage, 'landscape splash');
    await shot(landscapePage, 'landscape-00-splash');
    await startWithGesture(landscapePage, 'smell-match');
    await driveFourRounds(landscapePage, 'smell-match', 'landscape-match');
    const log = await debug.getAudioLog(landscapePage);
    check('recorded teacher clips are requested', audio.heardClip(log, 'mode-smell-match')
      && log.some((entry) => entry.kind === 'clip'), audio.describe(log));
    await checkLayout(landscapePage, 'landscape ending');

    const portrait = await open(browser, 'portrait', { width: 820, height: 1180 });
    await shot(portrait.page, 'portrait-00-splash');
    await startWithGesture(portrait.page, 'nose-memory');
    await driveFourRounds(portrait.page, 'nose-memory', 'portrait-memory');
    await checkLayout(portrait.page, 'portrait ending');

    const reduced = await open(browser, 'reduced landscape', { width: 1180, height: 820 }, 'reduce', 1);
    await shot(reduced.page, 'reduced-00-splash');
    await memoryRevealProbe(reduced.page);
    await checkPrimaryTargets(reduced.page, 'reduced-memory match');
    await checkLayout(reduced.page, 'reduced-memory match');

    for (const session of sessions) {
      session.failed = session.failed.filter((entry) => !entry.startsWith('https://www.google-analytics.com/'));
      checkSessionClean(reporter, session, session.label);
    }
  } finally {
    for (const session of sessions) await session.close();
    await browser.close();
  }
  finish({ suffix: `; shots in ${shots}` });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
