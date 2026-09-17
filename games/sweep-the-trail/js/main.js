import config from '../config.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as bgm from '../../../shared/js/bgm.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { mulberry32 } from '../../../shared/js/rng.js';
import { createScreens } from '../../../shared/js/screens.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createSweepBoard } from './sweep-board.js';

const $ = (selector) => document.querySelector(selector);
const els = {
  splash: $('#splash'),
  play: $('#play'),
  end: $('#end'),
  splashHud: $('#splash-hud'),
  playHud: $('#play-hud'),
  endHud: $('#end-hud'),
  splashBackground: $('#splash-background'),
  title: $('#title-lockup'),
  cards: $('#mode-cards'),
  playMatte: $('.play-matte'),
  host: $('#sweep-host'),
  tableau: $('#play-tableau'),
  progressLabel: $('#progress-label'),
  progressCount: $('#progress-count'),
  progressPips: $('#progress-pips'),
  endBackground: $('#end-background'),
  endTarget: $('#end-target'),
  endTitle: $('#end-title'),
  endMessage: $('#end-message'),
  stars: $('#star-burst'),
  again: $('#again'),
};

const timers = createTimers();
const modeCopy = {
  'leaf-lane': {
    skill: 'Soft leaves', intro: 'leaf-intro', clear: 'leaf-clear', nudge: 'nudge-one',
    progress: 'Soft leaves', endTitle: 'Leaf Lane is clean!', endMessage: 'The forest path feels cared for.',
  },
  'acorn-bend': {
    skill: 'Rolling acorns', intro: 'acorn-intro', clear: 'acorn-clear', nudge: 'nudge-one',
    progress: 'Round acorns', endTitle: 'Acorn Bend is clean!', endMessage: 'Every acorn is safe in the basket.',
  },
  'porch-path': {
    skill: 'Tiny crumbs', intro: 'porch-intro', clear: 'porch-clear', nudge: 'nudge-porch',
    progress: 'Little crumbs', endTitle: 'Porch Path is clean!', endMessage: 'Every crumb is tucked away.',
  },
};

const state = {
  screen: 'splash',
  mode: null,
  phase: 'splash',
  currentPrompt: 'select-intro',
  remaining: 0,
  total: 0,
  captures: 0,
  nudgeCount: 0,
  muted: false,
  seed: 42,
};

let rng = mulberry32(state.seed);
let board = null;
let idleTimer = 0;
let lastActivityAt = 0;
let lastSwishAt = 0;
let modeCardDisposers = [];

const allImages = [
  ...Object.values(config.assets.backgrounds),
  ...Object.values(config.assets.ui),
  ...Object.values(config.assets.sprites),
  '../../shared/assets/ui/btn-play.png',
];

els.splashBackground.src = config.assets.backgrounds.select;
els.title.src = config.assets.ui.title;
bgm.preload(config.music);
bgm.setVolume(.16);

const voiceReady = voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice);
const ready = Promise.all([voiceReady, preloadImages(allImages)]).then(() => true);

const screens = createScreens({
  screens: { splash: els.splash, play: els.play, end: els.end },
  initial: 'splash',
  voice,
  onExit(name) {
    if (name === 'play') stopPlay();
    if (name === 'end') els.stars.replaceChildren();
  },
  onEnter(name) {
    state.screen = name;
  },
});

installUnlockOnGesture({
  extra: [bgm.unlock],
  onFirst: () => {
    if (screens.is('splash')) speak('select-intro');
  },
});
installKioskGuards();

function modeById(id) {
  return config.modes.find((mode) => mode.id === id) || null;
}

function decorateMode(source) {
  if (!source) return null;
  const copy = modeCopy[source.id] || {};
  const porch = source.id === 'porch-path';
  return {
    ...source,
    copy,
    assets: {
      background: config.assets.backgrounds[source.id],
      broom: config.assets.sprites.broom,
      target: porch ? config.assets.sprites.dustpan : config.assets.sprites.basket,
      helper: config.assets.sprites['squirrel-idle'],
    },
    target: { ...source.target, id: porch ? 'dustpan' : 'basket' },
  };
}

function currentMode() {
  return decorateMode(modeById(state.mode));
}

function speak(key) {
  if (!key) return Promise.resolve();
  state.currentPrompt = key;
  if (state.muted) return Promise.resolve();
  return bgm.duckDuring(voice.say(key, config.voice[key]), { down: .15, downMs: 100, upMs: 320 });
}

