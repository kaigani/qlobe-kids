#!/usr/bin/env node
// Real-Chrome gameplay, audio, responsive-layout, and visual-QC gate.
//
//   python -m http.server 8765
//   node games/sandpaper-number-match/tools/qa.mjs --base http://127.0.0.1:8765

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  args,
  launchChrome,
  createReporter,
  openSession,
  checkSessionClean,
  debug,
  audio,
  resolveShots,
  ensureShots,
  shooter,
  dragPath,
  targetSizes,
  undersized,
} from '../../../tools/qa/lib/driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..');
const ROOT = path.resolve(GAME, '..', '..');
const CONFIG = JSON.parse(await readFile(path.join(GAME, 'config.json'), 'utf8'));
const BASE = args.flag('base', process.env.QLOBE_BASE || 'http://127.0.0.1:8765').replace(/\/$/, '');
const URL = `${BASE}/games/sandpaper-number-match/`;
const SHOTS = resolveShots(path.join(GAME, 'qa-shots'));
const shot = shooter(SHOTS);
const { check, note, finish } = createReporter({ collapse: true, detailLimit: 1200 });
const sessions = [];
const analyticsOrigins = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];

async function openRun(browser, {
  viewport = { width: 1280, height: 960 },
  reducedMotion = 'no-preference',
  mute = null,
} = {}) {
  const session = await openSession(browser, {
    url: URL,
    base: BASE,
    viewport,
    reducedMotion,
    seed: 42,
    fastTimers: 0.05,
    mute,
    allowAbortedMedia: true,
    allowRemote: analyticsOrigins,
  });
  sessions.push(session);
  return session;
}

async function waitForPhase(page, phase, timeout = 12_000) {
  await page.waitForFunction(
    (wanted) => window.QLOBE_DEBUG.getState().phase === wanted,
    phase,
    { timeout },
  );
}

async function waitForReward(page, timeout = 12_000) {
  await debug.waitForScreen(page, 'reward', { timeout });
}

async function checkTargets(page, label) {
  const sizes = await targetSizes(page);
  const tooSmall = undersized(sizes, 96);
  check(`${label}: visible child targets meet the 96px floor`, tooSmall.length === 0,
    JSON.stringify(tooSmall));
  const outside = await page.locator('[data-target]').evaluateAll((nodes) => nodes
    .filter((node) => node.getClientRects().length
      && getComputedStyle(node).visibility !== 'hidden'
      && !node.disabled)
    .map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        id: node.dataset.target,
        x: rect.x,
        y: rect.y,
        right: rect.right,
        bottom: rect.bottom,
      };
    })
    .filter((rect) => rect.x < -2 || rect.y < -2
      || rect.right > innerWidth + 2 || rect.bottom > innerHeight + 2));
  check(`${label}: visible child targets stay inside the viewport`, outside.length === 0,
    JSON.stringify(outside));
}

async function checkImages(page, label) {
  const images = await page.locator('img:visible').evaluateAll((nodes) => nodes.map((image) => ({
    src: image.getAttribute('src'),
    complete: image.complete,
    width: image.naturalWidth,
    height: image.naturalHeight,
  })));
  check(`${label}: every visible raster asset decodes`,
    images.length > 0 && images.every((image) => image.complete && image.width > 0 && image.height > 0),
    JSON.stringify(images.filter((image) => !image.complete || !image.width || !image.height)));
}

async function canvasPaths(page) {
  const state = await debug.getState(page);
  const source = CONFIG.trace.paths[String(state.number)];
  const box = await page.locator('#trace-canvas').boundingBox();
  if (!source || !box) throw new Error(`missing trace geometry for ${state.number}`);
  const paths = Array.isArray(source[0]?.[0]) ? source : [source];
  return paths.map((pathPoints) => pathPoints.map(([x, y]) => ({
    x: box.x + box.width * x,
    y: box.y + box.height * y,
  })));
}

async function realTrace(page) {
  const paths = await canvasPaths(page);
  for (const points of paths) await dragPath(page, points, { steps: 14 });
}

