import config from '../config.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as bgm from '../../../shared/js/bgm.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { createScreens } from '../../../shared/js/screens.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createPourGesture } from './pour-gesture.js';
import { createPourSound } from './pour-sound.js';

const $ = (selector) => document.querySelector(selector);
const els = {
  game: $('#game'),
  splash: $('#splash'),
  play: $('#play'),
  reveal: $('#reveal'),
  splashHud: $('#splash-hud'),
  playHud: $('#play-hud'),
  revealHud: $('#reveal-hud'),
  cards: $('#mode-cards'),
  progress: $('#progress'),
  work: $('#work-area'),
  pitcher: $('#pitcher'),
  sourceFill: $('#source-fill'),
  stream: $('#stream'),
  cup: $('#cup-zone'),
  cupFill: $('#cup-fill'),
  targetGlow: $('#target-glow'),
  guide: $('#guide-hand'),
  spark: $('#landing-spark'),
  promptToken: $('#prompt-token'),
  promptText: $('#prompt-text'),
  revealTitle: $('#reveal-title'),
  revealCopy: $('#reveal-copy'),
  again: $('#again'),
  tidy: $('#tidy-note'),
};

const timers = createTimers();
const pourSound = createPourSound();
const roundsTotal = Math.max(1, Number(config.roundsPerMode) || 3);
const targets = config.targetLevels?.length ? config.targetLevels : [.42, .58, .7];

const state = {
  mode: null,
  round: 0,
  completed: 0,
  target: targets[0],
  fill: 0,
  source: .88,
  phase: 'splash',
  awaitingInput: false,
  dragging: false,
  pouring: false,
  tilt: 0,
  currentPrompt: 'welcome',
  muted: false,
  hasInteracted: false,
};

let gesture = null;
let frameId = 0;
let lastFrameAt = 0;
let soundActive = false;
let confettiDispose = null;
let modeCardDisposers = [];

document.documentElement.style.setProperty('--accent', config.theme.accent);
bgm.preload(config.theme.music);
bgm.setVolume(.17);

const voiceReady = voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice);
const imageUrls = [
  config.theme.background,
  './assets/ui/title-plaque.webp',
  './assets/ui/reward-star.webp',
  './assets/ui/guide-hand.webp',
  './assets/ui/cleanup-cloth.webp',
  './assets/items/pitcher.webp',
  './assets/items/cup.webp',
  './assets/characters/maya-helper.webp',
  ...config.modes.flatMap((mode) => [mode.token, mode.fill, mode.stream]),
];
const ready = Promise.all([voiceReady, preloadImages(imageUrls)]).then(() => true);

installUnlockOnGesture({
  extra: [bgm.unlock, pourSound.unlock],
  onFirst: () => bgm.play(config.theme.music, { key: 'pouring-station', fadeInMs: 1100 }),
});
installKioskGuards();

const screens = createScreens({
  screens: { splash: els.splash, play: els.play, reveal: els.reveal },
  initial: 'splash',
  voice,
  onExit(name) {
    if (name === 'play') stopPlay();
    if (name === 'reveal') {
      confettiDispose?.();
      confettiDispose = null;
      els.tidy.classList.remove('is-visible');
    }
  },
});

function modeById(id) {
  return config.modes.find((candidate) => candidate.id === id) || null;
}

function speak(key) {
  state.currentPrompt = key;
  if (state.muted) return Promise.resolve();
  return bgm.duckDuring(voice.say(key, config.voice[key]), { down: .16, downMs: 110, upMs: 330 });
}

function currentMode() {
  return modeById(state.mode);
}

function renderModeCards() {
  modeCardDisposers.forEach((dispose) => dispose());
  modeCardDisposers = [];
  els.cards.replaceChildren();
  for (const mode of config.modes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mode-card';
    button.dataset.target = `mode-${mode.id}`;
    button.dataset.role = 'neutral';
    button.setAttribute('aria-label', `Pour ${mode.title}`);

    const art = document.createElement('img');
    art.src = mode.token;
    art.alt = '';
    art.draggable = false;
    const label = document.createElement('span');
    label.textContent = mode.title;
    button.append(art, label);
    els.cards.append(button);

    modeCardDisposers.push(onTap(button, () => startMode(mode.id), {
      feedback: () => {
        button.classList.add('is-pressed');
        window.setTimeout(() => button.classList.remove('is-pressed'), 160);
        sfx.tick();
      },
    }));
  }
}

