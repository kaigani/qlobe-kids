import config from '../config.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import * as bgm from '../../../shared/js/bgm.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { createScreens } from '../../../shared/js/screens.js';
import * as sfx from '../../../shared/js/sfx.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTimers } from '../../../shared/js/timers.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';

const game = document.querySelector('#game');
const loading = document.querySelector('#loading');
const cardGrid = document.querySelector('#card-grid');
const activityHost = document.querySelector('#activity-host');
const playPrompt = document.querySelector('#play-prompt');
const endTitle = document.querySelector('#end-title');
const endMessage = document.querySelector('#end-message');
const againButton = document.querySelector('#again-button');
const cardsButton = document.querySelector('#cards-button');
const endArtboard = document.querySelector('.artboard-end');
const endSunny = document.querySelector('.end-sunny');
const endDrawingCard = document.querySelector('#end-drawing-card');
const endDrawingPreview = document.querySelector('#end-drawing-preview');
const endDrawingContext = endDrawingPreview.getContext('2d');

const modeMap = new Map(config.modes.map((mode) => [mode.id, mode]));
const timers = createTimers();
const narrator = createNarrator();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let rng = Math.random;
let runToken = 0;
let activityDisposers = [];
let lastVoiceKey = 'welcome';
let debugDispose = null;
let screens = null;

const state = {
  mode: null,
  step: 0,
  phase: 'choose',
  completed: false,
  awaitingInput: true,
  strokes: 0,
  hasDrawingPreview: false,
  starsDimmed: [],
  muted: false,
};

function asset(path) {
  return path.startsWith('./') || path.startsWith('../') ? path : `./assets/${path}`;
}

function image(src, alt = '', className = '') {
  const node = document.createElement('img');
  node.src = asset(src);
  node.alt = alt;
  if (className) node.className = className;
  return node;
}

function modeTitle(id = state.mode) {
  return modeMap.get(id)?.title || 'Calm';
}

function voiceText(key) {
  return config.voice[key] || '';
}

function speak(key) {
  lastVoiceKey = key;
  const promise = narrator.say(key, voiceText(key));
  bgm.duckDuring(promise, { down: 0.18, downMs: 140, upMs: 420 });
  return promise;
}

function setMuted(on = true) {
  state.muted = Boolean(on);
  narrator.setMuted(state.muted);
  voiceClips.setMuted(state.muted);
  bgm.setMuted(state.muted);
  sfx.setMuted(state.muted);
  return state.muted;
}

function updatePrompt(text) {
  playPrompt.textContent = text;
}

function hold(disposer) {
  if (typeof disposer === 'function') activityDisposers.push(disposer);
  return disposer;
}

function cleanupActivity() {
  runToken += 1;
  timers.clearAll();
  nudger.stop();
  for (const dispose of activityDisposers.splice(0)) {
    try { dispose(); } catch { /* teardown must continue */ }
  }
  activityHost.replaceChildren();
}

function renderCards() {
  cardGrid.replaceChildren();
  for (const mode of config.modes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'calm-card';
    button.dataset.mode = mode.id;
    button.dataset.target = `mode-${mode.id}`;
    button.setAttribute('aria-label', `${mode.title}: ${mode.skill}`);

    const shell = image(mode.card, '', 'card-shell');
    shell.setAttribute('aria-hidden', 'true');
    const icon = image(mode.icon, '', 'card-icon');
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'card-label';
    label.textContent = mode.title;
    button.append(shell, icon, label);
    onTap(button, () => startMode(mode.id), {
      feedback: () => { try { sfx.tick(); } catch { /* optional */ } },
    });
    cardGrid.append(button);
  }
}

function addHudButton(host, button, corner, target) {
  button.classList.add(corner);
  button.dataset.target = target;
  host.append(button);
}

