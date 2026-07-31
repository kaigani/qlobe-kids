import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as speech from '../../../shared/js/speech.js';
import * as voice from '../../../shared/js/voice-clips.js';
import { onTap } from '../../../shared/js/tap.js';
import { coverageGesture, ingredientDrag, pathGestures } from './gesture-surface.js';

const $ = (selector) => document.querySelector(selector);
const els = {
  splash: $('#splash'),
  play: $('#play'),
  reveal: $('#reveal'),
  cards: $('#recipe-cards'),
  back: $('#back'),
  sound: $('#sound'),
  rail: $('#step-rail'),
  promptIcon: $('#prompt-icon'),
  promptText: $('#prompt-text'),
  board: $('#workboard'),
  tray: $('#ingredient-tray'),
  revealBack: $('#reveal-back'),
  finished: $('#finished-art'),
  again: $('#again'),
  recipes: $('#recipes'),
  confetti: $('#confetti'),
};

const ICONS = {
  cut: '╱',
  face: '☺',
  spread: '↻',
  flower: '✿',
  peel: '⇣',
  boat: '⌣',
};

const COLORS = ['#d94d62', '#405aa5', '#f4cc54'];
const BADGES = ['☺', '✿', '⌣'];
const SHORT_PROMPTS = {
  'fruit-cut': 'Swipe the dotted lines',
  'fruit-arrange': 'Build a silly face',
  'toast-spread': 'Spread in big circles',
  'toast-arrange': 'Plant fruit flowers',
  'boat-peel': 'Pull the peels down',
  'boat-cut': 'Swipe the dotted lines',
  'boat-arrange': 'Fill the banana boat',
};

const state = {
  screen: 'splash',
  mode: null,
  step: 0,
  completed: 0,
  total: 0,
  currentPrompt: 'welcome',
  selectedPiece: null,
  muted: false,
  timeScale: 1,
  seed: 42,
  advancing: false,
};

let mode = null;
let gestureDispose = null;
let dragDispose = null;
let coverage = null;
let stepTapDisposers = [];
let transitionPromise = Promise.resolve();
let lastStartNudge = 0;
let movementDemoToken = 0;

const ready = voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(1, ms * state.timeScale)));
}

function unlockAudio() {
  voice.unlock();
  speech.unlock();
  sfx.unlock();
}

window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('gesturestart', (event) => event.preventDefault());

function speak(key) {
  state.currentPrompt = key;
  if (state.muted) return Promise.resolve();
  return voice.say(key, config.voice[key]);
}

function showScreen(name) {
  state.screen = name;
  els.splash.classList.toggle('hidden', name !== 'splash');
  els.play.classList.toggle('hidden', name !== 'play');
  els.reveal.classList.toggle('hidden', name !== 'reveal');
}

function clearStep() {
  gestureDispose?.();
  dragDispose?.();
  coverage?.destroy?.();
  gestureDispose = null;
  dragDispose = null;
  coverage = null;
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
  clearStep();
  voice.stop();
  mode = null;
  state.mode = null;
  state.step = 0;
  state.advancing = false;
  showScreen('splash');
  if (speakPrompt) speak('again');
}

function renderCards() {
  config.modes.forEach((item, index) => {
    const button = document.createElement('button');
    button.className = 'recipe-card';
    button.dataset.mode = item.id;
    button.dataset.badge = BADGES[index];
    button.style.setProperty('--card-color', COLORS[index]);
    button.style.setProperty('--tilt', `${[-2, 1.5, -1][index]}deg`);
    button.style.setProperty('--i', index);
    button.setAttribute('aria-label', item.title);
    const image = document.createElement('img');
    image.src = item.art;
    image.alt = '';
    button.append(image);
    els.cards.append(button);
    onTap(button, () => startMode(item.id), {
      feedback: () => {
        unlockAudio();
        sfx.tick();
      },
    });
  });
}

function renderRail() {
  els.rail.replaceChildren();
  mode.steps.forEach((step, index) => {
    const bead = document.createElement('span');
    bead.className = 'step-bead';
    if (index < state.step) bead.classList.add('done');
    if (index === state.step) bead.classList.add('active');
    bead.textContent = index < state.step ? '✓' : ICONS[step.icon];
    els.rail.append(bead);
  });
}

function currentStep() {
  return mode?.steps[state.step] || null;
}

function setPrompt(step) {
  els.promptIcon.textContent = ICONS[step.icon];
  els.promptText.textContent = SHORT_PROMPTS[step.prompt] || config.voice[step.prompt];
}

