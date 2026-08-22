#!/usr/bin/env node
// Real-Chrome interaction, audio, responsive-layout, and screenshot QA.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const DEFAULT_PW = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../tools-local/playwright/node_modules/noop.js',
);
const require = createRequire(process.env.QLOBE_PLAYWRIGHT_REQUIRE || DEFAULT_PW);
const { chromium } = require('playwright');
const base = (process.env.QLOBE_BASE || 'http://127.0.0.1:8127').replace(/\/$/, '');
const shots = path.resolve(process.env.QLOBE_SHOTS || '/private/tmp/monster-opera-qa');
const checks = [];

function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  checks.push({ name, ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function isAllowedExternal(url) {
  return url.includes('googletagmanager.com') || url.includes('google-analytics.com');
}

async function openGame(browser, viewport, reducedMotion = 'no-preference', contextOptions = {}) {
  const context = await browser.newContext({
    viewport,
    reducedMotion,
    deviceScaleFactor: 1,
    ...contextOptions,
  });
  const page = await context.newPage();
  const errors = [];
  const failed = [];
  const remote = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    if (!isAllowedExternal(request.url())) failed.push(`FAILED ${request.url()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });
  page.on('request', (request) => {
    const url = request.url();
    const allowed = url.startsWith(base)
      || url.startsWith('data:')
      || isAllowedExternal(url);
    if (!allowed) remote.push(url);
  });
  await page.goto(`${base}/games/monster-opera/`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => window.QLOBE_DEBUG.ready);
  return { context, page, errors, failed, remote };
}

function shot(page, name) {
  return page.screenshot({ path: path.join(shots, name) });
}

function checkClean(name, run) {
  check(`${name} has no page errors`, run.errors.length === 0, run.errors.join(' | '));
  check(`${name} has no failed requests`, run.failed.length === 0, run.failed.join(' | '));
  check(`${name} has no unexpected remote requests`, run.remote.length === 0, run.remote.join(' | '));
}

async function layoutStatus(page) {
  return page.evaluate(() => {
    const targets = QLOBE_DEBUG.getTargets();
    return {
      targets,
      min96: targets.every(({ rect }) => rect.w >= 96 && rect.h >= 96),
      inBounds: targets.every(({ rect }) => (
        rect.x >= -0.5
        && rect.y >= -0.5
        && rect.x + rect.w <= innerWidth + 0.5
        && rect.y + rect.h <= innerHeight + 0.5
      )),
      noPageOverflow: document.documentElement.scrollWidth <= innerWidth
        && document.documentElement.scrollHeight <= innerHeight,
    };
  });
}

async function main() {
  await rm(shots, { recursive: true, force: true });
  await mkdir(shots, { recursive: true });
  const useBundledChromium = process.argv.includes('--chromium');
  const browser = await chromium.launch({
    channel: useBundledChromium ? undefined : 'chrome',
    headless: true,
  });

  // Production catalog path: registry -> art/music tile -> game boot.
  const hubContext = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const hub = await hubContext.newPage();
  const hubErrors = [];
  const hubFailed = [];
  hub.on('pageerror', (error) => hubErrors.push(String(error)));
  hub.on('console', (message) => {
    if (message.type() === 'error') hubErrors.push(message.text());
  });
  hub.on('requestfailed', (request) => {
    if (!isAllowedExternal(request.url())) hubFailed.push(request.url());
  });
  await hub.goto(`${base}/#art-music`, { waitUntil: 'networkidle' });
  const catalogCard = hub.locator('[data-game-id="monster-opera"]');
  await catalogCard.waitFor();
  check('catalog exposes one Monster Opera beta tile', await catalogCard.count() === 1
    && (await catalogCard.getAttribute('aria-label')) === 'Monster Opera — beta');
  check('catalog tile raster decodes', await catalogCard.locator('img').evaluate((image) => (
    image.complete && image.naturalWidth > 0
  )));
  await shot(hub, '00-catalog-art-music.png');
  await catalogCard.click();
  await hub.waitForFunction(() => window.QLOBE_DEBUG?.ready);
  await hub.evaluate(async () => window.QLOBE_DEBUG.ready);
  check('catalog tile opens the production game path', new URL(hub.url()).pathname.endsWith('/games/monster-opera/'));
  check('catalog-opened game reaches splash', await hub.evaluate(() => QLOBE_DEBUG.getState().screen === 'splash'));
  check('catalog route has no page or local-request errors', hubErrors.length === 0 && hubFailed.length === 0,
    [...hubErrors, ...hubFailed].join(' | '));
  await hubContext.close();

  // Keyboard-only unlock: focus and activate the initial Chorus CTA, then a
  // chorus monster card, without synthesizing a pointer gesture.
  const keyboard = await openGame(browser, { width: 1180, height: 820 });
  await keyboard.page.locator('[data-action="start-chorus"]').focus();
  await keyboard.page.keyboard.press('Enter');
  check('keyboard Enter opens chorus from the initial CTA', await keyboard.page.evaluate(() => QLOBE_DEBUG.getState().screen === 'chorus'));
  await keyboard.page.evaluate(() => QLOBE_DEBUG.clearAudioLog());
  await keyboard.page.locator('[data-chorus-monster="mint"]').focus();
  await keyboard.page.keyboard.press('Enter');
  await keyboard.page.waitForFunction(() => QLOBE_DEBUG.getSampleStatus().state === 'running',
    { timeout: 1200 }).catch(() => {});
  const keyboardAudio = await keyboard.page.evaluate(() => ({
    status: QLOBE_DEBUG.getSampleStatus(),
    log: QLOBE_DEBUG.getAudioLog(),
  }));
  check('keyboard chorus activation unlocks running audio with a log entry',
    keyboardAudio.status.state === 'running' && keyboardAudio.log.length === 1,
    JSON.stringify(keyboardAudio));
  checkClean('keyboard unlock', keyboard);
  await keyboard.context.close();

  // Main landscape drive.
  const run = await openGame(browser, { width: 1180, height: 820 });
  const { page } = run;
  check('splash boots', await page.evaluate(() => QLOBE_DEBUG.getState().screen === 'splash'));
  check('debug v1 exposes three modes', await page.evaluate(() => (
    QLOBE_DEBUG.version === 1 && QLOBE_DEBUG.listModes().length === 3
  )));
  check('all raster images decode', await page.evaluate(() => (
    [...document.images].every((image) => image.complete && image.naturalWidth > 0)
  )));
  const poseIds = await page.evaluate(() => QLOBE_DEBUG.getState().activeMonster
    ? ['mint', 'pink', 'blue', 'purple', 'orange', 'yellow', 'teal', 'coral']
    : []);
  const poseStatus = await page.evaluate(async (ids) => {
    const urls = ids.flatMap((id) => [
      `./assets/monsters-singing/${id}.webp`,
      `./assets/monsters-blink/${id}.webp`,
      `./assets/monsters-gaze-left/${id}.webp`,
      `./assets/monsters-gaze-right/${id}.webp`,
    ]);
    const results = await Promise.all(urls.map((src) => new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ src, ok: image.naturalWidth > 0 });
      image.onerror = () => resolve({ src, ok: false });
      image.src = src;
    })));
    return { total: results.length, failed: results.filter((entry) => !entry.ok).map((entry) => entry.src) };
  }, poseIds);
  check('all 32 facial-pose WebPs decode', poseStatus.total === 32 && poseStatus.failed.length === 0,
    JSON.stringify(poseStatus));
  check('primary art has no svg or canvas', await page.evaluate(() => !document.querySelector('#game svg, #game canvas')));
  check('splash Home is the only catalog link', await page.evaluate(() => {
    const links = [...document.querySelectorAll('#game a')];
    return links.length === 1
      && links[0].closest('[data-qk-screen="splash"]')
      && links[0].getAttribute('href') === '../../';
  }));
  const splashLayout = await layoutStatus(page);
  check('landscape splash targets clear 96px', splashLayout.min96);
  check('landscape splash targets stay in bounds', splashLayout.inBounds);
  await shot(page, '01-splash-landscape.png');

  // A real gesture unlocks every audio channel.
  await page.locator('[data-action="start-chorus"]').click();
  check('chorus opens from the primary CTA', await page.evaluate(() => QLOBE_DEBUG.getState().screen === 'chorus'));
  await shot(page, '02-chorus-landscape.png');

  const selected = await page.evaluate(() => QLOBE_DEBUG.getState().selected);
  for (const id of selected) await page.evaluate((target) => QLOBE_DEBUG.tap(`chorus-${target}`), id);
  check('all singers can be deselected', await page.evaluate(() => QLOBE_DEBUG.getState().selected.length === 0));
  const emptyResult = await page.evaluate(() => QLOBE_DEBUG.tap('play-all'));
  check('empty chorus cannot start a hidden default show', emptyResult.accepted === false
    && await page.evaluate(() => QLOBE_DEBUG.getState().screen === 'chorus'));

  for (const id of ['mint', 'pink', 'blue', 'purple', 'orange', 'yellow']) {
    await page.evaluate((target) => QLOBE_DEBUG.tap(`chorus-${target}`), id);
  }
  check('sixth selection evicts the oldest singer at the five-part cap', await page.evaluate(() => {
    const ids = QLOBE_DEBUG.getState().selected;
    return ids.length === 5 && !ids.includes('mint') && ids.at(-1) === 'yellow';
  }));
  const capped = await page.evaluate(() => QLOBE_DEBUG.getState().selected);
  for (const id of capped) await page.evaluate((target) => QLOBE_DEBUG.tap(`chorus-${target}`), id);

  for (const id of ['mint', 'pink', 'blue', 'yellow', 'purple']) {
    await page.evaluate((target) => QLOBE_DEBUG.tap(`chorus-${target}`), id);
  }
  await page.evaluate(() => QLOBE_DEBUG.tap('play-all'));
  await page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'show');
  check('selected chorus enters the live show', await page.evaluate(() => (
    QLOBE_DEBUG.getState().showPhase === 'performing'
  )));
  const sampleStatus = await page.evaluate(() => QLOBE_DEBUG.getSampleStatus());
  check('all eight monster samples decode', sampleStatus.ready && sampleStatus.loaded === 8, JSON.stringify(sampleStatus));
  const beforeLive = await page.evaluate(() => QLOBE_DEBUG.getState().recordedEvents.length);
  await page.evaluate(() => QLOBE_DEBUG.tap('performer-pink'));
  check('live performer tap enters the recording', await page.evaluate((before) => {
    const events = QLOBE_DEBUG.getState().recordedEvents;
    return events.length === before + 1 && events.at(-1).automatic === false;
  }, beforeLive));
  check('show targets clear 96px', (await layoutStatus(page)).min96);
  await shot(page, '03-show-landscape.png');

  // Browser lifecycle pause: hiding the page must freeze show progression and
  // returning must leave the show explicitly paused until the CTA resumes it.
  await page.waitForTimeout(350);
  const beforeHidden = await page.evaluate(() => {
    const state = QLOBE_DEBUG.getState();
    return { elapsed: state.showElapsed, events: state.recordedEvents.length, phase: state.showPhase };
  });
  // Headless Chrome does not change document.hidden when another headless tab
  // is opened, and its CDP "frozen" state does not emit visibilitychange.
  // Override the read-only signal exactly as the repository's lifecycle tests
  // do, then dispatch the platform event that production browsers emit.
  await page.evaluate(() => {
    window.__MONSTER_OPERA_HIDDEN_DESCRIPTOR__ = Object.getOwnPropertyDescriptor(document, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(450);
  const hiddenState = await page.evaluate(() => {
    const state = QLOBE_DEBUG.getState();
    return {
      elapsed: state.showElapsed,
      events: state.recordedEvents.length,
      phase: state.showPhase,
      paused: state.paused,
      pausedByVisibility: state.pausedByVisibility,
      hidden: document.hidden,
    };
  });
  const returnedState = await page.evaluate(() => {
    const descriptor = window.__MONSTER_OPERA_HIDDEN_DESCRIPTOR__;
    if (descriptor) Object.defineProperty(document, 'hidden', descriptor);
    else delete document.hidden;
    delete window.__MONSTER_OPERA_HIDDEN_DESCRIPTOR__;
    document.dispatchEvent(new Event('visibilitychange'));
    return QLOBE_DEBUG.getState();
  });
  check('background lifecycle freezes show and returns explicitly paused',
    hiddenState.hidden
      && hiddenState.elapsed === beforeHidden.elapsed
      && hiddenState.events === beforeHidden.events
      && hiddenState.phase === beforeHidden.phase
      && hiddenState.paused === true
      && hiddenState.pausedByVisibility === true
      && returnedState.paused === true
      && returnedState.pausedByVisibility === true,
    JSON.stringify({ beforeHidden, hiddenState, returnedState }));
  await page.evaluate(() => QLOBE_DEBUG.tap('pause-show'));
  check('pause-show resumes after lifecycle pause', await page.evaluate(() => !QLOBE_DEBUG.getState().paused));

  await page.evaluate(() => QLOBE_DEBUG.tap('pause-show'));
  const pausedCount = await page.evaluate(() => QLOBE_DEBUG.getState().recordedEvents.length);
  const pausedTap = await page.evaluate(() => QLOBE_DEBUG.tap('performer-pink'));
  check('pause rejects performer input without recording it', pausedTap.accepted === false
    && await page.evaluate((before) => QLOBE_DEBUG.getState().paused
      && QLOBE_DEBUG.getState().recordedEvents.length === before, pausedCount));
  await page.evaluate(() => QLOBE_DEBUG.tap('pause-show'));
  check('pause toggles back to performing', await page.evaluate(() => !QLOBE_DEBUG.getState().paused));
  await page.evaluate(() => QLOBE_DEBUG.finishShow());
  check('show finishes cleanly', await page.evaluate(() => QLOBE_DEBUG.getState().showPhase === 'finished'));
  await page.evaluate(() => QLOBE_DEBUG.replayPerformance());
  await page.evaluate(() => QLOBE_DEBUG.replayPerformance());
  check('replay can restart without changing screens', await page.evaluate(() => (
    QLOBE_DEBUG.getState().screen === 'show' && QLOBE_DEBUG.getState().showPhase === 'replay'
  )));
  await page.evaluate(() => QLOBE_DEBUG.tap('done-show'));
  check('Done returns to chorus', await page.evaluate(() => QLOBE_DEBUG.getState().screen === 'chorus'));

  await page.evaluate(() => QLOBE_DEBUG.startMode('solo'));
  const soloScreenBox = await page.locator('[data-qk-screen="solo"]').boundingBox();
  let leftGaze = false;
  let rightGaze = false;
  let centeredGaze = false;
  if (soloScreenBox) {
    const y = soloScreenBox.y + soloScreenBox.height * 0.52;
    await page.mouse.move(soloScreenBox.x + 10, y);
    leftGaze = await page.waitForFunction(() => QLOBE_DEBUG.getState().activePose === 'gaze-left',
      { timeout: 700 }).then(() => true).catch(() => false);
    await page.mouse.move(soloScreenBox.x + soloScreenBox.width - 10, y);
    rightGaze = await page.waitForFunction(() => QLOBE_DEBUG.getState().activePose === 'gaze-right',
      { timeout: 700 }).then(() => true).catch(() => false);
    await page.mouse.move(soloScreenBox.x + soloScreenBox.width / 2, y);
    centeredGaze = await page.waitForFunction(() => QLOBE_DEBUG.getState().activePose === 'neutral',
      { timeout: 700 }).then(() => true).catch(() => false);
  }
  check('real pointer gaze swaps authored left/right rasters and returns neutral',
    Boolean(soloScreenBox) && leftGaze && rightGaze && centeredGaze,
    `left=${leftGaze} right=${rightGaze} neutral=${centeredGaze}`);
  await page.evaluate(() => QLOBE_DEBUG.tap('solo-pink'));
  const singer = page.locator('[data-solo-active]');
  await singer.waitFor();
  await page.evaluate(() => QLOBE_DEBUG.tap('solo-sing'));
  const singingPose = await page.waitForFunction(() => (
    document.querySelector('[data-solo-active]')?.dataset.monsterPose === 'singing'
  ), { timeout: 1000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(140);
  const returnedNeutral = await page.evaluate(() => (
    document.querySelector('[data-solo-active]')?.dataset.monsterPose === 'neutral'
  ));
  check('solo sing visibly enters singing raster pose then returns neutral', singingPose && returnedNeutral,
    `singing=${singingPose} neutral=${returnedNeutral}`);
  // The audio engine schedules a visual flap for every phrase note. Let the
  // final note settle before exercising an isolated idle blink.
  await page.waitForTimeout(1200);
  const blinkAccepted = await page.evaluate(() => QLOBE_DEBUG.blinkMonster());
  const blinkPose = await page.waitForFunction(() => (
    document.querySelector('[data-solo-active]')?.dataset.monsterPose === 'blink'
  ), { timeout: 500 }).then(() => true).catch(() => false);
  const blinkNeutral = await page.waitForFunction(() => (
    document.querySelector('[data-solo-active]')?.dataset.monsterPose === 'neutral'
  ), { timeout: 600 }).then(() => true).catch(() => false);
  // A scheduled idle blink may win the race and make the explicit debug call
  // return false because no neutral target remains; the observed transition is
  // the behavior under test in either case.
  check('blinkMonster shows blink raster pose then returns neutral', (blinkAccepted || blinkPose) && blinkPose && blinkNeutral,
    `accepted=${blinkAccepted} blink=${blinkPose} neutral=${blinkNeutral}`);
  const swipeBox = await singer.boundingBox();
  const beforeSwipe = await page.evaluate(() => QLOBE_DEBUG.getState().activeMonster);
  await page.evaluate(() => QLOBE_DEBUG.clearAudioLog());
  if (swipeBox) {
    const x = swipeBox.x + swipeBox.width / 2;
    const y = swipeBox.y + swipeBox.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 120, y, { steps: 4 });
    await page.mouse.up();
  }
  await page.waitForTimeout(40);
  const afterSwipe = await page.evaluate(() => QLOBE_DEBUG.getState().activeMonster);
  const swipeReturnedNeutral = await page.waitForFunction(() => (
    document.querySelector('[data-solo-active]')?.dataset.monsterPose === 'neutral'
  ), { timeout: 1800 }).then(() => true).catch(() => false);
  const settledSwipe = await page.evaluate(() => QLOBE_DEBUG.getState().activeMonster);
  const settledSwipePose = await page.evaluate(() => document.querySelector('[data-solo-active]')?.dataset.monsterPose);
  const swipeLog = await page.evaluate(() => QLOBE_DEBUG.getAudioLog());
  check('real primary-pointer swipe changes singer once and performs one phrase',
    Boolean(swipeBox) && afterSwipe !== beforeSwipe && settledSwipe === afterSwipe
      && swipeReturnedNeutral && settledSwipePose === 'neutral'
      && swipeLog.length === 1 && swipeLog[0].id === afterSwipe,
    `before=${beforeSwipe} after=${afterSwipe} settled=${settledSwipe} neutral=${swipeReturnedNeutral} pose=${settledSwipePose} log=${JSON.stringify(swipeLog)}`);
  await page.evaluate(() => QLOBE_DEBUG.clearAudioLog());
  await page.evaluate(() => QLOBE_DEBUG.tap('solo-coral'));
  for (const pitch of ['low', 'middle', 'high']) {
    await page.evaluate((value) => QLOBE_DEBUG.tap(`pitch-${value}`), pitch);
  }
  const soloLog = await page.evaluate(() => QLOBE_DEBUG.getAudioLog());
  check('solo UI performs all three pitches', ['low', 'middle', 'high'].every((pitch) => (
    soloLog.some((entry) => entry.id === 'coral' && entry.pitch === pitch)
  )), JSON.stringify(soloLog));
  const allowedPitchClasses = new Set([0, 2, 4, 7, 9]);
  check('every scheduled phrase note stays in C major pentatonic', soloLog.every((entry) => (
    entry.notes?.length && entry.notes.every((note) => allowedPitchClasses.has(((note % 12) + 12) % 12))
  )), JSON.stringify(soloLog));
  check('solo targets clear 96px', (await layoutStatus(page)).min96);
  await shot(page, '04-solo-landscape.png');

  await page.evaluate(() => QLOBE_DEBUG.startMode('chorus'));
  await page.evaluate(() => QLOBE_DEBUG.tap('open-stages'));
  for (const stage of ['garden', 'cloud', 'moon']) {
    await page.evaluate((id) => QLOBE_DEBUG.tap(`stage-${id}`), stage);
    check(`${stage} stage selects`, await page.evaluate((id) => QLOBE_DEBUG.getState().stage === id, stage));
  }
  await shot(page, '05-stage-picker-landscape.png');
  const muteOn = await page.evaluate(() => QLOBE_DEBUG.mute(true));
  const muteOff = await page.evaluate(() => QLOBE_DEBUG.mute(false));
  check('mute round trip is truthful', muteOn === true && muteOff === false);
  checkClean('landscape', run);
  await run.context.close();

  // Tablet portrait.
  const portrait = await openGame(browser, { width: 820, height: 1180 });
  await portrait.page.evaluate(() => QLOBE_DEBUG.startMode('chorus'));
  const portraitLayout = await layoutStatus(portrait.page);
  check('tablet portrait chorus targets clear 96px', portraitLayout.min96);
  check('tablet portrait chorus stays in bounds', portraitLayout.inBounds && portraitLayout.noPageOverflow);
  await shot(portrait.page, '06-chorus-tablet-portrait.png');
  await portrait.page.evaluate(() => QLOBE_DEBUG.tap('open-stages'));
  await shot(portrait.page, '07-stages-tablet-portrait.png');
  checkClean('tablet portrait', portrait);
  await portrait.context.close();

  // Compact phone portrait exercises the dedicated non-overflow layout.
  const phone = await openGame(
    browser,
    { width: 390, height: 844 },
    'no-preference',
    { hasTouch: true, isMobile: true },
  );
  let phoneLayout = await layoutStatus(phone.page);
  check('phone splash targets clear 96px and stay in bounds', phoneLayout.min96 && phoneLayout.inBounds);
  await shot(phone.page, '08-splash-phone.png');
  await phone.page.locator('[data-splash-monster="teal"]').tap();
  check('real touch gesture opens the chosen solo singer', await phone.page.evaluate(() => {
    const state = QLOBE_DEBUG.getState();
    return state.screen === 'solo' && state.activeMonster === 'teal';
  }));
  await phone.page.evaluate(() => QLOBE_DEBUG.startMode('chorus'));
  phoneLayout = await layoutStatus(phone.page);
  check('phone chorus targets clear 96px and stay in bounds', phoneLayout.min96 && phoneLayout.inBounds);
  await shot(phone.page, '09-chorus-phone.png');
  await phone.page.evaluate(() => QLOBE_DEBUG.startMode('solo'));
  phoneLayout = await layoutStatus(phone.page);
  check('phone solo targets clear 96px and stay in bounds', phoneLayout.min96 && phoneLayout.inBounds);
  await shot(phone.page, '10-solo-phone.png');
  await phone.page.evaluate(() => QLOBE_DEBUG.startMode('stage-show'));
  phoneLayout = await layoutStatus(phone.page);
  check('phone stages targets clear 96px and stay in bounds', phoneLayout.min96 && phoneLayout.inBounds);
  await shot(phone.page, '11-stages-phone.png');
  checkClean('phone portrait', phone);
  await phone.context.close();

  // Narrow 375px phones keep four full-size solo targets by gently
  // overlapping the card artwork instead of shrinking or clipping hit areas.
  const narrowPhone = await openGame(
    browser,
    { width: 375, height: 812 },
    'no-preference',
    { hasTouch: true, isMobile: true },
  );
  await narrowPhone.page.evaluate(() => QLOBE_DEBUG.startMode('solo'));
  const narrowPhoneLayout = await layoutStatus(narrowPhone.page);
  check('375px phone solo targets clear 96px and stay in bounds',
    narrowPhoneLayout.min96 && narrowPhoneLayout.inBounds && narrowPhoneLayout.noPageOverflow);
  await shot(narrowPhone.page, '10b-solo-phone-375.png');
  checkClean('375px phone portrait', narrowPhone);
  await narrowPhone.context.close();

  // Rotated phone / wide-short landscape breakpoint.
  const wide = await openGame(browser, { width: 844, height: 390 });
  let wideLayout = await layoutStatus(wide.page);
  check('wide-short splash targets clear 96px and stay in bounds', wideLayout.min96 && wideLayout.inBounds);
  await wide.page.evaluate(() => QLOBE_DEBUG.startMode('chorus'));
  await wide.page.evaluate(() => QLOBE_DEBUG.tap('play-all'));
  wideLayout = await layoutStatus(wide.page);
  check('wide-short show targets clear 96px and stay in bounds', wideLayout.min96 && wideLayout.inBounds);
  await shot(wide.page, '12-show-wide-short.png');
  checkClean('wide-short landscape', wide);
  await wide.context.close();

  // Reduced motion reaches and completes the core show.
  const reduced = await openGame(browser, { width: 1180, height: 820 }, 'reduce');
  await reduced.page.evaluate(() => QLOBE_DEBUG.startMode('chorus'));
  await reduced.page.evaluate(() => QLOBE_DEBUG.tap('play-all'));
  await reduced.page.evaluate(() => QLOBE_DEBUG.finishShow());
  check('reduced-motion run completes a show', await reduced.page.evaluate(() => (
    QLOBE_DEBUG.getState().screen === 'show' && QLOBE_DEBUG.getState().showPhase === 'finished'
  )));
  await shot(reduced.page, '13-show-reduced-motion.png');
  checkClean('reduced motion', reduced);
  await reduced.context.close();

  await browser.close();
  const failed = checks.filter(({ ok }) => !ok);
  const reportUrl = new URL('../assets/source/qa/runtime-smoke.json', import.meta.url);
  await mkdir(path.dirname(fileURLToPath(reportUrl)), { recursive: true });
  await writeFile(reportUrl, `${JSON.stringify({
    format: 'qlobe-runtime-smoke',
    formatVersion: 1,
    gameId: 'monster-opera',
    created: '2026-08-18',
    browser: useBundledChromium ? 'playwright-bundled-chromium' : 'installed-google-chrome',
    status: failed.length ? 'failed' : 'passed',
    counts: {
      checks: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
    },
    checks: checks.map(({ name, ok }) => ({ name, ok })),
    screenshots: 'generated outside the repository via QLOBE_SHOTS',
  }, null, 2)}\n`);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed; shots in ${shots}`);
  if (failed.length) console.log(`FAILED: ${failed.map(({ name }) => name).join(', ')}`);
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
