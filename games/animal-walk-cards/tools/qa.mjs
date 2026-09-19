#!/usr/bin/env node
// Real-Chrome smoke, progression, persistence, responsive, and visual-QC gate.

import {
  baseUrl,
  checkSessionClean,
  createReporter,
  debug,
  ensureShots,
  launchChrome,
  openSession,
  resolveShots,
  shooter,
  targetSizes,
  undersized,
} from '../../../tools/qa/lib/driver.mjs';
import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

let base = baseUrl();
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const defaultShots = fileURLToPath(new URL('../../../../qa-shots/animal-motion-cards-local/', import.meta.url));
const shots = resolveShots(defaultShots);
const capture = shooter(shots);
const shot = async (page, name) => {
  await page.waitForTimeout(480);
  return capture(page, name);
};
const report = createReporter();
const { check, finish } = report;
const platformAnalytics = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
];
let localServer = null;
let audioManifest = null;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(900) });
    return response.ok;
  } catch {
    return false;
  }
}

async function responding(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(900) });
    return true;
  } catch {
    return false;
  }
}

function freePort(hostname) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, hostname, () => {
      const address = probe.address();
      probe.close(() => resolve(address.port));
    });
  });
}

async function ensureServer() {
  if (await reachable(`${base}/games/animal-walk-cards/`)) return;
  const target = new URL(base);
  if (!['127.0.0.1', 'localhost'].includes(target.hostname)) {
    throw new Error(`QA base is unavailable: ${base}`);
  }
  let port = target.port || '80';
  if (await responding(`${base}/`)) {
    port = String(await freePort(target.hostname));
    base = `${target.protocol}//${target.hostname}:${port}`;
  }
  const python = process.platform === 'win32' ? 'python' : 'python3';
  let serverError = null;
  localServer = spawn(python, ['-m', 'http.server', port, '--bind', target.hostname], {
    cwd: repoRoot,
    stdio: 'ignore',
    windowsHide: true,
  });
  localServer.on('error', (error) => { serverError = error; });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await reachable(`${base}/games/animal-walk-cards/`)) return;
    if (serverError || localServer.exitCode != null) break;
    await wait(120);
  }
  throw new Error(`Could not start a local static server at ${base}${serverError ? `: ${serverError.message}` : ''}`);
}

async function openGame(browser, viewport, reducedMotion = 'no-preference', fastTimers = null) {
  return openSession(browser, {
    url: `${base}/games/animal-walk-cards/`,
    base,
    viewport,
    reducedMotion,
    seed: 42,
    fastTimers,
    mute: true,
    allowAbortedMedia: true,
    allowRemote: platformAnalytics,
  });
}

function checkClean(session, label) {
  session.failed = session.failed.filter((entry) =>
    !platformAnalytics.some((prefix) => entry.startsWith(prefix)));
  checkSessionClean(report, session, label);
}

