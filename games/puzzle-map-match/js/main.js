import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as music from '../../../shared/js/music.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { onTap } from '../../../shared/js/tap.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';
import { createTimers } from '../../../shared/js/timers.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';
import { cutImage } from '../../../shared/js/puzzle-cutter.js';

const mount = document.getElementById('game');
const timers = createTimers();
const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const VALID_PUZZLE_IDS = new Set(config.puzzles.map((puzzle) => puzzle.id));

let lineTable = {};
let activeRuntime = null;
let drag = null;
let flowToken = 0;
let hintTimer = null;
let hintHideTimer = null;
let interactionDisposers = [];
let welcomeSpoken = false;
let tapHelpSpoken = false;
let dragHelpSpoken = false;
let audioActivated = false;
let musicStarted = false;
let voiceDuckToken = 0;

const artFailures = [];
const completedPuzzles = loadCompletedPuzzles();
const state = {
  screen: 'boot',
  phase: 'boot',
  puzzle: null,
  placed: [],
  step: 0,
  selected: false,
  busy: true,
  muted: false,
  reducedMotion: reducedQuery.matches,
  lastVoiceKey: 'welcome',
  hintVisible: false,
  manifestMatches: false,
  manifestIssues: [],
};

const musicReady = music.init(config.music.manifest);
const ready = boot().catch((error) => {
  console.error(error);
  renderFatal(error);
  throw error;
});
const disposeKiosk = installKioskGuards();
const disposeUnlock = installUnlockOnGesture({
  extra: [music.unlock],
  onFirst: () => {
    audioActivated = true;
    startMusic();
  },
});

const onReducedMotion = (event) => {
  state.reducedMotion = event.matches;
};
reducedQuery.addEventListener?.('change', onReducedMotion);

const cancelDragForLayout = () => {
  drag?.cancel();
  stopHint();
};
window.addEventListener('resize', cancelDragForLayout);
window.addEventListener('orientationchange', cancelDragForLayout);

async function boot() {
  const response = await fetch(config.audio.lines);
  if (!response.ok) throw new Error(`Puzzle Explorer voice lines failed: ${response.status}`);
  lineTable = await response.json();

  const artUrls = [
    ...Object.values(config.assets).filter((value) => /\.(?:webp|png|jpe?g)$/i.test(value)),
    ...config.puzzles.map((puzzle) => puzzle.source),
  ];
  await Promise.all([
    voice.init(config.audio.manifest, config.audio.lines, lineTable),
    preloadImages(artUrls),
    musicReady,
  ]);
  await auditArt(artUrls);
  renderChoose();
  return true;
}

function auditArt(urls) {
  return Promise.all([...new Set(urls)].map((url) => new Promise((resolve) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = () => {
      artFailures.push({ url, reason: 'failed-to-load' });
      console.warn(`Puzzle Explorer art failed: ${url}`);
      resolve();
    };
    image.src = url;
  })));
}

function startMusic() {
  if (musicStarted) return;
  musicStarted = true;
  Promise.resolve(musicReady).then(() => {
    try {
      music.playSong(config.music.song, config.music.band);
      music.duck(0.22, 80);
      music.setMuted(state.muted);
    } catch { /* music is optional when WebAudio is unavailable */ }
  });
}

function speak(key, fallback = lineTable[key]) {
  if (!key) return Promise.resolve();
  state.lastVoiceKey = key;
  const mine = ++voiceDuckToken;
  if (audioActivated && !state.muted) music.duck(0.055, 90);
  return Promise.resolve(voice.say(key, fallback || '')).finally(() => {
    if (mine === voiceDuckToken && audioActivated && !state.muted) music.duck(0.22, 300);
  });
}

async function speakSequence(keys, token = flowToken) {
  for (const key of keys.filter(Boolean)) {
    if (token !== flowToken) return false;
    await speak(key);
  }
  return token === flowToken;
}

function loadCompletedPuzzles() {
  try {
    const saved = JSON.parse(localStorage.getItem(config.storageKey));
    if (!saved || saved.version !== 2 || !Array.isArray(saved.completedPuzzles)) return new Set();
    return new Set(saved.completedPuzzles.filter((id) => VALID_PUZZLE_IDS.has(id)));
  } catch {
    return new Set();
  }
}

