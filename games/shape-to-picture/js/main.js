import { loadConfig } from '../config.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { installKioskGuards, installUnlockOnGesture } from '../../../shared/js/audio-unlock.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { createScreens } from '../../../shared/js/screens.js';
import { progressDots } from '../../../shared/js/hud.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTimers } from '../../../shared/js/timers.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { mulberry32 } from '../../../shared/js/rng.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';

const root = document.getElementById('game');
const els = {
  splash: document.getElementById('splash'),
  splashSound: document.getElementById('splash-sound'),
  welcomeBanner: document.getElementById('welcome-banner'),
  modeCards: document.getElementById('mode-cards'),
  play: document.getElementById('play'),
  playBack: document.getElementById('play-back'),
  playSound: document.getElementById('play-sound'),
  progress: document.getElementById('progress'),
  prompt: document.getElementById('prompt'),
  promptText: document.getElementById('prompt-text'),
  playHost: document.getElementById('play-host'),
  reveal: document.getElementById('reveal'),
  revealBack: document.getElementById('reveal-back'),
  revealSound: document.getElementById('reveal-sound'),
  revealArtHost: document.getElementById('reveal-art-host'),
  revealNext: document.getElementById('reveal-next'),
  revealLabel: document.getElementById('reveal-label'),
  end: document.getElementById('end'),
  endBack: document.getElementById('end-back'),
  endSound: document.getElementById('end-sound'),
  endGallery: document.getElementById('end-gallery'),
  playAgain: document.getElementById('play-again'),
  chooseGame: document.getElementById('choose-game'),
  live: document.getElementById('live-status'),
};

const timers = createTimers();
const narrator = createNarrator({ say: voice.say, stop: voice.stop, announcerParent: root });
const pageDisposers = [];
const roundDisposers = [];
const trayDisposers = [];

let config = null;
let lines = {};
let readyResolve;
const ready = new Promise((resolve) => { readyResolve = resolve; });

const state = {
  screen: 'splash',
  phase: 'boot',
  mode: null,
  roundIndex: 0,
  interaction: null,
  gestureProgress: 0,
  selectedPart: null,
  placed: [],
  revealed: [],
  misses: 0,
  locked: false,
  muted: false,
  firstGesture: false,
  lastVoiceKey: 'intro',
  currentRevealKey: null,
  seed: 42,
  rng: mulberry32(42),
  assetErrors: [],
};

const screens = createScreens({
  root,
  initial: 'splash',
  voice: narrator,
  onEnter: (name) => { state.screen = name; },
  onExit: (name) => {
    if (name === 'play') {
      nudger.stop();
      dragController.cancel();
      clearRoundBindings();
    }
    timers.clearAll();
  },
});

const nudger = createNudger({
  first: 11000,
  repeat: 9500,
  onNudge: () => {
    if (!screens.is('play') || state.phase !== 'input' || !state.mode) return;
    const key = state.mode.nudgeKey;
    say(key);
    if (state.mode.interaction === 'pinch-or-slider') {
      els.playHost.querySelector('.magic-tab-art')?.animate?.(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(-18px)' }, { transform: 'translateY(0)' }],
        { duration: 620, easing: 'ease-out' },
      );
    }
  },
});

const dragController = createDragToSlotDom({
  root: () => els.playHost,
  slotSelector: '.builder-slot',
  slotPad: 42,
  hoverClass: 'is-hovered',
  ghostClass: 'builder-piece dragging',
  grabOffset: 0.3,
  getPiece: (id) => {
    const el = els.playHost.querySelector(`.builder-piece[data-part="${cssEscape(id)}"]`);
    return el ? { id: String(id), el } : null;
  },
  canStart: () => state.phase === 'input' && state.mode?.interaction === 'drag-or-tap-tap',
  onGrab: () => {
    nudger.poke();
    return true;
  },
  onLift: (piece) => piece.el.classList.add('is-dragging'),
  onDrop: async (piece, drag) => {
    piece.el.classList.remove('is-dragging');
    await attemptPlacement(piece.id, drag.slot?.dataset.part || null);
  },
  onCancel: (piece) => piece.el.classList.remove('is-dragging'),
});

