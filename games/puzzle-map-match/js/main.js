import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as bgm from '../../../shared/js/bgm.js';
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
const CELEBRATION_PHRASE_KEYS = [
  'celebrate-01', 'celebrate-02', 'celebrate-03', 'celebrate-04',
  'celebrate-05', 'celebrate-06', 'celebrate-07', 'celebrate-08',
  'celebrate-09', 'celebrate-10', 'celebrate-11', 'celebrate-12',
];
const FINAL_CELEBRATION_KEY = 'celebrate-complete';

let lineTable = {};
let activeRuntime = null;
let drag = null;
let flowToken = 0;
let hintTimer = null;
let hintHideTimer = null;
let worldFactTimer = null;
let interactionDisposers = [];
let welcomeSpoken = false;
let tapHelpSpoken = false;
let dragHelpSpoken = false;
let audioActivated = false;
let voiceDuckToken = 0;
let celebrationQueue = Promise.resolve();
let celebrationGeneration = 0;
let celebrationActive = false;

const artFailures = [];
const completedPuzzles = loadCompletedPuzzles();
const state = {
  screen: 'boot',
  phase: 'boot',
  puzzle: null,
  placed: [],
  step: 0,
  selected: false,
  selectedPiece: null,
  busy: true,
  muted: false,
  reducedMotion: reducedQuery.matches,
  lastVoiceKey: 'welcome',
  hintVisible: false,
  manifestMatches: false,
  manifestIssues: [],
  factIndex: 0,
  loosePositions: {},
};

bgm.preload(config.music.themes[config.continents[0]?.id]);
const ready = boot().catch((error) => {
  console.error(error);
  renderFatal(error);
  throw error;
});
const disposeKiosk = installKioskGuards();
const disposeUnlock = installUnlockOnGesture({
  extra: [bgm.unlock],
  onFirst: () => { audioActivated = true; },
});

const onReducedMotion = (event) => {
  state.reducedMotion = event.matches;
};
reducedQuery.addEventListener?.('change', onReducedMotion);

