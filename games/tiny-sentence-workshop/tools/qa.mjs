#!/usr/bin/env node
import fs from 'node:fs/promises';
import {
  baseUrl,
  checkSessionClean,
  createReporter,
  debug,
  dragBetween,
  ensureShots,
  launchChrome,
  openSession,
  resolveShots,
  shooter,
} from '../../../tools/qa/lib/driver.mjs';

const explicitBaseIndex = process.argv.indexOf('--base-url');
const base = explicitBaseIndex >= 0 && process.argv[explicitBaseIndex + 1]
  ? process.argv[explicitBaseIndex + 1].replace(/\/$/, '')
  : baseUrl();
const shots = resolveShots('qa-shots/tiny-sentence-workshop');
const reporter = createReporter({ detailOnFail: true, detailLimit: 12000 });
const { check, finish } = reporter;
const shot = shooter(shots);
const sessions = [];
const evidence = [];
const modes = ['read-strip', 'build-strip', 'scene-check'];
const analytics = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];

const viewports = [
  { width: 1280, height: 800, label: 'landscape' },
  { width: 1024, height: 768, label: 'tablet-4x3' },
  { width: 768, height: 1024, label: 'portrait' },
  { width: 667, height: 375, label: 'compact-landscape' },
];

async function waitForVisualReady(page) {
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function auditContentContract() {
  const game = new URL('../', import.meta.url);
  const [config, lines, manifest, html, css, main] = await Promise.all([
    fs.readFile(new URL('config.json', game), 'utf8').then(JSON.parse),
    fs.readFile(new URL('assets/audio/lines.json', game), 'utf8').then(JSON.parse),
    fs.readFile(new URL('assets/audio/manifest.json', game), 'utf8').then(JSON.parse),
    fs.readFile(new URL('index.html', game), 'utf8'),
    fs.readFile(new URL('css/style.css', game), 'utf8'),
    fs.readFile(new URL('js/main.js', game), 'utf8'),
  ]);
  const corpusIds = config.corpus.map((record) => record.id);
  const known = new Set(corpusIds);
  const classified = new Set(config.tokens.map((token) => token.text));
  const words = new Set(config.corpus.flatMap((record) => (
    record.sentence.toLowerCase().match(/[a-z]+/g) || []
  )));
  check('content contract has exactly three single-skill modes', config.modes.length === 3 && new Set(config.modes.map((mode) => mode.id)).size === 3);
  check('content contract has twelve unique controlled sentences', config.corpus.length === 12 && new Set(corpusIds).size === 12);
  check('every corpus word has an explicit decoding classification', [...words].every((word) => classified.has(word)), JSON.stringify([...words].filter((word) => !classified.has(word))));
  check('every comprehension set has three unique known near-miss scenes', config.corpus.every((record) => (
    record.choices.length === 3
    && new Set(record.choices).size === 3
    && record.choices.includes(record.id)
    && record.choices.every((id) => known.has(id))
  )));
  const requiredVoice = new Set([
    ...[...words].map((word) => `word-${word}`),
    ...corpusIds.map((id) => `sentence-${id}`),
  ]);
  check('written voice source covers every word and complete sentence', [...requiredVoice].every((key) => typeof lines[key] === 'string' && lines[key].length > 0), JSON.stringify([...requiredVoice].filter((key) => !lines[key])));
  check('recorded voice manifest covers the complete approved script', Object.keys(manifest).length === Object.keys(lines).length && Object.keys(lines).every((key) => manifest[key]?.file), JSON.stringify({ expected: Object.keys(lines).length, actual: Object.keys(manifest).length }));
  const missingScenes = [];
  for (const id of corpusIds) {
    try { await fs.access(new URL(`assets/scenes/${id}.webp`, game)); } catch { missingScenes.push(id); }
  }
  check('all twelve authored comprehension scenes exist', missingScenes.length === 0, JSON.stringify(missingScenes));
  const visualSource = `${html}\n${css}\n${main}`;
  check('runtime contains no SVG, vector data URI, emoji, or CSS gradient artwork', !/(?:\.svg\b|data:image\/svg|gradient\s*\(|[\u{1F300}-\u{1FAFF}])/u.test(visualSource));
}

async function open(browser, viewport, options = {}) {
  const session = await openSession(browser, {
    url: `${base}/games/tiny-sentence-workshop/`,
    base,
    viewport,
    seed: 42,
    fastTimers: 0.05,
    mute: options.mute ?? true,
    reducedMotion: options.reducedMotion ?? 'no-preference',
    allowAbortedMedia: true,
    allowRemote: analytics,
  });
  sessions.push(session);
  return session;
}

async function auditTargets(page, label) {
  const result = await page.evaluate(() => {
    const targets = [...document.querySelectorAll('[data-target]')]
      .filter((node) => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && !node.disabled)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          id: node.dataset.target,
          role: node.dataset.role || 'neutral',
          x: rect.x,
          y: rect.y,
          w: rect.width,
          h: rect.height,
          right: rect.right,
          bottom: rect.bottom,
        };
      });
    const overlaps = [];
    for (let left = 0; left < targets.length; left += 1) {
      for (let right = left + 1; right < targets.length; right += 1) {
        const a = targets[left];
        const b = targets[right];
        const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
        const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
        const intersection = width * height;
        const smaller = Math.min(a.w * a.h, b.w * b.h);
        if (smaller > 0 && intersection / smaller > 0.05) {
          overlaps.push({ a: a.id, b: b.id, ratio: Math.round((intersection / smaller) * 1000) / 1000 });
        }
      }
    }
    return { targets, overlaps, viewport: { width: innerWidth, height: innerHeight } };
  });
  const { width, height } = result.viewport;
  check(`${label}: targets are at least 96px`, result.targets.every((target) => target.w >= 96 && target.h >= 96), JSON.stringify(result.targets));
  check(`${label}: targets stay inside viewport`, result.targets.every((target) => target.x >= -0.5 && target.y >= -0.5 && target.right <= width + 0.5 && target.bottom <= height + 0.5), JSON.stringify(result.targets));
  check(`${label}: targets do not materially overlap`, result.overlaps.length === 0, JSON.stringify(result.overlaps));
  return result;
}

