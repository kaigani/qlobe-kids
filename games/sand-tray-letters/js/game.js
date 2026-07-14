import * as sfx from '../../../shared/js/sfx.js';
import * as speech from '../../../shared/js/speech.js';
import * as voice from '../../../shared/js/voice-clips.js';
import { onTap } from '../../../shared/js/tap.js';
import { MATERIALS, LETTERS } from '../config.js';

// Letters whose phonic sound reuses a shared recorded fragment
// (shared/assets/audio/fragments/*.m4a → copied in as sound-<x>.m4a). The other
// seven (A E I O Q U X) fold the phonic into their praise clip.
const FRAGMENT_LETTERS = new Set('BCDFGHJKLMNPRSTVWYZ'.split(''));

// Fixed fallback lines so the first welcome (and any moment before the manifest
// loads, or if it 404s) still speaks via Web Speech. Per-letter praise falls
// back through lines.json, loaded by voice.init below.
const DEFAULT_LINES = {
  welcome: 'Welcome to Sand Tray Letters. Trace, learn, and play!',
  'choose-tray': 'Choose your tray. What would you like to trace in?',
  'choose-short': 'Choose golden sand, white salt, or soft flour.',
  'trace-this': 'Trace this letter.', 'follow-arrows': 'Follow the arrows.',
  'next-letter': 'Here is the next letter.',
  'next-stroke': 'Next stroke. Start at the orange dot.',
  'start-dot': 'Start at the orange dot.', 'stay-near': 'Stay near the dotted path.',
  'smooth-ready': 'Smooth and ready. Trace this letter.',
  'shake-next': 'Tap next letter to keep going!',
  finish: 'Terrific tracing! You made all twenty six letters.',
  'mat-sand': 'Golden sand.', 'mat-salt': 'White salt.', 'mat-flour': 'Soft flour.',
};

// Voice manifest loads at boot; every play falls back to Web Speech on a miss.
voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', DEFAULT_LINES);

const $ = (id) => document.getElementById(id);
const screens = {
  welcome: $('welcome'),
  materials: $('materials'),
  play: $('play'),
  finish: $('finish'),
};
const els = {
  start: $('start-button'), trace: $('trace-button'), next: $('next-button'),
  playAgain: $('play-again-button'), list: $('material-list'), tray: $('tray'),
  canvas: $('sand-canvas'), title: $('letter-title'), swatch: $('material-swatch'),
  hint: $('trace-hint'), progress: $('stroke-progress'), reset: $('reset-button'),
  success: $('success-card'), successTitle: $('success-title'),
  confetti: $('confetti'), announcer: $('announcer'),
};
const ctx = els.canvas.getContext('2d', { alpha: false, desynchronized: true });

const state = {
  screen: 'welcome',
  material: 'sand',
  round: 0,
  order: [],
  letter: LETTERS[0],
  stroke: 0,
  progress: [],
  samples: [],
  activePointer: null,
  awaitingInput: false,
  success: false,
  muted: false,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  rng: Math.random,
  fast: false,
};

let textureCanvas = document.createElement('canvas');
let textureKey = '';
let metricsCache = null;
let resizeFrame = 0;
let audioContext = null;
let lastTextureSound = 0;
let nudgeTimer = 0;
let confettiTimer = 0;

function showScreen(name) {
  state.screen = name;
  for (const [key, node] of Object.entries(screens)) node.classList.toggle('hidden', key !== name);
  state.awaitingInput = name === 'play' && !state.success;
  voice.stop();
}

// Play a sequence of recorded clips (teacher voice) as one utterance, and mirror
// the full text into the live-region announcer for screen readers. A newer say()
// cancels the previous sequence via the token.
let sayToken = 0;
function say(keys, announce) {
  if (announce != null) els.announcer.textContent = announce;
  voice.stop();
  const token = ++sayToken;
  if (state.muted) return;
  (async () => {
    for (const key of keys) {
      if (token !== sayToken || state.muted) return;
      await voice.say(key);
    }
  })();
}