function renderModeCards() {
  modeCardDisposers.forEach((dispose) => dispose());
  modeCardDisposers = [];
  els.cards.replaceChildren();

  for (const mode of config.modes) {
    const copy = modeCopy[mode.id] || {};
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mode-card';
    button.dataset.target = `mode-${mode.id}`;
    button.dataset.role = 'neutral';
    button.setAttribute('aria-label', `${mode.title}: ${copy.skill || 'sweep this trail'}`);

    const art = document.createElement('img');
    art.className = 'mode-card-art';
    art.src = config.assets.ui[`mode-${mode.id}`];
    art.alt = '';
    art.draggable = false;

    const label = document.createElement('span');
    label.className = 'mode-card-copy';
    const title = document.createElement('strong');
    title.textContent = mode.title;
    const skill = document.createElement('small');
    skill.textContent = copy.skill || 'Sweep the trail';
    label.append(title, skill);
    button.append(art, label);
    els.cards.append(button);

    modeCardDisposers.push(onTap(button, () => startMode(mode.id), {
      feedback: () => {
        sfx.tick();
        button.classList.add('is-pressed');
        window.setTimeout(() => button.classList.remove('is-pressed'), 170);
      },
    }));
  }
}

function attachHud() {
  const home = hudButton('home', () => { window.location.href = '../../'; });
  home.classList.add('qk-hud-top-left');
  const splashSound = hudButton('sound', soundDebounce(() => speak('select-intro')));
  splashSound.classList.add('qk-hud-top-right');
  els.splashHud.append(home, splashSound);

  const playBack = hudButton('back', () => showSplash({ announce: true }));
  playBack.classList.add('qk-hud-top-left');
  const playSound = hudButton('sound', soundDebounce(() => speak(state.currentPrompt || currentMode()?.copy.intro)));
  playSound.classList.add('qk-hud-top-right');
  els.playHud.append(playBack, playSound);

  const endBack = hudButton('back', () => showSplash({ announce: true }));
  endBack.classList.add('qk-hud-top-left');
  const endSound = hudButton('sound', soundDebounce(() => speak(currentMode()?.copy.clear)));
  endSound.classList.add('qk-hud-top-right');
  els.endHud.append(endBack, endSound);
}

function renderProgress(mode) {
  state.total = mode.debris.length;
  state.remaining = state.total;
  els.progressLabel.textContent = mode.copy.progress || 'Trail pieces';
  els.progressPips.replaceChildren();
  for (const piece of mode.debris) {
    const pip = document.createElement('img');
    pip.className = 'progress-pip';
    pip.src = piece.src;
    pip.alt = '';
    pip.draggable = false;
    els.progressPips.append(pip);
  }
  updateProgress(state.total);
}

function updateProgress(remaining) {
  state.remaining = Math.max(0, Number(remaining) || 0);
  const done = state.total - state.remaining;
  [...els.progressPips.children].forEach((pip, index) => pip.classList.toggle('is-done', index < done));
  els.progressCount.textContent = state.remaining === 1 ? '1 left' : `${state.remaining} left`;
}

function cancelIdleTimer() {
  if (!idleTimer) return;
  timers.clear(idleTimer);
  idleTimer = 0;
}

function scheduleIdleNudge(delay = 7600) {
  cancelIdleTimer();
  if (!board || state.phase !== 'active') return;
  idleTimer = timers.after(delay, () => {
    idleTimer = 0;
    if (!board || state.phase !== 'active') return;
    board.nudge();
    state.nudgeCount += 1;
    speak(currentMode()?.copy.nudge);
    scheduleIdleNudge(9400);
  });
}

function noteActivity() {
  const now = performance.now();
  if (now - lastSwishAt > 620) {
    lastSwishAt = now;
    sfx.whoosh();
  }
  if (now - lastActivityAt < 260) return;
  lastActivityAt = now;
  scheduleIdleNudge();
}

function onPieceCaptured({ remaining }) {
  if (state.phase !== 'active') return;
  state.captures += 1;
  updateProgress(remaining);
  sfx.pop();
  scheduleIdleNudge();

  let line = null;
  if (remaining === state.total - 1) line = 'capture-one';
  else if (remaining === state.total - 2) line = 'capture-two';
  else if (remaining === Math.floor(state.total / 2)) line = 'halfway';
  else if (remaining === 1) line = 'almost';
  if (line) speak(line);
}

function onTrailComplete() {
  if (state.phase !== 'active') return;
  state.phase = 'settling';
  updateProgress(0);
  cancelIdleTimer();
  sfx.sparkle();
  timers.after(480, showEnd);
}

function stopPlay() {
  cancelIdleTimer();
  timers.clearAll();
  board?.destroy();
  board = null;
  els.host.replaceChildren();
}

