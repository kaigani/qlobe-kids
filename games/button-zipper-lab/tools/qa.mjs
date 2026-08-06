#!/usr/bin/env node
import path from 'node:path';
import {
  audio,
  baseUrl,
  checkSessionClean,
  createReporter,
  debug,
  dragBetween,
  ensureShots,
  launchChrome,
  openSession,
  resolveShots,
  targetSizes,
  undersized,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const shots = resolveShots('/private/tmp/qlobe-button-zipper-lab-shots');
const reporter = createReporter();
const { check, finish } = reporter;
const PLATFORM_ANALYTICS = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
];

function checkRuntimeSessionClean(reporter, session, label) {
  const failed = session.failed.filter((entry) => !PLATFORM_ANALYTICS.some((prefix) => entry.startsWith(prefix)));
  checkSessionClean(reporter, { ...session, failed }, label);
}

function center(box) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function dragStagePath(page, points) {
  const board = await page.locator('#activity-stage').boundingBox();
  if (!board) throw new Error('Activity stage is not visible');
  const path = points.map(({ x, y }) => ({ x: board.x + x * board.width, y: board.y + y * board.height }));
  await page.mouse.move(path[0].x, path[0].y);
  await page.mouse.down();
  for (const point of path.slice(1)) await page.mouse.move(point.x, point.y, { steps: 5 });
  await page.mouse.up();
}

async function syntheticTwoFingerSupport(page) {
  return page.evaluate(() => {
    const support = document.getElementById('support-zone');
    const fastener = document.getElementById('fastener');
    const supportRect = support.getBoundingClientRect();
    const fastenerRect = fastener.getBoundingClientRect();
    const fire = (target, type, pointerId, x, y, buttons) => target.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: 'touch',
      isPrimary: pointerId === 92,
      clientX: x,
      clientY: y,
      buttons,
    }));
    const sx = supportRect.left + supportRect.width / 2;
    const sy = supportRect.top + supportRect.height / 2;
    const fx = fastenerRect.left + fastenerRect.width / 2;
    const fy = fastenerRect.top + fastenerRect.height / 2;
    fire(support, 'pointerdown', 91, sx, sy, 1);
    const supportStarted = QLOBE_DEBUG.getState().support;
    fire(fastener, 'pointerdown', 92, fx, fy, 1);
    fire(window, 'pointermove', 92, fx, fy - 24, 1);
    const supportDuringMove = QLOBE_DEBUG.getState().support;
    fire(window, 'pointercancel', 92, fx, fy - 24, 0);
    const supportAfterManipulatorCancel = QLOBE_DEBUG.getState().support;
    fire(window, 'pointerup', 91, sx, sy, 0);
    const supportReleased = !QLOBE_DEBUG.getState().support;
    return { supportStarted, supportDuringMove, supportAfterManipulatorCancel, supportReleased };
  });
}

async function measureEdgeGrabShift(page) {
  const beforeBox = await page.locator('#fastener').boundingBox();
  if (!beforeBox) throw new Error('Fastener is not visible');
  const before = center(beforeBox);
  const start = { x: before.x - beforeBox.width * .36, y: before.y };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 14, start.y - 7, { steps: 3 });
  await page.waitForTimeout(30);
  const duringBox = await page.locator('#fastener').boundingBox();
  const during = center(duringBox);
  await page.mouse.up();
  await page.waitForTimeout(220);
  return Math.hypot(during.x - before.x, during.y - before.y);
}

async function waitForRoundOrEnd(page, previousRound) {
  await page.waitForFunction((before) => {
    const state = QLOBE_DEBUG.getState();
    return state.screen === 'end' || (state.screen === 'play' && state.round > before && !state.transitioning);
  }, previousRound, { timeout: 15000 });
  return debug.getState(page);
}

async function debugCompleteRound(page) {
  const before = await debug.getState(page);
  check(`round ${before.mode} ${before.round + 1} accepts debug win`, await debug.winRound(page));
  return waitForRoundOrEnd(page, before.round);
}

async function completeRemaining(page) {
  for (;;) {
    const state = await debug.getState(page);
    if (state.screen === 'end') return state;
    await debugCompleteRound(page);
  }
}

