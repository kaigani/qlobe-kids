#!/usr/bin/env node
// Real-Chrome interaction, recorded-audio, responsive, and visual QA.
import {
  audio, baseUrl, checkSessionClean, createReporter, debug, ensureShots,
  launchChrome, openSession, resolveShots, shooter, targetSizes, undersized,
} from '../../../tools/qa/lib/driver.mjs';

const BASE = baseUrl('http://127.0.0.1:4173');
const GAME = `${BASE}/games/puppet-patience-theater/`;
const SHOTS = resolveShots('games/puppet-patience-theater/qa-shots');
const { check, finish } = createReporter({ collapse: true, detailLimit: 360 });
const analytics = ['googletagmanager.com', 'google-analytics.com'];
const isAnalytics = (value) => analytics.some((host) => value.includes(host));

function clean(session, label) {
  checkSessionClean({ check }, {
    ...session,
    failed: session.failed.filter((entry) => !isAnalytics(entry)),
    remote: session.remote.filter((entry) => !isAnalytics(entry)),
  }, label);
}

function open(browser, viewport, options = {}) {
  return openSession(browser, {
    url: GAME,
    base: BASE,
    viewport,
    seed: 42,
    fastTimers: 0.03,
    mute: true,
    allowAbortedMedia: true,
    allowRemote: analytics,
    waitUntil: 'networkidle',
    ...options,
  });
}

async function images(page) {
  return page.locator('img').evaluateAll((nodes) => nodes.map((img) => ({
    src: img.getAttribute('src'),
    complete: img.complete,
    width: img.naturalWidth,
    height: img.naturalHeight,
  })));
}

async function clipped(page) {
  return page.evaluate(() => {
    const { innerWidth, innerHeight } = window;
    return window.QLOBE_DEBUG.getTargets().filter(({ rect }) => (
      rect.x < -1 || rect.y < -1 || rect.x + rect.w > innerWidth + 1 || rect.y + rect.h > innerHeight + 1
    ));
  });
}

async function waitPhase(page, phase, timeout = 10000) {
  await page.waitForFunction((expected) => window.QLOBE_DEBUG?.getState().phase === expected, phase, { timeout });
}

async function finishBreaths(page) {
  let state = await debug.getState(page);
  while (state.phase === 'breathe' && state.breaths < state.breathsNeeded) {
    await debug.call(page, 'takeBreath');
    state = await debug.getState(page);
  }
  await waitPhase(page, 'turn');
}

