#!/usr/bin/env node
// Real-Chrome interaction, camera-fallback, responsive, and visual-QC gate.

import { mkdir, readdir, writeFile } from 'node:fs/promises';

import {
  args, baseUrl, launchChrome, createReporter, openSession, checkSessionClean,
  resolveShots, ensureShots, shooter, debug, targetSizes, undersized, dragBetween,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const shots = resolveShots('qa-shots/throwing-target-garden');
const writeShot = shooter(shots);
const report = createReporter();
const { check, note, finish } = report;
const reviewDirectory = new URL('../reviews/', import.meta.url);
const reviewReport = new URL('../reviews/qa-report.json', import.meta.url);
const expectedScreenshotNames = [
  '01-splash-landscape',
  '02-safe-setup-landscape',
  '03-camera-ready-landscape',
  '04-number-play-camera',
  '05-garden-match-landscape',
  '06-garden-star-landscape',
  '07-color-reward-drag',
  '08-sequence-trail-landscape',
  '09-splash-portrait',
  '10-setup-portrait',
  '11-sequence-play-portrait',
  '12-reward-portrait',
  '13-splash-wide-short',
  '14-number-play-wide-short',
  '15-reward-reduced-motion',
  '16-color-match-before-throw',
  '17-touch-toss-bag-selected',
  '18-wrong-color-warm-retry',
  '19-camera-lost-touch-toss',
  '20-camera-recovery-touch-toss',
  '21-camera-ready-portrait',
  '22-mode-color-selected-landscape',
  '23-number-near-miss-landscape',
  '24-sequence-wrong-order-landscape',
  '25-camera-ready-timeout',
  '26-camera-ready-flipped',
  '27-color-camera-play',
  '28-sequence-camera-play',
  '29-color-idle-hint',
  '30-color-garden-star',
  '31-sequence-garden-star',
  '32-color-no-bag-hint',
  '33-touch-toss-drag-flight',
  '34-camera-unavailable-touch-toss',
  '35-camera-error-touch-toss',
  '36-camera-late-touch-toss',
  '37-camera-loss-clears-retry',
  '38-compact-splash-portrait',
  '39-compact-setup-portrait',
  '40-compact-camera-ready-portrait',
  '41-compact-number-play-portrait',
  '42-compact-reward-portrait',
  '43-compact-garden-star-portrait',
  '44-compact-garden-star-landscape',
];
const expectedScreenshotSet = new Set(expectedScreenshotNames);
const expectedScreenshots = expectedScreenshotNames.length;
const capturedScreenshots = new Set();
const injectedFailure = args.flag('inject-failure');

async function shot(page, name, options = {}) {
  const canonical = String(name).replace(/\.png$/i, '');
  if (!expectedScreenshotSet.has(canonical)) throw new Error(`unexpected QA screenshot ${canonical}`);
  if (capturedScreenshots.has(canonical)) throw new Error(`duplicate QA screenshot ${canonical}`);
  const file = await writeShot(page, canonical, options);
  capturedScreenshots.add(canonical);
  return file;
}

async function persistQaReport({ completed, status, screenshots, error = null }) {
  const failed = report.failures();
  await mkdir(reviewDirectory, { recursive: true });
  await writeFile(reviewReport, `${JSON.stringify({
    format: 'qlobe-game-qa-report',
    formatVersion: 1,
    game: 'throwing-target-garden',
    runAt: new Date().toISOString(),
    base,
    browser: 'Google Chrome',
    completed,
    status,
    passed: report.results.length - failed.length,
    total: report.results.length,
    screenshots,
    expectedScreenshots,
    checks: report.results,
    notes: report.notes,
    error: error ? String(error.message || error).slice(0, 500) : null,
  }, null, 2)}\n`);
}

async function openGame(browser, viewport, reducedMotion = 'no-preference', mute = true) {
  return openSession(browser, {
    url: `${base}/games/throwing-target-garden/`,
    base,
    viewport,
    reducedMotion,
    seed: 42,
    fastTimers: 50,
    mute,
    allowAbortedMedia: true,
  });
}

function installSyntheticMedia() {
  const qa = { requests: 0, stops: 0, active: 0, canvases: [], streams: [], sources: [] };
  const currentSource = () => qa.sources.at(-1) || null;
  qa.blank = () => {
    const source = currentSource();
    if (!source) return false;
    source.context.fillStyle = '#242424';
    source.context.fillRect(0, 0, source.canvas.width, source.canvas.height);
    source.track.requestFrame?.();
    return true;
  };
  qa.paint = ({ x, y, width, height, color = '#eb2226' }) => {
    const source = currentSource();
    if (!source) return false;
    source.context.fillStyle = '#242424';
    source.context.fillRect(0, 0, source.canvas.width, source.canvas.height);
    source.context.fillStyle = color;
    source.context.fillRect(x, y, width, height);
    source.track.requestFrame?.();
    return true;
  };
  qa.endActiveTrack = () => {
    const source = currentSource();
    if (!source || source.track.readyState === 'ended') return false;
    return source.track.dispatchEvent(new Event('ended'));
  };
  Object.defineProperty(globalThis, '__TTG_MEDIA_QA', { configurable: true, value: qa });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      async getUserMedia() {
        qa.requests += 1;
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 96;
        const context = canvas.getContext('2d');
        context.fillStyle = '#242424';
        context.fillRect(0, 0, canvas.width, canvas.height);
        const stream = canvas.captureStream(0);
        const [track] = stream.getVideoTracks();
        qa.canvases.push(canvas);
        qa.streams.push(stream);
        qa.sources.push({ canvas, context, track });
        track.requestFrame?.();
        for (const track of stream.getTracks()) {
          qa.active += 1;
          const nativeStop = track.stop.bind(track);
          let counted = false;
          track.stop = () => {
            if (!counted) {
              counted = true;
              qa.stops += 1;
              qa.active -= 1;
            }
            nativeStop();
          };
        }
        return stream;
      },
    },
  });
}

async function openSyntheticCameraGame(browser, viewport = { width: 1024, height: 768 }) {
  return openSession(browser, {
    url: `${base}/games/throwing-target-garden/`,
    base,
    viewport,
    seed: 42,
    fastTimers: 10,
    mute: true,
    allowAbortedMedia: true,
    initScript: installSyntheticMedia,
  });
}

async function syntheticMediaState(page) {
  return page.evaluate(() => {
    const qa = globalThis.__TTG_MEDIA_QA;
    return { requests: qa.requests, stops: qa.stops, active: qa.active };
  });
}

async function enterLiveCamera(page, mode) {
  await debug.startMode(page, mode);
  await debug.waitForScreen(page, 'setup');
  await debug.tap(page, 'camera');
  await debug.waitForScreen(page, 'ready');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().camera.status === 'live');
}

async function calibrateIntoCameraPlay(page) {
  await debug.call(page, 'calibrateLane', 'left');
  await debug.call(page, 'calibrateLane', 'right');
  await debug.waitForScreen(page, 'play');
  await debug.waitForInput(page);
}

async function paintTrackedFrame(page, frame) {
  const painted = await page.evaluate((next) => globalThis.__TTG_MEDIA_QA.paint(next), frame);
  if (!painted) throw new Error('synthetic camera source was not available');
  await page.waitForFunction((next) => {
    const camera = window.QLOBE_DEBUG.getState().camera;
    const blob = camera.blob;
    const rawX = (next.x + next.width / 2) / 128;
    const expectedX = camera.mirrored ? 1 - rawX : rawX;
    const expectedY = (next.y + next.height / 2) / 96;
    const expectedArea = (next.width * next.height) / (128 * 96);
    return blob?.color === 'red'
      && Math.abs(blob.x - expectedX) < .015
      && Math.abs(blob.y - expectedY) < .015
      && Math.abs(blob.area - expectedArea) < .001;
  }, frame, { timeout: 1500 });
}

async function driveTrackedCameraThrow(page) {
  const frames = [
    { x: 25, y: 23, width: 7, height: 7 },
    { x: 34, y: 29, width: 9, height: 8 },
    { x: 46, y: 37, width: 11, height: 10 },
    { x: 57, y: 50, width: 14, height: 12 },
  ];
  for (const frame of frames) await paintTrackedFrame(page, frame);
}

async function driveMappedCameraThrow(page, targetX) {
  const widths = [7, 9, 11, 14];
  const heights = [7, 8, 10, 12];
  const ys = [23, 29, 37, 50];
  const rawCenters = [-.20, -.14, -.07, 0].map((offset) => targetX + offset);
  const frames = rawCenters.map((center, index) => ({
    x: Math.round(center * 128 - widths[index] / 2),
    y: ys[index],
    width: widths[index],
    height: heights[index],
  }));
  for (const frame of frames) await paintTrackedFrame(page, frame);
}

async function holdStationaryCameraFrame(page) {
  const frame = { x: 57, y: 50, width: 14, height: 12 };
  await page.evaluate(() => globalThis.__TTG_MEDIA_QA.blank());
  await page.waitForTimeout(250);
  for (let index = 0; index < 8; index += 1) {
    await paintTrackedFrame(page, frame);
    await page.waitForTimeout(90);
  }
}

async function checkTargets(page, label) {
  const sizes = await targetSizes(page);
  const small = undersized(sizes, 95.5);
  check(`${label} targets meet the 96px minimum`, small.length === 0,
    small.map((item) => `${item.id}:${Math.round(item.w)}×${Math.round(item.h)}`).join(', '));
}

async function checkTargetsInsideViewport(page, label) {
  const result = await page.evaluate(() => {
    const viewport = { width: innerWidth, height: innerHeight };
    const targets = window.QLOBE_DEBUG.getTargets();
    const outside = targets.filter(({ rect }) => rect.x < -1 || rect.y < -1
      || rect.x + rect.w > viewport.width + 1 || rect.y + rect.h > viewport.height + 1);
    return { viewport, outside };
  });
  check(`${label} targets remain within the viewport`, result.outside.length === 0, JSON.stringify(result));
}

