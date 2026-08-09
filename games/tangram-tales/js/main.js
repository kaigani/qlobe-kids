import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import { onTap } from '../../../shared/js/tap.js';
import { createFreeformBoard } from '../../../shared/js/freeform-board.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { installKioskGuards, installUnlockOnGesture, unlockAll } from '../../../shared/js/audio-unlock.js';
import { escapeHtml as esc } from '../../../shared/js/dom.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';

const mount = document.getElementById('game');
const PROGRESS_KEY = 'qlobe-tangram-tales-progress-v1';
const FREE_KEY = 'qlobe-tangram-tales-free-v1';
const GALLERY_KEY = 'qlobe-tangram-tales-gallery-v1';
const SELECTED_KEY = 'qlobe-tangram-tales-selected-v1';
const HOLD_ROTATE_DELAY = 520;
const HOLD_ROTATE_TOLERANCE = 22;
const HOLD_ROTATE_DEGREES_PER_SECOND = 30;
const TALES_PER_PAGE = 4;
const pieceById = Object.fromEntries(config.pieces.map((piece) => [piece.id, piece]));
const taleById = Object.fromEntries(config.tales.map((tale) => [tale.id, tale]));
const defaultTaleId = config.tales[0]?.id || '';
const savedTale = loadJson(SELECTED_KEY, defaultTaleId);
const initialTaleIndex = Math.max(0, config.tales.findIndex((tale) => tale.id === savedTale));

const state = {
  screen: 'splash',
  selectedTale: taleById[savedTale] ? savedTale : defaultTaleId,
  tale: null,
  placements: {},
  selectedPiece: null,
  hintSlot: null,
  misses: 0,
  idlePrompted: false,
  completed: new Set(loadJson(PROGRESS_KEY, []).filter((id) => taleById[id])),
  muted: false,
  fast: false,
  seed: 42,
  freeMoved: false,
  freeSelected: null,
  freeSnapshot: null,
  settle: null,
  shelfPage: Math.floor(initialTaleIndex / TALES_PER_PAGE),
};

let freeBoard = null;
let rng = mulberry32(state.seed);
let disposers = [];
let idleTimer = 0;
let revealTimer = 0;

const assetUrls = [
  './assets/theatre.webp', './assets/splash.webp', './assets/title.webp',
  './assets/ui/button-play.webp', './assets/ui/button-next.webp',
  './assets/ui/button-again.webp', './assets/ui/button-done.webp',
  './assets/ui/button-turn.webp', './assets/ui/prompt-plate.webp',
  './assets/ui/badge.webp', './assets/ui/tray.webp',
  './assets/ui/completion-star.webp', './assets/ui/turn-clockwise.webp',
  ...config.pieces.flatMap((piece) => [piece.art, piece.ghost]),
  ...config.tales.flatMap((tale) => [tale.card, tale.scene, ...(tale.details || []).map((detail) => detail.art)]),
];

const ready = Promise.all([
  voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
  preloadImages(assetUrls),
]).then(() => true);

installKioskGuards();
installUnlockOnGesture({ onFirst: () => { if (state.screen === 'splash') say('welcome'); } });

function line(key) { return config.voice[key] || ''; }
function say(key) {
  if (state.muted) return Promise.resolve(false);
  return voice.say(key, line(key));
}
function feedback(kind = 'tick') {
  unlockAll();
  if (!state.muted && typeof sfx[kind] === 'function') sfx[kind]();
}
function delay(ms) { return state.fast ? Math.min(45, ms) : ms; }
function later(fn, ms) { return window.setTimeout(fn, delay(ms)); }

function cleanup() {
  clearTimeout(idleTimer);
  clearTimeout(revealTimer);
  voice.stop();
  guidedDragCtl.detach();
  freeBoard?.destroy();
  freeBoard = null;
  for (const dispose of disposers) dispose();
  disposers = [];
}

function hud(backTarget = 'back') {
  return `
    <button class="qk-hud-btn qk-hud-back qk-hud-top-left" type="button"
            data-action="${backTarget}" data-target="back" aria-label="Back to Tangram Tales"></button>
    <button class="qk-hud-btn qk-hud-sound qk-hud-top-right ${state.muted ? 'is-muted' : ''}" type="button"
            data-action="sound" data-target="sound" aria-label="${state.muted ? 'Turn sound on' : 'Repeat the spoken hint'}"></button>`;
}

