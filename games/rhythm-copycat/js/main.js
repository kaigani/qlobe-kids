// Rhythm Copycat — Kiki the clay kitten's body-percussion band.
//
// Screens: splash (choose mode) → select (pick a beat card) → play
// (demo → copy → song) → end (stars, play again). Timing lives in beat.js;
// all beat audio comes from percussion.js; every visible sound-or-action
// line is the recorded teacher voice with Web Speech fallback.

import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import * as percussion from './percussion.js';
import { BeatRound, makePattern, nextPattern } from './beat.js';
import { createScreens } from '../../../shared/js/screens.js';
import { hudButton, soundDebounce, progressDots } from '../../../shared/js/hud.js';
import { onTap } from '../../../shared/js/tap.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { createTimers } from '../../../shared/js/timers.js';
import { mulberry32 } from '../../../shared/js/rng.js';
import { tada, burstConfetti } from '../../../shared/js/celebrate.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { loadPoseActors } from '../../../shared/js/stage/pose-sprite-dom.js';

const mount = document.querySelector('#game');
const screensEl = Object.fromEntries([...mount.querySelectorAll('[data-qk-screen]')]
  .map((el) => [el.dataset.qkScreen, el]));
const els = {
  pickTitle: mount.querySelector('[data-rc-pick-title]'),
  cards: mount.querySelector('[data-rc-cards]'),
  start: mount.querySelector('[data-rc-start]'),
  startLabel: mount.querySelector('[data-rc-start-label]'),
  promptText: mount.querySelector('[data-rc-prompt-text]'),
  progress: mount.querySelector('[data-rc-progress]'),
  slots: mount.querySelector('[data-rc-slots]'),
  pads: mount.querySelector('[data-rc-pads]'),
  modeShelf: mount.querySelector('[data-rc-modes]'),
  glow: mount.querySelector('[data-rc-glow]'),
  endTitle: mount.querySelector('[data-rc-end-title]'),
  stars: mount.querySelector('[data-rc-stars]'),
  again: mount.querySelector('[data-rc-again]'),
  againLabel: mount.querySelector('[data-rc-again-label]'),
  beats: mount.querySelector('[data-rc-beats]'),
};

const state = {
  screen: 'splash', mode: null, card: null, round: 0, length: 2,
  phase: 'menu', pattern: null, previews: [], roundResults: [],
  stars: 0, beatRound: null,
};
const timers = createTimers();
const narrator = createNarrator();
let rng = mulberry32(42);
let actors = {};
let padEls = {};      // pad id -> <button>
let dotEls = [];      // slot images
let cursorEl = null;
let selectedCard = null;
let praiseIndex = 0;
let lastNudgeAt = 0;

function say(key) { return narrator.say(key, config.voice[key] || config.voice.intro); }
function modeSpec() { return config.modes.find((m) => m.id === state.mode); }
function activePlay() { return screens.is('play') && !state.completed; }
function padIds() { return (modeSpec() || config.modes[0]).pads; }

// ------------------------------------------------------------------ poses

const KIKI_POSE_BY_PAD = { clap: 'clap', stomp: 'stomp', tap: 'tap', shake: 'shake' };

async function setKiki(pose, { host = 'play', instant = false } = {}) {
  const actor = actors[host];
  if (!actor) return;
  await actor.setPose(pose, { instant });
}

// ------------------------------------------------------------------ render

function renderSplash() {
  els.modeShelf.innerHTML = '';
  for (const mode of config.modes) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `rc-mode-card rc-mode-card--${mode.id}`;
    btn.dataset.target = `mode-${mode.id}`;
    btn.setAttribute('aria-label', mode.title);
    btn.innerHTML = `
      <img class="rc-mode-card__back" src="${config.assets.card}" alt="" draggable="false" />
      <img class="rc-mode-card__badge" src="${mode.badge === 'drum' ? config.assets.djembe : config.assets.pads[mode.badge]}" alt="" draggable="false" />
      <span class="rc-mode-card__title">${mode.title}</span>
      <span class="rc-mode-card__skill">${mode.skill}</span>`;
    onTap(btn, () => pickMode(mode.id), { feedback: () => {} });
    els.modeShelf.append(btn);
  }
  setKiki('neutral', { host: 'splash' });
}

