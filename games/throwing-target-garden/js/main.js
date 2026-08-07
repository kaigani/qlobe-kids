// Throwing Target Garden — private camera throws and equal-access Touch Toss.
// Camera pixels remain inside shared/camera-throw.js. This file receives only
// coarse color/position summaries and semantic throw events.

import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { createScreens } from '../../../shared/js/screens.js';
import { createTimers } from '../../../shared/js/timers.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { installKioskGuards, installUnlockOnGesture, unlockAll } from '../../../shared/js/audio-unlock.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { shuffle } from '../../../shared/js/rng.js';
import { onTap } from '../../../shared/js/tap.js';
import { createCameraThrow } from '../../../shared/js/camera-throw.js';
import { renderModeCards } from '../../../shared/js/mode-select.js';

const mount = document.querySelector('#game');
const A = config.assets;
const L = config.lines;
const MODES = config.modes;
const COLORS = Object.freeze(['red', 'yellow', 'blue']);
const POSITIONS = Object.freeze([0.24, 0.5, 0.76]);
const SEQUENCES = Object.freeze([[1, 2, 3], [2, 3, 4], [3, 4, 5]]);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  screen: 'splash',
  selectedMode: MODES[0]?.id || null,
  mode: null,
  phase: 'idle',
  round: 0,
  roundsTotal: 0,
  sequenceStep: 0,
  sequenceHits: [],
  target: null,
  currentPrompt: 'welcome',
  inputPath: null,
  awaitingInput: false,
  inputLocked: false,
  selectedColor: null,
  mirrored: true,
  calibrationLanes: [],
  cameraStatus: 'idle',
  tracker: { state: 'idle', reason: null, blob: null, lastThrow: null },
  debugCameraScenario: null,
  lastThrow: null,
  lastResolution: null,
  feedbackKind: null,
  attemptedTarget: null,
  fallbackNotice: null,
  seed: Date.now() >>> 0,
  muted: false,
};

let rng = Math.random;
let flowToken = 0;
let camera = null;
let disposeCameraState = null;
let disposeCameraThrow = null;
let intentionalCameraStop = false;
let calibrationFinishing = false;
let session = null;
let drag = null;
let hintTimer = null;
const timers = createTimers();

mount.innerHTML = `
  <div class="ttg-shell">
    <section id="screen-splash" class="ttg-screen" data-qk-screen="splash"></section>
    <section id="screen-setup" class="ttg-screen" data-qk-screen="setup" hidden></section>
    <section id="screen-ready" class="ttg-screen" data-qk-screen="ready" hidden></section>
    <section id="screen-play" class="ttg-screen" data-qk-screen="play" hidden></section>
    <section id="screen-reward" class="ttg-screen" data-qk-screen="reward" hidden></section>
    <section id="screen-end" class="ttg-screen" data-qk-screen="end" hidden></section>
  </div>
  <div id="media-park" class="media-park" aria-hidden="true"></div>`;

const nodes = Object.fromEntries(
  ['splash', 'setup', 'ready', 'play', 'reward', 'end']
    .map((name) => [name, document.querySelector(`#screen-${name}`)]),
);
nodes.park = document.querySelector('#media-park');

const cameraVideo = document.createElement('video');
cameraVideo.muted = true;
cameraVideo.defaultMuted = true;
cameraVideo.autoplay = true;
cameraVideo.playsInline = true;
cameraVideo.setAttribute('playsinline', '');
cameraVideo.setAttribute('aria-hidden', 'true');
nodes.park.appendChild(cameraVideo);

const narrator = createNarrator();
const screens = createScreens({
  root: mount,
  initial: 'splash',
  splash: 'splash',
  voice: narrator,
  onEnter: (name) => { state.screen = name; },
  onExit: (name, next) => {
    timers.clearAll();
    clearDrag();
    if ((name === 'ready' && next !== 'play') || name === 'play') {
      stopCamera(`left-${name}`);
    }
  },
});

const disposeUnlock = installUnlockOnGesture({
  onFirst: () => narrator.say('welcome', L.welcome),
});
const disposeKiosk = installKioskGuards();

const ready = Promise.all([
  preloadImages([...collectAssetUrls(A), ...MODES.map((mode) => mode.card)]),
  voice.init(config.voice.manifest, config.voice.lines, L),
]).then(() => {
  document.documentElement.dataset.gameReady = 'true';
  return true;
});

function collectAssetUrls(value, found = []) {
  if (typeof value === 'string') found.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectAssetUrls(item, found));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => collectAssetUrls(item, found));
  return [...new Set(found)];
}

function scene() {
  return `<img class="scene-bg" src="${attr(A.garden)}" alt="" draggable="false">`;
}

function hud({ home = false, replay = true, backLabel = 'Back to garden games' } = {}) {
  const left = home
    ? `<a class="qk-hud-btn qk-hud-home" href="../../" data-target="home" data-role="navigation" aria-label="QLOBE Kids home"></a>`
    : `<button class="qk-hud-btn qk-hud-back" type="button" data-target="back" data-role="navigation" aria-label="${attr(backLabel)}"></button>`;
  const sound = replay
    ? `<button class="qk-hud-btn qk-hud-sound" type="button" data-target="sound" data-role="replay" aria-label="Hear that again"></button>`
    : '<span></span>';
  return `<div class="ttg-hud">${left}${sound}</div>`;
}

function plate(src, text, className = '', extra = '') {
  return `<div class="felt-plate ${attr(className)}" ${extra}>
    <img src="${attr(src)}" alt="" draggable="false">
    <span>${html(text)}</span>
  </div>`;
}

function stackedPlate(src, lines, className = '', extra = '') {
  return `<div class="felt-plate ${attr(className)}" ${extra}>
    <img src="${attr(src)}" alt="" draggable="false">
    <span class="stacked-plate-lines">${lines.map((line) => `<span>${html(line)}</span>`).join(' ')}</span>
  </div>`;
}

function artButton({ id, role, src, label, compactLabel = null, className = '', aria = label, extra = '' }) {
  const visibleLabel = compactLabel
    ? `<span><span class="label-full">${html(label)}</span><span class="label-compact" aria-hidden="true">${html(compactLabel)}</span></span>`
    : label ? `<span>${html(label)}</span>` : '';
  return `<button class="art-button ${attr(className)}" type="button" data-target="${attr(id)}" data-role="${attr(role)}" aria-label="${attr(aria)}" ${extra}>
    <img src="${attr(src)}" alt="" draggable="false">
    ${visibleLabel}
  </button>`;
}

function feedback(event) {
  event.preventDefault?.();
  unlockAll();
  playSfx('tick');
}

function bindTap(root, selector, action, { withFeedback = true } = {}) {
  const element = typeof selector === 'string' ? root.querySelector(selector) : selector;
  if (!element) return null;
  return screens.hold(onTap(element, action, { feedback: withFeedback ? feedback : undefined }));
}

function wireHud(root, replay = repeatPrompt) {
  const back = root.querySelector('[data-target="back"]');
  const sound = root.querySelector('[data-target="sound"]');
  if (back) bindTap(root, back, goSplash);
  if (sound) bindTap(root, sound, replay);
}

function playSfx(name) {
  if (state.muted) return;
  try { sfx[name]?.(); } catch { /* sound can never strand play */ }
}

