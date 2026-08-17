#!/usr/bin/env node
// Real-Chrome production QA for Obstacle Course Builder.
//
//   python3 -m http.server 8765
//   node games/obstacle-course-builder/tools/qa.mjs --base http://127.0.0.1:8765

import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  baseUrl, launchChrome, createReporter, openSession, checkSessionClean,
  debug, audio, resolveShots, ensureShots, shooter, targetSizes, undersized,
} from '../../../tools/qa/lib/driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = baseUrl('http://127.0.0.1:8765');
const GAME_URL = `${BASE}/games/obstacle-course-builder/`;
const SHOTS = resolveShots(path.resolve(HERE, '..', 'qa-shots'));
const ALLOW_REMOTE = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];
const { check, note, results, notes, finish } = createReporter({ style: 'pad', detailOnFail: true });
const shot = shooter(SHOTS);

async function open(browser, viewport, { reducedMotion = 'no-preference', mute = true } = {}) {
  return openSession(browser, {
    url: GAME_URL,
    base: BASE,
    viewport,
    reducedMotion,
    allowRemote: ALLOW_REMOTE,
    allowDataUrls: true,
    allowAbortedMedia: true,
    seed: 42,
    fastTimers: 20,
    mute,
  });
}

async function allImagesReady(page) {
  return page.locator('img[src]').evaluateAll((images) => images
    .filter((image) => image.getAttribute('src'))
    .every((image) => image.complete && image.naturalWidth > 0));
}

function ignoreClosedAnalytics(session) {
  const keep = session.failed.filter((entry) => !ALLOW_REMOTE.some((prefix) => entry.startsWith(prefix)));
  session.failed.splice(0, session.failed.length, ...keep);
}

async function viewportFits(page) {
  return page.evaluate(() => ({
    x: document.documentElement.scrollWidth <= innerWidth + 1,
    y: document.documentElement.scrollHeight <= innerHeight + 1,
  }));
}

async function slideGeometry(page) {
  return page.locator('.slide-controls').evaluate((controls) => {
    const points = JSON.parse(controls.dataset.routePoints || '[]');
    const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
    const segments = [...controls.querySelectorAll('.slide-route-segment')].map((segment) => {
      const angle = Number(segment.style.transform.match(/rotate\(([-\d.]+)rad\)/)?.[1]);
      const start = {
        x: Number.parseFloat(segment.style.left),
        y: Number.parseFloat(segment.style.top) + segment.offsetHeight / 2,
      };
      return {
        start,
        end: {
          x: start.x + Number.parseFloat(segment.style.width) * Math.cos(angle),
          y: start.y + Number.parseFloat(segment.style.width) * Math.sin(angle),
        },
      };
    });
    const endpointDeltas = segments.flatMap((segment, index) => [
      distance(segment.start, points[index]),
      distance(segment.end, points[index + 1]),
    ]);
    const controlsRect = controls.getBoundingClientRect();
    const legs = points.slice(0, -1).map((point, index) => ({
      from: point,
      to: points[index + 1],
      length: distance(point, points[index + 1]),
    }));
    const total = legs.reduce((sum, leg) => sum + leg.length, 0);
    const sample = (progress) => {
      let remaining = progress * total;
      for (const leg of legs) {
        if (remaining <= leg.length) {
          const amount = leg.length ? remaining / leg.length : 0;
          return {
            x: leg.from.x + (leg.to.x - leg.from.x) * amount,
            y: leg.from.y + (leg.to.y - leg.from.y) * amount,
          };
        }
        remaining -= leg.length;
      }
      return points.at(-1);
    };
    const gateDeltas = [...controls.querySelectorAll('.slide-gates img')].map((gate) => {
      const rect = gate.getBoundingClientRect();
      const center = { x: rect.left + rect.width / 2 - controlsRect.left, y: rect.top + rect.height / 2 - controlsRect.top };
      return distance(center, sample(Number(gate.dataset.routeProgress)));
    });
    return {
      pointCount: points.length,
      segmentCount: segments.length,
      gateCount: gateDeltas.length,
      maxEndpointDelta: Math.max(0, ...endpointDeltas),
      maxGateDelta: Math.max(0, ...gateDeltas),
    };
  });
}

function checkSlideGeometry(name, geometry) {
  check(`${name} uses one connected measured route`,
    geometry.pointCount === 4 && geometry.segmentCount === 3 && geometry.maxEndpointDelta <= 10,
    JSON.stringify(geometry));
  check(`${name} centers every gate on that route`, geometry.gateCount >= 2 && geometry.maxGateDelta <= 2,
    JSON.stringify(geometry));
}

