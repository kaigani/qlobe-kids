#!/usr/bin/env node
// Real-Chrome smoke, interaction, responsive, and visual QA for Post Office Letters.
import {
  args, launchChrome, createReporter, openSession, resolveShots, ensureShots,
  shooter, debug, targetSizes, undersized, checkSessionClean,
} from '../../../tools/qa/lib/driver.mjs';

const base = args.flag('base', 'http://127.0.0.1:8000').replace(/\/$/, '');
const url = `${base}/games/post-office-letters/`;
const shots = resolveShots('games/post-office-letters/qa-shots');
const { check, note, finish } = createReporter({ style: 'ok', collapse: true, detailLimit: 260 });
const isPlatformAnalytics = (entry) => entry.includes('googletagmanager.com') || entry.includes('google-analytics.com');

const waitPhase = (page, phase, timeout = 5000) => page.waitForFunction(
  (value) => window.QLOBE_DEBUG.getState().phase === value, phase, { timeout },
);
const state = (page) => debug.getState(page);

function checkClean(session, label) {
  // The shared analytics module is intentionally the one platform exception to
  // the shipped-game no-remote rule; all game/runtime requests remain audited.
  checkSessionClean({ check }, {
    ...session,
    failed: session.failed.filter((entry) => !isPlatformAnalytics(entry)),
    remote: session.remote.filter((entry) => !isPlatformAnalytics(entry)),
  }, label);
}

async function assertActiveTargets(page, label) {
  const rects = await targetSizes(page);
  const offscreen = await page.evaluate(() => window.QLOBE_DEBUG.getTargets()
    .filter(({ rect }) => rect.x < 0 || rect.y < 0
      || rect.x + rect.w > innerWidth || rect.y + rect.h > innerHeight)
    .map(({ id, rect }) => ({ id, rect })));
  check(`${label} visible targets meet 96px minimum`, undersized(rects).length === 0,
    JSON.stringify(undersized(rects)));
  check(`${label} visible targets stay on-screen`, offscreen.length === 0,
    JSON.stringify(offscreen));
}

async function configure(page, seed = 42) {
  await debug.mute(page, true);
  await debug.fastTimers(page, 0.05);
  await debug.seed(page, seed);
}

async function traceName(page, max = 24) {
  for (let i = 0; i < max; i += 1) {
    const before = await state(page);
    if (before.phase !== 'writing') return before;
    await debug.call(page, 'traceCurrent');
    if (i < max - 1) await page.waitForTimeout(30);
  }
  return state(page);
}

async function physicalTraceStroke(page) {
  const model = await debug.call(page, 'getTraceModel');
  const canvas = page.locator('.name-cell.is-current canvas');
  const box = await canvas.boundingBox();
  if (!model?.path?.length || !box) throw new Error('active trace path/canvas is unavailable');
  const at = ({ x, y }) => ({ x: box.x + x * box.width, y: box.y + y * box.height });
  const first = at(model.path[0]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const point of model.path.slice(1)) {
    const next = at(point);
    await page.mouse.move(next.x, next.y);
  }
  await page.mouse.up();
}

async function physicalDrag(page, fromSelector, toSelector) {
  const from = await page.locator(fromSelector).boundingBox();
  const to = await page.locator(toSelector).boundingBox();
  if (!from || !to) throw new Error(`drag endpoint missing: ${fromSelector} -> ${toSelector}`);
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 8 });
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

async function completeCurrentToPickup(page) {
  let current = await state(page);
  if (current.phase === 'arrival') {
    await debug.tap(page, 'mail-piece');
    await waitPhase(page, 'writing');
  }
  current = await traceName(page);
  if (current.phase !== 'stamp') throw new Error(`trace did not reach stamp: ${JSON.stringify(current)}`);
  await debug.call(page, 'chooseStamp', 'heart');
  await waitPhase(page, 'send');
  await debug.call(page, 'sendLetter');
  await waitPhase(page, 'pickup');
  return state(page);
}

