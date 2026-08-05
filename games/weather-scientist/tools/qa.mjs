#!/usr/bin/env node
// Real-Chrome production smoke and visual-QC driver for Weather Scientist.
//
//   node games/weather-scientist/tools/qa.mjs --base http://127.0.0.1:8127


import path from 'node:path';
import {
  audio, baseUrl, checkSessionClean, createReporter, debug, ensureShots,
  launchChrome, openSession, resolveShots,
} from '../../../tools/qa/lib/driver.mjs';


const base = baseUrl('http://127.0.0.1:8127');
const shots = resolveShots('/private/tmp/weather-scientist-qa');
const reporter = createReporter({ detailOnFail: true });
const { check, finish } = reporter;
const sessions = [];


async function openGame(browser, viewport, reducedMotion = 'no-preference', context = {}, mute = true) {
  const session = await openSession(browser, {
    url: `${base}/games/weather-scientist/`,
    base,
    viewport,
    reducedMotion,
    context,
    allowAbortedMedia: true,
    seed: 42,
    mute,
  });
  sessions.push(session);
  await session.page.waitForFunction(() => [...document.images].every((item) => item.complete));
  return session;
}


async function screenshot(page, name) {
  await page.screenshot({ path: path.join(shots, name) });
}


async function layoutAudit(page, label, { expectReduced = false } = {}) {
  const audit = await page.evaluate(() => {
    const state = window.QLOBE_DEBUG.getState();
    const targets = window.QLOBE_DEBUG.getTargets();
    const primary = targets.filter((item) => /^weather-(sun|rain|wind|cloud)$/.test(item.id));
    const outside = targets.filter(({ rect }) => (
      rect.x < -1 || rect.y < -1 || rect.x + rect.w > innerWidth + 1 || rect.y + rect.h > innerHeight + 1
    ));
    const undersized = primary.filter(({ rect }) => rect.w < 95.5 || rect.h < 95.5);
    const stage = document.getElementById('weather-stage').getBoundingClientRect();
    return {
      state,
      primary,
      outside,
      undersized,
      viewport: { width: innerWidth, height: innerHeight },
      stage: { x: stage.x, y: stage.y, w: stage.width, h: stage.height },
      overflow: {
        x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      },
    };
  });
  check(`${label}: all four weather controls are present`, audit.primary.length === 4, JSON.stringify(audit.primary));
  check(`${label}: primary controls meet the 96px minimum`, audit.undersized.length === 0, JSON.stringify(audit.undersized));
  check(`${label}: targets stay inside the viewport`, audit.outside.length === 0, JSON.stringify(audit.outside));
  check(`${label}: document has no overflow`, audit.overflow.x <= 0 && audit.overflow.y <= 0, JSON.stringify(audit.overflow));
  if (expectReduced) {
    check(`${label}: reduced motion reaches the weather engine`,
      audit.state.world?.reducedMotion === true
        && audit.state.world?.particleBudget?.rain === 6
        && audit.state.world?.particleBudget?.leaf === 3,
      JSON.stringify(audit.state.world));
  }
  return audit;
}


async function testHub(browser) {
  const session = await openSession(browser, {
    url: `${base}/#sensorial-science`, base, viewport: { width: 1180, height: 820 }, ready: false,
  });
  sessions.push(session);
  const page = session.page;
  const tile = page.locator('a.tile[aria-label*="Weather Scientist"]');
  check('hub lists Weather Scientist exactly once', await tile.count() === 1);
  check('hub uses the new watercolor catalog tile',
    (await tile.locator('img').getAttribute('src')) === 'assets/hub/tiles/weather-scientist.jpg');
  await screenshot(page, '00-hub.png');
  await Promise.all([page.waitForURL('**/games/weather-scientist/'), tile.click()]);
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  check('hub launches the production route', page.url().endsWith('/games/weather-scientist/'));
  check('hub-launched game boots at its splash', (await debug.getState(page)).screen === 'splash');
}


