#!/usr/bin/env node
// Static, interaction, responsive, audio, and screenshot QA for Mountain Seasons Wheel.
//
//   node games/mountain-seasons-wheel/tools/qa.mjs --base http://127.0.0.1:8765
//   node games/mountain-seasons-wheel/tools/qa.mjs --base https://qlo.be
//   node games/mountain-seasons-wheel/tools/qa.mjs --skip-audio

import { readFile, stat, access } from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  baseUrl,
  launchChrome,
  createReporter,
  openSession,
  resolveShots,
  ensureShots,
} from '../../../tools/qa/lib/driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..');
const ROOT = path.resolve(GAME, '..', '..');
const base = baseUrl();
const shots = resolveShots('/private/tmp/qlobe-mountain-seasons-wheel-shots');
const skipAudio = process.argv.includes('--skip-audio');
const { check, note, finish, head } = createReporter({ collapse: true, detailLimit: 420 });
const sessions = [];
const execFileAsync = promisify(execFile);

const readJSONAt = async (root, ...parts) => JSON.parse(await readFile(path.join(root, ...parts), 'utf8'));
const readJSON = (...parts) => readJSONAt(GAME, ...parts);
const exists = async (...parts) => {
  try { await access(path.join(GAME, ...parts), FS.F_OK); return true; } catch { return false; }
};
const bytes = async (...parts) => (await stat(path.join(GAME, ...parts))).size;
const normalize = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const TRANSCRIPT_ALIAS_RULE = 'juni-orthography-v1';
const APPROVED_INSTRUCTION_HASH = '787f3583c2804d33'; // DEFAULT_INSTRUCTION in generate-voice.py
const canonicalizeTranscript = (text) => String(text || '').replace(/\bjunie\b/gi, 'juni');
const normalizeTranscript = (text) => normalize(canonicalizeTranscript(text));
const appliedTranscriptAliases = (text) => (/\bjunie\b/i.test(String(text || '')) ? ['junie->juni'] : []);
const textHash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);
const fileHash = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const mediaDuration = async (file) => {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
    ]);
    return Number.parseFloat(stdout.trim());
  } catch {
    return Number.NaN;
  }
};
const garmentFor = { spring: 'raincoat', summer: 'sun-hat', autumn: 'warm-vest', winter: 'parka' };
const subjectZones = {
  spring: { plant: [0.10, 0.24, 0.58, 0.78], animal: [0.72, 0.88, 0.58, 0.80] },
  summer: { plant: [0.10, 0.24, 0.56, 0.80], animal: [0.72, 0.88, 0.54, 0.76] },
  autumn: { plant: [0.30, 0.46, 0.40, 0.64], animal: [0.72, 0.88, 0.56, 0.78] },
  winter: { plant: [0.10, 0.26, 0.50, 0.76], animal: [0.72, 0.88, 0.58, 0.80] },
};

function collectAssetRefs(value, found = new Set()) {
  if (typeof value === 'string' && value.startsWith('./assets/')) found.add(value.slice(2));
  else if (Array.isArray(value)) value.forEach((entry) => collectAssetRefs(entry, found));
  else if (value && typeof value === 'object') Object.values(value).forEach((entry) => collectAssetRefs(entry, found));
  return found;
}