function showSplash({ greet = false } = {}) {
  cleanup();
  state.screen = 'splash';
  state.tale = null;
  state.selectedPiece = null;
  const pageCount = Math.ceil(config.tales.length / TALES_PER_PAGE);
  state.shelfPage = Math.max(0, Math.min(pageCount - 1, state.shelfPage));
  const pageStart = state.shelfPage * TALES_PER_PAGE;
  const visibleTales = config.tales.slice(pageStart, pageStart + TALES_PER_PAGE);
  mount.innerHTML = `
    <section class="screen splash-screen" aria-label="Tangram Tales tale shelf">
      <a class="qk-hud-btn qk-hud-home qk-hud-top-left" href="../../" data-target="catalog-home" aria-label="Back to all games"></a>
      <button class="qk-hud-btn qk-hud-sound qk-hud-top-right ${state.muted ? 'is-muted' : ''}" type="button"
              data-action="sound" data-target="sound" aria-label="${state.muted ? 'Turn sound on' : 'Hear the welcome'}"></button>
      <img class="title-art" src="./assets/title.webp" alt="Tangram Tales" />
      <div class="shelf-area">
        <div class="shelf-shell">
          <button class="paper-tool shelf-nav shelf-prev" type="button" data-action="shelf-prev" data-target="shelf-prev"
                  aria-label="Previous stories" ${state.shelfPage === 0 ? 'disabled' : ''}>Back</button>
          <div class="tale-shelf" role="list" aria-label="Choose a tangram tale">
            ${visibleTales.map(taleCard).join('')}
          </div>
          <button class="paper-tool shelf-nav shelf-next" type="button" data-action="shelf-next" data-target="shelf-next"
                  aria-label="More stories" ${state.shelfPage === pageCount - 1 ? 'disabled' : ''}>More</button>
        </div>
        <p class="shelf-page" aria-live="polite">Stories ${pageStart + 1}–${pageStart + visibleTales.length} of ${config.tales.length}</p>
      </div>
      <div class="splash-actions">
        ${plateButton('play', 'Play', 'play-selected', 'play-selected')}
        <button class="free-card" type="button" data-action="start-free" data-target="free-build" aria-label="Make your own tangram tale">
          <img src="./assets/ui/free-card.webp" alt="" aria-hidden="true" />
          <span class="free-mini">${freeMini()}</span>
          <strong>Make My Own</strong>
        </button>
      </div>
      <p class="splash-whisper">Seven shapes. Endless stories.</p>
    </section>`;
  wireActions();
  if (greet) say('welcome');
}

function changeShelfPage(delta) {
  const pageCount = Math.ceil(config.tales.length / TALES_PER_PAGE);
  const nextPage = Math.max(0, Math.min(pageCount - 1, state.shelfPage + delta));
  if (nextPage === state.shelfPage) return false;
  state.shelfPage = nextPage;
  const nextTale = config.tales[nextPage * TALES_PER_PAGE];
  if (nextTale) {
    state.selectedTale = nextTale.id;
    saveJson(SELECTED_KEY, nextTale.id);
  }
  feedback('tick');
  showSplash();
  return true;
}

function taleCard(tale) {
  const selected = state.selectedTale === tale.id;
  const complete = state.completed.has(tale.id);
  return `
    <button class="tale-card ${selected ? 'is-selected' : ''}" type="button" role="listitem"
            data-action="select-tale" data-value="${esc(tale.id)}" data-target="tale-${esc(tale.id)}"
            aria-pressed="${selected}" aria-label="${esc(tale.title)} tale${complete ? ', completed' : ''}">
      <img class="card-plate" src="${esc(tale.card)}" alt="" aria-hidden="true" />
      <span class="card-figure" aria-hidden="true">${figureMarkup(tale, identityPlacements())}</span>
      <strong>${esc(tale.title)}</strong>
      ${complete ? '<img class="paper-star" src="./assets/ui/completion-star.webp" alt="" aria-hidden="true" />' : ''}
    </button>`;
}

function freeMini() {
  return config.freeStart.map((item) => `<img src="${pieceById[item.id].art}" alt="" style="--x:${item.x};--y:${item.y - .22};--size:${item.size * .72};--rotation:${item.rotation}deg" />`).join('');
}