function wireHud() {
  const shelfHud = document.querySelector('#shelf-hud');
  const playHud = document.querySelector('#play-hud');
  const endHud = document.querySelector('#end-hud');

  addHudButton(
    shelfHud,
    hudButton('home', () => { window.location.href = '../../'; }, { label: 'Back to QLOBE Kids' }),
    'qk-hud-top-left',
    'catalog-home',
  );
  addHudButton(
    shelfHud,
    hudButton('sound', soundDebounce(() => speak('welcome')), { label: 'Hear the welcome again' }),
    'qk-hud-top-right',
    'sound',
  );

  addHudButton(
    playHud,
    hudButton('back', () => showShelf(), { label: 'Back to calm cards' }),
    'qk-hud-top-left',
    'back',
  );
  addHudButton(
    playHud,
    hudButton('sound', soundDebounce(replayCurrentPrompt), { label: 'Hear the direction again' }),
    'qk-hud-top-right',
    'sound',
  );

  addHudButton(
    endHud,
    hudButton('back', () => showShelf(), { label: 'Back to calm cards' }),
    'qk-hud-top-left',
    'back',
  );
  addHudButton(
    endHud,
    hudButton('sound', soundDebounce(replayCurrentPrompt), { label: 'Hear the calm message again' }),
    'qk-hud-top-right',
    'sound',
  );
}

function replayCurrentPrompt() {
  if (screens?.is('end')) return speak(modeMap.get(state.mode)?.completion || 'cards');
  if (screens?.is('shelf')) return speak('cards');
  if (state.mode === 'breathe') {
    if (state.phase === 'inhale') return speak('breathe-in');
    if (state.phase === 'exhale') return speak('breathe-out');
    return speak(state.step ? 'breathe-nudge' : 'breathe-intro');
  }
  if (state.mode === 'squeeze') return speak(state.step ? 'squeeze-nudge' : 'squeeze-intro');
  if (state.mode === 'draw') return speak(state.strokes ? 'draw-nudge' : 'draw-intro');
  if (state.mode === 'rest') return speak('rest-nudge');
  return speak(lastVoiceKey);
}

const nudger = createNudger({
  first: 12000,
  repeat: 12000,
  onNudge: () => {
    if (!state.awaitingInput || screens?.current !== 'play') return;
    replayCurrentPrompt();
    const target = activityHost.querySelector('[data-primary="true"]');
    if (target) {
      target.animate(
        [{ transform: getComputedStyle(target).transform }, { filter: 'brightness(1.18)' }, { filter: 'brightness(1)' }],
        { duration: reducedMotion ? 1 : 850, easing: 'ease-in-out' },
      );
    }
  },
});

function resetStateForMode(id) {
  state.mode = id;
  state.step = 0;
  state.phase = 'ready';
  state.completed = false;
  state.awaitingInput = true;
  state.strokes = 0;
  state.hasDrawingPreview = false;
  state.starsDimmed = [];
  endDrawingContext.clearRect(0, 0, endDrawingPreview.width, endDrawingPreview.height);
}

function showShelf({ speakLine = true } = {}) {
  cleanupActivity();
  state.mode = null;
  state.step = 0;
  state.phase = 'choose';
  state.completed = false;
  state.awaitingInput = true;
  state.strokes = 0;
  state.hasDrawingPreview = false;
  state.starsDimmed = [];
  screens.show('shelf');
  if (speakLine) speak('cards');
}

async function startMode(id) {
  if (!modeMap.has(id)) return false;
  return screens.start(async () => {
    cleanupActivity();
    resetStateForMode(id);
    screens.show('play');
    if (id === 'breathe') renderBreathe();
    else if (id === 'squeeze') renderSqueeze();
    else if (id === 'draw') renderDraw();
    else renderRest();
    nudger.arm();
    speak(`${id}-intro`);
    return true;
  }, { busy: false });
}

function progressRow(className, source, count) {
  const row = document.createElement('div');
  row.className = className;
  row.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < count; index += 1) {
    const pip = image(source, '');
    pip.dataset.progress = String(index);
    row.append(pip);
  }
  return row;
}

function paintProgress(selector) {
  for (const node of activityHost.querySelectorAll(selector)) {
    node.classList.toggle('is-done', Number(node.dataset.progress) < state.step);
  }
}

