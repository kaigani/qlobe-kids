import loadConfig from '../config.js';
import { installUnlockOnGesture, installKioskGuards, unlockAll } from '../../../shared/js/audio-unlock.js';
import { createScreens } from '../../../shared/js/screens.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { onTap } from '../../../shared/js/tap.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as content from '../../../shared/js/content.js';
import * as sfx from '../../../shared/js/sfx.js';
import { tada } from '../../../shared/js/celebrate.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createTimers } from '../../../shared/js/timers.js';
import { shuffle } from '../../../shared/js/rng.js';
import { collectTargets, installDebug } from '../../../shared/js/debug-harness.js';

const ASSET = {
  character: (id) => `./assets/characters/${id}.webp`,
  panel: (id) => `./assets/ui/panel-${id}.webp`,
  tile: (id) => `./assets/ui/letter-${id}.webp`,
};

const LIGHT_GLYPH_TILES = new Set(['red', 'green', 'teal', 'lavender']);
const characterLoads = new Map();
const playbackLog = [];
let playbackSerial = 0;

voice.onClip((key, element) => {
  const serial = ++playbackSerial;
  const record = (event) => {
    if (serial !== playbackSerial) return;
    playbackLog.push({
      key,
      event,
      // currentSrc still names the previous resource inside onClip because
      // the shared channel has only just had its src swapped. Read it when
      // the media event fires, after resource selection has caught up.
      src: element.currentSrc || element.src || '',
      readyState: element.readyState,
      duration: Number.isFinite(element.duration) ? element.duration : null,
      at: Math.round(performance.now()),
    });
    if (playbackLog.length > 80) playbackLog.splice(0, playbackLog.length - 80);
  };
  element.addEventListener('playing', () => record('playing'), { once: true });
  element.addEventListener('ended', () => record('ended'), { once: true });
  element.addEventListener('error', () => record('error'), { once: true });
});

const DEFAULT_LINES = {
  intro: 'Welcome to Name Puzzle! Pick a name to build.',
  picker: 'Pick a name.',
  nudge: 'Look for the next letter in the name.',
  'drop-nudge': 'That letter has another spot. Try again.',
  celebrate: 'You built the whole name!',
};

const game = document.getElementById('game');
const els = {
  picker: document.getElementById('screen-picker'),
  build: document.getElementById('screen-build'),
  reveal: document.getElementById('screen-reveal'),
  pickerHud: document.getElementById('picker-hud'),
  buildBack: document.getElementById('build-back'),
  buildSound: document.getElementById('build-sound'),
  revealBack: document.getElementById('reveal-back'),
  revealSound: document.getElementById('reveal-sound'),
  nameGrid: document.getElementById('name-grid'),
  pagePrev: document.getElementById('page-prev'),
  pageNext: document.getElementById('page-next'),
  pageDots: document.getElementById('page-dots'),
  pageLabel: document.getElementById('page-label'),
  buildPrompt: document.getElementById('build-prompt'),
  buildStatus: document.getElementById('build-status'),
  nameBoard: document.getElementById('name-board'),
  slotRow: document.getElementById('slot-row'),
  letterBank: document.getElementById('letter-bank'),
  revealLine: document.getElementById('reveal-line'),
  revealName: document.getElementById('reveal-name'),
  revealCharacter: document.getElementById('reveal-character'),
  revealStatus: document.getElementById('reveal-status'),
  playAgain: document.getElementById('play-again'),
  chooseAnother: document.getElementById('choose-another'),
  dragLayer: document.getElementById('drag-layer'),
};

const timers = createTimers();
let config = null;
let rng = Math.random;
let pickerDisposers = [];
let buildDisposers = [];
let drag = null;
let roundSerial = 0;

const state = {
  screen: 'picker',
  page: 0,
  selected: null,
  tokens: [],
  placed: [],
  locked: false,
  muted: false,
  revealFallback: false,
};

const screens = createScreens({
  root: game,
  initial: 'picker',
  splash: 'picker',
  voice,
  onEnter(name) {
    state.screen = name;
    game.dataset.screen = name;
  },
});

const nudger = createNudger({
  first: 11000,
  repeat: 11000,
  onNudge: handleNudge,
});

function assertConfig(next) {
  const ids = new Set();
  for (const item of next.names) {
    if (!/^[A-Z]{4,5}$/.test(item.letters)) throw new Error(`Invalid 4–5 letter name: ${item.id}`);
    if (ids.has(item.id)) throw new Error(`Duplicate name id: ${item.id}`);
    ids.add(item.id);
  }
  if (!ids.has('belle')) throw new Error('BELLE is required');
  return next;
}