function selectTale(id) {
  if (!taleById[id]) return false;
  state.selectedTale = id;
  saveJson(SELECTED_KEY, id);
  document.querySelectorAll('.tale-card').forEach((card) => {
    const selected = card.dataset.value === id;
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-pressed', String(selected));
  });
  feedback('tick');
  return true;
}

function randomizedInitialPlacements() {
  const manualPieceIds = shuffle(config.pieces.map((piece) => piece.id), rng).slice(0, 4);
  const nonTriangleIds = config.pieces
    .filter((piece) => piece.shape !== 'triangle')
    .map((piece) => piece.id);
  if (manualPieceIds.length === 4 && manualPieceIds.every((pieceId) => pieceById[pieceId].shape === 'triangle') && nonTriangleIds.length) {
    const replacement = nonTriangleIds[Math.floor(rng() * nonTriangleIds.length)];
    manualPieceIds[manualPieceIds.length - 1] = replacement;
  }
  const manualPieces = new Set(manualPieceIds);
  return Object.fromEntries(config.pieces
    .filter((piece) => !manualPieces.has(piece.id))
    .map((piece) => [piece.id, piece.id]));
}

async function startTale(id = state.selectedTale) {
  await ready;
  const tale = taleById[id];
  if (!tale) return false;
  cleanup();
  state.screen = 'guided';
  state.tale = id;
  state.selectedTale = id;
  saveJson(SELECTED_KEY, id);
  state.placements = randomizedInitialPlacements();
  state.selectedPiece = null;
  state.hintSlot = null;
  state.misses = 0;
  state.idlePrompted = false;
  state.settle = null;
  renderGuided();
  say(tale.startVoice);
  return true;
}

function renderGuided() {
  const tale = taleById[state.tale];
  const placedCount = Object.keys(state.placements).length;
  const used = new Set(Object.values(state.placements));
  mount.innerHTML = `
    <section class="screen guided-screen" aria-label="${esc(tale.prompt)}">
      ${hud('back')}
      <header class="play-heading">
        <div class="paper-heading"><h1>${esc(tale.prompt)}</h1></div>
        <div class="progress-badge" aria-label="${placedCount} of 7 pieces placed"><strong>${placedCount}</strong><span>of 7</span></div>
      </header>
      <div class="puzzle-wrap">
        <div id="puzzle-field" class="puzzle-field" aria-label="${esc(tale.title)} tangram outline">
          ${Object.entries(tale.targets).map(([slotId, target]) => slotMarkup(slotId, target)).join('')}
          ${Object.entries(state.placements).map(([slotId, pieceId]) => placedMarkup(slotId, pieceId, tale.targets[slotId])).join('')}
        </div>
        <div id="piece-tray" class="piece-tray" aria-label="Paper pieces to place">
          ${config.pieces.filter((piece) => !used.has(piece.id)).map(trayPieceMarkup).join('')}
        </div>
      </div>
    </section>`;
  wireActions();
  wireGuidedPieces();
  armIdle();
}

function slotMarkup(slotId, target) {
  if (state.placements[slotId]) return '';
  const source = pieceById[slotId];
  return `
    <button class="board-object slot ${state.hintSlot === slotId ? 'is-hint' : ''}" type="button"
            style="${objectStyle(target)}" data-action="slot" data-value="${esc(slotId)}"
            data-target="slot-${esc(slotId)}" aria-label="Matching spot for a ${esc(source.shape)}">
      <img src="${esc(source.ghost)}" alt="" aria-hidden="true" />
    </button>`;
}

function placedMarkup(slotId, pieceId, target) {
  const piece = pieceById[pieceId];
  const settling = state.settle?.slotId === slotId;
  const heldRotation = settling ? state.settle.rotation : target.rotation;
  return `<img class="board-object placed-piece ${settling ? 'is-settling' : ''}"
               style="${objectStyle(target)};--held-rotation:${heldRotation}deg" src="${esc(piece.art)}"
               alt="${esc(piece.label)}, placed" data-piece="${esc(pieceId)}" data-slot="${esc(slotId)}" />`;
}

