import config from '../config.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import * as bgm from '../../../shared/js/bgm.js';
import { collectTargets, installDebug } from '../../../shared/js/debug-harness.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { shuffle } from '../../../shared/js/rng.js';
import { createScreens } from '../../../shared/js/screens.js';
import * as sfx from '../../../shared/js/sfx.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTimers } from '../../../shared/js/timers.js';
import * as voice from '../../../shared/js/voice-clips.js';

const MUSIC = '../../shared/assets/music/whimsical-toy-workshop.mp3';
const TILE_COLORS = ['coral', 'teal', 'mustard', 'grape'];
const LINE_FALLBACK = {
  welcome: 'Welcome to the Tiny Sentence Workshop. Choose a tool!',
  'mode-read': 'Tap and Read. Tap each word from left to right.',
  'mode-build': 'Build the Strip. Put the words in order.',
  'mode-scene': 'Scene Detective. Read the sentence. Which picture matches?',
  'nudge-read': 'Try the glowing word.',
  'nudge-build': 'Listen, then find the next word.',
  'nudge-scene': 'Look closely. Which scene says the same thing?',
  'gentle-retry': 'Almost. Try once more.',
  'round-complete-1': 'You made it!',
  'round-complete-2': 'That tiny sentence works!',
  'round-complete-3': 'Your scene is awake!',
  'session-complete': 'Three tiny sentences! Your workshop shelf is glowing.',
  again: "Let's make three more.",
};

const game = document.getElementById('game');
const els = {
  splash: document.getElementById('splash'),
  play: document.getElementById('play'),
  end: document.getElementById('end'),
  modeList: document.getElementById('mode-list'),
  playBack: document.getElementById('play-back'),
  playSound: document.getElementById('play-sound'),
  progress: document.getElementById('progress'),
  progressStars: document.getElementById('progress-stars'),
  prompt: document.getElementById('play-prompt'),
  workshop: document.getElementById('workshop'),
  sceneHost: document.getElementById('scene-host'),
  sentenceStrip: document.getElementById('sentence-strip'),
  partsTray: document.getElementById('parts-tray'),
  sceneChoices: document.getElementById('scene-choices'),
  playStatus: document.getElementById('play-status'),
  dragLayer: document.getElementById('drag-layer'),
  endBack: document.getElementById('end-back'),
  reward: document.getElementById('reward'),
  again: document.getElementById('again'),
  endStatus: document.getElementById('end-status'),
};

const corpusById = new Map(config.corpus.map((record) => [record.id, record]));
const tokenByWord = new Map(config.tokens.map((token) => [token.text, token]));
assertConfig(config);
const timers = createTimers();
const staticDisposers = [];
let roundDisposers = [];
let drag = null;
let rng = Math.random;
let seedValue = null;
let roundSerial = 0;

const state = {
  screen: 'splash',
  modeId: null,
  roundIndex: 0,
  sessionIds: [],
  sentenceId: null,
  tokenIndex: 0,
  placedTokenIds: [],
  trayOrder: [],
  sceneOrder: [],
  sceneChoiceId: null,
  attempts: 0,
  completedIds: [],
  awaitingInput: false,
  locked: false,
  finishing: false,
  muted: false,
};

const screens = createScreens({
  root: game,
  initial: 'splash',
  voice,
  onEnter(name) { state.screen = name; },
  onExit(name) { if (name === 'play') clearRound(); },
});

const nudger = createNudger({
  first: 9500,
  repeat: 9500,
  onNudge: handleNudge,
});

bgm.preload(MUSIC);
staticDisposers.push(installKioskGuards());
staticDisposers.push(installUnlockOnGesture({
  extra: [bgm.unlock],
  onFirst() { bgm.play(MUSIC, { key: 'tiny-sentence-workshop', fadeInMs: 700 }); },
}));

staticDisposers.push(onTap(els.playBack, goHome, { feedback: tapFeedback }));
staticDisposers.push(onTap(els.endBack, goHome, { feedback: tapFeedback }));
staticDisposers.push(onTap(els.playSound, replayCurrent, { feedback: tapFeedback }));
staticDisposers.push(onTap(els.again, () => {
  if (state.modeId) void startMode(state.modeId);
}, { feedback: tapFeedback }));

