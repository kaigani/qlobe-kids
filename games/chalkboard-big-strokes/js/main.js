import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as bgm from '../../../shared/js/bgm.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { unlockAll, installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createTimers } from '../../../shared/js/timers.js';

const mount = document.getElementById('game');
const timers = createTimers();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  screen: 'selection',
  mode: null,
  round: 0,
  variant: 0,
  seed: 0,
  pathIndex: 0,
  progress: 0,
  pointerActive: false,
  pointerId: null,
  wrongStarts: 0,
  eraseProgress: 0,
  erasePointerActive: false,
  erasePointerId: null,
  muted: false,
  reducedMotion,
  timerScale: 1,
};

let activeMode = null;
let activeVariant = null;
let activePath = [];
let clearedPoints = new Set();
let eraseMarks = [];
let lastTracePoint = null;
let lastErasePoint = null;
let eraseFinishQueued = false;
let canvas = null;
let context = null;
let canvasView = { width: 1, height: 1, dpr: 1 };
let resizeObserver = null;
let drawFrame = 0;
let screenDisposers = [];

const narrator = createNarrator({
  say: (key, text) => {
    const file = config.audio?.[key];
    // voice-clips resolves bare names against its own default audio folder.
    // Config deliberately stores document-relative URLs, so normalize them to
    // an absolute same-origin URL before handing them over.
    return file ? voice.sayFile(new URL(file, document.baseURI).href, text) : voice.say(key, text);
  },
});

bgm.preload(config.music);
bgm.setVolume(0.16);
installKioskGuards();
installUnlockOnGesture({
  extra: [bgm.unlock],
  onFirst: () => bgm.play(config.music, { key: config.id, fadeInMs: 1200, loopFadeOutMs: 2400 }),
});

function speak(key) {
  return bgm.duckDuring(narrator.say(key, config.voice[key] || ''), {
    down: 0.18,
    downMs: 100,
    upMs: 320,
  });
}

function speakSequence(keys) {
  return bgm.duckDuring(
    narrator.saySequence(keys.map((key) => [key, config.voice[key] || ''])),
    { down: 0.18, downMs: 100, upMs: 320 },
  );
}

function setMuted(on = true) {
  state.muted = Boolean(on);
  narrator.setMuted(state.muted);
  voice.setMuted(state.muted);
  sfx.setMuted(state.muted);
  bgm.setMuted(state.muted);
  if (state.muted) bgm.duck(1, 0);
  const button = mount.querySelector('[data-target="mute"]');
  if (button) {
    button.classList.toggle('is-muted', state.muted);
    button.setAttribute('aria-label', state.muted ? 'Turn sound on' : 'Turn sound off');
    button.setAttribute('aria-pressed', String(state.muted));
  }
  return state.muted;
}

function feedback({ quiet = false } = {}) {
  unlockAll([bgm.unlock]);
  if (!quiet && !state.muted) sfx.tick();
}

function art(src, className, alt = '') {
  return `<img class="${className}" src="${src}" alt="${alt}" draggable="false"${alt ? '' : ' aria-hidden="true"'} />`;
}

function boardArt() {
  return art(config.assets.board, 'board-backdrop');
}

function soundButton() {
  return `<button class="qk-hud-btn qk-hud-sound qk-hud-top-right ${state.muted ? 'is-muted' : ''}"
    type="button" data-action="mute" data-target="mute" aria-label="${state.muted ? 'Turn sound on' : 'Turn sound off'}"
    aria-pressed="${state.muted}"></button>`;
}

function homeButton() {
  return '<a class="qk-hud-btn qk-hud-home qk-hud-top-left" href="../../" data-target="home" aria-label="Back to all games"></a>';
}

function backButton() {
  return `<button class="qk-hud-btn qk-hud-back qk-hud-top-left" type="button" data-action="back" data-target="back" aria-label="Back to stroke choices">
    ${art(config.assets.back, 'hud-art')}
  </button>`;
}

function plaque(text, className = '') {
  return `<span class="plaque ${className}">${art(config.assets.button, 'plaque-art')}<span>${text}</span></span>`;
}

function cleanupScreen() {
  resizeObserver?.disconnect();
  resizeObserver = null;
  cancelAnimationFrame(drawFrame);
  drawFrame = 0;
  timers.clearAll();
  for (const dispose of screenDisposers) dispose();
  screenDisposers = [];
  canvas = null;
  context = null;
}

function decorateAssets() {
  for (const image of mount.querySelectorAll('img')) {
    const fail = () => {
      image.classList.add('asset-missing');
      image.closest('.mode-card, .plaque, .title-wrap, .screen')?.classList.add('has-missing-asset');
    };
    if (image.complete && image.naturalWidth === 0) fail();
    else image.addEventListener('error', fail, { once: true });
  }
}