function trayPieceMarkup(piece) {
  return `
    <button class="tray-piece tray-piece-${esc(piece.family)} ${state.selectedPiece === piece.id ? 'is-selected' : ''}" type="button"
            data-piece="${esc(piece.id)}" data-target="piece-${esc(piece.id)}" aria-label="${esc(piece.label)}. Drag it, hold to turn it, or tap then tap its spot.">
      <img src="${esc(piece.art)}" alt="" aria-hidden="true" draggable="false" />
    </button>`;
}

function previewTargetFor(pieceId) {
  const tale = taleById[state.tale];
  if (!tale) return null;
  const directTarget = tale.targets[pieceId];
  if (directTarget && !state.placements[pieceId]) return directTarget;
  const alternateSlot = matchingOpenSlots(pieceId)[0];
  return alternateSlot ? tale.targets[alternateSlot] : directTarget || null;
}

function wireGuidedPieces() {
  document.querySelectorAll('.tray-piece').forEach((button) => {
    button.addEventListener('pointerdown', (e) => guidedDragCtl.begin(e, button));
  });
}

/** Cleared/re-armed on the drag's own `record` — the mutable per-drag scratch
 *  object the shared module hands to every callback (same object the
 *  hold-rotate loop below also uses to force `record.moved = true`). */
function clearGuidedHold(record) {
  clearTimeout(record.holdTimer);
  cancelAnimationFrame(record.holdFrame || 0);
  record.holdTimer = 0;
  record.holdFrame = 0;
  record.rotating = false;
}

function armGuidedHold(record, clientX, clientY) {
  clearGuidedHold(record);
  record.holdAnchorX = clientX;
  record.holdAnchorY = clientY;
  record.holdTimer = window.setTimeout(() => {
    if (guidedDragCtl.active !== record) return;
    record.rotating = true;
    record.lastRotateAt = performance.now();
    const rotateFrame = (now) => {
      if (guidedDragCtl.active !== record || !record.rotating) return;
      const elapsed = Math.min(64, Math.max(0, now - record.lastRotateAt));
      record.lastRotateAt = now;
      record.rotation = (record.rotation + HOLD_ROTATE_DEGREES_PER_SECOND * elapsed / 1000) % 360;
      // A stationary hold-and-rotate-then-release still commits a placement
      // attempt, same as before this migration — the shared module's own
      // tap-vs-drop decision reads this exact field, so setting it here
      // (rather than only via real translation past `slop`) is how that
      // behavior is preserved. Decision: keep it, not change the feel.
      record.moved = true;
      record.ghost?.style.setProperty('--held-rotation', `${record.rotation}deg`);
      record.holdFrame = requestAnimationFrame(rotateFrame);
    };
    record.holdFrame = requestAnimationFrame(rotateFrame);
  }, HOLD_ROTATE_DELAY);
}

// grabOffset: 1 preserves the exact press-to-piece-center offset for the
// whole drag (any on-piece press already has an offset within the piece's
// own half-size, so this is effectively unclamped) — without it the piece
// would jump to center under the finger the instant a drag starts.
// ghostOn: 'press' matches the original: the clone appears immediately on
// pointerdown, not gated behind the slop gate. cancelOnBlur's default
// (true) replaces the old blur-only listener AND adds the
// visibilitychange/pagehide coverage this game never had.
const guidedDragCtl = createDragToSlotDom({
  getPiece: (button) => button,
  slop: 7,
  grabOffset: 1,
  ghostOn: 'press',
  preventDefaultOnPress: true,
  ghostClass: null, // makeGhost already sets the full className
  makeGhost: (button) => {
    const rect = button.getBoundingClientRect();
    const clone = button.cloneNode(true);
    const field = document.getElementById('puzzle-field')?.getBoundingClientRect();
    const target = previewTargetFor(button.dataset.piece);
    const targetSize = field && target ? field.width * target.size : 0;
    clone.className = 'drag-piece';
    clone.removeAttribute('data-target');
    clone.style.width = `${targetSize > 0 ? targetSize : rect.width}px`;
    clone.style.height = `${targetSize > 0 ? targetSize : rect.height}px`;
    return clone;
  },
  onGrab: (button, record) => {
    button.classList.add('is-drag-source');
    record.rotation = 0;
    record.rotating = false;
    armGuidedHold(record, record.startX, record.startY);
  },
  onMove: (button, record) => {
    if (Math.hypot(record.lastX - record.holdAnchorX, record.lastY - record.holdAnchorY) > HOLD_ROTATE_TOLERANCE) {
      armGuidedHold(record, record.lastX, record.lastY);
    }
    // record.x/y already carry the grabOffset translation — the piece's
    // current center, exactly what the hand-rolled version tracked as
    // centerX/centerY.
    highlightNearest(record.x, record.y, button.dataset.piece);
  },
  onDrop: async (button, record) => {
    clearGuidedHold(record);
    button.classList.remove('is-drag-source');
    const pieceId = button.dataset.piece;
    const field = document.getElementById('puzzle-field')?.getBoundingClientRect();
    if (field) {
      const point = { x: (record.x - field.left) / field.width, y: (record.y - field.top) / field.height };
      if (point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1) attemptPlace(pieceId, point, null, record.rotation);
      else renderGuided();
    }
  },
  onCancel: async (button, record) => {
    clearGuidedHold(record);
    button.classList.remove('is-drag-source');
    document.querySelectorAll('.slot.is-near').forEach((slot) => slot.classList.remove('is-near'));
  },
  onTap: (button) => {
    state.selectedPiece = button.dataset.piece;
    feedback('tick');
    renderGuided();
  },
});
// The shared module has no orientationchange handling of its own (only
// blur/visibilitychange/pagehide) — this game added it as an extra signal
// that a drag should abandon; cancel() is always safe to call, including
// with nothing in flight.
window.addEventListener('orientationchange', () => guidedDragCtl.cancel());