const ready = Promise.all([
  loadConfig().then(assertConfig),
  voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', DEFAULT_LINES),
  content.ready(),
]).then(([loaded]) => {
  config = loaded;
  renderPicker();
  return true;
}).catch((error) => {
  console.error(error);
  els.nameGrid.textContent = 'The felt pieces need a moment. Please reload.';
  els.nameGrid.setAttribute('role', 'alert');
  return false;
});

function pressFeedback(event) {
  event?.preventDefault?.();
  unlockAll();
  sfx.tick();
}

function clearDisposers(list) {
  while (list.length) {
    try { list.pop()(); } catch { /* teardown never blocks the next round */ }
  }
}

function makeImage(src, className, alt = '') {
  const image = document.createElement('img');
  image.src = src;
  image.className = className;
  image.alt = alt;
  if (!alt) image.setAttribute('aria-hidden', 'true');
  image.draggable = false;
  return image;
}

function applyGlyphClass(node, color) {
  node.classList.toggle('has-light-glyph', LIGHT_GLYPH_TILES.has(color));
}

function preloadCharacter(id) {
  if (characterLoads.has(id)) return characterLoads.get(id);
  const pending = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const decoded = typeof image.decode === 'function' ? image.decode().catch(() => {}) : Promise.resolve();
      decoded.then(() => resolve(true));
    };
    image.onerror = () => resolve(false);
    image.src = ASSET.character(id);
  });
  characterLoads.set(id, pending);
  return pending;
}

function setupHud() {
  const home = hudButton('home', () => { window.location.href = '../../index.html'; });
  const buildBack = hudButton('back', () => goPicker(true));
  const revealBack = hudButton('back', () => goPicker(true));
  const buildSound = hudButton('sound', soundDebounce(() => speakBuildPrompt()), { label: 'Hear the name again' });
  const revealSound = hudButton('sound', soundDebounce(() => speakReveal()), { label: 'Hear the friend again' });
  els.pickerHud.append(home);
  els.buildBack.append(buildBack);
  els.revealBack.append(revealBack);
  els.buildSound.append(buildSound);
  els.revealSound.append(revealSound);
}

function wireStaticControls() {
  onTap(els.pagePrev, () => changePage(-1), { feedback: pressFeedback });
  onTap(els.pageNext, () => changePage(1), { feedback: pressFeedback });
  onTap(els.playAgain, () => {
    if (state.selected) startName(state.selected.id);
  }, { feedback: pressFeedback });
  onTap(els.chooseAnother, () => goPicker(true), { feedback: pressFeedback });
}

function renderPicker() {
  if (!config) return;
  clearDisposers(pickerDisposers);
  els.nameGrid.replaceChildren();

  const pageSize = config.pageSize || 5;
  const totalPages = Math.ceil(config.names.length / pageSize);
  state.page = Math.max(0, Math.min(totalPages - 1, state.page));
  const start = state.page * pageSize;
  const names = config.names.slice(start, start + pageSize);

  for (const name of names) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'np-name-card';
    card.dataset.panel = name.panel;
    card.dataset.target = `name-${name.id}`;
    card.dataset.role = 'mode';
    card.setAttribute('aria-label', `Build ${name.display} and meet ${name.friend}`);
    const character = makeImage(ASSET.character(name.id), 'np-name-card-character');
    character.addEventListener('error', () => {
      character.src = './assets/ui/star-medal.webp';
      character.classList.add('is-fallback');
    }, { once: true });
    card.append(makeImage(ASSET.panel(name.panel), 'np-name-card-art'), character);
    const label = document.createElement('span');
    label.className = 'np-name-card-label';
    label.textContent = name.display;
    card.append(label);
    pickerDisposers.push(onTap(card, () => startName(name.id), { feedback: pressFeedback }));
    els.nameGrid.append(card);
  }

  els.pageDots.replaceChildren();
  for (let index = 0; index < totalPages; index += 1) {
    const dot = document.createElement('span');
    dot.className = `np-page-dot${index === state.page ? ' is-current' : ''}`;
    els.pageDots.append(dot);
  }

  els.pagePrev.disabled = state.page === 0;
  els.pageNext.disabled = state.page === totalPages - 1;
  els.pageLabel.textContent = `Names ${start + 1}–${start + names.length} of ${config.names.length}`;
}

function changePage(delta) {
  if (!config || state.screen !== 'picker') return;
  const totalPages = Math.ceil(config.names.length / config.pageSize);
  const next = Math.max(0, Math.min(totalPages - 1, state.page + delta));
  if (next === state.page) return;
  state.page = next;
  renderPicker();
  voice.say('picker', config.voice.picker);
}

