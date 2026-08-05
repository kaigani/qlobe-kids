#!/usr/bin/env node
// Real-Chrome acceptance driver for Color Mixing Lab.
// Run from qlobe-kids: python3 -m http.server 8000 && node games/color-mixing-lab/tools/qa.mjs

import path from 'node:path';
import {
  baseUrl, launchChrome, createReporter, openSession, checkSessionClean,
  resolveShots, ensureShots,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const shots = resolveShots('qa-shots/color-mixing-lab');
const { check, finish } = createReporter();
const sessions = [];
const PLATFORM_ANALYTICS = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
];

async function openGame(browser, viewport, reducedMotion = 'no-preference') {
  const session = await openSession(browser, {
    url: `${base}/games/color-mixing-lab/`, base, viewport, reducedMotion,
    allowAbortedMedia: true, seed: 42, fastTimers: true,
    // Every QLOBE page loads the same analytics shim. It is platform traffic,
    // not a game asset/model dependency, and is expected to be blocked in QA.
    allowRemote: PLATFORM_ANALYTICS,
  });
  sessions.push(session);
  return session.page;
}

async function openHub(browser) {
  const session = await openSession(browser, {
    url: `${base}/#art-music`, base,
    viewport: { width: 1180, height: 820 }, ready: false,
    allowRemote: PLATFORM_ANALYTICS,
  });
  sessions.push(session);
  return session.page;
}
const state = (page) => page.evaluate(() => window.QLOBE_DEBUG.getState());
const wait = (page, predicate) => page.waitForFunction(predicate);