async function settleReward(page) {
  await page.waitForTimeout(800);
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome();

  const hub = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  await hub.goto(`${base}/#practical-life`, { waitUntil: 'networkidle' });
  const tile = hub.locator('a[href="games/button-zipper-lab/"]');
  check('hub exposes one playable Button-Zipper Lab tile', await tile.count() === 1);
  await Promise.all([hub.waitForURL('**/games/button-zipper-lab/'), tile.click()]);
  check('hub tile opens the game route', hub.url().endsWith('/games/button-zipper-lab/'));
  await hub.close();

  const gestureHarness = await browser.newPage({ viewport: { width: 860, height: 700 } });
  await gestureHarness.goto(`${base}/shared/js/stage/constrained-gesture-dom.test.html`, { waitUntil: 'networkidle' });
  await gestureHarness.waitForFunction(() => !document.getElementById('summary').textContent.includes('Running'));
  const gestureSummary = await gestureHarness.locator('#summary').innerText();
  check('shared constrained-gesture browser harness passes all 12 tests', gestureSummary.startsWith('All 12 tests passed'), gestureSummary);
  await gestureHarness.close();

  const session = await openSession(browser, {
    url: `${base}/games/button-zipper-lab/`,
    base,
    viewport: { width: 1180, height: 820 },
    seed: 42,
    fastTimers: 20,
    mute: false,
    allowAbortedMedia: true,
    allowRemote: PLATFORM_ANALYTICS,
  });
  const { page } = session;
  await page.evaluate(() => QLOBE_DEBUG.resetProgress());
  const hook = await page.evaluate(() => ({ version: QLOBE_DEBUG.version, state: QLOBE_DEBUG.getState(), modes: QLOBE_DEBUG.listModes() }));
  check('QLOBE_DEBUG v1 boots on the splash', hook.version === 1 && hook.state.screen === 'splash');
  check('four production modes are registered', hook.modes.map((mode) => mode.id).join(',') === 'zipper,button,snap,velcro');
  check('recorded teacher clip metadata is loaded', await page.evaluate(() => {
    const clip = QLOBE_DEBUG.clipInfo('mode-zipper');
    return Boolean(clip?.file?.endsWith('.m4a') && clip.dur > 0);
  }));
  const splashTargets = await targetSizes(page, '.felt-mode-card[data-target]');
  check('all splash mode cards exceed the 96px touch floor', undersized(splashTargets).length === 0, JSON.stringify(undersized(splashTargets)));
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  await page.evaluate(() => QLOBE_DEBUG.clearAudioLog());
  check('zipper mode starts', await debug.startMode(page, 'zipper'));
  await page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'play');
  await page.waitForFunction(() => QLOBE_DEBUG.getAudioLog().some((entry) => entry.key === 'mode-zipper'));
  const zipperLog = await page.evaluate(() => QLOBE_DEBUG.getAudioLog());
  check('zipper intro really uses the recorded clip', audio.heardClip(zipperLog, 'mode-zipper'), audio.describe(zipperLog));
  const playTargets = await targetSizes(page, '#play-screen [data-target]');
  check('play controls exceed the 96px touch floor', undersized(playTargets).length === 0, JSON.stringify(undersized(playTargets)));
  const twoFinger = await syntheticTwoFingerSupport(page);
  check('support finger remains independent through manipulator cancellation', Object.values(twoFinger).every(Boolean), JSON.stringify(twoFinger));
  await page.screenshot({ path: path.join(shots, '02-zipper-play.png') });

  const piece = await page.locator('[data-target="fastener"]').boundingBox();
  const board = await page.locator('#activity-stage').boundingBox();
  await dragBetween(page, piece, { x: board.x + board.width * .5, y: board.y + board.height * .47 }, { steps: 12 });
  const afterRealZip = await debug.getState(page);
  check('real pointer drag reaches the zipper completion path', afterRealZip.transitioning || afterRealZip.round > 0 || afterRealZip.screen === 'end', JSON.stringify(afterRealZip));
  if (afterRealZip.round === 0 && afterRealZip.screen === 'play') await waitForRoundOrEnd(page, 0);

  let current = await debug.getState(page);
  if (current.screen === 'play' && current.round === 1) {
    for (let index = 0; index < 3; index += 1) {
      await page.locator('#fastener').click();
      await page.waitForTimeout(190);
    }
    const afterTaps = await debug.getState(page);
    check('three physical taps provide a complete zipper fallback', afterTaps.transitioning || afterTaps.round > 1, JSON.stringify(afterTaps));
    if (afterTaps.round === 1) await waitForRoundOrEnd(page, 1);
  }
  await completeRemaining(page);
  await settleReward(page);
  await page.screenshot({ path: path.join(shots, '03-zipper-reward.png') });
  check('zipper patch persists', (await debug.getState(page)).completed.includes('zipper'));
  await page.evaluate(() => QLOBE_DEBUG.home());

  check('button mode starts', await debug.startMode(page, 'button'));
  await page.screenshot({ path: path.join(shots, '03a-button-play.png') });
  const edgeShift = await measureEdgeGrabShift(page);
  check('edge grab preserves pointer offset without a piece jump', edgeShift < 28, `piece shifted ${edgeShift.toFixed(1)}px`);
  await dragStagePath(page, [{ x: .705, y: .54 }, { x: .57, y: .465 }, { x: .455, y: .575 }, { x: .355, y: .54 }]);
  await waitForRoundOrEnd(page, 0);
  await page.locator('#fastener').focus();
  for (let index = 0; index < 3; index += 1) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(190);
  }
  const afterKeyboard = await debug.getState(page);
  check('keyboard activation provides the same button fallback', afterKeyboard.transitioning || afterKeyboard.round > 1, JSON.stringify(afterKeyboard));
  if (afterKeyboard.round === 1) await waitForRoundOrEnd(page, 1);
  await completeRemaining(page);
  check('button patch persists', (await debug.getState(page)).completed.includes('button'));
  await page.evaluate(() => QLOBE_DEBUG.home());

  check('snap mode starts', await debug.startMode(page, 'snap'));
  await page.screenshot({ path: path.join(shots, '03b-snap-align.png') });
  await dragStagePath(page, [{ x: .30, y: .62 }, { x: .48, y: .54 }, { x: .68, y: .62 }]);
  check('snap alignment enters press phase', (await debug.getState(page)).phase === 'press');
  await page.screenshot({ path: path.join(shots, '03c-snap-press.png') });
  await debug.fastTimers(page, 1);
  let snapBox = await page.locator('#fastener').boundingBox();
  let snapCenter = center(snapBox);
  await page.mouse.move(snapCenter.x, snapCenter.y);
  await page.mouse.down();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(820);
  const afterBlurredHold = await debug.getState(page);
  check('backgrounding cancels a snap hold without awarding the round', afterBlurredHold.phase === 'press' && afterBlurredHold.round === 0 && !afterBlurredHold.transitioning, JSON.stringify(afterBlurredHold));
  await page.mouse.up();
  await debug.fastTimers(page, 20);
  snapBox = await page.locator('#fastener').boundingBox();
  snapCenter = center(snapBox);
  await page.mouse.move(snapCenter.x, snapCenter.y);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
  await waitForRoundOrEnd(page, 0);
  await completeRemaining(page);
  check('snap patch persists', (await debug.getState(page)).completed.includes('snap'));
  await page.evaluate(() => QLOBE_DEBUG.home());

  check('hook-and-loop mode starts', await debug.startMode(page, 'velcro'));
  await dragStagePath(page, [{ x: .50, y: .59 }, { x: .58, y: .50 }, { x: .71, y: .36 }]);
  check('peel gesture changes to the smooth phase', (await debug.getState(page)).phase === 'smooth');
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(shots, '04a-velcro-smooth.png') });
  await dragStagePath(page, [{ x: .70, y: .58 }, { x: .53, y: .60 }, { x: .34, y: .58 }]);
  await waitForRoundOrEnd(page, 0);
  await page.screenshot({ path: path.join(shots, '04b-velcro-peel.png') });
  await completeRemaining(page);
  const allDone = await debug.getState(page);
  check('all four earned patches persist', ['zipper', 'button', 'snap', 'velcro'].every((id) => allDone.completed.includes(id)), JSON.stringify(allDone.completed));
  const rewardTargets = await targetSizes(page, '#end-screen [data-target]');
  check('reward controls exceed the 96px touch floor', undersized(rewardTargets).length === 0, JSON.stringify(undersized(rewardTargets)));
  await settleReward(page);
  await page.screenshot({ path: path.join(shots, '05-all-patches-reward.png') });
  await page.evaluate(() => QLOBE_DEBUG.home());

  await page.setViewportSize({ width: 568, height: 320 });
  await page.screenshot({ path: path.join(shots, '06-short-landscape.png') });
  check('short landscape keeps four visible mode choices', await page.locator('.felt-mode-card:visible').count() === 4);
  const shortSplashTargets = await targetSizes(page, '#splash-screen [data-target]');
  check('short landscape keeps splash targets at least 96px', undersized(shortSplashTargets).length === 0, JSON.stringify(undersized(shortSplashTargets)));
  check('short landscape zipper mode starts', await debug.startMode(page, 'zipper'));
  await page.waitForTimeout(520);
  await page.screenshot({ path: path.join(shots, '07-short-landscape-play.png') });
  const shortPlayTargets = await targetSizes(page, '#play-screen [data-target]');
  check('short landscape keeps HUD, support, and fastener targets at least 96px', undersized(shortPlayTargets).length === 0, JSON.stringify(undersized(shortPlayTargets)));
  await completeRemaining(page);
  await settleReward(page);
  await page.screenshot({ path: path.join(shots, '08-short-landscape-reward.png') });
  const shortRewardTargets = await targetSizes(page, '#end-screen [data-target]');
  check('short landscape keeps reward targets at least 96px', undersized(shortRewardTargets).length === 0, JSON.stringify(undersized(shortRewardTargets)));
  await page.evaluate(() => QLOBE_DEBUG.home());
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.screenshot({ path: path.join(shots, '09-portrait.png') });
  check('portrait keeps four visible mode choices', await page.locator('.felt-mode-card:visible').count() === 4);
  checkRuntimeSessionClean(reporter, session, 'main game session');
  await session.close();

  const reduced = await openSession(browser, {
    url: `${base}/games/button-zipper-lab/`,
    base,
    viewport: { width: 1180, height: 820 },
    reducedMotion: 'reduce',
    mute: true,
    allowAbortedMedia: true,
    allowRemote: PLATFORM_ANALYTICS,
  });
  check('reduced-motion preference reaches game state', (await debug.getState(reduced.page)).reducedMotion === true);
  await reduced.page.screenshot({ path: path.join(shots, '10-reduced-motion.png') });
  checkRuntimeSessionClean(reporter, reduced, 'reduced-motion session');
  await reduced.close();

  await browser.close();
  finish({ suffix: `; shots in ${shots}` });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