function buildDots(pattern) {
  const wrap = els.slots;
  wrap.innerHTML = '';
  dotEls = pattern.map((pad, i) => {
    const slot = document.createElement('span');
    slot.className = 'rc-slot';
    slot.style.setProperty('--slot', String(i));
    slot.innerHTML = `<img class="rc-dot" src="${config.assets.dots[pad]}" alt="" draggable="false" />`;
    wrap.append(slot);
    return slot;
  });
}

function slotState(i, lit) {
  const slot = dotEls[i];
  if (slot) slot.classList.toggle('is-lit', lit);
}

function renderSelect() {
  const pads = padIds();
  state.previews = config.cards.map((card) => makePattern(rng, card.length, pads));
  selectedCard = null;
  els.start.classList.remove('is-armed');
  els.cards.innerHTML = '';
  config.cards.forEach((card, ci) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rc-card';
    btn.dataset.target = `card-${card.id}`;
    btn.setAttribute('aria-label', `${card.title}, ${card.length} beats`);
    btn.innerHTML = `
      <img class="rc-card__back" src="${config.assets.card}" alt="" draggable="false" />
      <span class="rc-card__title">${card.title}</span>
      <span class="rc-card__dots">${state.previews[ci].map((pad) =>
        `<img class="rc-card-dot" src="${config.assets.dots[pad]}" alt="" draggable="false" />`).join('')}
      </span>`;
    onTap(btn, () => {
      selectedCard = ci;
      els.cards.querySelectorAll('.rc-card').forEach((c, j) => {
        c.classList.toggle('is-selected', j === ci);
      });
      els.start.classList.add('is-armed');
      sfx.pop();
      say('start');
    }, { feedback: () => {} });
    els.cards.append(btn);
  });
  setKiki('notice', { host: 'splash' });
}

function renderTray(pattern) {
  buildDots(pattern);
  const padMap = {};
  pattern.forEach((pad, i) => { padMap[pad] = (padMap[pad] || 0) + 1; });
}

