import config from '../config.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as bgm from '../../../shared/js/bgm.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { tada } from '../../../shared/js/celebrate.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { mulberry32 } from '../../../shared/js/rng.js';
import { createScreens } from '../../../shared/js/screens.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTimers } from '../../../shared/js/timers.js';

const root = document.getElementById('game');
const canvas = document.getElementById('trail-canvas');
const ctx = canvas.getContext('2d');
const timers = createTimers();
const modeById = Object.fromEntries(config.modes.map((mode) => [mode.id, mode]));
const modeOrder = config.modes.map((mode) => mode.id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const portraitMedia = matchMedia('(max-aspect-ratio: 4 / 5)');

const els = {
  select: document.getElementById('select-screen'),
  play: document.getElementById('play-screen'),
  complete: document.getElementById('complete-screen'),
  loading: document.getElementById('loading-screen'),
  announcer: document.getElementById('announcer'),
  modeCards: [...document.querySelectorAll('.mode-card')],
  start: document.getElementById('start-button'),
  next: document.getElementById('next-button'),
  stageShell: document.getElementById('stage-shell'),
  stageArt: document.getElementById('stage-art'),
  ambientArt: document.getElementById('ambient-art'),
  playTitle: document.getElementById('play-title'),
  flowerRow: document.getElementById('flower-row'),
  flowers: [...document.querySelectorAll('#flower-row img')],
  prompt: document.getElementById('trace-prompt'),
  flag: document.getElementById('finish-flag'),
  paw: document.getElementById('start-paw'),
  fia: document.getElementById('fia'),
  completeNote: document.getElementById('complete-note'),
};

const state = {
  selectedMode: 'forest',
  mode: null,
  progress: 0,
  checkpoint: 0,
  misses: 0,
  pointerId: null,
  tracing: false,
  started: false,
  finishing: false,
  completed: loadCompleted(),
  muted: false,
  lastVoiceKey: null,
  lastOffPathAt: -Infinity,
  seed: 42,
  rng: mulberry32(42),
  artFailures: [],
};

let samples = [];
let canvasWidth = 0;
let canvasHeight = 0;
let poseTimer = null;
let celebrationDispose = null;
let resizeObserver = null;

const narrator = createNarrator({ announcerParent: null });
const nudger = createNudger({
  first: 10000,
  repeat: 11000,
  onNudge: (count) => {
    if (screens.current !== 'play' || state.finishing) return;
    els.paw.classList.remove('hint-pop');
    void els.paw.offsetWidth;
    els.paw.classList.add('hint-pop');
    if (count === 0) speak(state.started ? 'steady' : 'start');
    else drawTrail(Math.min(1, state.progress + .12));
  },
});

const screens = createScreens({
  root,
  initial: 'select',
  splash: 'select',
  voice: narrator,
  onExit: (name) => {
    if (name === 'play') stopTracing();
    if (name === 'complete') {
      celebrationDispose?.();
      celebrationDispose = null;
    }
  },
});

installKioskGuards();

function announce(text) {
  els.announcer.textContent = '';
  requestAnimationFrame(() => { els.announcer.textContent = text; });
}

function speak(key) {
  const text = config.voice[key] || '';
  state.lastVoiceKey = key;
  announce(text);
  return bgm.duckDuring(narrator.say(key, text));
}

function speakSequence(parts) {
  if (parts.length) state.lastVoiceKey = parts.at(-1).key;
  const last = parts.at(-1);
  if (last) announce(last.text);
  return bgm.duckDuring(narrator.saySequence(parts));
}

function loadCompleted() {
  try {
    const saved = JSON.parse(localStorage.getItem(config.storageKey) || '[]');
    return new Set(Array.isArray(saved) ? saved.filter((id) => modeById[id]) : []);
  } catch {
    return new Set();
  }
}

function saveCompleted() {
  try { localStorage.setItem(config.storageKey, JSON.stringify([...state.completed])); } catch { /* optional */ }
}

function collectAssetUrls(value, output = []) {
  if (typeof value === 'string' && /\.(?:png|jpe?g|webp)$/i.test(value)) output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectAssetUrls(item, output));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => collectAssetUrls(item, output));
  return [...new Set(output)];
}

function verifyImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(null);
    image.onerror = () => resolve(url);
    image.src = url;
  });
}

function updateSelect() {
  for (const card of els.modeCards) {
    const selected = card.dataset.mode === state.selectedMode;
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-pressed', String(selected));
    const badge = card.querySelector('.mode-badge');
    badge.hidden = !state.completed.has(card.dataset.mode);
  }
  const mode = modeById[state.selectedMode];
  els.start.setAttribute('aria-label', `Start ${mode.title}`);
}

function updateTrailLabel() {
  const title = state.mode?.title || 'Trail';
  canvas.setAttribute(
    'aria-label',
    `${title}. ${state.checkpoint} of 5 flowers blooming. Drag along the glowing trail, or press Right Arrow, Enter, or Space to take a careful step.`,
  );
}

function chooseMode(id, { voice = true } = {}) {
  const mode = modeById[id];
  if (!mode) return false;
  state.selectedMode = id;
  updateSelect();
  sfx.pop();
  if (voice) speak(`${id}-name`);
  return true;
}

function stageForMode(mode) {
  return portraitMedia.matches && mode.portraitStage ? mode.portraitStage : mode.stage;
}

function routeForMode(mode) {
  return portraitMedia.matches && mode.portraitRoute ? mode.portraitRoute : mode.route;
}

function resetTrail(mode) {
  timers.clearAll();
  state.mode = mode;
  state.progress = 0;
  state.checkpoint = 0;
  state.misses = 0;
  state.pointerId = null;
  state.tracing = false;
  state.started = false;
  state.finishing = false;
  state.lastOffPathAt = -Infinity;
  poseTimer = null;

  const stage = stageForMode(mode);
  els.stageArt.src = stage;
  els.ambientArt.src = stage;
  els.playTitle.textContent = mode.title.toUpperCase();
  els.prompt.textContent = 'START AT THE PAW';
  els.prompt.classList.remove('is-soft');
  els.fia.src = config.assets.fox.ready;
  els.fia.classList.remove('is-blooming');
  els.paw.hidden = false;
  els.flowers.forEach((flower) => {
    flower.src = config.assets.flowerBud;
    flower.classList.remove('is-bloomed');
  });
  els.flowerRow.setAttribute('aria-label', '0 of 5 flowers blooming');
  updateTrailLabel();
}

async function startMode(id = state.selectedMode, { voice = true } = {}) {
  await ready;
  const mode = modeById[id] || config.modes[0];
  return screens.start(async () => {
    state.selectedMode = mode.id;
    resetTrail(mode);
    screens.show('play', { force: screens.current === 'play' });
    await nextFrame();
    try { await els.stageArt.decode(); } catch { /* preload failure is reported in debug state */ }
    resizeStage();
    nudger.arm();
    if (voice) speak('start');
    announce(`${mode.title}. Start at the glowing paw and follow the line.`);
    return true;
  }, { busy: false });
}

function showSelect({ voice = true } = {}) {
  stopTracing();
  state.mode = null;
  state.progress = 0;
  state.checkpoint = 0;
  screens.show('select');
  updateSelect();
  if (voice) speak('choose');
}

function nextMode() {
  const currentIndex = Math.max(0, modeOrder.indexOf(state.mode?.id));
  const nextUnfinished = modeOrder.find((id, index) => index > currentIndex && !state.completed.has(id))
    || modeOrder.find((id) => !state.completed.has(id));
  return nextUnfinished || modeOrder[(currentIndex + 1) % modeOrder.length];
}

function goNext() {
  const id = nextMode();
  chooseMode(id, { voice: false });
  startMode(id);
}