function saveCompletedPuzzles() {
  try {
    localStorage.setItem(config.storageKey, JSON.stringify({
      version: 2,
      completedPuzzles: [...completedPuzzles].filter((id) => VALID_PUZZLE_IDS.has(id)),
    }));
  } catch { /* private browsing can deny storage */ }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function register(disposer) {
  if (typeof disposer === 'function') interactionDisposers.push(disposer);
  return disposer;
}

function wireTap(element, action, { quiet = false } = {}) {
  if (!element) return;
  register(onTap(element, action, {
    feedback: () => {
      voice.unlock();
      music.unlock();
      sfx.unlock();
      if (!quiet && !state.muted) sfx.tick();
    },
  }));
}

function resetInteractions({ stopVoice = true } = {}) {
  drag?.detach();
  drag = null;
  for (const dispose of interactionDisposers.splice(0)) {
    try { dispose(); } catch { /* stale elements are already gone */ }
  }
  timers.clearAll();
  hintTimer = null;
  hintHideTimer = null;
  state.hintVisible = false;
  if (stopVoice) voice.stop();
  document.querySelectorAll('[data-qk-drag-ghost], .piece-drag-ghost').forEach((node) => node.remove());
}

function img(src, alt = '', className = '') {
  return `<img${className ? ` class="${className}"` : ''} src="${src}" alt="${escapeHtml(alt)}" draggable="false">`;
}

function puzzleById(id) {
  return config.puzzles.find((puzzle) => puzzle.id === id) || null;
}

function currentPieceIndex() {
  return state.puzzle?.order?.[state.step] ?? null;
}

function currentPiece() {
  const index = currentPieceIndex();
  return index == null ? null : activeRuntime?.cut?.pieces?.[index] || null;
}

function announce(text) {
  const live = mount.querySelector('[data-live]');
  if (live) live.textContent = text;
}

function hudButton(kind, asset, label) {
  return `<button type="button" class="hud-control hud-${kind}" data-target="${kind}" data-role="navigation" aria-label="${escapeHtml(label)}">${img(asset, '')}</button>`;
}

function renderChoose({ announceChoice = false } = {}) {
  ++flowToken;
  resetInteractions();
  activeRuntime = null;
  Object.assign(state, {
    screen: 'choose',
    phase: 'choose',
    puzzle: null,
    placed: [],
    step: 0,
    selected: false,
    busy: false,
    hintVisible: false,
    lastVoiceKey: 'choose',
    manifestMatches: false,
    manifestIssues: [],
  });

  const cards = config.puzzles.map((puzzle) => {
    const complete = completedPuzzles.has(puzzle.id);
    return `
      <button type="button" class="puzzle-card${complete ? ' is-complete' : ''}" data-puzzle="${puzzle.id}" data-target="puzzle-${puzzle.id}" data-role="choice" aria-label="${escapeHtml(puzzle.title)} puzzle${complete ? ', completed' : ''}">
        <span class="puzzle-card-picture">${img(puzzle.source, `${puzzle.title} papercraft scene`)}</span>
        <span class="puzzle-card-label">${escapeHtml(puzzle.shortTitle)}</span>
        ${complete ? '<span class="puzzle-card-check" aria-hidden="true">✓</span>' : ''}
      </button>`;
  }).join('');

  mount.innerHTML = `
    <section class="screen choose-screen" data-screen="choose" style="background-image:url('${config.assets.playTexture}')">
      <a class="choose-home" href="../../" data-target="home" data-role="navigation" aria-label="Back to all QLOBE Kids games">${img(config.assets.home, '')}</a>
      ${img(config.assets.title, config.title, 'choose-title')}
      <div class="choose-banner" aria-label="Choose a puzzle">
        ${img(config.assets.promptRibbon, '', 'choose-banner-art')}
        <h1>Choose a puzzle</h1>
      </div>
      <div class="puzzle-grid" role="list" aria-label="Three six-piece puzzles">${cards}</div>
      <p class="choose-note">Six chunky pieces in every picture</p>
      <div class="sr-live" data-live aria-live="polite"></div>
    </section>`;

  mount.querySelectorAll('[data-puzzle]').forEach((button) => {
    wireTap(button, () => { void startPuzzle(button.dataset.puzzle); });
  });
  if (announceChoice) void speak('choose');
}

function renderLoading(puzzle) {
  resetInteractions();
  mount.innerHTML = `
    <section class="screen loading-screen" data-screen="loading" style="background-image:url('${config.assets.playTexture}')">
      ${img(config.assets.title, config.title, 'loading-title')}
      <div class="loading-card">
        ${img(puzzle.source, '', 'loading-picture')}
        <p>Cutting six pieces…</p>
      </div>
      <div class="sr-live" data-live aria-live="polite">Loading ${escapeHtml(puzzle.title)}.</div>
    </section>`;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = async () => {
      try { await image.decode?.(); } catch { /* onload is sufficient */ }
      resolve(image);
    };
    image.onerror = () => reject(new Error(`Puzzle image failed: ${url}`));
    image.src = url;
  });
}

