#!/usr/bin/env node

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  args, audio, baseUrl, createReporter, debug, dragBetween,
  ensureShots, launchChrome, openSession, resolveShots, shooter,
} from '../../../tools/qa/lib/driver.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const base = baseUrl();
const gameUrl = `${base}/games/number-sense-kitchen/`;
const shots = resolveShots(args.flag('shots', '/private/tmp/qlobe-number-sense-kitchen-shots'));
const shot = shooter(shots);
const reporter = createReporter({ detailOnFail: true, collapse: true, detailLimit: 1600 });
const { check, note, finish } = reporter;
const sessions = [];

const PLATFORM_ANALYTICS = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
];
const ROUNDS = {
  cookie: ['cookie-r1', 'cookie-r2', 'cookie-r3'],
  frame: ['frame-r1', 'frame-r2', 'frame-r3'],
  bowl: ['bowl-r1', 'bowl-r2', 'bowl-r3'],
};
const AUDIO_KEYS = [
  'welcome', 'start', 'menu-cookie', 'menu-frame', 'menu-bowl', 'idle', 'wrong',
  'mode-cookie-complete', 'mode-frame-complete', 'mode-bowl-complete', 'finale',
  ...ROUNDS.cookie.flatMap((id) => [`${id}-prompt`, `${id}-success`, `${id}-retry`]),
  ...ROUNDS.frame.flatMap((id) => [`${id}-prompt`, `${id}-success`]),
  ...ROUNDS.bowl.flatMap((id) => [`${id}-prompt`, `${id}-success`]),
];
const RUNTIME_AUDIO_KEYS = [
  'welcome', 'start', 'wrong',
  'mode-cookie-complete', 'mode-frame-complete', 'mode-bowl-complete', 'finale',
  ...ROUNDS.cookie.flatMap((id) => [`${id}-prompt`, `${id}-success`, `${id}-retry`]),
  ...ROUNDS.frame.flatMap((id) => [`${id}-prompt`, `${id}-success`]),
  ...ROUNDS.bowl.flatMap((id) => [`${id}-prompt`, `${id}-success`]),
];

async function stubPlatformAnalytics(session) {
  await session.context.route(
    /https:\/\/(?:www\.googletagmanager\.com|www\.google-analytics\.com)\//,
    (route) => route.fulfill({ status: 204, body: '' }),
  );
}

async function boot(browser, viewport, {
  reducedMotion = 'no-preference', mute = true, fastTimers = 0.05,
} = {}) {
  const session = await openSession(browser, {
    url: gameUrl,
    base,
    viewport,
    reducedMotion,
    goto: false,
    ready: false,
    allowAbortedMedia: true,
    allowRemote: PLATFORM_ANALYTICS,
  });
  await stubPlatformAnalytics(session);
  await session.page.goto(gameUrl, { waitUntil: 'networkidle' });
  await debug.waitForHook(session.page);
  await debug.waitForReady(session.page);
  await debug.seed(session.page, 42);
  await debug.fastTimers(session.page, fastTimers);
  await debug.mute(session.page, mute);
  sessions.push(session);
  return session;
}

async function openHub(browser) {
  const session = await openSession(browser, {
    url: `${base}/#math-number-sense`,
    base,
    viewport: { width: 1180, height: 820 },
    goto: false,
    ready: false,
    allowAbortedMedia: true,
    allowRemote: PLATFORM_ANALYTICS,
  });
  await stubPlatformAnalytics(session);
  await session.page.goto(`${base}/#math-number-sense`, { waitUntil: 'networkidle' });
  sessions.push(session);
  return session;
}

async function gameState(page) {
  return debug.getState(page);
}

async function clickTarget(page, id) {
  await page.locator(`.qk-screen:not([hidden]) [data-target="${id}"]`).first().click();
}

async function chooseMode(page, mode) {
  await clickTarget(page, `mode-${mode}`);
  await page.waitForFunction(
    (id) => {
      const state = window.QLOBE_DEBUG.getState();
      return state.screen === 'play' && state.mode === id && state.awaitingInput;
    },
    mode,
  );
}