function renderBreathe() {
  updatePrompt('Tap Sunny when you are ready');
  const stage = document.createElement('div');
  stage.className = 'activity-stage breathe-stage';
  stage.append(
    image('./assets/props/breath-flower.webp', 'A soft felt flower', 'breath-flower'),
    image('./assets/props/breathe-cloud.webp', 'A soft felt cloud', 'breath-cloud'),
  );

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'activity-button sunny-breath-button';
  button.dataset.target = 'breathe-sunny';
  button.dataset.primary = 'true';
  button.setAttribute('aria-label', 'Take one slow breath with Sunny');
  button.append(
    image('./assets/characters/sunny-neutral.webp', 'Sunny, the calm corner friend', 'sunny-body'),
    image(config.assets.breathingRings, '', 'breathing-rings'),
  );
  const count = document.createElement('p');
  count.className = 'breath-count';
  count.textContent = 'Breath 1 of 3';
  stage.append(button, count, progressRow('breath-progress', './assets/props/star-patch.webp', 3));
  activityHost.append(stage);
  hold(onTap(button, takeBreath, { feedback: () => { try { sfx.tick(); } catch { /* optional */ } } }));
}

async function takeBreath() {
  if (state.mode !== 'breathe' || !state.awaitingInput || state.step >= 3) return false;
  const token = runToken;
  const button = activityHost.querySelector('.sunny-breath-button');
  state.awaitingInput = false;
  nudger.stop();

  state.phase = 'inhale';
  const count = activityHost.querySelector('.breath-count');
  if (count) count.textContent = `Breath ${state.step + 1} of 3`;
  updatePrompt('Breathe in…');
  button.classList.remove('is-exhaling');
  button.classList.add('is-inhaling');
  speak('breathe-in');
  await timers.wait(2850);
  if (token !== runToken || state.mode !== 'breathe') return false;

  state.phase = 'exhale';
  updatePrompt('Breathe out…');
  button.classList.remove('is-inhaling');
  button.classList.add('is-exhaling');
  speak('breathe-out');
  await timers.wait(3350);
  if (token !== runToken || state.mode !== 'breathe') return false;

  button.classList.remove('is-exhaling');
  state.step += 1;
  paintProgress('.breath-progress img');
  if (state.step >= 3) {
    state.completed = true;
    state.phase = 'complete';
    updatePrompt('Three soft breaths');
    if (count) count.textContent = '3 soft breaths';
    await timers.wait(650);
    if (token === runToken) finishMode();
    return true;
  }

  state.phase = 'ready';
  state.awaitingInput = true;
  if (count) count.textContent = `Breath ${state.step + 1} of 3`;
  updatePrompt('Tap for another slow breath');
  nudger.arm();
  return true;
}

function renderSqueeze() {
  updatePrompt('Press, hold, and let go');
  const stage = document.createElement('div');
  stage.className = 'activity-stage squeeze-stage';
  stage.append(image('./assets/props/squeeze-heart.webp', 'A heart giving itself a hug', 'squeeze-heart-art'));

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'activity-button squeeze-button';
  button.dataset.target = 'squeeze-toy';
  button.dataset.primary = 'true';
  button.setAttribute('aria-label', 'Press and release the soft squeeze ball');
  button.append(image('./assets/props/squish-ball.webp', 'A soft striped squeeze ball'));
  stage.append(button, progressRow('squeeze-count', './assets/props/breathe-cloud.webp', 3));
  activityHost.append(stage);

  let activePointer = null;
  const press = (event) => {
    if (!state.awaitingInput || activePointer != null) return;
    event?.preventDefault?.();
    activePointer = event?.pointerId ?? 'keyboard';
    button.classList.add('is-held');
    state.phase = 'holding';
    try { if (event?.pointerId != null) button.setPointerCapture(event.pointerId); } catch { /* optional */ }
  };
  const release = (event, accepted = true) => {
    if (activePointer == null) return;
    if (event?.pointerId != null && activePointer !== event.pointerId) return;
    activePointer = null;
    button.classList.remove('is-held');
    state.phase = 'ready';
    if (accepted) completeSqueeze();
  };
  const down = (event) => { if (event.isPrimary !== false) press(event); };
  const up = (event) => release(event, true);
  const cancel = (event) => release(event, false);
  const keyDown = (event) => {
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) press(event);
  };
  const keyUp = (event) => {
    if (event.key === ' ' || event.key === 'Enter') release(event, true);
  };
  const click = (event) => {
    if (event.detail === 0 && activePointer == null) {
      press();
      release(null, true);
    }
  };
  button.addEventListener('pointerdown', down);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('blur', cancel);
  button.addEventListener('keydown', keyDown);
  button.addEventListener('keyup', keyUp);
  button.addEventListener('click', click);
  hold(() => {
    button.removeEventListener('pointerdown', down);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('blur', cancel);
    button.removeEventListener('keydown', keyDown);
    button.removeEventListener('keyup', keyUp);
    button.removeEventListener('click', click);
  });
}

