#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  args, launchChrome, createReporter, openSession,
  resolveShots, ensureShots,
} from '../../../tools/qa/lib/driver.mjs';

const base = args.flag('base', 'http://127.0.0.1:8000');
const url = `${base.replace(/\/$/, '')}/games/land-water-tray/`;
const shots = resolveShots('games/land-water-tray/qa-shots/land-explorer');
const { check, note, finish } = createReporter();

async function boot(page, { muted = true } = {}) {
  await page.waitForFunction(() => window.QLOBE_DEBUG?.ready);
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  await page.evaluate(({ muted }) => {
    window.QLOBE_DEBUG.fastTimers();
    window.QLOBE_DEBUG.seed(42);
    window.QLOBE_DEBUG.mute(muted);
    window.QLOBE_DEBUG.clearAudioLog();
  }, { muted });
}

async function session(browser, viewport, reducedMotion = 'no-preference', muted = true) {
  const result = await openSession(browser, {
    url, base, viewport, reducedMotion, allowAbortedMedia: true,
  });
  await boot(result.page, { muted });
  return result;
}

async function assertLargeTargets(page, label) {
  const small = await page.locator('[data-target]').evaluateAll((nodes) => nodes
    .filter((node) => node.getClientRects().length && !node.disabled && getComputedStyle(node).visibility !== 'hidden')
    .map((node) => {
      const rect = node.getBoundingClientRect();
      const before = getComputedStyle(node, '::before');
      const beforeWidth = Number.parseFloat(before.width) || 0;
      const beforeHeight = Number.parseFloat(before.height) || 0;
      return {
        id: node.dataset.target,
        visual: { width: rect.width, height: rect.height },
        effective: { width: Math.max(rect.width, beforeWidth), height: Math.max(rect.height, beforeHeight) },
      };
    })
    .filter(({ effective }) => effective.width < 95.5 || effective.height < 95.5)
    .map(({ id, visual, effective }) => (
      `${id}:${Math.round(visual.width)}×${Math.round(visual.height)}`
      + ` visual/${Math.round(effective.width)}×${Math.round(effective.height)} effective`
    )));
  check(`${label}: every visible child target is at least 96px`, small.length === 0, small.join(', '));
}

async function assertStageInside(page, label) {
  const geometry = await page.locator('.tray-stage:visible').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
  });
  const viewport = page.viewportSize();
  check(`${label}: 4:3 tray remains fully inside the viewport`,
    geometry.x >= -.5 && geometry.y >= -.5 && geometry.right <= viewport.width + .5 && geometry.bottom <= viewport.height + .5,
    JSON.stringify(geometry));
  check(`${label}: tray keeps a 4:3 aspect ratio`, Math.abs(geometry.width / geometry.height - 4 / 3) < .01,
    `${geometry.width}×${geometry.height}`);
  return geometry;
}

async function waitReward(page) {
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().reward === true, null, { timeout: 8000 });
}