async function tapEveryStar(page, { pause = 35 } = {}) {
  const total = await page.locator('.star-button').count();
  for (let index = 0; index < total; index += 1) {
    await page.locator(`[data-target="star-${index}"]`).click();
    if (pause) await page.waitForTimeout(pause);
  }
  return total;
}

async function finishMode(page, modeId) {
  await debug.startMode(page, modeId);
  for (let guard = 0; guard < 30; guard += 1) {
    const current = await debug.getState(page);
    if (current.screen === 'play' && current.phase === 'trace') {
      await debug.winRound(page);
      await waitForPhase(page, 'count');
      continue;
    }
    if (current.screen === 'play' && (current.phase === 'count' || current.phase === 'match')) {
      await debug.winRound(page);
      await waitForReward(page);
      continue;
    }
    if (current.screen === 'reward') {
      if (current.roundIndex >= current.roundsTotal - 1) return current;
      await page.locator('[data-target="next"]').click();
      await debug.waitForScreen(page, 'play');
      continue;
    }
    throw new Error(`unexpected ${modeId} state: ${JSON.stringify(current)}`);
  }
  throw new Error(`${modeId} did not finish within the guard`);
}

async function auditRecordedAudio(page) {
  const decoded = await page.evaluate(async () => {
    const manifest = await fetch('./assets/audio/manifest.json').then((response) => response.json());
    const lines = await fetch('./assets/audio/lines.json').then((response) => response.json());
    const results = await Promise.all(Object.entries(manifest).map(([key, entry]) => new Promise((resolve) => {
      const clip = new Audio();
      const timeout = setTimeout(() => resolve({ key, ok: false, reason: 'timeout' }), 8000);
      clip.preload = 'metadata';
      clip.onloadedmetadata = () => {
        clearTimeout(timeout);
        resolve({ key, ok: Number.isFinite(clip.duration) && clip.duration >= 0.3, duration: clip.duration });
      };
      clip.onerror = () => {
        clearTimeout(timeout);
        resolve({ key, ok: false, reason: 'decode' });
      };
      clip.src = `./assets/audio/${entry.file}`;
    })));
    return { lineKeys: Object.keys(lines), manifestKeys: Object.keys(manifest), results };
  });
  check('real Chrome decodes every configured teacher-voice clip',
    decoded.lineKeys.length === Object.keys(CONFIG.voice).length
      && decoded.manifestKeys.length === decoded.lineKeys.length
      && decoded.results.every(({ ok }) => ok),
    JSON.stringify(decoded.results.filter(({ ok }) => !ok)));
}

