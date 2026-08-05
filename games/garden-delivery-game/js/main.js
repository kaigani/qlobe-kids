import config from '../config.js';
import { createTiltInput } from '../../../shared/js/tilt-input.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createTimers } from '../../../shared/js/timers.js';
import { mulberry32 } from '../../../shared/js/rng.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { soundDebounce } from '../../../shared/js/hud.js';

const mount = document.getElementById('game');
const timers = createTimers();
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
const modeById = new Map(config.modes.map((mode) => [mode.id, mode]));
const state = {
  ready: false,
  screen: 'map',
  mode: null,
  stone: 0,
  stableProgress: 0,
  breeze: 0,
  input: { x: 0, y: 0, source: 'pointer' },
  inputReady: false,
  pointerHeld: false,
  inputStatus: 'idle',
  pourProgress: 0,
  completed: [],
  muted: false,
  seed: 42,
};

let rng = mulberry32(state.seed);
let currentVoiceKey = 'welcome';
let lastSplashAt = 0;
let lastFrameAt = performance.now();
let celebrationDispose = null;
let soundHoldTimer = null;
let soundWasLongPress = false;
const repeatSound = soundDebounce(repeatPrompt, 650);

const tilt = createTiltInput({
  onSample: handleTiltSample,
  onStatus(status) {
    state.inputStatus = status;
    updateLiveScene();
  },
  reducedMotion,
});

const nudger = createNudger({
  first: 11000,
  repeat: 15000,
  onNudge() {
    if (state.screen === 'balance') say('balance-nudge');
    if (state.screen === 'pour') say('pour-nudge');
  },
});

function mode() { return modeById.get(state.mode) || null; }
function asset(path) { return path || ''; }
function isComplete(id) { return state.completed.includes(id); }
function clamp(value, low = -1, high = 1) { return Math.max(low, Math.min(high, value)); }
function play(name) { if (!state.muted) { try { sfx[name]?.(); } catch { /* audio is optional */ } } }
function say(key) {
  currentVoiceKey = key;
  mount.querySelector('[data-live]')?.replaceChildren(document.createTextNode(config.voice[key] || ''));
  if (!state.muted) voiceClips.say(key, config.voice[key] || '');
}
function currentFlowerAsset(selectedMode, blooming = false) {
  return selectedMode?.flowerAssets?.[blooming ? 'bloom' : 'thirsty'] || '';
}
function bucketValueText(x, pouring = false) {
  if (Math.abs(x) < 0.12) return 'Bucket centered';
  const side = x < 0 ? 'left' : 'right';
  return pouring ? `Bucket tipped ${side}` : `Bucket moved ${side}`;
}

function mapMarkup() {
  const cards = config.modeOrder.map((id) => {
    const item = modeById.get(id);
    const done = isComplete(id);
    return `<button class="flower-card ${done ? 'is-restored' : ''}" type="button" data-action="start" data-mode="${id}" data-target="flower-${id}" aria-label="Help the ${item.title}">
      <img class="flower-card-frame" src="${asset(config.assets.flowerCard)}" alt="" draggable="false">
      <img class="flower-card-flower" src="${asset(currentFlowerAsset(item, done))}" alt="" draggable="false">
      ${done ? `<img class="flower-card-badge" src="${asset(config.assets.gardenHelper)}" alt="Restored" draggable="false">` : ''}
      <span>${item.title}</span>
    </button>`;
  }).join('');
  return `<section class="garden-screen map-screen" aria-label="Choose a thirsty flower">${liveMarkup()}
    <img class="garden-plate" src="${asset(config.assets.map)}" alt="A tiny clay garden" draggable="false">
    <img class="title-lockup" src="${asset(config.assets.title)}" alt="Garden Delivery" draggable="false">
    <img class="map-sunny" src="${asset(config.assets.sunnyCarry)}" alt="Sunny holds a bucket of water" draggable="false">
    <div class="flower-card-row">${cards}</div>
    <a class="qk-hud-btn qk-hud-home qk-hud-top-left" data-target="home" href="../../" aria-label="Home"></a>
    ${soundMarkup()}
  </section>`;
}