async function checkSplashSeparation(page, label) {
  const result = await page.evaluate(() => {
    const startNode = document.querySelector('#screen-splash [data-target="start"]');
    const start = (startNode?.querySelector(':scope > img') || startNode)?.getBoundingClientRect();
    const cards = [...document.querySelectorAll('#screen-splash [data-role="mode"]')]
      .map((node) => ({
        id: node.dataset.target,
        rect: (node.querySelector(':scope > img') || node).getBoundingClientRect(),
      }));
    if (!start) return { start: null, overlaps: cards.map(({ id }) => id) };
    const overlaps = cards.filter(({ rect }) => !(rect.right <= start.left || rect.left >= start.right
      || rect.bottom <= start.top || rect.top >= start.bottom)).map(({ id }) => id);
    return { start: { x: start.x, y: start.y, w: start.width, h: start.height }, overlaps };
  });
  check(`${label} keeps START clear of every mode card`, result.start && result.overlaps.length === 0,
    JSON.stringify(result));
}

async function checkModeLabelsInsideCards(page, label) {
  const result = await page.locator('#screen-splash [data-role="mode"]').evaluateAll((cards) => cards.map((card) => {
    const image = card.querySelector(':scope > img')?.getBoundingClientRect();
    const caption = card.querySelector(':scope > span')?.getBoundingClientRect();
    return {
      id: card.dataset.target,
      inside: Boolean(image && caption && caption.left >= image.left + 6 && caption.right <= image.right - 6),
      image: image && { left: image.left, right: image.right },
      caption: caption && { left: caption.left, right: caption.right },
    };
  }));
  check(`${label} keeps every caption inside its illustrated card`,
    result.length === 3 && result.every((item) => item.inside), JSON.stringify(result));
}

async function checkPlayChromeSeparation(page, label) {
  const result = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect() || null;
    const overlaps = (a, b) => Boolean(a && b && !(a.right <= b.left || a.left >= b.right
      || a.bottom <= b.top || a.top >= b.bottom));
    const back = rect('#screen-play .qk-hud-back');
    const sound = rect('#screen-play .qk-hud-sound');
    const tracking = rect('#screen-play .tracking-status');
    const progress = rect('#screen-play .progress-status');
    const compact = (value) => value && ({ x: value.x, y: value.y, w: value.width, h: value.height });
    return {
      backTracking: overlaps(back, tracking),
      soundProgress: overlaps(sound, progress),
      back: compact(back), tracking: compact(tracking), sound: compact(sound), progress: compact(progress),
    };
  });
  check(`${label} keeps both status badges clear of HUD controls`,
    result.back?.w > 0 && result.sound?.w > 0 && result.tracking?.w > 0 && result.progress?.w > 0
      && !result.backTracking && !result.soundProgress, JSON.stringify(result));
}

async function checkElementsInsideViewport(page, selectors, label) {
  const result = await page.evaluate((requested) => {
    const viewport = { width: innerWidth, height: innerHeight };
    const elements = requested.map((selector) => {
      const node = document.querySelector(selector);
      const rect = node?.getBoundingClientRect();
      return {
        selector,
        visible: Boolean(node && rect && rect.width > 0 && rect.height > 0),
        rect: rect ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height } : null,
        inside: Boolean(rect && rect.x >= -1 && rect.y >= -1
          && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1),
      };
    });
    return { viewport, elements };
  }, selectors);
  check(`${label} keeps every primary element inside the viewport`,
    result.elements.every(({ visible, inside }) => visible && inside), JSON.stringify(result));
}

async function checkElementsSeparated(page, selectors, label) {
  const result = await page.evaluate((requested) => {
    const entries = requested.map((selector) => ({
      selector,
      rect: document.querySelector(selector)?.getBoundingClientRect() || null,
    }));
    const overlaps = [];
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        const a = entries[left]; const b = entries[right];
        if (!a.rect || !b.rect) continue;
        if (!(a.rect.right <= b.rect.left || a.rect.left >= b.rect.right
          || a.rect.bottom <= b.rect.top || a.rect.top >= b.rect.bottom)) {
          overlaps.push([a.selector, b.selector]);
        }
      }
    }
    return { missing: entries.filter(({ rect }) => !rect).map(({ selector }) => selector), overlaps };
  }, selectors);
  check(`${label} keeps primary elements separated`,
    result.missing.length === 0 && result.overlaps.length === 0, JSON.stringify(result));
}

async function checkCompactSafetyDisclosure(page) {
  const result = await page.locator('.safety-note').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const lines = [...node.querySelectorAll('.stacked-plate-lines > span')]
      .map((line) => line.textContent.trim());
    return {
      lines,
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      inside: rect.x >= -1 && rect.y >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
    };
  });
  check('compact setup shows both complete safety/privacy lines before camera permission',
    result.inside && result.lines.length === 2
      && /soft fabric objects only/i.test(result.lines[0])
      && /never shown, recorded, saved, or uploaded/i.test(result.lines[1]), JSON.stringify(result));
}

async function checkPromptStatusSeparation(page, label) {
  const result = await page.evaluate(() => {
    const prompt = document.querySelector('.prompt-plate > span')?.getBoundingClientRect();
    const statuses = [...document.querySelectorAll('.play-status')].map((node) => node.getBoundingClientRect());
    const overlaps = prompt ? statuses.filter((rect) => !(rect.right <= prompt.left || rect.left >= prompt.right
      || rect.bottom <= prompt.top || rect.top >= prompt.bottom)).length : statuses.length;
    return prompt ? { prompt: { x: prompt.x, y: prompt.y, w: prompt.width, h: prompt.height }, overlaps } : null;
  });
  check(`${label} guidance stays clear of both status badges`, result?.overlaps === 0, JSON.stringify(result));
}

async function checkBasketInsideViewport(page, selector, label) {
  const result = await page.locator(selector).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      viewport: { width: innerWidth, height: innerHeight },
      inside: rect.x >= -1 && rect.y >= -1
        && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
    };
  });
  check(`${label} keeps the complete safe basket inside the viewport`, result.inside, JSON.stringify(result));
}

async function checkAuthoredCarrier(page, selector, label) {
  const result = await page.locator(selector).evaluate((node) => {
    const image = node.querySelector(':scope > img');
    const style = getComputedStyle(node);
    return {
      image: Boolean(image?.complete && image.naturalWidth > 1),
      background: style.backgroundImage,
      backgroundColor: style.backgroundColor,
      borderWidths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
    };
  });
  check(`${label} uses an authored raster carrier`, result.image
    && result.background === 'none'
    && ['rgba(0, 0, 0, 0)', 'transparent'].includes(result.backgroundColor)
    && result.borderWidths.every((value) => Number.parseFloat(value) === 0), JSON.stringify(result));
}

async function waitForRewardLanding(page) {
  await page.waitForFunction(() => ['.garden-match-lockup', '.reward-rings', '.landed-bag', '.reward-basket-art'].every((selector) => {
    const node = document.querySelector(selector);
    return node && node.getAnimations().every((animation) => animation.playState === 'finished');
  }));
}

async function checkSafeReward(page, label) {
  const result = await page.evaluate(() => {
    const container = document.querySelector('.reward-basket');
    const basket = container?.querySelector('.reward-basket-art');
    const bag = container?.querySelector('.landed-bag');
    const basketRect = basket?.getBoundingClientRect();
    const bagRect = bag?.getBoundingClientRect();
    const bagCenter = bagRect ? { x: bagRect.x + bagRect.width / 2, y: bagRect.y + bagRect.height / 2 } : null;
    const state = window.QLOBE_DEBUG.getState();
    const expectedTitle = state.mode === 'color' ? `${state.target.color.toUpperCase()} MATCH!` : 'GARDEN MATCH!';
    return {
      destination: container?.dataset.safeDestination || null,
      basketReady: Boolean(basket?.complete && basket.naturalWidth > 1),
      bagReady: Boolean(bag?.complete && bag.naturalWidth > 1),
      bagAlt: bag?.alt || '',
      recognition: document.querySelector('.reward-recognition')?.getAttribute('aria-label') || '',
      title: document.querySelector('.garden-match-lockup')?.innerText.trim() || '',
      expectedTitle,
      unsafeLockups: document.querySelectorAll('.target-hit-lockup').length,
      bagCenterInsideBasket: Boolean(basketRect && bagCenter
        && bagCenter.x >= basketRect.left && bagCenter.x <= basketRect.right
        && bagCenter.y >= basketRect.top && bagCenter.y <= basketRect.bottom),
    };
  });
  check(`${label} resolves the beanbag visibly in the safe basket`, result.destination === 'basket'
    && result.basketReady && result.bagReady && /shown safely inside the soft basket/i.test(result.bagAlt)
    && result.bagCenterInsideBasket && result.unsafeLockups === 0
    && result.title === result.expectedTitle && /on screen$/i.test(result.recognition), JSON.stringify(result));
}

async function checkSafeEnd(page, label) {
  const result = await page.evaluate(() => {
    const basket = document.querySelector('.end-basket');
    return {
      destination: basket?.dataset.safeDestination || null,
      label: basket?.getAttribute('aria-label') || '',
      bags: basket?.querySelectorAll('.end-bag').length || 0,
      basketReady: Boolean(basket?.querySelector('.end-basket-art')?.complete),
      unsafeGarlands: document.querySelectorAll('.end-garland').length,
    };
  });
  check(`${label} celebrates beanbags resting in the basket`, result.destination === 'basket'
    && /resting in the soft basket/i.test(result.label) && result.bags === 3
    && result.basketReady && result.unsafeGarlands === 0, JSON.stringify(result));
}

async function chooseTouch(page, mode) {
  await debug.startMode(page, mode);
  await debug.waitForScreen(page, 'setup');
  await debug.tap(page, 'touch');
  await debug.waitForScreen(page, 'play');
  await debug.waitForInput(page);
}

async function continueReward(page) {
  await debug.tap(page, 'next');
  await page.waitForFunction(() => ['play', 'end'].includes(window.QLOBE_DEBUG.getState().screen));
}

async function completeMode(page, limit = 30) {
  for (let guard = 0; guard < limit; guard += 1) {
    const state = await debug.getState(page);
    if (state.screen === 'end') return state;
    if (state.screen === 'play') {
      await debug.winRound(page);
      await page.waitForFunction(() => {
        const next = window.QLOBE_DEBUG.getState();
        return next.screen === 'reward' || (next.screen === 'play' && next.awaitingInput && !next.inputLocked);
      });
      continue;
    }
    if (state.screen === 'reward') {
      await continueReward(page);
      continue;
    }
    throw new Error(`completeMode stranded on ${state.screen}`);
  }
  throw new Error('completeMode guard exhausted');
}

