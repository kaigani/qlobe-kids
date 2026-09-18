#!/usr/bin/env node
// Real-Chrome gameplay, responsive-layout, audio and visual acceptance suite.

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  args, baseUrl, checkSessionClean, createReporter, debug, ensureShots,
  launchChrome, openSession, resolveShots, shooter,
} from '../../../tools/qa/lib/driver.mjs';

const gameRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = path.resolve(gameRoot, '../..');
const base = baseUrl('http://127.0.0.1:8137');
const url = `${base}/games/silly-swap-words/`;
const shots = resolveShots(args.flag('shots', path.join(repoRoot, 'qa-shots/silly-swap-words')));
await ensureShots(shots);
const shot = shooter(shots);
const reporter = createReporter({ detailOnFail: true, collapse: true, detailLimit: 2200 });
const { check, finish } = reporter;

async function exists(file) { return stat(file).then(() => true, () => false); }

async function walk(dir, output = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'source') await walk(file, output);
    else if (entry.isFile()) output.push(file);
  }
  return output;
}

async function staticAudit() {
  const required = [
    'index.html', 'config.js', 'config.json', 'game.json', 'game-design.md', 'ASSETS.md',
    'css/game.css', 'js/main.js', 'data/lines.json', 'assets/audio/manifest.json',
  ];
  for (const file of required) check(`static file exists: ${file}`, await exists(path.join(gameRoot, file)));
  const config = JSON.parse(await readFile(path.join(gameRoot, 'config.json'), 'utf8'));
  const lines = JSON.parse(await readFile(path.join(gameRoot, 'data/lines.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(gameRoot, 'assets/audio/manifest.json'), 'utf8'));
  check('voice text stays exact between config and recording contract', JSON.stringify(config.voice) === JSON.stringify(lines));
  check('every narration key has one recorded clip', Object.keys(config.voice).every((key) => manifest[key]?.file), JSON.stringify(Object.keys(config.voice).filter((key) => !manifest[key]?.file)));
  const configured = [...new Set([...Object.values(config.assets), ...Object.values(config.words)])];
  const missing = [];
  for (const rel of configured) if (!await exists(path.join(gameRoot, rel.replace(/^\.\//, '')))) missing.push(rel);
  check('all configured clay rasters exist', missing.length === 0, missing.join(', '));
  check('all primary art references are raster assets', configured.every((rel) => /\.(?:webp|png|jpe?g)$/i.test(rel)));
  const html = await readFile(path.join(gameRoot, 'index.html'), 'utf8');
  const css = await readFile(path.join(gameRoot, 'css/game.css'), 'utf8');
  check('runtime contains no SVG, canvas, emoji, or CSS-gradient artwork', !/<svg|<canvas|emoji/i.test(html) && !/gradient\(/i.test(css));
  const shipped = (await walk(path.join(gameRoot, 'assets'))).filter((file) => !file.includes(`${path.sep}source${path.sep}`) && /\.(?:webp|png|jpe?g)$/i.test(file));
  const heavy = [];
  for (const file of shipped) if ((await stat(file)).size > 180_000) heavy.push([path.relative(gameRoot, file), (await stat(file)).size]);
  check('shipping raster files stay under 180 KB each', heavy.length === 0, JSON.stringify(heavy));
  const hub = path.join(repoRoot, 'assets/hub/tiles/silly-swap-words.jpg');
  const hubSize = await stat(hub).then((value) => value.size, () => 0);
  check('curated hub tile exists and stays lightweight', hubSize > 5000 && hubSize <= 180_000, `${hubSize} bytes`);
}

async function boot(browser, viewport, { reducedMotion = 'no-preference' } = {}) {
  const session = await openSession(browser, {
    url, base, viewport, reducedMotion, goto: false, ready: false,
    allowDataUrls: true, allowAbortedMedia: true,
    allowRemote: ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'],
  });
  await session.context.route(/https:\/\/(?:www\.googletagmanager\.com|www\.google-analytics\.com)\//, (route) => route.fulfill({ status: 204, body: '' }));
  await session.page.goto(url, { waitUntil: 'networkidle' });
  await debug.waitForHook(session.page);
  await debug.waitForReady(session.page);
  await debug.seed(session.page, 7);
  await debug.fastTimers(session.page, .04);
  await debug.mute(session.page, true);
  return session;
}

async function decodeVisible(page) {
  await page.waitForFunction(() => [...document.images]
    .filter((image) => image.getClientRects().length && getComputedStyle(image).visibility !== 'hidden')
    .every((image) => image.complete && image.naturalWidth > 0));
}

async function auditLayout(page, label) {
  const result = await page.evaluate(() => {
    const bad = [...document.querySelectorAll('[data-target]')]
      .filter((node) => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && !node.disabled)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const pseudo = node.classList.contains('qk-hud-btn') ? getComputedStyle(node, '::before') : null;
        return {
          id: node.dataset.target,
          w: pseudo ? parseFloat(pseudo.width) || rect.width : rect.width,
          h: pseudo ? parseFloat(pseudo.height) || rect.height : rect.height,
          x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
        };
      })
      .filter((item) => item.w < 96 || item.h < 96 || item.x < -1 || item.y < -1 || item.right > innerWidth + 1 || item.bottom > innerHeight + 1);
    const broken = [...document.images].filter((image) => image.getClientRects().length && (!image.complete || image.naturalWidth < 1)).map((image) => image.src);
    return { bad, broken, scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], viewport: [innerWidth, innerHeight] };
  });
  check(`${label}: targets are >=96px and inside the viewport`, result.bad.length === 0, JSON.stringify(result.bad));
  check(`${label}: no page overflow or broken visible image`, result.scroll[0] <= result.viewport[0] + 1 && result.scroll[1] <= result.viewport[1] + 1 && !result.broken.length, JSON.stringify(result));
}

async function completeCurrentMode(page, limit = 12) {
  for (let i = 0; i < limit; i += 1) {
    const state = await debug.getState(page);
    if (state.screen === 'reward') return state;
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput);
    await debug.winRound(page);
  }
  return debug.getState(page);
}

async function landscapeRun(browser) {
  const session = await boot(browser, { width: 1180, height: 820 });
  const { page } = session;
  await decodeVisible(page);
  check('QLOBE_DEBUG v1 is installed', await page.evaluate(() => window.QLOBE_DEBUG.version === 1));
  check('all three play modes are discoverable', (await debug.listModes(page)).map((mode) => mode.id).join(',') === 'swap,trail,lab');
  await auditLayout(page, 'landscape splash');
  await shot(page, '01-splash-landscape');

  await debug.startMode(page, 'swap');
  await debug.waitForInput(page);
  await decodeVisible(page);
  await auditLayout(page, 'guided play');
  await shot(page, '02-guided-cat-to-hat');
  const opening = await debug.getState(page);
  await debug.tap(page, `letter-${(opening.activeSlot + 1) % 3}`);
  await page.waitForTimeout(100);
  check('a non-changing letter gives a gentle retry without progress', (await debug.getState(page)).word === opening.word && (await debug.getState(page)).round === opening.round);
  await debug.tap(page, `letter-${opening.activeSlot}`);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().round >= 1);
  check('guided tap changes exactly one sound and advances', (await debug.getState(page)).word === 'hat');
  await debug.winRound(page);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().round === 2);
  await debug.tap(page, 'letter-2');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().word === 'hop');
  check('multi-step round celebrates a valid intermediate word', (await debug.getState(page)).target === 'hog');
  await shot(page, '03-guided-intermediate-hop');
  const guidedEnd = await completeCurrentMode(page);
  check('Guided Swaps reaches its reward screen', guidedEnd.screen === 'reward' && guidedEnd.completed === 6, JSON.stringify(guidedEnd));
  await page.waitForTimeout(1100);
  await shot(page, '04-guided-reward');

  await debug.call(page, 'back');
  await debug.startMode(page, 'trail');
  await debug.waitForInput(page);
  const trailStart = await debug.getState(page);
  const trailEnd = await completeCurrentMode(page, 6);
  check('Word Trails follows a four-change CVC chain', trailStart.step === 0 && trailEnd.screen === 'reward' && trailEnd.completed === 4, JSON.stringify({ trailStart, trailEnd }));

  await debug.call(page, 'back');
  await debug.startMode(page, 'lab');
  await debug.waitForInput(page);
  await debug.tap(page, 'letter-1');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().discoveries === 1);
  await debug.call(page, 'magicSwap');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().discoveries === 2);
  check('Silly Word Lab accepts direct and magic swaps', (await debug.getState(page)).awaitingInput === true);
  await auditLayout(page, 'lab play');
  await page.waitForTimeout(800);
  await shot(page, '05-silly-word-lab');

  checkSessionClean(reporter, session, 'landscape run');
  await session.close();
}