async function tapWrongOnce(page, modeId, roundIndex) {
  const before = await debug.getState(page);
  const targets = await debug.getTargets(page);
  const wrong = targets.find((target) => (
    (target.role === 'wrong' || target.role === 'blocked')
    && /^(?:word|piece|scene):/.test(target.id)
  ));
  check(`${modeId}: round ${roundIndex + 1} exposes a gentle wrong probe`, Boolean(wrong), JSON.stringify(targets));
  if (!wrong) return null;
  await debug.tap(page, wrong.id);
  const after = await debug.getState(page);
  check(`${modeId}: wrong probe preserves round progress`, after.roundIndex === before.roundIndex && after.tokenIndex === before.tokenIndex && after.placedTokenIds.length === before.placedTokenIds.length, JSON.stringify({ before, after, wrong }));
  check(`${modeId}: wrong probe records an attempt`, after.attempts === before.attempts + 1, JSON.stringify({ before, after, wrong }));
  return { id: wrong.id, before, after };
}

async function finishRoundThroughRealTargets(page, modeId, roundIndex, { onLocked = null } = {}) {
  let lockedCaptured = false;
  for (let step = 0; step < 24; step += 1) {
    const result = await page.evaluate(async ({ expectedRound }) => {
      const hook = window.QLOBE_DEBUG;
      const state = hook.getState();
      if (state.screen !== 'play' || state.roundIndex !== expectedRound) return { advanced: true };
      if (state.locked || !state.awaitingInput) return { waiting: true };
      const correct = hook.getTargets().find((target) => (
        target.role === 'correct' && /^(?:word|piece|scene):/.test(target.id)
      ));
      if (!correct) return { waiting: true };
      await hook.tap(correct.id);
      return { tapped: correct.id };
    }, { expectedRound: roundIndex });
    if (result.advanced) return;
    if (result.tapped) {
      const after = await debug.getState(page);
      if (after.screen !== 'play' || after.roundIndex !== roundIndex) return;
      if (after.locked || !after.awaitingInput) {
        if (onLocked && !lockedCaptured) {
          lockedCaptured = true;
          await onLocked();
        }
        await page.waitForFunction(
          (round) => {
            const current = window.QLOBE_DEBUG.getState();
            return current.screen === 'end' || current.roundIndex > round;
          },
          roundIndex,
          { timeout: 5000 },
        );
        return;
      }
      continue;
    }
    await page.waitForTimeout(25);
  }
  throw new Error(`${modeId} round ${roundIndex + 1} did not advance through truthful correct targets`);
}