async function drive(browser) {
  await ensureShots(shots);
  const landscape = await session(browser, { width: 1180, height: 820 }, 'no-preference', false);
  const page = landscape.page;

  const modes = await page.evaluate(() => window.QLOBE_DEBUG.listModes());
  check('boots to the authored Land Explorer splash',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState())).screen === 'splash');
  check('registers the three promised modes', modes.map(({ id }) => id).join(',') === 'guided,mystery,free');
  check('all splash raster art decodes', await page.locator('img:visible').evaluateAll((images) => images.every((image) => image.naturalWidth > 0)));
  await assertLargeTargets(page, 'landscape splash');
  await assertStageInside(page, 'landscape splash');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.startMode('guided'));
  check('Build Landforms opens the four-card shelf',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState())).screen === 'guided'
      && await page.locator('.shelf-screen .landform-card').count() === 4);
  await assertLargeTargets(page, 'guided shelf');
  await page.screenshot({ path: path.join(shots, '02-guided-shelf.png') });

  await page.locator('[data-qk-screen="guided"] [data-target="landform-island"]').click();
  let state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('real card press opens the island clay board', state.screen === 'play' && state.mode === 'guided' && state.kind === 'island');
  check('guided island starts incomplete with the pour tool active', !state.boardMetrics && state.tool === 'pour');
  await assertLargeTargets(page, 'guided play');
  await page.screenshot({ path: path.join(shots, '03-island-empty.png') });

  const cancelledGesture = await page.evaluate(() => {
    const canvas = document.querySelector('.landform-board__clay');
    const rect = canvas.getBoundingClientRect();
    const pointerId = 73;
    const point = { clientX: rect.x + rect.width * .5, clientY: rect.y + rect.height * .5 };
    const before = window.QLOBE_DEBUG.getBoardMetrics();
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, pointerId, isPrimary: true, pointerType: 'touch', button: 0, ...point,
    }));
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, pointerId, isPrimary: true, pointerType: 'touch', button: 0,
      clientX: point.clientX + rect.width * .25, clientY: point.clientY,
    }));
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true, pointerId, isPrimary: true, pointerType: 'touch', button: 0,
      clientX: point.clientX + rect.width * .25, clientY: point.clientY,
    }));
    return { before, after: window.QLOBE_DEBUG.getBoardMetrics(), state: window.QLOBE_DEBUG.getState() };
  });
  check('pointer cancellation restores the exact field and never reports a gameplay stroke',
    cancelledGesture.after.revision === cancelledGesture.before.revision
      && cancelledGesture.after.volume === cancelledGesture.before.volume
      && cancelledGesture.state.strokeCount === 0
      && cancelledGesture.state.boardMetrics === null,
    JSON.stringify(cancelledGesture));

  await page.locator('[data-target="tool-scoop"]').click();
  check('the real scoop control changes the board tool',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState())).tool === 'scoop');
  await page.locator('[data-target="tool-pour"]').click();
  check('the real pour control changes the board tool back',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState())).tool === 'pour');

  const board = await page.locator('[data-board]').boundingBox();
  if (!board) throw new Error('landform board has no layout box');
  await page.mouse.move(board.x + board.width * .35, board.y + board.height * .50);
  await page.mouse.down();
  await page.mouse.move(board.x + board.width * .65, board.y + board.height * .50, { steps: 18 });
  await page.mouse.up();
  await waitReward(page);
  state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('real pointer stroke reaches semantic island success', state.kind === 'island' && state.boardMetrics?.complete && state.completed.includes('island'));
  check('success waits for the child instead of auto-advancing', state.screen === 'play' && state.awaitingInput === false);
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(shots, '04-island-reward.png') });

  await page.locator('[data-target="continue"]').click();
  for (const kind of ['lake', 'peninsula', 'bay']) {
    await page.evaluate((target) => window.QLOBE_DEBUG.tap(`landform-${target}`), kind);
    check(`${kind}: configured tool selected`,
      (await page.evaluate(() => window.QLOBE_DEBUG.getState())).tool === (kind === 'lake' || kind === 'bay' ? 'scoop' : 'pour'));
    await page.evaluate(() => window.QLOBE_DEBUG.winRound());
    await waitReward(page);
    state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    check(`${kind}: semantic completion is accepted`, state.kind === kind && state.boardMetrics?.complete);
    if (kind !== 'bay') await page.evaluate(() => window.QLOBE_DEBUG.tap('continue'));
  }
  await page.screenshot({ path: path.join(shots, '05-bay-reward.png') });
  await page.evaluate(() => window.QLOBE_DEBUG.tap('continue'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end');
  check('four completed builds reach the end celebration',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState())).completed.length === 4);
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(shots, '06-guided-end.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.tap('again'));
  state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('play again returns to a fresh guided shelf',
    state.screen === 'guided' && state.mode === 'guided' && state.kind === null
      && state.completed.length === 0 && state.round === 0 && state.strokeCount === 0
      && state.awaitingInput && !state.inputLocked && !state.reward && state.boardMetrics === null,
    JSON.stringify(state));

  await page.evaluate(() => window.QLOBE_DEBUG.home());
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('mystery'));
  state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  const wrong = ['island', 'lake', 'peninsula', 'bay'].find((kind) => kind !== state.mysteryAnswer);
  check('Mystery Maps exposes exactly one truthful correct target',
    (await page.evaluate(() => window.QLOBE_DEBUG.getTargets().filter((item) => item.role === 'correct').length)) === 1);
  check('a wrong Mystery Map remains a gentle retry', await page.evaluate((id) => window.QLOBE_DEBUG.tap(`landform-${id}`), wrong) === true);
  state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('wrong Mystery Map does not advance or lock the round', state.round === 0 && state.awaitingInput && !state.inputLocked);
  await page.screenshot({ path: path.join(shots, '07-mystery-clue.png') });
  for (let round = 0; round < 4; round += 1) {
    await page.evaluate(() => window.QLOBE_DEBUG.winRound());
    if (round < 3) await page.waitForFunction((expected) => window.QLOBE_DEBUG.getState().round === expected, round + 1);
  }
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end');
  check('Mystery Maps presents every landform exactly once',
    new Set(await page.evaluate(() => window.QLOBE_DEBUG.getState().mysteryOrder)).size === 4);
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(shots, '08-mystery-end.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.home());
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('free'));
  const idleHint = await page.evaluate(() => {
    const before = window.QLOBE_DEBUG.getAudioLog().length;
    const triggered = window.QLOBE_DEBUG.triggerIdleHint();
    const log = window.QLOBE_DEBUG.getAudioLog();
    return {
      triggered,
      entry: log.at(-1),
      added: log.length === before + 1,
      highlighted: document.querySelector('.tool-pour')?.classList.contains('is-hinting'),
    };
  });
  check('Free Explorer idle help speaks gently and highlights the active clay tool',
    idleHint.triggered && idleHint.added && idleHint.entry?.key === 'idle' && idleHint.highlighted,
    JSON.stringify(idleHint));
  const emptyScoopResults = await page.evaluate(() => Array.from({ length: 3 }, () => (
    window.QLOBE_DEBUG.applyStroke([{ x: .5, y: .5 }], 'scoop')
  )));
  state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('three empty scoops remain no-ops and do not earn sailing progress',
    emptyScoopResults.every((result) => result.changed === false) && state.strokeCount === 0,
    JSON.stringify({ changed: emptyScoopResults.map(({ changed }) => changed), strokeCount: state.strokeCount }));
  const prematureSail = await page.evaluate(() => window.QLOBE_DEBUG.tap('sail'));
  state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('three no-op scoops cannot launch the boat',
    prematureSail === true && !state.inputLocked && state.awaitingInput && state.strokeCount === 0,
    JSON.stringify(state));
  await page.evaluate(() => window.QLOBE_DEBUG.winRound());
  state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('Free Explorer accepts an invented coast and launches the boat', state.screen === 'play' && state.mode === 'free' && state.strokeCount >= 3 && state.inputLocked);
  await page.waitForTimeout(60);
  await page.screenshot({ path: path.join(shots, '09-free-sailing.png') });
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().inputLocked === false);
  check('free sailing returns control without a score or end gate', (await page.evaluate(() => window.QLOBE_DEBUG.getState())).awaitingInput);

  const audioLog = await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog());
  const audioKeys = new Set(audioLog.map(({ key }) => key));
  check('audio log records guided, mystery, and free-play beats',
    ['island-prompt', 'made-island', 'mystery-nudge', 'mystery-cheer', 'free-intro', 'sail-ready']
      .every((key) => audioKeys.has(key)), [...audioKeys].join(','));
  const requiredClipKeys = ['island-prompt', 'mystery-cheer', 'free-intro'];
  const requiredClipEntries = requiredClipKeys.map((key) => audioLog.find((entry) => entry.key === key));
  check('core spoken beats use transcript-QA recorded clips',
    requiredClipEntries.every((entry) => entry?.kind === 'clip'),
    JSON.stringify(requiredClipEntries));
  const islandFallback = audioLog.find((entry) => entry.key === 'island-clue');
  check('the rejected island-clue take uses the exact device-speech fallback',
    islandFallback?.kind === 'speech' && islandFallback.text === 'An island is land with water all around it.',
    JSON.stringify(islandFallback));

  const portrait = await session(browser, { width: 820, height: 1180 });
  await assertLargeTargets(portrait.page, 'portrait splash');
  const portraitSplashStage = await assertStageInside(portrait.page, 'portrait splash');
  const portraitModeOverlaps = await portrait.page.locator('.mode-plaque:visible').evaluateAll((cards) => cards
    .map((card) => {
      const title = card.querySelector('.qk-mode-title')?.getBoundingClientRect();
      const kicker = card.querySelector('small')?.getBoundingClientRect();
      return title && kicker && title.bottom > kicker.top ? card.dataset.mode : null;
    }).filter(Boolean));
  check('portrait mode titles do not collide with their kickers', portraitModeOverlaps.length === 0,
    portraitModeOverlaps.join(','));
  await portrait.page.screenshot({ path: path.join(shots, '10-splash-portrait.png') });
  await portrait.page.evaluate(() => window.QLOBE_DEBUG.startMode('free'));
  await assertLargeTargets(portrait.page, 'portrait free play');
  const portraitPlayStage = await assertStageInside(portrait.page, 'portrait free play');
  check('portrait tray does not jump when play starts',
    Math.abs(portraitSplashStage.x - portraitPlayStage.x) < .5
      && Math.abs(portraitSplashStage.y - portraitPlayStage.y) < .5
      && Math.abs(portraitSplashStage.width - portraitPlayStage.width) < .5
      && Math.abs(portraitSplashStage.height - portraitPlayStage.height) < .5,
    JSON.stringify({ splash: portraitSplashStage, play: portraitPlayStage }));
  const portraitBoard = await portrait.page.locator('[data-board]').boundingBox();
  check('portrait preserves a useful live basin', portraitBoard && portraitBoard.width > 600 && portraitBoard.height > 260,
    JSON.stringify(portraitBoard));
  const clippedToolLabels = await portrait.page.locator('.tool-button > span:visible').evaluateAll((labels) => {
    const visibleStage = [...document.querySelectorAll('.tray-stage')].find((node) => node.getClientRects().length);
    const stage = visibleStage?.getBoundingClientRect();
    return labels.map((label) => ({ text: label.textContent, rect: label.getBoundingClientRect() }))
      .filter(({ rect }) => !stage || rect.top < stage.top || rect.bottom > stage.bottom)
      .map(({ text }) => text);
  });
  check('portrait tool labels stay inside the authored tray', clippedToolLabels.length === 0,
    clippedToolLabels.join(','));
  await portrait.page.screenshot({ path: path.join(shots, '11-free-portrait.png') });

  const compact = await session(browser, { width: 1180, height: 520 }, 'reduce');
  await assertLargeTargets(compact.page, 'wide-short reduced splash');
  await compact.page.evaluate(() => window.QLOBE_DEBUG.startMode('guided'));
  await compact.page.evaluate(() => window.QLOBE_DEBUG.tap('landform-peninsula'));
  await compact.page.evaluate(() => window.QLOBE_DEBUG.winRound());
  await waitReward(compact.page);
  check('reduced-motion reaches the same semantic reward',
    (await compact.page.evaluate(() => window.QLOBE_DEBUG.getState())).boardMetrics?.complete);
  check('reduced-motion produces no moving confetti', await compact.page.locator('.qk-confetti-layer').count() === 0);
  await assertLargeTargets(compact.page, 'wide-short reduced reward');
  await compact.page.screenshot({ path: path.join(shots, '12-reduced-wide-reward.png') });

  const hub = await openSession(browser, {
    url: `${base.replace(/\/$/, '')}/#culture-geography`, base,
    viewport: { width: 1180, height: 820 }, reducedMotion: 'no-preference',
    allowAbortedMedia: true, ready: false,
  });
  const hubTile = hub.page.locator('a').filter({ has: hub.page.locator('img[src$="land-water-tray.jpg"]') });
  await hubTile.first().waitFor({ state: 'visible' });
  const hubImage = hub.page.locator('img[src$="land-water-tray.jpg"]');
  await hubImage.evaluate((node) => { node.loading = 'eager'; });
  await hub.page.waitForFunction((node) => node.complete && node.naturalWidth > 0, await hubImage.elementHandle());
  const hubSize = await hubImage.evaluate((node) => ({ width: node.naturalWidth, height: node.naturalHeight }));
  check('hub decodes the curated Land Explorer 6:5 tile', hubSize.width === 640 && hubSize.height === 533, JSON.stringify(hubSize));
  await hubImage.scrollIntoViewIfNeeded();
  await hub.page.screenshot({ path: path.join(shots, '00-hub.png') });
  await hubTile.first().click();
  await boot(hub.page);
  check('hub route boots the production game', (await hub.page.evaluate(() => window.QLOBE_DEBUG.getState())).screen === 'splash');

  const sessions = [landscape, portrait, compact, hub];
  const errors = sessions.flatMap((item) => item.errors);
  const failed = sessions.flatMap((item) => item.failed);
  const remote = sessions.flatMap((item) => item.remote);
  check('zero unexpected page errors', errors.length === 0, errors.join(' | '));
  check('zero failed runtime requests or 404s', failed.length === 0, failed.join(' | '));
  check('zero remote runtime requests', remote.length === 0, remote.join(' | '));

  for (const item of sessions) await item.context.close();

  const runtimeAssets = [
    'assets/scenes/tray.webp', 'assets/ui/title.webp', 'assets/ui/card-island.webp',
    'assets/ui/card-lake.webp', 'assets/ui/card-peninsula.webp', 'assets/ui/card-bay.webp',
    'assets/ui/clay-lump.webp', 'assets/ui/scoop.webp', 'assets/ui/action-plaque.webp',
    'assets/world/boat.webp', 'assets/world/fish.webp', 'assets/world/turtle.webp',
  ];
  const sizes = Object.fromEntries(await Promise.all(runtimeAssets.map(async (name) => [name, (await stat(new URL(`../${name}`, import.meta.url))).size])));
  check('tray plate stays under the 300 KB scene budget', sizes['assets/scenes/tray.webp'] <= 300_000,
    `${sizes['assets/scenes/tray.webp']} bytes`);
  check('every foreground raster stays under 150 KB',
    Object.entries(sizes).filter(([name]) => name !== 'assets/scenes/tray.webp').every(([, size]) => size <= 150_000),
    JSON.stringify(sizes));
  const css = await readFile(new URL('../css/style.css', import.meta.url), 'utf8');
  const main = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');
  const configText = await readFile(new URL('../config.json', import.meta.url), 'utf8');
  check('child-facing skin contains no CSS gradients pretending to be art', !/gradient\(/.test(css));
  check('runtime config contains no emoji placeholder art', !configText.includes('emoji:'));
  check('every primary object is a generated raster asset',
    ['tray.webp', 'title.webp', 'clay-lump.webp', 'scoop.webp', 'boat.webp', 'fish.webp', 'turtle.webp']
      .every((name) => main.includes(name) || configText.includes(name)));
  note(`visual QC screenshots: ${shots}`);
}

const browser = await launchChrome();
try {
  await drive(browser);
} finally {
  await browser.close();
}
finish({ suffix: `; screenshots in ${shots}` });
