import config from '../config.js';
import { onTap } from '../../../shared/js/tap.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as bgm from '../../../shared/js/bgm.js';
import { hudButton, progressDots, soundDebounce } from '../../../shared/js/hud.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createTimers } from '../../../shared/js/timers.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { burstConfetti, tada } from '../../../shared/js/celebrate.js';
import { collectTargets, installDebug } from '../../../shared/js/debug-harness.js';

const app = document.getElementById('game');
const STORAGE_KEY = 'qlobe:then-now:v2';
const DEFAULT_SEED = 20260920;
const pairMap = new Map(config.pairs.map((pair) => [pair.id, pair]));
const itemMap = new Map();
for (const pair of config.pairs) {
  itemMap.set(pair.then.id, { ...pair.then, era: 'then', pairId: pair.id });
  itemMap.set(pair.now.id, { ...pair.now, era: 'now', pairId: pair.id });
}

const defaultLines = { ...config.voice };
for (const pair of config.pairs) {
  defaultLines[`object-${pair.then.id}`] = pair.then.label;
  defaultLines[`object-${pair.now.id}`] = pair.now.label;
  defaultLines[`pair-${pair.id}`] = pair.relation;
}

let rng = mulberry32(DEFAULT_SEED);
const timers = createTimers();
const voice = createNarrator();
const state = {
  screen: 'loading',
  mode: null,
  seed: DEFAULT_SEED,
  round: 0,
  awaitingInput: false,
  busy: false,
  sessionPairIds: [],
  sortQueue: [],
  sorted: [],
  matches: [],
  activeItemId: null,
  activePairId: null,
  candidates: [],
  galleryPairIds: [],
  discoveredPairIds: [],
  selectedItemId: null,
  lastResult: null,
  muted: false,
  reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false,
};

let readyResolve;
const ready = new Promise((resolve) => { readyResolve = resolve; });
let disposers = [];
let stopCelebration = () => {};
let musicStarted = false;
let hasWelcomed = false;
let lastRetryAt = -Infinity;

const nudger = createNudger({
  first: 9000,
  repeat: 12000,
  onNudge: () => {
    if (state.screen === 'sort') {
      document.querySelectorAll('.era-pocket').forEach((node) => pulse(node));
      speak('idle-sort');
    } else if (state.screen === 'match') {
      document.querySelectorAll('.candidate-card').forEach((node) => pulse(node));
      speak('idle-match');
    } else if (state.screen === 'reveal') {
      const next = document.querySelector('[data-target="next-clue"]');
      if (next) pulse(next);
      speak('next-clue');
    }
  },
});

function node(tag, className, attrs = {}) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === 'text') element.textContent = value;
    else if (key === 'html') element.innerHTML = value;
    else if (key === 'dataset') Object.assign(element.dataset, value);
    else if (key === 'style') {
      for (const [property, setting] of Object.entries(value)) {
        if (property.startsWith('--')) element.style.setProperty(property, setting);
        else element.style[property] = setting;
      }
    }
    else if (key === 'ariaLabel') element.setAttribute('aria-label', value);
    else if (key === 'ariaHidden') element.setAttribute('aria-hidden', value);
    else if (key in element) element[key] = value;
    else element.setAttribute(key, value);
  }
  return element;
}

function image(src, alt, className = '') {
  return node('img', className, { src, alt, draggable: false });
}

function register(dispose) {
  if (typeof dispose === 'function') disposers.push(dispose);
  return dispose;
}

function clearScreen() {
  timers.clearAll();
  nudger.stop();
  voice.stop();
  stopCelebration();
  stopCelebration = () => {};
  for (const dispose of disposers.splice(0)) {
    try { dispose(); } catch { /* stale controls are harmless */ }
  }
  state.awaitingInput = false;
  state.busy = false;
  app.replaceChildren();
}