async function builderScenario(browser) {
  const run = await open(browser, { width: 1180, height: 820 });
  const { page } = run;
  check('splash boots', (await debug.getState(page)).screen === 'splash');
  check('three worlds are registered', (await debug.listModes(page)).length === 3);
  check('splash production images decode', await allImagesReady(page));
  const splashTargets = await targetSizes(page, '#splash [data-target], #splash [data-hud]');
  check('splash child-facing controls meet the 96px touch floor', splashTargets.length >= 5 && undersized(splashTargets, 96).length === 0, JSON.stringify(undersized(splashTargets, 96)));
  await shot(page, '01-splash-landscape');

  // World cards are a two-step activation: the first gesture selects and
  // previews the world on the splash, while the second enters the builder.
  await debug.call(page, 'clearSavedState');
  await debug.mute(page, false);
  await debug.call(page, 'clearAudioLog');
  await page.locator('[data-target="world-backyard"]').click();
  await debug.waitForAudio(page, 'world-backyard');
  let splashState = await debug.getState(page);
  check('first world-card activation stays on splash', splashState.screen === 'splash' && splashState.worldId === 'backyard');
  check('first world-card activation reveals Splash Play', await page.locator('#splash-play').isVisible());
  check('first world-card activation logs world audio', (await debug.getAudioLog(page)).some((entry) => entry.key === 'world-backyard'));
  await page.locator('[data-target="world-backyard"]').click();
  check('second selected world-card activation enters builder', (await debug.getState(page)).screen === 'builder');
  await debug.mute(page, true);

  await debug.startMode(page, 'backyard');
  const requiredDebugMethods = ['selectWorld','getCourse','place','remove','swap','setColor','undo','startTraversal','completeAction','nextStation','getActionState','clearSavedState','loadSavedState','getAudioLog','clearAudioLog'];
  const missingDebugMethods = await page.evaluate((names) => names.filter((name) => typeof window.QLOBE_DEBUG?.[name] !== 'function'), requiredDebugMethods);
  check('required QLOBE_DEBUG production methods exist', missingDebugMethods.length === 0, JSON.stringify(missingDebugMethods));
  await debug.call(page, 'setCourse', { cells: [], kinds: [] });
  await page.evaluate(() => QLOBE_DEBUG.mute(false));
  for (let count = 0; count < 3; count += 1) {
    await debug.call(page, 'clearAudioLog');
    await debug.tap(page, 'play-course');
    await debug.waitForAudio(page, 'need-three');
    const blocked = await debug.getState(page);
    check(`play remains in builder with ${count} nodes`, blocked.screen === 'builder');
    check(`play with ${count} nodes requests need-three`, (await debug.getAudioLog(page)).some((entry) => entry.key === 'need-three'));
    check(`play with ${count} nodes flashes three empty cells`, await page.locator('.course-cell.is-empty-glow').count() === 3);
    if (count < 2) {
      await debug.tap(page, `tray-${['tunnel','wall'][count]}`);
      await debug.tap(page, `cell-c${count}-r1`);
    }
  }
  await page.evaluate(() => QLOBE_DEBUG.mute(true));
  await debug.call(page, 'setCourse', {
    cells: ['c0-r1', 'c1-r0', 'c2-r1', 'c3-r2'],
    kinds: ['tunnel', 'wall', 'hop', 'carry'],
  });
  await page.waitForTimeout(100);
  let state = await debug.getState(page);
  check('debug course preserves all four authored modules', state.course.map((node) => node.kind).join(',') === 'tunnel,wall,hop,carry', JSON.stringify(state.course));
  check('builder draws Start, course, and Finish as one route', (await debug.call(page, 'getLayout')).routeSegments === 5);
  const sizes = await targetSizes(page, '.module-card[data-target], .course-cell[data-target], .tool-button[data-target], #play-course');
  const small = undersized(sizes, 96);
  check('landscape builder controls meet the 96px touch floor', small.length === 0, JSON.stringify(small));
  check('builder production images decode', await allImagesReady(page));
  await shot(page, '02-builder-landscape');

  await debug.call(page, 'setCourse', { cells: [], kinds: [] });
  await debug.tap(page, 'tray-tunnel');
  await debug.tap(page, 'cell-c0-r1');
  state = await debug.getState(page);
  check('tap obstacle then cell places a module', state.course.length === 1 && state.course[0].kind === 'tunnel');

  const source = await page.locator('[data-target="tray-wall"]').boundingBox();
  const target = await page.locator('[data-target="cell-c1-r1"]').boundingBox();
  const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  await page.mouse.move(sourceCenter.x, sourceCenter.y);
  await page.mouse.down();
  await page.mouse.move(sourceCenter.x + (targetCenter.x - sourceCenter.x) * .9, sourceCenter.y + (targetCenter.y - sourceCenter.y) * .9, { steps: 12 });
  await page.locator('[data-qk-drag-ghost]').waitFor({ state: 'visible' });
  check('builder drag peak exposes one lifted piece and a destination hover',
    await page.locator('[data-qk-drag-ghost]').count() === 1
      && await page.locator('.course-cell.is-drop-hover').count() === 1);
  await shot(page, '02c-builder-drag-peak');
  await page.mouse.move(targetCenter.x, targetCenter.y, { steps: 5 });
  await page.mouse.up();
  state = await debug.getState(page);
  check('real pointer drag places a second module', state.course.length === 2 && state.course[1].kind === 'wall', JSON.stringify(state.course));

  await debug.tap(page, 'tray-hop');
  await debug.tap(page, 'cell-c2-r1');
  state = await debug.getState(page);
  const tunnelId = state.course[0].id;
  const wallId = state.course[1].id;
  const hopId = state.course[2].id;
  await debug.tap(page, `node-${hopId}`);
  await debug.tap(page, `node-${wallId}`);
  await debug.tap(page, 'palette');
  await debug.tap(page, 'color-berry');
  state = await debug.getState(page);
  check('selected placed module accepts a direct color stamp', state.course[1].color === 'berry');
  await debug.tap(page, 'undo');
  state = await debug.getState(page);
  check('undo restores the prior module color', state.course[1].color === 'sunny');
  const beforeSwap = state.course.map((node) => node.cell);
  const beforeSwapContent = state.course.map((node) => `${node.kind}:${node.color}`);
  await debug.tap(page, `node-${tunnelId}`);
  await debug.tap(page, `node-${wallId}`);
  state = await debug.getState(page);
  check('tap two placed modules keeps their board positions', state.course[0].cell === beforeSwap[0] && state.course[1].cell === beforeSwap[1], JSON.stringify(state.course));
  check('tap two placed modules swaps their content', `${state.course[0].kind}:${state.course[0].color}` === beforeSwapContent[1] && `${state.course[1].kind}:${state.course[1].color}` === beforeSwapContent[0], JSON.stringify(state.course));

  // Replacing a colored occupied cell with a tray module starts it sunny.
  await debug.call(page, 'setColor', 0, 'berry');
  await debug.tap(page, 'tray-hop');
  await debug.tap(page, 'cell-c0-r1');
  state = await debug.getState(page);
  check('replacing an occupied colored node resets to sunny', state.course.some((node) => node.cell === 'c0-r1' && node.kind === 'hop' && node.color === 'sunny'), JSON.stringify(state.course));

  // A real pointer drag to the scrap slot removes the placed module.
  const dragNode = state.course.find((node) => node.cell === 'c0-r1');
  const dragSource = await page.locator(`[data-target="node-${dragNode.id}"]`).boundingBox();
  const scrapTarget = await page.locator('[data-scrap-slot]').boundingBox();
  await page.mouse.move(dragSource.x + dragSource.width / 2, dragSource.y + dragSource.height / 2);
  await page.mouse.down();
  await page.mouse.move(scrapTarget.x + scrapTarget.width / 2, scrapTarget.y + scrapTarget.height / 2, { steps: 8 });
  await page.mouse.up();
  check('real pointer drag to scrap removes a placed module', !(await debug.call(page, 'getCourse')).some((node) => node.id === dragNode.id));

  // Scrap tap without a selection is a no-op; a held primary pointer clears once and is undoable.
  await debug.call(page, 'setCourse', { cells: ['c0-r1', 'c1-r0', 'c2-r1'], kinds: ['tunnel', 'wall', 'hop'] });
  const peelBefore = await debug.call(page, 'getCourse');
  await page.locator('[data-scrap-slot]').click();
  check('scrap tap with no selection does not clear the course', (await debug.call(page, 'getCourse')).length === 3);

  await debug.tap(page, `node-${peelBefore[0].id}`);
  await debug.tap(page, 'palette');
  await debug.tap(page, `node-${peelBefore[0].id}`);
  check('tapping the selected node dismisses its palette and selection', !(await page.locator('#swatch-popover').isVisible()) && (await debug.getState(page)).selectedNodeId === null);

  await debug.tap(page, `node-${peelBefore[0].id}`);
  await page.locator('[data-scrap-slot]').click();
  check('normal selected Scrap tap removes only one obstacle', (await debug.call(page, 'getCourse')).length === 2);
  await debug.tap(page, 'undo');
  check('Undo restores the single obstacle removed by a normal Scrap tap', JSON.stringify(await debug.call(page, 'getCourse')) === JSON.stringify(peelBefore));

  const peelBox = await page.locator('[data-scrap-slot]').boundingBox();
  await page.mouse.move(peelBox.x + peelBox.width / 2, peelBox.y + peelBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(180);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(620);
  await page.mouse.up();
  check('blur cancels an armed Scrap hold before it can clear', JSON.stringify(await debug.call(page, 'getCourse')) === JSON.stringify(peelBefore) && await page.locator('.course-wrap.is-peeling').count() === 0);

  await debug.fastTimers(page, 1);
  await page.mouse.move(peelBox.x + peelBox.width / 2, peelBox.y + peelBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(950);
  check('primary scrap hold visibly enters peeling state', await page.locator('.course-wrap.is-peeling').count() === 1);
  await shot(page, '02e-builder-clear-peel');
  await page.mouse.up();
  await page.waitForTimeout(500);
  check('scrap hold clears the whole course once', (await debug.call(page, 'getCourse')).length === 0);
  await debug.tap(page, 'undo');
  check('undo restores the exact pre-peel course', JSON.stringify(await debug.call(page, 'getCourse')) === JSON.stringify(peelBefore));
  await debug.fastTimers(page, 20);

  await debug.tap(page, 'node-' + peelBefore[0].id);
  await debug.tap(page, 'palette');
  await page.mouse.click(8, 8);
  check('outside pointer dismisses palette and clears selection', !(await page.locator('#swatch-popover').isVisible()) && (await debug.getState(page)).selectedNodeId === null);

  const dragNode2 = peelBefore[0];
  const dragBox2 = await page.locator(`[data-target="node-${dragNode2.id}"]`).boundingBox();
  await page.mouse.move(dragBox2.x + dragBox2.width / 2, dragBox2.y + dragBox2.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragBox2.x + 120, dragBox2.y + 20, { steps: 5 });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(80);
  check('window blur cancels builder drag without ghost or hover', await page.locator('[data-qk-drag-ghost], .course-cell.is-drop-hover, .module-card.is-pressed, .course-node.is-pressed, #scrap-button.is-drop-ready').count() === 0 && JSON.stringify(await debug.call(page, 'getCourse')) === JSON.stringify(peelBefore));
  await page.mouse.up();

  ignoreClosedAnalytics(run);
  checkSessionClean({ check }, run, 'builder landscape');
  await run.close();
}

async function contractScenario(browser) {
  const run = await open(browser, { width: 1180, height: 820 });
  const { page } = run;
  await debug.startMode(page, 'backyard');
  await debug.call(page, 'setCourse', { cells: [], kinds: [] });

  await debug.call(page, 'place', 'tunnel', 0);
  await debug.call(page, 'place', 'wall', 1);
  await debug.call(page, 'place', 'hop', 2);
  let course = await debug.call(page, 'getCourse');
  check('semantic place builds through the production edit path', course.map((node) => node.kind).join(',') === 'tunnel,wall,hop', JSON.stringify(course));
  const originalCells = course.map((node) => node.cell);
  const originalContent = course.map((node) => `${node.kind}:${node.color}`);
  await debug.call(page, 'swap', 0, 1);
  course = await debug.call(page, 'getCourse');
  check('semantic swap keeps live board cells fixed', course[0].cell === originalCells[0] && course[1].cell === originalCells[1], JSON.stringify(course));
  check('semantic swap exchanges live content', `${course[0].kind}:${course[0].color}` === originalContent[1] && `${course[1].kind}:${course[1].color}` === originalContent[0], JSON.stringify(course));
  await debug.call(page, 'setColor', 0, 'berry');
  check('semantic color uses the live recolor operation', (await debug.call(page, 'getCourse'))[0].color === 'berry');
  await debug.call(page, 'remove', 2);
  check('semantic remove uses the live scrap operation', (await debug.call(page, 'getCourse')).length === 2);
  await debug.call(page, 'undo');
  check('semantic undo restores the removed node', (await debug.call(page, 'getCourse')).length === 3);
  await debug.call(page, 'place', course[0].kind, 3, 0);
  check('semantic place moves an existing source index', (await debug.call(page, 'getCourse'))[0].cell === 'c3-r0');

  const snapshot = {
    version: 1,
    selectedWorld: 'jungle',
    courses: {
      backyard: [],
      jungle: [
        { id: 'bad-1', kind: 'unknown', color: 'sunny', cell: 'c0-r0' },
        { id: 'bad-2', kind: 'tunnel', color: 'sunny', cell: 'outside' },
        { id: 'same', kind: 'tunnel', color: 'sunny', cell: 'c0-r0' },
        { id: 'same', kind: 'wall', color: 'berry', cell: 'c1-r0' },
        { id: '', kind: 'hop', color: 'ocean', cell: 'c2-r0' },
        { id: 'four', kind: 'carry', color: 'sunny', cell: 'c3-r0' },
        { id: 'five', kind: 'tunnel', color: 'sunny', cell: 'c0-r1' },
        { id: 'duplicate-cell', kind: 'wall', color: 'sunny', cell: 'c0-r1' },
        { id: 'six', kind: 'hop', color: 'sunny', cell: 'c1-r1' },
      ],
      arctic: [],
    },
  };
  await debug.call(page, 'loadSavedState', snapshot);
  let state = await debug.getState(page);
  course = await debug.call(page, 'getCourse', 'jungle');
  check('versioned persistence restores the selected world without auto-launching', state.screen === 'splash' && state.worldId === 'jungle');
  check('persistence skips malformed leaders and retains five valid nodes', course.length === 5, JSON.stringify(course));
  check('persistence repairs duplicate and missing node ids', new Set(course.map((node) => node.id)).size === 5 && course.every((node) => node.id));
  check('persistence keeps the earliest occupied cell only', new Set(course.map((node) => node.cell)).size === 5);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await debug.waitForHook(page);
  await debug.waitForReady(page);
  state = await debug.getState(page);
  check('versioned state survives a real reload', state.screen === 'splash' && state.worldId === 'jungle' && (await debug.call(page, 'getCourse', 'jungle')).length === 5);
  await debug.call(page, 'clearSavedState');
  state = await debug.getState(page);
  const clearedCourses = await Promise.all(['backyard', 'jungle', 'arctic'].map((world) => debug.call(page, 'getCourse', world)));
  check('clearSavedState resets selection and every course', state.worldId === null && clearedCourses.every((savedCourse) => savedCourse.length === 0));
  await page.evaluate(() => localStorage.setItem('qlo.be/obstacle-course-builder/v1', '{not-json'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await debug.waitForHook(page);
  await debug.waitForReady(page);
  state = await debug.getState(page);
  check('malformed storage fails closed to an empty splash', state.screen === 'splash' && state.worldId === null && state.course.length === 0);

  ignoreClosedAnalytics(run);
  checkSessionClean({ check }, run, 'debug and persistence');
  await run.close();
}

async function recoveryScenario(browser) {
  const run = await open(browser, { width: 1180, height: 820 });
  const { page } = run;
  const courseSpec = {
    cells: ['c0-r1', 'c1-r0', 'c2-r1'],
    kinds: ['tunnel', 'wall', 'hop'],
  };
  const semantic = (course) => course.map(({ kind, color, cell }) => ({ kind, color, cell }));

  await debug.startMode(page, 'backyard');
  await debug.call(page, 'setCourse', courseSpec);
  const expected = semantic(await debug.call(page, 'getCourse'));

  async function liftTrayPiece() {
    const source = await page.locator('[data-target="tray-carry"]').boundingBox();
    const destination = await page.locator('[data-target="cell-c3-r2"]').boundingBox();
    await page.evaluate(() => {
      window.__qkQaPointerId = null;
      window.addEventListener('pointerdown', (event) => { window.__qkQaPointerId = event.pointerId; }, { once: true, capture: true });
    });
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(destination.x + destination.width * .35, destination.y + destination.height * .35, { steps: 6 });
    await page.locator('[data-qk-drag-ghost]').waitFor({ state: 'visible' });
    return page.evaluate(() => window.__qkQaPointerId);
  }

  async function expectBuilderRecovered(label) {
    await page.waitForTimeout(40);
    const course = semantic(await debug.call(page, 'getCourse'));
    check(label, await page.locator('[data-qk-drag-ghost], .is-drop-hover, .module-card.is-pressed, .course-node.is-pressed, #scrap-button.is-drop-ready').count() === 0
      && JSON.stringify(course) === JSON.stringify(expected), JSON.stringify(course));
    await page.mouse.up();
  }

  async function pressPlacedNodeWithoutLift() {
    const source = await page.locator('.course-node').first().boundingBox();
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.waitForFunction(() => document.querySelector('.course-node.is-pressed')
      && document.querySelector('#scrap-button.is-drop-ready'));
  }

  await pressPlacedNodeWithoutLift();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expectBuilderRecovered('blur clears pre-lift Builder press and Scrap feedback');

  await pressPlacedNodeWithoutLift();
  await debug.call(page, 'setCourse', courseSpec);
  await expectBuilderRecovered('Builder rerender clears pre-lift press and Scrap feedback');

  let pointerId = await liftTrayPiece();
  await page.evaluate((id) => window.dispatchEvent(new PointerEvent('pointercancel', {
    pointerId: id, pointerType: 'mouse', isPrimary: true, bubbles: true,
  })), pointerId);
  await expectBuilderRecovered('pointercancel restores the Builder without committing a drop');

  pointerId = await liftTrayPiece();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expectBuilderRecovered('hidden visibility cancels a Builder drag cleanly');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  pointerId = await liftTrayPiece();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
  await expectBuilderRecovered('pagehide cancels a Builder drag cleanly');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));

  pointerId = await liftTrayPiece();
  await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
  await expectBuilderRecovered('orientation change cancels a Builder drag without changing the course');

  pointerId = await liftTrayPiece();
  await debug.call(page, 'setCourse', courseSpec);
  await expectBuilderRecovered('Builder rerender cancels an airborne drag and removes its ghost');

  const source = await page.locator('[data-target="tray-carry"]').boundingBox();
  await page.evaluate(({ x, y }) => {
    const target = document.querySelector('[data-target="tray-carry"]');
    target.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, pointerId: 91, pointerType: 'touch',
      isPrimary: false, clientX: x, clientY: y,
    }));
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, cancelable: true, pointerId: 91, pointerType: 'touch',
      isPrimary: false, clientX: x + 120, clientY: y + 40,
    }));
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, cancelable: true, pointerId: 91, pointerType: 'touch',
      isPrimary: false, clientX: x + 120, clientY: y + 40,
    }));
  }, { x: source.x + source.width / 2, y: source.y + source.height / 2 });
  check('a non-primary second finger cannot start or commit a Builder drag', await page.locator('[data-qk-drag-ghost]').count() === 0
    && JSON.stringify(semantic(await debug.call(page, 'getCourse'))) === JSON.stringify(expected));

  const realSource = await page.locator('[data-target="tray-carry"]').boundingBox();
  const realTarget = await page.locator('[data-target="cell-c3-r2"]').boundingBox();
  await page.mouse.move(realSource.x + realSource.width / 2, realSource.y + realSource.height / 2);
  await page.mouse.down();
  await page.mouse.move(realTarget.x + realTarget.width / 2, realTarget.y + realTarget.height / 2, { steps: 8 });
  await page.mouse.up();
  check('Builder accepts a fresh drag after every recovery path', (await debug.call(page, 'getCourse')).length === 4);

  await debug.call(page, 'setCourse', {
    cells: ['c0-r1', 'c1-r0', 'c2-r1'],
    kinds: ['carry', 'tunnel', 'wall'],
  });
  await debug.call(page, 'startTraversal');
  const carryItem = await page.locator('[data-target="carry-item"]').boundingBox();
  const carryGoal = await page.locator('[data-target="carry-goal"]').boundingBox();
  await page.mouse.move(carryItem.x + carryItem.width / 2, carryItem.y + carryItem.height / 2);
  await page.mouse.down();
  await page.mouse.move((carryItem.x + carryGoal.x) / 2, (carryItem.y + carryGoal.y) / 2, { steps: 6 });
  await page.locator('[data-qk-drag-ghost]').waitFor({ state: 'visible' });
  await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
  await page.waitForTimeout(50);
  await page.mouse.up();
  let action = await debug.call(page, 'getActionState');
  check('orientation recovery returns the loose carry prop and leaves input available', action.action === 'carry'
    && action.carry.selected === false && action.carry.placed === false && action.busy === false
    && await page.locator('[data-qk-drag-ghost]').count() === 0, JSON.stringify(action));
  await debug.tap(page, 'carry-item');
  await debug.tap(page, 'carry-goal');
  await page.waitForFunction(() => QLOBE_DEBUG.getState().action === 'crawl');

  const crawlStage = await page.locator('#action-stage').boundingBox();
  await page.evaluate(() => {
    window.__qkQaPointerId = null;
    window.addEventListener('pointerdown', (event) => { window.__qkQaPointerId = event.pointerId; }, { once: true, capture: true });
  });
  await page.mouse.move(crawlStage.x + crawlStage.width * .2, crawlStage.y + crawlStage.height * .2);
  await page.mouse.down();
  await page.mouse.move(crawlStage.x + crawlStage.width * .48, crawlStage.y + crawlStage.height * .2, { steps: 7 });
  const crawlProgress = (await debug.call(page, 'getActionState')).progress;
  const crawlPointer = await page.evaluate(() => window.__qkQaPointerId);
  await page.evaluate((id) => window.dispatchEvent(new PointerEvent('pointercancel', {
    pointerId: id, pointerType: 'mouse', isPrimary: true, bubbles: true,
  })), crawlPointer);
  await page.mouse.up();
  action = await debug.call(page, 'getActionState');
  check('crawl pointercancel keeps committed normalized progress and unlocks input', action.action === 'crawl'
    && action.progress === crawlProgress && action.progress > 0 && action.progress < .88 && action.busy === false, JSON.stringify(action));
  await debug.tap(page, 'crawl-entrance');
  await debug.tap(page, 'crawl-exit');
  await page.waitForFunction(() => QLOBE_DEBUG.getState().action === 'climb');
  check('crawl remains completable after pointer cancellation', (await debug.getState(page)).action === 'climb');

  await debug.startMode(page, 'arctic');
  await debug.call(page, 'setCourse', {
    cells: ['c0-r2', 'c1-r1', 'c2-r1'],
    kinds: ['slide', 'slide', 'slide'],
  });
  await debug.call(page, 'startTraversal');
  await debug.tap(page, 'slide-left');
  await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
  await page.waitForTimeout(50);
  action = await debug.call(page, 'getActionState');
  check('slide orientation recovery preserves collected gates and the next direction', action.gates.collected === 1
    && await page.locator('.slide-arrow[data-dir="right"].is-active').count() === 1, JSON.stringify(action));
  for (const direction of ['right', 'left', 'right']) await debug.tap(page, `slide-${direction}`);
  await debug.tap(page, 'slide-landing');
  await debug.waitForScreen(page, 'end');
  check('slide remains completable after orientation recovery', (await debug.getState(page)).screen === 'end');

  ignoreClosedAnalytics(run);
  checkSessionClean({ check }, run, 'interaction recovery');
  await run.close();
}

