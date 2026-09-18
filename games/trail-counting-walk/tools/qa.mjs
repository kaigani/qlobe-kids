#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  args, audio, baseUrl, checkSessionClean, createReporter, debug, ensureShots,
  launchChrome, openSession, resolveShots, shooter, targetSizes, undersized,
} from '../../../tools/qa/lib/driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..');
const BASE = baseUrl();
const GAME_URL = `${BASE}/games/trail-counting-walk/`;
const SHOTS = await ensureShots(resolveShots(path.join(GAME, 'qa-shots')));
const shot = shooter(SHOTS);
const { check, finish } = createReporter({ style: 'pad' });
const modeIds = ['count-5', 'count-10', 'count-20'];
const analytics = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];

function open(browser, viewport, reducedMotion = 'no-preference', context = {}) {
  return openSession(browser, {
    url: GAME_URL,
    base: BASE,
    viewport,
    reducedMotion,
    context,
    fastTimers: 20,
    allowAbortedMedia: true,
    allowRemote: analytics,
  });
}

function checkClean(session, label) {
  const kept = session.failed.filter((entry) => !analytics.some((prefix) => entry.startsWith(prefix)));
  session.failed.splice(0, session.failed.length, ...kept);
  checkSessionClean({ check }, session, label);
}

async function auditControls(page, selector, label) {
  const sizes = await targetSizes(page, selector);
  const small = undersized(sizes, 96);
  check(`${label} targets are at least 96px`, sizes.length > 0 && small.length === 0, JSON.stringify({ sizes, small }));
}

async function waitForEarnedStars(page, expected) {
  await page.waitForFunction((count) => {
    const stars = [...document.querySelectorAll('#earned-stars img')];
    return stars.length === count && stars.every((star) => (
      Number.parseFloat(getComputedStyle(star).opacity) >= .99
        && star.getAnimations().every((animation) => animation.playState === 'finished')
    ));
  }, expected, { timeout: 4000 });
}

async function auditEndLabels(page, label) {
  const labels = await page.locator('.paper-action span').evaluateAll((nodes) => nodes.map((node) => ({
    text: node.textContent.trim(),
    opacity: getComputedStyle(node).opacity,
    visibility: getComputedStyle(node).visibility,
    zIndex: getComputedStyle(node).zIndex,
  })));
  check(`${label} keeps both action labels painted above their raster buttons`,
    labels.length === 2 && labels.every((item) => item.text && item.opacity === '1' && item.visibility === 'visible' && Number(item.zIndex) > 1),
    JSON.stringify(labels));
}

async function auditActiveCue(page, label) {
  const cue = await page.locator('.trail-stone.is-active').evaluate((stone) => {
    const mat = stone.querySelector('.stone-active-mat');
    const stoneRect = stone.getBoundingClientRect();
    const matRect = mat.getBoundingClientRect();
    const stoneStyle = getComputedStyle(stone);
    const matStyle = getComputedStyle(mat);
    return {
      outlineWidth: Number.parseFloat(stoneStyle.outlineWidth),
      matOpacity: Number.parseFloat(matStyle.opacity),
      matFilter: matStyle.filter,
      matScale: Math.min(matRect.width / stoneRect.width, matRect.height / stoneRect.height),
    };
  });
  check(`${label} uses the authored leaf mat without a normal neon outline`,
    cue.outlineWidth === 0 && cue.matOpacity >= .85 && cue.matFilter !== 'none' && cue.matScale >= 1.45,
    JSON.stringify(cue));

  await page.locator('.trail-stone.is-active').focus();
  const focused = await page.locator('.trail-stone.is-active').evaluate((stone) => {
    const style = getComputedStyle(stone);
    return {
      focused: stone.matches(':focus-visible'),
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineStyle: style.outlineStyle,
      outlineColor: style.outlineColor,
    };
  });
  check(`${label} reserves a high-contrast outline for focus-visible`,
    focused.focused && focused.outlineWidth >= 6 && focused.outlineStyle === 'solid',
    JSON.stringify(focused));
  await page.evaluate(() => document.activeElement?.blur());
}

