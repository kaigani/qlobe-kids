import config from '../config.js';
import * as audio from '../../../shared/js/audio.js';
import * as speech from '../../../shared/js/speech.js';
import * as rawSfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as content from '../../../shared/js/content.js';
import { onTap } from '../../../shared/js/tap.js';

const $ = (id) => document.getElementById(id);
const els = {
  screens: [...document.querySelectorAll('.screen')],
  splash: $('splash'),
  play: $('play'),
  celebration: $('celebration'),
  end: $('end'),
  splashHome: $('splash-home'),
  splashSound: $('splash-sound'),
  playDefault: $('play-default'),
  modeButtons: [...document.querySelectorAll('[data-mode]')],
  playBack: $('play-back'),
  playSound: $('play-sound'),
  dots: $('round-dots'),
  promptLetter: $('prompt-letter'),
  basket: $('basket-target'),
  basketLetter: $('basket-letter'),
  basketCatch: $('basket-catch'),
  playFinds: $('play-basket-finds'),
  shelf: $('card-shelf'),
  sparkles: $('sparkles'),
  celebrationBack: $('celebration-back'),
  celebrationLetter: $('celebration-letter'),
  celebrationFinds: $('celebration-finds'),
  next: $('next-round'),
  endBack: $('end-back'),
  endLetters: $('end-letters'),
  again: $('play-again'),
};

const state = {
  screen: 'splash',
  mode: null,
  round: -1,
  targets: [],
  target: null,
  cards: [],
  found: new Set(),
  awaitingInput: false,
  busy: false,
  muted: false,
  timeScale: 1,
  seed: Date.now() & 0xffff,
  audioToken: 0,
  idleTimer: null,
  idleSpoken: false,
  lastSpokenWord: null,
  lastWordSource: null,
  drag: null,
};

const ALPHABET = [...'abcdefghijklmnopqrstuvwxyz'];
const T = (ms) => Math.max(0, ms * state.timeScale);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, T(ms)));

let randomState = state.seed >>> 0;
function random() {
  randomState += 0x6d2b79f5;
  let value = randomState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

const sfx = {};
for (const key of ['tick', 'pop', 'unpop', 'whoosh', 'sparkle', 'tada']) {
  sfx[key] = () => {
    if (state.muted) return;
    try { rawSfx[key](); } catch { /* tactile feedback must never strand play */ }
  };
}

let localWordManifest = { words: {} };
const localWordReady = fetch(new URL('../assets/audio/word-manifest.json', import.meta.url))
  .then((response) => response.ok ? response.json() : { words: {} })
  .then((manifest) => { localWordManifest = manifest; })
  .catch(() => { localWordManifest = { words: {} }; });
const localWordCache = new Map();
let activeLocalWord = null;
let activeLocalResolve = null;
let localWordToken = 0;
let localWordsUnlocked = false;

function getLocalWordElement(entry) {
  const key = entry.file || entry.url;
  let element = localWordCache.get(key);
  if (!element) {
    const source = entry.url
      ? new URL(entry.url, import.meta.url)
      : new URL(`../assets/audio/${entry.file}`, import.meta.url);
    element = new Audio(source);
    element.preload = 'auto';
    localWordCache.set(key, element);
  }
  return element;
}

function stopLocalWord() {
  localWordToken += 1;
  if (activeLocalWord) {
    try { activeLocalWord.pause(); activeLocalWord.currentTime = 0; } catch { /* no-op */ }
    activeLocalWord = null;
  }
  if (activeLocalResolve) {
    const resolve = activeLocalResolve;
    activeLocalResolve = null;
    resolve();
  }
}

function unlockLocalWords() {
  if (localWordsUnlocked) return;
  const entry = Object.values(localWordManifest.words || {})[0];
  if (!entry) return;
  localWordsUnlocked = true;
  try {
    const element = getLocalWordElement(entry);
    element.muted = true;
    const playing = element.play();
    if (playing?.then) {
      playing.then(() => {
        try { element.pause(); element.currentTime = 0; element.muted = false; } catch { /* no-op */ }
      }).catch(() => { element.muted = false; localWordsUnlocked = false; });
    }
  } catch { localWordsUnlocked = false; }
}

async function playPackagedWord(card, fallbackText) {
  await localWordReady;
  const entry = localWordManifest.words?.[card.word];
  if (!entry) {
    state.lastWordSource = 'shared';
    return audio.play('words', card.word, { fallbackText, rate: 0.76 });
  }
  state.lastWordSource = entry.kind || 'local';
  const token = ++localWordToken;
  const element = getLocalWordElement(entry);
  if (activeLocalWord && activeLocalWord !== element) {
    try { activeLocalWord.pause(); activeLocalWord.currentTime = 0; } catch { /* no-op */ }
  }
  if (activeLocalResolve) activeLocalResolve();
  activeLocalWord = element;
  try { element.currentTime = 0; } catch { /* no-op */ }
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      element.removeEventListener('ended', finish);
      element.removeEventListener('error', fail);
      if (activeLocalWord === element) activeLocalWord = null;
      if (activeLocalResolve === finish) activeLocalResolve = null;
      resolve();
    };
    const fail = () => {
      finish();
      if (token === localWordToken) audio.play('words', card.word, { fallbackText, rate: 0.76 });
    };
    element.addEventListener('ended', finish);
    element.addEventListener('error', fail);
    activeLocalResolve = finish;
    const playing = element.play();
    if (playing?.catch) playing.catch(fail);
    timer = setTimeout(finish, (entry.dur || 2) * 1000 + 500);
  });
}