function completeSqueeze() {
  if (state.mode !== 'squeeze' || !state.awaitingInput || state.step >= 3) return false;
  state.step += 1;
  state.phase = 'released';
  paintProgress('.squeeze-count img');
  const spark = image('./assets/props/star-patch.webp', '', 'release-spark');
  spark.setAttribute('aria-hidden', 'true');
  activityHost.querySelector('.squeeze-stage')?.append(spark);
  spark.addEventListener('animationend', () => spark.remove(), { once: true });
  try { sfx.pop(); } catch { /* optional */ }
  speak(state.step === 2 ? 'squeeze-halfway' : 'squeeze-release');
  if (state.step >= 3) {
    state.awaitingInput = false;
    state.completed = true;
    state.phase = 'complete';
    updatePrompt('Hands soft and cozy');
    timers.after(760, finishMode);
  } else {
    updatePrompt('Squeeze… and soften');
    nudger.arm();
  }
  return true;
}

const DRAW_TOOLS = [
  { id: 'sun', art: './assets/props/sun-patch.webp', color: '#edaa55', label: 'Sunny yellow' },
  { id: 'rainbow', art: './assets/props/rainbow-patch.webp', color: '#dd788f', label: 'Rainbow coral' },
  { id: 'cloud', art: './assets/props/cloud-patch.webp', color: '#79b9bd', label: 'Cloud blue' },
  { id: 'star', art: './assets/props/star-patch.webp', color: '#8769b4', label: 'Star purple' },
];

function actionButton(label, target, skin = 'plum') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mini-felt-action';
  button.dataset.target = target;
  button.setAttribute('aria-label', label);
  button.append(
    image(`./assets/ui/button-${skin}.webp`, ''),
    Object.assign(document.createElement('span'), { textContent: label }),
  );
  return button;
}

