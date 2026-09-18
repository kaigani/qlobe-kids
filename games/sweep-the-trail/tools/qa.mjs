#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  args, audio, baseUrl, checkSessionClean, createReporter, debug, ensureShots,
  launchChrome, openSession, resolveShots, shooter, targetSizes, undersized,
} from '../../../tools/qa/lib/driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..');
const BASE = baseUrl();
const URL = `${BASE}/games/sweep-the-trail/`;
const SHOTS = await ensureShots(resolveShots(path.join(GAME, 'qa-shots')));
const shot = shooter(SHOTS);
const { check, finish } = createReporter({ style: 'pad' });
const modeIds = ['leaf-lane', 'acorn-bend', 'porch-path'];
const analytics = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];

function open(browser, viewport, reducedMotion = 'no-preference', context = {}) {
  return openSession(browser, {
    url: URL,
    base: BASE,
    viewport,
    reducedMotion,
    context,
    fastTimers: 20,
    allowAbortedMedia: true,
    allowRemote: analytics,
  });
}

async function auditControls(page, label) {
  const sizes = await targetSizes(page, '.mode-card, .sweep-broom, .again-button, .qk-hud-btn');
  const small = undersized(sizes, 96);
  check(`${label} primary controls are at least 96px`, small.length === 0, JSON.stringify(small));
}

function checkClean(session, label) {
  const kept = session.failed.filter((entry) => !analytics.some((prefix) => entry.startsWith(prefix)));
  session.failed.splice(0, session.failed.length, ...kept);
  checkSessionClean({ check }, session, label);
}

async function sweepGeometry(page, pieceId) {
  const targets = await debug.getTargets(page);
  const host = await page.locator('#sweep-host').boundingBox();
  const broom = targets.find((target) => target.id === 'broom')?.rect;
  const piece = targets.find((target) => target.id === `debris-${pieceId}`)?.rect;
  const destination = targets.find((target) => target.id === 'basket' || target.id === 'dustpan')?.rect;
  if (!host || !broom || !piece || !destination) throw new Error('missing sweep targets');
  const center = (rect) => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
  const p = center(piece);
  const t = center(destination);
  const b = center(broom);
  const dx = t.x - p.x;
  const dy = t.y - p.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const behind = { x: p.x - ux * 125, y: p.y - uy * 125 };
  const throughDistance = length + 160;
  const through = { x: p.x + ux * throughDistance, y: p.y + uy * throughDistance };
  const safeX = host.x + host.width * .065;
  const safeY = host.y + host.height * .87;
  const route = [
    { x: b.x, y: safeY },
    { x: safeX, y: safeY },
    { x: safeX, y: behind.y },
    behind,
  ];
  return { broom: b, route, through };
}

async function realSweep(page, pieceId) {
  const { broom, route, through } = await sweepGeometry(page, pieceId);
  await page.mouse.move(broom.x, broom.y);
  await page.mouse.down();
  for (const waypoint of route) await page.mouse.move(waypoint.x, waypoint.y, { steps: 8 });
  await page.mouse.move(through.x, through.y, { steps: 18 });
  await page.mouse.up();
}

async function windowPointer(page, type, event) {
  await page.evaluate(({ eventType, init }) => window.dispatchEvent(new PointerEvent(eventType, {
    bubbles: true,
    ...init,
  })), { eventType: type, init: event });
}

async function realTouchSweep(page, pieceId, pointerId) {
  const { broom, route, through } = await sweepGeometry(page, pieceId);
  await page.dispatchEvent('[data-target="broom"]', 'pointerdown', {
    pointerId, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1,
    clientX: broom.x, clientY: broom.y,
  });
  for (const waypoint of route) {
    await windowPointer(page, 'pointermove', {
      pointerId, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1,
      clientX: waypoint.x, clientY: waypoint.y,
    });
  }
  await windowPointer(page, 'pointermove', {
    pointerId, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1,
    clientX: through.x, clientY: through.y,
  });
  await windowPointer(page, 'pointerup', {
    pointerId, pointerType: 'touch', isPrimary: true, button: 0, buttons: 0,
    clientX: through.x, clientY: through.y,
  });
}

async function sweepUntilCaptured(page, pieceId, sweepOnce, attempts = 8) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const piece = (await debug.getState(page)).board.pieces.find((candidate) => candidate.id === pieceId);
    if (piece?.captured) return true;
    await sweepOnce(attempt);
  }
  return (await debug.getState(page)).board.pieces.find((candidate) => candidate.id === pieceId)?.captured === true;
}