function cancelStroke() {
  const pointerId = state.pointerId;
  state.pointerId = null;
  state.tracing = false;
  if (pointerId != null) {
    try { canvas.releasePointerCapture(pointerId); } catch { /* optional */ }
  }
  if (state.mode && !state.finishing) setPose('ready');
}

function stopTracing() {
  cancelStroke();
  nudger.stop();
}

function buildSamples(route, width, height, sourceWidth, sourceHeight, count = 360) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const offsetX = (width - renderedWidth) / 2;
  const offsetY = (height - renderedHeight) / 2;
  const vertices = route.map(([x, y]) => ({
    x: offsetX + x * renderedWidth,
    y: offsetY + y * renderedHeight,
  }));
  const curved = [];
  for (let index = 0; index < vertices.length - 1; index += 1) {
    const p0 = vertices[Math.max(0, index - 1)];
    const p1 = vertices[index];
    const p2 = vertices[index + 1];
    const p3 = vertices[Math.min(vertices.length - 1, index + 2)];
    for (let step = 0; step < 24; step += 1) {
      const t = step / 24;
      const t2 = t * t;
      const t3 = t2 * t;
      curved.push({
        x: .5 * ((2 * p1.x) + (-p0.x + p2.x) * t
          + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2
          + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: .5 * ((2 * p1.y) + (-p0.y + p2.y) * t
          + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2
          + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  curved.push(vertices.at(-1));
  const segments = [];
  let total = 0;
  for (let i = 1; i < curved.length; i += 1) {
    const a = curved[i - 1];
    const b = curved[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    segments.push({ a, b, from: total, length });
    total += length;
  }
  const output = [];
  for (let i = 0; i < count; i += 1) {
    const distance = (i / (count - 1)) * total;
    let segment = segments.at(-1);
    for (const candidate of segments) {
      if (distance <= candidate.from + candidate.length) {
        segment = candidate;
        break;
      }
    }
    const part = segment.length ? (distance - segment.from) / segment.length : 0;
    output.push({
      x: segment.a.x + (segment.b.x - segment.a.x) * part,
      y: segment.a.y + (segment.b.y - segment.a.y) * part,
    });
  }
  return output;
}

function resizeStage() {
  if (!state.mode || screens.current !== 'play') return;
  const expectedStage = stageForMode(state.mode);
  if (els.stageArt.getAttribute('src') !== expectedStage) {
    els.stageArt.src = expectedStage;
    els.ambientArt.src = expectedStage;
    els.stageArt.addEventListener('load', resizeStage, { once: true });
    return;
  }
  const width = Math.max(1, Math.round(canvas.clientWidth));
  const height = Math.max(1, Math.round(canvas.clientHeight));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  canvasWidth = width;
  canvasHeight = height;
  samples = buildSamples(
    routeForMode(state.mode),
    width,
    height,
    els.stageArt.naturalWidth || width,
    els.stageArt.naturalHeight || height,
  );
  drawTrail();
  renderActors();
}

function pointAt(fraction) {
  if (!samples.length) return { x: 0, y: 0 };
  const index = Math.max(0, Math.min(samples.length - 1, Math.round(fraction * (samples.length - 1))));
  return samples[index];
}

function strokeSamples(fromIndex, toIndex, style) {
  if (!samples.length || toIndex <= fromIndex) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(samples[fromIndex].x, samples[fromIndex].y);
  for (let i = fromIndex + 1; i <= toIndex; i += 1) ctx.lineTo(samples[i].x, samples[i].y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = style.width;
  ctx.strokeStyle = style.color;
  ctx.globalAlpha = style.alpha ?? 1;
  ctx.setLineDash(style.dash || []);
  ctx.lineDashOffset = style.dashOffset || 0;
  ctx.shadowColor = style.shadow || 'transparent';
  ctx.shadowBlur = style.blur || 0;
  ctx.stroke();
  ctx.restore();
}

function drawTrail(hintFraction = null) {
  if (!samples.length) return;
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  const unit = Math.max(10, Math.min(canvasWidth, canvasHeight) * .017);
  const end = samples.length - 1;
  const done = Math.round(state.progress * end);

  strokeSamples(0, end, {
    width: unit * 1.65,
    color: '#fff8cf',
    alpha: .9,
    dash: [unit * 1.1, unit * .72],
    shadow: '#fff7a6',
    blur: unit * .85,
  });
  strokeSamples(0, end, {
    width: unit * .66,
    color: '#efbd45',
    alpha: .94,
    dash: [unit * 1.1, unit * .72],
  });
  if (done > 0) {
    strokeSamples(0, done, {
      width: unit * 1.48,
      color: '#fff2a0',
      alpha: .96,
      dash: [unit * 1.1, unit * .72],
      shadow: '#f5c850',
      blur: unit * .9,
    });
    strokeSamples(0, done, {
      width: unit * .58,
      color: '#dc902f',
      alpha: .94,
      dash: [unit * 1.1, unit * .72],
    });
  }
  if (hintFraction != null && hintFraction > state.progress) {
    const hintEnd = Math.round(Math.min(1, hintFraction) * end);
    strokeSamples(done, hintEnd, {
      width: unit * 1.35,
      color: '#fffde5',
      alpha: .78,
      shadow: '#fffbd0',
      blur: unit * 1.2,
    });
    timers.after(760, () => drawTrail());
  }
}

function place(el, point) {
  el.style.left = `${(point.x / canvasWidth) * 100}%`;
  el.style.top = `${(point.y / canvasHeight) * 100}%`;
}

function renderActors() {
  if (!samples.length) return;
  place(els.fia, pointAt(state.progress));
  place(els.paw, pointAt(state.progress > .03 ? state.progress : 0));
  place(els.flag, pointAt(1));
  els.paw.hidden = state.progress > .035 || state.finishing;
}

function nearestSample(point, from, to) {
  let bestIndex = from;
  let bestDistance = Infinity;
  for (let i = from; i <= to; i += 1) {
    const sample = samples[i];
    const distance = Math.hypot(point.x - sample.x, point.y - sample.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return { index: bestIndex, distance: bestDistance };
}

function eventPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvasWidth / rect.width),
    y: (event.clientY - rect.top) * (canvasHeight / rect.height),
  };
}

function handlePointerDown(event) {
  if (screens.current !== 'play' || state.finishing || state.pointerId != null) return;
  if (event.isPrimary === false) return;
  const current = Math.round(state.progress * (samples.length - 1));
  const point = eventPoint(event);
  const nearest = nearestSample(point, Math.max(0, current - 8), Math.min(samples.length - 1, current + 24));
  const tolerance = Math.max(64, state.mode.tolerance * Math.min(canvasWidth, canvasHeight));
  if (nearest.distance > tolerance * 1.55) {
    handleOffPath();
    return;
  }
  event.preventDefault();
  state.pointerId = event.pointerId;
  state.tracing = true;
  state.started = true;
  try { canvas.setPointerCapture(event.pointerId); } catch { /* optional */ }
  els.prompt.textContent = 'SLOW AND STEADY';
  els.prompt.classList.add('is-soft');
  processTracePoint(point);
  nudger.poke();
}

function handlePointerMove(event) {
  if (event.pointerId !== state.pointerId || !state.tracing) return;
  event.preventDefault();
  processTracePoint(eventPoint(event));
  nudger.poke();
}

function handlePointerEnd(event) {
  if (event.pointerId !== state.pointerId) return;
  state.pointerId = null;
  state.tracing = false;
  try { canvas.releasePointerCapture(event.pointerId); } catch { /* optional */ }
  if (!state.finishing) setPose('ready');
}

function handleKeyboardStep(event) {
  if (!['ArrowRight', 'Enter', ' '].includes(event.key) || event.repeat) return;
  if (screens.current !== 'play' || !state.mode || state.finishing) return;
  event.preventDefault();
  state.started = true;
  els.prompt.textContent = 'SLOW AND STEADY';
  els.prompt.classList.add('is-soft');
  const lastCheckpoint = state.mode.checkpoints.length - 1;
  const goal = state.checkpoint >= lastCheckpoint
    ? 1
    : Math.min(1, state.mode.checkpoints[state.checkpoint] + .002);
  advanceProgress(goal);
  nudger.poke();
}

function processTracePoint(point) {
  if (!samples.length || state.finishing) return false;
  const current = Math.round(state.progress * (samples.length - 1));
  const nearest = nearestSample(
    point,
    Math.max(0, current - 9),
    Math.min(samples.length - 1, current + 48),
  );
  const tolerance = Math.max(64, state.mode.tolerance * Math.min(canvasWidth, canvasHeight));
  if (nearest.distance > tolerance) {
    handleOffPath();
    return false;
  }
  const fraction = nearest.index / (samples.length - 1);
  if (fraction > state.progress) advanceProgress(fraction);
  return true;
}

function handleOffPath() {
  const now = performance.now();
  const sinceLast = now - state.lastOffPathAt;
  if (sinceLast < 650) return;
  state.lastOffPathAt = now;
  state.misses += 1;
  setPose('pause');
  els.prompt.textContent = 'BACK TO THE GLOW';
  els.prompt.classList.remove('is-soft');
  if (state.misses === 1 || sinceLast > 3000) speak('return');
  announce("Bring your finger back to Fia's glowing trail. Your flowers are safe.");
}

function setPose(name, hold = 0) {
  if (!config.assets.fox[name]) return;
  els.fia.src = config.assets.fox[name];
  els.fia.classList.toggle('is-blooming', name === 'bloom');
  if (poseTimer != null) timers.clear(poseTimer);
  poseTimer = null;
  if (hold && !state.finishing) {
    poseTimer = timers.after(hold, () => {
      poseTimer = null;
      setPose('ready');
    });
  }
}

function advanceProgress(fraction) {
  if (!state.mode || state.finishing) return;
  const previousCheckpoint = state.checkpoint;
  state.progress = Math.max(state.progress, Math.min(1, fraction));
  state.checkpoint = state.mode.checkpoints.filter((point) => state.progress >= point).length;
  if (state.checkpoint !== previousCheckpoint) updateTrailLabel();
  if (state.checkpoint > previousCheckpoint) {
    for (let index = previousCheckpoint; index < state.checkpoint; index += 1) bloomFlower(index);
  }
  if (state.checkpoint === previousCheckpoint) {
    setPose(state.checkpoint % 2 ? 'rightStep' : 'leftStep');
  }
  drawTrail();
  renderActors();
  if (state.progress >= .985) finishTrail();
}

function bloomFlower(index) {
  const flower = els.flowers[index];
  if (!flower) return;
  flower.src = config.assets.flowerBloom;
  flower.classList.remove('is-bloomed');
  void flower.offsetWidth;
  flower.classList.add('is-bloomed');
  els.flowerRow.setAttribute('aria-label', `${index + 1} of 5 flowers blooming`);
  setPose('bloom', 650);
  sfx.sparkle();
  if (index === 0) speak('bloom');
  else if (index === 2) speak('steady');
  announce(`Flower ${index + 1} of 5 bloomed.`);
}

function finishTrail() {
  if (state.finishing) return;
  state.finishing = true;
  state.progress = 1;
  state.checkpoint = 5;
  updateTrailLabel();
  state.completed.add(state.mode.id);
  saveCompleted();
  renderActors();
  setPose('celebrate');
  els.prompt.textContent = 'TRAIL COMPLETE!';
  els.prompt.classList.remove('is-soft');
  nudger.stop();
  timers.after(reducedMotion ? 120 : 520, showComplete);
}

function showComplete() {
  if (!state.mode || screens.current !== 'play') return;
  const allDone = modeOrder.every((id) => state.completed.has(id));
  els.completeNote.textContent = allDone
    ? 'Every storybook trail is blooming!'
    : `${state.mode.title} is blooming with five flowers.`;
  screens.show('complete');
  updateSelect();
  celebrationDispose = tada({ host: els.complete, count: 36, rng: state.rng, duration: 2500 });
  if (allDone) {
    speakSequence([
      { key: 'all-complete', text: config.voice['all-complete'] },
      { key: 'walk-together', text: config.voice['walk-together'], gap: 420 },
    ]);
  } else {
    speak('complete');
  }
}

function setMuted(on = true) {
  state.muted = Boolean(on);
  narrator.setMuted(state.muted);
  voiceClips.setMuted(state.muted);
  sfx.setMuted(state.muted);
  bgm.setMuted(state.muted);
  return state.muted;
}

function replayPrompt() {
  if (screens.current === 'play') speak(state.started ? 'steady' : 'start');
  else if (screens.current === 'complete') speak(modeOrder.every((id) => state.completed.has(id)) ? 'all-complete' : 'complete');
  else speak(state.lastVoiceKey || 'intro');
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function dispatchPointer(type, point, pointerId = 777) {
  const rect = canvas.getBoundingClientRect();
  const event = new PointerEvent(type, {
    pointerId,
    isPrimary: true,
    bubbles: true,
    cancelable: true,
    clientX: rect.left + (point.x / canvasWidth) * rect.width,
    clientY: rect.top + (point.y / canvasHeight) * rect.height,
  });
  canvas.dispatchEvent(event);
}

async function traceFraction(target = 1) {
  if (screens.current !== 'play' || !state.mode) throw new Error('Start a trail first.');
  const goal = Math.max(state.progress, Math.min(1, Number(target) || 0));
  const from = Math.round(state.progress * (samples.length - 1));
  const to = Math.round(goal * (samples.length - 1));
  dispatchPointer('pointerdown', samples[from]);
  for (let index = from + 1; index <= to; index += 3) {
    dispatchPointer('pointermove', samples[Math.min(index, to)]);
    await timers.wait(7);
  }
  if (to > from) dispatchPointer('pointermove', samples[to]);
  dispatchPointer('pointerup', samples[to]);
  if (goal >= .985) await waitFor(() => screens.current === 'complete', 2200);
  return debugState();
}

async function probeOffPath() {
  if (screens.current !== 'play' || !state.mode) throw new Error('Start a trail first.');
  const current = pointAt(state.progress);
  const far = {
    x: current.x < canvasWidth / 2 ? canvasWidth - 8 : 8,
    y: current.y < canvasHeight / 2 ? canvasHeight - 8 : 8,
  };
  dispatchPointer('pointerdown', current, 778);
  dispatchPointer('pointermove', far, 778);
  dispatchPointer('pointerup', far, 778);
  return debugState();
}

function waitFor(predicate, timeoutMs) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const poll = () => {
      if (predicate()) resolve(true);
      else if (performance.now() - started > timeoutMs) reject(new Error('Timed out waiting for game state.'));
      else setTimeout(poll, 20);
    };
    poll();
  });
}

function debugState() {
  return {
    debugVersion: 1,
    screen: screens.current,
    selectedMode: state.selectedMode,
    mode: state.mode?.id || null,
    progress: Math.round(state.progress * 1000) / 1000,
    checkpoint: state.checkpoint,
    roundsTotal: 5,
    misses: state.misses,
    tracing: state.tracing,
    awaitingInput: screens.current === 'play' && !state.finishing,
    finishing: state.finishing,
    completed: [...state.completed],
    muted: state.muted,
    lastVoiceKey: state.lastVoiceKey,
    artFailures: [...state.artFailures],
    seed: state.seed,
  };
}

canvas.addEventListener('pointerdown', handlePointerDown);
canvas.addEventListener('pointermove', handlePointerMove);
canvas.addEventListener('pointerup', handlePointerEnd);
canvas.addEventListener('pointercancel', handlePointerEnd);
canvas.addEventListener('keydown', handleKeyboardStep);

for (const card of els.modeCards) {
  onTap(card, () => chooseMode(card.dataset.mode), { feedback: () => sfx.tick() });
}
onTap(els.start, () => startMode(state.selectedMode), { feedback: () => sfx.tick() });
onTap(els.next, goNext, { feedback: () => sfx.tick() });

const home = hudButton('home', () => { window.location.href = '../../index.html'; });
home.classList.add('qk-hud-top-left');
home.dataset.target = 'home';
els.select.append(home);

const playBack = hudButton('back', () => showSelect());
playBack.classList.add('qk-hud-top-left');
playBack.dataset.target = 'back';
els.play.append(playBack);

const completeBack = hudButton('back', () => showSelect());
completeBack.classList.add('qk-hud-top-left');
completeBack.dataset.target = 'back';
els.complete.append(completeBack);

const sound = hudButton('sound', soundDebounce(replayPrompt, 650));
sound.classList.add('qk-hud-top-right');
sound.dataset.target = 'sound';
root.append(sound);

const disposeUnlock = installUnlockOnGesture({
  extra: [bgm.unlock],
  onFirst: () => {
    bgm.setVolume(config.music.volume);
    bgm.play(config.music.track, { key: config.id, fadeInMs: 850 });
    timers.after(180, () => {
      if (!state.lastVoiceKey && screens.current === 'select') speak('intro');
    });
  },
});

const assetUrls = collectAssetUrls({ assets: config.assets, modes: config.modes });
bgm.preload(config.music.track);
const ready = Promise.all([
  preloadImages(assetUrls),
  voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
  Promise.all(assetUrls.map(verifyImage)).then((results) => {
    state.artFailures = results.filter(Boolean);
  }),
]).then(() => {
  updateSelect();
  els.loading.classList.add('is-ready');
  timers.after(380, () => els.loading.setAttribute('hidden', ''));
  announce(config.voice.intro);
  return true;
});

resizeObserver = typeof ResizeObserver === 'function'
  ? new ResizeObserver(() => requestAnimationFrame(resizeStage))
  : null;
resizeObserver?.observe(els.stageShell);
window.addEventListener('resize', resizeStage, { passive: true });
window.addEventListener('blur', cancelStroke);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelStroke();
  else if (screens.current === 'play' && !state.finishing) nudger.arm();
});
portraitMedia.addEventListener?.('change', resizeStage);

const disposeDebug = installDebug({
  gameId: config.id,
  engine: config.engine,
  ready,
  listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
  startMode: (id) => startMode(id, { voice: false }),
  getState: debugState,
  getTargets: () => collectTargets(root),
  tap: async (id) => {
    const target = root.querySelector(`[data-target="${CSS.escape(String(id))}"]`);
    if (!target) return false;
    target.click();
    await nextFrame();
    return true;
  },
  winRound: () => traceFraction(1),
  home: () => showSelect({ voice: false }),
  tracePoints: () => samples.filter((_, index) => index % 12 === 0).map(({ x, y }) => [x / canvasWidth, y / canvasHeight]),
  traceFraction,
  probeOffPath,
  resetProgress: () => state.mode && startMode(state.mode.id, { voice: false }),
  getAudioLog: voiceClips.getAudioLog,
  clearAudioLog: voiceClips.clearAudioLog,
  mute: setMuted,
  timers,
  narrator,
  voice: voiceClips,
  sfx,
  root,
  onSeed: (rng, seed) => {
    state.rng = rng;
    state.seed = seed;
  },
});

window.addEventListener('pagehide', () => {
  celebrationDispose?.();
  nudger.stop();
  timers.clearAll();
  bgm.stop({ fadeOutMs: 0 });
  narrator.dispose();
  resizeObserver?.disconnect();
  portraitMedia.removeEventListener?.('change', resizeStage);
  disposeUnlock?.();
  disposeDebug?.();
  screens.destroy();
}, { once: true });

ready.catch((error) => {
  console.error('[line-walking-challenge] boot failed', error);
  els.loading.setAttribute('hidden', '');
});
