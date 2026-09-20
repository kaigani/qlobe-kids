#!/usr/bin/env node
// TaleTeller — real-Chrome smoke test and visual-QC driver.

import path from 'node:path';
import {
  args,
  baseUrl,
  checkSessionClean,
  createReporter,
  debug,
  ensureShots,
  launchChrome,
  openSession,
  resolveShots,
  shooter,
  targetSizes,
  undersized,
} from '../../../tools/qa/lib/driver.mjs';
import { storySentence, worlds } from '../config.js';

const base = baseUrl();
const gameUrl = `${base}/games/picture-narration/`;
const outArg = args.flag('out');
const shots = outArg ? path.resolve(outArg) : resolveShots('qa-shots/picture-narration');
const shot = shooter(shots);
const reporter = createReporter({ detailOnFail: true, collapse: true, detailLimit: 1600 });
const { check, note, finish } = reporter;
const sessions = [];
const analyticsOrigins = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
];

const landscape = { width: 1180, height: 820 };
const portrait = { width: 820, height: 1180 };
const narrowLandscape = { width: 667, height: 375 };

async function boot({
  viewport = landscape,
  reducedMotion = 'no-preference',
  muted = true,
  initScript = null,
} = {}) {
  const session = await openSession(browser, {
    url: gameUrl,
    base,
    viewport,
    reducedMotion,
    initScript,
    allowAbortedMedia: true,
    allowRemote: [...analyticsOrigins, 'blob:'],
    ready: true,
  });
  await debug.fastTimers(session.page, 0.03);
  await debug.seed(session.page, 42);
  await debug.mute(session.page, muted);
  sessions.push(session);
  return session;
}

function cleanSession(session, label) {
  session.failed = session.failed.filter((entry) => !(
    String(entry).includes('net::ERR_ABORTED')
    && analyticsOrigins.some((origin) => String(entry).includes(origin))
  ));
  checkSessionClean(reporter, session, label);
}

async function waitFor(page, predicate, argument = null, timeout = 15000) {
  await page.waitForFunction(predicate, argument, { timeout });
}

async function clickTarget(page, id) {
  await page.locator(`[data-target="${id}"]`).first().click();
}

async function auditTargets(page, label) {
  const targets = await targetSizes(page);
  const small = undersized(targets, 88);
  check(`${label}: every visible control is at least 88px`, small.length === 0,
    small.map((item) => `${item.id}:${Math.round(item.w)}x${Math.round(item.h)}`).join(', '));
}

async function auditLayout(page, label) {
  const result = await page.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
    brokenImages: [...document.images]
      .filter((image) => image.complete && image.naturalWidth === 0)
      .map((image) => image.src),
    visibleScreens: [...document.querySelectorAll('.game-screen')]
      .filter((node) => node.getClientRects().length).length,
  }));
  check(`${label}: no horizontal page overflow`, result.horizontalOverflow <= 1, JSON.stringify(result));
  check(`${label}: all raster art decodes`, result.brokenImages.length === 0,
    result.brokenImages.join(' | '));
  check(`${label}: exactly one game screen is mounted`, result.visibleScreens === 1, JSON.stringify(result));
}

async function discoverAll(page, world) {
  for (const hotspot of world.hotspots) {
    check(`${world.title}: hotspot ${hotspot.label} accepts a debug-routed tap`,
      await debug.tap(page, `hotspot:${hotspot.id}`));
  }
  await waitFor(page, () => window.QLOBE_DEBUG.getState().phase === 'explore-ready');
}

async function choosePath(page, world, first, second) {
  await debug.tap(page, 'continue');
  await waitFor(page, () => window.QLOBE_DEBUG.getState().phase === 'choice');
  check(`${world.title}: first illustrated choice is accepted`,
    await debug.call(page, 'choose', first));
  await waitFor(page, () => window.QLOBE_DEBUG.getState().choiceStep === 1);
  check(`${world.title}: second illustrated choice is accepted`,
    await debug.call(page, 'choose', second));
  await debug.waitForScreen(page, 'finale');
}

