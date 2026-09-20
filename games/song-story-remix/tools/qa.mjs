#!/usr/bin/env node

import { access, readFile, readdir, stat } from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  audio,
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

const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = baseUrl('http://127.0.0.1:8129');
const URL = `${BASE}/games/song-story-remix/`;
const SHOTS = resolveShots(path.join(os.tmpdir(), 'qlobe-song-story-remix-shots'));
const reporter = createReporter({ collapse: true, detailLimit: 260 });
const { check, head, finish } = reporter;
const shot = shooter(SHOTS);
const ANALYTICS = ['https://www.google-analytics.com/', 'https://www.googletagmanager.com/'];

const json = async (file) => JSON.parse(await readFile(path.join(GAME, file), 'utf8'));
const exists = async (file) => { try { await access(path.join(GAME, file), FS.F_OK); return true; } catch { return false; } };
const size = async (file) => { try { return (await stat(path.join(GAME, file))).size; } catch { return -1; } };

function runtimePath(url) {
  return url.replace(/^\.\//, '');
}

async function waitForImages(page) {
  await page.waitForFunction(() => [...document.images]
    .filter((image) => image.getClientRects().length)
    .every((image) => image.complete && image.naturalWidth > 0));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function layout(page) {
  return page.evaluate(() => ({
    viewport: [innerWidth, innerHeight],
    document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    body: [document.body.scrollWidth, document.body.scrollHeight],
  }));
}

function noOverflow(value) {
  return value.document[0] <= value.viewport[0]
    && value.document[1] <= value.viewport[1]
    && value.body[0] <= value.viewport[0]
    && value.body[1] <= value.viewport[1];
}

async function checkTargets(page, label, minimum = 96) {
  const bad = undersized(await targetSizes(page), minimum);
  check(`${label} targets are at least ${minimum}px`, bad.length === 0,
    bad.map(({ id, w, h }) => `${id}:${Math.round(w)}×${Math.round(h)}`).join(', '));
}

function cleanSession(session, label) {
  const failed = session.failed.filter((line) => !ANALYTICS.some((prefix) => line.includes(prefix)));
  checkSessionClean(reporter, { ...session, failed }, label);
}

async function staticChecks() {
  head('Static package');
  const [config, manifest, qa] = await Promise.all([
    json('config.json'), json('assets/audio/manifest.json'), json('assets/audio/qa.json'),
  ]);
  check('three song modes', config.songs.length === 3);
  check('nine unique story swaps', new Set(config.songs.flatMap((song) => song.choices.map(({ id }) => id))).size === 9);
  check('four bandleaders', config.singers.length === 4);
  check('every choice has four lyric cues', config.songs.every((song) => song.choices.every((choice) => choice.lyrics.length === 4)));
  const art = [
    ...Object.values(config.assets.backgrounds), config.assets.title, config.assets.cameraFrame,
    ...Object.values(config.assets.controls), ...config.singers.map(({ art: file }) => file),
    ...config.songs.flatMap((song) => [song.card, ...song.choices.map(({ token }) => token)]),
  ].map(runtimePath);
  const missingArt = [];
  for (const file of art) if (!(await exists(file))) missingArt.push(file);
  check('every configured raster asset exists', missingArt.length === 0, missingArt.join(', '));
  check('share image exists and is nontrivial', (await size('assets/og-image.jpg')) > 50_000);
  check('14 narration clips are mapped', Object.keys(manifest).length === 14);
  const missingVoice = [];
  for (const entry of Object.values(manifest)) if (!(await exists(`assets/audio/${entry.file}`))) missingVoice.push(entry.file);
  check('every narration file resolves', missingVoice.length === 0, missingVoice.join(', '));
  check('all voice clips passed Whisper and audio QA', Object.values(qa).length === 14
    && Object.values(qa).every((entry) => entry.valid && entry.exact && entry.similarity >= 0.9 && entry.wordCoverage >= 0.94));
  check('asset-cutter report and magenta QA exist', await exists('assets/source/qa/process-report.json') && await exists('assets/source/qa/qa-magenta.jpg'));
  const active = await Promise.all(['index.html', 'css/style.css', 'js/main.js', 'js/song-engine.js', 'js/show-media.js', 'js/show-store.js']
    .map((file) => readFile(path.join(GAME, file), 'utf8')));
  const source = active.join('\n');
  check('active game uses no SVG artwork', !/<svg|\.svg["'`)]/i.test(source));
  check('active game uses no CSS gradient artwork', !/gradient\s*\(/i.test(source));
}

async function openGame(browser, viewport, reducedMotion = 'no-preference') {
  return openSession(browser, {
    url: URL,
    base: BASE,
    viewport,
    reducedMotion,
    mute: true,
    allowAbortedMedia: true,
    allowRemote: ANALYTICS,
  });
}

async function driveCore(browser) {
  head('Landscape interaction');
  const session = await openGame(browser, { width: 1280, height: 800 });
  const { page } = session;
  check('debug contract boots on the song shelf', await page.evaluate(() => QLOBE_DEBUG.version === 1
    && QLOBE_DEBUG.gameId === 'song-story-remix' && QLOBE_DEBUG.getState().screen === 'splash'));
  check('three songs are exposed', (await debug.listModes(page)).map(({ id }) => id).join(',') === 'rainy-day,space-trip,jungle-walk');
  await waitForImages(page);
  await checkTargets(page, 'song shelf');
  check('landscape shelf has no overflow', noOverflow(await layout(page)));
  await shot(page, '01-song-shelf-landscape');

  await debug.mute(page, false);
  await page.locator('[data-target="song-rainy-day"]').click();
  await debug.waitForScreen(page, 'remix');
  await waitForImages(page);
  const firstLog = await debug.getAudioLog(page);
  check('first gesture invokes recorded teacher narration', firstLog.some((entry) => entry.kind === 'clip'), audio.describe(firstLog));
  await debug.mute(page, true);
  check('remix offers three swaps and four bandleaders', await page.locator('.choice-token').count() === 3
    && await page.locator('.singer-token').count() === 4);
  await checkTargets(page, 'remix book');
  await shot(page, '02-remix-rain-landscape');

  await debug.call(page, 'choose', 'duck', 'tiger-band');
  const remixed = await debug.getState(page);
  check('picture and bandleader update semantic state', remixed.choiceId === 'duck' && remixed.singerId === 'tiger-band');
  check('all four lyric lines changed to the duck story', await page.locator('.lyric-line').allTextContents()
    .then((lines) => lines.length === 4 && lines.join(' ').toLowerCase().includes('duck')));
  await shot(page, '03-remix-duck-tiger-landscape');

  await debug.call(page, 'setMediaMode', 'fake');
  await debug.tap(page, 'record');
  check('record opens an explicit equal-choice permission sheet', await page.locator('#permission-sheet').isVisible()
    && await page.locator('[data-target="record-camera"]').isVisible()
    && await page.locator('[data-target="record-stage"]').isVisible());
  await checkTargets(page, 'recording choice');
  await debug.tap(page, 'record-camera');
  await debug.waitForScreen(page, 'perform');
  await page.waitForFunction(() => QLOBE_DEBUG.getState().phase === 'performing');
  check('fake-camera path enters bounded recording mode', (await debug.getState(page)).permission === 'granted');
  check('camera mode reserves stage space', await page.locator('#screen-perform').evaluate((node) => node.classList.contains('with-camera')));
  await shot(page, '04-camera-show-landscape');
  await page.evaluate(() => {
    QLOBE_DEBUG.tap('performance-stop');
    return QLOBE_DEBUG.home();
  });
  await debug.waitForScreen(page, 'splash');
  await page.waitForTimeout(120);
  check('Back wins a recorder-finalization race without reopening Remix', (await debug.getState(page)).screen === 'splash');
  check('aborted finalization does not save a partial show', (await debug.getState(page)).savedCount === 0);

  await debug.startMode(page, 'rainy-day');
  await debug.call(page, 'choose', 'duck', 'tiger-band');
  await debug.call(page, 'setMediaMode', 'fake');
  await debug.tap(page, 'record');
  await debug.tap(page, 'record-camera');
  await page.waitForFunction(() => QLOBE_DEBUG.getState().phase === 'performing');
  await debug.tap(page, 'performance-stop');
  await debug.waitForScreen(page, 'final');
  check('camera show saves one local remix', (await debug.getState(page)).savedCount === 1);
  await waitForImages(page);
  await checkTargets(page, 'final concert');
  await shot(page, '05-final-concert-landscape');

  await debug.tap(page, 'library-open-final');
  await debug.waitForScreen(page, 'library');
  check('saved remix appears in local shelf', await page.locator('.saved-remix').count() === 1);
  await checkTargets(page, 'remix shelf');
  await shot(page, '06-remix-library-landscape');
  await page.locator('.saved-remix-open').click();
  await debug.waitForScreen(page, 'final');
  await debug.tap(page, 'replay-current');
  check('semantic stage replay starts without stored media', await page.locator('#final-stage').evaluate((node) => node.classList.contains('is-replaying')));
  await page.waitForTimeout(120);

  await debug.call(page, 'home');
  await debug.startMode(page, 'space-trip');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => new Promise((resolve) => setTimeout(() => resolve({
          getTracks: () => [{ stop() {} }],
        }), 160)),
      },
    });
  });
  await debug.call(page, 'setMediaMode', 'real');
  await debug.tap(page, 'record');
  await page.evaluate(() => {
    QLOBE_DEBUG.tap('record-camera');
    return QLOBE_DEBUG.home();
  });
  await debug.waitForScreen(page, 'splash');
  await page.waitForTimeout(260);
  check('Back safely cancels a pending camera permission request', (await debug.getState(page)).screen === 'splash');

  await debug.startMode(page, 'space-trip');
  await debug.call(page, 'setMediaMode', 'denied');
  await debug.tap(page, 'record');
  await debug.tap(page, 'record-camera');
  await page.waitForFunction(() => QLOBE_DEBUG.getState().phase === 'performing');
  const denied = await debug.getState(page);
  check('denied camera gracefully becomes a stage show', denied.permission === 'denied'
    && await page.locator('#camera-shell').isHidden());
  await debug.tap(page, 'performance-stop');
  await debug.waitForScreen(page, 'final');
  check('denied-camera show still saves', (await debug.getState(page)).savedCount === 2);

  await debug.call(page, 'home');
  await debug.startMode(page, 'jungle-walk');
  await debug.tap(page, 'record');
  await debug.tap(page, 'record-stage');
  await page.waitForFunction(() => QLOBE_DEBUG.getState().phase === 'performing');
  check('stage-only path never asks for media permission', (await debug.getState(page)).permission === 'skipped');
  await debug.tap(page, 'performance-stop');
  await debug.waitForScreen(page, 'final');
  check('stage-only show saves', (await debug.getState(page)).savedCount === 3);
  check('landscape final has no overflow', noOverflow(await layout(page)));
  cleanSession(session, 'landscape');
  await session.close();
}