function matchingOpenSlots(pieceId) {
  const tale = taleById[state.tale];
  const family = pieceById[pieceId]?.family;
  return Object.keys(tale.targets).filter((slotId) => !state.placements[slotId] && pieceById[slotId].family === family);
}

function highlightNearest(clientX, clientY, pieceId) {
  const field = document.getElementById('puzzle-field')?.getBoundingClientRect();
  if (!field) return;
  const point = { x: (clientX - field.left) / field.width, y: (clientY - field.top) / field.height };
  const nearest = nearestSlot(pieceId, point);
  document.querySelectorAll('.slot').forEach((slot) => slot.classList.toggle('is-near', slot.dataset.value === nearest?.id && nearest.distance < .24));
}

function nearestSlot(pieceId, point) {
  const tale = taleById[state.tale];
  return matchingOpenSlots(pieceId).map((id) => {
    const target = tale.targets[id];
    return { id, distance: Math.hypot(point.x - target.x, point.y - target.y) };
  }).sort((a, b) => a.distance - b.distance)[0] || null;
}

function attemptPlace(pieceId, point = null, forcedSlot = null, heldRotation = 0) {
  const nearest = forcedSlot ? { id: forcedSlot, distance: 0 } : nearestSlot(pieceId, point);
  const radius = state.misses >= 2 ? .2 : .145;
  if (nearest && matchingOpenSlots(pieceId).includes(nearest.id) && nearest.distance <= radius) {
    return placeInSlot(pieceId, nearest.id, heldRotation);
  }
  state.misses += 1;
  state.hintSlot = nearest?.id || matchingOpenSlots(pieceId)[0] || null;
  state.selectedPiece = pieceId;
  renderGuided();
  say('nudge');
  later(() => {
    if (state.screen !== 'guided') return;
    state.hintSlot = null;
    renderGuided();
  }, 750);
  return false;
}

function placeInSlot(pieceId, slotId, heldRotation = 0) {
  if (!matchingOpenSlots(pieceId).includes(slotId)) return false;
  clearTimeout(idleTimer);
  state.placements[slotId] = pieceId;
  state.selectedPiece = null;
  state.hintSlot = null;
  state.settle = { slotId, rotation: heldRotation };
  feedback('pop');
  say(pieceById[pieceId].voice);
  renderGuided();
  later(() => {
    if (state.settle?.slotId === slotId) state.settle = null;
  }, 520);
  if (Object.keys(state.placements).length === 7) {
    revealTimer = later(() => showReveal(state.tale), 620);
  }
  return true;
}

function armIdle() {
  clearTimeout(idleTimer);
  if (state.idlePrompted) return;
  idleTimer = later(() => {
    if (state.screen !== 'guided') return;
    state.idlePrompted = true;
    const first = matchingOpenSlots(config.pieces.find((piece) => !Object.values(state.placements).includes(piece.id))?.id || '')[0];
    state.hintSlot = first || Object.keys(taleById[state.tale].targets).find((id) => !state.placements[id]);
    renderGuided();
    say('idle');
  }, 9000);
}

