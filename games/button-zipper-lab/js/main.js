import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import { installKioskGuards, installUnlockOnGesture, unlockAll } from '../../../shared/js/audio-unlock.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { hudButton, progressDots, soundDebounce } from '../../../shared/js/hud.js';
import { renderModeCards } from '../../../shared/js/mode-select.js';
import { createBag, createScreens } from '../../../shared/js/screens.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTimers } from '../../../shared/js/timers.js';
import { mulberry32 } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';
import {
  createConstrainedGestureDom,
  nearestStop,
  projectPointToPolyline,
} from '../../../shared/js/stage/constrained-gesture-dom.js';

const mount = document.getElementById('game');
const stage = document.getElementById('activity-stage');
const boardArt = document.getElementById('board-art');
const fastener = document.getElementById('fastener');
const fastenerArt = document.getElementById('fastener-art');
const supportZone = document.getElementById('support-zone');
const promptText = document.getElementById('prompt-text');
const modeKicker = document.getElementById('mode-kicker');
const gestureCaption = document.getElementById('gesture-caption');
const roundDots = document.getElementById('round-dots');
const roundBadge = document.getElementById('round-badge');
const rewardPatch = document.getElementById('reward-patch');
const rewardTitle = document.getElementById('reward-title');
const rewardMessage = document.getElementById('reward-message');
const PROGRESS_KEY = 'qlobe-button-zipper-lab-patches-v1';
const modeById = Object.fromEntries(config.modes.map((mode) => [mode.id, mode]));
const timers = createTimers();
const roundBag = createBag();

const state = {
  screen: 'splash',
  mode: null,
  round: 0,
  phase: 'drag',
  progress: 0,
  checkpoint: 0,
  misses: 0,
  holdTaps: 0,
  holdPointer: null,
  holdStarted: 0,
  holdTimer: null,
  transitioning: false,
  muted: false,
  seed: 42,
  rng: mulberry32(42),
  lastVoiceKey: 'welcome',
  completed: new Set(loadCompleted()),
};

let gesture = null;
let modeCards = null;
let cancelConfetti = null;

const assetUrls = [
  './assets/title.webp', './assets/splash-bg.webp', './assets/reward-bg.webp',
  './assets/ui/helper-paw.webp',
  ...config.modes.flatMap((mode) => [mode.card, mode.board, mode.piece, mode.patch]),
];

const ready = Promise.all([
  voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
  preloadImages(assetUrls),
]).then(() => true);

const screens = createScreens({
  root: mount,
  initial: 'splash',
  voice,
  splash: 'splash',
});

const idle = createNudger({
  first: 11000,
  repeat: 13000,
  onNudge: (count) => {
    if (state.screen !== 'play' || state.transitioning) return;
    stage.classList.add('show-helper');
    say(count > 0 && state.mode === 'zipper' ? 'zipper-help' : 'idle');
  },
});

installKioskGuards();
installUnlockOnGesture({
  onFirst: () => ready.then(() => {
    if (state.screen === 'splash') say('welcome');
  }),
});

wireHud();
wireEndActions();
renderSplash();

function line(key) { return config.voice[key] || ''; }
function say(key) {
  state.lastVoiceKey = key || state.lastVoiceKey;
  if (state.muted || !key) return Promise.resolve(false);
  return voice.say(key, line(key));
}

function playSound(name = 'tick') {
  unlockAll();
  if (state.muted) return;
  try { sfx[name]?.(); } catch { /* sound never carries game state */ }
}

function loadCompleted() {
  try {
    const value = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '[]');
    return Array.isArray(value) ? value.filter((id) => modeById[id]) : [];
  } catch { return []; }
}

function saveCompleted() {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify([...state.completed])); } catch { /* private mode */ }
}

function wireHud() {
  const repeat = soundDebounce(() => say(state.lastVoiceKey || 'welcome'));
  const slots = ['splash-sound', 'play-sound', 'end-sound'];
  for (const id of slots) {
    const button = hudButton('sound', repeat, { label: 'Hear the instruction again' });
    button.dataset.target = `${id}-repeat`;
    document.getElementById(id).append(button);
  }
  const playBack = hudButton('back', () => showSplash({ greet: false }), { label: 'Choose another fastener' });
  playBack.dataset.target = 'back';
  document.getElementById('play-back').append(playBack);
  const endBack = hudButton('back', () => showSplash({ greet: false }), { label: 'Choose another fastener' });
  endBack.dataset.target = 'end-back';
  document.getElementById('end-back').append(endBack);
}

