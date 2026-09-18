#!/usr/bin/env node
// Real-Chrome interaction, audio, responsive, and visual smoke QA.
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
  targetSizes,
  undersized,
} from '../../../tools/qa/lib/driver.mjs';

const BASE = baseUrl('http://127.0.0.1:8765');
const GAME_URL = `${BASE}/games/turn-taking-tower/`;
const SHOTS = resolveShots('games/turn-taking-tower/qa-shots');
const ANALYTICS = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];
const { check, finish, note } = createReporter({ collapse: true, detailLimit: 280 });

function isAnalytics(entry) {
  return ANALYTICS.some((prefix) => entry.includes(new URL(prefix).hostname));
}

function checkClean(session, label) {
  checkSessionClean({ check }, {
    ...session,
    failed: session.failed.filter((entry) => !isAnalytics(entry)),
    remote: session.remote.filter((entry) => !isAnalytics(entry)),
  }, label);
}

function open(browser, viewport, { reducedMotion = 'no-preference', fastTimers = 20, mute = true, context = {} } = {}) {
  return openSession(browser, {
    url: GAME_URL,
    base: BASE,
    viewport,
    reducedMotion,
    context,
    seed: 42,
    fastTimers,
    mute,
    allowAbortedMedia: true,
    allowRemote: ANALYTICS,
    waitUntil: 'networkidle',
  });
}

async function waitForTurn(page, placement, phase = 'human') {
  await page.waitForFunction(
    ([n, p]) => {
      const state = window.QLOBE_DEBUG.getState();
      return state.placement === n && state.phase === p;
    },
    [placement, phase],
    { timeout: 10000 },
  );
}

async function decodedImages(page) {
  return page.locator('img').evaluateAll((images) => images.map((image) => ({
    src: image.getAttribute('src'),
    complete: image.complete,
    width: image.naturalWidth,
    height: image.naturalHeight,
  })));
}

async function clippedTargets(page) {
  return page.evaluate(() => {
    const { innerWidth, innerHeight } = window;
    return window.QLOBE_DEBUG.getTargets()
      .filter(({ rect }) => rect.x < 0 || rect.y < 0 || rect.x + rect.w > innerWidth || rect.y + rect.h > innerHeight)
      .map(({ id, rect }) => ({ id, ...rect }));
  });
}