function compareManifest(cut, manifest, puzzle) {
  const issues = [];
  if (manifest.width !== cut.width || manifest.height !== cut.height) issues.push('dimensions');
  if (manifest.rows !== cut.rows || manifest.cols !== cut.cols) issues.push('grid');
  if (manifest.seedInput !== puzzle.seed || manifest.seed !== cut.seed) issues.push('seed');
  if (!Array.isArray(manifest.pieces) || manifest.pieces.length !== cut.pieces.length) issues.push('piece-count');
  cut.pieces.forEach((piece, index) => {
    const expected = manifest.pieces?.[index];
    if (!expected) return;
    if (piece.index !== expected.index || piece.row !== expected.row || piece.col !== expected.col) issues.push(`identity-${index}`);
    if (piece.path !== expected.path || piece.x !== expected.x || piece.y !== expected.y) issues.push(`geometry-${index}`);
    for (const side of ['top', 'right', 'bottom', 'left']) {
      if (piece.edges[side] !== expected.edges?.[side]) issues.push(`edge-${index}-${side}`);
    }
  });
  return [...new Set(issues)];
}

async function buildRuntime(puzzle) {
  const [sourceImage, manifestResponse] = await Promise.all([
    loadImage(puzzle.source),
    fetch(puzzle.manifest),
  ]);
  if (!manifestResponse.ok) throw new Error(`Puzzle manifest failed: ${manifestResponse.status}`);
  const manifest = await manifestResponse.json();
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = puzzle.width;
  sourceCanvas.height = puzzle.height;
  sourceCanvas.getContext('2d').drawImage(sourceImage, 0, 0, puzzle.width, puzzle.height);
  const cut = cutImage(sourceCanvas, {
    rows: puzzle.rows,
    cols: puzzle.cols,
    seed: puzzle.seed,
  });
  const manifestIssues = compareManifest(cut, manifest, puzzle);
  if (manifestIssues.length) {
    throw new Error(`Puzzle cutter/manifest drift for ${puzzle.id}: ${manifestIssues.join(', ')}`);
  }
  return { puzzle, sourceCanvas, sourceImage, cut, manifest, manifestIssues };
}

async function startPuzzle(id) {
  await ready;
  const puzzle = puzzleById(id);
  if (!puzzle) return false;
  const token = ++flowToken;
  resetInteractions();
  Object.assign(state, {
    screen: 'loading',
    phase: 'loading',
    puzzle,
    placed: [],
    step: 0,
    selected: false,
    busy: true,
    hintVisible: false,
    manifestMatches: false,
    manifestIssues: [],
  });
  renderLoading(puzzle);

  let runtime;
  try {
    runtime = await buildRuntime(puzzle);
  } catch (error) {
    if (token === flowToken) renderFatal(error);
    throw error;
  }
  if (token !== flowToken) return false;

  activeRuntime = runtime;
  Object.assign(state, {
    screen: 'play',
    phase: 'playing',
    busy: false,
    manifestMatches: true,
    manifestIssues: [],
    lastVoiceKey: 'place-piece',
  });
  renderPlay();

  const opening = [];
  if (!welcomeSpoken) {
    welcomeSpoken = true;
    opening.push('welcome');
  }
  opening.push(puzzle.introVoice, 'place-piece');
  void speakSequence(opening, token);
  return true;
}

function boardTargetsHtml(cut) {
  return cut.pieces.map((piece) => {
    const filled = state.placed.includes(piece.index);
    return `<button type="button" class="piece-slot${filled ? ' is-filled' : ''}" style="left:${(piece.cell.x / cut.width) * 100}%;top:${(piece.cell.y / cut.height) * 100}%;width:${(piece.cell.width / cut.width) * 100}%;height:${(piece.cell.height / cut.height) * 100}%" data-slot="piece" data-piece-index="${piece.index}" data-target="slot-${piece.index}" data-role="drop-target" aria-label="${filled ? 'Filled space' : `Puzzle space ${piece.index + 1}`}"></button>`;
  }).join('');
}