async function staticGate() {
  head('static production gate');
  const [config, lines, game, registry] = await Promise.all([
    readJSON('config.json'),
    readJSON('data', 'lines.json'),
    readJSON('game.json'),
    readJSONAt(ROOT, 'games.json'),
  ]);
  const entry = registry.games.find((item) => item.id === game.id);

  check('canonical manifest promotes the custom game to beta',
    config.id === 'mountain-seasons-wheel' && game.id === config.id && game.status === 'beta');
  check('the registry mirrors canonical production fields',
    entry
      && entry.title === game.title
      && entry.status === game.status
      && entry.category === game.category
      && JSON.stringify(entry.age) === JSON.stringify(game.age)
      && entry.accent === game.accent
      && JSON.stringify(entry.modes) === JSON.stringify(game.modes),
    JSON.stringify(entry));
  check('both focused modes and four seasons are authored',
    JSON.stringify(Object.keys(config.modes).sort()) === JSON.stringify(['dress', 'wheel'])
      && JSON.stringify(config.seasonOrder) === JSON.stringify(['spring', 'summer', 'autumn', 'winter']));
  check('all 42 source-of-truth spoken lines are present', Object.keys(lines).length === 42, Object.keys(lines).length);
  const aliasFixtures = [
    ['Dress Junie', 'Dress Juni', true],
    ["Shade Junie's face", "Shade Juni's face", true],
    ['Dress Julie', 'Dress Juni', false],
    ['Dress Johnny', 'Dress Juni', false],
    ['Looping flowers', 'Lupine flowers', false],
  ];
  check('blind transcript alias policy permits only the Juni orthographic spelling',
    aliasFixtures.every(([heard, source, expected]) => (normalizeTranscript(heard) === normalize(source)) === expected));

  const refs = [...collectAssetRefs(config)].sort();
  const missing = [];
  for (const rel of refs) if (!(await exists(...rel.split('/')))) missing.push(rel);
  check('every configured runtime asset exists', missing.length === 0, missing.join(', '));
  check('configured paths are lowercase raster/audio refs',
    refs.every((rel) => rel === rel.toLowerCase() && !/\.(?:svg|gif)$/i.test(rel)), refs.join(', '));

  const oversized = [];
  for (const rel of refs.filter((item) => item.endsWith('.webp'))) {
    const size = await bytes(...rel.split('/'));
    const limit = rel === 'assets/title.webp' ? 150 * 1024
      : rel.includes('/backgrounds/') ? 350 * 1024
        : rel.includes('/reward/') ? 400 * 1024
          : 300 * 1024;
    if (size > limit) oversized.push(`${rel}:${size}>${limit}`);
  }
  check('runtime raster art meets its production byte budgets', oversized.length === 0, oversized.join(', '));

  const runtimeFiles = ['index.html', 'config.js', 'config.json', 'js/main.js', 'js/wheel.js', 'js/soundscape.js', 'css/style.css'];
  const runtime = (await Promise.all(runtimeFiles.map((file) => readFile(path.join(GAME, file), 'utf8')))).join('\n');
  check('runtime has no model endpoint, LAN address, remote media, SVG, or emoji placeholder art',
    !/(?:192\.168\.|\/workflows\/|emoji:|<svg|\.svg["')]|(?:src|href)=["']https?:\/\/(?!qlo\.be))/i.test(runtime));
  check('custom runtime imports the platform interaction, voice, screen, and debug contracts',
    ['tap.js', 'voice-clips.js', 'audio-unlock.js', 'screens.js', 'debug-harness.js']
      .every((name) => runtime.includes(name)));

  if (skipAudio) {
    note('recorded narration static gate skipped by --skip-audio');
  } else {
    const [manifest, qa] = await Promise.all([
      readJSON('assets', 'audio', 'manifest.json'),
      readJSON('assets', 'audio', 'qa.json'),
    ]);
    const keys = Object.keys(lines).sort();
    check('recorded narration manifest covers every authored line exactly once',
      JSON.stringify(Object.keys(manifest).sort()) === JSON.stringify(keys),
      `manifest=${Object.keys(manifest).length} lines=${keys.length}`);
    const problems = [];
    for (const key of keys) {
      const entry = manifest[key];
      const result = qa[key];
      const expectedFile = `${key}.m4a`;
      const audioPath = path.join(GAME, 'assets', 'audio', expectedFile);
      const expectedTextHash = textHash(lines[key]);
      if (!entry?.file
        || entry.file !== expectedFile
        || entry.textHash !== expectedTextHash
        || !Number.isFinite(entry.dur)
        || entry.dur < 0.35
        || entry.dur > 20) {
        problems.push(`${key}:manifest`);
      }
      if (!(await exists('assets', 'audio', expectedFile)) || (await bytes('assets', 'audio', expectedFile)) < 2000) {
        problems.push(`${key}:file`);
        continue;
      }
      const [actualHash, actualDuration, actualBytes] = await Promise.all([
        fileHash(audioPath),
        mediaDuration(audioPath),
        bytes('assets', 'audio', expectedFile),
      ]);
      if (!Number.isFinite(actualDuration)
        || Math.abs(Number(entry?.dur) - actualDuration) > 0.02
        || !result?.valid
        || result.engine !== 'qwen3-tts-voicedesign'
        || result.voice !== 'designed-preschool-teacher'
        || result.instructionHash !== APPROVED_INSTRUCTION_HASH
        || Object.prototype.hasOwnProperty.call(result, 'error')
        || result.transcriptionPrompt !== 'none'
        || result.promptUsed !== false
        || result.whisperWorkflow !== 'whisper-stt'
        || result.whisperModel !== 'medium'
        || result.whisperLanguage !== 'en'
        || result.transcriptAliasRule !== TRANSCRIPT_ALIAS_RULE
        || JSON.stringify(result.appliedTranscriptAliases) !== JSON.stringify(appliedTranscriptAliases(result.transcript))
        || result.normalizedTranscript !== normalizeTranscript(result.transcript)
        || result.normalizedSource !== normalize(lines[key])
        || normalizeTranscript(result.transcript) !== normalize(lines[key])
        || result.sourceText !== lines[key]
        || result.textHash !== expectedTextHash
        || result.bytes !== actualBytes
        || Math.abs(result.duration - actualDuration) > 0.02
        || result.sha256 !== actualHash) {
        problems.push(`${key}:transcript`);
      }
    }
    check('every clip has blind Whisper-medium evidence with one audited name alias plus matching integrity metadata',
      problems.length === 0, problems.join(', '));
  }
}

async function openGame(browser, viewport, reducedMotion = 'no-preference', mute = true) {
  const session = await openSession(browser, {
    url: `${base}/games/mountain-seasons-wheel/`,
    base,
    viewport,
    reducedMotion,
    ready: false,
    allowDataUrls: true,
    allowAbortedMedia: true,
    captureRequestFailures: false,
    allowRemote: ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'],
  });
  sessions.push(session);
  await session.page.waitForFunction(() => Boolean(window.QLOBE_DEBUG?.ready), null, { timeout: 15000 });
  await session.page.evaluate(async ({ shouldMute }) => {
    await window.QLOBE_DEBUG.ready;
    window.QLOBE_DEBUG.seed(42);
    window.QLOBE_DEBUG.fastTimers(20);
    window.QLOBE_DEBUG.mute(shouldMute);
  }, { shouldMute: mute });
  return session;
}

async function waitForScreen(page, name, timeout = 12000) {
  await page.waitForFunction((screen) => window.QLOBE_DEBUG.getState().screen === screen, name, { timeout });
}

async function checkTargets(page, label, minimum = 96) {
  const targets = await page.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check(`${label} targets meet the ${minimum}px floor`,
    targets.length > 0 && targets.every(({ rect }) => rect.w >= minimum && rect.h >= minimum),
    JSON.stringify(targets));
  return targets;
}

async function waitForRewardReady(page) {
  await page.waitForFunction(() => {
    const panel = document.querySelector('#reward-panel');
    if (!panel) return false;
    const opacity = Number.parseFloat(getComputedStyle(panel).opacity);
    return opacity >= 0.99 && panel.getAnimations().every((animation) => animation.playState === 'finished');
  }, null, { timeout: 5000 });
  await page.waitForTimeout(120);
  return page.evaluate(() => {
    const panel = document.querySelector('#reward-panel');
    const style = getComputedStyle(panel);
    return { opacity: Number.parseFloat(style.opacity), transform: style.transform };
  });
}

async function checkSubjectPlacement(page, season) {
  const placement = await page.evaluate(() => {
    const image = document.querySelector('#explore-background');
    const imageRect = image.getBoundingClientRect();
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    const contain = getComputedStyle(image).objectFit === 'contain';
    let width = imageRect.width;
    let height = width / sourceRatio;
    if ((contain && height > imageRect.height) || (!contain && height < imageRect.height)) {
      height = imageRect.height;
      width = height * sourceRatio;
    }
    const box = {
      x: imageRect.x + (imageRect.width - width) / 2,
      y: imageRect.y + (imageRect.height - height) / 2,
      width,
      height,
    };
    const point = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return {
        x: (rect.x + rect.width / 2 - box.x) / box.width,
        y: (rect.y + rect.height / 2 - box.y) / box.height,
      };
    };
    return { plant: point('#plant-hotspot'), animal: point('#animal-hotspot') };
  });
  const inZone = (point, zone) => point.x >= zone[0] && point.x <= zone[1]
    && point.y >= zone[2] && point.y <= zone[3];
  check(`${season} discovery seals hug their visible plant and animal subjects`,
    inZone(placement.plant, subjectZones[season].plant)
      && inZone(placement.animal, subjectZones[season].animal),
    JSON.stringify(placement));
}

async function runAdventureSeason(page, season, discoveryOrder, screenshotPrefix = null) {
  check(`${season} begins from the wheel`,
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'wheel');
  await page.evaluate((value) => window.QLOBE_DEBUG.settleWheel(value), season);
  await waitForScreen(page, 'dress');
  let state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check(`${season} lands on its authored dress round`, state.season === season && !state.busy, JSON.stringify(state));
  await checkTargets(page, `${season} dress`);
  if (season === 'spring') {
    const labels = await page.evaluate(() => [...document.querySelectorAll('.garment-card')].map((card) => {
      const label = card.querySelector('span');
      const cardRect = card.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      return {
        text: label.textContent,
        contained: labelRect.top >= cardRect.top && labelRect.bottom <= cardRect.bottom + 1,
        unclipped: label.scrollHeight <= label.clientHeight + 1 && label.scrollWidth <= label.clientWidth + 1,
        height: labelRect.height,
      };
    }));
    check('all landscape garment labels have a readable, unclipped paper band',
      labels.length === 4 && labels.every((label) => label.contained && label.unclipped && label.height >= 36),
      JSON.stringify(labels));
  }
  if (screenshotPrefix) await page.screenshot({ path: path.join(shots, `${screenshotPrefix}-dress.png`) });

  if (season === 'spring') {
    await page.evaluate(() => window.QLOBE_DEBUG.chooseGarment('parka'));
    state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    check('a wrong garment keeps every option available and adds one gentle attempt',
      state.screen === 'dress' && state.dressAttempts === 1 && !state.busy, JSON.stringify(state));
    await page.waitForTimeout(520);
    const wrongCue = await page.evaluate(() => ({
      selected: document.querySelector('[data-garment="parka"]')?.classList.contains('is-wrong'),
      answerGlow: document.querySelector('[data-garment="raincoat"]')?.classList.contains('is-model'),
      arrow: getComputedStyle(document.querySelector('[data-garment="parka"]'), '::after').backgroundImage,
    }));
    check('a first miss keeps a papercraft try-again arrow and illuminates the useful choice',
      wrongCue.selected && wrongCue.answerGlow && /pointer\.webp/.test(wrongCue.arrow), JSON.stringify(wrongCue));
    await page.screenshot({ path: path.join(shots, '04-spring-wrong-garment.png') });
  }

  await page.evaluate((garment) => window.QLOBE_DEBUG.chooseGarment(garment), garmentFor[season]);
  await waitForScreen(page, 'explore');
  state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check(`${season} correct garment opens exploration`, state.season === season && !state.busy, JSON.stringify(state));
  await checkTargets(page, `${season} explore`);
  await checkSubjectPlacement(page, season);
  await page.screenshot({ path: path.join(shots, `${screenshotPrefix || season}-explore.png`) });

  for (const [index, kind] of discoveryOrder.entries()) {
    await page.evaluate((value) => window.QLOBE_DEBUG.discover(value), kind);
    await page.waitForFunction(() => !document.querySelector('#fact-overlay').hidden);
    if (season === 'spring' && index === 0) {
      await page.waitForTimeout(460);
      await page.screenshot({ path: path.join(shots, '06-spring-fact-card.png') });
      await checkTargets(page, 'fact overlay');
      const focusIds = [await page.evaluate(() => document.activeElement?.id || '')];
      await page.keyboard.press('Tab');
      focusIds.push(await page.evaluate(() => document.activeElement?.id || ''));
      await page.keyboard.press('Tab');
      focusIds.push(await page.evaluate(() => document.activeElement?.id || ''));
      await page.keyboard.press('Shift+Tab');
      focusIds.push(await page.evaluate(() => document.activeElement?.id || ''));
      check('the discovery dialog traps forward and reverse keyboard focus',
        focusIds.every((id) => ['fact-close', 'fact-replay'].includes(id))
          && new Set(focusIds).size === 2,
        focusIds.join(', '));
      const blockedKind = kind === 'plant' ? 'animal' : 'plant';
      const blocked = await page.evaluate((otherKind) => ({
        result: window.QLOBE_DEBUG.discover(otherKind),
        state: window.QLOBE_DEBUG.getState(),
        focus: document.activeElement?.id || '',
      }), blockedKind);
      check('the modal blocks background discoveries until it closes',
        blocked.result === false
          && blocked.state.discoveries[blockedKind] === false
          && ['fact-close', 'fact-replay'].includes(blocked.focus),
        JSON.stringify(blocked));
      const backgroundActivation = await page.evaluate(() => {
        const beforeAudio = window.QLOBE_DEBUG.getAudioLog().length;
        const beforeState = window.QLOBE_DEBUG.getState();
        window.QLOBE_DEBUG.tap('explore-sound');
        window.QLOBE_DEBUG.tap('explore-back');
        document.querySelector('#season-complete-button').click();
        return {
          beforeState,
          state: window.QLOBE_DEBUG.getState(),
          overlayOpen: !document.querySelector('#fact-overlay').hidden,
          audioDelta: window.QLOBE_DEBUG.getAudioLog().length - beforeAudio,
        };
      });
      check('assistive activation cannot reach Back, HUD replay, or completion behind the modal',
        backgroundActivation.state.screen === 'explore'
          && backgroundActivation.overlayOpen
          && backgroundActivation.audioDelta === 0
          && backgroundActivation.state.busy === false
          && backgroundActivation.state.stamps.length === backgroundActivation.beforeState.stamps.length
          && JSON.stringify(backgroundActivation.state.discoveries)
            === JSON.stringify(backgroundActivation.beforeState.discoveries),
        JSON.stringify(backgroundActivation));
    }
    await page.locator('#fact-close').click();
    await page.waitForFunction(() => document.querySelector('#fact-overlay').hidden);
  }
  state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check(`${season} supports ${discoveryOrder.join('-then-')} discovery order`,
    state.discoveries.plant && state.discoveries.animal, JSON.stringify(state.discoveries));
  check(`${season} stamp action stays gated until both discoveries`, await page.locator('#season-complete-button').isVisible());
  await page.evaluate(() => window.QLOBE_DEBUG.completeSeason());
  const isLast = season === 'winter';
  await waitForScreen(page, isLast ? 'reward' : 'wheel');
}

async function interactionGate(browser) {
  head('landscape interaction gate');
  const landscape = await openGame(browser, { width: 1024, height: 768 });
  const page = landscape.page;
  check('splash boots with the generated title',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'splash'
      && await page.locator('.title-art').getAttribute('alt') === 'Mountain Seasons');
  await checkTargets(page, 'splash');
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  // A real child-like drag must rotate, release, settle, and reach the dress gate.
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('wheel'));
  await waitForScreen(page, 'wheel');
  await checkTargets(page, 'wheel');
  await page.screenshot({ path: path.join(shots, '02-wheel-landscape.png') });
  const beforeDrag = await page.evaluate(() => window.QLOBE_DEBUG.getState().wheelAngle);
  const box = await page.locator('#wheel-touch').boundingBox();
  await page.mouse.move(box.x + box.width * 0.76, box.y + box.height * 0.48);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.48, box.y + box.height * 0.77, { steps: 10 });
  const duringDrag = await page.evaluate(() => window.QLOBE_DEBUG.getState().wheelAngle);
  await page.mouse.up();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().spinning);
  check('direct pointer drag rotates the tactile wheel before assisted settle', Math.abs(duringDrag - beforeDrag) > 12,
    JSON.stringify({ beforeDrag, duringDrag }));
  await waitForScreen(page, 'dress');
  check('direct flick shares the full land-to-dress transition',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().season)) !== null);
  await page.locator('[data-target="dress-back"]').click();
  await waitForScreen(page, 'splash');

  // Keyboard and repeated input use the same controller, and Back cancels cleanly.
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('wheel'));
  await page.locator('#wheel-touch').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().spinning);
  await page.locator('[data-target="wheel-back"]').click();
  await waitForScreen(page, 'splash');
  let state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('Back during a keyboard spin cancels without a stuck busy state', !state.spinning && !state.busy, JSON.stringify(state));

  await page.evaluate(() => window.QLOBE_DEBUG.startMode('wheel'));
  await page.evaluate(() => { window.QLOBE_DEBUG.tap('spin'); window.QLOBE_DEBUG.tap('spin'); });
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().spinning);
  const rapidState = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('rapid spin requests collapse into one active wheel transition', rapidState.spinning && rapidState.busy, JSON.stringify(rapidState));
  await page.evaluate(() => window.QLOBE_DEBUG.home());
  await waitForScreen(page, 'splash');

  // The child-facing clothing card must activate through a real drag or click, and
  // leaving a later round through Back must return to the wheel without
  // discarding a stamp already earned.
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('wheel'));
  await waitForScreen(page, 'wheel');
  await page.evaluate(() => window.QLOBE_DEBUG.settleWheel('spring'));
  await waitForScreen(page, 'dress');
  await page.locator('[data-garment="parka"]').click();
  await page.waitForFunction(() => document.querySelector('[data-garment="raincoat"]')?.classList.contains('is-model'));
  const raincoatBox = await page.locator('[data-garment="raincoat"]').boundingBox();
  const juniBox = await page.locator('#juni-character').boundingBox();
  if (raincoatBox && juniBox) {
    await page.mouse.move(raincoatBox.x + raincoatBox.width / 2, raincoatBox.y + raincoatBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(juniBox.x + juniBox.width / 2, juniBox.y + juniBox.height / 2, { steps: 8 });
    await page.mouse.up();
  }
  await waitForScreen(page, 'explore');
  await page.evaluate(() => window.QLOBE_DEBUG.completeSeason());
  await waitForScreen(page, 'wheel');
  await page.evaluate(() => window.QLOBE_DEBUG.settleWheel('summer'));
  await waitForScreen(page, 'dress');
  await page.locator('[data-garment="sun-hat"]').click();
  await waitForScreen(page, 'explore');
  await page.locator('[data-target="explore-back"]').click();
  await waitForScreen(page, 'wheel');
  state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('a real clothing drag and click work and Back to the wheel preserves earned stamps',
    state.mode === 'wheel'
      && state.screen === 'wheel'
      && JSON.stringify(state.stamps) === JSON.stringify(['spring']),
    JSON.stringify(state));

  // A second miss can arrive while the first feedback promise is still resuming.
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('wheel'));
  await page.evaluate(() => window.QLOBE_DEBUG.settleWheel('spring'));
  await waitForScreen(page, 'dress');
  const rapidDress = await page.evaluate(async () => {
    const beforeAudio = window.QLOBE_DEBUG.getAudioLog().length;
    const first = window.QLOBE_DEBUG.chooseGarment('parka');
    const second = window.QLOBE_DEBUG.chooseGarment('sun-hat');
    await Promise.all([first, second]);
    return {
      state: window.QLOBE_DEBUG.getState(),
      prompt: document.querySelector('#dress-prompt').textContent,
      audio: window.QLOBE_DEBUG.getAudioLog().slice(beforeAudio).map((entry) => entry.key),
    };
  });
  check('rapid wrong choices finish in one consistent model state without a stale first-hint line',
    rapidDress.state.dressAttempts === 2
      && rapidDress.prompt === 'This one will help Juni feel just right.'
      && rapidDress.audio.at(-1) === 'dress-model'
      && !rapidDress.audio.includes('spring-hint'),
    JSON.stringify(rapidDress));
  await page.evaluate(() => window.QLOBE_DEBUG.home());
  await waitForScreen(page, 'splash');

  // Deterministic content sweep: no completeMode shortcut is used.
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('wheel'));
  await runAdventureSeason(page, 'spring', ['animal', 'plant'], '03-spring');
  await runAdventureSeason(page, 'summer', ['plant', 'animal'], '07-summer');
  await runAdventureSeason(page, 'autumn', ['animal', 'plant'], '08-autumn');
  await runAdventureSeason(page, 'winter', ['plant', 'animal'], '09-winter');
  state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('four complete season loops reach the adventure reward',
    state.screen === 'reward'
      && state.visited.length === 4
      && state.stamps.length === 4
      && new Set(state.visited).size === 4,
    JSON.stringify(state));
  await checkTargets(page, 'adventure reward');
  const adventureReward = await waitForRewardReady(page);
  check('adventure reward capture is taken at its opaque final entrance frame',
    adventureReward.opacity >= 0.99 && adventureReward.transform !== 'none', JSON.stringify(adventureReward));
  await page.screenshot({ path: path.join(shots, '10-adventure-reward.png') });

  const requiredContent = configContentKeys();
  const audioLog = await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog());
  const heard = new Set(audioLog.map((entry) => entry.key));
  const missed = requiredContent.filter((key) => !heard.has(key));
  check('the complete adventure requests every seasonal narration line', missed.length === 0, missed.join(', '));

  await page.locator('#again-button').click();
  await waitForScreen(page, 'wheel');
  state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('Play again restarts the same mode with a clean, Spring-up wheel',
    state.mode === 'wheel' && state.stamps.length === 0 && state.wheelAngle === 0,
    JSON.stringify(state));
  await page.locator('[data-target="wheel-back"]').click();
  await waitForScreen(page, 'splash');
  check('Back returns in-page and Home is visible only on the splash',
    (await page.evaluate(() => window.QLOBE_DEBUG.getTargets())).some((target) => target.id === 'catalog-home'));

  // Standalone clothing mode: all four actual rounds, no debug completion shortcut.
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('dress'));
  await waitForScreen(page, 'dress');
  for (let round = 0; round < 4; round += 1) {
    state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    const season = state.season;
    check(`dress round ${round + 1} exposes a valid season`, Boolean(garmentFor[season]), JSON.stringify(state));
    await page.evaluate((garment) => window.QLOBE_DEBUG.chooseGarment(garment), garmentFor[season]);
    if (round < 3) {
      await page.waitForFunction((previousRound) => {
        const next = window.QLOBE_DEBUG.getState();
        return next.screen === 'dress' && next.dressRound > previousRound && !next.busy;
      }, round);
    } else {
      await waitForScreen(page, 'reward');
    }
  }
  state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('all four standalone clothing rounds reach their own reward',
    state.mode === 'dress' && state.screen === 'reward' && state.dressCompleted.length === 4,
    JSON.stringify(state));
  const dressReward = await waitForRewardReady(page);
  check('dress reward capture is taken at its opaque final entrance frame',
    dressReward.opacity >= 0.99 && dressReward.transform !== 'none', JSON.stringify(dressReward));
  await page.screenshot({ path: path.join(shots, '11-dress-reward.png') });
  await page.locator('#again-button').click();
  await waitForScreen(page, 'dress');
  state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('dress reward Play again keeps the dress mode', state.mode === 'dress' && state.dressRound === 0);

  head('portrait and reduced-motion gate');
  const portrait = await openGame(browser, { width: 768, height: 1024 }, 'reduce');
  const portraitPage = portrait.page;
  await portraitPage.evaluate(() => window.QLOBE_DEBUG.startMode('wheel'));
  await waitForScreen(portraitPage, 'wheel');
  await portraitPage.screenshot({ path: path.join(shots, '12-wheel-portrait.png') });
  await portraitPage.evaluate(() => window.QLOBE_DEBUG.settleWheel('winter'));
  await waitForScreen(portraitPage, 'dress');
  await checkTargets(portraitPage, 'portrait dress');
  await portraitPage.screenshot({ path: path.join(shots, '13-winter-dress-portrait.png') });
  await portraitPage.evaluate(() => window.QLOBE_DEBUG.chooseGarment('parka'));
  await waitForScreen(portraitPage, 'explore');
  await checkTargets(portraitPage, 'portrait explore');
  const portraitLayout = await portraitPage.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    particles: document.querySelectorAll('.paper-particle').length,
    reduced: window.QLOBE_DEBUG.getState().reducedMotion,
    sceneFit: getComputedStyle(document.querySelector('#explore-background')).objectFit,
    backdropFit: getComputedStyle(document.querySelector('#explore-backdrop')).objectFit,
    sameScene: document.querySelector('#explore-background').currentSrc
      === document.querySelector('#explore-backdrop').currentSrc,
  }));
  check('portrait reduced-motion layout has no page overflow or active particles',
    portraitLayout.width <= portraitLayout.viewportWidth + 1
      && portraitLayout.height <= portraitLayout.viewportHeight + 1
      && portraitLayout.particles === 0
      && portraitLayout.reduced
      && portraitLayout.sceneFit === 'contain'
      && portraitLayout.backdropFit === 'cover'
      && portraitLayout.sameScene,
    JSON.stringify(portraitLayout));
  await portraitPage.screenshot({ path: path.join(shots, '14-winter-explore-portrait.png') });
  await portraitPage.evaluate(() => window.QLOBE_DEBUG.discover('animal'));
  await portraitPage.waitForFunction(() => !document.querySelector('#fact-overlay').hidden);
  await portraitPage.screenshot({ path: path.join(shots, '15-winter-fact-portrait.png') });
  await portraitPage.locator('#fact-close').click();
  await portraitPage.evaluate(() => window.QLOBE_DEBUG.completeMode());
  await waitForScreen(portraitPage, 'reward');
  await waitForRewardReady(portraitPage);
  const portraitReward = await portraitPage.evaluate(() => ({
    artFit: getComputedStyle(document.querySelector('#reward-background')).objectFit,
    backdropFit: getComputedStyle(document.querySelector('#reward-backdrop')).objectFit,
    sameScene: document.querySelector('#reward-background').currentSrc
      === document.querySelector('#reward-backdrop').currentSrc,
  }));
  check('portrait reward fits the whole four-season artwork over its raster backdrop',
    portraitReward.artFit === 'contain'
      && portraitReward.backdropFit === 'cover'
      && portraitReward.sameScene,
    JSON.stringify(portraitReward));
  await portraitPage.screenshot({ path: path.join(shots, '16-reward-portrait.png') });

  if (!skipAudio) await recordedAudioGate(browser);
  else note('real recorded-clip decode gate skipped by --skip-audio');

  const dirty = sessions.flatMap((session, index) => [
    ...session.errors.map((error) => `session${index + 1}:error:${error}`),
    ...session.failed.map((failure) => `session${index + 1}:failed:${failure}`),
    ...session.remote.map((url) => `session${index + 1}:remote:${url}`),
  ]);
  check('all browser runs have no page errors, HTTP errors, or non-analytics remote requests', dirty.length === 0, dirty.join(' | '));
}

