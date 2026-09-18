#!/usr/bin/env node

import path from 'node:path';
import {
  args,
  baseUrl,
  checkSessionClean,
  createReporter,
  debug,
  dragPath,
  ensureShots,
  launchChrome,
  openSession,
  shooter,
  targetSizes,
  undersized,
} from '../../../tools/qa/lib/driver.mjs';

const id = 'calm-corner-cards';
const base = baseUrl();
const url = `${base}/games/${id}/`;
const shots = await ensureShots(path.resolve(
  args.flag('out') || args.flag('shots') || path.join('qa-shots', id),
));
const shot = shooter(shots);
const reporter = createReporter({ detailOnFail: true });
const analytics = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];
const sessions = [];

async function openGame(browser, {
  viewport = { width: 1180, height: 820 },
  reducedMotion = 'no-preference',
  fastTimers = 0.15,
  mute = true,
} = {}) {
  const session = await openSession(browser, {
    url,
    base,
    viewport,
    reducedMotion,
    fastTimers,
    mute,
    allowAbortedMedia: true,
    allowRemote: analytics,
  });
  sessions.push(session);
  return session;
}

async function closeChecked(session, label) {
  session.failed.splice(0, session.failed.length, ...session.failed.filter((failure) =>
    !analytics.some((prefix) => failure.startsWith(prefix))));
  checkSessionClean(reporter, session, label);
  await session.close();
  sessions.splice(sessions.indexOf(session), 1);
}

async function layoutAudit(page, label, selector = '[data-target]:not(.qk-hud-btn)') {
  const imageAudit = await page.evaluate(() => ({
    total: document.images.length,
    broken: [...document.images]
      .filter((image) => !image.complete || image.naturalWidth < 1)
      .map((image) => image.getAttribute('src')),
    overflowX: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
    overflowY: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - innerHeight,
    clipped: [...document.querySelectorAll('[data-target]')]
      .filter((node) => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { id: node.dataset.target, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      })
      .filter((rect) => rect.left < -1 || rect.top < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1),
  }));
  reporter.check(`${label}: all raster images decode`, imageAudit.broken.length === 0, imageAudit.broken.join(', '));
  reporter.check(`${label}: viewport has no document overflow`, imageAudit.overflowX <= 1 && imageAudit.overflowY <= 1, JSON.stringify(imageAudit));
  reporter.check(`${label}: visible controls stay in the viewport`, imageAudit.clipped.length === 0, JSON.stringify(imageAudit.clipped));

  const sizes = await targetSizes(page, selector);
  const small = undersized(sizes);
  reporter.check(`${label}: primary child targets are at least 96px`, sizes.length > 0 && small.length === 0,
    small.map((entry) => `${entry.id}:${Math.round(entry.w)}x${Math.round(entry.h)}`).join(', '));
}

async function waitForReadyStep(page, step) {
  await page.waitForFunction((expected) => {
    const state = window.QLOBE_DEBUG.getState();
    return state.step === expected && state.awaitingInput === true;
  }, step);
}