// Success/replay utterance for a letter: praise, then the reused phonic fragment
// for the 19 consonants (the 7 vowels/edge letters carry the phonic in praise).
function letterVoice(letter, withNext) {
  const keys = [`praise-${letter.id}`];
  if (FRAGMENT_LETTERS.has(letter.id)) keys.push(`sound-${letter.id}`);
  if (withNext) keys.push('shake-next');
  return keys;
}

function unlockAudio() {
  sfx.unlock();
  speech.unlock();
  voice.unlock();
}

function showWelcome(withVoice = true) {
  state.success = false;
  showScreen('welcome');
  if (withVoice) say(['welcome'], 'Welcome to Sand Tray Letters. Trace, learn, and play!');
}

function showMaterials() {
  state.success = false;
  showScreen('materials');
  updateMaterialCards();
  say(['choose-tray'], 'Choose your tray. What would you like to trace in?');
}

function selectMaterial(id, withSound = true) {
  if (!MATERIALS[id]) return;
  state.material = id;
  updateMaterialCards();
  if (withSound) {
    sfx.pop();
    say([`mat-${id}`], `${MATERIALS[id].label}.`);
  }
}

function updateMaterialCards() {
  for (const card of els.list.querySelectorAll('.material-card')) {
    const selected = card.dataset.material === state.material;
    card.classList.toggle('selected', selected);
    card.setAttribute('aria-checked', String(selected));
  }
}

function beginTracing(resetRound = false) {
  if (resetRound || !state.order.length) {
    state.round = 0;
    state.order = shuffled(LETTERS, state.rng);
  }
  state.letter = state.order[state.round];
  state.success = false;
  showScreen('play');
  els.tray.dataset.material = state.material;
  els.swatch.style.background = MATERIALS[state.material].swatch;
  state.stroke = 0;
  state.progress = state.letter.strokes.map(() => 0);
  buildSamples();
  updateLetterUI();
  resizeCanvas(true);
  say(['trace-this', 'follow-arrows'], `Trace the letter ${state.letter.id}. Follow the arrows.`);
}

function updateLetterUI() {
  const letter = state.letter.id;
  els.title.innerHTML = `Trace the letter <b>${letter}</b>`;
  els.canvas.setAttribute('aria-label', `Trace uppercase ${letter}`);
  els.successTitle.textContent = state.letter.success;
  els.success.classList.toggle('hidden', !state.success);
  els.reset.classList.toggle('hidden', state.success);
  const multi = state.letter.strokes.length > 1;
  els.progress.classList.toggle('hidden', !multi || state.success || state.stroke === 0);
  els.hint.classList.toggle('hidden', state.success || (multi && state.stroke > 0));
  els.progress.textContent = `${Math.min(state.stroke + 1, state.letter.strokes.length)} of ${state.letter.strokes.length} strokes`;
}

function buildSamples() {
  state.samples = state.letter.strokes.map((stroke) => samplePolyline(stroke, 7));
}

function samplePolyline(points, step) {
  const result = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const count = Math.max(1, Math.ceil(distance / step));
    for (let j = 0; j < count; j++) {
      const t = j / count;
      result.push({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t });
    }
  }
  const last = points[points.length - 1];
  result.push({ x: last[0], y: last[1] });
  return result;
}

function canvasMetrics() {
  if (metricsCache) return metricsCache;
  const width = els.canvas.clientWidth;
  const height = els.canvas.clientHeight;
  const scale = Math.min(width * .82 / 1000, height * .84 / 700);
  metricsCache = { width, height, scale, left: (width - 1000 * scale) / 2, top: (height - 700 * scale) / 2 };
  return metricsCache;
}

function toScreen(point) {
  const m = canvasMetrics();
  return { x: m.left + point.x * m.scale, y: m.top + point.y * m.scale };
}

