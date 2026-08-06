#!/usr/bin/env node
// Real-Chrome interaction, camera-fallback, responsive, and visual-QC gate.

import {
  baseUrl, launchChrome, createReporter, openSession, checkSessionClean,
  resolveShots, ensureShots, shooter, debug, targetSizes, undersized,
} from '../../../tools/qa/lib/driver.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const base = baseUrl();
const shots = resolveShots('games/freeze-focus-dance/qa-shots');
const shot = shooter(shots);
const report = createReporter();
const { check, finish } = report;

async function openGame(browser, viewport, reducedMotion = 'no-preference', fastTimers = null, mute = true) {
  return openSession(browser, {
    url: `${base}/games/freeze-focus-dance/`,
    base,
    viewport,
    reducedMotion,
    seed: 42,
    fastTimers,
    mute,
    allowAbortedMedia: true,
  });
}

function checkRecordedVoiceAssets() {
  const validator = fileURLToPath(new URL('./check-voice.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [validator], { encoding: 'utf8' });
  const detail = [result.stdout, result.stderr].filter(Boolean).join(' ').trim();
  check('all authored narration has independently verified recorded clips', result.status === 0, detail);
}

async function driveRecordedVoice(browser) {
  const session = await openGame(browser, { width: 1180, height: 820 }, 'no-preference', null, false);
  const page = session.page;
  await page.evaluate(async () => {
    const clips = await import('../../../shared/js/voice-clips.js');
    window.__freezeVoiceQa = { starts: [], played: {} };
    clips.onClip((key, element) => {
      const source = element.src || element.currentSrc || '';
      window.__freezeVoiceQa.starts.push({ key, source });
      const sample = () => {
        if (element.src !== source) {
          element.removeEventListener('timeupdate', sample);
          return;
        }
        const played = element.played?.length
          ? element.played.end(element.played.length - 1) : 0;
        if (played <= 0) return;
        window.__freezeVoiceQa.played[key] = {
          source,
          played,
          duration: Number.isFinite(element.duration) ? element.duration : null,
          error: element.error?.code || null,
        };
        element.removeEventListener('timeupdate', sample);
      };
      element.addEventListener('timeupdate', sample);
    });
  });

  const intros = {
    beat: 'beat-intro',
    lookout: 'lookout-intro',
    statues: 'statue-intro',
  };
  for (const [mode, key] of Object.entries(intros)) {
    await page.locator(`[data-target="mode-${mode}"]`).click();
    await debug.waitForScreen(page, 'choice');
    await page.locator('[data-target="camera-skip"]').click();
    await page.waitForFunction((voiceKey) => window.__freezeVoiceQa.played[voiceKey]?.played > 0,
      key, { timeout: 30000 });
    const evidence = await page.evaluate((voiceKey) => ({
      playback: window.__freezeVoiceQa.played[voiceKey],
      log: window.QLOBE_DEBUG.getAudioLog().find((entry) => entry.key === voiceKey),
    }), key);
    check(`${mode} intro decodes and starts its recorded M4A`,
      evidence.log?.kind === 'clip'
        && evidence.playback?.source.endsWith(`/${key}.m4a`)
        && evidence.playback.played > 0
        && evidence.playback.duration > 0
        && !evidence.playback.error,
      JSON.stringify(evidence));
    await debug.call(page, 'home');
    await debug.waitForScreen(page, 'splash');
  }
  const representative = Object.values(intros);
  const fallback = (await debug.getAudioLog(page))
    .filter((entry) => representative.includes(entry.key) && entry.kind !== 'clip');
  check('representative narration from all three modes avoids device-speech fallback',
    fallback.length === 0, fallback.map((entry) => entry.key).join(', '));
  checkSessionClean(report, session, 'recorded voice');
  return session;
}

async function checkTargets(page, label) {
  const sizes = await targetSizes(page);
  const small = undersized(sizes, 95.5);
  check(`${label} targets meet the 96px minimum`, small.length === 0,
    small.map((item) => `${item.id}:${Math.round(item.w)}×${Math.round(item.h)}`).join(', '));
}

async function selectWithoutCamera(page, mode) {
  await debug.startMode(page, mode);
  await debug.waitForScreen(page, 'choice');
  await debug.tap(page, 'camera-skip');
  await debug.waitForScreen(page, 'play');
}

async function driveLandscape(browser) {
  const session = await openGame(browser, { width: 1180, height: 820 });
  const page = session.page;
  const initial = await debug.getState(page);
  check('splash boots with three distinct modes', initial.screen === 'splash'
    && (await debug.listModes(page)).map((item) => item.id).join(',') === 'beat,lookout,statues');
  await checkTargets(page, 'splash');

  const artAudit = await page.evaluate(async () => {
    const images = [...document.images].filter((image) => image.getClientRects().length);
    const style = await fetch('./style.css').then((response) => response.text());
    return {
      images: images.length,
      broken: images.filter((image) => !image.complete || image.naturalWidth < 2).map((image) => image.src),
      remote: images.filter((image) => new URL(image.src).origin !== location.origin).map((image) => image.src),
      svg: document.querySelectorAll('svg').length,
      canvas: document.querySelectorAll('canvas').length,
      cssGradient: /(?:linear|radial|conic)-gradient\s*\(/i.test(style),
      emoji: /[\u{1F300}-\u{1FAFF}]/u.test(document.body.innerText),
    };
  });
  check('visible world is local authored raster art', artAudit.images >= 8
    && artAudit.broken.length === 0 && artAudit.remote.length === 0
    && artAudit.svg === 0 && artAudit.canvas === 0
    && !artAudit.cssGradient && !artAudit.emoji, JSON.stringify(artAudit));
  await shot(page, '01-splash-landscape');

  await page.locator('[data-target="mode-beat"]').click();
  await debug.waitForScreen(page, 'choice');
  await checkTargets(page, 'camera choice');
  check('camera choice gives equal camera and no-camera routes',
    await page.locator('[data-target="camera-on"], [data-target="camera-skip"]').count() === 2);
  check('privacy promise is visible before permission',
    (await page.locator('.privacy-note').innerText()).includes('Never recorded or saved'));
  await shot(page, '02-camera-choice-landscape');

  await debug.call(page, 'setCameraScenario', 'live');
  await page.locator('[data-target="camera-on"]').click();
  await debug.waitForScreen(page, 'warmup');
  await shot(page, '03-magic-mirror-landscape');
  await debug.waitForScreen(page, 'play');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'dance');
  check('fake local motion enables expressive sparkles only',
    (await debug.getState(page)).camera.mode === 'fake-motion');
  await shot(page, '04-beat-dance-landscape');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'freeze', null, { timeout: 10000 });
  await page.waitForTimeout(500);
  await shot(page, '05-beat-freeze-landscape');
  await debug.call(page, 'completeMode');
  await debug.waitForScreen(page, 'end');
  check('Beat Stop reaches Focus Star end', (await debug.getState(page)).screen === 'end');
  check('camera stream is closed at end', await page.evaluate(() => document.querySelector('.motion-video').srcObject === null));
  await checkTargets(page, 'end');
  await shot(page, '06-focus-star-landscape');

  await debug.call(page, 'home');
  await selectWithoutCamera(page, 'lookout');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'search', null, { timeout: 12000 });
  const lookout = await debug.getState(page);
  check('Owl Lookout waits for exactly one authored friend', lookout.awaitingInput && Boolean(lookout.target));
  await checkTargets(page, 'friend search');
  await shot(page, '07-lookout-hidden-landscape');
  await debug.tap(page, `friend-${lookout.target}`);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'reveal');
  await page.waitForTimeout(600);
  const revealLayout = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box && { x: box.x, y: box.y, right: box.right, bottom: box.bottom };
    };
    return {
      width: innerWidth,
      height: innerHeight,
      prompt: rect('.play-prompt'),
      back: rect('#screen-play [data-target="back"]'),
      sound: rect('#screen-play [data-target="sound"]'),
      stars: document.querySelectorAll('.round-stars img').length,
    };
  });
  check('friend reveal keeps prompt, both HUD controls, and full progress safely framed',
    revealLayout.prompt.y >= 16 && revealLayout.back.x >= 16
      && revealLayout.sound.right <= revealLayout.width - 16
      && revealLayout.stars === lookout.roundsTotal, JSON.stringify(revealLayout));
  await shot(page, '08-lookout-reveal-landscape');
  await debug.call(page, 'completeMode');
  check('Owl Lookout reaches end', (await debug.getState(page)).screen === 'end');

  await debug.call(page, 'home');
  await selectWithoutCamera(page, 'statues');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'statue', null, { timeout: 10000 });
  await page.waitForTimeout(450);
  const statue = await debug.getState(page);
  check('Star Statues presents a safe modeled pose without camera scoring',
    ['star', 'tall', 'tiny', 'wide'].includes(statue.target) && statue.camera.mode === 'off');
  await shot(page, '09-star-statue-landscape');
  await debug.call(page, 'completeMode');
  check('Star Statues reaches end', (await debug.getState(page)).screen === 'end');

  await debug.call(page, 'home');
  await debug.startMode(page, 'beat');
  await debug.call(page, 'setCameraScenario', 'denied');
  await debug.tap(page, 'camera-on');
  await debug.waitForScreen(page, 'play');
  const denied = await debug.getState(page);
  check('camera denial falls through to complete play', denied.camera.mode === 'off' && denied.camera.status === 'denied');

  await debug.call(page, 'home');
  await debug.startMode(page, 'beat');
  await debug.call(page, 'setCameraScenario', 'lost');
  await debug.tap(page, 'camera-on');
  await debug.waitForScreen(page, 'play');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().camera.status === 'debug-stream-ended');
  check('lost stream becomes no-camera play without gating', (await debug.getState(page)).camera.mode === 'off');

  await debug.call(page, 'home');
  await debug.startMode(page, 'beat');
  await debug.call(page, 'setCameraScenario', 'live');
  await debug.tap(page, 'camera-on');
  await debug.waitForScreen(page, 'play');
  const backgrounded = await debug.call(page, 'simulateCameraStop', 'hidden');
  check('backgrounded live camera closes into honest no-camera play', backgrounded.mode === 'off'
    && backgrounded.status === 'hidden' && await page.locator('.camera-pill').count() === 0);

  checkSessionClean(report, session, 'landscape');
  return session;
}

