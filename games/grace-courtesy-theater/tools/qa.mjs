#!/usr/bin/env node
// Real-Chrome smoke, interaction, responsive, and visual QA for Grace & Courtesy Theater.
import {
  audio, baseUrl, checkSessionClean, createReporter, debug, ensureShots,
  launchChrome, openSession, resolveShots, shooter, targetSizes, undersized,
} from '../../../tools/qa/lib/driver.mjs';

const BASE = baseUrl('http://127.0.0.1:4173');
const GAME = `${BASE}/games/grace-courtesy-theater/`;
const SHOTS = resolveShots('games/grace-courtesy-theater/qa-shots');
const { check, note, finish } = createReporter({ collapse: true, detailLimit: 320 });
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
  return openSession(browser, { url: GAME, base: BASE, viewport, seed: 42,
    fastTimers: 1, mute: true, allowAbortedMedia: true, allowRemote: analytics,
    waitUntil: 'networkidle', ...options });
}
async function images(page) {
  return page.locator('img').evaluateAll((nodes) => nodes.map((img) => ({
    src: img.getAttribute('src'), complete: img.complete, width: img.naturalWidth, height: img.naturalHeight,
  })));
}
async function clipped(page) {
  return page.evaluate(() => {
    const { innerWidth, innerHeight } = window;
    return window.QLOBE_DEBUG.getTargets().filter(({ rect }) => rect.x < 0 || rect.y < 0 || rect.x + rect.w > innerWidth || rect.y + rect.h > innerHeight);
  });
}
async function waitChoice(page) { await debug.waitForInput(page, { timeout: 10000 }); }