function renderDraw() {
  updatePrompt('Draw your happy place');
  const stage = document.createElement('div');
  stage.className = 'activity-stage draw-stage';
  const palette = document.createElement('div');
  palette.className = 'draw-palette';
  palette.setAttribute('aria-label', 'Cozy colors');
  const drawing = document.createElement('div');
  drawing.className = 'drawing-wrap';
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 520;
  canvas.tabIndex = 0;
  canvas.dataset.target = 'drawing-canvas';
  canvas.dataset.primary = 'true';
  canvas.setAttribute('aria-label', 'Happy place drawing blanket. Use a pointer to draw, or arrow keys to move the star and Space or Enter to make a mark.');
  canvas.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight Space Enter');
  const keyboardCursor = image('./assets/props/star-patch.webp', '', 'keyboard-draw-cursor');
  keyboardCursor.setAttribute('aria-hidden', 'true');
  drawing.append(canvas, keyboardCursor);
  const actions = document.createElement('div');
  actions.className = 'draw-actions';
  const undo = actionButton('Undo', 'draw-undo');
  const clear = actionButton('Clear', 'draw-clear');
  const done = actionButton('Done', 'draw-done', 'teal');
  actions.append(undo, clear, done);
  drawing.append(actions);
  stage.append(palette, drawing);
  activityHost.append(stage);

  const context = canvas.getContext('2d', { willReadFrequently: true });
  const snapshots = [];
  let selected = DRAW_TOOLS[0];
  let activePointer = null;
  let moved = false;
  const keyboardPoint = { x: canvas.width / 2, y: canvas.height / 2 };

  function selectTool(tool, button) {
    selected = tool;
    for (const node of palette.querySelectorAll('.patch-button')) {
      node.classList.toggle('is-selected', node === button);
      node.setAttribute('aria-pressed', String(node === button));
    }
    try { sfx.tick(); } catch { /* optional */ }
  }

  for (const [index, tool] of DRAW_TOOLS.entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `patch-button${index === 0 ? ' is-selected' : ''}`;
    button.dataset.target = `color-${tool.id}`;
    button.setAttribute('aria-label', tool.label);
    button.setAttribute('aria-pressed', String(index === 0));
    button.append(image(tool.art, ''));
    hold(onTap(button, () => selectTool(tool, button)));
    palette.append(button);
  }

  function position(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width / rect.width,
      y: (event.clientY - rect.top) * canvas.height / rect.height,
    };
  }

  function remember() {
    snapshots.push({
      pixels: context.getImageData(0, 0, canvas.width, canvas.height),
      strokes: state.strokes,
    });
    if (snapshots.length > 12) snapshots.shift();
  }

  function restore(snapshot) {
    if (!snapshot) return false;
    context.putImageData(snapshot.pixels, 0, 0);
    state.strokes = snapshot.strokes;
    state.step = state.strokes;
    state.phase = state.strokes ? 'drawing' : 'ready';
    return true;
  }

  function recordMark() {
    state.strokes += 1;
    state.step = state.strokes;
    state.phase = 'drawing';
    nudger.arm();
  }

  function drawDot(point) {
    context.beginPath();
    context.arc(point.x, point.y, 17, 0, Math.PI * 2);
    context.fillStyle = selected.color;
    context.globalAlpha = .86;
    context.fill();
  }

  function placeKeyboardCursor() {
    keyboardCursor.style.left = `${7 + (keyboardPoint.x / canvas.width) * 86}%`;
    keyboardCursor.style.top = `${7 + (keyboardPoint.y / canvas.height) * 67}%`;
    keyboardCursor.classList.add('is-visible');
  }

  const pointerDown = (event) => {
    if (activePointer != null || event.isPrimary === false) return;
    event.preventDefault();
    activePointer = event.pointerId;
    moved = false;
    keyboardCursor.classList.remove('is-visible');
    remember();
    const point = position(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineWidth = 34;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.globalAlpha = .86;
    context.strokeStyle = selected.color;
    canvas.setPointerCapture?.(event.pointerId);
  };
  const pointerMove = (event) => {
    if (activePointer !== event.pointerId) return;
    const point = position(event);
    context.lineTo(point.x, point.y);
    context.stroke();
    moved = true;
  };
  const pointerEnd = (event) => {
    if (activePointer !== event.pointerId) return;
    if (!moved) {
      drawDot(position(event));
    }
    activePointer = null;
    recordMark();
  };
  const pointerCancel = (event) => {
    if (activePointer !== event.pointerId) return;
    restore(snapshots.pop());
    activePointer = null;
  };
  const cancelActiveStroke = () => {
    if (activePointer == null) return;
    restore(snapshots.pop());
    activePointer = null;
  };
  const keyDown = (event) => {
    const movement = {
      ArrowLeft: [-55, 0],
      ArrowRight: [55, 0],
      ArrowUp: [0, -55],
      ArrowDown: [0, 55],
    }[event.key];
    if (movement) {
      event.preventDefault();
      keyboardPoint.x = Math.max(24, Math.min(canvas.width - 24, keyboardPoint.x + movement[0]));
      keyboardPoint.y = Math.max(24, Math.min(canvas.height - 24, keyboardPoint.y + movement[1]));
      placeKeyboardCursor();
      return;
    }
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (event.repeat) return;
    placeKeyboardCursor();
    remember();
    drawDot(keyboardPoint);
    recordMark();
    try { sfx.tick(); } catch { /* optional */ }
  };
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerCancel);
  canvas.addEventListener('keydown', keyDown);
  canvas.addEventListener('blur', () => keyboardCursor.classList.remove('is-visible'));
  window.addEventListener('blur', cancelActiveStroke);
  hold(() => {
    canvas.removeEventListener('pointerdown', pointerDown);
    canvas.removeEventListener('pointermove', pointerMove);
    canvas.removeEventListener('pointerup', pointerEnd);
    canvas.removeEventListener('pointercancel', pointerCancel);
    canvas.removeEventListener('keydown', keyDown);
    window.removeEventListener('blur', cancelActiveStroke);
  });

  hold(onTap(undo, () => {
    const before = snapshots.pop();
    if (!before) return;
    restore(before);
    try { sfx.tick(); } catch { /* optional */ }
  }));
  hold(onTap(clear, () => {
    remember();
    context.clearRect(0, 0, canvas.width, canvas.height);
    state.strokes = 0;
    state.step = 0;
    state.phase = 'ready';
    try { sfx.whoosh(); } catch { /* optional */ }
  }));
  hold(onTap(done, () => {
    endDrawingContext.clearRect(0, 0, endDrawingPreview.width, endDrawingPreview.height);
    endDrawingContext.drawImage(canvas, 0, 0, endDrawingPreview.width, endDrawingPreview.height);
    state.hasDrawingPreview = state.strokes > 0;
    state.completed = true;
    state.awaitingInput = false;
    state.phase = 'complete';
    finishMode();
  }));
}