function makeScreen(name, background, className = '') {
  clearScreen();
  state.screen = name;
  const sceneUrl = new URL(background, window.location.href).href;
  const portraitUrl = new URL(config.assets.backgrounds.bookPortrait, window.location.href).href;
  const screen = node('section', `game-screen ${className}`.trim(), {
    dataset: { screen: name },
    style: { '--scene': `url("${sceneUrl}")`, '--scene-portrait': `url("${portraitUrl}")` },
  });
  app.append(screen);
  return screen;
}

function addHud(screen, { splash = false, replay = repeatPrompt } = {}) {
  const left = hudButton(splash ? 'home' : 'back', () => {
    if (splash) window.location.href = '../../';
    else renderSplash({ announce: true });
  });
  left.classList.add('qk-hud-top-left');
  left.dataset.target = splash ? 'home' : 'back';
  left.dataset.role = 'navigation';
  screen.append(left);
  register(left.dispose);

  const sound = hudButton('sound', soundDebounce(() => replay(), 650), { label: 'Hear the clue again' });
  sound.classList.add('qk-hud-top-right');
  sound.dataset.target = 'sound';
  sound.dataset.role = 'audio';
  screen.append(sound);
  register(sound.dispose);
}

function bindTap(element, handler, { feedback = true } = {}) {
  register(onTap(element, handler, {
    feedback: feedback ? (event) => {
      event.preventDefault();
      try { sfx.tick(); } catch { /* audio is optional */ }
    } : undefined,
  }));
}

function startMusic() {
  if (musicStarted) return;
  musicStarted = true;
  bgm.setVolume(0.14);
  bgm.play(config.assets.music, { key: 'then-now', fadeInMs: 1100, loopFadeOutMs: 3200 });
}

function speak(key, text = defaultLines[key]) {
  return bgm.duckDuring(voice.say(key, text), { down: 0.18, downMs: 120, upMs: 420 });
}

function speakSequence(parts) {
  return bgm.duckDuring(voice.saySequence(parts), { down: 0.18, downMs: 120, upMs: 420 });
}

function speakRetry(key) {
  const now = performance.now();
  if (now - lastRetryAt < 2400) return Promise.resolve();
  lastRetryAt = now;
  return speak(key);
}

function setMuted(on = true) {
  const muted = Boolean(on);
  state.muted = muted;
  voice.setMuted(muted);
  voiceClips.setMuted(muted);
  sfx.setMuted(muted);
  bgm.setMuted(muted);
  return muted;
}

function pulse(element) {
  element.classList.remove('is-hinting');
  void element.offsetWidth;
  element.classList.add('is-hinting');
  timers.after(1050, () => element.classList.remove('is-hinting'));
}

function currentPair() {
  return pairMap.get(state.sessionPairIds[state.round]) || null;
}

function currentSortItem() {
  return state.sortQueue[state.round] || null;
}

function playObjectSound(id) {
  try {
    if (id === 'car') sfx.vroom();
    else if (id === 'carriage') sfx.whoosh();
    else if (id === 'washing-machine') sfx.motor(700);
    else if (id === 'washboard' || id === 'quill') sfx.snip();
    else if (id === 'letter') sfx.whoosh();
    else if (id === 'smartphone' || id === 'keyboard') { sfx.tick(); timers.after(110, () => sfx.tick()); }
    else if (id === 'phonograph' || id === 'headphones') sfx.sparkle();
    else if (id === 'candle') sfx.pop();
    else if (id === 'lightbulb') sfx.sparkle();
    else sfx.pop();
  } catch { /* object audio is delight, never a gate */ }
}

function readProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const known = new Set(config.pairs.map((pair) => pair.id));
    state.discoveredPairIds = Array.isArray(saved.discoveredPairIds)
      ? saved.discoveredPairIds.filter((id) => known.has(id))
      : [];
  } catch {
    state.discoveredPairIds = [];
  }
}