async function assertLocalRasterWorld(page) {
  const audit = await page.evaluate(async () => {
    const images = [...document.images].filter((image) => image.getClientRects().length);
    const style = await fetch('./style.css').then((response) => response.text());
    return {
      images: images.length,
      broken: images.filter((image) => !image.complete || image.naturalWidth < 2).map((image) => image.src),
      remote: images.filter((image) => new URL(image.src).origin !== location.origin).map((image) => image.src),
      svg: document.querySelectorAll('svg').length,
      canvas: document.querySelectorAll('canvas').length,
      cssGradient: /(?:linear|radial|conic)-gradient\s*\(/i.test(style),
      emoji: /[\u{1F300}-\u{1FAFF}]/u.test(document.body.innerText),
    };
  });
  check('visible world uses local authored raster art', audit.images >= 6
    && audit.broken.length === 0 && audit.remote.length === 0
    && audit.svg === 0 && audit.canvas === 0 && !audit.cssGradient && !audit.emoji,
  JSON.stringify(audit));
}

async function driveVoicePaths(browser) {
  const session = await openGame(browser, { width: 1024, height: 768 }, 'no-preference', false);
  const { page } = session;
  const inventory = await page.evaluate(async () => {
    const [lines, manifest] = await Promise.all([
      fetch('./assets/audio/lines.json').then((response) => response.json()),
      fetch('./assets/audio/manifest.json').then((response) => response.json()),
    ]);
    const hex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const broken = [];
    for (const [key, text] of Object.entries(lines)) {
      const entry = manifest[key];
      if (!entry?.file || !(entry.dur >= .25) || !entry.sha256 || !entry.textHash) {
        broken.push(`${key}: incomplete manifest entry`);
        continue;
      }
      const [clipResponse, textDigest] = await Promise.all([
        fetch(`./assets/audio/${entry.file}`),
        crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
      ]);
      if (!clipResponse.ok) {
        broken.push(`${key}: HTTP ${clipResponse.status}`);
        continue;
      }
      const clipDigest = await crypto.subtle.digest('SHA-256', await clipResponse.arrayBuffer());
      if (hex(clipDigest) !== entry.sha256 || hex(textDigest).slice(0, 16) !== entry.textHash) {
        broken.push(`${key}: checksum mismatch`);
      }
    }
    return {
      lines: Object.keys(lines).length,
      manifest: Object.keys(manifest).length,
      broken,
    };
  });
  check('recorded teacher manifest publishes all 49 checksum-bound local clips',
    inventory.lines === 49 && inventory.manifest === 49 && inventory.broken.length === 0,
  JSON.stringify(inventory));
  await page.locator('[data-target="sound"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog().some((entry) => entry.key === 'welcome'));
  const clipEvidence = await debug.getAudioLog(page);
  check('recorded teacher path selects the exact authored welcome clip',
    clipEvidence.some((entry) => entry.key === 'welcome'
      && entry.kind === 'clip'
      && entry.text === 'Welcome to Throwing Target Garden! Pick a garden game.'),
  JSON.stringify(clipEvidence.filter((entry) => entry.key === 'welcome')));

  await page.route('**/assets/audio/manifest.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{}',
  }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await debug.waitForHook(page);
  await debug.waitForReady(page);
  await page.locator('[data-target="sound"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog().some((entry) => (
    entry.key === 'welcome' && entry.kind === 'speech'
  )));
  const fallbackEvidence = await debug.getAudioLog(page);
  check('missing recorded manifest still fails closed to the exact authored welcome line',
    fallbackEvidence.some((entry) => entry.key === 'welcome'
      && entry.kind === 'speech'
      && entry.text === 'Welcome to Throwing Target Garden! Pick a garden game.'),
  JSON.stringify(fallbackEvidence.filter((entry) => entry.key === 'welcome')));
  await debug.mute(page, true);
  checkSessionClean(report, session, 'recorded voice and fallback');
  await session.close();
}