function renderRest() {
  updatePrompt('Tap a sleepy star');
  const stage = document.createElement('div');
  stage.className = 'activity-stage rest-stage';
  stage.append(
    image('./assets/characters/sunny-hug.webp', 'Sunny resting', 'rest-sunny'),
    image('./assets/props/rest-star.webp', 'A sleepy star', 'rest-guide-star'),
  );
  for (let index = 0; index < 5; index += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rest-star-button';
    button.dataset.target = `rest-star-${index + 1}`;
    button.dataset.primary = index === 0 ? 'true' : 'false';
    button.setAttribute('aria-label', `Settle sleepy star ${index + 1}`);
    button.setAttribute('aria-pressed', 'false');
    button.append(image('./assets/props/star-patch.webp', ''));
    hold(onTap(button, () => toggleRestStar(index, button)));
    stage.append(button);
  }
  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'felt-action felt-action-teal rest-done';
  done.dataset.target = 'rest-done';
  done.setAttribute('aria-label', 'All done resting');
  done.append(
    image('./assets/ui/button-teal.webp', ''),
    Object.assign(document.createElement('span'), { textContent: 'All done' }),
  );
  hold(onTap(done, () => {
    state.completed = true;
    state.awaitingInput = false;
    state.phase = 'complete';
    finishMode();
  }));
  stage.append(done);
  activityHost.append(stage);
}

function toggleRestStar(index, button = activityHost.querySelector(`[data-target="rest-star-${index + 1}"]`)) {
  if (state.mode !== 'rest' || !button) return false;
  const dimmed = !button.classList.contains('is-dim');
  button.classList.toggle('is-dim', dimmed);
  button.setAttribute('aria-pressed', String(dimmed));
  const values = new Set(state.starsDimmed);
  if (dimmed) values.add(index);
  else values.delete(index);
  state.starsDimmed = [...values].sort((a, b) => a - b);
  state.step = state.starsDimmed.length;
  state.phase = 'resting';
  if (dimmed) {
    try { sfx.sparkle(); } catch { /* optional */ }
    if (state.starsDimmed.length === 1) speak('rest-star');
  }
  nudger.arm();
  return true;
}

function finishMode() {
  if (!state.mode || screens.current === 'end') return false;
  const mode = modeMap.get(state.mode);
  const isDrawing = mode.id === 'draw';
  state.completed = true;
  state.awaitingInput = false;
  state.phase = 'complete';
  nudger.stop();
  endTitle.textContent = mode.id === 'draw' ? 'Your happy place' : `${mode.title} feels cozy`;
  endMessage.textContent = voiceText(mode.completion);
  endSunny.hidden = isDrawing;
  endDrawingCard.hidden = !isDrawing;
  endArtboard.classList.toggle('is-draw-reflection', isDrawing);
  screens.show('end');
  speak(mode.completion);
  return true;
}

function completeCurrentMode() {
  if (state.mode === 'breathe') {
    state.step = 3;
    paintProgress('.breath-progress img');
  } else if (state.mode === 'squeeze') {
    state.step = 3;
    paintProgress('.squeeze-count img');
  } else if (state.mode === 'draw') {
    state.strokes = Math.max(1, state.strokes);
    state.step = state.strokes;
  } else if (state.mode === 'rest') {
    for (let index = 0; index < 5; index += 1) {
      const button = activityHost.querySelector(`[data-target="rest-star-${index + 1}"]`);
      if (button) {
        button.classList.add('is-dim');
        button.setAttribute('aria-pressed', 'true');
      }
    }
    state.starsDimmed = [0, 1, 2, 3, 4];
    state.step = 5;
  }
  return finishMode();
}