async function playScenario(browser) {
  const run = await open(browser, { width: 1180, height: 820 });
  const { page } = run;
  await debug.startMode(page, 'backyard');
  await debug.call(page, 'setCourse', {
    cells: ['c0-r1', 'c1-r0', 'c2-r1', 'c3-r2'],
    kinds: ['tunnel', 'wall', 'hop', 'carry'],
  });
  await debug.tap(page, 'play-course');
  await debug.waitForScreen(page, 'play');
  let state = await debug.getState(page);
  check('play starts with the built crawl station', state.action === 'crawl' && state.stationCount === 4, JSON.stringify(state));
  const crawlTargets = await targetSizes(page, '#play [data-target], #play [data-hud]');
  check('crawl child-facing controls meet the 96px touch floor', crawlTargets.length >= 4 && undersized(crawlTargets, 96).length === 0, JSON.stringify(undersized(crawlTargets, 96)));
  await shot(page, '03-play-crawl');

  await debug.tap(page, 'play-back');
  await debug.waitForScreen(page, 'splash');
  check('Play Back returns to World Select and preserves the build', (await debug.call(page, 'getCourse', 'backyard')).length === 4);
  await debug.startMode(page, 'backyard');
  await debug.tap(page, 'play-course');
  await debug.waitForScreen(page, 'play');

  await debug.tap(page, 'crawl-entrance');
  await debug.tap(page, 'crawl-exit');
  await page.waitForFunction(() => QLOBE_DEBUG.getState().action === 'climb');
  const orderedTargets = await targetSizes(page, '#action-stage .action-target');
  check('ordered action targets meet the 96px touch floor', orderedTargets.length === 4 && undersized(orderedTargets, 96).length === 0, JSON.stringify(undersized(orderedTargets, 96)));
  await shot(page, '03b-play-climb-on-holds');
  await debug.tap(page, 'climb-2');
  check('wrong climb hold retains progress', (await debug.call(page, 'getActionState')).completedSteps === 0);
  check('wrong climb briefly shows correcting feedback', await page.locator('.action-target.is-correcting').count() === 1);
  for (const id of ['climb-1', 'climb-2', 'climb-3', 'climb-4']) await debug.tap(page, id);
  await page.waitForFunction(() => QLOBE_DEBUG.getState().action === 'hop');
  await shot(page, '04-play-hop');
  await debug.tap(page, 'hop-2');
  check('wrong hop surface retains progress', (await debug.call(page, 'getActionState')).completedSteps === 0);
  check('wrong hop briefly shows correcting feedback', await page.locator('.action-target.is-correcting').count() === 1);
  for (const id of ['hop-1', 'hop-2']) await debug.tap(page, id);
  await debug.fastTimers(page, 1);
  await debug.tap(page, 'hop-3');
  check('final hop exposes balancing state before advancement', await page.locator('.station-card.is-balancing').count() === 1);
  await debug.fastTimers(page, 20);
  await page.waitForFunction(() => QLOBE_DEBUG.getState().action === 'carry');
  await shot(page, '04b-carry-idle');
  await debug.tap(page, 'carry-item');
  check('tap carry fallback selects the loose object', (await debug.call(page, 'getActionState')).carry.selected === true);
  await shot(page, '04c-carry-selected');
  await debug.fastTimers(page, 1);
  await debug.mute(page, false);
  await debug.clearAudioLog(page);
  const carry = await page.locator('[data-target="carry-item"]').boundingBox();
  const basket = await page.locator('[data-target="carry-goal"]').boundingBox();
  const carryStart = { x: carry.x + carry.width / 2, y: carry.y + carry.height / 2 };
  const carryEnd = { x: basket.x + basket.width / 2, y: basket.y + basket.height / 2 };
  await page.mouse.move(carryStart.x, carryStart.y);
  await page.mouse.down();
  await page.mouse.move(carryStart.x + (carryEnd.x - carryStart.x) * .62, carryStart.y + (carryEnd.y - carryStart.y) * .62, { steps: 10 });
  await shot(page, '04d-carry-drag-peak');
  await page.mouse.move(carryEnd.x, carryEnd.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(() => QLOBE_DEBUG.getActionState().carry?.placed === true);
  await page.waitForTimeout(460);
  await shot(page, '04e-carry-placed');
  await debug.waitForScreen(page, 'end');
  await debug.waitForAudio(page, 'real-world-invite', { timeout: 15000 });
  const finishLog = await debug.getAudioLog(page);
  const completeLine = finishLog.find((entry) => entry.key === 'course-complete');
  const inviteLine = finishLog.find((entry) => entry.key === 'real-world-invite');
  const manifest = await page.evaluate(() => fetch('./assets/audio/manifest.json').then((response) => response.json()));
  const minimumGap = (manifest['course-complete']?.dur || 0) * 1000 + 280;
  check('finish waits for the completion clip plus 300ms before the safety invite', completeLine && inviteLine && inviteLine.at - completeLine.at >= minimumGap, JSON.stringify({ completeLine, inviteLine, minimumGap }));
  check('crawl, climb, hop, and real carry drag reach the finish', (await debug.getState(page)).screen === 'end');
  check('deeper screens contain no home control', await page.locator('#play [data-hud="home"], #end [data-hud="home"]').count() === 0);
  check('finish child-facing controls meet the 96px touch floor', undersized(await targetSizes(page, '#end button, #end [role="button"]'), 96).length === 0);
  await shot(page, '05-finish-backyard');
  await debug.clearAudioLog(page);
  await debug.tap(page, 'build-another');
  await debug.waitForScreen(page, 'builder');
  await debug.waitForAudio(page, 'build-another');
  check('Build Another keeps the completed course and speaks in Builder', (await debug.getState(page)).course.length === 4);
  ignoreClosedAnalytics(run);
  checkSessionClean({ check }, run, 'play landscape');
  await run.close();
}

async function arcticScenario(browser) {
  const run = await open(browser, { width: 1180, height: 820 });
  const { page } = run;
  await debug.startMode(page, 'arctic');
  await debug.call(page, 'setCourse', {
    cells: ['c0-r2', 'c1-r1', 'c2-r1', 'c3-r0', 'c0-r0'],
    kinds: ['slide', 'tunnel', 'wall', 'hop', 'carry'],
  });
  await debug.call(page, 'setColor', 0, 'berry');
  await debug.tap(page, 'palette');
  await shot(page, '02b-builder-arctic-five');
  await debug.call(page, 'setCourse', {
    cells: ['c0-r2', 'c1-r1', 'c2-r1'],
    kinds: ['slide', 'slide', 'slide'],
  });
  await debug.tap(page, 'play-course');
  let state = await debug.getState(page);
  check('consecutive Arctic ramps merge into one super-slide', state.action === 'slide' && state.stationCount === 1, JSON.stringify(state));
  await shot(page, '06-arctic-super-slide');
  await debug.tap(page, 'slide-right');
  check('wrong slide direction retains the next gate', (await debug.call(page, 'getActionState')).gates.collected === 0);
  const stage = await page.locator('#action-stage').boundingBox();
  await page.mouse.move(stage.x + stage.width * .72, stage.y + stage.height * .45);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width * .32, stage.y + stage.height * .45, { steps: 10 });
  await page.mouse.up();
  check('a real swipe collects the first slide gate', (await debug.call(page, 'getActionState')).gates.collected === 1);
  for (const direction of ['right', 'left', 'right']) await debug.tap(page, `slide-${direction}`);
  await shot(page, '06b-arctic-landing');
  await debug.tap(page, 'slide-landing');
  await debug.waitForScreen(page, 'end');
  await page.waitForTimeout(850);
  check('four steering beats and landing complete the super-slide', (await debug.getState(page)).screen === 'end');
  await shot(page, '07-finish-arctic');
  ignoreClosedAnalytics(run);
  checkSessionClean({ check }, run, 'arctic landscape');
  await run.close();
}

