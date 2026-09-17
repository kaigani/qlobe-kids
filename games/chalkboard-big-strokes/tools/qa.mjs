#!/usr/bin/env node
// Real-Chrome smoke and visual-QC gate for Chalkboard Big Strokes.
//
//   python -m http.server 8000
//   node games/chalkboard-big-strokes/tools/qa.mjs
//   BASE_URL=https://qlo.be node games/chalkboard-big-strokes/tools/qa.mjs

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  args, launchChrome, createReporter, openSession, checkSessionClean,
  debug, resolveShots, ensureShots, shooter, targetSizes, undersized,
} from '../../../tools/qa/lib/driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME_DIR = path.resolve(HERE, '..');
const base = args.flag('base', process.env.BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const url = `${base}/games/chalkboard-big-strokes/`;
const tempRoot = process.env.TEMP || process.env.TMP || GAME_DIR;
const shots = resolveShots(path.join(tempRoot, 'qlobe-qa', 'chalkboard-big-strokes'));
const shot = shooter(shots);
const { check, note, finish } = createReporter({ collapse: true, detailLimit: 900 });
const sessions = [];
const analyticsOrigins = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];

async function openRun(browser, {
  viewport = { width: 1180, height: 820 },
  reducedMotion = 'no-preference',
  mute = true,
} = {}) {
  const session = await openSession(browser, {
    url,
    base,
    viewport,
    reducedMotion,
    allowAbortedMedia: true,
    allowRemote: analyticsOrigins,
    seed: 0,
    fastTimers: 0.05,
    mute,
  });
  sessions.push(session);
  return session;
}

async function auditRecordedVoice(browser) {
  const voiced = await openRun(browser, { mute: false });
  const page = voiced.page;
  const decoded = await page.evaluate(async () => {
    const config = await fetch('./config.json').then((response) => response.json());
    const results = await Promise.all(Object.entries(config.audio).map(([key, file]) => new Promise((resolve) => {
      const clip = new Audio();
      const timeout = setTimeout(() => resolve({ key, ok: false, reason: 'timeout' }), 7000);
      clip.preload = 'metadata';
      clip.onloadedmetadata = () => {
        clearTimeout(timeout);
        resolve({ key, ok: Number.isFinite(clip.duration) && clip.duration > 0.2, duration: clip.duration });
      };
      clip.onerror = () => {
        clearTimeout(timeout);
        resolve({ key, ok: false, reason: 'decode' });
      };
      clip.src = file;
    })));
    return { expected: Object.keys(config.voice).length, results };
  });
  check('real Chrome decodes every authored teacher line',
    decoded.expected === 10 && decoded.results.length === decoded.expected && decoded.results.every(({ ok }) => ok),
    JSON.stringify(decoded));

  await page.evaluate(() => {
    const nativePlay = HTMLMediaElement.prototype.play;
    const nativePause = HTMLMediaElement.prototype.pause;
    window.__chalkClipStarts = [];
    window.__chalkClipPauses = [];
    HTMLMediaElement.prototype.play = function (...params) {
      const element = this;
      const result = nativePlay.apply(this, params);
      Promise.resolve(result).then(() => {
        window.__chalkClipStarts.push(element.currentSrc || element.src);
      }, () => {});
      return result;
    };
    HTMLMediaElement.prototype.pause = function (...params) {
      window.__chalkClipPauses.push(this.currentSrc || this.src);
      return nativePause.apply(this, params);
    };
    window.QLOBE_DEBUG.clearAudioLog();
  });
  await page.locator('[data-target="mode-wave"]').click();
  await page.waitForFunction(() => window.__chalkClipStarts.some((source) => /\/wave\.m4a(?:$|\?)/.test(source)));
  const firstGesture = await page.evaluate(() => ({
    starts: window.__chalkClipStarts.slice(),
    log: window.QLOBE_DEBUG.getAudioLog(),
  }));
  check('first real gesture unlocks and starts the recorded Wave prompt',
    firstGesture.starts.some((source) => /\/wave\.m4a(?:$|\?)/.test(source))
      && firstGesture.log.some((entry) => entry.kind === 'clip' && /\/wave\.m4a(?:$|\?)/.test(entry.key)),
    JSON.stringify(firstGesture));
  const ducked = await debug.call(page, 'getBgmStats');
  check('recorded narration ducks the playing background track',
    ducked.playing === true && ducked.duckFactor === 0.18,
    JSON.stringify(ducked));

  await page.locator('[data-target="mute"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().muted === true);
  const mutedState = await page.evaluate(() => ({
    state: window.QLOBE_DEBUG.getState(),
    pressed: document.querySelector('[data-target="mute"]')?.getAttribute('aria-pressed'),
    paused: window.__chalkClipPauses.slice(),
    bgm: window.QLOBE_DEBUG.getBgmStats(),
  }));
  check('mute immediately stops the recorded prompt and exposes its pressed state',
    mutedState.state.muted === true && mutedState.pressed === 'true'
      && mutedState.paused.some((source) => /\/wave\.m4a(?:$|\?)/.test(source))
      && mutedState.bgm.duckFactor === 1,
    JSON.stringify(mutedState));
  await debug.clearAudioLog(page);
  await debug.startMode(page, 'loop');
  await page.waitForTimeout(120);
  check('muted play does not enqueue another teacher line', (await debug.getAudioLog(page)).length === 0);

  await page.locator('[data-target="mute"]').click();
  await page.locator('[data-target="back"]').click();
  await debug.waitForScreen(page, 'selection');
  await debug.clearAudioLog(page);
  await page.locator('[data-target="mode-loop"]').click();
  await page.waitForFunction(() => window.__chalkClipStarts.some((source) => /\/loop\.m4a(?:$|\?)/.test(source)));
  const loopDuck = await debug.call(page, 'getBgmStats');
  check('unmuted replay re-applies the narration duck', loopDuck.duckFactor === 0.18, JSON.stringify(loopDuck));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getBgmStats().duckFactor === 1, null, { timeout: 8000 });
  const restored = await debug.call(page, 'getBgmStats');
  check('background level restores when recorded narration finishes',
    restored.playing === true && restored.muted === false && restored.duckFactor === 1,
    JSON.stringify(restored));
}

