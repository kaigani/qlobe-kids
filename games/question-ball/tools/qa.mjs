#!/usr/bin/env node
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadPlaywright,
  launchChrome,
  openSession,
  createReporter,
  resolveShots,
  ensureShots,
  shooter,
  checkSessionClean,
  targetSizes,
  undersized,
  centerOf,
  audio,
} from '../../../tools/qa/lib/driver.mjs';

const base = (process.env.QLOBE_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');
const shots = resolveShots(path.join(tmpdir(), 'qlobe-question-ball-shots'));
const report = createReporter({ collapse: true, detailLimit: 1200 });
await ensureShots(shots);
const shot = shooter(shots);
const { chromium } = loadPlaywright();
const browser = await launchChrome({ chromium });

const analyticsHosts = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];
const isAnalytics = (entry) => analyticsHosts.some((host) => entry.startsWith(host) || entry.includes(host));

async function session({
  viewport = { width: 1024, height: 768 },
  reducedMotion = 'no-preference',
  touch = false,
  initScript = null,
} = {}) {
  return openSession(browser, {
    url: `${base}/games/question-ball/`,
    base,
    viewport,
    reducedMotion,
    context: touch ? { hasTouch: true, isMobile: true } : {},
    initScript,
    allowAbortedMedia: true,
  });
}

function checkClean(run, label) {
  checkSessionClean(report, {
    ...run,
    remote: run.remote.filter((entry) => !isAnalytics(entry)),
    failed: run.failed.filter((entry) => !isAnalytics(entry)),
  }, label);
}

async function state(page) {
  return page.evaluate(() => window.QLOBE_DEBUG.getState());
}

async function waitScreen(page, name) {
  await page.waitForFunction((screen) => window.QLOBE_DEBUG.getState().screen === screen, name);
}

async function checkTargets(page, label) {
  const sizes = await targetSizes(page);
  const small = undersized(sizes, 96);
  report.check(`${label} targets are at least 96px`, sizes.length > 0 && small.length === 0, JSON.stringify(small));
  return sizes;
}

async function reveal(page) {
  await page.evaluate(() => { window.QLOBE_DEBUG.reveal(); });
  await waitScreen(page, 'question');
}

async function finishCoPlay(page) {
  await page.locator('#coplay-button').click();
  await waitScreen(page, 'reward');
}

const main = await session();
const { page } = main;
await page.evaluate(() => {
  window.QLOBE_DEBUG.clearSaved();
  window.QLOBE_DEBUG.seed(42);
});

let current = await state(page);
report.check('splash boots on the preserved route', current.screen === 'splash');
report.check('debug contract is format v1', await page.evaluate(() => window.QLOBE_DEBUG.version === 1));
report.check('four topic packs are exposed', (await page.evaluate(() => window.QLOBE_DEBUG.listModes())).length === 4);
await checkTargets(page, 'landscape splash');
await shot(page, '01-splash-landscape');

await page.locator('#start-button').click();
await waitScreen(page, 'topics');
await page.waitForTimeout(250);
await checkTargets(page, 'topic quilt');
report.check('topic quilt renders four picture cards', await page.locator('.qb-topic-card').count() === 4);
await shot(page, '02-topic-quilt-landscape');

const musicAfterGesture = await page.evaluate(() => window.QLOBE_DEBUG.getLayout().music);
report.check('first gesture starts quiet recorded music', musicAfterGesture.playing && musicAfterGesture.volume <= 0.2, JSON.stringify(musicAfterGesture));

// Real swipe toss, including a screenshot while the ball is in flight.
await page.locator('[data-target="topic-routines"]').click();
await waitScreen(page, 'toss');
await page.waitForTimeout(250);
await checkTargets(page, 'toss');
await shot(page, '03-toss-ready-landscape');
const ballBox = await page.locator('#toss-ball').boundingBox();
const arenaBox = await page.locator('#toss-arena').boundingBox();
const startPoint = centerOf(ballBox);
await page.mouse.move(startPoint.x, startPoint.y);
await page.mouse.down();
await page.mouse.move(
  Math.min(arenaBox.x + arenaBox.width - ballBox.width, startPoint.x + 260),
  Math.max(arenaBox.y + 35, startPoint.y - 230),
  { steps: 6 },
);
await page.mouse.up();
await page.waitForFunction(() => ['flight', 'landing'].includes(window.QLOBE_DEBUG.getState().tossPhase));
await shot(page, '04-mid-toss-landscape');
await waitScreen(page, 'question');
await page.waitForTimeout(480);
current = await state(page);
const firstRoutinePrompt = current.promptId;
report.check('swipe toss reveals a routines prompt', current.packId === 'routines' && /^routines-/.test(current.promptId));
await checkTargets(page, 'question and share');
await shot(page, '05-question-share-landscape');
await finishCoPlay(page);
current = await state(page);
report.check('co-play sharing awards exactly one star', current.stars === 1 && current.lastShareMethod === 'co-play');
await checkTargets(page, 'sharing reward');
await page.waitForTimeout(1050);
await shot(page, '06-reward-landscape');

