import config from '../config.js?v=20260822b';
import { createScreens } from '../../../shared/js/screens.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { onTap } from '../../../shared/js/tap.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import * as voice from '../../../shared/js/voice-clips.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as bgm from '../../../shared/js/bgm.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { mulberry32 } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';
import { burstConfetti, tada } from '../../../shared/js/celebrate.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';

const root = document.getElementById('game');
const timers = createTimers();
const narrator = createNarrator();
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;

const state = {
  screen: 'splash',
  phase: 'splash',
  position: 0,
  turn: 0,
  moves: [],
  reset: { breathe: false, hug: false, tidy: [] },
  currentCue: 'welcome',
  inputLocked: false,
  muted: false,
  seed: 42,
  run: 0,
};

let rng = mulberry32(state.seed);
let phaseDisposers = [];
let dragController = null;
let celebrationDispose = null;

root.innerHTML = `
  <section class="reset-screen" data-qk-screen="splash" aria-label="Board Game Reset Ritual"></section>
  <section class="reset-screen" data-qk-screen="play" hidden aria-label="Reset Together"></section>
  <section class="reset-screen" data-qk-screen="end" hidden aria-label="Together Again"></section>
`;

const screens = createScreens({
  root,
  initial: 'splash',
  voice: narrator,
  onExit(name) {
    if (name === 'play' || name === 'end') clearPhase();
  },
});

const artUrls = [
  ...Object.values(config.assets.backgrounds),
  config.assets.title,
  config.assets.play,
  config.assets.spinner,
  config.assets.plaque,
  config.assets.breathe,
  config.assets.basket,
  config.assets.badge,
  ...Object.values(config.assets.characters),
  ...Object.values(config.assets.pawns),
  ...config.assets.pieces.map((piece) => piece.asset),
];

bgm.preload(config.music.track);
const ready = Promise.all([
  voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
  preloadImages(artUrls),
]).then(() => true);

const idleCue = {
  'await-spin': 'idle-spin',
  breathe: 'idle-breathe',
  hug: 'idle-hug',
  tidy: 'idle-tidy',
};

const nudger = createNudger({
  first: 11500,
  repeat: 14000,
  onNudge: () => {
    const key = idleCue[state.phase];
    if (key) say(key);
  },
});

function holdPhase(...disposers) {
  phaseDisposers.push(...disposers.filter((dispose) => typeof dispose === 'function'));
}

function clearPhase() {
  nudger.stop();
  dragController?.cancel?.();
  dragController?.sweepStrayGhosts?.();
  dragController?.detach?.();
  dragController = null;
  for (const dispose of phaseDisposers.splice(0)) {
    try { dispose(); } catch { /* detached controls are already inert */ }
  }
  celebrationDispose?.();
  celebrationDispose = null;
  document.querySelectorAll('[data-qk-drag-ghost], .reset-drag-ghost').forEach((node) => node.remove());
}

function cancelRun({ stopMusic = true } = {}) {
  state.run += 1;
  clearPhase();
  timers.clearAll();
  narrator.stop();
  voice.stop();
  if (stopMusic) bgm.stop();
  state.inputLocked = false;
  return state.run;
}

function image(src, className, alt = '') {
  return `<img class="${className}" src="${src}" alt="${alt}" draggable="false">`;
}

function responsiveBackdrop() {
  return `
    <picture class="responsive-world" aria-hidden="true">
      <source media="(orientation: portrait)" srcset="${config.assets.backgrounds.responsivePortrait}">
      ${image(config.assets.backgrounds.responsiveWide, 'responsive-world-image')}
    </picture>
  `;
}

function onAssistiveClick(node, action) {
  const activate = (event) => {
    if (event.detail !== 0) return;
    event.preventDefault();
    action(event);
  };
  node.addEventListener('click', activate);
  return () => node.removeEventListener('click', activate);
}

function plaque(title, subtitle = '') {
  return `
    <div class="prompt-plaque" aria-live="polite">
      ${image(config.assets.plaque, 'prompt-plaque-art')}
      <div class="prompt-plaque-copy">
        <strong>${title}</strong>
        ${subtitle ? `<span>${subtitle}</span>` : ''}
      </div>
    </div>
  `;
}