function renderPlay({ snappedIndex = null } = {}) {
  resetInteractions();
  const runtime = activeRuntime;
  const puzzle = state.puzzle;
  const piece = currentPiece();
  if (!runtime || !puzzle || !piece) return;

  mount.innerHTML = `
    <section class="screen play-screen" data-screen="play" data-phase="${state.phase}" style="background-image:url('${config.assets.playTexture}')">
      ${hudButton('back', config.assets.back, 'Choose another puzzle')}
      ${hudButton('sound', config.assets.sound, 'Hear the directions again')}
      ${hudButton('hint', config.assets.hint, 'Show where this piece goes')}
      <header class="prompt-shell">
        ${img(config.assets.promptRibbon, '', 'prompt-ribbon-art')}
        <div class="prompt-copy">Place the piece</div>
      </header>
      <div class="piece-progress" aria-label="${state.placed.length} of ${runtime.cut.pieces.length} pieces placed"><strong>${state.placed.length}</strong> of ${runtime.cut.pieces.length}</div>
      <div class="jigsaw-stage">
        <div class="board-frame" aria-label="${escapeHtml(puzzle.title)} puzzle board">
          <div class="puzzle-board" data-board style="--board-ratio:${runtime.cut.width} / ${runtime.cut.height}">
            <div class="board-guide-layer" data-guide-layer aria-hidden="true"></div>
            <div class="board-target-guide" data-target-guide aria-hidden="true"></div>
            <div class="board-piece-layer" data-piece-layer aria-hidden="true"></div>
            <div class="board-slot-layer">${boardTargetsHtml(runtime.cut)}</div>
          </div>
        </div>
        <div class="piece-tray" aria-label="Loose puzzle piece">
          ${img(config.assets.tray, '', 'piece-tray-art')}
          <button type="button" class="loose-piece${state.selected ? ' is-selected' : ''}" data-piece="${piece.index}" data-target="piece-${piece.index}" data-role="draggable" aria-pressed="${state.selected}" aria-label="Piece ${state.step + 1} of ${runtime.cut.pieces.length}. Tap to select, or drag it to its matching space."></button>
          <p class="piece-cue">Tap, then tap its space — or drag</p>
        </div>
      </div>
      ${img(config.assets.handGuide, '', 'hand-guide')}
      <div class="sr-live" data-live aria-live="assertive"></div>
    </section>`;

  paintBoard(snappedIndex);
  paintLoosePiece();
  wirePlayInteractions();
  if (state.phase === 'playing') scheduleHint(config.timing.firstHintMs);
}

function paintBoard(snappedIndex = null) {
  const { cut, sourceCanvas } = activeRuntime;
  const guideLayer = mount.querySelector('[data-guide-layer]');
  const targetLayer = mount.querySelector('[data-target-guide]');
  const pieceLayer = mount.querySelector('[data-piece-layer]');

  const guide = document.createElement('canvas');
  guide.width = cut.width;
  guide.height = cut.height;
  guide.className = 'board-guide-canvas';
  const context = guide.getContext('2d');
  context.fillStyle = '#f8e9c8';
  context.fillRect(0, 0, cut.width, cut.height);
  context.globalAlpha = 0.2;
  context.drawImage(sourceCanvas, 0, 0);
  context.globalAlpha = 1;
  context.strokeStyle = 'rgba(55, 39, 28, 0.58)';
  context.lineWidth = 6;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  for (const path of cut.outlinePaths) context.stroke(new Path2D(path));
  guideLayer.append(guide);

  const target = document.createElement('canvas');
  target.width = cut.width;
  target.height = cut.height;
  target.className = 'target-guide-canvas';
  const targetContext = target.getContext('2d');
  const piece = currentPiece();
  if (piece && !state.placed.includes(piece.index)) {
    const path = new Path2D(piece.path);
    targetContext.fillStyle = 'rgba(255, 225, 89, 0.13)';
    targetContext.fill(path);
    targetContext.strokeStyle = 'rgba(255, 238, 112, 0.48)';
    targetContext.lineWidth = 9;
    targetContext.setLineDash([20, 16]);
    targetContext.stroke(path);
  }
  targetLayer.append(target);

  for (const index of state.placed) {
    const placed = cut.pieces[index];
    const canvas = placed.canvas;
    canvas.className = `placed-piece${index === snappedIndex ? ' is-snapping' : ''}`;
    canvas.style.left = `${(placed.x / cut.width) * 100}%`;
    canvas.style.top = `${(placed.y / cut.height) * 100}%`;
    canvas.style.width = `${(canvas.width / cut.width) * 100}%`;
    pieceLayer.append(canvas);
  }
}

function copyCanvas(source, className = '') {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.className = className;
  canvas.getContext('2d').drawImage(source, 0, 0);
  return canvas;
}