function petalsMarkup(selectedMode) {
  return `<div class="petal-progress" aria-label="${state.stone} of ${selectedMode.stones} stones crossed">
    ${Array.from({ length: selectedMode.stones }, (_, index) => `<img class="petal ${index < state.stone ? 'is-done' : index === state.stone ? 'is-current' : ''}" data-petal="${index}" src="${asset(config.assets.petal)}" alt="" draggable="false">`).join('')}
  </div>`;
}

function sceneMarkup(kind) {
  const selectedMode = mode();
  const isPour = kind === 'pour';
  const flowerBlooming = state.screen === 'bloom';
  const railAsset = isPour ? config.assets.pourRail : config.assets.balanceRail;
  const heading = isPour ? `Tip water to the ${selectedMode.title}` : `Carry water to the ${selectedMode.title}`;
  return `<section class="garden-screen path-screen ${isPour ? 'pour-screen' : 'balance-screen'}" aria-label="${heading}">${liveMarkup()}
    <img class="garden-plate" src="${asset(config.assets.path)}" alt="Clay stepping stones in Sunny's garden" draggable="false">
    <div class="scene-top">${petalsMarkup(selectedMode)}<p class="input-status" data-input-status>${inputLabel()}</p></div>
    <img class="scene-sunny ${flowerBlooming ? 'is-cheering' : ''}" src="${asset(flowerBlooming ? config.assets.sunnyCheer : config.assets.sunnyCarry)}" alt="Sunny the sunflower" draggable="false">
    <div class="flower-socket ${flowerBlooming ? 'is-bloomed' : ''}">
      <img class="scene-flower" src="${asset(currentFlowerAsset(selectedMode, flowerBlooming))}" alt="${flowerBlooming ? `Blooming ${selectedMode.title}` : `Thirsty ${selectedMode.title}`}" draggable="false">
      <img class="water-stream ${isPour ? 'is-pouring' : ''}" src="${asset(config.assets.waterStream)}" alt="" draggable="false">
      <span class="soil-fill" aria-hidden="true"></span>
    </div>
    <div class="rail-area ${isPour ? 'is-pour' : ''}" data-rail data-target="${isPour ? 'pour-rail' : 'balance-rail'}" role="slider" tabindex="0" aria-label="${isPour ? 'Tip the bucket toward the flower' : 'Move the bucket along the balance rail'}" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="${Math.round(clamp(state.input.x) * 100)}" aria-valuetext="${bucketValueText(clamp(state.input.x), isPour)}">
      <img class="rail-art" src="${asset(railAsset)}" alt="" draggable="false">
      <span class="breeze-glow" aria-hidden="true"></span>
      <img class="bucket-marker" src="${asset(config.assets.bucket)}" alt="Bucket marker" draggable="false">
      <div class="drop-burst" aria-hidden="true"><img class="splash-mark" src="${asset(config.assets.waterSplash)}" alt="" draggable="false">${Array.from({ length: 3 }, () => `<img src="${asset(config.assets.waterDrop)}" alt="" draggable="false">`).join('')}</div>
    </div>
    <p class="scene-copy">${isPour ? 'Tip toward the glowing side and hold.' : 'Keep the bucket in the middle.'}</p>
    <button class="qk-hud-btn qk-hud-back qk-hud-top-left" type="button" data-action="back" data-target="back" aria-label="Back to garden"></button>
    ${soundMarkup()}
  </section>`;
}