function addHud(screen, kind, handler, position, label) {
  const button = hudButton(kind, handler, { label });
  button.classList.add(position);
  button.dataset.target = kind;
  button.dataset.role = 'nav';
  screen.append(button);
  holdPhase(button.dispose);
  return button;
}

function feedback(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if (!state.muted) sfx.tick();
}

function setMuted(on = true) {
  state.muted = Boolean(on);
  narrator.setMuted(state.muted);
  voice.setMuted(state.muted);
  sfx.setMuted(state.muted);
  bgm.setMuted(state.muted);
  return state.muted;
}

function say(key) {
  if (!key || !config.voice[key]) return Promise.resolve(false);
  state.currentCue = key;
  return bgm.duckDuring(narrator.say(key, config.voice[key]));
}

async function saySequence(keys, run = state.run) {
  for (const key of keys) {
    if (run !== state.run) return false;
    await say(key);
  }
  return run === state.run;
}

function repeatCue() {
  return say(state.currentCue || idleCue[state.phase] || 'welcome');
}

function makeMoveDeck() {
  const first = rng() < 0.5 ? 1 : 2;
  const deck = [first, Math.max(1, config.board.resetSpace - first)];
  let position = config.board.resetSpace;
  while (position < config.board.finish) {
    const move = 1 + Math.floor(rng() * 3);
    deck.push(move);
    position += move;
  }
  return deck;
}

function resetState() {
  state.screen = 'play';
  state.phase = 'await-spin';
  state.position = 0;
  state.turn = 0;
  state.moves = makeMoveDeck();
  state.reset = { breathe: false, hug: false, tidy: [] };
  state.currentCue = 'welcome';
  state.inputLocked = false;
}

function pathPoint(index = state.position) {
  return config.board.path[Math.max(0, Math.min(config.board.path.length - 1, index))];
}

function updatePawnPosition(node = screens.el('play')?.querySelector('.board-pawns')) {
  if (!node) return;
  const point = pathPoint();
  node.style.setProperty('--pawn-x', point.x);
  node.style.setProperty('--pawn-y', point.y);
}

function boardPrompt() {
  if (state.reset.breathe && state.position < config.board.finish) {
    return ['Ready to play again!', 'The path is waiting.'];
  }
  return ['Spin together', 'Help Biscuit and Miso reach the star.'];
}

function renderSplash({ announce = false } = {}) {
  cancelRun();
  state.screen = 'splash';
  state.phase = 'splash';
  const screen = screens.el('splash');
  screen.innerHTML = `
    <div class="splash-world">
      ${image(config.assets.backgrounds.splash, 'world-plate splash-plate')}
      <h1 class="visually-hidden">Board Game Reset Ritual</h1>
      ${image(config.assets.title, 'splash-title')}
      ${image(config.assets.characters.highFive, 'splash-friends', 'Biscuit and Miso high five')}
      <button class="art-button splash-play" type="button" data-target="play" data-role="start" aria-label="Play together">
        ${image(config.assets.play, 'art-button-image')}
      </button>
      <p class="visually-hidden">Breathe, hug, tidy, and play again together.</p>
    </div>
  `;
  screens.show('splash', { force: screens.is('splash') });
  addHud(screen, 'home', () => { window.location.href = '../../'; }, 'qk-hud-top-left', 'Back to all games');
  const play = screen.querySelector('[data-target="play"]');
  holdPhase(onTap(play, () => startGame(), { feedback }));
  if (announce) say('welcome');
}

function startMusic() {
  bgm.unlock();
  bgm.play(config.music.track, { key: 'board-game-reset' });
}

function startGame() {
  return screens.start(async () => {
    const run = cancelRun({ stopMusic: true });
    await ready;
    if (run !== state.run) return { ok: false, reason: 'cancelled' };
    resetState();
    screens.show('play');
    startMusic();
    renderBoard();
    await say('welcome');
    return { ok: true, mode: 'together' };
  }, { busy: { ok: false, reason: 'busy' } });
}