let unlocked = false;
function unlockAll() {
  if (!unlocked) unlocked = true;
  try { rawSfx.unlock(); } catch { /* no-op */ }
  try { speech.unlock(); } catch { /* no-op */ }
  try { audio.unlock(); } catch { /* no-op */ }
  try { voice.unlock(); } catch { /* no-op */ }
  try { unlockLocalWords(); } catch { /* no-op */ }
}
window.addEventListener('pointerdown', unlockAll, { passive: true });

const ready = Promise.all([
  voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
  content.ready(),
  localWordReady,
]);

function stopAudio() {
  state.audioToken += 1;
  audio.stop();
  voice.stop();
  speech.stop();
  stopLocalWord();
}

async function guide(key) {
  if (state.muted) return;
  await ready;
  return voice.say(key, config.voice[key]);
}

async function sayWord(card) {
  const spokenName = card.name || card.word.replace(/[-_]/g, ' ');
  state.lastSpokenWord = spokenName;
  await localWordReady;
  const packaged = localWordManifest.words?.[card.word];
  state.lastWordSource = packaged?.kind || (packaged ? 'local' : 'shared');
  if (state.muted) return;
  await audio.ready;
  return playPackagedWord(card, spokenName);
}

async function sayLetter(letter) {
  if (state.muted) return;
  await audio.ready;
  return audio.play('fragments', letter, { fallbackText: content.letterSound(letter)?.phonic || letter, rate: 0.74 });
}

function showScreen(name) {
  clearIdle();
  state.screen = name;
  for (const screen of els.screens) screen.hidden = screen.id !== name;
}

function wireTap(element, action, { tick = true } = {}) {
  onTap(element, action, {
    feedback: () => {
      unlockAll();
      if (tick) sfx.tick();
      element.classList.add('is-pressed');
      setTimeout(() => element.classList.remove('is-pressed'), 150);
    },
  });
}

function goSplash({ speakWelcome = false } = {}) {
  stopAudio();
  state.mode = null;
  state.round = -1;
  state.awaitingInput = false;
  state.busy = false;
  state.cards = [];
  state.found.clear();
  showScreen('splash');
  if (speakWelcome) guide('welcome');
}

function buildTargetOrder(mode) {
  const result = [];
  while (result.length < mode.rounds) result.push(...shuffle(mode.letters));
  return result.slice(0, mode.rounds);
}

async function startMode(modeId) {
  const modeDefinition = config.modes.find((entry) => entry.id === modeId);
  if (!modeDefinition) return false;
  stopAudio();
  await ready;
  const letters = shuffle(ALPHABET).slice(0, modeDefinition.letterCount);
  const items = letters.flatMap((letter) => content.letterObjects(letter)
    .map((item) => ({ ...item, letter })));
  state.mode = { ...modeDefinition, letters, items };
  state.round = -1;
  state.targets = buildTargetOrder(state.mode);
  showScreen('play');
  await nextRound({ modeIntro: true });
  return true;
}

function chooseCards() {
  const matching = shuffle(state.mode.items.filter((item) => item.letter === state.target)).slice(0, 2);
  const different = shuffle(state.mode.items.filter((item) => item.letter !== state.target)).slice(0, state.mode.itemsPerRound - matching.length);
  return shuffle([...matching, ...different]).map((item, index) => ({ ...item, id: `card-${state.round}-${index}` }));
}

function renderDots() {
  els.dots.replaceChildren();
  for (let index = 0; index < state.mode.rounds; index += 1) {
    const dot = document.createElement('span');
    dot.className = `round-dot${index < state.round ? ' done' : ''}`;
    els.dots.append(dot);
  }
}