function renderPads() {
  els.pads.innerHTML = '';
  padEls = {};
  for (const id of padIds()) {
    const info = config.pads[id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `rc-pad rc-pad--${id}`;
    btn.dataset.pad = id;
    btn.dataset.target = `pad-${id}`;
    btn.setAttribute('aria-label', info.label);
    btn.innerHTML = `
      <img class="rc-pad__art" src="${config.assets.pads[id]}" alt="" draggable="false" />
      <span class="rc-pad__label">${info.label}</span>`;
    onTap(btn, (e) => { e.stopPropagation(); handlePadTap(id); }, {
      feedback: () => {
        btn.classList.add('is-pressed');
        clearTimeout(btn._rcPressTimer);
        btn._rcPressTimer = setTimeout(() => btn.classList.remove('is-pressed'), 240);
      },
    });
    els.pads.append(btn);
    padEls[id] = btn;
  }
}

function setPrompt(textKey) {
  els.promptText.textContent = config.voice[textKey] || '';
}

function flashPad(id) {
  const el = padEls[id];
  if (!el) return;
  el.classList.remove('is-flash');
  void el.offsetWidth; // restart the animation
  el.classList.add('is-flash');
  clearTimeout(el._rcFlashTimer);
  el._rcFlashTimer = setTimeout(() => el.classList.remove('is-flash'), 520);
}

function wigglePad(id) {
  const el = padEls[id];
  if (!el) return;
  el.classList.remove('is-wrong');
  void el.offsetWidth;
  el.classList.add('is-wrong');
  clearTimeout(el._rcWrongTimer);
  el._rcWrongTimer = setTimeout(() => el.classList.remove('is-wrong'), 560);
}

function sayNudge() {
  const now = performance.now();
  if (now - lastNudgeAt < 2500) return;
  lastNudgeAt = now;
  const expected = state.beatRound?.pattern[state.beatRound?.slot];
  if (expected) say(`nudge-${expected}`);
}

// ------------------------------------------------------------------ rounds

function roundLength() {
  return Math.min(4, state.length + Math.floor((state.round - 1) / 2));
}

function roundTempo() {
  const mode = modeSpec();
  const ramp = state.round > 2 ? Math.pow(1.06, Math.min(state.round - 2, 3)) : 1;
  return Math.min(mode.tempoCap, Math.round(mode.tempo * ramp));
}

function disposeRound() {
  state.beatRound?.cancel();
  state.beatRound = null;
  state.phase = 'menu';
  timers.clearAll();
}

function beginRound() {
  const mode = modeSpec();
  state.round += 1;
  const length = roundLength();
  const tempo = roundTempo();
  const beatMs = timers.ms(60000 / tempo);
  const pads = mode.pads;
  const pattern = state.round === 1 && selectedCard != null
    ? state.previews[selectedCard]
    : nextPattern(rng, length, pads, state.pattern);
  state.pattern = pattern;

  els.progress.replaceChildren(progressDots(mode.rounds, state.round - 1));
  renderTray(pattern);
  state.phase = 'demo';
  setPrompt('listen');
  setKiki('notice', { host: 'play' });
  say('listen');

  const round = new BeatRound({
    timers, beatMs, pattern,
    onSound: (i, pad) => {
      percussion.play(pad);
      percussion.play('bass', i);
      flashPad(pad);
      setKiki(KIKI_POSE_BY_PAD[pad] || 'notice', { host: 'play' });
    },
    onLight: (i, pad, off) => slotState(i, !off),
    onArm: (i) => {
      slotState(i, true);
      const slot = dotEls[i];
      if (slot) slot.classList.add('is-armed');
    },
    onFill: (i, pad) => {
      percussion.play(pad);
      flashPad(pad);
      slotState(i, true);
      dotEls[i]?.classList.remove('is-armed');
      setKiki(KIKI_POSE_BY_PAD[pad] || 'notice', { host: 'play' });
      if (i % 2 === 1) praise();
    },
    onWrong: (pad) => {
      wigglePad(pad);
      setKiki('react', { host: 'play' });
      say('oops');
      sayNudge();
    },
    onMiss: (i, pad) => {
      percussion.play(pad);
      flashPad(pad);
    },
    onAuto: (i, pad) => {
      percussion.play(pad);
      slotState(i, true);
      say('together');
    },
    onDone: (stats) => onPhaseDone(stats),
  });
  state.beatRound = round;
  round.demo();
}

function praise() {
  praiseIndex = (praiseIndex + 1) % 3;
  say(`good-${praiseIndex + 1}`);
}

function onPhaseDone(stats) {
  if (stats.phase === 'demo') {
    timers.after(420, () => {
      if (state.screen !== 'play' || !state.beatRound) return;
      state.phase = 'copy';
      setPrompt('your-turn');
      setKiki('notice', { host: 'play' });
      say('your-turn');
      state.beatRound.copy();
    });
    return;
  }
  if (stats.phase === 'copy') {
    state.roundResults.push({
      firstTry: stats.firstTry, slots: stats.slots,
      assists: stats.assists, misses: stats.misses,
    });
    state.phase = 'song';
    setPrompt('round-end');
    say('round-end');
    sfx.tada({ confetti: false });
    timers.after(750, () => {
      if (state.screen !== 'play' || !state.beatRound) return;
      state.beatRound.replay();
    });
    return;
  }
  if (stats.phase === 'song') {
    const mode = modeSpec();
    if (state.round < mode.rounds) {
      timers.after(650, () => {
        if (state.screen !== 'play') return;
        beginRound();
      });
    } else {
      endGame();
    }
  }
}

function handlePadTap(id) {
  if (state.phase !== 'copy' || !state.beatRound) return;
  const result = state.beatRound.tap(id);
  if (result !== 'ok') return;
  try { if (navigator.vibrate) navigator.vibrate(30); } catch { /* not everywhere */ }
  const slot = state.beatRound.slot - 1;
  if (dotEls[slot]) dotEls[slot].classList.remove('is-armed');
}

// ------------------------------------------------------------------ screens

function pickMode(modeId) {
  state.mode = modeId;
  state.round = 0;
  state.roundResults = [];
  state.stars = 0;
  state.pattern = null;
  sfx.pop();
  setKiki('celebrate', { host: 'splash' });
  screens.show('select');
  renderSelect();
  narrator.saySequence([
    { key: `mode-${modeId}`, text: config.voice[`mode-${modeId}`] },
    { key: 'pick-beat', text: config.voice['pick-beat'], gap: 500 },
  ]);
  nudger.arm();
}

async function startGame() {
  if (selectedCard == null) return;
  if (state.screen === 'play' && state.phase !== 'menu') return;
  await audioReady;
  disposeRound();
  state.round = 0;
  state.roundResults = [];
  state.stars = 0;
  state.length = config.cards[selectedCard].length;
  state.pattern = null;
  screens.show('play');
  renderPads();
  renderTray([]);
  els.progress.replaceChildren(progressDots(modeSpec().rounds, 0));
  setKiki('neutral', { host: 'play' });
  nudger.arm();
  beginRound();
}

function endGame() {
  const total = state.roundResults.reduce((n, r) => n + r.slots, 0);
  const first = state.roundResults.reduce((n, r) => n + r.firstTry, 0);
  const accuracy = total ? first / total : 0;
  state.stars = accuracy >= 0.8 ? 3 : accuracy >= 0.55 ? 2 : 1;
  state.completed = true;
  state.phase = 'end';
  disposeRound();
  els.endTitle.textContent = config.voice['all-done'] || 'You made a song!';
  screens.show('end');
  setKiki('celebrate', { host: 'end' });
  els.stars.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const star = document.createElement('img');
    star.className = 'rc-star';
    star.src = config.assets.star;
    star.alt = '';
    star.draggable = false;
    if (i >= state.stars) star.classList.add('is-dim');
    els.stars.append(star);
  }
  tada({ count: 160, host: mount.querySelector('[data-rc-confetti]') });
  timers.after(120, () => percussion.play('strum'));
  narrator.saySequence([
    { key: 'all-done', text: config.voice['all-done'] },
    { key: `stars-${state.stars}`, text: config.voice[`stars-${state.stars}`], gap: 500 },
  ]);
  nudger.arm();
  nudger.arm();
}