async function separatedSlideScenario(browser) {
  const run = await open(browser, { width: 1180, height: 820 });
  const { page } = run;
  await debug.startMode(page, 'arctic');
  await debug.call(page, 'setCourse', {
    cells: ['c0-r2', 'c1-r1', 'c2-r1', 'c3-r0'],
    kinds: ['slide', 'tunnel', 'slide', 'slide'],
  });
  await debug.call(page, 'startTraversal');
  const state = await debug.getState(page);
  const action = await debug.call(page, 'getActionState');
  check('a separated slide and connected run form three traversal stations', state.stationCount === 3 && action.action === 'slide' && action.runLength === 1, JSON.stringify({ state, action }));
  check('a single slide asks for exactly two steering gates', action.gates.total === 2, JSON.stringify(action));
  checkSlideGeometry('single slide', await slideGeometry(page));
  await shot(page, '06a-arctic-single-slide');
  ignoreClosedAnalytics(run);
  checkSessionClean({ check }, run, 'separated slide');
  await run.close();
}

async function audioScenario(browser) {
  const run = await open(browser, { width: 1180, height: 820 }, { mute: false });
  const { page } = run;
  await debug.tap(page, 'splash-sound');
  await debug.waitForAudio(page, 'choose-world');
  const log = await debug.getAudioLog(page);
  check('splash prompt uses a recorded clip', audio.heardClip(log, 'choose-world'), audio.describe(log));
  check('one sound press requests one prompt', audio.count(log, 'choose-world') === 1, audio.describe(log));
  ignoreClosedAnalytics(run);
  checkSessionClean({ check }, run, 'recorded audio');
  await run.close();
}

