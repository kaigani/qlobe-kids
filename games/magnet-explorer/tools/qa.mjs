#!/usr/bin/env node

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  baseUrl, launchChrome, createReporter, openSession, checkSessionClean,
  resolveShots, ensureShots,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const shots = resolveShots('qa-shots/magnet-explorer');
const { check, note, finish } = createReporter();
const sessions = [];
const PLATFORM_ANALYTICS = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
];
const MAGNETIC = new Set(['paperclip', 'bolt', 'washer', 'nail', 'steel-can', 'safety-pin']);

async function openGame(browser, viewport, reducedMotion = 'no-preference', mute = true) {
  const session = await openSession(browser, {
    url: `${base}/games/magnet-explorer/`, base, viewport, reducedMotion,
    allowAbortedMedia: true, allowRemote: PLATFORM_ANALYTICS,
    seed: 42, fastTimers: true, mute,
  });
  sessions.push(session);
  return session.page;
}

async function capture(page, name) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => [...document.images]
    .filter((image) => {
      const rect = image.getBoundingClientRect();
      return image.getAttribute('src') && rect.width > 0 && rect.height > 0
        && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
    })
    .every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0));
  await page.screenshot({ path: path.join(shots, name) });
}

const state = (page) => page.evaluate(() => window.QLOBE_DEBUG.getState());
const waitState = (page, predicate) => page.waitForFunction(predicate, null, { timeout: 8000 });