function renderSplash() {
  state.phase = 'idle';
  state.currentPrompt = 'welcome';
  const selectedTitle = modeById(state.selectedMode)?.title || 'Garden Game';
  nodes.splash.innerHTML = `${scene()}${hud({ home: true })}
    <div class="splash-layout">
      <img class="title-lockup" src="${attr(A.title)}" alt="Throwing Target Garden" draggable="false">
      <div class="mode-shelf" aria-label="Choose a garden game"></div>
      ${artButton({ id: 'start', role: 'start', src: A.buttonOrange, label: 'START', className: 'main-action', aria: `Start ${selectedTitle}` })}
    </div>`;
  bindTap(nodes.splash, '[data-target="sound"]', () => narrator.say('welcome', L.welcome));
  // tap:'s bare `target.click()` already fires renderModeCards()'s onTap
  // through its click fallback — no debug-harness patch needed. Tapping a
  // card only selects it (state.selectedMode); the START button below is
  // what actually begins play — unchanged from the pre-migration behavior.
  const { dispose: disposeModeCards } = renderModeCards({
    host: nodes.splash.querySelector('.mode-shelf'),
    modes: MODES,
    skin: false, // .mode-card keeps its own pixel-for-pixel look; only the
                 // shared .qk-mode-card touch-floor contract is added (a
                 // no-op — cards render far above the 96px floor here).
    cardClass: 'art-button mode-card',
    showTitle: false, // decorate() builds the title span itself
    art: (mode) => { const img = document.createElement('img'); img.src = mode.card; img.alt = ''; img.draggable = false; return img; },
    label: (mode) => `${mode.title}${mode.id === state.selectedMode ? ', selected' : ''}`,
    decorate(btn, mode) {
      const selected = mode.id === state.selectedMode;
      btn.classList.toggle('is-selected', selected);
      btn.setAttribute('aria-pressed', String(selected));
      const title = document.createElement('span');
      title.textContent = mode.title;
      btn.append(title);
    },
    onPick: (id) => selectMode(id),
    feedback,
  });
  screens.hold(disposeModeCards);
  bindTap(nodes.splash, '[data-target="start"]', startSelectedMode);
}

function selectMode(id) {
  if (!modeById(id)) return false;
  state.selectedMode = id;
  for (const card of nodes.splash.querySelectorAll('[data-mode]')) {
    const selected = card.dataset.mode === id;
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-pressed', String(selected));
    card.setAttribute('aria-label', `${modeById(card.dataset.mode).title}${selected ? ', selected' : ''}`);
  }
  const start = nodes.splash.querySelector('[data-target="start"]');
  if (start) {
    const title = modeById(id).title;
    start.setAttribute('aria-label', `Start ${title}`);
  }
  playSfx('pop');
  return true;
}

function startSelectedMode() {
  return screens.start(() => startSetup(state.selectedMode), { busy: false });
}

function startSetup(modeId) {
  const mode = modeById(modeId);
  if (!mode) return false;
  ++flowToken;
  stopCamera('new-mode', { destroy: true });
  state.mode = mode;
  state.selectedMode = mode.id;
  state.phase = 'setup';
  state.round = 0;
  state.roundsTotal = mode.rounds;
  state.sequenceStep = 0;
  state.sequenceHits = [];
  state.target = null;
  state.inputPath = null;
  state.awaitingInput = false;
  state.inputLocked = false;
  state.selectedColor = null;
  state.lastThrow = null;
  state.lastResolution = null;
  state.feedbackKind = null;
  state.attemptedTarget = null;
  state.fallbackNotice = null;
  state.calibrationLanes = [];
  state.cameraStatus = 'choice';
  state.tracker = { state: 'idle', reason: null, blob: null, lastThrow: null };
  session = buildSession(mode.id);
  screens.show('setup');
  renderSetup();
  state.currentPrompt = 'setup-safe';
  narrator.saySequence([
    ['setup-safe', L['setup-safe']],
    ['setup-choice', L['setup-choice']],
  ]);
  return true;
}

function renderSetup() {
  nodes.setup.innerHTML = `${scene()}${hud()}
    <div class="setup-layout">
      ${plate(A.buttonOrange, 'SOFT TOSSES. SAFE BASKET.', 'setup-title')}
      <img class="setup-art" src="${attr(A.setupSafe)}" alt="A tablet secured on a stand behind and above a soft basket, with a child tossing a soft beanbag underhand into the basket" draggable="false">
      <div class="path-choices" aria-label="Choose how to toss">
        ${artButton({ id: 'camera', role: 'camera-choice', src: A.buttonBlue, label: 'CAMERA TOSSES', compactLabel: 'CAMERA', className: 'path-button', aria: 'Use the private local camera to spot soft beanbag throws' })}
        ${artButton({ id: 'touch', role: 'touch-choice', src: A.buttonGreen, label: 'TOUCH TOSS', className: 'path-button', aria: 'Play with Touch Toss, no camera' })}
      </div>
      ${stackedPlate(A.panelGreen, [
        'Grown-up: secure tablet behind and above basket. Soft fabric objects only.',
        'Camera pictures stay on this tablet—never shown, recorded, saved, or uploaded.',
      ], 'safety-note', 'role="note"')}
    </div>`;
  wireHud(nodes.setup, () => narrator.saySequence([
    ['setup-safe', L['setup-safe']],
    ['setup-choice', L['setup-choice']],
  ]));
  bindTap(nodes.setup, '[data-target="camera"]', startCameraPath);
  bindTap(nodes.setup, '[data-target="touch"]', startTouchPath);
}

function startTouchPath() {
  if (!screens.is('setup') && !screens.is('ready')) return false;
  state.inputPath = 'touch';
  state.cameraStatus = 'touch';
  state.inputLocked = false;
  stopCamera('touch-choice', { destroy: true });
  beginMode({ includeIntro: true, touchIntro: true });
  return true;
}

async function startCameraPath() {
  if (state.inputLocked || !screens.is('setup')) return false;
  state.inputLocked = true;
  state.inputPath = 'camera';
  state.cameraStatus = 'requesting';
  state.calibrationLanes = [];
  calibrationFinishing = false;
  screens.show('ready');
  renderReady();
  state.currentPrompt = 'camera-requesting';
  narrator.say('camera-requesting', L['camera-requesting']);

  if (state.debugCameraScenario) {
    await runFakeCameraRequest(state.debugCameraScenario);
    return true;
  }

  ensureCamera();
  const result = await camera.request();
  if (!screens.is('ready') || state.inputPath !== 'camera') return false;
  state.inputLocked = false;
  applyCameraRequestResult(result);
  return result.state === 'live';
}

function renderReady() {
  const laneText = state.calibrationLanes.length
    ? `${state.calibrationLanes.length} garden ${state.calibrationLanes.length === 1 ? 'lane' : 'lanes'} found`
    : cameraReadyMessage();
  const copy = readyCopy();
  nodes.ready.innerHTML = `${scene()}${hud()}
    <div class="ready-layout${copy.fallback ? ' is-fallback' : ''}" data-camera-fallback-reason="${attr(copy.reason || '')}">
      ${plate(A.buttonOrange, copy.title, 'ready-title')}
      <div class="tracker-badge">
        <img src="${attr(A.badgeTracking)}" alt="" draggable="false">
        <span data-camera-message aria-live="polite">${html(laneText)}</span>
      </div>
      <div class="compass-wrap" data-lanes="${attr(state.calibrationLanes.join('-'))}">
        <img class="compass-art" src="${attr(A.trackingCompass)}" alt="Three felt flower lanes: left, center, and right" draggable="false">
        <img class="ready-flower ready-flower-left" src="${attr(A.flowerCheer)}" alt="" draggable="false">
        <img class="ready-flower ready-flower-right" src="${attr(A.flowerCheer)}" alt="" draggable="false">
        <img class="ready-basket" src="${attr(A.basket)}" alt="Soft basket below the three tracking lanes" draggable="false">
        <span class="lane-glow lane-left" aria-hidden="true"></span>
        <span class="lane-glow lane-center" aria-hidden="true"></span>
        <span class="lane-glow lane-right" aria-hidden="true"></span>
        <div class="calibration-lane-labels" aria-hidden="true">
          <span>← LEFT</span><span>CENTER</span><span>RIGHT →</span>
        </div>
      </div>
      <div class="ready-actions">
        ${artButton({ id: 'flip', role: 'camera-control', src: A.flipMapping, label: '', className: 'flip-button', aria: 'Flip left and right camera mapping' })}
        ${artButton({ id: 'ready-touch', role: 'touch-choice', src: A.buttonGreen, label: 'TOUCH TOSS', className: 'ready-touch', aria: 'Switch to Touch Toss without the camera' })}
      </div>
      ${plate(A.panelGreen, copy.guidance, 'privacy-note')}
    </div>`;
  wireHud(nodes.ready, repeatPrompt);
  bindTap(nodes.ready, '[data-target="flip"]', flipCameraMapping);
  bindTap(nodes.ready, '[data-target="ready-touch"]', startTouchPath);
}

