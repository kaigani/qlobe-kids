#!/usr/bin/env node
import path from 'node:path';
import {
  baseUrl,
  launchChrome,
  createReporter,
  openSession,
  checkSessionClean,
  resolveShots,
  ensureShots,
  shooter,
  dragBetween,
  targetSizes,
  undersized,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const shots = resolveShots('qa-shots/pattern-train');
const platformAnalytics = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
];
const reporter = createReporter({ detailLimit: 600, collapse: true });
const { check, finish } = reporter;
const sessions = [];

async function visibleArtIsLoaded(page) {
  return page.locator('img').evaluateAll((images) => images
    .filter((image) => image.getClientRects().length)
    .every((image) => image.complete && image.naturalWidth > 0));
}

async function layoutFacts(page) {
  return page.evaluate(() => {
    const visible = [...document.querySelectorAll('[data-qk-screen]')]
      .filter((node) => !node.hidden);
    const outside = [...document.querySelectorAll('[data-target]')]
      .filter((node) => node.getClientRects().length)
      .map((node) => ({ id: node.dataset.target, rect: node.getBoundingClientRect() }))
      .filter(({ rect }) => rect.left < -1 || rect.top < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1)
      .map(({ id, rect }) => ({
        id,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
      }));
    return {
      visibleScreens: visible.map((node) => node.dataset.qkScreen),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      verticalOverflow: document.documentElement.scrollHeight > innerHeight,
      outside,
      homeCount: visible[0]?.querySelectorAll('.qk-hud-home').length || 0,
    };
  });
}

