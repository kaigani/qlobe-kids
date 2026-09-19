#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  args, loadPlaywright, launchChrome, openSession, checkSessionClean,
  createReporter, debug, ensureShots, shooter, targetSizes, undersized,
  dragBetween,
} from '../../../tools/qa/lib/driver.mjs';

const url = args.flag('url') || `${args.flag('base') || 'http://127.0.0.1:8000'}/games/happy-ripe-fruit/`;
const outDir = path.resolve(args.flag('out-dir') || 'qa-shots/happy-ripe-fruit');
await mkdir(outDir, { recursive: true });
const shots = await ensureShots(outDir);
const shot = shooter(shots);
const report = createReporter({ detailOnFail: true });
const { chromium } = loadPlaywright();
const browser = await launchChrome({ chromium });
const fruits = ['strawberry', 'banana', 'apple', 'lemon', 'cherry', 'pear'];
const platformAnalytics = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];

async function stubAnalytics(session) {
  await session.context.route(
    /https:\/\/(?:www\.googletagmanager\.com|www\.google-analytics\.com)\//,
    (route) => route.fulfill({ status: 204, body: '' }),
  );
}

async function boot(viewport, {
  reducedMotion = 'no-preference', mute = true, fastTimers = 20,
} = {}) {
  const session = await openSession(browser, {
    url,
    base: new URL(url).origin,
    viewport,
    reducedMotion,
    goto: false,
    ready: false,
    allowRemote: platformAnalytics,
    allowAbortedMedia: true,
    allowDataUrls: true,
  });
  await stubAnalytics(session);
  await session.page.goto(url, { waitUntil: 'networkidle' });
  await debug.waitForHook(session.page);
  await debug.waitForReady(session.page);
  await debug.seed(session.page, 42);
  if (fastTimers) await debug.fastTimers(session.page, fastTimers);
  await debug.mute(session.page, mute);
  return session;
}

const getState = (page) => debug.call(page, 'getState');
const waitState = (page, predicate, arg = null) => page.waitForFunction(predicate, arg, { timeout: 5000 });
const capture = (page, name) => shot(page, name);

async function beginFromSplash(page, target = 'basket-start') {
  await page.locator(`[data-target="${target}"]`).click();
  await waitState(page, () => window.QLOBE_DEBUG.getState().screen === 'select');
}

async function pickRipe(page, expected) {
  await page.locator('[data-fruit-choice][data-stage="ripe"]').click();
  await waitState(page, ({ round, screen }) => {
    const current = window.QLOBE_DEBUG.getState();
    return current.screen === screen && (screen !== 'play' || (current.round === round && !current.transitioning));
  }, expected);
}

async function playFruit(page, fruit, { captureReward = null } = {}) {
  const card = page.locator(`[data-fruit="${fruit}"]`);
  report.check(`${fruit} patch is unlocked`, await card.isEnabled());
  await card.click();
  await waitState(page, () => window.QLOBE_DEBUG.getState().screen === 'play');
  for (let round = 0; round < 3; round += 1) {
    if (round < 2) await pickRipe(page, { round: round + 1, screen: 'play' });
    else await pickRipe(page, { round, screen: 'reward' });
  }
  const end = await getState(page);
  report.check(`${fruit} completes after exactly three ripe picks`, end.screen === 'reward' && end.completed.includes(fruit), JSON.stringify(end));
  if (captureReward) await capture(page, captureReward);
  await page.locator('[data-target="continue"]').click();
  await waitState(page, ({ final }) => window.QLOBE_DEBUG.getState().screen === (final ? 'party' : 'select'), { final: fruit === fruits.at(-1) });
}

report.head('Happy Ripe Fruit production smoke and interaction QA');

// Desktop: prove the real wrong/tap/drag paths and exactly-once award behavior.
const desktop = await boot({ width: 1280, height: 720 });
const page = desktop.page;
report.check('debug handshake is ready', Boolean(await page.evaluate(() => window.QLOBE_DEBUG?.ready)));
report.check('starts on splash', (await getState(page)).screen === 'splash');
await capture(page, '01-splash-desktop');
report.check('large splash basket is the primary start target', await page.locator('[data-target="basket-start"]').isEnabled());
await beginFromSplash(page);
await capture(page, '02-select-desktop');
report.check('six fruit choices are exposed', await page.locator('[data-fruit]').count() === 6);
let sizes = await targetSizes(page, '[data-target]');
report.check('desktop selector targets are at least 96px', undersized(sizes, 96).length === 0, JSON.stringify(undersized(sizes, 96)));

await page.locator('[data-fruit="strawberry"]').click();
await waitState(page, () => window.QLOBE_DEBUG.getState().screen === 'play');
await capture(page, '03-play-desktop');
const beforeWrong = await getState(page);
await page.locator('[data-fruit-choice][data-stage="early"]').click();
await page.waitForTimeout(40);
const afterWrong = await getState(page);
report.check('wrong answer shows the teaching hint without advancing',
  afterWrong.round === beforeWrong.round && afterWrong.basketCount === beforeWrong.basketCount && afterWrong.hintShown,
  JSON.stringify(afterWrong));
