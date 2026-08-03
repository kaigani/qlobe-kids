#!/usr/bin/env node
// Real-Chrome smoke, interaction, responsive, persistence, and visual-QC gate.
//
//   node games/globe-spin-stories/tools/qa.mjs
//   node games/globe-spin-stories/tools/qa.mjs --base https://qlo.be

import { readFile, stat, access } from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  baseUrl, launchChrome, createReporter, openSession,
  resolveShots, ensureShots,
} from '../../../tools/qa/lib/driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..');
const base = baseUrl();
const shots = resolveShots('/private/tmp/qlobe-globe-spin-stories-shots');
const { check, finish, head } = createReporter({ collapse: true, detailLimit: 300 });
const sessions = [];
const boundedClose = (promise, ms = 5000) => Promise.race([
  promise.catch(() => {}),
  new Promise((resolve) => setTimeout(resolve, ms)),
]);

const readJSON = async (...parts) => JSON.parse(await readFile(path.join(GAME, ...parts), 'utf8'));
const exists = async (...parts) => { try { await access(path.join(GAME, ...parts), FS.F_OK); return true; } catch { return false; } };
const size = async (...parts) => (await stat(path.join(GAME, ...parts))).size;

async function staticGate() {
  head('static gate');
  const config = await readJSON('config.json');
  const lines = await readJSON('data', 'lines.json');
  check('custom globe config parses', config.id === 'globe-spin-stories' && config.engine === 'custom-paper-globe');
  check('one focused mode is registered', config.modes.length === 1 && config.modes[0].id === 'world-tour');
  check('five unique destinations have plausible coordinates',
    config.destinations.length === 5
      && new Set(config.destinations.map((item) => item.id)).size === 5
      && config.destinations.every((item) => Math.abs(item.lat) <= 60 && Math.abs(item.lon) <= 180));
  check('each destination has exactly three unique discoveries',
    config.destinations.every((item) => item.discoveries.length === 3
      && new Set(item.discoveries.map((entry) => entry.id)).size === 3));
  const missingLines = config.destinations.flatMap((item) => [item.prompt, item.landing, item.stamp, ...item.discoveries.map((entry) => entry.line)])
    .concat(['welcome', 'drag-help', 'closer', 'landed', 'passport-open', 'page-complete', 'all-complete', 'replay'])
    .filter((key) => !lines[key]);
  check('every configured spoken key has exact fallback copy', missingLines.length === 0, missingLines.join(', '));
  const missingAssets = [];
  for (const destination of config.destinations) {
    const rel = destination.scene.replace(/^\.\//, '');
    if (!(await exists(...rel.split('/')))) missingAssets.push(rel);
  }
  for (const rel of ['assets/title.webp', 'assets/map/natural-earth-110m.json', 'assets/audio/manifest.json']) {
    if (!(await exists(...rel.split('/')))) missingAssets.push(rel);
  }
  check('all runtime art, geometry, and manifest assets exist', missingAssets.length === 0, missingAssets.join(', '));
  const sceneSizes = await Promise.all(config.destinations.map((item) => size(...item.scene.replace(/^\.\//, '').split('/'))));
  check('all five 1600x1200 story plates meet the 300KB default budget', sceneSizes.every((bytes) => bytes <= 300 * 1024), sceneSizes.join(', '));
  check('generated title meets the 150KB lockup budget', (await size('assets', 'title.webp')) <= 150 * 1024);
  const audioManifest = await readJSON('assets', 'audio', 'manifest.json');
  check('release does not silently ship an unapproved teacher-voice clone', Object.keys(audioManifest).length === 0);
  const geometry = await readJSON('assets', 'map', 'natural-earth-110m.json');
  check('Natural Earth geometry is compact and non-trivial', geometry.license === 'public-domain' && geometry.rings.length > 100 && geometry.rings.length < 200);
  const runtime = await Promise.all(['index.html', 'js/main.js', 'css/style.css'].map((file) => readFile(path.join(GAME, file), 'utf8')));
  check('runtime has no emoji placeholder refs or remote media calls',
    !runtime.some((text) => text.includes('emoji:') || /(?:src|href)=["']https?:/.test(text)));
}

async function openGame(browser, viewport, reducedMotion = 'no-preference') {
  const session = await openSession(browser, {
    url: `${base}/games/globe-spin-stories/`, base, viewport, reducedMotion,
    ready: false, allowDataUrls: true,
  });
  sessions.push(session);
  await session.page.waitForFunction(() => window.QLOBE_DEBUG?.ready, null, { timeout: 10000 });
  await session.page.evaluate(async () => {
    await window.QLOBE_DEBUG.ready;
    window.QLOBE_DEBUG.seed(42);
    window.QLOBE_DEBUG.mute(true);
  });
  return session;
}

async function browserGate(browser) {
  head('real Chrome interaction gate');
  const landscape = await openGame(browser, { width: 1024, height: 768 });
  const page = landscape.page;
  check('splash boots', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'splash');
  check('graphic title is accessible and exactly spelled', await page.locator('.title-lockup').getAttribute('alt') === 'Globe Spin Stories');
  check('catalog home exists only on splash', await page.locator('[data-target="home-catalog"]').count() === 1);
  const splashTargets = await page.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check('every splash target is at least 96px', splashTargets.every(({ rect }) => rect.w >= 96 && rect.h >= 96), JSON.stringify(splashTargets));
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.startMode('world-tour'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'globe');
  check('home link is removed below splash', await page.locator('[data-target="home-catalog"]').count() === 0);
  const initial = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  const globeBox = await page.locator('#globe-mount canvas').boundingBox();
  await page.mouse.move(globeBox.x + globeBox.width * .55, globeBox.y + globeBox.height * .5);
  await page.mouse.down();
  await page.mouse.move(globeBox.x + globeBox.width * .32, globeBox.y + globeBox.height * .56, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  const dragged = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('real pointer drag rotates and releases the globe', !dragged.globe.dragging && Math.abs(dragged.globe.lon - initial.globe.lon) > 4, JSON.stringify({ before: initial.globe, after: dragged.globe }));
  await page.evaluate(() => window.QLOBE_DEBUG.alignDestination());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().aligned);
  const alignedTargets = await page.evaluate(() => window.QLOBE_DEBUG.getTargets());
  const pin = alignedTargets.find(({ id }) => id.startsWith('pin-'));
  check('aligned destination pin is a large accessible target', pin?.rect?.w >= 96 && pin?.rect?.h >= 96, JSON.stringify(pin));
  await page.screenshot({ path: path.join(shots, '02-globe-aligned.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.land());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'story');
  check('landing opens an authored 1600x1200 story plate',
    await page.locator('#story-scene').evaluate((img) => img.naturalWidth === 1600 && img.naturalHeight === 1200));
  const storyTargets = await page.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check('all visible story targets meet the 96px minimum', storyTargets.every(({ rect }) => rect.w >= 96 && rect.h >= 96), JSON.stringify(storyTargets));
  check('stamp stays gated before all three discoveries', await page.locator('#stamp-button').isDisabled());
  await page.screenshot({ path: path.join(shots, '03-story-asia.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(20));
  for (let stop = 0; stop < 5; stop += 1) {
    const before = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    if (before.screen === 'globe') {
      await page.evaluate(() => window.QLOBE_DEBUG.land());
      await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'story');
      const destination = await page.evaluate(() => window.QLOBE_DEBUG.getState().destinationId);
      await page.screenshot({ path: path.join(shots, `03-story-${destination}.png`) });
    }
    for (const kind of ['animal', 'habitat', 'wonder']) await page.evaluate((id) => window.QLOBE_DEBUG.discover(id), kind);
    await page.waitForFunction(() => !document.querySelector('#stamp-button').disabled);
    await page.evaluate(() => window.QLOBE_DEBUG.stamp());
    if (stop < 4) {
      await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'globe');
      await page.evaluate(() => window.QLOBE_DEBUG.alignDestination());
      await page.waitForFunction(() => window.QLOBE_DEBUG.getState().aligned);
    }
  }
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end');
  const endState = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('all five destination loops reach the end', endState.tourVisited.length === 5 && endState.visited.length === 5, JSON.stringify(endState));
  await page.screenshot({ path: path.join(shots, '04-end-landscape.png') });
  await page.locator('#end-passport-button').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().passportOpen);
  await page.screenshot({ path: path.join(shots, '04a-passport-complete.png') });
  await page.locator('#passport-close').click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.QLOBE_DEBUG?.getState);
  check('passport stamps persist across reload', (await page.evaluate(() => window.QLOBE_DEBUG.getState().visited.length)) === 5);
  check('landscape run has no errors, 404s, or remote runtime requests',
    landscape.errors.length === 0 && landscape.failed.length === 0 && landscape.remote.length === 0,
    JSON.stringify({ errors: landscape.errors, failed: landscape.failed, remote: landscape.remote }));

  head('portrait + reduced-motion gate');
  const portrait = await openGame(browser, { width: 768, height: 1024 }, 'reduce');
  const pp = portrait.page;
  await pp.evaluate(() => window.QLOBE_DEBUG.startMode('world-tour'));
  await pp.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'globe');
  await pp.evaluate(() => window.QLOBE_DEBUG.alignDestination());
  await pp.waitForFunction(() => window.QLOBE_DEBUG.getState().aligned);
  const portraitTargets = await pp.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check('portrait globe targets remain at least 96px', portraitTargets.every(({ rect }) => rect.w >= 96 && rect.h >= 96), JSON.stringify(portraitTargets));
  check('reduced-motion preference reaches the globe state', (await pp.evaluate(() => window.QLOBE_DEBUG.getState().reducedMotion)) === true);
  await pp.screenshot({ path: path.join(shots, '05-globe-portrait-reduced.png') });
  await pp.evaluate(() => window.QLOBE_DEBUG.land());
  await pp.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'story');
  await pp.screenshot({ path: path.join(shots, '06-story-portrait.png') });
  check('portrait run has no errors, 404s, or remote runtime requests',
    portrait.errors.length === 0 && portrait.failed.length === 0 && portrait.remote.length === 0,
    JSON.stringify({ errors: portrait.errors, failed: portrait.failed, remote: portrait.remote }));
}

await ensureShots(shots);
await staticGate();
const browser = await launchChrome();
try {
  await browserGate(browser);
} finally {
  // Chrome occasionally stalls while tearing down a WebGL context on macOS.
  // The assertions and screenshots are already complete; keep cleanup bounded
  // so a passing production smoke cannot hang its CI job indefinitely.
  for (const session of sessions) await boundedClose(session.close());
  await boundedClose(browser.close());
}
finish({ suffix: `; screenshots in ${shots}` });