function goSplash() {
  renderSplash();
  return true;
}

function renderBoard({ wobble = false } = {}) {
  clearPhase();
  state.screen = 'play';
  const screen = screens.el('play');
  const [title, subtitle] = boardPrompt();
  const showSpinner = state.phase === 'await-spin' || state.phase === 'spinning';
  screen.innerHTML = `
    ${responsiveBackdrop()}
    <div class="scene-frame board-scene ${wobble ? 'is-wobbling' : ''}">
      ${image(config.assets.backgrounds.board, 'world-plate board-plate')}
      <div class="board-pawns ${state.phase === 'moving' ? 'is-moving' : ''}" aria-label="Biscuit and Miso move together">
        ${image(config.assets.pawns.biscuit, 'board-pawn pawn-biscuit', 'Biscuit')}
        ${image(config.assets.pawns.miso, 'board-pawn pawn-miso', 'Miso')}
      </div>
      ${plaque(title, subtitle)}
      ${showSpinner ? `
        <button class="art-button spinner-control ${state.phase === 'spinning' ? 'is-spinning' : ''}" type="button"
                data-target="spinner" data-role="action" aria-label="Spin the wooden spinner" ${state.inputLocked ? 'disabled' : ''}>
          ${image(config.assets.spinner, 'art-button-image')}
        </button>
      ` : ''}
    </div>
  `;
  updatePawnPosition();
  addHud(screen, 'back', goSplash, 'qk-hud-top-left', 'Back to the title');
  addHud(screen, 'sound', soundDebounce(repeatCue, 650), 'qk-hud-bottom-left', 'Hear the directions again');
  const spinner = screen.querySelector('[data-target="spinner"]');
  if (spinner && !state.inputLocked) holdPhase(onTap(spinner, () => spinMove(), { feedback }));
  if (state.phase === 'await-spin') nudger.arm();
}

async function spinMove(forcedValue) {
  if (state.phase !== 'await-spin' || state.inputLocked) return { ok: false, reason: 'not-ready' };
  const run = state.run;
  state.inputLocked = true;
  state.phase = 'spinning';
  renderBoard();
  await Promise.all([say('spin'), timers.wait(reducedMotion ? 120 : 900)]);
  if (run !== state.run) return { ok: false, reason: 'cancelled' };

  const planned = state.moves[state.turn] || 1;
  const move = Number.isFinite(Number(forcedValue))
    ? Math.max(1, Math.min(3, Math.round(Number(forcedValue))))
    : planned;
  state.turn += 1;
  state.phase = 'moving';
  const scene = screens.el('play').querySelector('.board-scene');
  scene?.classList.add('is-moving');
  screens.el('play').querySelector('[data-target="spinner"]')?.remove();
  void say('move');

  for (let step = 0; step < move && state.position < config.board.finish; step += 1) {
    state.position += 1;
    updatePawnPosition();
    if (!state.muted) sfx.pop();
    await timers.wait(reducedMotion ? 80 : 420);
    if (run !== state.run) return { ok: false, reason: 'cancelled' };
  }

  state.inputLocked = false;
  if (state.position >= config.board.finish) {
    showEnd();
    return { ok: true, outcome: 'together' };
  }
  if (state.position === config.board.resetSpace && !state.reset.breathe) {
    await beginSetback();
    return { ok: true, outcome: 'setback' };
  }
  state.phase = 'await-spin';
  renderBoard();
  return { ok: true, move, position: state.position };
}