function configContentKeys() {
  const keys = ['wheel-prompt', 'wheel-turning', 'dress-nudge', 'season-complete', 'adventure-complete'];
  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    keys.push(
      `${season}-land`, `${season}-dress`, `${season}-correct`,
      `${season}-plant`, `${season}-animal`, `${season}-stamp`,
    );
  }
  keys.push('spring-hint');
  return keys;
}

async function recordedAudioGate(browser) {
  head('recorded narration decode gate');
  const audioSession = await openGame(browser, { width: 1024, height: 768 }, 'no-preference', false);
  const page = audioSession.page;
  await page.evaluate(async () => {
    const voice = await import('../../shared/js/voice-clips.js');
    window.__mountainVoiceQa = { starts: [], channel: null };
    voice.onClip((key, channel) => {
      window.__mountainVoiceQa.channel = channel;
      window.__mountainVoiceQa.starts.push({ key, src: channel?.currentSrc || channel?.src || '' });
    });
  });
  await page.locator('#mode-wheel').click();
  await page.waitForFunction(() => {
    const log = window.QLOBE_DEBUG.getAudioLog();
    return log.some((entry) => entry.key === 'wheel-prompt' && entry.kind === 'clip');
  }, null, { timeout: 15000 });
  await page.waitForFunction(() => {
    const channel = window.__mountainVoiceQa?.channel;
    return channel?.played?.length && channel.played.end(channel.played.length - 1) > 0;
  }, null, { timeout: 15000 });
  const evidence = await page.evaluate(() => {
    const channel = window.__mountainVoiceQa.channel;
    return {
      entry: window.QLOBE_DEBUG.getAudioLog().find((item) => item.key === 'wheel-prompt'),
      start: window.__mountainVoiceQa.starts.find((item) => item.key === 'wheel-prompt'),
      played: channel.played.end(channel.played.length - 1),
      duration: Number.isFinite(channel.duration) ? channel.duration : null,
      error: channel.error?.code || null,
    };
  });
  check('a real gesture decodes and starts the recorded teacher narration',
    evidence.entry?.kind === 'clip'
      && /wheel-prompt\.m4a(?:\?|$)/.test(evidence.start?.src || '')
      && evidence.played > 0
      && evidence.duration > 0
      && !evidence.error,
    JSON.stringify(evidence));
  await page.evaluate(() => window.QLOBE_DEBUG.mute(true));
}

await ensureShots(shots);
await staticGate();
const browser = await launchChrome({ headless: true });
try {
  await interactionGate(browser);
} finally {
  for (const session of sessions) await session.close().catch(() => {});
  await browser.close().catch(() => {});
}
finish({ suffix: `; screenshots: ${shots}` });