async function driveLandscape(browser) {
  const session = await openRun(browser);
  const page = session.page;
  let current = await debug.getState(page);
  const modes = await debug.listModes(page);
  check('game boots to the quiet-book selection', current.screen === 'selection' && current.mode === null,
    JSON.stringify(current));
  check('exact Trace & Count, Star Count, and Find a Match modes are registered',
    modes.map(({ id }) => id).join(',') === 'journey,star-count,match', JSON.stringify(modes));
  check('QLOBE_DEBUG v1 exposes standard state and game extensions', await page.evaluate(() => {
    const q = window.QLOBE_DEBUG;
    const state = q.getState();
    return q.version === 1
      && ['startMode', 'getState', 'getTargets', 'tap', 'winRound', 'home', 'mute',
        'seed', 'fastTimers', 'trace', 'completeTrace', 'getAudioLog', 'getBgmStats', 'getLayout']
        .every((key) => typeof q[key] === 'function')
      && Number.isInteger(state.round) && Number.isInteger(state.roundsTotal);
  }));
  await checkTargets(page, 'landscape selection');
  await checkImages(page, 'landscape selection');
  await shot(page, '01-selection-landscape.png');
  await auditRecordedAudio(page);

  // Observe actual media starts, then begin through a real mode-card gesture.
  await page.evaluate(() => {
    const nativePlay = HTMLMediaElement.prototype.play;
    window.__sandpaperMediaStarts = [];
    HTMLMediaElement.prototype.play = function (...params) {
      const element = this;
      const result = nativePlay.apply(this, params);
      Promise.resolve(result).then(() => {
        window.__sandpaperMediaStarts.push(element.currentSrc || element.src);
      }, () => {});
      return result;
    };
    window.QLOBE_DEBUG.clearAudioLog();
  });
  await page.locator('[data-target="mode-journey"]').click();
  await waitForPhase(page, 'trace');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog().some((entry) => entry.key === 'trace'));
  const audioStart = await page.evaluate(() => ({
    log: window.QLOBE_DEBUG.getAudioLog(),
    starts: window.__sandpaperMediaStarts,
    bgm: window.QLOBE_DEBUG.getBgmStats(),
  }));
  check('first real gesture starts recorded mode and trace guidance',
    audio.clipsInOrder(audioStart.log, ['journey', 'trace'])
      && audioStart.starts.some((source) => /journey\.m4a(?:$|\?)/.test(source))
      && audioStart.bgm.playing === true,
    `${audio.describe(audioStart.log)} | ${JSON.stringify(audioStart.starts)}`);
  await checkTargets(page, 'landscape trace');
  await checkImages(page, 'landscape trace');
  await shot(page, '02-trace-landscape.png');

  const beforeMiss = await debug.getState(page);
  const paths = await canvasPaths(page);
  const box = await page.locator('#trace-canvas').boundingBox();
  const start = paths[0][0];
  const wrong = {
    x: box.x + box.width * (start.x - box.x < box.width / 2 ? 0.94 : 0.06),
    y: box.y + box.height * (start.y - box.y < box.height / 2 ? 0.94 : 0.06),
  };
  await page.mouse.click(wrong.x, wrong.y);
  await page.mouse.click(wrong.x, wrong.y);
  const afterMiss = await debug.getState(page);
  check('off-path starts preserve progress and trigger gentle coaching',
    afterMiss.phase === 'trace' && afterMiss.traceCoverage === beforeMiss.traceCoverage
      && afterMiss.traceMisses === beforeMiss.traceMisses + 2,
    JSON.stringify(afterMiss));

  await realTrace(page);
  await waitForPhase(page, 'count');
  current = await debug.getState(page);
  check('genuine captured pointer tracing reaches the matching count phase',
    current.phase === 'count' && current.traceCoverage >= CONFIG.trace.threshold,
    JSON.stringify(current));
  await checkTargets(page, 'landscape count');
  await checkImages(page, 'landscape count');
  await shot(page, '03-count-landscape.png');
  const starTotal = await tapEveryStar(page);
  await waitForReward(page);
  current = await debug.getState(page);
  check('real star taps complete exactly the displayed quantity',
    starTotal === current.number && current.screen === 'reward', JSON.stringify(current));
  await checkTargets(page, 'landscape reward');
  await shot(page, '04-round-reward-landscape.png');

  await page.locator('[data-target="next"]').click();
  await waitForPhase(page, 'trace');
  await page.locator('[data-target="back"]:visible').click();
  await debug.waitForScreen(page, 'selection');
  check('Back returns active play to the in-game selection',
    (await debug.getState(page)).mode === null);

  // The visible sound control and the debug mute route must be the same state.
  await page.locator('[data-target="mute"]:visible').click();
  let muteState = await page.evaluate(() => ({
    state: window.QLOBE_DEBUG.getState(),
    bgm: window.QLOBE_DEBUG.getBgmStats(),
    pressed: document.querySelector('[data-screen="selection"] [data-target="mute"]')?.getAttribute('aria-pressed'),
  }));
  check('visible Sound control mutes voice, SFX, and music state',
    muteState.state.muted && muteState.bgm.muted && muteState.pressed === 'true',
    JSON.stringify(muteState));
  await debug.mute(page, false);
  muteState = await page.evaluate(() => ({ state: window.QLOBE_DEBUG.getState(), bgm: window.QLOBE_DEBUG.getBgmStats() }));
  check('debug unmute synchronizes game and music state', !muteState.state.muted && !muteState.bgm.muted,
    JSON.stringify(muteState));

  // A mute gesture is also an interruption. Completion gates must settle at
  // once instead of waiting for voice-clips' multi-second safety timeout.
  await debug.startMode(page, 'journey');
  await debug.clearAudioLog(page);
  await debug.call(page, 'completeTrace');
  await debug.waitForAudio(page, 'traceDone');
  let interruptedAt = Date.now();
  await page.locator('[data-target="mute"]:visible').click();
  await waitForPhase(page, 'count', 1200);
  let interruptMs = Date.now() - interruptedAt;
  check('muting during trace praise advances immediately to counting', interruptMs < 1000,
    `${interruptMs}ms`);

  await debug.mute(page, false);
  await debug.startMode(page, 'star-count');
  current = await debug.getState(page);
  for (let index = 0; index < current.number - 1; index += 1) {
    await page.locator(`[data-target="star-${index}"]`).click();
  }
  await debug.clearAudioLog(page);
  await page.locator(`[data-target="star-${current.number - 1}"]`).click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog().length > 0);
  interruptedAt = Date.now();
  await page.locator('[data-target="mute"]:visible').click();
  await waitForReward(page, 1200);
  interruptMs = Date.now() - interruptedAt;
  check('muting during the final counted number advances immediately to reward', interruptMs < 1000,
    `${interruptMs}ms`);

  await debug.mute(page, false);
  await debug.startMode(page, 'match');
  current = await debug.getState(page);
  await debug.clearAudioLog(page);
  await page.locator(`[data-target="quantity-${current.number}"]`).click();
  await debug.waitForAudio(page, 'correct');
  interruptedAt = Date.now();
  await page.locator('[data-target="mute"]:visible').click();
  await waitForReward(page, 1200);
  interruptMs = Date.now() - interruptedAt;
  check('muting during correct-match praise advances immediately to reward', interruptMs < 1000,
    `${interruptMs}ms`);

  // Wrong and right quantities both travel through the actual card handlers.
  await debug.mute(page, true);
  await debug.startMode(page, 'match');
  current = await debug.getState(page);
  const wrongQuantity = current.choices.find((quantity) => quantity !== current.number);
  await page.locator(`[data-target="quantity-${wrongQuantity}"]`).click();
  const afterWrong = await debug.getState(page);
  check('wrong quantity is a gentle retry with the round still open',
    afterWrong.phase === 'match' && afterWrong.locked === false && afterWrong.number === current.number,
    JSON.stringify(afterWrong));
  await shot(page, '05-match-gentle-retry-landscape.png');
  await page.locator(`[data-target="quantity-${current.number}"]`).click();
  await waitForReward(page);
  check('correct quantity reaches the reward through the real card handler',
    (await debug.getState(page)).screen === 'reward');

  // Count-only mode also receives real child taps.
  await debug.startMode(page, 'star-count');
  current = await debug.getState(page);
  const countTotal = await tapEveryStar(page, { pause: 0 });
  await waitForReward(page);
  check('Star Count real taps complete its authored set', countTotal === current.number,
    `${countTotal} vs ${current.number}`);

  // Keyboard/switch access invokes the exact trace completion path.
  await debug.startMode(page, 'journey');
  await page.locator('#trace-canvas').focus();
  await page.keyboard.press('Enter');
  await waitForPhase(page, 'count');
  current = await debug.getState(page);
  check('Enter on the trace field completes through the shared controller',
    current.traceCoverage >= CONFIG.trace.threshold && current.phase === 'count', JSON.stringify(current));

  await debug.seed(page, 0);
  await debug.startMode(page, 'journey');
  current = await debug.getState(page);
  check('seeded journey exposes the authored two-stroke number four',
    current.number === 4 && Array.isArray(CONFIG.trace.paths['4'][0][0]), JSON.stringify(current));
  const fourPaths = await canvasPaths(page);
  await shot(page, '12-trace-four-before-landscape.png');
  const beforeWrongOrder = await debug.getState(page);
  await dragPath(page, fourPaths[1], { steps: 14 });
  const afterWrongOrder = await debug.getState(page);
  check('number four rejects a genuine pointer stroke that starts out of order',
    afterWrongOrder.phase === 'trace'
      && afterWrongOrder.traceCoverage === beforeWrongOrder.traceCoverage
      && afterWrongOrder.traceMisses === beforeWrongOrder.traceMisses + 1,
    JSON.stringify(afterWrongOrder));
  await dragPath(page, fourPaths[0], { steps: 14 });
  const afterFirstStroke = await debug.getState(page);
  check('number four remains in tracing after only its first genuine pointer stroke',
    afterFirstStroke.phase === 'trace'
      && afterFirstStroke.traceCoverage > 0
      && afterFirstStroke.traceCoverage < CONFIG.trace.threshold,
    JSON.stringify(afterFirstStroke));
  check('number four reveals a tactile lift-and-restart cue after stroke one',
    await page.locator('.lift-cue').evaluate((node) => node.classList.contains('is-visible')
      && node.textContent.includes('Start at the new dot')));
  await shot(page, '13-trace-four-after-first-landscape.png');
  await dragPath(page, fourPaths[1], { steps: 14 });
  await waitForPhase(page, 'count');
  current = await debug.getState(page);
  check('two-stroke number four accepts both genuine pointer paths in order',
    current.number === 4 && current.traceCoverage >= CONFIG.trace.threshold,
    JSON.stringify(current));

  await debug.seed(page, 2);
  await debug.startMode(page, 'star-count');
  current = await debug.getState(page);
  check('one-star round uses the authored low-quantity composition', current.number === 1,
    JSON.stringify(current));
  await checkTargets(page, 'one-star count');
  await shot(page, '14-count-one-landscape.png');

  await debug.seed(page, 17);
  await debug.startMode(page, 'star-count');
  current = await debug.getState(page);
  check('three-star round uses the authored low-quantity composition', current.number === 3,
    JSON.stringify(current));
  await checkTargets(page, 'three-star count');
  await shot(page, '15-count-three-landscape.png');
  await debug.seed(page, 42);

  for (const modeId of ['journey', 'star-count', 'match']) {
    const finished = await finishMode(page, modeId);
    check(`${modeId} completes every configured round`,
      finished.screen === 'reward' && finished.roundIndex === finished.roundsTotal - 1,
      JSON.stringify(finished));
  }
  await checkTargets(page, 'final reward');
  await checkImages(page, 'final reward');
  await shot(page, '06-final-number-star-landscape.png');
}

