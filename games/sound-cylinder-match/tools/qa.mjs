#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(process.env.QLOBE_PLAYWRIGHT_REQUIRE || '/private/tmp/pw/node_modules/noop.js');
const { chromium } = require('playwright');
const base = (process.env.QLOBE_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');
const shots = path.resolve(process.env.QLOBE_SHOTS || '/private/tmp/sound-cylinder-match-qa');
const checks = [];

function check(name, condition, detail = '') {
  const ok = Boolean(condition); checks.push({ name, ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function openGame(browser, viewport, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport, reducedMotion, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = []; const failed = []; const remote = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(base) && !url.startsWith('data:') && !url.includes('googletagmanager.com')) remote.push(url);
  });
  await page.goto(`${base}/games/sound-cylinder-match/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  return { context, page, errors, failed, remote };
}

async function main() {
  await mkdir(shots, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const run = await openGame(browser, { width: 1180, height: 820 });
  const { page } = run;
  check('splash boots', (await page.evaluate(() => QLOBE_DEBUG.getState().screen)) === 'splash');
  check('debug v1 and listening mode', await page.evaluate(() => QLOBE_DEBUG.version === 1 && QLOBE_DEBUG.listModes()[0].id === 'listen'));
  const narrationCoverage = await page.evaluate(async () => {
    const [lines, manifest] = await Promise.all([
      fetch('./assets/audio/lines.json').then((response) => response.json()),
      fetch('./assets/audio/manifest.json').then((response) => response.json()),
    ]);
    const keys = Object.keys(lines);
    return keys.length === 12 && keys.every((key) => manifest[key]?.file);
  });
  check('all fixed narration lines have packaged clips', narrationCoverage);
  check('generated title is spelled accessibly', (await page.locator('.scm-title').getAttribute('alt')) === 'Sound Cylinder Match');
  check('all splash images decode', await page.evaluate(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0)));
  check('decorative duplicate stars are removed', await page.evaluate(() => !document.querySelector('.scm-splash-star, .scm-guide')));
  check('no emoji, svg, or canvas primary art', await page.evaluate(() => !document.body.textContent.includes('🥫') && !document.querySelector('svg,canvas')));
  const splashTargets = await page.evaluate(() => QLOBE_DEBUG.getTargets());
  check('splash targets clear 96px', splashTargets.every(({ rect }) => rect.w >= 96 && rect.h >= 96), JSON.stringify(splashTargets));
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  await page.evaluate(async () => {
    const clips = await import('../../shared/js/voice-clips.js');
    window.__scmClips = [];
    clips.onClip((key) => window.__scmClips.push(key));
    QLOBE_DEBUG.seed(42);
  });
  await page.locator('[data-action="play"]').click();
  await page.waitForFunction(() => QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 20000 });
  check('recorded Listen cue played after gesture', await page.evaluate(() => window.__scmClips.includes('start')), await page.evaluate(() => window.__scmClips.join(',')));
  const first = await page.evaluate(() => QLOBE_DEBUG.getState());
  const firstSamples = await page.evaluate(() => QLOBE_DEBUG.getAudioLog().samples.slice(-4).map((entry) => entry.id));
  const firstVoice = await page.evaluate(() => QLOBE_DEBUG.getAudioLog().voice.map((entry) => ({ key: entry.key, kind: entry.kind })));
  check('seeded round has one target and three candidates', Boolean(first.target) && first.candidates.length === 3 && new Set(first.candidates).size === 3, JSON.stringify(first));
  check('reference and all aqua shakers preview before choice', JSON.stringify(firstSamples) === JSON.stringify([first.target, ...first.candidates]), firstSamples.join(','));
  check('opening narration uses packaged voice clips', firstVoice.length >= 3 && firstVoice.every((entry) => entry.kind === 'clip'), JSON.stringify(firstVoice));
  const playTargets = await page.evaluate(() => QLOBE_DEBUG.getTargets());
  check('play targets clear 96px', playTargets.every(({ rect }) => rect.w >= 96 && rect.h >= 96), JSON.stringify(playTargets));
  check('truthful reference/correct/different roles', playTargets.filter((target) => target.role === 'reference').length === 1 && playTargets.filter((target) => target.role === 'correct').length === 1 && playTargets.filter((target) => target.role === 'different').length === 2);
  check('all candidate images use one identical raster source', await page.evaluate(() => new Set([...document.querySelectorAll('.scm-candidate .scm-cylinder-art')].map((image) => image.currentSrc)).size === 1));
  check('persistent raster sound cues guide every shaker', await page.evaluate(() => document.querySelectorAll('.scm-audio-cue').length === 4 && [...document.querySelectorAll('.scm-audio-cue')].every((image) => image.complete && image.naturalWidth > 0 && getComputedStyle(image).display !== 'none')));
  await page.screenshot({ path: path.join(shots, '02-play-landscape.png') });

  const wrong = playTargets.find((target) => target.role === 'different').id;
  await page.evaluate((id) => QLOBE_DEBUG.tap(id), wrong);
  await page.waitForFunction(() => QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 12000 });
  check('different sound gently retries without progress', (await page.evaluate(() => QLOBE_DEBUG.getState().matched)) === 0);
  await page.screenshot({ path: path.join(shots, '03-after-retry-landscape.png') });

  await page.locator('[data-target="reference"]').click();
  await page.locator('[data-target="sound-play"]').click();
  await page.waitForFunction(() => QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 2500 });
  check('sound icon replays the current prompt', await page.evaluate(() => {
    const log = QLOBE_DEBUG.getAudioLog().voice;
    return log.at(-1)?.key === 'find' && log.at(-1)?.kind === 'clip';
  }));
  check('sound icon replays the prompt animation', await page.evaluate(() => document.querySelector('.scm-prompt').classList.contains('is-replaying')));

  await page.evaluate(() => { QLOBE_DEBUG.winRound(); });
  for (let probe = 0; probe < 35; probe += 1) {
    const state = await page.evaluate(() => QLOBE_DEBUG.getState());
    if (state.round === 1 && state.awaitingInput) break;
    if (probe > 0 && probe % 5 === 0) console.log(` ... correct-transition ${probe}s ${JSON.stringify(state)}`);
    await page.waitForTimeout(1000);
  }
  check('correct transition settles', await page.evaluate(() => QLOBE_DEBUG.getState().round === 1 && QLOBE_DEBUG.getState().awaitingInput), JSON.stringify(await page.evaluate(() => QLOBE_DEBUG.getState())));
  check('correct sound advances exactly one round', (await page.evaluate(() => QLOBE_DEBUG.getState().matched)) === 1);
  check('recorded Great cue played on match', await page.evaluate(() => window.__scmClips.includes('same')), await page.evaluate(() => window.__scmClips.join(',')));
  await page.screenshot({ path: path.join(shots, '04-round-two-landscape.png') });

  await page.evaluate(() => { QLOBE_DEBUG.mute(true); QLOBE_DEBUG.fastTimers(.04); });
  while ((await page.evaluate(() => QLOBE_DEBUG.getState().screen)) === 'play') {
    await page.evaluate(() => QLOBE_DEBUG.winRound());
    await page.waitForTimeout(140);
  }
  await page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'end');
  check('four matches reach reward', (await page.evaluate(() => QLOBE_DEBUG.getState().matched)) === 4);
  await page.screenshot({ path: path.join(shots, '05-end-landscape.png') });
  await page.locator('[data-target="back-end"]').click();
  check('end Back returns to splash', (await page.evaluate(() => QLOBE_DEBUG.getState().screen)) === 'splash');
  check('catalog link exists only on splash', (await page.locator('a[href="../../"]').count()) === 1 && await page.locator('a[href="../../"]:visible').count() === 1);
  check('no page errors', run.errors.length === 0, run.errors.join(' | '));
  check('no failed requests', run.failed.length === 0, run.failed.join(' | '));
  check('remote calls are limited to platform analytics', run.remote.every((url) => url.includes('google-analytics.com') || url.includes('googletagmanager.com')), run.remote.join(' | '));
  await run.context.close();

  const interrupt = await openGame(browser, { width: 1180, height: 820 });
  await interrupt.page.evaluate(() => QLOBE_DEBUG.seed(42));
  await interrupt.page.locator('[data-action="play"]').click();
  await interrupt.page.waitForFunction(() => QLOBE_DEBUG.getState().instructionActive, null, { timeout: 20000 });
  const instructionState = await interrupt.page.evaluate(() => QLOBE_DEBUG.getState());
  const correctIndex = instructionState.candidates.indexOf(instructionState.target);
  const wrongIndex = (correctIndex + 1) % instructionState.candidates.length;
  await interrupt.page.evaluate((index) => QLOBE_DEBUG.tap(`candidate-${index}`), correctIndex);
  await interrupt.page.evaluate((index) => QLOBE_DEBUG.tap(`candidate-${index}`), wrongIndex);
  const selectedDuringInstruction = await interrupt.page.evaluate(() => QLOBE_DEBUG.getState());
  check('candidate tap registers during find instruction', selectedDuringInstruction.instructionActive && selectedDuringInstruction.pendingChoice === instructionState.target && selectedDuringInstruction.lastChoice === instructionState.target && selectedDuringInstruction.matched === 0, JSON.stringify(selectedDuringInstruction));
  check('selected shaker sample starts before instruction ends', await interrupt.page.evaluate((target) => QLOBE_DEBUG.getAudioLog().samples.some((entry) => entry.id === target), instructionState.target));
  check('pending selection has coral glow', await interrupt.page.evaluate((index) => document.querySelectorAll('.scm-candidate')[index].classList.contains('is-pending'), correctIndex));
  await interrupt.page.waitForTimeout(300);
  check('result is deferred until instruction ends', await interrupt.page.evaluate(() => {
    const state = QLOBE_DEBUG.getState();
    return state.instructionActive && state.matched === 0 && !document.querySelector('.scm-candidate.is-correct, .scm-candidate.is-wrong');
  }));
  await interrupt.page.waitForFunction(() => QLOBE_DEBUG.getState().matched === 1 && QLOBE_DEBUG.getState().round === 1, null, { timeout: 20000 });
  check('deferred correct result follows instruction', await interrupt.page.evaluate(() => !QLOBE_DEBUG.getState().instructionActive && QLOBE_DEBUG.getState().matched === 1));
  check('pending glow clears after result', await interrupt.page.evaluate((index) => !document.querySelectorAll('.scm-candidate')[index].classList.contains('is-pending'), correctIndex));
  check('instruction interrupt test has no page errors or failures', interrupt.errors.length === 0 && interrupt.failed.length === 0, [...interrupt.errors, ...interrupt.failed].join(' | '));
  await interrupt.context.close();

  const keyboard = await openGame(browser, { width: 1180, height: 820 });
  await keyboard.page.locator('[data-action="play"]').focus();
  await keyboard.page.keyboard.press('Enter');
  await keyboard.page.waitForFunction(() => QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 20000 });
  check('keyboard-only start unlocks and plays a sample', await keyboard.page.evaluate(() => QLOBE_DEBUG.getAudioLog().samples.some((entry) => entry.ok === true)), JSON.stringify(await keyboard.page.evaluate(() => QLOBE_DEBUG.getAudioLog().samples)));
  check('keyboard-only flow has no page errors or failures', keyboard.errors.length === 0 && keyboard.failed.length === 0, [...keyboard.errors, ...keyboard.failed].join(' | '));
  await keyboard.context.close();

  const portrait = await openGame(browser, { width: 820, height: 1180 });
  // Chromium is launched with --mute-audio, so keep the game's audio state on
  // here: the real sample durations give the interruptible preview time to be
  // observed without sending sound to the user's speakers.
  await portrait.page.evaluate(() => { QLOBE_DEBUG.fastTimers(.04); QLOBE_DEBUG.seed(42); });
  await portrait.page.locator('[data-action="play"]').click();
  await portrait.page.waitForFunction(() => QLOBE_DEBUG.getState().previewing);
  const portraitPreview = await portrait.page.evaluate(() => QLOBE_DEBUG.getState());
  await portrait.page.evaluate((index) => QLOBE_DEBUG.tap(`candidate-${index}`), 0);
  await portrait.page.waitForFunction((target) => QLOBE_DEBUG.getState().lastChoice === target, portraitPreview.candidates[0]);
  check('child can interrupt aqua preview with a choice', await portrait.page.evaluate(() => !QLOBE_DEBUG.getState().previewing && QLOBE_DEBUG.getState().lastChoice !== null));
  await portrait.page.waitForFunction(() => QLOBE_DEBUG.getState().awaitingInput);
  check('portrait play fits viewport', await portrait.page.evaluate(() => [...document.querySelectorAll('.scm-shaker')].filter((el) => el.getBoundingClientRect().width > 0).every((el) => { const r = el.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1; })));
  await portrait.page.screenshot({ path: path.join(shots, '06-play-portrait.png') });
  check('portrait has no page errors or failures', portrait.errors.length === 0 && portrait.failed.length === 0, [...portrait.errors, ...portrait.failed].join(' | '));
  await portrait.context.close();

  const reduced = await openGame(browser, { width: 1180, height: 820 }, 'reduce');
  await reduced.page.evaluate(() => { QLOBE_DEBUG.mute(true); QLOBE_DEBUG.fastTimers(.04); });
  await reduced.page.locator('[data-action="play"]').click();
  await reduced.page.waitForFunction(() => QLOBE_DEBUG.getState().awaitingInput);
  check('reduced-motion disables shaker animation', await reduced.page.evaluate(() => getComputedStyle(document.querySelector('.scm-shaker')).animationName === 'none'));
  await reduced.page.screenshot({ path: path.join(shots, '07-play-reduced-motion.png') });
  check('reduced-motion has no page errors or failures', reduced.errors.length === 0 && reduced.failed.length === 0, [...reduced.errors, ...reduced.failed].join(' | '));
  await reduced.context.close();
  await browser.close();

  const failedChecks = checks.filter((entry) => !entry.ok);
  console.log(`\n${checks.length - failedChecks.length}/${checks.length} checks passed`);
  if (failedChecks.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
