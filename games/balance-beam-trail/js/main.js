import config from '../config.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createTimers } from '../../../shared/js/timers.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { mulberry32 } from '../../../shared/js/rng.js';
import { createTiltInput } from './tilt-input.js';

const STORAGE_KEY = 'qlobe.balance-beam-trail.completed.v1';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const modeById = Object.fromEntries(config.modes.map((mode) => [mode.id, mode]));
const modeOrder = config.modes.map((mode) => mode.id);
const timers = createTimers();

const fallbackLines = {
  welcome: 'Welcome to Balance Beam Trail! Pick a path and let’s play.',
  'log-intro': 'Log Crossing! Keep your balance in the center for five checkpoints.',
  'lava-intro': 'Lava River! Steer to each stepping stone to cross safely.',
  'hop-intro': 'Hop Trail! Tap each bright pad in order.',
  steady: 'Steady and strong! You found the center.',
  wobble: 'A wobble is okay. Find your calm center and try again.',
  hop: 'Perfect hop! The trail is lighting up.',
  'trail-complete': 'Trail complete! You crossed with brave, careful balance.',
  'choose-next': 'Which trail should we explore next?',
  'all-complete': 'You finished every trail! What a balance superstar!',
  'tilt-fallback': 'Tilt is not available. Drag the star or use the arrow keys.',
  'tap-again': 'Follow the glowing star. That one is next.',
};

const paths = {
  log: [
    { x: 50, y: 95, s: 1 },
    { x: 50, y: 82, s: .91 },
    { x: 50, y: 71, s: .82 },
    { x: 50, y: 61, s: .74 },
    { x: 50, y: 52, s: .66 },
    { x: 50, y: 43, s: .59 },
  ],
  lava: [
    { x: 50, y: 98, s: .96 },
    { x: 50, y: 89, s: .88 },
    { x: 46, y: 75, s: .78 },
    { x: 55, y: 64, s: .7 },
    { x: 45, y: 55, s: .63 },
    { x: 50, y: 47, s: .57 },
  ],
  hop: [
    { x: 50, y: 99, s: .98 },
    { x: 50, y: 89, s: .88 },
    { x: 52, y: 74, s: .78 },
    { x: 48, y: 61, s: .7 },
    { x: 53, y: 51, s: .63 },
    { x: 50, y: 41, s: .57 },
  ],
};

const els = {
  root: document.getElementById('game'),
  select: document.getElementById('select-screen'),
  play: document.getElementById('play-screen'),
  complete: document.getElementById('complete-screen'),
  loading: document.getElementById('loading-screen'),
  announcer: document.getElementById('announcer'),
  modeCards: [...document.querySelectorAll('.mode-card')],
  start: document.getElementById('start-button'),
  startLabel: document.querySelector('#start-button span'),
  playBack: document.getElementById('play-back'),
  completeBack: document.getElementById('complete-back'),
  next: document.getElementById('next-button'),
  nextLabel: document.querySelector('#next-button span'),
  stageArt: document.getElementById('stage-art'),
  playKicker: document.getElementById('play-kicker'),
  playTitle: document.getElementById('play-title'),
  progress: document.getElementById('progress-stars'),
  fern: document.getElementById('fern'),
  fernArt: document.getElementById('fern-art'),
  hopControls: document.getElementById('hop-controls'),
  hopPads: [...document.querySelectorAll('.hop-pad')],
  balancePanel: document.getElementById('balance-panel'),
  balance: document.getElementById('balance-control'),
  targetMarker: document.getElementById('target-marker'),
  playerMarker: document.getElementById('player-marker'),
  steadyFill: document.getElementById('steady-fill'),
  inputHint: document.getElementById('input-hint'),
  caption: document.getElementById('play-caption'),
  flash: document.getElementById('trail-flash'),
  completeKicker: document.getElementById('complete-kicker'),
  completeTitle: document.getElementById('complete-title'),
  completeFern: document.getElementById('complete-fern'),
  soundButtons: [...document.querySelectorAll('[data-sound-button]')],
};

const state = {
  screen: 'select',
  selectedMode: 'log',
  mode: null,
  checkpoint: 0,
  holdProgress: 0,
  inputX: 0,
  inputY: 0,
  inputSource: null,
  inputStatus: 'idle',
  inputReady: false,
  pointerId: null,
  keyActiveUntil: 0,
  debugActiveUntil: 0,
  lockUntil: 0,
  transitioning: false,
  misses: 0,
  completed: loadCompleted(),
  muted: false,
  lastVoiceKey: 'welcome',
  seed: 42,
  rng: mulberry32(42),
  nextMode: null,
  allDone: false,
};

