import config from '../config.js';
import { installUnlockOnGesture, installKioskGuards, unlockAll } from '../../../shared/js/audio-unlock.js';
import { createScreens } from '../../../shared/js/screens.js';
import { onTap } from '../../../shared/js/tap.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as content from '../../../shared/js/content.js';
import * as bgm from '../../../shared/js/bgm.js';
import * as sfx from '../../../shared/js/sfx.js';
import { tada } from '../../../shared/js/celebrate.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createTimers } from '../../../shared/js/timers.js';
import { shuffle } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { collectTargets, installDebug } from '../../../shared/js/debug-harness.js';

const ASSET = {
  word: (id) => `./assets/words/${id}.webp`,
  category: (id) => `./assets/categories/${id}.webp`,
  mode: (id) => `./assets/modes/${id}.webp`,
  pictureFrame: (index) => `./assets/ui/picture-frame-${['blue', 'orange', 'green', 'lavender'][index % 4]}.webp`,
  wordRibbon: (index) => `./assets/ui/word-ribbon-${['blue', 'orange', 'green', 'lavender'][index % 4]}.webp`,
  letterSeed: (index) => `./assets/ui/letter-seed-${(index % 5) + 1}.webp`,
  reward: (index) => `./assets/ui/reward-${['star', 'leaf', 'acorn'][index % 3]}.webp`,
};

const CHAPTER_HEADLINES = {
  animals: 'Animal Friends',
  food: 'Picnic Treats',
  things: 'Everyday Things',
};

const MODE_PROMPTS = {
  picture: 'Match the picture and word',
  listen: 'Which picture did you hear?',
  build: 'Build the word with sounds',
};

const MODE_TIPS = {
  picture: 'Tap two pieces, or drag them together.',
  listen: 'Tap a picture, or tuck it into the listening book.',
  build: 'Tap a letter, or drag it to its next spot.',
};

const DEFAULT_LINES = Object.fromEntries(
  Object.entries({
    welcome: 'Welcome to Reading Buddies! Choose a picture book.',
    'activity-prompt': 'Which reading game would you like to play?',
    'picture-prompt': 'Match each picture to its word.',
    'listen-prompt': 'Listen, then find the picture.',
    'build-prompt': 'Build the word. Listen to each sound.',
    'match-nudge': 'Let’s listen once more. Find the picture and word that belong together.',
    'listen-nudge': 'Listen once more, then find that picture.',
    'build-nudge': 'Listen for the next sound, then find its letter.',
    'book-complete': 'Your picture book is full of words!',
  }),
);

const game = document.getElementById('game');
const els = {
  library: document.getElementById('screen-library'),
  activities: document.getElementById('screen-activities'),
  play: document.getElementById('screen-play'),
  great: document.getElementById('screen-great'),
  complete: document.getElementById('screen-complete'),
  home: document.querySelector('.rb-home'),
  activityBack: document.querySelector('#screen-activities .rb-back'),
  activitySound: document.querySelector('#screen-activities .rb-sound'),
  playBack: document.querySelector('#screen-play .rb-back'),
  playSound: document.querySelector('#screen-play .rb-sound'),
  chapterGrid: document.getElementById('chapter-grid'),
  activityChapterArt: document.getElementById('activity-chapter-art'),
  activityChapterTitle: document.getElementById('activity-chapter-title'),
  modeGrid: document.getElementById('mode-grid'),
  playPrompt: document.getElementById('play-prompt'),
  progress: document.getElementById('progress'),
  playBoard: document.getElementById('play-board'),
  playTip: document.getElementById('play-tip'),
  playStatus: document.getElementById('play-status'),
  greatLine: document.getElementById('great-line'),
  greatPicture: document.getElementById('great-picture'),
  greatWord: document.getElementById('great-word'),
  greatLetters: document.getElementById('great-letters'),
  greatNext: document.getElementById('great-next'),
  greatStatus: document.getElementById('great-status'),
  bookStamps: document.getElementById('book-stamps'),
  completeCopy: document.getElementById('complete-copy'),
  playAgain: document.getElementById('play-again'),
  chooseBook: document.getElementById('choose-book'),
  completeStatus: document.getElementById('complete-status'),
  dragLayer: document.getElementById('drag-layer'),
};

const timers = createTimers();
const staticDisposers = [];
const modeDisposers = [];
let roundDisposers = [];
let drag = null;
let rng = Math.random;
let roundSerial = 0;
let playbackSerial = 0;
const playbackLog = [];

const state = {
  screen: 'library',
  chapterId: null,
  modeId: null,
  sessionWords: [],
  roundIndex: 0,
  pieces: [],
  selectedPieceId: null,
  placed: [],
  locked: false,
  muted: false,
};

