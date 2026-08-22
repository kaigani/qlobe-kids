#!/usr/bin/env node
// Real-Chrome smoke, interaction and visual-QC driver for Clean-Up Timer Quest.

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  baseUrl, launchChrome, createReporter, openSession, checkSessionClean,
  resolveShots, ensureShots, debug,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const url = `${base}/games/cleanup-timer-quest/`;
const shots = resolveShots('qa-shots/cleanup-timer-quest');
const { check, finish } = createReporter();
const sessions = [];
const repoRoot = path.resolve(import.meta.dirname, '../../..');
const config = JSON.parse(await readFile(path.join(repoRoot, 'games/cleanup-timer-quest/config.json'), 'utf8'));
const metadata = JSON.parse(await readFile(path.join(repoRoot, 'games/cleanup-timer-quest/game.json'), 'utf8'));
const registry = JSON.parse(await readFile(path.join(repoRoot, 'games.json'), 'utf8'));
const expectedVoiceKeys = Object.keys(config.voice).sort();
const analytics = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];

async function openGame(browser, viewport, reducedMotion = 'no-preference') {
  const session = await openSession(browser, {
    url,
    base,
    viewport,
    reducedMotion,
    allowAbortedMedia: true,
    allowRemote: analytics,
    // Analytics is allowed to be unavailable in local QA. HTTP failures are
    // still captured below, while aborted third-party requests are ignored.
    captureRequestFailures: false,
    seed: 42,
    mute: true,
  });
  sessions.push(session);
  return session.page;
}

function onScreen(rect, viewport) {
  return rect.x >= -0.5 && rect.y >= -0.5
    && rect.x + rect.w <= viewport.width + 0.5
    && rect.y + rect.h <= viewport.height + 0.5;
}

function targetsDoNotOverlap(targets, role = 'piece') {
  const rects = targets.filter((target) => target.role === role).map(({ rect }) => rect);
  return rects.every((a, index) => rects.slice(index + 1).every((b) =>
    a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y));
}

async function visibleImagesDecode(page) {
  return page.locator('img:visible').evaluateAll((images) => images.every((image) =>
    image.complete && image.naturalWidth > 0 && image.naturalHeight > 0));
}