function bloomMarkup() {
  const selectedMode = mode();
  return `<section class="garden-screen bloom-screen" aria-label="${selectedMode.title} blooming">${liveMarkup()}
    <img class="garden-plate" src="${asset(config.assets.path)}" alt="Sunny's garden" draggable="false">
    <img class="bloom-sunny" src="${asset(config.assets.sunnyCheer)}" alt="Sunny cheers" draggable="false">
    <img class="bloom-flower" src="${asset(currentFlowerAsset(selectedMode, true))}" alt="The ${selectedMode.title} blooms" draggable="false">
    <div class="bloom-copy"><img src="${asset(config.assets.gardenHelper)}" alt="Garden helper badge" draggable="false"><p>The ${selectedMode.title} is blooming!</p></div>
    <button class="clay-action" type="button" data-action="next" data-target="next-garden"><img src="${asset(config.assets.clayButton)}" alt="" draggable="false"><span>Next garden</span></button>
    <button class="qk-hud-btn qk-hud-back qk-hud-top-left" type="button" data-action="back" data-target="back" aria-label="Back to garden"></button>
    ${soundMarkup()}
  </section>`;
}

function partyMarkup() {
  return `<section class="garden-screen party-screen" aria-label="Garden party">${liveMarkup()}
    <img class="garden-plate" src="${asset(config.assets.party)}" alt="A garden party" draggable="false">
    <img class="party-sunny" src="${asset(config.assets.sunnyCheer)}" alt="Sunny cheers" draggable="false">
    <div class="party-flowers">${config.modeOrder.map((id) => `<img src="${asset(currentFlowerAsset(modeById.get(id), true))}" alt="Blooming ${modeById.get(id).title}" draggable="false">`).join('')}</div>
    <div class="party-copy"><img src="${asset(config.assets.gardenHelper)}" alt="Garden helper badge" draggable="false"><p>Every flower is dancing!</p></div>
    <button class="clay-action" type="button" data-action="party-map" data-target="party-map"><img src="${asset(config.assets.clayButton)}" alt="" draggable="false"><span>Visit the garden</span></button>
    ${soundMarkup()}
  </section>`;
}

function soundMarkup() {
  return `<button class="qk-hud-btn qk-hud-sound qk-hud-bottom-left" type="button" data-action="sound" data-target="sound" aria-label="Hear that again. Hold to mute or unmute."></button>`;
}

function liveMarkup() { return '<p class="visually-hidden" aria-live="polite" data-live></p>'; }

function render() {
  celebrationDispose?.();
  celebrationDispose = null;
  if (state.screen === 'map') mount.innerHTML = mapMarkup();
  if (state.screen === 'balance') mount.innerHTML = sceneMarkup('balance');
  if (state.screen === 'pour') mount.innerHTML = sceneMarkup('pour');
  if (state.screen === 'bloom') mount.innerHTML = bloomMarkup();
  if (state.screen === 'party') mount.innerHTML = partyMarkup();
  updateLiveScene();
  if (state.screen === 'bloom') celebrationDispose = burstConfetti({ host: mount, count: 28, duration: 2400, rng });
  if (state.screen === 'party') celebrationDispose = burstConfetti({ host: mount, count: 22, duration: 3800, loop: true, rng, drift: 45 });
}

function inputLabel() {
  if (state.input.source === 'keyboard') return `${bucketValueText(state.input.x, state.screen === 'pour')}. Use left and right arrows.`;
  if (state.inputStatus === 'denied' || state.inputStatus === 'unavailable' || state.inputStatus === 'fallback') return 'Slide the bucket with one finger.';
  if (state.inputStatus === 'active') return 'Tilt gently or slide the bucket.';
  return 'Slide the bucket, or tilt gently.';
}