async function layoutScenario(browser, viewport, name, reducedMotion = 'no-preference', world = 'jungle') {
  const run = await open(browser, viewport, { reducedMotion });
  const { page } = run;
  await debug.startMode(page, world);
  const routes = {
    backyard: { cells: ['c0-r2', 'c1-r1', 'c2-r0', 'c3-r1'], kinds: ['tunnel', 'wall', 'hop', 'carry'] },
    jungle: { cells: ['c0-r2', 'c1-r1', 'c2-r0', 'c3-r1'], kinds: ['wall', 'hop', 'carry', 'tunnel'] },
    arctic: { cells: ['c0-r2', 'c1-r1', 'c2-r0', 'c3-r1', 'c0-r0'], kinds: ['slide', 'tunnel', 'wall', 'hop', 'carry'] },
  };
  await debug.call(page, 'setCourse', {
    cells: routes[world].cells,
    kinds: routes[world].kinds,
  });
  await debug.call(page, 'setColor', 0, 'berry');
  await debug.tap(page, 'palette');
  const fit = await viewportFits(page);
  check(`${name} builder fits without page overflow`, fit.x && fit.y, JSON.stringify(fit));
  check(`${name} builder images decode`, await allImagesReady(page));
  const cellSizes = await targetSizes(page, '.course-cell[data-target]');
  const smallCells = undersized(cellSizes, 94);
  check(`${name} board cells retain a generous touch area`, smallCells.length === 0, JSON.stringify(smallCells));
  const builderTargets = await targetSizes(page, '#builder [data-target], #builder [data-hud]');
  check(`${name} visible Builder controls meet the 96px touch floor`, builderTargets.length >= 20 && undersized(builderTargets, 96).length === 0, JSON.stringify(undersized(builderTargets, 96)));
  await shot(page, `08-builder-${name}-${world}`);
  await debug.tap(page, 'play-course');
  await shot(page, `09-play-${name}-${world}`);
  ignoreClosedAnalytics(run);
  checkSessionClean({ check }, run, name);
  await run.close();
}