async function assertTargets(page, label, minimum, ids) {
  const targets = await page.evaluate(() => window.QLOBE_DEBUG.getTargets());
  const failures = ids.map((id) => targets.find((target) => target.id === id))
    .filter((target) => !target || target.rect.w < minimum || target.rect.h < minimum)
    .map((target, index) => target ? `${target.id}:${Math.round(target.rect.w)}x${Math.round(target.rect.h)}` : `missing:${ids[index]}`);
  check(`${label} keeps primary targets at least ${minimum}px`, failures.length === 0, failures.join(', '));
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome();
  try {
    const page = await openGame(browser, { width: 1180, height: 820 }, 'no-preference', false);
    let current = await state(page);
    check('boots to the authored experiment chooser', current.screen === 'splash');
    check('preloads every runtime raster', current.artFailures.length === 0, current.artFailures.join(', '));
    const modes = await page.evaluate(() => window.QLOBE_DEBUG.listModes());
    check('registers all three promised experiments', modes.map(({ id }) => id).join(',') === 'test-lab,treasure-sweep,magnet-maze');
    await assertTargets(page, 'landscape splash', 96, ['mode-test-lab', 'mode-treasure-sweep', 'mode-magnet-maze', 'home']);
    await capture(page, '01-splash-landscape.png');

    await page.locator('[data-target="mode-test-lab"]').click();
    await waitState(page, () => window.QLOBE_DEBUG.getState().phase === 'play');
    check('Test Lab starts without a stale result overlay', await page.locator('.mode-result:not([hidden])').count() === 0);
    check('first gesture starts recorded teacher narration', await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog()
      .some((entry) => entry.key === 'mode-test' && entry.kind === 'clip')));
    await assertTargets(page, 'test lab', 96, ['back', 'sound', 'magnet']);

    const magnet = page.locator('[data-target="magnet"]');
    const magnetBox = await magnet.boundingBox();
    await page.mouse.move(magnetBox.x + magnetBox.width / 2, magnetBox.y + magnetBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(magnetBox.x + magnetBox.width / 2 + 26, magnetBox.y + magnetBox.height / 2 - 18, { steps: 3 });
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
    })));
    const cancelled = await state(page);
    check('pointer cancellation clears held state without resolving a trial', !cancelled.dragging && cancelled.phase === 'play');
    await page.mouse.up();

    const freshMagnet = await magnet.boundingBox();
    const objectBox = await page.locator('.test-object').boundingBox();
    await page.mouse.move(freshMagnet.x + freshMagnet.width / 2, freshMagnet.y + freshMagnet.height / 2);
    await page.mouse.down();
    await page.mouse.move(objectBox.x + objectBox.width / 2, objectBox.y + objectBox.height / 2, { steps: 10 });
    await page.mouse.up();
    await waitState(page, () => window.QLOBE_DEBUG.getState().phase === 'result');
    check('real magnet drag reaches the proximity experiment', (await state(page)).round === 1);

    const captured = new Set();
    while ((await state(page)).screen === 'play') {
      current = await state(page);
      if (current.phase === 'result') {
        const kind = MAGNETIC.has(current.currentId) ? 'magnetic' : 'nonmagnetic';
        if (!captured.has(kind)) {
          await page.locator('.mode-result:not([hidden])').waitFor();
          await capture(page, `02-test-${kind}.png`);
          captured.add(kind);
        }
        await page.evaluate(() => window.QLOBE_DEBUG.tap('next'));
        if (current.round >= current.total) break;
        await waitState(page, () => window.QLOBE_DEBUG.getState().phase === 'play');
      } else {
        await page.evaluate(() => window.QLOBE_DEBUG.testCurrent());
        await waitState(page, () => window.QLOBE_DEBUG.getState().phase === 'result');
      }
    }
    await waitState(page, () => window.QLOBE_DEBUG.getState().screen === 'end');
    current = await state(page);
    check('Test Lab completes six balanced discoveries', current.round === 6 && current.tested.length === 6
      && captured.has('magnetic') && captured.has('nonmagnetic'), JSON.stringify(current));
    await capture(page, '03-test-complete.png');

    await page.evaluate(() => window.QLOBE_DEBUG.startMode('treasure-sweep'));
    await waitState(page, () => window.QLOBE_DEBUG.getState().phase === 'play');
    await capture(page, '04-treasure-sweep.png');
    const keyboardTreasure = await page.locator('[data-object-id]').evaluateAll((nodes, ids) => {
      const node = nodes.find((candidate) => ids.includes(candidate.dataset.objectId));
      return node?.dataset.objectId || null;
    }, [...MAGNETIC]);
    await page.locator(`[data-object-id="${keyboardTreasure}"]`).focus();
    await page.keyboard.press('Enter');
    await waitState(page, () => window.QLOBE_DEBUG.getState().collected.length === 1);
    check('keyboard activation can collect a sweep treasure', (await state(page)).collected[0] === keyboardTreasure);
    await page.evaluate(() => window.QLOBE_DEBUG.winRound());
    await waitState(page, () => window.QLOBE_DEBUG.getState().phase === 'reward');
    current = await state(page);
    check('Treasure Sweep collects exactly five steel treasures', current.collected.length === 5
      && current.collected.every((id) => MAGNETIC.has(id)), JSON.stringify(current.collected));
    await page.locator('.mode-result:not([hidden])').waitFor();
    await capture(page, '05-treasure-reward.png');
    await page.evaluate(() => window.QLOBE_DEBUG.tap('next'));
    await waitState(page, () => window.QLOBE_DEBUG.getState().screen === 'end');

    await page.evaluate(() => window.QLOBE_DEBUG.startMode('magnet-maze'));
    await waitState(page, () => window.QLOBE_DEBUG.getState().phase === 'play');
    await capture(page, '06a-maze-route-00.png');
    const beforeBall = (await state(page)).ball;
    const mazeMagnet = await page.locator('[data-target="magnet"]').boundingBox();
    const mazeCenter = { x: mazeMagnet.x + mazeMagnet.width / 2, y: mazeMagnet.y + mazeMagnet.height / 2 };
    await page.mouse.move(mazeCenter.x, mazeCenter.y);
    await page.mouse.down();
    await page.mouse.move(mazeCenter.x - 88, mazeCenter.y + 5, { steps: 12 });
    await page.mouse.up();
    const afterDrag = await state(page);
    const afterBall = afterDrag.ball;
    check('real maze drag pulls the ball with visible lag', (afterBall.x !== beforeBall.x || afterBall.y !== beforeBall.y)
      && Math.hypot(afterBall.x - afterDrag.magnet.x, afterBall.y - afterDrag.magnet.y) > .035,
    JSON.stringify({ beforeBall, afterBall, magnet: afterDrag.magnet }));
    await capture(page, '06-maze-pull.png');
    const beforeShortcut = (await state(page)).mazeProgress;
    await page.evaluate(() => window.QLOBE_DEBUG.moveMagnetTo(.855, .19));
    const shortcut = await state(page);
    check('a direct diagonal shortcut cannot cross maze walls', shortcut.phase === 'play'
      && shortcut.mazeProgress <= beforeShortcut + .001, JSON.stringify(shortcut));
    await page.locator('[data-target="magnet"]').focus();
    await page.keyboard.press('ArrowLeft');
    check('maze magnet exposes an arrow-key movement path', (await state(page)).magnet.x < .855);
    await page.evaluate(() => document.activeElement?.blur());
    for (const [progress, suffix] of [[0.25, '25'], [0.5, '50'], [0.75, '75']]) {
      await page.evaluate((amount) => window.QLOBE_DEBUG.previewMazeProgress(amount), progress);
      await capture(page, `06b-maze-route-${suffix}.png`);
    }
    await page.evaluate(() => window.QLOBE_DEBUG.solveMaze());
    await waitState(page, () => window.QLOBE_DEBUG.getState().phase === 'reward');
    check('Magnet Maze reaches the star socket', (await state(page)).round === 1);
    await page.locator('.mode-result:not([hidden])').waitFor();
    await capture(page, '07-maze-reward.png');
    await page.evaluate(() => window.QLOBE_DEBUG.tap('next'));
    await waitState(page, () => window.QLOBE_DEBUG.getState().screen === 'end');

    const audio = await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog());
    const spoken = new Set(audio.filter(({ kind }) => kind === 'clip').map(({ key }) => key));
    check('core beats stay on recorded clips', ['mode-test', 'mode-sweep', 'sweep-done', 'mode-maze', 'maze-near', 'maze-done', 'complete']
      .every((key) => spoken.has(key)), [...spoken].join(', '));

    const portrait = await openGame(browser, { width: 820, height: 1180 });
    await assertTargets(portrait, 'portrait splash', 96, ['mode-test-lab', 'mode-treasure-sweep', 'mode-magnet-maze', 'home']);
    await capture(portrait, '08-splash-portrait.png');
    await portrait.evaluate(() => window.QLOBE_DEBUG.startMode('treasure-sweep'));
    await assertTargets(portrait, 'portrait sweep', 96, ['back', 'sound', 'magnet']);
    await capture(portrait, '09-sweep-portrait.png');
    await portrait.evaluate(() => window.QLOBE_DEBUG.startMode('magnet-maze'));
    for (const [progress, suffix] of [[0, '00'], [0.25, '25'], [0.5, '50'], [0.75, '75']]) {
      await portrait.evaluate((amount) => window.QLOBE_DEBUG.previewMazeProgress(amount), progress);
      await capture(portrait, `09b-maze-portrait-${suffix}.png`);
    }

    const compact = await openGame(browser, { width: 568, height: 320 });
    await assertTargets(compact, 'phone landscape splash', 76, ['mode-test-lab', 'mode-treasure-sweep', 'mode-magnet-maze', 'home']);
    await capture(compact, '10-phone-splash.png');
    await compact.evaluate(() => window.QLOBE_DEBUG.startMode('test-lab'));
    await assertTargets(compact, 'phone landscape play', 76, ['back', 'sound', 'magnet']);
    await capture(compact, '11-phone-test.png');

    const reduced = await openGame(browser, { width: 1180, height: 520 }, 'reduce');
    await reduced.evaluate(() => window.QLOBE_DEBUG.startMode('magnet-maze'));
    await reduced.evaluate(() => window.QLOBE_DEBUG.solveMaze());
    await waitState(reduced, () => window.QLOBE_DEBUG.getState().phase === 'reward');
    check('reduced-motion preserves semantic completion', (await state(reduced)).reducedMotion === true);
    await capture(reduced, '12-reduced-maze-reward.png');

    const hubSession = await openSession(browser, {
      url: `${base}/#sensorial-science`, base, viewport: { width: 1180, height: 820 },
      ready: false, allowRemote: PLATFORM_ANALYTICS,
    });
    sessions.push(hubSession);
    const tile = hubSession.page.locator('a.game-card[aria-label^="Magnet Explorer"]');
    await tile.waitFor({ state: 'visible' });
    const hubImage = tile.locator('img');
    await hubImage.evaluate((node) => { node.loading = 'eager'; });
    await hubSession.page.waitForFunction((node) => node.complete && node.naturalWidth > 0, await hubImage.elementHandle());
    const hubSize = await hubImage.evaluate((node) => ({ width: node.naturalWidth, height: node.naturalHeight }));
    check('hub uses the curated 640x533 catalog tile', hubSize.width === 640 && hubSize.height === 533, JSON.stringify(hubSize));
    await tile.scrollIntoViewIfNeeded();
    await capture(hubSession.page, '00-hub-tile.png');
    await Promise.all([hubSession.page.waitForURL('**/games/magnet-explorer/'), tile.click()]);
    await hubSession.page.waitForFunction(() => Boolean(window.QLOBE_DEBUG?.ready));
    await hubSession.page.evaluate(() => window.QLOBE_DEBUG.ready);
    check('hub launches the production route', hubSession.page.url().endsWith('/games/magnet-explorer/'));

    for (const session of sessions) {
      session.failed = session.failed.filter((entry) => !PLATFORM_ANALYTICS.some((prefix) => entry.startsWith(prefix)));
      checkSessionClean({ check }, session);
    }

    const backgroundNames = await readdir(new URL('../assets/backgrounds/', import.meta.url));
    const foregroundNames = [
      ...(await readdir(new URL('../assets/objects/', import.meta.url))),
      ...(await readdir(new URL('../assets/ui/', import.meta.url))),
    ].filter((name) => name.endsWith('.png'));
    const backgroundSizes = await Promise.all(backgroundNames.filter((name) => name.endsWith('.webp'))
      .map((name) => stat(new URL(`../assets/backgrounds/${name}`, import.meta.url)).then(({ size }) => [name, size])));
    const foregroundSizes = await Promise.all(foregroundNames.map(async (name) => {
      const folder = (await stat(new URL(`../assets/objects/${name}`, import.meta.url)).catch(() => null)) ? 'objects' : 'ui';
      return [name, (await stat(new URL(`../assets/${folder}/${name}`, import.meta.url))).size];
    }));
    check('all environment rasters stay under 300 KB', backgroundSizes.every(([, size]) => size < 300_000), JSON.stringify(backgroundSizes));
    check('all interactive cutouts stay under 260 KB', foregroundSizes.every(([, size]) => size < 260_000), JSON.stringify(foregroundSizes));
    const css = await readFile(new URL('../css/style.css', import.meta.url), 'utf8');
    const mainSource = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');
    check('CSS does not synthesize primary art with gradients', !/gradient\(/.test(css));
    check('all primary gameplay pieces resolve to generated raster files', ['magnet.png', 'steel-ball.png', 'star-token.png', 'title.png', 'badge.png']
      .every((name) => mainSource.includes(name)));
    note(`visual QC screenshots: ${shots}`);
  } finally {
    for (const session of sessions) await session.context.close().catch(() => {});
    await browser.close();
  }
  finish({ suffix: `; screenshots in ${shots}` });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