let lineTable = { ...fallbackLines };
let confettiDispose = null;
let animationFrame = 0;
let lastFrame = performance.now();
let lastWobbleAt = 0;
let lastWobbleVoiceAt = 0;

const tilt = createTiltInput({
  reducedMotion,
  onSample: (sample) => {
    state.inputX = clamp(sample.x, -1, 1);
    state.inputY = clamp(sample.y, -1, 1);
    state.inputSource = sample.source;
    state.inputReady = true;
    renderInput();
  },
  onStatus: (status) => {
    state.inputStatus = status;
    renderInputHint();
  },
});

installKioskGuards();
installUnlockOnGesture({
  onFirst: () => {
    ready.then(() => {
      if (state.screen === 'select') say('welcome');
    });
  },
});

const assetUrls = collectAssetUrls(config.assets);
const ready = Promise.all([
  preloadImages(assetUrls),
  fetch('./assets/audio/lines.json')
    .then((response) => response.ok ? response.json() : {})
    .then((loaded) => { lineTable = { ...fallbackLines, ...loaded }; })
    .catch(() => {}),
  voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', fallbackLines),
]).then(() => {
  updateSelect();
  showScreen('select');
  els.loading.classList.add('is-ready');
  window.setTimeout(() => els.loading.setAttribute('hidden', ''), 380);
  announce('Choose Log Crossing, Lava River, or Hop Trail.');
  return true;
});

function collectAssetUrls(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => collectAssetUrls(entry, output));
  else if (value && typeof value === 'object') Object.values(value).forEach((entry) => collectAssetUrls(entry, output));
  return [...new Set(output)];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function loadCompleted() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return new Set(Array.isArray(value) ? value.filter((id) => modeById[id]) : []);
  } catch {
    return new Set();
  }
}

function saveCompleted() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.completed])); } catch { /* optional */ }
}

function showScreen(name) {
  for (const screen of [els.select, els.play, els.complete]) {
    screen.hidden = screen.dataset.screen !== name;
  }
  state.screen = name;
}

function announce(text) {
  els.announcer.textContent = '';
  window.requestAnimationFrame(() => { els.announcer.textContent = text; });
}

function say(key) {
  state.lastVoiceKey = key;
  return voiceClips.say(key, lineTable[key] || fallbackLines[key] || '');
}

function setSelectedMode(id, { sound = true } = {}) {
  if (!modeById[id]) return false;
  state.selectedMode = id;
  for (const card of els.modeCards) {
    const selected = card.dataset.mode === id;
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-pressed', String(selected));
  }
  els.startLabel.textContent = `Play ${modeById[id].title}`;
  if (sound && !state.muted) sfx.pop();
  announce(`${modeById[id].title} selected.`);
  return true;
}

function updateSelect() {
  setSelectedMode(state.selectedMode, { sound: false });
  for (const card of els.modeCards) {
    const host = card.querySelector('.mode-card-stars');
    host.replaceChildren();
    if (!state.completed.has(card.dataset.mode)) continue;
    for (let i = 0; i < 3; i += 1) {
      const star = document.createElement('img');
      star.src = config.assets.star;
      star.alt = '';
      host.append(star);
    }
  }
}

function showSelect({ narrate = false } = {}) {
  cleanupPlay();
  confettiDispose?.();
  confettiDispose = null;
  updateSelect();
  showScreen('select');
  if (narrate) say('choose-next');
}

async function startMode(id = state.selectedMode) {
  const mode = modeById[id];
  if (!mode) return false;

  // This call intentionally happens before the await. iOS requires the sensor
  // permission request to stay in the initiating tap's task.
  if (mode.input === 'balance') void tilt.request();
  await ready;

  cleanupPlay();
  confettiDispose?.();
  confettiDispose = null;
  state.selectedMode = id;
  state.mode = id;
  state.checkpoint = 0;
  state.holdProgress = 0;
  state.inputX = 0;
  state.inputY = 0;
  state.inputSource = null;
  state.inputReady = false;
  state.pointerId = null;
  state.keyActiveUntil = 0;
  state.debugActiveUntil = 0;
  state.lockUntil = performance.now() + 420;
  state.transitioning = false;
  state.misses = 0;
  lastWobbleAt = 0;
  lastWobbleVoiceAt = 0;

  els.play.dataset.mode = id;
  els.stageArt.src = mode.stage;
  els.stageArt.alt = stageAlt(id);
  els.playKicker.textContent = mode.title;
  els.playTitle.textContent = titleForMode(id);
  els.caption.textContent = captionForMode(id);
  els.balancePanel.hidden = mode.input !== 'balance';
  els.hopControls.hidden = mode.input !== 'tap-sequence';
  setPose('ready');
  renderProgress();
  renderHopPads();
  moveActor();
  renderTarget();
  renderInput();
  renderInputHint();
  showScreen('play');
  idle.arm();
  say(config.voice.modeIntro[id]);
  announce(mode.instruction);
  return true;
}