async function main() {
  await ensureShots(SHOTS);
  const browser = await launchChrome({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const shot = shooter(SHOTS);
  let session;
  try {
    session = await open(browser, { width: 1024, height: 768 });
    const { page } = session;
    const modes = await debug.listModes(page);
    check('debug exposes all three patience stories', modes.length === 3, JSON.stringify(modes));
    check('initial screen is the theater entrance', (await debug.getState(page)).screen === 'splash');
    const decoded = await images(page);
    check('every authored image decodes', decoded.length >= 35 && decoded.every((img) => img.complete && img.width > 0 && img.height > 0), JSON.stringify(decoded.filter((img) => !img.width || !img.height)));
    check('splash targets meet 96px minimum', undersized(await targetSizes(page)).length === 0, JSON.stringify(undersized(await targetSizes(page))));
    await shot(page, '01-splash-tablet');

    await page.locator('[data-target="play"]').click();
    await debug.waitForScreen(page, 'practice');
    check('real Play control opens Puppet Practice', (await debug.getState(page)).phase === 'choose');
    check('three story cards are visible', await page.locator('.story-card:visible').count() === 3);
    check('practice targets meet 96px minimum', undersized(await targetSizes(page)).length === 0, JSON.stringify(undersized(await targetSizes(page))));
    await shot(page, '02-practice-tablet');
    await page.locator('.practice-screen [data-target="sound"]').click();
    check('visible speaker toggles sound on', (await debug.getState(page)).muted === false);
    await debug.mute(page, true);

    await page.locator('[data-story="swing"]').click();
    await debug.waitForScreen(page, 'play');
    check('pointer-selecting Swing starts Watch', (await debug.getState(page)).phase === 'watch');
    await debug.call(page, 'enterWatch');
    await shot(page, '03-watch-tablet');

    await debug.call(page, 'enterBreathe');
    await waitPhase(page, 'breathe');
    await shot(page, '04-breathe-tablet');
    await page.locator('[data-target="prop"]').click();
    const early = await debug.getState(page);
    check('early prop tap gets a gentle retry without advancing', early.phase === 'breathe' && early.earlyTaps === 1, JSON.stringify(early));
    check('breathing controls meet 96px minimum', undersized(await targetSizes(page)).length === 0, JSON.stringify(undersized(await targetSizes(page))));

    await finishBreaths(page);
    check('three completed breaths reveal the child turn', (await debug.getState(page)).phase === 'turn');
    await shot(page, '05-turn-tablet');
    await page.locator('[data-target="prop"]').click();
    await debug.waitForScreen(page, 'end');
    await page.waitForTimeout(450);
    const completed = await debug.getState(page);
    check('taking the turn reaches a no-failure curtain call', completed.phase === 'complete' && completed.completed.includes('swing'), JSON.stringify(completed));
    check('curtain-call targets meet 96px minimum', undersized(await targetSizes(page)).length === 0, JSON.stringify(undersized(await targetSizes(page))));
    await shot(page, '06-curtain-call-tablet');
    clean(session, 'tablet interaction session');
    await session.close(); session = null;

    session = await open(browser, { width: 1024, height: 768 }, { reducedMotion: 'reduce' });
    for (const [modeIndex, mode] of modes.entries()) {
      await debug.startMode(session.page, mode.id);
      await debug.waitForScreen(session.page, 'play');
      await debug.call(session.page, 'enterBreathe');
      await finishBreaths(session.page);
      await shot(session.page, `${11 + modeIndex}-${mode.id}-turn`);
      await debug.call(session.page, 'winRound');
      await debug.waitForScreen(session.page, 'end');
      await session.page.waitForTimeout(80);
      check(`${mode.title} completes`, (await debug.getState(session.page)).completed.includes(mode.id));
      await debug.call(session.page, 'home');
      await debug.waitForScreen(session.page, 'splash');
    }
    check('all modes replay cleanly with reduced motion', (await debug.getState(session.page)).screen === 'splash');
    clean(session, 'three-story reduced-motion session');
    await session.close(); session = null;

    for (const [label, viewport] of [
      ['portrait', { width: 768, height: 1024 }],
      ['phone-landscape', { width: 844, height: 390 }],
    ]) {
      session = await open(browser, viewport, { reducedMotion: 'reduce' });
      check(`${label} splash keeps controls on-screen`, (await clipped(session.page)).length === 0, JSON.stringify(await clipped(session.page)));
      check(`${label} splash keeps targets large`, undersized(await targetSizes(session.page)).length === 0, JSON.stringify(undersized(await targetSizes(session.page))));
      await shot(session.page, `07-${label}-splash`);
      await debug.call(session.page, 'showPractice', { speakPrompt: false });
      check(`${label} practice keeps controls on-screen`, (await clipped(session.page)).length === 0, JSON.stringify(await clipped(session.page)));
      await shot(session.page, `08-${label}-practice`);
      await debug.startMode(session.page, 'bakery');
      await debug.call(session.page, 'enterBreathe');
      check(`${label} breathe stage keeps controls on-screen`, (await clipped(session.page)).length === 0, JSON.stringify(await clipped(session.page)));
      check(`${label} breathe stage keeps targets large`, undersized(await targetSizes(session.page)).length === 0, JSON.stringify(undersized(await targetSizes(session.page))));
      await shot(session.page, `09-${label}-breathe`);
      await finishBreaths(session.page);
      await debug.call(session.page, 'winRound');
      await debug.waitForScreen(session.page, 'end');
      check(`${label} curtain call keeps controls on-screen`, (await clipped(session.page)).length === 0, JSON.stringify(await clipped(session.page)));
      await shot(session.page, `10-${label}-end`);
      clean(session, `${label} responsive session`);
      await session.close(); session = null;
    }

    session = await open(browser, { width: 1200, height: 630 }, { reducedMotion: 'reduce' });
    await shot(session.page, '14-og-splash');
    clean(session, 'social-card capture session');
    await session.close(); session = null;

    session = await open(browser, { width: 1024, height: 768 }, { mute: false });
    await debug.clearAudioLog(session.page);
    await debug.startMode(session.page, 'parade');
    await waitPhase(session.page, 'breathe');
    const log = await debug.getAudioLog(session.page);
    check('recorded teacher performs Watch narration', audio.heardClip(log, 'parade-watch'), audio.describe(log));
    check('recorded teacher performs Breathe narration', audio.heardClip(log, 'parade-breathe'), audio.describe(log));
    clean(session, 'recorded-audio session');
    await session.close(); session = null;

    const hub = await openSession(browser, {
      url: `${BASE}/#social-emotional`, base: BASE, viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce', ready: false, allowRemote: analytics,
    });
    const card = hub.page.locator('a[href*="puppet-patience-theater"]').first();
    check('hub exposes Puppet Patience Theater', await card.isVisible().catch(() => false));
    if (await card.count()) {
      await card.click();
      await debug.waitForHook(hub.page);
      await debug.waitForReady(hub.page);
      check('hub card opens a ready theater', (await debug.getState(hub.page)).screen === 'splash');
    }
    clean(hub, 'hub click-through session');
    await hub.close();
  } catch (error) {
    check('QA run completed without an unexpected exception', false, error.stack || error.message);
  } finally {
    if (session) await session.close().catch(() => {});
    await browser.close();
  }
  finish({ suffix: `; screenshots in ${SHOTS}`, label: 'Puppet Patience Theater QA: ' });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