function paintLoosePiece() {
  const holder = mount.querySelector('[data-piece]');
  const piece = currentPiece();
  if (!holder || !piece) return;
  holder.style.setProperty('--piece-ratio', `${piece.canvas.width} / ${piece.canvas.height}`);
  holder.append(copyCanvas(piece.canvas, 'loose-piece-canvas'));
}

function makeDragGhost() {
  const piece = currentPiece();
  const source = mount.querySelector('[data-piece]');
  if (!piece || !source) return null;
  const rect = source.getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = 'piece-drag-ghost';
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.append(copyCanvas(piece.canvas, 'loose-piece-canvas'));
  return ghost;
}

function wirePlayInteractions() {
  const piece = currentPiece();
  const pieceButton = mount.querySelector('[data-piece]');
  if (!piece || !pieceButton) return;

  wireTap(mount.querySelector('[data-target="back"]'), () => renderChoose({ announceChoice: true }));
  wireTap(mount.querySelector('[data-target="sound"]'), repeatCurrentVoice);
  wireTap(mount.querySelector('[data-target="hint"]'), () => showHint({ explicit: true }));
  wireTap(pieceButton, selectCurrentPiece);
  mount.querySelectorAll('[data-piece-index]').forEach((target) => {
    wireTap(target, () => { void onSlotTap(Number(target.dataset.pieceIndex)); }, { quiet: true });
  });

  const onPointerDown = (event) => drag?.begin(event, piece.index);
  pieceButton.addEventListener('pointerdown', onPointerDown);
  register(() => pieceButton.removeEventListener('pointerdown', onPointerDown));

  drag = createDragToSlotDom({
    getPiece: (index) => Number(index) === piece.index ? { el: pieceButton, index: piece.index } : null,
    makeGhost: makeDragGhost,
    ghostHost: document.body,
    root: () => mount.querySelector('[data-board]'),
    slotSelector: '[data-piece-index]',
    slotPad: 10,
    ghostClass: 'piece-drag-ghost',
    preventDefaultOnPress: true,
    canStart: () => state.screen === 'play' && state.phase === 'playing' && !state.busy,
    onGrab: () => {
      stopHint();
      return true;
    },
    onLift: () => {
      state.selected = true;
      pieceButton.classList.add('is-selected');
      pieceButton.setAttribute('aria-pressed', 'true');
      if (!state.muted) sfx.whoosh();
    },
    onDrop: async (_recordPiece, record) => {
      const index = Number(record.slot?.dataset?.pieceIndex);
      await attemptPlacement(Number.isInteger(index) ? index : null, 'drag');
    },
    onCancel: () => {
      state.selected = false;
      pieceButton.classList.remove('is-selected');
      pieceButton.setAttribute('aria-pressed', 'false');
      if (state.phase === 'playing') scheduleHint(config.timing.repeatHintMs);
    },
  });
}

function selectCurrentPiece() {
  if (state.busy || state.phase !== 'playing') return false;
  stopHint();
  state.selected = true;
  const button = mount.querySelector('[data-piece]');
  button?.classList.add('is-selected');
  button?.setAttribute('aria-pressed', 'true');
  announce(`Piece ${state.step + 1} selected. Now choose its matching space.`);
  if (!tapHelpSpoken) {
    tapHelpSpoken = true;
    void speak('tap-help');
  }
  return true;
}

async function onSlotTap(index) {
  if (state.busy || state.phase !== 'playing') return false;
  if (!state.selected) {
    selectCurrentPiece();
    return false;
  }
  return attemptPlacement(index, 'tap');
}