function fromEvent(event) {
  const rect = els.canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function resizeCanvas(force = false) {
  const rect = els.canvas.getBoundingClientRect();
  const cssWidth = Math.max(1, rect.width);
  const cssHeight = Math.max(1, rect.height);
  const scale = Math.min(cssWidth * .82 / 1000, cssHeight * .84 / 700);
  metricsCache = {
    width: cssWidth,
    height: cssHeight,
    scale,
    left: (cssWidth - 1000 * scale) / 2,
    top: (cssHeight - 700 * scale) / 2,
  };
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (!force && els.canvas.width === width && els.canvas.height === height) return;
  els.canvas.width = width;
  els.canvas.height = height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  textureKey = '';
  render();
}

function buildTexture(width, height) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const key = `${Math.round(width)}:${Math.round(height)}:${state.material}:${dpr}`;
  if (textureKey === key) return;
  textureKey = key;
  textureCanvas.width = Math.max(1, Math.round(width * dpr));
  textureCanvas.height = Math.max(1, Math.round(height * dpr));
  const tx = textureCanvas.getContext('2d', { alpha: false });
  tx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const material = MATERIALS[state.material];
  const gradient = tx.createRadialGradient(width * .5, height * .38, 10, width * .5, height * .45, Math.max(width, height) * .72);
  gradient.addColorStop(0, material.light);
  gradient.addColorStop(.45, material.base);
  gradient.addColorStop(1, mix(material.base, material.dark, .24));
  tx.fillStyle = gradient;
  tx.fillRect(0, 0, width, height);

  const random = seededRandom(hashString(`${state.material}:${Math.round(width)}:${Math.round(height)}`));
  const density = state.material === 'flour' ? 5500 : state.material === 'salt' ? 6800 : 9000;
  for (let i = 0; i < density; i++) {
    const x = random() * width;
    const y = random() * height;
    const radius = state.material === 'salt' ? .6 + random() * 1.6 : .35 + random() * 1.1;
    tx.globalAlpha = .16 + random() * .35;
    tx.fillStyle = random() > .47 ? material.grain : material.dark;
    tx.beginPath();
    if (state.material === 'salt') tx.rect(x, y, radius * 1.35, radius);
    else tx.arc(x, y, radius, 0, Math.PI * 2);
    tx.fill();
  }
  tx.globalAlpha = 1;
}

function render() {
  if (state.screen !== 'play') return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const { width, height } = canvasMetrics();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildTexture(width, height);
  ctx.drawImage(textureCanvas, 0, 0, textureCanvas.width, textureCanvas.height, 0, 0, width, height);

  for (let i = 0; i < state.stroke; i++) drawGroove(i, state.samples[i].length - 1);
  if (!state.success) {
    const activeProgress = state.progress[state.stroke] || 0;
    if (activeProgress > 0) drawGroove(state.stroke, activeProgress);
    drawGuides();
  } else {
    for (let i = state.stroke; i < state.samples.length; i++) drawGroove(i, state.samples[i].length - 1);
  }
}