function attachHud() {
  const home = hudButton('home', () => { window.location.href = '../../'; });
  home.classList.add('qk-hud-top-left');
  const splashSound = hudButton('sound', soundDebounce(() => speak('welcome')));
  splashSound.classList.add('qk-hud-top-right');
  els.splashHud.append(home, splashSound);

  const playBack = hudButton('back', () => showSplash({ speakPrompt: true }));
  playBack.classList.add('qk-hud-top-left');
  const playSound = hudButton('sound', soundDebounce(() => speak(state.currentPrompt || currentMode()?.intro || 'first-pour')));
  playSound.classList.add('qk-hud-top-right');
  els.playHud.append(playBack, playSound);

  const revealBack = hudButton('back', () => showSplash({ speakPrompt: true }));
  revealBack.classList.add('qk-hud-top-left');
  const revealSound = hudButton('sound', soundDebounce(() => speak(currentMode()?.cheer || 'again')));
  revealSound.classList.add('qk-hud-top-right');
  els.revealHud.append(revealBack, revealSound);
}

function renderProgress() {
  els.progress.replaceChildren();
  for (let index = 0; index < roundsTotal; index += 1) {
    const star = document.createElement('span');
    star.className = 'round-star';
    if (index < state.completed) star.classList.add('is-done');
    else if (index === state.completed) star.classList.add('is-current');
    els.progress.append(star);
  }
}

function setVisualFill() {
  document.documentElement.style.setProperty('--fill-level', state.fill.toFixed(4));
  document.documentElement.style.setProperty('--source-level', state.source.toFixed(4));
  document.documentElement.style.setProperty('--target-level', state.target.toFixed(4));
}

function setPitcherPose({ x = 0, y = 0, angle = 0 } = {}) {
  document.documentElement.style.setProperty('--pitcher-x', `${x.toFixed(1)}px`);
  document.documentElement.style.setProperty('--pitcher-y', `${y.toFixed(1)}px`);
  document.documentElement.style.setProperty('--pitcher-angle', `${angle.toFixed(1)}deg`);
  updateStreamGeometry({ x, y, angle });
}

function updateStreamGeometry({ x = 0, y = 0, angle = 0 } = {}) {
  if (!els.work.offsetWidth || !els.pitcher.offsetWidth || !els.cup.offsetWidth) return;

  const width = els.pitcher.offsetWidth;
  const height = els.pitcher.offsetHeight;
  const pivotX = width * .22;
  const pivotY = height * .32;
  const spoutX = width * .16;
  const spoutY = height * .20;
  const radians = angle * Math.PI / 180;
  const dx = spoutX - pivotX;
  const dy = spoutY - pivotY;
  const startX = els.pitcher.offsetLeft + x + pivotX + dx * Math.cos(radians) - dy * Math.sin(radians);
  const startY = els.pitcher.offsetTop + y + pivotY + dx * Math.sin(radians) + dy * Math.cos(radians);
  const endX = els.cup.offsetLeft + els.cup.offsetWidth * .5;
  const endY = els.cup.offsetTop + els.cup.offsetHeight * (1 - .125 - state.target * .69);
  const streamX = endX - startX;
  const streamY = endY - startY;
  const length = Math.max(70, Math.hypot(streamX, streamY));
  const streamAngle = Math.atan2(streamY, streamX) * 180 / Math.PI - 90;

  document.documentElement.style.setProperty('--stream-x', `${startX.toFixed(1)}px`);
  document.documentElement.style.setProperty('--stream-y', `${startY.toFixed(1)}px`);
  document.documentElement.style.setProperty('--stream-length', `${length.toFixed(1)}px`);
  document.documentElement.style.setProperty('--stream-angle', `${streamAngle.toFixed(1)}deg`);
}

function beginPour(intensity) {
  if (soundActive) {
    pourSound.setIntensity(intensity);
    return;
  }
  soundActive = true;
  els.work.classList.add('is-pouring');
  pourSound.start(state.mode, intensity);
  lastFrameAt = performance.now();
  frameId = requestAnimationFrame(advancePour);
}

function endPour() {
  soundActive = false;
  els.work.classList.remove('is-pouring');
  pourSound.stop();
  cancelAnimationFrame(frameId);
  frameId = 0;
}