async function slidePresentationScenario(browser, viewport, name, reducedMotion = 'no-preference') {
  const run = await open(browser, viewport, { reducedMotion });
  const { page } = run;
  await debug.startMode(page, 'arctic');
  await debug.call(page, 'setCourse', {
    cells: ['c0-r2', 'c1-r1', 'c2-r1', 'c3-r0'],
    kinds: ['slide', 'tunnel', 'slide', 'slide'],
  });
  await debug.call(page, 'startTraversal');
  checkSlideGeometry(`${name} single slide`, await slideGeometry(page));
  await shot(page, `10-slide-${name}-single`);

  await debug.startMode(page, 'arctic');
  await debug.call(page, 'setCourse', {
    cells: ['c0-r2', 'c1-r1', 'c2-r1'],
    kinds: ['slide', 'slide', 'slide'],
  });
  await debug.call(page, 'startTraversal');
  checkSlideGeometry(`${name} super slide`, await slideGeometry(page));
  const slideControls = await targetSizes(page, '.slide-controls [data-target]');
  check(`${name} slide arrow controls meet 96px touch floor`, undersized(slideControls, 96).length === 0, JSON.stringify(undersized(slideControls, 96)));
  await shot(page, `11-slide-${name}-super`);
  await debug.tap(page, 'slide-left');
  check(`${name} slide switches its authored active arrow to the right`, await page.locator('.slide-arrow[data-dir="right"].is-active').count() === 1);
  await shot(page, `11b-slide-${name}-super-right`);
  for (const direction of ['right', 'left', 'right']) await debug.tap(page, `slide-${direction}`);
  check('slide landing appears after every steering beat', await page.locator('[data-target="slide-landing"]').isVisible());
  checkSlideGeometry(`${name} landing`, await slideGeometry(page));
  await shot(page, `12-slide-${name}-landing`);
  const fit = await viewportFits(page);
  check(`${name} slide presentation fits without page overflow`, fit.x && fit.y, JSON.stringify(fit));
  ignoreClosedAnalytics(run);
  checkSessionClean({ check }, run, `${name} slide presentation`);
  await run.close();
}

