import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import { onTap } from '../../../shared/js/tap.js';
import { coverageGesture, holdPour, pathGestures } from './gesture-surface.js';
import { installUnlockOnGesture, installKioskGuards, unlockAll } from '../../../shared/js/audio-unlock.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createScreens, wireEndScreen } from '../../../shared/js/screens.js';
import { renderModeCards } from '../../../shared/js/mode-select.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';

const $ = (selector) => document.querySelector(selector);
const els = {
  splash: $('#splash'),
  play: $('#play'),
  reveal: $('#reveal'),
  cards: $('#recipe-cards'),
  back: $('#back'),
  sound: $('#sound'),
  rail: $('#step-rail'),
  prompt: $('.prompt-card'),
  promptIcon: $('#prompt-icon'),
  promptText: $('#prompt-text'),
  board: $('#workboard'),
  tray: $('#ingredient-tray'),
  revealBack: $('#reveal-back'),
  finished: $('#finished-art'),
  ribbon: $('#ribbon'),
  stars: $('#stars'),
  recap: $('#recap'),
  again: $('#again'),
  recipes: $('#recipes'),
  confetti: $('#confetti'),
};

const ICONS = {
  cut: './assets/ui/icon-cut.webp',
  spread: './assets/ui/icon-spread.webp',
  peel: './assets/ui/icon-peel.webp',
  arrange: './assets/ui/icon-arrange.webp',
  pour: './assets/ui/icon-pour.webp',
};

const FOOD = './assets/food/';
const STAGE_ART = {
  plate: `${FOOD}plate-large.webp`,
  toast: `${FOOD}toast.webp`,
  boat: `${FOOD}banana-boat-base.webp`,
  'kiwi-whole': `${FOOD}kiwi-whole.webp`,
  'apple-whole': `${FOOD}apple-whole.webp`,
  'apple-round': `${FOOD}apple-round.webp`,
  'banana-whole': `${FOOD}banana-whole.webp`,
  'banana-peeled': `${FOOD}banana-peeled.webp`,
  'peel-strip': `${FOOD}peel-strip.webp`,
  'parfait-glass': `${FOOD}parfait-glass.webp`,
  'pour-stream': `${FOOD}pour-stream.webp`,
};
const JAM_ART = { toast: `${FOOD}jam-blob.webp`, 'apple-round': `${FOOD}nut-butter-blob.webp` };
const BADGE_KINDS = { fruit: 'kiwi', toast: 'banana', boat: 'berry', apple: 'lid', rainbow: 'orange', parfait: 'strawberry' };
// Deliberate snack/food palette (red, blueberry, banana, kiwi, orange, berry) —
// kept as-is rather than the platform QK_PALETTE.
const SNACK_PALETTE = ['#d94d62', '#405aa5', '#f4cc54', '#75a93c', '#ee8b38', '#7b4fa0'];

const SHORT_PROMPTS = {
  'fruit-cut': 'Swipe the dotted lines',
  'fruit-arrange': 'Build a silly face',
  'toast-spread': 'Spread in big circles',
  'toast-arrange': 'Plant fruit flowers',
  'boat-peel': 'Pull the peels down',
  'boat-cut': 'Swipe the dotted lines',
  'boat-arrange': 'Fill the banana boat',
  'apple-cut': 'Swipe the dotted lines',
  'apple-spread': 'Spread to the edges',
  'apple-arrange': 'Stack the sandwich',
  'rainbow-cut': 'Swipe the dotted lines',
  'rainbow-warm': 'Make a fruit rainbow',
  'rainbow-cool': 'Add green and purple',
  'parfait-pour': 'Hold the cup to pour',
  'parfait-sprinkle': 'Drop in the berries',
  'parfait-pour2': 'Pour one more layer',
  'parfait-top': 'Decorate the top',
};

// `screen` is NOT here: shared/js/screens.js owns which screen is visible, and
// a second copy of that fact in this object is how the two drift apart.
const state = {
  mode: null,
  step: 0,
  completed: 0,
  total: 0,
  currentPrompt: 'welcome',
  selectedPiece: null,
  muted: false,
  timeScale: 1,
  advancing: false,
  spreadDabs: [],
  placedHistory: [],
  fillLevel: 0,
};

