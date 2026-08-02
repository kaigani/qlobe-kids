#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const base = (process.env.QLOBE_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');
const shots = path.resolve(process.env.QLOBE_SHOTS || 'tmp/sound-basket-qa');
const require = createRequire('/private/tmp/pw/node_modules/noop.js');
const { chromium } = require('playwright');
const checks = [];

function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  checks.push({ name, ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function openGame(browser, viewport, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport, reducedMotion, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  const failed = [];
  const remote = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    if (!request.url().startsWith(base) && !request.url().startsWith('data:')) remote.push(request.url());
  });
  page.on('response', (response) => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
  await page.goto(`${base}/games/sound-basket/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  return { context, page, errors, failed, remote };
}

async function drag(page, source, target) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
}

async function finishCurrentMode(page) {
  while ((await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) !== 'end') {
    const screen = await page.evaluate(() => window.QLOBE_DEBUG.getState().screen);
    if (screen === 'play') {
      await page.evaluate(() => window.QLOBE_DEBUG.winRound());
      await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'celebration');
    }
    if ((await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'celebration') {
      await page.locator('#next-round').click();
      await page.waitForFunction(() => ['play', 'end'].includes(window.QLOBE_DEBUG.getState().screen));
    }
  }
}

async function main() {
  await mkdir(shots, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  const run = await openGame(browser, { width: 1180, height: 820 });
  const { page } = run;
  check('splash boots', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'splash');
  check('both modes registered', (await page.evaluate(() => window.QLOBE_DEBUG.listModes().map((mode) => mode.id).join(','))) === 'two,three');
  check('randomization pool exposes the full alphabet', (await page.evaluate(() => window.QLOBE_DEBUG.getLetterPool().join(''))) === 'abcdefghijklmnopqrstuvwxyz');
  const wordCoverage = await page.evaluate(async () => {
    const [objects, local, shared] = await Promise.all([
      fetch('../../shared/data/letter-objects.json').then((response) => response.json()),
      fetch('./assets/audio/word-manifest.json').then((response) => response.json()),
      fetch('../../shared/assets/audio/manifest.json').then((response) => response.json()),
    ]);
    const words = Object.values(objects.objects).flat().map((item) => item.word);
    const uncovered = words.filter((word) => !local.words?.[word] && !shared.words?.[word]);
    return { total: words.length, local: Object.keys(local.words || {}).length, shared: words.filter((word) => shared.words?.[word]).length, uncovered };
  });
  check('all 78 object names have packaged audio coverage', wordCoverage.total === 78 && wordCoverage.uncovered.length === 0, JSON.stringify(wordCoverage));
  check('generated title has exact accessible name', (await page.locator('.title-lockup').getAttribute('alt')) === 'Sound Basket');
  check('title, backdrop and basket preload successfully', await page.evaluate(() => [...document.images].filter((image) => /title|basket/.test(image.src)).every((image) => image.complete && image.naturalWidth > 0)));
  const splashTargets = await page.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check('all splash play targets are at least 96px', splashTargets.every(({ rect }) => rect.w >= 96 && rect.h >= 96), JSON.stringify(splashTargets));
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  await page.evaluate(async () => {
    const clips = await import('../../shared/js/voice-clips.js');
    window.__soundBasketClips = [];
    clips.onClip((key) => window.__soundBasketClips.push(key));
    window.QLOBE_DEBUG.seed(42);
  });
  await page.locator('#play-default').click();
  await page.waitForFunction(() => window.__soundBasketClips.includes('two-sounds'));
  check('first gesture unlocks recorded teacher voice', await page.evaluate(() => window.__soundBasketClips.includes('two-sounds')));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput);
  const firstSessionLetters = await page.evaluate(() => window.QLOBE_DEBUG.getState().letters);
  check('two-sounds session draws two distinct alphabet letters', firstSessionLetters.length === 2 && new Set(firstSessionLetters).size === 2, firstSessionLetters.join(','));
  const namingTarget = (await page.evaluate(() => window.QLOBE_DEBUG.getTargets()))[0];
  await page.evaluate(() => {
    window.__wordAudioCalls = [];
    const synth = window.speechSynthesis;
    const originalSpeak = synth.speak.bind(synth);
    synth.speak = (utterance) => {
      window.__wordAudioCalls.push(`speech:${utterance.text}`);
      return originalSpeak(utterance);
    };
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function patchedPlay() {
      if (this.src.includes('/audio/words/')) window.__wordAudioCalls.push(`clip:${this.src}`);
      return originalPlay.call(this);
    };
  });
  await page.locator(`[data-target="${namingTarget.id}"]`).click();
  await page.waitForFunction(() => window.__wordAudioCalls.some((call) => call.includes('/games/sound-basket/assets/audio/words/')));
  check('real missing-library word uses its packaged local clip without placement', await page.evaluate(() => {
    const state = window.QLOBE_DEBUG.getState();
    return window.__wordAudioCalls.some((call) => call.includes('/games/sound-basket/assets/audio/words/'))
      && state.lastWordSource === 'local' && state.found === 0;
  }), await page.evaluate(() => window.__wordAudioCalls.join(' | ')));
  const reportedScreenWords = await page.evaluate(async () => {
    const result = {};
    for (const word of ['quail', 'jellyfish', 'queen', 'jet']) result[word] = await window.QLOBE_DEBUG.speakWord(word);
    return result;
  });
  check('reported Q/J screen has audible packaged sources for all four words',
    ['quail', 'jellyfish', 'queen'].every((word) => reportedScreenWords[word].source === 'local')
      && reportedScreenWords.jet.source === 'shared', JSON.stringify(reportedScreenWords));
  await page.evaluate(() => { window.QLOBE_DEBUG.mute(); window.QLOBE_DEBUG.fastTimers(.04); window.QLOBE_DEBUG.seed(42); });

  const playTargets = await page.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check('all play cards are at least 96px', playTargets.every(({ rect }) => rect.w >= 96 && rect.h >= 96), JSON.stringify(playTargets));
  check('round exposes truthful correct and wrong targets', playTargets.filter((target) => target.role === 'correct').length === 2 && playTargets.filter((target) => target.role === 'wrong').length === 2);
  const basketOrder = await page.evaluate(() => {
    const letter = document.querySelector('#basket-letter').getBoundingClientRect();
    const basket = document.querySelector('#basket-target > .basket-base').getBoundingClientRect();
    return { letterBottom: letter.bottom, basketTop: basket.top, basketWidth: basket.width };
  });
  check('target letter sits fully above the basket', basketOrder.letterBottom <= basketOrder.basketTop + 3, JSON.stringify(basketOrder));
  check('play basket is a large central drop target', basketOrder.basketWidth >= 560, JSON.stringify(basketOrder));
  await page.screenshot({ path: path.join(shots, '02-play-landscape.png') });

  const wrong = playTargets.find((target) => target.role === 'wrong');
  await drag(page, page.locator(`[data-target="${wrong.id}"]`), page.locator('#basket-catch'));
  await page.waitForFunction(() => !window.QLOBE_DEBUG.getState().awaitingInput || window.QLOBE_DEBUG.getState().found === 0);
  await page.waitForTimeout(80);
  check('gentle wrong drop returns without advancing', (await page.evaluate(() => window.QLOBE_DEBUG.getState().found)) === 0);

  let correct = (await page.evaluate(() => window.QLOBE_DEBUG.getTargets())).find((target) => target.role === 'correct');
  const tapResult = await page.evaluate((id) => window.QLOBE_DEBUG.tap(id), correct.id);
  const afterTap = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('tap speaks the object name without sorting it', tapResult.spoken && !tapResult.placed && afterTap.found === 0 && Boolean(afterTap.lastSpokenWord), JSON.stringify(afterTap));

  await drag(page, page.locator(`[data-target="${correct.id}"]`), page.locator('#basket-catch'));
  await page.waitForFunction(() => {
    const state = window.QLOBE_DEBUG.getState();
    return state.found === 1 && state.inBasket === 1 && state.awaitingInput;
  });
  const afterFirstDrop = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('drag places the object visibly inside the basket', afterFirstDrop.found === 1 && afterFirstDrop.inBasket === 1, JSON.stringify(afterFirstDrop));
  await page.screenshot({ path: path.join(shots, '02b-play-one-in-basket.png') });

  correct = (await page.evaluate(() => window.QLOBE_DEBUG.getTargets())).find((target) => target.role === 'correct');
  await drag(page, page.locator(`[data-target="${correct.id}"]`), page.locator('#basket-catch'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'celebration');
  check('real drag-to-basket completes the same round', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'celebration');
  const celebrationLayers = await page.evaluate(() => {
    const letter = document.querySelector('#celebration-letter').getBoundingClientRect();
    const basket = document.querySelector('.celebration-basket > .basket-base').getBoundingClientRect();
    const finds = document.querySelectorAll('#celebration-finds img').length;
    return { letterCenter: letter.left + letter.width / 2, basketLeft: basket.left, finds };
  });
  check('celebration puts the letter beside a basket containing both objects', celebrationLayers.letterCenter < celebrationLayers.basketLeft + 20 && celebrationLayers.finds === 2, JSON.stringify(celebrationLayers));
  await page.screenshot({ path: path.join(shots, '03-celebration-landscape.png') });

  await page.locator('#next-round').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'play');
  await finishCurrentMode(page);
  check('two-sounds mode reaches end', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'end');
  const endLayers = await page.evaluate(() => {
    const letters = document.querySelector('#end-letters');
    const basket = document.querySelector('.end-basket > img');
    const tile = letters.querySelector('span');
    const rect = tile.getBoundingClientRect();
    const topElement = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      letterZ: Number(getComputedStyle(letters).zIndex),
      basketZ: Number(getComputedStyle(basket).zIndex),
      tileOnTop: topElement === tile || tile.contains(topElement),
    };
  });
  check('end-screen letter tiles render above the basket artwork', endLayers.letterZ > endLayers.basketZ && endLayers.tileOnTop, JSON.stringify(endLayers));
  await page.screenshot({ path: path.join(shots, '04-end-landscape.png') });
  await page.locator('#end-back').click();
  check('end Back returns to splash', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'splash');

  const secondSessionLetters = await page.evaluate(async () => {
    window.QLOBE_DEBUG.seed(43);
    await window.QLOBE_DEBUG.start('two');
    return window.QLOBE_DEBUG.getState().letters;
  });
  check('new game redraws the session letters', secondSessionLetters.join('') !== firstSessionLetters.join(''), `${firstSessionLetters.join(',')} → ${secondSessionLetters.join(',')}`);
  await page.evaluate(() => { window.QLOBE_DEBUG.home(); window.QLOBE_DEBUG.seed(7); return window.QLOBE_DEBUG.start('three'); });
  check('three-sounds session draws three distinct alphabet letters', await page.evaluate(() => { const letters = window.QLOBE_DEBUG.getState().letters; return letters.length === 3 && new Set(letters).size === 3; }));
  await finishCurrentMode(page);
  check('three-sounds mode reaches end', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'end');
  check('landscape has zero console errors', run.errors.length === 0, run.errors.join(' | '));
  check('landscape has zero failed requests', run.failed.length === 0, run.failed.join(' | '));
  check('runtime makes no remote requests', run.remote.length === 0, run.remote.join(' | '));
  await run.context.close();

  const portrait = await openGame(browser, { width: 600, height: 900 });
  await portrait.page.screenshot({ path: path.join(shots, '05-splash-portrait.png') });
  await portrait.page.evaluate(() => { window.QLOBE_DEBUG.mute(); window.QLOBE_DEBUG.fastTimers(.04); return window.QLOBE_DEBUG.start('three'); });
  const portraitTargets = await portrait.page.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check('portrait cards remain at least 96px', portraitTargets.every(({ rect }) => rect.w >= 96 && rect.h >= 96), JSON.stringify(portraitTargets));
  await portrait.page.screenshot({ path: path.join(shots, '06-play-portrait.png') });
  check('portrait has zero console errors/failed requests', portrait.errors.length === 0 && portrait.failed.length === 0, [...portrait.errors, ...portrait.failed].join(' | '));
  await portrait.context.close();

  const reduced = await openGame(browser, { width: 1024, height: 768 }, 'reduce');
  await reduced.page.evaluate(() => { window.QLOBE_DEBUG.mute(); window.QLOBE_DEBUG.fastTimers(.04); return window.QLOBE_DEBUG.start('two'); });
  await reduced.page.evaluate(() => window.QLOBE_DEBUG.winRound());
  await reduced.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'celebration');
  check('reduced-motion round completes', true);
  check('reduced-motion has zero console errors/failed requests', reduced.errors.length === 0 && reduced.failed.length === 0, [...reduced.errors, ...reduced.failed].join(' | '));
  await reduced.context.close();

  await browser.close();
  const failedChecks = checks.filter((entry) => !entry.ok);
  console.log(`\n${checks.length - failedChecks.length}/${checks.length} checks passed`);
  if (failedChecks.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
