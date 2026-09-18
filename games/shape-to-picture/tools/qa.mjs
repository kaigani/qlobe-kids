#!/usr/bin/env node
// Real-Chrome smoke and visual-QC gate for Shape Surprise Studio.
//
//   python -m http.server 8000
//   node games/shape-to-picture/tools/qa.mjs --base http://127.0.0.1:8000 --out qa-shots/shape-to-picture
//   node games/shape-to-picture/tools/qa.mjs --base https://qlo.be --out C:\Temp\shape-surprise-production

import path from 'node:path';
import {
  args, checkSessionClean, createReporter, debug, dragBetween, ensureShots,
  launchChrome, openSession,
} from '../../../tools/qa/lib/driver.mjs';

if (args.has('help')) {
  console.log('Usage: node games/shape-to-picture/tools/qa.mjs [--base URL] [--out DIRECTORY]');
  console.log('Defaults: --base http://127.0.0.1:8000; --out qa-shots/shape-to-picture');
  process.exit(0);
}

const base = String(args.flag('base', 'http://127.0.0.1:8000')).replace(/\/$/, '');
const url = `${base}/games/shape-to-picture/`;
const shots = path.resolve(args.flag('out', args.flag('shots', 'qa-shots/shape-to-picture')));
const { check, finish } = createReporter({ detailOnFail: true, collapse: true, detailLimit: 900 });
const sessions = [];
const analyticsOrigins = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];

async function openRun(browser, viewport, { reducedMotion = 'no-preference', mute = false } = {}) {
  const session = await openSession(browser, {
    url,
    base,
    viewport,
    reducedMotion,
    goto: false,
    ready: false,
    allowDataUrls: true,
    allowAbortedMedia: true,
    allowRemote: analyticsOrigins,
  });
  // Analytics is platform chrome rather than game runtime. Fulfill it before
  // navigation so a disconnected local machine cannot turn that known beacon
  // into a false failed-request result; every other remote request still fails.
  await session.context.route(
    /https:\/\/(?:www\.googletagmanager\.com|www\.google-analytics\.com)\//,
    (route) => route.fulfill({ status: 204, body: '' }),
  );
  await session.page.goto(url, { waitUntil: 'networkidle' });
  await debug.waitForHook(session.page);
  await debug.waitForReady(session.page);
  await debug.seed(session.page, 42);
  await debug.fastTimers(session.page, 0.03);
  await debug.mute(session.page, mute);
  sessions.push(session);
  return session;
}

async function screenshot(page, name) {
  // Capture the settled composition, not the first frame of the paper-pop
  // entrance (debug timers intentionally do not rewrite CSS animation time).
  await page.waitForTimeout(720);
  await page.waitForFunction(() => [...document.images].filter((image) => {
    const box = image.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0
      && box.left < innerWidth && box.top < innerHeight;
  }).every((image) => image.complete && image.naturalWidth > 0));
  await page.screenshot({ path: path.join(shots, name) });
}

async function auditLayout(page, label) {
  const report = await page.evaluate(() => {
    const layout = window.QLOBE_DEBUG.getLayout();
    const targets = window.QLOBE_DEBUG.getTargets();
    const undersized = targets.filter(({ rect }) => !rect || rect.w < 96 || rect.h < 96);
    const outside = targets.filter(({ rect }) => !rect || rect.x < -1 || rect.y < -1
      || rect.x + rect.w > innerWidth + 1 || rect.y + rect.h > innerHeight + 1);
    const brokenImages = [...document.images]
      .filter((image) => image.getClientRects().length && (!image.complete || image.naturalWidth < 1))
      .map((image) => image.getAttribute('src'));
    return { layout, targets, undersized, outside, brokenImages };
  });
  check(`${label}: reported targets are at least 96px`, report.undersized.length === 0, JSON.stringify(report.undersized));
  check(`${label}: reported targets stay inside viewport`, report.outside.length === 0, JSON.stringify(report.outside));
  check(`${label}: no horizontal or vertical overflow`, !report.layout.overflow.bodyX && !report.layout.overflow.bodyY, JSON.stringify(report.layout.overflow));
  check(`${label}: visible raster art decodes`, report.brokenImages.length === 0, report.brokenImages.join(', '));
}