function readyCopy() {
  const reason = cameraFallbackReason();
  const fallbacks = {
    denied: {
      title: 'CAMERA STAYED OFF',
      guidance: 'Camera permission stayed off. TOUCH TOSS plays the same game. No picture is displayed or saved.',
    },
    unavailable: {
      title: 'NO CAMERA HERE',
      guidance: 'No camera is available here. TOUCH TOSS plays the same game. No picture is displayed or saved.',
    },
    error: {
      title: 'TRACKER NEEDS A REST',
      guidance: 'The private tracker needs a rest. TOUCH TOSS plays the same game. No picture is displayed or saved.',
    },
    late: {
      title: 'CAMERA TOOK TOO LONG',
      guidance: 'The camera took too long, so it was stopped. TOUCH TOSS is ready. No picture is displayed or saved.',
    },
  };
  return reason ? {
    fallback: true,
    reason,
    ...fallbacks[reason],
  } : {
    fallback: false,
    reason: null,
    title: 'WAVE A SOFT BEANBAG',
    guidance: 'Wave across the basket area. No camera picture is displayed or saved. Visit any two flower lanes to make the map ready.',
  };
}

function cameraFallbackReason() {
  if (state.cameraStatus === 'denied') return 'denied';
  if (state.cameraStatus === 'error') return 'error';
  if (state.cameraStatus === 'unavailable') {
    return /timeout|late/i.test(state.tracker.reason || '') ? 'late' : 'unavailable';
  }
  return null;
}

function cameraReadyMessage() {
  if (state.cameraStatus === 'requesting') return 'Opening the private tracker…';
  if (state.cameraStatus === 'live') return 'Tracker ready — wave left, center, and right';
  const fallback = cameraFallbackReason();
  if (fallback === 'denied') return 'Grown-up camera permission stayed off';
  if (fallback === 'unavailable') return 'No camera is available here';
  if (fallback === 'error') return 'The private tracker needs a rest';
  if (fallback === 'late') return 'The camera was stopped after taking too long';
  return 'Choose Camera Tosses or Touch Toss';
}

function ensureCamera() {
  if (camera) return camera;
  camera = createCameraThrow({ video: cameraVideo, mirrored: state.mirrored });
  disposeCameraState = camera.subscribe(onCameraState);
  disposeCameraThrow = camera.onThrow((throwEvent) => {
    if (screens.is('play') && state.inputPath === 'camera') submitThrow(throwEvent, 'camera');
  });
  return camera;
}

function applyCameraRequestResult(result) {
  state.cameraStatus = result.state;
  state.tracker = safeTracker(result);
  updateReadyStatus();
  if (result.state === 'live') {
    state.currentPrompt = 'camera-ready';
    narrator.say('camera-ready', L['camera-ready']);
    timers.after(8000, () => {
      if (!screens.is('ready') || state.calibrationLanes.length >= 2) return;
      state.currentPrompt = 'camera-timeout';
      state.cameraStatus = 'live';
      updateReadyStatus(L['camera-timeout']);
      narrator.say('camera-timeout', L['camera-timeout']);
    });
  } else {
    const key = result.state === 'denied' ? 'camera-denied' : 'camera-lost';
    state.currentPrompt = key;
    updateReadyStatus(L[key]);
    narrator.say(key, L[key]);
  }
}

function onCameraState(snapshot) {
  state.tracker = safeTracker(snapshot);
  state.cameraStatus = snapshot.state;
  if (intentionalCameraStop) return;
  if (screens.is('ready')) {
    if (snapshot.state === 'live' && snapshot.blob && snapshot.blob.confidence >= 0.35) {
      observeCalibrationLane(laneFromX(snapshot.blob.x));
    }
    updateReadyStatus();
  }
  if (screens.is('play') && state.inputPath === 'camera'
    && ['ended', 'error', 'stopped', 'denied', 'unavailable'].includes(snapshot.state)) {
    fallbackToTouch();
  }
}

function observeCalibrationLane(lane) {
  if (!['left', 'center', 'right'].includes(lane)) return false;
  if (!state.calibrationLanes.includes(lane)) {
    state.calibrationLanes = [...state.calibrationLanes, lane];
    if (state.currentPrompt === 'camera-timeout') state.currentPrompt = 'camera-ready';
    playSfx('pop');
    updateReadyStatus();
  }
  if (state.calibrationLanes.length >= 2 && !calibrationFinishing) {
    calibrationFinishing = true;
    state.inputLocked = true;
    state.currentPrompt = 'camera-seen';
    narrator.say('camera-seen', L['camera-seen']);
    timers.after(900, () => {
      if (!screens.is('ready') || !calibrationFinishing || state.calibrationLanes.length < 2) return;
      state.inputLocked = false;
      beginMode({ includeIntro: true });
    });
  }
  return true;
}

function updateReadyStatus(message) {
  if (!screens.is('ready')) return;
  const copy = readyCopy();
  const layout = nodes.ready.querySelector('.ready-layout');
  layout?.classList.toggle('is-fallback', copy.fallback);
  if (layout) layout.dataset.cameraFallbackReason = copy.reason || '';
  const title = nodes.ready.querySelector('.ready-title > span');
  if (title) title.textContent = copy.title;
  const guidance = nodes.ready.querySelector('.privacy-note > span');
  if (guidance) guidance.textContent = copy.guidance;
  const status = nodes.ready.querySelector('[data-camera-message]');
  if (status) {
    const timeoutMessage = state.currentPrompt === 'camera-timeout' ? L['camera-timeout'] : '';
    status.textContent = (copy.fallback ? cameraReadyMessage() : message || timeoutMessage) || (state.calibrationLanes.length
      ? `${state.calibrationLanes.length} garden ${state.calibrationLanes.length === 1 ? 'lane' : 'lanes'} found`
      : cameraReadyMessage());
  }
  const compass = nodes.ready.querySelector('.compass-wrap');
  if (compass) compass.dataset.lanes = state.calibrationLanes.join('-');
}

function flipCameraMapping() {
  state.mirrored = !state.mirrored;
  camera?.setMirrored(state.mirrored);
  state.calibrationLanes = [];
  calibrationFinishing = false;
  state.inputLocked = false;
  updateReadyStatus(state.mirrored ? 'Left and right match the child' : 'Left and right mapping flipped');
  playSfx('whoosh');
  return state.mirrored;
}

async function runFakeCameraRequest(scenario) {
  await timers.wait(80);
  if (!screens.is('ready')) return;
  state.inputLocked = false;
  if (scenario === 'live') {
    applyCameraRequestResult({ state: 'live', reason: 'debug-live', mirrored: state.mirrored, blob: null, lastThrow: null });
    return;
  }
  if (scenario === 'late') {
    applyCameraRequestResult({ state: 'unavailable', reason: 'permission-timeout', mirrored: state.mirrored, blob: null, lastThrow: null });
    timers.after(500, () => { state.tracker.reason = 'late-grant-stopped'; });
    return;
  }
  const debugState = scenario === 'denied' ? 'denied' : scenario === 'unavailable' ? 'unavailable' : 'error';
  applyCameraRequestResult({ state: debugState, reason: `debug-${scenario}`, mirrored: state.mirrored, blob: null, lastThrow: null });
}

function beginMode({ includeIntro = false, touchIntro = false } = {}) {
  if (!state.mode || !session) return false;
  ++flowToken;
  state.phase = 'play';
  state.inputLocked = false;
  state.awaitingInput = true;
  state.selectedColor = null;
  state.feedbackKind = null;
  state.attemptedTarget = null;
  state.fallbackNotice = null;
  setCurrentTarget();
  screens.show('play');
  renderPlay();
  const prompt = promptForCurrent();
  state.currentPrompt = prompt;
  const lines = [];
  if (touchIntro) lines.push(['touch-ready', L['touch-ready']]);
  if (includeIntro) lines.push([state.mode.intro, L[state.mode.intro]]);
  lines.push([prompt, L[prompt]]);
  narrator.saySequence(lines);
  scheduleHint();
  return true;
}

