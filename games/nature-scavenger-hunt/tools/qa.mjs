import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  baseUrl,
  checkSessionClean,
  createReporter,
  debug,
  ensureShots,
  launchChrome,
  loadPlaywright,
  openSession,
  resolveShots,
  shooter,
  targetSizes,
  undersized,
} from '../../../tools/qa/lib/driver.mjs';

const id = 'nature-scavenger-hunt';
const config = JSON.parse(await readFile(new URL('../config.json', import.meta.url)));
const reporter = createReporter({ detailOnFail: true });
const base = baseUrl();
const url = `${base}/games/${id}/`;
const shots = await ensureShots(resolveShots(path.resolve(process.cwd(), 'qa-shots', id)));
const shot = shooter(shots);
const { chromium } = loadPlaywright();
const browser = await launchChrome({ chromium });
const init = () => { try { localStorage.removeItem('qlobe:nature-scavenger-hunt:journal:v1'); } catch {} };
const platformNetwork = {
  allowRemote: ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'],
  captureRequestFailures: false,
};

async function waitForAdvance(page, beforeRound) {
  await page.waitForFunction((round) => {
    const state = window.QLOBE_DEBUG.getState();
    return state.screen === 'complete' || state.round > round;
  }, beforeRound);
}

async function finishVisibleQuest(page, label, { firstFoundShot = false } = {}) {
  for (let step = 0; step < 3; step += 1) {
    const before = await debug.getState(page);
    reporter.check(`${label} clue ${step + 1} awaits self-report`, before.screen === 'hunt' && before.awaitingInput);
    const accepted = await debug.winRound(page);
    reporter.check(`${label} clue ${step + 1} accepts found`, accepted === true);
    if (firstFoundShot && step === 0) {
      await page.waitForTimeout(240);
      await shot(page, `${label}-found-feedback`);
    }
    await waitForAdvance(page, before.round);
  }
  reporter.check(`${label} reaches completion`, (await debug.getState(page)).screen === 'complete');
}

async function startThroughBrief(page, mode) {
  await debug.startMode(page, mode);
  await debug.waitForScreen(page, 'briefing');
  await debug.tap(page, 'begin-hunt');
  await debug.waitForScreen(page, 'hunt');
  await debug.waitForInput(page);
}