async function attemptPlacement(targetIndex, source = 'debug') {
  const expected = currentPieceIndex();
  if (expected == null || state.screen !== 'play' || state.phase !== 'playing' || state.busy) return false;
  stopHint();

  if (targetIndex !== expected) {
    state.busy = true;
    state.selected = source === 'tap';
    const pieceButton = mount.querySelector('[data-piece]');
    const target = Number.isInteger(targetIndex) ? mount.querySelector(`[data-piece-index="${targetIndex}"]`) : null;
    pieceButton?.classList.add('is-wrong');
    target?.classList.add('is-wrong');
    announce('That piece does not fit there. Try another spot.');
    if (!state.muted) sfx.unpop();
    void speak('nudge');
    timers.after(620, () => {
      if (state.screen !== 'play' || currentPieceIndex() !== expected) return;
      state.busy = false;
      pieceButton?.classList.remove('is-wrong');
      target?.classList.remove('is-wrong');
      pieceButton?.classList.toggle('is-selected', state.selected);
      pieceButton?.setAttribute('aria-pressed', String(state.selected));
      scheduleHint(2400);
    });
    return false;
  }

  const token = ++flowToken;
  state.busy = true;
  state.phase = 'snapping';
  state.selected = false;
  state.placed.push(expected);
  if (!state.muted) {
    sfx.pop();
    sfx.sparkle();
  }
  renderPlay({ snappedIndex: expected });
  announce(`It’s puzzle-tastic! ${state.placed.length} of ${activeRuntime.cut.pieces.length} pieces placed.`);
  void speak('success');

  const voiceHold = (voice.duration('success') || 0) * 1000 + 80;
  timers.after(Math.max(config.timing.snapHoldMs, voiceHold), () => {
    if (token !== flowToken || state.screen !== 'play') return;
    state.step += 1;
    state.busy = false;
    if (state.step >= activeRuntime.cut.pieces.length) {
      renderComplete({ announceCompletion: true });
      return;
    }
    state.phase = 'playing';
    renderPlay();
  });
  return true;
}

function repeatCurrentVoice() {
  const key = state.screen === 'complete'
    ? state.puzzle?.completeVoice
    : state.screen === 'play' ? 'place-piece' : 'choose';
  if (!key) return false;
  void speak(key);
  return true;
}

function scheduleHint(delay) {
  if (state.screen !== 'play' || state.phase !== 'playing' || state.busy) return;
  if (hintTimer) timers.clear(hintTimer);
  hintTimer = timers.after(delay, () => showHint({ explicit: false }));
}

function showHint({ explicit = false } = {}) {
  if (state.screen !== 'play' || state.phase !== 'playing' || state.busy) return false;
  if (hintTimer) timers.clear(hintTimer);
  if (hintHideTimer) timers.clear(hintHideTimer);
  hintTimer = null;
  state.hintVisible = true;
  const piece = mount.querySelector('[data-piece]');
  const target = mount.querySelector(`[data-piece-index="${currentPieceIndex()}"]`);
  const guide = mount.querySelector('.hand-guide');
  const targetCanvas = mount.querySelector('.target-guide-canvas');
  if (!piece || !target || !guide) return false;

  target.classList.add('is-hint');
  targetCanvas?.classList.add('is-hint');
  const pieceRect = piece.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const startX = pieceRect.left + pieceRect.width / 2;
  const startY = pieceRect.top + pieceRect.height / 2;
  const endX = targetRect.left + targetRect.width / 2;
  const endY = targetRect.top + targetRect.height / 2;
  guide.style.left = `${startX}px`;
  guide.style.top = `${startY}px`;
  guide.style.setProperty('--guide-x', `${endX - startX}px`);
  guide.style.setProperty('--guide-y', `${endY - startY}px`);
  guide.classList.remove('is-visible');
  void guide.offsetWidth;
  guide.classList.add('is-visible');

  if (explicit) void speak('hint');
  else if (!dragHelpSpoken) {
    dragHelpSpoken = true;
    void speak('drag-help');
  }
  hintHideTimer = timers.after(config.timing.hintVisibleMs, () => {
    state.hintVisible = false;
    guide.classList.remove('is-visible');
    target.classList.remove('is-hint');
    targetCanvas?.classList.remove('is-hint');
    hintHideTimer = null;
    scheduleHint(config.timing.repeatHintMs);
  });
  return true;
}

function stopHint() {
  if (hintTimer) timers.clear(hintTimer);
  if (hintHideTimer) timers.clear(hintHideTimer);
  hintTimer = null;
  hintHideTimer = null;
  state.hintVisible = false;
  mount.querySelector('.hand-guide')?.classList.remove('is-visible');
  mount.querySelectorAll('.piece-slot.is-hint').forEach((target) => target.classList.remove('is-hint'));
  mount.querySelector('.target-guide-canvas')?.classList.remove('is-hint');
}

function paintSolvedBoard() {
  const layer = mount.querySelector('[data-solved-board]');
  if (!layer || !activeRuntime) return;
  const { cut } = activeRuntime;
  for (const piece of cut.pieces) {
    const canvas = piece.canvas;
    canvas.className = 'solved-piece';
    canvas.style.left = `${(piece.x / cut.width) * 100}%`;
    canvas.style.top = `${(piece.y / cut.height) * 100}%`;
    canvas.style.width = `${(canvas.width / cut.width) * 100}%`;
    layer.append(canvas);
  }
}