async function primaryPass() {
  const session = await boot({ muted: false });
  const { page } = session;

  const initial = await debug.getState(page);
  check('splash boots with QLOBE_DEBUG v1', initial.screen === 'splash'
    && await page.evaluate(() => window.QLOBE_DEBUG.version === 1
      && window.QLOBE_DEBUG.gameId === 'picture-narration'));
  check('Home appears on splash', await page.locator('[data-target="home"]').count() === 1);
  await shot(page, '01-splash-landscape');
  await auditLayout(page, 'splash landscape');
  await auditTargets(page, 'splash landscape');

  await clickTarget(page, 'enter');
  await debug.waitForScreen(page, 'library');
  const modes = await debug.listModes(page);
  check('library exposes forest, ocean, and moon',
    modes.map((mode) => mode.id).join(',') === 'forest,ocean,moon', JSON.stringify(modes));
  check('Home is absent after leaving splash',
    await page.locator('[data-target="home"]').count() === 0);
  await shot(page, '02-library-landscape');
  await auditLayout(page, 'library landscape');
  await auditTargets(page, 'library landscape');

  const forest = worlds.find((world) => world.id === 'forest');
  await clickTarget(page, 'world:forest');
  await debug.waitForScreen(page, 'play');
  check('physical forest card opens Pip’s exploration',
    (await debug.getState(page)).worldId === 'forest');
  await clickTarget(page, 'hotspot:fox');
  await waitFor(page, () => window.QLOBE_DEBUG.getState().discoveries.includes('fox'));
  check('hotspot tap reveals a written pronunciation plaque',
    await page.locator('.word-plaque').isVisible()
      && (await page.locator('.word-plaque').innerText()).includes('FOX'));
  await shot(page, '03-forest-word-discovery');
  for (const hotspot of forest.hotspots.slice(1)) await debug.tap(page, `hotspot:${hotspot.id}`);
  await waitFor(page, () => window.QLOBE_DEBUG.getState().phase === 'explore-ready');
  check('four discovered words appear in the live picture strip',
    await page.locator('.story-token.is-clue').count() === 4);
  await shot(page, '04-forest-all-clues');

  await debug.tap(page, 'continue');
  await waitFor(page, () => window.QLOBE_DEBUG.getState().phase === 'choice');
  await shot(page, '05-forest-choice-one');
  await debug.call(page, 'choose', 'bridge');
  await waitFor(page, () => window.QLOBE_DEBUG.getState().choiceStep === 1);
  check('bridge choice joins the live sentence strip',
    (await page.locator('.story-token.is-choice').allTextContents()).join(' ').includes('crossed the bridge'));
  await shot(page, '06-forest-choice-two');
  await debug.call(page, 'choose', 'duck');
  await debug.waitForScreen(page, 'finale');
  const forestEnd = await debug.getState(page);
  check('forest branch assembles the expected child-friendly sentence',
    forestEnd.sentence === storySentence(forest, ['bridge', 'duck']), forestEnd.sentence);
  check('finale exposes local-recording privacy copy',
    (await page.locator('.record-panel').innerText()).includes('Stays on this device'));
  await shot(page, '07-forest-finale');
  await auditLayout(page, 'forest finale');
  await auditTargets(page, 'forest finale');

  await clickTarget(page, 'back');
  await debug.waitForScreen(page, 'library');
  check('finale Back returns to the story library', (await debug.getState(page)).screen === 'library');

  const ocean = worlds.find((world) => world.id === 'ocean');
  await debug.startMode(page, 'ocean');
  await discoverAll(page, ocean);
  await choosePath(page, ocean, 'dolphins', 'song');
  const oceanEnd = await debug.getState(page);
  check('ocean alternate path reaches its own finale',
    oceanEnd.worldId === 'ocean'
      && oceanEnd.sentence === storySentence(ocean, ['dolphins', 'song']),
    oceanEnd.sentence);
  await shot(page, '08-ocean-finale-alternate');

  await debug.startMode(page, 'moon');
  await debug.winRound(page);
  await debug.waitForScreen(page, 'finale');
  check('deterministic complete/win traverses the moon game',
    (await debug.getState(page)).worldId === 'moon'
      && (await debug.getState(page)).choices.length === 2);
  await shot(page, '09-moon-finale-debug-complete');

  const log = await debug.getAudioLog(page);
  check('narration requests are observable through the audio log',
    log.some((entry) => entry.key?.startsWith('word-'))
      && log.some((entry) => entry.key?.startsWith('choice-')),
    log.map((entry) => entry.key).join(' → '));
  cleanSession(session, 'primary landscape session');
}

async function deniedMicrophonePass() {
  const session = await boot({
    muted: true,
    initScript: () => {
      const mediaDevices = {
        getUserMedia: async () => {
          throw new DOMException('Permission denied by QA', 'NotAllowedError');
        },
      };
      try {
        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: mediaDevices,
        });
      } catch {
        navigator.mediaDevices.getUserMedia = mediaDevices.getUserMedia;
      }
    },
  });
  const { page } = session;
  await debug.startMode(page, 'forest');
  await debug.winRound(page);
  await debug.waitForScreen(page, 'finale');
  check('debug tap truthfully declines the hold-only microphone target',
    await debug.tap(page, 'record') === false);
  const box = await page.locator('[data-target="record"]').boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();
  }
  await waitFor(page, () => window.QLOBE_DEBUG.getState().recordingState === 'fallback');
  check('denied microphone becomes a non-blocking guided fallback',
    (await debug.getState(page)).micFallback
      && await page.locator('[data-target="guided"]').isVisible());
  await shot(page, '10-microphone-denied-fallback');
  await clickTarget(page, 'guided');
  await waitFor(page, () => window.QLOBE_DEBUG.getState().recordingState === 'fallback');
  check('guided speak-aloud path finishes and keeps navigation available',
    await page.locator('[data-target="another"]').isVisible());
  cleanSession(session, 'microphone-denied session');
}

