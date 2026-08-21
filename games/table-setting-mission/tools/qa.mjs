#!/usr/bin/env node
// Real-Chrome smoke test and visual-QC capture for Little Helper: Set the Table.
//
//   python3 -m http.server 8000
//   node games/table-setting-mission/tools/qa.mjs [--base http://127.0.0.1:8000]
//        [--shots /private/tmp/table-setting-qa-shots]

import path from 'node:path';
import {
  baseUrl,
  launchChrome,
  createReporter,
  openSession,
  checkSessionClean,
  resolveShots,
  ensureShots,
  dragBetween,
  targetSizes,
  undersized,
  debug,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const url = `${base}/games/table-setting-mission/`;
const shots = resolveShots('/private/tmp/table-setting-qa-shots');
const reporter = createReporter();
const { check, summary, failures } = reporter;
const sessions = [];
const platformAnalytics = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];

async function openGame(browser, viewport, reducedMotion = 'no-preference') {
  const session = await openSession(browser, {
    url,
    base,
    viewport,
    reducedMotion,
    seed: null,
    fastTimers: null,
    mute: null,
    allowAbortedMedia: true,
    allowRemote: platformAnalytics,
    goto: false,
    ready: false,
  });
  await session.context.route(/https:\/\/(?:www\.googletagmanager\.com|www\.google-analytics\.com)\//, async (route) => {
    await route.fulfill({ status: 204, contentType: 'text/javascript', body: '' });
  });
  await session.page.goto(url, { waitUntil: 'networkidle' });
  await debug.waitForHook(session.page);
  await debug.waitForReady(session.page);
  await debug.seed(session.page, 42);
  await debug.fastTimers(session.page, 20);
  await debug.mute(session.page, true);
  sessions.push(session);
  return session.page;
}

async function verifyHubEntry(browser) {
  const hubUrl = `${base}/#practical-life`;
  const session = await openSession(browser, {
    url: hubUrl,
    base,
    viewport: { width: 1180, height: 820 },
    seed: null,
    fastTimers: null,
    mute: null,
    allowRemote: platformAnalytics,
    goto: false,
    ready: false,
  });
  await session.context.route(/https:\/\/(?:www\.googletagmanager\.com|www\.google-analytics\.com)\//, async (route) => {
    await route.fulfill({ status: 204, contentType: 'text/javascript', body: '' });
  });
  await session.page.goto(hubUrl, { waitUntil: 'networkidle' });
  sessions.push(session);

  const card = session.page.locator('a.game-card[data-game-id="table-setting-mission"]');
  await card.waitFor({ state: 'visible' });
  check('practical-life hub lists Table Setting exactly once', await card.count() === 1);
  check('hub card carries the beta registry metadata',
    await card.getAttribute('href') === './games/table-setting-mission/'
      && await card.getAttribute('aria-label') === 'Little Helper: Set the Table — beta'
      && (await card.locator('.game-title').textContent())?.trim() === 'Little Helper: Set the Table'
      && await card.locator('.beta-badge').count() === 1);
  check('hub card loads its curated raster tile',
    await card.locator('.game-art img').evaluate((image) => image.complete && image.naturalWidth > 0));
  await session.page.screenshot({ path: path.join(shots, '00-hub-practical-life.png') });
  await Promise.all([
    session.page.waitForURL((next) => next.pathname.endsWith('/games/table-setting-mission/')),
    card.click(),
  ]);
  await session.page.locator('main#game[data-game="table-setting-mission"]').waitFor({ state: 'attached' });
  check('hub card opens the production Table Setting route', true);
}

async function assertTargets(page, label) {
  const small = undersized(await targetSizes(page), 95.5);
  check(`${label} targets meet the 96px minimum`, small.length === 0,
    small.map(({ id, w, h }) => `${id}:${Math.round(w)}x${Math.round(h)}`).join(', '));
}

async function assertOnscreen(page, label, width, height) {
  const targets = await debug.getTargets(page);
  const clipped = targets.filter(({ id, rect }) => !id.startsWith('item-') && (rect.x < -1 || rect.y < -1
    || rect.x + rect.w > width + 1 || rect.y + rect.h > height + 1));
  check(`${label} keeps active targets onscreen`, clipped.length === 0, JSON.stringify(clipped));
}