let mode = null;
let gestureDispose = null;
let dragBound = false;
let coverage = null;
let pour = null;
let stepTapDisposers = [];
let transitionPromise = Promise.resolve();
let lastStartNudge = 0;
let lastPourNudge = 0;
let movementDemoToken = 0;
let revealToken = 0;
let confettiCancel = null;

const ready = voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice);

document.documentElement.style.setProperty('--accent', config.theme.accent);
document.documentElement.style.setProperty('--bg-image', `url('${new URL(config.theme.background, document.baseURI).href}')`);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(1, ms * state.timeScale)));
}

installUnlockOnGesture();
installKioskGuards();

function speak(key) {
  state.currentPrompt = key;
  if (state.muted) return Promise.resolve();
  return voice.say(key, config.voice[key]);
}

// The router. `voice` is handed over so every transition stops the outgoing
// line — except the one into the reveal, which passes `{ silent: true }` so a
// prompt that is still finishing plays out exactly as it always has.
const screens = createScreens({
  screens: { splash: els.splash, play: els.play, reveal: els.reveal },
  initial: 'splash',
  voice,
});

function img(src, className = '') {
  const image = document.createElement('img');
  image.src = src;
  image.alt = '';
  image.draggable = false;
  if (className) image.className = className;
  return image;
}

function ingredientArt(kind) {
  return config.ingredients[kind]?.art || '';
}

function ingredientColor(kind) {
  return config.ingredients[kind]?.color || '#efc64d';
}

function clearStep() {
  gestureDispose?.();
  ingredientDrag.cancel();
  coverage?.destroy?.();
  pour?.destroy?.();
  gestureDispose = null;
  coverage = null;
  pour = null;
  stepTapDisposers.forEach((dispose) => dispose());
  stepTapDisposers = [];
  state.selectedPiece = null;
  state.completed = 0;
  state.total = 0;
  els.board.replaceChildren();
  els.tray.replaceChildren();
  els.board.classList.remove('step-in');
}

function showSplash({ speakPrompt = false } = {}) {
  mode = null;
  state.mode = null;
  state.step = 0;
  state.advancing = false;
  // show() runs the leaving screen's disposer bag (clearStep) and stops the
  // voice, so neither is repeated here.
  screens.show('splash');
  if (speakPrompt) speak('again');
}

// Built once, at boot, and never re-rendered: returning to the splash must not
// replay the staggered `card-in` entrance.
function renderCards() {
  renderModeCards({
    host: els.cards,
    modes: config.modes,
    onPick: (id) => startMode(id),
    // These cards are hand-illustrated storybook art with the recipe name baked
    // into the picture, so `skin: false` keeps every pixel of the local look and
    // takes only the structure, the press path, and the 96px touch floor.
    skin: false,
    cardClass: 'recipe-card',
    showTitle: false,
    vars: (item, index) => ({
      '--card-color': item.accent || config.theme.accent,
      '--tilt': `${[-2, 1.5, -1, 1.8, -1.4, 1][index % 6]}deg`,
      '--i': index,
    }),
    decorate: (button, item) => {
      button.append(img(ingredientArt(BADGE_KINDS[item.id] || 'strawberry'), 'card-badge'));
    },
    feedback: () => {
      unlockAll();
      sfx.tick();
    },
  });
}

function renderRail() {
  els.rail.replaceChildren();
  mode.steps.forEach((step, index) => {
    const bead = document.createElement('span');
    bead.className = 'step-bead';
    if (index < state.step) bead.classList.add('done');
    if (index === state.step) bead.classList.add('active');
    bead.append(img(ICONS[step.icon], 'bead-icon'));
    els.rail.append(bead);
  });
}

function currentStep() {
  return mode?.steps[state.step] || null;
}