function scrambleLetters(name) {
  const tiles = [...name.letters].map((letter, index) => ({
    id: `${name.id}-${roundSerial}-${index}`,
    letter,
    color: config.letterTiles[index % config.letterTiles.length],
    used: false,
    el: null,
  }));
  let mixed = tiles;
  for (let tries = 0; tries < 12; tries += 1) {
    mixed = shuffle(tiles, rng);
    if (mixed.map((tile) => tile.letter).join('') !== name.letters) return mixed;
  }
  return tiles.slice(1).concat(tiles[0]);
}

async function startName(id) {
  return screens.start(async () => {
    const loaded = await ready;
    if (!loaded) return false;
    const name = config.names.find((item) => item.id === id);
    if (!name) return false;

    roundSerial += 1;
    state.selected = name;
    preloadCharacter(name.id);
    state.tokens = scrambleLetters(name);
    state.placed = Array(name.letters.length).fill(null);
    state.locked = false;
    state.revealFallback = false;
    prepareBuild();
    screens.show('build');
    screens.hold(teardownBuild);
    nudger.arm();
    speakBuildPrompt();
    return true;
  }, { busy: false });
}

function prepareBuild() {
  teardownBuild();
  const name = state.selected;
  els.buildPrompt.textContent = `Build ${name.letters}`;
  els.buildStatus.textContent = `Build ${name.display}. Start with ${name.letters[0]}.`;
  els.nameBoard.classList.remove('np-board-complete');
  els.slotRow.replaceChildren();
  els.letterBank.replaceChildren();

  for (let index = 0; index < name.letters.length; index += 1) {
    const slot = document.createElement('div');
    slot.className = `np-slot${index === 0 ? ' is-next' : ''}`;
    slot.dataset.slot = String(index);
    slot.dataset.target = `slot-${index}`;
    slot.dataset.role = 'slot';
    slot.setAttribute('aria-label', `Letter spot ${index + 1}, ${name.letters[index]}`);
    slot.append(makeImage(ASSET.tile('slot'), 'np-tile-art'));
    const clue = document.createElement('span');
    clue.className = 'np-slot-clue';
    clue.textContent = name.letters[index];
    clue.setAttribute('aria-hidden', 'true');
    slot.append(clue);
    els.slotRow.append(slot);
  }

  for (const token of state.tokens) {
    const piece = document.createElement('button');
    piece.type = 'button';
    piece.className = 'np-letter-piece';
    piece.dataset.target = `letter-${token.id}`;
    piece.dataset.role = 'piece';
    piece.setAttribute('aria-label', `Letter ${token.letter}`);
    piece.append(makeImage(ASSET.tile(token.color), 'np-tile-art'));
    applyGlyphClass(piece, token.color);
    const letter = document.createElement('span');
    letter.textContent = token.letter;
    piece.append(letter);
    token.el = piece;
    els.letterBank.append(piece);
  }

  drag = createDragToSlotDom({
    getPiece: (id) => state.tokens.find((token) => token.id === id) || null,
    root: els.build,
    ghostHost: els.dragLayer,
    slotSelector: '.np-slot[data-slot]',
    slotPad: 28,
    hoverClass: 'is-hovered',
    ghostClass: 'np-letter-ghost qk-drag-ghost',
    canStart: () => state.screen === 'build' && !state.locked,
    onGrab: (piece) => !piece.used,
    onLift: (piece) => piece.el?.classList.add('is-lifting'),
    onDrop: async (piece, record) => {
      piece.el?.classList.remove('is-lifting');
      attemptDrop(piece, record.slot);
    },
    onCancel: async (piece) => piece.el?.classList.remove('is-lifting'),
    onTap: (piece) => attemptTap(piece),
  });

  const cancelOnResize = () => { void drag?.cancel(); };
  window.addEventListener('resize', cancelOnResize);
  buildDisposers.push(() => window.removeEventListener('resize', cancelOnResize));

  for (const token of state.tokens) {
    const onDown = (event) => drag?.begin(event, token.id);
    const onClick = (event) => {
      if (event.detail === 0) attemptTap(token);
    };
    token.el.addEventListener('pointerdown', onDown);
    token.el.addEventListener('click', onClick);
    buildDisposers.push(() => token.el?.removeEventListener('pointerdown', onDown));
    buildDisposers.push(() => token.el?.removeEventListener('click', onClick));
  }
}