function debugTap(targetId) {
  const target = document.querySelector(`[data-target="${CSS.escape(String(targetId))}"]`);
  if (!target || target.disabled || target.getClientRects().length === 0) return { accepted: false };
  target.click();
  return { accepted: true };
}

function getState() {
  return {
    screen: screens?.current || 'loading',
    mode: state.mode,
    step: state.step,
    phase: state.phase,
    completed: state.completed,
    awaitingInput: state.awaitingInput,
    strokes: state.strokes,
    hasDrawingPreview: state.hasDrawingPreview,
    starsDimmed: [...state.starsDimmed],
    muted: state.muted,
    timers: timers.size(),
    music: bgm.stats(),
  };
}

async function boot() {
  bgm.preload(config.music.track);
  bgm.setVolume(config.music.volume);
  await voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice);

  const preload = [
    config.assets.background,
    config.assets.title,
    config.assets.plaque,
    config.assets.sunny,
    config.assets.sunnyRest,
    config.assets.breathingRings,
    ...config.modes.flatMap((mode) => [mode.card, mode.icon]),
    './assets/ui/button-plum.webp',
    './assets/ui/button-teal.webp',
    './assets/ui/moon-patch.webp',
    './assets/props/breath-flower.webp',
    './assets/props/squish-ball.webp',
    './assets/props/squeeze-heart.webp',
    './assets/props/rest-star.webp',
    ...DRAW_TOOLS.map((tool) => tool.art),
  ];
  await preloadImages([...new Set(preload)]);

  renderCards();
  wireHud();
  screens = createScreens({
    root: game,
    screens: {
      shelf: '#screen-shelf',
      play: '#screen-play',
      end: '#screen-end',
    },
    initial: 'shelf',
    splash: 'shelf',
    voice: narrator,
    onExit: (name) => { if (name === 'play') cleanupActivity(); },
  });

  onTap(againButton, () => {
    const id = state.mode;
    startMode(id);
  });
  onTap(cardsButton, () => showShelf());

  installUnlockOnGesture({
    extra: [voiceClips.unlock, bgm.unlock],
    onFirst: () => {
      bgm.play(config.music.track, { key: 'calm-corner', fadeInMs: 1200, loopFadeOutMs: 3200 });
      if (screens.current === 'shelf') speak('welcome');
    },
  });
  installKioskGuards();

  const ready = Promise.resolve(true);
  debugDispose = installDebug({
    gameId: config.id,
    engine: 'custom-calm-corner',
    ready,
    listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
    startMode,
    getState,
    tap: async (id) => debugTap(id),
    winRound: async () => completeCurrentMode(),
    home: () => showShelf({ speakLine: false }),
    timers,
    narrator,
    voice: voiceClips,
    sfx,
    onSeed: (next) => { rng = next; },
    mute: setMuted,
    completeBreaths: async () => {
      if (state.mode !== 'breathe') await startMode('breathe');
      state.step = 3;
      paintProgress('.breath-progress img');
      return finishMode();
    },
    squeeze: async () => {
      if (state.mode !== 'squeeze') await startMode('squeeze');
      return completeSqueeze();
    },
    finishDraw: async () => {
      if (state.mode !== 'draw') await startMode('draw');
      state.strokes = Math.max(1, state.strokes);
      state.step = state.strokes;
      return finishMode();
    },
    toggleStar: async (index = 0) => {
      if (state.mode !== 'rest') await startMode('rest');
      return toggleRestStar(Math.max(0, Math.min(4, Number(index) || 0)));
    },
    getAudioLog: voiceClips.getAudioLog,
    clearAudioLog: voiceClips.clearAudioLog,
    getRandomSample: () => rng(),
  });

  loading.hidden = true;
  game.removeAttribute('aria-busy');
}

boot().catch((error) => {
  console.error('[calm-corner-cards] boot failed', error);
  loading.querySelector('span').textContent = 'The cozy corner needs one more moment.';
});

window.addEventListener('pagehide', () => {
  cleanupActivity();
  narrator.dispose();
  voiceClips.stop();
  bgm.stop({ fadeOutMs: 0 });
  if (debugDispose) debugDispose();
}, { once: true });