try {
  reporter.head('Nature Scavenger Hunt static contract');
  reporter.check('config JSON parses', config.id === id);
  reporter.check('three configured trails', config.modes?.length === 3);

  reporter.head('Desktop real-Chrome smoke');
  const session = await openSession(browser, {
    url,
    base,
    viewport: { width: 1180, height: 820 },
    initScript: init,
    seed: 42,
    fastTimers: 0.2,
    mute: false,
    allowAbortedMedia: true,
    ...platformNetwork,
  });
  const { page } = session;
  reporter.check('QLOBE_DEBUG v1 installed', await page.evaluate(() => window.QLOBE_DEBUG?.version === 1));
  reporter.check('three runtime trails registered', JSON.stringify(await debug.listModes(page)) === JSON.stringify(['nature-mix', 'texture-trail', 'color-quest']));
  reporter.check('unknown targets reject truthfully', await debug.tap(page, 'not-a-real-target') === false);
  const splashTargets = await targetSizes(page, '.mode-card[data-target], .qk-hud-btn[data-target]');
  reporter.check('splash targets are at least 96px', undersized(splashTargets).length === 0, JSON.stringify(undersized(splashTargets)));
  await shot(page, '01-splash-landscape');

  await page.locator('[data-mode="nature-mix"]').click();
  await debug.waitForScreen(page, 'briefing');
  reporter.check('real pointer opens briefing', (await debug.getState(page)).quest.length === 3);
  const briefingTargets = await targetSizes(page, '.briefing-screen [data-target]');
  reporter.check('briefing targets are at least 96px', undersized(briefingTargets).length === 0, JSON.stringify(undersized(briefingTargets)));
  await shot(page, '02-briefing-landscape');
  await page.locator('[data-action="begin"]').click();
  await debug.waitForScreen(page, 'hunt');
  await debug.waitForInput(page);
  const huntTargets = await targetSizes(page, '.hunt-screen [data-target]');
  reporter.check('hunt targets are at least 96px', undersized(huntTargets).length === 0, JSON.stringify(undersized(huntTargets)));
  await page.waitForTimeout(560);
  await shot(page, '03-hunt-landscape');
  await debug.fastTimers(page, 1);
  await finishVisibleQuest(page, 'nature-mix', { firstFoundShot: true });
  reporter.check('completion has three checked finds', await page.locator('.complete-row').count() === 3);
  await shot(page, '04-complete-landscape');
  const audioLog = await debug.getAudioLog(page);
  reporter.check('teacher narration uses recorded clips', audioLog.some((entry) => entry.kind === 'clip'), audioLog.map((entry) => `${entry.kind}:${entry.key}`).join(' -> '));
  reporter.check('nature-mix progress persisted', await page.evaluate(() => JSON.parse(localStorage.getItem('qlobe:nature-scavenger-hunt:journal:v1') || '{}')?.modes?.['nature-mix'] === 1));
  const beforeReplay = await debug.getState(page);
  await page.locator('[data-action="replay"]').click();
  await debug.waitForScreen(page, 'briefing');
  const afterReplay = await debug.getState(page);
  reporter.check('New quest returns to briefing in the same trail', afterReplay.mode === 'nature-mix' && afterReplay.quest.length === 3);
  reporter.check('New quest advances the seeded clue deck', afterReplay.seed === beforeReplay.seed + 1 && JSON.stringify(afterReplay.quest) !== JSON.stringify(beforeReplay.quest));
  await page.waitForTimeout(160);
  reporter.check('New quest pointer is single-activation safe', (await debug.getState(page)).seed === afterReplay.seed);
  await debug.tap(page, 'back');
  reporter.check('back returns to trail choices', (await debug.getState(page)).screen === 'splash');
  await debug.fastTimers(page, 0.2);

  for (const mode of ['texture-trail', 'color-quest']) {
    await startThroughBrief(page, mode);
    await finishVisibleQuest(page, mode);
    await debug.call(page, 'home');
  }
  reporter.check('all trail badges unlock', (await debug.getState(page)).completed.length === 3);
  reporter.check('all three badge images visible', await page.locator('.mode-complete:not([hidden])').count() === 3);
  const persistedValue = await page.evaluate(() => localStorage.getItem('qlobe:nature-scavenger-hunt:journal:v1'));
  checkSessionClean(reporter, session, 'desktop session');
  await session.close();

  reporter.head('Persistence reload smoke');
  const persisted = await openSession(browser, {
    url,
    base,
    viewport: { width: 1180, height: 820 },
    initScript: `localStorage.setItem('qlobe:nature-scavenger-hunt:journal:v1', ${JSON.stringify(persistedValue)});`,
    fastTimers: 0.2,
    mute: true,
    ...platformNetwork,
  });
  reporter.check('fresh page restores all trail badges', (await debug.getState(persisted.page)).completed.length === 3);
  reporter.check('restored badge art is visible', await persisted.page.locator('.mode-complete:not([hidden])').count() === 3);
  checkSessionClean(reporter, persisted, 'persistence session');
  await persisted.close();

  reporter.head('Responsive and reduced-motion smoke');
  for (const [name, viewport] of [
    ['portrait', { width: 820, height: 1180 }],
    ['wide-short', { width: 1180, height: 520 }],
  ]) {
    const responsive = await openSession(browser, { url, base, viewport, initScript: init, seed: 42, fastTimers: 0.2, mute: true, ...platformNetwork });
    const responsiveTargets = await targetSizes(responsive.page, '.mode-card[data-target], .qk-hud-btn[data-target]');
    reporter.check(`${name} splash targets are at least 96px`, undersized(responsiveTargets).length === 0, JSON.stringify(undersized(responsiveTargets)));
    await shot(responsive.page, `05-${name}-splash`);
    await debug.startMode(responsive.page, 'color-quest');
    await debug.waitForScreen(responsive.page, 'briefing');
    const responsiveBriefTargets = await targetSizes(responsive.page, '.briefing-screen [data-target]');
    reporter.check(`${name} briefing targets are at least 96px`, undersized(responsiveBriefTargets).length === 0, JSON.stringify(undersized(responsiveBriefTargets)));
    await shot(responsive.page, `06-${name}-briefing`);
    await debug.tap(responsive.page, 'begin-hunt');
    await debug.waitForScreen(responsive.page, 'hunt');
    await debug.waitForInput(responsive.page);
    const playTargets = await targetSizes(responsive.page, '.hunt-screen [data-target]');
    reporter.check(`${name} hunt targets are at least 96px`, undersized(playTargets).length === 0, JSON.stringify(undersized(playTargets)));
    await responsive.page.waitForTimeout(560);
    await shot(responsive.page, `07-${name}-hunt`);
    await finishVisibleQuest(responsive.page, `${name}-color-quest`);
    await shot(responsive.page, `08-${name}-complete`);
    checkSessionClean(reporter, responsive, `${name} session`);
    await responsive.close();
  }

  const reduced = await openSession(browser, {
    url,
    base,
    viewport: { width: 1180, height: 820 },
    reducedMotion: 'reduce',
    initScript: init,
    fastTimers: 0.2,
    mute: true,
    ...platformNetwork,
  });
  reporter.check('reduced-motion preference is honored', await reduced.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
  await startThroughBrief(reduced.page, 'nature-mix');
  await debug.winRound(reduced.page);
  reporter.check('reduced-motion found state remains visible', await reduced.page.locator('.hunt-stage.is-found').count() === 1);
  await shot(reduced.page, '07-reduced-motion-found');
  checkSessionClean(reporter, reduced, 'reduced-motion session');
  await reduced.close();

  reporter.head('Hub registration');
  const hub = await openSession(browser, { url: `${base}/#movement-outdoor`, base, viewport: { width: 1180, height: 820 }, ready: false, mute: null, ...platformNetwork });
  const tile = hub.page.locator(`a.game-card[data-game-id="${id}"]`);
  await tile.waitFor();
  await tile.scrollIntoViewIfNeeded();
  reporter.check('hub tile links to the game', await tile.count() === 1);
  reporter.check('hub tile art decodes at catalog resolution', await tile.locator('img').evaluate((image) => image.complete && image.naturalWidth >= 640));
  await shot(hub.page, '08-hub-category');
  checkSessionClean(reporter, hub, 'hub session');
  await hub.close();
} catch (error) {
  reporter.check('QA driver completed without exception', false, error.stack || error.message);
} finally {
  await browser.close();
  reporter.finish({ suffix: `; screenshots in ${shots}`, exit: true });
}
