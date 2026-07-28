#!/usr/bin/env node
// Real-Chrome smoke + visual-QC driver for Sound Painting.

import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const base = flag('base', 'http://127.0.0.1:8000');
const url = `${base.replace(/\/$/, '')}/games/sound-painting/`;
const shots = path.resolve(flag('shots', 'qa-shots/sound-painting'));
const playwrightRoot = flag('playwright', '/private/tmp/pw/node_modules');
const require = createRequire(path.join(playwrightRoot, 'noop.js'));
const { chromium } = require('playwright');

const results = [];
function check(name, value, detail = '') {
  const ok = !!value;
  results.push({ name, ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function monitoredPage(browser, viewport, reducedMotion = 'no-preference', contextOptions = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion,
    ...contextOptions,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__qlobeOscillators = [];
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || AC.prototype.__qlobeInstrumented) return;
    const original = AC.prototype.createOscillator;
    Object.defineProperty(AC.prototype, '__qlobeInstrumented', { value: true });
    AC.prototype.createOscillator = function createInstrumentedOscillator() {
      const oscillator = original.call(this);
      const originalStart = oscillator.start.bind(oscillator);
      oscillator.start = (...args) => {
        window.__qlobeOscillators.push({
          at: performance.now(),
          frequency: oscillator.frequency.value,
          type: oscillator.type,
        });
        return originalStart(...args);
      };
      return oscillator;
    };
  });
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
  page.on('requestfailed', (request) => failed.push(`${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  await page.evaluate(() => {
    window.QLOBE_DEBUG.mute(true);
    window.QLOBE_DEBUG.fastTimer(true);
    window.QLOBE_DEBUG.seed(42);
  });
  return { context, page, errors, failed, remote };
}

async function actualDraw(page) {
  const box = await page.locator('#paint-canvas').boundingBox();
  await page.mouse.move(box.x + box.width * .18, box.y + box.height * .62);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .34, box.y + box.height * .33, { steps: 7 });
  await page.mouse.move(box.x + box.width * .52, box.y + box.height * .58, { steps: 7 });
  await page.mouse.move(box.x + box.width * .72, box.y + box.height * .28, { steps: 7 });
  await page.mouse.move(box.x + box.width * .84, box.y + box.height * .52, { steps: 6 });
  await page.mouse.up();
}

async function main() {
  await mkdir(shots, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  const landscape = await monitoredPage(browser, { width: 1180, height: 820 });
  const page = landscape.page;
  check('splash boots', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'splash');
  check('three musical brushes registered', (await page.evaluate(() => window.QLOBE_DEBUG.listModes())).length === 3);
  const orchestra = await page.evaluate(async () => {
    const { buildReplayTimeline, getColorVoice } = await import('../../../shared/js/musical-canvas.js');
    const orange = '#ff9f1c';
    const blue = '#27a9e8';
    const green = '#83e6c1';
    const palette = [orange, blue, green, '#f9df72', '#c79cff'];
    const stroke = (color, start, duration) => ({
      color,
      start,
      points: [{ t: 0 }, { t: duration }],
    });
    const timeline = buildReplayTimeline([
      stroke(orange, 4000, 2000),
      stroke(blue, 12000, 1000),
      stroke(orange, 9000, 2000),
      stroke(blue, 14500, 800),
      stroke(green, 20000, 500),
    ]);
    return {
      starts: timeline.map(({ start }) => start),
      voices: palette.map((color) => getColorVoice(color, palette).semitones),
    };
  });
  check('each color begins as a simultaneous orchestra track',
    orchestra.starts[0] === 0 && orchestra.starts[1] === 0 && orchestra.starts[4] === 0,
    orchestra.starts.join(', '));
  check('same-color tracks preserve exact phrases and rests',
    orchestra.starts[2] === 5000 && orchestra.starts[2] - 2000 === 3000
      && orchestra.starts[3] === 2500,
    orchestra.starts.join(', '));
  check('five palette colors have distinct harmonic registers',
    new Set(orchestra.voices).size === 5,
    orchestra.voices.join(', '));
  check('runtime makes no remote requests', landscape.remote.length === 0, landscape.remote.join(', '));
  const modeSizes = await page.locator('.mode-card').evaluateAll((nodes) =>
    nodes.map((node) => ({ w: node.getBoundingClientRect().width, h: node.getBoundingClientRect().height })));
  check('mode cards exceed 96px touch minimum', modeSizes.every(({ w, h }) => w >= 96 && h >= 96));
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  await page.evaluate(async () => {
    const clips = await import('../../../shared/js/voice-clips.js');
    window.__soundPaintingVoice = [];
    clips.onClip((key) => window.__soundPaintingVoice.push(key));
    window.QLOBE_DEBUG.mute(false);
  });
  await page.locator('[data-target="mode-calm"]').click();
  await page.waitForSelector('#paint-canvas');
  await page.waitForTimeout(300);
  check('recorded narrator starts after gesture',
    (await page.evaluate(() => window.__soundPaintingVoice.length)) > 0,
    (await page.evaluate(() => window.__soundPaintingVoice.join(', '))));
  await page.evaluate(() => window.QLOBE_DEBUG.mute(true));
  check('calm mode starts', (await page.evaluate(() => window.QLOBE_DEBUG.getState().mode)) === 'calm');
  const playedOrchestra = await page.evaluate(async () => {
    const colors = ['#35d6e8', '#27a9e8', '#83e6c1'];
    const stroke = (color, start, duration, y) => ({
      id: `${color}-${start}`,
      brush: 'ribbon',
      color,
      width: .026,
      start,
      points: [{ x: .2, y, t: 0, p: .5 }, { x: .8, y, t: duration, p: .5 }],
    });
    window.QLOBE_DEBUG.loadPainting({
      format: 'qlobe-musical-painting',
      formatVersion: 1,
      strokes: [
        stroke(colors[0], 4000, 2000, .65),
        stroke(colors[1], 12000, 1000, .5),
        stroke(colors[0], 9000, 2000, .35),
        stroke(colors[2], 20000, 500, .2),
      ],
    });
    window.QLOBE_DEBUG.mute(false);
    window.__qlobeOscillators = [];
    await window.QLOBE_DEBUG.replayPainting({ speed: 20 });
    window.QLOBE_DEBUG.mute(true);
    const musical = window.__qlobeOscillators.filter(({ type }) => type !== 'square');
    return {
      count: musical.length,
      firstEntrySpread: Math.max(...musical.slice(0, 3).map(({ at }) => at))
        - Math.min(...musical.slice(0, 3).map(({ at }) => at)),
      firstFrequencies: musical.slice(0, 3).map(({ frequency }) => Math.round(frequency)),
    };
  });
  check('three color tracks produce simultaneous polyphony',
    playedOrchestra.count >= 4 && playedOrchestra.firstEntrySpread < 20,
    `${playedOrchestra.count} notes, ${playedOrchestra.firstEntrySpread.toFixed(1)}ms entry spread`);
  check('simultaneous color tracks produce distinct pitches',
    new Set(playedOrchestra.firstFrequencies).size === 3,
    playedOrchestra.firstFrequencies.join(', '));
  await page.evaluate(() => window.QLOBE_DEBUG.tap('clear'));
  const paintTargetSizes = await page.locator('[data-target]').evaluateAll((nodes) =>
    nodes.filter((node) => node.getClientRects().length).map((node) => ({
      id: node.dataset.target,
      w: node.getBoundingClientRect().width,
      h: node.getBoundingClientRect().height,
    })));
  const undersized = paintTargetSizes.filter(({ w, h }) => w < 96 || h < 96);
  check('every child-facing paint control is at least 96px', undersized.length === 0,
    undersized.map(({ id, w, h }) => `${id}:${Math.round(w)}×${Math.round(h)}`).join(', '));
  await actualDraw(page);
  check('real pointer path records a semantic stroke',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().strokes)) === 1);
  check('play and finish unlock after drawing',
    await page.locator('[data-target="play"]').isEnabled()
      && await page.locator('[data-target="finish"]').isEnabled());
  await page.screenshot({ path: path.join(shots, '02-calm-painted.png') });

  const colorPreview = await page.evaluate(async () => {
    window.QLOBE_DEBUG.mute(false);
    window.__qlobeOscillators = [];
    await window.QLOBE_DEBUG.tap('color-3');
    window.QLOBE_DEBUG.mute(true);
    return window.__qlobeOscillators.filter(({ type }) => type !== 'square');
  });
  check('color selection updates visibly', await page.locator('[data-target="color-3"]').evaluate((el) => el.classList.contains('selected')));
  check('selecting a color previews its track voice',
    colorPreview.length === 1 && Math.round(colorPreview[0].frequency) === 494,
    colorPreview.map(({ frequency }) => Math.round(frequency)).join(', '));
  await page.evaluate(() => window.QLOBE_DEBUG.tap('undo'));
  check('undo removes the stroke', (await page.evaluate(() => window.QLOBE_DEBUG.getState().strokes)) === 0);
  await page.evaluate(() => window.QLOBE_DEBUG.drawStroke());
  await page.evaluate(() => window.QLOBE_DEBUG.tap('play'));
  await page.waitForFunction(() => !window.QLOBE_DEBUG.getState().replaying);
  check('semantic replay completes', !(await page.evaluate(() => window.QLOBE_DEBUG.getState().replaying)));
  await page.evaluate(() => window.QLOBE_DEBUG.tap('finish'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'keepsake');
  check('painting saves locally', (await page.evaluate(() => window.QLOBE_DEBUG.getState().savedCount)) >= 1);
  await page.screenshot({ path: path.join(shots, '03-keepsake.png') });

  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-target="picture"]').click();
  const download = await downloadPromise;
  const downloadPath = path.join(shots, 'sound-painting-export.png');
  await download.saveAs(downloadPath);
  check('PNG keepsake exports', (await stat(downloadPath)).size > 10_000);

  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  await page.evaluate(() => window.QLOBE_DEBUG.mute(true));
  check('local save survives reload', (await page.evaluate(() => window.QLOBE_DEBUG.getState().savedCount)) >= 1);
  for (const mode of ['bounce', 'sparkle']) {
    await page.evaluate((id) => window.QLOBE_DEBUG.startMode(id), mode);
    await page.evaluate(() => window.QLOBE_DEBUG.drawStroke());
    check(`${mode} brush records`, (await page.evaluate(() => window.QLOBE_DEBUG.getState().strokes)) === 1);
    await page.screenshot({ path: path.join(shots, `04-${mode}.png`) });
    await page.evaluate(() => window.QLOBE_DEBUG.tap('back'));
  }
  check('back returns to in-game splash', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'splash');

  const portrait = await monitoredPage(browser, { width: 820, height: 1180 });
  await portrait.page.screenshot({ path: path.join(shots, '05-splash-portrait.png') });
  await portrait.page.evaluate(() => window.QLOBE_DEBUG.startMode('sparkle'));
  await portrait.page.evaluate(() => window.QLOBE_DEBUG.drawStroke());
  await portrait.page.screenshot({ path: path.join(shots, '06-sparkle-portrait.png') });
  const portraitBox = await portrait.page.locator('#paint-canvas').boundingBox();
  check('portrait canvas remains usable', portraitBox.width > 500 && portraitBox.height > 500,
    `${Math.round(portraitBox.width)}×${Math.round(portraitBox.height)}`);

  const reduced = await monitoredPage(browser, { width: 1180, height: 820 }, 'reduce');
  await reduced.page.evaluate(() => window.QLOBE_DEBUG.startMode('bounce'));
  await reduced.page.evaluate(() => window.QLOBE_DEBUG.drawStroke());
  await reduced.page.evaluate(() => window.QLOBE_DEBUG.tap('play'));
  await reduced.page.waitForFunction(() => !window.QLOBE_DEBUG.getState().replaying);
  check('reduced-motion replay completes', true);

  const ipad = await monitoredPage(
    browser,
    { width: 1024, height: 768 },
    'no-preference',
    { deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  );
  await ipad.page.evaluate(() => window.QLOBE_DEBUG.startMode('calm'));
  await actualDraw(ipad.page);
  const ipadCanvas = await ipad.page.locator('#paint-canvas').evaluate((node) => ({
    css: [node.clientWidth, node.clientHeight],
    backing: [node.width, node.height],
  }));
  check('iPad-density Calm River records a real pointer stroke',
    (await ipad.page.evaluate(() => window.QLOBE_DEBUG.getState().strokes)) === 1,
    `${ipadCanvas.css.join('×')} CSS / ${ipadCanvas.backing.join('×')} backing`);
  await ipad.page.screenshot({ path: path.join(shots, '07-calm-ipad-density.png') });

  const allErrors = [...landscape.errors, ...portrait.errors, ...reduced.errors, ...ipad.errors];
  const allFailed = [...landscape.failed, ...portrait.failed, ...reduced.failed, ...ipad.failed];
  check('zero unexpected page errors', allErrors.length === 0, allErrors.join(' | '));
  check('zero failed requests or 404s', allFailed.length === 0, allFailed.join(' | '));

  await landscape.context.close();
  await portrait.context.close();
  await reduced.context.close();
  await ipad.context.close();
  await browser.close();
  const failedCount = results.filter((result) => !result.ok).length;
  console.log(`\n${results.length - failedCount}/${results.length} checks passed`);
  process.exitCode = failedCount ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