function wireActions() {
  for (const element of mount.querySelectorAll('[data-action]')) {
    const onClick = (event) => {
      event.preventDefault();
      feedback();
      routeAction(element.dataset.action, element.dataset.value);
    };
    element.addEventListener('click', onClick);
    screenDisposers.push(() => element.removeEventListener('click', onClick));
  }
  decorateAssets();
  setMuted(state.muted);
}

function showSelection({ announce = false } = {}) {
  cleanupScreen();
  narrator.stop();
  state.screen = 'selection';
  state.mode = null;
  state.pathIndex = 0;
  state.progress = 0;
  state.pointerActive = false;
  state.erasePointerActive = false;
  mount.innerHTML = `
    <section class="screen board-world selection-screen" aria-label="Choose a big chalk stroke">
      ${boardArt()}
      ${homeButton()}
      ${soundButton()}
      <header class="selection-heading">
        <div class="title-wrap">
          <h1>Chalkboard<br />Big Strokes</h1>
          ${art(config.assets.title, 'title-lockup', 'Chalkboard Big Strokes')}
        </div>
        <p>Pick a big stroke</p>
      </header>
      <div class="mode-grid" role="group" aria-label="Big stroke choices">
        ${config.modes.map((mode) => `
          <button class="mode-card" type="button" data-action="mode" data-value="${mode.id}"
            data-target="mode-${mode.id}" aria-label="Trace a giant ${mode.title}">
            ${art(mode.card, 'mode-card-art')}
            <span class="mode-name">${mode.title}</span>
            <canvas class="mode-preview" data-preview="${mode.id}" aria-hidden="true"></canvas>
            <span class="mode-go" aria-hidden="true">GO</span>
          </button>`).join('')}
      </div>
      ${art(config.assets.buddy, 'selection-buddy')}
      ${art(config.assets.chalk, 'selection-chalk')}
      ${art(config.assets.eraser, 'selection-eraser')}
    </section>`;
  wireActions();
  requestAnimationFrame(drawModePreviews);
  if (announce) speak('welcome');
}

function startMode(modeId, round = 0) {
  const mode = config.modes.find((candidate) => candidate.id === modeId);
  if (!mode) return false;
  activeMode = mode;
  state.mode = mode.id;
  return startRound(round);
}

function startRound(round = 0, modeId = state.mode) {
  if (modeId !== state.mode || !activeMode) {
    activeMode = config.modes.find((candidate) => candidate.id === modeId) || null;
    state.mode = activeMode?.id || null;
  }
  if (!activeMode) return false;
  cleanupScreen();
  narrator.stop();
  state.screen = 'trace';
  state.round = Math.max(0, Math.floor(Number(round) || 0));
  state.variant = (state.seed + state.round) % activeMode.variants.length;
  activeVariant = activeMode.variants[state.variant];
  activePath = buildPath(activeVariant);
  state.pathIndex = 0;
  state.progress = 0;
  state.pointerActive = false;
  state.pointerId = null;
  state.wrongStarts = 0;
  state.eraseProgress = 0;
  state.erasePointerActive = false;
  clearedPoints = new Set();
  eraseMarks = [];
  eraseFinishQueued = false;
  lastTracePoint = null;
  lastErasePoint = null;
  renderTrace();
  speak(activeMode.spokenKey);
  return true;
}

function renderTrace() {
  mount.innerHTML = `
    <section class="screen board-world play-screen trace-screen" aria-label="Trace a giant ${activeMode.title}">
      ${boardArt()}
      ${backButton()}
      ${soundButton()}
      <div class="prompt-heading">${plaque(activeMode.prompt, 'prompt-plaque')}</div>
      <div class="trace-stage">
        <canvas id="trace-canvas" tabindex="0" role="application"
          aria-label="Trace the ${activeVariant.name}. Start at the glowing sparkle and follow the chalk dots."></canvas>
        ${art(config.assets.sparkle, 'start-beacon')}
        <span class="start-label" aria-hidden="true">START</span>
      </div>
      <div class="round-counter" aria-label="Stroke ${state.round % 3 + 1} of 3">${state.round % 3 + 1}<span>of</span>3</div>
      ${art(config.assets.chalk, 'play-chalk')}
      ${art(config.assets.eraser, 'tray-eraser')}
      ${art(config.assets.buddy, 'play-buddy')}
    </section>`;
  wireActions();
  attachTraceCanvas();
}