function pathForSamples(samples, start = 0, end = samples.length - 1) {
  ctx.beginPath();
  for (let i = start; i <= Math.min(end, samples.length - 1); i++) {
    const p = toScreen(samples[i]);
    if (i === start) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
}

function drawGroove(index, end) {
  const samples = state.samples[index];
  if (!samples || end < 1) return;
  const material = MATERIALS[state.material];
  const m = canvasMetrics();
  const outer = Math.max(34, 66 * m.scale);
  const inner = Math.max(22, 43 * m.scale);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  pathForSamples(samples, 0, end);
  ctx.strokeStyle = material.dark;
  ctx.globalAlpha = .72;
  ctx.lineWidth = outer;
  ctx.shadowColor = 'rgba(55,29,2,.45)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  pathForSamples(samples, 0, end);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#08a6da';
  ctx.lineWidth = inner;
  ctx.stroke();
  pathForSamples(samples, 0, end);
  ctx.globalAlpha = .34;
  ctx.strokeStyle = '#65e1f3';
  ctx.lineWidth = Math.max(3, inner * .16);
  ctx.stroke();
  ctx.restore();

  // A sparse rim of displaced grains makes the groove feel carved rather than
  // painted, without committing thousands of particles every frame.
  ctx.save();
  const random = seededRandom((index + 1) * 9187 + Math.floor(end / 8));
  ctx.fillStyle = material.light;
  ctx.globalAlpha = .62;
  for (let i = 4; i < end; i += 11) {
    const a = toScreen(samples[Math.max(0, i - 2)]);
    const b = toScreen(samples[Math.min(samples.length - 1, i + 2)]);
    const p = toScreen(samples[i]);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const side = random() > .5 ? 1 : -1;
    const offset = outer * (.42 + random() * .12) * side;
    ctx.beginPath();
    ctx.arc(p.x + nx * offset, p.y + ny * offset, 1 + random() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawGuides() {
  const guideAlpha = Math.max(.2, .62 - state.round * .075);
  const m = canvasMetrics();
  for (let i = state.stroke; i < state.samples.length; i++) {
    const samples = state.samples[i];
    const start = i === state.stroke ? state.progress[i] || 0 : 0;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.setLineDash([1, Math.max(14, 22 * m.scale)]);
    ctx.lineWidth = Math.max(10, 14 * m.scale);
    ctx.strokeStyle = MATERIALS[state.material].dark;
    ctx.globalAlpha = guideAlpha * (i === state.stroke ? 1 : .65);
    pathForSamples(samples, start, samples.length - 1);
    ctx.stroke();
    ctx.restore();
  }
  drawStartAndArrow();
}

function drawStartAndArrow() {
  const samples = state.samples[state.stroke];
  if (!samples) return;
  const index = Math.min(state.progress[state.stroke] || 0, samples.length - 1);
  const point = toScreen(samples[index]);
  const next = toScreen(samples[Math.min(samples.length - 1, index + 12)]);
  const angle = Math.atan2(next.y - point.y, next.x - point.x);
  ctx.save();
  ctx.fillStyle = '#ff7414';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(point.x, point.y, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const ax = point.x + Math.cos(angle) * 58;
  const ay = point.y + Math.sin(angle) * 58;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(point.x + Math.cos(angle) * 27, point.y + Math.sin(angle) * 27);
  ctx.lineTo(ax, ay);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(ax + Math.cos(angle) * 7, ay + Math.sin(angle) * 7);
  ctx.lineTo(ax + Math.cos(angle + 2.45) * 18, ay + Math.sin(angle + 2.45) * 18);
  ctx.lineTo(ax + Math.cos(angle - 2.45) * 18, ay + Math.sin(angle - 2.45) * 18);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function pointerDown(event) {
  if (!state.awaitingInput || state.success || event.isPrimary === false) return;
  event.preventDefault();
  unlockAudio();
  const point = fromEvent(event);
  const expected = currentExpectedPoint();
  const tolerance = Math.max(48, Math.min(78, Math.min(els.canvas.clientWidth, els.canvas.clientHeight) * .1));
  if (!expected || Math.hypot(point.x - expected.x, point.y - expected.y) > tolerance * 1.15) {
    nudge('start-dot', 'Start at the orange dot.');
    return;
  }
  state.activePointer = event.pointerId;
  els.canvas.setPointerCapture?.(event.pointerId);
  applyPointer(point);
}

function pointerMove(event) {
  if (event.pointerId !== state.activePointer || event.isPrimary === false) return;
  event.preventDefault();
  applyPointer(fromEvent(event));
}

function pointerUp(event) {
  if (event.pointerId !== state.activePointer) return;
  event.preventDefault();
  applyPointer(fromEvent(event));
  state.activePointer = null;
  els.canvas.releasePointerCapture?.(event.pointerId);
}

function currentExpectedPoint() {
  const samples = state.samples[state.stroke];
  if (!samples) return null;
  return toScreen(samples[Math.min(samples.length - 1, state.progress[state.stroke] || 0)]);
}

function applyPointer(point) {
  const samples = state.samples[state.stroke];
  if (!samples) return false;
  const current = state.progress[state.stroke] || 0;
  const start = Math.max(0, current - 5);
  const end = Math.min(samples.length - 1, current + 62);
  let best = current;
  let distance = Infinity;
  for (let i = start; i <= end; i++) {
    const p = toScreen(samples[i]);
    const d = Math.hypot(point.x - p.x, point.y - p.y);
    if (d < distance) { distance = d; best = i; }
  }
  const tolerance = Math.max(45, Math.min(72, Math.min(els.canvas.clientWidth, els.canvas.clientHeight) * .09));
  if (distance > tolerance) {
    nudge('stay-near', 'Stay near the dotted path.');
    return false;
  }
  if (best > current) {
    state.progress[state.stroke] = best;
    playTextureSound();
    if (navigator.vibrate && best % 24 < 3) navigator.vibrate(4);
    render();
  }
  if (best >= samples.length - 4) completeStroke();
  return true;
}

function completeStroke() {
  const index = state.stroke;
  state.progress[index] = state.samples[index].length - 1;
  sfx.pop();
  if (index < state.samples.length - 1) {
    state.stroke += 1;
    updateLetterUI();
    render();
    say(['next-stroke'], `Stroke ${state.stroke + 1}. Start at the orange dot.`);
    return;
  }
  state.stroke = state.samples.length;
  state.awaitingInput = false;
  state.activePointer = null;
  window.setTimeout(showSuccess, state.fast ? 10 : 180);
}

function showSuccess() {
  state.success = true;
  updateLetterUI();
  render();
  if (!state.fast) {
    sfx.tada();
    burstConfetti(34);
  }
  say(letterVoice(state.letter, true), `${state.letter.success} ${state.letter.sound} Tap next letter to keep going!`);
}

function resetLetter(withVoice = true) {
  if (state.screen !== 'play') return;
  state.success = false;
  state.awaitingInput = false;
  els.success.classList.add('hidden');
  els.tray.classList.add('smoothing');
  if (!state.fast) sfx.whoosh();
  const finishReset = () => {
    els.tray.classList.remove('smoothing');
    state.stroke = 0;
    state.progress = state.letter.strokes.map(() => 0);
    state.awaitingInput = true;
    updateLetterUI();
    render();
    if (withVoice) say(['smooth-ready'], `Smooth and ready. Trace the letter ${state.letter.id}.`);
  };
  if (state.fast) finishReset();
  else window.setTimeout(finishReset, 720);
}

function nextLetter() {
  if (state.screen !== 'play') return;
  if (state.round >= state.order.length - 1) {
    showFinish();
    return;
  }
  els.success.classList.add('hidden');
  els.tray.classList.add('smoothing');
  if (!state.fast) sfx.whoosh();
  const finishAdvance = () => {
    els.tray.classList.remove('smoothing');
    state.round += 1;
    state.letter = state.order[state.round];
    state.stroke = 0;
    state.progress = state.letter.strokes.map(() => 0);
    state.success = false;
    state.awaitingInput = true;
    buildSamples();
    updateLetterUI();
    render();
    say(['next-letter', 'follow-arrows'], `Next is ${state.letter.id}. Follow the arrows.`);
  };
  if (state.fast) finishAdvance();
  else window.setTimeout(finishAdvance, 720);
}

function showFinish() {
  state.success = false;
  showScreen('finish');
  if (!state.fast) {
    burstConfetti(60);
    sfx.tada();
  }
  say(['finish'], 'Terrific tracing! You made all twenty-six letters.');
}

function nudge(key, message) {
  clearTimeout(nudgeTimer);
  els.tray.classList.remove('nudge');
  void els.tray.offsetWidth;
  els.tray.classList.add('nudge');
  nudgeTimer = setTimeout(() => els.tray.classList.remove('nudge'), 400);
  if (!state.muted) say([key], message);
}

function replay() {
  if (state.screen === 'welcome') say(['welcome'], 'Welcome to Sand Tray Letters. Trace, learn, and play!');
  else if (state.screen === 'materials') say(['choose-short'], 'Choose golden sand, white salt, or soft flour.');
  else if (state.screen === 'play' && state.success) say(letterVoice(state.letter, false), `${state.letter.success} ${state.letter.sound}`);
  else if (state.screen === 'play') say(['trace-this', 'follow-arrows'], `Trace the letter ${state.letter.id}. Follow the arrows.`);
  else say(['finish'], 'Terrific tracing! You made all twenty-six letters.');
}

function playTextureSound() {
  const now = performance.now();
  if (state.muted || now - lastTextureSound < 62) return;
  lastTextureSound = now;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioContext ||= AC ? new AC() : null;
    if (!audioContext) return;
    if (audioContext.state === 'suspended') audioContext.resume();
    const material = MATERIALS[state.material];
    const length = Math.floor(audioContext.sampleRate * .075);
    const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();
    filter.type = state.material === 'salt' ? 'highpass' : 'bandpass';
    filter.frequency.value = material.filter;
    filter.Q.value = state.material === 'flour' ? .55 : 1.1;
    gain.gain.value = material.soundGain;
    source.buffer = buffer;
    source.connect(filter); filter.connect(gain); gain.connect(audioContext.destination);
    source.start();
  } catch { /* sensory sound is optional */ }
}

function burstConfetti(count) {
  if (state.reducedMotion) return;
  clearTimeout(confettiTimer);
  const colors = ['#ff7613','#ffd01a','#1bbbd5','#f14e8a','#6bcf43','#8d5bd4'];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = `${10 + state.rng() * 80}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.setProperty('--dur', `${1.6 + state.rng() * 1.5}s`);
    piece.style.setProperty('--drift', `${-80 + state.rng() * 160}px`);
    piece.style.animationDelay = `${state.rng() * .35}s`;
    els.confetti.appendChild(piece);
  }
  confettiTimer = setTimeout(() => els.confetti.replaceChildren(), 3600);
}

function mix(a, b, t) {
  const pa = hex(a), pb = hex(b);
  const value = pa.map((v,i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${value.join(',')})`;
}
function hex(value) {
  const clean = value.replace('#','');
  return [0,2,4].map((i) => parseInt(clean.slice(i,i+2),16));
}
function hashString(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function seededRandom(seed) {
  let value = seed >>> 0;
  return () => { value += 0x6D2B79F5; let t=value; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; };
}
function shuffled(items, random) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Interaction wiring --------------------------------------------------------
onTap(els.start, () => { unlockAudio(); sfx.tick(); showMaterials(); });
onTap(els.trace, () => { unlockAudio(); sfx.tick(); beginTracing(true); });
onTap(els.next, () => nextLetter());
onTap(els.playAgain, () => { state.round = 0; state.order = []; showMaterials(); });
onTap(els.reset, () => resetLetter());
onTap(els.swatch, () => showMaterials());

for (const card of els.list.querySelectorAll('.material-card')) {
  onTap(card, () => selectMaterial(card.dataset.material));
}
for (const button of document.querySelectorAll('[data-action="welcome"]')) onTap(button, () => showWelcome(false));
for (const button of document.querySelectorAll('[data-action="materials"]')) onTap(button, () => showMaterials());
for (const button of document.querySelectorAll('[data-action="replay"]')) onTap(button, replay);

els.canvas.addEventListener('pointerdown', pointerDown, { passive:false });
els.canvas.addEventListener('pointermove', pointerMove, { passive:false });
els.canvas.addEventListener('pointerup', pointerUp, { passive:false });
els.canvas.addEventListener('pointercancel', pointerUp, { passive:false });
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => resizeCanvas());
});
window.addEventListener('pointerdown', unlockAudio, { once:true });
window.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('gesturestart', (event) => event.preventDefault());

// QLOBE_DEBUG v1 ------------------------------------------------------------
async function debugTraceLetter() {
  if (state.screen === 'welcome') showMaterials();
  if (state.screen === 'materials') beginTracing(state.round === 0);
  if (state.screen !== 'play') return;
  if (state.success) { nextLetter(); await wait(state.fast ? 25 : 760); return; }
  for (let stroke = state.stroke; stroke < state.samples.length; stroke++) {
    state.stroke = stroke;
    const samples = state.samples[stroke];
    for (let i = state.progress[stroke] || 0; i < samples.length; i += 8) {
      state.progress[stroke] = Math.min(i, samples.length - 1);
    }
    state.progress[stroke] = samples.length - 1;
  }
  state.stroke = state.samples.length;
  state.awaitingInput = false;
  showSuccess();
  if (state.fast) {
    nextLetter();
    return;
  }
  await wait(state.fast ? 15 : 240);
  nextLetter();
  await wait(state.fast ? 25 : 760);
}

function getTargets() {
  const rect = (node,id,role='neutral') => {
    const r=node.getBoundingClientRect();
    return {id,role,rect:{x:r.x,y:r.y,w:r.width,h:r.height}};
  };
  if (state.screen === 'welcome') return [rect(els.start,'start','correct')];
  if (state.screen === 'materials') return [
    ...[...els.list.querySelectorAll('.material-card')].map((node)=>rect(node,`material:${node.dataset.material}`)),
    rect(els.trace,'trace','correct'),
  ];
  if (state.screen === 'play' && state.success) return [rect(els.next,'next','correct')];
  if (state.screen === 'play') return [rect(els.canvas,'tray','correct'),rect(els.reset,'reset')];
  return [rect(els.playAgain,'play-again','correct')];
}

window.QLOBE_DEBUG = {
  version:1,
  gameId:'sand-tray-letters',
  engine:'custom-sand-canvas',
  ready:Promise.resolve(),
  listModes:()=>[{id:'letters',title:'Sand Tray Letters'}],
  startMode:()=>{state.round=0;state.order=[];showMaterials();},
  getState:()=>({
    screen:state.screen,
    mode:state.screen==='welcome'?null:'letters',
    phase:state.screen==='play'?(state.success?'success':'trace'):state.screen,
    material:state.material,
    letter:state.screen==='play'?state.letter.id:null,
    round:state.round,
    roundsTotal:state.order.length || LETTERS.length,
    stroke:state.stroke,
    strokesTotal:state.screen==='play'?state.letter.strokes.length:0,
    awaitingInput:state.awaitingInput,
  }),
  getTargets,
  getOrder:()=>state.order.map((letter)=>letter.id),
  tap:(id)=>{
    if(id==='start')showMaterials();
    else if(id==='trace')beginTracing(true);
    else if(id==='next')nextLetter();
    else if(id==='reset')resetLetter(false);
    else if(id==='play-again')showMaterials();
    else if(id.startsWith('material:'))selectMaterial(id.slice(9),false);
    else return {accepted:false};
    return {accepted:true};
  },
  winRound:debugTraceLetter,
  // Viewport (screen) coordinates, matching getTargets() and the QLOBE_DEBUG v1
  // contract, so pointer-driven QA can trace along them. toScreen() alone is
  // canvas-local; add the canvas offset on the page.
  tracePoints:()=>{
    const r=els.canvas.getBoundingClientRect();
    return state.samples[state.stroke]?.map((s)=>{const p=toScreen(s);return{x:p.x+r.left,y:p.y+r.top};})||[];
  },
  mute:()=>{state.muted=true;voice.stop();speech.stop();},
  seed:(n)=>{state.rng=seededRandom(Number(n)||1);},
  fastTimers:()=>{state.fast=true;},
};

function wait(ms){return new Promise((resolve)=>setTimeout(resolve,ms));}

showWelcome(true);