async function drivePortrait(browser) {
  const session = await openGame(browser, { width: 820, height: 1180 }, 'no-preference', 3);
  const page = session.page;
  await checkTargets(page, 'portrait splash');
  await shot(page, '10-splash-portrait');
  await selectWithoutCamera(page, 'statues');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'statue', null, { timeout: 8000 });
  await page.waitForTimeout(450);
  const body = await page.locator('body').boundingBox();
  const prompt = await page.locator('.play-prompt').boundingBox();
  check('portrait play stays within viewport', prompt.y >= 0 && prompt.y + prompt.height <= body.height);
  check('portrait play keeps both back and prompt-replay controls',
    await page.locator('#screen-play [data-target="back"], #screen-play [data-target="sound"]').count() === 2);
  await shot(page, '11-statue-portrait');
  await debug.call(page, 'completeMode');
  await shot(page, '12-end-portrait');
  checkSessionClean(report, session, 'portrait');
  return session;
}

async function driveWideAndReduced(browser) {
  const wide = await openGame(browser, { width: 1366, height: 600 });
  await checkTargets(wide.page, 'wide-short splash');
  await shot(wide.page, '13-splash-wide-short');
  checkSessionClean(report, wide, 'wide-short');

  const ultraWide = await openGame(browser, { width: 2048, height: 528 });
  const tileBounds = await ultraWide.page.locator('.mode-card > img').evaluateAll((images) =>
    images.map((image) => {
      const rect = image.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }));
  check('ultra-wide splash keeps complete choice-tile carriers inside viewport',
    tileBounds.length === 3 && tileBounds.every((rect) => rect.left >= 6 && rect.right <= 2042
      && rect.top >= 6 && rect.bottom <= 522));
  await shot(ultraWide.page, '15-splash-ultra-wide');
  await ultraWide.context.close();

  const reduced = await openGame(browser, { width: 1180, height: 820 }, 'reduce', 20);
  await selectWithoutCamera(reduced.page, 'beat');
  await debug.call(reduced.page, 'completeMode');
  check('reduced-motion mode completes', (await debug.getState(reduced.page)).screen === 'end');
  await shot(reduced.page, '14-end-reduced-motion');
  checkSessionClean(report, reduced, 'reduced-motion');
  return [wide, reduced];
}

async function checkSharedCameraModule(browser) {
  const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
  const page = await context.newPage();
  await page.goto(`${base}/shared/js/camera-motion.test.html`);
  await page.waitForFunction(() => document.documentElement.dataset.result);
  const result = await page.evaluate(() => ({
    status: document.documentElement.dataset.result,
    output: document.querySelector('#out').innerText,
  }));
  check('shared camera module closes denial and late-grant paths', result.status === 'pass', result.output);
  await context.close();
}

async function main() {
  await ensureShots(shots);
  checkRecordedVoiceAssets();
  const browser = await launchChrome();
  try {
    await checkSharedCameraModule(browser);
    await driveRecordedVoice(browser);
    await driveLandscape(browser);
    await drivePortrait(browser);
    await driveWideAndReduced(browser);
  } finally {
    await browser.close();
    finish({ suffix: `; shots in ${shots}` });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