async function driveLandscape(browser) {
  const session = await openGame(browser, { width: 1024, height: 768 });
  const { page } = session;
  const modes = await debug.listModes(page);
  check('splash boots with all three concept-faithful modes',
    modes.map((mode) => mode.id).join(',') === 'number,color,sequence', JSON.stringify(modes));
  const splashCards = await page.locator('[data-role="mode"] > img').evaluateAll((images) => images.map((image) => ({
    src: image.getAttribute('src'),
    complete: image.complete,
    width: image.naturalWidth,
    height: image.naturalHeight,
  })));
  check('ready promise includes all three splash mode cards', splashCards.length === 3
    && splashCards.every((image) => image.complete && image.width > 1 && image.height > 1), JSON.stringify(splashCards));
  await checkTargets(page, 'splash');
  await assertLocalRasterWorld(page);
  await shot(page, '01-splash-landscape');

  await debug.tap(page, 'mode-color');
  const colorSelection = await debug.getState(page);
  const selectedColorCard = page.locator('[data-target="mode-color"]');
  check('visible Color Match card updates selection and START semantics',
    colorSelection.selectedMode === 'color'
      && await selectedColorCard.getAttribute('aria-pressed') === 'true'
      && /Color Match/i.test(await page.locator('[data-target="start"]').getAttribute('aria-label') || ''),
  JSON.stringify(colorSelection));
  await shot(page, '22-mode-color-selected-landscape');
  await debug.tap(page, 'mode-number');
  await debug.tap(page, 'start');
  await debug.waitForScreen(page, 'setup');
  check('visible mode selection and START enter the chosen setup', (await debug.getState(page)).mode === 'number');
  check('setup presents equal camera and Touch Toss routes',
    await page.locator('[data-target="camera"], [data-target="touch"]').count() === 2);
  check('privacy and safe-basket promise appears before permission',
    /never shown, recorded, saved, or uploaded/i.test(await page.locator('.safety-note').innerText()));
  await checkAuthoredCarrier(page, '.safety-note', 'safe setup note');
  await checkTargets(page, 'safe setup');
  await shot(page, '02-safe-setup-landscape');

  await debug.call(page, 'setCameraScenario', 'live');
  await debug.tap(page, 'camera');
  await debug.waitForScreen(page, 'ready');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().camera.status === 'live');
  check('camera-ready screen exposes no video or canvas preview',
    await page.locator('#screen-ready video, #screen-ready canvas').count() === 0);
  await checkAuthoredCarrier(page, '.privacy-note', 'camera privacy note');
  await checkTargets(page, 'camera ready');
  check('camera-ready guidance names two visited lanes without implying all three flowers are lit',
    /Visit any two flower lanes/i.test(await page.locator('.privacy-note').innerText()));
  check('camera-ready screen includes the authored safe basket cue',
    await page.locator('.ready-basket').evaluate((image) => image.complete && image.naturalWidth > 1));
  await shot(page, '03-camera-ready-landscape');
  await debug.call(page, 'calibrateLane', 'left');
  await debug.call(page, 'calibrateLane', 'right');
  await debug.waitForScreen(page, 'play');
  const cameraPlay = await debug.getState(page);
  check('two distinct coarse lanes unlock camera play', cameraPlay.inputPath === 'camera'
    && cameraPlay.calibrationLanes.join(',') === 'left,right');
  await checkTargets(page, 'number camera play');
  await checkBasketInsideViewport(page, '.camera-basket', 'number camera play');
  await shot(page, '04-number-play-camera');

  const missX = cameraPlay.target.x < .5 ? .96 : .04;
  await debug.fastTimers(page, 1);
  await debug.call(page, 'injectThrow', { x: missX, y: .5, color: 'blue', speed: 1, confidence: 1 });
  await page.locator('.target-button.try-again').waitFor({ state: 'visible' });
  await page.waitForTimeout(180);
  const numberRetryText = await page.locator('.prompt-plate > span').innerText();
  const numberRetryCue = await page.evaluate(() => ({
    feedback: window.QLOBE_DEBUG.getState().feedbackKind,
    ribbon: document.querySelector('[data-feedback-state="near-miss"]')?.textContent?.trim(),
    retryHere: document.querySelector('.target-button.is-current')?.dataset.retryLabel,
  }));
  check('near miss keeps a static lane cue visible for the retry dwell',
    numberRetryCue.feedback === 'near-miss'
      && /TRY THIS GARDEN LANE/i.test(numberRetryCue.ribbon || '')
      && numberRetryCue.retryHere === 'TRY HERE', JSON.stringify(numberRetryCue));
  await checkPromptStatusSeparation(page, 'Number retry');
  await shot(page, '23-number-near-miss-landscape');
  await debug.fastTimers(page, 50);
  await page.waitForFunction(() => {
    const state = window.QLOBE_DEBUG.getState();
    return state.lastResolution === 'near-miss' && state.awaitingInput;
  });
  check('clear side miss redirects visibly and gently without advancing',
    (await debug.getState(page)).round === 0 && /So close/i.test(numberRetryText), numberRetryText);
  await debug.winRound(page);
  await debug.waitForScreen(page, 'reward');
  await checkTargets(page, 'garden match reward');
  await waitForRewardLanding(page);
  await checkSafeReward(page, 'camera reward');
  await shot(page, '05-garden-match-landscape');

  await continueReward(page);
  await debug.waitForScreen(page, 'play');
  await debug.call(page, 'simulateCamera', 'lost');
  const lost = await debug.getState(page);
  check('lost camera becomes complete Touch Toss play', lost.inputPath === 'touch'
    && lost.awaitingInput && lost.camera.status === 'lost'
    && lost.fallbackNotice === 'camera-lost'
    && await page.locator('[data-fallback-notice="camera-lost"]').isVisible());
  await shot(page, '19-camera-lost-touch-toss');
  await debug.call(page, 'selectBag', 'blue');
  await debug.tap(page, 'target-main');
  await debug.waitForScreen(page, 'reward');
  check('tap beanbag then tap target reaches the shared reward path',
    (await debug.getState(page)).lastThrow.source === 'tap-target');
  await completeMode(page);
  await debug.waitForScreen(page, 'end');
  await checkTargets(page, 'number end');
  await checkAuthoredCarrier(page, '.end-message', 'garden end message');
  await checkSafeEnd(page, 'garden end');
  await shot(page, '06-garden-star-landscape');
  await debug.tap(page, 'back');
  await debug.waitForScreen(page, 'splash');

  await chooseTouch(page, 'color');
  const colorStart = await debug.getState(page);
  const bag = page.locator(`[data-target="bag-${colorStart.target.color}"]`);
  const target = page.locator('[data-target="target-main"]');
  const colorHeader = await page.evaluate(() => {
    const prompt = document.querySelector('.prompt-plate > span')?.getBoundingClientRect();
    const statuses = [...document.querySelectorAll('.play-status')].map((node) => node.getBoundingClientRect());
    const overlaps = prompt ? statuses.filter((rect) => !(rect.right <= prompt.left || rect.left >= prompt.right
      || rect.bottom <= prompt.top || rect.top >= prompt.bottom)).length : statuses.length;
    return prompt ? { prompt: { x: prompt.x, y: prompt.y, w: prompt.width, h: prompt.height }, overlaps } : null;
  });
  check('Color Match prompt stays clear of both status badges', colorHeader?.overlaps === 0,
    JSON.stringify(colorHeader));
  await shot(page, '16-color-match-before-throw');
  await debug.fastTimers(page, 1);
  await debug.tap(page, 'target-main');
  const noBagFeedback = await page.evaluate((correctColor) => ({
    round: window.QLOBE_DEBUG.getState().round,
    resolution: window.QLOBE_DEBUG.getState().lastResolution,
    targetNeedsBag: document.querySelector('[data-target="target-main"]')?.classList.contains('needs-bag'),
    correctBagHint: document.querySelector(`[data-color="${correctColor}"]`)?.classList.contains('hint-pulse'),
    feedback: window.QLOBE_DEBUG.getState().feedbackKind,
    ribbon: document.querySelector('[data-feedback-state="choose-a-bag"]')?.textContent?.trim(),
    retryHere: document.querySelector('[data-target="target-main"]')?.dataset.retryLabel,
  }), colorStart.target.color);
  check('tapping a target without a selected bag gives a hint and never throws',
    noBagFeedback.round === 0 && noBagFeedback.resolution === null
      && noBagFeedback.targetNeedsBag && noBagFeedback.correctBagHint
      && noBagFeedback.feedback === 'choose-a-bag'
      && /PICK A BAG/i.test(noBagFeedback.ribbon || '')
      && noBagFeedback.retryHere === 'TRY HERE',
  JSON.stringify(noBagFeedback));
  await shot(page, '32-color-no-bag-hint');
  const promptKey = colorStart.prompt;
  const promptCountBefore = (await debug.getAudioLog(page)).filter((entry) => entry.key === promptKey).length;
  await debug.mute(page, false);
  const hintTriggered = await debug.call(page, 'triggerHint');
  const idleFeedback = await page.evaluate((correctColor) => ({
    targetPulse: document.querySelector('.target-button.is-current')?.classList.contains('idle-pulse'),
    correctBagPulse: document.querySelector(`[data-color="${correctColor}"]`)?.classList.contains('hint-pulse'),
    feedback: window.QLOBE_DEBUG.getState().feedbackKind,
    ribbon: document.querySelector('[data-feedback-state="idle-hint"]')?.textContent?.trim(),
  }), colorStart.target.color);
  const promptCountAfter = (await debug.getAudioLog(page)).filter((entry) => entry.key === promptKey).length;
  await debug.mute(page, true);
  check('idle nudge repeats the prompt and pulses the target plus correct Color bag', hintTriggered
    && idleFeedback.targetPulse && idleFeedback.correctBagPulse
    && idleFeedback.feedback === 'idle-hint' && /YOUR TURN/i.test(idleFeedback.ribbon || '')
    && promptCountAfter === promptCountBefore + 1,
  JSON.stringify({ promptKey, promptCountBefore, promptCountAfter, idleFeedback }));
  await shot(page, '29-color-idle-hint');
  await debug.fastTimers(page, 50);

  const dragStart = await bag.boundingBox();
  await page.mouse.move(dragStart.x + dragStart.width / 2, dragStart.y + dragStart.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragStart.x + dragStart.width / 2 + 40, dragStart.y + dragStart.height / 2 - 20);
  await page.locator('.drag-sprite').waitFor({ state: 'attached' });
  const dragCue = await page.evaluate(() => ({
    label: document.querySelector('[data-touch-gesture] > span')?.textContent?.trim(),
    routeVisible: getComputedStyle(document.querySelector('.gesture-route')).opacity === '1',
    selected: document.querySelector('.touch-dock')?.dataset.selectedColor,
  }));
  check('drag flight retains a selected-color instruction and dotted route',
    dragCue.selected === colorStart.target.color
      && new RegExp(`DRAG ${colorStart.target.color}`, 'i').test(dragCue.label || '')
      && dragCue.routeVisible, JSON.stringify(dragCue));
  await shot(page, '33-touch-toss-drag-flight');
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', {
    pointerId: 1, pointerType: 'mouse', isPrimary: true,
  })));
  await page.mouse.up();
  check('pointer cancellation removes the drag sprite without scoring',
    await page.locator('.drag-sprite').count() === 0 && (await debug.getState(page)).round === 0);

  await page.mouse.move(dragStart.x + dragStart.width / 2, dragStart.y + dragStart.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragStart.x + dragStart.width / 2 + 40, dragStart.y + dragStart.height / 2 - 20);
  await page.locator('.drag-sprite').waitFor({ state: 'attached' });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
  check('window blur removes an in-flight drag without scoring',
    await page.locator('.drag-sprite').count() === 0 && (await debug.getState(page)).round === 0);

  await debug.call(page, 'selectBag', colorStart.target.color);
  const selectedGesture = await page.evaluate(() => ({
    label: document.querySelector('[data-touch-gesture] > span')?.textContent?.trim(),
    routeVisible: getComputedStyle(document.querySelector('.gesture-route')).opacity === '1',
  }));
  check('selected Touch Toss bag shows the next drag-and-flick gesture',
    new RegExp(`DRAG ${colorStart.target.color}.*FLICK`, 'i').test(selectedGesture.label || '')
      && selectedGesture.routeVisible, JSON.stringify(selectedGesture));
  await shot(page, '17-touch-toss-bag-selected');
  await dragBetween(page, await bag.boundingBox(), await target.boundingBox(), { steps: 12 });
  await debug.waitForScreen(page, 'reward');
  check('real window-tracked drag/flick reaches the shared reward path',
    (await debug.getState(page)).lastThrow.source === 'flick');
  await waitForRewardLanding(page);
  await checkSafeReward(page, 'drag reward');
  await shot(page, '07-color-reward-drag');
  await continueReward(page);
  await debug.waitForScreen(page, 'play');
  const colorRound = await debug.getState(page);
  const wrongColor = ['red', 'yellow', 'blue'].find((color) => color !== colorRound.target.color);
  await debug.call(page, 'selectBag', wrongColor);
  await debug.fastTimers(page, 1);
  await debug.call(page, 'injectThrow', {
    x: colorRound.target.x,
    y: .5,
    color: wrongColor,
    speed: 1,
    confidence: 1,
  });
  await page.locator('.target-button.try-again').waitFor({ state: 'visible' });
  await page.waitForTimeout(180);
  const colorRetryText = await page.locator('.prompt-plate > span').innerText();
  const colorRetryEvidence = await page.evaluate(({ correctColor, wrongColor }) => {
    const correctBag = document.querySelector(`[data-color="${correctColor}"]`);
    const wrongBag = document.querySelector(`[data-color="${wrongColor}"]`);
    return {
      correctBagHint: correctBag?.classList.contains('hint-pulse') || false,
      correctBagMatch: correctBag?.classList.contains('retry-match') || false,
      wrongBagSelected: wrongBag?.classList.contains('is-selected') || false,
      wrongBagPressed: wrongBag?.getAttribute('aria-pressed'),
      wrongBagLabel: wrongBag?.getAttribute('aria-label'),
      selectedColor: window.QLOBE_DEBUG.getState().selectedColor,
      feedback: window.QLOBE_DEBUG.getState().feedbackKind,
      ribbon: document.querySelector('[data-feedback-state="wrong-color"]')?.textContent?.trim(),
    };
  }, { correctColor: colorRound.target.color, wrongColor });
  await checkPromptStatusSeparation(page, 'Color retry');
  await shot(page, '18-wrong-color-warm-retry');
  await debug.fastTimers(page, 50);
  await page.waitForFunction(() => {
    const state = window.QLOBE_DEBUG.getState();
    return state.lastResolution === 'wrong-color' && state.awaitingInput;
  });
  check('wrong color gets a visible warm retry, correct-bag hint, and no round advance',
    (await debug.getState(page)).round === 1
      && /Nice toss/i.test(colorRetryText)
      && new RegExp(`looking for ${colorRound.target.color}`, 'i').test(colorRetryText)
      && colorRetryEvidence.correctBagHint
      && colorRetryEvidence.correctBagMatch
      && colorRetryEvidence.feedback === 'wrong-color'
      && new RegExp(`TRY ${colorRound.target.color}`, 'i').test(colorRetryEvidence.ribbon || '')
      && !colorRetryEvidence.wrongBagSelected
      && colorRetryEvidence.wrongBagPressed === 'false'
      && colorRetryEvidence.wrongBagLabel === `${wrongColor} beanbag; tap to select or drag in Touch Toss`
      && colorRetryEvidence.selectedColor === null,
  JSON.stringify({ colorRetryText, colorRetryEvidence }));
  const targetX = (await debug.getState(page)).target.x;
  const ignored = await debug.call(page, 'injectThrow', { x: targetX, y: .5, color: null, speed: 1, confidence: .2 });
  check('uncertain color is ignored rather than called wrong', ignored === false
    && (await debug.getState(page)).lastResolution === 'ignored');
  await completeMode(page);
  check('Color Match completes all five targets', (await debug.getState(page)).screen === 'end');
  await checkSafeEnd(page, 'Color Match end');
  await shot(page, '30-color-garden-star');
  await debug.tap(page, 'again');
  await debug.waitForScreen(page, 'setup');
  check('Play Again returns to setup for the same completed mode', (await debug.getState(page)).mode === 'color');
  await debug.tap(page, 'back');
  await debug.waitForScreen(page, 'splash');

  await chooseTouch(page, 'sequence');
  const sequence = await debug.getState(page);
  const wrongItem = sequence.target.items.find((item) => item.number !== sequence.target.expected);
  await debug.fastTimers(page, 1);
  await debug.call(page, 'injectThrow', { x: wrongItem.x, y: .5, color: 'blue', speed: 1, confidence: 1 });
  await page.locator('.target-button.try-again').waitFor({ state: 'visible' });
  await page.waitForTimeout(180);
  const sequenceRetryText = await page.locator('.prompt-plate > span').innerText();
  const sequenceRetryCue = await page.evaluate((wrongNumber) => ({
    feedback: window.QLOBE_DEBUG.getState().feedbackKind,
    attempted: window.QLOBE_DEBUG.getState().attemptedTarget,
    attemptedDom: document.querySelector(`[data-number="${wrongNumber}"]`)?.dataset.attempted,
    attemptedLabel: document.querySelector(`[data-number="${wrongNumber}"]`)?.dataset.attemptLabel,
    nextLabel: document.querySelector('.target-button.is-current')?.dataset.retryLabel,
    ribbon: document.querySelector('[data-feedback-state="wrong-sequence"]')?.textContent?.trim(),
  }), wrongItem.number);
  check('wrong-order retry distinguishes the tried numeral from the next numeral',
    sequenceRetryCue.feedback === 'wrong-sequence'
      && String(sequenceRetryCue.attempted) === String(wrongItem.number)
      && sequenceRetryCue.attemptedDom === 'true'
      && sequenceRetryCue.attemptedLabel === 'NICE TRY'
      && sequenceRetryCue.nextLabel === 'NEXT'
      && /TRAIL CLUE/i.test(sequenceRetryCue.ribbon || ''), JSON.stringify(sequenceRetryCue));
  await checkPromptStatusSeparation(page, 'Sequence retry');
  await shot(page, '24-sequence-wrong-order-landscape');
  await debug.fastTimers(page, 50);
  await page.waitForFunction(() => {
    const state = window.QLOBE_DEBUG.getState();
    return state.lastResolution === 'wrong-sequence' && state.awaitingInput;
  });
  check('wrong sequence position keeps every number visible and current step unchanged',
    (await debug.getState(page)).sequenceStep === 0
      && await page.locator('.target-button').count() === 3
      && /Which number comes next/i.test(sequenceRetryText), sequenceRetryText);
  await debug.winRound(page);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().sequenceStep === 1
    && window.QLOBE_DEBUG.getState().awaitingInput);
  const nextNumber = (await debug.getState(page)).target.expected;
  await debug.call(page, 'selectBag', 'blue');
  await debug.tap(page, `target-${nextNumber}`);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().sequenceStep === 2
    && window.QLOBE_DEBUG.getState().awaitingInput);
  const lastTrailState = await debug.getState(page);
  const lastTrailPrompt = await page.locator('.prompt-plate > span').innerText();
  const lastTrailProgress = await page.locator('.progress-status > span').innerText();
  const currentTrailTarget = await page.locator('.target-button.is-current').getAttribute('aria-label');
  check('last sequence prompt names trail order despite shuffled spatial lanes',
    /^Trail ends with (three|four|five)\.$/i.test(lastTrailPrompt)
      && currentTrailTarget === `Number ${lastTrailState.target.expected}, next in the trail`,
  JSON.stringify({ lastTrailPrompt, currentTrailTarget, items: lastTrailState.target.items }));
  check('sequence progress explicitly names the round rather than the current step',
    lastTrailProgress === `ROUND ${lastTrailState.round + 1} OF ${lastTrailState.roundsTotal}`,
  lastTrailProgress);
  await shot(page, '08-sequence-trail-landscape');
  await completeMode(page);
  check('Sequence Trail completes three trails of three', (await debug.getState(page)).screen === 'end');
  await checkSafeEnd(page, 'Sequence Trail end');
  await shot(page, '31-sequence-garden-star');
  await debug.tap(page, 'choose');
  await debug.waitForScreen(page, 'splash');
  check('Choose Another returns the completed mode to splash', (await debug.getState(page)).mode === null);

  const recoveryShots = {
    denied: '20-camera-recovery-touch-toss',
    unavailable: '34-camera-unavailable-touch-toss',
    error: '35-camera-error-touch-toss',
    late: '36-camera-late-touch-toss',
  };
  const recoveryExpected = {
    denied: { title: 'CAMERA STAYED OFF', reason: 'denied', status: /permission stayed off/i },
    unavailable: { title: 'NO CAMERA HERE', reason: 'unavailable', status: /No camera is available/i },
    error: { title: 'TRACKER NEEDS A REST', reason: 'error', status: /needs a rest/i },
    late: { title: 'CAMERA TOOK TOO LONG', reason: 'late', status: /taking too long/i },
  };
  for (const scenario of ['denied', 'unavailable', 'error', 'late']) {
    await debug.startMode(page, 'number');
    await debug.call(page, 'setCameraScenario', scenario);
    await debug.tap(page, 'camera');
    await debug.waitForScreen(page, 'ready');
    await page.waitForFunction((name) => {
      const camera = window.QLOBE_DEBUG.getState().camera;
      return name === 'denied' ? camera.status === 'denied'
        : name === 'error' ? camera.status === 'error' : camera.status === 'unavailable';
    }, scenario);
    check(`${scenario} camera path leaves Touch Toss available`,
      await page.locator('[data-target="ready-touch"]').isVisible());
    const recoveryCopy = await page.evaluate(() => ({
      title: document.querySelector('.ready-title > span')?.textContent?.trim(),
      guidance: document.querySelector('.privacy-note > span')?.textContent?.trim(),
      status: document.querySelector('[data-camera-message]')?.textContent?.trim(),
      reason: document.querySelector('.ready-layout')?.dataset.cameraFallbackReason,
      flipVisible: Boolean(document.querySelector('.flip-button')?.getClientRects().length),
    }));
    check(`${scenario} recovery presents one unambiguous Touch Toss route`,
      recoveryCopy.title === recoveryExpected[scenario].title
        && recoveryCopy.reason === recoveryExpected[scenario].reason
        && recoveryExpected[scenario].status.test(recoveryCopy.status || '')
        && /TOUCH TOSS/i.test(recoveryCopy.guidance || '')
        && !/\bwave\b/i.test(recoveryCopy.guidance || '')
        && !recoveryCopy.flipVisible,
    JSON.stringify(recoveryCopy));
    await shot(page, recoveryShots[scenario]);
    await debug.tap(page, 'back');
    await debug.waitForScreen(page, 'splash');
  }

  await debug.startMode(page, 'number');
  await debug.tap(page, 'back');
  await debug.waitForScreen(page, 'splash');
  check('setup back returns in-page to splash', (await debug.getState(page)).mode === null);
  await chooseTouch(page, 'number');
  await debug.tap(page, 'back');
  await debug.waitForScreen(page, 'splash');
  check('play back returns in-page to splash', (await debug.getState(page)).mode === null);

  checkSessionClean(report, session, 'landscape');
  await session.close();
}

