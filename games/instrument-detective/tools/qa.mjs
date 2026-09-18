#!/usr/bin/env node
// Real-Chrome interaction, audio-integrity, responsive, and visual-QC driver.

import {
  args, baseUrl, checkSessionClean, createReporter, debug, ensureShots,
  launchChrome, openSession, resolveShots, shooter, targetSizes, undersized,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const url = `${base}/games/instrument-detective/`;
const shots = resolveShots(args.flag('shots', 'qa-shots/instrument-detective'));
const reporter = createReporter({ detailOnFail: true, collapse: true, detailLimit: 1800 });
const { check, finish } = reporter;
const shot = shooter(shots);
const sessions = [];
const PLATFORM_ANALYTICS = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
];
const STORAGE_KEY = 'qlobe-instrument-detective-v1';
const clearProgress = () => {
  try {
    if (sessionStorage.getItem('instrument-detective-qa-ready')) return;
    localStorage.removeItem('qlobe-instrument-detective-v1');
    sessionStorage.setItem('instrument-detective-qa-ready', '1');
  } catch { /* storage-denied behavior is not part of this visual pass */ }
};

async function stubAnalytics(session) {
  await session.context.route(
    /https:\/\/(?:www\.googletagmanager\.com|www\.google-analytics\.com)\//,
    (route) => route.fulfill({ status: 204, body: '' }),
  );
}

async function openGame(browser, {
  viewport = { width: 1180, height: 820 },
  reducedMotion = 'no-preference',
  mute = true,
  initScript = clearProgress,
  context = {},
} = {}) {
  const session = await openSession(browser, {
    url,
    base,
    viewport,
    reducedMotion,
    context,
    initScript,
    goto: false,
    ready: false,
    allowAbortedMedia: true,
    allowRemote: PLATFORM_ANALYTICS,
  });
  await stubAnalytics(session);
  await session.page.goto(url, { waitUntil: 'networkidle' });
  await debug.waitForHook(session.page);
  await debug.waitForReady(session.page);
  await debug.seed(session.page, 42);
  await debug.fastTimers(session.page, 0.05);
  await debug.mute(session.page, mute);
  sessions.push(session);
  return session;
}

async function auditRasterPage(page, label) {
  const audit = await page.evaluate(async () => {
    const images = [...document.images].filter((image) => image.getAttribute('src'));
    await Promise.all(images.map(async (image) => {
      if (!image.complete) await new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
      try { await image.decode(); } catch { /* naturalWidth reports failure */ }
    }));
    const backgroundUrls = [...document.querySelectorAll('*')]
      .map((node) => getComputedStyle(node).backgroundImage)
      .filter((value) => value && value !== 'none');
    const visibleText = [...document.querySelectorAll('[data-qk-screen]:not([hidden]) *')]
      .map((node) => node.children.length ? '' : node.textContent || '')
      .join(' ');
    return {
      broken: images.filter((image) => image.naturalWidth <= 0).map((image) => image.currentSrc || image.src),
      svg: document.querySelectorAll('svg').length,
      canvas: document.querySelectorAll('canvas').length,
      vectorBackgrounds: backgroundUrls.filter((value) => /\.svg(?:[?#"')]|$)/i.test(value)),
      emoji: /[\u{1F300}-\u{1FAFF}]/u.test(visibleText),
    };
  });
  check(`${label} images decode`, audit.broken.length === 0, audit.broken.join(' | '));
  check(
    `${label} primary artwork is raster`,
    audit.svg === 0 && audit.canvas === 0 && audit.vectorBackgrounds.length === 0 && !audit.emoji,
    JSON.stringify(audit),
  );
}

async function auditTargets(page, label) {
  const active = '[data-qk-screen]:not([hidden]) [data-target]';
  const sizes = await targetSizes(page, active);
  const small = undersized(sizes, 96);
  const clipped = await page.locator(active).evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return {
      id: node.dataset.target,
      x: Math.round(rect.x), y: Math.round(rect.y),
      w: Math.round(rect.width), h: Math.round(rect.height),
      clipped: rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight,
    };
  }).filter((item) => item.clipped));
  check(`${label} targets are at least 96px`, small.length === 0, JSON.stringify(small));
  check(`${label} targets stay in the viewport`, clipped.length === 0, JSON.stringify(clipped));
}