function advancePour(now) {
  if (!soundActive || state.phase !== 'active') return;
  const live = gesture?.getState();
  if (!live?.pouring) {
    endPour();
    return;
  }
  const dt = Math.min(.05, Math.max(0, (now - lastFrameAt) / 1000));
  lastFrameAt = now;
  const mode = currentMode();
  const remaining = Math.max(0, state.target - state.fill);
  const magneticEase = remaining < .09 ? Math.max(.2, remaining / .09) : 1;
  const rate = (mode?.rate || .2) * (.38 + live.tilt * .62) * magneticEase;
  state.fill = Math.min(state.target, state.fill + rate * dt);
  state.source = Math.max(.12, state.source - rate * dt * .82);
  setVisualFill();
  pourSound.setIntensity(live.tilt);

  if (state.fill >= state.target - .0005) {
    completeRound();
    return;
  }
  frameId = requestAnimationFrame(advancePour);
}

function returnPitcher() {
  els.pitcher.classList.add('is-returning');
  setPitcherPose();
  timers.after(540, () => els.pitcher.classList.remove('is-returning'));
}

function bindGesture() {
  gesture?.destroy();
  gesture = createPourGesture(els.pitcher, {
    direction: -1,
    maxTravelX: Math.min(320, Math.max(210, window.innerWidth * .26)),
    maxTravelY: Math.min(205, Math.max(130, window.innerHeight * .23)),
    pourThreshold: .5,
    onStart() {
      if (state.phase !== 'active') return;
      state.hasInteracted = true;
      els.work.classList.add('has-started');
      els.pitcher.classList.add('is-dragging');
    },
    onChange(next) {
      state.dragging = next.dragging;
      state.tilt = next.tilt;
      state.pouring = Boolean(next.pouring && state.phase === 'active');
      setPitcherPose(next);
      if (state.pouring) beginPour(next.tilt);
      else endPour();
    },
    onEnd({ cancelled }) {
      state.dragging = false;
      state.pouring = false;
      els.pitcher.classList.remove('is-dragging');
      endPour();
      if (state.phase !== 'active') return;
      returnPitcher();
      if (!cancelled && state.fill > 0 && state.fill < state.target - .055) {
        timers.after(480, () => {
          if (state.phase === 'active' && !state.dragging) speak('little-more');
        });
      }
    },
  });
}

function startRound({ announce = true } = {}) {
  timers.clearAll();
  endPour();
  gesture?.destroy();
  state.round = Math.min(state.completed, roundsTotal - 1);
  state.target = Number(targets[state.round % targets.length]) || .58;
  state.fill = 0;
  state.source = .88;
  state.phase = 'active';
  state.awaitingInput = true;
  state.dragging = false;
  state.pouring = false;
  state.tilt = 0;
  state.hasInteracted = false;
  els.work.classList.remove('is-pouring', 'has-started');
  els.cup.classList.remove('is-hit');
  els.guide.classList.remove('is-hidden');
  setPitcherPose();
  setVisualFill();
  renderProgress();
  bindGesture();

  if (announce) {
    const key = state.round === 0 ? currentMode()?.intro : 'line-two';
    if (key) speak(key);
  }
  timers.after(state.round === 0 ? 5600 : 4800, () => {
    if (state.phase !== 'active' || state.hasInteracted) return;
    speak(state.round === 0 ? 'first-pour' : 'steady');
  });
}

function completeRound() {
  if (state.phase !== 'active') return;
  state.phase = 'settling';
  state.awaitingInput = false;
  state.fill = state.target;
  state.completed = Math.min(roundsTotal, state.round + 1);
  setVisualFill();
  endPour();
  gesture?.cancel();
  els.cup.classList.add('is-hit');
  els.spark.classList.remove('is-on');
  void els.spark.offsetWidth;
  els.spark.classList.add('is-on');
  returnPitcher();
  renderProgress();
  sfx.sparkle();

  const praise = state.completed === 1 ? 'line-one' : 'line-two';
  speak(praise);
  timers.after(1150, () => {
    if (!screens.is('play')) return;
    if (state.completed >= roundsTotal) showReveal();
    else startRound({ announce: false });
  });
}

async function startMode(id) {
  const mode = modeById(id);
  if (!mode) return false;
  return screens.start(async () => {
    await ready;
    stopPlay();
    state.mode = mode.id;
    state.round = 0;
    state.completed = 0;
    state.phase = 'active';
    state.currentPrompt = mode.intro;
    document.documentElement.style.setProperty('--accent', mode.accent);
    els.work.dataset.material = mode.id;
    els.promptToken.src = mode.token;
    els.promptText.textContent = `Pour ${mode.title.toLowerCase()} to the line`;
    screens.show('play');
    startRound({ announce: true });
    return true;
  }, { busy: false });
}