async function driveSyntheticCameraCoverage(browser) {
  const trackerSession = await openSyntheticCameraGame(browser);
  const trackerPage = trackerSession.page;
  await enterLiveCamera(trackerPage, 'number');
  await calibrateIntoCameraPlay(trackerPage);
  const trackerStart = await debug.getState(trackerPage);
  check('real tracker gesture starts on the centered first Number target',
    trackerStart.inputPath === 'camera' && trackerStart.target.x === .5 && trackerStart.awaitingInput,
  JSON.stringify(trackerStart));
  await trackerPage.evaluate(() => globalThis.__TTG_MEDIA_QA.blank());
  await driveTrackedCameraThrow(trackerPage);
  await debug.waitForScreen(trackerPage, 'reward');
  const trackerReward = await debug.getState(trackerPage);
  check('moving and growing MediaStream pixels reach the real tracker scoring path',
    trackerReward.lastThrow?.source === 'camera'
      && trackerReward.lastThrow.color === 'red'
      && Math.abs(trackerReward.lastThrow.x - .5) < .03
      && trackerReward.lastThrow.speed > .52
      && trackerReward.lastResolution === 'hit',
  JSON.stringify(trackerReward.lastThrow));
  const trackerMedia = await syntheticMediaState(trackerPage);
  check('tracker-scored reward releases its real synthetic MediaStream track',
    trackerMedia.requests === 1 && trackerMedia.stops === 1 && trackerMedia.active === 0,
  JSON.stringify(trackerMedia));
  checkSessionClean(report, trackerSession, 'real tracker gesture integration');
  await trackerSession.close();

  const mappingSession = await openSyntheticCameraGame(browser);
  const mappingPage = mappingSession.page;
  await enterLiveCamera(mappingPage, 'number');
  await debug.tap(mappingPage, 'flip');
  await calibrateIntoCameraPlay(mappingPage);
  await holdStationaryCameraFrame(mappingPage);
  const stationaryState = await debug.getState(mappingPage);
  const stationaryMedia = await syntheticMediaState(mappingPage);
  check('stationary real MediaStream pixels never score the camera tracker',
    stationaryState.screen === 'play'
      && stationaryState.inputPath === 'camera'
      && stationaryState.camera.mirrored === false
      && stationaryState.awaitingInput
      && !stationaryState.inputLocked
      && stationaryState.round === 0
      && stationaryState.lastThrow === null
      && stationaryState.lastResolution === null
      && stationaryMedia.requests === 1
      && stationaryMedia.stops === 0
      && stationaryMedia.active === 1,
  JSON.stringify({ state: stationaryState, media: stationaryMedia }));
  await debug.winRound(mappingPage);
  await debug.waitForScreen(mappingPage, 'reward');
  await continueReward(mappingPage);
  await debug.waitForInput(mappingPage);
  const mappedStart = await debug.getState(mappingPage);
  check('flipped camera mapping persists into a non-center Number target',
    mappedStart.inputPath === 'camera'
      && mappedStart.camera.mirrored === false
      && mappedStart.target.x !== .5,
  JSON.stringify(mappedStart));
  await mappingPage.evaluate(() => globalThis.__TTG_MEDIA_QA.blank());
  await mappingPage.waitForTimeout(250);
  await driveMappedCameraThrow(mappingPage, mappedStart.target.x);
  await debug.waitForScreen(mappingPage, 'reward');
  const mappedReward = await debug.getState(mappingPage);
  check('unmirrored real MediaStream pixels score the corresponding side target',
    mappedReward.lastThrow?.source === 'camera'
      && mappedReward.camera.mirrored === false
      && Math.abs(mappedReward.lastThrow.x - mappedStart.target.x) < .03
      && mappedReward.lastThrow.speed > .52
      && mappedReward.lastResolution === 'hit',
  JSON.stringify({ targetX: mappedStart.target.x, throw: mappedReward.lastThrow }));
  const mappedMedia = await syntheticMediaState(mappingPage);
  check('both flipped-mapping camera rounds release exactly their owned tracks',
    mappedMedia.requests === 2 && mappedMedia.stops === 2 && mappedMedia.active === 0,
  JSON.stringify(mappedMedia));
  checkSessionClean(report, mappingSession, 'stationary and flipped tracker integration');
  await mappingSession.close();

  const interruptedSession = await openSyntheticCameraGame(browser);
  const interruptedPage = interruptedSession.page;
  await enterLiveCamera(interruptedPage, 'number');
  await calibrateIntoCameraPlay(interruptedPage);
  await interruptedPage.evaluate(() => globalThis.__TTG_MEDIA_QA.blank());
  await interruptedPage.waitForTimeout(250);
  await driveTrackedCameraThrow(interruptedPage);
  await interruptedPage.waitForFunction(() => {
    const state = window.QLOBE_DEBUG.getState();
    return state.lastThrow?.source === 'camera'
      && state.inputLocked
      && document.querySelector('.basket-landing-preview');
  });
  const inFlightState = await debug.getState(interruptedPage);
  check('real tracker throw enters its visual flight before track interruption',
    inFlightState.screen === 'play'
      && inFlightState.inputPath === 'camera'
      && inFlightState.inputLocked
      && !inFlightState.awaitingInput
      && inFlightState.lastResolution === null,
  JSON.stringify(inFlightState));
  const endedDispatched = await interruptedPage.evaluate(
    () => globalThis.__TTG_MEDIA_QA.endActiveTrack(),
  );
  await interruptedPage.waitForFunction(() => {
    const state = window.QLOBE_DEBUG.getState();
    return state.screen === 'play' && state.inputPath === 'touch' && state.awaitingInput;
  });
  await interruptedPage.waitForTimeout(650);
  const interruptedState = await debug.getState(interruptedPage);
  const interruptedDom = await interruptedPage.evaluate(() => ({
    flightPreviews: document.querySelectorAll('.basket-landing-preview').length,
    rewards: document.querySelectorAll('.reward-layout').length,
  }));
  const interruptedMedia = await syntheticMediaState(interruptedPage);
  check('track-ended during a real tracker flight falls back without a stale reward',
    endedDispatched
      && interruptedState.screen === 'play'
      && interruptedState.inputPath === 'touch'
      && interruptedState.awaitingInput
      && !interruptedState.inputLocked
      && interruptedState.round === 0
      && interruptedState.lastThrow?.source === 'camera'
      && interruptedState.lastResolution === null
      && interruptedDom.flightPreviews === 0
      && interruptedDom.rewards === 0
      && interruptedMedia.requests === 1
      && interruptedMedia.stops === 1
      && interruptedMedia.active === 0,
  JSON.stringify({ state: interruptedState, dom: interruptedDom, media: interruptedMedia }));
  checkSessionClean(report, interruptedSession, 'in-flight tracker interruption');
  await interruptedSession.close();

  const colorSession = await openSyntheticCameraGame(browser);
  const colorPage = colorSession.page;
  await enterLiveCamera(colorPage, 'color');
  const firstMedia = await syntheticMediaState(colorPage);
  check('Color camera path owns one real synthetic MediaStream track',
    firstMedia.requests === 1 && firstMedia.active === 1 && firstMedia.stops === 0,
  JSON.stringify(firstMedia));
  check('synthetic camera source remains off-DOM and child-invisible',
    await colorPage.locator('canvas').count() === 0 && await colorPage.locator('#screen-ready video').count() === 0);

  await debug.call(colorPage, 'calibrateLane', 'left');
  await debug.call(colorPage, 'calibrateLane', 'right');
  const beforeFlip = await debug.getState(colorPage);
  await debug.tap(colorPage, 'flip');
  const afterFlipImmediate = await debug.getState(colorPage);
  const flipMessage = await colorPage.locator('[data-camera-message]').innerText();
  await shot(colorPage, '26-camera-ready-flipped');
  await colorPage.waitForTimeout(150);
  const afterFlip = await debug.getState(colorPage);
  check('Flip cancels an in-flight calibration completion and clears its lanes',
    afterFlipImmediate.camera.mirrored !== beforeFlip.camera.mirrored
      && beforeFlip.calibrationLanes.length === 2
      && afterFlipImmediate.calibrationLanes.length === 0
      && afterFlip.screen === 'ready'
      && afterFlip.calibrationLanes.length <= 1
      && /left and right/i.test(flipMessage),
  JSON.stringify({ before: beforeFlip.camera.mirrored, after: afterFlipImmediate.camera.mirrored,
    beforeLanes: beforeFlip.calibrationLanes, immediateLanes: afterFlipImmediate.calibrationLanes,
    settledLanes: afterFlip.calibrationLanes, screen: afterFlip.screen, flipMessage }));
  await colorPage.waitForFunction(() => window.QLOBE_DEBUG.getState().prompt === 'camera-timeout');
  await colorPage.waitForTimeout(250);
  check('eight-second ready timeout is nonblocking and preserves Touch Toss',
    (await debug.getState(colorPage)).camera.status === 'live'
      && await colorPage.locator('[data-target="ready-touch"]').isVisible()
      && /Touch Toss/i.test(await colorPage.locator('[data-camera-message]').innerText()));
  await shot(colorPage, '25-camera-ready-timeout');

  await calibrateIntoCameraPlay(colorPage);
  check('Color Match enters play through the actual camera request path',
    (await debug.getState(colorPage)).inputPath === 'camera');
  await shot(colorPage, '27-color-camera-play');
  let colorState = await debug.getState(colorPage);
  const wrongColor = ['red', 'yellow', 'blue'].find((color) => color !== colorState.target.color);
  await debug.call(colorPage, 'injectThrow', {
    x: colorState.target.x, y: .5, color: wrongColor, speed: 1, confidence: 1,
  });
  await colorPage.waitForFunction(() => {
    const state = window.QLOBE_DEBUG.getState();
    return state.lastResolution === 'wrong-color' && state.awaitingInput;
  });
  check('camera-path wrong Color keeps the first round active',
    (await debug.getState(colorPage)).inputPath === 'camera' && (await debug.getState(colorPage)).round === 0);
  colorState = await debug.getState(colorPage);
  const ignoredColor = await debug.call(colorPage, 'injectThrow', {
    x: colorState.target.x, y: .5, color: null, speed: 1, confidence: .2,
  });
  check('camera-path low-confidence Color stays explicitly ignored', ignoredColor === false
    && (await debug.getState(colorPage)).lastResolution === 'ignored');
  await debug.winRound(colorPage);
  await debug.waitForScreen(colorPage, 'reward');
  const colorRewardMedia = await syntheticMediaState(colorPage);
  check('leaving Color camera play for reward releases the owned stream',
    colorRewardMedia.active === 0 && colorRewardMedia.requests === colorRewardMedia.stops,
  JSON.stringify(colorRewardMedia));
  await completeMode(colorPage);
  await debug.waitForScreen(colorPage, 'end');
  const colorEndMedia = await syntheticMediaState(colorPage);
  check('all five Color camera rounds replace and finally stop every track',
    colorEndMedia.requests === 5 && colorEndMedia.stops === 5 && colorEndMedia.active === 0,
  JSON.stringify(colorEndMedia));
  await debug.tap(colorPage, 'choose');
  await debug.waitForScreen(colorPage, 'splash');
  checkSessionClean(report, colorSession, 'Color camera integration');
  await colorSession.close();

  const sequenceSession = await openSyntheticCameraGame(browser);
  const sequencePage = sequenceSession.page;
  await enterLiveCamera(sequencePage, 'sequence');
  await calibrateIntoCameraPlay(sequencePage);
  check('Sequence Trail enters play through the actual camera request path',
    (await debug.getState(sequencePage)).inputPath === 'camera');
  await shot(sequencePage, '28-sequence-camera-play');
  const sequenceState = await debug.getState(sequencePage);
  const wrongItem = sequenceState.target.items.find((item) => item.number !== sequenceState.target.expected);
  await debug.call(sequencePage, 'injectThrow', {
    x: wrongItem.x, y: .5, color: 'blue', speed: 1, confidence: 1,
  });
  await sequencePage.waitForFunction(() => {
    const state = window.QLOBE_DEBUG.getState();
    return state.lastResolution === 'wrong-sequence' && state.awaitingInput;
  });
  check('camera-path wrong sequence preserves step zero',
    (await debug.getState(sequencePage)).inputPath === 'camera'
      && (await debug.getState(sequencePage)).sequenceStep === 0);
  await completeMode(sequencePage);
  await debug.waitForScreen(sequencePage, 'end');
  const sequenceEndMedia = await syntheticMediaState(sequencePage);
  check('all three Sequence camera trails replace and finally stop every track',
    sequenceEndMedia.requests === 3 && sequenceEndMedia.stops === 3 && sequenceEndMedia.active === 0,
  JSON.stringify(sequenceEndMedia));
  await debug.tap(sequencePage, 'choose');
  await debug.waitForScreen(sequencePage, 'splash');
  checkSessionClean(report, sequenceSession, 'Sequence camera integration');
  await sequenceSession.close();

  const lifecycleSession = await openSyntheticCameraGame(browser);
  const lifecyclePage = lifecycleSession.page;
  await enterLiveCamera(lifecyclePage, 'number');
  await debug.tap(lifecyclePage, 'ready-touch');
  await debug.waitForScreen(lifecyclePage, 'play');
  let lifecycleMedia = await syntheticMediaState(lifecyclePage);
  check('switching from Camera to Touch Toss stops the owned track',
    (await debug.getState(lifecyclePage)).inputPath === 'touch'
      && lifecycleMedia.active === 0 && lifecycleMedia.stops === lifecycleMedia.requests,
  JSON.stringify(lifecycleMedia));
  await debug.tap(lifecyclePage, 'back');
  await debug.waitForScreen(lifecyclePage, 'splash');

  await enterLiveCamera(lifecyclePage, 'number');
  await calibrateIntoCameraPlay(lifecyclePage);
  await debug.tap(lifecyclePage, 'back');
  await debug.waitForScreen(lifecyclePage, 'splash');
  lifecycleMedia = await syntheticMediaState(lifecyclePage);
  const afterCameraBack = await debug.getState(lifecyclePage);
  check('Back from live camera play stops tracks and clears coarse camera state',
    lifecycleMedia.active === 0 && lifecycleMedia.stops === lifecycleMedia.requests
      && afterCameraBack.calibrationLanes.length === 0
      && afterCameraBack.camera.state === 'idle'
      && afterCameraBack.camera.blob === null
      && afterCameraBack.camera.lastThrow === null
      && afterCameraBack.lastThrow === null
      && afterCameraBack.lastResolution === null,
  JSON.stringify({ media: lifecycleMedia, state: afterCameraBack }));

  await enterLiveCamera(lifecyclePage, 'number');
  await calibrateIntoCameraPlay(lifecyclePage);
  await debug.fastTimers(lifecyclePage, 1);
  const retryState = await debug.getState(lifecyclePage);
  const retryMissX = retryState.target.x < .5 ? .96 : .04;
  await debug.call(lifecyclePage, 'injectThrow', {
    x: retryMissX, y: .5, color: 'blue', speed: 1, confidence: 1,
  });
  await lifecyclePage.locator('.target-button.try-again').waitFor({ state: 'visible' });
  await debug.call(lifecyclePage, 'simulateCamera', 'lost');
  const fallbackImmediate = await debug.getState(lifecyclePage);
  const fallbackImmediateDom = await lifecyclePage.evaluate(() => ({
    guidance: document.querySelectorAll('#screen-play .prompt-plate.is-guidance').length,
    retryTargets: document.querySelectorAll('#screen-play .target-button.try-again').length,
    prompt: document.querySelector('#screen-play .prompt-plate > span')?.textContent?.trim(),
    fallbackNotice: document.querySelector('[data-fallback-notice="camera-lost"]')?.textContent?.trim(),
    feedbackRibbons: document.querySelectorAll('#screen-play .feedback-ribbon:not([hidden])').length,
  }));
  await lifecyclePage.waitForTimeout(900);
  const fallbackSettled = await debug.getState(lifecyclePage);
  const fallbackSettledDom = await lifecyclePage.evaluate(() => ({
    guidance: document.querySelectorAll('#screen-play .prompt-plate.is-guidance').length,
    retryTargets: document.querySelectorAll('#screen-play .target-button.try-again').length,
    prompt: document.querySelector('#screen-play .prompt-plate > span')?.textContent?.trim(),
    fallbackNotice: document.querySelector('[data-fallback-notice="camera-lost"]')?.textContent?.trim(),
    feedbackRibbons: document.querySelectorAll('#screen-play .feedback-ribbon:not([hidden])').length,
  }));
  check('camera loss cancels a pending retry before replacing it with one clean Touch Toss hint schedule',
    fallbackImmediate.inputPath === 'touch'
      && fallbackImmediate.awaitingInput
      && fallbackImmediate.fallbackNotice === 'camera-lost'
      && fallbackImmediate.pendingTimers === 1
      && fallbackSettled.pendingTimers === 1
      && fallbackSettled.prompt === fallbackImmediate.prompt
      && fallbackImmediateDom.guidance === 0
      && fallbackImmediateDom.retryTargets === 0
      && fallbackImmediateDom.feedbackRibbons === 0
      && /CAMERA RESTING.*TOUCH TOSS/i.test(fallbackImmediateDom.fallbackNotice || '')
      && fallbackSettledDom.guidance === 0
      && fallbackSettledDom.retryTargets === 0
      && fallbackSettledDom.feedbackRibbons === 0
      && /CAMERA RESTING.*TOUCH TOSS/i.test(fallbackSettledDom.fallbackNotice || '')
      && fallbackSettledDom.prompt === fallbackImmediateDom.prompt,
  JSON.stringify({ fallbackImmediate, fallbackImmediateDom, fallbackSettled, fallbackSettledDom }));
  await shot(lifecyclePage, '37-camera-loss-clears-retry');
  await debug.fastTimers(lifecyclePage, 10);
  await debug.tap(lifecyclePage, 'back');
  await debug.waitForScreen(lifecyclePage, 'splash');

  await enterLiveCamera(lifecyclePage, 'number');
  await calibrateIntoCameraPlay(lifecyclePage);
  await lifecyclePage.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await lifecyclePage.waitForFunction(() => window.QLOBE_DEBUG.getState().inputPath === 'touch');
  lifecycleMedia = await syntheticMediaState(lifecyclePage);
  check('hidden document releases the track and falls back to playable Touch Toss',
    lifecycleMedia.active === 0 && lifecycleMedia.stops === lifecycleMedia.requests
      && (await debug.getState(lifecyclePage)).awaitingInput,
  JSON.stringify(lifecycleMedia));
  await lifecyclePage.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });
  await debug.tap(lifecyclePage, 'back');
  await debug.waitForScreen(lifecyclePage, 'splash');

  await enterLiveCamera(lifecyclePage, 'number');
  await lifecyclePage.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await lifecyclePage.waitForFunction(() => globalThis.__TTG_MEDIA_QA.active === 0);
  lifecycleMedia = await syntheticMediaState(lifecyclePage);
  check('pagehide cleanup stops the final track exactly once',
    lifecycleMedia.active === 0 && lifecycleMedia.stops === lifecycleMedia.requests,
  JSON.stringify(lifecycleMedia));
  checkSessionClean(report, lifecycleSession, 'camera lifecycle integration');
  await lifecycleSession.close();
}

