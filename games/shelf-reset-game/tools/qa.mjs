#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  args, audio, baseUrl, checkSessionClean, createReporter, debug, dragBetween,
  ensureShots, launchChrome, openSession, resolveShots, shooter, targetSizes,
  undersized,
} from '../../../tools/qa/lib/driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..');
const BASE = baseUrl('http://127.0.0.1:4173');
const URL = `${BASE}/games/shelf-reset-game/`;
const SHOTS = await ensureShots(resolveShots(path.join(GAME, 'qa-shots')));
const shot = shooter(SHOTS);
const { check, finish } = createReporter({ style: 'pad' });
const modeIds = ['art', 'blocks', 'nature'];
const analytics = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];

function open(browser, viewport, reducedMotion = 'no-preference', context = {}) {
  return openSession(browser, {
    url: URL,
    base: BASE,
    viewport,
    reducedMotion,
    context,
    allowAbortedMedia: true,
    allowRemote: analytics,
  });
}

async function auditControls(page, label) {
  const sizes = await targetSizes(
    page,
    '.shelf-card, .loose-item:not(.is-placed), .shelf-bin, .again-button, .qk-hud-btn',
  );
  const small = undersized(sizes, 96);
  check(`${label} primary controls are at least 96px`, small.length === 0, JSON.stringify(small));
}

async function auditViewport(page, label) {
  const result = await page.evaluate(() => {
    const viewport = { w: innerWidth, h: innerHeight };
    const overflowing = [...document.querySelectorAll(
      '.shelf-card, .loose-item:not(.is-placed), .shelf-bin, .again-button, .qk-hud-btn',
    )].filter((node) => node.getClientRects().length).map((node) => {
      const rect = node.getBoundingClientRect();
      return { id: node.dataset.target || node.className, x: rect.x, y: rect.y, r: rect.right, b: rect.bottom };
    }).filter((rect) => rect.x < -2 || rect.y < -2 || rect.r > viewport.w + 2 || rect.b > viewport.h + 2);
    return {
      viewport,
      overflowing,
      scroll: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
    };
  });
  check(`${label} keeps every control inside the viewport`, result.overflowing.length === 0, JSON.stringify(result));
  check(`${label} has no document scroll overflow`, result.scroll.w <= result.viewport.w && result.scroll.h <= result.viewport.h, JSON.stringify(result));
}

function checkClean(session, label) {
  const kept = session.failed.filter((entry) => !analytics.some((prefix) => entry.startsWith(prefix)));
  session.failed.splice(0, session.failed.length, ...kept);
  checkSessionClean({ check }, session, label);
}

async function waitPlaced(page, itemId) {
  await page.waitForFunction(
    (id) => window.QLOBE_DEBUG.getState().items.find((item) => item.id === id)?.placed === true,
    itemId,
  );
}