function stageAlt(id) {
  if (id === 'lava') return 'A pretend lava river with five broad paper stepping stones.';
  if (id === 'hop') return 'A green garden path with five large blue hopping pads.';
  return 'A broad paper log crossing a bright blue indoor river.';
}

function titleForMode(id) {
  if (id === 'hop') return 'Tap the glowing star';
  if (id === 'lava') return 'Steer to each stone';
  return 'Find your calm center';
}

function captionForMode(id) {
  if (id === 'hop') return 'Follow the stars to the finish';
  if (id === 'lava') return 'Hold steady on every stone';
  return 'Hold steady to take a step';
}

function cleanupPlay() {
  idle.stop();
  timers.clearAll();
  state.transitioning = false;
  state.pointerId = null;
  state.holdProgress = 0;
  tilt.releasePointer();
  els.fern.classList.remove('is-stepping', 'is-wobbling');
  els.flash.classList.remove('is-on');
}

function renderProgress() {
  els.progress.replaceChildren();
  const rounds = modeById[state.mode]?.rounds || 5;
  for (let i = 0; i < rounds; i += 1) {
    const star = document.createElement('img');
    star.className = 'progress-star';
    star.src = config.assets.star;
    star.alt = i < state.checkpoint ? `Checkpoint ${i + 1} complete` : '';
    star.classList.toggle('is-done', i < state.checkpoint);
    star.classList.toggle('is-now', i === state.checkpoint && state.checkpoint < rounds);
    els.progress.append(star);
  }
  els.progress.setAttribute('aria-label', `${state.checkpoint} of ${rounds} checkpoints complete`);
}

function renderHopPads() {
  for (const pad of els.hopPads) {
    const index = Number(pad.dataset.hop);
    pad.classList.toggle('is-done', index < state.checkpoint);
    pad.classList.toggle('is-current', index === state.checkpoint && !state.transitioning);
    pad.disabled = state.mode !== 'hop' || state.transitioning;
    pad.setAttribute('aria-label', index === state.checkpoint ? `Glowing hop pad ${index + 1}` : `Hop pad ${index + 1}`);
  }
}

function targetValue() {
  const mode = modeById[state.mode];
  if (!mode || mode.input !== 'balance') return 0;
  return clamp(mode.checkpoints[state.checkpoint] ?? 0, -1, 1);
}

function renderTarget() {
  const x = 50 + targetValue() * 38;
  els.targetMarker.style.left = `${x}%`;
}

function renderInput() {
  const x = 50 + clamp(state.inputX, -1, 1) * 38;
  els.playerMarker.style.left = `${x}%`;
  els.balance.setAttribute('aria-valuenow', String(Math.round(state.inputX * 100)));
  const centered = Math.abs(state.inputX - targetValue()) <= toleranceForMode();
  els.balance.classList.toggle('is-centered', centered && state.inputReady);
  els.steadyFill.style.width = `${Math.round(state.holdProgress * 100)}%`;
  const turn = clamp((state.inputX - targetValue()) * 10, -9, 9);
  els.fern.style.setProperty('--actor-turn', `${turn.toFixed(1)}deg`);
}

function renderInputHint() {
  if (!els.inputHint) return;
  const status = state.inputStatus;
  if (status === 'active') els.inputHint.textContent = 'Tilt gently or drag';
  else if (status === 'requesting') els.inputHint.textContent = 'Getting tilt ready…';
  else if (status === 'denied' || status === 'unavailable') els.inputHint.textContent = 'Drag the star';
  else els.inputHint.textContent = 'Tilt or drag the star';
}

function toleranceForMode() {
  return state.mode === 'lava' ? .2 : .18;
}

function setPose(name) {
  const source = config.assets.fern[name] || config.assets.fern.ready;
  if (els.fernArt.src.endsWith(source.replace('./', '/'))) return;
  els.fernArt.src = source;
}

