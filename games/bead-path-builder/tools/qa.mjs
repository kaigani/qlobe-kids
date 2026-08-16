#!/usr/bin/env node
// Production-Chrome acceptance and visual-QC driver for Bead Path Builder.
// Run from qlobe-kids while the repository is served locally:
//   node games/bead-path-builder/tools/qa.mjs --base http://127.0.0.1:8000

import path from 'node:path';
import {
  baseUrl,
  checkSessionClean,
  createReporter,
  debug,
  dragBetween,
  ensureShots,
  launchChrome,
  openSession,
  resolveShots,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const gameUrl = `${base}/games/bead-path-builder/`;
const shots = resolveShots('/private/tmp/bead-path-builder-qa');
const { check, finish } = createReporter({ detailOnFail: true });
const sessions = [];
const PLATFORM_ANALYTICS = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
];

async function stubAnalytics(session) {
  await session.context.route(
    /https:\/\/(?:www\.googletagmanager\.com|www\.google-analytics\.com)\//,
    (route) => route.fulfill({ status: 204, body: '' }),
  );
}

async function openRun(browser, {
  url = gameUrl,
  viewport = { width: 1280, height: 960 },
  reducedMotion = 'no-preference',
  ready = true,
  mute = true,
  ignoreConsole = [],
  beforeGoto = null,
} = {}) {
  const session = await openSession(browser, {
    url,
    base,
    viewport,
    reducedMotion,
    goto: false,
    ready: false,
    allowDataUrls: true,
    allowAbortedMedia: true,
    allowRemote: PLATFORM_ANALYTICS,
    ignoreConsole,
  });
  await stubAnalytics(session);
  if (beforeGoto) await beforeGoto(session);
  await session.page.goto(url, { waitUntil: 'networkidle' });
  if (ready) {
    await debug.waitForHook(session.page);
    await debug.waitForReady(session.page);
    await debug.seed(session.page, 17);
    await debug.fastTimers(session.page, 20);
    await debug.mute(session.page, mute);
  }
  sessions.push(session);
  return session;
}

const state = (page) => debug.getState(page);

async function waitForVisibleImages(page) {
  await page.waitForFunction(() => [...document.images].filter((image) => {
    const rect = image.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
      && rect.top < innerHeight && rect.left < innerWidth;
  }).every((image) => image.complete && image.naturalWidth > 0));
  await page.evaluate(async () => {
    await Promise.all([...document.images]
      .filter((image) => {
        const rect = image.getBoundingClientRect();
        return image.decode && rect.width > 0 && rect.height > 0 && rect.bottom > 0
          && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
      })
      .map((image) => image.decode()));
  });
}

async function shot(page, name) {
  await waitForVisibleImages(page);
  await page.screenshot({ path: path.join(shots, name) });
}