function renderPlay({ replace = false } = {}) {
  if (replace && screens.is('play')) screens.release('play');
  const prompt = promptForCurrent();
  const progress = progressText();
  nodes.play.innerHTML = `${scene()}${hud()}
    <div class="play-status tracking-status${state.fallbackNotice ? ' has-fallback-notice' : ''}"
      ${state.inputPath === 'touch' ? 'data-touch-gesture' : ''}
      ${state.fallbackNotice ? `data-fallback-notice="${attr(state.fallbackNotice)}"` : ''}>
      <img src="${attr(A.badgeTracking)}" alt="" draggable="false">
      <span>${html(trackingLabel())}</span>
    </div>
    <div class="play-status progress-status">
      <img src="${attr(A.badgeProgress)}" alt="" draggable="false">
      <span>${html(progress)}</span>
    </div>
    ${plate(A.buttonOrange, L[prompt], 'prompt-plate', 'aria-live="polite"')}
    <div class="feedback-ribbon" data-feedback-state="" role="status" aria-live="polite" hidden></div>
    <div class="target-field" data-mode="${attr(state.mode.id)}">
      ${renderTargets()}
      <img class="garden-flower flower-left" src="${attr(A.flowerHappy)}" alt="" draggable="false">
      <img class="garden-flower flower-right" src="${attr(A.flowerHappy)}" alt="" draggable="false">
      <img class="garden-flower flower-mid flower-mid-left" src="${attr(A.flowerHappy)}" alt="" draggable="false">
      <img class="garden-flower flower-mid flower-mid-right" src="${attr(A.flowerHappy)}" alt="" draggable="false">
      <div class="impact-layer" data-safe-destination="basket" aria-hidden="true"></div>
    </div>
    ${renderThrowDock()}`;
  wireHud(nodes.play, repeatPrompt);
  wirePlayTargets();
  if (state.inputPath === 'touch') {
    wireTouchBags();
    wireTouchGuide();
  }
}

function trackingLabel() {
  if (state.inputPath === 'camera') return 'TOSS TO BASKET';
  if (state.fallbackNotice === 'camera-lost') return 'CAMERA RESTING • TOUCH TOSS';
  if (state.selectedColor) return `DRAG ${state.selectedColor.toUpperCase()} • FLICK`;
  return 'PICK • DRAG • FLICK';
}

function renderTargets() {
  if (state.mode.id === 'sequence') {
    return state.target.items.map((item) => {
      const hit = state.sequenceHits.includes(item.number);
      const current = item.number === state.target.expected;
      return targetButton({
        id: `target-${item.number}`,
        x: item.x,
        number: item.number,
        size: 'sequence',
        hit,
        current,
        label: `Number ${item.number}${current ? ', next in the trail' : ''}`,
      });
    }).join('');
  }
  return targetButton({
    id: 'target-main',
    x: state.target.x,
    number: state.mode.id === 'number' ? state.target.number : null,
    color: state.mode.id === 'color' ? state.target.color : null,
    size: 'single',
    current: true,
    label: state.mode.id === 'number' ? `Number ${state.target.number} target` : `${state.target.color} target`,
  });
}

function targetButton({ id, x, number = null, color = null, size, hit = false, current = false, label }) {
  const targetSrc = hit ? A.targets.rainbow : color ? A.targets[color] : A.targets.cream;
  return `<button class="target-button target-${attr(size)}${hit ? ' is-hit' : ''}${current ? ' is-current' : ''}" type="button"
    data-target="${attr(id)}" data-role="target" data-x="${x}" data-number="${attr(number || '')}" data-color="${attr(color || '')}" style="--target-x:${x * 100}%" aria-label="${attr(label)}">
    <img class="target-art" src="${attr(targetSrc)}" alt="" draggable="false">
    ${number ? `<img class="target-numeral" src="${attr(A.numerals[number])}" alt="" draggable="false">` : ''}
    ${hit ? `<img class="target-mark" src="${attr(A.flowerCheer)}" alt="" draggable="false">` : ''}
  </button>`;
}

function suggestedTouchColor() {
  return (state.mode?.id === 'color' ? state.target?.color : 'yellow') || 'yellow';
}

function renderThrowDock() {
  if (state.inputPath === 'camera') {
    return `<div class="camera-wait" aria-label="Toss a soft beanbag into the basket below the tablet">
      <img class="camera-basket" src="${attr(A.basket)}" alt="A soft landing basket" draggable="false">
      <div class="camera-bag-cue" aria-label="Red, yellow, and blue soft beanbags">
        ${COLORS.map((color) => `<img src="${attr(A.beanbags[color])}" alt="${attr(color)} soft beanbag" draggable="false">`).join('')}
      </div>
    </div>`;
  }
  const guideColor = state.selectedColor || suggestedTouchColor();
  return `<span class="gesture-route${state.selectedColor ? ' has-selection' : ''}" data-guide-color="${attr(guideColor)}" aria-hidden="true" hidden>
    <span class="gesture-route-origin"></span><span class="gesture-route-tip"></span>
  </span>
  <div class="touch-dock${state.selectedColor ? ' has-selection' : ''}" aria-label="Touch Toss basket" data-selected-color="${attr(state.selectedColor || '')}" data-guide-color="${attr(guideColor)}">
    <img class="basket-art" src="${attr(A.basket)}" alt="A soft landing basket" draggable="false">
    <div class="bag-row">
      ${COLORS.map((color) => `<button class="bag-button${state.selectedColor === color ? ' is-selected' : ''}${!state.selectedColor && guideColor === color ? ' is-guided' : ''}" type="button"
        data-target="bag-${attr(color)}" data-role="throw-object" data-color="${attr(color)}"
        aria-label="${attr(color)} beanbag${state.selectedColor === color ? ', selected; tap a target to choose it' : !state.selectedColor && guideColor === color ? ', suggested first; tap to select or drag in Touch Toss' : '; tap to select or drag in Touch Toss'}" aria-pressed="${state.selectedColor === color}">
        <img src="${attr(A.beanbags[color])}" alt="" draggable="false">
      </button>`).join('')}
    </div>
  </div>`;
}

function wireTouchGuide() {
  const sync = () => syncTouchGuideGeometry();
  sync();
  window.addEventListener('resize', sync);
  screens.hold(() => window.removeEventListener('resize', sync));
}

function syncTouchGuideGeometry() {
  const route = nodes.play.querySelector('.gesture-route');
  const dock = nodes.play.querySelector('.touch-dock');
  const guideColor = dock?.dataset.guideColor;
  const source = guideColor
    ? nodes.play.querySelector(`.bag-button[data-color="${cssEscape(guideColor)}"]`)
    : null;
  const target = nodes.play.querySelector('.target-button.is-current');
  if (!route || !source || !target) {
    if (route) route.hidden = true;
    return false;
  }

  const screenRect = nodes.play.getBoundingClientRect();
  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const startX = sourceRect.left + sourceRect.width * .5 - screenRect.left;
  const startY = sourceRect.top + Math.min(14, sourceRect.height * .1) - screenRect.top;
  const endX = targetRect.left + targetRect.width * .5 - screenRect.left;
  const endY = targetRect.top + targetRect.height * .8 - screenRect.top;
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 1) {
    route.hidden = true;
    return false;
  }

  route.hidden = false;
  route.dataset.guideColor = guideColor;
  route.dataset.guideTarget = target.dataset.target || '';
  route.dataset.guideTargetX = target.dataset.x || '';
  route.style.left = `${startX}px`;
  route.style.top = `${startY}px`;
  route.style.width = `${length}px`;
  route.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  return true;
}

function wirePlayTargets() {
  for (const target of nodes.play.querySelectorAll('.target-button')) {
    bindTap(nodes.play, target, () => {
      if (state.inputPath !== 'touch' || !state.selectedColor || !state.awaitingInput) {
        target.classList.add('needs-bag');
        timers.after(480, () => target.classList.remove('needs-bag'));
        if (state.inputPath === 'touch' && !state.selectedColor) {
          showFeedback('choose-a-bag');
          pulseCorrectBag();
          timers.after(900, () => clearFeedback('choose-a-bag'));
        }
        return;
      }
      const color = state.selectedColor;
      clearBagSelection();
      submitThrow({ x: Number(target.dataset.x), y: 0.5, color, speed: 1, confidence: 1 }, 'tap-target');
    });
  }
}

