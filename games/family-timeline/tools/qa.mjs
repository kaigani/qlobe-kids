#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import {
  args, baseUrl, launchChrome, createReporter, openSession, checkSessionClean,
  resolveShots, ensureShots, shooter, targetSizes, undersized, debug,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl('http://127.0.0.1:4173');
const url = `${base}/games/family-timeline/`;
const shots = resolveShots(path.join(os.tmpdir(), 'qlobe-family-timeline-shots'));
const shot = shooter(shots);
const reporter = createReporter();
const { check, finish } = reporter;
const PLATFORM_ANALYTICS = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
  'blob:',
];

async function stubAnalytics(run) {
  await run.context.route(/https:\/\/(?:www\.googletagmanager\.com|www\.google-analytics\.com)\//, (route) => (
    route.fulfill({ status: 204, body: '' })
  ));
}

async function tap(page, id) {
  await debug.tap(page, id);
  await page.waitForTimeout(100);
}

async function checkTargets(page, label) {
  const sizes = await targetSizes(page);
  const small = undersized(sizes, 96);
  check(`${label} targets are at least 96px`, small.length === 0,
    small.map((item) => `${item.id}:${Math.round(item.w)}x${Math.round(item.h)}`).join(', '));
}

async function session(browser, viewport, extra = {}) {
  const waitUntil = extra.waitUntil || 'networkidle';
  const run = await openSession(browser, {
    url, base, viewport, allowAbortedMedia: true,
    captureRequestFailures: true, allowRemote: PLATFORM_ANALYTICS,
    goto: false, ready: false, ...extra,
  });
  await stubAnalytics(run);
  await run.page.goto(url, { waitUntil });
  await debug.waitForHook(run.page, 30000);
  await debug.waitForReady(run.page);
  await debug.mute(run.page, true);
  return run;
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome({ headless: !args.has('headed') });
  const hubRun = await openSession(browser, {
    url: `${base}/#culture-geography`, base, viewport: { width: 1180, height: 820 }, ready: false,
    goto: false, allowRemote: PLATFORM_ANALYTICS,
  });
  await stubAnalytics(hubRun);
  await hubRun.page.goto(`${base}/#culture-geography`, { waitUntil: 'networkidle' });
  const hubTile = hubRun.page.locator('a.game-card[aria-label^="Family Timeline"]');
  check('hub links Family Timeline route', await hubTile.count() === 1
    && await hubTile.getAttribute('href') === './games/family-timeline/');
  await Promise.all([hubRun.page.waitForURL('**/games/family-timeline/'), hubTile.click()]);
  await debug.waitForHook(hubRun.page);
  await debug.waitForReady(hubRun.page);
  check('hub tile launches the production game route', (await debug.getState(hubRun.page)).screen === 'splash');
  checkSessionClean(reporter, hubRun, 'hub session');
  await hubRun.close();

  const run = await session(browser, { width: 1180, height: 820 });
  const p = run.page;
  let state = await debug.getState(p);
  check('boots to splash', state.screen === 'splash', JSON.stringify(state));
  await checkTargets(p, 'splash');
  await shot(p, '01-splash-landscape');
  check('two play modes are registered', (await debug.listModes(p)).length === 2);
  check('audio manifest matches configured voice lines', await p.evaluate(async () => {
    const [config, manifest] = await Promise.all([
      fetch('./config.json').then((r) => r.json()), fetch('./assets/audio/manifest.json').then((r) => r.json()),
    ]);
    return Object.keys(config.voice).every((key) => Object.hasOwn(manifest, key));
  }));
  check('audio clips decode in Chrome', await p.evaluate(async () => {
    const manifest = await fetch('./assets/audio/manifest.json').then((r) => r.json());
    const context = new AudioContext();
    const results = await Promise.all(Object.values(manifest).map(async (entry) => {
      try {
        const response = await fetch(`./assets/audio/${entry.file}`);
        if (!response.ok) return false;
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        return Number.isFinite(buffer.duration) && buffer.duration > .2;
      } catch { return false; }
    }));
    await context.close();
    return results.length === Object.keys(manifest).length && results.every(Boolean);
  }));

  await debug.startMode(p, 'growing');
  await debug.waitForScreen(p, 'timeline');
  await shot(p, '02-timeline-ready');
  await checkTargets(p, 'timeline');
  state = await debug.getState(p);
  const first = state.cardOrder[0];
  const wrong = ['baby', 'toddler', 'now'].find((id) => id !== first);
  await debug.call(p, 'placeMemory', first, wrong);
  state = await debug.getState(p);
  check('wrong timeline placement is rejected', state.mistakes === 1 && Object.keys(state.placements).length === 0);
  await shot(p, '03-timeline-wrong-placement');
  for (const id of ['baby', 'toddler', 'now']) await debug.call(p, 'placeMemory', id, id);
  await debug.waitForScreen(p, 'timeline-win');
  check('timeline completes', (await debug.getState(p)).timelineComplete === true);
  await shot(p, '04-timeline-success');

  await debug.call(p, 'startMode', 'family-map');
  await debug.waitForScreen(p, 'map');
  await shot(p, '05-family-map-globe');
  await checkTargets(p, 'map');
  const storyTypes = ['food', 'place', 'celebration'];
  for (let index = 0; index < storyTypes.length; index += 1) {
    await debug.call(p, 'alignGlobe');
    await debug.waitForScreen(p, 'story-choice');
    check(`globe alignment ${index + 1} lands on a star`, (await debug.getState(p)).aligned === true);
    if (index === 0) {
      await checkTargets(p, 'story choice');
      await shot(p, '06-story-choice');
    }
    await debug.call(p, 'chooseStory', storyTypes[index]);
    await debug.waitForScreen(p, index === storyTypes.length - 1 ? 'book' : 'map');
  }
  check('three family stories complete the book', (await debug.getState(p)).discoveries.length === 3);
  await shot(p, '07-book');
  await checkTargets(p, 'book');
  await debug.call(p, 'addFakePhoto');
  check('fake local photo stays on device', (await debug.getState(p)).hasPhoto === true);
  await debug.call(p, 'removePhoto');
  check('local photo can be removed', (await debug.getState(p)).hasPhoto === false);
  await debug.call(p, 'openBook');
  await p.reload({ waitUntil: 'networkidle' });
  await debug.waitForHook(p);
  await debug.waitForReady(p);
  check('progress persists after reload', (await debug.getState(p)).timelineComplete === true);
  await debug.startMode(p, 'family-map');
  await debug.waitForScreen(p, 'map');
  await debug.call(p, 'alignGlobe');
  await debug.waitForScreen(p, 'story-choice');
  await debug.call(p, 'chooseStory', 'food');
  await debug.waitForScreen(p, 'map');
  state = await debug.getState(p);
  const persistedAfterReplay = await p.evaluate(() => JSON.parse(localStorage.getItem('qlobe-family-timeline-progress-v1') || '{}'));
  check('replaying the map preserves earned book stamps', state.discoveries.length === 3
    && state.replayDiscoveries.length === 1
    && persistedAfterReplay.discoveries?.length === 3);
  await debug.call(p, 'openBook');
  check('earned stamps remain visible during replay', await p.locator('.book-stamp').count() === 3);
  checkSessionClean(reporter, run, 'landscape session');
  await run.close();

  const portrait = await session(browser, { width: 768, height: 1024 }, { reducedMotion: 'reduce' });
  check('portrait has no horizontal overflow', await portrait.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await shot(portrait.page, '08-portrait-reduced-motion');
  await checkTargets(portrait.page, 'portrait');
  checkSessionClean(reporter, portrait, 'portrait session');
  await portrait.close();

  const compact = await session(browser, { width: 844, height: 390 });
  check('compact landscape has no overflow', await compact.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth && document.documentElement.scrollHeight <= document.documentElement.clientHeight));
  await shot(compact.page, '09-compact-landscape');
  checkSessionClean(reporter, compact, 'compact session');
  await compact.close();

  const fallback = await session(browser, { width: 1180, height: 820 }, {
    waitUntil: 'load',
    initScript: () => {
      try { Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined }); } catch { /* test continues */ }
      try {
        localStorage.setItem('qlobe-family-timeline-progress-v1', JSON.stringify({
          version: 1,
          timelineComplete: false,
          discoveries: [{ starId: 'not-a-place', type: 'not-a-story' }],
          destinationIds: ['not-a-place'],
        }));
      } catch { /* test continues */ }
    },
  });
  state = await debug.getState(fallback.page);
  check('corrupt saved discoveries are discarded', state.discoveries.length === 0
    && state.destinationIds.length === 0 && state.mapComplete === false);
  await debug.call(fallback.page, 'openBook');
  await debug.call(fallback.page, 'addFakePhoto');
  state = await debug.getState(fallback.page);
  check('session-only photo fallback is disclosed', state.hasPhoto && !state.photoPersistent
    && await fallback.page.locator('.privacy-note').textContent() === 'This photo lasts only until this page closes.');
  checkSessionClean(reporter, fallback, 'fallback session');
  await fallback.close();
  await browser.close();
  finish({ prefix: '\nFamily Timeline QA: ', exit: true, suffix: `; shots in ${shots}` });
}

main().catch((error) => { console.error(error); process.exit(1); });