async function auditEndLayout(page, label, segments, columns) {
  const layout = await page.evaluate(({ expectedSegments, expectedColumns }) => {
    const rect = (node) => {
      const value = node.getBoundingClientRect();
      return { x: value.x, y: value.y, w: value.width, h: value.height, right: value.right, bottom: value.bottom };
    };
    const groups = [...document.querySelectorAll('.star-segment')].map(rect);
    const stars = [...document.querySelectorAll('.star-segment img')].map(rect);
    const ranges = [...document.querySelectorAll('.star-range')].map((node) => ({
      ...rect(node),
      text: node.textContent.trim(),
      opacity: Number.parseFloat(getComputedStyle(node).opacity),
      visibility: getComputedStyle(node).visibility,
    }));
    const actions = [...document.querySelectorAll('.paper-action')].map(rect);
    const title = rect(document.querySelector('.end-copy'));
    const viewport = { w: innerWidth, h: innerHeight };
    const inside = (value) => value.x >= -.5 && value.y >= -.5 && value.right <= viewport.w + .5 && value.bottom <= viewport.h + .5;
    const overlaps = (a, b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
    const centers = (items, axis) => {
      const values = items.map((item) => axis === 'x' ? item.x + item.w / 2 : item.y + item.h / 2).sort((a, b) => a - b);
      return values.reduce((buckets, value) => {
        if (!buckets.length || Math.abs(value - buckets.at(-1)) > 10) buckets.push(value);
        return buckets;
      }, []);
    };
    const pairs = [];
    for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) pairs.push([groups[i], groups[j]]);
    }
    const separated = pairs.every(([a, b]) => {
      if (overlaps(a, b)) return false;
      const sameRow = Math.abs((a.y + a.h / 2) - (b.y + b.h / 2)) <= 10;
      const sameColumn = Math.abs((a.x + a.w / 2) - (b.x + b.w / 2)) <= 10;
      const horizontalGap = Math.max(b.x - a.right, a.x - b.right);
      const verticalGap = Math.max(b.y - a.bottom, a.y - b.bottom);
      if (sameRow) return horizontalGap >= 24;
      if (sameColumn) return verticalGap >= 10;
      return horizontalGap >= 24 || verticalGap >= 10;
    });
    const noUiCollisions = groups.every((group) => !overlaps(group, title) && actions.every((action) => !overlaps(group, action)));
    const expectedRanges = Array.from({ length: expectedSegments }, (_, index) => `${index * 5 + 1}\u2013${index * 5 + 5}`);
    const rangesInsideGroups = ranges.every((range, index) => {
      const group = groups[index];
      return group
        && range.x >= group.x - .5
        && range.right <= group.right + .5
        && range.y >= group.y - .5
        && range.bottom <= group.bottom + .5;
    });
    const rangesClearStars = ranges.every((range, index) => (
      stars.slice(index * 5, index * 5 + 5).every((star) => !overlaps(range, star))
    ));
    return {
      expectedSegments,
      groups: groups.length,
      stars: stars.length,
      columns: centers(groups, 'x').length,
      rows: centers(groups, 'y').length,
      expectedColumns,
      expectedRows: Math.ceil(expectedSegments / expectedColumns),
      separated,
      allInside: [...groups, ...stars, ...actions].every(inside),
      actionsLarge: actions.length === 2 && actions.every((action) => action.w >= 96 && action.h >= 96),
      actionsSeparate: actions.length === 2 && !overlaps(actions[0], actions[1]),
      noUiCollisions,
      ranges: ranges.map(({ text, opacity, visibility }) => ({ text, opacity, visibility })),
      expectedRanges,
      rangesInsideGroups,
      rangesClearStars,
      groupRects: groups,
      actionRects: actions,
      title,
      viewport,
    };
  }, { expectedSegments: segments, expectedColumns: columns });

  check(`${label} renders distinct five-star clusters`,
    layout.groups === segments
      && layout.stars === segments * 5
      && layout.columns === columns
      && layout.rows === Math.ceil(segments / columns)
      && layout.separated,
    JSON.stringify(layout));
  check(`${label} shows a clear number range for every five-star cluster`,
    JSON.stringify(layout.ranges.map((range) => range.text)) === JSON.stringify(layout.expectedRanges)
      && layout.ranges.every((range) => range.opacity === 1 && range.visibility === 'visible')
      && layout.rangesInsideGroups
      && layout.rangesClearStars,
    JSON.stringify(layout));
  check(`${label} keeps rewards and actions fully inside the viewport`,
    layout.allInside && layout.actionsLarge && layout.actionsSeparate,
    JSON.stringify(layout));
  check(`${label} keeps reward clusters clear of title and actions`, layout.noUiCollisions, JSON.stringify(layout));
}