function setPrompt(step) {
  els.promptIcon.replaceChildren(img(ICONS[step.icon]));
  els.promptText.textContent = SHORT_PROMPTS[step.prompt] || '';
}

function makeMovementDemo(kind) {
  const finger = img('./assets/gesture-finger.webp', `gesture-demo-finger demo-${kind}`);
  finger.setAttribute('aria-hidden', 'true');
  return finger;
}

function demonstrateMovement(playback) {
  const finger = els.board.querySelector('.gesture-demo-finger');
  if (!finger) return playback;
  const token = ++movementDemoToken;
  finger.classList.remove('is-demonstrating');
  void finger.offsetWidth;
  finger.classList.add('is-demonstrating');
  return Promise.resolve(playback).finally(() => {
    if (token === movementDemoToken && finger.isConnected) {
      finger.classList.remove('is-demonstrating');
    }
  });
}

function dismissMovementDemo() {
  movementDemoToken += 1;
  els.board.querySelector('.gesture-demo-finger')?.classList.remove('is-demonstrating');
}

function makeGestureCue() {
  const cue = document.createElement('span');
  cue.className = 'gesture-cue gesture-cue-x';
  cue.setAttribute('aria-hidden', 'true');
  const start = document.createElement('i');
  start.className = 'gesture-start';
  const arrow = document.createElement('i');
  arrow.className = 'gesture-arrow';
  cue.append(start, arrow);
  return cue;
}

function nudgeStart() {
  const now = performance.now();
  els.board.classList.remove('cue-nudge');
  void els.board.offsetWidth;
  els.board.classList.add('cue-nudge');
  sfx.silly();
  if (now - lastStartNudge > 900) {
    lastStartNudge = now;
    speak('start-dot');
  }
}

function makeGuideLine(index, total, positions = null) {
  const line = document.createElement('div');
  line.className = `guide-line${index === 0 ? ' is-current' : ''}`;
  line.dataset.gesture = 'path';
  line.dataset.axis = 'x';
  line.dataset.targetId = `gesture-${index}`;
  line.style.top = `${positions?.[index] ?? (20 + index * (60 / Math.max(1, total - 1)))}%`;
  line.append(makeGestureCue());
  return line;
}

function finishGuide(el) {
  if (!el || el.classList.contains('done') || !el.classList.contains('is-current') || state.advancing) return false;
  el.classList.add('done');
  el.classList.remove('is-current');
  el.closest('.cut-item')?.classList.add('cut-done');
  state.completed += 1;
  sfx.pop();
  const next = els.board.querySelector('[data-gesture]:not(.done)');
  next?.classList.add('is-current');
  if (state.completed >= state.total) transitionPromise = completeStep();
  return true;
}

function finishFreeGuide(el) {
  if (!el || el.classList.contains('done') || state.advancing) return false;
  el.classList.add('done');
  state.completed += 1;
  sfx.pop();
  if (state.completed >= state.total) transitionPromise = completeStep();
  return true;
}

function renderPathStep(step) {
  state.total = step.count;
  if (step.target === 'strawberry-row') {
    const row = document.createElement('div');
    row.className = 'cut-row';
    for (let i = 0; i < step.count; i += 1) {
      const item = document.createElement('div');
      item.className = 'cut-item';
      item.append(img(ingredientArt('strawberry'), 'cut-food'));
      const line = makeGuideLine(i, 1);
      line.style.top = '46%';
      if (i !== 0) line.classList.remove('is-current');
      if (i === 0) line.classList.add('is-current');
      item.append(line);
      row.append(item);
    }
    els.board.append(row);
  } else {
    const stage = document.createElement('div');
    stage.className = `cut-stage target-${step.target}`;
    stage.append(img(STAGE_ART[step.target], 'cut-food'));
    for (let i = 0; i < step.count; i += 1) {
      stage.append(makeGuideLine(i, step.count, step.lines));
    }
    els.board.append(stage);
  }
  gestureDispose = pathGestures(els.board, {
    threshold: 76,
    onComplete: finishGuide,
    onWrongStart: nudgeStart,
  });
}