async function main() {
  await ensureShots(SHOTS);
  const browser = await launchChrome({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const shot = shooter(SHOTS);
  const landscape = { width: 1280, height: 800 };
  let session;

  try {
    session = await open(browser, landscape, { fastTimers: 1 });
    const { page } = session;
    const modes = await debug.listModes(page);
    check('debug harness exposes both approved play modes', JSON.stringify(modes.map(({ id }) => id)) === JSON.stringify(['buddy', 'two-builders']), JSON.stringify(modes));
    check('initial screen is the playable setup', (await debug.getState(page)).screen === 'splash');
    const images = await decodedImages(page);
    check('every runtime image decodes', images.length >= 15 && images.every(({ complete, width, height }) => complete && width > 0 && height > 0), JSON.stringify(images.filter(({ width, height }) => !width || !height)));
    check('setup touch targets meet the 96px minimum', undersized(await targetSizes(page)).length === 0, JSON.stringify(undersized(await targetSizes(page))));
    await shot(page, '01-setup-landscape.png');

    await debug.startMode(page, 'buddy');
    await waitForTurn(page, 0);
    const startState = await debug.getState(page);
    check('Buddy Build begins with the child and an empty shared tower', startState.turn === 1 && startState.placed.length === 0, JSON.stringify(startState));
    check('play touch targets meet the 96px minimum', undersized(await targetSizes(page)).length === 0, JSON.stringify(undersized(await targetSizes(page))));
    const dropSlot = await page.locator('.tower-target').boundingBox();
    check('visible drag destination meets the 96px minimum', dropSlot?.width >= 96 && dropSlot?.height >= 96, JSON.stringify(dropSlot));
    await shot(page, '02-buddy-child-turn.png');

    const wrong = await page.locator('.block-choice:not(.is-correct)').first().getAttribute('data-piece');
    const rejected = await debug.call(page, 'attempt', wrong, true);
    check('a future block is gently rejected without advancing', rejected === false && (await debug.getState(page)).placement === 0);

    const source = await page.locator('.block-choice.is-correct').boundingBox();
    const target = await page.locator('.tower-target').boundingBox();
    await dragBetween(page, source, target, { steps: 14 });
    await waitForTurn(page, 1, 'ai');
    check('a real pointer drag places exactly one child block', (await debug.getState(page)).placed.length === 1);
    const waitingAsset = (await debug.getState(page)).current.asset;
    const waitRejected = await debug.call(page, 'attempt', waitingAsset, true);
    check('input is locked during Pip’s turn', waitRejected === false && (await debug.getState(page)).placement === 1);
    await page.waitForTimeout(260);
    await shot(page, '03-buddy-watch-and-wait.png');
    await waitForTurn(page, 2);
    const afterPip = await debug.getState(page);
    check('Pip automatically takes one turn then returns control', afterPip.turn === 1 && afterPip.placed.map(({ owner }) => owner).join(',') === '1,2', JSON.stringify(afterPip));

    while ((await debug.getState(page)).placement < 5) {
      const before = (await debug.getState(page)).placement;
      await page.waitForFunction(
        (n) => {
          const state = window.QLOBE_DEBUG.getState();
          return state.placement === n && (state.phase === 'human' || state.phase === 'ai');
        },
        before,
        { timeout: 10000 },
      );
      if ((await debug.getState(page)).phase === 'human') await debug.winRound(page);
      await page.waitForFunction((n) => window.QLOBE_DEBUG.getState().placement > n, before, { timeout: 10000 });
    }
    await shot(page, '04-halfway-tower.png');
    check('halfway tower preserves strict alternating ownership', (await debug.getState(page)).placed.map(({ owner }) => owner).join(',') === '1,2,1,2,1');

    await debug.call(page, 'completeTower');
    await debug.waitForScreen(page, 'end', { timeout: 10000 });
    const endState = await debug.getState(page);
    check('completion reveals all ten pieces and the celebration', endState.phase === 'complete' && endState.placed.length === 10, JSON.stringify(endState));
    check('celebration controls meet the 96px minimum', undersized(await targetSizes(page)).length === 0, JSON.stringify(undersized(await targetSizes(page))));
    await shot(page, '05-celebration.png');
    checkClean(session, 'landscape Buddy session');
    await session.close();

    session = await open(browser, landscape);
    await debug.startMode(session.page, 'two-builders');
    await waitForTurn(session.page, 0);
    await debug.winRound(session.page);
    await waitForTurn(session.page, 1);
    await session.page.waitForTimeout(180);
    let twoState = await debug.getState(session.page);
    check('Two Builders waits for the second human instead of auto-playing', twoState.turn === 2 && twoState.placement === 1 && twoState.phase === 'human', JSON.stringify(twoState));
    await debug.winRound(session.page);
    await waitForTurn(session.page, 2);
    twoState = await debug.getState(session.page);
    check('Two Builders hands control back after one block', twoState.turn === 1 && twoState.placed.map(({ owner }) => owner).join(',') === '1,2', JSON.stringify(twoState));
    check('Two Builders uses stable player labels after color changes', await session.page.locator('[data-builder-one-label]').textContent() === 'PLAYER 1' && await session.page.locator('[data-builder-two-label]').textContent() === 'PLAYER 2');
    await shot(session.page, '06-two-builders.png');
    checkClean(session, 'landscape Two Builders session');
    await session.close();

    session = await open(browser, landscape, { fastTimers: 1, mute: false });
    await session.page.evaluate(() => {
      window.__qaStartPromise = window.QLOBE_DEBUG.startMode('buddy');
      return true;
    });
    await debug.waitForScreen(session.page, 'play');
    await debug.call(session.page, 'home');
    await session.page.waitForTimeout(500);
    let navState = await debug.getState(session.page);
    check('leaving during spoken intro cannot revive a hidden round', navState.screen === 'splash' && navState.phase === 'setup', JSON.stringify(navState));
    await debug.mute(session.page, true);
    await debug.startMode(session.page, 'two-builders');
    await waitForTurn(session.page, 0);
    await session.page.evaluate(() => {
      window.__qaPlacePromise = window.QLOBE_DEBUG.winRound();
      return true;
    });
    await debug.call(session.page, 'home');
    await session.page.waitForTimeout(300);
    navState = await debug.getState(session.page);
    check('leaving during block settle cannot revive a hidden round', navState.screen === 'splash' && navState.phase === 'setup' && navState.placement === 0, JSON.stringify(navState));
    checkClean(session, 'navigation-race session');
    await session.close();

    session = await open(browser, landscape, { fastTimers: 1, mute: false });
    await debug.clearAudioLog(session.page);
    await session.page.locator('[data-mode="two-builders"]').click();
    await debug.waitForAudio(session.page, 'two-intro', { timeout: 10000 });
    await debug.startMode(session.page, 'two-builders');
    await debug.waitForAudio(session.page, 'player-one-turn', { timeout: 10000 });
    const log = await debug.getAudioLog(session.page);
    check('teacher prompt plays as a generated AAC clip', audio.heardClip(log, 'two-intro'), audio.describe(log));
    check('two-player handoff uses its recorded player clip', audio.heardClip(log, 'player-one-turn'), audio.describe(log));
    checkClean(session, 'recorded-audio session');
    await session.close();

    session = await open(browser, { width: 768, height: 1024 });
    await shot(session.page, '07-portrait-setup.png');
    check('portrait setup keeps controls on-screen and at least 96px', (await clippedTargets(session.page)).length === 0 && undersized(await targetSizes(session.page)).length === 0, JSON.stringify(await clippedTargets(session.page)));
    await debug.startMode(session.page, 'buddy');
    await waitForTurn(session.page, 0);
    await shot(session.page, '08-portrait-play.png');
    check('portrait play keeps controls on-screen', (await clippedTargets(session.page)).length === 0, JSON.stringify(await clippedTargets(session.page)));
    checkClean(session, 'portrait session');
    await session.close();

    session = await open(browser, { width: 1024, height: 620 }, { reducedMotion: 'reduce' });
    await debug.startMode(session.page, 'buddy');
    await waitForTurn(session.page, 0);
    check('reduced motion remains fully playable', (await debug.getState(session.page)).reducedMotion === true);
    await shot(session.page, '09-short-reduced-play.png');
    check('short landscape keeps controls on-screen', (await clippedTargets(session.page)).length === 0, JSON.stringify(await clippedTargets(session.page)));
    checkClean(session, 'short reduced-motion session');
    await session.close();

    const hub = await openSession(browser, {
      url: `${BASE}/#social-emotional`,
      base: BASE,
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce',
      ready: false,
      allowRemote: ANALYTICS,
    });
    const card = hub.page.locator('a[href*="turn-taking-tower"]').first();
    check('hub exposes the Turn-Taking Tower card', await card.isVisible().catch(() => false));
    if (await card.count()) {
      await card.evaluate((element) => element.scrollIntoView({ block: 'center' }));
      await shot(hub.page, '10-hub-card.png');
      await Promise.all([hub.page.waitForURL('**/games/turn-taking-tower/**'), card.click()]);
      await debug.waitForHook(hub.page);
      await debug.waitForReady(hub.page);
      check('hub card opens a ready game', (await debug.getState(hub.page)).screen === 'splash');
    }
    checkClean(hub, 'hub route');
    await hub.close();
    session = null;
  } catch (error) {
    check('QA flow completed', false, error.stack || error.message);
  } finally {
    if (session) await session.close().catch(() => {});
    await browser.close();
  }

  note(`screenshots: ${SHOTS}`);
  finish({ label: 'Turn-Taking Tower QA: ' });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
