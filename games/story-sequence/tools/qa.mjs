#!/usr/bin/env node
// First, Next, Last — real-Chrome smoke and visual-QC driver.

import {
  args,
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
import { storageKey, stories } from '../config.js';

const base = baseUrl();
const gameUrl = `${base}/games/story-sequence/`;
const shots = resolveShots('qa-shots/story-sequence');
const shot = shooter(shots);
const reporter = createReporter({ detailOnFail: true, collapse: true, detailLimit: 1400 });
const { check, note, finish } = reporter;
const sessions = [];
const analyticsOrigins = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
];
const viewports = [
  { width: 1180, height: 820, name: 'landscape' },
  { width: 820, height: 1180, name: 'portrait' },
  { width: 1180, height: 520, name: 'short-landscape' },
];

async function boot(browser, viewport, { reducedMotion = 'no-preference', muted = true } = {}) {
  const session = await openSession(browser, {
    url: gameUrl,
    base,
    viewport,
    reducedMotion,
    allowAbortedMedia: true,
    allowRemote: analyticsOrigins,
    ready: true,
  });
  await debug.fastTimers(session.page, 0.05);
  await debug.seed(session.page, 42);
  await debug.mute(session.page, muted);
  sessions.push(session);
  return session;
}

function cleanSession(session, label) {
  session.failed = session.failed.filter((entry) => !(
    String(entry).includes('net::ERR_ABORTED')
    && analyticsOrigins.some((origin) => String(entry).includes(origin))
  ));
  checkSessionClean(reporter, session, label);
}

async function targetAudit(page, label, minimum = 96) {
  const visible = await targetSizes(page);
  const small = undersized(visible, minimum);
  check(`${label}: visible child targets are at least ${minimum}px`, small.length === 0,
    small.map((target) => `${target.id}:${Math.round(target.w)}x${Math.round(target.h)}`).join(', '));
}

async function layoutAudit(page, label) {
  const layout = await page.evaluate(() => {
    const screen = document.querySelector('.game-screen');
    const body = document.body;
    return {
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
      bodyOverflow: body.scrollWidth - innerWidth,
      screenBottom: screen ? screen.getBoundingClientRect().bottom : 0,
      viewportHeight: innerHeight,
      brokenImages: [...document.images]
        .filter((image) => image.complete && image.naturalWidth === 0)
        .map((image) => image.src),
    };
  });
  check(`${label}: no horizontal overflow`, layout.horizontalOverflow <= 1 && layout.bodyOverflow <= 1,
    JSON.stringify(layout));
  check(`${label}: all visible raster art decodes`, layout.brokenImages.length === 0,
    layout.brokenImages.join(', '));
}

async function clickTarget(page, id) {
  await page.locator(`[data-target="${id}"]`).first().click();
}

async function hubPass(browser) {
  const page = await browser.newPage({ viewport: viewports[0] });
  try {
    const response = await page.goto(`${base}/#oral-storytelling`, { waitUntil: 'networkidle' });
    check('hub route loads successfully', response?.ok(), `HTTP ${response?.status()}`);
    const card = page.locator('[data-game-id="story-sequence"]');
    await card.waitFor({ state: 'visible' });
    check('hub registers one First, Next, Last card', await card.count() === 1);
    const tileDecoded = await card.locator('img').evaluate((image) => (
      image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
    ));
    check('hub tile decodes', tileDecoded);
    await card.scrollIntoViewIfNeeded();
    await shot(page, '00-hub-catalog');
    await Promise.all([
      page.waitForURL('**/games/story-sequence/'),
      card.click(),
    ]);
    await page.waitForFunction(() => window.QLOBE_DEBUG?.version === 1);
    check('hub card navigates to the playable route',
      page.url().endsWith('/games/story-sequence/')
      && await page.evaluate(() => window.QLOBE_DEBUG.gameId === 'story-sequence'));
  } finally {
    await page.close();
  }
}

function storyById(id) {
  return stories.find((story) => story.id === id);
}

async function waitForState(page, predicate, argument = null, timeout = 15000) {
  await page.waitForFunction(predicate, argument, { timeout });
}