function saveProgress(pairIds) {
  state.discoveredPairIds = [...new Set([...state.discoveredPairIds, ...pairIds])];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ discoveredPairIds: state.discoveredPairIds }));
  } catch { /* in-memory progress still works */ }
}

function chooseSessionPairs() {
  return shuffle(config.pairs, rng).slice(0, config.sessionPairs).map((pair) => pair.id);
}

function makeActionButton(label, target, handler, { className = '' } = {}) {
  const button = node('button', `painted-action ${className}`.trim(), {
    type: 'button',
    ariaLabel: label,
    dataset: { target, role: 'action' },
  });
  button.append(image(config.assets.ui.actionPlate, '', 'painted-action-art'));
  button.append(node('span', 'painted-action-label', { text: label }));
  bindTap(button, handler);
  return button;
}

function makeObjectCard(item, className, target) {
  const button = node('button', `object-card ${className}`.trim(), {
    type: 'button',
    ariaLabel: item.label,
    dataset: { target, role: 'choice', item: item.id },
  });
  button.append(image(item.art, item.alt, 'object-card-art'));
  button.append(node('span', 'object-card-label', { text: item.label }));
  return button;
}

function renderSplash({ announce = false } = {}) {
  state.mode = null;
  state.round = 0;
  state.activeItemId = null;
  state.activePairId = null;
  state.selectedItemId = null;
  const screen = makeScreen('splash', config.assets.backgrounds.splash, 'splash-screen');
  addHud(screen, { splash: true, replay: () => speak('choose') });

  const content = node('div', 'splash-content');
  content.append(image(config.assets.ui.title, 'Then and Now', 'title-lockup'));
  content.append(node('p', 'splash-kicker', { text: 'HISTORY DETECTIVE ADVENTURES' }));

  const choices = node('div', 'mode-choices');
  const modeArt = {
    sort: config.assets.ui.travelerMedallion,
    match: config.assets.ui.detectiveMedallion,
  };
  for (const mode of config.modes) {
    const button = node('button', `mode-card mode-${mode.id}`, {
      type: 'button',
      ariaLabel: mode.title,
      dataset: { target: `mode-${mode.id}`, role: 'mode' },
    });
    button.append(image(modeArt[mode.id], '', 'mode-medallion'));
    const plate = node('span', 'mode-nameplate');
    plate.append(image(config.assets.ui.actionPlate, '', 'mode-nameplate-art'));
    plate.append(node('span', 'mode-name', { text: mode.shortTitle }));
    button.append(plate);
    bindTap(button, () => startMode(mode.id));
    choices.append(button);
  }
  content.append(choices);

  const gallery = node('button', 'gallery-peek', {
    type: 'button',
    ariaLabel: 'Open the Time Traveler Gallery',
    dataset: { target: 'gallery', role: 'reward' },
  });
  gallery.append(image(config.assets.ui.badge, '', 'gallery-peek-badge'));
  gallery.append(node('span', 'gallery-peek-copy', {
    text: state.discoveredPairIds.length ? `${state.discoveredPairIds.length} CLUES FOUND` : 'TIME TRAVELER GALLERY',
  }));
  bindTap(gallery, () => {
    if (state.discoveredPairIds.length) {
      state.galleryPairIds = state.discoveredPairIds.slice(-3);
      renderGallery({ announce: true, stored: true });
    } else {
      pulse(gallery);
      speak('gallery-empty');
    }
  });
  content.append(gallery);
  screen.append(content);
  state.awaitingInput = true;
  if (announce) speak('choose');
}