async function auditCommittedVoiceClips(page) {
  const result = await page.evaluate(async () => {
    const manifestUrl = new URL('./assets/audio/manifest.json', location.href);
    const report = { manifestUrl: manifestUrl.href, manifestStatus: 0, entries: [], error: null };
    let context = null;
    try {
      const manifestResponse = await fetch(manifestUrl, { cache: 'no-store' });
      report.manifestStatus = manifestResponse.status;
      if (!manifestResponse.ok) throw new Error(`manifest HTTP ${manifestResponse.status}`);
      const manifest = await manifestResponse.json();
      report.entries = Object.entries(manifest).map(([key, value]) => ({
        key,
        file: value?.file,
        fetched: false,
        status: 0,
        bytes: 0,
        decoded: false,
        duration: 0,
        sampleRate: 0,
        channels: 0,
        error: null,
      }));

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('AudioContext is unavailable');
      context = new AudioContextClass();

      for (const entry of report.entries) {
        try {
          const clipUrl = new URL(entry.file, manifestUrl);
          const response = await fetch(clipUrl, { cache: 'no-store' });
          entry.status = response.status;
          entry.fetched = response.ok;
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const encoded = await response.arrayBuffer();
          entry.bytes = encoded.byteLength;
          if (!entry.bytes) throw new Error('empty response');
          const decoded = await context.decodeAudioData(encoded.slice(0));
          entry.duration = decoded.duration;
          entry.sampleRate = decoded.sampleRate;
          entry.channels = decoded.numberOfChannels;
          entry.decoded = Number.isFinite(decoded.duration)
            && decoded.duration > 0
            && decoded.sampleRate > 0
            && decoded.numberOfChannels > 0;
          if (!entry.decoded) throw new Error('decoded buffer has no playable audio');
        } catch (error) {
          entry.error = error instanceof Error ? error.message : String(error);
        }
      }
    } catch (error) {
      report.error = error instanceof Error ? error.message : String(error);
    } finally {
      if (context) await context.close();
    }
    return report;
  });

  const schemaFailures = result.entries.filter((entry) => (
    typeof entry.key !== 'string'
      || !entry.key
      || typeof entry.file !== 'string'
      || !entry.file.toLowerCase().endsWith('.m4a')
  ));
  const files = result.entries.map((entry) => entry.file);
  check('the committed voice manifest contains exactly 28 unique M4A clips',
    result.manifestStatus === 200
      && result.entries.length === 28
      && new Set(files).size === 28
      && schemaFailures.length === 0,
    JSON.stringify({ error: result.error, status: result.manifestStatus, count: result.entries.length, schemaFailures }));

  const fetchFailures = result.entries
    .filter((entry) => !entry.fetched || entry.status !== 200 || entry.bytes <= 0)
    .map(({ key, file, status, bytes, error }) => ({ key, file, status, bytes, error }));
  check('real Chrome fetches every committed voice clip successfully',
    result.entries.length === 28 && fetchFailures.length === 0,
    JSON.stringify(fetchFailures));

  const decodeFailures = result.entries
    .filter((entry) => !entry.decoded)
    .map(({ key, file, duration, sampleRate, channels, error }) => ({ key, file, duration, sampleRate, channels, error }));
  check('real Chrome decodes every committed voice clip',
    result.entries.length === 28 && decodeFailures.length === 0,
    JSON.stringify(decodeFailures));
}