async function run() {
  await ensureShots(shots);
  const shot = shooter(shots);
  const visualShot = async (page, name) => {
    await page.waitForTimeout(780);
    return shot(page, name);
  };
  const browser = await launchChrome({ args: ['--autoplay-policy=no-user-gesture-required'] });
  let session = null;
  try {
    session = await openSession(browser, {
      url, base, viewport: { width: 1180, height: 820 }, ready: true, waitUntil: 'networkidle',
      allowAbortedMedia: true,
      after: (page) => configure(page),
    });
    const { page } = session;
    await visualShot(page, '01-splash-desktop');
    check('one mail-shift mode is registered', JSON.stringify(await debug.listModes(page)) .includes('mail-shift'));
    check('splash touch targets meet 96px minimum', undersized(await targetSizes(page)).length === 0);
    await debug.startMode(page, 'mail-shift');
    await waitPhase(page, 'arrival');
    await visualShot(page, '02-arrival-desktop');
    check('shift opens at arrival', (await state(page)).screen === 'play');

    await debug.tap(page, 'mail-piece');
    await waitPhase(page, 'writing');
    await visualShot(page, '03-writing-desktop');
    const traceTarget = (await targetSizes(page)).find(({ id }) => id.startsWith('trace-'));
    check('active lowercase trace target is at least 96px wide', traceTarget?.w >= 96, JSON.stringify(traceTarget));
    const writingBefore = await state(page);
    await physicalTraceStroke(page);
    await page.waitForTimeout(180);
    const writingAfter = await state(page);
    check('physical pointer trace advances the current lowercase',
      writingAfter.letterIndex > writingBefore.letterIndex || writingAfter.phase === 'stamp',
      JSON.stringify({ before: writingBefore, after: writingAfter }));
    const eModel = await debug.call(page, 'getTraceModel');
    const eTurn = eModel?.path?.findIndex((point) => point.y < .5) ?? -1;
    check('lowercase e guide forms left-to-right before its loop',
      eModel?.id === 'e' && eModel.path?.[0]?.x < .3 && eTurn > 0
        && eModel.path[eTurn - 1]?.x > .65,
      JSON.stringify(eModel));
    await visualShot(page, '03b-writing-e-desktop');
    if (writingAfter.phase === 'writing') {
      const keyboardBefore = await state(page);
      await page.locator('.name-cell.is-current canvas').focus();
      await page.keyboard.press('Space');
      await page.waitForTimeout(180);
      const keyboardAfter = await state(page);
      check('Space switch input completes a guided lowercase trace',
        keyboardAfter.letterIndex > keyboardBefore.letterIndex || keyboardAfter.phase === 'stamp',
        JSON.stringify({ before: keyboardBefore, after: keyboardAfter }));
    }
    await traceName(page);
    await waitPhase(page, 'stamp');
    await visualShot(page, '04-stamp-desktop');
    check('stamp tray has usable targets', undersized(await targetSizes(page)).length === 0);
    await page.locator('[data-target="stamp-heart"]').click();
    await waitPhase(page, 'send');
    await visualShot(page, '05-send-desktop');
    await physicalDrag(page, '#mail-piece', '#send-slot');
    await waitPhase(page, 'pickup');
    await visualShot(page, '06-pickup-desktop');
    const pickup = await state(page);
    const wrong = pickup.pickupChoices.find((name) => name !== pickup.recipientPrint);
    await page.locator(`[data-target="pickup-${wrong}"]`).click();
    const stayed = await state(page);
    check('wrong pickup stays in pickup phase', stayed.phase === 'pickup' && stayed.delivered.length === 0, JSON.stringify(stayed));
    await debug.fastTimers(page, 1);
    await physicalDrag(page, `[data-target="pickup-${pickup.recipientPrint}"]`, '#customer-drop');
    await waitPhase(page, 'success');
    check('physical pickup drag succeeds after wrong choice', (await state(page)).phase === 'success');
    await visualShot(page, '07-success-desktop');
    await debug.fastTimers(page, 0.05);

    const audioPackage = await page.evaluate(async () => {
      const [lines, manifest, qa] = await Promise.all([
        fetch('./assets/audio/lines.json').then((r) => r.json()),
        fetch('./assets/audio/manifest.json').then((r) => r.json()),
        fetch('./assets/audio/qa.json').then((r) => r.json()),
      ]);
      return {
        lines: Object.keys(lines).length,
        manifest: Object.keys(manifest).length,
        passing: Object.values(qa).filter((item) => ['pass', 'skip'].includes(item.status) && Number(item.ratio) >= .8).length,
      };
    });
    check('recorded voice manifest and Whisper QA cover every line',
      audioPackage.lines === audioPackage.manifest && audioPackage.lines === audioPackage.passing,
      JSON.stringify(audioPackage));

    // Deterministic full shift. winRound exercises every production state transition.
    await debug.startMode(page, 'mail-shift');
    for (let round = 0; round < 3; round += 1) {
      await debug.winRound(page);
      await page.waitForTimeout(60);
    }
    await waitPhase(page, 'end');
    await visualShot(page, '08-end-desktop');
    const ended = await state(page);
    check('three-round shift reaches end screen', ended.screen === 'end' && ended.phase === 'end' && ended.delivered.length === 3, JSON.stringify(ended));
    check('end-screen targets meet 96px minimum', undersized(await targetSizes(page)).length === 0);
    checkClean(session, 'desktop session');

    await session.close();
    session = await openSession(browser, {
      url, base, viewport: { width: 820, height: 1180 }, ready: true, waitUntil: 'networkidle',
      allowAbortedMedia: true, after: (p) => configure(p, 7),
    });
    await visualShot(session.page, '09-portrait-splash');
    check('portrait splash targets meet 96px minimum', undersized(await targetSizes(session.page)).length === 0);
    await debug.startMode(session.page, 'mail-shift');
    await waitPhase(session.page, 'arrival');
    await visualShot(session.page, '10-portrait-arrival');
    await debug.tap(session.page, 'mail-piece');
    await waitPhase(session.page, 'writing');
    await traceName(session.page);
    await waitPhase(session.page, 'stamp');
    await visualShot(session.page, '12-portrait-stamp');
    await assertActiveTargets(session.page, 'portrait stamp');
    await debug.call(session.page, 'chooseStamp', 'heart');
    await waitPhase(session.page, 'send');
    await debug.call(session.page, 'sendLetter');
    await waitPhase(session.page, 'pickup');
    await visualShot(session.page, '13-portrait-pickup');
    await assertActiveTargets(session.page, 'portrait pickup');
    checkClean(session, 'portrait session');

    await session.close();
    session = await openSession(browser, {
      url, base, viewport: { width: 1180, height: 520 }, reducedMotion: 'reduce', ready: true, waitUntil: 'networkidle',
      allowAbortedMedia: true, after: (p) => configure(p, 9),
    });
    await visualShot(session.page, '11-short-landscape-reduced-motion');
    await assertActiveTargets(session.page, 'short-landscape splash');
    await debug.startMode(session.page, 'mail-shift');
    await waitPhase(session.page, 'arrival');
    await debug.tap(session.page, 'mail-piece');
    await waitPhase(session.page, 'writing');
    await traceName(session.page);
    await waitPhase(session.page, 'stamp');
    await visualShot(session.page, '14-short-landscape-stamp-reduced-motion');
    await assertActiveTargets(session.page, 'short-landscape stamp');
    await debug.call(session.page, 'chooseStamp', 'heart');
    await waitPhase(session.page, 'send');
    await debug.call(session.page, 'sendLetter');
    await waitPhase(session.page, 'pickup');
    await visualShot(session.page, '15-short-landscape-pickup-reduced-motion');
    await assertActiveTargets(session.page, 'short-landscape pickup');
    check('reduced-motion state is active', (await state(session.page)).reducedMotion === true);
    checkClean(session, 'short-landscape reduced-motion session');

    await session.close();
    session = await openSession(browser, {
      url, base, viewport: { width: 1180, height: 820 }, ready: true, waitUntil: 'networkidle',
      allowAbortedMedia: true,
      after: async (p) => { await debug.fastTimers(p, 0.05); await debug.seed(p, 42); },
    });
    await session.page.locator('#start-shift').click();
    await session.page.waitForFunction(
      () => window.QLOBE_DEBUG.getAudioLog().some((entry) => entry.kind === 'clip'),
      null,
      { timeout: 8000 },
    );
    const clipLog = await debug.call(session.page, 'getAudioLog');
    check('a real first gesture plays recorded teacher narration', clipLog.some((entry) => entry.kind === 'clip'));
    checkClean(session, 'recorded-audio session');
    note(`screenshots in ${shots}`);
  } catch (error) {
    check('QA flow completed', false, error.stack || error.message);
  } finally {
    if (session) await session.close();
    await browser.close();
  }
  finish({ suffix: `; shots in ${shots}` });
}

run();
