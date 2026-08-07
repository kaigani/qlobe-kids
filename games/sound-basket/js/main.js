import config from '../config.js';
import * as speech from '../../../shared/js/speech.js';
import * as rawSfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as content from '../../../shared/js/content.js';
import { onTap } from '../../../shared/js/tap.js';
import { unlockAll as sharedUnlockAll, installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { mulberry32, shuffle as sharedShuffle } from '../../../shared/js/rng.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { renderModeCards } from '../../../shared/js/mode-select.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';

const $ = (id) => document.getElementById(id);

// The two mode cards are built here, synchronously, BEFORE `els` below
// captures `[data-mode]` — `els.modeButtons` and getTargets()/debug.tap()
// both depend on that snapshot reflecting the real rendered buttons, not
// the (now-empty) static markup. `replace: false` keeps the static
// `#play-default` button in place; it's re-spliced back to the middle
// position afterward so the row still reads [mode-two, play, mode-three]
// left to right, matching `.mode-row`'s plain flex (DOM-order) layout.
const modeRow = document.querySelector('.mode-row');
const playDefaultButton = $('play-default');
const { cards: modeCardButtons } = renderModeCards({
  host: modeRow,
  modes: config.modes,
  replace: false,
  skin: false, // .mode-button keeps its own pixel-for-pixel look; only the
               // shared .qk-mode-card touch-floor contract is added (a
               // no-op — .mode-button's own min-height already clears it).
  cardClass: 'mode-button',
  showTitle: false, // decorate() builds the bespoke per-mode letter graphic
  targetPrefix: null, // this game's own getTargets()/debug.tap() key off
                       // the bare mode id (`two`/`three`), not `mode-<id>`
  decorate(button, mode) {
    const graphic = document.createElement('span');
    graphic.className = `mode-graphic mode-graphic-${mode.id}`;
    graphic.setAttribute('aria-hidden', 'true');
    if (mode.id === 'two') {
      graphic.innerHTML = '<i>A</i><i>M</i>';
    } else {
      graphic.innerHTML = '<i>C</i><i>P</i><i>T</i>';
    }
    const basket = document.createElement('img');
    basket.src = './assets/art/basket.png';
    basket.alt = '';
    graphic.append(basket);
    button.append(graphic);
    const copy = document.createElement('span');
    copy.className = 'mode-copy';
    copy.innerHTML = `<strong>${mode.id === 'two' ? '2' : '3'}</strong><small>sounds</small>`;
    button.append(copy);
  },
  onPick: (id) => startMode(id),
  feedback: (event) => {
    unlockAll();
    sfx.tick();
    const button = event.currentTarget;
    button.classList.add('is-pressed');
    setTimeout(() => button.classList.remove('is-pressed'), 150);
  },
});
modeRow.insertBefore(playDefaultButton, modeCardButtons[1]);

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
};

const ALPHABET = [...'abcdefghijklmnopqrstuvwxyz'];
const T = (ms) => Math.max(0, ms * state.timeScale);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, T(ms)));

let rng = mulberry32(state.seed);
function random() { return rng(); }
function shuffle(values) { return sharedShuffle(values, rng); }

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

// 44-byte silent WAV, same trick shared/js/voice-clips.js uses. MUST be a dedicated
// element, never one of localWordCache's real word clips: priming used to
// grab `Object.values(words)[0]` and mute/play/pause THAT element — which is
// the exact same element playPackagedWord() plays for real the moment that
// word comes up, so the two `muted` writes raced and could leave a real
// word silently muted.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
let localWordPrimer = null;

function unlockLocalWords() {
  if (localWordsUnlocked) return;
  localWordsUnlocked = true;
  try {
    if (!localWordPrimer) localWordPrimer = new Audio(SILENT_WAV);
    const element = localWordPrimer;
    element.muted = true;
    const playing = element.play();
    if (playing?.then) {
      playing.then(() => {
        try { element.pause(); element.currentTime = 0; element.muted = false; } catch { /* no-op */ }
      }).catch(() => { localWordsUnlocked = false; });
    }
  } catch { localWordsUnlocked = false; }
}

// This latch has the same reopen requirement audio-unlock.js documents for
// every other channel: an iPadOS app-switch can revoke the primed element's
// play permission, so the guard must reset on foreground or the local word
// channel goes silent for the rest of the session while every other channel
// (fixed via installUnlockOnGesture below) correctly revives.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) localWordsUnlocked = false;
});
window.addEventListener('pageshow', () => { localWordsUnlocked = false; });

async function playPackagedWord(card, fallbackText) {
  await localWordReady;
  const entry = localWordManifest.words?.[card.word];
  if (!entry) {
    state.lastWordSource = 'shared';
    return voice.sayFile(content.wordAudio(card.word), fallbackText);
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
      if (token === localWordToken) voice.sayFile(content.wordAudio(card.word), fallbackText);
    };
    element.addEventListener('ended', finish);
    element.addEventListener('error', fail);
    activeLocalResolve = finish;
    const playing = element.play();
    if (playing?.catch) playing.catch(fail);
    timer = setTimeout(finish, (entry.dur || 2) * 1000 + 500);
  });
}