function renderPeelStep(step) {
  const banana = document.createElement('div');
  banana.className = 'peel-stage';
  banana.append(img(STAGE_ART['banana-whole'], 'peel-banana'));
  for (let i = 0; i < step.count; i += 1) {
    const strip = document.createElement('div');
    strip.className = `peel-strip free-gesture strip-${i}`;
    strip.dataset.gesture = 'path';
    strip.dataset.axis = 'y';
    strip.dataset.targetId = `gesture-${i}`;
    strip.append(img(STAGE_ART['peel-strip'], 'peel-art'));
    banana.append(strip);
  }
  banana.append(makeMovementDemo('peel'));
  els.board.append(banana);
  state.total = step.count;
  gestureDispose = pathGestures(els.board, {
    threshold: 72,
    requireCurrent: false,
    onProgress: dismissMovementDemo,
    onComplete: finishFreeGuide,
  });
}

function makeDab(step, xPct, yPct, spec = null) {
  const dab = img(JAM_ART[step?.base || step?.target] || JAM_ART.toast, 'spread-dab');
  const rot = spec?.rot ?? Math.floor(((xPct * 7 + yPct * 13) % 60) - 30);
  const scale = spec?.scale ?? (0.85 + ((xPct + yPct) % 30) / 100);
  dab.style.left = `${xPct}%`;
  dab.style.top = `${yPct}%`;
  dab.style.setProperty('--rot', `${rot}deg`);
  dab.style.setProperty('--scale', scale);
  return dab;
}

function renderSpreadStep(step) {
  const stage = document.createElement('div');
  stage.className = `spread-stage target-${step.target}`;
  stage.dataset.targetId = 'spread';
  stage.append(img(STAGE_ART[step.target], 'spread-food'));
  const finger = makeMovementDemo('spread');
  const meter = document.createElement('div');
  meter.className = 'spread-meter';
  meter.innerHTML = '<span></span>';
  stage.append(finger, meter);
  els.board.append(stage);
  state.total = step.count;
  state.spreadDabs = [];

  coverage = coverageGesture(stage, {
    cell: 54,
    needed: step.count,
    onDab: (x, y) => {
      dismissMovementDemo();
      const r = stage.getBoundingClientRect();
      const xPct = Math.round((x / r.width) * 100);
      const yPct = Math.round((y / r.height) * 100);
      if (state.spreadDabs.length < 40) state.spreadDabs.push({ x: xPct, y: yPct });
      stage.insertBefore(makeDab(step, xPct, yPct), meter);
      sfx.tick();
    },
    onProgress: (progress, count) => {
      state.completed = Math.min(step.count, count);
      meter.style.setProperty('--coverage', `${Math.round(progress * 100)}%`);
    },
    onComplete: () => {
      sfx.sparkle();
      transitionPromise = completeStep();
    },
  });
}

function nudgePour() {
  const now = performance.now();
  sfx.silly();
  if (now - lastPourNudge > 1200) {
    lastPourNudge = now;
    speak('hold-pour');
  }
}