async function noOverlappingActions(page, label) {
  const overlaps = await page.locator('[data-qk-screen]:not([hidden]) [data-target]').evaluateAll((nodes) => {
    const items = nodes.filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).map((node) => ({ id: node.dataset.target, rect: node.getBoundingClientRect() }));
    const found = [];
    for (let a = 0; a < items.length; a += 1) for (let b = a + 1; b < items.length; b += 1) {
      const x = Math.min(items[a].rect.right, items[b].rect.right) - Math.max(items[a].rect.left, items[b].rect.left);
      const y = Math.min(items[a].rect.bottom, items[b].rect.bottom) - Math.max(items[a].rect.top, items[b].rect.top);
      if (x > 2 && y > 2) found.push(`${items[a].id}/${items[b].id}:${Math.round(x)}x${Math.round(y)}`);
    }
    return found;
  });
  check(`${label} actions do not overlap`, overlaps.length === 0, overlaps.join(' | '));
}

async function noConcertArtOcclusion(page, label) {
  const collisions = await page.evaluate(() => {
    const controls = document.querySelector('.id-band-controls')?.getBoundingClientRect();
    const conductorNode = document.querySelector('.id-conductor');
    const conductor = conductorNode && getComputedStyle(conductorNode).display !== 'none'
      ? conductorNode.getBoundingClientRect() : null;
    const overlap = (a, b) => b && (
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4
      && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4
    );
    return [...document.querySelectorAll('.id-band-instrument img')].flatMap((image, index) => {
      const rect = image.getBoundingClientRect();
      const hits = [];
      if (overlap(rect, controls)) hits.push(`instrument-${index + 1}/controls`);
      if (overlap(rect, conductor)) hits.push(`instrument-${index + 1}/conductor`);
      return hits;
    });
  });
  check(`${label} keeps every instrument clear of controls and conductor`, collisions.length === 0, collisions.join(' | '));
}

async function hubGate(browser) {
  const session = await openSession(browser, {
    url: `${base}/#art-music`, base, ready: false, goto: false,
    viewport: { width: 1180, height: 820 }, allowRemote: PLATFORM_ANALYTICS,
  });
  await stubAnalytics(session);
  await session.page.goto(`${base}/#art-music`, { waitUntil: 'networkidle' });
  sessions.push(session);
  const card = session.page.locator('a.game-card[href$="games/instrument-detective/"]');
  await card.waitFor({ state: 'visible' });
  const tile = card.locator('img');
  const tileReady = await tile.evaluate(async (image) => {
    try { await image.decode(); } catch { return false; }
    return image.naturalWidth === 640 && image.naturalHeight === 533;
  });
  check('hub exposes a decoded 640×533 Instrument Detective tile', tileReady);
  checkSessionClean(reporter, session, 'hub');
}

