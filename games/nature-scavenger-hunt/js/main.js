import { installKioskGuards, installUnlockOnGesture, unlockAll } from '../../../shared/js/audio-unlock.js';
import * as voice from '../../../shared/js/voice-clips.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import * as sfx from '../../../shared/js/sfx.js';
import { onTap } from '../../../shared/js/tap.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { createScreens } from '../../../shared/js/screens.js';
import { createTimers } from '../../../shared/js/timers.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { tada } from '../../../shared/js/celebrate.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import {
  ASSETS,
  CLUES,
  GAME_ID,
  ITEM_ASSETS,
  MODES,
  MODE_BY_ID,
  PRAISE_KEYS,
  RUNTIME_IMAGES,
  VOICE_LINES,
} from './data.js';

const root = document.getElementById('game');
const timers = createTimers();
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)') || { matches: false };
const STORAGE_KEY = 'qlobe:nature-scavenger-hunt:journal:v1';

const state = {
  ready: false,
  screen: 'splash',
  mode: null,
  quest: [],
  round: 0,
  found: 0,
  awaitingInput: false,
  transitioning: false,
  muted: false,
  seed: 20260918,
  rng: mulberry32(20260918),
};

let journal = loadJournal();
let currentVoiceKey = 'welcome';
let activeBurst = null;

const narrator = createNarrator({
  say: (key, text) => voice.say(key, text),
  stop: () => voice.stop(),
  announcerParent: root,
});

const nudger = createNudger({
  first: 14000,
  repeat: 17000,
  onNudge() {
    if (state.screen === 'hunt' && state.awaitingInput) speakCurrent();
  },
});

const screens = createScreens({
  root,
  initial: 'splash',
  splash: 'splash',
  voice: narrator,
  onExit() {
    timers.clearAll();
    nudger.stop();
    clearBurst();
  },
  onEnter(name) {
    state.screen = name;
  },
});

function loadJournal() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (parsed?.version !== 1 || !parsed.modes || typeof parsed.modes !== 'object') {
      return { version: 1, modes: {} };
    }
    const modes = {};
    for (const mode of MODES) {
      const count = Math.floor(Number(parsed.modes[mode.id]) || 0);
      if (count > 0) modes[mode.id] = Math.min(99, count);
    }
    return { version: 1, modes };
  } catch {
    return { version: 1, modes: {} };
  }
}

function saveJournal() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(journal)); } catch { /* progress is optional */ }
}

function completedModes() {
  return MODES.filter((mode) => journal.modes[mode.id] > 0).map((mode) => mode.id);
}

function completeMode(id) {
  journal.modes[id] = Math.min(99, (journal.modes[id] || 0) + 1);
  saveJournal();
  updateModeBadges();
}

function modeMarkup(mode) {
  const done = Boolean(journal.modes[mode.id]);
  return `<button class="mode-card ${done ? 'is-complete' : ''}" type="button" data-mode="${mode.id}" data-target="mode-${mode.id}" aria-label="${mode.title}. ${mode.subtitle}.">
    <img class="mode-card-art" src="${ASSETS.questCard}" alt="" draggable="false">
    <span class="mode-copy"><strong>${mode.title}</strong><small>${mode.subtitle}</small></span>
    <span class="mode-preview" aria-hidden="true">${mode.preview.map((item) => `<img src="${ITEM_ASSETS[item]}" alt="" draggable="false">`).join('')}</span>
    <img class="mode-complete" src="${ASSETS.checkBadge}" alt="Trail discovered" draggable="false" ${done ? '' : 'hidden'}>
  </button>`;
}

function mountModes() {
  const stack = root.querySelector('[data-mode-stack]');
  stack.innerHTML = MODES.map(modeMarkup).join('');
  stack.querySelectorAll('[data-mode]').forEach((button) => {
    onTap(button, () => startMode(button.dataset.mode), {
      feedback: () => { unlockAll(); playSfx('whoosh'); },
    });
  });
}

function updateModeBadges() {
  root.querySelectorAll('[data-mode]').forEach((button) => {
    const done = Boolean(journal.modes[button.dataset.mode]);
    button.classList.toggle('is-complete', done);
    const badge = button.querySelector('.mode-complete');
    if (badge) badge.hidden = !done;
  });
}

function mountHud() {
  const homeSlot = root.querySelector('[data-hud-home]');
  const home = hudButton('home', () => { window.location.href = '../../'; }, { label: 'Back to QLOBE Kids' });
  home.classList.add('qk-hud-top-left');
  home.dataset.target = 'home';
  homeSlot.append(home);

  root.querySelectorAll('[data-hud-back]').forEach((slot) => {
    const back = hudButton('back', goHome, { label: 'Back to trail choices' });
    back.classList.add('qk-hud-top-left');
    back.dataset.target = 'back';
    slot.append(back);
  });

  const repeat = soundDebounce(() => speakCurrent(), 650);
  root.querySelectorAll('[data-hud-sound]').forEach((slot) => {
    const sound = hudButton('sound', repeat, { label: 'Hear that again' });
    sound.classList.add('qk-hud-top-right');
    sound.dataset.target = 'sound';
    slot.append(sound);
  });
}

