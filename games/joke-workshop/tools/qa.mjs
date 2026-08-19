#!/usr/bin/env node
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { loadPlaywright, launchChrome, openSession, createReporter, resolveShots, checkSessionClean, audio } from '../../../tools/qa/lib/driver.mjs';

const base = (process.env.QLOBE_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');
const shots = resolveShots('/private/tmp/qlobe-joke-workshop-shots');
const { chromium } = loadPlaywright();
const report = createReporter();
await mkdir(shots, { recursive: true });
const browser = await launchChrome({ chromium });

async function session(viewport, touch = false) {
  return openSession(browser, {
    url: `${base}/games/joke-workshop/`,
    base,
    viewport,
    reducedMotion: 'reduce',
    context: touch ? { hasTouch: true, isMobile: true } : {},
    allowAbortedMedia: true,
  });
}
async function state(page) { return page.evaluate(() => window.QLOBE_DEBUG.getState()); }
async function waitScreen(page, name) { await page.waitForFunction((n) => window.QLOBE_DEBUG.getState().screen === n, name); }

// Every production game includes the shared GA4 tag. It is the platform's one
// intentional remote request and is often aborted when a test context closes.
const analyticsHosts = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];
const isAnalytics = (entry) => analyticsHosts.some((host) => entry.startsWith(host));
function checkClean(session, label) {
  checkSessionClean(report, {
    ...session,
    remote: session.remote.filter((entry) => !isAnalytics(entry)),
    failed: session.failed.filter((entry) => !isAnalytics(entry)),
  }, label);
}

const s = await session({ width: 1180, height: 820 });
const { page } = s;
report.check('splash screen boots', (await state(page)).screen === 'splash');
await page.evaluate(() => window.QLOBE_DEBUG.clearStorage());
await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });
report.check('splash targets >=96px', (await page.evaluate(() => window.QLOBE_DEBUG.getTargets())).every(t => t.rect.w >= 96 && t.rect.h >= 96));
await page.evaluate(() => window.QLOBE_DEBUG.openBook()); await waitScreen(page, 'book');
report.check('empty book shows only its empty state', await page.evaluate(() => !document.querySelector('#book-empty').hidden && document.querySelector('#book-list').hidden));
await page.screenshot({ path: path.join(shots, '01b-empty-book-landscape.png') });
await page.evaluate(() => window.QLOBE_DEBUG.home()); await waitScreen(page, 'splash');
await page.locator('#start-button').click(); await waitScreen(page, 'deck');
report.check('deck reached', (await state(page)).screen === 'deck');
await page.screenshot({ path: path.join(shots, '02-deck-landscape.png') });
const ids = ['bear', 'banana', 'ghost'];
for (const id of ids) {
  await page.evaluate((j) => window.QLOBE_DEBUG.selectJoke(j), id); await waitScreen(page, 'builder');
  report.check(`${id} builder reached`, (await state(page)).selectedJokeId === id);
  report.check(`${id} builder targets >=96px`, (await page.evaluate(() => window.QLOBE_DEBUG.getTargets())).every(t => t.rect.w >= 96 && t.rect.h >= 96));
  if (id === 'bear') {
    report.check('picture builder exposes three choices and a record option', await page.evaluate(() => document.querySelectorAll('#answer-row .jw-answer-card').length === 3 && !document.querySelector('#record-button').hidden));
    await page.screenshot({ path: path.join(shots, '02b-builder-landscape.png') });
  }
  await page.evaluate(() => window.QLOBE_DEBUG.winRound()); await waitScreen(page, 'stage');
  if (id === 'bear') {
    report.check('stage intro hides reward and actions', await page.evaluate(() => document.querySelector('#reward-star').hidden && document.querySelector('#stage-actions').hidden));
    await page.screenshot({ path: path.join(shots, '02d-stage-intro-landscape.png') });
  }
  await page.evaluate(() => window.QLOBE_DEBUG.completeStage()); await waitScreen(page, 'stage');
  report.check(`${id} stage completes`, (await state(page)).stageComplete === true);
  if (id === 'bear') await page.screenshot({ path: path.join(shots, '03-stage-landscape.png') });
  await page.evaluate(() => window.QLOBE_DEBUG.home()); await waitScreen(page, 'splash');
  await page.locator('#start-button').click(); await waitScreen(page, 'deck');
}
// Direct picture selection still performs without a separate submit button.
await page.evaluate(() => window.QLOBE_DEBUG.selectJoke('bear')); await waitScreen(page, 'builder');
await page.evaluate(() => {
  const D = window.QLOBE_DEBUG;
  D.selectAnswer('bear-gummy');
  D.perform();
});
await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'stage');
report.check('direct picture selection reaches stage', (await state(page)).performance?.answerId === 'bear-gummy');
await page.evaluate(() => window.QLOBE_DEBUG.completeStage());
const stars = (await state(page)).stars; await page.evaluate(() => window.QLOBE_DEBUG.openBook()); await waitScreen(page, 'book');
await page.screenshot({ path: path.join(shots, '04-book-landscape.png') });
report.check('Joke Book persists entry and star', (await state(page)).bookCount >= 1 && (await state(page)).stars === stars);
report.check('populated book hides its empty state', await page.evaluate(() => document.querySelector('#book-empty').hidden && !document.querySelector('#book-list').hidden));
await page.reload({ waitUntil: 'networkidle' }); await page.evaluate(() => window.QLOBE_DEBUG.ready); await page.evaluate(() => window.QLOBE_DEBUG.openBook()); await waitScreen(page, 'book');
report.check('book survives reload without extra star', (await state(page)).stars === stars);
await page.evaluate(() => window.QLOBE_DEBUG.home()); await waitScreen(page, 'splash'); report.check('home returns to splash', (await state(page)).screen === 'splash');
checkClean(s, 'landscape'); await s.close();