async function landscapeDrive(browser) {
  const session = await openGame(browser);
  const { page } = session;
  check('QLOBE_DEBUG v1 is installed', await page.evaluate(() => window.QLOBE_DEBUG?.version === 1));
  check('splash boots', (await debug.getState(page)).screen === 'splash');
  check('concert entry stays hidden before completion', !await page.locator('[data-target="open-concert"]').isVisible());
  const modes = await debug.listModes(page);
  check('listen and concert modes are exposed', ['listen', 'concert'].every((id) => modes.some((mode) => mode.id === id)), JSON.stringify(modes));
  await auditTargets(page, 'landscape splash');
  await auditRasterPage(page, 'landscape splash');
  await shot(page, '01-splash-landscape');

  await page.locator('[data-target="start-listen"]').click();
  await page.waitForFunction(() => {
    const state = window.QLOBE_DEBUG.getState();
    return state.screen === 'play' && state.awaitingChoice && !state.busy;
  });
  const first = await debug.getState(page);
  check('real Play button starts a listening case', first.screen === 'play' && first.roundIndex === 0);
  check('case presents three unique candidates', first.candidates.length === 3 && new Set(first.candidates).size === 3, JSON.stringify(first));
  check('opening mystery sample matches the target', first.lastSample === first.target, JSON.stringify(first));
  await auditTargets(page, 'landscape play');
  await shot(page, '02-play-landscape');

  const wrong = first.candidates.find((id) => id !== first.target);
  await page.locator(`[data-target="choice-${wrong}"]`).click();
  await page.waitForFunction((id) => {
    const state = window.QLOBE_DEBUG.getState();
    return state.lastChoice === id && state.awaitingChoice && !state.busy;
  }, wrong);
  const afterWrong = await debug.getState(page);
  check('wrong guess keeps the same case and solve count', afterWrong.roundIndex === 0 && afterWrong.solved.length === 0, JSON.stringify(afterWrong));
  check('wrong guess replays the mystery sample', afterWrong.lastSample === afterWrong.target, JSON.stringify(afterWrong));
  check('gentle retry leaves the Listen control warmly highlighted', await page.locator('[data-target="listen-clue"]').evaluate((node) => node.classList.contains('is-try-again')));
  await shot(page, '03-gentle-retry-landscape');

  await page.locator(`[data-target="choice-${first.target}"]`).click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reveal');
  const afterCorrect = await debug.getState(page);
  check('correct guess reveals and increments progress', afterCorrect.solved.length === 1 && afterCorrect.lastChoice === first.target, JSON.stringify(afterCorrect));
  await auditTargets(page, 'landscape reveal');
  await shot(page, '04-correct-reveal-landscape');

  let guard = 0;
  while ((await debug.getState(page)).screen !== 'concert' && guard++ < 20) {
    await debug.winRound(page);
  }
  const complete = await debug.getState(page);
  check('all six cases unlock the concert', complete.screen === 'concert' && complete.solved.length === 6, JSON.stringify(complete));
  await auditTargets(page, 'landscape concert');
  await noOverlappingActions(page, 'landscape concert');
  await noConcertArtOcclusion(page, 'landscape concert');
  await auditRasterPage(page, 'landscape concert');
  await shot(page, '05-concert-landscape');

  await debug.clearAudioLog(page);
  await page.locator('[data-target^="concert-"]').first().click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog().samples.length > 0);
  const concertLog = await debug.getAudioLog(page);
  check('concert instrument tap requests a real sample', concertLog.samples.some((entry) => entry.id && entry.ok), JSON.stringify(concertLog));

  await page.locator('[data-target="back-concert"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'splash');
  check('concert Back returns to splash', (await debug.getState(page)).screen === 'splash');
  check('completion unlocks My Band', await page.locator('[data-target="open-concert"]').isVisible());
  await noOverlappingActions(page, 'completed landscape splash');
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), STORAGE_KEY);
  check('completion is persisted', saved.complete === true && saved.unlocked?.length === 6, JSON.stringify(saved));

  const storageState = await session.context.storageState();
  checkSessionClean(reporter, session, 'landscape gameplay');
  await session.close();

  const restored = await openGame(browser, { initScript: null, context: { storageState } });
  check('fresh browser context restores the concert entry', await restored.page.locator('[data-target="open-concert"]').isVisible());
  await restored.page.locator('[data-target="open-concert"]').click();
  await restored.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'concert');
  check('restored My Band opens the concert', (await debug.getState(restored.page)).screen === 'concert');
  checkSessionClean(reporter, restored, 'landscape restored');
}