await capture(page, '04-hint-desktop');

await pickRipe(page, { round: 1, screen: 'play' });
let afterFirst = await getState(page);
report.check('real ripe tap awards exactly one fruit', afterFirst.round === 1 && afterFirst.basketCount === 1, JSON.stringify(afterFirst));

// A real drag released away from the basket must return home and do nothing.
let ripe = page.locator('[data-fruit-choice][data-stage="ripe"]');
let from = await ripe.boundingBox();
if (from) await dragBetween(page, from, { x: 640, y: 8 });
await page.waitForTimeout(80);
let afterMissedDrop = await getState(page);
report.check('release outside basket does not award', afterMissedDrop.round === 1 && afterMissedDrop.basketCount === 1, JSON.stringify(afterMissedDrop));

// A physical pointer drag into the authored basket must advance once.
ripe = page.locator('[data-fruit-choice][data-stage="ripe"]');
const basket = page.locator('[data-slot="basket"]');
[from] = await Promise.all([ripe.boundingBox()]);
const to = await basket.boundingBox();
if (from && to) await dragBetween(page, from, to, { steps: 12 });
await waitState(page, () => {
  const current = window.QLOBE_DEBUG.getState();
  return current.screen === 'play' && current.round === 2 && !current.transitioning;
});
const afterDrag = await getState(page);
await page.waitForTimeout(120);
const afterSettle = await getState(page);
report.check('real ripe drag awards exactly one fruit',
  afterDrag.basketCount === 2 && afterSettle.round === 2 && afterSettle.basketCount === 2,
  JSON.stringify({ afterDrag, afterSettle }));

await pickRipe(page, { round: 2, screen: 'reward' });
await capture(page, '05-reward-desktop');
report.check('three real picks reach strawberry reward', (await getState(page)).completed.includes('strawberry'));
sizes = await targetSizes(page, '[data-target]');
report.check('desktop reward targets are at least 96px', undersized(sizes, 96).length === 0, JSON.stringify(undersized(sizes, 96)));
await page.locator('[data-target="continue"]').click();
await waitState(page, () => window.QLOBE_DEBUG.getState().screen === 'select');
report.check('reward Continue unlocks the next real patch', await page.locator('[data-fruit="banana"]').isEnabled());
checkSessionClean(report, desktop, 'desktop interaction session');
await desktop.close();

// Full fresh playthrough: 18 normal answer interactions, six rewards, real unlocks.
const journey = await boot({ width: 1280, height: 720 });
await beginFromSplash(journey.page, 'start');
for (const fruit of fruits) await playFruit(journey.page, fruit);
let end = await getState(journey.page);
report.check('18 real ripe picks and six reward Continues reach party', end.screen === 'party' && end.completed.length === 6, JSON.stringify(end));
await capture(journey.page, '06-party-desktop');
await journey.page.reload({ waitUntil: 'networkidle' });
await debug.waitForHook(journey.page);
await debug.waitForReady(journey.page);
end = await getState(journey.page);
report.check('six-badge progress survives reload', end.completed.length === 6, JSON.stringify(end));
report.check('all visible party images decode', await journey.page.evaluate(() => [...document.images].every((image) => !image.currentSrc || (image.complete && image.naturalWidth > 0))));
checkSessionClean(report, journey, 'full journey session');
await journey.close();

// Portrait visual states, including every state the art gate requires.
const portrait = await boot({ width: 430, height: 932 });
await capture(portrait.page, '07-splash-portrait');
await beginFromSplash(portrait.page);
await capture(portrait.page, '08-select-portrait');
await portrait.page.locator('[data-fruit="strawberry"]').click();
await waitState(portrait.page, () => window.QLOBE_DEBUG.getState().screen === 'play');
await capture(portrait.page, '09-play-portrait');
await portrait.page.locator('[data-fruit-choice][data-stage="late"]').click();
await portrait.page.waitForTimeout(40);
await capture(portrait.page, '10-hint-portrait');
sizes = await targetSizes(portrait.page, '[data-fruit-choice], [data-slot="basket"], .plaque-button, .fruit-patch:not(:disabled)');
report.check('portrait gameplay targets are at least 96px', undersized(sizes, 96).length === 0, JSON.stringify(undersized(sizes, 96)));
for (let round = 0; round < 3; round += 1) {
  if (round < 2) await pickRipe(portrait.page, { round: round + 1, screen: 'play' });
  else await pickRipe(portrait.page, { round, screen: 'reward' });
}
await capture(portrait.page, '11-reward-portrait');
await portrait.page.locator('[data-target="continue"]').click();
await waitState(portrait.page, () => window.QLOBE_DEBUG.getState().screen === 'select');
for (const fruit of fruits.slice(1)) await playFruit(portrait.page, fruit);
await capture(portrait.page, '12-party-portrait');
report.check('portrait full journey reaches party', (await getState(portrait.page)).screen === 'party');
checkSessionClean(report, portrait, 'portrait session');
await portrait.close();