async function main() {
  const browser = await launchChrome({ channel: args.flag('channel', 'chrome') });
  try {
    const landscape = await open(browser, { width: 1440, height: 900 });
    const { page } = landscape;
    await shot(page, '01-splash-landscape.png');
    const initial = await debug.getState(page);
    check('boots on the shelf chooser', initial.screen === 'splash' && initial.phase === 'choose', JSON.stringify(initial));
    const modes = await debug.listModes(page);
    check('debug lists Art, Blocks, and Nature', modeIds.every((id) => modes.some((mode) => mode.id === id)), JSON.stringify(modes));
    check('splash has three visible raster shelf cards', await page.locator('.shelf-card:visible > img').count() === 3);
    await auditControls(page, 'landscape splash');
    await auditViewport(page, 'landscape splash');

    await page.locator('[data-shelf="art"]').click();
    await debug.waitForScreen(page, 'play');
    await page.waitForTimeout(900);
    let state = await debug.getState(page);
    check('real card press starts Art Shelf with six objects and three homes',
      state.shelfId === 'art' && state.items.length === 6 && state.bins.length === 3 && state.placedCount === 0,
      JSON.stringify(state));
    const activeMusic = await debug.call(page, 'musicStats');
    check('music starts with the Shelf Reset track during play',
      activeMusic.playing && activeMusic.key === 'shelf-reset' && /mug-and-sunbeam\.mp3$/.test(activeMusic.url || ''),
      JSON.stringify(activeMusic));
    await shot(page, '02-art-play-landscape.png');
    await auditControls(page, 'landscape play');
    await auditViewport(page, 'landscape play');

    const first = state.items.find((item) => !item.placed);
    const wrong = state.bins.find((bin) => bin.id !== first.home);
    await page.locator(`[data-item="${first.id}"]`).click();
    await page.locator(`[data-bin="${wrong.id}"]`).click();
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().wrongAttempts === 1);
    state = await debug.getState(page);
    check('wrong home keeps the object and increments gentle recovery',
      state.placedCount === 0 && !state.items.find((item) => item.id === first.id).placed && state.selectedId === first.id,
      JSON.stringify(state));
    await shot(page, '03-wrong-home-landscape.png');

    await page.locator(`[data-bin="${first.home}"]`).click();
    await waitPlaced(page, first.id);
    check('tap-to-place uses the correct picture home', (await debug.getState(page)).placedCount === 1);

    state = await debug.getState(page);
    const second = state.items.find((item) => !item.placed);
    const from = await page.locator(`[data-item="${second.id}"]`).boundingBox();
    const to = await page.locator(`[data-bin="${second.home}"]`).boundingBox();
    check('real drag endpoints exist', Boolean(from && to), JSON.stringify({ from, to }));
    if (from && to) {
      await dragBetween(page, from, to, { steps: 14 });
      await waitPlaced(page, second.id);
    }
    state = await debug.getState(page);
    check('real mouse drag places a second object', state.placedCount === 2, JSON.stringify(state));
    const remainingDom = await page.locator('.loose-item').evaluateAll((nodes) => nodes.map((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        id: node.dataset.item,
        placed: node.classList.contains('is-placed'),
        lifting: node.classList.contains('is-lifting'),
        opacity: style.opacity,
        visibility: style.visibility,
        display: style.display,
        rect: { w: rect.width, h: rect.height },
      };
    }));
    const visibleRemaining = remainingDom.filter((item) => !item.placed
      && item.visibility === 'visible' && item.display !== 'none' && Number(item.opacity) > 0.9);
    check('partial shelf keeps all four remaining tray objects visible', visibleRemaining.length === 4, JSON.stringify(remainingDom));
    await shot(page, '04-art-partial-landscape.png');

    await debug.fastTimers(page, 20);
    await debug.winRound(page);
    await debug.waitForScreen(page, 'reward', { timeout: 7000 });
    await page.waitForTimeout(850);
    state = await debug.getState(page);
    check('Art Shelf reaches the stocked-shelf reward', state.screen === 'reward' && state.placedCount === 6, JSON.stringify(state));
    check('reward visibly shows six stored objects', await page.locator('.reward-bin .stored-items img').count() === 6);
    check('reward visibly shows an empty tray and cheering Sunny',
      await page.locator('.empty-tray:visible').count() === 1 && await page.locator('.sunny-cheer:visible').count() === 1);
    await shot(page, '05-art-reward-landscape.png');
    await auditControls(page, 'landscape reward');
    await auditViewport(page, 'landscape reward');

    const log = await debug.getAudioLog(page);
    check('Art prompt uses a recorded teacher clip', audio.heardClip(log, 'art-prompt'), audio.describe(log));
    check('completion uses a recorded teacher clip', audio.heardClip(log, 'art-cheer'), audio.describe(log));
    const rewardMusic = await debug.call(page, 'musicStats');
    check('music stops for the reward narration',
      !rewardMusic.playing && rewardMusic.key === null && rewardMusic.url === null,
      JSON.stringify(rewardMusic));

    await page.locator('[data-action="again"]').click();
    await debug.waitForScreen(page, 'play');
    check('Again replays the same shelf', (await debug.getState(page)).shelfId === 'art');
    await page.locator('.reset-play .qk-hud-back').click();
    await debug.waitForScreen(page, 'splash');
    check('Back returns in-page to the chooser', (await debug.getState(page)).screen === 'splash');

    for (const mode of ['blocks', 'nature']) {
      check(`${mode} mode starts`, await debug.startMode(page, mode));
      await debug.waitForScreen(page, 'play');
      await page.waitForTimeout(650);
      state = await debug.getState(page);
      const homeCounts = Object.fromEntries(state.bins.map((bin) => [
        bin.id,
        state.items.filter((item) => item.home === bin.id).length,
      ]));
      check(`${mode} has two objects for each picture home`,
        Object.values(homeCounts).every((count) => count === 2),
        JSON.stringify(homeCounts));
      await shot(page, mode === 'blocks' ? '06-blocks-play-landscape.png' : '08-nature-play-landscape.png');
      await debug.winRound(page);
      await debug.waitForScreen(page, 'reward', { timeout: 7000 });
      await page.waitForTimeout(850);
      check(`${mode} reaches reward`, (await debug.getState(page)).placedCount === 6);
      await shot(page, mode === 'blocks' ? '07-blocks-reward-landscape.png' : '09-nature-reward-landscape.png');
    }
    checkClean(landscape, 'landscape session');
    await landscape.close();

    const portrait = await open(browser, { width: 820, height: 1180 }, 'reduce');
    await debug.mute(portrait.page, true);
    await shot(portrait.page, '10-splash-portrait-reduced.png');
    await auditControls(portrait.page, 'portrait splash');
    await auditViewport(portrait.page, 'portrait splash');
    await debug.startMode(portrait.page, 'blocks');
    await debug.waitForScreen(portrait.page, 'play');
    await portrait.page.waitForTimeout(650);
    await shot(portrait.page, '11-blocks-play-portrait-reduced.png');
    await auditControls(portrait.page, 'portrait play');
    await auditViewport(portrait.page, 'portrait play');
    check('portrait uses a two-row object tray', await portrait.page.locator('.loose-items').evaluate((node) => getComputedStyle(node).gridTemplateRows.split(' ').length >= 2));
    await debug.fastTimers(portrait.page, 20);
    await debug.winRound(portrait.page);
    await debug.waitForScreen(portrait.page, 'reward', { timeout: 7000 });
    await portrait.page.waitForTimeout(850);
    await shot(portrait.page, '12-blocks-reward-portrait-reduced.png');
    await auditControls(portrait.page, 'portrait reward');
    await auditViewport(portrait.page, 'portrait reward');
    checkClean(portrait, 'portrait reduced-motion session');
    await portrait.close();

    const compact = await open(browser, { width: 1180, height: 620 });
    await debug.mute(compact.page, true);
    await debug.startMode(compact.page, 'nature');
    await debug.waitForScreen(compact.page, 'play');
    await compact.page.waitForTimeout(650);
    await shot(compact.page, '13-nature-play-compact.png');
    await auditControls(compact.page, 'compact play');
    await auditViewport(compact.page, 'compact play');
    checkClean(compact, 'compact session');
    await compact.close();
  } finally {
    await browser.close();
  }
  finish({ suffix: `; shots in ${SHOTS}` });
}

await main();
