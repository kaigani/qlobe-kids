#!/usr/bin/env node
// Real-Chrome smoke test and visual-QC capture for Teen Bead Builder.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const base = (process.env.QLOBE_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');
const shots = path.resolve(process.env.QLOBE_SHOTS || 'qa-shots/teen-bead-builder');
const require = createRequire('/private/tmp/pw/node_modules/noop.js');
const { chromium } = require('playwright');
const checks = [];
const sessions = [];

function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  checks.push({ name, ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function openGame(browser, viewport, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport, reducedMotion, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  const failed = [];
  const remote = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('request', (request) => {
    if (!request.url().startsWith(base) && !request.url().startsWith('data:')) remote.push(request.url());
  });
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText || '';
    if (reason === 'net::ERR_ABORTED' && request.url().endsWith('.m4a')) return;
    failed.push(`${request.url()} ${reason}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(`${base}/games/teen-bead-builder/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  await page.evaluate(() => window.QLOBE_DEBUG.seed(42));
  sessions.push({ context, errors, failed, remote });
  return page;
}

async function drag(page, from, to) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

async function main() {
  await mkdir(shots, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  const hubContext = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const hubPage = await hubContext.newPage();
  await hubPage.goto(`${base}/#math-number-sense`, { waitUntil: 'networkidle' });
  const hubTile = hubPage.locator('a.tile[aria-label*="Teen Bead Builder"]');
  check('hub lists Teen Bead Builder once', await hubTile.count() === 1);
  check('hub uses the curated Krea bead tile',
    (await hubTile.locator('img').getAttribute('src')) === 'assets/hub/tiles/teen-bead-builder.jpg');
  await hubPage.screenshot({ path: path.join(shots, '00-hub.png') });
  await hubContext.close();

  const page = await openGame(browser, { width: 1180, height: 820 });
  check('splash boots', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'splash');
  check('two focused modes are registered',
    (await page.evaluate(() => window.QLOBE_DEBUG.listModes())).map((mode) => mode.id).join(',') === 'build,match');
  check('graphic title has the exact accessible name',
    (await page.locator('.title-lockup').getAttribute('alt')) === 'Teen Bead Builder');
  const missingArtPreloads = await page.evaluate(() => {
    const expected = [
      'bead-gold.webp', 'bead-coral.webp', 'bead-teal.webp',
      'bead-green.webp', 'bead-blue.webp', 'bead-cream.webp',
      'rack-cord.webp', 'tray.webp',
      'card-orange.webp', 'card-teal.webp', 'card-blue.webp',
    ];
    const declared = [...document.querySelectorAll('link[rel="preload"][as="image"]')]
      .map((link) => link.href.split('/').pop());
    return expected.filter((file) => !declared.includes(file));
  });
  check('every foreground clay sprite is preloaded before play',
    missingArtPreloads.length === 0, missingArtPreloads.join(', '));
  const cardSizes = await page.locator('.mode-card').evaluateAll((nodes) =>
    nodes.map((node) => ({ w: node.getBoundingClientRect().width, h: node.getBoundingClientRect().height })));
  check('splash mode cards meet the 96px target',
    cardSizes.every(({ w, h }) => w >= 96 && h >= 96), JSON.stringify(cardSizes));
  const splashTargets = await page.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check('every splash target meets the 96px minimum',
    splashTargets.every(({ rect }) => rect?.w >= 96 && rect?.h >= 96),
    JSON.stringify(splashTargets));

  const missingClips = await page.evaluate(async () => {
    let manifest = {};
    try {
      const response = await fetch('./assets/audio/manifest.json');
      if (response.ok) manifest = await response.json();
    } catch { /* coverage check below reports every missing key */ }
    const gameConfig = (await import('./config.js')).default;
    const expected = [
      ...Object.keys(gameConfig.voice),
      ...Array.from({ length: 9 }, (_, index) => `number-${index + 11}`),
      ...Array.from({ length: 9 }, (_, index) => `success-${index + 11}`),
    ];
    return expected.filter((key) => !manifest[key]);
  });
  check('every spoken line has a recorded teacher clip', missingClips.length === 0, missingClips.join(', '));
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  await page.evaluate(async () => {
    const clips = await import('../../../shared/js/voice-clips.js');
    window.__teenVoice = [];
    clips.onClip((key) => window.__teenVoice.push(key));
  });
  await page.locator('[data-mode="build"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'bundle');
  await page.waitForFunction(() => window.__teenVoice.includes('buildIntro'));
  check('first child gesture unlocks the recorded teacher voice',
    await page.evaluate(() => window.__teenVoice.includes('buildIntro')),
    await page.evaluate(() => window.__teenVoice.join(', ')));

  const initialTargets = await page.evaluate(() => window.QLOBE_DEBUG.getTargets());
  const source = initialTargets.find(({ id }) => id === 'bead-source');
  check('bead source is a 96px touch target',
    source?.rect?.w >= 96 && source?.rect?.h >= 96, JSON.stringify(source));
  const bundleMaterials = await page.evaluate(() => ({
    bead: getComputedStyle(document.querySelector('.bead-source .bead')).backgroundImage,
    tray: getComputedStyle(document.querySelector('.place-tray')).backgroundImage,
  }));
  check('primary build objects use authored clay sprites',
    bundleMaterials.bead.includes('bead-gold.webp')
      && bundleMaterials.tray.includes('tray.webp'),
    JSON.stringify(bundleMaterials));
  await page.screenshot({ path: path.join(shots, '02-bundle-empty.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(.2));
  await drag(page, page.locator('[data-bead-source]'), page.locator('[data-drop-zone]'));
  check('real drag places the first bead',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().placed)) === 1);
  for (let index = 1; index < 9; index += 1) {
    await page.evaluate(() => window.QLOBE_DEBUG.tap('bead-source'));
  }
  check('tap fallback fills the same ten-frame',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().placed)) === 9);
  await page.screenshot({ path: path.join(shots, '03-bundle-nine.png') });

  const sourceBox = await page.locator('[data-bead-source]').boundingBox();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(1080, 90, { steps: 8 });
  await page.mouse.up();
  check('off-tray drag returns without changing the quantity',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().placed)) === 9);

  await page.evaluate(() => window.QLOBE_DEBUG.tap('bead-source'));
  await page.waitForTimeout(100);
  check('the tenth bead enters the visible bundling transition',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().transition)) === true);
  await page.screenshot({ path: path.join(shots, '04-bundling-ten.png') });
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().tutorialDone
    && window.QLOBE_DEBUG.getState().screen === 'play');
  check('the bundle resolves to one visible tied ten bar',
    await page.locator('.place-tray .bundle-result').count() === 1);
  const rackMaterials = await page.locator('.place-tray .bundle-result').evaluate((rack) => ({
    beadCount: rack.querySelectorAll('.bar-bead').length,
    rack: getComputedStyle(rack).backgroundImage,
    beads: [...rack.querySelectorAll('.bar-bead')]
      .map((bead) => getComputedStyle(bead).backgroundImage),
  }));
  check('the authored rack composes exactly ten authored bead sprites',
    rackMaterials.beadCount === 10
      && rackMaterials.rack.includes('rack-cord.webp')
      && rackMaterials.beads.every((image) => image.includes('bead-gold.webp')),
    JSON.stringify(rackMaterials));
  await page.screenshot({ path: path.join(shots, '04b-one-ten-bar.png') });
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'celebration');
  check('ten loose ones become the ten celebration', true);
  await page.screenshot({ path: path.join(shots, '05-ten-made.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.tap('next'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'build');
  const buildState = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('teen build starts with a target from 11 to 19',
    buildState.target >= 11 && buildState.target <= 19, JSON.stringify(buildState));
  await page.screenshot({ path: path.join(shots, '06-build-teen.png') });
  await page.evaluate(() => window.QLOBE_DEBUG.winRound());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'celebration');
  const buildEquation = await page.locator('.celebrate-equation').textContent();
  check('build success shows a complete ten-plus-ones equation',
    buildEquation.includes('='), buildEquation);
  await page.screenshot({ path: path.join(shots, '07-build-success.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.home());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'splash');
  check('debug Home returns to the game splash', true);
  await page.evaluate(() => {
    window.QLOBE_DEBUG.mute();
    return window.QLOBE_DEBUG.startMode('match');
  });
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'match');
  const matchTargets = await page.evaluate(() => window.QLOBE_DEBUG.getTargets());
  const matchMaterials = await page.evaluate(() => ({
    tray: getComputedStyle(document.querySelector('.model-card')).backgroundImage,
    cards: [...document.querySelectorAll('.number-choice')]
      .map((card) => getComputedStyle(card).backgroundImage),
  }));
  check('detective tray and choices use authored clay sprites',
    matchMaterials.tray.includes('tray.webp')
      && matchMaterials.cards.every((image) => image.includes('card-')),
    JSON.stringify(matchMaterials));
  const wrong = matchTargets.find(({ role }) => role === 'wrong');
  const correct = matchTargets.find(({ role }) => role === 'correct');
  check('detective exposes one correct and two nearby alternatives',
    matchTargets.filter(({ id }) => id.startsWith('choice-')).length === 3 && wrong && correct,
    JSON.stringify(matchTargets));
  await page.evaluate((id) => window.QLOBE_DEBUG.tap(id), wrong.id);
  check('wrong numeral keeps the same round active',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'play');
  await page.screenshot({ path: path.join(shots, '08-match-wrong.png') });
  await page.evaluate((id) => window.QLOBE_DEBUG.tap(id), correct.id);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'celebration');
  check('correct numeral reaches the equation payoff', true);
  await page.screenshot({ path: path.join(shots, '09-match-success.png') });

  for (let round = 1; round < 5; round += 1) {
    await page.evaluate(() => window.QLOBE_DEBUG.tap('next'));
    await page.waitForFunction(() => ['play', 'end'].includes(window.QLOBE_DEBUG.getState().screen));
    if ((await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'end') break;
    await page.evaluate(() => window.QLOBE_DEBUG.winRound());
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'celebration');
  }
  if ((await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'celebration') {
    await page.evaluate(() => window.QLOBE_DEBUG.tap('next'));
  }
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end');
  check('complete Detective session reaches the gentle end screen', true);
  await page.screenshot({ path: path.join(shots, '10-end.png') });

  const portrait = await openGame(browser, { width: 820, height: 1180 });
  await portrait.screenshot({ path: path.join(shots, '11-splash-portrait.png') });
  await portrait.evaluate(() => {
    window.QLOBE_DEBUG.mute();
    window.QLOBE_DEBUG.fastTimers(.03);
    return window.QLOBE_DEBUG.startMode('build');
  });
  await portrait.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'bundle');
  await portrait.screenshot({ path: path.join(shots, '12-bundle-portrait.png') });
  const portraitTargets = await portrait.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check('portrait keeps every active target onscreen',
    portraitTargets.filter(({ rect }) => rect).every(({ rect }) => rect.x >= -1 && rect.y >= -1
      && rect.x + rect.w <= 821 && rect.y + rect.h <= 1181),
    JSON.stringify(portraitTargets));

  const compact = await openGame(browser, { width: 1180, height: 620 }, 'reduce');
  await compact.evaluate(() => {
    window.QLOBE_DEBUG.mute();
    window.QLOBE_DEBUG.fastTimers(.03);
    return window.QLOBE_DEBUG.startMode('match');
  });
  await compact.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'match');
  await compact.screenshot({ path: path.join(shots, '13-match-compact-reduced.png') });
  const compactTargets = await compact.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check('compact reduced-motion numeral cards stay at least 96px',
    compactTargets.filter(({ id }) => id.startsWith('choice-'))
      .every(({ rect }) => rect?.w >= 96 && rect?.h >= 96),
    JSON.stringify(compactTargets));

  for (const session of sessions) {
    check('session has no page or console errors', session.errors.length === 0, session.errors.join(' | '));
    check('session has no failed requests or 4xx responses', session.failed.length === 0, session.failed.join(' | '));
    check('session makes no runtime model or third-party requests', session.remote.length === 0, session.remote.join(' | '));
    await session.context.close();
  }
  const failed = checks.filter((item) => !item.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