function stopPlay() {
  state.awaitingInput = false;
  state.dragging = false;
  state.pouring = false;
  timers.clearAll();
  endPour();
  gesture?.destroy();
  gesture = null;
  els.pitcher.classList.remove('is-dragging', 'is-returning');
  els.work.classList.remove('is-pouring');
  setPitcherPose();
}

function showSplash({ speakPrompt = false } = {}) {
  stopPlay();
  state.mode = null;
  state.round = 0;
  state.completed = 0;
  state.phase = 'splash';
  state.currentPrompt = 'welcome';
  document.documentElement.style.setProperty('--accent', config.theme.accent);
  screens.show('splash');
  if (speakPrompt) speak('welcome');
}

function showReveal() {
  stopPlay();
  const mode = currentMode();
  state.phase = 'reveal';
  state.currentPrompt = mode?.cheer || 'again';
  els.revealTitle.textContent = `${mode?.title || 'Careful'} pouring!`;
  els.revealCopy.textContent = mode?.id === 'water'
    ? 'Smooth stream, steady stop.'
    : mode?.id === 'beans'
      ? 'Clink, clink — right to the line.'
      : 'Tiny grains, careful hands.';
  screens.show('reveal');
  sfx.tada();
  confettiDispose?.();
  confettiDispose = burstConfetti({ host: els.reveal, count: 42, duration: 2900 });
  speak(mode?.cheer || 'again').then(() => {
    if (screens.is('reveal')) timers.after(260, () => {
      els.tidy.classList.add('is-visible');
      speak('tidy');
    });
  });
}

function muteAll(on = true) {
  state.muted = Boolean(on);
  voice.setMuted(state.muted);
  sfx.setMuted(state.muted);
  bgm.setMuted(state.muted);
  pourSound.setMuted(state.muted);
  if (state.muted) {
    try { window.speechSynthesis?.cancel(); } catch { /* optional API */ }
  }
  return state.muted;
}

function getState() {
  return {
    screen: screens.current,
    mode: state.mode,
    round: screens.is('play') ? state.round + 1 : state.round,
    roundsTotal,
    completed: state.completed,
    fill: Number(state.fill.toFixed(3)),
    target: Number(state.target.toFixed(3)),
    source: Number(state.source.toFixed(3)),
    phase: state.phase,
    dragging: state.dragging,
    pouring: state.pouring,
    tilt: Number(state.tilt.toFixed(3)),
    awaitingInput: state.awaitingInput,
    muted: state.muted,
  };
}

async function debugTap(targetId) {
  const target = [...document.querySelectorAll('[data-target]')]
    .find((node) => node.dataset.target === targetId && node.getClientRects().length);
  if (!target || target.disabled || target === els.pitcher) return { accepted: false };
  target.click();
  await Promise.resolve();
  return { accepted: true };
}

async function debugWinRound() {
  if (!screens.is('play') || state.phase !== 'active' || !gesture) return false;
  const before = state.completed;
  state.fill = Math.max(0, state.target - .004);
  setVisualFill();
  gesture.debugSet({ x: -280, y: -150, tilt: 1, dragging: true, pointerId: -1 });
  const deadline = performance.now() + 1200;
  while (state.completed === before && performance.now() < deadline) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  gesture?.debugSet({ x: 0, y: 0, tilt: 0, dragging: false, pointerId: null });
  return state.completed > before;
}

function installDebugHook() {
  installDebug({
    gameId: config.id,
    engine: config.engine,
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
    getAudioLog: voice.getAudioLog,
    clearAudioLog: voice.clearAudioLog,
    setPour(value = 1) {
      if (!gesture || state.phase !== 'active') return false;
      const tilt = Math.max(0, Math.min(1, Number(value) || 0));
      gesture.debugSet({ x: -280 * tilt, y: -150 * tilt, tilt, dragging: tilt > 0, pointerId: -1 });
      return true;
    },
    pourToLine: debugWinRound,
    showReveal,
  });
}

renderModeCards();
attachHud();
modeCardDisposers.push(onTap(els.again, () => showSplash({ speakPrompt: true }), {
  feedback: () => sfx.tick(),
}));
installDebugHook();

window.addEventListener('pagehide', () => {
  stopPlay();
  bgm.stop({ fadeOutMs: 0 });
  pourSound.destroy();
}, { once: true });

window.addEventListener('resize', () => {
  const live = gesture?.getState() || {};
  setPitcherPose(live);
});