function renderCards() {
  els.shelf.replaceChildren();
  for (const card of state.cards) {
    const button = document.createElement('button');
    button.className = 'picture-card';
    button.dataset.target = card.id;
    button.dataset.word = card.word;
    button.setAttribute('aria-label', card.word);
    const image = document.createElement('img');
    image.src = card.image;
    image.alt = card.name || card.word;
    image.draggable = false;
    button.append(image);
    button.addEventListener('pointerdown', (event) => beginDrag(event, button, card));
    button.addEventListener('click', (event) => {
      if (event.detail === 0) previewCard(card);
    });
    els.shelf.append(button);
  }
}

async function nextRound({ modeIntro = false } = {}) {
  stopAudio();
  state.round += 1;
  if (state.round >= state.mode.rounds) {
    showEnd();
    return;
  }
  state.target = state.targets[state.round];
  state.cards = chooseCards();
  state.found.clear();
  state.lastSpokenWord = null;
  state.lastWordSource = null;
  state.awaitingInput = false;
  state.busy = false;
  state.idleSpoken = false;
  els.promptLetter.textContent = state.target.toUpperCase();
  els.basketLetter.textContent = state.target.toUpperCase();
  renderDots();
  renderCards();
  els.playFinds.replaceChildren();
  showScreen('play');

  const token = ++state.audioToken;
  if (modeIntro) await guide(`${state.mode.id}-sounds`);
  else await guide('find');
  if (token !== state.audioToken || state.screen !== 'play') return;
  await sayLetter(state.target);
  if (token !== state.audioToken || state.screen !== 'play') return;
  state.awaitingInput = true;
  armIdle();
}

function clearIdle() {
  if (state.idleTimer) clearTimeout(state.idleTimer);
  state.idleTimer = null;
}

function armIdle() {
  clearIdle();
  if (state.idleSpoken || !state.awaitingInput) return;
  state.idleTimer = setTimeout(async () => {
    if (!state.awaitingInput || state.busy || state.screen !== 'play') return;
    state.idleSpoken = true;
    await guide('idle');
    if (state.awaitingInput && state.screen === 'play') sayLetter(state.target);
  }, T(9000));
}

async function replayPrompt() {
  if (state.screen === 'splash') {
    stopAudio();
    await guide('welcome');
    return;
  }
  if (state.screen !== 'play') return;
  clearIdle();
  stopAudio();
  await guide('find');
  if (state.screen === 'play') await sayLetter(state.target);
  armIdle();
}

function beginDrag(event, button, card) {
  if (!state.awaitingInput || state.busy || state.drag || event.isPrimary === false) return;
  event.preventDefault();
  unlockAll();
  state.drag = {
    pointerId: event.pointerId,
    button,
    card,
    x: event.clientX,
    y: event.clientY,
    dx: 0,
    dy: 0,
    originRect: button.getBoundingClientRect(),
    moved: false,
  };
  button.setPointerCapture?.(event.pointerId);
}

function moveDrag(event) {
  const drag = state.drag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 8) return;
  drag.moved = true;
  drag.dx = dx;
  drag.dy = dy;
  drag.button.classList.add('is-dragging');
  drag.button.style.transform = `translate(${dx}px, ${dy}px) scale(1.04) rotate(${Math.max(-5, Math.min(5, dx / 30))}deg)`;
}

function finishDrag(event, cancelled = false) {
  const drag = state.drag;
  if (!drag || event.pointerId !== undefined && event.pointerId !== drag.pointerId) return;
  state.drag = null;
  drag.button.classList.remove('is-dragging');
  if (cancelled) {
    drag.button.style.transform = '';
    return;
  }
  if (!drag.moved) {
    drag.button.style.transform = '';
    previewCard(drag.card);
    return;
  }
  const catchRect = els.basketCatch.getBoundingClientRect();
  const inside = event.clientX >= catchRect.left && event.clientX <= catchRect.right
    && event.clientY >= catchRect.top && event.clientY <= catchRect.bottom;
  if (inside) {
    placeCard(drag.card, drag.button, {
      transform: drag.button.style.transform,
      originRect: drag.originRect,
    });
  }
  else {
    const animation = drag.button.animate([
      { transform: `translate(${event.clientX - drag.x}px, ${event.clientY - drag.y}px) scale(1.04)` },
      { transform: 'translate(0, 0) scale(1)' },
    ], { duration: T(240), easing: 'ease-out' });
    animation.finished.finally(() => { drag.button.style.transform = ''; });
  }
}

window.addEventListener('pointermove', moveDrag, { passive: true });
window.addEventListener('pointerup', (event) => finishDrag(event));
window.addEventListener('pointercancel', (event) => finishDrag(event, true));
window.addEventListener('blur', () => {
  if (state.drag) finishDrag({ pointerId: state.drag.pointerId }, true);
});