async function completeMode(page, id) {
  await page.evaluate((mode) => window.QLOBE_DEBUG.startMode(mode), id);
  for (let i = 0; i < 3; i += 1) {
    await page.evaluate(() => window.QLOBE_DEBUG.winRound());
    await wait(page, () => window.QLOBE_DEBUG.getState().phase === 'reveal');
    if (i < 2) {
      await page.evaluate(() => window.QLOBE_DEBUG.tap('next'));
      await wait(page, () => window.QLOBE_DEBUG.getState().phase === 'play' || window.QLOBE_DEBUG.getState().phase === 'predict');
    }
  }
  await wait(page, () => window.QLOBE_DEBUG.getState().screen === 'end');
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome();

  const hub = await openHub(browser);
  const hubTile = hub.locator('a.tile[aria-label^="Color Mixing Lab"]');
  await hubTile.waitFor();
  check('hub lists the playable Color Mixing Lab tile', await hubTile.count() === 1);
  check('hub tile uses the curated production image',
    (await hubTile.locator('img').getAttribute('src')) === 'assets/hub/tiles/color-mixing-lab.jpg');
  await hubTile.scrollIntoViewIfNeeded();
  await hub.screenshot({ path: path.join(shots, '00-hub-tile.png') });
  await Promise.all([
    hub.waitForURL('**/games/color-mixing-lab/'),
    hubTile.click(),
  ]);
  await hub.evaluate(() => window.QLOBE_DEBUG.ready);
  check('hub launches the game route', hub.url().endsWith('/games/color-mixing-lab/'));

  const page = await openGame(browser, { width: 1180, height: 820 });
  check('splash boots', (await state(page)).screen === 'splash');
  check('all three modes are registered', (await page.evaluate(() => window.QLOBE_DEBUG.listModes())).map((m) => m.id).join(',') === 'discover,predict,recipe');
  const splashTargets = await page.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check('mode cards meet 96px target minimum', splashTargets.filter((t) => t.id.startsWith('mode-')).every((t) => t.rect.w >= 96 && t.rect.h >= 96));
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  await page.locator('[data-target="mode-discover"]').click();
  await wait(page, () => window.QLOBE_DEBUG.getState().phase === 'play');
  check('voice log records the first-gesture teacher clip', await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog().some((line) => line.key === 'mode-discover' && line.kind === 'clip')));
  const targets = await page.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check('workbench exposes three large flasks and a padded beaker', ['flask-red', 'flask-yellow', 'flask-blue', 'beaker'].every((id) => targets.some((t) => t.id === id && t.rect.w >= 96 && t.rect.h >= 96)));
  const beforeWrong = await state(page);
  const wrong = ['red', 'yellow', 'blue'].find((color) => !beforeWrong.target.split('-').includes(color));
  await page.evaluate((color) => window.QLOBE_DEBUG.pour(color), wrong);
  check('discover wrong-color nudge leaves pours unchanged', (await state(page)).poured.length === 0);

  const requestedFirst = (await state(page)).target.split('-')[0];
  const first = page.locator(`[data-target="flask-${requestedFirst}"]`);
  const from = await first.boundingBox(); const beaker = await page.locator('[data-target="beaker"]').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
  await page.mouse.move((from.x + beaker.x) / 2, (from.y + beaker.y) / 2, { steps: 6 });
  check('drag creates a visible ghost', await page.locator('[data-qk-drag-ghost]').count() === 1);
  await page.mouse.move(beaker.x + beaker.width / 2, beaker.y + beaker.height / 2, { steps: 6 }); await page.mouse.up();
  await wait(page, () => window.QLOBE_DEBUG.getState().poured.length === 1);
  check('real drag reaches the semantic pour path', (await state(page)).poured.length === 1);
  await page.screenshot({ path: path.join(shots, '02-discover-first-pour.png') });

  // A synthetic cancellation follows the shared controller's same pointer lifecycle.
  const cancelMe = await page.locator('.flask:not([disabled])').first(); const cancelBox = await cancelMe.boundingBox();
  await page.mouse.move(cancelBox.x + 20, cancelBox.y + 20); await page.mouse.down(); await page.mouse.move(cancelBox.x + 70, cancelBox.y - 15, { steps: 4 });
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })));
  await page.mouse.up();
  check('pointer cancel removes the drag ghost without pouring', (await state(page)).poured.length === 1 && await page.locator('[data-qk-drag-ghost]').count() === 0);
  // Off-target drags must restore the source and permit a later valid tap.
  const unused = await page.locator('.flask:not([disabled])').first(); const unusedBox = await unused.boundingBox();
  await page.mouse.move(unusedBox.x + 20, unusedBox.y + 20); await page.mouse.down(); await page.mouse.move(unusedBox.x + 130, unusedBox.y - 30, { steps: 4 });
  await page.mouse.move(4, 4); await page.mouse.up();
  check('off-target drop does not strand or pour', (await state(page)).poured.length === 1 && await page.locator('[data-qk-drag-ghost]').count() === 0);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.evaluate(async () => { const s = window.QLOBE_DEBUG.getState(); await window.QLOBE_DEBUG.pour(s.target.split('-').find((c) => !s.poured.includes(c))); });
  await wait(page, () => window.QLOBE_DEBUG.getState().phase === 'reveal');
  check('tap/debug semantic pour completes reveal after recovery', (await state(page)).result !== null);
  await page.screenshot({ path: path.join(shots, '03-discover-reveal.png') });
  await page.evaluate(() => window.QLOBE_DEBUG.tap('next'));

  await page.evaluate(() => window.QLOBE_DEBUG.home());
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('predict'));
  await wait(page, () => window.QLOBE_DEBUG.getState().phase === 'predict');
  await page.screenshot({ path: path.join(shots, '04a-predict-choices.png') });
  await page.evaluate(() => window.QLOBE_DEBUG.predict('purple'));
  check('predict accepts every hypothesis before workbench', (await state(page)).phase === 'play' && (await state(page)).prediction === 'purple');
  await page.evaluate(() => window.QLOBE_DEBUG.winRound()); await wait(page, () => window.QLOBE_DEBUG.getState().phase === 'reveal');
  check('predict reaches the shared reaction reveal', (await state(page)).result !== null);
  await page.evaluate(() => window.QLOBE_DEBUG.home());

  await page.evaluate(() => window.QLOBE_DEBUG.startMode('recipe'));
  await wait(page, () => window.QLOBE_DEBUG.getState().phase === 'play');
  await page.screenshot({ path: path.join(shots, '04b-recipe-workbench.png') });
  const recipe = await state(page); const firstRecipe = recipe.target.split('-')[0];
  await page.evaluate((color) => window.QLOBE_DEBUG.pour(color), firstRecipe);
  await page.evaluate((color) => window.QLOBE_DEBUG.pour(color), firstRecipe);
  check('recipe duplicate color gets a gentle retry without second pour', (await state(page)).poured.length === 1);
  const badSecond = ['red', 'yellow', 'blue'].find((c) => c !== firstRecipe && !recipe.target.split('-').includes(c));
  await page.evaluate((color) => window.QLOBE_DEBUG.pour(color), badSecond);
  await wait(page, () => window.QLOBE_DEBUG.getState().phase === 'play' && window.QLOBE_DEBUG.getState().poured.length === 0);
  check('recipe wrong valid pair rinses and preserves round', (await state(page)).round === 0);
  await page.screenshot({ path: path.join(shots, '04-recipe-rinsed.png') });
  await completeMode(page, 'recipe');
  check('recipe completes all three rounds to end', (await state(page)).screen === 'end');
  await page.screenshot({ path: path.join(shots, '04c-end.png') });
  await page.evaluate(() => window.QLOBE_DEBUG.tap('back'));
  check('back from end returns to splash', (await state(page)).screen === 'splash');
  check('splash Home routes to the catalog', (await page.locator('[data-target="home"]').getAttribute('href')) === '../../');

  for (const mode of ['discover', 'predict', 'recipe']) {
    await completeMode(page, mode);
    check(`${mode} full mode reaches the end`, (await state(page)).screen === 'end');
    await page.evaluate(() => window.QLOBE_DEBUG.home());
  }

  const narrow = await openGame(browser, { width: 1180, height: 520 });
  await narrow.evaluate(() => window.QLOBE_DEBUG.startMode('discover'));
  const narrowTargets = await narrow.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check('1180x520 keeps HUD and beaker visible', ['back', 'sound', 'beaker'].every((id) => narrowTargets.some((t) => t.id === id)));
  await narrow.screenshot({ path: path.join(shots, '05-landscape-short.png') });
  const phoneLandscape = await openGame(browser, { width: 568, height: 320 });
  const phoneCards = (await phoneLandscape.evaluate(() => window.QLOBE_DEBUG.getTargets())).filter((target) => target.id.startsWith('mode-'));
  check('568x320 keeps all three splash modes visible and tappable', phoneCards.length === 3
    && phoneCards.every(({ rect }) => rect.w >= 96 && rect.h >= 96 && rect.y >= 0 && rect.y + rect.h <= 320));
  await phoneLandscape.screenshot({ path: path.join(shots, '05a-phone-splash.png') });
  await phoneLandscape.evaluate(() => window.QLOBE_DEBUG.startMode('discover'));
  const phoneTargets = await phoneLandscape.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check('568x320 keeps all primary play targets inside the viewport', ['back', 'sound', 'beaker', 'flask-red', 'flask-yellow', 'flask-blue'].every((id) => {
    const target = phoneTargets.find((item) => item.id === id);
    return target && target.rect.w >= 76 && target.rect.h >= 76 && target.rect.y >= 0 && target.rect.y + target.rect.h <= 320;
  }));
  await phoneLandscape.screenshot({ path: path.join(shots, '05b-phone-landscape.png') });
  await phoneLandscape.evaluate(() => window.QLOBE_DEBUG.winRound());
  await wait(phoneLandscape, () => window.QLOBE_DEBUG.getState().phase === 'reveal');
  const phoneNext = (await phoneLandscape.evaluate(() => window.QLOBE_DEBUG.getTargets())).find((target) => target.id === 'next');
  check('568x320 reveal keeps its continuation target fully visible', phoneNext
    && phoneNext.rect.w >= 76 && phoneNext.rect.h >= 76 && phoneNext.rect.y >= 0 && phoneNext.rect.y + phoneNext.rect.h <= 320);
  await phoneLandscape.screenshot({ path: path.join(shots, '05c-phone-reveal.png') });
  const portrait = await openGame(browser, { width: 820, height: 1180 });
  await portrait.evaluate(() => window.QLOBE_DEBUG.startMode('discover'));
  const portraitTargets = await portrait.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check('portrait preserves 96px flask targets', portraitTargets.filter((t) => t.id.startsWith('flask-')).every((t) => t.rect.w >= 96 && t.rect.h >= 96));
  await portrait.screenshot({ path: path.join(shots, '06-portrait.png') });
  const reduced = await openGame(browser, { width: 1180, height: 820 }, 'reduce');
  await reduced.evaluate(() => window.QLOBE_DEBUG.startMode('discover'));
  await reduced.evaluate(() => window.QLOBE_DEBUG.winRound()); await wait(reduced, () => window.QLOBE_DEBUG.getState().phase === 'reveal');
  check('reduced-motion state is reported and reveal works', (await state(reduced)).reducedMotion === true);
  await reduced.screenshot({ path: path.join(shots, '07-reduced-reveal.png') });

  for (const session of sessions) {
    session.failed = session.failed.filter((entry) => !PLATFORM_ANALYTICS.some((prefix) => entry.startsWith(prefix)));
    checkSessionClean({ check }, session);
  }
  await browser.close(); finish();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