async function drivePortrait(browser) {
  const session = await openGame(browser, { width: 820, height: 1180 });
  const { page } = session;
  await checkTargets(page, 'portrait splash');
  await checkTargetsInsideViewport(page, 'portrait splash');
  await checkSplashSeparation(page, 'portrait splash');
  await shot(page, '09-splash-portrait');
  await debug.startMode(page, 'sequence');
  await debug.waitForScreen(page, 'setup');
  await shot(page, '10-setup-portrait');
  await debug.call(page, 'setCameraScenario', 'live');
  await debug.tap(page, 'camera');
  await debug.waitForScreen(page, 'ready');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().camera.status === 'live');
  await shot(page, '21-camera-ready-portrait');
  await debug.tap(page, 'ready-touch');
  await debug.waitForScreen(page, 'play');
  await checkTargets(page, 'portrait sequence play');
  await checkPlayChromeSeparation(page, 'portrait sequence play');
  await checkBasketInsideViewport(page, '.basket-art', 'portrait sequence play');
  const bounds = await debug.getTargets(page);
  check('portrait targets remain within the viewport', bounds.every(({ rect }) => rect.x >= -1
    && rect.y >= -1 && rect.x + rect.w <= 821 && rect.y + rect.h <= 1181), JSON.stringify(bounds));
  await shot(page, '11-sequence-play-portrait');
  await debug.winRound(page);
  await page.waitForFunction(() => {
    const state = window.QLOBE_DEBUG.getState();
    return state.sequenceStep === 1 && state.awaitingInput && !state.inputLocked;
  });
  await debug.winRound(page);
  await page.waitForFunction(() => {
    const state = window.QLOBE_DEBUG.getState();
    return state.sequenceStep === 2 && state.awaitingInput && !state.inputLocked;
  });
  await debug.winRound(page);
  await debug.waitForScreen(page, 'reward');
  await waitForRewardLanding(page);
  await checkSafeReward(page, 'portrait reward');
  await shot(page, '12-reward-portrait');
  checkSessionClean(report, session, 'portrait');
  await session.close();
}