// Next question plus a true tap toss. Immediate repetition is forbidden.
await page.locator('#next-button').click();
await waitScreen(page, 'toss');
await page.locator('#toss-ball').click();
await waitScreen(page, 'question');
current = await state(page);
report.check('tap is a valid toss', current.tossPhase === 'revealed' && current.screen === 'question');
report.check('seeded prompts do not immediately repeat', current.promptId !== firstRoutinePrompt, `${firstRoutinePrompt} → ${current.promptId}`);
await finishCoPlay(page);

// Exercise every remaining pack from its real toss screen through reward.
for (const packId of ['animals', 'imagine', 'feelings']) {
  await page.evaluate((id) => window.QLOBE_DEBUG.startMode(id), packId);
  await waitScreen(page, 'toss');
  await reveal(page);
  current = await state(page);
  report.check(`${packId} pack reveals its own prompt`, current.packId === packId && current.promptId.startsWith(`${packId}-`));
  await page.evaluate(() => window.QLOBE_DEBUG.finishShare({ recorded: false }));
  await waitScreen(page, 'reward');
}
current = await state(page);
report.check('all four packs record completion', Object.values(current.completedByPack).every((value) => value >= 1), JSON.stringify(current.completedByPack));

// Fake only the browser microphone boundary; the production hold/release path,
// MediaRecorder lifecycle, Blob URL, replay UI, and navigation cleanup stay real.
await page.evaluate(() => {
  window.__qbStoppedTracks = 0;
  const stream = { getTracks: () => [{ stop: () => { window.__qbStoppedTracks += 1; } }] };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => stream },
  });
  class FakeMediaRecorder extends EventTarget {
    static isTypeSupported() { return true; }
    constructor() {
      super();
      this.state = 'inactive';
      this.mimeType = 'audio/webm';
    }
    start() { this.state = 'recording'; }
    stop() {
      if (this.state === 'inactive') return;
      this.state = 'inactive';
      window.setTimeout(() => {
        const dataEvent = new Event('dataavailable');
        Object.defineProperty(dataEvent, 'data', { value: new Blob(['local child idea'], { type: this.mimeType }) });
        this.dispatchEvent(dataEvent);
        this.dispatchEvent(new Event('stop'));
      }, 350);
    }
  }
  window.MediaRecorder = FakeMediaRecorder;
});

await page.evaluate(() => window.QLOBE_DEBUG.startMode('animals'));
await waitScreen(page, 'toss');
await reveal(page);
const micBox = await page.locator('#microphone-button').boundingBox();
const micPoint = centerOf(micBox);
await page.mouse.move(micPoint.x, micPoint.y);
await page.mouse.down();
await page.waitForFunction(() => window.QLOBE_DEBUG.getState().shareState === 'recording');
report.check('hold-to-talk enters recording only while held', (await state(page)).microphoneActive === true);
await shot(page, '07-recording-landscape');
await page.mouse.up();
await page.waitForFunction(() => window.QLOBE_DEBUG.getState().shareState === 'processing');
const processingGuard = await page.evaluate(async () => ({
  reentry: await window.QLOBE_DEBUG.startShare(),
  shareState: window.QLOBE_DEBUG.getState().shareState,
  microphoneDisabled: document.querySelector('#microphone-button').disabled,
  coplayDisabled: document.querySelector('#coplay-button').disabled,
}));
report.check('microphone processing blocks rapid re-entry and other share actions', processingGuard.reentry === false
  && processingGuard.shareState === 'processing'
  && processingGuard.microphoneDisabled
  && processingGuard.coplayDisabled, JSON.stringify(processingGuard));
await page.waitForFunction(() => window.QLOBE_DEBUG.getState().shareState === 'recorded');
current = await state(page);
report.check('released recording stays memory-only and is replayable', current.hasRecording && await page.locator('#replay-button').isVisible());
await page.locator('#coplay-button').click();
await waitScreen(page, 'reward');
current = await state(page);
report.check('recorded sharing reaches reward', current.lastShareMethod === 'recorded');
report.check('leaving the question destroys child audio and stops tracks', !current.hasRecording && !current.microphoneActive && await page.evaluate(() => window.__qbStoppedTracks > 0));