function wireTouchBags() {
  const bags = [...nodes.play.querySelectorAll('.bag-button')];
  for (const bag of bags) {
    const onDown = (event) => {
      if (event.isPrimary === false || drag || !state.awaitingInput || state.inputLocked) return;
      feedback(event);
      if (state.selectedColor !== bag.dataset.color) selectBag(bag.dataset.color);
      drag = {
        id: event.pointerId,
        color: bag.dataset.color,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        at: performance.now(),
        moved: false,
        node: createDragSprite(bag.dataset.color, event.clientX, event.clientY),
        suppressClickUntil: 0,
      };
      bag.classList.add('is-dragging');
    };
    const onClick = (event) => {
      if (Number(bag.dataset.suppressClickUntil || 0) > performance.now()) return;
      if (event.detail === 0) selectBag(bag.dataset.color);
    };
    bag.addEventListener('pointerdown', onDown);
    bag.addEventListener('click', onClick);
    screens.hold(() => {
      bag.removeEventListener('pointerdown', onDown);
      bag.removeEventListener('click', onClick);
    });
  }

  const onMove = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.moved ||= Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 22;
    moveDragSprite(drag.node, drag.x, drag.y);
  };
  const finish = (event, cancelled = false) => {
    if (!drag || event.pointerId !== drag.id) return;
    const active = drag;
    drag = null;
    active.node?.remove();
    const source = nodes.play.querySelector(`[data-color="${cssEscape(active.color)}"]`);
    source?.classList.remove('is-dragging');
    if (source) source.dataset.suppressClickUntil = String(performance.now() + 700);
    if (cancelled) return;
    if (!active.moved) {
      if (state.selectedColor !== active.color) selectBag(active.color);
      return;
    }
    const rect = nodes.play.querySelector('.target-field')?.getBoundingClientRect();
    if (!rect?.width) return;
    const x = clamp((active.x - rect.left) / rect.width);
    const elapsed = Math.max(16, performance.now() - active.at);
    const speed = Math.hypot(active.x - active.startX, active.y - active.startY) / elapsed;
    clearBagSelection();
    submitThrow({ x, y: clamp((active.y - rect.top) / rect.height), color: active.color, speed, confidence: 1 }, 'flick');
  };
  const onUp = (event) => finish(event, false);
  const onCancel = (event) => finish(event, true);
  const onBlur = () => clearDrag();
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('blur', onBlur);
  screens.hold(() => {
    window.removeEventListener('pointermove', onMove, { passive: true });
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('blur', onBlur);
    clearDrag();
  });
}

function createDragSprite(color, clientX, clientY) {
  const img = document.createElement('img');
  img.className = 'drag-sprite';
  img.src = A.beanbags[color];
  img.alt = '';
  img.draggable = false;
  document.body.appendChild(img);
  moveDragSprite(img, clientX, clientY);
  return img;
}