function moveActor() {
  const route = paths[state.mode] || paths.log;
  const point = route[Math.min(state.checkpoint, route.length - 1)] || route[0];
  els.fern.style.setProperty('--actor-x', `${point.x}%`);
  els.fern.style.setProperty('--actor-y', `${point.y}%`);
  els.fern.style.setProperty('--actor-scale', point.s);
}

function flashTrail() {
  els.flash.classList.remove('is-on');
  void els.flash.offsetWidth;
  els.flash.classList.add('is-on');
}

function animateStep() {
  const pose = state.checkpoint % 2 ? 'leftStep' : 'rightStep';
  setPose(pose);
  els.fern.classList.remove('is-stepping');
  void els.fern.offsetWidth;
  els.fern.classList.add('is-stepping');
  timers.after(430, () => {
    els.fern.classList.remove('is-stepping');
    if (state.screen === 'play' && !state.transitioning) setPose('ready');
  });
}

function animateWobble(direction) {
  setPose(direction < 0 ? 'wobbleLeft' : 'wobbleRight');
  els.fern.classList.remove('is-wobbling');
  void els.fern.offsetWidth;
  els.fern.classList.add('is-wobbling');
  timers.after(410, () => {
    els.fern.classList.remove('is-wobbling');
    if (state.screen === 'play' && !state.transitioning) setPose('ready');
  });
}

function advanceCheckpoint() {
  const mode = modeById[state.mode];
  if (!mode || state.screen !== 'play' || state.transitioning) return false;
  if (state.checkpoint >= mode.rounds) return false;

  state.checkpoint += 1;
  state.holdProgress = 0;
  state.lockUntil = performance.now() + 470;
  renderProgress();
  renderHopPads();
  moveActor();
  renderTarget();
  renderInput();
  animateStep();
  flashTrail();
  idle.poke();
  if (state.mode === 'hop') sfx.boing();
  else sfx.sparkle();

  if (state.checkpoint === 2) say(state.mode === 'hop' ? 'hop' : 'steady');
  announce(`Checkpoint ${state.checkpoint} of ${mode.rounds}.`);

  if (state.checkpoint >= mode.rounds) {
    state.transitioning = true;
    renderHopPads();
    timers.after(760, completeMode);
  }
  return true;
}

function hop(index) {
  if (state.screen !== 'play' || state.mode !== 'hop' || state.transitioning) return false;
  idle.poke();
  if (index !== state.checkpoint) {
    state.misses += 1;
    const pad = els.hopPads[index];
    pad?.classList.remove('is-miss');
    if (pad) void pad.offsetWidth;
    pad?.classList.add('is-miss');
    sfx.silly();
    announce('Follow the glowing star.');
    if (state.misses === 2) say('tap-again');
    return false;
  }
  return advanceCheckpoint();
}

function completeMode() {
  const mode = modeById[state.mode];
  if (!mode || state.screen !== 'play') return false;
  idle.stop();
  state.transitioning = false;
  state.completed.add(mode.id);
  saveCompleted();
  state.allDone = modeOrder.every((id) => state.completed.has(id));
  state.nextMode = modeOrder.find((id) => !state.completed.has(id)) || 'log';

  if (state.allDone) {
    els.completeKicker.textContent = 'Every trail sparkles!';
    els.completeTitle.textContent = 'Balance superstar!';
    els.nextLabel.textContent = 'Play Again';
  } else {
    els.completeKicker.textContent = 'Trail complete!';
    els.completeTitle.textContent = `${mode.title} star!`;
    els.nextLabel.textContent = 'Next Trail';
  }

  showScreen('complete');
  confettiDispose?.();
  confettiDispose = burstConfetti({
    host: els.complete,
    count: state.allDone ? 46 : 34,
    duration: 2800,
    rng: state.rng,
    drift: 110,
  });
  sfx.tada();
  say(state.allDone ? 'all-complete' : 'trail-complete');
  announce(state.allDone ? 'All three trails complete. Three stars!' : `${mode.title} complete. Three stars!`);
  return true;
}

function nextTrail() {
  if (state.allDone) {
    state.completed.clear();
    state.allDone = false;
    state.nextMode = null;
    saveCompleted();
    state.selectedMode = 'log';
    showSelect({ narrate: false });
    return true;
  }
  setSelectedMode(state.nextMode, { sound: false });
  return startMode(state.nextMode);
}

