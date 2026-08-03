#!/usr/bin/env node
// Real-Chrome smoke + visual-QC driver for Big Paper Murals.
//
//   python3 -m http.server 8123
//   node games/big-paper-murals/tools/qa.mjs --base http://127.0.0.1:8123

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  args, launchChrome, createReporter, openSession,
  resolveShots, ensureShots,
} from '../../../tools/qa/lib/driver.mjs';

const base = args.flag('base', 'http://127.0.0.1:8000');
const url = `${base.replace(/\/$/, '')}/games/big-paper-murals/`;
const shots = resolveShots('qa-shots/big-paper-murals');
const { check, finish } = createReporter();

async function session(browser, viewport, reducedMotion = 'no-preference', context = {}) {
  return openSession(browser, { url, base, viewport, reducedMotion, context });
}

async function boot(page) {
  await page.waitForFunction(() => window.QLOBE_DEBUG?.ready);
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  await page.evaluate(() => {
    window.QLOBE_DEBUG.mute(true);
    window.QLOBE_DEBUG.fastTimers();
    window.QLOBE_DEBUG.seed(42);
  });
}

async function assertLargeTargets(page, label) {
  const undersized = await page.locator('[data-target]').evaluateAll((nodes) => nodes
    .filter((node) => node.getClientRects().length && !node.disabled)
    .map((node) => ({
      id: node.dataset.target,
      w: node.getBoundingClientRect().width,
      h: node.getBoundingClientRect().height,
    }))
    .filter(({ w, h }) => w < 96 || h < 96));
  check(`${label} targets are at least 96px`, undersized.length === 0,
    undersized.map(({ id, w, h }) => `${id}:${Math.round(w)}×${Math.round(h)}`).join(', '));
}