function modeById(id) {
  return config?.modes.find((mode) => mode.id === id) || null;
}

function currentRound() {
  return state.mode?.rounds?.[state.roundIndex] || null;
}

function textFor(key, fallback = '') {
  const value = lines?.[key];
  return typeof value === 'string' ? value : fallback;
}

function say(key, fallback = '') {
  if (!key) return Promise.resolve();
  state.lastVoiceKey = key;
  const text = textFor(key, fallback);
  if (text) els.live.textContent = text;
  return narrator.say(key, text);
}

function setMuted(on = true) {
  state.muted = Boolean(on);
  narrator.setMuted(state.muted);
  voice.setMuted(state.muted);
  sfx.setMuted(state.muted);
  return state.muted;
}

function setPrompt(text) {
  els.promptText.textContent = text;
}

function promptForRound(round = currentRound()) {
  if (!round || !state.mode) return 'Paper magic!';
  if (state.mode.interaction === 'tap') return `Tap the ${round.shape}.`;
  if (state.mode.interaction === 'pinch-or-slider') {
    return `Make the ${round.shape === 'scallop' ? 'circle' : round.shape} grow.`;
  }
  return 'Fit the paper shapes into their spots.';
}

function clearBindings(list) {
  list.splice(0).forEach((dispose) => {
    try { dispose?.(); } catch { /* best effort */ }
  });
}

function clearRoundBindings() {
  clearBindings(trayDisposers);
  clearBindings(roundDisposers);
}

function wireTap(element, target, action, role = 'neutral', list = pageDisposers) {
  if (!element) return;
  element.dataset.target = target;
  element.dataset.role = role;
  list.push(onTap(element, action, { feedback: () => { sfx.tick(); nudger.poke(); } }));
}

function renderProgress() {
  els.progress.replaceChildren();
  if (!state.mode) return;
  els.progress.append(progressDots(state.mode.rounds.length, state.roundIndex));
}

function renderModeCards() {
  els.modeCards.innerHTML = config.modes.map((mode) => {
    const first = mode.rounds[0];
    let preview = '';
    if (mode.interaction === 'drag-or-tap-tap') {
      preview = `<div class="mode-preview builder-preview" aria-hidden="true">
        <img class="preview-before" src="${first.pieces[0].asset}" alt="">
        <img class="preview-middle" src="${first.pieces[1].asset}" alt="">
        <img class="preview-after" src="${first.pieces[2].asset}" alt="">
      </div>`;
    } else {
      preview = `<div class="mode-preview" aria-hidden="true">
        <img class="preview-before" src="${first.piece}" alt="">
        <img class="preview-after" src="${first.reveal}" alt="">
      </div>`;
    }
    return `<button class="mode-card" type="button" data-mode="${mode.id}" aria-label="${mode.title}">
      <img class="mode-card-surface" src="${config.theme.buildMat}" alt="" aria-hidden="true">
      <span class="mode-card-content">${preview}<span class="mode-title">${mode.title}</span>
        <span class="mode-skill">${mode.skill}</span></span>
    </button>`;
  }).join('');

  els.modeCards.querySelectorAll('.mode-card').forEach((card) => {
    wireTap(card, `mode-${card.dataset.mode}`, () => startMode(card.dataset.mode), 'choice');
  });
}

function renderRound() {
  dragController.cancel();
  clearRoundBindings();
  const round = currentRound();
  if (!round || !state.mode) return false;
  state.phase = 'input';
  state.interaction = state.mode.interaction;
  state.gestureProgress = 0;
  state.selectedPart = null;
  state.placed = [];
  state.locked = false;
  setPrompt(promptForRound(round));
  renderProgress();

  if (state.mode.interaction === 'drag-or-tap-tap') renderBuilder(round);
  else renderMagic(round, state.mode.interaction === 'pinch-or-slider');

  nudger.arm();
  return true;
}