async function previewCard(card) {
  if (!state.awaitingInput || state.found.has(card.id)) return { accepted: false };
  clearIdle();
  stopAudio();
  await sayWord(card);
  if (state.awaitingInput && state.screen === 'play') armIdle();
  return { accepted: true, spoken: true, placed: false };
}

async function returnDraggedCard(button, drop) {
  if (!drop?.transform) return;
  const animation = button.animate([
    { transform: drop.transform },
    { transform: 'translate(0, 0) scale(1)' },
  ], { duration: T(260), easing: 'ease-out' });
  await animation.finished.catch(() => {});
  button.style.transform = '';
}

async function flyDraggedCard(button, drop, targetRect) {
  if (!drop?.transform || !drop.originRect) return false;
  const origin = drop.originRect;
  const targetX = targetRect.left + targetRect.width / 2 - (origin.left + origin.width / 2);
  const targetY = targetRect.top + targetRect.height / 2 - (origin.top + origin.height / 2);
  const animation = button.animate([
    { transform: drop.transform, opacity: 1 },
    { transform: `translate(${targetX}px, ${targetY}px) scale(.28) rotate(10deg)`, opacity: 0 },
  ], { duration: T(430), easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'forwards' });
  await animation.finished.catch(() => {});
  button.classList.add('is-found');
  animation.cancel();
  button.style.transform = '';
  return true;
}

function addObjectToPlayBasket(card) {
  const image = document.createElement('img');
  image.src = card.image;
  image.alt = '';
  els.playFinds.append(image);
}

async function placeCard(card, button, drop = null) {
  if (!state.awaitingInput || state.busy || state.found.has(card.id)) return { accepted: false };
  clearIdle();
  state.busy = true;
  stopAudio();
  await sayWord(card);
  if (state.screen !== 'play') {
    state.busy = false;
    return { accepted: false };
  }

  if (card.letter !== state.target) {
    sfx.unpop();
    await returnDraggedCard(button, drop);
    button.classList.add('is-wrong');
    els.basket.classList.add('is-wrong');
    await wait(380);
    button.classList.remove('is-wrong');
    els.basket.classList.remove('is-wrong');
    await guide('nudge');
    state.busy = false;
    state.awaitingInput = true;
    armIdle();
    return { accepted: true, correct: false };
  }

  state.found.add(card.id);
  sfx.pop();
  const from = button.getBoundingClientRect();
  const to = els.basketCatch.getBoundingClientRect();
  sfx.whoosh();
  const flewFromDrop = await flyDraggedCard(button, drop, to);
  if (!flewFromDrop) {
    button.style.setProperty('--fly-x', `${to.left + to.width / 2 - (from.left + from.width / 2)}px`);
    button.style.setProperty('--fly-y', `${to.top + to.height / 2 - (from.top + from.height / 2)}px`);
    requestAnimationFrame(() => button.classList.add('is-found'));
    await wait(470);
  }
  addObjectToPlayBasket(card);
  els.basket.classList.add('is-ready');
  burstAtBasket(14);
  sfx.sparkle();
  await wait(360);
  els.basket.classList.remove('is-ready');

  const needed = state.cards.filter((item) => item.letter === state.target).length;
  if (state.found.size >= needed) {
    state.awaitingInput = false;
    for (const remaining of els.shelf.querySelectorAll('.picture-card:not(.is-found)')) remaining.classList.add('is-muted');
    state.busy = false;
    await wait(380);
    showCelebration();
  } else {
    state.busy = false;
    state.awaitingInput = true;
    armIdle();
  }
  return { accepted: true, correct: true };
}

function burstAtBasket(count = 22) {
  const rect = els.basketCatch.getBoundingClientRect();
  const colors = ['#ffd11a', '#ff5f7e', '#58c8ff', '#9ee23a', '#a86af2'];
  for (let index = 0; index < count; index += 1) {
    const spark = document.createElement('span');
    spark.className = 'spark';
    spark.textContent = index % 3 ? '★' : '✦';
    spark.style.setProperty('--x', `${rect.left + rect.width * random()}px`);
    spark.style.setProperty('--y', `${rect.top + rect.height * random()}px`);
    spark.style.setProperty('--dx', `${(random() - .5) * 220}px`);
    spark.style.setProperty('--dy', `${-40 - random() * 160}px`);
    spark.style.setProperty('--s', `${18 + random() * 25}px`);
    spark.style.setProperty('--c', colors[Math.floor(random() * colors.length)]);
    els.sparkles.append(spark);
    setTimeout(() => spark.remove(), T(900));
  }
}