function renderSuccess() {
  cleanupScreen();
  state.screen = 'success';
  state.pointerActive = false;
  state.progress = 1;
  const sparkles = [
    [13,30],[22,67],[33,20],[43,76],[55,14],[64,70],[75,25],[84,58],[49,46],[70,48],
  ];
  mount.innerHTML = `
    <section class="screen board-world play-screen success-screen" aria-label="Great big stroke">
      ${boardArt()}
      ${backButton()}
      ${soundButton()}
      <div class="success-heading">${plaque('Great big strokes!', 'success-plaque')}</div>
      <div class="trace-stage success-stage">
        <canvas id="trace-canvas" aria-label="Your sparkling ${activeMode.title} stroke"></canvas>
        <div class="sparkle-field" aria-hidden="true">
          ${sparkles.map(([x, y], index) => `<img src="${config.assets.sparkle}" alt="" draggable="false"
            style="--spark-x:${x}%;--spark-y:${y}%;--spark-delay:${index * 90}ms" />`).join('')}
        </div>
      </div>
      ${art(config.assets.buddy, 'success-buddy')}
      <button class="erase-start" type="button" data-action="erase" data-target="erase-start"
        aria-label="Erase this stroke and try again">
        ${art(config.assets.eraser, 'erase-start-art')}
        ${plaque('ERASE IT', 'erase-plaque')}
      </button>
      <div class="round-counter success-count" aria-label="Stroke ${state.round % 3 + 1} of 3">${state.round % 3 + 1}<span>of</span>3</div>
    </section>`;
  wireActions();
  attachDisplayCanvas();
  if (!state.muted) sfx.tada();
  speakSequence(['great1', 'great2']);
}

function beginErase() {
  if (state.screen !== 'success') return false;
  cleanupScreen();
  state.screen = 'erase';
  state.eraseProgress = 0;
  state.erasePointerActive = false;
  state.erasePointerId = null;
  clearedPoints = new Set();
  eraseMarks = [];
  eraseFinishQueued = false;
  lastErasePoint = null;
  mount.innerHTML = `
    <section class="screen board-world play-screen erase-screen" aria-label="Erase the chalk stroke">
      ${boardArt()}
      ${backButton()}
      ${soundButton()}
      <div class="prompt-heading">${plaque('Wipe the chalk away', 'prompt-plaque')}</div>
      <div class="trace-stage erase-stage">
        <canvas id="trace-canvas" aria-label="Finished ${activeMode.title} stroke ready to erase"></canvas>
        <button class="eraser-tool" type="button" data-target="eraser" aria-label="Drag the felt eraser over the chalk stroke">
          ${art(config.assets.eraser, 'eraser-tool-art')}
        </button>
      </div>
      <div class="erase-meter" role="progressbar" aria-label="Erasing progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>
      ${art(config.assets.chalk, 'play-chalk')}
      ${art(config.assets.buddy, 'erase-buddy')}
    </section>`;
  wireActions();
  attachDisplayCanvas();
  attachEraser();
  if (!state.muted) sfx.whoosh();
  speak('erase');
  return true;
}

function showReplay() {
  if (state.screen !== 'erase') return false;
  cleanupScreen();
  state.screen = 'replay';
  state.erasePointerActive = false;
  state.eraseProgress = Math.max(state.eraseProgress, config.trace.eraseComplete);
  mount.innerHTML = `
    <section class="screen board-world play-screen replay-screen" aria-label="Fresh slate replay choices">
      ${boardArt()}
      ${backButton()}
      ${soundButton()}
      <div class="trace-stage replay-stage">
        <canvas id="trace-canvas" aria-label="Your freshly erased chalkboard"></canvas>
      </div>
      ${art(config.assets.buddy, 'replay-buddy')}
      <div class="replay-panel">
        <h2>Fresh slate!</h2>
        <p>Another big stroke?</p>
        <div class="replay-actions">
          <button type="button" data-action="replay" data-target="replay-again" aria-label="Try another ${activeMode.title}">
            ${plaque('SAME SHAPE')}
          </button>
          <button type="button" data-action="choose" data-target="choose-stroke" aria-label="Choose a different stroke">
            ${plaque('NEW SHAPE')}
          </button>
        </div>
      </div>
      ${art(config.assets.chalk, 'replay-chalk')}
    </section>`;
  wireActions();
  attachDisplayCanvas();
  speak('again');
  return true;
}

function routeAction(action, value) {
  if (action === 'mode') return startMode(value, 0);
  if (action === 'mute') return setMuted(!state.muted);
  if (action === 'back' || action === 'choose') return showSelection({ announce: false });
  if (action === 'erase') return beginErase();
  if (action === 'replay') return startRound(state.round + 1);
  if (action === 'prompt' && activeMode) return speak(activeMode.spokenKey);
  return false;
}