voice.onClip((key, element) => {
  const serial = ++playbackSerial;
  const record = (event) => {
    if (serial !== playbackSerial) return;
    playbackLog.push({
      key,
      event,
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

function assertConfig(next) {
  if (!next || next.id !== 'picture-word-match') throw new Error('Reading Buddies config is missing');
  if (!Array.isArray(next.chapters) || next.chapters.length !== 3) throw new Error('Reading Buddies needs three chapters');
  if (!Array.isArray(next.modes) || next.modes.length !== 3) throw new Error('Reading Buddies needs three modes');
  const wordIds = new Set(next.words.map((word) => word.id));
  for (const chapter of next.chapters) {
    if (chapter.words.length < next.roundsPerSession) throw new Error(`Chapter ${chapter.id} needs more words`);
    for (const id of chapter.words) if (!wordIds.has(id)) throw new Error(`Unknown word ${id}`);
  }
  for (const word of next.words) {
    if (!/^[A-Z]{3}$/.test(word.label) || word.letters.length !== 3) throw new Error(`Invalid CVC word ${word.id}`);
  }
  return next;
}

assertConfig(config);

const criticalArt = [
  './assets/art/reading-garden.webp',
  './assets/ui/reading-buddies-title.webp',
  './assets/ui/open-book.webp',
  './assets/ui/listening-book.webp',
  './assets/ui/collection-book.webp',
  './assets/ui/celebration-ribbon.webp',
  './assets/ui/home.webp',
  './assets/ui/back.webp',
  './assets/ui/sound.webp',
  './assets/ui/letter-slot.webp',
  './assets/ui/trail.webp',
  './assets/ui/action-teal.webp',
  './assets/ui/action-blue.webp',
  ...Array.from({ length: 4 }, (_, index) => ASSET.pictureFrame(index)),
  ...Array.from({ length: 4 }, (_, index) => ASSET.wordRibbon(index)),
  ...Array.from({ length: 5 }, (_, index) => ASSET.letterSeed(index)),
  ...Array.from({ length: 3 }, (_, index) => ASSET.reward(index)),
  ...config.chapters.map((chapter) => chapter.art),
  ...config.modes.map((mode) => mode.art),
];

const ready = Promise.all([
  voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', DEFAULT_LINES),
  content.ready(),
  preloadImages(criticalArt),
]).then(() => {
  renderLibrary();
  preloadImages(config.words.map((word) => word.art), { idle: true });
  return true;
}).catch((error) => {
  console.error(error);
  els.chapterGrid.textContent = 'The picture book needs a moment. Please reload.';
  els.chapterGrid.setAttribute('role', 'alert');
  return false;
});

const screens = createScreens({
  root: game,
  initial: 'library',
  splash: 'library',
  voice,
  onEnter(name) {
    state.screen = name;
    game.dataset.screen = name;
  },
});

const nudger = createNudger({
  first: config.timing.firstNudgeMs,
  repeat: config.timing.repeatNudgeMs,
  onNudge: handleNudge,
});

function makeImage(src, className = '', alt = '') {
  const image = document.createElement('img');
  image.src = src;
  if (className) image.className = className;
  image.alt = alt;
  image.draggable = false;
  if (!alt) image.setAttribute('aria-hidden', 'true');
  return image;
}

function feedback(event) {
  event?.preventDefault?.();
  unlockAll([bgm.unlock]);
  sfx.tick();
}

function speak(key, fallback) {
  bgm.duck(0.16, 120);
  const speaking = voice.say(key, fallback);
  Promise.resolve(speaking).finally(() => bgm.duck(1, 320));
  return speaking;
}

function speakWord(word) {
  const info = content.word(word.id);
  bgm.duck(0.12, 100);
  const speaking = voice.sayFile(info?.audio || '', word.id, 0.9);
  Promise.resolve(speaking).finally(() => bgm.duck(1, 300));
  return speaking;
}

function chapter() {
  return config.chapters.find((item) => item.id === state.chapterId) || null;
}

function mode() {
  return config.modes.find((item) => item.id === state.modeId) || null;
}

function currentWord() {
  return state.sessionWords[state.roundIndex] || null;
}

function clearDisposers(list) {
  while (list.length) {
    try { list.pop()(); } catch { /* cleanup never blocks a screen change */ }
  }
}

function renderLibrary() {
  els.chapterGrid.replaceChildren();
  config.chapters.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rb-chapter-card';
    button.dataset.target = `chapter-${item.id}`;
    button.dataset.role = 'mode';
    button.setAttribute('aria-label', `${CHAPTER_HEADLINES[item.id] || item.title} picture book`);
    button.append(
      makeImage(ASSET.pictureFrame(index), 'rb-card-carrier'),
      makeImage(item.art, 'rb-card-subject', item.title),
    );
    const label = document.createElement('span');
    label.textContent = item.title;
    button.append(label);
    staticDisposers.push(onTap(button, () => chooseChapter(item.id), { feedback }));
    els.chapterGrid.append(button);
  });
}

function renderModes() {
  const selected = chapter();
  if (!selected) return;
  clearDisposers(modeDisposers);
  els.activityChapterArt.src = selected.art;
  els.activityChapterArt.alt = selected.title;
  els.activityChapterTitle.textContent = CHAPTER_HEADLINES[selected.id] || selected.title;
  els.modeGrid.replaceChildren();
  config.modes.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rb-mode-card';
    button.dataset.target = `mode-${item.id}`;
    button.dataset.role = 'mode';
    button.setAttribute('aria-label', `${item.title}. ${item.skill}`);
    button.append(
      makeImage(ASSET.pictureFrame(index + 1), 'rb-card-carrier'),
      makeImage(item.art, 'rb-card-subject'),
    );
    const copy = document.createElement('span');
    copy.className = 'rb-mode-copy';
    const title = document.createElement('span');
    title.className = 'rb-mode-title';
    title.textContent = item.title;
    const skill = document.createElement('span');
    skill.className = 'rb-mode-skill';
    skill.textContent = item.skill;
    copy.append(title, skill);
    button.append(copy);
    modeDisposers.push(onTap(button, () => startSession(item.id), { feedback }));
    els.modeGrid.append(button);
  });
}

async function chooseChapter(id, { quiet = false } = {}) {
  const loaded = await ready;
  if (!loaded) return false;
  const selected = config.chapters.find((item) => item.id === id);
  if (!selected) return false;
  state.chapterId = selected.id;
  state.modeId = null;
  renderModes();
  screens.show('activities');
  if (!quiet) speak(selected.voiceKey, `${selected.title}. Choose a reading game.`);
  return true;
}

function chooseSessionWords(selectedChapter) {
  const ids = shuffle([...selectedChapter.words], rng).slice(0, config.roundsPerSession);
  return ids.map((id) => config.words.find((word) => word.id === id)).filter(Boolean);
}

async function startSession(modeId, { quiet = false } = {}) {
  const loaded = await ready;
  if (!loaded) return false;
  if (!state.chapterId) state.chapterId = config.chapters[0].id;
  const selectedMode = config.modes.find((item) => item.id === modeId);
  const selectedChapter = chapter();
  if (!selectedMode || !selectedChapter) return false;
  await preloadImages(
    selectedChapter.words
      .map((id) => config.words.find((word) => word.id === id)?.art)
      .filter(Boolean),
  );

  teardownRound();
  roundSerial += 1;
  state.modeId = selectedMode.id;
  state.sessionWords = chooseSessionWords(selectedChapter);
  state.roundIndex = 0;
  state.locked = false;
  screens.show('play', { force: screens.is('play') });
  renderRound();
  screens.hold(teardownRound);
  if (!quiet) {
    speak(selectedMode.introKey, selectedMode.skill).then(() => {
      if (state.screen === 'play' && state.modeId === selectedMode.id && state.roundIndex === 0) speakRound();
    });
  }
  return true;
}

function teardownRound() {
  nudger.stop();
  timers.clearAll();
  drag?.detach();
  drag = null;
  clearDisposers(roundDisposers);
  els.dragLayer.replaceChildren();
  state.pieces = [];
  state.selectedPieceId = null;
  state.placed = [];
}

function renderProgress() {
  els.progress.replaceChildren();
  for (let index = 0; index < config.roundsPerSession; index += 1) {
    const earned = index < state.roundIndex;
    const image = makeImage(
      earned ? ASSET.reward(index) : './assets/ui/letter-slot.webp',
      earned ? 'is-earned' : '',
      earned ? `Word ${index + 1} complete` : `Word ${index + 1} waiting`,
    );
    els.progress.append(image);
  }
}

function renderRound() {
  teardownRound();
  const selectedMode = mode();
  const word = currentWord();
  if (!selectedMode || !word) return;
  state.locked = false;
  els.playPrompt.textContent = MODE_PROMPTS[selectedMode.id];
  els.playTip.textContent = MODE_TIPS[selectedMode.id];
  els.playStatus.textContent = `${MODE_PROMPTS[selectedMode.id]}. Word ${state.roundIndex + 1} of ${config.roundsPerSession}.`;
  els.playBoard.replaceChildren();
  renderProgress();

  if (selectedMode.id === 'picture') renderPictureRound(word);
  else if (selectedMode.id === 'listen') renderListenRound(word);
  else renderBuildRound(word);

  const cancelDrag = () => { void drag?.cancel(); };
  window.addEventListener('resize', cancelDrag);
  roundDisposers.push(() => window.removeEventListener('resize', cancelDrag));
  nudger.arm();
}

function distractorWords(word, count = 2) {
  const selectedChapter = chapter();
  if (!selectedChapter) return [];
  const pool = selectedChapter.words
    .filter((id) => id !== word.id)
    .map((id) => config.words.find((item) => item.id === id))
    .filter(Boolean);
  return shuffle(pool, rng).slice(0, count);
}

function addPiece(record) {
  state.pieces.push(record);
  const onDown = (event) => drag?.begin(event, record.id);
  const onClick = (event) => {
    if (event.detail === 0) handlePieceTap(record);
  };
  record.el.addEventListener('pointerdown', onDown);
  record.el.addEventListener('click', onClick);
  roundDisposers.push(() => record.el?.removeEventListener('pointerdown', onDown));
  roundDisposers.push(() => record.el?.removeEventListener('click', onClick));
}

function installDrag({ slotSelector, slotPad = 24, onDrop }) {
  drag = createDragToSlotDom({
    getPiece: (id) => state.pieces.find((piece) => piece.id === id) || null,
    root: els.playBoard,
    ghostHost: els.dragLayer,
    slotSelector,
    slotPad,
    hoverClass: 'is-hovered',
    ghostClass: 'rb-drag-ghost qk-drag-ghost',
    canStart: () => state.screen === 'play' && !state.locked,
    onGrab: (piece) => !piece.used,
    onLift: (piece) => piece.el?.classList.add('is-lifting'),
    onDrop: async (piece, record) => {
      piece.el?.classList.remove('is-lifting');
      onDrop(piece, record.slot);
    },
    onCancel: async (piece) => piece.el?.classList.remove('is-lifting'),
    onTap: (piece) => handlePieceTap(piece),
  });
}

function renderPictureRound(word) {
  const layout = document.createElement('div');
  layout.className = 'rb-picture-layout';

  const picture = document.createElement('button');
  picture.type = 'button';
  picture.className = 'rb-picture-piece';
  picture.dataset.target = `picture-${word.id}`;
  picture.dataset.role = 'piece';
  picture.dataset.matchSlot = word.id;
  picture.dataset.matchKind = 'picture';
  picture.setAttribute('aria-label', `${word.alt}. Tap to hear the word, or match it.`);
  picture.append(
    makeImage(ASSET.pictureFrame(state.roundIndex), 'rb-card-carrier'),
    makeImage(word.art, 'rb-piece-subject', word.alt),
  );
  const caption = document.createElement('span');
  caption.className = 'rb-piece-caption';
  caption.textContent = 'Tap to listen';
  picture.append(caption);

  const wordChoices = document.createElement('div');
  wordChoices.className = 'rb-word-choices';
  const options = shuffle([word, ...distractorWords(word)], rng);
  const records = [{ id: `picture-${roundSerial}-${word.id}`, kind: 'picture', matchId: word.id, word, el: picture, used: false }];
  options.forEach((option, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rb-word-piece';
    button.dataset.target = `word-${option.id}`;
    button.dataset.role = 'piece';
    button.dataset.word = option.id;
    button.dataset.matchSlot = option.id;
    button.dataset.matchKind = 'word';
    button.setAttribute('aria-label', `Word ${option.label}`);
    button.append(makeImage(ASSET.wordRibbon(index), 'rb-card-carrier'));
    const label = document.createElement('span');
    label.textContent = option.label;
    button.append(label);
    wordChoices.append(button);
    records.push({ id: `word-${roundSerial}-${option.id}`, kind: 'word', matchId: option.id, word: option, el: button, used: false });
  });

  if (state.roundIndex === 0) {
    const correctIndex = options.findIndex((option) => option.id === word.id);
    const trail = makeImage(
      './assets/ui/trail.webp',
      `rb-match-trail rb-match-trail-${Math.max(0, correctIndex)}`,
    );
    layout.append(trail);
  }
  layout.append(picture, wordChoices);
  els.playBoard.append(layout);
  installDrag({ slotSelector: '[data-match-slot]', onDrop: attemptPictureDrop });
  records.forEach(addPiece);
}

function renderListenRound(word) {
  const layout = document.createElement('div');
  layout.className = 'rb-listen-layout';
  const pocket = document.createElement('button');
  pocket.type = 'button';
  pocket.className = 'rb-listening-pocket';
  pocket.dataset.target = 'listening-book';
  pocket.dataset.role = 'slot';
  pocket.dataset.listenSlot = word.id;
  pocket.setAttribute('aria-label', 'Listening book. Tap to hear the word again.');
  pocket.append(makeImage('./assets/ui/listening-book.webp'));
  const pocketLabel = document.createElement('span');
  pocketLabel.textContent = 'Listen again';
  pocket.append(pocketLabel);
  roundDisposers.push(onTap(pocket, () => speakRound(), { feedback }));

  const choices = document.createElement('div');
  choices.className = 'rb-listen-choices';
  const options = shuffle([word, ...distractorWords(word)], rng);
  const records = [];
  options.forEach((option, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rb-listen-piece';
    button.dataset.target = `picture-${option.id}`;
    button.dataset.role = 'piece';
    button.dataset.picture = option.id;
    button.setAttribute('aria-label', option.alt);
    button.append(
      makeImage(ASSET.pictureFrame(index), 'rb-card-carrier'),
      makeImage(option.art, 'rb-piece-subject', option.alt),
    );
    choices.append(button);
    records.push({ id: `listen-${roundSerial}-${option.id}`, kind: 'listen', matchId: option.id, word: option, el: button, used: false });
  });
  layout.append(pocket, choices);
  els.playBoard.append(layout);
  installDrag({ slotSelector: '[data-listen-slot]', slotPad: 34, onDrop: attemptListenDrop });
  records.forEach(addPiece);
}

function buildDistractors(word) {
  const excluded = new Set(word.letters);
  return shuffle(config.builderDistractors.filter((letter) => !excluded.has(letter)), rng).slice(0, 2);
}

function renderBuildRound(word) {
  state.placed = Array(word.letters.length).fill(null);
  const layout = document.createElement('div');
  layout.className = 'rb-build-layout';

  const picture = document.createElement('div');
  picture.className = 'rb-build-picture';
  picture.append(
    makeImage(ASSET.pictureFrame(state.roundIndex + 1), 'rb-card-carrier'),
    makeImage(word.art, '', word.alt),
  );

  const slots = document.createElement('div');
  slots.className = 'rb-word-slots';
  slots.setAttribute('role', 'group');
  slots.setAttribute('aria-label', `Three spots for ${word.label}`);
  word.letters.forEach((letter, index) => {
    const slot = document.createElement('div');
    slot.className = `rb-letter-slot${index === 0 ? ' is-nudge' : ''}`;
    slot.dataset.letterSlot = String(index);
    slot.dataset.target = `slot-${index}`;
    slot.dataset.role = 'slot';
    slot.setAttribute('aria-label', `Letter spot ${index + 1}`);
    slot.append(makeImage('./assets/ui/letter-slot.webp'));
    const clue = document.createElement('span');
    clue.textContent = letter;
    clue.setAttribute('aria-hidden', 'true');
    slot.append(clue);
    slots.append(slot);
  });

  const bank = document.createElement('div');
  bank.className = 'rb-letter-bank';
  bank.setAttribute('role', 'group');
  bank.setAttribute('aria-label', 'Letter seeds');
  const tileLetters = shuffle([...word.letters, ...buildDistractors(word)], rng);
  const records = [];
  tileLetters.forEach((letter, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rb-letter-piece';
    button.dataset.target = `letter-${roundSerial}-${index}`;
    button.dataset.role = 'piece';
    button.setAttribute('aria-label', `Letter ${letter}`);
    button.append(makeImage(ASSET.letterSeed(index)));
    const label = document.createElement('span');
    label.textContent = letter;
    button.append(label);
    bank.append(button);
    records.push({ id: `letter-${roundSerial}-${index}`, kind: 'letter', letter, el: button, used: false });
  });

  layout.append(picture, slots, bank);
  els.playBoard.append(layout);
  installDrag({ slotSelector: '[data-letter-slot]', slotPad: 30, onDrop: attemptBuildDrop });
  records.forEach(addPiece);
}

function handlePieceTap(piece) {
  if (!piece || state.screen !== 'play' || state.locked || piece.used) return false;
  nudger.poke();
  if (piece.kind === 'picture' || piece.kind === 'word') return attemptPictureTap(piece);
  if (piece.kind === 'listen') return attemptListen(piece);
  if (piece.kind === 'letter') return attemptBuildTap(piece);
  return false;
}

function selectedPiece() {
  return state.pieces.find((piece) => piece.id === state.selectedPieceId) || null;
}

function selectPiece(piece) {
  state.pieces.forEach((item) => item.el?.classList.toggle('is-selected', item.id === piece?.id));
  state.selectedPieceId = piece?.id || null;
}

function attemptPictureTap(piece) {
  const selected = selectedPiece();
  if (!selected) {
    selectPiece(piece);
    speakWord(piece.word);
    els.playStatus.textContent = `${piece.kind === 'picture' ? 'Picture' : 'Word'} ${piece.word.id} selected.`;
    return true;
  }
  if (selected.id === piece.id) {
    speakWord(piece.word);
    return true;
  }
  if (selected.kind === piece.kind) {
    selectPiece(piece);
    speakWord(piece.word);
    return true;
  }
  selectPiece(null);
  if (selected.matchId === piece.matchId) return finishAnswer();
  reject([selected.el, piece.el], 'match-nudge');
  return false;
}

function attemptPictureDrop(piece, slot) {
  if (!piece || !slot || state.locked) {
    reject(piece?.el ? [piece.el] : [], 'match-nudge', { speakLine: false });
    return false;
  }
  const opposite = slot.dataset.matchKind && slot.dataset.matchKind !== piece.kind;
  const correct = opposite && slot.dataset.matchSlot === piece.matchId;
  if (correct) return finishAnswer();
  reject([piece.el, slot], 'match-nudge');
  return false;
}

function attemptListen(piece) {
  if (piece.matchId === currentWord()?.id) return finishAnswer();
  reject([piece.el], 'listen-nudge');
  return false;
}

function attemptListenDrop(piece, slot) {
  if (slot && piece.matchId === currentWord()?.id) return finishAnswer();
  reject([piece.el, slot].filter(Boolean), 'listen-nudge');
  return false;
}

function nextBuildIndex() {
  return state.placed.findIndex((piece) => !piece);
}

function attemptBuildTap(piece) {
  const index = nextBuildIndex();
  if (index >= 0 && currentWord()?.letters[index] === piece.letter) return placeLetter(piece, index);
  reject([piece.el, els.playBoard.querySelector(`[data-letter-slot="${Math.max(0, index)}"]`)].filter(Boolean), 'build-nudge');
  return false;
}

function attemptBuildDrop(piece, slot) {
  const index = slot ? Number(slot.dataset.letterSlot) : -1;
  const word = currentWord();
  if (Number.isInteger(index) && index >= 0 && !state.placed[index] && word?.letters[index] === piece.letter) {
    return placeLetter(piece, index);
  }
  reject([piece.el, slot].filter(Boolean), 'build-nudge');
  return false;
}

function placeLetter(piece, index, { quiet = false } = {}) {
  const word = currentWord();
  if (!piece || piece.used || !word || state.placed[index]) return false;
  piece.used = true;
  state.placed[index] = piece;
  piece.el?.classList.add('is-used');
  const slot = els.playBoard.querySelector(`[data-letter-slot="${index}"]`);
  if (!slot) return false;
  slot.classList.remove('is-nudge', 'is-hovered');
  slot.classList.add('is-filled');
  slot.querySelector('span').textContent = piece.letter;
  const next = nextBuildIndex();
  if (next >= 0) els.playBoard.querySelector(`[data-letter-slot="${next}"]`)?.classList.add('is-nudge');
  nudger.poke();
  if (!quiet) {
    sfx.pop();
    const sound = content.letterSound(piece.letter);
    voice.sayFile(sound?.url || content.letterSoundUrl(piece.letter), sound?.phonic || piece.letter, 0.7);
  }
  els.playStatus.textContent = next < 0 ? `${word.label} is complete.` : `${piece.letter} fits. Find the next sound.`;
  if (next < 0) timers.after(420, () => finishAnswer());
  return true;
}

function reject(nodes, lineKey, { speakLine = true } = {}) {
  sfx.boing();
  nudger.poke();
  for (const node of nodes) {
    if (!node) continue;
    node.classList.remove('is-wrong');
    void node.offsetWidth;
    node.classList.add('is-wrong');
    timers.after(config.timing.wiggleMs, () => node.classList.remove('is-wrong'));
  }
  const text = DEFAULT_LINES[lineKey] || 'Try another one.';
  els.playStatus.textContent = text;
  if (speakLine) speak(lineKey, text);
}

function finishAnswer({ quiet = false } = {}) {
  if (state.locked || state.screen !== 'play') return false;
  state.locked = true;
  selectPiece(null);
  nudger.stop();
  void drag?.cancel();
  if (!quiet) sfx.sparkle();
  timers.after(quiet ? 0 : 360, showGreat);
  return true;
}

function renderGreatLetters(word) {
  els.greatLetters.replaceChildren();
  word.letters.forEach((letter, index) => {
    const tile = document.createElement('span');
    tile.className = 'rb-mini-letter';
    tile.append(makeImage(ASSET.letterSeed(index)));
    const label = document.createElement('span');
    label.textContent = letter;
    tile.append(label);
    els.greatLetters.append(tile);
  });
}

function showGreat() {
  const word = currentWord();
  if (!word || state.screen !== 'play') return false;
  const cheerKey = config.cheers[state.roundIndex % config.cheers.length];
  const cheerText = ['Great match!', 'They belong together!', 'You found that word!', 'Picture, sounds, and word!'][state.roundIndex % 4];
  els.greatLine.textContent = cheerText;
  els.greatPicture.src = word.art;
  els.greatPicture.alt = word.alt;
  els.greatWord.textContent = word.label;
  els.greatStatus.textContent = `${cheerText} ${word.label}.`;
  els.greatNext.querySelector('span').textContent = state.roundIndex + 1 >= config.roundsPerSession ? 'Finish the book' : 'Next word';
  renderGreatLetters(word);
  screens.show('great');
  const stopCelebration = tada({ host: els.great, count: 42, duration: 2600, rng });
  screens.hold(stopCelebration);
  screens.hold(() => timers.clearAll());
  speak(cheerKey, cheerText).then(() => {
    if (state.screen === 'great') speakWord(word);
  });
  timers.after(config.timing.revealAutoMs, advanceAfterGreat);
  return true;
}

function advanceAfterGreat() {
  if (state.screen !== 'great') return false;
  timers.clearAll();
  state.roundIndex += 1;
  if (state.roundIndex >= config.roundsPerSession) return showComplete();
  screens.show('play');
  renderRound();
  screens.hold(teardownRound);
  speakRound();
  return true;
}

function showComplete() {
  state.locked = true;
  els.bookStamps.replaceChildren();
  for (let index = 0; index < config.roundsPerSession; index += 1) {
    const stamp = makeImage(ASSET.reward(index));
    stamp.style.animationDelay = `${index * 120}ms`;
    els.bookStamps.append(stamp);
  }
  els.completeCopy.textContent = 'Your picture book is full of words.';
  els.completeStatus.textContent = 'Book complete. Your picture book is full of words.';
  screens.show('complete');
  screens.hold(tada({ host: els.complete, count: 70, duration: 3600, rng }));
  speak('book-complete', DEFAULT_LINES['book-complete']);
  return true;
}

function speakRound() {
  const selectedMode = mode();
  const word = currentWord();
  if (!selectedMode || !word || state.screen !== 'play') return Promise.resolve();
  if (selectedMode.id === 'picture') return speak('picture-prompt', DEFAULT_LINES['picture-prompt']);
  return speak(`find-${word.id}`, `Can you find ${word.id}?`);
}

function handleNudge(count = 0) {
  if (state.screen !== 'play' || state.locked) return false;
  const selectedMode = mode();
  const word = currentWord();
  if (!selectedMode || !word) return false;
  if (count === 0) {
    if (selectedMode.id === 'picture') speakWord(word);
    else if (selectedMode.id === 'listen') speak(`find-${word.id}`, `Can you find ${word.id}?`);
    else speak('build-nudge', DEFAULT_LINES['build-nudge']);
    return true;
  }

  let nodes = [];
  if (selectedMode.id === 'picture') {
    nodes = state.pieces.filter((piece) => piece.matchId === word.id).map((piece) => piece.el);
  } else if (selectedMode.id === 'listen') {
    nodes = state.pieces.filter((piece) => piece.matchId === word.id).map((piece) => piece.el);
  } else {
    const index = nextBuildIndex();
    const expected = word.letters[index];
    nodes = [
      state.pieces.find((piece) => !piece.used && piece.letter === expected)?.el,
      els.playBoard.querySelector(`[data-letter-slot="${index}"]`),
    ];
  }
  nodes.filter(Boolean).forEach((node) => {
    node.classList.add('is-nudge');
    timers.after(1800, () => node.classList.remove('is-nudge'));
  });
  speakRound();
  return true;
}

function goLibrary({ speakLine = false } = {}) {
  teardownRound();
  state.chapterId = null;
  state.modeId = null;
  state.sessionWords = [];
  state.roundIndex = 0;
  state.locked = false;
  screens.show('library');
  if (speakLine) speak('welcome', DEFAULT_LINES.welcome);
  return true;
}

function goActivities({ speakLine = false } = {}) {
  if (!state.chapterId) return goLibrary({ speakLine });
  teardownRound();
  state.modeId = null;
  state.sessionWords = [];
  state.roundIndex = 0;
  state.locked = false;
  renderModes();
  screens.show('activities');
  if (speakLine) speak('activity-prompt', DEFAULT_LINES['activity-prompt']);
  return true;
}

function mute(on = true) {
  state.muted = Boolean(on);
  voice.setMuted(state.muted);
  sfx.setMuted(state.muted);
  bgm.setMuted(state.muted);
  if (state.muted) voice.stop();
  return state.muted;
}

function wireStaticControls() {
  staticDisposers.push(onTap(els.home, () => { window.location.href = '../../index.html'; }, { feedback }));
  staticDisposers.push(onTap(els.activityBack, () => goLibrary({ speakLine: true }), { feedback }));
  staticDisposers.push(onTap(els.activitySound, () => {
    const selected = chapter();
    if (selected) speak(selected.voiceKey, `${selected.title}. Choose a reading game.`);
  }, { feedback }));
  staticDisposers.push(onTap(els.playBack, () => goActivities({ speakLine: true }), { feedback }));
  staticDisposers.push(onTap(els.playSound, () => speakRound(), { feedback }));
  staticDisposers.push(onTap(els.greatNext, () => advanceAfterGreat(), { feedback }));
  staticDisposers.push(onTap(els.playAgain, () => startSession(state.modeId), { feedback }));
  staticDisposers.push(onTap(els.chooseBook, () => goLibrary({ speakLine: true }), { feedback }));
}

async function winRound() {
  if (state.screen !== 'play') return false;
  if (state.modeId === 'build') {
    const word = currentWord();
    for (let index = 0; index < word.letters.length; index += 1) {
      if (state.placed[index]) continue;
      const piece = state.pieces.find((item) => !item.used && item.letter === word.letters[index]);
      if (piece) placeLetter(piece, index, { quiet: true });
    }
  }
  timers.clearAll();
  state.locked = false;
  finishAnswer({ quiet: true });
  await Promise.resolve();
  return true;
}

wireStaticControls();
installUnlockOnGesture({
  extra: [bgm.unlock],
  onFirst: () => {
    bgm.setVolume(config.music.volume);
    bgm.play(config.music.track, { key: 'reading-garden', fadeInMs: 1400, fadeOutMs: 500 });
    ready.then((loaded) => {
      if (loaded && state.screen === 'library') speak('welcome', DEFAULT_LINES.welcome);
    });
  },
});
installKioskGuards();

installDebug({
  gameId: 'picture-word-match',
  engine: 'custom-dom',
  ready,
  listModes: () => config.modes.map(({ id, title, skill }) => ({ id, title, skill })),
  startMode: async (id) => {
    if (!state.chapterId) await chooseChapter(config.chapters[0].id, { quiet: true });
    return startSession(id, { quiet: true });
  },
  getState: () => ({
    screen: state.screen,
    chapterId: state.chapterId,
    modeId: state.modeId,
    words: state.sessionWords.map((word) => word.id),
    roundIndex: state.roundIndex,
    currentWord: currentWord()?.id || null,
    selectedPieceId: state.selectedPieceId,
    placed: state.placed.map((piece) => piece?.letter || null),
    pieces: state.pieces.map((piece) => ({ id: piece.id, kind: piece.kind, matchId: piece.matchId || null, letter: piece.letter || null, used: piece.used })),
    locked: state.locked,
    muted: state.muted,
    pendingTimers: timers.size(),
    dragging: Boolean(drag?.active),
  }),
  getTargets: () => collectTargets(game),
  tap: async (id) => {
    const node = [...game.querySelectorAll('[data-target]')].find((candidate) => candidate.dataset.target === id);
    if (!node) return false;
    node.click();
    await Promise.resolve();
    return true;
  },
  winRound,
  home: () => goLibrary(),
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
  listChapters: () => config.chapters.map(({ id, title, words }) => ({ id, title, words: [...words] })),
  chooseChapter: (id) => chooseChapter(id, { quiet: true }),
  answer: (id) => {
    const piece = state.pieces.find((item) => item.matchId === id && item.kind !== 'picture')
      || state.pieces.find((item) => item.matchId === id)
      || state.pieces.find((item) => item.letter === id);
    return handlePieceTap(piece);
  },
  place: (pieceId, slotId) => {
    const piece = state.pieces.find((item) => item.id === pieceId);
    const slot = els.playBoard.querySelector(`[data-target="${slotId}"]`);
    if (state.modeId === 'picture') return attemptPictureDrop(piece, slot);
    if (state.modeId === 'listen') return attemptListenDrop(piece, slot);
    return attemptBuildDrop(piece, slot);
  },
  advance: () => advanceAfterGreat(),
  triggerNudge: (count = 0) => handleNudge(Number(count) || 0),
});