function moveDragSprite(node, x, y) {
  if (node) node.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`;
}

function clearDrag() {
  if (!drag) return;
  drag.node?.remove();
  drag = null;
  document.querySelectorAll('.is-dragging').forEach((node) => node.classList.remove('is-dragging'));
}

function selectBag(color) {
  if (!COLORS.includes(color) || state.inputPath !== 'touch') return false;
  if (['idle-hint', 'choose-a-bag'].includes(state.feedbackKind)) clearFeedback(state.feedbackKind);
  state.selectedColor = color;
  for (const bag of nodes.play.querySelectorAll('.bag-button')) {
    const selected = bag.dataset.color === color;
    bag.classList.toggle('is-selected', selected);
    bag.classList.remove('is-guided');
    bag.setAttribute('aria-pressed', String(selected));
    bag.setAttribute('aria-label', `${bag.dataset.color} beanbag${selected ? ', selected; tap a target to choose it' : '; tap to select or drag in Touch Toss'}`);
  }
  updateTrackingLabel();
  playSfx('pop');
  return true;
}

function clearBagSelection() {
  state.selectedColor = null;
  const guideColor = suggestedTouchColor();
  for (const bag of nodes.play.querySelectorAll('.bag-button')) {
    const guided = bag.dataset.color === guideColor;
    bag.classList.remove('is-selected');
    bag.classList.toggle('is-guided', guided);
    bag.setAttribute('aria-pressed', 'false');
    bag.setAttribute('aria-label', `${bag.dataset.color} beanbag${guided ? ', suggested first; tap to select or drag in Touch Toss' : '; tap to select or drag in Touch Toss'}`);
  }
  updateTrackingLabel();
}

function updateTrackingLabel() {
  const status = nodes.play.querySelector('.tracking-status');
  const label = status?.querySelector(':scope > span');
  if (label) label.textContent = trackingLabel();
  status?.classList.toggle('has-fallback-notice', Boolean(state.fallbackNotice));
  if (status) {
    if (state.fallbackNotice) status.dataset.fallbackNotice = state.fallbackNotice;
    else delete status.dataset.fallbackNotice;
  }
  const dock = nodes.play.querySelector('.touch-dock');
  dock?.classList.toggle('has-selection', Boolean(state.selectedColor));
  if (dock) {
    dock.dataset.selectedColor = state.selectedColor || '';
    dock.dataset.guideColor = state.selectedColor || suggestedTouchColor();
  }
  const route = nodes.play.querySelector('.gesture-route');
  route?.classList.toggle('has-selection', Boolean(state.selectedColor));
  if (route && dock) route.dataset.guideColor = dock.dataset.guideColor;
  syncTouchGuideGeometry();
}

function showFeedback(kind, semantic = {}) {
  clearFeedback();
  state.feedbackKind = kind;
  const ribbon = nodes.play.querySelector('.feedback-ribbon');
  if (ribbon) {
    ribbon.hidden = false;
    ribbon.dataset.feedbackState = kind;
    ribbon.textContent = feedbackText(kind);
  }
  const field = nodes.play.querySelector('.target-field');
  if (field) field.dataset.feedbackState = kind;
  const current = nodes.play.querySelector('.target-button.is-current') || nodes.play.querySelector('.target-button');
  if (current && ['near-miss', 'wrong-color', 'wrong-sequence', 'choose-a-bag', 'idle-hint'].includes(kind)) {
    current.classList.add('retry-here');
    current.dataset.retryLabel = kind === 'wrong-sequence' ? 'NEXT' : 'TRY HERE';
  }
  if (kind === 'wrong-color') {
    const correctBag = nodes.play.querySelector(`[data-color="${cssEscape(state.target.color)}"]`);
    correctBag?.classList.add('retry-match');
  }
  if (kind === 'wrong-sequence') {
    const candidates = [...nodes.play.querySelectorAll('.target-button')];
    const attempted = candidates.reduce((closest, candidate) => (
      !closest || Math.abs(Number(candidate.dataset.x) - semantic.x) < Math.abs(Number(closest.dataset.x) - semantic.x)
        ? candidate : closest
    ), null);
    if (attempted && attempted !== current) {
      attempted.classList.add('was-tried');
      attempted.dataset.attempted = 'true';
      attempted.dataset.attemptLabel = 'NICE TRY';
      state.attemptedTarget = attempted.dataset.number || attempted.dataset.target || null;
    }
  }
}

function feedbackText(kind) {
  if (kind === 'near-miss') return 'SO CLOSE • TRY THIS GARDEN LANE';
  if (kind === 'wrong-color') return `COLOR CLUE • TRY ${state.target.color.toUpperCase()}`;
  if (kind === 'wrong-sequence') return `TRAIL CLUE • ${state.target.expected} IS NEXT`;
  if (kind === 'choose-a-bag') return 'PICK A BAG • THEN CHOOSE THE TARGET';
  if (kind === 'idle-hint') {
    return state.mode.id === 'color' ? `YOUR TURN • TRY ${state.target.color.toUpperCase()}` : 'YOUR TURN • FOLLOW THE GLOW';
  }
  return 'TRY AGAIN';
}

function clearFeedback(expected = null) {
  if (expected && state.feedbackKind !== expected) return false;
  state.feedbackKind = null;
  state.attemptedTarget = null;
  const ribbon = nodes.play.querySelector('.feedback-ribbon');
  if (ribbon) {
    ribbon.hidden = true;
    ribbon.dataset.feedbackState = '';
    ribbon.textContent = '';
  }
  const field = nodes.play.querySelector('.target-field');
  if (field) delete field.dataset.feedbackState;
  for (const target of nodes.play.querySelectorAll('.target-button')) {
    target.classList.remove('retry-here', 'was-tried');
    delete target.dataset.retryLabel;
    delete target.dataset.attempted;
    delete target.dataset.attemptLabel;
  }
  nodes.play.querySelectorAll('.bag-button.retry-match').forEach((bag) => bag.classList.remove('retry-match'));
  return true;
}

async function submitThrow(semantic, source = 'debug') {
  if (!screens.is('play') || !state.awaitingInput || state.inputLocked) return false;
  clearFeedback();
  if (state.fallbackNotice) {
    state.fallbackNotice = null;
    updateTrackingLabel();
  }
  const normalized = {
    x: clamp(semantic?.x),
    y: clamp(semantic?.y ?? 0.5),
    color: COLORS.includes(semantic?.color) ? semantic.color : null,
    speed: Math.max(0, Number(semantic?.speed) || 0),
    confidence: clamp(semantic?.confidence ?? 1),
    source,
  };
  state.inputLocked = true;
  state.awaitingInput = false;
  state.lastThrow = { ...normalized };
  const mine = flowToken;
  await animateThrow(normalized);
  if (mine !== flowToken || !screens.is('play')) return false;
  return resolveThrow(normalized);
}

async function animateThrow(semantic) {
  const layer = nodes.play.querySelector('.impact-layer');
  if (!layer) return;
  const basket = nodes.play.querySelector(state.inputPath === 'camera' ? '.camera-basket' : '.basket-art');
  if (!basket) return;
  const bag = document.createElement('img');
  bag.className = 'basket-landing-preview';
  bag.dataset.safeDestination = 'basket';
  bag.src = A.beanbags[semantic.color || 'blue'];
  bag.alt = '';
  bag.draggable = false;
  layer.appendChild(bag);
  const layerRect = layer.getBoundingClientRect();
  const basketRect = basket.getBoundingClientRect();
  const landingX = basketRect.left + basketRect.width * 0.5 - layerRect.left;
  const landingY = basketRect.top + basketRect.height * 0.42 - layerRect.top;
  bag.style.left = `${Math.round(landingX)}px`;
  bag.style.top = `${Math.round(landingY)}px`;
  const duration = reducedMotion ? 1 : 520;
  const animation = bag.animate([
    { opacity: .25, transform: 'translate(-50%, calc(-50% - 120px)) rotate(-24deg) scale(.72)' },
    { offset: .72, opacity: 1, transform: 'translate(-50%, calc(-50% - 10px)) rotate(12deg) scale(1.04)' },
    { opacity: 1, transform: 'translate(-50%, -50%) rotate(7deg) scale(.92)' },
  ], { duration, easing: 'cubic-bezier(.2,.72,.28,1)', fill: 'forwards' });
  playSfx('whoosh');
  // A throttled/backgrounded tab can leave `finished` unresolved indefinitely
  // (rAF-driven WAAPI timing stalls) — race it against the animation's own
  // duration plus a buffer so a route change or a backgrounded tab can never
  // strand the caller (submitThrow awaits this before resolving the throw).
  await Promise.race([
    animation.finished.catch(() => {}),
    timers.wait(duration + 200),
  ]);
  bag.remove();
}

function resolveThrow(semantic) {
  let resolution = 'ignored';
  if (state.mode.id === 'number') {
    resolution = Math.abs(semantic.x - state.target.x) <= targetTolerance('single') ? 'hit' : 'near-miss';
  } else if (state.mode.id === 'color') {
    if (!semantic.color || semantic.confidence < 0.35) resolution = 'ignored';
    else if (semantic.color !== state.target.color) resolution = 'wrong-color';
    else resolution = Math.abs(semantic.x - state.target.x) <= targetTolerance('single') ? 'hit' : 'near-miss';
  } else if (state.mode.id === 'sequence') {
    const expected = state.target.items.find((item) => item.number === state.target.expected);
    resolution = Math.abs(semantic.x - expected.x) <= targetTolerance('sequence') ? 'hit' : 'wrong-sequence';
  }
  state.lastResolution = resolution;

  if (resolution === 'hit') {
    playSfx('sparkle');
    if (state.mode.id === 'sequence' && state.sequenceStep < 2) advanceSequenceStep();
    else showReward();
    return true;
  }
  if (resolution === 'ignored') {
    state.inputLocked = false;
    state.awaitingInput = true;
    return false;
  }
  showGentleRetry(resolution, semantic);
  return false;
}

function showGentleRetry(kind, semantic) {
  const current = nodes.play.querySelector('.target-button.is-current') || nodes.play.querySelector('.target-button');
  const promptPlate = nodes.play.querySelector('.prompt-plate');
  current?.classList.add('try-again');
  showFeedback(kind, semantic);
  playSfx('boing');
  let key = 'near-miss';
  if (kind === 'wrong-color') key = `color-nudge-${state.target.color}`;
  if (kind === 'wrong-sequence') key = 'sequence-nudge';
  state.currentPrompt = key;
  const prompt = promptPlate?.querySelector(':scope > span');
  promptPlate?.classList.add('is-guidance');
  if (prompt) prompt.textContent = L[key];
  if (kind === 'wrong-color') {
    clearBagSelection();
    if (state.inputPath === 'touch') pulseCorrectBag();
  }
  narrator.say(key, L[key]);
  const mine = flowToken;
  timers.after(780, () => {
    if (mine !== flowToken || !screens.is('play')) return;
    current?.classList.remove('try-again');
    clearFeedback(kind);
    promptPlate?.classList.remove('is-guidance');
    state.inputLocked = false;
    state.awaitingInput = true;
    state.currentPrompt = promptForCurrent();
    if (prompt) prompt.textContent = L[state.currentPrompt];
    scheduleHint();
  });
}

function advanceSequenceStep() {
  state.sequenceHits = [...state.sequenceHits, state.target.expected];
  state.sequenceStep += 1;
  state.target.expected = state.target.sequence[state.sequenceStep];
  const mine = flowToken;
  timers.after(520, () => {
    if (mine !== flowToken || !screens.is('play')) return;
    state.inputLocked = false;
    state.awaitingInput = true;
    renderPlay({ replace: true });
    const prompt = promptForCurrent();
    state.currentPrompt = prompt;
    narrator.say(prompt, L[prompt]);
    scheduleHint();
  });
}

function showReward() {
  ++flowToken;
  state.phase = 'reward';
  state.awaitingInput = false;
  state.inputLocked = false;
  screens.show('reward');
  renderReward();
  const key = hitPrompt();
  state.currentPrompt = key;
  playSfx('tada');
  narrator.say(key, L[key]);
}

function renderReward() {
  const isFinal = state.round + 1 >= state.roundsTotal;
  const number = state.mode.id === 'number' ? state.target.number
    : state.mode.id === 'sequence' ? state.target.sequence[2] : null;
  const bagColor = state.mode.id === 'color' ? state.target.color : state.lastThrow?.color || 'blue';
  const recognitionTarget = state.mode.id === 'color' ? A.targets[bagColor] : A.targets.rainbow;
  const recognitionLabel = number ? `Number ${number} recognized on screen` : `${bagColor} matched on screen`;
  const rewardHeading = state.mode.id === 'color' ? `${bagColor.toUpperCase()} MATCH!` : 'GARDEN MATCH!';
  nodes.reward.innerHTML = `${scene()}${hud()}
    <div class="reward-layout">
      ${plate(A.panelGreen, rewardHeading, 'garden-match-lockup')}
      <div class="reward-recognition" aria-label="${attr(recognitionLabel)}">
        <img class="reward-rings" src="${attr(recognitionTarget)}" alt="" draggable="false">
        ${number ? `<img class="reward-number" src="${attr(A.numerals[number])}" alt="Number ${number}" draggable="false">` : ''}
        <img class="reward-mark${number ? '' : ' reward-mark-color'}" src="${attr(A.flowerCheer)}" alt="" draggable="false">
      </div>
      <div class="reward-basket" data-safe-destination="basket">
        <img class="landed-bag" src="${attr(A.beanbags[bagColor])}" alt="${attr(bagColor)} beanbag shown safely inside the soft basket" draggable="false">
        <img class="reward-basket-art" src="${attr(A.basket)}" alt="Soft landing basket" draggable="false">
      </div>
      <img class="reward-flower flower-one" src="${attr(A.flowerCheer)}" alt="A cheering felt flower" draggable="false">
      <img class="reward-flower flower-two" src="${attr(A.flowerCheer)}" alt="" draggable="false">
      ${renderConfetti()}
      ${plate(A.badgeProgress, progressText(true), 'reward-progress')}
      ${artButton({ id: 'next', role: 'continue', src: A.buttonGreen, label: isFinal ? 'GARDEN STAR' : 'NEXT TARGET', className: 'reward-next' })}
    </div>`;
  wireHud(nodes.reward, repeatPrompt);
  bindTap(nodes.reward, '[data-target="next"]', continueAfterReward);
}

function renderConfetti() {
  const pieces = Array.from({ length: reducedMotion ? 4 : 16 }, (_, index) => {
    const ribbon = index % 3 === 0;
    return `<img class="confetti-piece confetti-${index}" src="${attr(ribbon ? A.confettiRibbon : A.confettiDot)}" alt="" draggable="false">`;
  });
  return `<div class="confetti" aria-hidden="true">${pieces.join('')}</div>`;
}

async function continueAfterReward() {
  if (state.inputLocked || !screens.is('reward')) return false;
  if (state.round + 1 >= state.roundsTotal) {
    showEnd();
    return true;
  }
  state.inputLocked = true;
  state.round += 1;
  state.sequenceStep = 0;
  state.sequenceHits = [];
  state.selectedColor = null;
  setCurrentTarget();

  if (state.inputPath === 'camera') {
    state.cameraStatus = 'requesting';
    let result;
    if (state.debugCameraScenario === 'live') {
      result = { state: 'live', reason: 'debug-resume', mirrored: state.mirrored, blob: null, lastThrow: null };
    } else {
      ensureCamera();
      result = await camera.request();
    }
    if (!screens.is('reward')) return false;
    if (result.state !== 'live') {
      state.inputPath = 'touch';
      state.cameraStatus = result.state;
      narrator.say('camera-lost', L['camera-lost']);
    } else {
      state.cameraStatus = 'live';
    }
  }
  state.inputLocked = false;
  beginMode({ includeIntro: false, touchIntro: false });
  return true;
}

function showEnd() {
  ++flowToken;
  state.phase = 'end';
  state.awaitingInput = false;
  state.inputLocked = false;
  stopCamera('mode-end');
  screens.show('end');
  renderEnd();
  state.currentPrompt = state.mode.end;
  playSfx('tada');
  narrator.saySequence([
    ['garden-star', L['garden-star']],
    [state.mode.end, L[state.mode.end]],
  ]);
}

function renderEnd() {
  nodes.end.innerHTML = `${scene()}${hud()}
    <div class="end-layout">
      ${plate(A.buttonOrange, 'GARDEN STAR!', 'end-title')}
      <div class="end-basket" data-safe-destination="basket" aria-label="Three colorful beanbags resting in the soft basket">
        <div class="end-bag-row" aria-hidden="true">
          ${COLORS.map((color) => `<img class="end-bag end-bag-${attr(color)}" src="${attr(A.beanbags[color])}" alt="" draggable="false">`).join('')}
        </div>
        <img class="end-basket-art" src="${attr(A.basket)}" alt="" draggable="false">
      </div>
      <img class="end-flower end-flower-left" src="${attr(A.flowerCheer)}" alt="A cheering felt flower" draggable="false">
      <img class="end-flower end-flower-right" src="${attr(A.flowerCheer)}" alt="" draggable="false">
      ${renderConfetti()}
      ${plate(A.panelGreen, L[state.mode.end], 'end-message')}
      <div class="end-actions">
        ${artButton({ id: 'again', role: 'restart', src: A.buttonOrange, label: 'PLAY AGAIN', className: 'end-button' })}
        ${artButton({ id: 'choose', role: 'navigation', src: A.buttonBlue, label: 'CHOOSE ANOTHER', compactLabel: 'OTHER GAME', className: 'end-button', aria: 'Choose another garden game' })}
      </div>
    </div>`;
  wireHud(nodes.end, repeatPrompt);
  bindTap(nodes.end, '[data-target="again"]', () => startSetup(state.mode.id));
  bindTap(nodes.end, '[data-target="choose"]', goSplash);
}

function buildSession(modeId) {
  if (modeId === 'number') {
    return { numbers: shuffle([1, 2, 3, 4, 5], rng), positions: noRepeatPositions(5) };
  }
  if (modeId === 'color') {
    return { colors: colorDeck(5), positions: noRepeatPositions(5) };
  }
  return {
    trails: SEQUENCES.map((sequence) => ({
      sequence: [...sequence],
      positions: shuffle([...POSITIONS], rng),
    })),
  };
}

function setCurrentTarget() {
  if (state.mode.id === 'number') {
    state.target = { number: session.numbers[state.round], x: session.positions[state.round] };
    return;
  }
  if (state.mode.id === 'color') {
    state.target = { color: session.colors[state.round], x: session.positions[state.round] };
    return;
  }
  const trail = session.trails[state.round];
  state.target = {
    sequence: [...trail.sequence],
    expected: trail.sequence[state.sequenceStep],
    items: trail.sequence.map((number, index) => ({ number, x: trail.positions[index] })),
  };
}

function noRepeatPositions(count) {
  // The first target teaches the relationship in the calm center; later rounds
  // exercise left/right aiming without repeating a lane back-to-back.
  const result = count > 0 ? [POSITIONS[1]] : [];
  while (result.length < count) {
    const options = POSITIONS.filter((position) => position !== result.at(-1));
    result.push(options[Math.floor(rng() * options.length)]);
  }
  return result;
}

function colorDeck(count) {
  const result = [];
  while (result.length < count) {
    const options = COLORS.filter((color) => !(result.at(-1) === color && result.at(-2) === color));
    result.push(options[Math.floor(rng() * options.length)]);
  }
  return result;
}

function promptForCurrent() {
  if (!state.mode || !state.target) return state.currentPrompt || 'welcome';
  if (state.mode.id === 'number') return `number-${state.target.number}`;
  if (state.mode.id === 'color') return `color-${state.target.color}`;
  const n = state.target.expected;
  if (state.sequenceStep === 0) return `sequence-first-${n}`;
  if (state.sequenceStep === 1) return `sequence-next-${n}`;
  return `sequence-last-${n}`;
}

function hitPrompt() {
  if (state.mode.id === 'number') return `number-hit-${state.target.number}`;
  if (state.mode.id === 'color') return `color-hit-${state.target.color}`;
  return 'sequence-trail';
}

function progressText(completed = false) {
  const round = Math.min(state.roundsTotal, state.round + (completed ? 1 : 1));
  if (state.mode?.id === 'sequence' && !completed) return `ROUND ${round} OF ${state.roundsTotal}`;
  return `${round}/${state.roundsTotal}`;
}

function targetTolerance(type) {
  const portrait = innerHeight > innerWidth;
  if (type === 'sequence') return portrait ? 0.15 : 0.115;
  return portrait ? 0.22 : 0.18;
}

function laneFromX(x) {
  if (x < 1 / 3) return 'left';
  if (x > 2 / 3) return 'right';
  return 'center';
}

function showIdleHint() {
  hintTimer = null;
  if (!screens.is('play') || !state.awaitingInput) return false;
  repeatPrompt();
  const target = nodes.play.querySelector('.target-button.is-current') || nodes.play.querySelector('.target-button');
  target?.classList.add('idle-pulse');
  showFeedback('idle-hint');
  if (state.mode.id === 'color' && state.inputPath === 'touch') pulseCorrectBag();
  timers.after(900, () => {
    target?.classList.remove('idle-pulse');
    clearFeedback('idle-hint');
  });
  scheduleHint();
  return true;
}

function scheduleHint() {
  if (hintTimer !== null) timers.clear(hintTimer);
  hintTimer = timers.after(10500, showIdleHint);
}

function triggerIdleHint() {
  if (hintTimer !== null) timers.clear(hintTimer);
  hintTimer = null;
  return showIdleHint();
}

function pulseCorrectBag() {
  const color = state.mode?.id === 'color' ? state.target?.color : 'blue';
  const bag = nodes.play.querySelector(`[data-color="${cssEscape(color)}"]`);
  bag?.classList.add('hint-pulse');
  timers.after(900, () => bag?.classList.remove('hint-pulse'));
}

function repeatPrompt() {
  const key = state.currentPrompt || promptForCurrent();
  return narrator.say(key, L[key]);
}

function fallbackToTouch() {
  if (!screens.is('play') || state.inputPath !== 'camera') return false;
  ++flowToken;
  timers.clearAll();
  hintTimer = null;
  state.inputPath = 'touch';
  state.cameraStatus = 'lost';
  state.inputLocked = false;
  state.awaitingInput = true;
  state.feedbackKind = null;
  state.attemptedTarget = null;
  state.fallbackNotice = 'camera-lost';
  stopCamera('camera-lost');
  renderPlay({ replace: true });
  const prompt = promptForCurrent();
  state.currentPrompt = prompt;
  narrator.saySequence([
    ['camera-lost', L['camera-lost']],
    [prompt, L[prompt]],
  ]);
  scheduleHint();
  return true;
}

function stopCamera(reason = 'stopped', { destroy = false } = {}) {
  if (!camera) return;
  intentionalCameraStop = true;
  try {
    if (destroy) {
      disposeCameraState?.();
      disposeCameraThrow?.();
      disposeCameraState = null;
      disposeCameraThrow = null;
      camera.destroy();
      camera = null;
    } else {
      camera.stop(reason);
    }
  } finally {
    intentionalCameraStop = false;
  }
}

function safeTracker(snapshot = {}) {
  const blob = snapshot.blob ? {
    color: snapshot.blob.color || null,
    x: round(snapshot.blob.x),
    y: round(snapshot.blob.y),
    area: round(snapshot.blob.area),
    confidence: round(snapshot.blob.confidence),
  } : null;
  const lastThrow = snapshot.lastThrow ? {
    x: round(snapshot.lastThrow.x),
    y: round(snapshot.lastThrow.y),
    color: snapshot.lastThrow.color || null,
    speed: round(snapshot.lastThrow.speed),
    confidence: round(snapshot.lastThrow.confidence),
    reason: snapshot.lastThrow.reason || null,
  } : null;
  return {
    state: snapshot.state || 'idle',
    reason: snapshot.reason || null,
    mirrored: snapshot.mirrored ?? state.mirrored,
    blob,
    lastThrow,
  };
}

function goSplash() {
  ++flowToken;
  timers.clearAll();
  narrator.stop();
  stopCamera('splash', { destroy: true });
  clearDrag();
  session = null;
  state.mode = null;
  state.phase = 'idle';
  state.round = 0;
  state.roundsTotal = 0;
  state.sequenceStep = 0;
  state.sequenceHits = [];
  state.target = null;
  state.inputPath = null;
  state.awaitingInput = false;
  state.inputLocked = false;
  state.selectedColor = null;
  state.calibrationLanes = [];
  state.cameraStatus = 'idle';
  state.tracker = { state: 'idle', reason: null, blob: null, lastThrow: null };
  state.lastThrow = null;
  state.lastResolution = null;
  state.feedbackKind = null;
  state.attemptedTarget = null;
  state.fallbackNotice = null;
  state.currentPrompt = 'welcome';
  screens.show('splash', { force: screens.is('splash') });
  renderSplash();
  return true;
}

function modeById(id) {
  return MODES.find((mode) => mode.id === id) || null;
}

function getState() {
  return {
    screen: state.screen,
    phase: state.phase,
    selectedMode: state.selectedMode,
    mode: state.mode?.id || null,
    round: state.round,
    roundsTotal: state.roundsTotal,
    sequenceStep: state.sequenceStep,
    target: state.target ? JSON.parse(JSON.stringify(state.target)) : null,
    prompt: state.currentPrompt,
    inputPath: state.inputPath,
    awaitingInput: state.awaitingInput,
    inputLocked: state.inputLocked,
    selectedColor: state.selectedColor,
    calibrationLanes: [...state.calibrationLanes],
    camera: { status: state.cameraStatus, ...state.tracker },
    lastThrow: state.lastThrow ? { ...state.lastThrow } : null,
    lastResolution: state.lastResolution,
    feedbackKind: state.feedbackKind,
    attemptedTarget: state.attemptedTarget,
    fallbackNotice: state.fallbackNotice,
    muted: state.muted,
    pendingTimers: timers.size(),
    seed: state.seed,
  };
}

function correctThrow() {
  if (!state.target) return { x: 0.5, y: 0.5, color: 'blue', speed: 1, confidence: 1 };
  if (state.mode.id === 'color') return { x: state.target.x, y: 0.5, color: state.target.color, speed: 1, confidence: 1 };
  if (state.mode.id === 'sequence') {
    const item = state.target.items.find((candidate) => candidate.number === state.target.expected);
    return { x: item.x, y: 0.5, color: 'blue', speed: 1, confidence: 1 };
  }
  return { x: state.target.x, y: 0.5, color: 'blue', speed: 1, confidence: 1 };
}

function setCameraScenario(scenario = null) {
  const allowed = [null, 'live', 'denied', 'unavailable', 'error', 'late'];
  state.debugCameraScenario = allowed.includes(scenario) ? scenario : null;
  return state.debugCameraScenario;
}

function simulateCamera(scenario = 'live') {
  setCameraScenario(scenario);
  if (screens.is('ready')) {
    state.inputLocked = false;
    const cameraState = scenario === 'live' ? 'live'
      : scenario === 'denied' ? 'denied'
        : scenario === 'unavailable' || scenario === 'late' ? 'unavailable' : 'error';
    applyCameraRequestResult({
      state: cameraState,
      reason: scenario === 'late' ? 'late-grant-stopped' : `debug-${scenario}`,
      mirrored: state.mirrored,
      blob: null,
      lastThrow: null,
    });
  } else if (screens.is('play') && ['lost', 'ended', 'hidden'].includes(scenario)) {
    fallbackToTouch();
  }
  return getState().camera;
}

const disposeDebug = installDebug({
  gameId: config.id,
  engine: 'throwing-target-garden-custom',
  version: 1,
  ready,
  timers,
  root: mount,
  listModes: () => MODES.map(({ id, title }) => ({ id, title })),
  startMode: async (id) => { await ready; startSetup(id); return getState(); },
  getState,
  tap: async (id) => {
    // Target names such as "back" and "sound" intentionally repeat across
    // screens. Debug taps must follow the child's visible route rather than
    // activating the first matching control left in a hidden screen's DOM.
    const activeScreen = screens.el(state.screen) || mount;
    const target = activeScreen.querySelector(`[data-target="${cssEscape(id)}"]`);
    if (!target) return false;
    target.click();
    await Promise.resolve();
    return true;
  },
  winRound: () => submitThrow(correctThrow(), 'debug-win'),
  home: () => { goSplash(); return getState(); },
  mute: (on = true) => {
    state.muted = Boolean(on);
    narrator.setMuted(state.muted);
    voice.setMuted(state.muted);
    sfx.setMuted?.(state.muted);
    return state.muted;
  },
  onSeed: (next, seed) => { rng = next; state.seed = seed; },
  getAudioLog: () => voice.getAudioLog(),
  repeatPrompt,
  triggerHint: triggerIdleHint,
  chooseInput: (path) => path === 'touch' ? startTouchPath() : startCameraPath(),
  injectThrow: (semantic) => submitThrow(semantic, 'debug-inject'),
  flick: (x, color = 'blue') => submitThrow({ x, y: 0.5, color, speed: 1, confidence: 1 }, 'debug-flick'),
  selectBag,
  calibrateLane: observeCalibrationLane,
  setCameraScenario,
  simulateCamera,
  cameraDenied: () => simulateCamera('denied'),
  cameraUnavailable: () => simulateCamera('unavailable'),
  cameraLost: () => simulateCamera('lost'),
  cameraLateGrant: () => simulateCamera('late'),
  getCameraState: () => ({ status: state.cameraStatus, ...state.tracker }),
});

function cleanup() {
  ++flowToken;
  timers.clearAll();
  clearDrag();
  stopCamera('destroyed', { destroy: true });
  narrator.dispose();
  screens.destroy();
  disposeDebug?.();
  disposeUnlock?.();
  disposeKiosk?.();
}

window.addEventListener('pagehide', cleanup, { once: true });

function clamp(value, low = 0, high = 1) {
  return Math.max(low, Math.min(high, Number(value) || 0));
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function html(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function attr(value) { return html(value); }
function round(value) { return Math.round((Number(value) || 0) * 1000) / 1000; }

renderSplash();