function renderComplete({ announceCompletion = false } = {}) {
  ++flowToken;
  resetInteractions();
  const puzzle = state.puzzle;
  if (!puzzle || !activeRuntime) return renderChoose();
  completedPuzzles.add(puzzle.id);
  saveCompletedPuzzles();
  Object.assign(state, {
    screen: 'complete',
    phase: 'complete',
    busy: false,
    selected: false,
    hintVisible: false,
    lastVoiceKey: puzzle.completeVoice,
  });
  const allComplete = config.puzzles.every((entry) => completedPuzzles.has(entry.id));
  const puzzleIndex = config.puzzles.findIndex((entry) => entry.id === puzzle.id);
  const next = config.puzzles[(puzzleIndex + 1) % config.puzzles.length];

  mount.innerHTML = `
    <section class="screen complete-screen" data-screen="complete" style="background-image:url('${config.assets.playTexture}')">
      <a class="choose-home" href="../../" data-target="home" data-role="navigation" aria-label="Back to all QLOBE Kids games">${img(config.assets.home, '')}</a>
      ${hudButton('sound', config.assets.sound, 'Hear the celebration again')}
      <div class="complete-banner">
        ${img(config.assets.promptRibbon, '', 'complete-banner-art')}
        <h1>Puzzle complete!</h1>
      </div>
      <div class="complete-board" style="--board-ratio:${activeRuntime.cut.width} / ${activeRuntime.cut.height}" data-solved-board aria-label="Completed ${escapeHtml(puzzle.title)} puzzle"></div>
      <p class="complete-title">${escapeHtml(puzzle.title)}</p>
      <div class="complete-actions">
        <button type="button" class="paper-action" data-target="again" data-role="choice" aria-label="Build ${escapeHtml(puzzle.title)} again">${img(config.assets.play, '')}<span>Build again</span></button>
        <button type="button" class="paper-action is-primary" data-target="next" data-role="choice" aria-label="Next puzzle, ${escapeHtml(next.title)}">${img(config.assets.play, '')}<span>Next puzzle</span></button>
        <button type="button" class="paper-action" data-target="choose" data-role="navigation" aria-label="Choose a puzzle">${img(config.assets.back, '')}<span>Choose</span></button>
      </div>
      ${allComplete ? '<p class="all-complete">All three puzzles are complete!</p>' : ''}
      ${img(config.assets.confetti, '', 'confetti-layer')}
      <div class="sr-live" data-live aria-live="assertive"></div>
    </section>`;

  paintSolvedBoard();
  wireTap(mount.querySelector('[data-target="sound"]'), repeatCurrentVoice);
  wireTap(mount.querySelector('[data-target="again"]'), () => { void startPuzzle(puzzle.id); });
  wireTap(mount.querySelector('[data-target="next"]'), () => { void startPuzzle(next.id); });
  wireTap(mount.querySelector('[data-target="choose"]'), () => renderChoose({ announceChoice: true }));
  announce(`Puzzle complete! The ${puzzle.title} picture is whole.`);
  if (announceCompletion) {
    const token = flowToken;
    void speakSequence(['puzzle-complete', puzzle.completeVoice, allComplete ? 'all-complete' : 'next-puzzle'], token);
  }
}

function renderFatal(error) {
  ++flowToken;
  resetInteractions();
  Object.assign(state, { screen: 'error', phase: 'error', busy: false });
  mount.innerHTML = `
    <section class="screen error-screen" data-screen="error" style="background-image:url('${config.assets.playTexture}')">
      ${img(config.assets.title, config.title, 'loading-title')}
      <div class="error-card">
        <h1>The puzzle pieces need a quick fix.</h1>
        <p>${escapeHtml(error?.message || 'Puzzle Explorer could not start.')}</p>
        <button type="button" class="paper-action" data-target="retry" data-role="choice">Try again</button>
      </div>
      <div class="sr-live" data-live aria-live="assertive">Puzzle Explorer could not start.</div>
    </section>`;
  wireTap(mount.querySelector('[data-target="retry"]'), () => window.location.reload());
}

function setMuted(on = true) {
  state.muted = Boolean(on);
  sfx.setMuted(state.muted);
  voice.setMuted(state.muted);
  music.setMuted(state.muted);
  return state.muted;
}

function tapTarget(id) {
  const target = [...mount.querySelectorAll('[data-target]')]
    .find((node) => node.dataset.target === id && !node.hidden && !node.disabled);
  if (!target) return false;
  target.click();
  return true;
}