function ritualProgress() {
  const step = state.phase === 'breathe' || state.phase === 'setback'
    ? 0
    : state.phase === 'hug' ? 1 : 2;
  const entries = [
    { src: config.assets.breathe, label: 'Breathe' },
    { src: config.assets.pieces[0].asset, label: 'Hug' },
    { src: config.assets.basket, label: 'Tidy' },
  ];
  return `
    <div class="ritual-progress" aria-label="Reset ritual: breathe, hug, tidy">
      ${entries.map((entry, index) => `
        <div class="ritual-step ${index < step ? 'is-done' : ''} ${index === step ? 'is-current' : ''}">
          ${image(entry.src, 'ritual-step-art')}
          <span class="visually-hidden">${entry.label}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function setbackMarkup() {
  return `
    <div class="ritual-characters setback-characters">
      ${image(config.assets.characters.biscuitWorried, 'ritual-character biscuit-worried', 'Biscuit feels disappointed')}
      ${image(config.assets.characters.miso, 'ritual-character miso-supportive', 'Miso stays close')}
    </div>
    <div class="setback-pieces" aria-hidden="true">
      ${config.assets.pieces.map((piece, index) => image(piece.asset, `setback-piece piece-${index + 1}`)).join('')}
    </div>
  `;
}

function breatheMarkup() {
  return `
    <div class="ritual-characters breathe-characters" aria-hidden="true">
      ${image(config.assets.characters.biscuitWorried, 'ritual-character biscuit-worried')}
      ${image(config.assets.characters.miso, 'ritual-character miso-supportive')}
    </div>
    <button class="art-button breathe-control" type="button" data-target="breathe" data-role="action" aria-label="Take one slow breath">
      ${image(config.assets.breathe, 'art-button-image')}
    </button>
  `;
}

function hugMarkup() {
  return `
    <button class="hug-slot" type="button" data-hug-slot data-slot="biscuit" data-target="biscuit" data-role="slot"
            aria-label="Tap Biscuit or bring Miso close for a hug">
      ${image(config.assets.characters.biscuitWorried, 'hug-character biscuit-worried')}
    </button>
    <button class="hug-piece" type="button" data-piece="miso" data-target="miso" data-role="piece"
            aria-label="Tap Miso or move Miso to Biscuit for a hug">
      ${image(config.assets.characters.miso, 'hug-character miso-supportive')}
    </button>
  `;
}

function tidyMarkup() {
  const remaining = config.assets.pieces.filter((piece) => !state.reset.tidy.includes(piece.id));
  return `
    ${image(config.assets.characters.hug, 'tidy-friends', 'Biscuit and Miso feel close')}
    <div class="tidy-pieces" aria-label="Loose game pieces">
      ${remaining.map((piece, index) => `
        <button class="tidy-piece tidy-piece-${index + 1}" type="button" data-piece="${piece.id}"
                data-target="piece-${piece.id}" data-role="piece" aria-label="Put the ${piece.label} in the basket">
          ${image(piece.asset, 'tidy-piece-art')}
        </button>
      `).join('')}
    </div>
    <div class="tidy-basket" data-tidy-slot data-slot="basket" data-target="basket" data-role="slot" role="img" aria-label="Toy basket">
      ${image(config.assets.basket, 'tidy-basket-art')}
      <div class="basket-count" aria-hidden="true">
        ${state.reset.tidy.map((id) => image(config.assets.pieces.find((piece) => piece.id === id).asset, 'basket-mini-piece')).join('')}
      </div>
    </div>
  `;
}

function readyMarkup() {
  return `
    ${image(config.assets.characters.highFive, 'ready-friends', 'Biscuit and Miso high five')}
    ${image(config.assets.badge, 'ready-badge')}
    <button class="art-button ready-control" type="button" data-target="resume" data-role="action" aria-label="Return to the board">
      ${image(config.assets.play, 'art-button-image')}
    </button>
  `;
}

function ritualCopy() {
  if (state.phase === 'setback') return ['A wobbly moment', 'Feelings are welcome here.'];
  if (state.phase === 'breathe') return ['1 · Breathe', 'One slow breath together.'];
  if (state.phase === 'hug') return ['2 · Hug', 'Bring Miso close to Biscuit.'];
  if (state.phase === 'tidy') return ['3 · Tidy', 'Put each loose piece in the basket.'];
  return ['Ready again!', 'The friends reset together.'];
}

function renderRitual() {
  clearPhase();
  state.screen = 'play';
  const screen = screens.el('play');
  const [title, subtitle] = ritualCopy();
  let action = setbackMarkup();
  if (state.phase === 'breathe') action = breatheMarkup();
  if (state.phase === 'hug') action = hugMarkup();
  if (state.phase === 'tidy') action = tidyMarkup();
  if (state.phase === 'ready') action = readyMarkup();

  screen.innerHTML = `
    ${responsiveBackdrop()}
    <div class="scene-frame ritual-scene phase-${state.phase}">
      ${image(config.assets.backgrounds.ritual, 'world-plate ritual-plate')}
      ${ritualProgress()}
      ${plaque(title, subtitle)}
      <div class="ritual-action">${action}</div>
    </div>
  `;
  addHud(screen, 'back', goSplash, 'qk-hud-top-left', 'Back to the title');
  addHud(screen, 'sound', soundDebounce(repeatCue, 650), 'qk-hud-bottom-left', 'Hear the ritual step again');

  if (state.phase === 'breathe') {
    const control = screen.querySelector('[data-target="breathe"]');
    holdPhase(onTap(control, () => completeBreathe(), { feedback }));
    nudger.arm();
  } else if (state.phase === 'hug') {
    wireHug(screen);
    nudger.arm();
  } else if (state.phase === 'tidy') {
    wireTidy(screen);
    nudger.arm();
  } else if (state.phase === 'ready') {
    const control = screen.querySelector('[data-target="resume"]');
    holdPhase(onTap(control, resumeBoard, { feedback }));
    if (!reducedMotion) celebrationDispose = burstConfetti({ host: screen, count: 34, duration: 1500 });
  }
}

async function beginSetback() {
  const run = state.run;
  state.inputLocked = true;
  state.phase = 'setback';
  renderRitual();
  if (!reducedMotion) screens.el('play').querySelector('.ritual-scene')?.classList.add('is-wobbling');
  await saySequence(['setback', 'reset-intro'], run);
  if (run !== state.run) return false;
  state.phase = 'breathe';
  state.inputLocked = false;
  renderRitual();
  await say('breathe-prompt');
  return true;
}

async function completeBreathe() {
  if (state.phase !== 'breathe' || state.inputLocked) return { ok: false, reason: 'not-breathe' };
  const run = state.run;
  state.inputLocked = true;
  nudger.stop();
  const control = screens.el('play').querySelector('[data-target="breathe"]');
  control?.classList.add('is-breathing');
  if (!state.muted) sfx.whoosh();
  await Promise.all([say('breathe'), timers.wait(reducedMotion ? 400 : 3600)]);
  if (run !== state.run) return { ok: false, reason: 'cancelled' };
  state.reset.breathe = true;
  state.phase = 'hug';
  state.inputLocked = false;
  renderRitual();
  await say('hug-prompt');
  return { ok: true };
}

function wireHug(screen) {
  const pieceNode = screen.querySelector('[data-piece="miso"]');
  const slotNode = screen.querySelector('[data-hug-slot]');
  holdPhase(onTap(slotNode, () => completeHug(), { feedback }));
  dragController = createDragToSlotDom({
    root: screen,
    ghostHost: screen,
    slotSelector: '[data-hug-slot]',
    slotPad: 56,
    hoverClass: 'is-hovered',
    ghostClass: 'reset-drag-ghost hug-drag-ghost',
    getPiece(id) {
      if (id !== 'miso' || state.phase !== 'hug') return null;
      return { id, el: pieceNode };
    },
    canStart: () => state.phase === 'hug' && !state.inputLocked,
    onGrab() { nudger.poke(); return true; },
    onLift(piece) { piece.el?.classList.add('is-lifting'); if (!state.muted) sfx.whoosh(); },
    onDrop: async (piece, drag) => {
      piece.el?.classList.remove('is-lifting');
      if (drag.slot) await completeHug();
    },
    onCancel(piece) { piece.el?.classList.remove('is-lifting'); },
    onTap: () => completeHug(),
  });
  const pointerDown = (event) => dragController?.begin(event, 'miso');
  pieceNode.addEventListener('pointerdown', pointerDown);
  holdPhase(onAssistiveClick(pieceNode, () => completeHug()));
  holdPhase(() => {
    pieceNode.removeEventListener('pointerdown', pointerDown);
  });
}

async function completeHug() {
  if (state.phase !== 'hug' || state.inputLocked) return { ok: false, reason: 'not-hug' };
  const run = state.run;
  state.inputLocked = true;
  nudger.stop();
  const action = screens.el('play').querySelector('.ritual-action');
  action?.classList.add('is-hugging');
  if (!state.muted) sfx.sparkle();
  await timers.wait(reducedMotion ? 80 : 520);
  if (run !== state.run) return { ok: false, reason: 'cancelled' };
  state.reset.hug = true;
  state.phase = 'tidy';
  state.inputLocked = false;
  renderRitual();
  await saySequence(['hug-done', 'tidy-prompt'], run);
  return { ok: true };
}

function wireTidy(screen) {
  dragController = createDragToSlotDom({
    root: screen,
    ghostHost: screen,
    slotSelector: '[data-tidy-slot]',
    slotPad: 58,
    hoverClass: 'is-hovered',
    ghostClass: 'reset-drag-ghost tidy-drag-ghost',
    getPiece(id) {
      const piece = config.assets.pieces.find((entry) => entry.id === id && !state.reset.tidy.includes(entry.id));
      if (!piece || state.phase !== 'tidy') return null;
      return { ...piece, el: screen.querySelector(`[data-piece="${piece.id}"]`) };
    },
    canStart: () => state.phase === 'tidy' && !state.inputLocked,
    onGrab() { nudger.poke(); return true; },
    onLift(piece) { piece.el?.classList.add('is-lifting'); if (!state.muted) sfx.whoosh(); },
    onDrop: async (piece, drag) => {
      piece.el?.classList.remove('is-lifting');
      if (drag.slot) await tidyPiece(piece.id);
    },
    onCancel(piece) { piece.el?.classList.remove('is-lifting'); },
    onTap: (piece) => tidyPiece(piece.id),
  });

  screen.querySelectorAll('[data-piece]').forEach((node) => {
    const pointerDown = (event) => dragController?.begin(event, node.dataset.piece);
    node.addEventListener('pointerdown', pointerDown);
    holdPhase(onAssistiveClick(node, () => tidyPiece(node.dataset.piece)));
    holdPhase(() => {
      node.removeEventListener('pointerdown', pointerDown);
    });
  });
}

async function tidyPiece(pieceId) {
  if (state.phase !== 'tidy' || state.inputLocked) return { ok: false, reason: 'not-tidy' };
  const piece = config.assets.pieces.find((entry) => entry.id === pieceId);
  if (!piece || state.reset.tidy.includes(pieceId)) return { ok: false, reason: 'unknown-piece' };
  const run = state.run;
  state.inputLocked = true;
  nudger.poke();
  const node = screens.el('play').querySelector(`[data-piece="${pieceId}"]`);
  node?.classList.add('is-flying-home');
  if (!state.muted) sfx.pop();
  await timers.wait(reducedMotion ? 60 : 440);
  if (run !== state.run) return { ok: false, reason: 'cancelled' };
  state.reset.tidy.push(pieceId);

  if (state.reset.tidy.length >= config.assets.pieces.length) {
    state.phase = 'ready';
    state.inputLocked = false;
    renderRitual();
    tada({ confetti: false });
    await saySequence(['tidy-done', 'ready', 'resume'], run);
    return { ok: true, complete: true };
  }

  state.inputLocked = false;
  renderRitual();
  await say(state.reset.tidy.length === 1 ? 'tidy-one' : 'tidy-two');
  return { ok: true, complete: false };
}

function resumeBoard() {
  if (state.phase !== 'ready') return false;
  state.phase = 'await-spin';
  state.inputLocked = false;
  renderBoard();
  return true;
}

function showEnd() {
  clearPhase();
  state.screen = 'end';
  state.phase = 'together';
  state.inputLocked = false;
  const screen = screens.el('end');
  screen.innerHTML = `
    <div class="end-world">
      ${image(config.assets.backgrounds.splash, 'world-plate end-plate')}
      ${image(config.assets.characters.highFive, 'end-friends', 'Biscuit and Miso high five')}
      ${image(config.assets.badge, 'end-badge')}
      ${plaque('Together all the way!', 'Kind hearts can try again.')}
      <button class="art-button end-again" type="button" data-target="again" data-role="again" aria-label="Play again">
        ${image(config.assets.play, 'art-button-image')}
      </button>
    </div>
  `;
  screens.show('end');
  addHud(screen, 'back', goSplash, 'qk-hud-top-left', 'Back to the title');
  const again = screen.querySelector('[data-target="again"]');
  holdPhase(onTap(again, () => startGame(), { feedback }));
  tada({ confetti: false });
  if (!reducedMotion) celebrationDispose = burstConfetti({ host: screen, count: 48, duration: 1900 });
  say('finish');
  return true;
}

async function forceSetback() {
  if (state.screen === 'splash') await startGame();
  if (state.screen !== 'play') return false;
  state.position = config.board.resetSpace;
  state.reset = { breathe: false, hug: false, tidy: [] };
  await beginSetback();
  return true;
}

async function completeRitual() {
  if (state.screen === 'splash') await startGame();
  if (!['setback', 'breathe', 'hug', 'tidy', 'ready'].includes(state.phase)) await forceSetback();
  if (state.phase === 'setback') {
    state.phase = 'breathe';
    renderRitual();
  }
  if (state.phase === 'breathe') await completeBreathe();
  if (state.phase === 'hug') await completeHug();
  while (state.phase === 'tidy') {
    const next = config.assets.pieces.find((piece) => !state.reset.tidy.includes(piece.id));
    if (!next) break;
    await tidyPiece(next.id);
  }
  return state.phase === 'ready';
}

function finishGame() {
  state.position = config.board.finish;
  showEnd();
  return true;
}

async function winRound() {
  if (state.screen === 'splash') await startGame();
  return finishGame();
}

function publicState() {
  return {
    ...state,
    moves: state.moves.slice(),
    reset: { breathe: state.reset.breathe, hug: state.reset.hug, tidy: state.reset.tidy.slice() },
    resetComplete: state.reset.breathe && state.reset.hug && state.reset.tidy.length === config.assets.pieces.length,
    timerScale: timers.getScale(),
    reducedMotion,
  };
}

function debugTap(targetId) {
  const target = root.querySelector(`[data-target="${targetId}"]`);
  if (!target) return false;
  target.click();
  return true;
}

function getLayout() {
  return {
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      orientation: window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait',
    },
    scene: screens.el(state.screen)?.querySelector('.scene-frame')?.getBoundingClientRect().toJSON?.() || null,
    targetSizes: collectTargets(root).map(({ id, rect }) => ({ id, width: rect.w, height: rect.h })),
    reducedMotion,
  };
}