async function checkTargets(page, label) {
  const sizes = await targetSizes(page);
  const tooSmall = undersized(sizes, 96);
  check(`${label}: every visible child target is at least 96px`, tooSmall.length === 0,
    tooSmall.map(({ id, w, h }) => `${id}:${Math.round(w)}x${Math.round(h)}`).join(', '));
}

async function checkControlsInside(page, label) {
  const result = await page.locator('[data-target]').evaluateAll((nodes) => nodes
    .filter((node) => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && !node.disabled)
    .map((node) => {
      const rect = node.getBoundingClientRect();
      return { id: node.dataset.target, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
    })
    .filter((rect) => rect.x < -2 || rect.y < -2 || rect.right > innerWidth + 2 || rect.bottom > innerHeight + 2));
  check(`${label}: controls stay inside the viewport`, result.length === 0, JSON.stringify(result));
}

async function canvasPath(page) {
  return page.evaluate(() => {
    const layout = window.QLOBE_DEBUG.getLayout();
    const points = window.QLOBE_DEBUG.path;
    const inset = layout.inset;
    return points.map((point) => ({
      x: layout.canvas.x + layout.canvas.width * (inset + point.x * (1 - inset * 2)),
      y: layout.canvas.y + layout.canvas.height * (inset + point.y * (1 - inset * 2)),
    }));
  });
}

async function realTrace(page) {
  const points = await canvasPath(page);
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(point.x, point.y);
  await page.mouse.up();
}

async function realPartialErase(page, fraction = 0.36) {
  const eraser = await page.locator('[data-target="eraser"]').boundingBox();
  if (!eraser) throw new Error('eraser has no layout box');
  const points = await canvasPath(page);
  const count = Math.max(2, Math.floor(points.length * fraction));
  await page.mouse.move(eraser.x + eraser.width / 2, eraser.y + eraser.height / 2);
  await page.mouse.down();
  for (const point of points.slice(0, count)) await page.mouse.move(point.x, point.y);
  await page.mouse.up();
}

async function runAllVariants(page, modeId) {
  const ids = [];
  await debug.startMode(page, modeId);
  for (let round = 0; round < 3; round += 1) {
    if (round > 0) await debug.call(page, 'startRound', round, modeId);
    const target = await page.evaluate(() => window.QLOBE_DEBUG.target);
    ids.push(target.id);
    const before = await debug.getState(page);
    check(`${modeId} round ${round + 1} opens a substantial normalized path`,
      before.screen === 'trace' && before.pathLength >= 80 && before.progress === 0,
      JSON.stringify(before));
    check(`${modeId} round ${round + 1} stays inside normalized coordinates`,
      await page.evaluate(() => window.QLOBE_DEBUG.path.every(({ x, y }) => x >= 0 && x <= 1 && y >= 0 && y <= 1)));
    check(`${modeId} round ${round + 1} completes through the shared trace handler`,
      await debug.call(page, 'completeRound'));
    await debug.waitForScreen(page, 'success');
  }
  check(`${modeId} exposes three deterministic visual variants`, new Set(ids).size === 3, ids.join(', '));
  check(`${modeId} enters erase from its finished stroke`, await debug.call(page, 'beginErase'));
  check(`${modeId} erases to the replay prompt`, await debug.call(page, 'completeErase'));
  await debug.waitForScreen(page, 'replay');
}

async function drive(browser) {
  await ensureShots(shots);

  const landscape = await openRun(browser);
  const page = landscape.page;
  let current = await debug.getState(page);
  const modes = await debug.listModes(page);
  check('game boots directly to the integrated stroke selection', current.screen === 'selection');
  check('exact Wave, Loop, Star, and Letter S modes are registered',
    modes.map(({ id }) => id).join(',') === 'wave,loop,star,letter-s', JSON.stringify(modes));
  check('each mode declares exactly three rounds', modes.every(({ rounds }) => rounds === 3));
  check('QLOBE_DEBUG exposes the required v1 extension surface',
    await page.evaluate(() => {
      const q = window.QLOBE_DEBUG;
      return q.version === 1 && q.ready && Array.isArray(q.modes) && q.state
        && ['startMode','startRound','tracePoint','input','completeRound','beginErase','erasePoint','completeErase','setMuted','setSeed','setFastTimers']
          .every((key) => typeof q[key] === 'function');
    }));
  await checkTargets(page, 'landscape selection');
  await checkControlsInside(page, 'landscape selection');
  check('all selection artwork decoded', await page.locator('img:visible').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)));
  await shot(page, '01-selection-landscape.png');

  await debug.call(page, 'setSeed', 5);
  await debug.startMode(page, 'loop');
  const seededA = (await debug.getState(page)).target;
  await debug.startMode(page, 'loop');
  const seededB = (await debug.getState(page)).target;
  check('seeded mode start is deterministic', seededA === seededB, `${seededA} vs ${seededB}`);
  await debug.call(page, 'setSeed', 0);

  await debug.startMode(page, 'wave');
  current = await debug.getState(page);
  const wavePath = await page.evaluate(() => window.QLOBE_DEBUG.path);
  const wrong = {
    x: wavePath[0].x < 0.5 ? 0.96 : 0.04,
    y: wavePath[0].y < 0.5 ? 0.96 : 0.04,
  };
  const layout = await debug.call(page, 'getLayout');
  const wrongClient = {
    x: layout.canvas.x + layout.canvas.width * (layout.inset + wrong.x * (1 - layout.inset * 2)),
    y: layout.canvas.y + layout.canvas.height * (layout.inset + wrong.y * (1 - layout.inset * 2)),
  };
  await page.mouse.click(wrongClient.x, wrongClient.y);
  const afterWrong = await debug.getState(page);
  check('wrong-start real pointer input has no penalty and no lost progress',
    afterWrong.screen === 'trace' && afterWrong.progress === current.progress && afterWrong.wrongStarts === 1,
    JSON.stringify(afterWrong));
  await checkTargets(page, 'landscape trace');
  await checkControlsInside(page, 'landscape trace');
  await shot(page, '02-wave-trace-landscape.png');

  await realTrace(page);
  await debug.waitForScreen(page, 'success');
  current = await debug.getState(page);
  check('real captured pointer drag completes Wave', current.progress === 1 && current.target === 'two-big-waves', JSON.stringify(current));
  check('success transforms the guide into a sparkling completed stroke', await page.locator('.sparkle-field img').count() === 10);
  await checkTargets(page, 'landscape success');
  await shot(page, '03-wave-success-landscape.png');

  await page.locator('[data-target="erase-start"]').click();
  await debug.waitForScreen(page, 'erase');
  await realPartialErase(page);
  current = await debug.getState(page);
  check('real draggable felt eraser visibly clears part of the finished stroke',
    current.screen === 'erase' && current.eraseProgress > 0.12 && current.clearedPoints > 0,
    JSON.stringify(current));
  await checkTargets(page, 'landscape erase');
  await shot(page, '04-wave-partly-erased-landscape.png');
  await debug.call(page, 'completeErase');
  await debug.waitForScreen(page, 'replay');
  check('sufficient erasing opens the two-choice replay prompt',
    await page.locator('[data-target="replay-again"], [data-target="choose-stroke"]').count() === 2);
  await checkTargets(page, 'landscape replay');
  await shot(page, '05-replay-landscape.png');

  // Wave round zero used the real pointer route above; complete its other two
  // authored variants, then sweep every variant of the other modes.
  await runAllVariants(page, 'wave');
  for (const modeId of ['loop', 'star', 'letter-s']) await runAllVariants(page, modeId);
  await shot(page, '06-letter-s-replay-landscape.png');

  await debug.tap(page, 'choose-stroke');
  await debug.waitForScreen(page, 'selection');
  await page.locator('[data-target="mode-star"]').click();
  await debug.waitForScreen(page, 'trace');
  await debug.tap(page, 'back');
  check('Back returns active play to the in-game selection', (await debug.getState(page)).screen === 'selection');

  const portrait = await openRun(browser, { viewport: { width: 768, height: 1024 } });
  await checkTargets(portrait.page, 'portrait selection');
  await checkControlsInside(portrait.page, 'portrait selection');
  await shot(portrait.page, '07-selection-portrait.png');
  await debug.startMode(portrait.page, 'letter-s');
  await checkTargets(portrait.page, 'portrait trace');
  await checkControlsInside(portrait.page, 'portrait trace');
  await shot(portrait.page, '08-letter-s-trace-portrait.png');
  await debug.call(portrait.page, 'completeRound');
  await debug.waitForScreen(portrait.page, 'success');
  await checkControlsInside(portrait.page, 'portrait success');
  await shot(portrait.page, '09-letter-s-success-portrait.png');

  const phone = await openRun(browser, { viewport: { width: 375, height: 667 } });
  await checkTargets(phone.page, 'phone selection');
  await checkControlsInside(phone.page, 'phone selection');
  await shot(phone.page, '10-selection-phone.png');
  await debug.startMode(phone.page, 'star');
  await checkControlsInside(phone.page, 'phone trace');
  await debug.call(phone.page, 'completeRound');
  await debug.call(phone.page, 'beginErase');
  await checkTargets(phone.page, 'phone erase');
  await checkControlsInside(phone.page, 'phone erase');
  await shot(phone.page, '11-erase-phone.png');

  const short = await openRun(browser, { viewport: { width: 1180, height: 520 } });
  await checkTargets(short.page, 'short landscape selection');
  await checkControlsInside(short.page, 'short landscape selection');
  await debug.startMode(short.page, 'loop');
  await checkControlsInside(short.page, 'short landscape trace');
  await shot(short.page, '12-loop-short-landscape.png');

  const reduced = await openRun(browser, { reducedMotion: 'reduce' });
  await debug.startMode(reduced.page, 'star');
  await debug.call(reduced.page, 'completeRound');
  await debug.waitForScreen(reduced.page, 'success');
  current = await debug.getState(reduced.page);
  check('reduced-motion run reaches the same success state', current.screen === 'success' && current.reducedMotion === true);
  const animation = await reduced.page.locator('.start-beacon, .sparkle-field img').first().evaluate((node) => getComputedStyle(node).animationDuration);
  check('reduced-motion CSS collapses decorative animation', Number.parseFloat(animation) <= 0.001, animation);
  await shot(reduced.page, '13-star-success-reduced-motion.png');

  const share = await openRun(browser, { viewport: { width: 1200, height: 630 } });
  await checkControlsInside(share.page, 'share-card selection');
  await share.page.locator('img:visible').evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  await shot(share.page, '14-selection-share.png');
  if (/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::|\/|$)/.test(base)) {
    await share.page.screenshot({
      path: path.join(GAME_DIR, 'assets', 'og-image.jpg'),
      type: 'jpeg',
      quality: 84,
    });
  }

  await auditRecordedVoice(browser);

  const nav = await openRun(browser);
  await nav.page.locator('[data-target="home"]').click();
  await nav.page.waitForURL((next) => next.pathname === '/' || next.pathname.endsWith('/index.html'));
  check('Home returns the selection screen to the catalog', true);

  for (const [index, session] of sessions.entries()) {
    // analytics.js is shared platform furniture. Chrome may abort its beacon
    // during context teardown; keep the audit strict for every game/local
    // request while allowing only those two known analytics origins.
    session.failed = session.failed.filter((entry) => !analyticsOrigins.some((origin) => entry.startsWith(origin)));
    checkSessionClean({ check }, session, `session ${index + 1}`);
  }

  const expectedArt = [
    'board-backdrop.webp', 'title-lockup.webp', 'mode-card-cyan.webp', 'mode-card-yellow.webp',
    'mode-card-pink.webp', 'mode-card-white.webp', 'button-plaque.webp', 'felt-eraser.webp',
    'chalk-buddy.webp', 'chalk-pieces.webp', 'sparkle.webp', 'nav-back.webp',
  ];
  const sizes = Object.fromEntries(await Promise.all(expectedArt.map(async (name) => [
    name, (await stat(path.join(GAME_DIR, 'assets', 'art', name))).size,
  ])));
  check('board backdrop stays within the 300 KB world budget', sizes['board-backdrop.webp'] <= 300_000, `${sizes['board-backdrop.webp']} bytes`);
  check('foreground raster assets each stay within 150 KB',
    Object.entries(sizes).filter(([name]) => name !== 'board-backdrop.webp').every(([, size]) => size <= 150_000), JSON.stringify(sizes));

  const [configText, cssText, mainText] = await Promise.all([
    readFile(path.join(GAME_DIR, 'config.json'), 'utf8'),
    readFile(path.join(GAME_DIR, 'css', 'style.css'), 'utf8'),
    readFile(path.join(GAME_DIR, 'js', 'main.js'), 'utf8'),
  ]);
  check('runtime contains no emoji placeholder artwork', !configText.includes('emoji:') && !mainText.includes('emoji:'));
  check('child-facing skin contains no CSS gradients pretending to be artwork', !/gradient\(/.test(cssText));
  check('all primary furniture references authored raster assets',
    expectedArt.every((name) => configText.includes(name) || cssText.includes(name) || mainText.includes(name)));
  note(`visual-QC screenshots: ${shots}`);
}

const browser = await launchChrome();
try {
  await drive(browser);
} finally {
  await Promise.all(sessions.map((session) => session.close().catch(() => {})));
  await browser.close();
}
finish({ suffix: `; screenshots in ${shots}` });