function wireEndActions() {
  onTap(document.getElementById('again-button'), () => {
    playSound('tick');
    const id = state.mode;
    say('again');
    startMode(id);
  }, { feedback: () => unlockAll() });
  onTap(document.getElementById('choose-button'), () => {
    playSound('tick');
    showSplash({ greet: true });
  }, { feedback: () => unlockAll() });
}

function renderSplash() {
  modeCards?.dispose();
  modeCards = renderModeCards({
    host: document.getElementById('mode-cards'),
    modes: config.modes,
    skin: false,
    art: (mode) => mode.card,
    showTitle: true,
    cardClass: 'felt-mode-card',
    onPick: (id) => startMode(id),
    feedback: (event) => {
      event.preventDefault();
      unlockAll();
      playSound('tick');
    },
    decorate: (button, mode) => {
      if (!state.completed.has(mode.id)) return;
      const badge = document.createElement('img');
      badge.className = 'card-earned-patch';
      badge.src = mode.patch;
      badge.alt = '';
      badge.setAttribute('aria-hidden', 'true');
      button.append(badge);
    },
  });
  renderPatches(document.getElementById('splash-patches'));
}

function renderPatches(host) {
  host.replaceChildren();
  for (const mode of config.modes) {
    if (state.completed.has(mode.id)) {
      const image = document.createElement('img');
      image.className = 'earned-patch';
      image.src = mode.patch;
      image.alt = `${mode.title} patch earned`;
      host.append(image);
    } else {
      const ghost = document.createElement('span');
      ghost.className = 'patch-ghost';
      ghost.setAttribute('aria-label', `${mode.title} patch not earned yet`);
      host.append(ghost);
    }
  }
}

function showSplash({ greet = false } = {}) {
  cleanupRound();
  state.screen = 'splash';
  state.mode = null;
  state.transitioning = false;
  screens.show('splash');
  renderSplash();
  state.lastVoiceKey = 'welcome';
  if (greet) say('welcome');
}

async function startMode(id) {
  const mode = modeById[id];
  if (!mode) return false;
  await ready;
  return screens.start(async () => {
    cleanupRound();
    state.screen = 'play';
    state.mode = id;
    state.round = 0;
    state.phase = initialPhase(mode);
    state.progress = 0;
    state.checkpoint = 0;
    state.misses = 0;
    state.holdTaps = 0;
    state.transitioning = false;
    screens.show('play', { force: screens.is('play') });
    screens.hold(cleanupRound);
    renderRound();
    say(`mode-${id}`);
    const introMs = Math.max(1000, (voice.duration(`mode-${id}`) || 1.05) * 1000 + 140);
    timers.after(introMs, () => {
      if (state.screen === 'play' && state.mode === id && state.round === 0) say(mode.startVoice);
    });
    return true;
  }, { busy: false });
}

function initialPhase(mode) {
  return mode.kind === 'velcro' ? 'peel' : 'drag';
}

function cleanupRound() {
  idle.stop();
  timers.clearAll();
  roundBag.run();
  gesture?.detach();
  gesture = null;
  state.holdPointer = null;
  state.holdTimer = null;
  stage?.classList.remove('is-holding', 'is-miss', 'is-round-complete', 'show-helper');
  cancelConfetti?.();
  cancelConfetti = null;
}