async function waitFor(page, screen, phase = null) {
  await page.waitForFunction(([expectedScreen, expectedPhase]) => {
    const state = window.QLOBE_DEBUG.getState();
    return state.screen === expectedScreen && (!expectedPhase || state.phase === expectedPhase);
  }, [screen, phase]);
}

async function finishMode(page, modeId, { wrongBuilder = false, capture = false } = {}) {
  await debug.startMode(page, modeId);
  await waitFor(page, 'play', 'input');
  const opening = await debug.getState(page);
  check(`${modeId}: starts through the semantic mode handler`, opening.mode === modeId && opening.awaitingInput, JSON.stringify(opening));
  if (capture) await screenshot(page, `02-${modeId}-play.png`);

  if (wrongBuilder) {
    const targets = await debug.getTargets(page);
    const part = targets.find(({ id }) => id.startsWith('part-'))?.id.replace(/^part-/, '');
    const wrongSlot = targets.find(({ id }) => id.startsWith('slot-') && id !== `slot-${part}`)?.id.replace(/^slot-/, '');
    const before = await debug.getState(page);
    const wrong = await debug.call(page, 'placePart', part, wrongSlot);
    const after = await debug.getState(page);
    check('Picture Builder exposes a real wrong placement route', Boolean(part && wrongSlot), JSON.stringify({ part, wrongSlot }));
    check('wrong builder placement is gentle and preserves progress', wrong === false
      && after.misses === before.misses + 1 && after.placed.length === before.placed.length,
    JSON.stringify({ before, after }));
  }

  const roundCount = opening.roundCount;
  for (let index = 0; index < roundCount; index += 1) {
    await debug.winRound(page);
    await waitFor(page, 'reveal', 'reveal');
    const revealed = await debug.getState(page);
    check(`${modeId}: round ${index + 1} reaches a reveal`, revealed.currentRevealKey === undefined
      ? revealed.phase === 'reveal' : Boolean(revealed.currentRevealKey), JSON.stringify(revealed));
    if (capture && index === 0) await screenshot(page, `03-${modeId}-reveal.png`);
    await debug.tap(page, 'next');
    if (index + 1 < roundCount) await waitFor(page, 'play', 'input');
  }
  await waitFor(page, 'end', 'complete');
  const done = await debug.getState(page);
  check(`${modeId}: all ${roundCount} rounds end in a gallery`, done.completed === roundCount && done.screen === 'end', JSON.stringify(done));
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome();
  try {
    const landscape = await openRun(browser, { width: 1180, height: 820 });
    const page = landscape.page;
    const initial = await debug.getState(page);
    const modes = await debug.listModes(page);
    check('game reaches the splash after QLOBE_DEBUG.ready', initial.screen === 'splash' && initial.phase === 'menu', JSON.stringify(initial));
    check('exactly three Shape Surprise modes are registered', modes.map(({ id }) => id).join(',') === 'tap-magic,stretch-magic,picture-builder', JSON.stringify(modes));
    await auditLayout(page, 'landscape splash');
    await screenshot(page, '01-splash-landscape.png');

    // A literal click provides user activation before the first voice request;
    // the log distinguishes an AAC clip from Web Speech fallback.
    await debug.clearAudioLog(page);
    await page.locator('#splash-sound').click();
    await page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog().some((entry) => entry.key === 'intro'));
    const voiceLog = await debug.getAudioLog(page);
    check('first real gesture selects the recorded intro clip', voiceLog.some((entry) => entry.key === 'intro' && entry.kind === 'clip'), JSON.stringify(voiceLog));

    // Exercise the actual child-facing pointer paths before using deterministic
    // hooks for the exhaustive ten-round sweep.
    await debug.startMode(page, 'tap-magic');
    await page.locator('.magic-shape-button').click();
    await waitFor(page, 'reveal', 'reveal');
    check('real pointer tap completes Tap Magic', (await debug.getState(page)).revealed.length === 1);

    await debug.startMode(page, 'stretch-magic');
    const pinchShape = await page.locator('.magic-shape-button').boundingBox();
    const cdp = await landscape.context.newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    const pinchY = pinchShape.y + pinchShape.height / 2;
    const pinchX = pinchShape.x + pinchShape.width / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
      { id: 1, x: pinchX - 30, y: pinchY, radiusX: 8, radiusY: 8 },
      { id: 2, x: pinchX + 30, y: pinchY, radiusX: 8, radiusY: 8 },
    ] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
      { id: 1, x: pinchX - 155, y: pinchY, radiusX: 8, radiusY: 8 },
      { id: 2, x: pinchX + 155, y: pinchY, radiusX: 8, radiusY: 8 },
    ] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await waitFor(page, 'reveal', 'reveal');
    check('real two-finger spread completes Stretch Magic', (await debug.getState(page)).gestureProgress === 1);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });

    await debug.startMode(page, 'stretch-magic');
    const tab = await page.locator('.magic-tab-zone').boundingBox();
    await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height - 14);
    await page.mouse.down();
    await page.mouse.move(tab.x + tab.width / 2, tab.y + 12, { steps: 12 });
    await page.mouse.up();
    await waitFor(page, 'reveal', 'reveal');
    check('real one-finger slide completes Stretch Magic', (await debug.getState(page)).gestureProgress === 1);

    await debug.startMode(page, 'picture-builder');
    const dragPiece = page.locator('.builder-piece').first();
    const dragPart = await dragPiece.getAttribute('data-part');
    const dragSlot = page.locator(`.builder-slot[data-part="${dragPart}"]`);
    await dragBetween(page, await dragPiece.boundingBox(), await dragSlot.boundingBox());
    await page.waitForTimeout(120);
    check('real pointer drag snaps a Builder piece', (await debug.getState(page)).placed.includes(dragPart), JSON.stringify(await debug.getState(page)));
    const tapPiece = page.locator('.builder-piece').first();
    const tapPart = await tapPiece.getAttribute('data-part');
    await tapPiece.click();
    const selectedAfterTap = await debug.getState(page);
    check('real piece tap selects that Builder piece', selectedAfterTap.selectedPart === tapPart, JSON.stringify({ tapPart, selectedAfterTap }));
    await page.locator(`.builder-slot[data-part="${tapPart}"]`).click();
    await page.waitForTimeout(120);
    check('real tap-piece then tap-slot path snaps a Builder piece', (await debug.getState(page)).placed.includes(tapPart), JSON.stringify(await debug.getState(page)));

    await finishMode(page, 'tap-magic', { capture: true });
    await debug.tap(page, 'choose-game');
    await waitFor(page, 'splash', 'menu');
    await finishMode(page, 'stretch-magic', { capture: true });
    await debug.tap(page, 'choose-game');
    await waitFor(page, 'splash', 'menu');
    await finishMode(page, 'picture-builder', { wrongBuilder: true, capture: true });
    await screenshot(page, '04-end-landscape.png');
    await auditLayout(page, 'landscape end');
    checkSessionClean({ check }, landscape, 'landscape');

    const shortLandscape = await openRun(browser, { width: 1180, height: 520 }, { mute: true });
    await auditLayout(shortLandscape.page, 'short landscape splash');
    await screenshot(shortLandscape.page, '05-splash-short-landscape.png');
    checkSessionClean({ check }, shortLandscape, 'short landscape');

    const portrait = await openRun(browser, { width: 820, height: 1180 }, { reducedMotion: 'reduce', mute: true });
    await debug.startMode(portrait.page, 'tap-magic');
    await waitFor(portrait.page, 'play', 'input');
    await auditLayout(portrait.page, 'portrait reduced-motion play');
    await screenshot(portrait.page, '06-tap-portrait-reduced-motion.png');
    await debug.winRound(portrait.page);
    await waitFor(portrait.page, 'reveal', 'reveal');
    await screenshot(portrait.page, '07-reveal-portrait.png');
    checkSessionClean({ check }, portrait, 'portrait');
  } finally {
    await Promise.all(sessions.map((session) => session.close().catch(() => {})));
    await browser.close();
  }
  finish({ suffix: `; screenshots in ${shots}` });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