function goSelect() {
  disposeRound();
  state.completed = false;
  screens.show('select');
  renderSelect();
  say('pick-beat');
  nudger.arm();
}

function goSplash() {
  disposeRound();
  state.completed = false;
  screens.show('splash');
  renderSplash();
  say('choose-mode');
  nudger.arm();
}

const screens = createScreens({
  screens: screensEl, initial: 'splash', voice: narrator,
  onEnter: (name) => { state.screen = name; },
});

const nudger = createNudger({
  first: 9000, repeat: 11000,
  onNudge: () => {
    if (screens.current === 'splash') say('choose-mode');
    else if (screens.current === 'select') say('pick-beat');
    else if (screens.current === 'play') say(state.phase === 'copy' ? 'your-turn' : 'listen');
    else if (screens.current === 'end') say('all-done');
  },
});

// ------------------------------------------------------------------ wiring

installKioskGuards();
installUnlockOnGesture({
  extra: [() => percussion.unlock(), () => sfx.unlock(), () => voiceClips.unlock()],
  onFirst: () => say('intro'),
});
const audioReady = voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice);

const playBack = hudButton('back', goSelect);
const selectBack = hudButton('back', goSplash);
const endBack = hudButton('back', goSelect);
const splashSound = hudButton('sound', soundDebounce(() => say('intro'), 600));
const selectSound = hudButton('sound', soundDebounce(() => say('pick-beat'), 600));
const playSound = hudButton('sound', soundDebounce(() => say(state.phase === 'copy' ? 'your-turn' : 'listen'), 600));
const endSound = hudButton('sound', soundDebounce(() => say('all-done'), 600));
for (const btn of [selectBack, playBack, endBack]) btn.classList.add('qk-hud-top-left');
for (const btn of [splashSound, selectSound, playSound, endSound]) btn.classList.add('qk-hud-bottom-left');
mount.querySelector('[data-rc-back]').append(selectBack);
mount.querySelector('[data-rc-back-play]').append(playBack);
mount.querySelector('[data-rc-back-end]').append(endBack);
mount.querySelector('[data-rc-sound]').append(splashSound);
mount.querySelector('[data-rc-sound-select]').append(selectSound);
mount.querySelector('[data-rc-sound-end]').append(endSound);

