#!/usr/bin/env node
// Production QA for the full-screen A–Z carousel and the data-driven hunt.

import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  baseUrl, launchChrome, createReporter, resolveShots, ensureShots,
} from '../../../tools/qa/lib/driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME_DIR = path.resolve(HERE, '..');
const BASE = baseUrl('http://localhost:8000');
const URL_GAME = `${BASE}/games/letter-treasure-hunt/`;
const SHOTS = resolveShots(path.join(GAME_DIR, 'qa-shots'));
const { check, results } = createReporter({ style: 'pad', detailOnFail: true });
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const DISTRACTOR_BY_LETTER = Object.fromEntries(LETTERS.map((letter, index) => [
  letter,
  ['ball', 'cat', 'apple', 'apple', 'ball', 'cat', 'ant', 'butterfly', 'cupcake', 'alligator', 'boat', 'car', 'apple', 'ball', 'cat', 'ant', 'butterfly', 'cupcake', 'alligator', 'boat', 'car', 'apple', 'ball', 'cat', 'ant', 'butterfly'][index],
]));
const REQUIRE_RECORDED_AUDIO = process.env.QLOBE_REQUIRE_RECORDED_AUDIO === '1';

function monitor(page) {
  const errors = [], failed = [];
  const expectedExternal = (url) => url.includes('google-analytics.com/g/collect');
  page.on('console', (message) => {
    if (message.type() === 'error' && !expectedExternal(message.location().url || '') && !expectedExternal(message.text())) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText || '';
    const expectedAudioCancellation = failure === 'net::ERR_ABORTED' && /\.(?:m4a|mp3|wav)(?:$|\?)/i.test(request.url());
    if (!expectedExternal(request.url()) && !expectedAudioCancellation) failed.push(`${request.url()} ${failure}`);
  });
  page.on('response', (response) => { if (response.status() >= 400 && !expectedExternal(response.url())) failed.push(`${response.url()} ${response.status()}`); });
  return { errors, failed };
}

async function activeButtonGeometry(page, selector) {
  const button = page.locator(selector);
  const before = await button.boundingBox();
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(160);
  const active = await button.boundingBox();
  await page.mouse.move(1, 1);
  await page.mouse.up();
  return {
    beforeCenterX: before.x + before.width / 2,
    activeCenterX: active.x + active.width / 2,
  };
}