// Navigating during MediaRecorder's asynchronous stop must not revive state or
// let the old stop callback interfere with a later microphone session.
await page.evaluate(() => window.QLOBE_DEBUG.startMode('animals'));
await waitScreen(page, 'toss');
await reveal(page);
const pendingMicBox = await page.locator('#microphone-button').boundingBox();
const pendingMicPoint = centerOf(pendingMicBox);
await page.mouse.move(pendingMicPoint.x, pendingMicPoint.y);
await page.mouse.down();
await page.waitForFunction(() => window.QLOBE_DEBUG.getState().shareState === 'recording');
await page.mouse.up();
await page.waitForFunction(() => window.QLOBE_DEBUG.getState().shareState === 'processing');
await page.evaluate(() => window.QLOBE_DEBUG.home());
await waitScreen(page, 'splash');
await page.waitForTimeout(450);
current = await state(page);
report.check('navigation during microphone processing stays cleaned up', current.screen === 'splash'
  && current.shareState === 'idle'
  && !current.hasRecording
  && !current.microphoneActive, JSON.stringify(current));

// Permission denial must be warm, spoken, and completable through co-play.
await page.evaluate(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => { throw new DOMException('No microphone', 'NotAllowedError'); } },
  });
  window.QLOBE_DEBUG.startMode('feelings');
});
await waitScreen(page, 'toss');
await reveal(page);
const deniedMicBox = await page.locator('#microphone-button').boundingBox();
const deniedPoint = centerOf(deniedMicBox);
await page.mouse.move(deniedPoint.x, deniedPoint.y);
await page.mouse.down();
await page.waitForFunction(() => window.QLOBE_DEBUG.getState().shareState === 'fallback');
await page.mouse.up();
current = await state(page);
report.check('microphone denial switches to the co-play fallback', current.shareState === 'fallback' && await page.locator('#coplay-button').isVisible());
await finishCoPlay(page);
report.check('co-play remains completable after denial', (await state(page)).screen === 'reward');

const beforeReload = await state(page);
const persistedShape = await page.evaluate(() => {
  const saved = JSON.parse(localStorage.getItem('qlobe-question-ball-v1'));
  return { keys: Object.keys(saved).sort(), value: saved };
});
report.check('persistence contains only the three approved fields', JSON.stringify(persistedShape.keys) === JSON.stringify(['completedByPack', 'lastPack', 'stars']));
await page.reload({ waitUntil: 'networkidle' });
await page.evaluate(() => window.QLOBE_DEBUG.ready);
current = await state(page);
report.check('stars and pack progress survive reload', current.stars === beforeReload.stars && JSON.stringify(current.completedByPack) === JSON.stringify(beforeReload.completedByPack));
report.check('reload returns safely to splash', current.screen === 'splash');
checkClean(main, 'main gameplay');
await main.close();

// Recorded narration, exact Web Speech fallback, and music ducking.
const voiced = await session();
await voiced.page.evaluate(() => {
  const nativePlay = HTMLMediaElement.prototype.play;
  window.__qbAudioStarts = [];
  HTMLMediaElement.prototype.play = function (...args) {
    const src = this.currentSrc || this.src;
    const result = nativePlay.apply(this, args);
    Promise.resolve(result).then(() => window.__qbAudioStarts.push(src), () => {});
    return result;
  };
  window.QLOBE_DEBUG.clearAudioLog();
  window.QLOBE_DEBUG.seed(91);
});
await voiced.page.locator('#start-button').click();
await waitScreen(voiced.page, 'topics');
await voiced.page.evaluate(() => window.QLOBE_DEBUG.startMode('routines'));
await waitScreen(voiced.page, 'toss');
await voiced.page.evaluate(() => { window.QLOBE_DEBUG.reveal(); });
await waitScreen(voiced.page, 'question');
const voicedPrompt = (await state(voiced.page)).promptId;
const voicedKey = `prompt-${voicedPrompt}`;
await voiced.page.waitForFunction((key) => window.QLOBE_DEBUG.getAudioLog().some((entry) => entry.key === key), voicedKey);
const narrationLog = await voiced.page.evaluate(() => window.QLOBE_DEBUG.getAudioLog());
await voiced.page.waitForFunction(() => window.__qbAudioStarts.some((src) => src.includes('.m4a')), null, { timeout: 5_000 }).catch(() => {});
const starts = await voiced.page.evaluate(() => window.__qbAudioStarts.slice());
report.check('a question uses real recorded teacher narration', audio.heardClip(narrationLog, voicedKey), audio.describe(narrationLog));
report.check('the recorded narration actually starts an audio element', starts.some((src) => src.includes('.m4a')), starts.join(' | '));