function renderRound() {
  const mode = modeById[state.mode];
  if (!mode) return;
  cleanupRound();
  state.phase = initialPhase(mode);
  state.progress = 0;
  state.checkpoint = 0;
  state.misses = 0;
  state.holdTaps = 0;
  state.transitioning = false;
  fastener.classList.remove('is-held', 'is-snapped');

  document.documentElement.style.setProperty('--mode-accent', mode.accent);
  stage.style.setProperty('--mode-accent', mode.accent);
  stage.dataset.mode = mode.kind;
  stage.dataset.phase = state.phase;
  boardArt.src = mode.board;
  boardArt.alt = `${mode.title} practice board with a friendly felt bear`;
  fastenerArt.src = mode.piece;
  fastener.setAttribute('aria-label', fastenerLabel(mode));
  modeKicker.textContent = `${mode.title.toUpperCase()} · ${state.round + 1} OF ${config.roundsPerMode}`;
  promptText.textContent = promptFor(mode, state.phase);
  gestureCaption.textContent = captionFor(mode, state.phase);
  roundDots.replaceChildren(progressDots(config.roundsPerMode, state.round));
  roundBadge.querySelector('strong').textContent = String(state.round + 1);
  roundBadge.setAttribute('aria-label', `Round ${state.round + 1} of ${config.roundsPerMode}`);
  setTrack(mode);
  updatePiece(0, { animate: false });

  gesture = createConstrainedGestureDom({
    slop: 9,
    getHandle: () => fastener,
    canStart: () => state.screen === 'play' && !state.transitioning && state.phase !== 'press',
    project: (point, active) => projectToCurrentPath(point, active),
    onStart: (active) => {
      const rect = fastener.getBoundingClientRect();
      active.meta.grabOffset = {
        x: active.startPoint.x - (rect.left + rect.width / 2),
        y: active.startPoint.y - (rect.top + rect.height / 2),
      };
      idle.poke();
      fastener.classList.add('is-held');
      playSound(state.mode === 'velcro' ? 'unpop' : 'pop');
    },
    onProgress: (active) => {
      idle.poke();
      updatePiece(active.progress, { animate: false });
    },
    onRelease: (active) => {
      fastener.classList.remove('is-held');
      updatePiece(active.progress, { animate: true });
      commitOrBump();
    },
    onTap: () => {
      fastener.classList.remove('is-held');
      tapAdvance();
    },
    onCancel: () => {
      fastener.classList.remove('is-held');
      updatePiece(state.checkpoint, { animate: true });
    },
    onSupportChange: (support) => {
      supportZone.classList.toggle('is-held', Boolean(support));
      if (support) {
        stage.classList.remove('show-helper');
        idle.poke();
      }
    },
  });

  const onFastenerDown = (event) => {
    if (state.phase === 'press') startHold(event);
    else gesture.begin(event, state.mode, { round: state.round, phase: state.phase });
  };
  const onSupportDown = (event) => gesture.beginSupport(event, { role: 'steady-jacket' });
  const onKey = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (state.phase === 'press') tapPress();
    else tapAdvance();
  };
  const onHoldUp = (event) => finishHold(event, false);
  const onHoldCancel = (event) => finishHold(event, true);
  const onWindowBlur = () => cancelHold();
  const onVisibilityChange = () => { if (document.hidden) cancelHold(); };
  const onOrientationChange = () => {
    cancelHold();
    gesture?.cancel('orientationchange');
  };
  fastener.addEventListener('pointerdown', onFastenerDown, { passive: false });
  fastener.addEventListener('keydown', onKey);
  supportZone.addEventListener('pointerdown', onSupportDown, { passive: false });
  window.addEventListener('pointerup', onHoldUp, { passive: false });
  window.addEventListener('pointercancel', onHoldCancel, { passive: false });
  window.addEventListener('blur', onWindowBlur);
  window.addEventListener('orientationchange', onOrientationChange);
  document.addEventListener('visibilitychange', onVisibilityChange);
  roundBag.add(
    () => fastener.removeEventListener('pointerdown', onFastenerDown),
    () => fastener.removeEventListener('keydown', onKey),
    () => supportZone.removeEventListener('pointerdown', onSupportDown),
    () => window.removeEventListener('pointerup', onHoldUp),
    () => window.removeEventListener('pointercancel', onHoldCancel),
    () => window.removeEventListener('blur', onWindowBlur),
    () => window.removeEventListener('orientationchange', onOrientationChange),
    () => document.removeEventListener('visibilitychange', onVisibilityChange),
    () => gesture?.detach(),
  );
  idle.arm();
}

function fastenerLabel(mode) {
  if (mode.kind === 'zipper') return 'Zipper pull. Drag it upward or tap it in small steps.';
  if (mode.kind === 'button') return 'Button. Drag it through the buttonhole or tap it in small steps.';
  if (mode.kind === 'snap') return 'Snap flap. Slide it to the shiny snap, then press and hold.';
  return 'Hook-and-loop tab. Peel it away, then smooth it down.';
}