function debugState() {
  return {
    screen: state.screen,
    phase: state.phase,
    puzzle: state.puzzle?.id || null,
    round: state.step,
    step: state.step,
    totalPieces: activeRuntime?.cut?.pieces?.length || 0,
    currentPiece: currentPieceIndex(),
    expectedSlot: currentPieceIndex(),
    placed: [...state.placed],
    selected: state.selected,
    busy: state.busy,
    muted: state.muted,
    reducedMotion: state.reducedMotion,
    hintVisible: state.hintVisible,
    activeDrag: Boolean(drag?.active),
    completedPuzzles: [...completedPuzzles],
    manifestMatches: state.manifestMatches,
    manifestIssues: [...state.manifestIssues],
    geometry: activeRuntime ? {
      width: activeRuntime.cut.width,
      height: activeRuntime.cut.height,
      rows: activeRuntime.cut.rows,
      cols: activeRuntime.cut.cols,
      seed: activeRuntime.cut.seed,
    } : null,
    artFailures: artFailures.map((entry) => ({ ...entry })),
    timers: timers.size(),
    music: music.stats(),
  };
}

async function debugPlace(pieceIndex = currentPieceIndex(), slotIndex = currentPieceIndex()) {
  await ready;
  if (state.screen !== 'play' || Number(pieceIndex) !== currentPieceIndex()) return false;
  state.selected = true;
  return attemptPlacement(Number(slotIndex), 'debug');
}

async function debugCompletePuzzle() {
  await ready;
  if (!state.puzzle || state.screen !== 'play' || !activeRuntime) return false;
  state.placed = activeRuntime.cut.pieces.map((piece) => piece.index);
  state.step = activeRuntime.cut.pieces.length;
  renderComplete({ announceCompletion: false });
  return true;
}

async function verifyAssembly() {
  await ready;
  if (!activeRuntime) return { match: false, reason: 'no-active-puzzle' };
  const { cut, puzzle } = activeRuntime;
  const actual = document.createElement('canvas');
  actual.width = cut.width;
  actual.height = cut.height;
  const context = actual.getContext('2d');
  for (const piece of cut.pieces) context.drawImage(piece.canvas, piece.x, piece.y);
  const expected = await loadImage(puzzle.assembledQa);
  const expectedCanvas = document.createElement('canvas');
  expectedCanvas.width = cut.width;
  expectedCanvas.height = cut.height;
  expectedCanvas.getContext('2d').drawImage(expected, 0, 0, cut.width, cut.height);
  const a = context.getImageData(0, 0, cut.width, cut.height).data;
  const b = expectedCanvas.getContext('2d').getImageData(0, 0, cut.width, cut.height).data;
  let mismatchedPixels = 0;
  let maxDelta = 0;
  for (let offset = 0; offset < a.length; offset += 4) {
    let pixelDelta = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(a[offset + channel] - b[offset + channel]);
      pixelDelta = Math.max(pixelDelta, delta);
      maxDelta = Math.max(maxDelta, delta);
    }
    if (pixelDelta > 0) mismatchedPixels += 1;
  }
  return {
    match: mismatchedPixels === 0,
    width: cut.width,
    height: cut.height,
    pieceCount: cut.pieces.length,
    mismatchedPixels,
    maxDelta,
  };
}

installDebug({
  gameId: config.id,
  engine: config.engine,
  ready,
  listModes: () => config.puzzles.map(({ id, title, skill }) => ({ id, title, skill })),
  startMode: startPuzzle,
  startPuzzle,
  getState: debugState,
  getTargets: () => collectTargets(mount),
  tap: async (id) => { await ready; return tapTarget(id); },
  winRound: async () => { await ready; return attemptPlacement(currentPieceIndex(), 'debug'); },
  place: debugPlace,
  completeMode: debugCompletePuzzle,
  completePuzzle: debugCompletePuzzle,
  showHint: () => showHint({ explicit: true }),
  verifyAssembly,
  getAudioLog: voice.getAudioLog,
  clearAudioLog: voice.clearAudioLog,
  mute: setMuted,
  timers,
  sfx,
  voice,
  home: () => { window.location.href = '../../'; },
});

window.addEventListener('beforeunload', () => {
  ++flowToken;
  resetInteractions();
  disposeUnlock();
  disposeKiosk();
  reducedQuery.removeEventListener?.('change', onReducedMotion);
  window.removeEventListener('resize', cancelDragForLayout);
  window.removeEventListener('orientationchange', cancelDragForLayout);
  music.stopSong?.();
});