async function drawTwoFingers(page, { cancel = false } = {}) {
  const box = await page.locator('#mural-canvas').boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const points = (step) => [
    { x: box.x + box.width * (.18 + step * .13), y: box.y + box.height * (.67 - step * .12), id: 1, radiusX: 12, radiusY: 12, force: .6 },
    { x: box.x + box.width * (.82 - step * .13), y: box.y + box.height * (.32 + step * .12), id: 2, radiusX: 12, radiusY: 12, force: .6 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(0) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(1) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(2) });
  await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function drive(browser) {
  await ensureShots(shots);
  const landscape = await session(browser, { width: 1180, height: 820 });
  const page = landscape.page;
  await boot(page);

  const splash = await page.evaluate(() => ({
    state: window.QLOBE_DEBUG.getState(),
    modes: window.QLOBE_DEBUG.listModes(),
    title: document.querySelector('.title-art')?.alt,
  }));
  check('splash boots', splash.state.screen === 'splash');
  check('four mural papers registered', splash.modes.map(({ id }) => id).join(',') === 'jungle,space,city,blank');
  check('generated title is spelled exactly', splash.title === 'Big Paper Murals');
  check('runtime makes no remote requests', landscape.remote.length === 0, landscape.remote.join(', '));
  await assertLargeTargets(page, 'splash');
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.startMode('jungle'));
  await page.waitForSelector('#mural-canvas');
  check('empty finish is gently refused', await page.evaluate(() => window.QLOBE_DEBUG.finish()) === false);
  check('empty finish stays in studio', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'studio');
  await drawTwoFingers(page);
  let studio = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('two simultaneous fingers make two semantic strokes', studio.strokes === 2, `strokes=${studio.strokes}`);
  check('active artist meter settles after release', studio.activeArtists === 0);
  await page.screenshot({ path: path.join(shots, '02-jungle-two-finger-paint.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.tap('clear'));
  await page.evaluate(() => window.QLOBE_DEBUG.tap('clear'));
  check('two-tap clear empties the paper', (await page.evaluate(() => window.QLOBE_DEBUG.getState().strokes)) === 0);
  await page.evaluate(() => window.QLOBE_DEBUG.tap('undo'));
  check('undo restores an accidentally cleared mural', (await page.evaluate(() => window.QLOBE_DEBUG.getState().strokes)) === 2);
  await page.evaluate(() => window.QLOBE_DEBUG.tap('clear'));
  await page.evaluate(() => window.QLOBE_DEBUG.tap('clear'));
  await drawTwoFingers(page, { cancel: true });
  check('touch cancel discards both unfinished strokes', (await page.evaluate(() => window.QLOBE_DEBUG.getState().strokes)) === 0);

  await page.evaluate(() => window.QLOBE_DEBUG.drawStroke());
  await page.evaluate(() => window.QLOBE_DEBUG.tap('tool-roller'));
  await page.evaluate(() => window.QLOBE_DEBUG.drawStroke([{ x: .2, y: .72 }, { x: .8, y: .34 }]));
  await page.evaluate(() => window.QLOBE_DEBUG.tap('tool-stamp'));
  await page.evaluate(() => window.QLOBE_DEBUG.placeStamp('tiger', .31, .58));
  await page.evaluate(() => window.QLOBE_DEBUG.placeStamp('toucan', .72, .42));
  studio = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('brush and roller strokes persist', studio.strokes === 2);
  check('living stamps persist', studio.stamps === 2);
  await assertLargeTargets(page, 'studio');
  await page.screenshot({ path: path.join(shots, '03-jungle-tools-and-stamps.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.tap('undo'));
  check('undo follows merged stamp/stroke history', (await page.evaluate(() => window.QLOBE_DEBUG.getState().stamps)) === 1);
  await page.evaluate(() => window.QLOBE_DEBUG.placeStamp('toucan', .72, .42));
  await page.evaluate(() => window.QLOBE_DEBUG.replayMural());
  check('semantic music replay completes', !(await page.evaluate(() => window.QLOBE_DEBUG.getState().replaying)));
  await page.evaluate(() => window.QLOBE_DEBUG.finish());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'alive');
  check('finish opens living mural', true);
  await assertLargeTargets(page, 'living mural');
  await page.screenshot({ path: path.join(shots, '04-living-mural.png') });

  await page.locator('[data-target="living-stamp-0"]').click();
  check('living stamp is a playable target', true);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-target="save-picture"]').click();
  const download = await downloadPromise;
  const downloadPath = path.join(shots, 'big-paper-mural-export.png');
  await download.saveAs(downloadPath);
  const data = await readFile(downloadPath);
  const dimensions = pngSize(data);
  check('PNG keepsake exports at 1600×1200', data.length > 20_000 && dimensions?.width === 1600 && dimensions?.height === 1200,
    `${data.length} bytes, ${dimensions?.width}×${dimensions?.height}`);

  await page.reload({ waitUntil: 'networkidle' });
  await boot(page);
  check('current mural survives reload', (await page.evaluate(() => window.QLOBE_DEBUG.getState().hasSaved)) === true);
  await page.evaluate(() => window.QLOBE_DEBUG.tap('resume'));
  await page.waitForSelector('#mural-canvas');
  studio = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('resume restores semantic strokes and stamps', studio.strokes === 2 && studio.stamps === 2,
    `${studio.strokes} strokes, ${studio.stamps} stamps`);
  await page.evaluate(() => window.QLOBE_DEBUG.tap('back'));
  check('studio back returns to game splash', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'splash');

  for (const theme of ['space', 'city', 'blank']) {
    await page.evaluate((id) => window.QLOBE_DEBUG.startMode(id), theme);
    await page.evaluate(() => window.QLOBE_DEBUG.drawStroke());
    await page.evaluate((id) => window.QLOBE_DEBUG.placeStamp(id, .55, .5), theme === 'space' ? 'rocket' : theme === 'city' ? 'car' : 'paint-friend');
    check(`${theme} paper starts`, (await page.evaluate(() => window.QLOBE_DEBUG.getState().theme)) === theme);
    await page.screenshot({ path: path.join(shots, `05-${theme}-paper.png`) });
    await page.evaluate(() => window.QLOBE_DEBUG.tap('back'));
  }

  const portrait = await session(browser, { width: 820, height: 1180 });
  await boot(portrait.page);
  await portrait.page.screenshot({ path: path.join(shots, '06-splash-portrait.png') });
  await portrait.page.evaluate(() => window.QLOBE_DEBUG.startMode('space'));
  await portrait.page.evaluate(() => window.QLOBE_DEBUG.drawStroke());
  await portrait.page.evaluate(() => window.QLOBE_DEBUG.placeStamp('rocket', .6, .46));
  await assertLargeTargets(portrait.page, 'portrait studio');
  const portraitCanvas = await portrait.page.locator('#mural-canvas').boundingBox();
  check('portrait mural remains large and 4:3', portraitCanvas.width >= 600 && Math.abs(portraitCanvas.width / portraitCanvas.height - 4 / 3) < .03,
    `${Math.round(portraitCanvas.width)}×${Math.round(portraitCanvas.height)}`);
  await portrait.page.screenshot({ path: path.join(shots, '07-space-portrait.png') });

  const reduced = await session(browser, { width: 1180, height: 820 }, 'reduce');
  await boot(reduced.page);
  await reduced.page.evaluate(() => window.QLOBE_DEBUG.startMode('city'));
  await reduced.page.evaluate(() => window.QLOBE_DEBUG.drawStroke());
  await reduced.page.evaluate(() => window.QLOBE_DEBUG.placeStamp('car', .5, .62));
  await reduced.page.evaluate(() => window.QLOBE_DEBUG.finish());
  check('reduced-motion living mural completes', (await reduced.page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'alive');

  const allErrors = [...landscape.errors, ...portrait.errors, ...reduced.errors];
  const allFailed = [...landscape.failed, ...portrait.failed, ...reduced.failed];
  check('zero unexpected page errors', allErrors.length === 0, allErrors.join(' | '));
  check('zero failed requests or 404s', allFailed.length === 0, allFailed.join(' | '));
  check('zero remote runtime requests in every viewport',
    [...landscape.remote, ...portrait.remote, ...reduced.remote].length === 0,
    [...landscape.remote, ...portrait.remote, ...reduced.remote].join(' | '));

  await landscape.context.close();
  await portrait.context.close();
  await reduced.context.close();
}

const browser = await launchChrome();
try {
  await drive(browser);
} finally {
  await browser.close();
}
finish();