function promptFor(mode, phase) {
  if (mode.kind === 'snap' && phase === 'press') return 'Press and hold';
  if (mode.kind === 'velcro' && phase === 'smooth') return 'Smooth it down';
  if (mode.kind === 'button') return 'Guide it through';
  if (mode.kind === 'snap') return 'Match the shiny parts';
  if (mode.kind === 'velcro') return 'Peel the tab';
  return 'Zip to the top';
}

function captionFor(mode, phase) {
  if (mode.kind === 'snap' && phase === 'press') return 'PRESS & HOLD';
  if (mode.kind === 'velcro' && phase === 'smooth') return 'SMOOTH ACROSS';
  return mode.instruction.toUpperCase();
}

function normalizedPath() {
  const round = state.round;
  const mode = modeById[state.mode];
  if (!mode) return [{ x: .5, y: .5 }, { x: .5, y: .5 }];
  if (mode.kind === 'zipper') {
    return [{ x: .5, y: .78 }, { x: .5 + (round - 1) * .006, y: .61 }, { x: .5, y: .47 }];
  }
  if (mode.kind === 'button') {
    const y = [.54, .66, .78][round] || .66;
    return [{ x: .705, y }, { x: .57, y: y - .075 }, { x: .455, y: y + .035 }, { x: .355, y }];
  }
  if (mode.kind === 'snap') {
    return [{ x: .30, y: .62 }, { x: .48, y: .54 - round * .008 }, { x: .68, y: .62 }];
  }
  if (state.phase === 'smooth') {
    return [{ x: .70, y: .58 }, { x: .53, y: .60 }, { x: .34, y: .58 }];
  }
  return [{ x: .50, y: .59 }, { x: .58, y: .50 }, { x: .71, y: .36 }];
}

function projectToCurrentPath(point, active) {
  const rect = stage.getBoundingClientRect();
  const clientPath = normalizedPath().map((p) => ({ x: rect.left + p.x * rect.width, y: rect.top + p.y * rect.height }));
  const offset = active?.meta?.grabOffset || { x: 0, y: 0 };
  return projectPointToPolyline({ x: point.x - offset.x, y: point.y - offset.y }, clientPath);
}

function pointAlongPath(path, progress) {
  if (!path.length) return { x: .5, y: .5 };
  if (path.length === 1) return path[0];
  const lengths = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const length = Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
    lengths.push(length);
    total += length;
  }
  let target = Math.max(0, Math.min(1, progress)) * total;
  for (let i = 0; i < lengths.length; i += 1) {
    if (target <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] > 0 ? target / lengths[i] : 0;
      return {
        x: path[i].x + (path[i + 1].x - path[i].x) * t,
        y: path[i].y + (path[i + 1].y - path[i].y) * t,
      };
    }
    target -= lengths[i];
  }
  return path[path.length - 1];
}

function updatePiece(progress, { animate = true } = {}) {
  const value = Math.max(0, Math.min(1, Number(progress) || 0));
  const point = pointAlongPath(normalizedPath(), value);
  state.progress = value;
  fastener.style.setProperty('--piece-x', point.x.toFixed(4));
  fastener.style.setProperty('--piece-y', point.y.toFixed(4));
  fastener.style.setProperty('--piece-rotation', pieceRotation(value));
  fastener.style.transitionDuration = animate ? '' : '0ms';
  fastener.setAttribute('aria-valuenow', String(Math.round(value * 100)));
  stage.style.setProperty('--progress', value.toFixed(4));
  stage.style.setProperty('--zip-height', `${(value * 33).toFixed(2)}%`);
}

function pieceRotation(progress) {
  if (state.mode === 'button') return `${Math.round((progress - .5) * 24)}deg`;
  if (state.mode === 'snap') return `${Math.round((1 - progress) * -8)}deg`;
  if (state.mode === 'velcro' && state.phase === 'peel') return `${Math.round(progress * -22)}deg`;
  if (state.mode === 'velcro') return `${Math.round((.5 - progress) * 8)}deg`;
  return '0deg';
}