async function silenceRuntimeButKeepAudioLog(page) {
  await page.evaluate(async () => {
    const [voice, sfx, bgm] = await Promise.all([
      import('/shared/js/voice-clips.js'),
      import('/shared/js/sfx.js'),
      import('/shared/js/bgm.js'),
    ]);
    // voice-clips logs before its mute gate, so the drive remains fast while
    // still proving every requested key resolves to a committed recording.
    voice.setMuted(true);
    sfx.setMuted(true);
    bgm.setMuted(true);
  });
}

async function restoreRuntimeAudio(page) {
  await page.evaluate(async () => {
    const [voice, sfx, bgm] = await Promise.all([
      import('/shared/js/voice-clips.js'),
      import('/shared/js/sfx.js'),
      import('/shared/js/bgm.js'),
    ]);
    voice.setMuted(false);
    sfx.setMuted(false);
    bgm.setMuted(false);
  });
}

async function foregroundPage(page) {
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    if (descriptor) Object.defineProperty(document, 'hidden', descriptor);
    else delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
}

async function tapRouteToEnd(page, expectedGoal) {
  const seen = [];
  let safety = expectedGoal + 12;
  while (safety > 0) {
    safety -= 1;
    const current = await debug.getState(page);
    if (current.screen === 'end') break;
    if (current.screen !== 'play') throw new Error(`left play unexpectedly: ${JSON.stringify(current)}`);
    if (current.expected == null) {
      await page.waitForTimeout(15);
      continue;
    }
    const result = await debug.tap(page, `stone-${current.expected}`);
    if (result.accepted) seen.push(current.expected);
  }
  await debug.waitForScreen(page, 'end', { timeout: 5000 });
  return seen;
}