// Recorded lines and the recording prompt intentionally take different audio
// routes. This pass stays unmuted in system Chrome so it proves both the AAC
// clip start and the new Web Speech prompt.
const voiced = await session({ width: 1180, height: 820 });
await voiced.page.evaluate(() => {
  const nativePlay = HTMLMediaElement.prototype.play;
  const nativeSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
  window.__jwClipStarts = [];
  window.__jwSpeechCalls = [];
  window.__jwRestoreAudioSpies = () => {
    HTMLMediaElement.prototype.play = nativePlay;
    window.speechSynthesis.speak = nativeSpeak;
  };
  HTMLMediaElement.prototype.play = function (...args) {
    const src = this.currentSrc || this.src;
    const result = nativePlay.apply(this, args);
    Promise.resolve(result).then(() => window.__jwClipStarts.push(src), () => {});
    return result;
  };
  window.speechSynthesis.speak = (utterance) => {
    window.__jwSpeechCalls.push(utterance.text);
    return nativeSpeak(utterance);
  };
  window.QLOBE_DEBUG.clearAudioLog();
});
await voiced.page.locator('#start-button').click(); await waitScreen(voiced.page, 'deck');
await voiced.page.evaluate(() => {
  const D = window.QLOBE_DEBUG;
  D.clearAudioLog();
  D.selectJoke('bear');
  D.selectAnswer('bear-gummy');
  D.perform();
});
await voiced.page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog().some((entry) => entry.key === 'bear-gummy' && entry.kind === 'clip'));
await voiced.page.waitForFunction(() => window.__jwClipStarts.some((src) => /bear-gummy\.m4a(?:$|\?)/.test(src)));
const clipProof = await voiced.page.evaluate(() => ({
  log: window.QLOBE_DEBUG.getAudioLog(),
  starts: window.__jwClipStarts,
}));
report.check('authored punchline starts the recorded comedian clip',
  audio.heardClip(clipProof.log, 'bear-gummy') && clipProof.starts.some((src) => /bear-gummy\.m4a(?:$|\?)/.test(src)),
  `${audio.describe(clipProof.log)} | ${clipProof.starts.join(', ')}`);
await voiced.page.evaluate(() => window.QLOBE_DEBUG.completeStage());
await voiced.page.evaluate(() => window.QLOBE_DEBUG.clearAudioLog());
await voiced.page.locator('#next-joke-button').click(); await waitScreen(voiced.page, 'deck');
await voiced.page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog().some((entry) => entry.key === 'next-joke' && entry.kind === 'clip'));
await voiced.page.waitForFunction(() => window.__jwClipStarts.some((src) => /next-joke\.m4a(?:$|\?)/.test(src)));
const nextProof = await voiced.page.evaluate(() => ({
  log: window.QLOBE_DEBUG.getAudioLog(),
  starts: window.__jwClipStarts,
}));
report.check('Next Joke transition starts its recorded line after navigation',
  audio.heardClip(nextProof.log, 'next-joke') && nextProof.starts.some((src) => /next-joke\.m4a(?:$|\?)/.test(src)),
  `${audio.describe(nextProof.log)} | ${nextProof.starts.join(', ')}`);