const criticalArt = [
  './assets/backgrounds/splash.webp',
  './assets/backgrounds/workshop.webp',
  ...['word-tile-coral', 'word-tile-teal', 'word-tile-mustard', 'word-tile-grape', 'word-socket', 'sentence-strip', 'label-plaque', 'action-slab', 'scene-card-frame', 'reward-shelf', 'golden-star', 'progress-pebbles']
    .map((name) => `./assets/ui/${name}.webp`),
  ...config.corpus.map((record) => record.scene),
];

const ready = Promise.all([
  voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', LINE_FALLBACK),
  preloadImages(criticalArt),
]).then(() => {
  renderSplash();
  document.body.classList.add('is-ready');
  return true;
});

installDebug({
  gameId: config.id,
  engine: 'custom-dom-sentence-workshop',
  ready,
  listModes: () => config.modes.map(({ id, title, skill }) => ({ id, title, skill })),
  startMode,
  getState: snapshotState,
  getTargets: () => collectTargets(game),
  tap: debugTap,
  winRound: () => completeRound({ forced: true }),
  home: goHome,
  timers,
  voice,
  sfx,
  onSeed(next, value) { rng = next; seedValue = value; },
  mute(on = true) {
    state.muted = Boolean(on);
    voice.setMuted(state.muted);
    sfx.setMuted(state.muted);
    bgm.setMuted(state.muted);
    return state.muted;
  },
  getAudioLog: voice.getAudioLog,
  clearAudioLog: voice.clearAudioLog,
  getRoundPlan: () => ({
    seed: seedValue,
    modeId: state.modeId,
    sessionIds: [...state.sessionIds],
    sentenceId: state.sentenceId,
    trayOrder: [...state.trayOrder],
    sceneOrder: [...state.sceneOrder],
  }),
  getLayout: () => ({
    viewport: { width: innerWidth, height: innerHeight },
    orientation: innerWidth >= innerHeight ? 'landscape' : 'portrait',
    screen: state.screen,
    modeId: state.modeId,
    targets: collectTargets(game),
  }),
  setReducedMotion(on = true) {
    game.classList.toggle('debug-reduced-motion', Boolean(on));
    return game.classList.contains('debug-reduced-motion');
  },
});

window.addEventListener('pagehide', () => {
  clearRound();
  voice.stop();
  bgm.stop({ fadeOutMs: 0 });
}, { once: true });

function assertConfig(next) {
  if (!next || next.id !== 'tiny-sentence-workshop') throw new Error('Tiny Sentence Workshop config is missing');
  if (!Array.isArray(next.modes) || next.modes.length !== 3) throw new Error('Exactly three workshop modes are required');
  if (!Array.isArray(next.corpus) || next.corpus.length < 12) throw new Error('At least twelve sentences are required');
  const ids = new Set(next.corpus.map((record) => record.id));
  const words = new Set(next.tokens.map((token) => token.text));
  for (const record of next.corpus) {
    if (!record.scene || !record.sentence || !record.choices?.includes(record.id)) throw new Error(`Incomplete sentence ${record.id}`);
    for (const choice of record.choices) if (!ids.has(choice)) throw new Error(`Unknown scene choice ${choice}`);
    for (const token of parseSentence(record)) if (!words.has(token.word)) throw new Error(`Unclassified token ${token.word}`);
  }
  for (const word of next.heartWords) {
    const token = next.tokens.find((entry) => entry.text === word);
    if (!token || token.kind !== 'heart') throw new Error(`Heart word ${word} is not classified`);
  }
}

function parseSentence(record) {
  return record.sentence.trim().split(/\s+/).map((display, index) => {
    const word = display.toLowerCase().replace(/[^a-z]/g, '');
    return {
      id: `${record.id}-${index}`,
      index,
      display,
      word,
      kind: tokenByWord.get(word)?.kind || 'decodable',
    };
  });
}

function tapFeedback(event) {
  event?.preventDefault?.();
  try { sfx.tick(); } catch { /* audio is never load-bearing */ }
}