function attachTraceCanvas() {
  attachDisplayCanvas();
  if (!canvas) return;
  const pointerDown = (event) => {
    if (state.screen !== 'trace') return;
    event.preventDefault();
    const point = pointFromEvent(event);
    const result = traceInput('down', point.x, point.y, event.pointerId);
    if (result.accepted) {
      canvas.setPointerCapture?.(event.pointerId);
      feedback({ quiet: true });
    }
  };
  const pointerMove = (event) => {
    if (!state.pointerActive) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    traceInput('move', point.x, point.y, event.pointerId);
  };
  const pointerUp = (event) => {
    if (!state.pointerActive) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    traceInput('up', point.x, point.y, event.pointerId);
    try { canvas?.releasePointerCapture?.(event.pointerId); } catch { /* capture may already be gone */ }
  };
  const keyDown = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    completeRound();
  };
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);
  canvas.addEventListener('keydown', keyDown);
  screenDisposers.push(() => {
    canvas?.removeEventListener('pointerdown', pointerDown);
    canvas?.removeEventListener('pointermove', pointerMove);
    canvas?.removeEventListener('pointerup', pointerUp);
    canvas?.removeEventListener('pointercancel', pointerUp);
    canvas?.removeEventListener('keydown', keyDown);
  });
}

function attachDisplayCanvas() {
  canvas = mount.querySelector('#trace-canvas');
  if (!canvas) return;
  context = canvas.getContext('2d', { alpha: true });
  const resize = () => resizeCanvas();
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resizeCanvas();
}

function resizeCanvas() {
  if (!canvas || !context) return;
  const rect = canvas.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  canvasView = { width: rect.width, height: rect.height, dpr };
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  scheduleDraw();
  updateStartBeacon();
  if (state.screen === 'erase') updateEraserPosition(lastErasePoint || { x: 0.82, y: 0.82 });
}

function scheduleDraw() {
  if (drawFrame) return;
  drawFrame = requestAnimationFrame(() => {
    drawFrame = 0;
    drawCanvas();
  });
}

function drawCanvas() {
  if (!context || !canvas) return;
  const { width, height, dpr } = canvasView;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  if (!activeMode || activePath.length < 2) return;
  if (state.screen === 'trace') {
    drawGuide(activePath, state.pathIndex);
    if (state.pathIndex > 1) drawChalk(activePath.slice(0, Math.min(activePath.length, state.pathIndex + 1)), activeMode.color);
  } else if (state.screen === 'success') {
    drawChalk(activePath, activeMode.color, { glow: true, celebration: true });
  } else if (state.screen === 'erase' || state.screen === 'replay') {
    drawErasedStroke();
    drawSmudges();
  }
}

function mapPoint(point) {
  const inset = config.trace.inset;
  return {
    x: canvasView.width * (inset + point.x * (1 - inset * 2)),
    y: canvasView.height * (inset + point.y * (1 - inset * 2)),
  };
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  const inset = config.trace.inset;
  const x = ((event.clientX - rect.left) / rect.width - inset) / (1 - inset * 2);
  const y = ((event.clientY - rect.top) / rect.height - inset) / (1 - inset * 2);
  return { x: clamp(x, -0.25, 1.25), y: clamp(y, -0.25, 1.25) };
}

function traceInput(type, x, y, pointerId = 'debug-trace') {
  if (state.screen !== 'trace' || !activePath.length) return { accepted: false, progress: state.progress };
  const point = { x: Number(x), y: Number(y) };
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return { accepted: false, progress: state.progress };
  if (type === 'down') {
    if (state.pointerActive) return { accepted: false, progress: state.progress };
    const expected = activePath[Math.min(state.pathIndex, activePath.length - 1)];
    if (pixelDistance(point, expected) > tolerancePixels(config.trace.startTolerance)) {
      state.wrongStarts += 1;
      if (state.wrongStarts === 2) speak('nudge');
      return { accepted: false, progress: state.progress, gentle: true };
    }
    state.pointerActive = true;
    state.pointerId = pointerId;
    lastTracePoint = point;
    if (state.pathIndex === 0) state.pathIndex = 1;
    state.progress = state.pathIndex / (activePath.length - 1);
    updateStartBeacon();
    scheduleDraw();
    return { accepted: true, progress: state.progress };
  }
  if (!state.pointerActive || (state.pointerId !== pointerId && pointerId !== 'debug-trace')) {
    return { accepted: false, progress: state.progress };
  }
  if (type === 'move') {
    advanceTrace(lastTracePoint || point, point);
    lastTracePoint = point;
    scheduleDraw();
    return { accepted: true, progress: state.progress };
  }
  if (type === 'up' || type === 'cancel') {
    advanceTrace(lastTracePoint || point, point);
    state.pointerActive = false;
    state.pointerId = null;
    lastTracePoint = null;
    updateStartBeacon();
    scheduleDraw();
    return { accepted: true, progress: state.progress };
  }
  return { accepted: false, progress: state.progress };
}