function renderMagic(round, stretch) {
  els.playHost.innerHTML = `<div class="magic-workspace" data-interaction="${stretch ? 'stretch' : 'tap'}">
    <img class="work-mat-art" src="${config.theme.buildMat}" alt="" aria-hidden="true">
    <button class="magic-shape-button" type="button" data-target="magic-shape" data-role="choice"
      aria-label="${stretch ? 'Stretch' : 'Tap'} the ${round.shape}">
      <img src="${round.piece}" alt="${round.shape} paper shape">
    </button>
    ${stretch ? `<button class="magic-tab-zone" type="button" data-target="magic-tab" data-role="choice" aria-label="Slide the magic tab up">
      <img class="magic-tab-art" src="./assets/sprites/rectangle-coral.webp" alt="" aria-hidden="true">
      <span class="magic-tab-label">Grow</span>
    </button>` : ''}
    <span class="finger-hint">${stretch ? 'Spread or slide up' : 'Tap or trace the shape'}</span>
  </div>`;

  const workspace = els.playHost.querySelector('.magic-workspace');
  const shape = els.playHost.querySelector('.magic-shape-button');
  if (stretch) installStretchGestures(workspace, shape, els.playHost.querySelector('.magic-tab-zone'));
  else installTapGestures(shape);
}

function installTapGestures(shape) {
  roundDisposers.push(onTap(shape, completeGesture, {
    feedback: () => { nudger.poke(); },
  }));

  let tracing = null;
  const down = (event) => {
    if (state.phase !== 'input' || event.isPrimary === false) return;
    tracing = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0 };
  };
  const move = (event) => {
    if (!tracing || tracing.id !== event.pointerId || state.phase !== 'input') return;
    const distance = Math.hypot(event.clientX - tracing.x, event.clientY - tracing.y);
    tracing.distance += distance;
    tracing.x = event.clientX;
    tracing.y = event.clientY;
    setGestureProgress(Math.min(.96, tracing.distance / 210), { complete: false });
    if (tracing.distance >= 210) completeGesture();
  };
  const end = (event) => { if (tracing?.id === event.pointerId) tracing = null; };
  shape.addEventListener('pointerdown', down);
  shape.addEventListener('pointermove', move);
  shape.addEventListener('pointerup', end);
  shape.addEventListener('pointercancel', end);
  roundDisposers.push(() => {
    shape.removeEventListener('pointerdown', down);
    shape.removeEventListener('pointermove', move);
    shape.removeEventListener('pointerup', end);
    shape.removeEventListener('pointercancel', end);
  });
}

function installStretchGestures(workspace, shape, tab) {
  const pointers = new Map();
  let startDistance = 0;
  let startY = 0;
  let baseProgress = 0;

  const down = (event) => {
    if (state.phase !== 'input') return;
    event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* window path remains */ }
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      startDistance = Math.hypot(a.x - b.x, a.y - b.y);
      baseProgress = state.gestureProgress;
    } else {
      startY = event.clientY;
      baseProgress = state.gestureProgress;
    }
    nudger.poke();
  };

  const move = (event) => {
    if (!pointers.has(event.pointerId) || state.phase !== 'input') return;
    event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    let next = state.gestureProgress;
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      next = Math.max(next, baseProgress + (distance - startDistance) / Math.max(150, workspace.clientWidth * .28));
    } else {
      next = Math.max(next, baseProgress + (startY - event.clientY) / Math.max(170, workspace.clientHeight * .46));
    }
    setGestureProgress(next);
  };

  const end = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size === 1) {
      const remaining = [...pointers.values()][0];
      startY = remaining.y;
      baseProgress = state.gestureProgress;
    }
  };

  for (const target of [shape, tab]) {
    target.addEventListener('pointerdown', down);
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }
  roundDisposers.push(() => {
    for (const target of [shape, tab]) {
      target.removeEventListener('pointerdown', down);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
    }
    pointers.clear();
  });
}