async function exercisePrimaryStory(page) {
  const story = storyById('plant');
  await clickTarget(page, 'story:plant');
  await waitForState(page, () => window.QLOBE_DEBUG.getState().storyId === 'plant');
  check('physical story-cover tap starts Plant', (await debug.getState(page)).storyId === 'plant');
  await shot(page, '02-order-empty-landscape');
  await targetAudit(page, 'ordering screen');

  // Wrong branch: select the NEXT picture, then try the FIRST space.
  await clickTarget(page, `card:${story.steps[1].id}`);
  await clickTarget(page, 'slot:0');
  await page.waitForSelector('.story-card.is-wrong');
  const wrongState = await debug.getState(page);
  check('wrong placement is rejected without losing the card',
    wrongState.placed === 0 && wrongState.lastAttempt?.result === 'wrong',
    JSON.stringify(wrongState));
  await shot(page, '03-wrong-placement');

  // Physical tap-card then tap-slot path.
  await clickTarget(page, `card:${story.steps[0].id}`);
  await clickTarget(page, 'slot:0');
  await waitForState(page, () => window.QLOBE_DEBUG.getState().placed === 1);
  check('tap-card then tap-slot places FIRST', (await debug.getState(page)).placed === 1);
  await shot(page, '04-first-placed');

  // Physical pointer drag path.
  const dragCard = await page.locator(`[data-target="card:${story.steps[1].id}"]`).boundingBox();
  const dragSlot = await page.locator('[data-target="slot:1"]').boundingBox();
  if (dragCard && dragSlot) await dragBetween(page, dragCard, dragSlot, { steps: 14 });
  await waitForState(page, () => window.QLOBE_DEBUG.getState().placed === 2);
  check('physical pointer drag places NEXT', (await debug.getState(page)).placed === 2);
  await shot(page, '05-next-dragged');

  await clickTarget(page, `card:${story.steps[2].id}`);
  await clickTarget(page, 'slot:2');
  await waitForState(page, () => window.QLOBE_DEBUG.getState().phase === 'ready');
  check('three correct placements reveal Watch My Story',
    await page.locator('[data-target="watch"]').isVisible());
  await shot(page, '06-story-ready');
  await targetAudit(page, 'ready screen');

  await clickTarget(page, 'watch');
  await waitForState(page, () => window.QLOBE_DEBUG.getState().phase === 'playback'
    && window.QLOBE_DEBUG.getState().playbackIndex >= 0, null, 15000);
  const playbackHear = page.locator('[data-target="hear-play"]');
  check('playback narration control is disabled so it cannot skip a story beat',
    await playbackHear.isDisabled());
  await page.evaluate(() => document.querySelector('[data-target="hear-play"]')?.click());
  await page.waitForTimeout(180);
  const uninterrupted = await debug.getState(page);
  check('disabled narration control leaves the first playback beat uninterrupted',
    uninterrupted.phase === 'playback' && uninterrupted.playbackIndex === 0,
    JSON.stringify(uninterrupted));
  await shot(page, '07-playback-first');
  await waitForState(page, () => window.QLOBE_DEBUG.getState().screen === 'end', null, 30000);
  check('Watch My Story plays all three beats and reaches celebration',
    (await debug.getState(page)).screen === 'end');
  await shot(page, '08-great-story');
  await targetAudit(page, 'celebration screen');

  const log = await debug.getAudioLog(page);
  check('recorded teacher voice plays after a real gesture', audio.clips(log).length > 0, audio.describe(log));
  check('three story lines are requested in order',
    audio.inOrder(log, story.steps.map((step) => step.id)), audio.describe(log));
  check('completion praise is requested', audio.heard(log, 'great-story'), audio.describe(log));

  await clickTarget(page, 'another');
  await waitForState(page, () => window.QLOBE_DEBUG.getState().screen === 'splash');
  check('celebration returns to story library', (await debug.getState(page)).screen === 'splash');
}

async function exerciseEveryStoryButton(page) {
  for (const story of stories.filter((entry) => entry.id !== 'plant')) {
    await clickTarget(page, `story:${story.id}`);
    await waitForState(page, (id) => window.QLOBE_DEBUG.getState().storyId === id, story.id);
    check(`${story.menuLabel} cover opens its own deck`, (await debug.getState(page)).storyId === story.id);
    await shot(page, `09-deck-${story.id}`);
    await clickTarget(page, 'home');
    await waitForState(page, () => window.QLOBE_DEBUG.getState().screen === 'splash');
  }
}