function advanceTrace(from, to) {
  if (state.screen !== 'trace') return;
  const limit = Math.min(activePath.length, state.pathIndex + Math.max(24, Math.ceil(activePath.length * 0.14)));
  const tolerance = tolerancePixels(config.trace.tolerance);
  let best = -1;
  let missesAfterHit = 0;
  const a = mapPoint(from);
  const b = mapPoint(to);
  for (let index = state.pathIndex; index < limit; index += 1) {
    const distance = distanceToSegment(mapPoint(activePath[index]), a, b);
    if (distance <= tolerance) {
      best = index;
      missesAfterHit = 0;
    } else if (best >= 0 && ++missesAfterHit > 5) {
      break;
    }
  }
  if (best < state.pathIndex) return;
  state.pathIndex = Math.min(activePath.length - 1, best + 1);
  state.progress = state.pathIndex / (activePath.length - 1);
  updateStartBeacon();
  if (state.pathIndex >= activePath.length - 2 || state.progress >= 0.99) renderSuccess();
}

function updateStartBeacon() {
  const beacon = mount.querySelector('.start-beacon');
  const label = mount.querySelector('.start-label');
  if (!beacon || !canvas || state.screen !== 'trace') return;
  const target = activePath[Math.min(state.pathIndex, activePath.length - 1)];
  const point = mapPoint(target);
  beacon.style.left = `${point.x}px`;
  beacon.style.top = `${point.y}px`;
  beacon.classList.toggle('is-hidden', state.pointerActive);
  label?.classList.toggle('is-hidden', state.pointerActive);
  if (label) {
    label.style.left = `${point.x}px`;
    label.style.top = `${point.y}px`;
    label.textContent = state.pathIndex ? 'KEEP GOING' : 'START';
  }
}

function attachEraser() {
  const eraser = mount.querySelector('.eraser-tool');
  if (!eraser || !canvas) return;
  updateEraserPosition({ x: 0.82, y: 0.82 });
  const down = (event) => {
    event.preventDefault();
    feedback({ quiet: true });
    eraser.setPointerCapture?.(event.pointerId);
    const point = pointFromEvent(event);
    eraseInput('down', point.x, point.y, event.pointerId);
  };
  const move = (event) => {
    if (!state.erasePointerActive) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    eraseInput('move', point.x, point.y, event.pointerId);
  };
  const up = (event) => {
    if (!state.erasePointerActive) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    eraseInput('up', point.x, point.y, event.pointerId);
    try { eraser.releasePointerCapture?.(event.pointerId); } catch { /* already released */ }
  };
  const key = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    completeErase();
  };
  eraser.addEventListener('pointerdown', down);
  eraser.addEventListener('pointermove', move);
  eraser.addEventListener('pointerup', up);
  eraser.addEventListener('pointercancel', up);
  eraser.addEventListener('keydown', key);
  screenDisposers.push(() => {
    eraser.removeEventListener('pointerdown', down);
    eraser.removeEventListener('pointermove', move);
    eraser.removeEventListener('pointerup', up);
    eraser.removeEventListener('pointercancel', up);
    eraser.removeEventListener('keydown', key);
  });
}

function eraseInput(type, x, y, pointerId = 'debug-erase') {
  if (state.screen !== 'erase') return { accepted: false, progress: state.eraseProgress };
  const point = { x: Number(x), y: Number(y) };
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return { accepted: false, progress: state.eraseProgress };
  if (type === 'down') {
    if (state.erasePointerActive) return { accepted: false, progress: state.eraseProgress };
    state.erasePointerActive = true;
    state.erasePointerId = pointerId;
    lastErasePoint = point;
    applyEraser(point, point);
    updateEraserPosition(point);
    return { accepted: true, progress: state.eraseProgress };
  }
  if (!state.erasePointerActive || (state.erasePointerId !== pointerId && pointerId !== 'debug-erase')) {
    return { accepted: false, progress: state.eraseProgress };
  }
  if (type === 'move') {
    applyEraser(lastErasePoint || point, point);
    lastErasePoint = point;
    updateEraserPosition(point);
    return { accepted: true, progress: state.eraseProgress };
  }
  if (type === 'up' || type === 'cancel') {
    applyEraser(lastErasePoint || point, point);
    state.erasePointerActive = false;
    state.erasePointerId = null;
    lastErasePoint = point;
    updateEraserPosition(point);
    return { accepted: true, progress: state.eraseProgress };
  }
  return { accepted: false, progress: state.eraseProgress };
}