await voiced.page.route('**/banana-setup.m4a', (route) => route.fulfill({
  status: 200,
  contentType: 'audio/mp4',
  body: 'intentionally invalid audio for fallback QA',
}));
await voiced.page.evaluate(() => {
  const D = window.QLOBE_DEBUG;
  D.clearAudioLog();
  window.__jwSpeechCalls.length = 0;
  D.selectJoke('banana');
});
await voiced.page.waitForFunction(() => window.__jwSpeechCalls.includes('Why did the banana go to the doctor?'));
const fallbackProof = await voiced.page.evaluate(() => ({
  log: window.QLOBE_DEBUG.getAudioLog(),
  calls: window.__jwSpeechCalls,
}));
report.check('corrupt recorded line falls back to its exact authored Web Speech text',
  audio.heardClip(fallbackProof.log, 'banana-setup')
    && fallbackProof.calls.includes('Why did the banana go to the doctor?'),
  `${audio.describe(fallbackProof.log)} | ${fallbackProof.calls.join(', ')}`);
await voiced.page.unroute('**/banana-setup.m4a');

await voiced.page.evaluate(() => {
  const D = window.QLOBE_DEBUG;
  D.home();
  D.clearAudioLog();
  D.selectJoke('bear');
});
await voiced.page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog().some((entry) => entry.key === 'record-ending' && entry.kind === 'speech'));
await voiced.page.waitForFunction(() => window.__jwSpeechCalls.includes('Pick a picture punchline, or tap the microphone to record your own.'));
const recordPromptProof = await voiced.page.evaluate(() => ({
  log: window.QLOBE_DEBUG.getAudioLog(),
  calls: window.__jwSpeechCalls,
}));
report.check('recording prompt uses Web Speech fallback',
  recordPromptProof.log.some((entry) => entry.key === 'record-ending' && entry.kind === 'speech')
    && recordPromptProof.calls.includes('Pick a picture punchline, or tap the microphone to record your own.'),
  `${audio.describe(recordPromptProof.log)} | ${recordPromptProof.calls.join(', ')}`);
await voiced.page.evaluate(() => {
  window.__jwRestoreAudioSpies();
  delete window.__jwRestoreAudioSpies;
});
checkClean(voiced, 'recorded-voice'); await voiced.close();

// Exercise the actual timed payoff, cancellation boundary, corrupt storage,
// and the documented in-memory fallback independently from the forced visual
// flows above.
const flow = await session({ width: 1180, height: 820 });
await flow.page.evaluate(() => {
  const D = window.QLOBE_DEBUG;
  D.clearStorage(); D.mute(true); D.fastTimers(0.01);
  D.selectJoke('bear'); D.selectAnswer('bear-gummy'); D.perform();
});
await flow.page.evaluate(() => window.QLOBE_DEBUG.waitForStage());
let flowState = await state(flow.page);
report.check('real timed stage sequence completes', flowState.stageComplete && flowState.stars === 1 && flowState.bookCount === 1);
report.check('real timed stage sequence drains timers', flowState.timers === 0);

await flow.page.evaluate(() => {
  const D = window.QLOBE_DEBUG;
  D.clearStorage(); D.fastTimers(0.1);
  D.selectJoke('banana'); D.selectAnswer('banana-peeling'); D.perform(); D.home();
});
await flow.page.waitForTimeout(250);
flowState = await state(flow.page);
report.check('mid-performance home cancels without award', flowState.screen === 'splash' && flowState.stars === 0 && flowState.bookCount === 0 && flowState.timers === 0);

await flow.page.evaluate(() => localStorage.setItem('qlobe-joke-workshop-v2', '{broken'));
await flow.page.reload({ waitUntil: 'networkidle' });
await flow.page.evaluate(() => window.QLOBE_DEBUG.ready);
flowState = await state(flow.page);
report.check('malformed storage recovers to defaults', flowState.stars === 0 && flowState.bookCount === 0);