async function responsivePass(browser, viewport, reducedMotion = 'no-preference') {
  const session = await boot(browser, viewport, { reducedMotion, muted: true });
  const { page } = session;
  const suffix = reducedMotion === 'reduce' ? `${viewport.name}-reduced` : viewport.name;

  await shot(page, `10-${suffix}-library`);
  await layoutAudit(page, `${suffix} library`);
  await targetAudit(page, `${suffix} library`, viewport.width <= 620 ? 88 : 96);

  await debug.startMode(page, 'slide');
  await waitForState(page, () => window.QLOBE_DEBUG.getState().screen === 'play');
  await shot(page, `11-${suffix}-ordering`);
  await layoutAudit(page, `${suffix} ordering`);
  await targetAudit(page, `${suffix} ordering`, viewport.width <= 620 ? 88 : 96);

  await debug.winRound(page);
  await waitForState(page, () => window.QLOBE_DEBUG.getState().phase === 'ready');
  await shot(page, `12-${suffix}-ready`);
  await debug.tap(page, 'watch');
  await waitForState(page, () => window.QLOBE_DEBUG.getState().screen === 'end', null, 12000);
  await shot(page, `13-${suffix}-end`);
  await layoutAudit(page, `${suffix} end`);
  await targetAudit(page, `${suffix} end`, viewport.width <= 620 ? 88 : 96);
  check(`${suffix}: complete debug drive reaches end`, (await debug.getState(page)).screen === 'end');
  cleanSession(session, `${suffix} session`);
}

async function persistencePass(browser) {
  const session = await boot(browser, viewports[0], { muted: true });
  const { page } = session;
  await page.evaluate(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: storageKey, value: ['slide', 'bake', 'plant'] });
  await page.reload({ waitUntil: 'load' });
  await debug.waitForHook(page);
  await debug.waitForReady(page);
  await debug.fastTimers(page, 0.05);
  await debug.mute(page, true);
  check('three saved Storyteller Stars restore after reload',
    (await debug.getState(page)).completed.join(',') === 'slide,bake,plant');

  await debug.startMode(page, 'brush');
  await debug.winRound(page);
  await debug.tap(page, 'watch');
  await waitForState(page, () => window.QLOBE_DEBUG.getState().screen === 'end');
  const allDone = await debug.getState(page);
  check('fourth story earns the all-stories celebration',
    allDone.completed.length === 4
    && await page.locator('#end-title').textContent() === 'Storyteller Star!');
  check('all-stories teacher line is requested',
    audio.heard(await debug.getAudioLog(page), 'all-stories'));
  await shot(page, '14-all-storyteller-stars');

  await page.reload({ waitUntil: 'load' });
  await debug.waitForHook(page);
  await debug.waitForReady(page);
  check('four completed stories persist across reload',
    (await debug.getState(page)).completed.length === 4
    && await page.locator('.story-choice.is-complete').count() === 4);
  cleanSession(session, 'persistence session');
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome({ headless: !args.has('headed') });
  try {
    await hubPass(browser);
    const primary = await boot(browser, viewports[0], { muted: false });
    const { page } = primary;
    await debug.call(page, 'clearProgress');
    const modes = await debug.listModes(page);
    check('direct route boots to the four-story library',
      (await debug.getState(page)).screen === 'splash' && modes.map((mode) => mode.id).join(',') === 'slide,bake,plant,brush',
      JSON.stringify(modes));
    await shot(page, '01-library-landscape');
    await layoutAudit(page, 'landscape library');
    await targetAudit(page, 'landscape library');
    await exercisePrimaryStory(page);
    await exerciseEveryStoryButton(page);
    cleanSession(primary, 'primary landscape session');

    await responsivePass(browser, viewports[1]);
    await responsivePass(browser, viewports[2]);
    await responsivePass(browser, viewports[0], 'reduce');
    await persistencePass(browser);
    note(`screenshots written to ${shots}`);
  } finally {
    for (const session of sessions) await session.close().catch(() => {});
    await browser.close();
  }
  finish({ suffix: `; shots in ${shots}` });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
