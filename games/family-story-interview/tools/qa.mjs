#!/usr/bin/env node
import path from 'node:path';
import {
  baseUrl,
  launchChrome,
  createReporter,
  openSession,
  checkSessionClean,
  resolveShots,
  ensureShots,
  shooter,
  targetSizes,
  undersized,
  debug,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl('http://127.0.0.1:4173');
const url = `${base}/games/family-story-interview/`;
const shots = resolveShots('qa-shots/family-story-interview');
const shot = shooter(shots);
const reporter = createReporter();
const { check, finish } = reporter;

async function session(browser, viewport, extra = {}) {
  return openSession(browser, {
    url,
    base,
    viewport,
    context: { permissions: ['microphone'] },
    allowAbortedMedia: true,
    captureRequestFailures: false,
    allowRemote: [
      'blob:',
      'https://www.googletagmanager.com/',
      'https://www.google-analytics.com/',
    ],
    mute: true,
    ...extra,
  });
}

async function tap(page, target) {
  await page.locator(`[data-target="${target}"]`).click();
  await page.waitForTimeout(120);
}

async function checkTargets(page, label) {
  const sizes = await targetSizes(page);
  const small = undersized(sizes, 96);
  check(`${label} touch targets are at least 96px`, small.length === 0,
    small.map((item) => `${item.id}:${Math.round(item.w)}x${Math.round(item.h)}`).join(', '));
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome({
    headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });

  const landscape = await session(browser, { width: 1180, height: 820 });
  const page = landscape.page;
  await debug.call(page, 'clearStories');
  let state = await debug.getState(page);
  check('game boots to question shelf', state.screen === 'choose', JSON.stringify(state));
  check('three picture topics registered', (await debug.listModes(page)).length === 3);
  check('all 26 narration clips are shipped', await page.evaluate(async () => {
    const manifest = await fetch('./assets/audio/manifest.json').then((response) => response.json());
    return Object.keys(manifest).length === 26;
  }));
  const autoStop = await page.evaluate(async () => {
    const { createRecorder } = await import('./js/story-media.js');
    return new Promise(async (resolve) => {
      const recorder = createRecorder({
        mode: 'fake',
        maxDuration: 40,
        onAutoStop: (result) => resolve({ duration: result.duration, bytes: result.blob?.size || 0 }),
      });
      await recorder.start();
    });
  });
  check('recorder enforces its exact safety cap', autoStop.duration <= 40 && autoStop.bytes > 0, JSON.stringify(autoStop));
  await checkTargets(page, 'question shelf');
  await shot(page, '01-question-shelf-landscape');

  await debug.call(page, 'setMicMode', 'fake');
  await debug.startMode(page, 'childhood');
  await debug.waitForScreen(page, 'interview');
  check('topic opens one interview question', (await debug.getState(page)).questionId === 'childhood-game');
  await checkTargets(page, 'interview ready');
  await shot(page, '02-interview-ready');

  await tap(page, 'record-toggle');
  await debug.waitForState(page, 'recording', true);
  await page.waitForTimeout(420);
  await shot(page, '03-interview-recording');
  await tap(page, 'record-toggle');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'recorded');
  check('fake recording reaches captured state', (await debug.getState(page)).hasAudio === true);
  await shot(page, '04-interview-captured');

  await tap(page, 'decorate');
  await debug.waitForScreen(page, 'decorate');
  await checkTargets(page, 'decorator');
  await shot(page, '05-decorate-empty-photo');
  await debug.call(page, 'addFakePhoto');
  await tap(page, 'sticker-flower');
  check('photo and sticker apply', await page.evaluate(() => {
    const current = window.QLOBE_DEBUG.getState();
    return current.hasPhoto && current.stickerId === 'flower';
  }));
  await shot(page, '06-decorate-photo-sticker');
  await tap(page, 'save');
  await debug.waitForScreen(page, 'saved');
  state = await debug.getState(page);
  check('story saves to local memory book', state.savedCount === 1 && state.storagePersistent, JSON.stringify(state));
  await checkTargets(page, 'saved page');
  await shot(page, '07-memory-saved');

  await tap(page, 'open-book');
  await debug.waitForScreen(page, 'book');
  check('saved page appears in gallery', await page.locator('.memory-card').count() === 1);
  await checkTargets(page, 'memory book');
  await shot(page, '08-memory-book');

  await page.reload({ waitUntil: 'networkidle' });
  await debug.waitForReady(page);
  state = await debug.getState(page);
  check('memory persists after reload', state.savedCount === 1 && state.screen === 'choose', JSON.stringify(state));
  check('landscape has no overflow', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));

  await tap(page, 'memory-book');
  await page.evaluate(() => {
    window.__qaOriginalIdbClear = IDBObjectStore.prototype.clear;
    IDBObjectStore.prototype.clear = function forcedClearFailure() {
      throw new DOMException('forced clear failure for QA', 'AbortError');
    };
  });
  await tap(page, 'clear-book');
  await tap(page, 'clear-book');
  const failedClear = await page.evaluate(() => ({
    cards: document.querySelectorAll('.memory-card').length,
    toast: document.querySelector('.toast')?.textContent || '',
    savedCount: window.QLOBE_DEBUG.getState().savedCount,
  }));
  check('failed clear keeps every private memory visible', failedClear.cards === 1 && failedClear.savedCount === 1,
    JSON.stringify(failedClear));
  check('failed clear never makes a false deletion claim', failedClear.toast.includes('still here'), failedClear.toast);
  await page.evaluate(() => {
    IDBObjectStore.prototype.clear = window.__qaOriginalIdbClear;
    delete window.__qaOriginalIdbClear;
  });
  await page.reload({ waitUntil: 'networkidle' });
  await debug.waitForReady(page);
  check('memory remains persisted after a failed clear', (await debug.getState(page)).savedCount === 1);
  checkSessionClean(reporter, landscape, 'landscape session');
  await landscape.close();

  const portrait = await session(browser, { width: 820, height: 1180 }, { reducedMotion: 'reduce' });
  await shot(portrait.page, '09-question-shelf-portrait-reduced-motion');
  await debug.startMode(portrait.page, 'traditions');
  await shot(portrait.page, '10-interview-portrait');
  check('portrait has no horizontal overflow', await portrait.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await checkTargets(portrait.page, 'portrait interview');
  checkSessionClean(reporter, portrait, 'portrait session');
  await portrait.close();

  const short = await session(browser, { width: 1180, height: 520 });
  await shot(short.page, '11-question-shelf-wide-short');
  await debug.call(short.page, 'setMicMode', 'fake');
  await debug.startMode(short.page, 'favorites');
  await shot(short.page, '12-interview-wide-short');
  check('wide-short page has no document scrollbars', await short.page.evaluate(() => (
    document.documentElement.scrollWidth <= document.documentElement.clientWidth
      && document.documentElement.scrollHeight <= document.documentElement.clientHeight
  )));
  await checkTargets(short.page, 'wide-short interview');
  checkSessionClean(reporter, short, 'wide-short session');
  await short.close();

  const denied = await session(browser, { width: 1024, height: 768 }, {
    initScript: () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: () => Promise.reject(new DOMException('denied for QA', 'NotAllowedError')) },
      });
    },
  });
  await debug.startMode(denied.page, 'childhood');
  await tap(denied.page, 'record-toggle');
  await denied.page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'fallback');
  check('microphone denial keeps a finishable session', await denied.page.locator('[data-target="decorate"]').isVisible());
  await shot(denied.page, '13-microphone-denied-fallback');
  await tap(denied.page, 'decorate');
  await tap(denied.page, 'save');
  await debug.waitForScreen(denied.page, 'saved');
  check('permission-free page still saves', (await debug.getState(denied.page)).savedCount === 1);
  checkSessionClean(reporter, denied, 'permission-denied session');
  await denied.close();

  const pending = await session(browser, { width: 1024, height: 768 }, {
    initScript: () => {
      window.__qaMicStops = 0;
      window.__qaMicRequests = 0;
      window.__qaPendingMic = new Promise((resolve) => {
        window.__qaResolveMic = () => resolve({
          getTracks: () => [{ stop: () => { window.__qaMicStops += 1; } }],
        });
      });
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: () => {
          window.__qaMicRequests += 1;
          return window.__qaPendingMic;
        } },
      });
    },
  });
  await debug.startMode(pending.page, 'favorites');
  await pending.page.locator('[data-target="record-toggle"]').evaluate((button) => {
    button.click();
    button.click();
  });
  await pending.page.waitForTimeout(120);
  check('pending microphone reports a requesting state',
    (await debug.getState(pending.page)).micPermission === 'requesting');
  check('rapid record taps create only one permission request',
    await pending.page.evaluate(() => window.__qaMicRequests === 1));
  await shot(pending.page, '14-microphone-requesting');
  await tap(pending.page, 'back');
  await debug.waitForScreen(pending.page, 'choose');
  await pending.page.evaluate(() => window.__qaResolveMic());
  await pending.page.waitForTimeout(180);
  const cancelledMic = await pending.page.evaluate(() => ({
    ...window.QLOBE_DEBUG.getState(),
    stoppedTracks: window.__qaMicStops,
  }));
  check('back cancels a pending microphone without reviving recording',
    cancelledMic.screen === 'choose' && !cancelledMic.recording && cancelledMic.micPermission === 'unknown',
    JSON.stringify(cancelledMic));
  check('late microphone stream is stopped after navigation', cancelledMic.stoppedTracks === 1,
    JSON.stringify(cancelledMic));
  checkSessionClean(reporter, pending, 'pending-permission session');
  await pending.close();

  const hardening = await session(browser, { width: 1024, height: 768 });
  await debug.call(hardening.page, 'clearStories');
  await debug.startMode(hardening.page, 'traditions');
  await debug.call(hardening.page, 'finishAnswer');
  await hardening.page.evaluate(() => Promise.all([
    window.QLOBE_DEBUG.saveCurrentStory(),
    window.QLOBE_DEBUG.saveCurrentStory(),
  ]));
  check('concurrent saves create exactly one memory', (await debug.getState(hardening.page)).savedCount === 1);
  await hardening.page.evaluate(async () => {
    for (let index = 0; index < 12; index += 1) {
      await window.QLOBE_DEBUG.saveCurrentStory();
    }
  });
  check('memory book evicts old pages at its 12-page cap',
    (await debug.getState(hardening.page)).savedCount === 12);
  const privateMetadata = await debug.call(hardening.page, 'getSavedStories');
  check('debug metadata never exposes family media blobs', privateMetadata.every((memory) => (
    !Object.hasOwn(memory, 'audioBlob') && !Object.hasOwn(memory, 'photoBlob')
  )));
  await hardening.page.reload({ waitUntil: 'networkidle' });
  await debug.waitForReady(hardening.page);
  check('12-page eviction survives a reload', (await debug.getState(hardening.page)).savedCount === 12);
  check('non-image uploads are rejected before decoding', await hardening.page.evaluate(async () => {
    const { imageFileToJpeg } = await import('./js/story-media.js');
    try {
      await imageFileToJpeg(new File(['not an image'], 'notes.txt', { type: 'text/plain' }));
      return false;
    } catch {
      return true;
    }
  }));
  const replayCleanup = await hardening.page.evaluate(async () => {
    const { replayBlob } = await import('./js/story-media.js');
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    const revoked = [];
    URL.revokeObjectURL = (value) => {
      revoked.push(value);
      originalRevoke(value);
    };
    try {
      const playback = replayBlob(new Blob(['local replay QA'], { type: 'audio/webm' }));
      const ownedUrl = playback.url;
      playback.release();
      return {
        released: revoked.includes(ownedUrl),
        srcCleared: !playback.audio.getAttribute('src'),
      };
    } finally {
      URL.revokeObjectURL = originalRevoke;
    }
  });
  check('story replay releases its object URL and audio source',
    replayCleanup.released && replayCleanup.srcCleared, JSON.stringify(replayCleanup));
  checkSessionClean(reporter, hardening, 'storage-hardening session');
  await hardening.close();

  await browser.close();
  finish({ prefix: '\nFamily Story Interview QA: ', listFailures: true, exit: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