async function waitForRound(page, id) {
  await page.waitForFunction(
    (roundId) => {
      const state = window.QLOBE_DEBUG.getState();
      return state.screen === 'play' && state.roundId === roundId && state.awaitingInput;
    },
    id,
  );
}

async function waitForRoundAdvance(page, id) {
  await page.waitForFunction(
    (roundId) => {
      const state = window.QLOBE_DEBUG.getState();
      return state.screen !== 'play' || state.roundId !== roundId;
    },
    id,
  );
}

async function auditTargets(page, label) {
  const audit = await page.evaluate(() => {
    const viewport = { width: innerWidth, height: innerHeight };
    const targets = [...document.querySelectorAll('[data-target]')]
      .filter((node) => {
        const style = getComputedStyle(node);
        return node.getClientRects().length && style.visibility !== 'hidden' && style.display !== 'none' && !node.disabled;
      })
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          id: node.dataset.target,
          hud: node.classList.contains('qk-hud-btn'),
          x: rect.x, y: rect.y, w: rect.width, h: rect.height,
          right: rect.right, bottom: rect.bottom,
        };
      });
    const hud = [...document.querySelectorAll('.qk-hud-btn')]
      .filter((node) => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
      .map((node) => {
        const pseudo = getComputedStyle(node, '::before');
        return { label: node.getAttribute('aria-label'), w: parseFloat(pseudo.width) || 0, h: parseFloat(pseudo.height) || 0 };
      });
    const outside = targets.filter((target) => (
      target.x < -1 || target.y < -1
      || target.right > viewport.width + 1 || target.bottom > viewport.height + 1
    ));
    const undersized = targets.filter((target) => !target.hud && (target.w < 96 || target.h < 96));
    const undersizedHud = hud.filter((target) => target.w < 96 || target.h < 96);
    return {
      outside,
      undersized,
      undersizedHud,
      overflow: document.documentElement.scrollWidth <= innerWidth + 1
        && document.documentElement.scrollHeight <= innerHeight + 1,
    };
  });
  check(
    `${label}: touch targets are at least 96px and stay in the viewport`,
    !audit.outside.length && !audit.undersized.length && !audit.undersizedHud.length && audit.overflow,
    JSON.stringify(audit),
  );
}

async function auditMenu(page, label) {
  const layout = await page.evaluate(() => {
    const rect = (node) => {
      const value = node?.getBoundingClientRect();
      return value ? { x: value.x, y: value.y, right: value.right, bottom: value.bottom, w: value.width, h: value.height } : null;
    };
    const title = rect(document.querySelector('.menu:not([hidden]) .title-art'));
    const hud = [...document.querySelectorAll('.menu:not([hidden]) .qk-hud-btn')].map(rect);
    const cards = [...document.querySelectorAll('.menu:not([hidden]) .mode-card')].map((card) => ({
      card: rect(card),
      label: rect(card.querySelector('.card-label')),
    }));
    return { title, hud, cards, viewport: { w: innerWidth, h: innerHeight } };
  });
  const titleInside = layout.title
    && layout.title.x >= -1 && layout.title.y >= -1
    && layout.title.right <= layout.viewport.w + 1 && layout.title.bottom <= layout.viewport.h + 1;
  const labelsInside = layout.cards.length === 3 && layout.cards.every(({ card, label: value }) => (
    card && value && value.x >= card.x && value.right <= card.right
    && value.y >= card.y && value.bottom <= card.bottom - 8
  ));
  const titleClear = layout.hud.every((button) => (
    button.right <= layout.title.x || button.x >= layout.title.right
    || button.bottom <= layout.title.y || button.y >= layout.title.bottom
  ));
  check(`${label}: title and all three recipe labels remain clear inside their art`, titleInside && titleClear && labelsInside, JSON.stringify(layout));
}

async function decodeConfiguredImages(page) {
  const assets = await page.evaluate(async () => {
    const config = await fetch('./config.json').then((response) => response.json());
    const urls = [...new Set([...Object.values(config.assets), ...config.modes.map((mode) => mode.asset)])];
    return Promise.all(urls.map((url) => new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ url, ok: image.naturalWidth > 0, w: image.naturalWidth, h: image.naturalHeight });
      image.onerror = () => resolve({ url, ok: false, w: 0, h: 0 });
      image.src = url;
    })));
  });
  check('every configured raster decodes in real Chrome', assets.every((asset) => asset.ok), JSON.stringify(assets));
}