function pointerValue(event) {
  const rect = els.balance.getBoundingClientRect();
  const raw = ((event.clientX - rect.left) / rect.width - .5) / .38;
  return clamp(raw, -1, 1);
}

function onBalancePointerDown(event) {
  if (state.screen !== 'play' || modeById[state.mode]?.input !== 'balance' || state.pointerId !== null) return;
  event.preventDefault();
  state.pointerId = event.pointerId;
  try { els.balance.setPointerCapture(event.pointerId); } catch { /* best effort */ }
  tilt.setPointer(pointerValue(event), 0);
  idle.poke();
}

function onBalancePointerMove(event) {
  if (event.pointerId !== state.pointerId) return;
  event.preventDefault();
  tilt.setPointer(pointerValue(event), 0);
  idle.poke();
}

function onBalancePointerEnd(event) {
  if (event.pointerId !== state.pointerId) return;
  event.preventDefault?.();
  state.pointerId = null;
  try { els.balance.releasePointerCapture(event.pointerId); } catch { /* best effort */ }
  tilt.releasePointer();
}

function onBalanceKey(event) {
  if (state.screen !== 'play' || modeById[state.mode]?.input !== 'balance') return;
  const step = event.shiftKey ? .2 : .1;
  let value = state.inputX;
  if (event.key === 'ArrowLeft') value -= step;
  else if (event.key === 'ArrowRight') value += step;
  else if (event.key === 'Home' || event.key === 'Enter' || event.key === ' ') value = targetValue();
  else return;
  event.preventDefault();
  tilt.setPointer(clamp(value, -1, 1), 0);
  state.keyActiveUntil = performance.now() + 1250;
  idle.poke();
}

function balanceActive(now) {
  return state.inputReady && (
    state.inputSource === 'sensor'
    || state.pointerId !== null
    || now < state.keyActiveUntil
    || now < state.debugActiveUntil
  );
}

function updateFrame(now) {
  const elapsed = Math.min(60, Math.max(0, now - lastFrame));
  lastFrame = now;
  if (
    state.screen === 'play'
    && modeById[state.mode]?.input === 'balance'
    && !state.transitioning
    && now >= state.lockUntil
  ) {
    const active = balanceActive(now);
    const error = Math.abs(state.inputX - targetValue());
    const centered = active && error <= toleranceForMode();
    const scaledElapsed = elapsed * timers.getScale();

    if (centered) {
      state.holdProgress = clamp(state.holdProgress + scaledElapsed / 820, 0, 1);
      if (state.holdProgress >= 1) advanceCheckpoint();
    } else {
      state.holdProgress = clamp(state.holdProgress - scaledElapsed / 560, 0, 1);
      if (active && error > .3 && now - lastWobbleAt > 760) {
        lastWobbleAt = now;
        animateWobble(state.inputX - targetValue());
        sfx.whoosh();
        if (now - lastWobbleVoiceAt > 7000) {
          lastWobbleVoiceAt = now;
          say('wobble');
        }
      }
    }
    renderInput();
  }
  animationFrame = window.requestAnimationFrame(updateFrame);
}

function repeatLastLine() {
  if (state.muted) setMuted(false);
  return say(state.lastVoiceKey || 'welcome');
}

function setMuted(on) {
  state.muted = Boolean(on);
  voiceClips.setMuted(state.muted);
  sfx.setMuted(state.muted);
  if (state.muted) voiceClips.stop();
  for (const button of els.soundButtons) {
    button.classList.toggle('is-muted', state.muted);
    button.setAttribute('aria-pressed', String(state.muted));
  }
  announce(state.muted ? 'Sound muted.' : 'Sound on.');
  return state.muted;
}

function installSoundButton(button) {
  let holdTimer = 0;
  let held = false;
  const clear = () => {
    if (holdTimer) window.clearTimeout(holdTimer);
    holdTimer = 0;
  };
  button.addEventListener('pointerdown', () => {
    held = false;
    clear();
    holdTimer = window.setTimeout(() => {
      held = true;
      setMuted(!state.muted);
      if (!state.muted) sfx.pop();
    }, 680);
  });
  button.addEventListener('pointerup', clear);
  button.addEventListener('pointercancel', clear);
  button.addEventListener('pointerleave', clear);
  button.addEventListener('click', (event) => {
    if (held) {
      event.preventDefault();
      held = false;
      return;
    }
    repeatLastLine();
  });
}