async function responsiveRun(browser, viewport, label, mode, reducedMotion = 'no-preference', captureReward = false) {
  const session = await boot(browser, viewport, { reducedMotion });
  const { page } = session;
  await decodeVisible(page);
  await auditLayout(page, `${label} splash`);
  await shot(page, `10-splash-${label}`);
  await debug.startMode(page, mode);
  await debug.waitForInput(page);
  await decodeVisible(page);
  await auditLayout(page, `${label} play`);
  await shot(page, `11-play-${label}`);
  if (captureReward) {
    const end = await completeCurrentMode(page, 12);
    check(`${label}: mode reaches its reward screen`, end.screen === 'reward', JSON.stringify(end));
    await page.waitForTimeout(1100);
    await decodeVisible(page);
    await auditLayout(page, `${label} reward`);
    await shot(page, `12-reward-${label}`);
  }
  checkSessionClean(reporter, session, `${label} run`);
  await session.close();
}

async function audioAudit(browser) {
  const session = await boot(browser, { width: 1024, height: 768 });
  const { page } = session;
  const result = await page.evaluate(async () => {
    const config = await fetch('./config.json').then((response) => response.json());
    const manifest = await fetch('./assets/audio/manifest.json').then((response) => response.json());
    const failures = [];
    for (const [key, entry] of Object.entries(manifest)) {
      const ok = await new Promise((resolve) => {
        const audio = new Audio();
        const timeout = setTimeout(() => resolve(false), 6000);
        audio.onloadedmetadata = () => { clearTimeout(timeout); resolve(Number.isFinite(audio.duration) && audio.duration > .2); };
        audio.onerror = () => { clearTimeout(timeout); resolve(false); };
        audio.src = `./assets/audio/${entry.file}`;
      });
      if (!ok) failures.push(key);
    }
    return { count: Object.keys(manifest).length, expected: Object.keys(config.voice).length, failures };
  });
  check('real Chrome decodes every cloned-teacher clip', result.count === result.expected && result.failures.length === 0, JSON.stringify(result));
  await debug.clearAudioLog(page);
  await page.mouse.click(600, 260);
  await debug.mute(page, false);
  await debug.startMode(page, 'swap');
  await debug.waitForAudio(page, 'swap1', { timeout: 9000 });
  const runtimeAudio = await debug.getAudioLog(page);
  const bgmStats = await debug.call(page, 'getBgmStats');
  check('mode intro and exact round clue route through recorded teacher clips',
    runtimeAudio.some((entry) => entry.key === 'swapIntro' && entry.kind === 'clip')
      && runtimeAudio.some((entry) => entry.key === 'swap1' && entry.kind === 'clip'),
    JSON.stringify(runtimeAudio));
  check('preloaded background music starts after the first real gesture', bgmStats.playing === true, JSON.stringify(bgmStats));
  await debug.mute(page, true);
  checkSessionClean(reporter, session, 'audio audit');
  await session.close();
}

async function captureOg(browser) {
  const session = await boot(browser, { width: 1200, height: 630 });
  await decodeVisible(session.page);
  await session.page.waitForTimeout(850);
  await session.page.screenshot({
    path: path.join(gameRoot, 'assets/og-image.jpg'),
    type: 'jpeg',
    quality: 84,
  });
  checkSessionClean(reporter, session, 'OG capture');
  await session.close();
}

await staticAudit();
const browser = await launchChrome();
try {
  await landscapeRun(browser);
  await responsiveRun(browser, { width: 820, height: 1180 }, 'portrait', 'lab', 'no-preference', true);
  await responsiveRun(browser, { width: 1180, height: 520 }, 'short-landscape', 'trail', 'no-preference', true);
  await responsiveRun(browser, { width: 1024, height: 768 }, 'reduced-motion', 'swap', 'reduce');
  await captureOg(browser);
  await audioAudit(browser);
} finally {
  await browser.close();
}
finish();
