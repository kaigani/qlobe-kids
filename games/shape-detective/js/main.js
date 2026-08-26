import gameConfig from '../config.js';
import * as bgm from '../../../shared/js/bgm.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import { installUnlockOnGesture, installKioskGuards, unlockAll } from '../../../shared/js/audio-unlock.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { escapeHtml } from '../../../shared/js/dom.js';
import { createScene } from '../../../shared/js/hotspot-scene.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createLens } from '../../../shared/js/magnifier-lens.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { createBag, createScreens } from '../../../shared/js/screens.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTimers } from '../../../shared/js/timers.js';

const app = document.getElementById('game');
const timers = createTimers();
const roundBag = createBag();
const activeTargets = new Map();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const SEARCH_ART = { w: 1600, h: 1200 };
const MAP_ART = { w: 1600, h: 900 };

const state = {
  screen: 'loading',
  mode: null,
  phase: 'loading',
  round: 0,
  roundsTotal: 5,
  targetId: null,
  choiceIds: [],
  foundIds: [],
  completedModes: [],
  wrongAttempts: 0,
  accepting: false,
  complete: false,
  muted: false,
  seed: 42,
  assetErrors: [],
  currentVoiceKey: null,
  placement: null,
};

let config = null;
let screens = null;
let rng = mulberry32(state.seed);
let scene = null;
let lens = null;
let drag = null;
let musicStarted = false;
let speechGeneration = 0;
let readyResolve;
const ready = new Promise((resolve) => { readyResolve = resolve; });

const nudger = createNudger({
  first: 10500,
  repeat: 18000,
  onNudge: (count) => {
    if (state.screen !== 'play' || !state.accepting) return;
    const target = state.mode === 'search'
      ? lens?.el
      : app.querySelector(state.mode === 'properties' ? '.shape-choice:not(.is-wrong)' : '.map-movable');
    target?.animate(
      reducedMotion.matches
        ? [{ opacity: 1 }, { opacity: 0.72 }, { opacity: 1 }]
        : [{ transform: 'scale(1)' }, { transform: 'scale(1.07)' }, { transform: 'scale(1)' }],
      { duration: reducedMotion.matches ? 260 : 720, easing: 'ease-out' },
    );
    const key = count === 0 && state.currentVoiceKey
      ? state.currentVoiceKey
      : `idle-${state.mode === 'properties' ? 'property' : state.mode}`;
    speak(key);
  },
});

installDebug({
  gameId: 'shape-detective',
  engine: 'custom-shape-detective',
  ready,
  listModes: () => (config?.modes || []).map(({ id, title, skill }) => ({ id, title, skill })),
  startMode: (id) => startMode(id),
  getState: () => snapshot(),
  tap: (id) => debugTap(id),
  winRound: () => winRound(),
  home: () => showSplash(),
  mute: (on = true) => setMuted(on),
  fastTimers: (scale = 0.05) => setFastTimers(scale),
  timers,
  voice,
  sfx,
  onSeed: (nextRng, seed) => {
    rng = nextRng;
    state.seed = seed;
  },
  choose: (id) => debugTap(id.startsWith('shape-') ? id : `shape-${id}`),
  moveLensTo: (id) => moveLensTo(id),
  placeAt: (x, y) => attemptPlacement(Number(x), Number(y), 'debug'),
  completeMode: () => completeMode(),
  getAudioLog: () => voice.getAudioLog(),
});

boot().catch((error) => {
  console.error('[shape-detective] boot failed', error);
  state.phase = 'error';
  state.assetErrors.push(String(error?.message || error));
  app.innerHTML = '<p class="fatal-message">Shape Detective could not open. Please ask a grown-up to try again.</p>';
  readyResolve({ ok: false, error: String(error?.message || error) });
});

async function boot() {
  config = gameConfig;
  state.roundsTotal = config.rounds;
  bgm.preload(config.assets.bgm);
  bgm.setVolume(0.14);
  await voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice);
  buildShell();
  wireStaticControls();
  screens = createScreens({ root: app, initial: 'splash', voice });
  showSplash();

  installUnlockOnGesture({
    extra: [bgm.unlock],
    onFirst: () => startMusic(),
  });
  installKioskGuards();

  const required = requiredImageUrls();
  await preloadImages(required);
  state.assetErrors = await failedImages(required);
  if (state.assetErrors.length) console.error('[shape-detective] required art failed', state.assetErrors);
  readyResolve({ ok: state.assetErrors.length === 0, assetErrors: [...state.assetErrors] });

  window.addEventListener('pagehide', () => {
    clearInteraction();
    voice.stop();
    bgm.stop({ fadeOutMs: 0 });
  }, { once: true });
}

