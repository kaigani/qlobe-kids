#!/usr/bin/env node
// Real-Chrome smoke and visual-QC driver for Laundry Sorter.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const base = flag('base', 'http://127.0.0.1:8000').replace(/\/$/, '');
const shots = path.resolve(flag('shots', 'qa-shots/laundry-sorter'));
const require = createRequire(path.join(flag('playwright', '/private/tmp/pw/node_modules'), 'noop.js'));
const { chromium } = require('playwright');
const results = [];
const sessions = [];

function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  results.push({ name, ok, detail });
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
    if (!request.url().startsWith(base)) remote.push(request.url());
  });
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText || '';
    // Switching a spoken line intentionally aborts the previous media request.
    if (reason === 'net::ERR_ABORTED' && request.url().endsWith('.m4a')) return;
    failed.push(`${request.url()} ${reason}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(`${base}/games/laundry-sorter/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  await page.evaluate(() => {
    window.QLOBE_DEBUG.seed(42);
    window.QLOBE_DEBUG.setFastTimers(true);
  });
  sessions.push({ context, errors, failed, remote });
  return page;
}

async function main() {
  await mkdir(shots, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  const hubContext = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const hubPage = await hubContext.newPage();
  await hubPage.goto(`${base}/#practical-life`, { waitUntil: 'networkidle' });
  const hubTile = hubPage.locator('a.tile[aria-label*="Laundry Sorter"]');
  check('hub lists the playable Laundry Sorter tile', await hubTile.count() === 1);
  check('hub tile uses the curated production image',
    (await hubTile.locator('img').getAttribute('src')) === 'assets/hub/tiles/laundry-sorter.jpg');
  await Promise.all([
    hubPage.waitForURL('**/games/laundry-sorter/'),
    hubTile.click(),
  ]);
  await hubPage.evaluate(() => window.QLOBE_DEBUG.ready);
  check('hub launches the game route', hubPage.url().endsWith('/games/laundry-sorter/'));
  await hubContext.close();

  const page = await openGame(browser, { width: 1180, height: 820 });
  check('splash boots', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'splash');
  check('three distinct chores are registered',
    (await page.evaluate(() => window.QLOBE_DEBUG.listModes())).map((item) => item.id).join(',') === 'sort,fold,pairs');
  check('broader chore labels are visible',
    (await page.locator('.mode-title').allTextContents()).join('|') === 'Sort It|Fold It|Find the Pairs');
  const modeSizes = await page.locator('.mode-card').evaluateAll((nodes) =>
    nodes.map((node) => ({ w: node.getBoundingClientRect().width, h: node.getBoundingClientRect().height })));
  check('splash mode targets meet 96px minimum',
    modeSizes.every(({ w, h }) => w >= 96 && h >= 96), JSON.stringify(modeSizes));
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  await page.evaluate(async () => {
    const clips = await import('../../../shared/js/voice-clips.js');
    window.__laundryVoice = [];
    clips.onClip((key) => window.__laundryVoice.push(key));
  });
  await page.locator('[data-mode="sort"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput);
  await page.waitForFunction(() => window.__laundryVoice.includes('sort-prompt'));
  check('first child gesture plays recorded teacher voice',
    await page.evaluate(() => window.__laundryVoice.includes('sort-prompt')),
    await page.evaluate(() => window.__laundryVoice.join(', ')));
  await page.evaluate(() => window.QLOBE_DEBUG.mute());
  const sortTargets = await page.evaluate(() => window.QLOBE_DEBUG.getTargets());
  const firstSortDeal = await page.locator('.sock-piece').evaluateAll((nodes) =>
    nodes.map((node) => node.dataset.item).sort().join('|'));
  const firstSortColors = await page.locator('.basket').evaluateAll((nodes) =>
    nodes.map((node) => node.dataset.bin).sort().join('|'));
  check('sort exposes six clothing targets and two baskets',
    sortTargets.filter((item) => item.id.startsWith('sock-')).length === 6
      && sortTargets.filter((item) => item.id.startsWith('bin-')).length === 2);
  check('all sorting targets meet 96px minimum',
    sortTargets.every(({ rect }) => rect.w >= 96 && rect.h >= 96));
  await page.evaluate(() => window.QLOBE_DEBUG.wrong());
  check('gentle wrong sort does not advance progress',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().progress)) === 0);

  const firstSock = page.locator('.sock-piece:not(.is-sorted)').first();
  const color = await firstSock.getAttribute('data-color');
  const from = await firstSock.boundingBox();
  const to = await page.locator(`[data-bin="${color}"]`).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  const mid = {
    x: (from.x + from.width / 2 + to.x + to.width / 2) / 2,
    y: (from.y + from.height / 2 + to.y + to.height / 2) / 2,
  };
  await page.mouse.move(mid.x, mid.y, { steps: 5 });
  const ghost = await page.locator('.drag-ghost').boundingBox();
  check('dragged clothing tracks under the pointer before drop',
    ghost && Math.abs(ghost.x + ghost.width / 2 - mid.x) < 90
      && Math.abs(ghost.y + ghost.height / 2 - mid.y) < 90,
    JSON.stringify({ ghost, mid }));
  await page.screenshot({ path: path.join(shots, '02a-sort-dragging.png') });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().progress === 1);
  check('real pointer drag sorts through the same path', true);
  await page.screenshot({ path: path.join(shots, '02-sort-play.png') });
  await page.evaluate(() => window.QLOBE_DEBUG.winRound());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end');
  check('sort completes to its celebration', true);
  await page.screenshot({ path: path.join(shots, '03-sort-celebration.png') });
  await page.evaluate(() => window.QLOBE_DEBUG.tap('again'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'play');
  const replaySortDeal = await page.locator('.sock-piece').evaluateAll((nodes) =>
    nodes.map((node) => node.dataset.item).sort().join('|'));
  const replaySortColors = await page.locator('.basket').evaluateAll((nodes) =>
    nodes.map((node) => node.dataset.bin).sort().join('|'));
  check('Sort It replay deals a different garment mix', replaySortDeal !== firstSortDeal,
    JSON.stringify({ firstSortDeal, replaySortDeal }));
  check('Sort It replay changes the active color pair', replaySortColors !== firstSortColors,
    JSON.stringify({ firstSortColors, replaySortColors }));
  await page.screenshot({ path: path.join(shots, '03a-sort-replay-colors.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.tap('back'));
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('fold'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput);
  await page.evaluate(() => window.QLOBE_DEBUG.wrong());
  check('gentle wrong fold keeps the first step',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().foldStep)) === 0);
  const shirt = await page.locator('.fold-zone').boundingBox();
  const initialArt = await page.locator('.fold-image').getAttribute('src');
  await page.mouse.move(shirt.x + shirt.width * .25, shirt.y + shirt.height / 2);
  await page.mouse.down();
  await page.mouse.move(shirt.x + shirt.width * .78, shirt.y + shirt.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().foldStep === 1);
  check('first shirt fold swaps to a genuinely folded intermediate',
    (await page.locator('.fold-image').getAttribute('src')) !== initialArt);
  await page.screenshot({ path: path.join(shots, '04-fold-second-step.png') });
  const shirt2 = await page.locator('.fold-zone').boundingBox();
  await page.mouse.move(shirt2.x + shirt2.width * .78, shirt2.y + shirt2.height / 2);
  await page.mouse.down();
  await page.mouse.move(shirt2.x + shirt2.width * .22, shirt2.y + shirt2.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().foldStep === 2);
  await page.screenshot({ path: path.join(shots, '04b-fold-third-step.png') });
  const shirt3 = await page.locator('.fold-zone').boundingBox();
  await page.mouse.move(shirt3.x + shirt3.width / 2, shirt3.y + shirt3.height * .78);
  await page.mouse.down();
  await page.mouse.move(shirt3.x + shirt3.width / 2, shirt3.y + shirt3.height * .22, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().progress === 1);
  check('three real directional swipes fold one shirt', true);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().foldIndex === 1);
  check('pants become the second folding item',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().foldIndex)) === 1);
  await page.screenshot({ path: path.join(shots, '04c-pants-flat.png') });
  await page.evaluate(() => window.QLOBE_DEBUG.tap('fold-zone'));
  await page.screenshot({ path: path.join(shots, '04d-pants-folded-once.png') });
  await page.evaluate(() => window.QLOBE_DEBUG.tap('fold-zone'));
  await page.evaluate(() => window.QLOBE_DEBUG.tap('fold-zone'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().progress === 2);
  check('pants use three staged folds before the towel', true);
  await page.screenshot({ path: path.join(shots, '04e-towel-flat.png') });
  await page.evaluate(() => window.QLOBE_DEBUG.tap('fold-zone'));
  await page.screenshot({ path: path.join(shots, '04f-towel-folded-once.png') });
  check('towel first fold is a layered half-fold',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().foldStep)) === 1);
  await page.evaluate(() => window.QLOBE_DEBUG.winRound());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end');
  check('fold completes a shirt, pants, and towel', true);

  await page.evaluate(() => window.QLOBE_DEBUG.tap('back'));
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('pairs'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput);
  await page.evaluate(() => window.QLOBE_DEBUG.wrong());
  check('different socks stay available after a gentle mismatch',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().progress)) === 0);
  await page.screenshot({ path: path.join(shots, '05-pairs-play.png') });
  await page.evaluate(() => window.QLOBE_DEBUG.winRound());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end');
  check('pairs completes to its celebration', true);
  await page.screenshot({ path: path.join(shots, '06-pairs-celebration.png') });

  const portrait = await openGame(browser, { width: 820, height: 1180 });
  await portrait.screenshot({ path: path.join(shots, '07-splash-portrait.png') });
  const portraitCards = await portrait.locator('.mode-card').evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().toJSON()));
  check('portrait splash cards stay on screen',
    portraitCards.every((rect) => rect.left >= 0 && rect.right <= 820 && rect.bottom <= 1180));
  await portrait.evaluate(() => window.QLOBE_DEBUG.startMode('fold'));
  await portrait.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput);
  const portraitFold = await portrait.locator('.fold-zone').boundingBox();
  check('portrait fold target remains large and visible',
    portraitFold && portraitFold.width >= 300 && portraitFold.height >= 220
      && portraitFold.y >= 0 && portraitFold.y + portraitFold.height <= 1180,
    JSON.stringify(portraitFold));
  await portrait.screenshot({ path: path.join(shots, '08-fold-portrait.png') });

  const short = await openGame(browser, { width: 1180, height: 520 });
  await short.evaluate(() => window.QLOBE_DEBUG.startMode('pairs'));
  await short.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput);
  const shortTargets = await short.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check('short landscape pair targets remain visible',
    shortTargets.length === 6 && shortTargets.every(({ rect }) =>
      rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= 1180 && rect.y + rect.h <= 520));
  await short.screenshot({ path: path.join(shots, '09-pairs-short-landscape.png') });

  const reduced = await openGame(browser, { width: 1024, height: 768 }, 'reduce');
  await reduced.evaluate(() => window.QLOBE_DEBUG.startMode('sort'));
  await reduced.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput);
  await reduced.evaluate(() => window.QLOBE_DEBUG.winRound());
  await reduced.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end');
  check('reduced-motion mode completes without animation dependence', true);

  for (const session of sessions) {
    check('session has no page errors', session.errors.length === 0, session.errors.join(' | '));
    check('session has no failed requests or HTTP errors', session.failed.length === 0, session.failed.join(' | '));
    check('session makes no remote runtime requests', session.remote.length === 0, session.remote.join(' | '));
  }

  await browser.close();
  const failures = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