async function startMode(id) {
  if (!config.modes.some((mode) => mode.id === id)) return false;
  startMusic();
  state.mode = id;
  state.round = 0;
  state.sessionPairIds = chooseSessionPairs();
  state.sorted = [];
  state.matches = [];
  state.galleryPairIds = [];
  state.lastResult = null;
  state.candidates = [];
  if (id === 'sort') {
    const pairGroups = [];
    for (const pairId of state.sessionPairIds) {
      const pair = pairMap.get(pairId);
      pairGroups.push(shuffle([
        { ...pair.then, era: 'then', pairId },
        { ...pair.now, era: 'now', pairId },
      ], rng));
    }
    state.sortQueue = pairGroups.flat();
    renderSort({ announce: false });
  } else {
    renderMatch({ announce: false });
  }
  const introKey = id === 'sort' ? 'sort-intro' : 'match-intro';
  if (!hasWelcomed) {
    hasWelcomed = true;
    speakSequence([
      ['welcome', config.voice.welcome],
      { key: introKey, text: config.voice[introKey], gap: 100 },
    ]);
  } else {
    speak(introKey);
  }
  return getState();
}

function renderSort({ announce = false } = {}) {
  const item = currentSortItem();
  if (!item) {
    finishMode();
    return;
  }
  state.activeItemId = item.id;
  state.activePairId = item.pairId;
  state.selectedItemId = null;
  const screen = makeScreen('sort', config.assets.backgrounds.book, 'book-screen sort-screen');
  addHud(screen, { replay: repeatPrompt });

  const header = node('header', 'play-header');
  header.append(node('span', 'screen-kicker', { text: 'HISTORY DETECTIVE' }));
  header.append(node('h1', 'screen-title', { text: 'THEN OR NOW?' }));
  header.append(progressDots(state.sortQueue.length, state.round));
  screen.append(header);

  const workspace = node('div', 'sort-workspace');
  const pockets = {};
  for (const era of ['then', 'now']) {
    const pocket = node('button', `era-pocket era-${era}`, {
      type: 'button',
      ariaLabel: era === 'then' ? 'Put it in Then, long ago' : 'Put it in Now, today',
      dataset: { target: `era-${era}`, role: 'destination', era },
    });
    pocket.append(node('span', 'era-label', { text: era.toUpperCase() }));
    pocket.append(image(era === 'then' ? config.assets.ui.thenPocket : config.assets.ui.nowPocket, '', 'era-pocket-art'));
    const pile = node('span', 'pocket-pile', { ariaHidden: 'true' });
    for (const placed of state.sorted.filter((entry) => entry.era === era).slice(-3)) {
      pile.append(image(itemMap.get(placed.itemId)?.art, '', 'pocket-thumb'));
    }
    pocket.append(pile);
    bindTap(pocket, () => attemptSort(item.id, era));
    pockets[era] = pocket;
    workspace.append(pocket);
  }

  const card = makeObjectCard(item, 'sort-focal-card', `sort-item-${item.id}`);
  card.dataset.role = 'draggable';
  installSortCardInput(card, item, pockets);
  workspace.append(card);
  screen.append(workspace);
  state.awaitingInput = true;
  nudger.arm();
  if (announce) speak('sort-intro');
}