function renderPourStep(step) {
  const stage = document.createElement('div');
  stage.className = 'pour-stage';
  const glassWrap = document.createElement('div');
  glassWrap.className = 'glass-wrap';
  const glass = img(STAGE_ART['parfait-glass'], 'glass-art');
  const fill = document.createElement('div');
  fill.className = 'glass-fill';
  const [from, to] = step.fill || [0, 60];
  const startLevel = Math.max(state.fillLevel, from);
  fill.style.setProperty('--fill', `${startLevel}%`);
  glassWrap.append(glass, fill);
  state.placedHistory.forEach((spec) => {
    const piece = img(ingredientArt(spec.kind), 'placed-static');
    piece.style.left = `${spec.x}%`;
    piece.style.top = `${spec.y}%`;
    piece.classList.add(`shape-${spec.shape || 'round'}`);
    glassWrap.append(piece);
  });
  const stream = img(STAGE_ART['pour-stream'], 'pour-stream-art');
  glassWrap.append(stream);
  const cup = document.createElement('button');
  cup.className = 'pour-cup';
  cup.dataset.targetId = 'pour';
  cup.setAttribute('aria-label', 'Hold to pour');
  cup.append(img(`${FOOD}yogurt-pot.webp`, 'pour-cup-art'));
  stage.append(glassWrap, cup, makeMovementDemo('pour'));
  els.board.append(stage);
  state.total = step.count;

  const setLevel = (progress) => {
    state.fillLevel = Math.round(startLevel + (to - startLevel) * progress);
    fill.style.setProperty('--fill', `${state.fillLevel}%`);
  };

  pour = holdPour(stage, {
    cupEl: cup,
    needed: step.count,
    onHoldStart: () => {
      dismissMovementDemo();
      stage.classList.add('pouring');
    },
    onHoldEnd: () => stage.classList.remove('pouring'),
    onTick: (ticks) => {
      if (ticks % 2 === 0) sfx.tick();
    },
    onProgress: (progress, ticks) => {
      state.completed = ticks;
      setLevel(progress);
    },
    onComplete: () => {
      stage.classList.remove('pouring');
      sfx.sparkle();
      transitionPromise = completeStep();
    },
    onWrongStart: nudgePour,
  });
}

function makeSlot(spec, index) {
  const slot = document.createElement('button');
  slot.className = 'slot';
  slot.dataset.kind = spec.kind;
  slot.dataset.targetId = `slot-${index}`;
  slot.dataset.shape = spec.shape || 'round';
  slot.style.left = `${spec.x}%`;
  slot.style.top = `${spec.y}%`;
  slot.style.setProperty('--slot-color', ingredientColor(spec.kind));
  slot.setAttribute('aria-label', `Place ${spec.kind} here`);
  return slot;
}

function makeIngredient(spec, index) {
  const piece = document.createElement('button');
  piece.className = 'ingredient';
  piece.dataset.kind = spec.kind;
  piece.dataset.targetId = `piece-${index}`;
  piece.style.setProperty('--slot-color', ingredientColor(spec.kind));
  piece.setAttribute('aria-label', spec.kind);
  piece.append(img(ingredientArt(spec.kind), 'ingredient-art'));
  return piece;
}

// ---- Drag: shared/js/stage/drag-to-slot-dom.js ---------------------------
// Was ~50 LOC of hand-rolled pointerdown/move/up/cancel in gesture-surface.js
// (ingredientDrag) — a byte-for-byte match for the module's own default
// ghost (cloneNode, strip id) and slot resolution (elementFromPoint + a
// 20px-padded rect fallback), just with the padding and callback names
// spelled out by hand. `els.tray` is a fixed element (only its `.ingredient`
// children change per step), so the pointerdown listener is wired once.
const ingredientDrag = createDragToSlotDom({
  getPiece: (el) => el,
  slotSelector: '.slot:not(.filled)',
  slotPad: 20,
  root: () => els.board,
  ghostClass: 'drag-clone',
  slop: 8,
  onLift: (piece) => { piece.style.opacity = '.25'; },
  onTap: (piece) => selectPiece(piece),
  onDrop: (piece, drag) => {
    piece.style.opacity = '';
    if (drag.slot) attemptPlace(piece, drag.slot);
    else nudgePiece(piece);
  },
  onCancel: (piece) => { piece.style.opacity = ''; },
});

function wireIngredientDrag() {
  if (dragBound) return;
  dragBound = true;
  els.tray.addEventListener('pointerdown', (event) => {
    const el = event.target.closest('.ingredient');
    if (!el || !els.tray.contains(el) || el.classList.contains('placed')) return;
    event.preventDefault();
    ingredientDrag.begin(event, el);
  });
}

function selectPiece(piece) {
  if (piece.classList.contains('placed')) return false;
  els.tray.querySelectorAll('.ingredient.selected').forEach((el) => el.classList.remove('selected'));
  if (state.selectedPiece === piece) {
    state.selectedPiece = null;
    return true;
  }
  state.selectedPiece = piece;
  piece.classList.add('selected');
  sfx.tick();
  return true;
}