async function main() {
  await ensureShots(SHOTS);
  const browser = await launchChrome({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const bag = monitor(page);
  await page.goto(URL_GAME, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);

  const audioInventory = await page.evaluate(async () => {
    const [lines, manifest] = await Promise.all([
      fetch('./assets/audio/lines.json').then((response) => response.json()),
      fetch('./assets/audio/manifest.json').then((response) => response.json()),
    ]);
    return { lines, manifest };
  });
  const authoredAudioKeys = Object.keys(audioInventory.lines).sort();
  const recordedAudioKeys = Object.keys(audioInventory.manifest).sort();
  const recordedInventoryValid = recordedAudioKeys.every((key) => authoredAudioKeys.includes(key)
    && audioInventory.manifest[key].file && audioInventory.manifest[key].dur > 0
    && audioInventory.manifest[key].textHash === createHash('sha256').update(audioInventory.lines[key]).digest('hex').slice(0, 16));
  const recordedInventoryComplete = JSON.stringify(authoredAudioKeys) === JSON.stringify(recordedAudioKeys);
  check(REQUIRE_RECORDED_AUDIO ? 'release gate: recorded narration covers every authored A-Z line' : 'A-Z narration is fully authored and the current recorded subset is valid',
    authoredAudioKeys.length === 234 && recordedInventoryValid && (!REQUIRE_RECORDED_AUDIO || recordedInventoryComplete),
  JSON.stringify({ authored: authoredAudioKeys.length, recorded: recordedAudioKeys.length }));

  const boot = await page.evaluate(() => ({
    state: window.QLOBE_DEBUG.getState(),
    modes: window.QLOBE_DEBUG.listModes(),
    targets: window.QLOBE_DEBUG.getTargets(),
    mapIslands: document.querySelectorAll('.lth-map-island').length,
    layout: (() => {
      const frame = document.querySelector('.lth-frame')?.getBoundingClientRect();
      const art = document.querySelector('.lth-art')?.getBoundingClientRect();
      return { frame, art, width: innerWidth, height: innerHeight };
    })(),
  }));
  const fullBleed = (box) => box && Math.abs(box.width - boot.layout.width) < 1 && Math.abs(box.height - boot.layout.height) < 1;
  check('boots on the carousel', boot.state.screen === 'splash', JSON.stringify(boot.state));
  check('registers all 26 letter modes', boot.state.carouselTotal === 26 && boot.modes.length === 26 && boot.modes[0].id === 'a-quest' && boot.modes[25].id === 'z-quest');
  check('renders the three-island carousel window', boot.mapIslands === 3);
  check('scene is truly full-viewport', fullBleed(boot.layout.frame) && fullBleed(boot.layout.art), JSON.stringify(boot.layout));
  const carouselTouchSizes = await page.locator('.lth-map-island').evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { letter: node.textContent.trim(), w: rect.width, h: rect.height };
  }));
  check('all visible carousel islands have large touch targets', carouselTouchSizes.length === 3 && carouselTouchSizes.every((target) => target.w >= 96 && target.h >= 96), JSON.stringify(carouselTouchSizes));
  const carouselRaster = await page.evaluate(() => ({
    svg: document.querySelectorAll('svg').length,
    imgs: [...document.querySelectorAll('img')].map((img) => ({ src: img.getAttribute('src') || '', naturalWidth: img.naturalWidth })),
  }));
  check('carousel uses raster UI plates with no inline SVG', carouselRaster.svg === 0
    && carouselRaster.imgs.some((img) => img.src.includes('/assets/ui-raster/letters/a.webp'))
    && carouselRaster.imgs.some((img) => img.src.includes('/assets/ui-raster/quest-title.webp')),
  JSON.stringify(carouselRaster));
  check('carousel raster UI images are loaded', carouselRaster.imgs.filter((img) => img.src.includes('/assets/ui-raster/')).every((img) => img.naturalWidth > 0), JSON.stringify(carouselRaster.imgs));
  const carouselUi = await page.evaluate(() => {
    const sound = document.querySelector('.lth-sound');
    const rect = sound?.getBoundingClientRect();
    return {
      soundUpperRight: Boolean(rect && rect.right >= innerWidth - 180 && rect.top <= 180),
      removed: !document.querySelector('.lth-primary, .lth-parent, .lth-parent-gate, [data-target="play"], [data-target="parent-gate"]'),
    };
  });
  check('carousel keeps sound control in the upper-right and removes PLAY/parent controls', carouselUi.soundUpperRight && carouselUi.removed, JSON.stringify(carouselUi));
  for (const [index, letter] of [[0, 'A'], [1, 'B'], [2, 'C']]) {
    await page.evaluate(() => window.QLOBE_DEBUG.selectLetter('b'));
    await page.locator('.lth-map-island').nth(index).click();
    const launched = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    check(`visible ${letter} island launches its quest directly`, launched.screen === 'play' && launched.selectedLetter === letter, JSON.stringify(launched));
    await page.evaluate(() => window.QLOBE_DEBUG.home());
  }
  await page.evaluate(() => window.QLOBE_DEBUG.selectLetter('b'));
  await page.screenshot({ path: path.join(SHOTS, 'splash.png') });

  const carousel = await page.evaluate(async () => {
    const D = window.QLOBE_DEBUG;
    D.fastTimers(0.05);
    const initial = D.getState();
    await D.tap('carousel-next');
    const next = D.getState();
    await D.tap('carousel-prev');
    const previous = D.getState();
    D.selectLetter('z');
    const last = D.getState();
    D.selectLetter('b');
    return { initial, next, previous, last };
  });
  check('left/right arrows move the carousel', carousel.initial.selectedLetter === 'B' && carousel.next.selectedLetter === 'C' && carousel.previous.selectedLetter === 'B');
  check('carousel reaches Z and returns to B', carousel.last.selectedLetter === 'Z');
  await page.evaluate(() => window.QLOBE_DEBUG.selectLetter('z'));
  await page.screenshot({ path: path.join(SHOTS, 'carousel-z.png') });
  await page.evaluate(() => window.QLOBE_DEBUG.selectLetter('b'));

  const allModes = await page.evaluate(async () => {
    const D = window.QLOBE_DEBUG;
    const modes = [];
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
      await D.startMode(`${letter}-quest`);
      const image = document.querySelector('.lth-art');
      await image?.decode?.().catch(() => {});
      const targetImages = [...document.querySelectorAll('.lth-hotspot .lth-treasure-art')];
      const wrongImages = [...document.querySelectorAll('[data-role="wrong"] .lth-treasure-art')];
      await Promise.all([...targetImages, ...wrongImages].map((image) => image.decode?.().catch(() => {})));
      const slots = [...document.querySelectorAll('.lth-hotspot')].map((target) => {
        const rect = target.getBoundingClientRect();
        return {
          id: target.dataset.target,
          layout: target.dataset.layout,
          label: target.getAttribute('aria-label'),
          centerX: rect.left + rect.width / 2,
        };
      });
      const wrongIds = D.getTargets().filter((target) => target.role === 'wrong').map((target) => target.id).sort();
      modes.push({
        letter: D.getState().selectedLetter,
        targets: D.getTargets().filter((target) => target.role === 'correct').length,
        slots,
        wrongIds,
        mapped: slots.length === 3
          && new Set(slots.map((slot) => slot.id)).size === 3
          && slots.every((slot) => slot.id && slot.label)
          && D.getTargets().filter((target) => target.role === 'wrong').length === 2,
        targetArtLoaded: targetImages.length === 3 && targetImages.every((image) => image.naturalWidth > 0),
        targetSources: targetImages.map((image) => image.src),
        decoyLoaded: wrongImages.length === 2 && wrongImages.every((image) => image.naturalWidth > 0),
        loaded: Boolean(image?.naturalWidth),
        full: Boolean(image && Math.abs(image.getBoundingClientRect().width - innerWidth) < 1
          && Math.abs(image.getBoundingClientRect().height - innerHeight) < 1),
      });
    }
    D.selectLetter('b');
    D.home();
    return modes;
  });
  check('all 26 islands have loaded scenes, three mapped targets, their specified distractor, and a chest', allModes.length === 26 && allModes.every((mode) => {
    const slug = mode.letter.toLowerCase();
    const expectedWrong = [`decoy-${slug}`, `distractor-${slug}-${DISTRACTOR_BY_LETTER[slug]}`].sort();
    return mode.targets === 3 && mode.mapped && mode.targetArtLoaded && mode.decoyLoaded && mode.loaded && mode.full
      && JSON.stringify(mode.wrongIds) === JSON.stringify(expectedWrong);
  }), JSON.stringify(allModes));
  await page.evaluate(async () => {
    const D = window.QLOBE_DEBUG;
    D.fastTimers(0.05);
    await D.startMode('b-quest');
  });
  await page.screenshot({ path: path.join(SHOTS, 'hunt.png') });

  const huntRaster = await page.evaluate(() => ({
    svg: document.querySelectorAll('svg').length,
    imgs: [...document.querySelectorAll('img')].map((img) => ({ src: img.getAttribute('src') || '', naturalWidth: img.naturalWidth })),
  }));
  const huntUiNames = ['badges/b.webp', 'prompts/b.webp', 'tokens/empty.webp', 'counts/0.webp', 'controls/back.webp', 'controls/pause.webp', 'controls/sound.webp'];
  check('B hunt uses raster badge, prompt, tokens, count plate, and controls', huntRaster.svg === 0 && huntUiNames.every((name) => huntRaster.imgs.some((img) => img.src.includes(`/assets/ui-raster/${name}`))), JSON.stringify(huntRaster));
  check('B hunt raster UI images are loaded', huntRaster.imgs.filter((img) => img.src.includes('/assets/ui-raster/')).every((img) => img.naturalWidth > 0), JSON.stringify(huntRaster.imgs));
  await page.locator('.lth-sound').click();

  const sampledNarration = new Map();
  const layeredQa = async (letter, ids, distractorId, distractorAsset, feedbackAsset, narrationKey, { dynamicCompletion = false } = {}) => {
    const slug = letter.toLowerCase();
    await page.evaluate(async (mode) => { window.QLOBE_DEBUG.fastTimers(0.05); await window.QLOBE_DEBUG.startMode(mode); }, `${slug}-quest`);
    await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0), null, { timeout: 5000 });
    await page.screenshot({ path: path.join(SHOTS, `${slug}-hunt.png`) });
    const hunt = await page.evaluate(({ targetIds, expectsTightArt }) => {
      const D = window.QLOBE_DEBUG;
      const imgs = [...document.querySelectorAll('img')].map((img) => ({ src: img.getAttribute('src') || '', naturalWidth: img.naturalWidth }));
      const rect = (selector) => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r && ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }); };
      const boxes = targetIds.map((id) => rect(`.lth-target-${id}`));
      const chest = rect('.lth-wrong-hotspot');
      const distractor = rect('.lth-distractor-hotspot');
      const overlap = (a, b) => a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const allChoices = [...boxes, chest, distractor];
      const choiceElements = [...document.querySelectorAll('.lth-hotspot, .lth-wrong-hotspot, .lth-distractor-hotspot')];
      const sizing = expectsTightArt
        ? choiceElements.every((element) => element.classList.contains('has-tight-art') && parseFloat(getComputedStyle(element, '::before').top) === -10)
        : allChoices.every((box) => box.width >= 96 && box.height >= 96);
      return { imgs, boxes, chest, distractor, sizing, separated: allChoices.every((box, i) => box && box.width > 0 && box.height > 0 && allChoices.every((other, j) => i === j || !overlap(box, other))) };
    }, { targetIds: ids, expectsTightArt: slug >= 'd' });
    const names = [`badges/${slug}.webp`, `prompts/${slug}.webp`, 'tokens/empty.webp', 'counts/0.webp', 'controls/back.webp', 'controls/pause.webp', 'controls/sound.webp'];
    const expectedTargets = ids.map((id) => `/assets/papercraft/${slug}-hunt/${id}.webp`);
    const expectedBackground = `/assets/papercraft/${slug}-hunt/background.webp`;
    const correctArtLoaded = expectedTargets.every((src) => hunt.imgs.some((img) => img.src.includes(src) && img.naturalWidth > 0));
    check(`${letter} hunt uses its raster scene, UI, chest, cross-letter distractor, and loaded images`, hunt.imgs.some((img) => img.src.includes(expectedBackground)) && correctArtLoaded && hunt.imgs.some((img) => img.src.includes('/assets/papercraft/a-hunt/chest.webp') || img.src.includes(`/assets/papercraft/${slug}-hunt/chest.webp`)) && hunt.imgs.some((img) => img.src.includes(distractorAsset) && img.naturalWidth > 0) && names.every((name) => hunt.imgs.some((img) => img.src.includes(`/assets/ui-raster/${name}`) && img.naturalWidth > 0)) && !hunt.imgs.some((img) => img.src.startsWith('data:image/svg')), JSON.stringify(hunt));
    check(`${letter} target, chest, and distractor rectangles use the intended tap sizing and do not overlap`, hunt.sizing && hunt.separated, JSON.stringify(hunt));
    await page.locator('.lth-wrong-hotspot').click();
    await page.waitForTimeout(80);
    await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(1));
    await page.locator('.lth-distractor-hotspot').click();
    const wrongFeedback = await page.evaluate(() => ({
      count: document.querySelector('.lth-count')?.textContent.trim(),
      art: document.querySelector('.lth-feedback img')?.getAttribute('src') || '',
      busy: !window.QLOBE_DEBUG.getState().awaitingInput,
    }));
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 2000 });
    const wrongRecovered = await page.evaluate((expectedNarrationKey) => ({
      count: document.querySelector('.lth-count')?.textContent.trim(),
      logged: window.QLOBE_DEBUG.getAudioLog().some((entry) => entry.key === expectedNarrationKey),
      recovered: window.QLOBE_DEBUG.getState().awaitingInput,
    }), narrationKey);
    check(`${letter} chest and DOM cross-letter distractor show raster feedback without advancing progress`, wrongFeedback.count === '0 of 3' && wrongFeedback.busy && wrongFeedback.art.endsWith(`/assets/ui-raster/feedback/${feedbackAsset}`) && wrongRecovered.count === '0 of 3' && wrongRecovered.logged && wrongRecovered.recovered, JSON.stringify({ wrongFeedback, wrongRecovered }));
    await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(0.05));
    const result = await page.evaluate(async (targetIds) => {
      const D = window.QLOBE_DEBUG; const order = [...targetIds].reverse();
      const paused = await D.tap('pause');
      const pauseDialog = document.querySelector('.lth-paused'); const resumeButton = document.querySelector('.lth-resume');
      const pauseSiblings = [...(pauseDialog?.parentElement?.children || [])].filter((el) => el !== pauseDialog);
      const pause = paused.accepted && pauseDialog?.querySelector(`img[src*="pause-${D.getState().selectedLetter.toLowerCase()}.webp"]`) && document.activeElement === resumeButton && pauseSiblings.every((el) => el.inert);
      await D.tap('resume');
      const counts = [document.querySelector('.lth-count')?.textContent.trim()];
      const bakedMarkers = [];
      for (const id of order) {
        await D.tap(id); await new Promise((resolve) => setTimeout(resolve, 80));
        counts.push(document.querySelector('.lth-count')?.textContent.trim());
        if (D.getState().screen === 'play') bakedMarkers.push([...document.querySelectorAll('.lth-baked-found-art')].filter((image) => image.naturalWidth > 0).length);
      }
      await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)));
      const end = D.getState();
      const completionTargets = [...document.querySelectorAll('.lth-completion-target')]
        .map((container) => { const image = container.querySelector('img'); return { src: image?.getAttribute('src') || '', loaded: image?.naturalWidth > 0 }; });
      return { counts, bakedMarkers, end, art: document.querySelector('.lth-art')?.getAttribute('src') || '', panel: [...document.querySelectorAll('img')].find((img) => img.src.includes('/completion-'))?.src || '', token: [...document.querySelectorAll('img')].find((img) => img.src.includes(`/tokens/${D.getState().selectedLetter.toLowerCase()}.webp`))?.src || '', next: document.querySelector('.lth-next img')?.src || '', decoration: document.querySelector('.lth-completion-decoration img')?.getAttribute('src') || '', completionTargets, pause };
    }, ids);
    check(`${letter} targets progress 0→1→2→completion in non-data order`, result.counts[0] === '0 of 3' && result.counts[1] === '1 of 3' && result.counts[2] === '2 of 3' && result.end.screen === 'end' && result.end.found === 3, JSON.stringify(result));
    const completionArt = dynamicCompletion
      ? result.art.endsWith(`/assets/papercraft/${slug}-hunt/background.webp`)
      : result.art.endsWith(`${slug}-celebration.webp`);
    const completionDecoration = !dynamicCompletion || result.decoration.endsWith('/assets/papercraft/shared/open-chest.webp');
    const completionObjects = !dynamicCompletion || (result.completionTargets.length === 3
      && result.completionTargets.every((target) => target.loaded && target.src.includes(`/assets/papercraft/${slug}-hunt/`)));
    check(`${letter} completion art, three collected objects, panel, matching token, open chest where required, and raster NEXT`, completionArt && completionDecoration && completionObjects && result.panel.includes(`completion-${slug}.webp`) && result.token.includes(`/tokens/${slug}.webp`) && result.next.endsWith('/assets/ui-raster/next.webp'), JSON.stringify(result));
    check(`${letter} pause dialog uses matching raster art and isolates focus`, result.pause, JSON.stringify(result));
    const narrationEntries = await page.evaluate((keys) => {
      const log = window.QLOBE_DEBUG.getAudioLog();
      return Object.fromEntries(keys.map((key) => [key, [...log].reverse().find((entry) => entry.key === key) || null]));
    }, [narrationKey, `complete-${slug}`]);
    for (const [key, entry] of Object.entries(narrationEntries)) sampledNarration.set(key, entry);
    await page.waitForTimeout(1100);
    await page.screenshot({ path: path.join(SHOTS, `${slug}-end.png`) });
  };
  await layeredQa('A', ['ant', 'apple', 'alligator'], 'distractor-a-ball', '/assets/papercraft/b-hunt/ball.webp', 'wrong-a-ball.webp', 'wrong-a-ball');
  await layeredQa('C', ['cat', 'cupcake', 'car'], 'distractor-c-apple', '/assets/papercraft/a-hunt/apple.webp', 'wrong-c-apple.webp', 'wrong-c-apple');
  await layeredQa('D', ['dog', 'drum', 'duck'], 'distractor-d-apple', '/assets/papercraft/a-hunt/apple.webp', 'wrong-d-apple.webp', 'wrong-d-apple', { dynamicCompletion: true });
  await layeredQa('I', ['ice-cream', 'igloo', 'insect'], 'distractor-i-cupcake', '/assets/papercraft/c-hunt/cupcake.webp', 'wrong-i-cupcake.webp', 'wrong-i-cupcake', { dynamicCompletion: true });
  await layeredQa('S', ['sun', 'starfish', 'shell'], 'distractor-s-alligator', '/assets/papercraft/a-hunt/alligator.webp', 'wrong-s-alligator.webp', 'wrong-s-alligator', { dynamicCompletion: true });
  await layeredQa('X', ['xylophone', 'x-ray', 'x-mark'], 'distractor-x-cat', '/assets/papercraft/c-hunt/cat.webp', 'wrong-x-cat.webp', 'wrong-x-cat', { dynamicCompletion: true });
  await layeredQa('Z', ['zebra', 'zipper', 'zucchini'], 'distractor-z-butterfly', '/assets/papercraft/b-hunt/butterfly.webp', 'wrong-z-butterfly.webp', 'wrong-z-butterfly', { dynamicCompletion: true });
  await page.evaluate(async () => {
    await window.QLOBE_DEBUG.startMode('b-quest');
    window.QLOBE_DEBUG.fastTimers(0.05);
  });

  const bGeometry = await page.evaluate(() => {
    const rect = (selector) => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r && ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }); };
    const boxes = ['.lth-target-boat', '.lth-target-butterfly', '.lth-target-ball'].map((s) => rect(s));
    const chest = rect('.lth-wrong-hotspot');
    const distractor = rect('.lth-distractor-hotspot');
    const overlap = (a, b) => a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const allChoices = [...boxes, chest, distractor];
    return { boxes, chest, distractor, separated: allChoices.every((box, i) => box && box.right - box.left >= 96 && box.bottom - box.top >= 96 && allChoices.every((other, j) => i === j || !overlap(box, other))) };
  });
  check('B targets, chest, and cross-letter distractor are large and non-overlapping', bGeometry.separated, JSON.stringify(bGeometry));

  await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(1));
  await page.locator('.lth-distractor-hotspot').click();
  const bDistractorFeedback = await page.evaluate(() => ({
    count: document.querySelector('.lth-count')?.textContent.trim(),
    art: document.querySelector('.lth-feedback img')?.getAttribute('src') || '',
    busy: !window.QLOBE_DEBUG.getState().awaitingInput,
  }));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 2000 });
  const bDistractorRecovered = await page.evaluate(() => ({
    count: document.querySelector('.lth-count')?.textContent.trim(),
    logged: window.QLOBE_DEBUG.getAudioLog().some((entry) => entry.key === 'wrong-b-cat'),
    recovered: window.QLOBE_DEBUG.getState().awaitingInput,
  }));
  check('B DOM cross-letter cat shows raster feedback, is narrated, and does not advance progress', bDistractorFeedback.count === '0 of 3' && bDistractorFeedback.busy && bDistractorFeedback.art.endsWith('/assets/ui-raster/feedback/wrong-b-cat.webp') && bDistractorRecovered.count === '0 of 3' && bDistractorRecovered.logged && bDistractorRecovered.recovered, JSON.stringify({ bDistractorFeedback, bDistractorRecovered }));

  await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(1));
  await page.locator('.lth-wrong-hotspot').click();
  const decoyPause = await page.evaluate(() => window.QLOBE_DEBUG.tap('pause'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 2000 });
  const decoyAfterClick = await page.evaluate(() => ({
    state: window.QLOBE_DEBUG.getState(),
    count: document.querySelector('.lth-count')?.textContent.trim(),
  }));
  check('real DOM chest click keeps count at zero, blocks pause during feedback, and recovers input',
    decoyPause.accepted === false && decoyPause.reason === 'busy' && decoyAfterClick.count === '0 of 3' && decoyAfterClick.state.awaitingInput,
    JSON.stringify({ decoyPause, decoyAfterClick }));

  await page.evaluate(async () => {
    await window.QLOBE_DEBUG.startMode('b-quest');
    window.QLOBE_DEBUG.fastTimers(1);
  });
  await page.locator('.lth-target-ball').click();
  const correctPause = await page.evaluate(() => window.QLOBE_DEBUG.tap('pause'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 2000 });
  check('real DOM target click advances B count, blocks pause during feedback, and recovers input',
    correctPause.accepted === false && correctPause.reason === 'busy' && await page.locator('.lth-count').textContent() === '1 of 3',
    JSON.stringify(correctPause));
  await page.screenshot({ path: path.join(SHOTS, 'b-after-one.png') });
  await page.evaluate(async () => {
    window.QLOBE_DEBUG.fastTimers(0.05);
    await window.QLOBE_DEBUG.tap('boat');
  });
  await page.waitForTimeout(80);
  check('B count reaches two after second find', await page.locator('.lth-count').textContent() === '2 of 3');
  await page.screenshot({ path: path.join(SHOTS, 'b-after-two.png') });

  const result = await page.evaluate(async () => {
    const D = window.QLOBE_DEBUG;
    D.fastTimers(0.05);
    await D.startMode('b-quest');
    const out = { pause: false, pauseRaster: false, pauseModal: false, wrong: false, order: [], nav: false, next: false, sizes: [], counts: [] };
    const waitReady = async () => {
      const deadline = performance.now() + 5000;
      while (performance.now() < deadline) {
        const state = D.getState();
        if (state.awaitingInput) return state;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return D.getState();
    };
    out.sizes = D.getTargets().map((target) => ({ id: target.id, role: target.role, w: target.rect.w, h: target.rect.h }));
    out.counts.push(document.querySelector('.lth-count')?.textContent.trim());
    const wrong = await D.tap('decoy-b');
    await waitReady();
    out.wrong = wrong.accepted && wrong.wrong === true && D.getState().found === 0;
    const paused = await D.tap('pause');
    const pauseDialog = document.querySelector('.lth-paused');
    const resumeButton = document.querySelector('.lth-resume');
    const pauseSiblings = [...(pauseDialog?.parentElement?.children || [])].filter((element) => element !== pauseDialog);
    out.pause = paused.accepted && D.getState().paused;
    out.pauseRaster = Boolean(pauseDialog?.querySelector('img[src*="/assets/ui-raster/dialogs/pause-b.webp"]')
      && resumeButton?.querySelector('img[src*="/assets/ui-raster/controls/resume.webp"]'));
    out.pauseModal = document.activeElement === resumeButton && pauseSiblings.length > 0 && pauseSiblings.every((element) => element.inert);
    const resumed = await D.tap('resume');
    out.pause = out.pause && resumed.accepted && !D.getState().paused && document.activeElement === document.querySelector('.lth-pause');
    for (const id of ['boat', 'butterfly', 'ball']) {
      const tap = await D.tap(id);
      out.order.push({ id, accepted: tap.accepted });
      await waitReady();
      out.counts.push(document.querySelector('.lth-count')?.textContent.trim());
    }
    out.end = D.getState();
    await D.tap('back');
    out.nav = D.getState().screen === 'splash';
    await D.startMode('b-quest');
    await D.tap('ball'); await waitReady();
    await D.tap('boat'); await waitReady();
    await D.tap('butterfly'); await waitReady();
    await D.tap('next');
    out.next = D.getState().screen === 'splash' && D.getState().selectedLetter === 'C';
    return out;
  });
  check('pause/resume works', result.pause);
  check('pause uses raster UI and isolates modal focus', result.pauseRaster && result.pauseModal, JSON.stringify(result));
  check('decoy treasure does not count as a match', result.wrong);
  check('three B targets work in arbitrary order', result.order.every((item) => item.accepted) && result.end.screen === 'end' && result.end.found === 3);
  check('visible B count progresses from 0 of 3 through completion', result.counts[0] === '0 of 3' && result.counts[1] === '1 of 3' && result.counts[2] === '2 of 3' && result.end.found === 3);
  check('back navigation returns to the carousel and NEXT advances to C', result.nav && result.next);
  check('interactive controls are at least 96px', result.sizes.every((target) => target.w >= 96 && target.h >= 96), JSON.stringify(result.sizes));
  await page.evaluate(async () => {
    const D = window.QLOBE_DEBUG;
    D.fastTimers(0.05);
    await D.startMode('b-quest');
    await D.winRound();
    await D.winRound();
    await D.winRound();
  });
  await page.screenshot({ path: path.join(SHOTS, 'end.png') });
  const completion = await page.evaluate(() => ({
    art: document.querySelector('.lth-art')?.getAttribute('src') || '',
    cta: document.querySelector('.lth-next')?.getAttribute('aria-label') || '',
    ctaArt: document.querySelector('.lth-next img')?.getAttribute('src') || '',
  }));
  check('B completion uses island celebration art and NEXT CTA', completion.art.endsWith('island-celebration.webp') && completion.cta === 'Next letter island' && completion.ctaArt.endsWith('/assets/ui-raster/next.webp'), JSON.stringify(completion));
  const endRaster = await page.evaluate(() => ({
    svg: document.querySelectorAll('svg').length,
    imgs: [...document.querySelectorAll('img')].map((img) => ({ src: img.getAttribute('src') || '', naturalWidth: img.naturalWidth })),
  }));
  check('B completion uses raster panel, tokens, NEXT, and controls', endRaster.svg === 0
    && ['completion-b.webp', 'tokens/b.webp', 'next.webp', 'controls/back.webp', 'controls/sound.webp'].every((name) => endRaster.imgs.some((img) => img.src.includes(`/assets/ui-raster/${name}`))), JSON.stringify(endRaster));
  check('B completion raster UI images are loaded', endRaster.imgs.filter((img) => img.src.includes('/assets/ui-raster/')).every((img) => img.naturalWidth > 0), JSON.stringify(endRaster.imgs));
  const nextPress = await activeButtonGeometry(page, '.lth-next');
  const nextAfterPress = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('NEXT remains horizontally centered while pressed', Math.abs(nextPress.beforeCenterX - nextPress.activeCenterX) <= 1 && nextAfterPress.screen === 'end', JSON.stringify(nextPress));
  await page.locator('.lth-sound').click();

  const audioLog = await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog());
  const audioKeys = new Map(audioLog.map((entry) => [entry.key, entry]));
  check('B narration uses recorded clips for hunt and completion prompts', ['hunt-b', 'complete-b'].every((key) => audioKeys.get(key)?.kind === 'clip'), JSON.stringify(audioLog));
  check('B target narration uses a recorded clip after real interaction', audioLog.some((entry) => entry.key === 'found-b-ball' && entry.kind === 'clip'), JSON.stringify(audioLog));
  const sampledInteractionKeys = [
    'complete-a',
    'wrong-c-apple', 'complete-c',
    'wrong-d-apple', 'complete-d',
    'wrong-i-cupcake', 'complete-i',
    'wrong-s-alligator', 'complete-s',
    'wrong-x-cat', 'complete-x',
    'wrong-z-butterfly', 'complete-z',
  ];
  const sampledNarrationValid = (key) => {
    const entry = sampledNarration.get(key) || audioKeys.get(key);
    return entry?.text === audioInventory.lines[key]
      && (entry.kind === 'clip' || (!REQUIRE_RECORDED_AUDIO && entry.kind === 'speech'));
  };
  check(REQUIRE_RECORDED_AUDIO ? 'release gate: sampled A-Z narration uses recorded clips' : 'sampled A-Z narration uses exact authored clips or fallback speech',
    sampledInteractionKeys.every(sampledNarrationValid),
    JSON.stringify(sampledInteractionKeys.filter((key) => !sampledNarrationValid(key))));

  await page.evaluate(async () => {
    const D = window.QLOBE_DEBUG;
    D.fastTimers(0.05);
    await D.startMode('b-quest');
    await D.tap('butterfly');
    await D.tap('boat');
  });
  await page.locator('.lth-target-ball').click();
  await page.waitForTimeout(900);
  const finalNarrationMidpoint = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end', null, { timeout: 6000 });
  check('final B find narration completes before celebration transition', finalNarrationMidpoint.screen === 'play' && finalNarrationMidpoint.found === 3, JSON.stringify(finalNarrationMidpoint));

  await page.evaluate(async () => {
    const D = window.QLOBE_DEBUG;
    D.fastTimers(0.05);
    await D.startMode('b-quest');
    await D.tap('butterfly');
    await D.tap('boat');
  });
  await page.locator('.lth-target-ball').click();
  await page.waitForFunction(() => {
    const state = window.QLOBE_DEBUG.getState();
    return state.screen === 'play' && state.found === 3;
  });
  await page.locator('.lth-back').click();
  await page.waitForTimeout(5000);
  const cancelledCompletion = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('Back during final narration cancels the pending completion transition', cancelledCompletion.screen === 'splash' && cancelledCompletion.found === 0, JSON.stringify(cancelledCompletion));

  const staleFeedback = await page.evaluate(async () => {
    const D = window.QLOBE_DEBUG;
    D.fastTimers(1);
    await D.startMode('d-quest');
    void D.tap('dog');
    D.home();
    await D.startMode('e-quest');
    await new Promise((resolve) => setTimeout(resolve, 220));
    const afterFind = D.getState();
    D.home();
    await D.startMode('d-quest');
    void D.tap('decoy-d');
    D.home();
    await D.startMode('e-quest');
    await new Promise((resolve) => setTimeout(resolve, 180));
    return { afterFind, afterWrong: D.getState() };
  });
  check('navigation cancels stale ordinary-find and wrong-choice feedback writes',
    staleFeedback.afterFind.screen === 'play' && staleFeedback.afterFind.selectedLetter === 'E' && staleFeedback.afterFind.found === 0 && staleFeedback.afterFind.awaitingInput
      && staleFeedback.afterWrong.screen === 'play' && staleFeedback.afterWrong.selectedLetter === 'E' && staleFeedback.afterWrong.found === 0 && staleFeedback.afterWrong.awaitingInput,
    JSON.stringify(staleFeedback));

  const tightTapHalo = await page.evaluate(async () => {
    await window.QLOBE_DEBUG.startMode('d-quest');
    const target = document.querySelector('.lth-target-dog');
    const rect = target.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left - 5, rect.top + rect.height / 2);
    return {
      target: hit?.closest?.('[data-target]')?.dataset.target || '',
      margin: parseFloat(getComputedStyle(target, '::before').left),
    };
  });
  check('D-Z artwork receives only the authored 10px invisible tap halo', tightTapHalo.target === 'dog' && tightTapHalo.margin === -10, JSON.stringify(tightTapHalo));

  // D–Z placement regression: exercise every scene at both supported landscape ratios.
  async function huntLayoutSweep(targetCtx, width, height, shotName) {
    const sweepPage = targetCtx === ctx ? page : await targetCtx.newPage();
    if (targetCtx !== ctx) {
      await sweepPage.goto(URL_GAME, { waitUntil: 'networkidle' });
      await sweepPage.evaluate(() => window.QLOBE_DEBUG.ready);
    }
    await sweepPage.setViewportSize({ width, height });
    const captures = [];
    const reports = [];
    for (const letter of 'defghijklmnopqrstuvwxyz') {
      await sweepPage.evaluate(async (mode) => { window.QLOBE_DEBUG.fastTimers(0.05); await window.QLOBE_DEBUG.startMode(mode); }, `${letter}-quest`);
      await sweepPage.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0), null, { timeout: 5000 });
      reports.push(await sweepPage.evaluate(() => {
        const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const box = (selector) => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r && { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        const choices = [...document.querySelectorAll('.lth-hotspot, .lth-wrong-hotspot, .lth-distractor-hotspot')].map((node) => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, tight: node.classList.contains('has-tight-art'), tapMargin: parseFloat(getComputedStyle(node, '::before').top) }; });
        const stageElement = document.querySelector('.lth-scene-stage');
        const stageZ = Number(getComputedStyle(stageElement).zIndex) || 0;
        const controls = ['.lth-prompt', '.lth-count', '.lth-back', '.lth-pause', '.lth-sound'].map((selector) => {
          const element = document.querySelector(selector);
          return element && { selector, rect: box(selector), z: Number(getComputedStyle(element).zIndex) || 0 };
        }).filter((entry) => entry?.rect);
        const stage = box('.lth-scene-stage');
        const scale = Math.max(innerWidth / 4, innerHeight / 3);
        const expected = { width: 4 * scale, height: 3 * scale, left: (innerWidth - 4 * scale) / 2, top: (innerHeight - 3 * scale) / 2 };
        const stageOk = stage && Math.abs(stage.width / stage.height - 4 / 3) < 0.01 && ['width', 'height', 'left', 'top'].every((key) => Math.abs(stage[key] - expected[key]) < 2);
        const controlOverlaps = choices.flatMap((r, i) => controls.filter((c) => overlap(r, c.rect)).map((c) => ({ choice: i, control: c.selector, controlZ: c.z })));
        const controlsSafe = controlOverlaps.every((entry) => entry.controlZ > stageZ);
        return { choices, count: choices.length, usable: choices.length === 5 && choices.every((r) => r.width > 0 && r.height > 0 && r.tight && r.tapMargin === -10 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight), separated: choices.every((r, i) => choices.every((o, j) => i === j || !overlap(r, o))), controlsSafe, controlOverlaps, stageOk };
      }));
      captures.push({ letter: letter.toUpperCase(), data: `data:image/jpeg;base64,${(await sweepPage.screenshot({ type: 'jpeg', quality: 55 })).toString('base64')}` });
    }
    const reportSummary = reports.map((r, i) => ({ letter: String.fromCharCode(68 + i), count: r.count, usable: r.usable, separated: r.separated, controlsSafe: r.controlsSafe, controlOverlaps: r.controlOverlaps, stageOk: r.stageOk }));
    check(`D-Z hunt choices fit, remain separated, and stay below controls at ${width}x${height}`, reports.every((r) => r.count === 5 && r.usable && r.separated && r.controlsSafe), JSON.stringify(reportSummary));
    check(`D-Z scene stage uses 4:3 cover bounds at ${width}x${height}`, reports.every((r) => r.stageOk), JSON.stringify(reportSummary));
    const atlas = await targetCtx.newPage();
    await atlas.setContent('<style>body{margin:0;padding:20px;background:#f7f0df;font:700 18px system-ui;color:#3b2a1d}main{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}figure{margin:0;padding:8px;background:white;border:2px solid #decba5;border-radius:12px}img{display:block;width:100%}figcaption{text-align:center;padding-top:4px}</style><main></main>');
    await atlas.evaluate((items) => { const main = document.querySelector('main'); for (const item of items) { const f = document.createElement('figure'); const i = document.createElement('img'); const c = document.createElement('figcaption'); i.src = item.data; c.textContent = `${item.letter} hunt`; f.append(i, c); main.append(f); } }, captures);
    await atlas.waitForFunction(() => [...document.images].length === 23 && [...document.images].every((image) => image.complete && image.naturalWidth > 0));
    await atlas.screenshot({ path: path.join(SHOTS, shotName), fullPage: true });
    await atlas.close();
    if (targetCtx !== ctx) await sweepPage.close();
  }
  await huntLayoutSweep(ctx, 1180, 820, 'dz-hunt-contact-sheet-standard.png');
  const compactCtx = await browser.newContext({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await huntLayoutSweep(compactCtx, 667, 375, 'dz-hunt-contact-sheet-compact.png');
  await compactCtx.close();
  const wideCtx = await browser.newContext({ viewport: { width: 2048, height: 987 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await huntLayoutSweep(wideCtx, 2048, 987, 'dz-hunt-contact-sheet-wide.png');
  await wideCtx.close();

  const atlasItems = allModes.slice(3).flatMap((mode) => mode.slots.map((slot, index) => ({
    letter: mode.letter,
    label: slot.label,
    src: mode.targetSources[index],
  })));
  const atlasPage = await ctx.newPage();
  await atlasPage.setViewportSize({ width: 1440, height: 900 });
  await atlasPage.setContent('<style>body{margin:0;padding:24px;background:#f7f0df;font:700 20px system-ui;color:#3b2a1d}main{display:grid;grid-template-columns:repeat(6,1fr);gap:16px}figure{margin:0;padding:12px;background:white;border:2px solid #decba5;border-radius:16px;text-align:center}img{display:block;width:100%;aspect-ratio:1;object-fit:contain}figcaption{padding-top:6px}</style><main></main>');
  await atlasPage.evaluate((items) => {
    const main = document.querySelector('main');
    for (const item of items) {
      const figure = document.createElement('figure');
      const image = document.createElement('img');
      const caption = document.createElement('figcaption');
      image.src = item.src;
      image.alt = '';
      caption.textContent = `${item.letter} — ${item.label}`;
      figure.append(image, caption);
      main.append(figure);
    }
  }, atlasItems);
  await atlasPage.waitForFunction(() => [...document.images].length === 69
    && [...document.images].every((image) => image.complete && image.naturalWidth > 0), null, { timeout: 10000 });
  const atlasLoaded = await atlasPage.locator('img').count();
  await atlasPage.screenshot({ path: path.join(SHOTS, 'dz-object-atlas.png'), fullPage: true });
  check('D-Z visual review atlas contains all 69 loaded target cutouts', atlasItems.length === 69 && atlasLoaded === 69);
  await atlasPage.close();

  const portraitCtx = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const portraitPage = await portraitCtx.newPage();
  const portraitBag = monitor(portraitPage);
  await portraitPage.goto(URL_GAME, { waitUntil: 'networkidle' });
  await portraitPage.evaluate(() => window.QLOBE_DEBUG.ready);
  const portrait = await portraitPage.evaluate(() => {
    const lock = document.querySelector('.lth-orientation-lock');
    return { state: window.QLOBE_DEBUG.getState(), display: lock ? getComputedStyle(lock).display : 'missing', text: lock?.textContent.trim() || '' };
  });
  await portraitPage.screenshot({ path: path.join(SHOTS, 'portrait.png') });
  check('portrait reduced-motion shows landscape guidance', portrait.state.screen === 'splash' && portrait.display === 'grid' && /sideways/i.test(portrait.text), JSON.stringify(portrait));
  check('no console/page/request errors', bag.errors.length === 0 && bag.failed.length === 0 && portraitBag.errors.length === 0 && portraitBag.failed.length === 0, [...bag.errors, ...bag.failed, ...portraitBag.errors, ...portraitBag.failed].slice(0, 5).join(' | '));

  await portraitCtx.close();
  await ctx.close();
  await browser.close();
  await writeFile(path.join(SHOTS, 'qa.json'), JSON.stringify({ results }, null, 2));
  const failed = results.filter((resultItem) => !resultItem.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed; shots in ${SHOTS}`);
  if (failed.length) { console.error(`FAILED: ${failed.map((resultItem) => resultItem.name).join(', ')}`); process.exit(1); }
}

main().catch((error) => { console.error(error); process.exit(1); });