async function auditLayout(page, label) {
  await waitForVisibleImages(page);
  const audit = await page.evaluate(() => {
    const targets = window.QLOBE_DEBUG.getTargets();
    const undersized = targets.filter(({ rect }) => rect && (rect.w < 96 || rect.h < 96));
    const outside = targets.filter(({ rect }) => rect && (
      rect.x < -1 || rect.y < -1 || rect.x + rect.w > innerWidth + 1 || rect.y + rect.h > innerHeight + 1
    ));
    const brokenImages = [...document.images]
      .filter((image) => image.getClientRects().length && (!image.complete || image.naturalWidth < 1))
      .map((image) => image.src);
    return {
      undersized,
      outside,
      brokenImages,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  check(`${label}: every action is at least 96px`, audit.undersized.length === 0, JSON.stringify(audit.undersized));
  check(`${label}: every action stays in the viewport`, audit.outside.length === 0, JSON.stringify(audit.outside));
  check(`${label}: no page overflow`, audit.scrollWidth <= audit.viewport.width && audit.scrollHeight <= audit.viewport.height, JSON.stringify(audit));
  check(`${label}: every visible image decoded`, audit.brokenImages.length === 0, audit.brokenImages.join(', '));
}

async function waitForPlacement(page, before) {
  await page.waitForFunction((count) => {
    const current = window.QLOBE_DEBUG.getState();
    return current.placed.length > count || current.screen === 'complete';
  }, before);
}

async function placeExpected(page) {
  const before = (await state(page)).placed.length;
  await debug.call(page, 'placeExpected');
  await waitForPlacement(page, before);
}

async function fillGuided(page) {
  while ((await state(page)).screen === 'board') await placeExpected(page);
  return state(page);
}

async function exerciseFirstAbRound(page) {
  let current = await state(page);
  const startingCount = current.placed.length;
  const wrong = await page.evaluate((expected) => (
    [...document.querySelectorAll('[data-bead]')].find((button) => button.dataset.bead !== expected)?.dataset.bead
  ), current.expected);
  check('guided tray exposes a real distractor', Boolean(wrong), wrong || 'none');
  await page.locator(`[data-bead="${wrong}"]`).click();
  await page.waitForFunction((id) => window.QLOBE_DEBUG.getState().selected === id, wrong);
  check('selected bead stays in the pinned tray', await page.locator(`[data-bead="${wrong}"]`).count() === 1);
  await page.locator(`[data-bead="${wrong}"]`).click();
  await page.waitForFunction(() => {
    const value = window.QLOBE_DEBUG.getState();
    return value.mismatches === 1 && value.busy === false;
  });
  current = await state(page);
  check('wrong bead returns gently without progress', current.screen === 'board' && current.placed.length === startingCount && current.selected === null, JSON.stringify(current));

  const tapExpected = current.expected;
  await page.locator(`[data-bead="${tapExpected}"]`).click();
  await page.waitForFunction((id) => window.QLOBE_DEBUG.getState().selected === id, tapExpected);
  check('tap selection is announced with aria-pressed', await page.locator(`[data-bead="${tapExpected}"]`).getAttribute('aria-pressed') === 'true');
  const tapSlot = await page.locator('.slot.current').boundingBox();
  await page.mouse.click(tapSlot.x + tapSlot.width / 2, tapSlot.y + tapSlot.height / 2);
  await waitForPlacement(page, startingCount);
  check('tap bead then glowing slot places exactly one bead', (await state(page)).placed.length === startingCount + 1);

  current = await state(page);
  const missCount = current.placed.length;
  const source = page.locator(`[data-bead="${current.expected}"]`);
  const sourceBox = await source.boundingBox();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(8, 8, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  check('off-target drag returns home without progress', (await state(page)).placed.length === missCount && await page.locator('[data-qk-drag-ghost]').count() === 0);

  current = await state(page);
  const dragCount = current.placed.length;
  await dragBetween(
    page,
    await page.locator(`[data-bead="${current.expected}"]`).boundingBox(),
    await page.locator('.slot.current').boundingBox(),
    { steps: 10 },
  );
  await waitForPlacement(page, dragCount);
  check('real pointer drag threads the expected bead', (await state(page)).placed.length === dragCount + 1);

  const rapidCount = (await state(page)).placed.length;
  await page.evaluate(() => {
    window.QLOBE_DEBUG.placeExpected();
    window.QLOBE_DEBUG.placeExpected();
  });
  await waitForPlacement(page, rapidCount);
  await page.waitForTimeout(100);
  check('busy gate commits rapid duplicate input once', (await state(page)).placed.length === rapidCount + 1);
}

async function runGuidedMode(page, config, mode, { interactions = false } = {}) {
  await debug.startMode(page, mode);
  const modeled = mode === 'ab' ? 2 : 3;
  for (let round = 0; round < 3; round += 1) {
    const opening = await state(page);
    check(`${mode.toUpperCase()} round ${round + 1} uses its exact sequence`, JSON.stringify(opening.sequence) === JSON.stringify(config.modes[mode][round]), JSON.stringify(opening.sequence));
    check(`${mode.toUpperCase()} round ${round + 1} starts with ${modeled} modeled beads`, opening.placed.length === modeled, JSON.stringify(opening.placed));
    if (round === 0 && interactions) await exerciseFirstAbRound(page);
    const complete = await fillGuided(page);
    check(`${mode.toUpperCase()} round ${round + 1} completes with the exact six beads`, complete.screen === 'complete' && JSON.stringify(complete.placed) === JSON.stringify(config.modes[mode][round]), JSON.stringify(complete));
    if (round < 2) {
      await debug.tap(page, 'again');
      await page.waitForFunction((next) => {
        const value = window.QLOBE_DEBUG.getState();
        return value.screen === 'board' && value.round === next;
      }, round + 1);
    }
  }
}

async function auditAuthoredAssets(page, config) {
  const report = await page.evaluate(async ({ beadFiles }) => {
    const files = [
      './assets/atelier.webp', './assets/workboard.webp', './assets/title.webp',
      './assets/ui/mode-card.webp', './assets/ui/wear-button.webp',
      './assets/video/threading-tip-poster.webp', './assets/video/fox-necklace-poster.webp',
      ...beadFiles.map((file) => `./assets/beads/${file}`),
    ];
    const dimensions = {};
    const failed = [];
    for (const file of files) {
      try {
        const response = await fetch(file);
        if (!response.ok) throw new Error(String(response.status));
        const bitmap = await createImageBitmap(await response.blob());
        dimensions[file] = [bitmap.width, bitmap.height];
        bitmap.close();
      } catch (error) { failed.push(`${file}: ${error}`); }
    }
    const css = {
      atelier: getComputedStyle(document.querySelector('#game')).backgroundImage,
      card: getComputedStyle(document.querySelector('.mode')).backgroundImage,
    };
    return {
      dimensions,
      failed,
      css,
      forbiddenNodes: document.querySelectorAll('svg, canvas').length,
      pictographs: (document.body.innerText.match(/\p{Extended_Pictographic}/gu) || []).join(''),
    };
  }, { beadFiles: Object.values(config.beads).map(({ file }) => file) });
  check('all authored runtime rasters fetch and decode', report.failed.length === 0, report.failed.join(' | '));
  const beadDimensions = Object.entries(report.dimensions).filter(([file]) => file.includes('/beads/'));
  check('all six bead sprites share a 384px production canvas', beadDimensions.length === 6 && beadDimensions.every(([, dims]) => dims[0] === 384 && dims[1] === 384), JSON.stringify(beadDimensions));
  check('atelier and mode cards render from authored raster art', report.css.atelier.includes('atelier.webp') && report.css.card.includes('mode-card.webp'), JSON.stringify(report.css));
  check('runtime exposes no SVG, canvas, or emoji artwork', report.forbiddenNodes === 0 && report.pictographs === '', JSON.stringify(report));
}

async function auditAudio(page, config) {
  const report = await page.evaluate(async (expectedKeys) => {
    const [manifestResponse, linesResponse] = await Promise.all([
      fetch('./assets/audio/manifest.json'),
      fetch('./assets/audio/lines.json'),
    ]);
    if (!manifestResponse.ok || !linesResponse.ok) return { missingFiles: true };
    const manifest = await manifestResponse.json();
    const lines = await linesResponse.json();
    const missing = expectedKeys.filter((key) => !manifest[key] || !lines[key]);
    const decodeFailures = [];
    for (const [key, entry] of Object.entries(manifest)) {
      const result = await new Promise((resolve) => {
        const audio = new Audio();
        const timer = setTimeout(() => resolve('timeout'), 8000);
        audio.onloadedmetadata = () => { clearTimeout(timer); resolve(Number.isFinite(audio.duration) && audio.duration > 0 ? '' : 'duration'); };
        audio.onerror = () => { clearTimeout(timer); resolve('decode'); };
        audio.preload = 'metadata';
        audio.src = `./assets/audio/${entry.file}`;
      });
      if (result) decodeFailures.push(`${key}:${result}`);
    }
    return { missingFiles: false, missing, decodeFailures, manifest };
  }, Object.keys(config.lines));
  check('every spoken line has a recorded clip and text entry', !report.missingFiles && report.missing.length === 0, JSON.stringify(report.missing || report));
  check('production Chrome decodes every recorded clip', !report.missingFiles && report.decodeFailures.length === 0, JSON.stringify(report.decodeFailures || report));
  return report;
}

async function auditVideos(page) {
  const report = await page.evaluate(async () => {
    const decoded = {};
    for (const id of ['threading-tip', 'fox-necklace']) {
      decoded[id] = await new Promise((resolve) => {
        const video = document.createElement('video');
        const timer = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), 12000);
        video.onloadedmetadata = () => {
          clearTimeout(timer);
          resolve({ ok: true, width: video.videoWidth, height: video.videoHeight, duration: video.duration });
        };
        video.onerror = () => { clearTimeout(timer); resolve({ ok: false, reason: 'decode' }); };
        video.preload = 'metadata';
        video.src = `./assets/video/${id}.mp4`;
      });
    }
    return { support: document.createElement('video').canPlayType('video/mp4'), decoded };
  });
  check('Chrome reports MP4 support', Boolean(report.support), JSON.stringify(report));
  check('both MiniMax clips decode at 832x480 for roughly five seconds', Object.values(report.decoded).every((video) => video.ok && video.width === 832 && video.height === 480 && video.duration >= 3.5 && video.duration <= 6.5), JSON.stringify(report.decoded));
}

async function drive(browser) {
  const hub = await openRun(browser, { url: `${base}/#writing-fine-motor`, ready: false, viewport: { width: 1280, height: 960 } });
  const tile = hub.page.locator('a.tile[aria-label*="Bead Path Builder"]');
  check('hub registers Bead Path Builder exactly once', await tile.count() === 1);
  check('hub preserves the curated tile', (await tile.locator('img').getAttribute('src')) === 'assets/hub/tiles/bead-path-builder.jpg');
  await shot(hub.page, '00-hub.png');

  const run = await openRun(browser);
  const { page } = run;
  const config = await page.evaluate(async () => (await fetch('./config.json')).json());
  await page.evaluate(() => localStorage.removeItem('qlo.be/bead-path-builder/v1'));
  check('QLOBE_DEBUG v1 is ready', await page.evaluate(() => window.QLOBE_DEBUG.version === 1));
  check('AB, ABC, and Free are the exact registered modes', (await debug.listModes(page)).join(',') === 'ab,abc,free');
  await auditLayout(page, 'landscape shelf');
  await auditAuthoredAssets(page, config);
  await shot(page, '01-shelf-landscape.png');

  await runGuidedMode(page, config, 'ab', { interactions: true });
  await auditLayout(page, 'AB completion');
  await shot(page, '02-ab-complete.png');

  await debug.startMode(page, 'abc');
  const hintSnapshot = await state(page);
  await debug.call(page, 'playVideo', 'threading-tip', { posterOnly: true });
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'mirror');
  check('threading hint can be requested as a poster without a video element', await page.locator('img.video').count() === 1 && await page.locator('video').count() === 0);
  await shot(page, '03-threading-tip-poster.png');
  await debug.tap(page, 'return');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'board');
  const hintReturn = await state(page);
  check('threading hint returns to the unchanged active target', JSON.stringify(hintReturn.placed) === JSON.stringify(hintSnapshot.placed) && hintReturn.expected === hintSnapshot.expected);

  await runGuidedMode(page, config, 'abc');
  await auditLayout(page, 'ABC completion');
  await shot(page, '04-abc-complete.png');
  const savedBeforeMirror = await page.evaluate(() => JSON.parse(localStorage.getItem('qlo.be/bead-path-builder/v1')).count);
  await debug.tap(page, 'wear');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'mirror');
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1, null, { timeout: 12000 }).catch(() => {});
  check('Wear It opens the animated Magic Mirror', await page.locator('video').count() === 1 && await page.locator('video').evaluate((video) => video.readyState >= 1).catch(() => false));
  await auditLayout(page, 'Magic Mirror');
  await shot(page, '05-magic-mirror.png');
  await debug.tap(page, 'replay');
  check('Magic Mirror replay stays on the reward', (await state(page)).screen === 'mirror');
  await debug.tap(page, 'back');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'complete');
  const savedAfterBack = await page.evaluate(() => JSON.parse(localStorage.getItem('qlo.be/bead-path-builder/v1')).count);
  check('returning from the mirror does not double-count completion', savedAfterBack === savedBeforeMirror, `${savedBeforeMirror} -> ${savedAfterBack}`);
  await debug.tap(page, 'wear');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'mirror');
  const roundBeforeAgain = (await state(page)).round;
  await debug.tap(page, 'another');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'board');
  check('Make another advances to the next guided round', (await state(page)).round === roundBeforeAgain + 1);

  await debug.startMode(page, 'free');
  check('Free hides Finish with no beads', await page.locator('[data-target="finish"]').count() === 0);
  const freeIds = ['round-red', 'heart-coral', 'barrel-yellow', 'star-purple'];
  for (let index = 0; index < freeIds.length; index += 1) {
    const before = (await state(page)).placed.length;
    await debug.call(page, 'placeBead', freeIds[index]);
    await waitForPlacement(page, before);
    check(`Free hides Finish after ${index + 1} bead${index ? 's' : ''}`, await page.locator('[data-target="finish"]').count() === (index === 3 ? 1 : 0));
  }
  await auditLayout(page, 'Free board');
  await shot(page, '06-free-four-beads.png');
  await page.locator('[data-slot][data-index="2"]').click();
  const revised = await state(page);
  check('tapping a placed Free bead returns it and everything to its right', JSON.stringify(revised.placed) === JSON.stringify(freeIds.slice(0, 2)) && await page.locator('[data-target="finish"]').count() === 0, JSON.stringify(revised));
  for (const id of ['flower-teal', 'diamond-blue', 'heart-coral']) {
    const before = (await state(page)).placed.length;
    await debug.call(page, 'placeBead', id);
    await waitForPlacement(page, before);
  }
  const chosen = (await state(page)).placed;
  await debug.tap(page, 'finish');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'complete');
  const freeComplete = await state(page);
  check('Free completion preserves the child’s exact chosen sequence', JSON.stringify(freeComplete.placed) === JSON.stringify(chosen), JSON.stringify(freeComplete.placed));
  check('Free completion draws exactly the chosen bead count', await page.locator('.necklace img').count() === chosen.length);
  await shot(page, '07-free-complete.png');
  await debug.mute(page, true);
  await debug.call(page, 'playVideo', 'fox-necklace', { posterOnly: true });
  check('mute persists into a poster-only reward', (await state(page)).muted === true && await page.locator('img.video').count() === 1);

  await auditVideos(page);

  const portrait = await openRun(browser, { viewport: { width: 768, height: 1024 }, reducedMotion: 'reduce' });
  await auditLayout(portrait.page, 'portrait shelf');
  await shot(portrait.page, '08-shelf-portrait.png');
  await debug.startMode(portrait.page, 'abc');
  await auditLayout(portrait.page, 'portrait board');
  await shot(portrait.page, '09-board-portrait.png');
  await debug.call(portrait.page, 'completeRound');
  await portrait.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'complete');
  await auditLayout(portrait.page, 'portrait completion');
  await shot(portrait.page, '10-complete-portrait.png');
  const reducedMp4 = [];
  portrait.page.on('request', (request) => { if (request.url().endsWith('.mp4')) reducedMp4.push(request.url()); });
  await debug.call(portrait.page, 'playVideo', 'fox-necklace');
  await portrait.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'mirror');
  check('reduced motion uses the poster and never requests MP4', await portrait.page.locator('img.video').count() === 1 && reducedMp4.length === 0, reducedMp4.join(', '));
  await auditLayout(portrait.page, 'portrait reduced-motion mirror');
  await shot(portrait.page, '11-mirror-portrait-reduced.png');

  const phone = await openRun(browser, { viewport: { width: 375, height: 667 } });
  await debug.startMode(phone.page, 'free');
  const firstTray = await phone.page.locator('[data-bead]').evaluateAll((nodes) => nodes.map((node) => node.dataset.bead));
  check('phone Free tray presents three non-overflowing bead choices', firstTray.length === 3, JSON.stringify(firstTray));
  await debug.tap(phone.page, 'more');
  const secondTray = await phone.page.locator('[data-bead]').evaluateAll((nodes) => nodes.map((node) => node.dataset.bead));
  check('phone Free pager makes all six bead choices immediately reachable', new Set([...firstTray, ...secondTray]).size === 6 && secondTray.length === 3, JSON.stringify({ firstTray, secondTray }));
  await auditLayout(phone.page, '375px Free board');
  await shot(phone.page, '12-free-phone.png');
  for (const id of ['flower-teal', 'star-purple', 'heart-coral', 'flower-teal']) {
    const before = (await state(phone.page)).placed.length;
    await debug.call(phone.page, 'placeBead', id);
    await waitForPlacement(phone.page, before);
  }
  check('phone Free tray keeps paging beside its Finish action', await phone.page.locator('[data-target="more"]').count() === 1 && await phone.page.locator('[data-target="finish"]').count() === 1);
  await auditLayout(phone.page, '375px Free board with Finish');
  await shot(phone.page, '13-free-phone-finish.png');
  await debug.startMode(phone.page, 'abc');
  await auditLayout(phone.page, '375px guided board');
  await shot(phone.page, '14-guided-phone.png');

  const fallback = await openRun(browser, {
    ignoreConsole: ['Failed to load resource'],
    beforeGoto: async (session) => {
      await session.context.route('**/assets/video/threading-tip.mp4', (route) => route.fulfill({ status: 404, body: '' }));
    },
  });
  await debug.startMode(fallback.page, 'ab');
  await debug.call(fallback.page, 'playVideo', 'threading-tip');
  await fallback.page.waitForFunction(() => document.querySelector('img.video'));
  check('missing video falls back once to its authored poster', await fallback.page.locator('img.video').count() === 1 && (await state(fallback.page)).screen === 'mirror');
  fallback.failed = fallback.failed.filter((entry) => !entry.includes('/assets/video/threading-tip.mp4'));

  const persistence = await openRun(browser);
  await persistence.page.evaluate(() => localStorage.removeItem('qlo.be/bead-path-builder/v1'));
  await debug.startMode(persistence.page, 'free');
  const selectedProgress = await persistence.page.evaluate(() => JSON.parse(localStorage.getItem('qlo.be/bead-path-builder/v1')));
  check('selecting a mode persists it without inventing a completion', selectedProgress.mode === 'free' && selectedProgress.count === 0, JSON.stringify(selectedProgress));
  await persistence.page.reload({ waitUntil: 'networkidle' });
  await debug.waitForHook(persistence.page);
  await debug.waitForReady(persistence.page);
  const reloadedProgress = await state(persistence.page);
  check('the pattern shelf restores the last selected mode on reload', reloadedProgress.screen === 'shelf' && reloadedProgress.lastMode === 'free', JSON.stringify(reloadedProgress));
  check('the restored mode is exposed as last played accessibly', (await persistence.page.locator('[data-mode="free"]').getAttribute('aria-label')) === 'My Necklace, last played');

  const audioRun = await openRun(browser, { mute: false });
  const audioReport = await auditAudio(audioRun.page, config);
  await audioRun.page.evaluate(async () => {
    const clips = await import('/shared/js/voice-clips.js');
    window.__beadClipStarts = [];
    clips.onClip((key) => window.__beadClipStarts.push(key));
  });
  await audioRun.page.locator('[data-mode="ab"]').click();
  await audioRun.page.waitForFunction(() => window.__beadClipStarts.includes('intro-ab'), null, { timeout: 12000 }).catch(() => {});
  const audioState = await state(audioRun.page);
  check('first real gesture starts the recorded intro clip', audioState.audioLog.some((entry) => entry.key === 'intro-ab' && entry.kind === 'clip'), JSON.stringify(audioState.audioLog));
  check('audio manifest was available for the gesture check', !audioReport.missingFiles);
  await debug.mute(audioRun.page, true);

  const nav = await openRun(browser);
  await nav.page.locator('[data-mode="ab"]').click();
  await nav.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'board');
  await debug.tap(nav.page, 'back');
  await nav.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'shelf');
  check('Back returns play to the in-game pattern shelf', true);
  await debug.tap(nav.page, 'home');
  await nav.page.waitForURL((url) => url.pathname === '/' || url.pathname.endsWith('/index.html'));
  check('Home appears on the shelf and returns to the catalog', true);

  for (const [index, session] of sessions.entries()) checkSessionClean({ check }, session, `session ${index + 1}`);
}

async function closeWithin(close, timeout = 5000) {
  let timer;
  await Promise.race([
    Promise.resolve().then(close).catch(() => {}),
    new Promise((resolve) => { timer = setTimeout(resolve, timeout); }),
  ]);
  clearTimeout(timer);
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome();
  try { await drive(browser); }
  finally {
    await Promise.all(sessions.map((session) => closeWithin(() => session.close())));
    await closeWithin(() => browser.close());
  }
  finish({ suffix: `; screenshots in ${shots}`, exit: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
