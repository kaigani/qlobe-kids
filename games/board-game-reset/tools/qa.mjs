#!/usr/bin/env node
import path from 'node:path';
import {
  baseUrl, launchChrome, createReporter, openSession, checkSessionClean,
  resolveShots, ensureShots, debug, targetSizes, undersized, dragBetween,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl('http://127.0.0.1:4173');
const url = `${base}/games/board-game-reset/`;
const shots = resolveShots('tools/qa-artifacts/board-game-reset');
const { check, finish } = createReporter();
const sessions = [];
const analytics = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];

async function openGame(browser, viewport, reducedMotion = 'no-preference', { mute = true } = {}) {
  const session = await openSession(browser, { url, base, viewport, reducedMotion,
    seed: 42, mute, fastTimers: 0.02, allowAbortedMedia: true,
    allowRemote: analytics, captureRequestFailures: false });
  sessions.push(session); return session.page;
}
async function cleanVisuals(page) {
  const [bad, targets, debugTargets, images] = await Promise.all([
    page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
      viewport: { width: innerWidth, height: innerHeight } })),
    targetSizes(page),
    debug.getTargets(page),
    page.locator('img:visible').evaluateAll((xs) => xs.every((x) => x.complete && x.naturalWidth > 0 && x.naturalHeight > 0)),
  ]);
  check('no document overflow', !bad.overflow); check('all visible images decode', images);
  check('visible controls meet 96px floor', undersized(targets).length === 0, JSON.stringify(targets));
  check('visible controls stay on screen', debugTargets.every(({ rect }) =>
    rect.x >= -.5 && rect.y >= -.5
      && rect.x + rect.w <= bad.viewport.width + .5
      && rect.y + rect.h <= bad.viewport.height + .5), JSON.stringify(debugTargets));
}
async function shot(page, name) { await page.screenshot({ path: path.join(shots, `${name}.png`) }); await cleanVisuals(page); }

