import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { baseUrl, checkSessionClean, createReporter, dragPath, launchChrome, loadPlaywright, openSession, resolveShots, ensureShots, shooter, debug, targetSizes, undersized } from '../../../tools/qa/lib/driver.mjs';
import runtimeConfig from '../config.js';

const id = 'local-nature-guide';
const config = JSON.parse(await readFile(new URL('../config.json', import.meta.url)));
const reporter = createReporter({ detailOnFail: true });
const base = baseUrl();
const url = `${base}/games/${id}/`;
const shots = await ensureShots(resolveShots(path.resolve(process.cwd(), 'qa-shots', id)));
const shot = shooter(shots);
const { chromium } = loadPlaywright();
const browser = await launchChrome({ chromium });
const init = () => { try { localStorage.removeItem('qlobe:local-nature-guide:journal:v1'); } catch {} };

async function modeRun(session, mode, label) {
  const { page } = session;
  await debug.startMode(page, mode);
  reporter.check(`${label} mode starts`, (await debug.getState(page)).mode === mode);
  const selector = mode === 'forest'
    ? '.forest-specimen[data-target]'
    : mode === 'birds'
      ? '.bird-choice[data-target], .replay-call[data-target]'
      : '.track-board, .animal-choice[data-target]';
  const sizes = await targetSizes(page, selector);
  reporter.check(`${label} targets are at least 96px`, undersized(sizes).length === 0, undersized(sizes).map((x) => `${x.id}:${Math.round(x.w)}x${Math.round(x.h)}`).join(', '));
  await shot(page, `${label}-play`);
  for (let round = 0; round < 3; round += 1) {
    const before = await debug.getState(page);
    const beforeCount = before.found.length;
    if (mode === 'tracks') {
      reporter.check(`tracks round ${round + 1} trace is gated`, before.phase === 'trace');
      const disabled = await page.locator('[data-pick]:disabled').count();
      reporter.check(`tracks round ${round + 1} answers disabled before trace`, disabled >= 3);
    }
    if (round === 0 && mode !== 'tracks') {
      if (mode === 'birds') await page.locator('[data-replay-call]').click();
      const firstTarget = config.modes.find((entry) => entry.id === mode).targets[0];
      await page.locator(`[data-pick="${firstTarget}"]`).click();
    } else if (mode === 'tracks') {
      const board = await page.locator('[data-track-board]').boundingBox();
      const authoredRound = runtimeConfig.modes.find((entry) => entry.id === mode).rounds[round];
      const route = authoredRound.checkpoints;
      await dragPath(page, route.map(([x, y]) => ({ x: board.x + x * board.width, y: board.y + y * board.height })), { steps: 5 });
      await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'choose');
      reporter.check(`tracks round ${round + 1} real pointer trace unlocks answers`, await page.locator(`[data-pick="${authoredRound.id}"]:not(:disabled)`).count() === 1);
      await page.locator(`[data-pick="${authoredRound.id}"]`).click();
    } else {
      await debug.winRound(page);
    }
    await page.waitForFunction((count) => window.QLOBE_DEBUG.getState().found.length > count, beforeCount);
    await page.waitForFunction((previousRound) => {
      const current = window.QLOBE_DEBUG.getState();
      return current.screen === 'journal' || current.round > previousRound;
    }, round);
    const after = await debug.getState(page);
    reporter.check(`${label} round ${round + 1} resolves`, after.found.length === beforeCount + 1);
  }
  await shot(page, `${label}-complete`);
}