async function startMode(id) {
  const source = modeById(id);
  if (!source) return false;
  return screens.start(async () => {
    await ready;
    stopPlay();
    state.mode = id;
    state.phase = 'active';
    state.currentPrompt = modeCopy[id]?.intro || 'select-intro';
    state.captures = 0;
    state.nudgeCount = 0;
    lastActivityAt = performance.now();
    lastSwishAt = 0;

    const mode = decorateMode(source);
    els.playMatte.style.backgroundImage = `url("${mode.assets.background}")`;
    renderProgress(mode);
    screens.show('play');
    board = createSweepBoard({
      host: els.host,
      mode,
      rng,
      timers,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      onCapture: onPieceCaptured,
      onComplete: onTrailComplete,
      onActivity: noteActivity,
    });
    timers.after(620, () => {
      if (board && state.phase === 'active') board.nudge();
    });
    bgm.play(config.music, { key: 'sweep-the-trail', fadeInMs: 950, loopFadeOutMs: 2200 });
    scheduleIdleNudge();
    speak(mode.copy.intro);
    return true;
  }, { busy: false });
}

function renderCelebrationStars() {
  els.stars.replaceChildren();
  for (let index = 0; index < 3; index += 1) {
    const stars = document.createElement('img');
    stars.className = 'celebration-stars';
    stars.src = config.assets.sprites['star-cluster'];
    stars.alt = '';
    stars.draggable = false;
    els.stars.append(stars);
  }
}

function showEnd() {
  const mode = currentMode();
  if (!mode) return false;
  els.endBackground.src = mode.assets.background;
  els.endTarget.src = mode.assets.target;
  els.endTarget.alt = mode.target.label;
  els.endTitle.textContent = mode.copy.endTitle;
  els.endMessage.textContent = mode.copy.endMessage;
  renderCelebrationStars();
  screens.show('end');
  state.phase = 'end';
  sfx.tada();
  speak(mode.copy.clear);
  return true;
}

function showSplash({ announce = false } = {}) {
  stopPlay();
  state.mode = null;
  state.phase = 'splash';
  state.currentPrompt = 'select-intro';
  state.remaining = 0;
  state.total = 0;
  screens.show('splash');
  bgm.stop({ fadeOutMs: 650 });
  if (announce) speak('select-intro');
}

function muteAll(on = true) {
  state.muted = Boolean(on);
  voice.setMuted(state.muted);
  sfx.setMuted(state.muted);
  bgm.setMuted(state.muted);
  if (state.muted) voice.stop();
  return state.muted;
}

function getState() {
  return {
    screen: screens.current,
    mode: state.mode,
    phase: state.phase,
    remaining: state.remaining,
    total: state.total,
    captures: state.captures,
    nudgeCount: state.nudgeCount,
    prompt: state.currentPrompt,
    muted: state.muted,
    seed: state.seed,
    board: board?.getState() || null,
  };
}

function getLayout() {
  const rect = (node) => {
    const value = node?.getBoundingClientRect();
    return value ? { x: value.x, y: value.y, w: value.width, h: value.height } : null;
  };
  return {
    viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
    screen: screens.current,
    tableau: rect(els.tableau),
    progress: rect($('#progress-card')),
  };
}

async function debugTap(targetId) {
  if (targetId.startsWith('mode-')) return { accepted: await startMode(targetId.slice(5)) };
  if (targetId.startsWith('debris-') && board) return board.debugSweep(targetId.slice(7));
  if ((targetId === 'basket' || targetId === 'dustpan' || targetId === 'broom') && board) {
    return { accepted: true, state: board.getState() };
  }
  const target = [...document.querySelectorAll('[data-target]')]
    .find((node) => node.dataset.target === targetId && node.getClientRects().length);
  if (!target || target.disabled) return { accepted: false };
  target.click();
  await Promise.resolve();
  return { accepted: true };
}

async function debugWinRound() {
  if (!board || !screens.is('play') || state.phase !== 'active') return false;
  await board.win();
  const deadline = performance.now() + 2600;
  while (!screens.is('end') && performance.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, 25));
  }
  return screens.is('end');
}

installDebug({
  gameId: config.id,
  engine: 'sweep-board',
  ready,
  timers,
  voice,
  sfx,
  listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
  startMode,
  getState,
  getTargets: () => collectTargets(document),
  tap: debugTap,
  winRound: debugWinRound,
  home: () => showSplash(),
  mute: muteAll,
  onSeed(nextRng, seed) {
    rng = nextRng;
    state.seed = seed;
  },
  getLayout,
  getAudioLog: voice.getAudioLog,
  clearAudioLog: voice.clearAudioLog,
  getBgmStats: bgm.stats,
});

renderModeCards();
attachHud();
onTap(els.again, () => state.mode && startMode(state.mode), { feedback: () => sfx.tick() });

window.addEventListener('resize', () => board?.cancel());
window.addEventListener('pagehide', () => {
  stopPlay();
  bgm.stop({ fadeOutMs: 0 });
  voice.stop();
}, { once: true });