await voiced.page.evaluate(() => {
  window.QLOBE_DEBUG.clearAudioLog();
  window.QLOBE_DEBUG.tap('sound-question');
});
await voiced.page.waitForFunction(() => window.QLOBE_DEBUG.getLayout().music.duckFactor < 1);
const ducked = await voiced.page.evaluate(() => window.QLOBE_DEBUG.getLayout().music);
report.check('background music ducks beneath spoken guidance', ducked.duckFactor < 1 && ducked.volume <= 0.2, JSON.stringify(ducked));
checkClean(voiced, 'recorded voice');
await voiced.close();

// 768×1024 portrait visual and interaction pass.
const portrait = await session({ viewport: { width: 768, height: 1024 }, touch: true });
await shot(portrait.page, '08-splash-portrait');
await checkTargets(portrait.page, 'portrait splash');
await portrait.page.locator('#start-button').tap();
await waitScreen(portrait.page, 'topics');
await portrait.page.waitForTimeout(250);
await shot(portrait.page, '09-topic-quilt-portrait');
await checkTargets(portrait.page, 'portrait topics');
await portrait.page.evaluate(() => window.QLOBE_DEBUG.startMode('imagine'));
await waitScreen(portrait.page, 'toss');
await reveal(portrait.page);
await portrait.page.waitForTimeout(480);
await shot(portrait.page, '10-question-share-portrait');
await checkTargets(portrait.page, 'portrait question');
const portraitLayout = await portrait.page.evaluate(() => window.QLOBE_DEBUG.getLayout());
report.check('portrait layout reports the correct orientation', portraitLayout.orientation === 'portrait');
checkClean(portrait, 'portrait');
await portrait.close();

// Narrow landscape must retain the 96px target floor and keep controls inside.
const narrow = await session({ viewport: { width: 900, height: 540 } });
await narrow.page.locator('#start-button').click();
await waitScreen(narrow.page, 'topics');
await narrow.page.evaluate(() => window.QLOBE_DEBUG.startMode('animals'));
await waitScreen(narrow.page, 'toss');
await reveal(narrow.page);
await narrow.page.waitForTimeout(480);
const narrowSizes = await checkTargets(narrow.page, 'narrow landscape question');
report.check('narrow landscape keeps all targets on screen', await narrow.page.evaluate(() => [...document.querySelectorAll('[data-target]')]
  .filter((node) => node.getClientRects().length && !node.disabled)
  .every((node) => {
    const rect = node.getBoundingClientRect();
    return rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
  })), JSON.stringify(narrowSizes));
await shot(narrow.page, '11-question-narrow-landscape');
checkClean(narrow, 'narrow landscape');
await narrow.close();

// Reduced motion keeps state transitions while skipping ballistics/confetti.
const reduced = await session({ viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' });
await reduced.page.locator('#start-button').click();
await waitScreen(reduced.page, 'topics');
await reduced.page.evaluate(() => window.QLOBE_DEBUG.startMode('feelings'));
await waitScreen(reduced.page, 'toss');
await reduced.page.evaluate(() => { window.QLOBE_DEBUG.toss(1000, -1200); });
await waitScreen(reduced.page, 'question');
current = await state(reduced.page);
report.check('reduced motion uses an immediate reveal', current.reducedMotion && current.tossPhase === 'revealed');
await reduced.page.evaluate(() => window.QLOBE_DEBUG.finishShare({ recorded: false }));
await waitScreen(reduced.page, 'reward');
await reduced.page.waitForTimeout(140);
report.check('reduced motion suppresses confetti', await reduced.page.locator('.qk-confetti-layer').count() === 0);
await shot(reduced.page, '12-reward-reduced-motion');
checkClean(reduced, 'reduced motion');
await reduced.close();

// Catalog route remains intact when integration updates the existing card.
const hubContext = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const hubPage = await hubContext.newPage();
await hubPage.goto(`${base}/#oral-storytelling`, { waitUntil: 'networkidle' });
const hubCard = hubPage.locator('[data-game-id="question-ball"]');
const hubVisible = await hubCard.count() === 1 && await hubCard.isVisible();
report.check('catalog still exposes Question Ball at its original route', hubVisible);
if (hubVisible) {
  await hubCard.click();
  await hubPage.waitForURL('**/games/question-ball/');
  await hubPage.waitForFunction(() => window.QLOBE_DEBUG?.gameId === 'question-ball');
  report.check('catalog card launches the custom Question Ball runtime', await hubPage.evaluate(() => window.QLOBE_DEBUG.engine === 'custom-question-ball'));
}
await hubContext.close();

await browser.close();
report.finish({ suffix: `; screenshots in ${shots}`, exit: true });