async function driveWideAndReduced(browser) {
  const wide = await openGame(browser, { width: 1366, height: 600 });
  await checkTargets(wide.page, 'wide-short splash');
  await checkTargetsInsideViewport(wide.page, 'wide-short splash');
  await checkSplashSeparation(wide.page, 'wide-short splash');
  await checkModeLabelsInsideCards(wide.page, 'wide-short splash');
  await shot(wide.page, '13-splash-wide-short');
  await chooseTouch(wide.page, 'number');
  await checkBasketInsideViewport(wide.page, '.basket-art', 'wide-short play');
  await shot(wide.page, '14-number-play-wide-short');
  await checkTargets(wide.page, 'wide-short play');
  checkSessionClean(report, wide, 'wide-short');
  await wide.close();

  const reduced = await openGame(browser, { width: 1024, height: 768 }, 'reduce');
  await chooseTouch(reduced.page, 'color');
  await debug.winRound(reduced.page);
  await debug.waitForScreen(reduced.page, 'reward');
  const motion = await reduced.page.evaluate(() => getComputedStyle(document.querySelector('.landed-bag')).animationDuration);
  check('reduced motion keeps the reward state while collapsing animation', parseFloat(motion) <= .01, motion);
  await waitForRewardLanding(reduced.page);
  await checkSafeReward(reduced.page, 'reduced-motion reward');
  await shot(reduced.page, '15-reward-reduced-motion');
  await debug.tap(reduced.page, 'back');
  await debug.waitForScreen(reduced.page, 'splash');
  check('reward Back returns in-page to splash and clears the active mode',
    (await debug.getState(reduced.page)).mode === null);
  checkSessionClean(report, reduced, 'reduced-motion');
  await reduced.close();
}