async function portraitDrive(browser) {
  const completed = () => localStorage.setItem('qlobe-instrument-detective-v1', JSON.stringify({
    complete: true, unlocked: ['maracas', 'drum', 'bell', 'piano', 'guitar', 'flute'],
  }));
  const session = await openGame(browser, { viewport: { width: 820, height: 1180 }, initScript: completed });
  const { page } = session;
  check('portrait orientation is reported', (await debug.call(page, 'getLayout')).orientation === 'portrait');
  check('portrait completion shows My Band', await page.locator('[data-target="open-concert"]').isVisible());
  await auditTargets(page, 'portrait splash');
  await noOverlappingActions(page, 'completed portrait splash');
  await auditRasterPage(page, 'portrait splash');
  await shot(page, '06-splash-portrait');
  await page.locator('[data-target="open-concert"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'concert');
  await auditTargets(page, 'portrait concert');
  await noOverlappingActions(page, 'portrait concert');
  await noConcertArtOcclusion(page, 'portrait concert');
  await shot(page, '07-concert-portrait');
  await page.locator('[data-target="back-concert"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'splash');
  await page.locator('[data-target="start-listen"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingChoice);
  await auditTargets(page, 'portrait play');
  await shot(page, '08-play-portrait');
  await page.locator('[data-target="back-play"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'splash');
  check('portrait HUD Back returns to splash', (await debug.getState(page)).screen === 'splash');
  checkSessionClean(reporter, session, 'portrait');
}

async function reducedMotionDrive(browser) {
  const session = await openGame(browser, { reducedMotion: 'reduce' });
  const { page } = session;
  check('reduced-motion preference reaches the game', await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
  await page.locator('[data-target="start-listen"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingChoice);
  await page.locator('[data-role="correct"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reveal');
  const animation = await page.locator('[data-reveal-instrument]').evaluate((node) => getComputedStyle(node).animationName);
  check('reduced-motion reveal has no running animation', animation === 'none', animation);
  await auditRasterPage(page, 'reduced-motion reveal');
  await shot(page, '09-reveal-reduced-motion');
  checkSessionClean(reporter, session, 'reduced motion');
}

async function recordedVoiceGate(browser) {
  const session = await openGame(browser, { mute: false });
  const { page } = session;
  await debug.clearAudioLog(page);
  await page.locator('[data-target="start-listen"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog().voice.some((entry) => entry.key === 'intro'));
  const voiceLog = await debug.getAudioLog(page);
  const intro = voiceLog.voice.find((entry) => entry.key === 'intro');
  check('real gesture selects a recorded teacher clip', intro?.kind === 'clip', JSON.stringify(intro));
  await debug.mute(page, true);
  const integrity = await page.evaluate(async () => {
    const [manifestResponse, linesResponse] = await Promise.all([
      fetch('./assets/audio/manifest.json'), fetch('./data/lines.json'),
    ]);
    if (!manifestResponse.ok || !linesResponse.ok) return [`HTTP ${manifestResponse.status}/${linesResponse.status}`];
    const manifest = await manifestResponse.json();
    const lines = await linesResponse.json();
    const failures = [];
    const expected = Object.keys(lines).sort();
    const actual = Object.keys(manifest).sort();
    if (expected.length !== 18 || JSON.stringify(expected) !== JSON.stringify(actual)) failures.push(`keys ${actual.length}/${expected.length}`);
    for (const [key, entry] of Object.entries(manifest)) {
      const response = await fetch(`./assets/audio/${entry.file}`);
      if (!response.ok) { failures.push(`${key}: HTTP ${response.status}`); continue; }
      const bytes = await response.arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map((value) => value.toString(16).padStart(2, '0')).join('');
      if (bytes.byteLength < 1000) failures.push(`${key}: too small`);
      if (hash !== entry.sha256) failures.push(`${key}: hash mismatch`);
      if (!(entry.dur > 0.2)) failures.push(`${key}: duration`);
    }
    return failures;
  });
  check('all 18 narration clips load and match manifest hashes', integrity.length === 0, integrity.join(' | '));
  checkSessionClean(reporter, session, 'recorded voice');
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    await hubGate(browser);
    await landscapeDrive(browser);
    await portraitDrive(browser);
    await reducedMotionDrive(browser);
    await recordedVoiceGate(browser);
  } catch (error) {
    check('QA driver completed without exception', false, error.stack || error.message);
    throw error;
  } finally {
    for (const session of sessions) await session.close().catch(() => {});
    await browser.close();
    finish({ suffix: `; screenshots in ${shots}` });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