const cancelDragForLayout = () => {
  drag?.cancel();
  stopHint();
  if (state.screen === 'play') requestAnimationFrame(() => paintLoosePieces());
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

function playContinentTheme(continentId) {
  const url = continentId ? config.music.themes[continentId] : null;
  try {
    if (url) {
      bgm.play(url, { key: continentId });
      bgm.duck(config.music.restingDuck, 80);
      bgm.setMuted(state.muted);
    } else {
      bgm.stop();
    }
  } catch { /* music is optional when playback is unavailable */ }
}

function speakNow(key, fallback = lineTable[key]) {
  if (!key) return Promise.resolve();
  state.lastVoiceKey = key;
  const mine = ++voiceDuckToken;
  if (audioActivated && !state.muted) bgm.duck(config.music.speakingDuck, 90);
  return Promise.resolve(voice.say(key, fallback || '')).finally(() => {
    if (mine === voiceDuckToken && audioActivated && !state.muted) bgm.duck(config.music.restingDuck, 300);
  });
}

function speak(key, fallback = lineTable[key]) {
  if (celebrationActive) return Promise.resolve();
  return speakNow(key, fallback);
}

function cancelCelebrationVoice() {
  celebrationGeneration += 1;
  celebrationQueue = Promise.resolve();
  celebrationActive = false;
}

function queueCelebration(key) {
  const generation = celebrationGeneration;
  celebrationQueue = celebrationQueue.catch(() => {}).then(async () => {
    if (generation !== celebrationGeneration) return;
    celebrationActive = true;
    try {
      await speakNow(key);
    } finally {
      if (generation === celebrationGeneration) celebrationActive = false;
    }
  });
  return celebrationQueue;
}

function randomCelebrationKey() {
  return CELEBRATION_PHRASE_KEYS[Math.floor(Math.random() * CELEBRATION_PHRASE_KEYS.length)];
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
      bgm.unlock();
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
  worldFactTimer = null;
  state.hintVisible = false;
  if (stopVoice) {
    cancelCelebrationVoice();
    voice.stop();
  }
  document.querySelectorAll('[data-qk-drag-ghost], .piece-drag-ghost').forEach((node) => node.remove());
}

function img(src, alt = '', className = '') {
  return `<img${className ? ` class="${className}"` : ''} src="${src}" alt="${escapeHtml(alt)}" draggable="false">`;
}

function puzzleById(id) {
  return config.puzzles.find((puzzle) => puzzle.id === id) || null;
}

function continentById(id) {
  return config.continents.find((continent) => continent.id === id) || null;
}

function puzzlesForContinent(id) {
  return config.puzzles.filter((puzzle) => puzzle.continent === id);
}

function selectedPieceIndex() {
  const index = state.selectedPiece;
  return Number.isInteger(index) && !state.placed.includes(index) ? index : null;
}

function hintPieceIndex() {
  const selected = selectedPieceIndex();
  if (selected != null) return selected;
  return activeRuntime?.cut?.pieces?.find((piece) => !state.placed.includes(piece.index))?.index ?? null;
}

function pieceByIndex(index) {
  const pieceIndex = Number(index);
  return Number.isInteger(pieceIndex) ? activeRuntime?.cut?.pieces?.[pieceIndex] || null : null;
}

function syncPieceSelection() {
  const selected = selectedPieceIndex();
  mount.querySelectorAll('.loose-piece').forEach((button) => {
    const isSelected = selected != null && Number(button.dataset.pieceIndex) === selected;
    button.classList.toggle('is-selected', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
  });
}

function announce(text) {
  const live = mount.querySelector('[data-live]');
  if (live) live.textContent = text;
}

function hudButton(kind, asset, label) {
  return `<button type="button" class="hud-control hud-${kind}" data-target="${kind}" data-role="navigation" aria-label="${escapeHtml(label)}">${img(asset, '')}</button>`;
}

function renderChoose({ continentId = null, announceChoice = false } = {}) {
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
    selectedPiece: null,
    busy: false,
    hintVisible: false,
    lastVoiceKey: 'choose',
    manifestMatches: false,
    manifestIssues: [],
    factIndex: 0,
    loosePositions: {},
  });

  const continent = continentById(continentId);
  playContinentTheme(continent?.id ?? null);
  const cards = continent
    ? puzzlesForContinent(continent.id).map((puzzle) => {
      const complete = completedPuzzles.has(puzzle.id);
      return `
        <button type="button" class="puzzle-card puzzle-card-scene${complete ? ' is-complete' : ''}" data-puzzle="${puzzle.id}" data-target="puzzle-${puzzle.id}" data-role="choice" aria-label="${escapeHtml(puzzle.title)} puzzle${complete ? ', completed' : ''}">
          <span class="puzzle-card-picture">${img(puzzle.source, `${puzzle.title} papercraft scene`)}</span>
          <span class="puzzle-card-label">${escapeHtml(puzzle.shortTitle)}</span>
          <span class="puzzle-card-region">${escapeHtml(puzzle.region)} · ${escapeHtml(puzzle.difficulty)}</span>
          <span class="puzzle-card-fact"><b>Animal:</b> ${escapeHtml(puzzle.facts.animal)}</span>
          ${complete ? '<span class="puzzle-card-check" aria-hidden="true">✓</span>' : ''}
        </button>`;
    }).join('')
    : config.continents.map((entry) => {
      const continentPuzzles = puzzlesForContinent(entry.id);
      const complete = continentPuzzles.filter((puzzle) => completedPuzzles.has(puzzle.id)).length;
      const cover = continentPuzzles[0];
      return `
        <button type="button" class="puzzle-card continent-card${complete === continentPuzzles.length ? ' is-complete' : ''}" data-continent="${entry.id}" data-target="continent-${entry.id}" data-role="choice" aria-label="Explore ${escapeHtml(entry.name)}">
          <span class="puzzle-card-picture">${img(cover.source, `${entry.name} papercraft scene`)}</span>
          <span class="puzzle-card-label">${escapeHtml(entry.name)}</span>
          <span class="continent-card-description">${escapeHtml(entry.description)}</span>
          <span class="continent-card-progress">${complete} of ${continentPuzzles.length} explored</span>
          ${complete === continentPuzzles.length ? '<span class="puzzle-card-check" aria-hidden="true">✓</span>' : ''}
        </button>`;
    }).join('');

  const title = continent ? `Explore ${continent.name}` : 'Explore the world';
  const cardLabel = continent ? `Three puzzles in ${continent.name}` : 'Seven continents to explore';
  const levelNavigation = continent
    ? hudButton('back', config.assets.back, 'Back to the Puzzle Explorer splash')
    : `<a class="choose-home" href="../../" data-target="home" data-role="navigation" aria-label="Back to all QLOBE Kids games">${img(config.assets.home, '')}</a>`;

  mount.innerHTML = `
    <section class="screen choose-screen" data-screen="choose" style="background-image:url('${config.assets.playTexture}')">
      ${levelNavigation}
      ${img(config.assets.title, config.title, 'choose-title')}
      <div class="choose-banner" aria-label="${escapeHtml(title)}">
        ${img(config.assets.promptRibbon, '', 'choose-banner-art')}
        <h1>${escapeHtml(title)}</h1>
      </div>
      <div class="puzzle-grid${continent ? ' scene-grid' : ' continent-grid'}" role="list" aria-label="${escapeHtml(cardLabel)}">${cards}</div>
      <p class="choose-note">${continent ? 'Two six-piece scenes and one 12-piece challenge · Learn as you build' : 'Choose a continent, then discover animals, places, and living heritage'}</p>
      <div class="sr-live" data-live aria-live="polite"></div>
    </section>`;

  mount.querySelectorAll('[data-puzzle]').forEach((button) => {
    wireTap(button, () => { void startPuzzle(button.dataset.puzzle); });
  });
  mount.querySelectorAll('[data-continent]').forEach((button) => {
    wireTap(button, () => renderChoose({ continentId: button.dataset.continent, announceChoice: true }));
  });
  wireTap(mount.querySelector('[data-target="back"]'), () => renderChoose({ announceChoice: true }));
  if (announceChoice) void speak('choose');
}