// Fans out to sfx/speech/voice-clips (audio-unlock.js's own list) plus this
// game's local word-audio channel. installUnlockOnGesture's latch RESETS on
// visibilitychange/pageshow, so a touch after an iPad app-switch genuinely
// re-unlocks instead of the game going silently silent for the rest of the
// session (unlockLocalWords()'s own latch never reopened before this).
function unlockAll() {
  sharedUnlockAll([unlockLocalWords]);
}
installUnlockOnGesture({ extra: [unlockLocalWords] });
installKioskGuards();

const ready = Promise.all([
  voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
  content.ready(),
  localWordReady,
]);

function stopAudio() {
  state.audioToken += 1;
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
  return playPackagedWord(card, spokenName);
}

async function sayLetter(letter) {
  if (state.muted) return;
  return voice.sayFile(content.letterSoundUrl(letter), content.letterSound(letter)?.phonic || letter);
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
    button.addEventListener('pointerdown', (event) => dragCtl.begin(event, { el: button, card }));
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

// This game transforms the ORIGINAL card in place (translate/scale/rotate)
// rather than dragging a separate clone — makeGhost: () => null tells the
// shared module to skip its own ghost entirely (a fully supported mode:
// moveGhost()/dropGhost() are no-ops when record.ghost stays null), so the
// module contributes only its proven pointer lifecycle (one-drag-lock, the
// slop gate, blur/visibilitychange/pagehide cancel) while every pixel of
// the card's own movement is still driven by this game's own math, byte-
// for-byte the same formulas the hand-rolled version used.
const dragCtl = createDragToSlotDom({
  getPiece: (piece) => piece,
  slop: 8,
  preventDefaultOnPress: true,
  makeGhost: () => null,
  onGrab: (piece, record) => {
    unlockAll();
    // Captured once, before any transform is applied — getBoundingClientRect()
    // on the card itself would otherwise report its CURRENT (dragged)
    // position instead of its resting shelf slot.
    record.originRect = piece.el.getBoundingClientRect();
  },
  onLift: (piece) => piece.el.classList.add('is-dragging'),
  onMove: (piece, record) => {
    const dx = record.lastX - record.startX;
    const dy = record.lastY - record.startY;
    piece.el.style.transform = `translate(${dx}px, ${dy}px) scale(1.04) rotate(${Math.max(-5, Math.min(5, dx / 30))}deg)`;
  },
  onDrop: async (piece, record) => {
    piece.el.classList.remove('is-dragging');
    const catchRect = els.basketCatch.getBoundingClientRect();
    const inside = record.x >= catchRect.left && record.x <= catchRect.right
      && record.y >= catchRect.top && record.y <= catchRect.bottom;
    if (inside) {
      placeCard(piece.card, piece.el, { transform: piece.el.style.transform, originRect: record.originRect });
      return;
    }
    const dx = record.x - record.startX;
    const dy = record.y - record.startY;
    const animation = piece.el.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(1.04)` },
      { transform: 'translate(0, 0) scale(1)' },
    ], { duration: T(240), easing: 'ease-out' });
    // The hand-rolled version this replaced had the same bare `.finished`
    // await here (unlike returnDraggedCard/flyDraggedCard in this same
    // file, which already race against a timeout) — a throttled/
    // backgrounded tab can leave `finished` unresolved indefinitely,
    // stranding the card mid-drag-offset forever. Race it the same way.
    await Promise.race([animation.finished.catch(() => {}), wait(240 + 200)]);
    piece.el.style.transform = '';
  },
  onCancel: async (piece) => {
    piece.el.classList.remove('is-dragging');
    piece.el.style.transform = '';
  },
  onTap: (piece) => {
    piece.el.classList.remove('is-dragging');
    piece.el.style.transform = '';
    previewCard(piece.card);
  },
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
  // Never await an animation unconditionally: in a backgrounded tab the
  // compositor throttles and `finished` can stall indefinitely, which would
  // leave input locked forever. The timeout always wins eventually.
  await Promise.race([animation.finished.catch(() => {}), wait(260 + 200)]);
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
  await Promise.race([animation.finished.catch(() => {}), wait(430 + 200)]);
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
// The two mode cards wire their own press path via renderModeCards()'s
// onPick above — wiring them again here would double-fire startMode().
wireTap(els.playBack, () => goSplash());
wireTap(els.playSound, () => replayPrompt());
wireTap(els.celebrationBack, () => goSplash());
wireTap(els.next, () => nextRound());
wireTap(els.endBack, () => goSplash());
wireTap(els.again, () => startMode(state.mode?.id || 'two'));

const debug = {
  gameId: config.id,
  version: 1,
  ready,
  listModes: () => config.modes.map(({ id, title, skill }) => ({ id, title, skill })),
  startMode: (modeId) => startMode(modeId),
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
      const element = els.shelf.querySelector(`[data-target="${CSS.escape(card.id)}"]`);
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
    const element = card && els.shelf.querySelector(`[data-target="${CSS.escape(targetId)}"]`);
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
      const element = els.shelf.querySelector(`[data-target="${CSS.escape(card.id)}"]`);
      await placeCard(card, element);
    }
  },
  mute: () => { state.muted = true; stopAudio(); },
  seed: (seed) => { state.seed = Number(seed) >>> 0; rng = mulberry32(state.seed); return state.seed; },
  fastTimers: (scale = .05) => { state.timeScale = Math.max(.01, Math.min(1, Number(scale) || .05)); return state.timeScale; },
  home: () => goSplash(),
};

installDebug(debug);
goSplash();
