#!/usr/bin/env node
// Real-Chrome gameplay, responsive-layout, recorded-audio, and visual-QC gate.

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  baseUrl, launchChrome, createReporter, openSession, checkSessionClean,
  resolveShots, ensureShots, shooter, debug, targetSizes, undersized,
} from '../../../tools/qa/lib/driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..');
const BASE = baseUrl();
const SHOTS = resolveShots('/private/tmp/qlobe-shape-detective-shots');
const report = createReporter({ collapse: true, detailLimit: 260 });
const { check, head, note, finish } = report;
const shot = shooter(SHOTS);
const PLATFORM_ANALYTICS = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
];

const readJson = async (relative) => JSON.parse(await readFile(path.join(GAME, relative), 'utf8'));
const exists = async (relative) => {
  try { return (await stat(path.join(GAME, relative))).isFile(); } catch { return false; }
};

async function checkViewport(page, label) {
  const layout = await page.evaluate(() => ({
    viewport: [innerWidth, innerHeight],
    scroll: [document.body.scrollWidth, document.body.scrollHeight],
    fatal: Boolean(document.querySelector('.fatal-message')),
  }));
  check(`${label} has no page overflow`,
    layout.scroll[0] <= layout.viewport[0] + 1 && layout.scroll[1] <= layout.viewport[1] + 1,
    JSON.stringify(layout));
  check(`${label} has no fatal screen`, !layout.fatal);
  const small = undersized(await targetSizes(page), 95.5);
  check(`${label} targets meet the 96px minimum`, small.length === 0,
    small.map((item) => `${item.id}:${Math.round(item.w)}x${Math.round(item.h)}`).join(', '));
}

function checkClean(session, label) {
  session.failed.splice(0, session.failed.length,
    ...session.failed.filter((entry) => !PLATFORM_ANALYTICS.some((host) => entry.includes(host))));
  checkSessionClean(report, session, label);
}

async function waitForAdvance(page, round) {
  await page.waitForFunction((previous) => {
    const state = window.QLOBE_DEBUG.getState();
    return state.screen === 'end' || state.round > previous;
  }, round, { timeout: 4000 });
}

async function completeMode(page) {
  for (let guard = 0; guard < 7; guard += 1) {
    const state = await debug.getState(page);
    if (state.screen === 'end') return state;
    const result = await debug.winRound(page);
    check(`debug win accepted for ${state.mode} round ${state.round + 1}`, result === true);
    await waitForAdvance(page, state.round);
  }
  throw new Error('mode did not complete within its declared round count');
}