const idle = createNudger({
  first: 11500,
  repeat: 13000,
  onNudge: (count) => {
    if (state.screen !== 'play') return;
    if (state.mode === 'hop') {
      const current = els.hopPads[state.checkpoint];
      current?.classList.remove('is-current');
      void current?.offsetWidth;
      current?.classList.add('is-current');
    } else {
      els.targetMarker.classList.remove('target-marker');
      void els.targetMarker.offsetWidth;
      els.targetMarker.classList.add('target-marker');
    }
    if (count === 0) say(config.voice.modeIntro[state.mode]);
    else if (state.inputStatus === 'denied' || state.inputStatus === 'unavailable') say('tilt-fallback');
  },
});

for (const card of els.modeCards) {
  card.addEventListener('click', () => setSelectedMode(card.dataset.mode));
}
els.start.addEventListener('click', () => startMode(state.selectedMode));
els.playBack.addEventListener('click', () => showSelect({ narrate: false }));
els.completeBack.addEventListener('click', () => showSelect({ narrate: true }));
els.next.addEventListener('click', nextTrail);
for (const pad of els.hopPads) pad.addEventListener('click', () => hop(Number(pad.dataset.hop)));
els.balance.addEventListener('pointerdown', onBalancePointerDown, { passive: false });
els.balance.addEventListener('pointermove', onBalancePointerMove, { passive: false });
window.addEventListener('pointerup', onBalancePointerEnd, { passive: false });
window.addEventListener('pointercancel', onBalancePointerEnd, { passive: false });
els.balance.addEventListener('keydown', onBalanceKey);
for (const button of els.soundButtons) installSoundButton(button);

let disposed = false;
window.addEventListener('pagehide', (event) => {
  // A BFCache pagehide is a pause, not destruction. The browser can restore
  // this exact document via Back, so keep its frame/input services alive.
  if (event.persisted || disposed) return;
  disposed = true;
  window.cancelAnimationFrame(animationFrame);
  tilt.destroy();
  idle.stop();
  timers.clearAll();
  confettiDispose?.();
  voiceClips.stop();
});

animationFrame = window.requestAnimationFrame(updateFrame);

function serialState() {
  return {
    screen: state.screen,
    selectedMode: state.selectedMode,
    mode: state.mode,
    checkpoint: state.checkpoint,
    rounds: modeById[state.mode]?.rounds || null,
    holdProgress: Math.round(state.holdProgress * 1000) / 1000,
    input: {
      x: Math.round(state.inputX * 1000) / 1000,
      y: Math.round(state.inputY * 1000) / 1000,
      source: state.inputSource,
      status: state.inputStatus,
      active: balanceActive(performance.now()),
    },
    target: modeById[state.mode]?.input === 'balance' ? targetValue() : state.checkpoint,
    misses: state.misses,
    transitioning: state.transitioning,
    completed: [...state.completed],
    allDone: state.allDone,
    muted: state.muted,
    reducedMotion,
    seed: state.seed,
    pendingTimers: timers.size(),
  };
}

installDebug({
  gameId: config.id,
  engine: config.engine,
  ready,
  listModes: () => config.modes.map(({ id, title, input }) => ({ id, title, input })),
  startMode,
  getState: serialState,
  tap: async (id) => {
    if (id === 'balance') {
      tilt.setPointer(targetValue(), 0);
      state.debugActiveUntil = performance.now() + 1600;
      return true;
    }
    const target = els.root.querySelector(`[data-target="${CSS.escape(String(id))}"]`);
    if (!target || target.disabled) return false;
    target.click();
    return true;
  },
  winRound: async () => completeMode(),
  home: () => showSelect({ narrate: false }),
  setBalance: (value, activeMs = 1500) => {
    const accepted = tilt.setPointer(clamp(value, -1, 1), 0);
    state.debugActiveUntil = performance.now() + Math.max(0, Number(activeMs) || 0);
    return accepted;
  },
  releaseBalance: () => {
    state.debugActiveUntil = 0;
    return tilt.releasePointer();
  },
  advanceCheckpoint,
  calibrate: () => tilt.calibrate(),
  getAudioLog: voiceClips.getAudioLog,
  clearAudioLog: voiceClips.clearAudioLog,
  clipInfo: voiceClips.clipInfo,
  resetProgress: () => {
    state.completed.clear();
    state.allDone = false;
    state.nextMode = null;
    saveCompleted();
    updateSelect();
    return true;
  },
  timers,
  voice: voiceClips,
  sfx,
  root: els.root,
  onSeed: (rng, seed) => {
    state.rng = rng;
    state.seed = seed;
  },
  mute: setMuted,
});