function buildShell() {
  app.innerHTML = `
    <section class="qk-screen detective-screen splash-screen" data-qk-screen="splash">
      ${hudMarkup('home', 'Home', 'splash-home')}
      ${hudMarkup('sound', 'Hear the welcome again', 'sound')}
      <div class="splash-content">
        <img class="title-lockup" src="${config.assets.title}" alt="Shape Detective" />
        <p class="splash-kicker">Choose a mystery</p>
        <div class="mode-shelf" aria-label="Shape Detective cases"></div>
      </div>
      <div class="chalk-dust chalk-dust-left" aria-hidden="true"></div>
      <div class="chalk-dust chalk-dust-right" aria-hidden="true"></div>
    </section>
    <section class="qk-screen detective-screen play-screen" data-qk-screen="play" hidden>
      ${hudMarkup('back', 'Back to case board', 'back')}
      ${hudMarkup('sound', 'Hear the clue again', 'sound')}
      <div class="case-progress" aria-hidden="true"></div>
      <div class="clue-wrap">
        <img class="clue-plaque" src="${config.assets.ui.cluePlaque}" alt="" />
        <p class="play-prompt" role="status"></p>
      </div>
      <div class="play-host"></div>
    </section>
    <section class="qk-screen detective-screen end-screen" data-qk-screen="end" hidden>
      ${hudMarkup('back', 'Back to case board', 'back')}
      ${hudMarkup('sound', 'Hear the celebration again', 'sound')}
      <div class="end-host"></div>
    </section>
    <p class="visually-hidden" id="shape-detective-live" aria-live="polite"></p>
  `;
}

function hudMarkup(kind, label, target) {
  const corner = kind === 'sound' ? 'qk-hud-top-right' : 'qk-hud-top-left';
  return `<button class="qk-hud-btn qk-hud-${kind} ${corner}" type="button"
    aria-label="${escapeHtml(label)}" data-target="${target}"></button>`;
}

function wireStaticControls() {
  const splash = app.querySelector('[data-qk-screen="splash"]');
  const play = app.querySelector('[data-qk-screen="play"]');
  const end = app.querySelector('[data-qk-screen="end"]');
  wireStatic(splash.querySelector('[data-target="splash-home"]'), () => { window.location.href = '../../'; });
  wireStatic(splash.querySelector('[data-target="sound"]'), () => speak('welcome'));
  wireStatic(play.querySelector('[data-target="back"]'), () => showSplash({ speakWelcome: true }), 'unpop');
  wireStatic(play.querySelector('[data-target="sound"]'), () => repeatPrompt());
  wireStatic(end.querySelector('[data-target="back"]'), () => showSplash({ speakWelcome: true }), 'unpop');
  wireStatic(end.querySelector('[data-target="sound"]'), () => repeatPrompt());
}

function wireStatic(element, action, sfxName = 'tick') {
  onTap(element, action, { feedback: () => feedback(sfxName) });
}

function requiredImageUrls() {
  return [
    config.assets.board,
    config.assets.mapBoard,
    config.assets.searchScene,
    config.assets.title,
    ...Object.values(config.assets.cards),
    ...Object.values(config.assets.shapes),
    ...Object.values(config.assets.ghosts),
    ...Object.values(config.assets.ui),
    ...Object.values(config.assets.rewards),
  ];
}

function failedImages(urls) {
  return Promise.all(urls.map((url) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(null);
    image.onerror = () => resolve(url);
    image.src = url;
  }))).then((results) => results.filter(Boolean));
}

function feedback(name = 'tick') {
  unlockAll([bgm.unlock]);
  startMusic();
  if (typeof sfx[name] === 'function') sfx[name]();
}