function updateLiveScene() {
  const rail = mount.querySelector('[data-rail]');
  if (!rail) return;
  const selectedMode = mode();
  const isPour = state.screen === 'pour';
  const x = clamp(state.input.x);
  const breeze = isPour ? 0 : state.breeze;
  const railTravel = isPour ? 30 : 39;
  const pourTarget = selectedMode.pourSide === 'left' ? -1 : 1;
  rail.style.setProperty('--bucket-x', `${50 + x * railTravel}%`);
  rail.style.setProperty('--bucket-tilt', `${x * 18}deg`);
  rail.style.setProperty('--breeze-x', `${50 + breeze * 39}%`);
  rail.style.setProperty('--pour-target', `${50 + pourTarget * railTravel}%`);
  rail.style.setProperty('--water', `${Math.round(state.pourProgress * 100)}%`);
  rail.classList.toggle('is-spilling', !isPour && Math.abs(x - breeze) > selectedMode.safeThreshold);
  mount.querySelectorAll('[data-petal]').forEach((petal) => {
    const index = Number(petal.dataset.petal);
    petal.classList.toggle('is-done', index < state.stone);
    petal.classList.toggle('is-current', index === state.stone && state.stone < selectedMode.stones);
  });
  const sunny = mount.querySelector('.scene-sunny');
  if (sunny) sunny.style.setProperty('--sunny-step', state.stone / selectedMode.stones);
  mount.querySelector('[data-input-status]')?.replaceChildren(document.createTextNode(inputLabel()));
  const stream = mount.querySelector('.water-stream');
  if (stream) stream.style.setProperty('--pour-level', state.pourProgress);
  const soil = mount.querySelector('.soil-fill');
  if (soil) soil.style.setProperty('--pour-level', state.pourProgress);
  rail.setAttribute('aria-valuenow', String(Math.round(x * 100)));
  rail.setAttribute('aria-valuetext', bucketValueText(x, isPour));
}

function setScreen(next) {
  timers.clearAll();
  nudger.stop();
  state.screen = next;
  lastFrameAt = performance.now();
  render();
  if (next === 'balance' || next === 'pour') nudger.arm();
}

function startMode(id) {
  const selectedMode = modeById.get(id);
  if (!selectedMode) return false;
  // Deliberately before any await: iOS requires permission inside this card tap.
  try { tilt.request(); } catch { state.inputStatus = 'fallback'; }
  state.mode = id;
  state.stone = 0;
  state.stableProgress = 0;
  state.pourProgress = 0;
  state.breeze = 0;
  state.input = { x: 0, y: 0, source: 'none' };
  state.inputReady = false;
  state.pointerHeld = false;
  setScreen('balance');
  say(selectedMode.introVoice);
  const introSeconds = voiceClips.duration(selectedMode.introVoice) || 4.2;
  timers.after((introSeconds + 0.25) * 1000, () => say('controls'));
  return true;
}

function breezeForCurrentStone() {
  const segments = mode()?.breezeSegments || [];
  let value = 0;
  for (const segment of segments) if (state.stone >= segment.from) value = segment.to;
  return value;
}

function handleTiltSample(sample = {}) {
  const x = clamp(Number(sample.x) || 0);
  const y = clamp(Number(sample.y) || 0);
  state.input = { x, y, source: sample.source || 'unknown' };
  state.inputReady = true;
  if (state.screen === 'balance' || state.screen === 'pour') nudger.poke();
  updateLiveScene();
}

function advanceGameplay(delta) {
  if (state.screen !== 'balance' && state.screen !== 'pour') return;
  if (!state.inputReady) return;
  // A fallback finger must stay on the rail. Sensor and deterministic debug
  // samples remain continuous inputs even when the child is not touching it.
  if (state.input.source === 'pointer' && !state.pointerHeld) return;
  const selectedMode = mode();
  if (!selectedMode) return;
  const x = clamp(state.input.x);
  if (state.screen === 'balance') {
    state.breeze = breezeForCurrentStone();
    const centered = Math.abs(x - state.breeze) <= selectedMode.safeThreshold;
    if (centered) state.stableProgress = clamp(state.stableProgress + delta / 1.15, 0, 1);
    else {
      state.stableProgress = clamp(state.stableProgress - delta * 0.55, 0, 1);
      if (performance.now() - lastSplashAt > 1450) {
        lastSplashAt = performance.now();
        play('silly');
        say('splash');
      }
    }
    if (state.stableProgress >= 1) completeStep();
  } else {
    const desired = selectedMode.pourSide === 'left' ? -1 : 1;
    const tipped = desired * x >= 0.35;
    if (tipped) state.pourProgress = clamp(state.pourProgress + delta / 1.45, 0, 1);
    if (state.pourProgress >= 1) completePour();
  }
  updateLiveScene();
}