async function decodeManifestAudio(page, manifest) {
  const result = await page.evaluate(async (entries) => {
    if (!entries.length) return [];
    const context = new AudioContext();
    const decoded = [];
    for (const [key, entry] of entries) {
      try {
        const response = await fetch(`./assets/audio/${entry.file}`);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        decoded.push({ key, ok: response.ok && buffer.duration > 0, duration: buffer.duration });
      } catch (error) {
        decoded.push({ key, ok: false, error: String(error) });
      }
    }
    await context.close();
    return decoded;
  }, Object.entries(manifest));
  check('every shipped voice clip decodes in system Chrome', !result.length || result.every((entry) => entry.ok), JSON.stringify(result));
}

async function staticAudit() {
  const required = ['index.html', 'config.json', 'config.js', 'game.json', 'game-design.md', 'ASSETS.md', 'css/style.css', 'js/main.js'];
  for (const file of required) {
    check(`static file exists: ${file}`, await stat(path.join(root, file)).then(() => true, () => false));
  }

  const [config, lines, manifest, voiceQa, provenance, css, html] = await Promise.all([
    readFile(path.join(root, 'config.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'assets/audio/lines.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'assets/audio/manifest.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'assets/audio/qa.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'assets/source/media-provenance.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'css/style.css'), 'utf8'),
    readFile(path.join(root, 'index.html'), 'utf8'),
  ]);

  const exactKeys = (value) => JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...AUDIO_KEYS].sort());
  check('lines.json contains the exact 32-line dialogue contract', exactKeys(lines), Object.keys(lines).join(', '));
  check('config voice matches lines.json exactly', JSON.stringify(config.voice) === JSON.stringify(lines));
  const manifestKeys = Object.keys(manifest);
  check(
    'voice delivery is all-or-none',
    manifestKeys.length === 0 || (manifestKeys.length === AUDIO_KEYS.length && AUDIO_KEYS.every((key) => manifestKeys.includes(key))),
    `manifest=${manifestKeys.length}, required=${AUDIO_KEYS.length}`,
  );
  const runtimeAudioFiles = (await readdir(path.join(root, 'assets/audio'))).filter((name) => /\.(?:m4a|wav|flac|mp3)$/i.test(name));
  check('empty voice manifest ships no orphan runtime clips', manifestKeys.length > 0 || runtimeAudioFiles.length === 0, runtimeAudioFiles.join(', '));
  check(
    'voice QA and provenance agree with runtime delivery',
    voiceQa.summary.total === AUDIO_KEYS.length
      && voiceQa.summary.accepted === manifestKeys.length
      && provenance.voice?.accepted === manifestKeys.length
      && (manifestKeys.length > 0 || voiceQa.summary.runtimeDelivery === 'omitted-all-or-none'),
    JSON.stringify({ qa: voiceQa.summary, provenance: provenance.voice, manifest: manifestKeys.length }),
  );

  const configuredAssets = [...new Set([...Object.values(config.assets), ...config.modes.map((mode) => mode.asset)])];
  const missing = [];
  for (const relative of configuredAssets) {
    const normalized = relative.replace(/^\.\//, '');
    if (!await stat(path.join(root, normalized)).then(() => true, () => false)) missing.push(relative);
  }
  check('every configured raster path resolves case-sensitively', !missing.length, missing.join(', '));

  const runtimeImages = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'source') await walk(file);
      } else if (/\.(?:webp|png|jpe?g)$/i.test(entry.name)) runtimeImages.push(file);
    }
  }
  await walk(path.join(root, 'assets'));
  const sizes = Object.fromEntries(await Promise.all(runtimeImages.map(async (file) => [path.relative(root, file), (await stat(file)).size])));
  const backdrop = sizes['assets/bg/kitchen.webp'];
  const foreground = Object.entries(sizes).filter(([name]) => name !== 'assets/bg/kitchen.webp');
  check('Toy kitchen backdrop remains under 300 KB', backdrop > 0 && backdrop <= 300_000, `${backdrop} bytes`);
  check('each shipped foreground raster remains under 180 KB', foreground.every(([, size]) => size <= 180_000), JSON.stringify(Object.fromEntries(foreground)));
  const hubBytes = await stat(path.resolve(root, '../../assets/hub/tiles/number-sense-kitchen.jpg')).then((value) => value.size);
  check('curated hub tile remains under 180 KB', hubBytes <= 180_000, `${hubBytes} bytes`);
  check('child-facing skin contains no SVG, canvas, or CSS-gradient artwork', !/<svg|<canvas/i.test(html) && !/gradient\(/i.test(css));
  check('all configured primary art references raster files', configuredAssets.every((file) => /\.(?:webp|png|jpe?g)$/i.test(file)), configuredAssets.join(', '));

  if (!manifestKeys.length) note('Qwen voice cloning accepted 0/32 lines; QA will prove the exact Web Speech fallback in Chrome.');
  return { manifest };
}

