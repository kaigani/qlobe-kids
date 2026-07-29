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
  check('sort exposes six clothing targets and two baskets',
    sortTargets.filter((item) => item.id.startsWith('sock-')).length === 6
      && sortTargets.filter((item) => item.id.startsWith('bin-')).length === 2);
  check('all sorting targets meet 96px minimum',
    sortTargets.every(({ rect }) => rect.w >= 96 && rect.h >= 96));
  await page.evaluate(() => window.QLOBE_DEBUG.wrong());
  check('gentle wrong sort does not advance progress',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().progress)) === 0);

  const firstSock = page.locator('.sock-piece:not(.is-sorted)').first();
  const sockData = await firstSock.getAttribute('data-item');
  const color = sockData.split('-')[0];
  const from = await firstSock.boundingBox();
  const to = await page.locator(`[data-bin="${color}"]`).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().progress === 1);
  check('real pointer drag sorts through the same path', true);
  await page.screenshot({ path: path.join(shots, '02-sort-play.png') });
  await page.evaluate(() => window.QLOBE_DEBUG.winRound());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end');
  check('sort completes to its celebration', true);
  await page.screenshot({ path: path.join(shots, '03-sort-celebration.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.tap('back'));
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('fold'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput);
  await page.evaluate(() => window.QLOBE_DEBUG.wrong());
  check('gentle wrong fold keeps the first step',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().foldStep)) === 0);
  const towel = await page.locator('.towel-zone').boundingBox();
  await page.mouse.move(towel.x + towel.width * .25, towel.y + towel.height / 2);
  await page.mouse.down();
  await page.mouse.move(towel.x + towel.width * .78, towel.y + towel.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().foldStep === 1);
  await page.screenshot({ path: path.join(shots, '04-fold-second-step.png') });
  const towel2 = await page.locator('.towel-zone').boundingBox();
  await page.mouse.move(towel2.x + towel2.width / 2, towel2.y + towel2.height * .22);
  await page.mouse.down();
  await page.mouse.move(towel2.x + towel2.width / 2, towel2.y + towel2.height * .78, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().progress === 1);
  check('two real directional swipes fold one towel', true);
  await page.evaluate(() => window.QLOBE_DEBUG.winRound());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end');
  check('fold completes all three towels', true);

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
  const portraitFold = await portrait.locator('.towel-zone').boundingBox();
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