function renderSplash() {
  for (const dispose of roundDisposers.splice(0)) dispose?.();
  els.modeList.replaceChildren();
  config.modes.forEach((mode, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `mode-button mode-${index + 1}`;
    button.dataset.target = `mode:${mode.id}`;
    button.dataset.role = 'mode';
    button.setAttribute('aria-label', `${mode.title}. ${mode.skill}`);
    const label = document.createElement('span');
    label.className = 'mode-label';
    label.innerHTML = '<img src="./assets/ui/label-plaque.webp" alt="">';
    const title = document.createElement('strong');
    title.textContent = mode.title;
    label.append(title);
    button.append(label);
    els.modeList.append(button);
    roundDisposers.push(onTap(button, () => void startMode(mode.id), { feedback: tapFeedback }));
  });
}

async function startMode(modeId) {
  await ready;
  const mode = config.modes.find((entry) => entry.id === modeId);
  if (!mode) return false;
  return screens.start(async () => {
    clearRound();
    state.modeId = modeId;
    state.roundIndex = 0;
    state.sessionIds = shuffle(config.corpus, rng).slice(0, config.roundsPerSession).map((record) => record.id);
    state.completedIds = [];
    state.sceneChoiceId = null;
    screens.show('play', { force: screens.is('play') });
    startRound();
    return snapshotState();
  }, { busy: false });
}

function startRound() {
  clearRound();
  const serial = ++roundSerial;
  const record = currentRecord();
  if (!record) { showEnd(); return; }
  const mode = currentMode();
  const tokens = parseSentence(record);
  state.sentenceId = record.id;
  state.tokenIndex = 0;
  state.placedTokenIds = [];
  state.trayOrder = [];
  state.sceneOrder = [];
  state.sceneChoiceId = null;
  state.attempts = 0;
  state.locked = false;
  state.finishing = false;
  state.awaitingInput = true;
  els.workshop.dataset.mode = state.modeId;
  els.prompt.textContent = mode.prompt;
  els.playStatus.textContent = mode.prompt;
  updateProgress();
  resetBoard();

  if (state.modeId === 'read-strip') renderRead(record, tokens);
  else if (state.modeId === 'build-strip') renderBuild(record, tokens);
  else renderSceneCheck(record, tokens);

  nudger.arm();
  void announceRound(serial, record, mode);
}

async function announceRound(serial, record, mode) {
  if (state.roundIndex === 0) await speak(mode.introKey);
  if (serial !== roundSerial || state.screen !== 'play') return;
  if (state.modeId !== 'read-strip') await speak(`sentence-${record.id}`, record.sentence);
}

function renderRead(record, tokens) {
  renderSleepingScene();
  const base = stripBase();
  const words = document.createElement('div');
  words.className = 'strip-words read-words';
  tokens.forEach((token, index) => {
    const button = makeWordTile(token, index, `word:${index}`);
    button.dataset.role = index === 0 ? 'correct' : 'blocked';
    roundDisposers.push(onTap(button, () => attemptRead(index), { feedback: tapFeedback }));
    words.append(button);
  });
  els.sentenceStrip.append(base, words);
}

function attemptRead(index) {
  if (state.locked || state.screen !== 'play') return false;
  nudger.poke();
  const tokens = parseSentence(currentRecord());
  if (index < state.tokenIndex) {
    void speak(`word-${tokens[index].word}`, tokens[index].word);
    return true;
  }
  if (index !== state.tokenIndex) return gentleMiss(document.querySelector(`[data-target="word:${index}"]`));
  const button = document.querySelector(`[data-target="word:${index}"]`);
  button?.classList.add('is-pressed');
  if (button) button.dataset.role = 'replay';
  state.tokenIndex += 1;
  state.placedTokenIds = tokens.slice(0, state.tokenIndex).map((token) => token.id);
  const next = document.querySelector(`[data-target="word:${state.tokenIndex}"]`);
  if (next) next.dataset.role = 'correct';
  try { sfx.pop(); } catch { /* optional */ }
  const spoken = speak(`word-${tokens[index].word}`, tokens[index].word);
  if (state.tokenIndex === tokens.length) {
    state.awaitingInput = false;
    state.locked = true;
    void spoken.then(() => completeRound());
  }
  return true;
}

