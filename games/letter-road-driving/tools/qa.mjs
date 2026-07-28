#!/usr/bin/env node
// Real-Chrome smoke and visual-QC driver for Letter Road Driving.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const base = value('base', 'http://127.0.0.1:8000').replace(/\/$/, '');
const shots = path.resolve(value('shots', 'qa-shots/letter-road-driving'));
const require = createRequire('/private/tmp/pw/node_modules/noop.js');
const { chromium } = require('playwright');
const results = [];

function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  results.push({ name, ok });
  console.log(`${ok ? ' ok ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function openPage(browser, viewport, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport, reducedMotion, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  const failed = [];
  const remote = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('request', (request) => {
    if (!request.url().startsWith(base)) remote.push(request.url());
  });
  page.on('requestfailed', (request) => failed.push(`${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(`${base}/games/letter-road-driving/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  await page.evaluate(() => window.QLOBE_DEBUG.seed(42));
  return { context, page, errors, failed, remote };
}

async function completeMode(page, mode) {
  await page.evaluate((id) => window.QLOBE_DEBUG.startMode(id), mode);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput);
  while ((await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'play') {
    await page.evaluate(() => window.QLOBE_DEBUG.winRound());
  }
}

async function main() {
  await mkdir(shots, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  const landscape = await openPage(browser, { width: 1180, height: 820 });
  const page = landscape.page;
  check('splash boots', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'splash');
  check('two modes registered', (await page.evaluate(() => window.QLOBE_DEBUG.listModes())).length === 2);
  const coverage = await page.evaluate(async () => {
    const config = await fetch('./config.json').then((response) => response.json());
    const paths = config.modes.flatMap((mode) => mode.paths);
    return {
      routes: paths.length,
      letters: [...new Set(paths.map((item) => item.id[0]))].sort().join(''),
      destinations: new Set(paths.map((item) => item.destination)).size,
      mapSprites: config.mapSprites,
    };
  });
  check('A–Z routes have 26 unique generated destinations',
    coverage.routes === 26
      && coverage.letters === 'abcdefghijklmnopqrstuvwxyz'
      && coverage.destinations === 26
      && coverage.mapSprites,
    JSON.stringify(coverage));
  const spritePack = await page.evaluate(async () => {
    const pack = await fetch('./assets/map/pack.json').then((response) => response.json());
    const results = await Promise.all(pack.sprites.map(async (sprite) => {
      const response = await fetch(`./${sprite.asset.replace(/^assets\//, 'assets/')}`);
      return response.ok;
    }));
    return {
      total: pack.sprites.length,
      destinations: pack.sprites.filter((sprite) => sprite.kind === 'destination').length,
      props: pack.sprites.filter((sprite) => sprite.kind === 'prop').length,
      loaded: results.filter(Boolean).length,
    };
  });
  check('complete transparent sprite pack loads offline',
    spritePack.total === 45
      && spritePack.destinations === 27
      && spritePack.props === 18
      && spritePack.loaded === 45,
    JSON.stringify(spritePack));
  const rewardPack = await page.evaluate(async () => {
    const pack = await fetch('./assets/rewards/pack.json').then((response) => response.json());
    const results = await Promise.all(pack.rewards.map(async (reward) => {
      const response = await fetch(`./${reward.asset}`);
      return response.ok;
    }));
    return {
      total: pack.rewards.length,
      letters: pack.rewards
        .filter((reward) => reward.id.length === 1)
        .map((reward) => reward.id)
        .sort()
        .join(''),
      bonus: pack.rewards.some((reward) => reward.id === 'bonus'),
      loaded: results.filter(Boolean).length,
    };
  });
  check('A–Z destination reward pack loads offline',
    rewardPack.total === 27
      && rewardPack.letters === 'abcdefghijklmnopqrstuvwxyz'
      && rewardPack.bonus
      && rewardPack.loaded === 27,
    JSON.stringify(rewardPack));
  check('runtime makes no remote requests', landscape.remote.length === 0, landscape.remote.join(', '));
  const modeSizes = await page.locator('.qk-trace-mode').evaluateAll((nodes) =>
    nodes.map((node) => ({ w: node.getBoundingClientRect().width, h: node.getBoundingClientRect().height })));
  check('mode targets meet 96px minimum', modeSizes.every(({ w, h }) => w >= 96 && h >= 96));
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  await page.evaluate(async () => {
    const clips = await import('../../../shared/js/voice-clips.js');
    window.__letterRoadVoice = [];
    clips.onClip((key) => window.__letterRoadVoice.push(key));
  });
  await page.locator('.qk-trace-mode').first().click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput);
  await page.waitForFunction(() => window.__letterRoadVoice.length > 0);
  check('first real gesture starts recorded teacher voice',
    (await page.evaluate(() => window.__letterRoadVoice)).some((key) => key.startsWith('prompt-')),
    (await page.evaluate(() => window.__letterRoadVoice.join(', '))));
  const easy = await page.evaluate(() => ({
    state: window.QLOBE_DEBUG.getState(),
    targets: window.QLOBE_DEBUG.getTargets(),
    points: window.QLOBE_DEBUG.tracePoints().length,
  }));
  check('Easy Roads starts with trace geometry', easy.state.mode === 'cruise' && easy.points > 20);
  check('trace start target is at least 104px',
    easy.targets.some(({ role, rect }) => role === 'correct' && rect.w >= 104 && rect.h >= 104));
  const mission = await page.locator('.qk-trace-prompt').innerText();
  check('letter round has a named car mission and destination',
    mission.includes('Drive ') && mission.includes(' is for ') && mission.includes('Trace the letter'),
    mission.replace(/\n/g, ' / '));
  await page.screenshot({ path: path.join(shots, '02-easy-road.png') });

  const route = await page.evaluate(() => window.QLOBE_DEBUG.tracePoints());
  const partial = route.slice(0, Math.max(4, Math.floor(route.length * 0.42)));
  await page.mouse.move(partial[0].x, partial[0].y);
  await page.mouse.down();
  for (const point of partial.slice(1)) await page.mouse.move(point.x, point.y);
  await page.mouse.up();
  const partialState = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('finger tracing moves a separate translucent ghost car',
    partialState.travelerGap > 80 && partialState.ghostVisible,
    `gap ${Math.round(partialState.travelerGap)}px`);
  check('solid car hides as soon as tracing starts',
    !partialState.actualVisible && partialState.ghostVisible);
  const missionVoice = await page.evaluate(() => {
    const state = window.QLOBE_DEBUG.getState();
    const promptKey = `prompt-${state.path[0]}`;
    const heard = window.__letterRoadVoice.filter((key) => key === promptKey);
    return { promptKey, count: heard.length };
  });
  check('destination mission is spoken only once when tracing starts',
    missionVoice.count === 1,
    `${missionVoice.promptKey} played ${missionVoice.count} time(s)`);
  await page.screenshot({ path: path.join(shots, '02b-ghost-trace.png') });

  await page.evaluate(() => { window.__letterRoadWin = window.QLOBE_DEBUG.winRound(); });
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().replaying);
  const replayState = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('solid character car drives the completed route',
    replayState.replaying && replayState.actualVisible && !replayState.ghostVisible);
  await page.screenshot({ path: path.join(shots, '02c-drive-replay.png') });
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().rewardVisible, null, { timeout: 15000 });
  const rewardState = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('destination action reward pops in after the drive',
    rewardState.rewardVisible && rewardState.actualVisible && !rewardState.ghostVisible);
  await page.screenshot({ path: path.join(shots, '02d-destination-reward.png') });
  await page.evaluate(() => window.__letterRoadWin);
  check('real trace path advances a round', (await page.evaluate(() => window.QLOBE_DEBUG.getState().round)) === 1);
  const carSfx = await page.evaluate(async () => (await import('../../../shared/js/sfx.js')).stats());
  check('trace, replay, and arrival trigger audible car effects',
    carSfx.vroom >= 1 && carSfx.motor >= 1 && carSfx.honk >= 1,
    JSON.stringify(carSfx));
  await page.evaluate(() => window.QLOBE_DEBUG.mute());

  const decks = await page.evaluate(async () => {
    window.QLOBE_DEBUG.seed(101);
    await window.QLOBE_DEBUG.startMode('cruise');
    const first = window.QLOBE_DEBUG.getState().sequence;
    window.QLOBE_DEBUG.seed(202);
    await window.QLOBE_DEBUG.startMode('cruise');
    const second = window.QLOBE_DEBUG.getState().sequence;
    return { first, second };
  });
  check('new runs select fresh shuffled letters',
    decks.first.length === 4 && decks.second.length === 4 && decks.first.join() !== decks.second.join(),
    `${decks.first.join(', ')} / ${decks.second.join(', ')}`);

  await page.evaluate(() => window.QLOBE_DEBUG.startMode('town'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput);
  const town = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('Letter Town exposes ordered multi-strokes', town.mode === 'town' && town.strokesTotal >= 2);
  await page.screenshot({ path: path.join(shots, '03-letter-town-a.png') });
  await page.evaluate(() => window.QLOBE_DEBUG.winRound());
  check('multi-stroke letter completes', (await page.evaluate(() => window.QLOBE_DEBUG.getState().round)) === 1);

  const music = await page.evaluate(async () => {
    for (let seed = 0; seed < 100; seed += 1) {
      window.QLOBE_DEBUG.seed(seed);
      await window.QLOBE_DEBUG.startMode('town');
      const state = window.QLOBE_DEBUG.getState();
      if (state.path === 'm-road') return { ...state, seed };
    }
    return window.QLOBE_DEBUG.getState();
  });
  check('Music Shop scenario exposes four-stroke M',
    music.path === 'm-road' && music.strokesTotal === 4,
    `seed ${music.seed ?? 'not found'} path ${music.path}`);
  await page.screenshot({ path: path.join(shots, '03b-music-shop-m.png') });

  await completeMode(page, 'cruise');
  check('Easy Roads reaches end screen', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'end');
  await page.screenshot({ path: path.join(shots, '04-finish.png') });
  await completeMode(page, 'town');
  check('Letter Town reaches end screen', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'end');

  const portrait = await openPage(browser, { width: 820, height: 1180 });
  await portrait.page.screenshot({ path: path.join(shots, '05-splash-portrait.png') });
  await portrait.page.evaluate(() => window.QLOBE_DEBUG.mute());
  await portrait.page.evaluate(() => window.QLOBE_DEBUG.startMode('town'));
  await portrait.page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput);
  const portraitCanvas = await portrait.page.locator('.qk-trace-canvas').boundingBox();
  check('portrait road board remains usable', portraitCanvas.width >= 600 && portraitCanvas.height >= 600,
    `${Math.round(portraitCanvas.width)}×${Math.round(portraitCanvas.height)}`);
  await portrait.page.screenshot({ path: path.join(shots, '06-letter-town-portrait.png') });

  const reduced = await openPage(browser, { width: 1180, height: 820 }, 'reduce');
  await reduced.page.evaluate(() => window.QLOBE_DEBUG.mute());
  await reduced.page.evaluate(() => window.QLOBE_DEBUG.startMode('cruise'));
  await reduced.page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput);
  await reduced.page.evaluate(() => window.QLOBE_DEBUG.winRound());
  check('reduced-motion trace completes', (await reduced.page.evaluate(() => window.QLOBE_DEBUG.getState().round)) === 1);

  const errors = [...landscape.errors, ...portrait.errors, ...reduced.errors];
  const failed = [...landscape.failed, ...portrait.failed, ...reduced.failed];
  check('zero page errors', errors.length === 0, errors.join(' | '));
  check('zero failed requests or 404s', failed.length === 0, failed.join(' | '));

  const legacy = await landscape.context.newPage();
  const legacyErrors = [];
  legacy.on('pageerror', (error) => legacyErrors.push(String(error)));
  await legacy.goto(`${base}/games/scissor-trail-safari/`, { waitUntil: 'networkidle' });
  await legacy.evaluate(() => window.QLOBE_DEBUG.ready);
  const legacyMode = await legacy.evaluate(() => window.QLOBE_DEBUG.listModes()[0].id);
  await legacy.evaluate(() => window.QLOBE_DEBUG.mute());
  await legacy.evaluate((id) => window.QLOBE_DEBUG.startMode(id), legacyMode);
  await legacy.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput);
  await legacy.evaluate(() => window.QLOBE_DEBUG.winRound());
  check('legacy dotted trace game still advances', (await legacy.evaluate(() => window.QLOBE_DEBUG.getState().round)) === 1);
  check('legacy trace game has no page errors', legacyErrors.length === 0, legacyErrors.join(' | '));
  await legacy.close();

  await landscape.context.close();
  await portrait.context.close();
  await reduced.context.close();
  await browser.close();
  const failures = results.filter(({ ok }) => !ok).length;
  console.log(`\n${results.length - failures}/${results.length} checks passed`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