async function drive(browser) {
  await verifyHubEntry(browser);
  const page = await openGame(browser, { width: 1180, height: 820 });
  check('production splash boots', (await debug.getState(page)).screen === 'splash');
  check('three meal modes are registered',
    (await debug.listModes(page)).map(({ id }) => id).join(',') === 'breakfast,picnic,dinner');
  check('splash uses the authored graphic title',
    (await page.locator('.title-art').getAttribute('src')).endsWith('/assets/art/ui/title.webp'));
  check('splash has three authored meal cards', await page.locator('.meal-card-art').count() === 3);
  await assertTargets(page, 'splash');
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  await page.locator('[data-target="mode-breakfast"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'placing');
  const breakfast = await debug.getState(page);
  check('breakfast starts place one of four',
    breakfast.activeSeat === 0 && breakfast.completedSeats === 0 && breakfast.totalSeats === 4,
    JSON.stringify(breakfast));
  check('play renders raster placemat, tray, guide, and item art',
    await page.locator('.placemat-art').count() >= 2
      && await page.locator('.tray-art').count() === 1
      && await page.locator('.guide-card-art').count() === 1
      && await page.locator('.tray-item img').count() === 5);
  await assertTargets(page, 'breakfast play');
  await page.screenshot({ path: path.join(shots, '02-breakfast-empty.png') });

  const wrongBefore = (await debug.getState(page)).wrongCount;
  await page.evaluate(() => window.QLOBE_DEBUG.wrong('fork', 'spoon'));
  check('wrong slot gives a gentle retry without progress loss',
    (await debug.getState(page)).wrongCount === wrongBefore + 1
      && Object.keys((await debug.getState(page)).placed).length === 0);

  const distractorBefore = (await debug.getState(page)).wrongCount;
  const distractorResult = await page.evaluate(() => window.QLOBE_DEBUG.place('toast'));
  const distractorState = await debug.getState(page);
  check('food distractor stays playful and never consumes progress',
    distractorResult.reason === 'distractor'
      && distractorState.wrongCount === distractorBefore + 1
      && Object.keys(distractorState.placed).length === 0,
    JSON.stringify({ distractorResult, distractorState }));
  await page.screenshot({ path: path.join(shots, '03-breakfast-gentle-retry.png') });

  const cancelFrom = await page.locator('[data-item="fork"]').boundingBox();
  const cancelTo = await page.locator('[data-slot="fork"]').boundingBox();
  await page.mouse.move(cancelFrom.x + cancelFrom.width / 2, cancelFrom.y + cancelFrom.height / 2);
  await page.mouse.down();
  await page.mouse.move(cancelTo.x + cancelTo.width / 2, cancelTo.y + cancelTo.height / 2, { steps: 6 });
  check('lifted pointer shows one drag ghost before cancellation', await page.locator('[data-qk-drag-ghost]').count() === 1);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
  await page.waitForTimeout(40);
  check('window blur cancels without placing or stranding a ghost',
    Object.keys((await debug.getState(page)).placed).length === 0
      && await page.locator('[data-qk-drag-ghost]').count() === 0);

  const from = await page.locator('[data-item="plate"]').boundingBox();
  const to = await page.locator('[data-slot="plate"]').boundingBox();
  await dragBetween(page, from, to, {
    steps: 10,
    hold: async () => {
      await page.mouse.move(from.x + from.width / 2 + 24, from.y + from.height / 2, { steps: 3 });
      check('real pointer drag creates a raster ghost', await page.locator('[data-qk-drag-ghost]').count() === 1);
    },
  });
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().placed.plate === 'plate');
  check('real pointer drag places the plate', (await debug.getState(page)).placed.plate === 'plate');

  await debug.tap(page, 'item-cup');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().placed.cup === 'cup');
  check('tap-to-place uses the same placement path', (await debug.getState(page)).placed.cup === 'cup');
  await page.locator('.place-slot[data-slot="cup"]').click();
  await page.waitForFunction(() => !window.QLOBE_DEBUG.getState().placed.cup);
  check('a placed helper can return to the tray without penalty',
    await page.locator('[data-item="cup"]').count() === 1);
  await debug.tap(page, 'item-cup');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().placed.cup === 'cup');
  await page.screenshot({ path: path.join(shots, '04-breakfast-two-placed.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.finishPlace());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().activeSeat === 1);
  check('one completed setting advances to place two',
    (await debug.getState(page)).completedSeats === 1 && (await debug.getState(page)).activeSeat === 1);
  await page.screenshot({ path: path.join(shots, '05-breakfast-place-two.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.finishAll());
  await debug.waitForScreen(page, 'end');
  const endState = await debug.getState(page);
  check('four complete settings reach the table-ready finale',
    endState.completedSeats === 4 && endState.phase === 'table-ready', JSON.stringify(endState));
  check('finale shows four authored place settings plus both characters',
    await page.locator('.final-setting').count() === 4
      && await page.locator('.end-maya').count() === 1
      && await page.locator('.end-pip').count() === 1);
  await assertTargets(page, 'finale');
  await page.waitForTimeout(800);
  check('Maya settles fully visible in the stable finale',
    Number(await page.locator('.end-maya').evaluate((node) => getComputedStyle(node).opacity)) === 1);
  await page.screenshot({ path: path.join(shots, '06-table-ready.png') });

  await debug.tap(page, 'back');
  await debug.waitForScreen(page, 'splash');
  check('finale Back returns to the in-game meal chooser', true);
  await debug.startMode(page, 'breakfast');
  await debug.call(page, 'finishAll');
  await debug.waitForScreen(page, 'end');
  await debug.tap(page, 'again');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'play');
  check('Again restarts the same meal at place one',
    (await debug.getState(page)).modeId === 'breakfast' && (await debug.getState(page)).activeSeat === 0);
  await debug.tap(page, 'back');
  await debug.waitForScreen(page, 'splash');
  check('play Back returns to the in-game meal chooser', true);

  await debug.startMode(page, 'breakfast');
  await debug.fastTimers(page, 1);
  await page.evaluate(() => { window.__stalePlacement = window.QLOBE_DEBUG.place('plate', 'plate'); });
  await page.waitForTimeout(60);
  await debug.call(page, 'home');
  await debug.startMode(page, 'dinner');
  await page.waitForTimeout(500);
  const switchedMode = await debug.getState(page);
  check('mode switch cancels an in-flight placement from the prior meal',
    switchedMode.modeId === 'dinner' && Object.keys(switchedMode.placed).length === 0,
    JSON.stringify(switchedMode));
  await debug.call(page, 'home');
  await debug.fastTimers(page, 20);

  const audioLog = await debug.getAudioLog(page);
  check('documented exact-text speech fallback is active while clips are unavailable',
    audioLog.length > 0 && audioLog.every(({ kind }) => kind === 'speech'), JSON.stringify(audioLog));
  check('mute and unmute fan out through the semantic control',
    await debug.mute(page, false) === false && await debug.mute(page, true) === true);

  for (const modeId of ['picnic', 'dinner']) {
    await debug.startMode(page, modeId);
    await page.waitForFunction((id) => window.QLOBE_DEBUG.getState().modeId === id, modeId);
    const expected = modeId === 'picnic' ? 6 : 8;
    check(`${modeId} renders its complete mixed tray`, await page.locator('.tray-item').count() === expected);
    await page.screenshot({ path: path.join(shots, modeId === 'picnic' ? '07-picnic.png' : '08-dinner.png') });
    await debug.call(page, 'finishPlace');
    check(`${modeId} can complete a full setting through semantic placement`,
      (await debug.getState(page)).completedSeats === 1);
    await debug.call(page, 'home');
  }

  const portrait = await openGame(browser, { width: 820, height: 1180 });
  await debug.startMode(portrait, 'picnic');
  await portrait.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'placing');
  await assertOnscreen(portrait, 'portrait play', 820, 1180);
  await assertTargets(portrait, 'portrait play');
  await portrait.screenshot({ path: path.join(shots, '09-picnic-portrait.png') });

  const compact = await openGame(browser, { width: 1180, height: 600 }, 'reduce');
  await debug.startMode(compact, 'dinner');
  await compact.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'placing');
  check('reduced-motion preference is exposed to QA', (await debug.getState(compact)).reducedMotion === true);
  await assertOnscreen(compact, 'compact reduced-motion play', 1180, 600);
  await assertTargets(compact, '600px-high compact play');
  await compact.screenshot({ path: path.join(shots, '10-dinner-compact-reduced.png') });

  const artRequests = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter((entry) => entry.name.includes('/games/table-setting-mission/assets/art/'))
    .map((entry) => entry.name));
  check('runtime loads the production raster art kit', artRequests.length >= 25, String(artRequests.length));

  for (const [index, session] of sessions.entries()) {
    checkSessionClean(reporter, session, `session ${index + 1}`);
    await session.close();
  }
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome();
  try {
    await drive(browser);
  } finally {
    summary({ suffix: `; shots in ${shots}` });
    await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 3000))]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(failures().length || process.exitCode ? 1 : 0));