function renderBuild(record, tokens) {
  renderSceneCard(record, { revealed: true, label: 'Sentence clue' });
  const base = stripBase();
  const slots = document.createElement('div');
  slots.className = 'strip-words build-slots';
  tokens.forEach((token, index) => {
    const slot = document.createElement('div');
    slot.className = 'word-slot';
    slot.dataset.slot = String(index);
    slot.setAttribute('aria-label', `Word spot ${index + 1}`);
    slot.innerHTML = '<img src="./assets/ui/word-socket.webp" alt=""><span></span>';
    slots.append(slot);
  });
  els.sentenceStrip.append(base, slots);

  state.trayOrder = shuffle(tokens.map((token) => token.index), rng);
  const pieces = new Map();
  for (const index of state.trayOrder) {
    const token = tokens[index];
    const button = makeWordTile(token, index, `piece:${index}`);
    button.classList.add('tray-word');
    button.dataset.role = index === 0 ? 'correct' : 'wrong';
    els.partsTray.append(button);
    pieces.set(String(index), { el: button, token });
  }

  drag = createDragToSlotDom({
    getPiece: (id) => pieces.get(String(id)),
    root: els.play,
    ghostHost: els.dragLayer,
    slotSelector: '[data-slot]',
    slotPad: 24,
    hoverClass: 'is-hovered',
    ghostClass: 'dragging',
    canStart: () => !state.locked,
    onDrop: (piece, info) => attemptBuild(piece.token.index, info.slot ? Number(info.slot.dataset.slot) : null),
    onTap: (piece) => attemptBuild(piece.token.index, state.placedTokenIds.length),
    onCancel: () => { els.playStatus.textContent = 'The word stamp is back in its tray.'; },
  });
  roundDisposers.push(() => { drag?.detach(); drag = null; });
  for (const [id, piece] of pieces) {
    const down = (event) => { tapFeedback(event); drag?.begin(event, id); };
    const click = (event) => { if (event.detail === 0) attemptBuild(piece.token.index, state.placedTokenIds.length); };
    piece.el.addEventListener('pointerdown', down);
    piece.el.addEventListener('click', click);
    roundDisposers.push(() => {
      piece.el.removeEventListener('pointerdown', down);
      piece.el.removeEventListener('click', click);
    });
  }
}

function attemptBuild(index, slotIndex) {
  if (state.locked || state.screen !== 'play') return false;
  nudger.poke();
  const tokens = parseSentence(currentRecord());
  const expected = state.placedTokenIds.length;
  if (index !== expected || slotIndex !== expected) {
    return gentleMiss(document.querySelector(`[data-target="piece:${index}"]`));
  }
  const token = tokens[index];
  state.placedTokenIds.push(token.id);
  state.tokenIndex = state.placedTokenIds.length;
  const slot = els.sentenceStrip.querySelector(`[data-slot="${expected}"]`);
  slot?.classList.add('is-filled');
  const slotText = slot?.querySelector('span');
  if (slotText) slotText.textContent = token.display;
  const piece = document.querySelector(`[data-target="piece:${index}"]`);
  if (piece) {
    piece.classList.add('is-placed');
    piece.disabled = true;
    piece.removeAttribute('data-target');
  }
  const next = document.querySelector(`[data-target="piece:${expected + 1}"]`);
  if (next) next.dataset.role = 'correct';
  try { sfx.pop(); } catch { /* optional */ }
  const spoken = speak(`word-${token.word}`, token.word);
  if (state.placedTokenIds.length === tokens.length) {
    state.awaitingInput = false;
    state.locked = true;
    void spoken.then(() => completeRound());
  }
  return true;
}