function nudgePiece(piece) {
  piece.classList.remove('wiggle');
  void piece.offsetWidth;
  piece.classList.add('wiggle');
  sfx.silly();
  speak('nudge');
}

function attemptPlace(piece, slot) {
  if (!piece || !slot || piece.classList.contains('placed') || slot.classList.contains('filled')) return false;
  if (piece.dataset.kind !== slot.dataset.kind) {
    nudgePiece(piece);
    return false;
  }
  piece.classList.add('placed');
  piece.classList.remove('selected');
  slot.classList.add('filled');
  slot.append(img(ingredientArt(piece.dataset.kind), 'slot-art'));
  state.placedHistory.push({
    kind: slot.dataset.kind,
    x: parseFloat(slot.style.left),
    y: parseFloat(slot.style.top),
    shape: slot.dataset.shape,
  });
  state.selectedPiece = null;
  state.completed += 1;
  sfx.pop();
  if (state.completed >= state.total) transitionPromise = completeStep();
  return true;
}

function renderArrangeStep(step) {
  const base = document.createElement('div');
  base.className = `arrange-stage base-${step.base}`;
  base.append(img(STAGE_ART[step.base], 'arrange-food'));
  if (step.base === 'parfait-glass') {
    const fill = document.createElement('div');
    fill.className = 'glass-fill';
    fill.style.setProperty('--fill', `${step.keepPour ? state.fillLevel : 0}%`);
    base.append(fill);
  }
  if (step.keepSpread) {
    state.spreadDabs.forEach((spec) => base.append(makeDab(step, spec.x, spec.y, spec)));
  }
  if (step.keepPlaced) {
    state.placedHistory.forEach((spec) => {
      const piece = img(ingredientArt(spec.kind), 'placed-static');
      piece.style.left = `${spec.x}%`;
      piece.style.top = `${spec.y}%`;
      piece.classList.add(`shape-${spec.shape || 'round'}`);
      base.append(piece);
    });
  } else {
    state.placedHistory = [];
  }

  step.slots.forEach((spec, index) => {
    const slot = makeSlot(spec, index);
    base.append(slot);
    stepTapDisposers.push(onTap(slot, () => {
      if (state.selectedPiece) attemptPlace(state.selectedPiece, slot);
      else sfx.tick();
    }));
    const piece = makeIngredient(spec, index);
    els.tray.append(piece);
  });
  els.board.append(base);
  state.total = step.slots.length;

  wireIngredientDrag();
}

function setupStep({ speakPrompt = true } = {}) {
  clearStep();
  const step = currentStep();
  if (!step) return revealSnack();
  renderRail();
  setPrompt(step);
  els.board.classList.add('step-in');

  if (step.id === 'spread') renderSpreadStep(step);
  else if (step.id === 'peel') renderPeelStep(step);
  else if (step.id === 'cut') renderPathStep(step);
  else if (step.id === 'pour') renderPourStep(step);
  else renderArrangeStep(step);

  requestAnimationFrame(() => els.board.classList.add('step-in'));
  if (speakPrompt) demonstrateMovement(speak(step.prompt));
}

async function completeStep() {
  if (state.advancing) return;
  state.advancing = true;
  renderRail();
  sfx.sparkle();
  await wait(420);
  state.step += 1;
  state.advancing = false;
  if (state.step >= mode.steps.length) {
    await revealSnack();
  } else {
    setupStep();
  }
}

function renderRecap() {
  els.recap.replaceChildren();
  mode.steps.forEach((step) => {
    const tile = document.createElement('span');
    tile.className = 'recap-tile';
    tile.append(img(ICONS[step.icon], 'recap-icon'));
    els.recap.append(tile);
  });
}

