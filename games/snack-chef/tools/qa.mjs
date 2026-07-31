#!/usr/bin/env node
// Real-Chrome smoke test and visual-QC capture for Snack Chef.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const base = (process.env.QLOBE_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');
const shots = path.resolve(process.env.QLOBE_SHOTS || 'qa-shots/snack-chef');
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
    if (!request.url().startsWith(base)) remote.push(request.url());
  });
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText || '';
    if (reason === 'net::ERR_ABORTED' && request.url().endsWith('.m4a')) return;
    failed.push(`${request.url()} ${reason}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(`${base}/games/snack-chef/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  await page.evaluate(() => {
    window.QLOBE_DEBUG.seed(42);
    window.QLOBE_DEBUG.fastTimers(.03);
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
  const hubTile = hubPage.locator('a.tile[aria-label*="Snack Chef"]');
  check('hub lists Snack Chef once', await hubTile.count() === 1);
  check('hub uses the curated production tile',
    (await hubTile.locator('img').getAttribute('src')) === 'assets/hub/tiles/snack-chef.jpg');
  await hubContext.close();

  const page = await openGame(browser, { width: 1180, height: 820 });
  check('splash boots', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'splash');
  check('three recipes are registered',
    (await page.evaluate(() => window.QLOBE_DEBUG.listModes())).map((item) => item.id).join(',') === 'fruit,toast,boat');
  const cardSizes = await page.locator('.recipe-card').evaluateAll((nodes) =>
    nodes.map((node) => ({ w: node.getBoundingClientRect().width, h: node.getBoundingClientRect().height })));
  check('recipe cards meet the 96px target', cardSizes.every(({ w, h }) => w >= 96 && h >= 96), JSON.stringify(cardSizes));
  check('painted title has the exact accessible name',
    (await page.locator('.title-art').getAttribute('alt')) === 'Snack Chef');
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  await page.evaluate(async () => {
    const clips = await import('../../../shared/js/voice-clips.js');
    window.__snackVoice = [];
    clips.onClip((key) => window.__snackVoice.push(key));
  });
  await page.locator('[data-mode="fruit"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput);
  await page.waitForFunction(() => window.__snackVoice.includes('fruit-cut'));
  check('first gesture unlocks recorded teacher voice',
    await page.evaluate(() => window.__snackVoice.includes('fruit-intro') && window.__snackVoice.includes('fruit-cut')),
    await page.evaluate(() => window.__snackVoice.join(', ')));
  await page.evaluate(() => window.QLOBE_DEBUG.mute());

  const firstLine = page.locator('[data-target-id="gesture-0"]');
  const lineBox = await firstLine.boundingBox();
  const startCue = page.locator('.is-current > .gesture-cue .gesture-start');
  const cueStyle = await startCue.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      background: style.backgroundColor,
      border: style.borderTopColor,
      w: el.getBoundingClientRect().width,
      h: el.getBoundingClientRect().height,
    };
  });
  check('current cut shows one Sand Tray-style orange start dot',
    await startCue.count() === 1
      && cueStyle.background === 'rgb(255, 116, 20)'
      && cueStyle.border === 'rgb(255, 255, 255)'
      && cueStyle.w >= 30 && cueStyle.h >= 30,
    JSON.stringify(cueStyle));
  check('the arrow grows from that active start dot',
    await page.locator('.is-current > .gesture-cue .gesture-arrow').count() === 1);

  await page.mouse.move(lineBox.x + lineBox.width - 8, lineBox.y + lineBox.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  check('touching away from the origin does not complete the cut',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().completed)) === 0
      && (await page.evaluate(() => window.QLOBE_DEBUG.getState().prompt)) === 'start-dot');

  await page.mouse.move(lineBox.x + 5, lineBox.y + lineBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(lineBox.x + lineBox.width - 5, lineBox.y + lineBox.height / 2, { steps: 8 });
  await page.mouse.up();
  check('real swipe completes one cut',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().completed)) === 1);
  check('start cue advances to the next cut',
    (await page.locator('.is-current').getAttribute('data-target-id')) === 'gesture-1');
  await page.screenshot({ path: path.join(shots, '02-fruit-cut.png') });

  await page.evaluate(async () => {
    await window.QLOBE_DEBUG.tap('gesture-1');
    await window.QLOBE_DEBUG.tap('gesture-2');
  });
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().step === 'arrange');
  const fruitTargets = await page.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check('arrangement exposes four ingredients and four slots',
    fruitTargets.filter((item) => item.id.startsWith('piece-')).length === 4
      && fruitTargets.filter((item) => item.id.startsWith('slot-')).length === 4);
  check('all active arrangement targets meet the 96px minimum',
    fruitTargets.every(({ rect }) => rect.w >= 96 && rect.h >= 96),
    JSON.stringify(fruitTargets.map(({ id, rect }) => ({ id, w: rect.w, h: rect.h }))));

  await page.evaluate(async () => {
    await window.QLOBE_DEBUG.tap('piece-2');
    await window.QLOBE_DEBUG.tap('slot-0');
  });
  check('wrong ingredient receives a gentle retry without progress',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().completed)) === 0);

  const piece = await page.locator('[data-target-id="piece-0"]').boundingBox();
  const slot = await page.locator('[data-target-id="slot-0"]').boundingBox();
  await page.mouse.move(piece.x + piece.width / 2, piece.y + piece.height / 2);
  await page.mouse.down();
  await page.mouse.move(slot.x + slot.width / 2, slot.y + slot.height / 2, { steps: 7 });
  check('drag clone follows the finger',
    await page.locator('.drag-clone').count() === 1);
  await page.screenshot({ path: path.join(shots, '03-fruit-drag.png') });
  await page.mouse.up();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().completed === 1);
  check('real drag places an ingredient', true);

  await page.evaluate(() => window.QLOBE_DEBUG.winRound());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reveal');
  check('Fruit Face reaches plated reveal', true);
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(shots, '04-fruit-reveal.png') });

  await page.locator('#reveal-back').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'splash');
  check('reveal Back returns to game splash', true);

  await page.evaluate(() => {
    window.QLOBE_DEBUG.mute(false);
    return window.QLOBE_DEBUG.startMode('toast');
  });
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().step === 'spread');
  const spreadFinger = page.locator('.demo-spread');
  check('spreading has no precise orange start cue',
    await page.locator('.toast .gesture-start').count() === 0);
  await page.waitForTimeout(220);
  const spreadFingerBefore = await spreadFinger.boundingBox();
  const spreadOpacity = Number(await spreadFinger.evaluate((el) => getComputedStyle(el).opacity));
  await page.waitForTimeout(380);
  const spreadFingerAfter = await spreadFinger.boundingBox();
  check('voice prompt models spreading with a 50%-opacity finger',
    await spreadFinger.count() === 1
      && await spreadFinger.evaluate((el) => el.classList.contains('is-demonstrating')
        && el.getAttribute('src').endsWith('gesture-finger.webp'))
      && spreadOpacity >= .48 && spreadOpacity <= .51
      && Math.hypot(spreadFingerAfter.x - spreadFingerBefore.x,
        spreadFingerAfter.y - spreadFingerBefore.y) > 10,
    JSON.stringify({ spreadOpacity, spreadFingerBefore, spreadFingerAfter }));
  await page.screenshot({ path: path.join(shots, '05-toast-spread-demo.png') });

  const toastBox = await page.locator('.toast').boundingBox();
  await page.mouse.move(toastBox.x + toastBox.width * .72, toastBox.y + toastBox.height * .68);
  await page.mouse.down();
  await page.mouse.move(toastBox.x + toastBox.width * .78, toastBox.y + toastBox.height * .72, { steps: 3 });
  await page.mouse.up();
  check('spread accepts an arbitrary start and dismisses the demonstration',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().completed)) > 0
      && !await spreadFinger.evaluate((el) => el.classList.contains('is-demonstrating')));

  await page.evaluate(() => window.QLOBE_DEBUG.gesture('spread'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().step === 'arrange');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shots, '06-toast-arrange.png') });
  await page.evaluate(() => window.QLOBE_DEBUG.winRound());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reveal');
  check('Toast Garden reaches plated reveal', true);
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(shots, '07-toast-reveal.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.home());
  await page.evaluate(() => {
    window.QLOBE_DEBUG.mute(false);
    return window.QLOBE_DEBUG.startMode('boat');
  });
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().step === 'peel');
  const peelFinger = page.locator('.demo-peel');
  check('peeling has no precise orange start cue',
    await page.locator('.peel-strip .gesture-start').count() === 0);
  await page.waitForTimeout(220);
  const peelFingerBefore = await peelFinger.boundingBox();
  const peelOpacity = Number(await peelFinger.evaluate((el) => getComputedStyle(el).opacity));
  await page.waitForTimeout(320);
  const peelFingerAfter = await peelFinger.boundingBox();
  check('voice prompt models a broad downward pull at 50% opacity',
    await peelFinger.count() === 1
      && await peelFinger.evaluate((el) => el.classList.contains('is-demonstrating')
        && el.getAttribute('src').endsWith('gesture-finger.webp'))
      && peelOpacity >= .48 && peelOpacity <= .51
      && peelFingerAfter.y - peelFingerBefore.y > 10,
    JSON.stringify({ peelOpacity, peelFingerBefore, peelFingerAfter }));
  await page.screenshot({ path: path.join(shots, '08-boat-peel-demo.png') });

  const thirdPeel = await page.locator('.peel-strip').nth(2).boundingBox();
  await page.mouse.move(thirdPeel.x + thirdPeel.width / 2, thirdPeel.y + thirdPeel.height * .35);
  await page.mouse.down();
  await page.mouse.move(thirdPeel.x + thirdPeel.width / 2, thirdPeel.y + thirdPeel.height * .8, { steps: 5 });
  await page.mouse.up();
  check('any peel can begin broadly and dismiss the demonstration',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().completed)) === 1
      && !await peelFinger.evaluate((el) => el.classList.contains('is-demonstrating')));

  await page.evaluate(() => window.QLOBE_DEBUG.winRound());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reveal');
  check('Banana Boat completes peel, cut, arrange, and reveal', true);
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(shots, '09-boat-reveal.png') });

  const portrait = await openGame(browser, { width: 820, height: 1180 });
  await portrait.screenshot({ path: path.join(shots, '10-splash-portrait.png') });
  await portrait.evaluate(() => {
    window.QLOBE_DEBUG.mute();
    return window.QLOBE_DEBUG.startMode('toast');
  });
  await portrait.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput);
  await portrait.waitForTimeout(500);
  await portrait.screenshot({ path: path.join(shots, '11-toast-portrait.png') });
  const portraitBoard = await portrait.locator('.workboard').boundingBox();
  const portraitPrompt = await portrait.locator('.prompt-card').boundingBox();
  check('portrait work board is visible and separate from the prompt',
    portraitBoard && portraitPrompt && portraitBoard.y >= portraitPrompt.y + portraitPrompt.height - 2,
    JSON.stringify({ portraitBoard, portraitPrompt }));

  const wide = await openGame(browser, { width: 1180, height: 520 }, 'reduce');
  await wide.evaluate(() => {
    window.QLOBE_DEBUG.mute();
    return window.QLOBE_DEBUG.startMode('boat');
  });
  await wide.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput);
  await wide.screenshot({ path: path.join(shots, '12-boat-wide-reduced.png') });
  const wideTargets = await wide.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check('wide reduced-motion layout keeps every target onscreen at 96px minimum',
    wideTargets.every(({ rect }) => rect.x >= 0 && rect.y >= 0
      && rect.x + rect.w <= 1180 && rect.y + rect.h <= 520
      && rect.w >= 96 && rect.h >= 96),
    JSON.stringify(wideTargets));

  for (const session of sessions) {
    check('session has no page or console errors', session.errors.length === 0, session.errors.join(' | '));
    check('session has no failed requests or 4xx responses', session.failed.length === 0, session.failed.join(' | '));
    check('runtime makes no remote requests', session.remote.length === 0, session.remote.join(' | '));
    await session.context.close();
  }
  await browser.close();

  const failed = checks.filter((item) => !item.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