function setGestureProgress(value, { complete = true } = {}) {
  if (!['input', 'settling'].includes(state.phase)) return state.gestureProgress;
  const next = Math.max(0, Math.min(1, Number(value) || 0));
  state.gestureProgress = Math.max(state.gestureProgress, next);
  els.playHost.querySelector('.magic-workspace')?.style.setProperty('--gesture-progress', state.gestureProgress);
  if (complete && state.gestureProgress >= .98 && state.phase === 'input') completeGesture();
  return state.gestureProgress;
}

async function completeGesture() {
  if (state.phase !== 'input' || !state.mode || state.mode.interaction === 'drag-or-tap-tap') return false;
  state.phase = 'settling';
  state.locked = true;
  state.gestureProgress = 1;
  nudger.stop();
  const workspace = els.playHost.querySelector('.magic-workspace');
  workspace?.style.setProperty('--gesture-progress', 1);
  const shape = workspace?.querySelector('.magic-shape-button');
  shape?.classList.add('is-working');
  if (state.mode.interaction === 'pinch-or-slider') sfx.whoosh();
  else sfx.pop();
  await timers.wait(250);
  if (!screens.is('play')) return false;
  shape?.classList.remove('is-working');
  shape?.classList.add('is-complete');
  sfx.sparkle();
  await timers.wait(330);
  if (!screens.is('play')) return false;
  return showReveal();
}

function renderBuilder(round) {
  els.playHost.innerHTML = `<div class="builder-layout">
    <div class="builder-board" aria-label="Paper picture mat">
      <img class="work-mat-art" src="${config.theme.buildMat}" alt="" aria-hidden="true">
      ${round.pieces.map((part) => `<button class="builder-slot" type="button"
        data-part="${part.id}" data-slot="${part.id}" data-target="slot-${part.id}" data-role="target"
        aria-label="Spot for ${part.shape}"
        style="left:${part.x}%;top:${part.y}%;--piece-size:${part.size}%;--art-scale:${Math.min(100, Math.max(50, (part.size / 18) * 100))}%;--piece-rotate:${part.rotation || 0}deg;--piece-flip:${part.flip || 1}">
        <img class="slot-ghost" src="${part.asset}" alt="" aria-hidden="true">
        <img class="slot-piece" src="${part.asset}" alt="${part.shape}">
      </button>`).join('')}
    </div>
    <div class="tray-shell" aria-label="Three-pocket paper shape tray">
      <img class="tray-art" src="${config.theme.tray}" alt="" aria-hidden="true">
      <div class="tray-pieces"></div>
    </div>
  </div>`;

  els.playHost.querySelectorAll('.builder-slot').forEach((slot) => {
    roundDisposers.push(onTap(slot, () => handleSlotTap(slot.dataset.part), {
      feedback: () => { sfx.tick(); nudger.poke(); },
    }));
  });
  renderTray();
}

function renderTray() {
  clearBindings(trayDisposers);
  const tray = els.playHost.querySelector('.tray-pieces');
  const round = currentRound();
  if (!tray || !round) return;
  const visible = round.pieces.filter((part) => !state.placed.includes(part.id)).slice(0, 3);
  tray.innerHTML = Array.from({ length: 3 }, (_, index) => {
    const part = visible[index];
    return `<div class="tray-pocket">${part ? `<button class="builder-piece${state.selectedPart === part.id ? ' is-selected' : ''}"
      type="button" data-part="${part.id}" data-target="part-${part.id}" data-role="choice" aria-label="${part.shape}">
      <img src="${part.asset}" alt="${part.shape} paper shape"></button>` : ''}</div>`;
  }).join('');

  tray.querySelectorAll('.builder-piece').forEach((piece) => {
    const down = (event) => dragController.begin(event, piece.dataset.part);
    piece.addEventListener('pointerdown', down);
    const disposeTap = onTap(piece, () => selectPart(piece.dataset.part), {
      feedback: () => nudger.poke(),
    });
    trayDisposers.push(() => {
      piece.removeEventListener('pointerdown', down);
    }, disposeTap);
  });
}