async function recordingReplayPass() {
  const session = await boot({
    muted: false,
    initScript: () => {
      const fakeMic = async () => {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const context = new AudioContextClass();
        const destination = context.createMediaStreamDestination();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        gain.gain.value = 0.015;
        oscillator.frequency.value = 330;
        oscillator.connect(gain);
        gain.connect(destination);
        oscillator.start();
        context.resume().catch(() => {});
        window.__taleTellerQaMic = { context, oscillator, destination };
        return destination.stream;
      };
      try {
        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: { getUserMedia: fakeMic },
        });
      } catch {
        navigator.mediaDevices.getUserMedia = fakeMic;
      }
    },
  });
  const { page } = session;
  await debug.startMode(page, 'ocean');
  await debug.winRound(page);
  await debug.waitForScreen(page, 'finale');
  const mic = page.locator('[data-target="record"]');
  const box = await mic.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(520);
    await page.mouse.up();
  }
  await waitFor(page, () => ['recorded', 'fallback'].includes(
    window.QLOBE_DEBUG.getState().recordingState,
  ), null, 10000);
  const afterRecord = await debug.getState(page);
  if (afterRecord.recordingState === 'recorded') {
    check('hold-to-record creates an in-memory replay', afterRecord.hasRecording
      && afterRecord.recordingDurationMs >= 180, JSON.stringify(afterRecord));
    await shot(page, '11-local-recording-ready');
    await clickTarget(page, 'replay-recording');
    const replayState = await debug.getState(page);
    check('recorded story replay starts from the real control',
      replayState.recordingState === 'replaying' || replayState.recordingState === 'recorded',
      JSON.stringify(replayState));
    await clickTarget(page, 'back');
    await debug.waitForScreen(page, 'library');
    const afterLeave = await debug.getState(page);
    const trackStates = await page.evaluate(() => (
      [...(window.__taleTellerQaMic?.destination?.stream?.getTracks?.() || [])]
        .map((track) => track.readyState)
    ));
    check('leaving a recorded story revokes its in-memory replay state',
      !afterLeave.hasRecording
        && afterLeave.recordingState === 'idle'
        && trackStates.length > 0
        && trackStates.every((readyState) => readyState === 'ended'),
      JSON.stringify({ afterLeave, trackStates }));
  } else {
    check('fake microphone must exercise the MediaRecorder success path', false,
      JSON.stringify(afterRecord));
  }
  cleanSession(session, 'local recording session');
}

async function responsivePass({ viewport, reducedMotion, name }) {
  const session = await boot({ viewport, reducedMotion, muted: true });
  const { page } = session;
  await debug.tap(page, 'enter');
  await debug.waitForScreen(page, 'library');
  await shot(page, `12-${name}-library`);
  await auditLayout(page, `${name} library`);
  await auditTargets(page, `${name} library`);
  if (name === 'narrow-landscape') {
    await clickTarget(page, 'world:moon');
    await clickTarget(page, 'hotspot:star');
  } else {
    await debug.startMode(page, 'moon');
    await debug.tap(page, 'hotspot:star');
  }
  await shot(page, `13-${name}-moon-discovery`);
  await auditLayout(page, `${name} play`);
  await debug.winRound(page);
  await debug.waitForScreen(page, 'finale');
  await shot(page, `14-${name}-finale`);
  await auditLayout(page, `${name} finale`);
  await auditTargets(page, `${name} finale`);
  if (reducedMotion === 'reduce') {
    check('reduced-motion preference reaches game state',
      (await debug.getState(page)).reducedMotion === true);
  }
  cleanSession(session, `${name} session`);
}

let browser;

async function main() {
  await ensureShots(shots);
  browser = await launchChrome({ headless: !args.has('headed') });
  try {
    await primaryPass();
    await deniedMicrophonePass();
    await recordingReplayPass();
    await responsivePass({ viewport: portrait, reducedMotion: 'no-preference', name: 'portrait' });
    await responsivePass({ viewport: landscape, reducedMotion: 'reduce', name: 'landscape-reduced' });
    await responsivePass({ viewport: narrowLandscape, reducedMotion: 'no-preference', name: 'narrow-landscape' });
    note(`screenshots written to ${shots}`);
  } finally {
    for (const session of sessions) await session.close().catch(() => {});
    await browser?.close();
  }
  finish({ suffix: `; screenshots in ${shots}` });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