function renderSceneCheck(record, tokens) {
  const base = stripBase();
  const words = document.createElement('div');
  words.className = 'strip-words detective-words';
  tokens.forEach((token, index) => {
    const button = makeWordTile(token, index, `word:${index}`);
    button.dataset.role = 'replay';
    roundDisposers.push(onTap(button, () => {
      nudger.poke();
      void speak(`word-${token.word}`, token.word);
    }, { feedback: tapFeedback }));
    words.append(button);
  });
  els.sentenceStrip.append(base, words);

  state.sceneOrder = shuffle(record.choices, rng);
  for (const id of state.sceneOrder) {
    const choice = corpusById.get(id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'scene-choice';
    button.dataset.target = `scene:${id}`;
    button.dataset.role = id === record.id ? 'correct' : 'wrong';
    button.setAttribute('aria-label', choice.sentence);
    const scene = document.createElement('img');
    scene.className = 'scene-picture';
    scene.src = choice.scene;
    scene.alt = '';
    const frame = document.createElement('img');
    frame.className = 'scene-frame-art';
    frame.src = './assets/ui/scene-card-frame.webp';
    frame.alt = '';
    button.append(scene, frame);
    els.sceneChoices.append(button);
    roundDisposers.push(onTap(button, () => attemptScene(id), { feedback: tapFeedback }));
  }
}

function attemptScene(id) {
  if (state.locked || state.screen !== 'play') return false;
  nudger.poke();
  state.sceneChoiceId = id;
  if (id !== state.sentenceId) return gentleMiss(document.querySelector(`[data-target="scene:${id}"]`));
  const choice = document.querySelector(`[data-target="scene:${id}"]`);
  choice?.classList.add('is-chosen');
  state.awaitingInput = false;
  state.locked = true;
  void completeRound();
  return true;
}

function renderSceneSuccess(record) {
  for (const choice of els.sceneChoices.querySelectorAll('.scene-choice')) {
    const chosen = choice.dataset.target === `scene:${record.id}`;
    choice.classList.toggle('is-chosen', chosen);
    choice.classList.toggle('is-retired', !chosen);
    choice.disabled = true;
    choice.dataset.role = 'replay';
    if (!chosen || choice.querySelector('.scene-star')) continue;
    const star = document.createElement('img');
    star.className = 'scene-star';
    star.src = './assets/ui/golden-star.webp';
    star.alt = '';
    choice.append(star);
  }
  els.playStatus.textContent = `${record.sentence} That scene matches.`;
}

function gentleMiss(node) {
  state.attempts += 1;
  try { sfx.boing(); } catch { /* optional */ }
  node?.classList.remove('is-wobbling');
  void node?.offsetWidth;
  node?.classList.add('is-wobbling');
  timers.after(650, () => node?.classList.remove('is-wobbling'));
  const expected = expectedTarget();
  if (state.attempts > 1) expected?.classList.add('needs-help');
  els.playStatus.textContent = 'That piece went back gently. Try once more.';
  if (state.attempts % 2 === 0) void speak('gentle-retry');
  return false;
}

async function completeRound({ forced = false } = {}) {
  if (state.screen !== 'play' || state.finishing) return false;
  const record = currentRecord();
  if (!record) return false;
  state.finishing = true;
  state.locked = true;
  state.awaitingInput = false;
  nudger.stop();
  const serial = roundSerial;
  if (forced) {
    const tokens = parseSentence(record);
    state.tokenIndex = tokens.length;
    state.placedTokenIds = tokens.map((token) => token.id);
    state.sceneChoiceId = state.modeId === 'scene-check' ? record.id : state.sceneChoiceId;
    markBoardComplete();
  }
  if (state.modeId === 'scene-check') renderSceneSuccess(record);
  else renderSceneCard(record, { revealed: true, label: record.sentence, celebrate: true });
  els.workshop.classList.add('round-complete');
  if (!state.completedIds.includes(record.id)) state.completedIds.push(record.id);
  try { sfx.sparkle(); } catch { /* optional */ }
  await speak(`sentence-${record.id}`, record.sentence);
  if (serial !== roundSerial || state.screen !== 'play') return false;
  await speak(`round-complete-${(state.roundIndex % 3) + 1}`);
  if (serial !== roundSerial || state.screen !== 'play') return false;
  timers.after(850, () => {
    if (serial !== roundSerial || state.screen !== 'play') return;
    state.roundIndex += 1;
    if (state.roundIndex >= state.sessionIds.length) showEnd();
    else startRound();
  });
  return true;
}

function markBoardComplete() {
  for (const node of els.play.querySelectorAll('[data-target]')) {
    if (!node.dataset.target.startsWith('scene:') && !node.dataset.target.startsWith('word:') && !node.dataset.target.startsWith('piece:')) continue;
    node.classList.add('is-pressed');
    node.dataset.role = 'replay';
  }
}

function showEnd() {
  clearRound();
  state.sentenceId = null;
  state.awaitingInput = false;
  state.locked = false;
  renderReward();
  screens.show('end');
  try { sfx.tada(); } catch { /* optional */ }
  els.endStatus.textContent = 'Three tiny sentences are complete.';
  void speak('session-complete');
}

function renderReward() {
  els.reward.replaceChildren();
  const shelf = document.createElement('img');
  shelf.className = 'reward-shelf';
  shelf.src = './assets/ui/reward-shelf.webp';
  shelf.alt = '';
  els.reward.append(shelf);
  const strips = document.createElement('div');
  strips.className = 'reward-strips';
  for (const id of state.completedIds.slice(0, 3)) {
    const record = corpusById.get(id);
    const card = document.createElement('div');
    card.className = 'reward-strip';
    const picture = document.createElement('img');
    picture.className = 'reward-picture';
    picture.src = record.scene;
    picture.alt = '';
    const star = document.createElement('img');
    star.className = 'reward-star';
    star.src = './assets/ui/golden-star.webp';
    star.alt = '';
    const label = document.createElement('span');
    label.className = 'reward-label';
    const labelArt = document.createElement('img');
    labelArt.src = './assets/ui/label-plaque.webp';
    labelArt.alt = '';
    const text = document.createElement('span');
    text.textContent = record.sentence;
    label.append(labelArt, text);
    card.append(picture, star, label);
    strips.append(card);
  }
  els.reward.append(strips);
}

function goHome() {
  clearRound();
  state.modeId = null;
  state.sentenceId = null;
  state.sessionIds = [];
  state.completedIds = [];
  state.roundIndex = 0;
  state.awaitingInput = false;
  state.locked = false;
  screens.show('splash');
  renderSplash();
  return snapshotState();
}

function replayCurrent() {
  if (state.screen !== 'play') return false;
  nudger.poke();
  const record = currentRecord();
  if (!record) return false;
  void speak(`sentence-${record.id}`, record.sentence);
  return true;
}

function handleNudge(count) {
  if (state.screen !== 'play' || state.locked) return;
  if (count === 0) {
    if (state.modeId === 'read-strip') void speak('nudge-read');
    else if (state.modeId === 'build-strip') void speak('nudge-build');
    else void speak(`sentence-${state.sentenceId}`, currentRecord()?.sentence);
    return;
  }
  if (state.modeId === 'scene-check') {
    els.sceneChoices.querySelectorAll('.scene-choice').forEach((node) => node.classList.add('needs-help'));
    void speak('nudge-scene');
  } else {
    expectedTarget()?.classList.add('needs-help');
    void speak(state.modeId === 'read-strip' ? 'nudge-read' : 'nudge-build');
  }
}

function expectedTarget() {
  if (state.modeId === 'read-strip') return document.querySelector(`[data-target="word:${state.tokenIndex}"]`);
  if (state.modeId === 'build-strip') return document.querySelector(`[data-target="piece:${state.placedTokenIds.length}"]`);
  return null;
}

function renderSleepingScene() {
  els.sceneHost.replaceChildren();
  const shell = document.createElement('div');
  shell.className = 'scene-card sleeping-scene';
  shell.setAttribute('aria-label', 'A tiny scene is waiting to wake up');
  const frame = document.createElement('img');
  frame.className = 'scene-frame-art';
  frame.src = './assets/ui/scene-card-frame.webp';
  frame.alt = '';
  const star = document.createElement('img');
  star.className = 'sleeping-star';
  star.src = './assets/ui/golden-star.webp';
  star.alt = '';
  shell.append(frame, star);
  els.sceneHost.append(shell);
}

function renderSceneCard(record, { revealed = false, label = '', celebrate = false } = {}) {
  els.sceneHost.replaceChildren();
  const shell = document.createElement('div');
  shell.className = `scene-card${revealed ? ' is-revealed' : ''}${celebrate ? ' is-celebrating' : ''}`;
  shell.setAttribute('aria-label', label || record.sentence);
  const picture = document.createElement('img');
  picture.className = 'scene-picture';
  picture.src = record.scene;
  picture.alt = '';
  const frame = document.createElement('img');
  frame.className = 'scene-frame-art';
  frame.src = './assets/ui/scene-card-frame.webp';
  frame.alt = '';
  shell.append(picture, frame);
  if (celebrate) {
    const star = document.createElement('img');
    star.className = 'scene-star';
    star.src = './assets/ui/golden-star.webp';
    star.alt = '';
    shell.append(star);
  }
  els.sceneHost.append(shell);
}

function stripBase() {
  const base = document.createElement('img');
  base.className = 'sentence-strip-art';
  base.src = './assets/ui/sentence-strip.webp';
  base.alt = '';
  return base;
}

function makeWordTile(token, index, target) {
  const color = token.kind === 'heart' ? 'grape' : TILE_COLORS[index % TILE_COLORS.length];
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `word-tile word-${color}${token.kind === 'heart' ? ' is-heart' : ''}`;
  button.dataset.target = target;
  button.dataset.wordIndex = String(index);
  button.setAttribute('aria-label', token.display);
  const art = document.createElement('img');
  art.src = `./assets/ui/word-tile-${color}.webp`;
  art.alt = '';
  const text = document.createElement('span');
  text.textContent = token.display;
  button.append(art, text);
  return button;
}

function updateProgress() {
  const done = state.roundIndex;
  els.progress.setAttribute('aria-label', `Round ${Math.min(done + 1, config.roundsPerSession)} of ${config.roundsPerSession}`);
  els.progressStars.replaceChildren();
  for (let index = 0; index < done; index += 1) {
    const star = document.createElement('img');
    star.src = './assets/ui/golden-star.webp';
    star.alt = '';
    els.progressStars.append(star);
  }
}

function resetBoard() {
  els.workshop.classList.remove('round-complete');
  els.sceneHost.replaceChildren();
  els.sentenceStrip.replaceChildren();
  els.partsTray.replaceChildren();
  els.sceneChoices.replaceChildren();
}

function clearRound() {
  roundSerial += 1;
  nudger?.stop?.();
  timers.clearAll();
  if (drag) {
    void drag.cancel();
    drag.detach();
    drag = null;
  }
  for (const dispose of roundDisposers.splice(0)) {
    try { dispose?.(); } catch { /* teardown cannot strand navigation */ }
  }
  voice.stop();
}

function currentMode() {
  return config.modes.find((mode) => mode.id === state.modeId);
}

function currentRecord() {
  return corpusById.get(state.sessionIds[state.roundIndex]);
}

function speak(key, fallback) {
  return bgm.duckDuring(voice.say(key, fallback || LINE_FALLBACK[key] || ''), { down: 0.18, downMs: 100, upMs: 280 });
}

function snapshotState() {
  return {
    screen: state.screen,
    modeId: state.modeId,
    roundIndex: state.roundIndex,
    roundsPerSession: config.roundsPerSession,
    sessionIds: [...state.sessionIds],
    sentenceId: state.sentenceId,
    tokenIndex: state.tokenIndex,
    placedTokenIds: [...state.placedTokenIds],
    attempts: state.attempts,
    sceneChoiceId: state.sceneChoiceId,
    completedIds: [...state.completedIds],
    awaitingInput: state.awaitingInput,
    locked: state.locked,
    muted: state.muted,
    seed: seedValue,
  };
}

async function debugTap(targetId) {
  const id = String(targetId || '');
  if (id.startsWith('mode:')) return startMode(id.slice(5));
  if (id === 'back' || id === 'end-back') return goHome();
  if (id === 'sound') return replayCurrent();
  if (id === 'again') return state.modeId ? startMode(state.modeId) : false;
  if (id.startsWith('word:')) {
    const index = Number(id.slice(5));
    if (state.modeId === 'scene-check') {
      const token = parseSentence(currentRecord())[index];
      if (!token) return false;
      await speak(`word-${token.word}`, token.word);
      return true;
    }
    return attemptRead(index);
  }
  if (id.startsWith('piece:')) return attemptBuild(Number(id.slice(6)), state.placedTokenIds.length);
  if (id.startsWith('scene:')) return attemptScene(id.slice(6));
  return false;
}