function updatePieceSelection() {
  els.playHost.querySelectorAll('.builder-piece').forEach((piece) => {
    piece.classList.toggle('is-selected', piece.dataset.part === state.selectedPart);
  });
}

function selectPart(partId, { announce = true } = {}) {
  if (state.phase !== 'input' || state.mode?.interaction !== 'drag-or-tap-tap') return false;
  const part = currentRound()?.pieces.find((item) => item.id === partId);
  if (!part || state.placed.includes(part.id)) return false;
  state.selectedPart = state.selectedPart === part.id ? null : part.id;
  updatePieceSelection();
  sfx.pop();
  nudger.poke();
  if (announce && state.selectedPart) say(part.shapeKey);
  return true;
}

function markWrong(partId, slotId) {
  const piece = els.playHost.querySelector(`.builder-piece[data-part="${cssEscape(partId)}"]`);
  const slot = slotId ? els.playHost.querySelector(`.builder-slot[data-part="${cssEscape(slotId)}"]`) : null;
  piece?.classList.add('is-wrong');
  slot?.classList.add('is-wrong');
  timers.after(430, () => {
    piece?.classList.remove('is-wrong');
    slot?.classList.remove('is-wrong');
  });
}

async function attemptPlacement(partId, slotId) {
  if (state.phase !== 'input' || state.mode?.interaction !== 'drag-or-tap-tap') return false;
  const round = currentRound();
  const part = round?.pieces.find((item) => item.id === partId);
  if (!part || state.placed.includes(part.id)) return false;
  nudger.poke();
  if (!slotId || slotId !== part.id) {
    state.misses += 1;
    markWrong(part.id, slotId);
    sfx.unpop();
    await say(state.mode.retryKey || 'gentle-retry');
    return false;
  }

  state.placed.push(part.id);
  state.selectedPart = null;
  const slot = els.playHost.querySelector(`.builder-slot[data-part="${cssEscape(part.id)}"]`);
  slot?.classList.add('is-placed');
  slot?.setAttribute('aria-label', `${part.shape} placed`);
  sfx.pop();
  say(part.shapeKey);
  renderTray();

  if (state.placed.length < round.pieces.length) return true;
  state.phase = 'settling';
  state.locked = true;
  nudger.stop();
  sfx.sparkle();
  await timers.wait(520);
  if (!screens.is('play')) return false;
  return showReveal();
}

function handleSlotTap(slotId) {
  if (!state.selectedPart) {
    state.misses += 1;
    markWrong('', slotId);
    sfx.unpop();
    say(state.mode?.nudgeKey || 'nudge-build');
    return false;
  }
  return attemptPlacement(state.selectedPart, slotId);
}

function showReveal() {
  const round = currentRound();
  if (!round || !state.mode) return false;
  state.phase = 'reveal';
  state.locked = false;
  state.currentRevealKey = round.revealKey;
  if (!state.revealed.includes(round.id)) state.revealed.push(round.id);
  screens.show('reveal');

  els.reveal.classList.toggle('reveal-full-plate', Boolean(round.plate));
  els.reveal.style.backgroundImage = `url("${round.plate || config.theme.background}")`;
  els.revealArtHost.innerHTML = round.reveal
    ? `<img class="reveal-cutout" src="${round.reveal}" alt="${round.alt || round.name || 'paper surprise'}">`
    : '';
  const last = state.roundIndex >= state.mode.rounds.length - 1;
  els.revealLabel.textContent = last ? 'See them all' : 'Next surprise';
  els.revealNext.setAttribute('aria-label', last ? 'See all the surprises' : 'Next surprise');
  screens.hold(burstConfetti({ host: els.reveal, count: 36, duration: 2500, rng: state.rng, drift: 70 }));
  sfx.tada();
  say(round.revealKey);
  return true;
}