async function driveResponsive(browser, label, viewport, reducedMotion, minimum = 96) {
  head(label);
  const session = await openGame(browser, viewport, reducedMotion);
  const { page } = session;
  await waitForImages(page);
  await shot(page, `07-${label}-shelf`);
  await debug.startMode(page, 'space-trip');
  await waitForImages(page);
  await checkTargets(page, `${label} remix`, minimum);
  check(`${label} remix has no document overflow`, noOverflow(await layout(page)), JSON.stringify(await layout(page)));
  await shot(page, `08-${label}-remix`);
  await debug.winRound(page);
  await debug.waitForScreen(page, 'final');
  await waitForImages(page);
  await checkTargets(page, `${label} final`, minimum);
  await shot(page, `09-${label}-final`);
  cleanSession(session, label);
  await session.close();
}

async function driveStorageFallback(browser) {
  head('Storage fallback');
  const session = await openSession(browser, {
    url: URL,
    base: BASE,
    viewport: { width: 1024, height: 768 },
    mute: true,
    allowAbortedMedia: true,
    allowRemote: ANALYTICS,
    initScript: () => {
      Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        value: { open() { throw new DOMException('Storage disabled', 'SecurityError'); } },
      });
    },
  });
  check('game becomes ready when IndexedDB throws synchronously', (await debug.getState(session.page)).screen === 'splash');
  check('storage status reports the session fallback', (await debug.getState(session.page)).storagePersistent === false);
  await debug.startMode(session.page, 'rainy-day');
  await debug.winRound(session.page);
  check('session fallback saves and lists a remix', (await debug.getState(session.page)).savedCount === 1
    && (await debug.call(session.page, 'listShows')).length === 1);
  cleanSession(session, 'storage fallback');
  await session.close();
}