onTap(els.start, () => startGame(), { feedback: () => {} });
onTap(els.again, () => { sfx.pop(); goSelect(); }, { feedback: () => {} });
onTap(els.beats, () => { sfx.pop(); goSelect(); }, { feedback: () => {} });

// ------------------------------------------------------------------ actors

Promise.all([
  loadPoseActors(mount.querySelector('[data-rc-actor="splash"]'), { kiki: { pack: config.assets.kiki } }),
  loadPoseActors(mount.querySelector('[data-rc-actor="play"]'), { kiki: { pack: config.assets.kiki } }),
  loadPoseActors(mount.querySelector('[data-rc-actor="end"]'), { kiki: { pack: config.assets.kiki } }),
]).then(([splash, play, end]) => {
  actors = { splash: splash.kiki, play: play.kiki, end: end.kiki };
  renderSplash();
});

preloadImages(
  Object.values(config.assets.pads)
    .concat(Object.values(config.assets.dots))
    .concat([config.assets.title, config.assets.splashBg, config.assets.playBg,
      config.assets.card, config.assets.button, config.assets.star,
      config.assets.tray, config.assets.plaque, config.assets.djembe]),
);

// ------------------------------------------------------------------ debug

function debugState() {
  return {
    screen: state.screen, mode: state.mode, card: state.card, round: state.round,
    length: state.length, phase: state.phase,
    pattern: state.pattern, results: state.roundResults, stars: state.stars,
    tempo: state.round >= 1 ? roundTempo() : null,
    slot: state.beatRound ? state.beatRound.slot : null,
  };
}

installDebug({
  gameId: 'rhythm-copycat',
  modes: config.modes.map((m) => m.id),
  timers, narrator, sfx, voice: voiceClips, ready: audioReady,
  onSeed: (next) => { rng = next; },
  state: debugState, getState: debugState,
  tap: (id) => {
    // Prefer the visible instance: several screens each carry a back button.
    const selector = ['home', 'back', 'sound'].includes(id) ? `[data-hud="${id}"]` : `[data-target="${id}"]`;
    const el = [...mount.querySelectorAll(selector)]
      .find((candidate) => candidate.offsetParent !== null) || mount.querySelector(selector);
    el?.click();
    return !!el;
  },
  actions: {
    start: () => startGame(),
    skipTo: (phase) => {
      if (!state.beatRound) return false;
      if (phase === 'demo') { state.beatRound.cancel(); }
      return true;
    },
    bpm: (n) => {
      if (!state.beatRound) return false;
      state.beatRound.beatMs = timers.ms(60000 / n);
      return true;
    },
    pads: () => Object.keys(padEls),
  },
  fillNext: () => {
    if (state.phase !== 'copy' || !state.beatRound) return false;
    return handlePadTap(state.beatRound.pattern[state.beatRound.slot]) === 'ok' || true;
  },
  getAudioLog: voiceClips.getAudioLog,
  clearAudioLog: voiceClips.clearAudioLog,
});