function animationFrame(now) {
  const delta = clamp((now - lastFrameAt) / 1000, 0, 0.1);
  lastFrameAt = now;
  advanceGameplay(delta);
  window.requestAnimationFrame(animationFrame);
}

function completeStep() {
  const selectedMode = mode();
  if (!selectedMode || state.screen !== 'balance') return;
  state.stone += 1;
  state.stableProgress = 0;
  state.breeze = breezeForCurrentStone();
  play('pop');
  if (state.stone === Math.ceil(selectedMode.stones / 2)) say('halfway');
  else say('steady');
  if (state.stone >= selectedMode.stones) {
    state.stone = selectedMode.stones;
    setScreen('pour');
    say('pour');
  }
  updateLiveScene();
}

function completePour() {
  if (state.screen !== 'pour' || !mode()) return;
  state.pourProgress = 1;
  completeFlower();
}

function completeFlower() {
  const selectedMode = mode();
  if (!selectedMode) return;
  if (!isComplete(selectedMode.id)) state.completed.push(selectedMode.id);
  play('tada');
  setScreen('bloom');
  say(selectedMode.bloomVoice);
}

function nextGarden() {
  if (state.completed.length === config.modeOrder.length) {
    setScreen('party');
    say('all-bloomed');
  } else {
    setScreen('map');
    say('choose-again');
  }
}

function backToMap() {
  setScreen('map');
  say('choose-again');
}

function repeatPrompt() { say(currentVoiceKey); }
function toggleMute() {
  state.muted = !state.muted;
  voiceClips.setMuted(state.muted);
  if (!state.muted) repeatPrompt();
}

function setPointerFromEvent(event) {
  const rail = event.target.closest('[data-rail]');
  if (!rail) return;
  const rect = rail.getBoundingClientRect();
  const x = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1);
  const y = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1);
  tilt.setPointer(x, y);
}

mount.addEventListener('pointerdown', (event) => {
  const flowerCard = event.target.closest('[data-action="start"]');
  if (flowerCard) {
    // The permission call itself stays in the card's pointer gesture for iOS.
    try { tilt.request(); } catch { state.inputStatus = 'fallback'; }
    return;
  }
  const sound = event.target.closest('[data-action="sound"]');
  if (sound) {
    soundWasLongPress = false;
    soundHoldTimer = window.setTimeout(() => {
      soundHoldTimer = null;
      soundWasLongPress = true;
      toggleMute();
    }, 700);
    return;
  }
  const rail = event.target.closest('[data-rail]');
  if (!rail) return;
  rail.setPointerCapture?.(event.pointerId);
  state.pointerHeld = true;
  setPointerFromEvent(event);
});
mount.addEventListener('pointermove', (event) => {
  if (event.target.closest('[data-rail]') || mount.querySelector('[data-rail]')?.hasPointerCapture?.(event.pointerId)) setPointerFromEvent(event);
});
mount.addEventListener('keydown', (event) => {
  const rail = event.target.closest('[data-rail]');
  if (!rail) return;
  const supported = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!supported.includes(event.key)) return;
  event.preventDefault();
  let x = state.input.source === 'keyboard' ? state.input.x : 0;
  if (event.key === 'ArrowLeft') x = clamp(x - 0.2);
  if (event.key === 'ArrowRight') x = clamp(x + 0.2);
  if (event.key === 'Home') x = 0;
  if (event.key === 'End') x = mode()?.pourSide === 'left' ? -1 : 1;
  // Pointer ownership pauses sensor samples while a switch/keyboard user owns
  // the focused rail. The semantic sample remains visibly "keyboard" in QA.
  tilt.setPointer(x, 0);
  state.inputStatus = 'fallback';
  handleTiltSample({ x, y: 0, source: 'keyboard' });
});
mount.addEventListener('focusout', (event) => {
  if (!event.target.closest('[data-rail]') || state.input.source !== 'keyboard') return;
  state.inputReady = false;
  tilt.releasePointer();
});
for (const name of ['pointerup', 'pointercancel']) {
  mount.addEventListener(name, (event) => {
    if (soundHoldTimer) { clearTimeout(soundHoldTimer); soundHoldTimer = null; }
    const rail = mount.querySelector('[data-rail]');
    if (rail?.hasPointerCapture?.(event.pointerId)) rail.releasePointerCapture?.(event.pointerId);
    state.pointerHeld = false;
    tilt.releasePointer();
  });
}
window.addEventListener('blur', () => {
  state.pointerHeld = false;
  if (state.input.source === 'keyboard') state.inputReady = false;
  tilt.releasePointer();
});
document.addEventListener('visibilitychange', () => {
  lastFrameAt = performance.now();
  if (document.hidden) {
    state.pointerHeld = false;
    if (state.input.source === 'keyboard') state.inputReady = false;
    tilt.releasePointer();
  }
});