async function driveMode(browser, modeId, viewport, { reducedMotion = 'no-preference', suffix = '' } = {}) {
  const session = await open(browser, viewport, { mute: true, reducedMotion });
  const page = session.page;
  const label = `${viewport.label}${suffix}-${modeId}`;
  let splashTargets = null;
  if (modeId === modes[0]) {
    splashTargets = await auditTargets(page, `${viewport.label}${suffix} splash`);
    await shot(page, `${viewport.label}${suffix}-splash`);
  }
  await debug.startMode(page, modeId);
  await debug.waitForScreen(page, 'play');
  let state = await debug.getState(page);
  check(`${label}: starts requested mode`, state.modeId === modeId && state.roundIndex === 0 && state.awaitingInput, JSON.stringify(state));
  const playTargets = await auditTargets(page, `${label} play`);
  const roundPlan = await debug.call(page, 'getRoundPlan');
  await waitForVisualReady(page);
  await shot(page, `${label}-play`);

  const wrongEvidence = [];
  for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
    state = await debug.getState(page);
    check(`${label}: round ${roundIndex + 1} is ready`, state.screen === 'play' && state.roundIndex === roundIndex && state.awaitingInput, JSON.stringify(state));
    const captureBeat = ['landscape', 'tablet-4x3'].includes(viewport.label) && !suffix && roundIndex === 0;
    if (captureBeat) await debug.fastTimers(page, 1);
    wrongEvidence.push(await tapWrongOnce(page, modeId, roundIndex));
    if (captureBeat) {
      await page.waitForTimeout(220);
      await shot(page, `${label}-wrong`);
    }
    await finishRoundThroughRealTargets(page, modeId, roundIndex, {
      onLocked: captureBeat ? async () => {
        await page.waitForTimeout(250);
        await shot(page, `${label}-success`);
      } : null,
    });
    if (captureBeat) await debug.fastTimers(page, 0.05);
    await page.waitForFunction(
      (round) => {
        const current = window.QLOBE_DEBUG.getState();
        return current.screen === 'end' || current.roundIndex > round;
      },
      roundIndex,
      { timeout: 5000 },
    );
  }

  await debug.waitForScreen(page, 'end', { timeout: 5000 });
  const endState = await debug.getState(page);
  check(`${label}: completes three rounds`, endState.screen === 'end' && endState.modeId === modeId && endState.completedIds.length === 3, JSON.stringify(endState));
  const endTargets = await auditTargets(page, `${label} end`);
  await page.waitForTimeout(750);
  await shot(page, `${label}-end`);
  await debug.call(page, 'home');
  await debug.waitForScreen(page, 'splash');
  check(`${label}: back route returns in-page splash`, (await debug.getState(page)).screen === 'splash');

  const record = {
    label,
    modeId,
    viewport,
    reducedMotion,
    roundPlan,
    wrongEvidence,
    endState,
    splashTargets,
    playTargets,
    endTargets,
    consoleErrors: session.errors,
    failedResponses: session.failed,
    remoteRequests: session.remote,
  };
  evidence.push(record);
  return record;
}

async function checkRecordedVoice(browser) {
  const session = await open(browser, { width: 1280, height: 800 }, { mute: false });
  const page = session.page;
  await debug.clearAudioLog(page);
  await page.locator('[data-target="mode:read-strip"]').click({ position: { x: 120, y: 150 } });
  await debug.waitForScreen(page, 'play');
  await debug.waitForAudio(page, 'mode-read', { timeout: 8000 });
  const log = await debug.getAudioLog(page);
  check('recorded teacher voice plays after a real gesture', log.some((entry) => entry.key === 'mode-read' && entry.kind === 'clip'), JSON.stringify(log));
  evidence.push({ label: 'recorded-voice', audioLog: log, consoleErrors: session.errors, failedResponses: session.failed, remoteRequests: session.remote });
}

async function checkPhysicalInput(browser) {
  const session = await open(browser, { width: 1280, height: 800 }, { mute: true });
  const page = session.page;
  const mode = page.locator('[data-target="mode:build-strip"]');
  await mode.focus();
  await page.keyboard.press('Enter');
  await debug.waitForScreen(page, 'play');
  await debug.waitForInput(page);
  check('keyboard activation starts a mode through its real control', (await debug.getState(page)).modeId === 'build-strip');

  const piece = await page.locator('[data-target="piece:0"]').boundingBox();
  const slot = await page.locator('[data-slot="0"]').boundingBox();
  check('build mode exposes a real draggable first stamp and socket', Boolean(piece && slot), JSON.stringify({ piece, slot }));
  if (piece && slot) {
    await dragBetween(page, piece, slot, { steps: 12 });
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().placedTokenIds.length === 1);
    const state = await debug.getState(page);
    check('real pointer drag places the stamp through semantic progress', state.tokenIndex === 1 && state.placedTokenIds.length === 1, JSON.stringify(state));
    check('completed drag leaves no stranded ghost', await page.locator('.word-tile.dragging').count() === 0);
  }
  await page.locator('[data-target="back"]').click();
  await debug.waitForScreen(page, 'splash');
  check('real Back control returns to workshop splash', (await debug.getState(page)).screen === 'splash');
  evidence.push({
    label: 'physical-keyboard-drag',
    state: await debug.getState(page),
    consoleErrors: session.errors,
    failedResponses: session.failed,
    remoteRequests: session.remote,
  });
}

async function main() {
  await ensureShots(shots);
  await auditContentContract();
  const browser = await launchChrome({ channel: 'chrome' });
  try {
    for (const viewport of viewports) {
      for (const modeId of modes) await driveMode(browser, modeId, viewport);
    }
    await driveMode(browser, 'scene-check', { width: 768, height: 1024, label: 'portrait' }, { reducedMotion: 'reduce', suffix: '-reduced' });
    await checkPhysicalInput(browser);
    await checkRecordedVoice(browser);
  } finally {
    for (const [index, session] of sessions.entries()) {
      const cleanSession = {
        ...session,
        failed: session.failed.filter((entry) => !analytics.some((prefix) => entry.includes(prefix))),
      };
      checkSessionClean(reporter, cleanSession, `browser session ${index + 1}`);
    }
    await browser.close();
  }
  await fs.writeFile(`${shots}/report.json`, `${JSON.stringify({ gameId: 'tiny-sentence-workshop', base, createdAt: new Date().toISOString(), evidence, checks: reporter.results }, null, 2)}\n`);
  await finish({ suffix: `; shots in ${shots}` });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