const disposeUnlock = installUnlockOnGesture({ extra: [bgm.unlock] });
const disposeKiosk = installKioskGuards();
const unlockVoice = () => voice.unlock();
window.addEventListener('pointerdown', unlockVoice, { passive: true });

installDebug({
  gameId: config.id,
  engine: 'board-game-reset-dom',
  ready,
  listModes: () => [{ id: 'together', title: 'Reset Together', skill: 'breathe, hug, tidy, and return to play' }],
  startMode: (id = 'together') => id === 'together' ? startGame() : Promise.resolve({ ok: false, reason: 'unknown-mode' }),
  getState: publicState,
  getTargets: () => collectTargets(root),
  tap: debugTap,
  winRound,
  home: goSplash,
  timers,
  narrator,
  voice,
  sfx,
  mute: setMuted,
  onSeed: (nextRng, seed) => {
    rng = nextRng;
    state.seed = seed;
    if (state.screen === 'play' && state.position === 0) state.moves = makeMoveDeck();
  },
  spin: spinMove,
  forceSetback,
  completeBreathe,
  completeHug,
  tidy: tidyPiece,
  completeRitual,
  finishGame,
  getAudioLog: () => voice.getAudioLog(),
  getMusicStats: () => bgm.stats(),
  getLayout,
});

window.addEventListener('pagehide', () => {
  cancelRun();
  disposeUnlock();
  disposeKiosk();
  window.removeEventListener('pointerdown', unlockVoice);
}, { once: true });

renderSplash();