async function testFullFlow(browser) {
  const session = await openGame(browser, { width: 1366, height: 1024 }, 'no-preference', {}, false);
  const page = session.page;
  const initial = await debug.getState(page);
  check('splash boots in one focused Weather Lab mode',
    initial.screen === 'splash'
      && (await debug.listModes(page)).map((mode) => mode.id).join(',') === 'weather-lab');
  check('splash uses authored raster title, meadow, and four badges', await page.evaluate(() => {
    const title = document.querySelector('.splash-title');
    const meadow = document.querySelector('.world-art');
    const badges = [...document.querySelectorAll('.preview-badges img')];
    return title?.getAttribute('alt') === 'Weather Scientist'
      && title?.getAttribute('src')?.endsWith('/assets/title.webp')
      && meadow?.getAttribute('src')?.endsWith('/assets/backgrounds/observatory-meadow.webp')
      && badges.length === 4
      && [title, meadow, ...badges].every((item) => item.complete && item.naturalWidth > 0);
  }));
  check('primary presentation contains no SVG or emoji image substitute', await page.evaluate(() => (
    [...document.querySelectorAll('.world-art, .world-layer, .tree-layer, .flower-layer, .preview-badges img')]
      .every((item) => /\.(?:webp|jpg)(?:$|\?)/.test(item.src) && !item.src.includes('emoji'))
  )));
  const manifestCoverage = await page.evaluate(async () => {
    const manifest = await fetch('./assets/audio/manifest.json').then((response) => response.json());
    const lines = await fetch('./assets/audio/lines.json').then((response) => response.json());
    return { expected: Object.keys(lines), available: Object.keys(manifest), valid: Object.keys(lines).filter((key) => manifest[key]?.file && manifest[key]?.dur > 0) };
  });
  check('all 15 narration lines have committed clips',
    manifestCoverage.expected.length === 15 && manifestCoverage.valid.length === 15,
    JSON.stringify(manifestCoverage));
  const splashTargets = await debug.getTargets(page);
  check('splash Play target meets 96px minimum',
    splashTargets.some(({ id, rect }) => id === 'play' && rect.w >= 96 && rect.h >= 96),
    JSON.stringify(splashTargets));
  await screenshot(page, '01-splash-landscape.png');

  await page.evaluate(async () => {
    const clips = await import('../../../shared/js/voice-clips.js');
    window.__weatherClipStarts = [];
    clips.onClip((key) => window.__weatherClipStarts.push(key));
    window.QLOBE_DEBUG.clearAudioLog();
  });
  const playHit = await page.evaluate(() => {
    const button = document.querySelector('[data-target="play"]');
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    const chain = [];
    for (let node = button; node; node = node.parentElement) chain.push({
      node: node.id || node.className || node.tagName,
      pointerEvents: getComputedStyle(node).pointerEvents,
      zIndex: getComputedStyle(node).zIndex,
    });
    return { hit: hit?.id || hit?.className || hit?.tagName, owns: hit === button || button.contains(hit), chain };
  });
  check('Play owns the center of its visible hit area', playHit.owns, JSON.stringify(playHit));
  await page.locator('[data-target="play"]').click({ timeout: 3000 });
  await page.waitForFunction(() => window.__weatherClipStarts.includes('welcome'));
  const welcomeLog = await debug.getAudioLog(page);
  check('first real child gesture starts the committed welcome clip',
    audio.heardClip(welcomeLog, 'welcome'), audio.describe(welcomeLog));
  await debug.mute(page, true);
  let state = await debug.getState(page);
  check('Play enters the first guided Sun discovery',
    state.screen === 'guided' && state.target === 'sun' && state.step === 0 && state.flowerStage === 'seedling',
    JSON.stringify(state));
  await layoutAudit(page, '1366×1024 guided');

  await debug.tap(page, 'weather-cloud');
  check('non-target weather gets an immediate truthful preview', (await debug.getState(page)).weather.cloud === true);
  await page.waitForTimeout(750);
  state = await debug.getState(page);
  check('non-target preview returns off without advancing',
    state.weather.cloud === false && state.step === 0 && state.completed.length === 0,
    JSON.stringify(state));

  await page.locator('[data-target="weather-sun"]').click();
  state = await debug.getState(page);
  check('Sun warms the meadow and advances the flower to a bud',
    state.weather.sun && state.flowerStage === 'bud' && state.completed.join(',') === 'sun',
    JSON.stringify(state));
  await page.waitForTimeout(1100);
  state = await debug.getState(page);
  check('Sun result clip keeps the guided prompt on Sun until it finishes',
    state.target === 'sun' && state.awaitingInput === false && state.completed.includes('sun'),
    JSON.stringify(state));
  await screenshot(page, '02-sun-bud.png');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().target === 'rain');

  await page.locator('[data-target="weather-rain"]').click();
  state = await debug.getState(page);
  check('Rain visibly grows the flower to bloom',
    state.weather.rain && state.flowerStage === 'bloom' && state.completed.includes('rain'),
    JSON.stringify(state));
  await screenshot(page, '03-rain-bloom.png');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().target === 'wind');
  state = await debug.getState(page);
  check('guided shower clears while the flower remains grown', !state.weather.rain && state.flowerStage === 'bloom', JSON.stringify(state));

  const slider = await page.locator('.wind-slider').boundingBox();
  await page.mouse.move(slider.x + 8, slider.y + slider.height / 2);
  await page.mouse.down();
  check('wind drag owns an active pointer', (await debug.getState(page)).dragging === true);
  await page.mouse.move(slider.x + slider.width * .82, slider.y + slider.height / 2, { steps: 10 });
  check('real wind drag crosses the gentle-breeze threshold', (await debug.getState(page)).weather.wind >= .54);
  await screenshot(page, '04-wind-drag.png');
  await page.mouse.up();
  check('wind pointer releases cleanly', (await debug.getState(page)).dragging === false);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().target === 'cloud');

  await page.locator('[data-target="weather-cloud"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'celebration');
  state = await debug.getState(page);
  check('four real discoveries reach the scientist celebration',
    state.completed.join(',') === 'sun,rain,wind,cloud'
      && state.flowerStage === 'bloom' && state.weather.cloud,
    JSON.stringify(state));
  await screenshot(page, '05-celebration.png');

  await page.locator('[data-target="explore"]').click();
  check('Explore enters open observatory without replacing the world', (await debug.getState(page)).screen === 'free');
  await page.locator('[data-target="weather-rain"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().rainbowSeen === true);
  state = await debug.getState(page);
  check('Sun plus rain reveals the authored rainbow in free play',
    state.weather.sun && state.weather.rain && state.rainbowSeen && state.world?.rainbow,
    JSON.stringify(state));
  await screenshot(page, '06-free-rainbow.png');

  const freeSlider = await page.locator('.wind-slider').boundingBox();
  await page.mouse.move(freeSlider.x + freeSlider.width * .45, freeSlider.y + freeSlider.height / 2);
  await page.mouse.down();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  check('window blur cancels an active wind pointer', (await debug.getState(page)).dragging === false);
  await page.mouse.up();

  await page.locator('[data-target="reset"]').click();
  state = await debug.getState(page);
  check('Reset starts a fresh open weather day',
    state.screen === 'free' && state.flowerStage === 'seedling' && !state.rainbowSeen
      && !state.weather.sun && !state.weather.rain && !state.weather.cloud && state.weather.wind === 0,
    JSON.stringify(state));
  await page.locator('[data-target="sound"]').click();
  check('Sound control unmutes every channel', (await debug.getState(page)).muted === false);
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  state = await debug.getState(page);
  check('Persisted page restore keeps every sound channel unmuted',
    state.muted === false && state.world?.muted === false,
    JSON.stringify(state));
  await page.locator('[data-target="sound"]').click();
  check('Sound control remutes every channel', (await debug.getState(page)).muted === true);
  await page.locator('[data-target="back"]').click();
  check('Back returns in-page to the Weather Scientist splash', (await debug.getState(page)).screen === 'splash');
  const homeHref = await page.locator('[data-target="home"]').getAttribute('href');
  check('splash Home points to the catalog root', homeHref === '../../');
}


async function testViewport(browser, viewport, label, reducedMotion = 'no-preference', context = {}) {
  const session = await openGame(browser, viewport, reducedMotion, context, true);
  const page = session.page;
  await debug.startMode(page, 'weather-lab');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput);
  await layoutAudit(page, label, { expectReduced: reducedMotion === 'reduce' });
  await screenshot(page, `${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`);
}


async function main() {
  await ensureShots(shots);
  const browser = await launchChrome();
  try {
    await testHub(browser);
    await testFullFlow(browser);
    await testViewport(browser, { width: 1024, height: 768 }, '1024×768 guided');
    await testViewport(browser, { width: 820, height: 1180 }, '820×1180 portrait', 'no-preference', {
      deviceScaleFactor: 2, hasTouch: true, isMobile: true,
    });
    await testViewport(browser, { width: 1180, height: 560 }, '1180×560 short landscape');
    await testViewport(browser, { width: 1024, height: 768 }, '1024×768 reduced motion', 'reduce');
    for (const [index, session] of sessions.entries()) checkSessionClean(reporter, session, `session ${index + 1}`);
  } finally {
    for (const session of sessions) await session.close().catch(() => {});
    await browser.close();
    finish({ suffix: `; screenshots in ${shots}` });
  }
}


main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