async function main() {
  await ensureShots(SHOTS);
  const browser = await launchChrome({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const shot = shooter(SHOTS);
  let session;
  try {
    session = await open(browser, { width: 1024, height: 768 });
    const { page } = session;
    const modes = await debug.listModes(page);
    check('debug v1 exposes all six theater scenes', modes.length === 6, JSON.stringify(modes));
    check('initial screen is the scene menu', (await debug.getState(page)).screen === 'splash');
    const decoded = await images(page);
    check('every loaded image decodes', decoded.length >= 25 && decoded.every((img) => img.complete && img.width > 0 && img.height > 0), JSON.stringify(decoded.filter((img) => !img.width || !img.height)));
    check('splash targets meet 96px minimum', undersized(await targetSizes(page)).length === 0, JSON.stringify(undersized(await targetSizes(page))));
    await shot(page, '01-splash-tablet');

    await page.locator('[data-scenario="greeting"]').click();
    await debug.waitForScreen(page, 'cast');
    check('real scenario-card pointer opens puppet wardrobe', (await debug.getState(page)).screen === 'cast');
    const swatch = page.locator('[data-costume-owner="poppy"][data-costume-index="1"]');
    await swatch.click();
    check(
      'costume choice updates selected state and visible headpiece',
      await swatch.getAttribute('aria-pressed') === 'true'
        && (await page.locator('.cast-card .poppy-costume').getAttribute('src')).includes('poppy-berry'),
    );
    await shot(page, '02-cast-costume');
    await page.locator('[data-target="start-show"]').click();
    await debug.waitForScreen(page, 'play');
    await waitChoice(page);
    check(
      'green felt plaque always marks the kind choice',
      (await page.locator('.choice-card[data-role="correct"] .choice-plaque').getAttribute('src')).includes('choice-green')
        && (await page.locator('.choice-card[data-role="wrong"] .choice-plaque').evaluateAll(
          (images) => images.every((image) => !image.getAttribute('src').includes('choice-green')),
        )),
    );
    await shot(page, '03-play-choice');
    const wrong = page.locator('.choice-card[data-role="wrong"]').first();
    await wrong.click();
    await page.waitForTimeout(50);
    const retry = await debug.getState(page);
    check('wrong choice retries without advancing', retry.phase === 'retry' && retry.attempts === 1 && retry.screen === 'play', JSON.stringify(retry));
    await shot(page, '04-play-retry');
    await debug.winRound(page);
    await debug.waitForScreen(page, 'end', { timeout: 10000 });
    check('correct choice reaches curtain call', (await debug.getState(page)).phase === 'complete');
    check('completion persists the greeting star', (await debug.getState(page)).completed.includes('greeting'));
    await shot(page, '05-end-bow');
    check('end targets meet 96px minimum', undersized(await targetSizes(page)).length === 0, JSON.stringify(undersized(await targetSizes(page))));
    clean(session, 'tablet interaction session');
    await session.close(); session = null;

    session = await open(browser, { width: 1024, height: 768, reducedMotion: 'reduce' });
    for (const mode of modes) {
      await debug.startMode(session.page, mode.id);
      await debug.waitForScreen(session.page, 'play', { timeout: 10000 });
      await waitChoice(session.page);
      await debug.winRound(session.page);
      await debug.waitForScreen(session.page, 'end', { timeout: 10000 });
      check(`debug win completes ${mode.id}`, (await debug.getState(session.page)).completed.includes(mode.id));
      await debug.call(session.page, 'home');
      await debug.waitForScreen(session.page, 'splash');
    }
    check('all six scenes remain playable after replay', (await debug.getState(session.page)).screen === 'splash');
    clean(session, 'six-scene reduced-motion session');
    await session.close(); session = null;

    for (const [label, viewport] of [['portrait', { width: 768, height: 1024 }], ['phone-landscape', { width: 844, height: 390 }]]) {
      session = await open(browser, viewport, { reducedMotion: 'reduce' });
      check(`${label} keeps controls on-screen`, (await clipped(session.page)).length === 0, JSON.stringify(await clipped(session.page)));
      check(`${label} keeps targets large enough`, undersized(await targetSizes(session.page)).length === 0, JSON.stringify(undersized(await targetSizes(session.page))));
      await shot(session.page, `06-${label}`);
      await debug.startMode(session.page, 'greeting');
      await waitChoice(session.page);
      check(`${label} stage keeps all choices on-screen`, (await clipped(session.page)).length === 0, JSON.stringify(await clipped(session.page)));
      check(`${label} stage keeps choice targets large enough`, undersized(await targetSizes(session.page)).length === 0, JSON.stringify(undersized(await targetSizes(session.page))));
      await shot(session.page, `07-${label}-stage`);
      await debug.winRound(session.page);
      await debug.waitForScreen(session.page, 'end');
      check(`${label} curtain call keeps controls on-screen`, (await clipped(session.page)).length === 0, JSON.stringify(await clipped(session.page)));
      check(`${label} curtain call keeps targets large enough`, undersized(await targetSizes(session.page)).length === 0, JSON.stringify(undersized(await targetSizes(session.page))));
      await shot(session.page, `08-${label}-end`);
      clean(session, `${label} responsive session`);
      await session.close(); session = null;
    }

    const log = await debug.getAudioLog(await (async () => {
      session = await open(browser, { width: 1024, height: 768 }, { mute: false });
      await debug.startMode(session.page, 'thanks');
      await debug.waitForScreen(session.page, 'play');
      return session.page;
    })());
    check('recorded teacher clip performs the scene prompt', audio.heardClip(log, 'thanks-prompt'), audio.describe(log));
    clean(session, 'audio session'); await session.close(); session = null;

    session = await open(browser, { width: 1024, height: 768 }, { mute: false });
    await session.page.locator('[data-scenario="greeting"]').click();
    await debug.waitForScreen(session.page, 'cast');
    await session.page.locator('[data-target="start-show"]').click();
    await debug.waitForScreen(session.page, 'play', { timeout: 1200 });
    check('Open Curtain works immediately while wardrobe narration is live', (await debug.getState(session.page)).screen === 'play');
    await debug.call(session.page, 'home');
    await debug.waitForScreen(session.page, 'splash');
    check('leaving during live narration cannot revive the stage', (await debug.getState(session.page)).screen === 'splash');
    clean(session, 'live-audio navigation session'); await session.close(); session = null;

    const hub = await openSession(browser, { url: `${BASE}/#social-emotional`, base: BASE, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', ready: false, allowRemote: analytics });
    const card = hub.page.locator('a[href*="grace-courtesy-theater"]').first();
    check('hub exposes Grace & Courtesy Theater', await card.isVisible().catch(() => false));
    if (await card.count()) { await card.click(); await debug.waitForHook(hub.page); await debug.waitForReady(hub.page); check('hub card opens ready theater', (await debug.getState(hub.page)).screen === 'splash'); }
    clean(hub, 'hub click-through session'); await hub.close();
  } catch (error) {
    check('QA run completed without an unexpected exception', false, error.stack || error.message);
  } finally { if (session) await session.close().catch(() => {}); await browser.close(); }
  finish({ suffix: `; screenshots in ${SHOTS}`, label: 'Grace & Courtesy Theater QA: ' });
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