async function driveHub(browser) {
  head('Hub integration');
  const session = await openSession(browser, {
    url: `${BASE}/#art-music`, base: BASE, viewport: { width: 1280, height: 800 }, ready: false,
    allowRemote: ANALYTICS,
  });
  const tile = session.page.locator('a.game-card[aria-label^="Song Story Remix"]');
  await tile.waitFor({ timeout: 15_000 });
  check('live hub tile is discoverable', await tile.count() === 1);
  check('hub uses the curated Krea raster tile', (await tile.locator('img').getAttribute('src'))?.endsWith('assets/hub/tiles/song-story-remix.jpg'));
  await tile.scrollIntoViewIfNeeded();
  await shot(session.page, '00-hub-tile');
  cleanSession(session, 'hub');
  await session.close();
}

async function main() {
  await ensureShots(SHOTS);
  await staticChecks();
  const browser = await launchChrome();
  try {
    await driveHub(browser);
    await driveCore(browser);
    await driveStorageFallback(browser);
    await driveResponsive(browser, 'portrait-reduced', { width: 768, height: 1024 }, 'reduce', 96);
    await driveResponsive(browser, 'short-landscape', { width: 844, height: 390 }, 'no-preference', 96);
  } finally {
    await browser.close();
    const count = (await readdir(SHOTS)).filter((file) => file.endsWith('.png')).length;
    finish({ suffix: `; ${count} screenshots in ${SHOTS}` });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
