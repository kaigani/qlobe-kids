#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  args, launchChrome, createReporter, openSession,
  resolveShots, ensureShots,
} from '../../../tools/qa/lib/driver.mjs';

const base = args.flag('base', 'http://127.0.0.1:8000');
const url = `${base.replace(/\/$/, '')}/games/chocolate-chip-count/`;
const shots = resolveShots('qa-shots/chocolate-chip-count');
const { check, note, finish } = createReporter();

async function boot(page) {
  await page.waitForFunction(() => window.QLOBE_DEBUG?.ready);
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  await page.evaluate(() => {
    window.QLOBE_DEBUG.mute(true);
    window.QLOBE_DEBUG.fastTimers();
    window.QLOBE_DEBUG.seed(42);
  });
}

async function session(browser, viewport, reducedMotion = 'no-preference') {
  const result = await openSession(browser, {
    url, base, viewport, reducedMotion, allowAbortedMedia: true,
  });
  await boot(result.page);
  return result;
}

async function largeTargets(page, label) {
  const undersized = await page.locator('[data-target]').evaluateAll((nodes) => nodes
    .filter((node) => node.getClientRects().length && !node.disabled)
    .map((node) => ({ id: node.dataset.target, rect: node.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width < 96 || rect.height < 96)
    .map(({ id, rect }) => `${id}:${Math.round(rect.width)}×${Math.round(rect.height)}`));
  check(`${label}: visible child targets are at least 96px`, undersized.length === 0, undersized.join(', '));
}

async function drive(browser) {
  await ensureShots(shots);
  const landscape = await session(browser, { width: 1200, height: 900 });
  const page = landscape.page;

  let state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('boots to the recipe splash', state.screen === 'splash' && state.phase === 'choose');
  check('registers the three exact-count recipes',
    (await page.evaluate(() => window.QLOBE_DEBUG.listModes().map(({ id }) => id).join(','))) ===
    'tiny-batch,baker-batch,super-batch');
  check('splash composes exactly 3, 6, and 10 chips from the authored sprite',
    (await page.locator('.recipe-card .cookie-composite').evaluateAll((cards) => cards.map((card) => card.querySelectorAll('.cookie-chip').length))).join(',') === '3,6,10');
  check('decorative title is an authored raster with exact alt text',
    await page.locator('.title-art').getAttribute('alt') === 'Chocolate Chip Count');
  await largeTargets(page, 'landscape splash');
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.startMode('tiny-batch'));
  state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('Tiny Batch opens at the pop beat with a target of 3',
    state.screen === 'play' && state.phase === 'pop' && state.target === 3 && state.caught === 0);
  check('only the current balloon is reported as correct',
    (await page.evaluate(() => window.QLOBE_DEBUG.getTargets().filter((target) => target.role === 'correct').map((target) => target.id).join(','))) === 'balloon-0');
  await largeTargets(page, 'landscape play');
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(shots, '02-tiny-pop-landscape.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.tap('balloon-0'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'catch');
  check('a real balloon handler releases the configured first cluster',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState())).activeChips === 1);
  check('debug miss exercises the real gentle-return path', await page.evaluate(() => window.QLOBE_DEBUG.missActiveChip()) === true);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().returnedChips === 1);
  state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('miss does not lower the target or increment the caught count', state.target === 3 && state.caught === 0);
  await page.screenshot({ path: path.join(shots, '03-tiny-gentle-return.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.winRound());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reward');
  state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('Tiny Batch completes to reward with cardinal total 3', state.target === 3 && state.caught === 3 && state.awaitingInput);
  check('reward cookie has exactly 3 authored chip instances', await page.locator('#reward-cookie .cookie-chip').count() === 3);
  check('reward has exactly three authored clay star medallions', await page.locator('.star-row img[src$="star.webp"]').count() === 3);
  await largeTargets(page, 'landscape reward');
  await page.waitForTimeout(1050);
  await page.screenshot({ path: path.join(shots, '04-tiny-reward-landscape.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.home());
  check('play/reward home returns to splash in-page', (await page.evaluate(() => window.QLOBE_DEBUG.getState())).screen === 'splash');

  for (const [modeId, target] of [['baker-batch', 6], ['super-batch', 10]]) {
    await page.evaluate((id) => window.QLOBE_DEBUG.startMode(id), modeId);
    await page.evaluate(() => window.QLOBE_DEBUG.winRound());
    await page.waitForFunction((count) => {
      const value = window.QLOBE_DEBUG.getState();
      return value.screen === 'reward' && value.caught === count;
    }, target);
    check(`${modeId} completes with exact count ${target}`,
      await page.locator('#reward-cookie .cookie-chip').count() === target);
  }
  await page.waitForTimeout(1050);
  await page.screenshot({ path: path.join(shots, '05-super-reward-landscape.png') });
  const audioLog = await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog());
  const spokenKeys = new Set(audioLog.map((entry) => entry.key));
  check('audio log records the core instruction, count, return, and completion beats',
    ['move', 'pop', 'count-1', 'boing', 'count-10', 'complete-10'].every((key) => spokenKeys.has(key)),
    [...spokenKeys].join(','));
  check('unrecorded lines use the safe speech fallback without blocking play',
    audioLog.length > 0 && audioLog.every((entry) => entry.kind === 'speech'));

  const portrait = await session(browser, { width: 768, height: 1024 });
  await largeTargets(portrait.page, 'portrait splash');
  const titleBox = await portrait.page.locator('.title-art').boundingBox();
  check('portrait title remains fully visible', titleBox && titleBox.y >= 0 && titleBox.y + titleBox.height <= 1024,
    titleBox ? `${Math.round(titleBox.y)}–${Math.round(titleBox.y + titleBox.height)}` : 'missing');
  const cardsBox = await portrait.page.locator('#recipe-grid').boundingBox();
  check('portrait keeps all three recipe cards inside the viewport', cardsBox && cardsBox.x >= 0 && cardsBox.x + cardsBox.width <= 768,
    cardsBox ? `${Math.round(cardsBox.x)}–${Math.round(cardsBox.x + cardsBox.width)}` : 'missing');
  await portrait.page.waitForTimeout(900);
  await portrait.page.screenshot({ path: path.join(shots, '06-splash-portrait.png') });
  await portrait.page.evaluate(() => window.QLOBE_DEBUG.startMode('super-batch'));
  await largeTargets(portrait.page, 'portrait play');
  const portraitLayout = await portrait.page.evaluate(() => window.QLOBE_DEBUG.getLayout());
  check('portrait tray stays inside the live field',
    portraitLayout.tray.x >= portraitLayout.field.x && portraitLayout.tray.x + portraitLayout.tray.width <= portraitLayout.field.x + portraitLayout.field.width,
    JSON.stringify(portraitLayout.tray));
  await portrait.page.waitForTimeout(350);
  await portrait.page.screenshot({ path: path.join(shots, '07-super-pop-portrait.png') });
  await portrait.page.evaluate(() => window.QLOBE_DEBUG.winRound());
  await portrait.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reward');
  await largeTargets(portrait.page, 'portrait reward');
  await portrait.page.waitForTimeout(1050);
  await portrait.page.screenshot({ path: path.join(shots, '08-super-reward-portrait.png') });

  const reduced = await session(browser, { width: 1200, height: 900 }, 'reduce');
  await reduced.page.evaluate(() => window.QLOBE_DEBUG.startMode('baker-batch'));
  await reduced.page.evaluate(() => window.QLOBE_DEBUG.winRound());
  await reduced.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reward');
  check('reduced-motion run completes with the same exact quantity',
    (await reduced.page.evaluate(() => window.QLOBE_DEBUG.getState())).caught === 6);
  check('reduced-motion reward creates no moving confetti layer', await reduced.page.locator('.qk-confetti-layer').count() === 0);

  const realAction = await session(browser, { width: 1200, height: 700 });
  await realAction.page.locator('[data-target="play"]').click();
  await realAction.page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'pop');
  const liveBalloon = await realAction.page.locator('.balloon.is-active').boundingBox();
  if (!liveBalloon) throw new Error('real-action balloon has no layout box');
  await realAction.page.mouse.click(liveBalloon.x + liveBalloon.width / 2, liveBalloon.y + liveBalloon.height / 2);
  await realAction.page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'catch');
  check('real balloon click releases a falling chocolate chip',
    (await realAction.page.evaluate(() => window.QLOBE_DEBUG.getState())).activeChips === 1);
  const actionField = await realAction.page.locator('#catch-field').boundingBox();
  const chipX = await realAction.page.locator('.falling-chip').evaluate((node) => Number.parseFloat(node.style.left) / 100);
  if (!actionField) throw new Error('real-action catch field has no layout box');
  await realAction.page.mouse.move(actionField.x + actionField.width * 0.5, actionField.y + actionField.height * 0.5);
  await realAction.page.mouse.down();
  await realAction.page.mouse.move(actionField.x + actionField.width * chipX, actionField.y + actionField.height * 0.5, { steps: 8 });
  await realAction.page.mouse.up();
  await realAction.page.waitForFunction(() => window.QLOBE_DEBUG.getState().caught === 1, null, { timeout: 10000 });
  check('real pointer movement catches the falling chip through tray physics',
    (await realAction.page.evaluate(() => window.QLOBE_DEBUG.getState())).caught === 1);

  const hub = await openSession(browser, {
    url: `${base.replace(/\/$/, '')}/#math-number-sense`,
    base,
    viewport: { width: 1200, height: 900 },
    reducedMotion: 'no-preference',
    allowAbortedMedia: true,
    ready: false,
  });
  const hubTile = hub.page.locator('a[aria-label="Chocolate Chip Count — in progress"]');
  await hubTile.waitFor({ state: 'visible' });
  check('hub exposes the registered Chocolate Chip Count beta tile', await hubTile.count() === 1);
  const hubImage = hubTile.locator('img');
  await hubImage.scrollIntoViewIfNeeded();
  await hubImage.evaluate((node) => { node.loading = 'eager'; });
  await hub.page.waitForFunction((node) => node.complete && node.naturalWidth > 0, await hubImage.elementHandle(), { timeout: 5000 });
  const hubImageSize = await hubImage.evaluate((node) => ({
    complete: node.complete,
    width: node.naturalWidth,
    height: node.naturalHeight,
  }));
  check('hub tile decodes the curated 6:5 image',
    hubImageSize.complete && hubImageSize.width === 640 && hubImageSize.height === 533,
    JSON.stringify(hubImageSize));
  await hub.page.screenshot({ path: path.join(shots, '00-hub.png') });
  await hubTile.click();
  await hub.page.waitForURL(/\/games\/chocolate-chip-count\/$/);
  await boot(hub.page);
  check('hub route boots the game to its ready splash', (await hub.page.evaluate(() => window.QLOBE_DEBUG.getState())).screen === 'splash');

  const allErrors = [...landscape.errors, ...portrait.errors, ...reduced.errors, ...realAction.errors, ...hub.errors];
  const allFailed = [...landscape.failed, ...portrait.failed, ...reduced.failed, ...realAction.failed, ...hub.failed];
  const allRemote = [...landscape.remote, ...portrait.remote, ...reduced.remote, ...realAction.remote, ...hub.remote];
  check('zero unexpected page errors', allErrors.length === 0, allErrors.join(' | '));
  check('zero failed runtime requests or 404s', allFailed.length === 0, allFailed.join(' | '));
  check('zero remote runtime requests', allRemote.length === 0, allRemote.join(' | '));

  await landscape.context.close();
  await portrait.context.close();
  await reduced.context.close();
  await realAction.context.close();
  await hub.context.close();

  const sizes = Object.fromEntries(await Promise.all([
    'bakery.webp', 'title.webp', 'ravi-chef-tray.webp', 'cookie.webp', 'chip.webp',
    'balloon-red.webp', 'balloon-yellow.webp', 'balloon-blue.webp', 'recipe-mint.webp',
    'recipe-yellow.webp', 'recipe-blue.webp', 'button.webp', 'star.webp', 'gesture.webp',
  ].map(async (name) => [name, (await stat(new URL(`../assets/${name}`, import.meta.url))).size])));
  check('bakery backdrop stays below the 300 KB world budget', sizes['bakery.webp'] <= 300_000, `${sizes['bakery.webp']} bytes`);
  check('every foreground production asset stays below 150 KB',
    Object.entries(sizes).filter(([name]) => name !== 'bakery.webp').every(([, size]) => size <= 150_000),
    JSON.stringify(sizes));

  const configText = await readFile(new URL('../config.json', import.meta.url), 'utf8');
  const cssText = await readFile(new URL('../css/style.css', import.meta.url), 'utf8');
  const gameText = await readFile(new URL('../js/game.js', import.meta.url), 'utf8');
  check('runtime config contains no emoji placeholder art', !configText.includes('emoji:'));
  check('child-facing skin contains no CSS gradients pretending to be clay', !/gradient\(/.test(cssText));
  check('primary objects all reference authored raster assets',
    ['bakery.webp', 'ravi-chef-tray.webp', 'cookie.webp', 'chip.webp', 'balloon-red.webp', 'button.webp']
      .every((name) => configText.includes(name) || gameText.includes(name)));
  note(`visual QC screenshots: ${shots}`);
}

const browser = await launchChrome();
try {
  await drive(browser);
} finally {
  await browser.close();
}
finish({ suffix: `; shots in ${shots}` });