async function main() {
  const browser = await launchChrome({ channel: args.flag('channel', 'chrome') });
  try {
    const landscape = await open(browser, { width: 1440, height: 900 });
    const { page } = landscape;
    await shot(page, '01-splash-landscape.png');
    check('landscape boots on the trail chooser', (await debug.getState(page)).screen === 'splash');
    const modes = await debug.listModes(page);
    check('debug lists all three trails', modeIds.every((id) => modes.some((mode) => mode.id === id)), JSON.stringify(modes));
    await auditControls(page, 'splash');

    await page.locator('#splash-hud .qk-hud-sound').click();
    await debug.waitForAudio(page, 'select-intro');
    check('chooser replay uses recorded teacher clip', audio.heardClip(await debug.getAudioLog(page), 'select-intro'));

    await debug.startMode(page, 'leaf-lane');
    await debug.waitForScreen(page, 'play');
    const before = await debug.getState(page);
    await realSweep(page, 'l1');
    const after = await debug.getState(page);
    const beforeLeaf = before.board.pieces.find((piece) => piece.id === 'l1');
    const afterLeaf = after.board.pieces.find((piece) => piece.id === 'l1');
    check('real mouse sweep moves or captures a leaf', afterLeaf.captured || afterLeaf.x !== beforeLeaf.x || afterLeaf.y !== beforeLeaf.y, JSON.stringify({ beforeLeaf, afterLeaf }));
    check('mouse release clears the active pointer', after.board.active === false);
    await auditControls(page, 'play');
    await shot(page, '02-active-sweep-landscape.png');

    await debug.winRound(page);
    await debug.waitForScreen(page, 'end', { timeout: 5000 });
    check('Leaf Lane reaches the celebration', (await debug.getState(page)).screen === 'end');
    await shot(page, '03-celebration-landscape.png');
    await auditControls(page, 'celebration');

    await page.locator('#again').click();
    await debug.waitForScreen(page, 'play');
    check('Sweep again restarts the same trail', (await debug.getState(page)).mode === 'leaf-lane');
    await page.locator('#play-hud .qk-hud-back').click();
    await debug.waitForScreen(page, 'splash');
    check('play Back returns in-page to the chooser', (await debug.getState(page)).screen === 'splash');

    check('acorn-bend starts', await debug.startMode(page, 'acorn-bend'));
    await debug.waitForScreen(page, 'play');
    check('real mouse sweeps capture a heavy acorn', await sweepUntilCaptured(
      page, 'a1', () => realSweep(page, 'a1'), 8,
    ));
    await shot(page, '07-acorn-active-landscape.png');
    check('acorn-bend debug completion follows real gameplay capture', await debug.winRound(page));
    await debug.waitForScreen(page, 'end', { timeout: 5000 });
    check('acorn-bend reaches celebration', (await debug.getState(page)).screen === 'end');
    await shot(page, '08-acorn-celebration-landscape.png');

    check('porch-path starts', await debug.startMode(page, 'porch-path'));
    await debug.waitForScreen(page, 'play');
    check('porch-path debug completion follows gameplay capture', await debug.winRound(page));
    await debug.waitForScreen(page, 'end', { timeout: 5000 });
    check('porch-path reaches celebration', (await debug.getState(page)).screen === 'end');

    const requiredClips = [
      'select-intro', 'leaf-intro', 'acorn-intro', 'porch-intro',
      'leaf-clear', 'acorn-clear', 'porch-clear',
    ];
    const log = await debug.getAudioLog(page);
    check('trail intros and clear lines use recorded clips', requiredClips.every((key) => audio.heardClip(log, key)), audio.describe(log));

    await debug.startMode(page, 'leaf-lane');
    await debug.waitForScreen(page, 'play');
    const broom = page.locator('[data-target="broom"]');
    await broom.focus();
    const keyBefore = (await debug.getState(page)).board.broom.x;
    await page.keyboard.press('ArrowRight');
    const keyAfter = await debug.getState(page);
    check('keyboard arrow moves the broom', keyAfter.board.broom.x > keyBefore, JSON.stringify(keyAfter.board.broom));
    check('keyboard move leaves no active pointer', keyAfter.board.active === false);
    checkClean(landscape, 'landscape gameplay');
    await landscape.close();

    const portrait = await open(browser, { width: 820, height: 1180 }, 'reduce');
    await debug.startMode(portrait.page, 'leaf-lane');
    await debug.waitForScreen(portrait.page, 'play');
    await shot(portrait.page, '04-play-portrait-reduced-motion.png');
    await auditControls(portrait.page, 'portrait play');
    check('portrait play stays active', (await debug.getState(portrait.page)).phase === 'active');
    const portraitLayout = await debug.call(portrait.page, 'getLayout');
    check('portrait play field fills at least 82% of the viewport height', portraitLayout.tableau.h / portraitLayout.viewport.h >= .82, JSON.stringify(portraitLayout));
    checkClean(portrait, 'portrait reduced-motion');
    await portrait.close();

    const touch = await open(browser, { width: 820, height: 1180 }, 'reduce', { hasTouch: true, isMobile: true });
    await debug.startMode(touch.page, 'porch-path');
    await debug.waitForScreen(touch.page, 'play');
    let touchBox = await touch.page.locator('[data-target="broom"]').boundingBox();
    const firstStart = { x: touchBox.x + touchBox.width / 2, y: touchBox.y + touchBox.height / 2 };
    await touch.page.dispatchEvent('[data-target="broom"]', 'pointerdown', {
      pointerId: 47, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1,
      clientX: firstStart.x, clientY: firstStart.y,
    });
    await windowPointer(touch.page, 'pointermove', {
      pointerId: 47, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1,
      clientX: firstStart.x + 45, clientY: firstStart.y - 35,
    });
    const afterFirstFinger = (await debug.getState(touch.page)).board;

    touchBox = await touch.page.locator('[data-target="broom"]').boundingBox();
    const secondStart = { x: touchBox.x + touchBox.width / 2, y: touchBox.y + touchBox.height / 2 };
    await touch.page.dispatchEvent('[data-target="broom"]', 'pointerdown', {
      pointerId: 48, pointerType: 'touch', isPrimary: false, button: 0, buttons: 1,
      clientX: secondStart.x, clientY: secondStart.y,
    });
    await windowPointer(touch.page, 'pointermove', {
      pointerId: 48, pointerType: 'touch', isPrimary: false, button: 0, buttons: 1,
      clientX: secondStart.x + 70, clientY: secondStart.y - 20,
    });
    const afterSecondFinger = (await debug.getState(touch.page)).board;
    check('a second touch can take over the broom', afterSecondFinger.active && (
      afterSecondFinger.broom.x !== afterFirstFinger.broom.x || afterSecondFinger.broom.y !== afterFirstFinger.broom.y
    ));

    await windowPointer(touch.page, 'pointermove', {
      pointerId: 47, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1,
      clientX: firstStart.x + 65, clientY: firstStart.y - 55,
    });
    await windowPointer(touch.page, 'pointerup', {
      pointerId: 48, pointerType: 'touch', isPrimary: false, button: 0, buttons: 0,
      clientX: secondStart.x + 70, clientY: secondStart.y - 20,
    });
    const afterHandoff = (await debug.getState(touch.page)).board;
    check('lifting the second touch hands control back to the first', afterHandoff.active === true);
    await windowPointer(touch.page, 'pointermove', {
      pointerId: 47, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1,
      clientX: firstStart.x + 95, clientY: firstStart.y - 75,
    });
    const afterReturnMove = (await debug.getState(touch.page)).board;
    check('the first touch continues moving after handoff', afterReturnMove.broom.x !== afterHandoff.broom.x || afterReturnMove.broom.y !== afterHandoff.broom.y);
    await windowPointer(touch.page, 'pointerup', {
      pointerId: 47, pointerType: 'touch', isPrimary: true, button: 0, buttons: 0,
      clientX: firstStart.x + 95, clientY: firstStart.y - 75,
    });
    check('final touch release clears active state', (await debug.getState(touch.page)).board.active === false);

    check('real touch sweeps capture a porch crumb', await sweepUntilCaptured(
      touch.page, 'c1', (attempt) => realTouchSweep(touch.page, 'c1', 60 + attempt), 8,
    ));
    check('porch-path completes after real touch capture', await debug.winRound(touch.page));
    await debug.waitForScreen(touch.page, 'end', { timeout: 5000 });
    checkClean(touch, 'touch context');
    await touch.close();

    const short = await open(browser, { width: 1024, height: 620 }, 'reduce');
    await debug.startMode(short.page, 'porch-path');
    await debug.waitForScreen(short.page, 'play');
    await shot(short.page, '05-play-short-landscape.png');
    await auditControls(short.page, 'short-landscape play');
    check('short-landscape play stays active', (await debug.getState(short.page)).phase === 'active');
    checkClean(short, 'short-landscape');
    await short.close();

    const hub = await openSession(browser, {
      url: `${BASE}/#practical-life`, base: BASE, viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce', ready: false, allowRemote: analytics,
    });
    const card = hub.page.locator('a[href*="sweep-the-trail"]').first();
    check('hub exposes the Sweep the Trail card', await card.isVisible().catch(() => false));
    if (await card.count()) {
      await card.evaluate((element) => element.scrollIntoView({ block: 'center' }));
      await shot(hub.page, '06-hub-practical-life.png');
      await Promise.all([hub.page.waitForURL('**/games/sweep-the-trail/**'), card.click()]);
      await debug.waitForHook(hub.page);
      await debug.waitForReady(hub.page);
      check('hub card boots the game route', (await debug.getState(hub.page)).screen === 'splash');
    }
    checkClean(hub, 'hub route');
    await hub.close();
  } finally {
    await browser.close();
  }
  finish({ suffix: `; shots in ${SHOTS}` });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