async function driveCompactResponsive(browser) {
  const compact = await openGame(browser, { width: 375, height: 667 });
  const page = compact.page;
  await checkTargets(page, 'compact portrait splash');
  await checkTargetsInsideViewport(page, 'compact portrait splash');
  await checkSplashSeparation(page, 'compact portrait splash');
  await checkElementsInsideViewport(page,
    ['#screen-splash .title-lockup', '#screen-splash .mode-shelf', '#screen-splash .main-action'],
    'compact portrait splash');
  await checkElementsSeparated(page,
    ['#screen-splash .qk-hud-home', '#screen-splash .qk-hud-sound', '#screen-splash .title-lockup'],
    'compact portrait splash header');
  await shot(page, '38-compact-splash-portrait');

  await debug.startMode(page, 'number');
  await debug.waitForScreen(page, 'setup');
  await checkTargets(page, 'compact portrait setup');
  await checkTargetsInsideViewport(page, 'compact portrait setup');
  await checkElementsInsideViewport(page,
    ['#screen-setup .setup-title', '#screen-setup .setup-art', '#screen-setup .path-choices', '#screen-setup .safety-note'],
    'compact portrait setup');
  await checkCompactSafetyDisclosure(page);
  await shot(page, '39-compact-setup-portrait');

  await debug.call(page, 'setCameraScenario', 'live');
  await debug.tap(page, 'camera');
  await debug.waitForScreen(page, 'ready');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().camera.status === 'live');
  await checkTargets(page, 'compact portrait camera ready');
  await checkTargetsInsideViewport(page, 'compact portrait camera ready');
  await checkElementsInsideViewport(page,
    ['#screen-ready .ready-title', '#screen-ready .tracker-badge', '#screen-ready .compass-wrap',
      '#screen-ready .ready-actions', '#screen-ready .privacy-note'],
    'compact portrait camera ready');
  await shot(page, '40-compact-camera-ready-portrait');

  await debug.tap(page, 'ready-touch');
  await debug.waitForScreen(page, 'play');
  await debug.waitForInput(page);
  await checkTargets(page, 'compact portrait play');
  await checkTargetsInsideViewport(page, 'compact portrait play');
  await checkElementsInsideViewport(page,
    ['#screen-play .tracking-status', '#screen-play .progress-status', '#screen-play .prompt-plate',
      '#screen-play .target-field', '#screen-play .touch-dock'],
    'compact portrait play');
  await checkElementsSeparated(page,
    ['#screen-play .qk-hud-back', '#screen-play .qk-hud-sound', '#screen-play .tracking-status',
      '#screen-play .progress-status', '#screen-play .prompt-plate'],
    'compact portrait play header');
  await checkBasketInsideViewport(page, '.basket-art', 'compact portrait play');
  await shot(page, '41-compact-number-play-portrait');

  await debug.winRound(page);
  await debug.waitForScreen(page, 'reward');
  await waitForRewardLanding(page);
  await checkSafeReward(page, 'compact portrait reward');
  await checkTargets(page, 'compact portrait reward');
  await checkTargetsInsideViewport(page, 'compact portrait reward');
  await checkElementsInsideViewport(page,
    ['#screen-reward .garden-match-lockup', '#screen-reward .reward-progress',
      '#screen-reward .reward-recognition', '#screen-reward .reward-basket', '#screen-reward .reward-next'],
    'compact portrait reward');
  await checkElementsSeparated(page,
    ['#screen-reward .garden-match-lockup', '#screen-reward .reward-progress', '#screen-reward .reward-next'],
    'compact portrait reward chrome');
  await shot(page, '42-compact-reward-portrait');

  await completeMode(page);
  await debug.waitForScreen(page, 'end');
  await checkSafeEnd(page, 'compact portrait end');
  await checkTargets(page, 'compact portrait end');
  await checkTargetsInsideViewport(page, 'compact portrait end');
  await checkElementsInsideViewport(page,
    ['#screen-end .end-title', '#screen-end .end-basket', '#screen-end .end-message', '#screen-end .end-actions'],
    'compact portrait end');
  await checkElementsSeparated(page,
    ['#screen-end .end-title', '#screen-end .end-basket', '#screen-end .end-message', '#screen-end .end-actions'],
    'compact portrait end');
  await shot(page, '43-compact-garden-star-portrait');
  checkSessionClean(report, compact, 'compact portrait');
  await compact.close();

  const short = await openGame(browser, { width: 844, height: 390 });
  await chooseTouch(short.page, 'number');
  await completeMode(short.page);
  await debug.waitForScreen(short.page, 'end');
  await checkSafeEnd(short.page, 'compact landscape end');
  await checkTargets(short.page, 'compact landscape end');
  await checkTargetsInsideViewport(short.page, 'compact landscape end');
  await checkElementsInsideViewport(short.page,
    ['#screen-end .end-title', '#screen-end .end-basket', '#screen-end .end-message', '#screen-end .end-actions'],
    'compact landscape end');
  await checkElementsSeparated(short.page,
    ['#screen-end .end-title', '#screen-end .end-basket', '#screen-end .end-message', '#screen-end .end-actions'],
    'compact landscape end');
  await shot(short.page, '44-compact-garden-star-landscape');
  checkSessionClean(report, short, 'compact landscape');
  await short.close();
}

async function checkHubIntegration(browser) {
  const hub = await openSession(browser, {
    url: `${base}/#movement-outdoor`,
    base,
    viewport: { width: 1180, height: 820 },
    ready: false,
    // The platform hub intentionally owns analytics; this game gate verifies
    // only its tile, local launch, and page-error-free transition. Every game
    // session below retains the strict zero-remote-request assertions.
    captureRequestFailures: false,
    captureResponses: false,
    captureRemote: false,
  });
  try {
    const tile = hub.page.locator('a[href="games/throwing-target-garden/"]');
    await tile.waitFor({ state: 'visible' });
    const evidence = await tile.evaluate((node) => {
      const image = node.querySelector('.tile-art > img');
      return {
        label: node.getAttribute('aria-label'),
        title: node.querySelector('.tile-label')?.textContent?.trim(),
        beta: node.querySelector('.tile-beta')?.textContent?.trim(),
        imageReady: Boolean(image?.complete && image.naturalWidth === 640 && image.naturalHeight === 533),
        imagePath: image ? new URL(image.currentSrc || image.src).pathname : null,
      };
    });
    check('hub lists the beta game with its validated 640×533 raster tile',
      evidence.title === 'Throwing Target Garden'
        && /in progress/i.test(evidence.label || '')
        && /in progress/i.test(evidence.beta || '')
        && evidence.imageReady
        && evidence.imagePath?.endsWith('/assets/hub/tiles/throwing-target-garden.jpg'),
      JSON.stringify(evidence));

    await Promise.all([
      hub.page.waitForURL((url) => url.pathname.endsWith('/games/throwing-target-garden/')),
      tile.click(),
    ]);
    await debug.waitForHook(hub.page);
    await debug.waitForReady(hub.page);
    const state = await debug.getState(hub.page);
    check('hub tile launches the real game at its splash screen',
      state.screen === 'splash' && state.mode === null, JSON.stringify(state));
    await Promise.all([
      hub.page.waitForURL((url) => url.pathname === '/' || url.pathname.endsWith('/qlobe-kids/')),
      hub.page.locator('[data-target="home"]').click(),
    ]);
    const category = hub.page.locator('#carousel .slide-cat .tile-big').first();
    await category.waitFor({ state: 'visible' });
    check('splash Home returns to the real hub catalog',
      await category.isVisible()
        && await hub.page.locator('.wordmark[alt="QLOBE Kids"]').isVisible()
        && hub.page.url().startsWith(`${base}/`), hub.page.url());
    check('hub-to-game transition has no page errors', hub.errors.length === 0, hub.errors.join(' | '));
  } finally {
    await hub.close();
  }
}

async function checkSharedCameraModule(browser) {
  const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
  const page = await context.newPage();
  await page.goto(`${base}/shared/js/camera-throw.test.html`);
  await page.waitForFunction(() => /camera-throw$/.test(document.title));
  const result = await page.evaluate(() => ({
    status: document.title.startsWith('PASS') ? 'pass' : 'fail',
    output: document.querySelector('#out').innerText,
  }));
  check('shared throw tracker passes synthetic color, motion, cooldown, denial, and late-grant tests',
    result.status === 'pass', result.output);
  await context.close();
}

async function main() {
  await persistQaReport({ completed: false, status: 'running', screenshots: 0 });
  let browser = null;
  let flowsCompleted = false;
  let closeCompleted = false;
  let fatal = null;
  try {
    if (injectedFailure === 'shots') throw new Error('injected ensureShots failure');
    await ensureShots(shots);
    if (injectedFailure === 'launch') throw new Error('injected Chrome launch failure');
    if (injectedFailure === 'close') {
      browser = { close: async () => { throw new Error('injected browser.close failure'); } };
    } else {
      browser = await launchChrome();
      await checkHubIntegration(browser);
      await checkSharedCameraModule(browser);
      await driveVoicePaths(browser);
      await driveLandscape(browser);
      await driveSyntheticCameraCoverage(browser);
      await drivePortrait(browser);
      await driveCompactResponsive(browser);
      await driveWideAndReduced(browser);
      const missingScreenshots = expectedScreenshotNames.filter((name) => !capturedScreenshots.has(name));
      check('QA writes the exact unique 44-screenshot acceptance set',
        capturedScreenshots.size === expectedScreenshots && missingScreenshots.length === 0,
      JSON.stringify({ captured: capturedScreenshots.size, missingScreenshots }));
      const diskScreenshotNames = (await readdir(shots, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
        .map((entry) => entry.name.replace(/\.png$/i, ''))
        .sort();
      const expectedDiskNames = [...expectedScreenshotNames].sort();
      const missingOnDisk = expectedDiskNames.filter((name) => !diskScreenshotNames.includes(name));
      const extraOnDisk = diskScreenshotNames.filter((name) => !expectedScreenshotSet.has(name));
      check('QA output directory contains exactly the canonical 44 PNG files',
        diskScreenshotNames.length === expectedDiskNames.length
          && missingOnDisk.length === 0 && extraOnDisk.length === 0,
      JSON.stringify({ disk: diskScreenshotNames.length, missingOnDisk, extraOnDisk }));
      flowsCompleted = true;
    }
  } catch (error) {
    fatal = error;
    check('QA driver completes without an exception', false, error.message);
  } finally {
    if (browser) {
      try {
        await browser.close();
        closeCompleted = true;
      } catch (error) {
        fatal ||= error;
        check('QA browser closes cleanly', false, error.message);
      }
    }
    note('Recorded teacher batch published 49/49 after explicit authorization; this run exercises the checksum-bound clip manifest and the fail-closed Web Speech fallback.');
    const failed = report.failures();
    const completed = flowsCompleted && closeCompleted && !fatal;
    await persistQaReport({
      completed,
      status: completed && failed.length === 0 ? 'pass' : 'fail',
      screenshots: capturedScreenshots.size,
      error: fatal,
    });
    finish({ suffix: `; shots in ${shots}` });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