async function driveResponsive(browser) {
  const portrait = await openRun(browser, { viewport: { width: 820, height: 1180 } });
  await checkTargets(portrait.page, 'portrait selection');
  await checkImages(portrait.page, 'portrait selection');
  await shot(portrait.page, '07-selection-portrait.png');
  await debug.mute(portrait.page, true);
  await debug.startMode(portrait.page, 'match');
  await checkTargets(portrait.page, 'portrait match');
  await checkImages(portrait.page, 'portrait match');
  await shot(portrait.page, '08-match-portrait.png');
  await debug.seed(portrait.page, 0);
  await debug.startMode(portrait.page, 'journey');
  const portraitFourPaths = await canvasPaths(portrait.page);
  await shot(portrait.page, '16-trace-four-before-portrait.png');
  await dragPath(portrait.page, portraitFourPaths[0], { steps: 14 });
  check('portrait number four preserves the staged second-stroke cue',
    (await debug.getState(portrait.page)).phase === 'trace'
      && await portrait.page.locator('.lift-cue').evaluate((node) => node.classList.contains('is-visible')));
  await shot(portrait.page, '17-trace-four-after-first-portrait.png');

  const short = await openRun(browser, { viewport: { width: 1180, height: 520 } });
  await checkTargets(short.page, 'short-landscape selection');
  await shot(short.page, '09-selection-short-landscape.png');
  await debug.mute(short.page, true);
  await debug.seed(short.page, 0);
  await debug.startMode(short.page, 'journey');
  await checkTargets(short.page, 'short-landscape trace');
  await checkImages(short.page, 'short-landscape trace');
  await shot(short.page, '10-trace-short-landscape.png');
  const shortFourPaths = await canvasPaths(short.page);
  await dragPath(short.page, shortFourPaths[0], { steps: 14 });
  check('short landscape number four preserves the staged second-stroke cue',
    (await debug.getState(short.page)).phase === 'trace'
      && await short.page.locator('.lift-cue').evaluate((node) => node.classList.contains('is-visible')));
  await shot(short.page, '18-trace-four-after-first-short-landscape.png');

  const reduced = await openRun(browser, {
    viewport: { width: 1280, height: 960 },
    reducedMotion: 'reduce',
    mute: true,
  });
  await debug.startMode(reduced.page, 'journey');
  const reducedState = await debug.getState(reduced.page);
  const animation = await reduced.page.locator('.trace-stage').evaluate((node) => getComputedStyle(node).animationDuration);
  check('reduced-motion run preserves play and collapses decorative animation',
    reducedState.reducedMotion === true && reducedState.phase === 'trace'
      && Number.parseFloat(animation) <= 0.001,
    `${JSON.stringify(reducedState)} | ${animation}`);
  await reduced.page.locator('#trace-canvas').focus();
  await reduced.page.keyboard.press('Space');
  await waitForPhase(reduced.page, 'count');
  await shot(reduced.page, '11-count-reduced-motion.png');
}