function setTrack(mode) {
  const path = normalizedPath();
  const averageY = path.reduce((sum, p) => sum + p.y, 0) / path.length;
  stage.style.setProperty('--track-y', `${Math.round(averageY * 100)}%`);
  stage.style.setProperty('--track-turn', mode.kind === 'button' ? '-2deg' : '0deg');
}

function tapAdvance() {
  if (state.transitioning || state.screen !== 'play') return false;
  idle.poke();
  playSound('tick');
  const stops = [0, .34, .68, 1];
  const next = stops.find((value) => value > state.progress + .04) ?? 1;
  updatePiece(next, { animate: true });
  state.checkpoint = next;
  if (next >= .99) commitOrBump();
  return true;
}

function commitOrBump() {
  if (state.transitioning || state.screen !== 'play') return false;
  if (state.progress >= .84) {
    state.checkpoint = 1;
    updatePiece(1, { animate: true });
    if (state.mode === 'snap' && state.phase !== 'press') return enterPress();
    if (state.mode === 'velcro' && state.phase === 'peel') return enterSmooth();
    return completeRound();
  }
  state.misses += 1;
  state.checkpoint = nearestStop(state.progress, [0, .34, .68].filter((stop) => stop <= state.progress + .03));
  updatePiece(state.checkpoint, { animate: true });
  playSound('unpop');
  stage.classList.remove('is-miss');
  void stage.offsetWidth;
  stage.classList.add('is-miss');
  if (state.misses >= 2) stage.classList.add('show-helper');
  say(modeById[state.mode].nudgeVoice);
  return false;
}

function enterPress() {
  state.phase = 'press';
  state.progress = 1;
  state.checkpoint = 1;
  stage.dataset.phase = 'press';
  fastener.classList.add('is-snapped');
  promptText.textContent = promptFor(modeById[state.mode], 'press');
  gestureCaption.textContent = captionFor(modeById[state.mode], 'press');
  playSound('pop');
  say('snap-press');
  return true;
}

function enterSmooth() {
  state.phase = 'smooth';
  state.progress = 0;
  state.checkpoint = 0;
  stage.dataset.phase = 'smooth';
  promptText.textContent = promptFor(modeById[state.mode], 'smooth');
  gestureCaption.textContent = captionFor(modeById[state.mode], 'smooth');
  setTrack(modeById[state.mode]);
  updatePiece(0, { animate: true });
  playSound('whoosh');
  return true;
}

function startHold(event) {
  if (state.phase !== 'press' || state.transitioning || state.holdPointer != null) return false;
  event.preventDefault();
  idle.poke();
  state.holdPointer = event.pointerId;
  state.holdStarted = performance.now();
  stage.classList.add('is-holding');
  stage.style.setProperty('--hold-duration', `${timers.ms(720)}ms`);
  try { fastener.setPointerCapture(event.pointerId); } catch { /* best effort */ }
  playSound('tick');
  state.holdTimer = timers.after(720, () => {
    state.holdTimer = null;
    state.holdPointer = null;
    stage.classList.remove('is-holding');
    completeRound();
  });
  return true;
}

function finishHold(event, cancelled) {
  if (state.holdPointer == null || event.pointerId !== state.holdPointer) return;
  event.preventDefault?.();
  const elapsed = performance.now() - state.holdStarted;
  if (state.holdTimer != null) timers.clear(state.holdTimer);
  state.holdTimer = null;
  state.holdPointer = null;
  stage.classList.remove('is-holding');
  if (cancelled || state.transitioning) return;
  if (elapsed >= timers.ms(650)) {
    completeRound();
    return;
  }
  tapPress();
}

function cancelHold() {
  if (state.holdTimer != null) timers.clear(state.holdTimer);
  state.holdTimer = null;
  state.holdPointer = null;
  stage.classList.remove('is-holding');
}

function tapPress() {
  state.holdTaps += 1;
  fastener.classList.remove('is-snapped');
  void fastener.offsetWidth;
  fastener.classList.add('is-snapped');
  playSound('pop');
  if (state.holdTaps >= 2) completeRound();
  else gestureCaption.textContent = 'PRESS ONCE MORE';
  return true;
}