function bindAction(selector, action, sound = null) {
  const element = root.querySelector(selector);
  return onTap(element, action, {
    feedback: () => {
      unlockAll();
      if (sound) playSfx(sound);
    },
  });
}

function playSfx(name) {
  if (state.muted) return;
  try { sfx[name]?.(); } catch { /* supportive only */ }
}

function setVoice(key) {
  currentVoiceKey = key;
  return narrator.say(key, VOICE_LINES[key] || '');
}

function speakCurrent() {
  return setVoice(currentVoiceKey || 'welcome');
}

function drawQuest(mode) {
  return shuffle(mode.clues, state.rng).slice(0, 3).map((id) => CLUES[id]);
}

async function startMode(id, { replay = false } = {}) {
  const mode = MODE_BY_ID[id];
  if (!mode) return false;
  return screens.start(async () => {
    state.mode = id;
    state.quest = drawQuest(mode);
    state.round = 0;
    state.found = 0;
    state.awaitingInput = false;
    state.transitioning = false;
    renderBriefing();
    screens.show('briefing', { force: screens.is('briefing') });
    currentVoiceKey = mode.briefVoice;
    const parts = replay
      ? [
        { key: 'again', text: VOICE_LINES.again },
        { key: mode.briefVoice, text: VOICE_LINES[mode.briefVoice], gap: 250 },
      ]
      : [
        { key: mode.briefVoice, text: VOICE_LINES[mode.briefVoice] },
        { key: 'brief-ready', text: VOICE_LINES['brief-ready'], gap: 180 },
      ];
    // Show the mission immediately. Voice initialization normally resolves in
    // a few milliseconds, but it must never make a child's tap wait on the
    // larger art warmup or a slow cache. The guard prevents a late greeting
    // from speaking after the child has already left the briefing.
    voiceReady.then(() => {
      if (state.screen === 'briefing' && state.mode === id) narrator.saySequence(parts);
    });
    return true;
  }, { busy: false });
}

function renderBriefing() {
  const mode = MODE_BY_ID[state.mode];
  root.querySelector('[data-brief-title]').textContent = mode.title;
  root.querySelector('[data-brief-subtitle]').textContent = mode.subtitle;
  root.querySelector('[data-brief-list]').innerHTML = state.quest.map((clue, index) => `<li>
    <span class="brief-number">${index + 1}</span>
    <img src="${ITEM_ASSETS[clue.item]}" alt="" draggable="false">
    <span>${clue.short}</span>
  </li>`).join('');
}

function beginHunt() {
  if (!state.mode || state.quest.length !== 3) return false;
  state.round = 0;
  state.found = 0;
  screens.show('hunt');
  renderHunt();
  setVoice(state.quest[0].voice);
  return true;
}

function renderHunt() {
  const clue = state.quest[state.round];
  if (!clue) return;
  const stage = root.querySelector('[data-hunt-stage]');
  const item = root.querySelector('[data-clue-item]');
  const foundButton = root.querySelector('[data-action="found"]');
  root.querySelector('[data-step-label]').textContent = `Clue ${state.round + 1} of ${state.quest.length}`;
  root.querySelector('[data-clue-title]').textContent = clue.title;
  root.querySelector('[data-clue-hint]').textContent = clue.hint;
  root.querySelector('[data-praise]').textContent = '';
  item.src = ITEM_ASSETS[clue.item];
  item.alt = clue.alt;
  stage.classList.remove('is-found', 'is-arriving');
  void stage.offsetWidth;
  stage.classList.add('is-arriving');
  foundButton.disabled = false;
  state.awaitingInput = true;
  state.transitioning = false;
  currentVoiceKey = clue.voice;
  nudger.arm();
}

function foundCurrent() {
  if (state.screen !== 'hunt' || !state.awaitingInput || state.transitioning) return false;
  const stage = root.querySelector('[data-hunt-stage]');
  const foundButton = root.querySelector('[data-action="found"]');
  const praiseKey = PRAISE_KEYS[Math.floor(state.rng() * PRAISE_KEYS.length)];
  state.awaitingInput = false;
  state.transitioning = true;
  state.found += 1;
  foundButton.disabled = true;
  stage.classList.add('is-found');
  root.querySelector('[data-praise]').textContent = VOICE_LINES[praiseKey];
  nudger.stop();
  playSfx('pop');
  timers.after(100, () => playSfx('sparkle'));
  setVoice(praiseKey);
  clayBurst(root.querySelector('.hunt-screen'), 10);
  timers.after(1050, () => {
    state.round += 1;
    if (state.round < state.quest.length) {
      renderHunt();
      setVoice(state.quest[state.round].voice);
    } else {
      finishQuest();
    }
  });
  return true;
}

function finishQuest() {
  const mode = MODE_BY_ID[state.mode];
  completeMode(mode.id);
  renderComplete();
  screens.show('complete');
  state.awaitingInput = false;
  state.transitioning = false;
  currentVoiceKey = mode.completeVoice;
  tada({ confetti: false });
  setVoice(mode.completeVoice);
  clayBurst(root.querySelector('.complete-screen'), 20);
}