function applyEraser(from, to) {
  const a = mapPoint(from);
  const b = mapPoint(to);
  const radius = tolerancePixels(config.trace.eraseRadius);
  for (let index = 0; index < activePath.length; index += 1) {
    if (distanceToSegment(mapPoint(activePath[index]), a, b) <= radius) clearedPoints.add(index);
  }
  eraseMarks.push({ from: { ...from }, to: { ...to } });
  if (eraseMarks.length > 90) eraseMarks = eraseMarks.slice(-90);
  state.eraseProgress = clearedPoints.size / activePath.length;
  const fill = mount.querySelector('.erase-meter span');
  if (fill) fill.style.width = `${Math.min(100, state.eraseProgress * 100)}%`;
  fill?.parentElement?.setAttribute('aria-valuenow', String(Math.round(Math.min(1, state.eraseProgress) * 100)));
  scheduleDraw();
  if (state.eraseProgress >= config.trace.eraseComplete && !eraseFinishQueued) {
    eraseFinishQueued = true;
    timers.after(reducedMotion ? 60 : 420, () => {
      if (state.screen === 'erase') showReplay();
    });
  }
}

function updateEraserPosition(point) {
  const eraser = mount.querySelector('.eraser-tool');
  if (!eraser || !canvas) return;
  const mapped = mapPoint(point);
  eraser.style.setProperty('--eraser-x', `${mapped.x}px`);
  eraser.style.setProperty('--eraser-y', `${mapped.y}px`);
  eraser.style.setProperty('--eraser-turn', `${-5 + point.x * 10}deg`);
}

function completeRound() {
  if (state.screen === 'success' || state.screen === 'erase' || state.screen === 'replay') return true;
  if (state.screen !== 'trace' || !activePath.length) return false;
  if (state.pointerActive) traceInput('up', lastTracePoint?.x ?? 0, lastTracePoint?.y ?? 0, state.pointerId);
  const start = Math.min(state.pathIndex, activePath.length - 1);
  const first = activePath[start];
  traceInput('down', first.x, first.y, 'debug-trace');
  for (let index = start + 1; index < activePath.length && state.screen === 'trace'; index += 1) {
    traceInput('move', activePath[index].x, activePath[index].y, 'debug-trace');
  }
  if (state.screen === 'trace') {
    const last = activePath[activePath.length - 1];
    traceInput('up', last.x, last.y, 'debug-trace');
  }
  return state.screen === 'success';
}

function completeErase() {
  if (state.screen === 'success') beginErase();
  if (state.screen === 'replay') return true;
  if (state.screen !== 'erase' || !activePath.length) return false;
  const first = activePath[0];
  eraseInput('down', first.x, first.y, 'debug-erase');
  for (const point of activePath.slice(1)) eraseInput('move', point.x, point.y, 'debug-erase');
  const last = activePath[activePath.length - 1];
  eraseInput('up', last.x, last.y, 'debug-erase');
  if (state.screen === 'erase') showReplay();
  return state.screen === 'replay';
}

function input(...args) {
  const value = args[0];
  if (value && typeof value === 'object') {
    return traceInput(value.type || value.phase || (state.pointerActive ? 'move' : 'down'), value.x, value.y, value.pointerId || 'debug-trace');
  }
  return traceInput(args[0], args[1], args[2], args[3] || 'debug-trace');
}

function tracePoint(x, y, phase) {
  if (x && typeof x === 'object') return input(x);
  return traceInput(phase || (state.pointerActive ? 'move' : 'down'), x, y, 'debug-trace');
}

function erasePoint(x, y, phase) {
  if (x && typeof x === 'object') {
    return eraseInput(x.type || x.phase || (state.erasePointerActive ? 'move' : 'down'), x.x, x.y, x.pointerId || 'debug-erase');
  }
  return eraseInput(phase || (state.erasePointerActive ? 'move' : 'down'), x, y, 'debug-erase');
}