async function open(browser, viewport, reducedMotion = 'no-preference') {
  const session = await openSession(browser, {
    url: `${base}/games/pattern-train/`,
    base,
    viewport,
    reducedMotion,
    goto: false,
    ready: false,
    allowAbortedMedia: true,
    allowRemote: platformAnalytics,
  });
  await session.context.route(
    /https:\/\/(?:www\.googletagmanager\.com|www\.google-analytics\.com)\//,
    (route) => route.fulfill({ status: 204, body: '' }),
  );
  await session.page.goto(`${base}/games/pattern-train/`, { waitUntil: 'networkidle' });
  await session.page.evaluate(() => QLOBE_DEBUG.ready);
  await session.page.evaluate(() => QLOBE_DEBUG.fastTimers(0.02));
  await session.page.evaluate(() => QLOBE_DEBUG.mute(true));
  sessions.push(session);
  return session;
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome();
  const shot = shooter(shots);

  const landscape = await open(browser, { width: 1180, height: 820 });
  const page = landscape.page;
  let state = await page.evaluate(() => QLOBE_DEBUG.getState());
  check('splash boots ready', state.screen === 'splash');
  check('all visible splash art decodes', await visibleArtIsLoaded(page));
  let facts = await layoutFacts(page);
  check('exactly one splash screen is visible', facts.visibleScreens.join(',') === 'splash', facts.visibleScreens);
  check('Home appears on splash', facts.homeCount === 1);
  check('splash has no viewport overflow', !facts.horizontalOverflow && !facts.verticalOverflow && !facts.outside.length, JSON.stringify(facts));
  await shot(page, '01-splash-landscape');

  await page.evaluate(() => QLOBE_DEBUG.mute(false));
  await page.locator('[data-target="splash-sound"]').click();
  await page.waitForTimeout(120);
  const welcomeAudio = await page.evaluate(() => QLOBE_DEBUG.getAudioLog().at(-1));
  check('welcome uses the recorded teacher clip', welcomeAudio?.key === 'welcome' && welcomeAudio?.kind === 'clip', JSON.stringify(welcomeAudio));
  await page.evaluate(() => QLOBE_DEBUG.mute(true));

  await page.evaluate(() => QLOBE_DEBUG.tap('play'));
  facts = await layoutFacts(page);
  check('Play opens depot', facts.visibleScreens.join(',') === 'depot');
  check('Home is absent after splash', facts.homeCount === 0);
  check('all three modes are registered', (await page.evaluate(() => QLOBE_DEBUG.listModes().map((mode) => mode.id).sort().join(','))) === 'actions,builder,shapes');
  await shot(page, '02-depot-landscape');

  await page.evaluate(() => {
    QLOBE_DEBUG.mute(false);
    void QLOBE_DEBUG.startMode('shapes');
  });
  await page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'play');
  await page.evaluate(() => QLOBE_DEBUG.tap('play-back'));
  await page.evaluate(() => { void QLOBE_DEBUG.startMode('actions'); });
  await page.waitForTimeout(120);
  state = await page.evaluate(() => QLOBE_DEBUG.getState());
  check('back during narration does not block the next ride', state.screen === 'play' && state.mode === 'actions', JSON.stringify(state));
  await page.evaluate(() => QLOBE_DEBUG.tap('play-back'));
  await page.evaluate(() => QLOBE_DEBUG.mute(true));

  await page.evaluate(() => QLOBE_DEBUG.startMode('shapes'));
  state = await page.evaluate(() => QLOBE_DEBUG.getState());
  check('Shape Cargo reaches an answerable round', state.screen === 'play' && state.mode === 'shapes' && state.awaitingInput);
  const playTargets = await targetSizes(page, '.pt-choice, .qk-hud-btn');
  const tooSmallPlay = undersized(playTargets);
  check('play controls meet 96px target minimum', tooSmallPlay.length === 0, JSON.stringify(tooSmallPlay));
  check('directed play art decodes', await visibleArtIsLoaded(page));
  await shot(page, '03-shape-cargo');

  const wrongId = await page.locator('.pt-choice[data-role="wrong"]').first().getAttribute('data-target');
  await page.evaluate((id) => QLOBE_DEBUG.tap(id), wrongId);
  state = await page.evaluate(() => QLOBE_DEBUG.getState());
  check('wrong answer is gentle and retryable', state.round === 0 && state.awaitingInput && state.misses === 1);
  await shot(page, '04-gentle-retry');

  const correctBox = await page.locator('.pt-choice[data-role="correct"]').boundingBox();
  const emptyBox = await page.locator('.pt-wagon.is-empty').boundingBox();
  await dragBetween(page, correctBox, emptyBox, { steps: 14 });
  await page.waitForFunction(() => QLOBE_DEBUG.getState().round === 1);
  check('drag-to-wagon uses the real answer path', (await page.evaluate(() => QLOBE_DEBUG.getState().round)) === 1);
  await shot(page, '05-next-round');

  await page.evaluate(() => QLOBE_DEBUG.winRound());
  await page.evaluate(() => QLOBE_DEBUG.winRound());
  state = await page.evaluate(() => QLOBE_DEBUG.getState());
  check('three correct rounds reach reward', state.screen === 'reward' && state.round === 3);
  check('reward art decodes', await visibleArtIsLoaded(page));
  await page.waitForTimeout(500);
  await shot(page, '06-pattern-complete');

  await page.evaluate(() => QLOBE_DEBUG.startMode('actions'));
  state = await page.evaluate(() => QLOBE_DEBUG.getState());
  check('Move & Sound has its own content', state.mode === 'actions' && state.correct && state.awaitingInput);
  check('action prompt is specific', await page.locator('[data-prompt]').textContent() === 'What move comes next?');
  await shot(page, '07-move-and-sound');

  await page.evaluate(() => QLOBE_DEBUG.startMode('builder'));
  check('builder opens with five wagons', await page.locator('[data-builder-train] [data-wagon-index]').count() === 5);
  await page.evaluate(() => QLOBE_DEBUG.clearBuilder());
  await page.evaluate(() => QLOBE_DEBUG.tap('builder-token-red-triangle'));
  await page.evaluate(() => QLOBE_DEBUG.tap('builder-token-blue-square'));
  let pattern = await page.evaluate(() => QLOBE_DEBUG.getBuilderPattern());
  check('tap building fills wagons in order', pattern[0] === 'red-triangle' && pattern[1] === 'blue-square');
  const starBox = await page.locator('[data-target="builder-token-green-star"]').boundingBox();
  const fourthWagon = await page.locator('[data-target="builder-wagon-3"]').boundingBox();
  await dragBetween(page, starBox, fourthWagon, { steps: 14 });
  pattern = await page.evaluate(() => QLOBE_DEBUG.getBuilderPattern());
  check('builder drag targets a chosen wagon', pattern[3] === 'green-star', JSON.stringify(pattern));
  const builderTargets = await targetSizes(page, '.pt-builder .pt-choice, .pt-builder .pt-wagon-button, .pt-builder-actions button, .pt-builder .qk-hud-btn');
  const tooSmallBuilder = undersized(builderTargets);
  check('builder controls meet 96px target minimum', tooSmallBuilder.length === 0, JSON.stringify(tooSmallBuilder));
  await shot(page, '08-my-train-builder');
  const sparsePlayback = await page.evaluate(async () => {
    const row = document.querySelector('[data-builder-train] .pt-train-row');
    const seen = [];
    const record = () => {
      row.querySelectorAll('.is-speaking').forEach((wagon) => {
        const index = Number(wagon.dataset.wagonIndex);
        if (seen.at(-1) !== index) seen.push(index);
      });
    };
    const observer = new MutationObserver(record);
    observer.observe(row, { attributes: true, subtree: true, attributeFilter: ['class'] });
    const ok = await QLOBE_DEBUG.playPattern();
    record();
    observer.disconnect();
    return { ok, seen: [...new Set(seen)] };
  });
  check('builder train plays successfully', sparsePlayback.ok, JSON.stringify(sparsePlayback));
  check('sparse builder playback glows the occupied wagons', sparsePlayback.seen.join(',') === '0,1,3', JSON.stringify(sparsePlayback));
  await shot(page, '09-builder-played');

  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => QLOBE_DEBUG.ready);
  await page.evaluate(() => QLOBE_DEBUG.fastTimers(0.02));
  await page.evaluate(() => QLOBE_DEBUG.mute(true));
  await page.evaluate(() => QLOBE_DEBUG.startMode('builder'));
  pattern = await page.evaluate(() => QLOBE_DEBUG.getBuilderPattern());
  check('builder pattern survives a reload', pattern[0] === 'red-triangle' && pattern[1] === 'blue-square' && pattern[3] === 'green-star', JSON.stringify(pattern));

  await page.evaluate(() => QLOBE_DEBUG.home());
  check('debug home returns in-page to splash', (await page.evaluate(() => QLOBE_DEBUG.getState().screen)) === 'splash');

  const portrait = await open(browser, { width: 820, height: 1180 }, 'reduce');
  facts = await layoutFacts(portrait.page);
  check('portrait splash stays inside viewport', !facts.horizontalOverflow && !facts.verticalOverflow && !facts.outside.length, JSON.stringify(facts));
  await shot(portrait.page, '10-splash-portrait');
  await portrait.page.evaluate(() => QLOBE_DEBUG.tap('play'));
  await shot(portrait.page, '11-depot-portrait');
  await portrait.page.evaluate(() => QLOBE_DEBUG.startMode('shapes'));
  facts = await layoutFacts(portrait.page);
  check('portrait play stays inside viewport', !facts.horizontalOverflow && !facts.verticalOverflow && !facts.outside.length, JSON.stringify(facts));
  await shot(portrait.page, '12-play-portrait');
  await portrait.page.evaluate(() => QLOBE_DEBUG.startMode('builder'));
  facts = await layoutFacts(portrait.page);
  check('portrait builder stays inside viewport', !facts.horizontalOverflow && !facts.verticalOverflow && !facts.outside.length, JSON.stringify(facts));
  await shot(portrait.page, '13-builder-portrait');

  const compact = await open(browser, { width: 1024, height: 576 }, 'reduce');
  await compact.page.evaluate(() => QLOBE_DEBUG.startMode('shapes'));
  facts = await layoutFacts(compact.page);
  check('compact landscape stays inside viewport', !facts.horizontalOverflow && !facts.verticalOverflow && !facts.outside.length, JSON.stringify(facts));
  await shot(compact.page, '14-play-compact');

  sessions.forEach((session, index) => checkSessionClean(reporter, session, `session ${index + 1}`));
  await Promise.all(sessions.map((session) => session.close()));
  await browser.close();
  finish({ suffix: `; shots in ${path.resolve(shots)}` });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