async function idleLadderScenario(browser) {
  const run = await open(browser, { width: 1180, height: 820 }, { mute: false });
  const { page } = run;
  await debug.fastTimers(page, 20);
  await debug.startMode(page, 'backyard');
  await debug.call(page, 'clearSavedState');
  await debug.clearAudioLog(page);
  await debug.waitForAudio(page, 'choose-world', { timeout: 1500 });
  check('idle splash ladder prompts choose-world', (await debug.getAudioLog(page)).some((entry) => entry.key === 'choose-world'));
  await page.waitForFunction(() => document.querySelector('.world-picker')?.classList.contains('is-idle-bob'), null, { timeout: 1500 });
  check('idle splash ladder enters bob state', await page.locator('.world-picker.is-idle-bob').count() === 1);
  await debug.startMode(page, 'backyard');
  await debug.call(page, 'setCourse', { cells: [], kinds: [] });
  await debug.clearAudioLog(page);
  await debug.waitForAudio(page, 'gentle-hint', { timeout: 2000 });
  check('idle builder ladder flashes suggested targets and gentle hint', await page.locator('.course-cell.is-empty-glow, .module-card.is-suggested-glow').count() >= 3 && (await debug.getAudioLog(page)).some((entry) => entry.key === 'gentle-hint'));
  await debug.call(page, 'setCourse', { cells: ['c0-r1', 'c1-r0', 'c2-r1'], kinds: ['tunnel', 'wall', 'hop'] });
  await debug.tap(page, 'play-course');
  await debug.waitForScreen(page, 'play');
  await debug.clearAudioLog(page);
  await debug.waitForAudio(page, 'gentle-hint', { timeout: 1800 });
  check('idle play ladder models current action with gentle hint', await page.locator('.action-stage .is-modeling').count() === 1 && (await debug.getAudioLog(page)).some((entry) => entry.key === 'gentle-hint'));
  ignoreClosedAnalytics(run);
  checkSessionClean({ check }, run, 'idle ladder');
  await run.close();
}