try {
  reporter.head('Local Nature Guide static contract');
  reporter.check('config JSON parses', config.id === id);
  reporter.check('three configured modes', config.modes.length === 3 && config.modes.every((m) => m.rounds?.length === 3 || m.targets?.length === 3));
  reporter.head('Desktop Chrome smoke');
  const session = await openSession(browser, { url, base, viewport: { width: 1180, height: 820 }, initScript: init, fastTimers: 0.05, mute: false, allowAbortedMedia: true });
  const { page } = session;
  reporter.check('QLOBE_DEBUG v1 installed', await page.evaluate(() => window.QLOBE_DEBUG?.version === 1));
  reporter.check('debug mode list is forest/birds/tracks', JSON.stringify(await debug.listModes(page)) === JSON.stringify(['forest', 'birds', 'tracks']));
  reporter.check('recorded teacher manifest is loaded', await page.evaluate(() => {
    const clip = window.QLOBE_DEBUG.clipInfo('welcome');
    return Boolean(clip?.file?.endsWith('.m4a') && clip.dur > 0);
  }));
  const splashSizes = await targetSizes(page, '.mode-card[data-target], .journal-tab[data-target]');
  reporter.check('splash adventure targets are at least 96px', undersized(splashSizes).length === 0, JSON.stringify(undersized(splashSizes)));
  await shot(page, '01-splash');
  await modeRun(session, 'forest', '02-forest');
  await modeRun(session, 'birds', '03-birds');
  reporter.check('teacher narration uses recorded clips', await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog().some((entry) => entry.kind === 'clip')));
  await modeRun(session, 'tracks', '04-tracks');
  await debug.call(page, 'openJournal');
  await page.waitForTimeout(100);
  reporter.check('journal persists nine discoveries', (await debug.getState(page)).found.length === 9);
  reporter.check('journal fact button is present', await page.locator('[data-fact]:not(:disabled)').count() >= 1);
  await page.locator('[data-fact]:not(:disabled)').first().click();
  reporter.check('journal fact text appears', await page.locator('[data-live]').textContent().then((x) => Boolean(x?.trim())));
  await shot(page, '05-journal');
  const journalSizes = await targetSizes(page, '.journal-sticker:not(:disabled), .journal-action[data-target]');
  reporter.check('journal targets are at least 96px', undersized(journalSizes).length === 0, JSON.stringify(undersized(journalSizes)));
  const persistedValue = await page.evaluate(() => localStorage.getItem('qlobe:local-nature-guide:journal:v1'));
  checkSessionClean(reporter, session, 'desktop session');
  await session.close();
  reporter.head('Persistence reload smoke');
  const persisted = await openSession(browser, {
    url,
    base,
    viewport: { width: 1180, height: 820 },
    initScript: `localStorage.setItem('qlobe:local-nature-guide:journal:v1', ${JSON.stringify(persistedValue)});`,
    fastTimers: 0.05,
    mute: true,
  });
  reporter.check('fresh page restores all nine discoveries', (await debug.getState(persisted.page)).found.length === 9);
  await debug.call(persisted.page, 'openJournal');
  reporter.check('restored journal renders nine unlocked stickers', await persisted.page.locator('.journal-sticker.is-found').count() === 9);
  checkSessionClean(reporter, persisted, 'persistence session');
  await persisted.close();
  reporter.head('Responsive and reduced-motion smoke');
  for (const [name, viewport] of [['portrait', { width: 820, height: 1180 }], ['wide-short', { width: 1180, height: 520 }]]) {
    const s = await openSession(browser, { url, base, viewport, initScript: init, fastTimers: 0.05, mute: true });
    reporter.check(`${name} loads`, await s.page.evaluate(() => window.QLOBE_DEBUG?.version === 1));
    await shot(s.page, `06-${name}`);
    if (name === 'portrait') {
      await debug.startMode(s.page, 'tracks');
      const board = await s.page.locator('[data-track-board]').boundingBox();
      const route = runtimeConfig.modes.find((entry) => entry.id === 'tracks').rounds[0].checkpoints;
      await dragPath(s.page, route.map(([x, y]) => ({ x: board.x + x * board.width, y: board.y + y * board.height })), { steps: 5 });
      reporter.check('portrait pointer trace unlocks answers', await s.page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'choose').then(() => true));
      await shot(s.page, '07-portrait-tracks');
    }
    checkSessionClean(reporter, s, `${name} session`);
    await s.close();
  }
  const reduced = await openSession(browser, { url, base, viewport: { width: 1180, height: 820 }, reducedMotion: 'reduce', initScript: init, fastTimers: 0.05, mute: true });
  reporter.check('reduced-motion session loads', await reduced.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
  checkSessionClean(reporter, reduced, 'reduced-motion session');
  await reduced.close();
} catch (error) {
  reporter.check('QA driver completed without exception', false, error.stack || error.message);
} finally {
  await browser.close();
  reporter.finish({ suffix: `; screenshots in ${shots}`, exit: true });
}