function showReveal(taleId) {
  cleanup();
  const tale = taleById[taleId];
  state.screen = 'reveal';
  state.tale = taleId;
  state.completed.add(taleId);
  saveJson(PROGRESS_KEY, [...state.completed]);
  const allDone = config.tales.every((candidate) => state.completed.has(candidate.id));
  const title = allDone ? `All ${config.tales.length} tales awake!` : `${tale.title} is awake!`;
  mount.innerHTML = `
    <section class="screen reveal-screen reveal-${esc(tale.id)}" style="background-image:url('${esc(tale.scene)}')" aria-label="${esc(title)}">
      ${hud('back')}
      ${celebrationStars()}
      <div class="reveal-heading"><h1>${esc(title)}</h1></div>
      <div class="reveal-figure ${esc(tale.id)}-figure" aria-label="Completed ${esc(tale.title)} made from seven tangram pieces">
        ${figureMarkup(tale, state.placements)}
      </div>
      <div class="reveal-actions">
        ${plateButton('again', 'Play Again', 'play-again', 'play-again')}
        ${plateButton('next', allDone ? 'Tale Shelf' : 'Next Tale', 'next-tale', 'next-tale')}
      </div>
    </section>`;
  wireActions();
  feedback('tada');
  say(tale.revealVoice);
}

function nextTale() {
  const next = config.tales.find((tale) => !state.completed.has(tale.id));
  if (next) return startTale(next.id);
  showSplash();
  return true;
}

async function startFree() {
  await ready;
  cleanup();
  state.screen = 'free';
  state.tale = null;
  state.freeSelected = null;
  const saved = loadJson(FREE_KEY, null);
  state.freeMoved = !!saved?.items?.length;
  mount.innerHTML = `
    <section class="screen free-screen" aria-label="Make your own tangram tale">
      ${hud('back')}
      <header class="play-heading free-heading">
        <div class="paper-heading"><h1>Make your own tale</h1></div>
      </header>
      <div id="free-board" class="free-board" aria-label="Open paper stage with seven movable tangram pieces"></div>
      <div class="free-tools">
        ${plateButton('turn', 'Turn', 'rotate', 'rotate-piece', true, './assets/ui/turn-clockwise.webp')}
        <button class="paper-tool" type="button" data-action="undo" data-target="undo" aria-label="Undo the last move">Undo</button>
        ${plateButton('done', 'Done', 'finish-free', 'finish-free')}
      </div>
    </section>`;
  wireActions();
  const boardEl = document.getElementById('free-board');
  freeBoard = createFreeformBoard(boardEl, {
    holdRotate: {
      delay: HOLD_ROTATE_DELAY,
      tolerance: HOLD_ROTATE_TOLERANCE,
      degreesPerSecond: HOLD_ROTATE_DEGREES_PER_SECOND,
    },
    onChange(snapshot, info) {
      state.freeSnapshot = snapshot;
      if (['move', 'transform', 'undo'].includes(info.reason)) state.freeMoved = true;
      if (state.freeMoved) saveJson(FREE_KEY, snapshot);
      updateFreeTools();
    },
    onSelect(item) {
      state.freeSelected = item?.id || null;
      updateFreeTools();
    },
    onGrab() { feedback('tick'); },
    onDrop() { feedback('pop'); },
  });
  if (saved?.format === 'qlobe-freeform-board') freeBoard.load(saved);
  else {
    for (const item of config.freeStart) {
      const piece = pieceById[item.id];
      freeBoard.add({ ...item, kind: piece.shape, src: piece.art, alt: piece.label }, { record: false, emitChange: false });
    }
    state.freeSnapshot = freeBoard.snapshot();
  }
  updateFreeTools();
  say('freeStart');
  return true;
}

function updateFreeTools() {
  const rotate = document.querySelector('[data-target="rotate-piece"]');
  const undo = document.querySelector('[data-target="undo"]');
  if (rotate) rotate.disabled = !state.freeSelected;
  if (undo) undo.disabled = !freeBoard?.canUndo();
}