async function placeFrameRound(page, roundId) {
  let first = true;
  while (true) {
    const state = await gameState(page);
    if (state.screen !== 'play' || state.roundId !== roundId || !state.awaitingInput) break;
    const piece = page.locator('.fruit-piece').first();
    if (!await piece.count()) throw new Error(`${roundId}: no live ingredient for placement ${state.placedIds.length + 1}`);
    const before = state.placedIds.length;
    if (first) {
      const [source, destination] = await Promise.all([
        piece.boundingBox(),
        page.locator('[data-target="frame"]').boundingBox(),
      ]);
      if (!source || !destination) throw new Error(`${roundId}: pointer drag geometry unavailable`);
      await dragBetween(page, source, destination, { steps: 10 });
      first = false;
    } else {
      await piece.click();
      await clickTarget(page, 'frame');
    }
    await page.waitForFunction(
      ({ id, placed }) => {
        const next = window.QLOBE_DEBUG.getState();
        return next.screen !== 'play' || next.roundId !== id || next.placedIds.length > placed;
      },
      { id: roundId, placed: before },
    );
  }
}

async function placeBowlRound(page, roundId) {
  const first = page.locator('.group-piece:not([disabled])').first();
  const [source, destination] = await Promise.all([
    first.boundingBox(),
    page.locator('[data-target="bowl"]').boundingBox(),
  ]);
  if (!source || !destination) throw new Error(`${roundId}: bowl pointer geometry unavailable`);
  await dragBetween(page, source, destination, { steps: 10 });
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().placedIds.length === 1);

  const second = page.locator('.group-piece:not([disabled])').first();
  if (!await second.count()) throw new Error(`${roundId}: second live group missing`);
  await second.focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-target="bowl"]').focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(
    (id) => {
      const state = window.QLOBE_DEBUG.getState();
      return state.roundId !== id || state.placedIds.length === 2 || state.screen !== 'play';
    },
    roundId,
  );
}

async function completeMode(page, mode, {
  beforeRound = null, exerciseWrong = false, slowFinal = false,
} = {}) {
  const visited = [];
  for (const [index, roundId] of ROUNDS[mode].entries()) {
    await waitForRound(page, roundId);
    visited.push((await gameState(page)).roundId);
    if (beforeRound) await beforeRound(roundId, index);
    if (slowFinal && index === ROUNDS[mode].length - 1) await debug.fastTimers(page, 1);

    if (mode === 'cookie') {
      if (exerciseWrong) {
        await page.locator('.number-choice[data-role="wrong"]').first().click();
        await debug.waitForAudio(page, `${roundId}-retry`);
        if (index === 0) await shot(page, '04-cookie-wrong');
      }
      const target = (await gameState(page)).target;
      await clickTarget(page, `number-${target}`);
    } else if (mode === 'frame') {
      if (exerciseWrong && index === 0) {
        await clickTarget(page, 'frame');
        await debug.waitForAudio(page, 'wrong');
      }
      await placeFrameRound(page, roundId);
    } else {
      await placeBowlRound(page, roundId);
    }
    await waitForRoundAdvance(page, roundId);
  }
  await page.waitForFunction((id) => window.QLOBE_DEBUG.getState().completedModes.includes(id), mode);
  check(`${mode}: visits and completes its exact three rounds`, JSON.stringify(visited) === JSON.stringify(ROUNDS[mode]), JSON.stringify(visited));
}