async function checkVoiceAssets() {
  const [gameConfig, lines, manifest] = await Promise.all([
    readFile(new URL('../config.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../assets/audio/lines.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../assets/audio/manifest.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  audioManifest = manifest;
  const keys = Object.keys(gameConfig.voice);
  const textMismatches = keys.filter((key) => lines[key] !== gameConfig.voice[key]);
  check('recorded-voice lines exactly match every runtime fallback',
    textMismatches.length === 0, textMismatches.join(', '));

  const badEntries = keys.filter((key) => !manifest[key]?.file || !(Number(manifest[key]?.dur) > 0));
  check('every authored line has a recorded manifest entry',
    badEntries.length === 0, badEntries.join(', '));

  const missingFiles = [];
  await Promise.all(keys.map(async (key) => {
    const file = manifest[key]?.file;
    if (!file) return;
    try {
      await access(new URL(`../assets/audio/${file}`, import.meta.url));
    } catch {
      missingFiles.push(`${key}:${file}`);
    }
  }));
  check('every recorded manifest file exists locally',
    missingFiles.length === 0, missingFiles.join(', '));

  const childPoses = gameConfig.animals.flatMap((animal) => animal.childPoses || []);
  const missingChildPoses = [];
  await Promise.all(childPoses.map(async (src) => {
    try {
      await access(new URL(`../${src.replace(/^\.\//, '')}`, import.meta.url));
    } catch {
      missingChildPoses.push(src);
    }
  }));
  check('all six animals have three raster child-coach poses',
    childPoses.length === 18 && missingChildPoses.length === 0,
    `count=${childPoses.length}; missing=${missingChildPoses.join(', ')}`);
}

async function checkTargets(page, label) {
  const sizes = await targetSizes(page);
  const small = undersized(sizes, 95.5);
  check(`${label} touch targets meet the 96px minimum`, small.length === 0,
    small.map((item) => `${item.id}:${Math.round(item.w)}x${Math.round(item.h)}`).join(', '));
}

async function driveLandscape(browser) {
  const session = await openGame(browser, { width: 1180, height: 820 });
  const { page } = session;
  const initial = await debug.getState(page);
  check('deck boots in cards mode', initial.screen === 'deck' && initial.mode === 'cards');
  check('debug exposes cards and parade modes',
    (await debug.listModes(page)).map((mode) => mode.id).join(',') === 'cards,parade');
  check('all six animals begin playable', initial.unlocked.length === 6);
  await checkTargets(page, 'deck');

  const artAudit = await page.evaluate(async () => {
    const style = await fetch('./css/style.css').then((response) => response.text());
    const visible = [...document.images].filter((node) => node.getClientRects().length);
    return {
      visibleImages: visible.length,
      broken: visible.filter((node) => !node.complete || node.naturalWidth < 2).map((node) => node.src),
      svg: document.querySelectorAll('svg').length,
      canvas: document.querySelectorAll('canvas').length,
      gradient: /(?:linear|radial|conic)-gradient\s*\(/i.test(style),
      emoji: /[\u{1F300}-\u{1FAFF}]/u.test(document.body.innerText),
    };
  });
  check('visible game world uses healthy raster assets', artAudit.visibleImages >= 9
    && artAudit.broken.length === 0 && artAudit.svg === 0 && artAudit.canvas === 0
    && !artAudit.gradient && !artAudit.emoji, JSON.stringify(artAudit));
  await shot(page, '01-deck-landscape');

  await debug.tap(page, 'animal-frog');
  await debug.waitForScreen(page, 'instruction');
  const instructionTargets = await debug.getTargets(page);
  const instructionTargetIds = instructionTargets.map((target) => target.id);
  const instructionSoundStyle = await page.locator('#instruction-hud [data-target="sound"]').evaluate((node) => ({
    backgroundImage: getComputedStyle(node).backgroundImage,
    opacity: getComputedStyle(node).opacity,
  }));
  check('instruction exposes back, sound, and start controls',
    ['back', 'sound', 'start-moving'].every((id) => instructionTargetIds.includes(id))
      && instructionSoundStyle.backgroundImage.includes('btn-sound.png')
      && Number(instructionSoundStyle.opacity) > 0,
    `${instructionTargetIds.join(', ')}; ${JSON.stringify(instructionSoundStyle)}`);
  check('frog instruction presents three authored poses',
    await page.locator('.pose-step-art').count() === 3);
  await checkTargets(page, 'instruction');
  await shot(page, '02-instruction-landscape');

  await debug.tap(page, 'start-moving');
  await debug.waitForScreen(page, 'active');
  check('active round starts at the first forgiving beat',
    (await debug.getState(page)).rep === 0 && (await debug.getState(page)).awaitingInput);
  await checkTargets(page, 'active');
  await shot(page, '03-active-landscape');

  await debug.tap(page, 'pause');
  check('pause holds the movement round', (await debug.getState(page)).phase === 'paused');
  await debug.tap(page, 'pause');
  check('resume returns to movement', (await debug.getState(page)).phase === 'moving');

  await debug.tap(page, 'moved');
  await debug.tap(page, 'moved');
  await debug.tap(page, 'moved');
  check('third card move enters the finishing window', (await debug.getState(page)).phase === 'finishing');
  await debug.call(page, 'home');
  await debug.waitForScreen(page, 'deck');
  await page.waitForTimeout(650);
  check('back during card finish cancels the delayed reward',
    (await debug.getState(page)).screen === 'deck' && !(await debug.getState(page)).completed.includes('frog'));

  await debug.tap(page, 'animal-frog');
  await debug.waitForScreen(page, 'instruction');
  await debug.tap(page, 'start-moving');
  await debug.waitForScreen(page, 'active');
  await debug.winRound(page);
  await debug.waitForScreen(page, 'reward');
  check('winning stamps the selected animal', (await debug.getState(page)).completed.includes('frog'));
  await checkTargets(page, 'reward');
  await shot(page, '04-reward-landscape');

  await page.reload({ waitUntil: 'networkidle' });
  await debug.waitForHook(page);
  await debug.waitForReady(page);
  await debug.seed(page, 42);
  await debug.mute(page, true);
  check('paw stamps survive a reload', (await debug.getState(page)).completed.includes('frog'));

  await debug.tap(page, 'animal-bear');
  await debug.waitForScreen(page, 'instruction');
  check('bear instruction keeps three animal demonstration panels',
    await page.locator('.pose-step-art[src*="pose-bear-"]').count() === 3);
  await shot(page, '12-bear-instruction-landscape');
  await debug.tap(page, 'start-moving');
  await debug.waitForScreen(page, 'active');
  check('bear active coaching switches to a child body reference',
    await page.locator('#active-pose[src*="kid-bear-1.webp"]').count() === 1);
  await shot(page, '13-bear-active-landscape');
  await debug.call(page, 'home');
  await debug.waitForScreen(page, 'deck');

  await debug.fastTimers(page, 20);
  await debug.tap(page, 'animal-bear');
  await debug.waitForScreen(page, 'instruction');
  await debug.tap(page, 'start-moving');
  await debug.waitForScreen(page, 'reward', { timeout: 5000 });
  check('fast timers preserve the automatic three-beat coach',
    (await debug.getState(page)).rep === 3 && (await debug.getState(page)).completed.includes('bear'));
  await debug.call(page, 'home');
  await debug.waitForScreen(page, 'deck');

  await debug.tap(page, 'animal-crab');
  await debug.waitForScreen(page, 'instruction');
  check('crab instruction keeps three animal demonstration panels',
    await page.locator('.pose-step-art[src*="pose-crab-"]').count() === 3);
  await shot(page, '14-crab-instruction-landscape');
  await debug.tap(page, 'start-moving');
  await debug.waitForScreen(page, 'active');
  check('crab active coaching switches to a child body reference',
    await page.locator('#active-pose[src*="kid-crab-1.webp"]').count() === 1);
  await shot(page, '15-crab-active-landscape');
  await debug.winRound(page);
  await debug.waitForScreen(page, 'reward');
  await debug.call(page, 'home');
  await debug.waitForScreen(page, 'deck');
  check('three stamps make parade visibly available',
    (await debug.getState(page)).paradeAvailable && await page.locator('[data-target="parade"]:enabled').count() === 1);

  await debug.fastTimers(page, 1);
  await debug.seed(page, 7);
  await debug.tap(page, 'parade');
  await debug.waitForScreen(page, 'parade');
  check('parade selects exactly three earned animals',
    (await debug.getState(page)).paradeQueue.join(',') === 'bear,crab,frog');
  await checkTargets(page, 'parade lineup');
  await shot(page, '05-parade-lineup-landscape');

  await debug.mute(page, false);
  await debug.clearAudioLog(page);
  await page.locator('[data-target="start-parade"]').click();
  await debug.waitForScreen(page, 'active');
  await page.locator('[data-target="moved"]').click();
  await debug.waitForAudio(page, 'crab-intro', { timeout: 12000 });
  await page.waitForTimeout((audioManifest['crab-intro'].dur * 1000) + 450);
  const paradeAudio = await debug.getAudioLog(page);
  const paradeAudioKeys = paradeAudio.map((entry) => entry.key);
  const paradeAudioKinds = paradeAudio
    .filter((entry) => ['bear-intro', 'parade-next', 'crab-intro'].includes(entry.key))
    .map((entry) => entry.kind);
  check('parade narration finishes before the next auto beat can advance',
    paradeAudioKeys.join(',') === 'bear-intro,parade-next,crab-intro'
      && paradeAudioKinds.every((kind) => kind === 'clip')
      && (await debug.getState(page)).paradeIndex === 1
      && (await debug.getState(page)).animal === 'crab',
    `${paradeAudioKeys.join(',')}; index=${(await debug.getState(page)).paradeIndex}`);

  await debug.tap(page, 'moved');
  await debug.tap(page, 'moved');
  check('third parade move enters the finishing window', (await debug.getState(page)).phase === 'finishing');
  await debug.call(page, 'home');
  await debug.waitForScreen(page, 'deck');
  await page.waitForTimeout(650);
  check('back during parade finish cancels the delayed finale', (await debug.getState(page)).screen === 'deck');

  await debug.mute(page, true);
  await debug.startMode(page, 'parade');
  await debug.waitForScreen(page, 'parade');
  await debug.tap(page, 'start-parade');
  await debug.waitForScreen(page, 'active');
  await debug.winRound(page);
  await debug.waitForScreen(page, 'finale');
  check('debug win deterministically completes the whole parade',
    (await debug.getState(page)).phase === 'finale');
  await checkTargets(page, 'parade finale');
  await shot(page, '06-parade-finale-landscape');
  const reset = await debug.call(page, 'resetProgress');
  check('resetProgress clears stamps and returns to the deck',
    reset.screen === 'deck' && reset.completed.length === 0 && !reset.paradeAvailable);

  checkClean(session, 'landscape flow');
  await session.close();
}

async function drivePortrait(browser) {
  const session = await openGame(browser, { width: 820, height: 1180 });
  const { page } = session;
  await checkTargets(page, 'portrait deck');
  const cards = await page.locator('.animal-card').evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  }));
  check('portrait deck keeps all six cards in frame', cards.length === 6
    && cards.every((rect) => rect.left >= 0 && rect.top >= 0 && rect.right <= 820 && rect.bottom <= 1180));
  await shot(page, '07-deck-portrait');
  await debug.tap(page, 'animal-bear');
  await debug.waitForScreen(page, 'instruction');
  check('portrait bear instruction keeps all three poses visible',
    await page.locator('.pose-step-art[src*="pose-bear-"]').count() === 3);
  await shot(page, '08-bear-instruction-portrait');
  await debug.tap(page, 'start-moving');
  await debug.waitForScreen(page, 'active');
  await checkTargets(page, 'portrait active round');
  check('portrait bear round shows the child coach',
    await page.locator('#active-pose[src*="kid-bear-1.webp"]').count() === 1);
  await shot(page, '09-bear-active-portrait');

  await debug.call(page, 'home');
  await debug.waitForScreen(page, 'deck');
  await debug.tap(page, 'animal-crab');
  await debug.waitForScreen(page, 'instruction');
  check('portrait crab instruction keeps all three poses visible',
    await page.locator('.pose-step-art[src*="pose-crab-"]').count() === 3);
  await shot(page, '16-crab-instruction-portrait');
  await debug.tap(page, 'start-moving');
  await debug.waitForScreen(page, 'active');
  check('portrait crab round shows the child coach',
    await page.locator('#active-pose[src*="kid-crab-1.webp"]').count() === 1);
  await shot(page, '17-crab-active-portrait');
  checkClean(session, 'portrait flow');
  await session.close();
}

async function driveWideAndReduced(browser) {
  const wide = await openGame(browser, { width: 1366, height: 520 });
  await checkTargets(wide.page, 'wide-short deck');
  const overflow = await wide.page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
  }));
  check('wide-short layout does not scroll', overflow.width === overflow.viewportWidth
    && overflow.height === overflow.viewportHeight, JSON.stringify(overflow));
  const widePrompt = await wide.page.locator('#deck-prompt').evaluate((node) => ({
    text: node.textContent.trim(),
    display: getComputedStyle(node).display,
    fontSize: parseFloat(getComputedStyle(node).fontSize),
    rect: node.getBoundingClientRect().toJSON(),
  }));
  check('wide-short deck preserves a readable movement invitation',
    widePrompt.text.includes('Pick any card') || widePrompt.text.includes('Pick an animal')
      ? widePrompt.display !== 'none' && widePrompt.fontSize >= 16 && widePrompt.rect.height > 0
      : false,
    JSON.stringify(widePrompt));
  await shot(wide.page, '10-deck-wide-short');
  checkClean(wide, 'wide-short flow');
  await wide.close();

  const reduced = await openGame(browser, { width: 1180, height: 820 }, 'reduce');
  await debug.startMode(reduced.page, 'parade');
  await debug.waitForScreen(reduced.page, 'parade');
  await debug.tap(reduced.page, 'start-parade');
  await debug.waitForScreen(reduced.page, 'active');
  await debug.winRound(reduced.page);
  await debug.waitForScreen(reduced.page, 'finale');
  check('reduced-motion parade remains fully completable',
    (await debug.getState(reduced.page)).screen === 'finale');
  await shot(reduced.page, '11-finale-reduced-motion');
  checkClean(reduced, 'reduced-motion flow');
  await reduced.close();
}

async function main() {
  await checkVoiceAssets();
  await ensureServer();
  await ensureShots(shots);
  const browser = await launchChrome();
  try {
    await driveLandscape(browser);
    await drivePortrait(browser);
    await driveWideAndReduced(browser);
  } finally {
    await browser.close();
    localServer?.kill();
    finish({ suffix: `; shots in ${shots}` });
  }
}

main().catch((error) => {
  localServer?.kill();
  console.error(error);
  process.exitCode = 1;
});