function renderEndGallery() {
  els.endGallery.innerHTML = state.mode.rounds.map((round, index) => {
    const art = round.plate || round.reveal;
    return `<div class="gallery-card" style="animation-delay:${index * 75}ms">
      <img class="gallery-card-surface" src="${config.theme.buildMat}" alt="" aria-hidden="true">
      <img class="gallery-art${round.plate ? ' is-scene' : ''}" src="${art}" alt="${round.alt || round.name || 'paper surprise'}">
    </div>`;
  }).join('');
}

function showEnd() {
  if (!state.mode) return false;
  state.phase = 'complete';
  screens.show('end');
  renderEndGallery();
  screens.hold(burstConfetti({ host: els.end, count: 34, duration: 3600, loop: true, rng: state.rng, drift: 52 }));
  sfx.tada();
  say('cheer');
  return true;
}

function advanceRound({ announce = true } = {}) {
  if (!state.mode || state.phase !== 'reveal') return false;
  if (state.roundIndex + 1 >= state.mode.rounds.length) return showEnd();
  state.roundIndex += 1;
  screens.show('play');
  renderRound();
  if (announce) say(currentRound().shapeKey || state.mode.introKey);
  return true;
}

async function startMode(id, { announce = true } = {}) {
  await ready;
  const mode = modeById(id);
  if (!mode) return false;
  return screens.start(async () => {
    timers.clearAll();
    dragController.cancel();
    state.mode = mode;
    state.roundIndex = 0;
    state.revealed = [];
    state.misses = 0;
    state.currentRevealKey = null;
    screens.show('play', { force: screens.is('play') });
    renderRound();
    if (announce) {
      const parts = [{ key: mode.introKey, text: textFor(mode.introKey) }];
      if (mode.interaction !== 'drag-or-tap-tap') {
        parts.push({ key: currentRound().shapeKey, text: textFor(currentRound().shapeKey), gap: 110 });
      }
      narrator.saySequence(parts);
      state.lastVoiceKey = parts[parts.length - 1].key;
    }
    return true;
  }, { busy: false });
}

function showSplash({ announce = true } = {}) {
  dragController.cancel();
  timers.clearAll();
  nudger.stop();
  state.mode = null;
  state.roundIndex = 0;
  state.phase = 'menu';
  state.interaction = null;
  state.selectedPart = null;
  state.placed = [];
  state.revealed = [];
  state.gestureProgress = 0;
  state.currentRevealKey = null;
  screens.show('splash');
  if (announce && state.firstGesture) say('intro');
  return true;
}

function replayPrompt() {
  if (screens.is('splash')) return say('intro');
  if (screens.is('reveal')) return say(state.currentRevealKey || currentRound()?.revealKey);
  if (screens.is('end')) return say('cheer');
  if (screens.is('play')) {
    if (state.mode?.interaction === 'drag-or-tap-tap') return say(state.mode.introKey);
    return say(currentRound()?.shapeKey || state.mode?.introKey);
  }
  return Promise.resolve();
}

function wireStaticControls() {
  wireTap(els.splashSound, 'listen', () => say('intro'));
  wireTap(els.welcomeBanner, 'welcome', () => say('intro'));
  wireTap(els.playBack, 'back', () => showSplash(), 'navigation');
  wireTap(els.playSound, 'sound', replayPrompt);
  wireTap(els.prompt, 'prompt', replayPrompt);
  wireTap(els.revealBack, 'reveal-back', () => showSplash(), 'navigation');
  wireTap(els.revealSound, 'reveal-sound', replayPrompt);
  wireTap(els.revealNext, 'next', () => advanceRound(), 'navigation');
  wireTap(els.endBack, 'end-back', () => showSplash(), 'navigation');
  wireTap(els.endSound, 'end-sound', replayPrompt);
  wireTap(els.playAgain, 'play-again', () => startMode(state.mode?.id), 'navigation');
  wireTap(els.chooseGame, 'choose-game', () => showSplash(), 'navigation');
}