async function showCelebration() {
  stopAudio();
  state.awaitingInput = false;
  els.celebrationLetter.textContent = state.target.toUpperCase();
  els.celebrationFinds.replaceChildren(...state.cards
    .filter((card) => state.found.has(card.id))
    .map((card) => {
      const image = document.createElement('img');
      image.src = card.image;
      image.alt = '';
      return image;
    }));
  const isLast = state.round >= state.mode.rounds - 1;
  els.next.setAttribute('aria-label', isLast ? 'Finish' : 'Next round');
  els.next.querySelector('span').textContent = isLast ? '✓' : '▶';
  showScreen('celebration');
  sfx.tada();
  await guide('round-cheer');
}

async function showEnd() {
  stopAudio();
  state.awaitingInput = false;
  els.endLetters.replaceChildren(...state.mode.letters.map((letter) => {
    const tile = document.createElement('span');
    tile.textContent = letter;
    return tile;
  }));
  showScreen('end');
  sfx.tada();
  await guide('final-cheer');
}

wireTap(els.splashHome, () => { stopAudio(); window.location.href = '../../'; });
wireTap(els.splashSound, () => replayPrompt());
wireTap(els.playDefault, () => startMode('two'));
for (const button of els.modeButtons) wireTap(button, () => startMode(button.dataset.mode));
wireTap(els.playBack, () => goSplash());
wireTap(els.playSound, () => replayPrompt());
wireTap(els.celebrationBack, () => goSplash());
wireTap(els.next, () => nextRound());
wireTap(els.endBack, () => goSplash());
wireTap(els.again, () => startMode(state.mode?.id || 'two'));

const debug = {
  version: 1,
  ready,
  listModes: () => config.modes.map(({ id, title, skill }) => ({ id, title, skill })),
  start: (modeId) => startMode(modeId),
  getState: () => ({
    screen: state.screen,
    mode: state.mode?.id || null,
    round: Math.max(0, state.round),
    roundsTotal: state.mode?.rounds || 0,
    target: state.target,
    letters: state.mode?.letters || [],
    found: state.found.size,
    inBasket: els.playFinds.children.length,
    lastSpokenWord: state.lastSpokenWord,
    lastWordSource: state.lastWordSource,
    needed: state.cards.filter((item) => item.letter === state.target).length,
    awaitingInput: state.awaitingInput,
  }),
  getLetterPool: () => [...ALPHABET],
  getTargets: () => {
    if (state.screen === 'splash') {
      return [els.playDefault, ...els.modeButtons].map((element) => {
        const rect = element.getBoundingClientRect();
        return { id: element.dataset.mode || 'play-default', role: 'neutral', rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } };
      });
    }
    return state.cards.filter((card) => !state.found.has(card.id)).map((card) => {
      const element = els.shelf.querySelector(`[data-target="${card.id}"]`);
      const rect = element?.getBoundingClientRect() || { x: 0, y: 0, width: 0, height: 0 };
      return { id: card.id, role: card.letter === state.target ? 'correct' : 'wrong', rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } };
    });
  },
  tap: async (targetId) => {
    if (targetId === 'play-default') return startMode('two');
    if (config.modes.some((mode) => mode.id === targetId)) return startMode(targetId);
    const card = state.cards.find((item) => item.id === targetId);
    return card ? previewCard(card) : { accepted: false };
  },
  drop: async (targetId) => {
    const card = state.cards.find((item) => item.id === targetId);
    const element = card && els.shelf.querySelector(`[data-target="${targetId}"]`);
    return card && element ? placeCard(card, element) : { accepted: false };
  },
  speakWord: async (word) => {
    const card = ALPHABET.flatMap((letter) => content.letterObjects(letter))
      .find((item) => item.word === word);
    if (!card) return { accepted: false };
    stopAudio();
    await sayWord(card);
    return { accepted: true, word: state.lastSpokenWord, source: state.lastWordSource };
  },
  winRound: async () => {
    for (const card of state.cards.filter((item) => item.letter === state.target && !state.found.has(item.id))) {
      const element = els.shelf.querySelector(`[data-target="${card.id}"]`);
      await placeCard(card, element);
    }
  },
  mute: () => { state.muted = true; stopAudio(); },
  seed: (seed) => { state.seed = Number(seed) >>> 0; randomState = state.seed; return state.seed; },
  fastTimers: (scale = .05) => { state.timeScale = Math.max(.01, Math.min(1, Number(scale) || .05)); return state.timeScale; },
  home: () => goSplash(),
};

window.QLOBE_DEBUG = debug;
goSplash();