function startMusic() {
  if (musicStarted || !config) return;
  musicStarted = true;
  bgm.play(config.assets.bgm, { key: 'shape-detective', fadeInMs: 750 });
}

function setMuted(on = true) {
  const muted = Boolean(on);
  state.muted = muted;
  voice.setMuted(muted);
  sfx.setMuted(muted);
  bgm.setMuted(muted);
  if (muted) voice.stop();
  return muted;
}

function setFastTimers(scale = 0.05) {
  const value = Number(scale);
  const raw = Number.isFinite(value) && value > 0 ? (value > 1 ? 1 / value : value) : 0.05;
  const multiplier = Math.min(1, Math.max(0.01, raw));
  timers.setScale(1 / multiplier);
  lens?.setDwell({ ms: 420 * multiplier });
  return multiplier;
}

function speak(key, fallback = config?.voice?.[key] || '') {
  if (!key || !config) return Promise.resolve();
  speechGeneration += 1;
  return bgm.duckDuring(voice.say(key, fallback), { down: 0.2, downMs: 90, upMs: 320 });
}

// Hold the solved board long enough for a child to register the result, then
// wait for the complete success line before replacing the play field. The
// fixed timer previously cut off longer recorded clips (most visibly on Chalk
// Map round 3) when resetPlayHost() stopped the old voice for the next round.
// A generation guard also makes replaying a line or leaving the screen
// invalidate this pending transition.
function advanceAfterVoice(key, minimumMs = 1500) {
  const modeAtStart = state.mode;
  const roundAtStart = state.round;
  const spoken = speak(key);
  const generationAtStart = speechGeneration;
  const minimumHold = timers.wait(minimumMs);
  Promise.all([spoken, minimumHold]).then(() => {
    if (state.screen !== 'play'
        || state.mode !== modeAtStart
        || state.round !== roundAtStart
        || state.accepting
        || speechGeneration !== generationAtStart) return;
    advanceRound();
  });
}

function repeatPrompt() {
  return speak(state.currentVoiceKey || (state.screen === 'splash' ? 'welcome' : 'pick-case'));
}

function setPrompt(text, key) {
  const prompt = app.querySelector('.play-prompt');
  if (prompt) prompt.textContent = text || '';
  state.currentVoiceKey = key || null;
  const live = app.querySelector('#shape-detective-live');
  if (live) live.textContent = text || '';
}

function registerTap(element, id, action, sfxName = 'pop') {
  if (!element) return;
  element.dataset.target = id;
  activeTargets.set(id, action);
  roundBag.add(onTap(element, action, { feedback: () => feedback(sfxName) }));
}

function activateHud(screenName) {
  activeTargets.clear();
  if (screenName === 'splash') {
    activeTargets.set('splash-home', () => { window.location.href = '../../'; });
    activeTargets.set('home', () => { window.location.href = '../../'; });
    activeTargets.set('sound', () => speak('welcome'));
  } else {
    activeTargets.set('back', () => showSplash({ speakWelcome: true }));
    activeTargets.set('sound', () => repeatPrompt());
  }
}

function clearInteraction({ stopVoice = true } = {}) {
  timers.clearAll();
  nudger.stop();
  roundBag.run();
  activeTargets.clear();
  destroySearch();
  cancelDrag();
  if (stopVoice) {
    speechGeneration += 1;
    voice.stop();
  }
}

function showSplash({ speakWelcome = false } = {}) {
  if (!config || !screens) return false;
  clearInteraction();
  screens.show('splash');
  state.screen = 'splash';
  state.mode = null;
  state.phase = 'choose-mode';
  state.round = 0;
  state.targetId = null;
  state.choiceIds = [];
  state.foundIds = [];
  state.wrongAttempts = 0;
  state.accepting = true;
  state.complete = false;
  state.placement = null;
  state.currentVoiceKey = 'welcome';
  activateHud('splash');
  renderModeShelf();
  if (speakWelcome) speak('welcome');
  return true;
}