async function debugCompleteMode(page, mode) {
  await debug.startMode(page, mode);
  for (const roundId of ROUNDS[mode]) {
    await waitForRound(page, roundId);
    await debug.winRound(page);
    await waitForRoundAdvance(page, roundId);
  }
  await page.waitForFunction((id) => window.QLOBE_DEBUG.getState().completedModes.includes(id), mode);
}

async function driveHub(browser) {
  const session = await openHub(browser);
  const { page } = session;
  const card = page.locator('a[data-game-id="number-sense-kitchen"][aria-label="Number Sense Kitchen — beta"]');
  await card.waitFor({ state: 'visible' });
  check('hub exposes exactly one registered Number Sense Kitchen beta tile', await card.count() === 1);
  const image = card.locator('img');
  await image.scrollIntoViewIfNeeded();
  await image.evaluate((node) => { node.loading = 'eager'; });
  await page.waitForFunction((node) => node.complete && node.naturalWidth > 0, await image.elementHandle());
  const dimensions = await image.evaluate((node) => ({ width: node.naturalWidth, height: node.naturalHeight }));
  check('hub tile decodes at the curated 640×533 size', dimensions.width === 640 && dimensions.height === 533, JSON.stringify(dimensions));
  await shot(page, '00-hub');
  await card.click();
  await page.waitForURL(/\/games\/number-sense-kitchen\/$/);
  await debug.waitForHook(page);
  await debug.waitForReady(page);
  check('hub route boots the ready game splash', (await gameState(page)).screen === 'splash');
}