async function audioAudit(page) {
  const result = await page.evaluate(async () => {
    const [manifest, lines, qa] = await Promise.all([
      fetch('./assets/audio/manifest.json').then((response) => response.json()),
      fetch('./assets/audio/lines.json').then((response) => response.json()),
      fetch('./assets/audio/qa.json').then((response) => response.json()),
    ]);
    const entries = Object.entries(manifest)
      .filter(([, value]) => value && typeof value === 'object' && typeof value.file === 'string');
    const manifestKeys = entries.map(([key]) => key).sort();
    const lineKeys = Object.keys(lines).sort();
    const qaKeys = Object.keys(qa).sort();
    const issues = [];
    const context = new OfflineAudioContext(1, 48000, 48000);
    for (const [key, entry] of entries) {
      try {
        const response = await fetch(`./assets/audio/${entry.file}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const decoded = await context.decodeAudioData(await response.arrayBuffer());
        if (Math.abs(decoded.duration - entry.dur) > 0.2) {
          throw new Error(`duration ${decoded.duration.toFixed(3)} != ${entry.dur}`);
        }
      } catch (error) {
        issues.push(`${key}: ${error.message}`);
      }
    }
    const rejected = Object.entries(qa)
      .filter(([, value]) => value.status !== 'accepted' || value.match !== true || value.ratio < 0.9)
      .map(([key]) => key);
    return {
      manifestKeys,
      lineKeys,
      qaKeys,
      issues,
      rejected,
      version: manifest._v,
    };
  });

  reporter.check('voice manifest, fallback script, and Whisper QA contain the same 20 keys',
    result.manifestKeys.length === 20
      && result.manifestKeys.join(',') === result.lineKeys.join(',')
      && result.manifestKeys.join(',') === result.qaKeys.join(','), JSON.stringify(result));
  reporter.check('all 20 recorded clips decode in real Chrome', result.issues.length === 0, result.issues.join('; '));
  reporter.check('all 20 Whisper comparisons are accepted at >=0.90', result.rejected.length === 0, result.rejected.join(', '));
  reporter.check('voice manifest carries the production version', result.version === 'calm-corner-cards-voice-1', result.version);
}

async function runDesktop(browser) {
  reporter.head('Desktop playthrough');
  const session = await openGame(browser);
  const { page } = session;
  const initial = await debug.getState(page);
  reporter.check('card shelf boots ready', initial.screen === 'shelf' && initial.mode === null, JSON.stringify(initial));
  const modes = (await debug.listModes(page)).map((mode) => mode.id);
  reporter.check('four calm tools are registered', modes.join(',') === 'breathe,squeeze,draw,rest', modes.join(','));
  reporter.check('four authored card controls render', await page.locator('.calm-card[data-mode]').count() === 4);
  await layoutAudit(page, 'desktop shelf', '.calm-card[data-target]');
  await shot(page, '01-shelf-desktop');

  await page.locator('[data-target="mode-breathe"]').click();
  await debug.waitForScreen(page, 'play');
  await layoutAudit(page, 'breathe ready');
  reporter.check('breathing uses an authored raster ring and explicit 1-of-3 pacing',
    await page.locator('img.breathing-rings').count() === 1
      && await page.locator('.breath-count').textContent() === 'Breath 1 of 3'
      && await page.locator('[data-target="breathe-sunny"]').evaluate((node) => getComputedStyle(node, '::after').content === 'none'));
  await shot(page, '02-breathe-ready');
  for (let cycle = 1; cycle <= 3; cycle += 1) {
    await page.locator('[data-target="breathe-sunny"]').click();
    await debug.waitForState(page, 'phase', 'inhale');
    if (cycle === 1) await shot(page, '03-breathe-inhale');
    if (cycle < 3) await waitForReadyStep(page, cycle);
  }
  await debug.waitForScreen(page, 'end');
  reporter.check('three real child-paced breaths complete', (await debug.getState(page)).step === 3);
  await layoutAudit(page, 'breathe reflection', '.felt-action[data-target]');
  await shot(page, '04-breathe-reflection');
  await page.locator('[data-target="cards"]').click();
  await debug.waitForScreen(page, 'shelf');

  await page.locator('[data-target="mode-squeeze"]').click();
  await debug.waitForScreen(page, 'play');
  const squeeze = page.locator('[data-target="squeeze-toy"]');
  const squeezeBox = await squeeze.boundingBox();
  for (let count = 1; count <= 3; count += 1) {
    await page.mouse.move(squeezeBox.x + squeezeBox.width / 2, squeezeBox.y + squeezeBox.height / 2);
    await page.mouse.down();
    await squeeze.waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('[data-target="squeeze-toy"]')?.classList.contains('is-held'));
    if (count === 1) await shot(page, '05-squeeze-held');
    await page.mouse.up();
    await page.waitForFunction((step) => window.QLOBE_DEBUG.getState().step === step, count);
  }
  await debug.waitForScreen(page, 'end');
  reporter.check('three real press-and-release gestures complete', (await debug.getState(page)).step === 3);
  await shot(page, '06-squeeze-reflection');
  await debug.call(page, 'home');

  await page.locator('[data-target="mode-draw"]').click();
  await debug.waitForScreen(page, 'play');
  await layoutAudit(page, 'draw ready');
  await page.locator('[data-target="color-rainbow"]').click();
  const canvas = page.locator('[data-target="drawing-canvas"]');
  const drawBox = await canvas.boundingBox();
  const stroke = [
    { x: drawBox.x + drawBox.width * 0.18, y: drawBox.y + drawBox.height * 0.66 },
    { x: drawBox.x + drawBox.width * 0.34, y: drawBox.y + drawBox.height * 0.36 },
    { x: drawBox.x + drawBox.width * 0.52, y: drawBox.y + drawBox.height * 0.62 },
    { x: drawBox.x + drawBox.width * 0.72, y: drawBox.y + drawBox.height * 0.31 },
  ];
  await dragPath(page, stroke, { steps: 5 });
  await debug.waitForState(page, 'strokes', 1);
  reporter.check('real canvas pointer stroke is recorded', await page.evaluate(() => {
    const canvasNode = document.querySelector('[data-target="drawing-canvas"]');
    return [...canvasNode.getContext('2d').getImageData(0, 0, canvasNode.width, canvasNode.height).data]
      .some((channel, index) => index % 4 === 3 && channel > 0);
  }));
  await shot(page, '07-draw-active');
  await page.locator('[data-target="draw-undo"]').click();
  await debug.waitForState(page, 'strokes', 0);
  await dragPath(page, stroke, { steps: 4 });
  await page.locator('[data-target="draw-clear"]').click();
  reporter.check('Clear returns drawing state to zero', (await debug.getState(page)).strokes === 0);
  await page.locator('[data-target="draw-undo"]').click();
  await debug.waitForState(page, 'strokes', 1);
  reporter.check('Undo after Clear restores both pixels and stroke metadata', await canvas.evaluate((canvasNode) =>
    [...canvasNode.getContext('2d').getImageData(0, 0, canvasNode.width, canvasNode.height).data]
      .some((channel, index) => index % 4 === 3 && channel > 0)));
  await page.locator('[data-target="draw-clear"]').click();
  await debug.waitForState(page, 'strokes', 0);
  await canvas.focus();
  await canvas.press('ArrowRight');
  await canvas.press('ArrowDown');
  await canvas.press('Enter');
  await debug.waitForState(page, 'strokes', 1);
  reporter.check('keyboard and switch path moves an authored cursor and places a mark',
    await page.locator('.keyboard-draw-cursor.is-visible').count() === 1
      && await canvas.evaluate((canvasNode) =>
        [...canvasNode.getContext('2d').getImageData(0, 0, canvasNode.width, canvasNode.height).data]
          .some((channel, index) => index % 4 === 3 && channel > 0)));
  await page.locator('[data-target="draw-clear"]').click();
  await debug.waitForState(page, 'strokes', 0);
  await dragPath(page, stroke, { steps: 4 });
  await page.locator('[data-target="draw-done"]').click();
  await debug.waitForScreen(page, 'end');
  reporter.check('open-ended drawing completes with Done', (await debug.getState(page)).completed === true);
  reporter.check('drawing reflection preserves and features the child’s real marks',
    (await debug.getState(page)).hasDrawingPreview === true
      && await page.locator('#end-drawing-card:visible').count() === 1
      && await page.locator('#end-drawing-preview').evaluate((canvasNode) =>
        [...canvasNode.getContext('2d').getImageData(0, 0, canvasNode.width, canvasNode.height).data]
          .some((channel, index) => index % 4 === 3 && channel > 0)));
  await shot(page, '08-draw-reflection');
  await debug.call(page, 'home');

  await page.locator('[data-target="mode-rest"]').click();
  await debug.waitForScreen(page, 'play');
  await page.locator('[data-target="rest-star-1"]').click();
  await page.locator('[data-target="rest-star-3"]').click();
  reporter.check('rest stars toggle independently', JSON.stringify((await debug.getState(page)).starsDimmed) === '[0,2]');
  await page.locator('[data-target="rest-star-1"]').click();
  reporter.check('rest star can brighten again', JSON.stringify((await debug.getState(page)).starsDimmed) === '[2]');
  await layoutAudit(page, 'rest active');
  await shot(page, '09-rest-active');
  await page.locator('[data-target="rest-done"]').click();
  await debug.waitForScreen(page, 'end');
  reporter.check('quiet rest is open-ended and completable', (await debug.getState(page)).completed === true);
  await shot(page, '10-rest-reflection');

  await page.locator('[data-target="again"]').click();
  await debug.waitForScreen(page, 'play');
  reporter.check('Again restarts the same card fresh', (await debug.getState(page)).mode === 'rest'
    && (await debug.getState(page)).starsDimmed.length === 0);
  await page.locator('[data-target="back"]:visible').click();
  await debug.waitForScreen(page, 'shelf');
  reporter.check('Back returns to the card shelf', (await debug.getState(page)).mode === null);

  await page.locator('[data-target="mode-breathe"]').click();
  await page.locator('[data-target="breathe-sunny"]').click();
  await debug.waitForState(page, 'phase', 'inhale');
  await page.locator('[data-target="back"]:visible').click();
  await debug.waitForScreen(page, 'shelf');
  await page.waitForTimeout(1200);
  const cancelled = await debug.getState(page);
  reporter.check('Back during a breath cancels stale timers and activity DOM',
    cancelled.screen === 'shelf' && cancelled.timers === 0
      && await page.locator('#activity-host > *').count() === 0, JSON.stringify(cancelled));

  await audioAudit(page);
  await closeChecked(session, 'desktop session');
}

async function runResponsive(browser, name, viewport, activeMode) {
  reporter.head(`${name} layout`);
  const session = await openGame(browser, { viewport, fastTimers: 0.05 });
  const { page } = session;
  await layoutAudit(page, `${name} shelf`, '.calm-card[data-target]');
  await shot(page, `11-${name}-shelf`);
  for (const mode of ['breathe', 'squeeze', 'draw', 'rest']) {
    await debug.startMode(page, mode);
    await debug.waitForScreen(page, 'play');
    await layoutAudit(page, `${name} ${mode}`);
    if (mode === activeMode) await shot(page, `12-${name}-${mode}`);
    await debug.call(page, 'home');
  }
  await closeChecked(session, `${name} session`);
}

async function runReducedMotion(browser) {
  reporter.head('Reduced motion');
  const session = await openGame(browser, { reducedMotion: 'reduce', fastTimers: 0.02 });
  const { page } = session;
  reporter.check('reduced-motion preference is active', await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
  await debug.startMode(page, 'breathe');
  await shot(page, '13-reduced-motion-breathe');
  await debug.call(page, 'completeBreaths');
  await debug.waitForScreen(page, 'end');
  reporter.check('reduced-motion breathing reaches reflection', (await debug.getState(page)).completed === true);
  await closeChecked(session, 'reduced-motion session');
}

async function runRecordedVoice(browser) {
  reporter.head('Recorded narration gesture');
  const session = await openGame(browser, { viewport: { width: 1024, height: 768 }, fastTimers: 0.05, mute: false });
  const { page } = session;
  await page.locator('[data-target="mode-breathe"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog()
    .some((entry) => entry.key === 'breathe-intro' && entry.kind === 'clip'), null, { timeout: 10000 });
  reporter.check('a real first gesture plays the recorded teacher clip', true);
  await debug.mute(page, true);
  await closeChecked(session, 'recorded-voice session');
}

const browser = await launchChrome({ channel: 'chrome' });
try {
  await runDesktop(browser);
  await runResponsive(browser, 'portrait', { width: 768, height: 1024 }, 'draw');
  await runResponsive(browser, 'compact', { width: 844, height: 390 }, 'rest');
  await runReducedMotion(browser);
  await runRecordedVoice(browser);
} catch (error) {
  reporter.check('QA driver completed without exception', false, error.stack || error.message);
} finally {
  await Promise.all(sessions.map((session) => session.close().catch(() => {})));
  await browser.close();
  reporter.finish({ suffix: `; screenshots in ${shots}`, exit: true });
}