const reduced = await boot({ width: 1280, height: 720 }, { reducedMotion: 'reduce' });
await capture(reduced.page, '13-reduced-motion');
await beginFromSplash(reduced.page);
await reduced.page.locator('[data-fruit="strawberry"]').click();
await waitState(reduced.page, () => window.QLOBE_DEBUG.getState().screen === 'play');
await pickRipe(reduced.page, { round: 1, screen: 'play' });
report.check('reduced-motion answer path advances normally', (await getState(reduced.page)).basketCount === 1);
checkSessionClean(report, reduced, 'reduced-motion session');
await reduced.close();

// Bounded boot when audio metadata stalls.
const slow = await openSession(browser, {
  url,
  base: new URL(url).origin,
  viewport: { width: 800, height: 600 },
  goto: false,
  ready: false,
  allowRemote: platformAnalytics,
  allowAbortedMedia: true,
});
await stubAnalytics(slow);
await slow.page.route('**/games/happy-ripe-fruit/assets/audio/*.json', async (route) => {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  await route.abort();
});
await slow.page.goto(url, { waitUntil: 'domcontentloaded' });
await slow.page.locator('[data-target="basket-start"]').waitFor({ timeout: 1000 });
report.check('slow audio metadata never blocks the splash', await slow.page.locator('[data-target="basket-start"]').isVisible());
const boundedReady = await Promise.race([
  slow.page.evaluate(() => window.QLOBE_DEBUG.ready).then(() => true),
  new Promise((resolve) => setTimeout(() => resolve(false), 2800)),
]);
report.check('debug ready has a bounded audio deadline', boundedReady);
await slow.close();

// Genuine unmuted gesture: prove recorded-first prompts and sound replay.
const audioRun = await boot({ width: 1280, height: 720 }, { mute: false });
await audioRun.page.locator('[data-target="basket-start"]').click();
await waitState(audioRun.page, () => window.QLOBE_DEBUG.getState().screen === 'select');
await audioRun.page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog().some((entry) => entry.key === 'welcome' && entry.kind === 'clip'));
await audioRun.page.locator('[data-fruit="strawberry"]').click();
await waitState(audioRun.page, () => window.QLOBE_DEBUG.getState().screen === 'play');
await audioRun.page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog().some((entry) => entry.key === 'strawberry-prompt' && entry.kind === 'clip'));
const beforeReplay = await audioRun.page.evaluate(() => window.QLOBE_DEBUG.getAudioLog().filter((entry) => entry.key === 'strawberry-prompt').length);
await audioRun.page.waitForTimeout(700);
await audioRun.page.locator('[data-qk-screen="play"] [data-target="sound"]').click();
await audioRun.page.waitForFunction((count) => window.QLOBE_DEBUG.getAudioLog().filter((entry) => entry.key === 'strawberry-prompt').length > count, beforeReplay);
const audioLog = await audioRun.page.evaluate(() => window.QLOBE_DEBUG.getAudioLog());
report.check('first gesture uses the recorded teacher welcome', audioLog.some((entry) => entry.key === 'welcome' && entry.kind === 'clip'));
report.check('fruit prompt and sound replay use recorded clips', audioLog.filter((entry) => entry.key === 'strawberry-prompt' && entry.kind === 'clip').length >= 2, JSON.stringify(audioLog));
checkSessionClean(report, audioRun, 'audio session');
await audioRun.close();

// Public catalog integration: deliberate registry replacement and curated tile.
const hubUrl = new URL('../../#sensorial-science', url).href;
const hub = await openSession(browser, {
  url: hubUrl,
  base: new URL(url).origin,
  viewport: { width: 1280, height: 900 },
  goto: false,
  ready: false,
  allowRemote: platformAnalytics,
  allowDataUrls: true,
});
await stubAnalytics(hub);
await hub.page.goto(hubUrl, { waitUntil: 'networkidle' });
const hubCard = hub.page.locator('a.game-card[href$="games/happy-ripe-fruit/"]');
await hubCard.waitFor({ state: 'visible' });
report.check('catalog exposes exactly one Happy Ripe Fruit card', await hubCard.count() === 1);
report.check('catalog card uses the curated raster tile', await hubCard.locator('img').evaluate((image) => image.complete && image.naturalWidth === 640 && image.naturalHeight === 533));
await hubCard.screenshot({ path: path.join(outDir, '14-hub-card.png') });
report.check('replaced Melting Race stub is absent from the public catalog', await hub.page.locator('a.game-card[href$="games/melting-race/"]').count() === 0);
checkSessionClean(report, hub, 'catalog session');
await hub.close();

await browser.close();
await writeFile(path.join(outDir, 'summary.json'), JSON.stringify({
  url,
  generatedAt: new Date().toISOString(),
  checks: report.results,
  screenshots: shots,
}, null, 2));
report.finish({ suffix: `; shots in ${outDir}` });