function renderModeShelf() {
  const host = app.querySelector('.mode-shelf');
  host.innerHTML = config.modes.map((mode, index) => {
    const earned = state.completedModes.includes(mode.id);
    return `
      <button class="mode-card mode-card-${mode.id} ${earned ? 'is-solved' : ''}" type="button"
        data-mode="${mode.id}" aria-label="${escapeHtml(mode.title)}${earned ? ', solved' : ''}">
        <img class="mode-card-art" src="${config.assets.cards[mode.card]}" alt="" />
        <span class="mode-card-title">${escapeHtml(mode.title)}</span>
        ${earned ? `<img class="earned-rosette" src="${config.assets.rewards[mode.id]}" alt="" />` : ''}
      </button>
    `;
  }).join('');
  host.querySelectorAll('.mode-card').forEach((button, index) => {
    const id = button.dataset.mode;
    button.style.setProperty('--card-turn', `${[-2.4, 1.7, -0.8][index]}deg`);
    registerTap(button, `mode-${id}`, () => startMode(id), 'pop');
  });
}

async function startMode(modeId) {
  await ready;
  if (!config || !screens) return false;
  const mode = currentMode(modeId);
  if (!mode) return false;
  clearInteraction();
  screens.show('play', { force: state.screen === 'play' });
  state.screen = 'play';
  state.mode = mode.id;
  state.phase = 'starting';
  state.round = 0;
  state.roundsTotal = mode.rounds.length;
  state.targetId = null;
  state.choiceIds = [];
  state.foundIds = [];
  state.wrongAttempts = 0;
  state.accepting = false;
  state.complete = false;
  state.placement = null;
  activateHud('play');
  renderRound({ speakNow: false });
  const openingMode = mode.id;
  const openingRound = state.round;
  speak(mode.introKey).then(() => {
    if (state.screen === 'play' && state.mode === openingMode
        && state.round === openingRound && state.accepting) {
      speak(state.currentVoiceKey);
    }
  });
  return true;
}

function currentMode(id = state.mode) {
  return config?.modes?.find((mode) => mode.id === id) || null;
}

function currentRound() {
  return currentMode()?.rounds?.[state.round] || null;
}

function resetPlayHost() {
  clearInteraction({ stopVoice: true });
  state.screen = 'play';
  activateHud('play');
  const host = app.querySelector('.play-host');
  host.className = 'play-host';
  host.innerHTML = '';
  return host;
}

function updateProgress(done = state.round) {
  const host = app.querySelector('.case-progress');
  host.innerHTML = Array.from({ length: state.roundsTotal }, (_, index) => {
    const reward = config.assets.rewards[state.mode] || config.assets.rewards.properties;
    const className = index < done ? 'is-done' : index === done ? 'is-now' : '';
    return `<img class="progress-mark ${className}" src="${reward}" alt="" />`;
  }).join('');
}

function renderRound({ speakNow = true } = {}) {
  const round = currentRound();
  if (!round) {
    completeMode();
    return;
  }
  if (state.mode === 'properties') renderPropertyRound(round, { speakNow });
  else if (state.mode === 'search') renderSearchRound(round, { speakNow });
  else renderPlaceRound(round, { speakNow });
}

function renderPropertyRound(round, { speakNow = true } = {}) {
  const host = resetPlayHost();
  state.phase = 'property-choice';
  state.targetId = round.target;
  state.wrongAttempts = 0;
  state.accepting = true;
  const choices = shuffle(round.choices, rng);
  state.choiceIds = choices.map(({ shape }) => shape);
  host.classList.add('property-host');
  host.innerHTML = `
    <div class="detective-pool" aria-label="Choose the shape that matches the clue">
      ${choices.map(({ shape, rotation }, index) => `
        <button class="shape-choice" type="button" data-shape="${shape}"
          data-role="${shape === round.target ? 'correct' : 'wrong'}"
          style="--shape-turn:${Number(rotation) || 0}deg"
          aria-label="${escapeHtml(shape)}">
          <img src="${config.assets.shapes[shape]}" alt="" draggable="false" />
          <span class="choice-name">${escapeHtml(shape)}</span>
        </button>
      `).join('')}
    </div>
  `;
  updateProgress();
  const key = `${round.id}-prompt`;
  setPrompt(config.voice[key], key);
  host.querySelectorAll('.shape-choice').forEach((button, index) => {
    registerTap(button, `shape-${button.dataset.shape}-${index}`, () => chooseProperty(button.dataset.shape, button));
    if (!activeTargets.has(`shape-${button.dataset.shape}`)) {
      activeTargets.set(`shape-${button.dataset.shape}`, () => chooseProperty(button.dataset.shape, button));
    }
  });
  nudger.arm();
  if (speakNow) speak(key);
}