async function driveMain(browser, manifest) {
  const session = await boot(browser, { width: 1180, height: 820 }, { mute: false });
  const { page } = session;
  check('desktop boot opens on splash', (await gameState(page)).screen === 'splash');
  const beforeStart = await debug.call(page, 'getAudioState');
  check('BGM is preloaded but not playing before Start Kitchen', !beforeStart.bgm.playing, JSON.stringify(beforeStart));
  await auditTargets(page, 'desktop splash');
  await shot(page, '01-splash');

  await clickTarget(page, 'start');
  await debug.waitForScreen(page, 'menu');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getAudioState().bgm.playing);
  const afterStart = await debug.call(page, 'getAudioState');
  check(
    'the first real Start gesture begins the intended BGM',
    afterStart.bgm.playing && afterStart.bgm.key === 'number-sense-kitchen'
      && afterStart.bgm.url.endsWith('/shared/assets/music/whimsical-toy-workshop.mp3'),
    JSON.stringify(afterStart),
  );
  await debug.waitForAudio(page, 'welcome');
  await auditTargets(page, 'desktop menu');
  await auditMenu(page, 'desktop menu');
  await shot(page, '02-menu');
  await decodeConfiguredImages(page);
  await decodeManifestAudio(page, manifest);

  await debug.mute(page, true);
  await page.waitForTimeout(220);
  const muted = await debug.call(page, 'getAudioState');
  check('mute silences voice and BGM state together', (await gameState(page)).muted && muted.voiceMuted && muted.bgm.muted && muted.bgm.elementVolume === 0, JSON.stringify(muted));
  await debug.mute(page, false);
  await clickTarget(page, 'replay');
  await debug.waitForAudio(page, 'start');

  await chooseMode(page, 'cookie');
  await completeMode(page, 'cookie', {
    exerciseWrong: true,
    beforeRound: async (id, index) => {
      await auditTargets(page, `desktop ${id}`);
      await shot(page, `${String(3 + index * 2).padStart(2, '0')}-${id}`);
    },
  });
  await debug.waitForScreen(page, 'complete');
  await auditTargets(page, 'desktop cookie completion');
  await shot(page, '09-cookie-complete');

  await clickTarget(page, 'next-recipe');
  await waitForRound(page, 'frame-r1');
  await completeMode(page, 'frame', {
    exerciseWrong: true,
    beforeRound: async (id, index) => {
      await auditTargets(page, `desktop ${id}`);
      await shot(page, `${10 + index}-${id}`);
    },
  });
  await debug.waitForScreen(page, 'complete');
  await auditTargets(page, 'desktop frame completion');
  await shot(page, '13-frame-complete');

  await clickTarget(page, 'recipe-menu');
  await debug.waitForScreen(page, 'menu');
  check('earned recipe badges persist when returning to the menu', (await gameState(page)).completedModes.length === 2);
  await auditMenu(page, 'desktop earned menu');
  await shot(page, '14-menu-earned');
  await chooseMode(page, 'bowl');
  await completeMode(page, 'bowl', {
    slowFinal: true,
    beforeRound: async (id, index) => {
      await auditTargets(page, `desktop ${id}`);
      await shot(page, `${15 + index}-${id}`);
    },
  });
  await debug.waitForScreen(page, 'complete');
  await auditTargets(page, 'desktop bowl completion');
  await shot(page, '18-bowl-complete');
  await debug.waitForScreen(page, 'finale', { timeout: 5000 });
  await auditTargets(page, 'desktop finale');
  await shot(page, '19-finale');

  const log = await debug.getAudioLog(page);
  const missingRuntimeKeys = RUNTIME_AUDIO_KEYS.filter((key) => !audio.heard(log, key));
  check('the full live narration path logs every expected prompt and feedback beat', !missingRuntimeKeys.length, `${missingRuntimeKeys.join(', ')} | ${audio.describe(log)}`);
  const expectedKind = Object.keys(manifest).length ? 'clip' : 'speech';
  check('the live narration uses the delivery proven by the manifest', log.filter((entry) => RUNTIME_AUDIO_KEYS.includes(audio.keyOf(entry))).every((entry) => entry.kind === expectedKind), audio.describe(log));

  await clickTarget(page, 'cook-again');
  await debug.waitForScreen(page, 'menu');
  check('Cook Again resets all three in-memory badges', (await gameState(page)).completedModes.length === 0);
  await clickTarget(page, 'back');
  await debug.waitForScreen(page, 'splash');
  await page.waitForFunction(() => !window.QLOBE_DEBUG.getAudioState().bgm.playing, null, { timeout: 3000 });
  check('returning to splash fades out and stops BGM', !(await debug.call(page, 'getAudioState')).bgm.playing);
  const homePath = await page.locator('.splash .qk-hud-home').evaluate((node) => new URL(node.href).pathname);
  check('splash Home resolves to the platform hub', homePath === '/' || homePath === '/index.html', homePath);

  await page.reload({ waitUntil: 'networkidle' });
  await debug.waitForHook(page);
  await debug.waitForReady(page);
  const reloaded = await gameState(page);
  check('reload returns to a clean splash session', reloaded.screen === 'splash' && reloaded.completedModes.length === 0 && !(await debug.call(page, 'getAudioState')).bgm.playing, JSON.stringify(reloaded));
}

async function drivePointerCancel(browser) {
  const session = await boot(browser, { width: 1180, height: 820 }, { reducedMotion: 'reduce', mute: true });
  const { page } = session;
  await debug.startMode(page, 'frame');
  await waitForRound(page, 'frame-r1');
  const piece = page.locator('.fruit-piece').first();
  const source = await piece.boundingBox();
  if (!source) throw new Error('drag-cancel ingredient has no geometry');
  await dragBetween(page, source, { x: 12, y: 410 }, { steps: 8 });
  await page.waitForTimeout(100);
  const cancelled = await gameState(page);
  check('dragging away from the frame cancels without consuming an ingredient', cancelled.placedIds.length === 0 && cancelled.selectedId === null && cancelled.awaitingInput, JSON.stringify(cancelled));
  const destination = await page.locator('[data-target="frame"]').boundingBox();
  if (!destination) throw new Error('drag-cancel frame has no geometry');
  await dragBetween(page, await piece.boundingBox(), destination, { steps: 10 });
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().placedIds.length === 1);
  check('a subsequent real pointer drag reaches the same frame handler', (await gameState(page)).placedIds.length === 1);
  check('starting a mode through debug never starts BGM without Start Kitchen', !(await debug.call(page, 'getAudioState')).bgm.playing);
}