async function semanticTap(targetId) {
  const id = String(targetId || '');
  if (id.startsWith('mode-')) return startMode(id.slice(5), { announce: false });
  if (id === 'magic-shape' || id === 'magic-tab') return completeGesture();
  if (id.startsWith('part-')) return selectPart(id.slice(5), { announce: false });
  if (id.startsWith('slot-')) return handleSlotTap(id.slice(5));
  const actions = {
    listen: () => say('intro'), welcome: () => say('intro'),
    back: () => showSplash({ announce: false }), sound: replayPrompt, prompt: replayPrompt,
    'reveal-back': () => showSplash({ announce: false }), 'reveal-sound': replayPrompt,
    next: () => advanceRound({ announce: false }),
    'end-back': () => showSplash({ announce: false }), 'end-sound': replayPrompt,
    'play-again': () => startMode(state.mode?.id, { announce: false }),
    'choose-game': () => showSplash({ announce: false }),
  };
  return actions[id] ? actions[id]() : false;
}

async function debugWinRound() {
  await ready;
  if (!state.mode) await startMode('tap-magic', { announce: false });
  if (state.phase === 'reveal' || state.phase === 'complete') return true;
  if (state.mode.interaction !== 'drag-or-tap-tap') return completeGesture();
  for (const part of currentRound().pieces) {
    if (!state.placed.includes(part.id)) await attemptPlacement(part.id, part.id);
  }
  return state.phase === 'reveal';
}

function snapshot() {
  const round = currentRound();
  return {
    screen: screens.current,
    phase: state.phase,
    mode: state.mode?.id || null,
    roundIndex: state.roundIndex,
    roundCount: state.mode?.rounds?.length || 0,
    completed: state.revealed.length,
    expected: round?.id || null,
    interaction: state.interaction,
    awaitingInput: state.phase === 'input',
    gestureProgress: Number(state.gestureProgress.toFixed(3)),
    selectedPart: state.selectedPart,
    placed: [...state.placed],
    slotsTotal: round?.pieces?.length || 0,
    misses: state.misses,
    revealed: [...state.revealed],
    muted: state.muted,
    seed: state.seed,
    assetErrors: [...state.assetErrors],
  };
}

function collectGameTargets() {
  const targets = [];
  for (const node of root.querySelectorAll('[data-target]')) {
    if (node.closest('[hidden]')) continue;
    const rect = node.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) continue;
    targets.push({
      id: String(node.dataset.target),
      role: String(node.dataset.role || 'neutral'),
      rect: { x: round2(rect.x), y: round2(rect.y), w: round2(rect.width), h: round2(rect.height) },
    });
  }
  return targets;
}

function getLayout() {
  const stage = els.playHost.getBoundingClientRect();
  const prompt = els.prompt.getBoundingClientRect();
  return {
    viewport: { width: innerWidth, height: innerHeight },
    orientation: innerWidth >= innerHeight ? 'landscape' : 'portrait',
    stage: rectJson(stage),
    prompt: rectJson(prompt),
    targets: collectGameTargets(),
    overflow: {
      bodyX: document.documentElement.scrollWidth > innerWidth,
      bodyY: document.documentElement.scrollHeight > innerHeight,
    },
  };
}

function applyFastTimers(scale = 0.05) {
  const n = Number(scale);
  const multiplier = Number.isFinite(n) && n > 0 ? (n > 1 ? 1 / n : n) : 0.05;
  timers.setScale(1 / Math.max(.01, Math.min(1, multiplier)));
  return Math.max(.01, Math.min(1, multiplier));
}