async function revealSnack() {
  const token = ++revealToken;
  // `silent`: the step prompt that was still finishing when the last target
  // landed plays out, exactly as it did before the router existed.
  // show() runs the play screen's bag, which is where clearStep() now lives.
  screens.show('reveal', { silent: true });
  // Leaving the reveal must abandon the star/ribbon sequence below. Without
  // this, tapping "recipes" mid-celebration let the awaited loop wake up and
  // speak the cheer line over the splash.
  screens.hold(() => {
    revealToken += 1;
    confettiCancel?.();
    confettiCancel = null;
  });
  els.finished.src = mode.reveal || mode.art;
  els.finished.alt = mode.title;
  els.ribbon.classList.remove('show');
  els.stars.querySelectorAll('.star').forEach((star) => star.classList.remove('show'));
  els.recap.classList.remove('show');
  confettiCancel?.();
  confettiCancel = null;
  renderRecap();
  sfx.tada();
  await wait(320);
  if (token !== revealToken) return;
  els.ribbon.classList.add('show');
  const stars = [...els.stars.querySelectorAll('.star')];
  for (let i = 0; i < stars.length; i += 1) {
    if (token !== revealToken) return;
    stars[i].classList.add('show');
    if (i < stars.length - 1) sfx.pop();
    else sfx.tada();
    await wait(260);
  }
  if (token !== revealToken) return;
  confettiCancel = burstConfetti({ host: els.confetti, palette: SNACK_PALETTE, count: 34 });
  els.recap.classList.add('show');
  await speak(mode.cheer);
}

// screens.start() is the double-tap guard: two presses 80ms apart used to run
// this whole body twice — two teardowns, two renders, two intro lines over each
// other. The second call now resolves to `false` (which is also what
// QLOBE_DEBUG.tap('mode-…') reports back) and the latch is released in a
// `finally`, so a throw in here can never lock a child out of every recipe.
async function startMode(id) {
  return screens.start(async () => {
    await ready;
    const next = config.modes.find((item) => item.id === id);
    if (!next) return false;
    mode = next;
    state.mode = id;
    state.step = 0;
    state.advancing = false;
    state.spreadDabs = [];
    state.placedHistory = [];
    state.fillLevel = 0;
    // release() first: show('play') is idempotent, so restarting a mode while
    // already on the play screen would otherwise neither tear the old step
    // down nor re-arm the bag.
    screens.release();
    screens.show('play');
    screens.hold(clearStep);
    await speak(mode.intro);
    setupStep();
    return true;
  }, { busy: false });
}

onTap(els.back, () => {
  sfx.tick();
  showSplash();
});
onTap(els.sound, () => {
  sfx.tick();
  demonstrateMovement(speak(state.currentPrompt));
});
onTap(els.prompt, () => {
  sfx.tick();
  demonstrateMovement(speak(state.currentPrompt));
});

// The reveal is this game's end screen. Its three controls are static markup,
// so they are wired once for the session (`hold: false`) rather than rebuilt
// per visit — but back and "more recipes" still share ONE destination, the
// splash, which is the navigation rule (docs/interaction-patterns.md §8).
// `feedback: null` + `onPress` keep the tick on the accepted press, where this
// game has always played it.
wireEndScreen({
  screens,
  back: els.revealBack,
  choose: els.recipes,
  again: els.again,
  onSplash: () => showSplash({ speakPrompt: true }),
  onAgain: () => startMode(mode.id),
  onPress: () => sfx.tick(),
  feedback: null,
  hold: false,
});

for (const button of [els.back, els.revealBack, els.sound, els.prompt, els.again, els.recipes]) {
  button.addEventListener('pointerdown', (event) => event.stopPropagation());
}

function targetRect(el) {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}

function debugTargets() {
  if (screens.is('splash')) {
    return [...els.cards.querySelectorAll('.recipe-card')].map((el) => ({
      id: `mode-${el.dataset.mode}`,
      role: 'correct',
      rect: targetRect(el),
    }));
  }
  if (!screens.is('play')) return [];
  const targets = [];
  els.board.querySelectorAll('[data-target-id]:not(.done):not(.filled)').forEach((el) => {
    let role = 'correct';
    if (el.matches('[data-gesture]') && !el.classList.contains('is-current')
      && !el.classList.contains('free-gesture')) {
      role = 'neutral';
    }
    if (el.classList.contains('slot') && state.selectedPiece) {
      role = el.dataset.kind === state.selectedPiece.dataset.kind ? 'correct' : 'wrong';
    }
    targets.push({ id: el.dataset.targetId, role, rect: targetRect(el) });
  });
  els.tray.querySelectorAll('.ingredient:not(.placed)').forEach((el) => {
    targets.push({ id: el.dataset.targetId, role: 'neutral', rect: targetRect(el) });
  });
  return targets;
}