function chooseProperty(shape, button = app.querySelector(`.shape-choice[data-shape="${shape}"]`)) {
  if (!state.accepting || state.mode !== 'properties') return false;
  nudger.poke();
  if (shape === state.targetId) {
    state.accepting = false;
    button?.classList.add('is-correct');
    app.querySelectorAll('.shape-choice').forEach((choice) => { choice.disabled = true; });
    sfx.sparkle();
    makeChalkBurst(button);
    const key = `${currentRound().id}-success`;
    setPrompt(config.voice[key], key);
    advanceAfterVoice(key);
    return true;
  }
  state.wrongAttempts += 1;
  button?.classList.add('is-wrong');
  button?.animate(
    reducedMotion.matches
      ? [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }]
      : [{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(0)' }],
    { duration: reducedMotion.matches ? 180 : 340, easing: 'ease-out' },
  );
  speak('retry-property');
  if (state.wrongAttempts >= 2) {
    app.querySelector('.shape-choice[data-role="correct"]')?.classList.add('is-hint');
  }
  return false;
}

function renderSearchRound(round, { speakNow = true } = {}) {
  const host = resetPlayHost();
  state.phase = 'searching';
  state.targetId = round.target;
  state.choiceIds = round.spots.map(({ id }) => id);
  state.foundIds = [];
  state.wrongAttempts = 0;
  state.accepting = true;
  host.classList.add('search-host');
  host.innerHTML = '<div class="search-scene-mount" aria-label="Search the chalk scene with the magnifying glass"></div>';
  updateProgress();
  const key = `${round.id}-prompt`;
  setPrompt(config.voice[key], key);

  const mount = host.querySelector('.search-scene-mount');
  scene = createScene(mount, {
    artW: SEARCH_ART.w,
    artH: SEARCH_ART.h,
    background: config.assets.searchScene,
    minHit: 104,
    ariaLabel: 'Secret Spots chalk scene',
  });

  const handles = new Map();
  for (const spot of round.spots) {
    const handle = scene.addHotspot({
      id: spot.id,
      x: spot.x,
      y: spot.y,
      w: spot.w,
      h: spot.h,
      sprite: null,
      enabled: false,
      alt: spot.alt,
      hitPad: 16,
    });
    handles.set(spot.id, handle);
  }

  scene.onTap((id) => chooseSearchSpot(id, handles.get(id)));
  lens = createLens(scene, {
    zoom: 1.72,
    glassD: 310,
    background: config.assets.searchScene,
    frame: {
      url: config.assets.ui.magnifier,
      scale: 2.02,
      anchor: { x: 0.42, y: 0.37 },
    },
    sprites: round.spots.map((spot) => ({
      id: spot.id,
      url: config.assets.shapes[spot.shape],
      x: spot.x,
      y: spot.y,
      w: spot.w,
      h: spot.h,
    })),
    // Begin in clear board space so the first clue is always child-discovered.
    // This point remains outside every authored hotspot's 128px dwell radius.
    start: { x: 1070, y: 800 },
    dwellMs: timers.ms(420),
    dwellRadiusArt: 128,
    ariaLabel: 'Move the magnifying glass to reveal shapes',
  });

  lens.onDwell(({ id }) => revealSearchSpot(id, handles.get(id)));
  roundBag.add(() => destroySearch());
  nudger.arm();
  if (speakNow) speak(key);
}

async function revealSearchSpot(id, handle) {
  if (!state.accepting || !lens || !handle || state.foundIds.includes(id)) return false;
  state.foundIds.push(id);
  lens.markFound(id);
  await handle.setSprite(config.assets.shapes[spotById(id)?.shape]);
  await handle.pop();
  if (!state.accepting || state.mode !== 'search' || !lens || !scene
      || !state.foundIds.includes(id)) return false;
  handle.setEnabled(true);
  handle.el.dataset.target = `spot-${id}`;
  handle.el.dataset.role = id === state.targetId ? 'correct' : 'wrong';
  lens.glint();
  sfx.sparkle();
  activeTargets.set(`spot-${id}`, () => chooseSearchSpot(id, handle));
  return true;
}

function spotById(id) {
  return currentRound()?.spots?.find((spot) => spot.id === id) || null;
}

function chooseSearchSpot(id, handle = scene?.get(id)) {
  if (!state.accepting || state.mode !== 'search' || !state.foundIds.includes(id)) return false;
  nudger.poke();
  if (id === state.targetId) {
    state.accepting = false;
    lens?.setEnabled(false);
    scene?.setEnabled(false);
    handle?.setState('found');
    handle?.pop();
    sfx.tada();
    const key = `${currentRound().id}-success`;
    setPrompt(config.voice[key], key);
    advanceAfterVoice(key, 1550);
    return true;
  }
  state.wrongAttempts += 1;
  handle?.wiggle();
  speak('retry-search');
  if (state.wrongAttempts >= 2) {
    const target = spotById(state.targetId);
    if (target) lens?.moveTo(target.x, target.y, { animate: true, ms: timers.ms(520) });
  }
  return false;
}

function destroySearch() {
  if (lens) {
    lens.destroy();
    lens = null;
  }
  if (scene) {
    scene.destroy();
    scene = null;
  }
}

function moveLensTo(id) {
  const spot = spotById(id);
  if (!spot || !lens) return false;
  return lens.moveTo(spot.x, spot.y, { animate: false, settle: false }).then(() => true);
}

function renderPlaceRound(round, { speakNow = true } = {}) {
  const host = resetPlayHost();
  state.phase = 'placing';
  state.targetId = `${round.id}-target`;
  state.choiceIds = [round.moving];
  state.wrongAttempts = 0;
  state.accepting = true;
  state.placement = { moving: round.moving, x: null, y: null, placed: false, selected: false };
  host.classList.add('place-host');
  host.innerHTML = `
    <div class="map-shell">
      <div class="map-board" aria-label="Chalk map board">
        <img class="map-board-art" src="${config.assets.mapBoard}" alt="" draggable="false" />
        ${round.anchors.map((anchor) => `
          <img class="map-anchor ${anchor.inside ? 'is-container' : ''}"
            src="${config.assets.shapes[anchor.shape]}" alt="${escapeHtml(anchor.shape)}"
            style="--x:${anchor.x};--y:${anchor.y};--size:${anchor.size}" draggable="false" />
        `).join('')}
        <img class="placement-ghost" src="${config.assets.ghosts[round.moving]}" alt=""
          style="--x:${round.target.x};--y:${round.target.y}" aria-hidden="true" />
        <button class="map-target" type="button" data-role="correct"
          aria-label="Place ${escapeHtml(round.moving)} ${escapeHtml(round.relation)}"
          style="--x:${round.target.x};--y:${round.target.y};--radius:${round.target.radius}"></button>
      </div>
      <div class="shape-tray">
        <img class="tray-slab" src="${config.assets.ui.actionSlab}" alt="" />
        <button class="map-movable" type="button" aria-label="Move the ${escapeHtml(round.moving)}"
          data-moving="${round.moving}">
          <img src="${config.assets.shapes[round.moving]}" alt="" draggable="false" />
          <span class="move-label">Move me</span>
        </button>
      </div>
    </div>
  `;
  updateProgress();
  const key = `${round.id}-prompt`;
  setPrompt(config.voice[key], key);
  const movable = host.querySelector('.map-movable');
  const board = host.querySelector('.map-board');
  const target = host.querySelector('.map-target');
  setupMapDrag(movable, board);
  registerTap(movable, `move-${round.moving}`, () => selectMovable(movable), 'pop');
  registerTap(target, state.targetId, () => attemptPlacement(round.target.x, round.target.y, 'tap-target'), 'tick');
  const onBoardClick = (event) => {
    if (!state.placement?.selected || !state.accepting || event.target.closest('.map-target')) return;
    const point = boardPoint(event.clientX, event.clientY, board);
    attemptPlacement(point.x, point.y, 'tap-board');
  };
  board.addEventListener('click', onBoardClick);
  roundBag.add(() => board.removeEventListener('click', onBoardClick));
  nudger.arm();
  if (speakNow) speak(key);
}

function selectMovable(element) {
  if (!state.accepting || state.mode !== 'place') return false;
  state.placement.selected = true;
  element.classList.add('is-selected');
  element.setAttribute('aria-pressed', 'true');
  nudger.poke();
  return true;
}

function setupMapDrag(element, board) {
  const onDown = (event) => {
    if (!state.accepting || event.isPrimary === false) return;
    selectMovable(element);
    const rect = element.getBoundingClientRect();
    drag = {
      id: event.pointerId,
      element,
      board,
      dx: event.clientX - (rect.left + rect.width / 2),
      dy: event.clientY - (rect.top + rect.height / 2),
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    element.classList.add('is-dragging');
    element.setPointerCapture?.(event.pointerId);
  };
  const onMove = (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.moved = drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 8;
    element.style.transform = `translate3d(${event.clientX - drag.startX}px, ${event.clientY - drag.startY}px, 0) scale(1.08)`;
  };
  const finish = (event, cancelled = false) => {
    if (!drag || (event?.pointerId != null && drag.id !== event.pointerId)) return;
    const current = drag;
    drag = null;
    element.classList.remove('is-dragging');
    element.style.transform = '';
    if (!cancelled && current.moved) {
      const point = boardPoint(current.x - current.dx, current.y - current.dy, board);
      attemptPlacement(point.x, point.y, 'drag');
    }
  };
  const onUp = (event) => finish(event, false);
  const onCancel = (event) => finish(event, true);
  const onBlur = () => finish(null, true);
  element.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('blur', onBlur);
  roundBag.add(() => {
    element.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('blur', onBlur);
  });
}

function boardPoint(clientX, clientY, board = app.querySelector('.map-board')) {
  const rect = board?.getBoundingClientRect();
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return { x: -1, y: -1 };
  return {
    x: ((clientX - rect.left) / rect.width) * MAP_ART.w,
    y: ((clientY - rect.top) / rect.height) * MAP_ART.h,
  };
}

function attemptPlacement(x, y, source = 'unknown') {
  if (!state.accepting || state.mode !== 'place') return false;
  const round = currentRound();
  if (!round || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  nudger.poke();
  const distance = Math.hypot(x - round.target.x, y - round.target.y);
  if (distance <= round.target.radius) {
    state.accepting = false;
    state.placement = { ...state.placement, x: round.target.x, y: round.target.y, placed: true, selected: false, source };
    const board = app.querySelector('.map-board');
    const placed = document.createElement('img');
    placed.className = 'map-placed is-arriving';
    placed.src = config.assets.shapes[round.moving];
    placed.alt = `${round.moving} placed ${round.relation}`;
    placed.style.setProperty('--x', round.target.x);
    placed.style.setProperty('--y', round.target.y);
    board?.appendChild(placed);
    app.querySelector('.map-movable')?.classList.add('is-placed');
    app.querySelector('.map-target')?.setAttribute('disabled', '');
    sfx.tada();
    makeChalkBurst(placed);
    const key = `${round.id}-success`;
    setPrompt(config.voice[key], key);
    advanceAfterVoice(key);
    return true;
  }
  state.wrongAttempts += 1;
  state.placement = { ...state.placement, x, y, placed: false, selected: false, source };
  const movable = app.querySelector('.map-movable');
  movable?.classList.remove('is-selected');
  movable?.setAttribute('aria-pressed', 'false');
  movable?.animate(
    reducedMotion.matches
      ? [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }]
      : [{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(0)' }],
    { duration: reducedMotion.matches ? 180 : 340, easing: 'ease-out' },
  );
  speak('retry-place');
  if (state.wrongAttempts >= 2) app.querySelector('.placement-ghost')?.classList.add('is-visible');
  return false;
}

function cancelDrag() {
  if (!drag) return;
  drag.element?.classList.remove('is-dragging');
  drag.element?.style.removeProperty('transform');
  drag = null;
}

function makeChalkBurst(source) {
  if (!source || reducedMotion.matches) return;
  const rect = source.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = 'chalk-burst';
  layer.style.left = `${rect.left + rect.width / 2}px`;
  layer.style.top = `${rect.top + rect.height / 2}px`;
  const reward = config.assets.rewards[state.mode] || config.assets.rewards.properties;
  layer.innerHTML = Array.from({ length: 7 }, (_, index) => (
    `<img src="${reward}" alt="" style="--burst-i:${index}" />`
  )).join('');
  document.body.appendChild(layer);
  roundBag.add(() => layer.remove());
  timers.after(920, () => layer.remove());
}

function advanceRound() {
  if (state.screen !== 'play') return false;
  state.round += 1;
  if (state.round >= state.roundsTotal) {
    completeMode();
  } else {
    renderRound();
  }
  return true;
}

function winRound() {
  if (!state.accepting || state.screen !== 'play') return false;
  if (state.mode === 'properties') return chooseProperty(state.targetId);
  if (state.mode === 'search') {
    const spot = spotById(state.targetId);
    if (!spot || !lens) return false;
    return lens.moveTo(spot.x, spot.y, { animate: false, settle: false }).then(async () => {
      await timers.wait(520);
      return chooseSearchSpot(state.targetId, scene?.get(state.targetId));
    });
  }
  const target = currentRound()?.target;
  return target ? attemptPlacement(target.x, target.y, 'debug-win') : false;
}

function completeMode() {
  if (!state.mode || state.complete) return false;
  const finishedMode = state.mode;
  const mode = currentMode(finishedMode);
  state.complete = true;
  state.accepting = false;
  state.phase = 'mode-complete';
  if (!state.completedModes.includes(finishedMode)) state.completedModes.push(finishedMode);
  clearInteraction({ stopVoice: true });
  screens.show('end');
  state.screen = 'end';
  activateHud('end');
  const finale = state.completedModes.length === config.modes.length;
  const key = finale ? 'finale' : mode.completeKey;
  state.currentVoiceKey = key;
  const host = app.querySelector('.end-host');
  host.innerHTML = `
    <div class="case-closed-card ${finale ? 'is-finale' : ''}">
      ${finale ? `
        <div class="finale-case-fan" aria-hidden="true">
          ${config.modes.map((item) => (
            `<img src="${config.assets.cards[item.card]}" alt="" />`
          )).join('')}
        </div>
      ` : ''}
      <img class="case-closed-stamp" src="${config.assets.ui.caseClosed}" alt="" />
      <p class="case-closed-title">${finale ? 'Master Shape Detective!' : 'Case closed!'}</p>
      <div class="badge-line" aria-label="${state.completedModes.length} cases solved">
        ${config.modes.map((item) => (
          state.completedModes.includes(item.id)
            ? `<img src="${config.assets.rewards[item.id]}" alt="${escapeHtml(item.title)} solved" />`
            : `<img class="is-missing" src="${config.assets.rewards[item.id]}" alt="" />`
        )).join('')}
      </div>
      <button class="action-button" type="button">
        <img src="${config.assets.ui.actionSlab}" alt="" />
        <span>${finale ? 'Play again' : 'Choose a case'}</span>
      </button>
    </div>
  `;
  const action = host.querySelector('.action-button');
  registerTap(action, 'end-continue', () => {
    if (finale) state.completedModes = [];
    showSplash({ speakWelcome: false });
  }, 'pop');
  sfx.tada();
  makeChalkBurst(host.querySelector('.case-closed-stamp'));
  speak(key);
  return true;
}

function debugTap(id) {
  const key = String(id || '');
  const direct = activeTargets.get(key);
  if (direct) return direct();
  const target = [...activeTargets.entries()].find(([name]) => name === key || name.endsWith(`-${key}`));
  return target ? target[1]() : false;
}

function snapshot() {
  return {
    screen: state.screen,
    mode: state.mode,
    phase: state.phase,
    round: state.round,
    roundsTotal: state.roundsTotal,
    targetId: state.targetId,
    choiceIds: [...state.choiceIds],
    foundIds: [...state.foundIds],
    completedModes: [...state.completedModes],
    wrongAttempts: state.wrongAttempts,
    accepting: state.accepting,
    complete: state.complete,
    muted: state.muted,
    seed: state.seed,
    assetErrors: [...state.assetErrors],
    currentVoiceKey: state.currentVoiceKey,
    placement: state.placement ? { ...state.placement } : null,
    lens: lens?.getState() || null,
    targets: [...activeTargets.keys()],
    timers: timers.size(),
  };
}