await flow.page.evaluate(() => {
  const D = window.QLOBE_DEBUG;
  const original = Storage.prototype.setItem;
  window.__jwRestoreSetItem = () => { Storage.prototype.setItem = original; };
  Storage.prototype.setItem = () => { throw new Error('simulated storage denial'); };
  D.mute(true); D.fastTimers(0.01);
  D.selectJoke('ghost'); D.selectAnswer('ghost-berries'); D.perform();
});
await flow.page.evaluate(() => window.QLOBE_DEBUG.waitForStage());
flowState = await state(flow.page);
report.check('storage-write failure keeps in-memory reward', flowState.stars === 1 && flowState.bookCount === 1);
await flow.page.evaluate(() => { window.__jwRestoreSetItem(); delete window.__jwRestoreSetItem; window.QLOBE_DEBUG.clearStorage(); });
checkClean(flow, 'real-flow'); await flow.close();

for (const [viewport, name] of [[[820,1180], 'portrait'], [[1024,768], 'touch']]) {
  const t = await session({ width: viewport[0], height: viewport[1] }, name === 'touch');
  report.check(`${name} splash boots`, (await state(t.page)).screen === 'splash');
  report.check(`${name} targets >=96px`, (await t.page.evaluate(() => window.QLOBE_DEBUG.getTargets())).every(x => x.rect.w >= 96 && x.rect.h >= 96));
  if (name === 'portrait') {
    await t.page.screenshot({ path: path.join(shots, '05-splash-portrait.png') });
    await t.page.locator('#start-button').click(); await waitScreen(t.page, 'deck');
    await t.page.screenshot({ path: path.join(shots, '06-deck-portrait.png') });
    await t.page.evaluate(() => window.QLOBE_DEBUG.selectJoke('bear')); await waitScreen(t.page, 'builder');
    report.check('portrait builder targets >=96px', (await t.page.evaluate(() => window.QLOBE_DEBUG.getTargets())).every(x => x.rect.w >= 96 && x.rect.h >= 96));
    await t.page.screenshot({ path: path.join(shots, '07-builder-portrait.png') });
    await t.page.evaluate(() => window.QLOBE_DEBUG.winRound()); await waitScreen(t.page, 'stage');
    await t.page.evaluate(() => window.QLOBE_DEBUG.completeStage());
    await t.page.screenshot({ path: path.join(shots, '08-stage-portrait.png') });
    await t.page.evaluate(() => window.QLOBE_DEBUG.openBook()); await waitScreen(t.page, 'book');
    await t.page.screenshot({ path: path.join(shots, '09-book-portrait.png') });
  } else {
    await t.page.locator('#start-button').click(); await waitScreen(t.page, 'deck');
    await t.page.evaluate(() => window.QLOBE_DEBUG.selectJoke('ghost')); await waitScreen(t.page, 'builder');
    report.check('touch builder targets >=96px', (await t.page.evaluate(() => window.QLOBE_DEBUG.getTargets())).every(x => x.rect.w >= 96 && x.rect.h >= 96));
    await t.page.screenshot({ path: path.join(shots, '10-builder-ipad-touch.png') });
  }
  checkClean(t, name);
  await t.close();
}

const hubContext = await browser.newContext({ viewport: { width: 1180, height: 820 } });
const hubPage = await hubContext.newPage();
await hubPage.goto(`${base}/#oral-storytelling`, { waitUntil: 'networkidle' });
const hubCard = hubPage.locator('[data-game-id="joke-workshop"]');
report.check('catalog category exposes Joke Workshop', await hubCard.count() === 1 && await hubCard.isVisible());
report.check('catalog tile image loads', await hubCard.locator('img').evaluate((img) => img.complete && img.naturalWidth > 0));
await hubCard.click();
await hubPage.waitForURL('**/games/joke-workshop/');
await hubPage.waitForFunction(() => window.QLOBE_DEBUG?.gameId === 'joke-workshop');
report.check('catalog card launches Joke Workshop', await hubPage.evaluate(() => window.QLOBE_DEBUG.gameId === 'joke-workshop'));
await hubContext.close();

report.finish({ suffix: `; shots in ${shots}`, exit: true });