function allImageUrls(data) {
  const urls = Object.values(data.theme).filter((value) => typeof value === 'string' && /\.(?:webp|png|jpe?g)$/i.test(value));
  for (const mode of data.modes) {
    for (const round of mode.rounds) {
      if (round.piece) urls.push(round.piece);
      if (round.reveal) urls.push(round.reveal);
      if (round.plate) urls.push(round.plate);
      for (const part of round.pieces || []) urls.push(part.asset);
    }
  }
  return [...new Set(urls)];
}

function verifyImages(urls) {
  return Promise.all(urls.map((url) => new Promise((resolve) => {
    const image = new Image();
    const finish = (ok) => resolve(ok ? null : url);
    const deadline = setTimeout(() => finish(false), 8000);
    image.onload = () => { clearTimeout(deadline); finish(image.naturalWidth > 0); };
    image.onerror = () => { clearTimeout(deadline); finish(false); };
    image.src = url;
  }))).then((results) => results.filter(Boolean));
}

async function boot() {
  config = await loadConfig();
  state.seed = Number(config.debug?.seed) || 42;
  state.rng = mulberry32(state.seed);
  const lineResponse = await fetch(config.audio.lines, { cache: 'no-cache' });
  lines = lineResponse.ok ? await lineResponse.json() : {};

  renderModeCards();
  wireStaticControls();
  const images = allImageUrls(config);
  const [, failures] = await Promise.all([
    voice.init(config.audio.manifest, config.audio.lines, lines),
    Promise.all([preloadImages(images), verifyImages(images)]).then(([, result]) => result),
  ]);
  state.assetErrors = failures;
  state.phase = 'menu';
  readyResolve({ ok: failures.length === 0, assetErrors: [...failures] });
  if (failures.length) console.error('[shape-surprise] required art failed', failures);
}

pageDisposers.push(installUnlockOnGesture({
  onFirst: () => {
    state.firstGesture = true;
    ready.then(() => { if (screens.is('splash')) say('intro'); });
  },
}));
pageDisposers.push(installKioskGuards());

const disposeDebug = installDebug({
  gameId: 'shape-to-picture',
  engine: 'custom-shape-surprise',
  version: 1,
  ready,
  timers,
  narrator,
  voice,
  sfx,
  listModes: () => (config?.modes || []).map(({ id, title, skill }) => ({ id, title, skill })),
  startMode: async (id) => { await ready; return startMode(id, { announce: false }); },
  getState: snapshot,
  getTargets: collectGameTargets,
  tap: async (id) => ({ accepted: Boolean(await semanticTap(id)) }),
  winRound: debugWinRound,
  home: () => showSplash({ announce: false }),
  mute: setMuted,
  onSeed: (rng, seed) => { state.rng = rng; state.seed = seed; },
  trace: (value = 1) => setGestureProgress(Array.isArray(value) ? Math.min(1, value.length / 12) : value),
  setGestureProgress,
  completeGesture,
  placePart: (partId, slotId = partId) => attemptPlacement(String(partId), String(slotId)),
  advance: () => advanceRound({ announce: false }),
  setFastTimers: applyFastTimers,
  getLayout,
  getAudioLog: voice.getAudioLog,
  clearAudioLog: voice.clearAudioLog,
});

window.addEventListener('pagehide', () => {
  dragController.cancel();
  nudger.stop();
  timers.clearAll();
  narrator.dispose();
  voice.stop();
  disposeDebug();
  clearRoundBindings();
  clearBindings(pageDisposers);
}, { once: true });

boot().catch((error) => {
  console.error('[shape-surprise] boot failed', error);
  state.phase = 'error';
  state.assetErrors.push(String(error?.message || error));
  root.innerHTML = '<p class="fatal-message">Shape Surprise Studio could not open. Please ask a grown-up to try again.</p>';
  readyResolve({ ok: false, error: String(error?.message || error) });
});

function cssEscape(value) {
  if (globalThis.CSS?.escape) return CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function round2(value) { return Math.round(value * 100) / 100; }
function rectJson(rect) { return { x: round2(rect.x), y: round2(rect.y), w: round2(rect.width), h: round2(rect.height) }; }