function drawGuide(points, startIndex) {
  const step = Math.max(2, Math.floor(points.length / 65));
  context.save();
  for (let index = Math.max(0, startIndex - 2); index < points.length; index += step) {
    const point = mapPoint(points[index]);
    const pulse = 0.7 + ((index / step) % 3) * 0.12;
    context.globalAlpha = 0.62;
    context.fillStyle = '#fffdf1';
    context.beginPath();
    context.arc(point.x, point.y, Math.max(3.2, tolerancePixels(0.009) * pulse), 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 0.18;
    context.beginPath();
    context.arc(point.x + 2, point.y - 1, Math.max(5, tolerancePixels(0.014)), 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawChalk(points, color, { glow = false, celebration = false } = {}) {
  if (points.length < 2) return;
  const width = clamp(Math.min(canvasView.width, canvasView.height) * 0.045, 15, 32);
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (glow) {
    context.shadowColor = color;
    context.shadowBlur = width * 1.1;
  }
  strokeMappedPath(points, color, width + 9, 0.12, 0, 0);
  strokeMappedPath(points, color, width, 0.9, 0, 0);
  context.shadowBlur = 0;
  for (let pass = 0; pass < 7; pass += 1) {
    const angle = pass * 2.19;
    const radius = 1.5 + (pass % 3) * 1.35;
    strokeMappedPath(points, pass % 3 === 0 ? '#fff8da' : color, Math.max(1.2, width * (0.075 + (pass % 2) * 0.035)), 0.25,
      Math.cos(angle) * radius, Math.sin(angle) * radius, pass + 1);
  }
  const dustStep = Math.max(3, Math.floor(points.length / (celebration ? 95 : 60)));
  for (let index = 0; index < points.length; index += dustStep) {
    const point = mapPoint(points[index]);
    const hash = noise(index * 13 + state.variant * 41);
    const angle = noise(index * 31 + 7) * Math.PI * 2;
    const radius = width * (0.55 + hash * (celebration ? 1.25 : 0.65));
    context.globalAlpha = 0.2 + hash * 0.22;
    context.fillStyle = index % 4 === 0 ? '#fff8da' : color;
    context.beginPath();
    context.arc(point.x + Math.cos(angle) * radius, point.y + Math.sin(angle) * radius, 0.8 + hash * 2.1, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function strokeMappedPath(points, color, width, alpha, offsetX = 0, offsetY = 0, wobbleSeed = 0) {
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.lineWidth = width;
  context.beginPath();
  points.forEach((source, index) => {
    const point = mapPoint(source);
    const wobble = wobbleSeed ? Math.sin(index * 1.73 + wobbleSeed * 2.1) * 0.8 : 0;
    const x = point.x + offsetX + wobble;
    const y = point.y + offsetY + (wobbleSeed ? Math.cos(index * 1.21 + wobbleSeed) * 0.7 : 0);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
}

function drawErasedStroke() {
  let group = [];
  const flush = () => {
    if (group.length > 1) drawChalk(group, activeMode.color);
    group = [];
  };
  for (let index = 0; index < activePath.length; index += 1) {
    if (clearedPoints.has(index)) {
      flush();
    } else {
      if (!group.length && index > 0 && !clearedPoints.has(index - 1)) group.push(activePath[index - 1]);
      group.push(activePath[index]);
    }
  }
  flush();
}

function drawSmudges() {
  if (!eraseMarks.length) return;
  context.save();
  context.lineCap = 'round';
  const width = tolerancePixels(config.trace.eraseRadius * 0.8);
  for (let index = 0; index < eraseMarks.length; index += 2) {
    const mark = eraseMarks[index];
    const from = mapPoint(mark.from);
    const to = mapPoint(mark.to);
    context.globalAlpha = 0.035 + (index % 4) * 0.012;
    context.strokeStyle = '#d9ddd3';
    context.lineWidth = width * (0.65 + (index % 3) * 0.08);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
  context.restore();
}

function drawModePreviews() {
  for (const preview of mount.querySelectorAll('.mode-preview')) {
    const mode = config.modes.find((candidate) => candidate.id === preview.dataset.preview);
    if (!mode) continue;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = preview.getBoundingClientRect();
    const width = Math.max(150, rect.width);
    const height = Math.max(100, rect.height);
    preview.width = Math.round(width * dpr);
    preview.height = Math.round(height * dpr);
    const ctx = preview.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const path = buildPath(mode.variants[0]);
    ctx.strokeStyle = mode.color;
    ctx.lineWidth = clamp(Math.min(width, height) * 0.075, 8, 16);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    path.forEach((point, index) => {
      const x = width * (0.1 + point.x * 0.8);
      const y = height * (0.12 + point.y * 0.78);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fffbdc';
    ctx.stroke();
  }
}

function buildPath(variant) {
  const controls = variant.points.map(([x, y]) => ({ x, y }));
  if (controls.length < 2) return controls;
  const result = [];
  const closed = pointDistance(controls[0], controls[controls.length - 1]) < 0.002;
  for (let index = 0; index < controls.length - 1; index += 1) {
    const p1 = controls[index];
    const p2 = controls[index + 1];
    const p0 = index > 0 ? controls[index - 1] : (closed ? controls[controls.length - 2] : p1);
    const p3 = index + 2 < controls.length ? controls[index + 2] : (closed ? controls[1] : p2);
    const steps = Math.max(8, Math.ceil(pointDistance(p1, p2) / 0.012));
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      result.push(variant.curve ? catmullPoint(p0, p1, p2, p3, t) : {
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t,
      });
    }
  }
  result.push({ ...controls[controls.length - 1] });
  return result.map((point) => ({ x: clamp(point.x, 0.015, 0.985), y: clamp(point.y, 0.015, 0.985) }));
}

function catmullPoint(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

function tolerancePixels(value) {
  return Math.min(canvasView.width, canvasView.height) * value;
}

function pixelDistance(a, b) {
  return pointDistance(mapPoint(a), mapPoint(b));
}

function pointDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return pointDistance(point, a);
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function noise(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function setSeed(value) {
  state.seed = (Number.isFinite(Number(value)) ? Number(value) : 0) >>> 0;
  return state.seed;
}

function setFastTimers(scale = 0.05) {
  const value = Number(scale);
  const multiplier = Number.isFinite(value) && value > 0 ? (value > 1 ? 1 / value : value) : 0.05;
  state.timerScale = clamp(multiplier, 0.01, 1);
  timers.setScale(1 / state.timerScale);
  return state.timerScale;
}

function getTarget() {
  if (!activeMode || !activeVariant) return null;
  return {
    mode: activeMode.id,
    title: activeMode.title,
    variant: state.variant,
    id: activeVariant.id,
    name: activeVariant.name,
    color: activeMode.color,
    start: activePath[0] ? { ...activePath[0] } : null,
    tolerance: config.trace.tolerance,
  };
}

function getPath() {
  return activePath.map((point) => ({ ...point }));
}

function getState() {
  return {
    screen: state.screen,
    mode: state.mode,
    round: state.round,
    variant: state.variant,
    target: activeVariant?.id || null,
    pathIndex: state.pathIndex,
    pathLength: activePath.length,
    progress: Number(state.progress.toFixed(4)),
    pointerActive: state.pointerActive,
    wrongStarts: state.wrongStarts,
    eraseProgress: Number(state.eraseProgress.toFixed(4)),
    clearedPoints: clearedPoints.size,
    muted: state.muted,
    reducedMotion: state.reducedMotion,
    timerScale: state.timerScale,
    awaitingInput: ['selection', 'trace', 'success', 'erase', 'replay'].includes(state.screen),
  };
}

function getLayout() {
  const canvasRect = canvas?.getBoundingClientRect();
  return {
    viewport: { width: innerWidth, height: innerHeight },
    canvas: canvasRect ? { x: canvasRect.x, y: canvasRect.y, width: canvasRect.width, height: canvasRect.height } : null,
    inset: config.trace.inset,
  };
}

function debugTap(targetId) {
  const element = mount.querySelector(`[data-target="${CSS.escape(targetId)}"]`);
  if (!element || element.disabled) return { accepted: false };
  element.click();
  return { accepted: true };
}

showSelection();

const ready = Promise.resolve(document.fonts?.ready).catch(() => undefined).then(() => true);
installDebug({
  gameId: config.id,
  engine: 'custom-chalk-trace',
  ready,
  listModes: () => config.modes.map(({ id, title, variants }) => ({ id, title, rounds: variants.length })),
  startMode,
  startRound,
  getState,
  getTargets: undefined,
  tap: debugTap,
  winRound: completeRound,
  completeRound,
  beginErase,
  completeErase,
  tracePoint,
  erasePoint,
  input,
  getTarget,
  getPath,
  getLayout,
  setMuted,
  mute: setMuted,
  setSeed,
  seed: setSeed,
  setFastTimers,
  fastTimers: setFastTimers,
  getAudioLog: voice.getAudioLog,
  clearAudioLog: voice.clearAudioLog,
  getBgmStats: bgm.stats,
  home: () => showSelection({ announce: false }),
  timers,
  narrator,
  voice,
  sfx,
});

Object.defineProperties(window.QLOBE_DEBUG, {
  modes: { enumerable: true, get: () => config.modes.map(({ id, title, variants }) => ({ id, title, rounds: variants.length })) },
  state: { enumerable: true, get: getState },
  target: { enumerable: true, get: getTarget },
  path: { enumerable: true, get: getPath },
});