async function main() {
  const browser = await launchChrome({ channel: args.flag('channel', 'chrome') });
  try {
    const landscape = await open(browser, { width: 1440, height: 900 });
    const { page } = landscape;

    await shot(page, '01-splash-landscape.png');
    const initial = await debug.getState(page);
    check('boots on the trail chooser', initial.screen === 'splash' && initial.phase === 'splash', JSON.stringify(initial));
    check('fastTimers reports the applied acceleration truthfully', initial.timerScale === 20, JSON.stringify(initial));
    const modes = await debug.listModes(page);
    check('debug lists exactly the 5, 10, and 20 trails', JSON.stringify(modes.map((mode) => mode.id)) === JSON.stringify(modeIds), JSON.stringify(modes));
    const appliedSeed = await debug.seed(page, 2468);
    check('seed is deterministic and reported truthfully', appliedSeed === 2468 && (await debug.getState(page)).seed === 2468);
    await auditControls(page, '.route-card, #splash .qk-hud-btn', 'landscape chooser');

    await page.locator('[data-target="mode-count-20"]').focus();
    await shot(page, '02-route-focus-landscape.png');

    await page.locator('#splash-hud .qk-hud-sound').click();
    await debug.waitForAudio(page, 'select-intro');
    check('the chooser uses the recorded teacher line', audio.heardClip(await debug.getAudioLog(page), 'select-intro'));
    await auditCommittedVoiceClips(page);

    await debug.startMode(page, 'count-5');
    await debug.waitForScreen(page, 'play');
    await debug.waitForAudio(page, 'trail-5-intro');
    await auditControls(page, '.trail-stone, #play .qk-hud-btn', 'five-stone play');
    check('the numbered trail is exposed as a labeled group', await page.locator('#trail-board[role="group"][aria-label]').count() === 1);
    const beforeWrong = await debug.getState(page);
    await page.locator('[data-target="stone-2"]').click();
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().wrongAttempts === 1);
    await debug.waitForAudio(page, 'wrong-next');
    await debug.waitForAudio(page, 'count-1');
    const afterWrong = await debug.getState(page);
    check('a future stone is a gentle retry, not progress', afterWrong.counted === beforeWrong.counted && afterWrong.expected === 1, JSON.stringify(afterWrong));
    const wrongLog = await debug.getAudioLog(page);
    check('wrong-order feedback repeats the needed number', audio.inOrder(wrongLog, ['wrong-next', 'count-1']), audio.describe(wrongLog));

    await silenceRuntimeButKeepAudioLog(page);
    await page.locator('[data-target="stone-1"]').click();
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().counted === 1);
    const afterRealTap = await debug.getState(page);
    check('a real pointer tap advances through the shared stone handler', afterRealTap.counted === 1 && afterRealTap.expected === 2, JSON.stringify(afterRealTap));
    await auditActiveCue(page, 'active stepping stone');
    await shot(page, '03-count-5-active-landscape.png');

    const remainderFive = await tapRouteToEnd(page, 5);
    const fiveEnd = await debug.getState(page);
    check('count-5 reaches the real finish with five earned stars', fiveEnd.counted === 5 && fiveEnd.earnedStars === 5 && fiveEnd.screen === 'end', JSON.stringify(fiveEnd));
    check('count-5 advances through the remaining numbered taps', JSON.stringify(remainderFive) === JSON.stringify([2, 3, 4, 5]), JSON.stringify(remainderFive));
    check('earned stars use labeled group semantics', await page.locator('#earned-stars[role="group"] .star-segment[role="group"][aria-label]').count() === 1);
    check('the five-star reward shows its one-to-five range', await page.locator('.star-range').getByText('1\u20135', { exact: true }).count() === 1);
    await auditControls(page, '.paper-action, #end .qk-hud-btn', 'five-stone celebration');
    await waitForEarnedStars(page, 5);
    await auditEndLabels(page, 'five-stone celebration');
    await shot(page, '04-count-5-complete-landscape.png');

    await page.locator('#again').click();
    await debug.waitForScreen(page, 'play');
    check('Walk again restarts the same trail at one', (await debug.getState(page)).mode === 'count-5' && (await debug.getState(page)).expected === 1);
    await page.locator('#play-hud .qk-hud-back').click();
    await debug.waitForScreen(page, 'splash');
    check('play Back returns in-page to the chooser', (await debug.getState(page)).screen === 'splash');

    await restoreRuntimeAudio(page);
    await debug.startMode(page, 'count-10');
    await debug.waitForScreen(page, 'play');
    await shot(page, '05-count-10-first-segment.png');
    const tenSeen = [];
    for (let number = 1; number <= 4; number += 1) {
      const result = await debug.tap(page, `stone-${number}`);
      if (result.accepted) tenSeen.push(number);
    }
    await page.evaluate(() => {
      window.__TRAIL_TRANSITION_TAP__ = window.QLOBE_DEBUG.tap('stone-5');
    });
    await page.waitForFunction(() => {
      const state = window.QLOBE_DEBUG.getState();
      return state.segmentIndex === 1 && state.phase === 'segment-clear' && state.trail?.inputLocked;
    });
    const blockedTransitionTap = await debug.tap(page, 'stone-6');
    const lockedTransitionState = await debug.getState(page);
    check('next tableau blocks input throughout delayed transition narration',
      blockedTransitionTap.accepted === false
        && blockedTransitionTap.reason === 'transition'
        && lockedTransitionState.counted === 5
        && lockedTransitionState.awaitingInput === false,
      JSON.stringify({ blockedTransitionTap, lockedTransitionState }));
    await page.evaluate(() => window.__TRAIL_TRANSITION_TAP__);
    await debug.waitForInput(page);
    const afterTransition = await debug.getState(page);
    check('transition unlocks only the current segment generation',
      afterTransition.expected === 6 && afterTransition.trail.inputLocked === false && afterTransition.trail.busy === false,
      JSON.stringify(afterTransition));
    tenSeen.push(5);
    await silenceRuntimeButKeepAudioLog(page);
    tenSeen.push(...await tapRouteToEnd(page, 10));
    const tenEnd = await debug.getState(page);
    check('count-10 traverses two five-stone chapters', tenEnd.counted === 10 && tenEnd.segmentsTotal === 2 && tenSeen.length === 10, JSON.stringify({ tenSeen, tenEnd }));
    await waitForEarnedStars(page, 10);
    await auditEndLabels(page, 'ten-stone celebration');
    await auditEndLayout(page, 'ten-stone landscape celebration', 2, 2);
    await shot(page, '06-count-10-complete.png');
    await page.locator('#choose').click();
    await debug.waitForScreen(page, 'splash');
    check('Choose trail returns in-page to the chooser', (await debug.getState(page)).mode === null);

    await debug.startMode(page, 'count-20');
    await debug.waitForScreen(page, 'play');
    const twentySeen = await tapRouteToEnd(page, 20);
    const twentyEnd = await debug.getState(page);
    check('count-20 traverses four five-stone chapters', twentyEnd.counted === 20 && twentyEnd.segmentsTotal === 4 && twentySeen.length === 20, JSON.stringify({ twentySeen, twentyEnd }));
    check('count-20 preserves the complete one-to-twenty sequence', twentySeen.every((number, index) => number === index + 1), JSON.stringify(twentySeen));
    await waitForEarnedStars(page, 20);
    await auditEndLabels(page, 'twenty-stone celebration');
    await auditEndLayout(page, 'twenty-stone landscape celebration', 4, 2);
    await shot(page, '07-count-20-complete-landscape.png');

    const fullLog = await debug.getAudioLog(page);
    const routeKeys = ['trail-5-intro', 'trail-10-intro', 'trail-20-intro', 'wrong-next', 'route-clear'];
    const numberKeys = Array.from({ length: 20 }, (_, index) => `count-${index + 1}`);
    check('all route guidance resolves to recorded clips', routeKeys.every((key) => audio.heardClip(fullLog, key)), audio.describe(fullLog));
    check('all twenty spoken numbers resolve to recorded clips', numberKeys.every((key) => audio.heardClip(fullLog, key)), audio.describe(fullLog));

    await page.locator('#end-hud .qk-hud-back').click();
    await debug.waitForScreen(page, 'splash');
    check('end Back returns in-page to the chooser', (await debug.getState(page)).screen === 'splash');
    await restoreRuntimeAudio(page);
    const beforeForeground = await debug.getAudioLog(page);
    const beforeForegroundIntroCount = audio.count(beforeForeground, 'select-intro');
    await foregroundPage(page);
    await page.locator('#splash-hud .qk-hud-sound').click();
    await page.waitForFunction((before) => (
      window.QLOBE_DEBUG.getAudioLog().filter((entry) => entry.key === 'select-intro').length > before
    ), beforeForegroundIntroCount);
    const afterForeground = await debug.getAudioLog(page);
    const foregroundEntries = afterForeground.filter((entry) => entry.key === 'select-intro').slice(beforeForegroundIntroCount);
    check('foreground return re-unlocks on the next gesture without replaying the first-touch greeting',
      foregroundEntries.length === 1 && foregroundEntries[0].kind === 'clip',
      audio.describe(foregroundEntries));
    checkClean(landscape, 'landscape full-game drive');
    await landscape.close();

    const portrait = await open(browser, { width: 820, height: 1180 }, 'reduce');
    await debug.mute(portrait.page, true);
    await debug.startMode(portrait.page, 'count-20');
    await debug.waitForScreen(portrait.page, 'play');
    await debug.tap(portrait.page, 'stone-1');
    const portraitState = await debug.getState(portrait.page);
    const mutedBgm = await debug.call(portrait.page, 'getBgmStats');
    check('mute silences narration, effects, and recorded music state', portraitState.muted === true && mutedBgm.muted === true, JSON.stringify({ portraitState, mutedBgm }));
    const portraitLayout = await debug.call(portrait.page, 'getLayout');
    check('portrait reports reduced motion truthfully', portraitLayout.reducedMotion === true, JSON.stringify(portraitLayout));
    check('portrait keeps every visible stone at least 96px', portraitLayout.minimumStone.w >= 96 && portraitLayout.minimumStone.h >= 96, JSON.stringify(portraitLayout.minimumStone));
    await auditControls(portrait.page, '.trail-stone, #play .qk-hud-btn', 'portrait play');
    await shot(portrait.page, '08-count-20-play-portrait-reduced.png');
    const portraitWin = await debug.winRound(portrait.page);
    check('portrait count-20 reaches its complete reward screen', portraitWin.screen === 'end' && portraitWin.counted === 20, JSON.stringify(portraitWin));
    await waitForEarnedStars(portrait.page, 20);
    await auditControls(portrait.page, '.paper-action, #end .qk-hud-btn', 'portrait celebration');
    await auditEndLabels(portrait.page, 'portrait celebration');
    await auditEndLayout(portrait.page, 'twenty-stone portrait celebration', 4, 2);
    await shot(portrait.page, '10-count-20-complete-portrait-reduced.png');
    checkClean(portrait, 'portrait reduced-motion');
    await portrait.close();

    const short = await open(browser, { width: 1180, height: 520 }, 'reduce');
    await debug.mute(short.page, true);
    await debug.startMode(short.page, 'count-10');
    await debug.waitForScreen(short.page, 'play');
    const shortLayout = await debug.call(short.page, 'getLayout');
    check('short landscape keeps every visible stone at least 96px', shortLayout.minimumStone.w >= 96 && shortLayout.minimumStone.h >= 96, JSON.stringify(shortLayout.minimumStone));
    await auditControls(short.page, '.trail-stone, #play .qk-hud-btn', 'short-landscape play');
    await shot(short.page, '09-count-10-short-landscape.png');
    const debugWin = await debug.winRound(short.page);
    check('winRound follows the live handler to the real end screen', debugWin.screen === 'end' && debugWin.counted === 10, JSON.stringify(debugWin));
    await waitForEarnedStars(short.page, 10);
    await auditControls(short.page, '.paper-action, #end .qk-hud-btn', 'short-landscape celebration');
    await auditEndLabels(short.page, 'short-landscape celebration');
    await auditEndLayout(short.page, 'ten-stone short-landscape celebration', 2, 2);
    await shot(short.page, '11-count-10-complete-short-landscape.png');
    checkClean(short, 'short landscape');
    await short.close();

    const catalog = await open(browser, { width: 1180, height: 820 }, 'reduce');
    const catalogPage = catalog.page;
    await Promise.all([
      catalogPage.waitForURL((url) => !url.pathname.includes('/games/trail-counting-walk/')),
      catalogPage.locator('[data-target="catalog-home"]').click(),
    ]);
    check('splash Home returns to the catalog', !new URL(catalogPage.url()).pathname.includes('/games/trail-counting-walk/'), catalogPage.url());
    checkClean(catalog, 'catalog navigation');
    await catalog.close();
  } finally {
    await browser.close();
  }
  finish({ suffix: `; shots in ${SHOTS}` });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