function completeRound() {
  if (state.transitioning || state.screen !== 'play') return false;
  state.transitioning = true;
  state.phase = 'done';
  state.progress = 1;
  state.checkpoint = 1;
  stage.dataset.phase = 'done';
  stage.classList.remove('is-holding');
  stage.classList.add('is-round-complete');
  updatePiece(1, { animate: true });
  idle.stop();
  playSound('sparkle');
  cancelConfetti?.();
  cancelConfetti = burstConfetti({ host: stage, count: 22, duration: 1800, rng: state.rng, drift: 72 });
  const voiceKey = ['round-one', 'round-two', 'round-three'][state.round];
  promptText.textContent = ['One finished!', 'Two finished!', 'Three finished!'][state.round];
  gestureCaption.textContent = 'BEAUTIFUL WORK';
  say(voiceKey);
  const pause = Math.max(1200, (voice.duration(voiceKey) || 1.7) * 1000 + 180);
  timers.after(pause, () => {
    if (state.screen !== 'play') return;
    if (state.round + 1 < config.roundsPerMode) {
      state.round += 1;
      renderRound();
      say(modeById[state.mode].startVoice);
    } else {
      completeMode();
    }
  });
  return true;
}

function completeMode() {
  const mode = modeById[state.mode];
  if (!mode) return false;
  cleanupRound();
  state.completed.add(mode.id);
  saveCompleted();
  state.screen = 'end';
  state.transitioning = false;
  rewardPatch.src = mode.patch;
  rewardPatch.alt = `${mode.title} patch`;
  rewardTitle.textContent = `${mode.title} star!`;
  rewardMessage.textContent = `Three patient ${mode.title.toLowerCase()} rounds finished.`;
  renderPatches(document.getElementById('end-patches'));
  screens.show('end');
  cancelConfetti = burstConfetti({ host: document.getElementById('end-screen'), count: 34, duration: 2700, rng: state.rng, drift: 100 });
  screens.hold(() => {
    cancelConfetti?.();
    cancelConfetti = null;
  });
  const allDone = config.modes.every((item) => state.completed.has(item.id));
  say(allDone ? 'all-complete' : 'mode-complete');
  return true;
}

function serialState() {
  return {
    screen: state.screen,
    mode: state.mode,
    round: state.round,
    phase: state.phase,
    progress: Math.round(state.progress * 1000) / 1000,
    checkpoint: state.checkpoint,
    misses: state.misses,
    support: Boolean(gesture?.support),
    transitioning: state.transitioning,
    muted: state.muted,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    seed: state.seed,
    completed: [...state.completed],
    pendingTimers: timers.size(),
  };
}

installDebug({
  gameId: 'button-zipper-lab',
  engine: 'custom-dom-constrained-gesture',
  ready,
  listModes: () => config.modes.map(({ id, title, kind }) => ({ id, title, kind })),
  startMode,
  getState: serialState,
  tap: async (id) => {
    if (id === 'fastener') return state.phase === 'press' ? tapPress() : tapAdvance();
    if (id === 'support') return gesture?.debugSupport(true) ?? false;
    const target = mount.querySelector(`[data-target="${CSS.escape(String(id))}"]`);
    if (!target) return false;
    target.click();
    return true;
  },
  winRound: async () => completeRound(),
  home: () => showSplash({ greet: false }),
  gestureProgress: (value) => gesture?.debugProgress(value, { source: 'QLOBE_DEBUG' }) ?? false,
  gestureRelease: (value = 1) => {
    gesture?.debugProgress(value, { source: 'QLOBE_DEBUG' });
    return commitOrBump();
  },
  getAudioLog: () => voice.getAudioLog(),
  clearAudioLog: () => voice.clearAudioLog(),
  clipInfo: (key) => voice.clipInfo(key),
  resetProgress: () => {
    state.completed.clear();
    saveCompleted();
    if (state.screen === 'splash') renderSplash();
    return true;
  },
  timers,
  voice,
  sfx,
  root: mount,
  onSeed: (nextRng, seed) => {
    state.rng = nextRng;
    state.seed = seed;
  },
  mute: (on = true) => {
    state.muted = Boolean(on);
    voice.setMuted(state.muted);
    if (state.muted) voice.stop();
    return state.muted;
  },
});