function teardownBuild() {
  nudger.stop();
  timers.clearAll();
  drag?.detach();
  drag = null;
  clearDisposers(buildDisposers);
  els.dragLayer.replaceChildren();
}

function speakBuildPrompt() {
  if (!state.selected) return;
  const spelled = [...state.selected.letters].join(', ');
  voice.say(`build-${state.selected.id}`, `Build ${state.selected.display}. ${spelled}.`);
}

function handleNudge(count = 0) {
  if (state.screen !== 'build' || !state.selected || state.locked) return false;
  const next = state.placed.findIndex((value) => !value);
  if (next < 0) return false;
  const expected = state.selected.letters[next];
  const slot = els.slotRow.querySelector(`[data-slot="${next}"]`);
  slot?.classList.add('is-next');
  els.buildStatus.textContent = `Find ${expected}.`;
  if (count === 0) {
    speakBuildPrompt();
    return true;
  }
  const piece = state.tokens.find((token) => !token.used && token.letter === expected)?.el;
  piece?.classList.add('is-nudge');
  timers.after(2300, () => piece?.classList.remove('is-nudge'));
  voice.say('nudge', config.voice.nudge);
  return true;
}

function attemptTap(piece) {
  if (state.screen !== 'build' || state.locked || piece.used) return false;
  const match = state.placed.findIndex((value, index) => !value && state.selected.letters[index] === piece.letter);
  if (match < 0) {
    const next = state.placed.findIndex((value) => !value);
    rejectPiece(piece, next, false);
    return false;
  }
  placePiece(piece, match);
  return true;
}

function attemptDrop(piece, slot) {
  if (state.screen !== 'build' || state.locked || !piece || piece.used) return false;
  const index = slot ? Number(slot.dataset.slot) : -1;
  if (!Number.isInteger(index)
    || index < 0
    || state.placed[index]
    || state.selected.letters[index] !== piece.letter) {
    rejectPiece(piece, index, true);
    return false;
  }
  placePiece(piece, index);
  return true;
}

function rejectPiece(piece, slotIndex, wasDrop) {
  if (piece.el) {
    piece.el.classList.remove('np-wiggle');
    void piece.el.offsetWidth;
    piece.el.classList.add('np-wiggle');
    timers.after(500, () => piece.el?.classList.remove('np-wiggle'));
  }
  if (slotIndex >= 0) {
    const slot = els.slotRow.querySelector(`[data-slot="${slotIndex}"]`);
    slot?.classList.add('np-wiggle');
    timers.after(500, () => slot?.classList.remove('np-wiggle'));
  }
  nudger.poke();
  sfx.boing();
  const line = wasDrop ? config.voice.dropNudge : config.voice.nudge;
  voice.say(wasDrop ? 'drop-nudge' : 'nudge', line);
  els.buildStatus.textContent = line;
}

function placePiece(piece, index, { quiet = false } = {}) {
  if (!piece || piece.used || state.placed[index]) return false;
  piece.used = true;
  state.placed[index] = piece;
  piece.el?.classList.add('is-used');

  const slot = els.slotRow.querySelector(`[data-slot="${index}"]`);
  if (!slot) return false;
  slot.classList.remove('is-next', 'is-hovered');
  slot.replaceChildren(makeImage(ASSET.tile(piece.color), 'np-tile-art'));
  applyGlyphClass(slot, piece.color);
  const letter = document.createElement('span');
  letter.textContent = piece.letter;
  slot.append(letter);
  slot.classList.add('is-filled');

  const next = state.placed.findIndex((value) => !value);
  if (next >= 0) {
    els.slotRow.querySelector(`[data-slot="${next}"]`)?.classList.add('is-next');
    els.buildStatus.textContent = `${piece.letter} fits. Next, find ${state.selected.letters[next]}.`;
  } else {
    els.buildStatus.textContent = `${state.selected.display} is complete!`;
  }

  nudger.poke();
  if (!quiet) {
    sfx.pop();
    voice.sayFile(content.letterSoundUrl(piece.letter), piece.letter, 0.7);
  }

  if (next < 0) {
    state.locked = true;
    els.nameBoard.classList.add('np-board-complete');
    if (!quiet) sfx.sparkle();
    timers.after(650, () => { void showReveal(); });
  }
  return true;
}

function buildMiniName(name) {
  els.revealName.replaceChildren();
  [...name.letters].forEach((letter, index) => {
    const tile = document.createElement('span');
    tile.className = 'np-mini-tile';
    const color = config.letterTiles[index % config.letterTiles.length];
    tile.append(makeImage(ASSET.tile(color), ''));
    applyGlyphClass(tile, color);
    const label = document.createElement('span');
    label.textContent = letter;
    tile.append(label);
    els.revealName.append(tile);
  });
}