async function staticChecks() {
  head('static');
  const [config, lines, manifest] = await Promise.all([
    readJson('config.json'), readJson('assets/audio/lines.json'), readJson('assets/audio/manifest.json'),
  ]);
  check('config declares three five-round cases',
    config.modes.length === 3 && config.modes.every((mode) => mode.rounds.length === 5));
  check('voice script has 45 exact fallback lines',
    Object.keys(config.voice).length === 45
      && JSON.stringify(config.voice) === JSON.stringify(lines));
  check('every narration line has a recorded manifest clip',
    Object.keys(lines).every((key) => manifest[key]?.file && manifest[key]?.dur > 0),
    `${Object.keys(manifest).filter((key) => key !== '_v').length}/${Object.keys(lines).length}`);
  const art = [
    'assets/board.webp', 'assets/map-board.webp', 'assets/search-scene.webp', 'assets/title.webp',
    'assets/ui/magnifier.webp', 'assets/ui/clue-plaque.webp',
    'assets/ui/action-slab.webp', 'assets/ui/case-closed.webp',
    ...Object.values(config.assets.cards).map((file) => file.replace('./', '')),
    ...Object.values(config.assets.shapes).map((file) => file.replace('./', '')),
    ...Object.values(config.assets.ghosts).map((file) => file.replace('./', '')),
    ...Object.values(config.assets.rewards).map((file) => file.replace('./', '')),
    'assets/og-image.jpg',
  ];
  const missing = [];
  for (const file of art) if (!(await exists(file))) missing.push(file);
  check('every declared raster art asset exists', missing.length === 0, missing.join(', '));
  const css = await readFile(path.join(GAME, 'css/style.css'), 'utf8');
  const html = await readFile(path.join(GAME, 'index.html'), 'utf8');
  check('game-local presentation contains no SVG or CSS gradient artwork',
    !/<svg\b/i.test(html) && !/\b(?:linear|radial|conic)-gradient\s*\(/i.test(css));
}

async function landscape(browser) {
  head('landscape gameplay');
  const config = await readJson('config.json');
  const session = await openSession(browser, {
    url: `${BASE}/games/shape-detective/`, base: BASE,
    viewport: { width: 1280, height: 800 }, seed: 42, fastTimers: 50, mute: true,
    allowAbortedMedia: true,
    allowRemote: PLATFORM_ANALYTICS,
  });
  const { page } = session;
  const initial = await debug.getState(page);
  check('game boots to the case board with all art loaded',
    initial.screen === 'splash' && initial.assetErrors.length === 0,
    JSON.stringify(initial.assetErrors));
  await checkViewport(page, 'landscape splash');
  await shot(page, '01-splash-landscape');

  await debug.startMode(page, 'properties');
  let state = await debug.getState(page);
  const wrongShape = state.choiceIds.find((id) => id !== state.targetId);
  await debug.call(page, 'choose', wrongShape);
  await debug.call(page, 'choose', wrongShape);
  state = await debug.getState(page);
  check('Shape Clues gives a warm retry then a visual hint',
    state.wrongAttempts === 2 && await page.locator('.shape-choice.is-hint').count() === 1);
  await checkViewport(page, 'Shape Clues');
  await shot(page, '02-shape-clues-hint-landscape');
  await completeMode(page);

  await debug.fastTimers(page, 5);
  await debug.startMode(page, 'search');
  state = await debug.getState(page);
  const correctSpot = state.targetId;
  await page.waitForTimeout(500);
  check('Secret Spots clear-space start does not reveal a clue', (await debug.getState(page)).foundIds.length === 0);
  const lensBox = await page.locator('.ml-surface-ring').boundingBox();
  const sceneBox = await page.locator('.search-scene-mount').boundingBox();
  const searchMode = config.modes.find((mode) => mode.id === 'search');
  const spot = searchMode.rounds[state.round].spots.find((item) => item.id === correctSpot);
  const sx = lensBox.x + lensBox.width / 2, sy = lensBox.y + lensBox.height / 2;
  const ex = sceneBox.x + sceneBox.width * spot.x / 1600, ey = sceneBox.y + sceneBox.height * spot.y / 1200;
  await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(ex, ey, { steps: 8 }); await page.mouse.up();
  await page.waitForSelector(`[data-target="spot-${correctSpot}"]`);
  await page.mouse.click(ex, ey);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().accepting === false);
  const tappedState = await debug.getState(page);
  check('Secret Spots tap is forwarded through the real magnifier surface',
    tappedState.lens?.lastTapThrough && tappedState.accepting === false,
    JSON.stringify(tappedState.lens?.lastTapThrough));
  await waitForAdvance(page, state.round);
  check('Secret Spots real magnifier drag and tap-through advances', (await debug.getState(page)).round > state.round);
  await debug.fastTimers(page, 50);
  await debug.startMode(page, 'search');
  state = await debug.getState(page);
  const wrongSpot = state.choiceIds.find((id) => id !== state.targetId);
  await debug.call(page, 'moveLensTo', wrongSpot);
  await page.waitForFunction((id) => window.QLOBE_DEBUG.getState().foundIds.includes(id), wrongSpot);
  await page.waitForSelector(`[data-target="spot-${wrongSpot}"]`);
  await debug.tap(page, `spot-${wrongSpot}`);
  await debug.tap(page, `spot-${wrongSpot}`);
  state = await debug.getState(page);
  check('Secret Spots reveals through the lens and hints after two misses',
    state.foundIds.includes(wrongSpot) && state.wrongAttempts === 2);
  await page.waitForTimeout(650);
  const lensSurface = await page.locator('.ml-surface-ring').boundingBox();
  check('magnifier drag surface remains a large child-scale interaction',
    lensSurface && lensSurface.width >= 180 && lensSurface.height >= 180,
    JSON.stringify(lensSurface));
  await checkViewport(page, 'Secret Spots');
  await shot(page, '03-secret-spots-reveal-landscape');
  await completeMode(page);

  await debug.fastTimers(page, 5);
  await debug.startMode(page, 'place');
  state = await debug.getState(page);
  const movable = await page.locator('.map-movable').boundingBox();
  const target = await page.locator('.map-target').boundingBox();
  await page.mouse.move(movable.x + movable.width / 2, movable.y + movable.height / 2);
  await page.mouse.down(); await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 }); await page.mouse.up();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().accepting === false);
  const droppedState = await debug.getState(page);
  check('Chalk Map real drag/drop records the pointer path before advancing',
    droppedState.placement?.placed === true && droppedState.placement?.source === 'drag',
    JSON.stringify(droppedState.placement));
  await waitForAdvance(page, state.round);
  const placedState = await debug.getState(page);
  check('Chalk Map real drag/drop advances the round', placedState.round > state.round);
  await debug.fastTimers(page, 50);
  await debug.startMode(page, 'place');
  await page.locator('.map-movable').click();
  await debug.call(page, 'placeAt', 60, 70);
  await debug.call(page, 'placeAt', 60, 70);
  state = await debug.getState(page);
  check('Chalk Map keeps wrong placements retryable and reveals a ghost hint',
    state.wrongAttempts === 2 && await page.locator('.placement-ghost.is-visible').count() === 1);
  check('a wrong placement clears visible and assistive selection state',
    state.placement?.selected === false
      && await page.locator('.map-movable[aria-pressed="false"]:not(.is-selected)').count() === 1,
    JSON.stringify(state.placement));
  await checkViewport(page, 'Chalk Map');
  await shot(page, '04-chalk-map-hint-landscape');
  await completeMode(page);
  state = await debug.getState(page);
  check('all three badges unlock the finale',
    state.screen === 'end' && state.completedModes.length === 3 && state.complete === true,
    JSON.stringify(state));
  await shot(page, '05-finale-landscape');
  checkClean(session, 'landscape session');
  await session.close();
}