async function audioChecks(page) {
  const pack = await page.evaluate(async () => {
    const [m, lines, qa] = await Promise.all([
      fetch('./assets/audio/manifest.json').then((r) => r.json()),
      fetch('./assets/audio/lines.json').then((r) => r.json()),
      fetch('./assets/audio/qa.json').then((r) => r.json()),
    ]);
    const files = Object.values(m); const issues = [];
    const ctx = new OfflineAudioContext(1, 1, 44100);
    for (const [key, entry] of Object.entries(m)) try {
      const r = await fetch(`./assets/audio/${entry.file}`); if (!r.ok) throw Error(`HTTP ${r.status}`);
      const b = await ctx.decodeAudioData(await r.arrayBuffer());
      if (Math.abs(b.duration - entry.dur) > .15) throw Error(`duration ${b.duration}`);
    } catch (e) { issues.push(`${key}: ${e.message}`); }
    return {
      keys: Object.keys(m).sort(),
      lineKeys: Object.keys(lines).sort(),
      qaKeys: Object.entries(qa).filter(([, value]) => value.valid && value.score === 1).map(([key]) => key).sort(),
      files: files.length,
      issues,
    };
  });
  check('audio manifest, fallback lines, and exact Whisper QA contain the same 20 entries',
    pack.keys.length === 20 && pack.files === 20
      && pack.keys.join(',') === pack.lineKeys.join(',')
      && pack.keys.join(',') === pack.qaKeys.join(','), JSON.stringify(pack));
  check('all manifest audio clips decode in Chrome', pack.issues.length === 0, pack.issues.join('; '));
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome({ channel: 'chrome' });
  try {
    const page = await openGame(browser, { width: 1280, height: 800 });
    check('splash screen boots', (await debug.getState(page)).screen === 'splash'); await shot(page, '01-splash');
    await debug.startMode(page, 'together'); await debug.waitForScreen(page, 'play');
    check('board screen starts', (await debug.getState(page)).screen === 'play'); await shot(page, '02-board');
    await page.locator('[data-target="spinner"]').click();
    await page.waitForFunction(() => {
      const state = window.QLOBE_DEBUG.getState();
      return state.phase === 'await-spin' && state.position > 0;
    });
    check('real spinner press moves the cooperative pawns', (await debug.getState(page)).position > 0);
    await debug.call(page, 'forceSetback'); await debug.waitForState(page, 'phase', 'breathe');
    check('forced reset enters breathe phase', (await debug.getState(page)).phase === 'breathe'); await shot(page, '03-breathe');
    await page.locator('[data-target="breathe"]').click();
    await debug.waitForState(page, 'phase', 'hug'); await shot(page, '04-hug');
    const hugFrom = await page.locator('[data-piece="miso"]').boundingBox();
    const hugTo = await page.locator('[data-slot="biscuit"]').boundingBox();
    await dragBetween(page, hugFrom, hugTo);
    await debug.waitForState(page, 'phase', 'tidy'); await shot(page, '05-tidy');
    await page.locator('[data-piece="heart"]').click();
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().reset.tidy.length === 1);
    const starFrom = await page.locator('[data-piece="star"]').boundingBox();
    const basketTo = await page.locator('[data-slot="basket"]').boundingBox();
    await dragBetween(page, starFrom, basketTo);
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().reset.tidy.length === 2);
    await page.locator('[data-piece="flower"]').click();
    await debug.waitForState(page, 'phase', 'ready');
    check('tap and drag paths tidy all three loose pieces', (await debug.getState(page)).reset.tidy.length === 3);
    check('ritual reaches ready', (await debug.getState(page)).phase === 'ready');
    await page.waitForTimeout(650); await shot(page, '06-ready');
    await debug.tap(page, 'resume'); await debug.waitForState(page, 'phase', 'await-spin');
    await debug.call(page, 'finishGame'); await debug.waitForScreen(page, 'end'); await shot(page, '07-end');
    check('replay control is accepted', await debug.tap(page, 'again')); await debug.waitForScreen(page, 'play');
    check('replay returns to a fresh board', (await debug.getState(page)).position === 0
      && !(await debug.getState(page)).resetComplete);
    await debug.tap(page, 'back'); await debug.waitForScreen(page, 'splash'); check('Back/home returns to splash', true);
    await audioChecks(page);

    for (const [viewport, label] of [[[768,1024],'portrait'], [[844,390],'compact']]) {
      const p = await openGame(browser, { width: viewport[0], height: viewport[1] });
      await debug.startMode(p, 'together'); await debug.waitForScreen(p, 'play');
      await shot(p, label === 'portrait' ? '08-board-portrait' : '09-board-compact');
      await debug.call(p, 'forceSetback'); await debug.waitForState(p, 'phase', 'breathe');
      await shot(p, label === 'portrait' ? '08-ritual-portrait' : '09-ritual-compact');
      check(`${label} ritual layout has no overflow`, true);
    }
    const reduced = await openGame(browser, { width: 1280, height: 800 }, 'reduce');
    await debug.startMode(reduced, 'together'); await debug.call(reduced, 'completeRitual'); check('reduced-motion ritual completes', (await debug.getState(reduced)).phase === 'ready');

    const hugTap = await openGame(browser, { width: 1024, height: 768 });
    for (const friend of ['biscuit', 'miso']) {
      await debug.startMode(hugTap, 'together');
      await debug.call(hugTap, 'forceSetback'); await debug.waitForState(hugTap, 'phase', 'breathe');
      await debug.call(hugTap, 'completeBreathe'); await debug.waitForState(hugTap, 'phase', 'hug');
      await hugTap.locator(`[data-target="${friend}"]`).click();
      await debug.waitForState(hugTap, 'phase', 'tidy');
      check(`tapping ${friend === 'biscuit' ? 'Biscuit' : 'Miso'} completes the mutual hug`,
        (await debug.getState(hugTap)).reset.hug === true);
      await debug.tap(hugTap, 'back'); await debug.waitForScreen(hugTap, 'splash');
    }

    const keyboard = await openGame(browser, { width: 1024, height: 768 });
    await debug.startMode(keyboard, 'together');
    await debug.call(keyboard, 'forceSetback'); await debug.waitForState(keyboard, 'phase', 'breathe');
    await keyboard.locator('[data-target="breathe"]').press('Enter');
    await debug.waitForState(keyboard, 'phase', 'hug');
    await keyboard.locator('[data-piece="miso"]').press('Enter');
    await debug.waitForState(keyboard, 'phase', 'tidy');
    for (const id of ['heart', 'star', 'flower']) {
      await keyboard.locator(`[data-piece="${id}"]`).press('Enter');
      await keyboard.waitForFunction((count) => window.QLOBE_DEBUG.getState().reset.tidy.length === count,
        ['heart', 'star', 'flower'].indexOf(id) + 1);
    }
    await keyboard.locator('[data-target="resume"]').press('Enter');
    await debug.waitForState(keyboard, 'phase', 'await-spin');
    check('keyboard-only ritual completes and returns to the board', true);

    const assistive = await openGame(browser, { width: 1024, height: 768 });
    await debug.startMode(assistive, 'together');
    await debug.call(assistive, 'forceSetback'); await debug.waitForState(assistive, 'phase', 'breathe');
    await debug.call(assistive, 'completeBreathe'); await debug.waitForState(assistive, 'phase', 'hug');
    await assistive.locator('[data-piece="miso"]').evaluate((node) =>
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })));
    await debug.waitForState(assistive, 'phase', 'tidy');
    check('assistive-technology click activates Miso', (await debug.getState(assistive)).reset.hug === true);
    for (const [index, id] of ['heart', 'star', 'flower'].entries()) {
      await assistive.locator(`[data-piece="${id}"]`).evaluate((node) =>
        node.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })));
      await assistive.waitForFunction((count) => window.QLOBE_DEBUG.getState().reset.tidy.length === count, index + 1);
    }
    check('assistive-technology clicks activate every tidy piece',
      (await debug.getState(assistive)).phase === 'ready');

    const cancel = await openGame(browser, { width: 1280, height: 800 });
    await debug.startMode(cancel, 'together');
    await debug.call(cancel, 'forceSetback'); await debug.waitForState(cancel, 'phase', 'breathe');
    await debug.call(cancel, 'completeBreathe'); await debug.waitForState(cancel, 'phase', 'hug');
    const cancelPiece = await cancel.locator('[data-piece="miso"]').boundingBox();
    await cancel.mouse.move(cancelPiece.x + cancelPiece.width / 2, cancelPiece.y + cancelPiece.height / 2);
    await cancel.mouse.down();
    await cancel.mouse.move(cancelPiece.x + cancelPiece.width / 2 - 90, cancelPiece.y + cancelPiece.height / 2 + 30, { steps: 6 });
    await cancel.locator('[data-qk-drag-ghost]').waitFor({ state: 'visible' });
    await debug.tap(cancel, 'back'); await cancel.mouse.up(); await debug.waitForScreen(cancel, 'splash');
    check('Back during a lifted hug clears the drag ghost and returns home',
      await cancel.locator('[data-qk-drag-ghost], .reset-drag-ghost').count() === 0);
    await debug.startMode(cancel, 'together'); await debug.fastTimers(cancel, 1);
    await cancel.locator('[data-target="spinner"]').click();
    await debug.waitForState(cancel, 'phase', 'spinning');
    await debug.tap(cancel, 'back'); await debug.waitForScreen(cancel, 'splash');
    await cancel.waitForTimeout(1100);
    const cancelledState = await debug.getState(cancel);
    check('Back during spin cancels stale move continuation',
      cancelledState.screen === 'splash' && cancelledState.phase === 'splash'
        && await cancel.locator('[data-target="spinner"]:visible').count() === 0,
      JSON.stringify(cancelledState));

    const voiced = await openGame(browser, { width: 1024, height: 768 }, 'no-preference', { mute: false });
    await voiced.locator('[data-target="play"]').click(); await debug.waitForScreen(voiced, 'play');
    await voiced.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog()
      .some((entry) => entry.key === 'welcome' && entry.kind === 'clip'));
    check('a real first gesture unlocks and requests the recorded welcome clip', true);
    await debug.mute(voiced, true);

    const fallbackSession = await openSession(browser, {
      url, base, viewport: { width: 1024, height: 768 }, goto: false, ready: false,
      allowAbortedMedia: true, allowRemote: analytics, captureRequestFailures: false,
    });
    sessions.push(fallbackSession);
    await fallbackSession.page.route('**/games/board-game-reset/assets/audio/manifest.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await fallbackSession.page.goto(url, { waitUntil: 'networkidle' });
    await fallbackSession.page.evaluate(() => window.QLOBE_DEBUG.ready);
    await debug.fastTimers(fallbackSession.page, 0.02);
    await fallbackSession.page.locator('[data-target="play"]').click();
    await debug.waitForScreen(fallbackSession.page, 'play');
    await fallbackSession.page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog()
      .some((entry) => entry.key === 'welcome' && entry.kind === 'speech'));
    check('missing recorded manifest falls back to speech without blocking play',
      (await debug.getState(fallbackSession.page)).screen === 'play');
    await debug.mute(fallbackSession.page, true);

    for (const session of sessions) checkSessionClean({ check }, session);
  } finally { await browser.close(); }
  finish({ listFailures: false });
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