function installSortCardInput(card, item, pockets) {
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let dy = 0;
  let moved = false;

  const select = () => {
    if (state.busy || state.screen !== 'sort') return;
    state.selectedItemId = item.id;
    card.classList.add('is-selected');
    playObjectSound(item.id);
    speak(`object-${item.id}`, item.label);
    nudger.poke();
  };

  const down = (event) => {
    if (state.busy || event.isPrimary === false) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    dx = 0;
    dy = 0;
    moved = false;
    card.setPointerCapture?.(pointerId);
    card.classList.add('is-lifted');
    try { sfx.tick(); } catch { /* optional */ }
  };
  const move = (event) => {
    if (event.pointerId !== pointerId) return;
    dx = event.clientX - startX;
    dy = event.clientY - startY;
    if (Math.hypot(dx, dy) > 8) moved = true;
    if (moved) {
      event.preventDefault();
      card.classList.add('is-dragging');
      card.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${Math.max(-7, Math.min(7, dx / 24))}deg)`;
    }
  };
  const finish = (event, cancelled = false) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    card.classList.remove('is-lifted', 'is-dragging');
    card.style.transform = '';
    if (cancelled) return;
    if (!moved) {
      select();
      return;
    }
    nudger.poke();
    const point = { x: event.clientX, y: event.clientY };
    const hit = Object.entries(pockets).find(([, pocket]) => {
      const rect = pocket.getBoundingClientRect();
      const pad = 28;
      return point.x >= rect.left - pad && point.x <= rect.right + pad
        && point.y >= rect.top - pad && point.y <= rect.bottom + pad;
    });
    if (hit) attemptSort(item.id, hit[0]);
    else {
      card.classList.add('is-returning');
      timers.after(420, () => card.classList.remove('is-returning'));
    }
  };
  const click = (event) => { if (event.detail === 0) select(); };
  const cancel = (event) => finish(event, true);
  card.addEventListener('pointerdown', down);
  card.addEventListener('pointermove', move);
  card.addEventListener('pointerup', finish);
  card.addEventListener('pointercancel', cancel);
  card.addEventListener('click', click);
  register(() => {
    card.removeEventListener('pointerdown', down);
    card.removeEventListener('pointermove', move);
    card.removeEventListener('pointerup', finish);
    card.removeEventListener('pointercancel', cancel);
    card.removeEventListener('click', click);
  });
}

async function attemptSort(itemId, era) {
  const item = currentSortItem();
  if (state.screen !== 'sort' || state.busy || !item || item.id !== itemId) return false;
  nudger.poke();
  const card = document.querySelector(`[data-item="${item.id}"]`);
  const pocket = document.querySelector(`[data-target="era-${era}"]`);
  if (era !== item.era) {
    state.lastResult = 'wrong';
    state.busy = true;
    state.awaitingInput = false;
    card?.classList.add('is-wrong');
    pocket?.classList.add('is-wrong');
    try { sfx.boing(); } catch { /* optional */ }
    speakRetry('try-sort');
    await timers.wait(700);
    card?.classList.remove('is-wrong');
    pocket?.classList.remove('is-wrong');
    state.busy = false;
    state.awaitingInput = true;
    return false;
  }

  state.busy = true;
  state.awaitingInput = false;
  state.lastResult = 'correct';
  state.sorted.push({ itemId: item.id, pairId: item.pairId, era });
  card?.classList.add('is-correct');
  pocket?.classList.add('is-correct');
  playObjectSound(item.id);
  try { sfx.pop(); } catch { /* optional */ }
  await Promise.all([speak(era === 'then' ? 'sort-then' : 'sort-now'), timers.wait(780)]);
  state.round += 1;
  const pairComplete = state.sorted.filter((entry) => entry.pairId === item.pairId).length === 2;
  if (pairComplete) {
    renderReveal(pairMap.get(item.pairId), {
      announce: true,
      isFinal: state.round >= state.sortQueue.length,
      onNext: advanceSortAfterReveal,
    });
  } else {
    renderSort({ announce: false });
  }
  return true;
}

function advanceSortAfterReveal() {
  if (state.screen !== 'reveal' || state.busy) return false;
  if (state.round >= state.sortQueue.length) finishMode();
  else {
    renderSort({ announce: false });
    speak('next-clue');
  }
  return true;
}

function prepareCandidates(pair) {
  const wrong = shuffle(config.pairs.filter((entry) => entry.id !== pair.id), rng).slice(0, 2).map((entry) => entry.now);
  state.candidates = shuffle([pair.now, ...wrong], rng).map((item) => item.id);
}

function renderMatch({ announce = false } = {}) {
  const pair = currentPair();
  if (!pair) {
    finishMode();
    return;
  }
  state.activePairId = pair.id;
  state.activeItemId = pair.then.id;
  if (!state.candidates.length) prepareCandidates(pair);
  const screen = makeScreen('match', config.assets.backgrounds.book, 'book-screen match-screen');
  addHud(screen, { replay: repeatPrompt });

  const header = node('header', 'play-header');
  header.append(node('span', 'screen-kicker', { text: 'SAME JOB • NEW TOOL' }));
  header.append(node('h1', 'screen-title', { text: 'FIND ITS MATCH' }));
  header.append(progressDots(state.sessionPairIds.length, state.round));
  screen.append(header);

  const workspace = node('div', 'match-workspace');
  const anchorSide = node('section', 'match-page match-anchor-page');
  anchorSide.append(node('h2', 'era-label page-label', { text: 'THEN' }));
  const anchor = makeObjectCard(pair.then, 'anchor-card', `anchor-${pair.then.id}`);
  bindTap(anchor, () => {
    playObjectSound(pair.then.id);
    speak(`object-${pair.then.id}`, pair.then.label);
  });
  anchorSide.append(anchor);
  workspace.append(anchorSide);

  const choicesSide = node('section', 'match-page match-choices-page');
  choicesSide.append(node('h2', 'era-label page-label', { text: 'NOW' }));
  const candidates = node('div', 'candidate-grid');
  for (const id of state.candidates) {
    const item = itemMap.get(id);
    const candidate = makeObjectCard(item, 'candidate-card', `candidate-${id}`);
    bindTap(candidate, () => chooseMatch(pair.id, id));
    candidates.append(candidate);
  }
  choicesSide.append(candidates);
  workspace.append(choicesSide);
  screen.append(workspace);
  state.awaitingInput = true;
  nudger.arm();
  if (announce) speak('match-intro');
}

async function chooseMatch(pairId, candidateId) {
  const pair = currentPair();
  if (state.screen !== 'match' || state.busy || !pair || pair.id !== pairId) return false;
  const candidate = document.querySelector(`[data-target="candidate-${candidateId}"]`);
  nudger.poke();
  if (candidateId !== pair.now.id) {
    state.lastResult = 'wrong';
    state.busy = true;
    state.awaitingInput = false;
    candidate?.classList.add('is-wrong');
    playObjectSound(candidateId);
    try { sfx.boing(); } catch { /* optional */ }
    speakRetry('try-match');
    await timers.wait(680);
    candidate?.classList.remove('is-wrong');
    state.busy = false;
    state.awaitingInput = true;
    return false;
  }

  state.busy = true;
  state.awaitingInput = false;
  state.lastResult = 'correct';
  state.matches.push(pair.id);
  candidate?.classList.add('is-correct');
  playObjectSound(candidateId);
  try { sfx.sparkle(); } catch { /* optional */ }
  await timers.wait(420);
  renderReveal(pair, {
    announce: true,
    isFinal: state.round + 1 >= state.sessionPairIds.length,
    onNext: advanceMatch,
  });
  return true;
}

function renderReveal(pair, { announce = true, isFinal = false, onNext = advanceMatch } = {}) {
  const screen = makeScreen('reveal', config.assets.backgrounds.book, 'book-screen reveal-screen');
  addHud(screen, { replay: () => speak(`pair-${pair.id}`, pair.relation) });
  const header = node('header', 'play-header reveal-header');
  header.append(node('span', 'screen-kicker', { text: 'CLEVER CHANGE!' }));
  header.append(node('h1', 'screen-title', { text: 'SAME JOB' }));
  screen.append(header);

  const spread = node('div', 'reveal-spread');
  const thenCard = makeObjectCard(pair.then, 'reveal-card reveal-then', `reveal-${pair.then.id}`);
  const badge = image(config.assets.ui.badge, '', 'reveal-badge');
  const nowCard = makeObjectCard(pair.now, 'reveal-card reveal-now', `reveal-${pair.now.id}`);
  bindTap(thenCard, () => { playObjectSound(pair.then.id); speak(`object-${pair.then.id}`, pair.then.label); });
  bindTap(nowCard, () => { playObjectSound(pair.now.id); speak(`object-${pair.now.id}`, pair.now.label); });
  spread.append(thenCard, badge, nowCard);
  screen.append(spread);
  screen.append(node('p', 'relation-copy', { text: pair.relation }));
  screen.append(makeActionButton(isFinal ? 'OPEN MY GALLERY' : 'NEXT CLUE', 'next-clue', onNext));
  state.awaitingInput = true;
  nudger.arm();
  if (announce) {
    speakSequence([
      ['pair-cheer', config.voice['pair-cheer']],
      { key: `pair-${pair.id}`, text: pair.relation, gap: 120 },
    ]);
  }
}

function advanceMatch() {
  if (state.screen !== 'reveal' || state.busy) return false;
  state.round += 1;
  state.candidates = [];
  if (state.round >= state.sessionPairIds.length) finishMode();
  else {
    renderMatch({ announce: false });
    speak('next-clue');
  }
  return true;
}

function finishMode() {
  state.galleryPairIds = [...state.sessionPairIds];
  saveProgress(state.galleryPairIds);
  renderGallery({ announce: true, stored: false });
}

function renderGallery({ announce = true, stored = false } = {}) {
  const ids = state.galleryPairIds.filter((id) => pairMap.has(id));
  const screen = makeScreen('gallery', config.assets.backgrounds.gallery, 'gallery-screen');
  addHud(screen, { replay: () => speak(ids.length ? 'gallery' : 'gallery-empty') });
  screen.append(image(config.assets.ui.badge, 'History Detective badge', 'gallery-badge'));
  screen.append(node('span', 'screen-kicker gallery-kicker', { text: 'TIME TRAVELER GALLERY' }));
  screen.append(node('h1', 'gallery-title', { text: ids.length ? 'LOOK WHAT CHANGED!' : 'YOUR BOOK IS WAITING' }));

  const rail = node('div', 'gallery-rail');
  for (const id of ids) {
    const pair = pairMap.get(id);
    const spread = node('button', 'gallery-spread', {
      type: 'button',
      ariaLabel: `Hear about ${pair.then.label} and ${pair.now.label}`,
      dataset: { target: `gallery-pair-${id}`, role: 'replay' },
    });
    spread.append(image(pair.then.art, pair.then.alt, 'gallery-card gallery-card-then'));
    spread.append(image(config.assets.ui.badge, '', 'gallery-star'));
    spread.append(image(pair.now.art, pair.now.alt, 'gallery-card gallery-card-now'));
    bindTap(spread, () => {
      playObjectSound(pair.now.id);
      speak(`pair-${pair.id}`, pair.relation);
    });
    rail.append(spread);
  }
  screen.append(rail);
  screen.append(makeActionButton(stored ? 'CHOOSE AN ADVENTURE' : 'PLAY AGAIN', 'replay-mode', () => {
    if (stored || !state.mode) renderSplash({ announce: true });
    else startMode(state.mode);
  }));
  state.awaitingInput = true;
  if (ids.length) {
    stopCelebration = burstConfetti({ host: screen, count: 22, duration: 4400, loop: true, rng, drift: 52 });
    tada({ host: screen, count: 34, duration: 2200, rng });
  }
  if (announce) speak(ids.length ? 'gallery' : 'gallery-empty');
}

function repeatPrompt() {
  if (state.screen === 'splash') return speak('choose');
  if (state.screen === 'sort') {
    const item = currentSortItem();
    if (!item) return speak('sort-intro');
    playObjectSound(item.id);
    return speakSequence([
      [`object-${item.id}`, item.label],
      { key: 'sort-intro', text: config.voice['sort-intro'], gap: 100 },
    ]);
  }
  if (state.screen === 'match') {
    const pair = currentPair();
    if (!pair) return speak('match-intro');
    playObjectSound(pair.then.id);
    return speakSequence([
      [`object-${pair.then.id}`, pair.then.label],
      { key: 'match-intro', text: config.voice['match-intro'], gap: 100 },
    ]);
  }
  if (state.screen === 'reveal') {
    const pair = pairMap.get(state.activePairId) || currentPair();
    return pair ? speak(`pair-${pair.id}`, pair.relation) : Promise.resolve();
  }
  if (state.screen === 'gallery') return speak(state.galleryPairIds.length ? 'gallery' : 'gallery-empty');
  return Promise.resolve();
}

function getState() {
  return {
    screen: state.screen,
    mode: state.mode,
    seed: state.seed,
    round: state.round,
    awaitingInput: state.awaitingInput,
    busy: state.busy,
    activeItemId: state.activeItemId,
    activePairId: state.activePairId,
    sessionPairIds: [...state.sessionPairIds],
    sortQueue: state.sortQueue.map((item) => ({ id: item.id, era: item.era, pairId: item.pairId })),
    sorted: state.sorted.map((entry) => ({ ...entry })),
    matches: [...state.matches],
    candidates: [...state.candidates],
    galleryPairIds: [...state.galleryPairIds],
    discoveredPairIds: [...state.discoveredPairIds],
    selectedItemId: state.selectedItemId,
    lastResult: state.lastResult,
    muted: state.muted,
    reducedMotion: state.reducedMotion,
    audioLog: voiceClips.getAudioLog(),
    bgm: bgm.stats(),
  };
}

async function debugTap(id) {
  const target = [...document.querySelectorAll('[data-target]')].find((element) => element.dataset.target === id);
  if (!target) return false;
  target.click();
  return true;
}

async function winRound() {
  if (state.screen === 'sort') {
    const item = currentSortItem();
    return item ? attemptSort(item.id, item.era) : false;
  }
  if (state.screen === 'match') {
    const pair = currentPair();
    return pair ? chooseMatch(pair.id, pair.now.id) : false;
  }
  if (state.screen === 'reveal') return state.mode === 'sort' ? advanceSortAfterReveal() : advanceMatch();
  return false;
}

installDebug({
  gameId: config.id,
  engine: 'custom-history-detective',
  ready,
  listModes: () => config.modes.map(({ id, title, skill }) => ({ id, title, skill })),
  startMode,
  getState,
  getTargets: () => collectTargets(app),
  tap: debugTap,
  winRound,
  home: () => renderSplash({ announce: false }),
  mute: setMuted,
  timers,
  narrator: voice,
  voice: voiceClips,
  sfx,
  onSeed: (seeded, seed) => { rng = seeded; state.seed = seed; },
  place: (itemId, era) => attemptSort(itemId, era),
  choose: (pairId, candidateId) => chooseMatch(pairId, candidateId),
  repeatPrompt,
  getAudioLog: voiceClips.getAudioLog,
  clearAudioLog: voiceClips.clearAudioLog,
  clearProgress: () => {
    state.discoveredPairIds = [];
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    renderSplash({ announce: false });
    return true;
  },
});

async function init() {
  readProgress();
  bgm.preload(config.assets.music);
  const art = [
    ...Object.values(config.assets.backgrounds),
    ...Object.values(config.assets.ui),
    ...config.pairs.flatMap((pair) => [pair.then.art, pair.now.art]),
  ];
  await Promise.all([
    voiceClips.init(config.assets.audio.manifest, config.assets.audio.lines, defaultLines),
    preloadImages(art),
  ]);
  installKioskGuards();
  installUnlockOnGesture({
    extra: [bgm.unlock],
    onFirst: () => {
      startMusic();
    },
  });
  renderSplash({ announce: false });
  app.setAttribute('aria-busy', 'false');
  readyResolve(true);
}

window.addEventListener('pagehide', () => {
  voice.dispose();
  bgm.stop({ fadeOutMs: 0 });
  timers.clearAll();
  nudger.stop();
});

init().catch((error) => {
  console.error('Then & Now failed to start', error);
  app.innerHTML = '<section class="load-error"><div><h1>Let\'s open the history book again.</h1><p>Reload this page to try once more.</p></div></section>';
  app.setAttribute('aria-busy', 'false');
  readyResolve(false);
});