async function responsive(browser) {
  head('portrait and reduced motion');
  const portrait = await openSession(browser, {
    url: `${BASE}/games/shape-detective/`, base: BASE,
    viewport: { width: 768, height: 1024 }, seed: 42, fastTimers: 50, mute: true,
    allowAbortedMedia: true,
    allowRemote: PLATFORM_ANALYTICS,
  });
  await checkViewport(portrait.page, 'portrait splash');
  await shot(portrait.page, '06-splash-portrait');
  await debug.startMode(portrait.page, 'search');
  await checkViewport(portrait.page, 'portrait Secret Spots');
  await shot(portrait.page, '07-secret-spots-portrait');
  await debug.startMode(portrait.page, 'place');
  await checkViewport(portrait.page, 'portrait Chalk Map');
  await shot(portrait.page, '08-chalk-map-portrait');
  checkClean(portrait, 'portrait session');
  await portrait.close();

  const reduced = await openSession(browser, {
    url: `${BASE}/games/shape-detective/`, base: BASE,
    viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce',
    seed: 42, fastTimers: 50, mute: true, allowAbortedMedia: true,
    allowRemote: PLATFORM_ANALYTICS,
  });
  await debug.startMode(reduced.page, 'properties');
  const reducedState = await debug.getState(reduced.page);
  const wrong = reducedState.choiceIds.find((id) => id !== reducedState.targetId);
  await debug.call(reduced.page, 'choose', wrong);
  await shot(reduced.page, '09-shape-clues-reduced-motion');
  check('reduced-motion preference is active',
    await reduced.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
  checkClean(reduced, 'reduced-motion session');
  await reduced.close();
}

async function recordedAudio(browser) {
  head('recorded narration');
  const session = await openSession(browser, {
    url: `${BASE}/games/shape-detective/`, base: BASE,
    viewport: { width: 1024, height: 768 }, seed: 42, fastTimers: 50, mute: false,
    allowAbortedMedia: true,
    allowRemote: PLATFORM_ANALYTICS,
  });
  const { page } = session;
  await page.locator('.mode-card-properties').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog().some((entry) => entry.key === 'intro-properties'));
  const audioLog = await debug.getAudioLog(page);
  const intro = audioLog.find((entry) => entry.key === 'intro-properties');
  check('a real gesture starts the recorded teacher narration', intro?.kind === 'clip',
    JSON.stringify(audioLog));
  checkClean(session, 'audio session');
  await session.close();
}

async function main() {
  await ensureShots(SHOTS);
  await staticChecks();
  const browser = await launchChrome();
  try {
    await landscape(browser);
    await responsive(browser);
    await recordedAudio(browser);
  } finally {
    await browser.close();
  }
  note(`screenshots: ${SHOTS}`);
  finish({ suffix: `; shots in ${SHOTS}`, exit: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