mount.addEventListener('click', (event) => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const action = control.dataset.action;
  if (action === 'start') startMode(control.dataset.mode);
  if (action === 'back') backToMap();
  if (action === 'next') nextGarden();
  if (action === 'party-map') { setScreen('map'); say('replay'); }
  if (action === 'sound' && !soundWasLongPress) repeatSound();
});

installUnlockOnGesture({ target: window, onFirst: () => { if (state.screen === 'map') say('welcome'); } });
installKioskGuards();
window.requestAnimationFrame(animationFrame);

// Audio is optional and must never gate the first playable frame. A slow local
// metadata request may finish later; the exact config text is already a safe
// Web Speech fallback.
render();
let startupTimer = null;
const audioReady = voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice);
const audioDeadline = new Promise((resolve) => { startupTimer = window.setTimeout(resolve, 2500); });
const ready = Promise.race([audioReady, audioDeadline]).finally(() => {
  if (startupTimer) window.clearTimeout(startupTimer);
}).then(() => {
  state.ready = true;
});

installDebug({
  gameId: config.id,
  engine: 'garden-delivery',
  ready,
  root: mount,
  timers,
  voice: voiceClips,
  listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
  startMode: async (id) => startMode(id),
  getState: () => ({
    screen: state.screen,
    mode: state.mode,
    stone: state.stone,
    stableProgress: state.stableProgress,
    breeze: state.breeze,
    input: { ...state.input, status: state.inputStatus },
    inputReady: state.inputReady,
    pointerHeld: state.pointerHeld,
    pourProgress: state.pourProgress,
    completedFlowerIds: [...state.completed],
    completed: [...state.completed],
    muted: state.muted,
    seed: state.seed,
  }),
  tap: async (id) => {
    const target = mount.querySelector(`[data-target="${String(id).replace(/"/g, '')}"]`);
    target?.click();
    return Boolean(target);
  },
  setTilt: (x, y, source = 'debug') => handleTiltSample({ x, y, source }),
  setTiltStatus: (status) => { state.inputStatus = status; updateLiveScene(); return status; },
  calibrateTilt: () => tilt.calibrate(),
  completeStep,
  completePour,
  win: () => {
    if (!state.mode) startMode(config.modeOrder[0]);
    state.stone = mode().stones;
    state.pourProgress = 1;
    completeFlower();
  },
  mute: (on = true) => {
    state.muted = Boolean(on);
    voiceClips.setMuted(state.muted);
    return state.muted;
  },
  getAudioLog: () => voiceClips.getAudioLog(),
  fastTimers: (on = true) => {
    const scale = on === false ? 1 : (typeof on === 'number' ? Math.max(.01, on) : 20);
    timers.setScale(scale > 1 ? scale : 1 / scale);
    return on === false ? 1 : (scale > 1 ? 1 / scale : scale);
  },
  onSeed: (nextRng, seed) => { rng = nextRng; state.seed = seed; },
});