async function main() {
  await ensureShots(shots);

  const registryGame = registry.games.find((game) => game.id === metadata.id);
  check('manifest and registry expose the same three room rescues',
    metadata.modes.map(({ id }) => id).join(',') === 'playroom,bedroom,living-room'
      && registryGame?.modes?.map(({ id }) => id).join(',') === 'playroom,bedroom,living-room');
  check('stub status is replaced by a playable beta', metadata.status === 'beta' && registryGame?.status === 'beta');
  check('hub points at the curated Clean-Up Timer Quest tile',
    registryGame?.icon === 'assets/hub/tiles/cleanup-timer-quest.jpg');

  const browser = await launchChrome({ channel: 'chrome' });
  try {
    const page = await openGame(browser, { width: 1280, height: 800 });
    let state = await debug.getState(page);
    check('splash boots into the custom room chooser', state.screen === 'splash' && state.phase === 'choose');
    check('debug hook lists the three configured rooms',
      (await debug.listModes(page)).map(({ id }) => id).join(',') === 'playroom,bedroom,living-room');
    check('splash uses the raster title and three authored room previews',
      await page.locator('.title-art').count() === 1 && await page.locator('.room-card img').count() === 3);
    check('every visible splash image decodes', await visibleImagesDecode(page));
    const splashTargets = await debug.getTargets(page);
    check('splash touch targets meet the 96px platform floor',
      splashTargets.length === 4 && splashTargets.every(({ rect }) => rect.w >= 96 && rect.h >= 96),
      JSON.stringify(splashTargets));
    await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

    await page.locator('[data-room="playroom"]').click();
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'play');
    await page.waitForTimeout(950);
    state = await debug.getState(page);
    check('first Playroom deal is the authored two-plush/two-block tutorial set',
      state.items.map(({ id }) => id).join(',') === 'teddy,bunny,red-cube,blue-arch');
    check('play exposes four objects and two picture-marked homes',
      state.items.length === 4 && state.bins.length === 2 && await page.locator('.quest-bin .bin-art').count() === 2);
    check('every visible play image decodes', await visibleImagesDecode(page));
    let playTargets = await debug.getTargets(page);
    check('all play controls meet the 96px touch floor',
      playTargets.length === 8 && playTargets.every(({ rect }) => rect.w >= 96 && rect.h >= 96),
      JSON.stringify(playTargets));
    await page.screenshot({ path: path.join(shots, '02-playroom-play.png') });

    const firstItem = state.items[0];
    const wrongBin = state.bins.find((bin) => bin.category !== firstItem.category);
    await page.locator(`[data-item="${firstItem.id}"]`).click();
    await page.locator(`[data-item="${firstItem.id}"]`).click();
    state = await debug.getState(page);
    check('tapping the selected object again clears its picture-home hint',
      state.selectedId === null && await page.locator('.quest-bin.is-hinted').count() === 0);
    await page.locator(`[data-item="${firstItem.id}"]`).click();
    await page.locator(`[data-bin="${wrongBin.id}"]`).click();
    state = await debug.getState(page);
    check('wrong picture-home attempt is gentle and does not advance',
      state.placedCount === 0 && state.selectedId === firstItem.id
        && await page.locator('.quest-bin.is-wrong').count() === 1);

    const correctBin = state.bins.find((bin) => bin.category === firstItem.category);
    await page.locator(`[data-bin="${correctBin.id}"]`).click();
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().placedCount === 1);
    check('tap object then tap picture-home places through the primary path',
      (await debug.getState(page)).items.find(({ id }) => id === firstItem.id)?.placed === true);

    state = await debug.getState(page);
    const dragItem = state.items.find((item) => !item.placed);
    const dragBin = state.bins.find((bin) => bin.category === dragItem.category);
    const from = await page.locator(`[data-item="${dragItem.id}"]`).boundingBox();
    const to = await page.locator(`[data-bin="${dragBin.id}"]`).boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 70, from.y + from.height / 2 - 35, { steps: 6 });
    const ghost = await page.locator('[data-qk-drag-ghost]').boundingBox();
    check('real pointer drag lifts a raster toy ghost under the finger', Boolean(ghost), JSON.stringify(ghost));
    await page.screenshot({ path: path.join(shots, '03-pointer-drag.png') });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().placedCount === 2);
    check('real pointer drop uses the same correct-home path', true);

    const beforeExtension = (await debug.getState(page)).extensions;
    await debug.call(page, 'expireTimer');
    state = await debug.getState(page);
    check('timer expiry adds calm music time without failure or lost progress',
      state.screen === 'play' && state.extensions === beforeExtension + 1
        && state.remainingSec === config.timer.extensionSec && state.placedCount === 2,
      JSON.stringify(state));

    await debug.winRound(page);
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reward');
    await page.waitForTimeout(1100);
    state = await debug.getState(page);
    check('all four objects reach an open-ended sparkling reward',
      state.placedCount === 4 && state.items.every(({ placed }) => placed));
    check('reward offers replay plus all three room choices',
      await page.locator('[data-action="again"]').count() === 1 && await page.locator('.reward-room-deck .room-card').count() === 3);
    check('reward keeps all visible raster art decoded', await visibleImagesDecode(page));
    const packedBins = await page.locator('.reward-bin').evaluateAll((bins) => bins.every((bin) => {
      const stored = bin.querySelector('.stored-items');
      const art = bin.querySelector(':scope > img');
      const storedRect = stored?.getBoundingClientRect();
      const artRect = art?.getBoundingClientRect();
      return stored?.querySelectorAll('img').length === 2
        && Number(getComputedStyle(stored).zIndex) > Number(getComputedStyle(art).zIndex)
        && storedRect?.top < artRect?.top + artRect?.height * .4;
    }));
    check('reward composites two visibly peeking toys above each bin front', packedBins);
    await page.screenshot({ path: path.join(shots, '04-playroom-reward.png') });

    await debug.startMode(page, 'bedroom');
    await page.waitForTimeout(950);
    state = await debug.getState(page);
    check('Bedroom rescue deals two clothes and two books',
      state.screen === 'play' && state.items.filter(({ category }) => category === 'clothes').length === 2
        && state.items.filter(({ category }) => category === 'books').length === 2);
    await page.screenshot({ path: path.join(shots, '05-bedroom-play.png') });
    await debug.winRound(page);
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reward');

    await debug.startMode(page, 'living-room');
    await page.waitForTimeout(950);
    state = await debug.getState(page);
    check('Living Room rescue deals two wheeled toys and two music toys',
      state.screen === 'play' && state.items.filter(({ category }) => category === 'wheels').length === 2
        && state.items.filter(({ category }) => category === 'music').length === 2);
    await page.screenshot({ path: path.join(shots, '06-living-room-play.png') });

    const voicePack = await page.evaluate(async () => {
      const [manifestResponse, linesResponse] = await Promise.all([
        fetch('./assets/audio/manifest.json'),
        fetch('./assets/audio/lines.json'),
      ]);
      if (!manifestResponse.ok || !linesResponse.ok) return { missing: true };
      const [manifest, lines] = await Promise.all([manifestResponse.json(), linesResponse.json()]);
      const issues = [];
      const context = new OfflineAudioContext(1, 1, 44100);
      for (const [key, entry] of Object.entries(manifest)) {
        try {
          const response = await fetch(`./assets/audio/${entry.file}`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const decoded = await context.decodeAudioData(await response.arrayBuffer());
          if (!(decoded.duration > .2) || Math.abs(decoded.duration - entry.dur) > .12) {
            throw new Error(`duration ${decoded.duration}`);
          }
        } catch (error) {
          issues.push(`${key}: ${error.message}`);
        }
      }
      return { keys: Object.keys(manifest).sort(), lineKeys: Object.keys(lines).sort(), issues };
    });
    check('all 20 approved teacher-voice lines ship in manifest and fallback table',
      !voicePack.missing && voicePack.keys.join(',') === expectedVoiceKeys.join(',')
        && voicePack.lineKeys.join(',') === expectedVoiceKeys.join(','), JSON.stringify(voicePack));
    check('every recorded teacher clip decodes with its manifest duration',
      !voicePack.missing && voicePack.issues.length === 0, voicePack.issues?.join('; '));

    const portrait = await openGame(browser, { width: 820, height: 1180 });
    await portrait.screenshot({ path: path.join(shots, '07-splash-portrait.png') });
    const portraitCards = await portrait.locator('.room-card').evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().toJSON()));
    check('portrait room cards remain large and fully on screen',
      portraitCards.length === 3 && portraitCards.every((rect) =>
        rect.width >= 96 && rect.height >= 96 && rect.left >= 0 && rect.right <= 820 && rect.bottom <= 1180),
      JSON.stringify(portraitCards));
    await debug.startMode(portrait, 'bedroom');
    await portrait.waitForTimeout(950);
    const portraitTargets = await debug.getTargets(portrait);
    check('portrait play controls remain visible with 96px targets',
      portraitTargets.length === 8 && portraitTargets.every(({ rect }) => rect.w >= 96 && rect.h >= 96 && onScreen(rect, { width: 820, height: 1180 })),
      JSON.stringify(portraitTargets));
    check('portrait object targets occupy four separate touch lanes',
      targetsDoNotOverlap(portraitTargets), JSON.stringify(portraitTargets.filter(({ role }) => role === 'piece')));
    await portrait.screenshot({ path: path.join(shots, '08-bedroom-portrait.png') });

    const short = await openGame(browser, { width: 1180, height: 520 });
    await debug.startMode(short, 'living-room');
    await short.waitForTimeout(950);
    const shortTargets = await debug.getTargets(short);
    check('short landscape play controls stay fully on screen and finger-sized',
      shortTargets.length === 8 && shortTargets.every(({ rect }) => rect.w >= 96 && rect.h >= 96 && onScreen(rect, { width: 1180, height: 520 })),
      JSON.stringify(shortTargets));
    await short.screenshot({ path: path.join(shots, '09-living-room-short.png') });

    const reduced = await openGame(browser, { width: 1024, height: 768 }, 'reduce');
    await debug.startMode(reduced, 'playroom');
    await debug.winRound(reduced);
    await reduced.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reward');
    check('reduced-motion play completes without animation dependence', true);

    const race = await openGame(browser, { width: 1280, height: 800 });
    await debug.startMode(race, 'playroom');
    let raceState = await debug.getState(race);
    for (const item of raceState.items.slice(0, 3)) {
      await debug.tap(race, `item-${item.id}`);
      await debug.tap(race, `bin-${item.category}`);
    }
    raceState = await debug.getState(race);
    const lastItem = raceState.items.find(({ placed }) => !placed);
    await race.locator(`[data-item="${lastItem.id}"]`).click();
    await race.locator(`[data-bin][data-category="${lastItem.category}"]`).click();
    await race.locator('[data-target="back"]').click();
    await race.waitForTimeout(1400);
    raceState = await debug.getState(race);
    check('Back during the final landing cancels the stale reward continuation',
      raceState.screen === 'splash' && raceState.phase === 'choose' && raceState.roomId === null,
      JSON.stringify(raceState));

    const keyboard = await openGame(browser, { width: 1024, height: 768 });
    await debug.startMode(keyboard, 'bedroom');
    for (let placed = 0; placed < 4; placed += 1) {
      const keyboardState = await debug.getState(keyboard);
      const item = keyboardState.items.find((entry) => !entry.placed);
      await keyboard.locator(`[data-item="${item.id}"]`).press('Enter');
      await keyboard.locator(`[data-bin][data-category="${item.category}"]`).press('Enter');
      await keyboard.waitForFunction((count) => window.QLOBE_DEBUG.getState().placedCount === count, placed + 1);
    }
    await keyboard.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reward');
    check('keyboard-only object and picture-home activation completes a room', true);

    for (const session of sessions) checkSessionClean({ check }, session);
  } finally {
    await browser.close();
  }
  finish({ listFailures: false });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