async function drivePortrait(browser) {
  const session = await boot(browser, { width: 390, height: 844 }, { reducedMotion: 'reduce', mute: true });
  const { page } = session;
  await auditTargets(page, 'portrait splash');
  await shot(page, '20-portrait-splash');
  await clickTarget(page, 'start');
  await debug.waitForScreen(page, 'menu');
  await auditTargets(page, 'portrait menu');
  await auditMenu(page, 'portrait menu');
  await shot(page, '21-portrait-menu');

  for (const [index, mode] of ['cookie', 'frame', 'bowl'].entries()) {
    await chooseMode(page, mode);
    await auditTargets(page, `portrait ${mode}`);
    await shot(page, `${22 + index}-portrait-${mode}`);
    if (mode === 'frame') {
      const piece = page.locator('.fruit-piece').first();
      await piece.focus();
      await page.keyboard.press('Enter');
      await page.locator('[data-target="frame"]').focus();
      await page.keyboard.press('Space');
      await page.waitForFunction(() => window.QLOBE_DEBUG.getState().placedIds.length === 1);
      check('keyboard Enter/Space performs frame tap-tap placement', (await gameState(page)).placedIds.length === 1);
    }
    await clickTarget(page, 'back');
    await debug.waitForScreen(page, 'menu');
  }

  await debugCompleteMode(page, 'cookie');
  await debug.waitForScreen(page, 'complete');
  await auditTargets(page, 'portrait completion');
  await shot(page, '25-portrait-complete');
}

async function driveWide(browser) {
  const session = await boot(browser, { width: 568, height: 320 }, { reducedMotion: 'reduce', mute: true });
  const { page } = session;
  await auditTargets(page, 'wide splash');
  await shot(page, '26-wide-splash');
  await clickTarget(page, 'start');
  await debug.waitForScreen(page, 'menu');
  await auditTargets(page, 'wide menu');
  await auditMenu(page, 'wide menu');
  await shot(page, '27-wide-menu');

  for (const [index, mode] of ['cookie', 'frame', 'bowl'].entries()) {
    await chooseMode(page, mode);
    await auditTargets(page, `wide ${mode}`);
    await shot(page, `${28 + index}-wide-${mode}`);
    await clickTarget(page, 'back');
    await debug.waitForScreen(page, 'menu');
  }

  await debugCompleteMode(page, 'cookie');
  await debug.waitForScreen(page, 'complete');
  await auditTargets(page, 'wide completion');
  await shot(page, '31-wide-complete');
  await clickTarget(page, 'next-recipe');
  await debugCompleteMode(page, 'frame');
  await debug.waitForScreen(page, 'complete');
  await clickTarget(page, 'next-recipe');
  await debugCompleteMode(page, 'bowl');
  await debug.waitForScreen(page, 'finale');
  await auditTargets(page, 'wide finale');
  await shot(page, '32-wide-finale');
}

async function main() {
  await ensureShots(shots);
  const { manifest } = await staticAudit();
  const browser = await launchChrome();
  try {
    await driveHub(browser);
    await driveMain(browser, manifest);
    await drivePointerCancel(browser);
    await drivePortrait(browser);
    await driveWide(browser);
  } catch (error) {
    check('QA scenario reaches the final acceptance screen', false, error?.stack || String(error));
  } finally {
    for (const [index, session] of sessions.entries()) {
      const label = `session ${index + 1}`;
      check(`${label} has no page errors`, session.errors.length === 0, session.errors.join(' | '));
      check(`${label} has no failed requests or HTTP errors`, session.failed.length === 0, session.failed.join(' | '));
      check(`${label} makes no unexpected off-origin request beyond platform analytics`, session.remote.length === 0, session.remote.join(' | '));
    }
    await Promise.allSettled(sessions.map((session) => session.context.close()));
    await browser.close();
  }
  note(`visual QC screenshots: ${shots}`);
  finish({ suffix: `; shots in ${shots}` });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