async function main() {
  await ensureShots(SHOTS);
  const browser = await launchChrome();
  try {
    await builderScenario(browser);
    await contractScenario(browser);
    await recoveryScenario(browser);
    await playScenario(browser);
    await arcticScenario(browser);
    await separatedSlideScenario(browser);
    await audioScenario(browser);
    await layoutScenario(browser, { width: 1180, height: 520 }, 'compact-landscape', 'no-preference', 'jungle');
    await layoutScenario(browser, { width: 820, height: 1180 }, 'portrait', 'no-preference', 'arctic');
    await layoutScenario(browser, { width: 1180, height: 820 }, 'reduced-motion', 'reduce', 'backyard');
    await slidePresentationScenario(browser, { width: 1180, height: 520 }, 'compact-landscape', 'no-preference');
    await slidePresentationScenario(browser, { width: 820, height: 1180 }, 'portrait', 'no-preference');
    await slidePresentationScenario(browser, { width: 1180, height: 820 }, 'reduced-motion', 'reduce');
    await idleLadderScenario(browser);
  } finally {
    await browser.close();
  }

  const report = {
    game: 'obstacle-course-builder',
    base: BASE,
    generatedAt: new Date().toISOString(),
    results,
    notes,
  };
  await writeFile(path.join(SHOTS, 'qa.json'), `${JSON.stringify(report, null, 2)}\n`);
  note(`screenshots: ${SHOTS}`);
  finish({ suffix: `; screenshots in ${SHOTS}` });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