function renderLoading(puzzle) {
  resetInteractions();
  mount.innerHTML = `
    <section class="screen loading-screen" data-screen="loading" style="background-image:url('${config.assets.playTexture}')">
      ${img(config.assets.title, config.title, 'loading-title')}
      <div class="loading-card">
        ${img(puzzle.source, '', 'loading-picture')}
        <p>Cutting ${puzzle.rows * puzzle.cols} pieces…</p>
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
    selectedPiece: null,
    busy: true,
    hintVisible: false,
    manifestMatches: false,
    manifestIssues: [],
    factIndex: 0,
    loosePositions: {},
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

function defaultScatterPosition(pieceIndex, totalPieces) {
  const localIndex = pieceIndex % Math.ceil(totalPieces / 2);
  const positions = totalPieces === 12
    ? [
      { left: 27, top: 17 },
      { left: 74, top: 14 },
      { left: 41, top: 45 },
      { left: 84, top: 47 },
      { left: 24, top: 78 },
      { left: 66, top: 83 },
    ]
    : [
      { left: 34, top: 24 },
      { left: 72, top: 51 },
      { left: 39, top: 79 },
    ];
  return positions[Math.min(localIndex, positions.length - 1)];
}

function scatterSideForPiece(pieceIndex, totalPieces) {
  const saved = state.loosePositions?.[pieceIndex];
  if (saved?.side === 'left' || saved?.side === 'right') return saved.side;
  return pieceIndex < Math.ceil(totalPieces / 2) ? 'left' : 'right';
}

function loosePositionForPiece(pieceIndex, totalPieces, side, fallback = null) {
  const saved = state.loosePositions?.[pieceIndex];
  if (saved?.side === side && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
    return saved;
  }
  return fallback || defaultScatterPosition(pieceIndex, totalPieces);
}

function loosePiecesHtml(cut, side) {
  return cut.pieces
    .filter((piece) => !state.placed.includes(piece.index))
    .filter((piece) => scatterSideForPiece(piece.index, cut.pieces.length) === side)
    .map((piece) => `
      <button type="button" class="loose-piece${state.selectedPiece === piece.index ? ' is-selected' : ''}" data-piece-index="${piece.index}" data-target="piece-${piece.index}" data-role="draggable" aria-pressed="${state.selectedPiece === piece.index}" aria-label="Puzzle piece ${piece.index + 1} of ${cut.pieces.length}. Drag it to its matching space, or tap to select it."></button>`)
    .join('');
}

function renderPlay({ snappedIndex = null, preserveVoice = false } = {}) {
  // Placement redraws replace the drag DOM, but an active celebration must
  // keep speaking through that replacement and any following drag.
  resetInteractions({ stopVoice: !preserveVoice });
  const runtime = activeRuntime;
  const puzzle = state.puzzle;
  if (!runtime || !puzzle) return;

  mount.innerHTML = `
    <section class="screen play-screen" data-screen="play" data-phase="${state.phase}" style="background-image:url('${config.assets.playTexture}')">
      ${hudButton('back', config.assets.back, 'Choose another puzzle')}
      ${hudButton('sound', config.assets.sound, 'Hear the directions again')}
      ${hudButton('hint', config.assets.hint, 'Show where this piece goes')}
      <header class="prompt-shell">
        ${img(config.assets.promptRibbon, '', 'prompt-ribbon-art')}
        <div class="prompt-copy">${escapeHtml(continentById(puzzle.continent)?.name || 'World')} · Drag any piece</div>
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
        <div class="piece-scatter piece-scatter-${runtime.cut.pieces.length} piece-scatter-left" aria-label="Loose puzzle pieces on the left">
          ${loosePiecesHtml(runtime.cut, 'left')}
        </div>
        <div class="piece-scatter piece-scatter-${runtime.cut.pieces.length} piece-scatter-right" aria-label="Loose puzzle pieces on the right">
          ${loosePiecesHtml(runtime.cut, 'right')}
        </div>
      </div>
      ${img(config.assets.handGuide, '', 'hand-guide')}
      <div class="sr-live" data-live aria-live="assertive"></div>
    </section>`;

  paintBoard(snappedIndex);
  paintLoosePieces();
  wirePlayInteractions();
  scheduleWorldFact(state.factIndex === 0 ? 7000 : 9000);
  if (state.phase === 'playing') scheduleHint(config.timing.firstHintMs);
}

function worldFactSnippets(puzzle) {
  return [
    { key: `fact-${puzzle.id}-animal`, label: 'Animal fact', text: puzzle.facts.animal },
    { key: `fact-${puzzle.id}-place`, label: 'Place fact', text: puzzle.facts.location },
    { key: `fact-${puzzle.id}-heritage`, label: 'Heritage fact', text: puzzle.facts.heritage },
  ];
}

function scheduleWorldFact(delay = 9000) {
  if (worldFactTimer) timers.clear(worldFactTimer);
  worldFactTimer = null;
  if (state.screen !== 'play' || state.phase !== 'playing' || state.busy || !state.puzzle) return;
  const snippets = worldFactSnippets(state.puzzle);
  if (state.factIndex >= snippets.length) return;
  worldFactTimer = timers.after(delay, async () => {
    worldFactTimer = null;
    if (state.screen !== 'play' || state.phase !== 'playing' || state.busy || !state.puzzle) return;
    if (celebrationActive) {
      scheduleWorldFact(2500);
      return;
    }
    const snippet = worldFactSnippets(state.puzzle)[state.factIndex];
    if (!snippet) return;
    state.factIndex += 1;
    announce(snippet.text);
    await speak(snippet.key, `${snippet.label}. ${snippet.text}`);
    scheduleWorldFact(9000);
  });
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
  const hintPiece = state.phase === 'playing' ? pieceByIndex(hintPieceIndex()) : null;
  if (hintPiece && !state.placed.includes(hintPiece.index)) {
    const path = new Path2D(hintPiece.path);
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

function paintLoosePieces() {
  const { cut } = activeRuntime || {};
  const board = mount.querySelector('[data-board]');
  const boardFrame = mount.querySelector('.board-frame');
  const scatters = [...mount.querySelectorAll('.piece-scatter')];
  if (!cut || !board || !boardFrame || scatters.length !== 2) return;

  // Let the board keep its authored responsive size. Loose pieces use that
  // board scale, even when their physical tab bounds overlap in the side areas.
  boardFrame.style.removeProperty('width');
  scatters.forEach((scatter) => scatter.style.removeProperty('height'));

  const finalBoardWidth = board.clientWidth;
  const finalBoardHeight = board.clientHeight;
  if (!finalBoardWidth || !finalBoardHeight) return;
  const scale = finalBoardWidth / cut.width;
  const priorityIndex = hintPieceIndex();

  mount.querySelectorAll('.loose-piece').forEach((holder) => {
    const piece = pieceByIndex(holder.dataset.pieceIndex);
    if (!piece) return;
    const scatter = holder.closest('.piece-scatter');
    const side = scatter?.classList.contains('piece-scatter-right') ? 'right' : 'left';
    const position = loosePositionForPiece(piece.index, cut.pieces.length, side);
    holder.style.position = 'absolute';
    holder.style.left = `${position.left}%`;
    holder.style.top = `${position.top}%`;
    holder.style.width = `${piece.canvas.width * scale}px`;
    holder.style.height = `${piece.canvas.height * (finalBoardHeight / cut.height)}px`;
    holder.style.zIndex = String(piece.index === priorityIndex ? cut.pieces.length + 10 : cut.pieces.length - piece.index + 1);
    holder.style.setProperty('--piece-ratio', `${piece.canvas.width} / ${piece.canvas.height}`);
    holder.querySelectorAll('.loose-piece-canvas').forEach((canvas) => canvas.remove());
    holder.append(copyCanvas(piece.canvas, 'loose-piece-canvas'));
  });
}

function rememberLoosePosition(pieceIndex, x, y) {
  const { cut } = activeRuntime || {};
  const board = mount.querySelector('[data-board]');
  if (!cut || !board || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const boardRect = board.getBoundingClientRect();
  if (x >= boardRect.left && x <= boardRect.right && y >= boardRect.top && y <= boardRect.bottom) return false;

  const side = Math.abs(x - boardRect.left) <= Math.abs(x - boardRect.right) ? 'left' : 'right';
  const scatter = mount.querySelector(`.piece-scatter-${side}`);
  if (!scatter) return false;
  const rect = scatter.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  const left = Math.min(88, Math.max(12, ((x - rect.left) / rect.width) * 100));
  const top = Math.min(88, Math.max(12, ((y - rect.top) / rect.height) * 100));
  state.loosePositions[pieceIndex] = { side, left, top };
  return true;
}

function makeDragGhost(pieceRecord) {
  const piece = pieceByIndex(pieceRecord?.index);
  const source = pieceRecord?.el;
  if (!piece || !source) return null;
  const rect = source.getBoundingClientRect();
  const computed = getComputedStyle(source);
  const ghost = document.createElement('div');
  ghost.className = 'piece-drag-ghost';
  ghost.style.width = `${parseFloat(computed.width) || rect.width}px`;
  ghost.style.height = `${parseFloat(computed.height) || rect.height}px`;
  ghost.append(copyCanvas(piece.canvas, 'loose-piece-canvas'));
  return ghost;
}

function wirePlayInteractions() {
  wireTap(mount.querySelector('[data-target="back"]'), () => renderChoose({ continentId: state.puzzle?.continent, announceChoice: true }));
  wireTap(mount.querySelector('[data-target="sound"]'), repeatCurrentVoice);
  wireTap(mount.querySelector('[data-target="hint"]'), () => showHint({ explicit: true }));
  const pieceButtons = [...mount.querySelectorAll('.loose-piece')];
  pieceButtons.forEach((pieceButton) => {
    const index = Number(pieceButton.dataset.pieceIndex);
    wireTap(pieceButton, () => selectPiece(index));
  });
  mount.querySelectorAll('.piece-slot').forEach((target) => {
    wireTap(target, () => { void onSlotTap(Number(target.dataset.pieceIndex)); }, { quiet: true });
  });

  pieceButtons.forEach((pieceButton) => {
    const onPointerDown = (event) => drag?.begin(event, Number(pieceButton.dataset.pieceIndex));
    pieceButton.addEventListener('pointerdown', onPointerDown);
    register(() => pieceButton.removeEventListener('pointerdown', onPointerDown));
  });

  drag = createDragToSlotDom({
    getPiece: (index) => {
      const pieceIndex = Number(index);
      const button = mount.querySelector(`.loose-piece[data-piece-index="${pieceIndex}"]`);
      return button && !state.placed.includes(pieceIndex) ? { el: button, index: pieceIndex } : null;
    },
    makeGhost: makeDragGhost,
    ghostHost: document.body,
    root: () => mount.querySelector('[data-board]'),
    slotSelector: '.piece-slot',
    slotPad: 10,
    ghostClass: 'piece-drag-ghost',
    preventDefaultOnPress: true,
    canStart: () => state.screen === 'play' && state.phase === 'playing' && !state.busy,
    onGrab: (pieceRecord) => {
      pieceRecord.el.style.zIndex = '20';
      stopHint();
      return true;
    },
    onLift: (pieceRecord) => {
      state.selected = true;
      state.selectedPiece = pieceRecord.index;
      syncPieceSelection();
      if (!state.muted) sfx.whoosh();
    },
    onDrop: async (pieceRecord, record) => {
      const targetIndex = Number(record.slot?.dataset?.pieceIndex);
      if (!Number.isInteger(targetIndex)) {
        const moved = rememberLoosePosition(pieceRecord.index, record.lastX, record.lastY);
        state.selected = false;
        state.selectedPiece = null;
        if (moved) {
          renderPlay({ preserveVoice: true });
        } else {
          syncPieceSelection();
          scheduleHint(2400);
        }
        return;
      }
      await attemptPlacement(pieceRecord.index, Number.isInteger(targetIndex) ? targetIndex : null, 'drag');
    },
    onCancel: () => {
      state.selected = false;
      state.selectedPiece = null;
      syncPieceSelection();
      if (state.phase === 'playing') scheduleHint(config.timing.repeatHintMs);
    },
  });
}

function selectPiece(index) {
  if (state.busy || state.phase !== 'playing') return false;
  const piece = pieceByIndex(index);
  if (!piece || state.placed.includes(piece.index)) return false;
  stopHint();
  state.selected = true;
  state.selectedPiece = piece.index;
  syncPieceSelection();
  announce(`Puzzle piece ${piece.index + 1} selected. Now choose its matching space.`);
  if (!tapHelpSpoken) {
    tapHelpSpoken = true;
    void speak('tap-help');
  }
  return true;
}

async function onSlotTap(index) {
  if (state.busy || state.phase !== 'playing') return false;
  const selected = selectedPieceIndex();
  if (selected == null) {
    announce('Choose a puzzle piece first, then choose its matching space.');
    return false;
  }
  return attemptPlacement(selected, index, 'tap');
}

async function attemptPlacement(pieceIndex, targetIndex, source = 'debug') {
  const piece = pieceByIndex(pieceIndex);
  if (!piece || state.placed.includes(piece.index) || state.screen !== 'play' || state.phase !== 'playing' || state.busy) return false;
  stopHint();

  if (targetIndex !== piece.index) {
    state.busy = true;
    state.selected = source === 'tap';
    state.selectedPiece = source === 'tap' ? piece.index : null;
    syncPieceSelection();
    const pieceButton = mount.querySelector(`.loose-piece[data-piece-index="${piece.index}"]`);
    const target = Number.isInteger(targetIndex) ? mount.querySelector(`.piece-slot[data-piece-index="${targetIndex}"]`) : null;
    pieceButton?.classList.add('is-wrong');
    target?.classList.add('is-wrong');
    announce('That piece does not fit there. Try another spot.');
    if (!state.muted) sfx.unpop();
    void speak('nudge');
    timers.after(620, () => {
      if (state.screen !== 'play' || !mount.querySelector(`.loose-piece[data-piece-index="${piece.index}"]`)) return;
      state.busy = false;
      pieceButton?.classList.remove('is-wrong');
      target?.classList.remove('is-wrong');
      syncPieceSelection();
      scheduleHint(2400);
    });
    return false;
  }

  const token = ++flowToken;
  state.busy = true;
  state.phase = 'snapping';
  state.selected = false;
  state.selectedPiece = null;
  state.placed.push(piece.index);
  state.step = state.placed.length;
  if (!state.muted) {
    sfx.pop();
    sfx.sparkle();
  }
  renderPlay({ snappedIndex: piece.index, preserveVoice: true });
  const celebrationKey = randomCelebrationKey();
  const celebrationText = lineTable[celebrationKey] || 'Well done!';
  announce(`${celebrationText} ${state.placed.length} of ${activeRuntime.cut.pieces.length} pieces placed.`);
  void queueCelebration(celebrationKey);

  timers.after(config.timing.snapHoldMs, () => {
    if (token !== flowToken || state.screen !== 'play') return;
    state.busy = false;
    if (state.placed.length >= activeRuntime.cut.pieces.length) {
      renderComplete({ announceCompletion: true, preserveVoice: true });
      return;
    }
    state.phase = 'playing';
    renderPlay({ preserveVoice: true });
  });
  return true;
}

function repeatCurrentVoice() {
  if (state.screen === 'complete') {
    void queueCelebration(FINAL_CELEBRATION_KEY);
    return true;
  }
  const key = state.screen === 'play' ? 'place-piece' : 'choose';
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
  const pieceIndex = hintPieceIndex();
  const piece = mount.querySelector(`.loose-piece[data-piece-index="${pieceIndex}"]`);
  const target = mount.querySelector(`.piece-slot[data-piece-index="${pieceIndex}"]`);
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

function renderComplete({ announceCompletion = false, preserveVoice = false } = {}) {
  ++flowToken;
  resetInteractions({ stopVoice: !preserveVoice });
  const puzzle = state.puzzle;
  if (!puzzle || !activeRuntime) return renderChoose();
  completedPuzzles.add(puzzle.id);
  saveCompletedPuzzles();
  Object.assign(state, {
    screen: 'complete',
    phase: 'complete',
    busy: false,
    selected: false,
    selectedPiece: null,
    hintVisible: false,
    lastVoiceKey: FINAL_CELEBRATION_KEY,
  });
  const continent = continentById(puzzle.continent);
  const continentPuzzles = puzzlesForContinent(puzzle.continent);
  const allComplete = continentPuzzles.every((entry) => completedPuzzles.has(entry.id));
  const puzzleIndex = config.puzzles.findIndex((entry) => entry.id === puzzle.id);
  const continentIndex = continentPuzzles.findIndex((entry) => entry.id === puzzle.id);
  const next = continentPuzzles[continentIndex + 1] || config.puzzles[(puzzleIndex + 1) % config.puzzles.length];

  mount.innerHTML = `
    <section class="screen complete-screen" data-screen="complete" style="background-image:url('${config.assets.playTexture}')">
      ${hudButton('back', config.assets.back, 'Back to puzzle choices')}
      ${hudButton('sound', config.assets.sound, 'Hear the celebration again')}
      <div class="complete-banner">
        ${img(config.assets.promptRibbon, '', 'complete-banner-art')}
        <h1>Puzzle complete!</h1>
      </div>
      <div class="complete-board" style="--board-ratio:${activeRuntime.cut.width} / ${activeRuntime.cut.height}" data-solved-board aria-label="Completed ${escapeHtml(puzzle.title)} puzzle">${img(puzzle.source, `${puzzle.title} completed puzzle`, 'complete-image')}</div>
      <p class="complete-title">${escapeHtml(puzzle.title)}</p>
      <div class="complete-actions">
        <button type="button" class="paper-action is-primary" data-target="next" data-role="choice" aria-label="Next puzzle, ${escapeHtml(next.title)}">${img(config.assets.play, '')}<span>Next puzzle</span></button>
      </div>
      ${allComplete ? `<p class="all-complete">All three ${escapeHtml(continent?.name || '')} puzzles are complete!</p>` : ''}
      ${img(config.assets.confetti, '', 'confetti-layer')}
      <div class="sr-live" data-live aria-live="assertive"></div>
    </section>`;

  wireTap(mount.querySelector('[data-target="back"]'), () => renderChoose({ continentId: puzzle.continent, announceChoice: true }));
  wireTap(mount.querySelector('[data-target="sound"]'), repeatCurrentVoice);
  wireTap(mount.querySelector('[data-target="next"]'), () => { void startPuzzle(next.id); });
  announce(`Puzzle complete! The ${puzzle.title} picture is whole.`);
  if (announceCompletion) {
    void queueCelebration(FINAL_CELEBRATION_KEY);
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
  bgm.setMuted(state.muted);
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
    continent: state.puzzle?.continent || null,
    round: state.step,
    step: state.step,
    totalPieces: activeRuntime?.cut?.pieces?.length || 0,
    currentPiece: selectedPieceIndex() ?? hintPieceIndex(),
    hintPiece: hintPieceIndex(),
    expectedSlot: null,
    availablePieces: activeRuntime?.cut?.pieces?.filter((piece) => !state.placed.includes(piece.index)).map((piece) => piece.index) || [],
    placed: [...state.placed],
    selected: state.selected,
    selectedPiece: selectedPieceIndex(),
    busy: state.busy,
    muted: state.muted,
    reducedMotion: state.reducedMotion,
    hintVisible: state.hintVisible,
    factIndex: state.factIndex,
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
    music: bgm.stats(),
  };
}

async function debugPlace(pieceIndex = hintPieceIndex(), slotIndex = pieceIndex) {
  await ready;
  const index = Number(pieceIndex);
  if (state.screen !== 'play' || !pieceByIndex(index) || state.placed.includes(index)) return false;
  state.selected = true;
  state.selectedPiece = index;
  return attemptPlacement(index, Number(slotIndex), 'debug');
}

async function debugCompletePuzzle() {
  await ready;
  if (!state.puzzle || state.screen !== 'play' || !activeRuntime) return false;
  state.placed = activeRuntime.cut.pieces.map((piece) => piece.index);
  state.step = state.placed.length;
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
  winRound: async () => { await ready; const index = hintPieceIndex(); return index == null ? false : attemptPlacement(index, index, 'debug'); },
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
  bgm.stop({ fadeOutMs: 0 });
});