function makeMovementDemo(kind) {
  const finger = document.createElement('img');
  finger.className = `gesture-demo-finger demo-${kind}`;
  finger.src = './assets/gesture-finger.webp';
  finger.alt = '';
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

function makeGestureCue(axis = 'x') {
  const cue = document.createElement('span');
  cue.className = `gesture-cue gesture-cue-${axis}`;
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

function makeGuideLine(index, total, axis = 'x') {
  const line = document.createElement('div');
  line.className = `guide-line${axis === 'y' ? ' vertical' : ''}${index === 0 ? ' is-current' : ''}`;
  line.dataset.gesture = 'path';
  line.dataset.axis = axis;
  line.dataset.targetId = `gesture-${index}`;
  if (axis === 'y') {
    line.style.left = `${18 + index * (64 / Math.max(1, total - 1))}%`;
  } else {
    line.style.top = `${20 + index * (60 / Math.max(1, total - 1))}%`;
  }
  line.append(makeGestureCue(axis));
  return line;
}

function finishGuide(el) {
  if (!el || el.classList.contains('done') || !el.classList.contains('is-current') || state.advancing) return false;
  el.classList.add('done');
  el.classList.remove('is-current');
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

function renderPathStep(step, kind) {
  const food = document.createElement('div');
  food.className = kind;
  for (let i = 0; i < step.count; i += 1) {
    const axis = step.id === 'peel' ? 'y' : 'x';
    food.append(makeGuideLine(i, step.count, axis));
  }
  els.board.append(food);
  state.total = step.count;
  gestureDispose = pathGestures(els.board, {
    threshold: step.id === 'peel' ? 64 : 76,
    onComplete: finishGuide,
    onWrongStart: nudgeStart,
  });
}

function renderPeelStep(step) {
  const banana = document.createElement('div');
  banana.className = 'banana-whole';
  for (let i = 0; i < step.count; i += 1) {
    const strip = document.createElement('div');
    strip.className = 'peel-strip free-gesture';
    strip.dataset.gesture = 'path';
    strip.dataset.axis = 'y';
    strip.dataset.targetId = `gesture-${i}`;
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

function renderSpreadStep(step) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.dataset.targetId = 'spread';
  const finger = makeMovementDemo('spread');
  const meter = document.createElement('div');
  meter.className = 'spread-meter';
  meter.innerHTML = '<span></span>';
  toast.append(finger, meter);
  els.board.append(toast);
  state.total = step.count;

  coverage = coverageGesture(toast, {
    cell: 54,
    needed: step.count,
    onDab: (x, y) => {
      dismissMovementDemo();
      const dot = document.createElement('i');
      dot.className = 'spread-dot';
      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;
      toast.insertBefore(dot, meter);
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

function slotPositions(modeId) {
  if (modeId === 'fruit') {
    return [
      { kind: 'kiwi', x: 22, y: 18 },
      { kind: 'kiwi', x: 55, y: 18 },
      { kind: 'strawberry', x: 39, y: 44 },
      { kind: 'smile', x: 30, y: 70, shape: 'smile' },
    ];
  }
  if (modeId === 'toast') {
    return [
      { kind: 'banana', x: 15, y: 20 },
      { kind: 'banana', x: 41, y: 11 },
      { kind: 'banana', x: 67, y: 20 },
      { kind: 'berry', x: 22, y: 58 },
      { kind: 'berry', x: 45, y: 61 },
      { kind: 'berry', x: 68, y: 58 },
    ];
  }
  return [
    { kind: 'banana', x: 5, y: 31, shape: 'coin' },
    { kind: 'banana', x: 23, y: 25, shape: 'coin' },
    { kind: 'banana', x: 41, y: 25, shape: 'coin' },
    { kind: 'banana', x: 59, y: 31, shape: 'coin' },
    { kind: 'berry', x: 32, y: 60, shape: 'coin' },
    { kind: 'berry', x: 52, y: 60, shape: 'coin' },
  ];
}

function makeSlot(spec, index) {
  const slot = document.createElement('button');
  slot.className = 'slot';
  slot.dataset.kind = spec.kind;
  slot.dataset.targetId = `slot-${index}`;
  slot.dataset.shape = spec.shape || 'round';
  slot.style.left = `${spec.x}%`;
  slot.style.top = `${spec.y}%`;
  slot.style.setProperty('--slot-color', {
    kiwi: '#7cab42',
    strawberry: '#dd4d51',
    smile: '#efc64d',
    banana: '#efc64d',
    berry: '#4359a3',
  }[spec.kind]);
  slot.setAttribute('aria-label', `Place ${spec.kind} here`);
  return slot;
}

function makeIngredient(spec, index) {
  const piece = document.createElement('button');
  piece.className = `ingredient food ${spec.kind}`;
  piece.dataset.kind = spec.kind;
  piece.dataset.targetId = `piece-${index}`;
  piece.setAttribute('aria-label', spec.kind);
  return piece;
}

function slotAt(x, y) {
  return [...els.board.querySelectorAll('.slot:not(.filled)')].find((slot) => {
    const r = slot.getBoundingClientRect();
    return x >= r.left - 20 && x <= r.right + 20 && y >= r.top - 20 && y <= r.bottom + 20;
  }) || null;
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
  slot.dataset.kind = piece.dataset.kind;
  state.selectedPiece = null;
  state.completed += 1;
  sfx.pop();
  if (state.completed >= state.total) transitionPromise = completeStep();
  return true;
}

function renderArrangeStep(step) {
  let base;
  if (mode.id === 'fruit') {
    base = document.createElement('div');
    base.className = 'plate';
  } else if (mode.id === 'toast') {
    base = document.createElement('div');
    base.className = 'toast';
    const spread = document.createElement('div');
    spread.className = 'spread-dot';
    spread.style.cssText = 'left:50%;top:50%;width:88%;height:82%;animation:none;';
    base.append(spread);
  } else {
    base = document.createElement('div');
    base.className = 'banana-boat-base';
  }

  const specs = slotPositions(mode.id);
  specs.forEach((spec, index) => {
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
  state.total = specs.length;

  dragDispose = ingredientDrag(els.tray, {
    getSlot: slotAt,
    onSelect: selectPiece,
    onDrop: attemptPlace,
    onCancel: nudgePiece,
  });
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
  else if (step.id === 'cut') renderPathStep(step, mode.id === 'fruit' ? 'kiwi-whole' : 'banana-whole');
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

function fillConfetti() {
  els.confetti.replaceChildren();
  const colors = ['#d94d62', '#405aa5', '#f4cc54', '#75a93c', '#ee8b38'];
  for (let i = 0; i < 26; i += 1) {
    const bit = document.createElement('i');
    bit.style.left = `${(i * 37 + state.seed * 11) % 100}%`;
    bit.style.setProperty('--c', colors[i % colors.length]);
    bit.style.setProperty('--d', `${2.5 + (i % 5) * .35}s`);
    bit.style.setProperty('--delay', `${-(i % 9) * .28}s`);
    els.confetti.append(bit);
  }
}

async function revealSnack() {
  clearStep();
  showScreen('reveal');
  els.finished.src = mode.art;
  els.finished.alt = mode.title;
  fillConfetti();
  sfx.tada();
  await speak(mode.cheer);
}

async function startMode(id) {
  await ready;
  const next = config.modes.find((item) => item.id === id);
  if (!next) return false;
  voice.stop();
  mode = next;
  state.mode = id;
  state.step = 0;
  state.advancing = false;
  showScreen('play');
  await speak(mode.intro);
  setupStep();
  return true;
}

onTap(els.back, () => {
  sfx.tick();
  showSplash();
});
onTap(els.revealBack, () => {
  sfx.tick();
  showSplash({ speakPrompt: true });
});
onTap(els.sound, () => {
  sfx.tick();
  demonstrateMovement(speak(state.currentPrompt));
});
onTap(els.again, () => {
  sfx.tick();
  startMode(mode.id);
});
onTap(els.recipes, () => {
  sfx.tick();
  showSplash({ speakPrompt: true });
});

for (const button of [els.back, els.revealBack, els.sound, els.again, els.recipes]) {
  button.addEventListener('pointerdown', (event) => event.stopPropagation());
}

function targetRect(el) {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}

function debugTargets() {
  if (state.screen === 'splash') {
    return [...els.cards.querySelectorAll('.recipe-card')].map((el) => ({
      id: `mode-${el.dataset.mode}`,
      role: 'correct',
      rect: targetRect(el),
    }));
  }
  if (state.screen !== 'play') return [];
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
  if (el.classList.contains('ingredient')) return { accepted: selectPiece(el) };
  if (el.classList.contains('slot')) {
    return { accepted: attemptPlace(state.selectedPiece, el) };
  }
  return { accepted: false };
}

async function debugWinRound() {
  let guard = 0;
  while (state.screen === 'play' && guard < 40) {
    guard += 1;
    if (state.advancing) {
      await transitionPromise;
      continue;
    }
    const step = currentStep();
    if (!step) break;
    if (step.id === 'spread') {
      coverage?.addProgress(state.total);
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
  return state.screen === 'reveal';
}

window.QLOBE_DEBUG = {
  version: 1,
  gameId: config.id,
  engine: config.engine,
  ready,
  listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
  startMode,
  getState: () => ({
    screen: state.screen,
    mode: state.mode,
    step: currentStep()?.id || null,
    stepIndex: state.step,
    stepsTotal: mode?.steps.length || 0,
    completed: state.completed,
    targetTotal: state.total,
    awaitingInput: state.screen === 'play' && !state.advancing,
    prompt: state.currentPrompt,
  }),
  getTargets: debugTargets,
  tap: debugTap,
  gesture: debugTap,
  winRound: debugWinRound,
  mute(value = true) {
    state.muted = Boolean(value);
    if (state.muted) voice.stop();
    return state.muted;
  },
  seed(value) {
    state.seed = Number(value) || 42;
    return state.seed;
  },
  fastTimers(scale = .05) {
    state.timeScale = Math.min(1, Math.max(.01, Number(scale) || .05));
    return state.timeScale;
  },
  home: () => showSplash(),
};

renderCards();
ready.then(() => {
  if (state.screen === 'splash') state.currentPrompt = 'welcome';
});