function rotateSelected() {
  if (!freeBoard || !state.freeSelected) {
    say('turnHint');
    return false;
  }
  const changed = freeBoard.rotate(state.freeSelected, 45);
  if (changed) feedback('tick');
  return changed;
}

function undoFree() {
  const changed = freeBoard?.undo() || false;
  if (changed) feedback('tick');
  updateFreeTools();
  return changed;
}

function finishFree() {
  if (!freeBoard || !state.freeMoved) {
    say('doneNudge');
    return false;
  }
  state.freeSnapshot = freeBoard.snapshot();
  saveJson(FREE_KEY, state.freeSnapshot);
  const gallery = loadJson(GALLERY_KEY, []);
  gallery.unshift({ savedAt: new Date().toISOString(), board: state.freeSnapshot });
  saveJson(GALLERY_KEY, gallery.slice(0, 3));
  showFreeReveal(state.freeSnapshot);
  return true;
}

function showFreeReveal(snapshot) {
  cleanup();
  state.screen = 'free-reveal';
  state.freeSnapshot = snapshot;
  mount.innerHTML = `
    <section class="screen free-reveal-screen" aria-label="Your new tangram tale">
      ${hud('back')}
      ${celebrationStars()}
      <div class="reveal-heading"><h1>Made by you!</h1></div>
      <div id="free-reveal-board" class="free-board free-reveal-board"></div>
      <div class="reveal-actions">
        ${plateButton('again', 'Edit', 'edit-free', 'edit-free')}
        ${plateButton('next', 'Tale Shelf', 'back', 'tale-shelf')}
      </div>
    </section>`;
  wireActions();
  freeBoard = createFreeformBoard(document.getElementById('free-reveal-board'), { interactive: false });
  freeBoard.load(snapshot);
  feedback('tada');
  say('freeDone');
}

function wireActions() {
  document.querySelectorAll('[data-action]').forEach((element) => {
    disposers.push(onTap(element, (event) => handleAction(element.dataset.action, element.dataset.value, event)));
  });
}

function handleAction(action, value, event) {
  unlockAll();
  if (action !== 'sound') feedback('tick');
  if (action === 'select-tale') return selectTale(value);
  if (action === 'shelf-prev') return changeShelfPage(-1);
  if (action === 'shelf-next') return changeShelfPage(1);
  if (action === 'play-selected') return startTale(state.selectedTale);
  if (action === 'start-free') return startFree();
  if (action === 'slot') {
    if (!state.selectedPiece) return false;
    const field = document.getElementById('puzzle-field')?.getBoundingClientRect();
    if (field && Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
      return attemptPlace(state.selectedPiece, {
        x: (event.clientX - field.left) / field.width,
        y: (event.clientY - field.top) / field.height,
      });
    }
    return attemptPlace(state.selectedPiece, null, value);
  }
  if (action === 'play-again') return startTale(state.tale);
  if (action === 'next-tale') return nextTale();
  if (action === 'rotate') return rotateSelected();
  if (action === 'undo') return undoFree();
  if (action === 'finish-free') return finishFree();
  if (action === 'edit-free') return startFree();
  if (action === 'back') return showSplash();
  if (action === 'sound') return toggleSound();
  return false;
}

function toggleSound() {
  state.muted = !state.muted;
  voice.setMuted(state.muted);
  document.querySelector('[data-target="sound"]')?.classList.toggle('is-muted', state.muted);
  if (!state.muted) {
    feedback('tick');
    const key = state.screen === 'guided' ? taleById[state.tale].startVoice : state.screen === 'free' ? 'freeStart' : 'welcome';
    say(key);
  }
  return state.muted;
}

function identityPlacements() { return Object.fromEntries(config.pieces.map((piece) => [piece.id, piece.id])); }

function celebrationStars() {
  return `<div class="celebration-stars" aria-hidden="true">
    <img src="./assets/ui/completion-star.webp" alt="" style="--x:16%;--y:23%;--delay:-.2s;--scale:.72" />
    <img src="./assets/ui/completion-star.webp" alt="" style="--x:82%;--y:21%;--delay:-.7s;--scale:.58" />
    <img src="./assets/ui/completion-star.webp" alt="" style="--x:22%;--y:57%;--delay:-1.1s;--scale:.45" />
    <img src="./assets/ui/completion-star.webp" alt="" style="--x:79%;--y:58%;--delay:-1.5s;--scale:.5" />
  </div>`;
}