async function debugTap(id) {
  if (id.startsWith('mode-')) return { accepted: await startMode(id.slice(5)) };
  const el = document.querySelector(`[data-target-id="${CSS.escape(id)}"]`);
  if (!el) return { accepted: false };
  if (el.matches('[data-gesture]')) {
    return { accepted: el.classList.contains('free-gesture') ? finishFreeGuide(el) : finishGuide(el) };
  }
  if (id === 'spread' && coverage) {
    coverage.addProgress(state.total);
    await transitionPromise;
    return { accepted: true };
  }
  if (id === 'pour' && pour) {
    pour.addProgress(state.total);
    await transitionPromise;
    return { accepted: true };
  }
  if (el.classList.contains('ingredient')) return { accepted: selectPiece(el) };
  if (el.classList.contains('slot')) {
    return { accepted: attemptPlace(state.selectedPiece, el) };
  }
  return { accepted: false };
}

async function debugWinRound() {
  let guard = 0;
  while (screens.is('play') && guard < 60) {
    guard += 1;
    if (state.advancing) {
      await transitionPromise;
      continue;
    }
    const step = currentStep();
    if (!step) break;
    if (step.id === 'spread') {
      coverage?.addProgress(state.total);
    } else if (step.id === 'pour') {
      pour?.addProgress(state.total);
    } else if (step.id === 'arrange') {
      const slot = els.board.querySelector('.slot:not(.filled)');
      if (!slot) {
        await transitionPromise;
        continue;
      }
      const piece = [...els.tray.querySelectorAll('.ingredient:not(.placed)')]
        .find((item) => item.dataset.kind === slot.dataset.kind);
      attemptPlace(piece, slot);
    } else {
      [...els.board.querySelectorAll('[data-gesture]:not(.done)')].forEach((el) => {
        if (el.classList.contains('free-gesture')) finishFreeGuide(el);
        else finishGuide(el);
      });
    }
    await transitionPromise;
  }
  return screens.is('reveal');
}

installDebug({
  gameId: config.id,
  engine: config.engine,
  ready,
  listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
  startMode,
  getState: () => ({
    screen: screens.current,
    mode: state.mode,
    step: currentStep()?.id || null,
    stepIndex: state.step,
    stepsTotal: mode?.steps.length || 0,
    completed: state.completed,
    targetTotal: state.total,
    awaitingInput: screens.is('play') && !state.advancing,
    prompt: state.currentPrompt,
  }),
  getTargets: debugTargets,
  tap: debugTap,
  gesture: debugTap,
  winRound: debugWinRound,
  // Custom, not the default: this game's own muted flag gates speak() before
  // voice.say() is even called (see speak() above), so the default fan-out
  // mute would leave state.muted out of sync.
  mute(value = true) {
    state.muted = Boolean(value);
    if (state.muted) voice.stop();
    return state.muted;
  },
  // seed() is intentionally left to installDebug's default: nothing in this
  // game reshuffles from a seed (the old seed() only offset cosmetic confetti
  // positions, which burstConfetti now randomizes on its own), so there is no
  // onSeed to wire up.
  // Custom, not the default: this game has its own working timeScale
  // (wait() multiplies delays by state.timeScale) rather than a timers.js
  // group, so fastTimers() scales that directly.
  fastTimers(scale = .05) {
    state.timeScale = Math.min(1, Math.max(.01, Number(scale) || .05));
    return state.timeScale;
  },
  home: () => showSplash(),
});

renderCards();
ready.then(() => {
  if (screens.is('splash')) state.currentPrompt = 'welcome';
});