function renderComplete() {
  const mode = MODE_BY_ID[state.mode];
  root.querySelector('[data-complete-title]').textContent = mode.title;
  root.querySelector('[data-complete-list]').innerHTML = state.quest.map((clue) => `<div class="complete-row">
    <img class="complete-check" src="${ASSETS.checkBadge}" alt="Found" draggable="false">
    <img class="complete-item" src="${ITEM_ASSETS[clue.item]}" alt="" draggable="false">
    <span>${clue.short}</span>
  </div>`).join('');
}

function replayQuest() {
  if (!state.mode) return false;
  state.seed = (state.seed + 1) >>> 0;
  state.rng = mulberry32(state.seed);
  return startMode(state.mode, { replay: true });
}

function goHome() {
  screens.show('splash');
  state.mode = null;
  state.quest = [];
  state.round = 0;
  state.found = 0;
  state.awaitingInput = false;
  state.transitioning = false;
  currentVoiceKey = 'welcome';
  updateModeBadges();
  return true;
}

function setMuted(on = true) {
  state.muted = Boolean(on);
  narrator.setMuted(state.muted);
  voice.setMuted(state.muted);
  try { sfx.setMuted?.(state.muted); } catch { /* supportive only */ }
  root.querySelectorAll('.qk-hud-sound').forEach((button) => {
    button.classList.toggle('is-muted', state.muted);
    button.setAttribute('aria-pressed', String(state.muted));
    button.setAttribute('aria-label', state.muted ? 'Sound is muted' : 'Hear that again');
  });
  return state.muted;
}

function clearBurst() {
  if (activeBurst) activeBurst.remove();
  activeBurst = null;
}

function clayBurst(host, count = 12) {
  clearBurst();
  if (!host || reducedMotion.matches) return () => {};
  const sprites = [ITEM_ASSETS.leaf, ITEM_ASSETS.flower, ITEM_ASSETS.berries, ITEM_ASSETS.seed];
  const layer = document.createElement('div');
  layer.className = 'clay-burst';
  layer.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < count; index += 1) {
    const image = document.createElement('img');
    image.src = sprites[index % sprites.length];
    image.alt = '';
    image.draggable = false;
    image.style.setProperty('--x', `${8 + state.rng() * 84}%`);
    image.style.setProperty('--delay', `${Math.round(state.rng() * 240)}ms`);
    image.style.setProperty('--drift', `${Math.round(-90 + state.rng() * 180)}px`);
    image.style.setProperty('--spin', `${Math.round(-240 + state.rng() * 480)}deg`);
    image.style.setProperty('--scale', (0.35 + state.rng() * 0.45).toFixed(2));
    layer.append(image);
  }
  host.append(layer);
  activeBurst = layer;
  timers.after(2350, () => {
    if (activeBurst === layer) activeBurst = null;
    layer.remove();
  });
  return () => {
    if (activeBurst === layer) activeBurst = null;
    layer.remove();
  };
}

function tapTarget(id) {
  const node = root.querySelector(`[data-target="${CSS.escape(String(id))}"]`);
  if (!node || node.matches(':disabled')) return false;
  node.click();
  return true;
}

mountModes();
mountHud();
bindAction('[data-action="begin"]', beginHunt, 'whoosh');
bindAction('[data-action="found"]', foundCurrent);
bindAction('[data-action="replay"]', replayQuest, 'whoosh');

installKioskGuards();
installUnlockOnGesture({
  onFirst() {
    if (state.screen === 'splash') setVoice('welcome');
  },
});

const voiceReady = voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', VOICE_LINES);
const artReady = preloadImages(RUNTIME_IMAGES, { idle: true });
const ready = Promise.all([voiceReady, artReady]).then(() => {
  state.ready = true;
  return true;
});

installDebug({
  gameId: GAME_ID,
  engine: 'custom',
  ready,
  timers,
  narrator,
  voice,
  sfx,
  root,
  listModes: () => MODES.map((mode) => mode.id),
  startMode: async (id) => startMode(id),
  getState: () => ({
    screen: state.screen,
    mode: state.mode,
    round: state.round,
    roundsTotal: state.quest.length,
    awaitingInput: state.awaitingInput,
    transitioning: state.transitioning,
    found: state.found,
    clue: state.quest[state.round]?.id || null,
    quest: state.quest.map((clue) => clue.id),
    completed: completedModes(),
    muted: state.muted,
    seed: state.seed,
    reducedMotion: reducedMotion.matches,
  }),
  tap: async (id) => tapTarget(id),
  winRound: async () => foundCurrent(),
  mute: (on = true) => setMuted(on),
  home: () => goHome(),
  onSeed: (rng, seed) => {
    state.rng = rng;
    state.seed = seed;
  },
  clearProgress: () => {
    journal = { version: 1, modes: {} };
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* optional */ }
    updateModeBadges();
    return true;
  },
  getAudioLog: () => voice.getAudioLog(),
  clearAudioLog: () => voice.clearAudioLog(),
  clipInfo: (key) => voice.clipInfo(key),
});