function figureMarkup(tale, placements) {
  const pieces = Object.entries(placements).map(([slotId, pieceId]) => {
    const target = tale.targets[slotId];
    const piece = pieceById[pieceId];
    if (!target || !piece) return '';
    return `<img class="figure-piece" src="${esc(piece.art)}" alt="" style="${objectStyle(target)}" data-piece="${esc(pieceId)}" data-slot="${esc(slotId)}" />`;
  }).join('');
  const details = (tale.details || []).map((detail) =>
    `<img class="figure-piece face-detail" src="${esc(detail.art)}" alt="" aria-hidden="true" style="${objectStyle(detail)}" />`).join('');
  return pieces + details;
}

function objectStyle(target) {
  return `--x:${target.x};--y:${target.y};--size:${target.size};--rotation:${target.rotation}deg;--mirror:${target.mirror ? -1 : 1}`;
}

function plateButton(kind, label, action, target, disabled = false, icon = '') {
  return `<button class="plate-button plate-${kind}" type="button" data-action="${action}" data-target="${target}"
                  aria-label="${label}" ${disabled ? 'disabled' : ''}>${icon ? `<img class="button-icon" src="${icon}" alt="" aria-hidden="true" />` : ''}<span>${label}</span></button>`;
}

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

function completeGuided() {
  if (state.screen !== 'guided') return false;
  state.placements = identityPlacements();
  renderGuided();
  revealTimer = later(() => showReveal(state.tale), 80);
  return true;
}

function debugTap(id) {
  const target = document.querySelector(`[data-target="${CSS.escape(String(id))}"]`);
  if (!target) return false;
  target.click();
  return true;
}

installDebug({
  gameId: 'tangram-tales',
  engine: 'custom-tangram-freeform',
  ready,
  listModes: () => [...config.tales.map(({ id, title }) => ({ id, title })), { id: 'free', title: 'Make My Own' }],
  startMode: (id) => id === 'free' ? startFree() : startTale(id),
  getState: () => ({
    screen: state.screen,
    selectedTale: state.selectedTale,
    tale: state.tale,
    placed: Object.keys(state.placements).length,
    placements: { ...state.placements },
    selectedPiece: state.selectedPiece,
    misses: state.misses,
    completed: [...state.completed],
    muted: state.muted,
    freeMoved: state.freeMoved,
    freeSelected: state.freeSelected,
    freeItems: freeBoard?.getItems() || state.freeSnapshot?.items || [],
    shelfPage: state.shelfPage,
  }),
  tap: debugTap,
  mute(on = true) { state.muted = !!on; voice.setMuted(state.muted); return state.muted; },
  onSeed(nextRng, seed) { rng = nextRng; state.seed = seed; },
  fastTimers() { state.fast = true; return .05; },
  completeRound: completeGuided,
  winRound: completeGuided,
  placePiece(pieceId, slotId = pieceId) {
    if (state.screen !== 'guided') return false;
    return placeInSlot(pieceId, slotId);
  },
  dragPiece(pieceId, slotId = pieceId) {
    if (state.screen !== 'guided') return false;
    return attemptPlace(pieceId, null, slotId);
  },
  rotatePiece(pieceId, delta = 45) {
    if (state.screen !== 'free' || !freeBoard) return false;
    return freeBoard.rotate(pieceId || state.freeSelected, delta);
  },
  finish: () => state.screen === 'free' ? finishFree() : completeGuided(),
  snapshot: () => freeBoard?.snapshot() || state.freeSnapshot,
  loadSnapshot(snapshot) {
    if (!freeBoard || snapshot?.format !== 'qlobe-freeform-board') return false;
    freeBoard.load(snapshot);
    state.freeMoved = true;
    return true;
  },
  clearSaved() {
    try { localStorage.removeItem(PROGRESS_KEY); localStorage.removeItem(FREE_KEY); localStorage.removeItem(GALLERY_KEY); localStorage.removeItem(SELECTED_KEY); } catch { /* storage unavailable */ }
    state.completed.clear();
    state.selectedTale = defaultTaleId;
    state.shelfPage = 0;
    return true;
  },
  getAudioLog: voice.getAudioLog,
});

showSplash();