async function showReveal() {
  if (!state.selected || state.screen !== 'build') return false;
  const name = state.selected;
  const characterReady = await preloadCharacter(name.id);
  if (state.screen !== 'build' || state.selected?.id !== name.id) return false;
  state.revealFallback = !characterReady;
  els.reveal.classList.toggle('has-reveal-fallback', state.revealFallback);
  const revealLine = characterReady ? name.revealLine : `You built ${name.display}!`;
  els.revealLine.textContent = revealLine;
  els.revealCharacter.classList.toggle('is-fallback', !characterReady);
  els.revealCharacter.src = characterReady ? ASSET.character(name.id) : './assets/ui/star-medal.webp';
  els.revealCharacter.alt = characterReady ? name.characterAlt : 'A cozy felt star badge';
  els.revealStatus.textContent = revealLine;
  buildMiniName(name);
  screens.show('reveal');
  const stopCelebration = tada({ host: els.reveal, count: 48, duration: 3000, rng });
  screens.hold(stopCelebration);
  speakReveal();
  return true;
}

function speakReveal() {
  if (!state.selected) return;
  if (state.revealFallback) {
    voice.say('celebrate', config.voice.celebrate);
    return;
  }
  voice.say(`reveal-${state.selected.id}`, state.selected.revealLine);
}

function goPicker(speak = false) {
  if (!config) return;
  screens.show('picker');
  state.locked = false;
  renderPicker();
  if (speak) voice.say('picker', config.voice.picker);
}

async function winRound() {
  if (state.screen !== 'build' || !state.selected) return false;
  for (let index = 0; index < state.selected.letters.length; index += 1) {
    if (state.placed[index]) continue;
    const token = state.tokens.find((item) => !item.used && item.letter === state.selected.letters[index]);
    if (token) placePiece(token, index, { quiet: true });
  }
  timers.clearAll();
  return showReveal();
}

function mute(on = true) {
  state.muted = Boolean(on);
  voice.setMuted(state.muted);
  sfx.setMuted(state.muted);
  if (state.muted) voice.stop();
  return state.muted;
}

setupHud();
wireStaticControls();
installUnlockOnGesture({
  onFirst: () => ready.then((loaded) => {
    if (loaded && state.screen === 'picker') voice.say('intro', config.voice.intro);
  }),
});
installKioskGuards();

installDebug({
  gameId: 'name-puzzle',
  engine: 'custom-dom',
  ready,
  listModes: () => (config ? config.names.map((item) => ({ id: item.id, title: item.display })) : []),
  startMode: (id) => startName(id),
  getState: () => ({
    screen: state.screen,
    page: state.page,
    selectedId: state.selected?.id || null,
    name: state.selected?.letters || null,
    placed: state.placed.map((piece) => piece?.letter || null),
    remaining: state.tokens.filter((piece) => !piece.used).map((piece) => piece.letter),
    pieces: state.tokens.map((piece) => ({ id: piece.id, letter: piece.letter, used: piece.used })),
    locked: state.locked,
    muted: state.muted,
    pendingTimers: timers.size(),
  }),
  getTargets: () => collectTargets(game),
  tap: async (id) => {
    const node = [...game.querySelectorAll('[data-target]')]
      .find((candidate) => candidate.dataset.target === id);
    if (!node) return false;
    node.click();
    await Promise.resolve();
    return true;
  },
  winRound,
  home: () => goPicker(false),
  mute,
  timers,
  voice,
  sfx,
  onSeed(next) { rng = next; },
  getAudioLog: () => voice.getAudioLog(),
  clearAudioLog: () => voice.clearAudioLog(),
  getPlaybackLog: () => playbackLog.map((entry) => ({ ...entry })),
  clearPlaybackLog: () => {
    playbackSerial += 1;
    playbackLog.length = 0;
  },
  listNames: () => (config ? config.names.map(({ id, display, letters, friend }) => ({ id, display, letters, friend })) : []),
  selectName: (id) => startName(id),
  place: (pieceId, slotIndex) => {
    const piece = state.tokens.find((token) => token.id === pieceId);
    const slot = els.slotRow.querySelector(`[data-slot="${Number(slotIndex)}"]`);
    return attemptDrop(piece, slot);
  },
  triggerNudge: (count = 0) => handleNudge(Number(count) || 0),
  nextPage: () => changePage(1),
  previousPage: () => changePage(-1),
});