async function auditNavigation(browser) {
  const nav = await openRun(browser, { mute: true });
  await nav.page.locator('[data-target="home"]').click();
  await nav.page.waitForURL((next) => next.pathname === '/' || next.pathname.endsWith('/index.html'));
  check('Home returns selection to the catalog route', true);
}

async function auditStaticFiles() {
  const artDir = path.join(GAME, 'assets', 'art');
  const artNames = (await readdir(artDir)).filter((name) => name.endsWith('.webp'));
  const artSizes = Object.fromEntries(await Promise.all(artNames.map(async (name) => [
    name,
    (await stat(path.join(artDir, name))).size,
  ])));
  check('world backdrop stays inside the 300 KB budget',
    artSizes['world-backdrop.webp'] <= 300_000, `${artSizes['world-backdrop.webp']} bytes`);
  check('every foreground raster stays inside the 150 KB budget',
    Object.entries(artSizes)
      .filter(([name]) => name !== 'world-backdrop.webp')
      .every(([, bytes]) => bytes <= 150_000),
    JSON.stringify(artSizes));

  const [configText, cssText, htmlText, mainText] = await Promise.all([
    readFile(path.join(GAME, 'config.json'), 'utf8'),
    readFile(path.join(GAME, 'css', 'style.css'), 'utf8'),
    readFile(path.join(GAME, 'index.html'), 'utf8'),
    readFile(path.join(GAME, 'js', 'main.js'), 'utf8'),
  ]);
  check('runtime contains no emoji placeholder artwork',
    !configText.includes('emoji:') && !mainText.includes('emoji:'));
  check('child-facing skin contains no CSS gradients pretending to be artwork',
    !/gradient\s*\(/i.test(cssText));
  check('runtime contains no SVG artwork or SVG asset reference',
    !/<svg\b|\.svg(?:["')?#]|$)/i.test(`${htmlText}\n${configText}\n${mainText}`));

  const lines = JSON.parse(await readFile(path.join(GAME, 'assets', 'audio', 'lines.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(GAME, 'assets', 'audio', 'manifest.json'), 'utf8'));
  const report = JSON.parse(await readFile(path.join(GAME, 'assets', 'audio', 'qa-report.json'), 'utf8'));
  check('voice manifest, script, and transcript QA cover all 26 lines',
    Object.keys(lines).length === 26
      && Object.keys(manifest).join(',') === Object.keys(lines).join(',')
      && Object.keys(report.entries).join(',') === Object.keys(lines).join(',')
      && Object.values(report.entries).every((entry) => entry.valid === true && entry.ratio >= 0.86),
    `${Object.keys(manifest).length}/${Object.keys(lines).length}`);
}

async function main() {
  await ensureShots(SHOTS);
  const browser = await launchChrome();
  try {
    await driveLandscape(browser);
    await driveResponsive(browser);
    await auditNavigation(browser);
    await auditStaticFiles();

    for (const session of sessions) {
      session.failed = session.failed.filter((entry) => !analyticsOrigins.some((origin) => entry.startsWith(origin)));
      checkSessionClean({ check }, session, `session ${sessions.indexOf(session) + 1}`);
    }
  } finally {
    await Promise.all(sessions.map((session) => session.close().catch(() => {})));
    await browser.close();
  }
  note(`screenshots: ${SHOTS}`);
  finish({ suffix: `; shots in ${SHOTS}` });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
