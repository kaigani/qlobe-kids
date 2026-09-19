import config from '../config.js';
import { installKioskGuards, installUnlockOnGesture } from '../../../shared/js/audio-unlock.js';
import { tada } from '../../../shared/js/celebrate.js';
import { collectTargets, installDebug } from '../../../shared/js/debug-harness.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { shuffle } from '../../../shared/js/rng.js';
import { createScreens } from '../../../shared/js/screens.js';
import * as sfx from '../../../shared/js/sfx.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTimers } from '../../../shared/js/timers.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';

const game = document.querySelector('#game');
const loading = document.querySelector('#loading');
const animalGrid = document.querySelector('#animal-grid');
const deckPrompt = document.querySelector('#deck-prompt');
const paradeButton = document.querySelector('#parade-button');
const paradeLabel = document.querySelector('#parade-label');
const instructionTitle = document.querySelector('#instruction-title');
const instructionPrompt = document.querySelector('#instruction-prompt');
const poseGrid = document.querySelector('#pose-grid');
const startMovingButton = document.querySelector('#start-moving');
const activeTitle = document.querySelector('#active-title');
const activeCount = document.querySelector('#active-count');
const activePose = document.querySelector('#active-pose');
const repProgress = document.querySelector('#rep-progress');
const movedButton = document.querySelector('#moved-button');
const pauseButton = document.querySelector('#pause-button');
const rewardCard = document.querySelector('#reward-card');
const rewardTitle = document.querySelector('#reward-title');
const rewardNote = document.querySelector('#reward-note');
const nextCardButton = document.querySelector('#next-card-button');
const deckButton = document.querySelector('#deck-button');
const paradeLineup = document.querySelector('#parade-lineup');
const startParadeButton = document.querySelector('#start-parade');
const finaleLineup = document.querySelector('#finale-lineup');
const paradeAgainButton = document.querySelector('#parade-again');
const finaleDeckButton = document.querySelector('#finale-deck');

const animals = new Map(config.animals.map((animal) => [animal.id, animal]));
const allAnimalIds = config.animals.map((animal) => animal.id);
const timers = createTimers();
const narrator = createNarrator({ announcerParent: game });
const disposers = [];
const artFailures = new Set();

let rng = Math.random;
let celebrationDispose = null;
let beatTimer = null;
let runToken = 0;
let debugDispose = null;

const state = {
  mode: 'cards',
  animal: null,
  phase: 'choose',
  rep: 0,
  completed: loadProgress(),
  paradeQueue: [],
  paradeIndex: 0,
  awaitingInput: true,
  muted: false,
  seed: null,
};

const screens = createScreens({
  root: game,
  initial: 'deck',
  splash: 'deck',
  voice: narrator,
  onExit: (name) => {
    runToken += 1;
    if (name === 'active') stopBeat();
    if (name === 'reward' || name === 'finale') {
      celebrationDispose?.();
      celebrationDispose = null;
    }
  },
});

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(config.storageKey) || '[]');
    if (!Array.isArray(saved)) return new Set();
    const known = new Set(config.animals.map((animal) => animal.id));
    return new Set(saved.filter((id) => known.has(id)));
  } catch {
    return new Set();
  }
}

function saveProgress() {
  try {
    localStorage.setItem(config.storageKey, JSON.stringify([...state.completed]));
  } catch {
    // Persistence is a bonus; movement play remains fully available without it.
  }
}

function image(src, alt = '', className = '') {
  const node = document.createElement('img');
  setImage(node, src, alt);
  if (className) node.className = className;
  return node;
}

function setImage(node, src, alt = '') {
  node.classList.remove('is-missing');
  node.alt = alt;
  node.onerror = () => {
    artFailures.add(src);
    node.classList.add('is-missing');
  };
  node.src = src;
  return node;
}

function animalFor(id = state.animal) {
  return animals.get(id) || null;
}

function activePosesFor(animal) {
  return Array.isArray(animal?.childPoses) && animal.childPoses.length
    ? animal.childPoses
    : animal?.poses || [];
}

function voiceText(key) {
  return config.voice[key] || '';
}

function speak(key) {
  if (!key) return Promise.resolve();
  return narrator.say(key, voiceText(key));
}

function speakSequence(keys) {
  return narrator.saySequence(keys.filter(Boolean).map((key, index) => ({
    key,
    text: voiceText(key),
    gap: index ? 160 : 0,
  })));
}

function narrationFor(cue) {
  if (Array.isArray(cue)) return speakSequence(cue);
  if (cue) return speak(cue);
  return Promise.resolve();
}

function setMuted(on = true) {
  state.muted = Boolean(on);
  narrator.setMuted(state.muted);
  voiceClips.setMuted(state.muted);
  sfx.setMuted(state.muted);
  return state.muted;
}

function paradeAvailable() {
  return state.completed.size >= config.paradeUnlockCount;
}

function stopBeat() {
  if (beatTimer != null) timers.clear(beatTimer);
  beatTimer = null;
}

function armBeat(delay = state.mode === 'parade' ? config.timing.paradeBeatMs : config.timing.beatMs) {
  stopBeat();
  const token = runToken;
  beatTimer = timers.after(delay, () => {
    beatTimer = null;
    if (token === runToken) advanceBeat('auto');
  });
}

function armBeatAfterNarration(narration, delay = state.mode === 'parade'
  ? config.timing.paradeBeatMs
  : config.timing.beatMs) {
  const token = runToken;
  const voiceToken = narrator.token;
  const expectedMode = state.mode;
  const expectedAnimal = state.animal;
  const expectedRep = state.rep;
  Promise.resolve(narration).then(() => {
    if (token !== runToken
      || voiceToken !== narrator.token
      || !screens.is('active')
      || state.phase !== 'moving'
      || state.mode !== expectedMode
      || state.animal !== expectedAnimal
      || state.rep !== expectedRep) return;
    armBeat(delay);
  });
}

function renderDeck() {
  const stampCount = state.completed.size;
  deckPrompt.textContent = stampCount
    ? `${stampCount} paw stamp${stampCount === 1 ? '' : 's'} — pick any card!`
    : 'Pick an animal and move!';

  for (const button of animalGrid.querySelectorAll('.animal-card')) {
    const complete = state.completed.has(button.dataset.animal);
    button.classList.toggle('is-complete', complete);
    button.setAttribute('aria-label', `${button.dataset.label}${complete ? ', paw stamp earned' : ''}`);
    button.querySelector('.card-stamp')?.toggleAttribute('hidden', !complete);
  }

  const available = paradeAvailable();
  paradeButton.disabled = !available;
  paradeButton.classList.toggle('is-available', available);
  paradeButton.setAttribute('aria-disabled', String(!available));
  paradeLabel.textContent = available
    ? 'Animal Parade!'
    : `Earn ${Math.max(0, config.paradeUnlockCount - stampCount)} more paw stamp${config.paradeUnlockCount - stampCount === 1 ? '' : 's'}`;
}

function buildDeck() {
  animalGrid.replaceChildren();
  for (const animal of config.animals) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'animal-card';
    button.dataset.animal = animal.id;
    button.dataset.label = animal.title;
    button.dataset.target = `animal-${animal.id}`;

    const art = image(animal.card, `${animal.shortTitle} motion card`, 'animal-card-art');
    const label = document.createElement('span');
    label.className = 'animal-card-label';
    label.textContent = animal.shortTitle;
    const stamp = image(config.assets.pawStamp, '', 'card-stamp');
    stamp.setAttribute('aria-hidden', 'true');
    button.append(art, label, stamp);
    disposers.push(onTap(button, () => selectAnimal(animal.id), {
      feedback: () => { try { sfx.tick(); } catch { /* optional */ } },
    }));
    animalGrid.append(button);
  }
  renderDeck();
}

function renderInstruction() {
  const animal = animalFor();
  if (!animal) return;
  instructionTitle.textContent = animal.title;
  instructionPrompt.textContent = animal.poseLabels.join(' • ');
  poseGrid.replaceChildren();
  animal.poses.forEach((src, index) => {
    const step = document.createElement('figure');
    step.className = 'pose-step';
    const art = image(src, `${animal.title}: ${animal.poseLabels[index]}`, 'pose-step-art');
    const label = document.createElement('figcaption');
    label.innerHTML = `<strong>${index + 1}</strong><span>${animal.poseLabels[index]}</span>`;
    step.append(art, label);
    poseGrid.append(step);
  });
}

async function selectAnimal(id, { voice = true } = {}) {
  const animal = animals.get(id);
  if (!animal) return false;
  return screens.start(async () => {
    stopBeat();
    state.mode = 'cards';
    state.animal = id;
    state.phase = 'instruction';
    state.rep = 0;
    state.awaitingInput = true;
    renderInstruction();
    screens.show('instruction');
    if (voice) speak(animal.instructionKey);
    return true;
  }, { busy: false });
}

function renderRepProgress(total = 3, complete = state.rep) {
  repProgress.replaceChildren();
  for (let index = 0; index < total; index += 1) {
    const stamp = image(config.assets.pawStamp, '', 'rep-paw');
    stamp.setAttribute('aria-hidden', 'true');
    stamp.classList.toggle('is-done', index < complete);
    stamp.classList.toggle('is-now', index === complete);
    repProgress.append(stamp);
  }
}

function updateActive() {
  const animal = animalFor();
  if (!animal) return;
  const inParade = state.mode === 'parade';
  const activePoses = activePosesFor(animal);
  const poseIndex = inParade ? 2 : Math.min(state.rep, activePoses.length - 1);
  const displayIndex = inParade ? state.paradeIndex : Math.min(state.rep, 2);
  const total = inParade ? state.paradeQueue.length : 3;
  const complete = inParade ? state.paradeIndex : state.rep;

  activeTitle.textContent = inParade ? `${animal.shortTitle} Joins the Parade` : animal.title;
  activeCount.textContent = inParade
    ? `Parade move ${Math.min(displayIndex + 1, total)} of ${total}`
    : `Move ${Math.min(state.rep + 1, 3)} of 3`;
  setImage(
    activePose,
    activePoses[Math.max(0, poseIndex)],
    `${animal.title} child movement pose`,
  );
  activePose.classList.remove('is-popping');
  activePose.classList.toggle('is-paused', state.phase === 'paused');
  requestAnimationFrame(() => activePose.classList.add('is-popping'));
  renderRepProgress(total, complete);
  pauseButton.querySelector('span').textContent = state.phase === 'paused' ? 'Resume' : 'Pause';
  pauseButton.setAttribute('aria-pressed', String(state.phase === 'paused'));
  pauseButton.disabled = state.phase === 'finishing';
  movedButton.disabled = state.phase === 'paused' || state.phase === 'finishing';
}

async function startMoving() {
  const animal = animalFor();
  if (!animal || state.mode !== 'cards') return false;
  return screens.start(async () => {
    stopBeat();
    state.phase = 'moving';
    state.rep = 0;
    state.awaitingInput = true;
    screens.show('active');
    updateActive();
    armBeatAfterNarration(speakSequence(['get-ready', 'rep-one']));
    return true;
  }, { busy: false });
}

function resumeNextBeat(cue) {
  state.phase = 'moving';
  state.awaitingInput = true;
  updateActive();
  armBeatAfterNarration(narrationFor(cue));
}

function advanceBeat(source = 'tap') {
  if (!screens.is('active') || state.phase !== 'moving') return false;
  stopBeat();
  state.awaitingInput = false;
  try { source === 'tap' ? sfx.pop() : sfx.sparkle(); } catch { /* optional */ }

  if (state.mode === 'parade') {
    state.paradeIndex += 1;
    state.rep = state.paradeIndex;
    if (state.paradeIndex >= state.paradeQueue.length) {
      state.phase = 'finishing';
      updateActive();
      const token = runToken;
      const paradeLength = state.paradeQueue.length;
      timers.after(config.timing.rewardDelayMs, () => {
        if (token !== runToken
          || !screens.is('active')
          || state.mode !== 'parade'
          || state.phase !== 'finishing'
          || state.paradeIndex !== paradeLength) return;
        showFinale();
      });
      return true;
    }
    state.animal = state.paradeQueue[state.paradeIndex];
    resumeNextBeat(['parade-next', animalFor()?.instructionKey]);
    return true;
  }

  state.rep += 1;
  if (state.rep >= 3) {
    state.phase = 'finishing';
    updateActive();
    const token = runToken;
    const animalId = state.animal;
    timers.after(config.timing.rewardDelayMs, () => {
      if (token !== runToken
        || !screens.is('active')
        || state.mode !== 'cards'
        || state.phase !== 'finishing'
        || state.animal !== animalId) return;
      finishAnimal();
    });
    return true;
  }
  resumeNextBeat(state.rep === 2 ? 'rep-three' : 'rep-two');
  return true;
}

function togglePause() {
  if (!screens.is('active') || state.phase === 'finishing') return false;
  if (state.phase === 'paused') {
    state.phase = 'moving';
    state.awaitingInput = true;
    updateActive();
    armBeatAfterNarration(speak('resume'));
    return true;
  }
  if (state.phase !== 'moving') return false;
  stopBeat();
  state.phase = 'paused';
  state.awaitingInput = true;
  updateActive();
  speak('pause');
  return true;
}

function finishAnimal() {
  const animal = animalFor();
  if (!animal) return false;
  if (screens.is('reward') && state.phase === 'reward') return true;
  stopBeat();
  state.completed.add(animal.id);
  saveProgress();
  state.rep = 3;
  state.phase = 'reward';
  state.awaitingInput = true;

  setImage(rewardCard, animal.card, `${animal.shortTitle} card with a paw stamp`);
  rewardTitle.textContent = `${animal.shortTitle}-tastic!`;
  rewardNote.textContent = state.completed.size === config.animals.length
    ? 'Every animal card has a paw stamp!'
    : `Your ${animal.shortTitle.toLowerCase()} card is stamped.`;
  screens.show('reward');
  celebrationDispose = tada({ host: document.querySelector('#screen-reward'), count: 34, rng });

  speak('reward');
  return true;
}

function nextCard() {
  const currentIndex = Math.max(0, allAnimalIds.indexOf(state.animal));
  const ordered = allAnimalIds.slice(currentIndex + 1).concat(allAnimalIds.slice(0, currentIndex + 1));
  const next = ordered.find((id) => !state.completed.has(id)) || ordered[0] || allAnimalIds[0];
  return selectAnimal(next);
}

function chooseParadeQueue() {
  const earned = allAnimalIds.filter((id) => state.completed.has(id));
  const pool = earned.length >= 3 ? earned : allAnimalIds;
  return shuffle(pool, rng).slice(0, 3);
}

function renderLineup(host, className = 'lineup-card') {
  host.replaceChildren();
  state.paradeQueue.forEach((id, index) => {
    const animal = animals.get(id);
    if (!animal) return;
    const figure = document.createElement('figure');
    figure.className = className;
    const art = image(animal.card, `${animal.shortTitle} parade card`);
    const caption = document.createElement('figcaption');
    caption.textContent = `${index + 1}. ${animal.shortTitle}`;
    figure.append(art, caption);
    host.append(figure);
  });
}

async function startParade({ bypassLock = false, voice = true } = {}) {
  if (!bypassLock && !paradeAvailable()) return false;
  return screens.start(async () => {
    stopBeat();
    state.mode = 'parade';
    state.paradeQueue = chooseParadeQueue();
    state.paradeIndex = 0;
    state.rep = 0;
    state.animal = state.paradeQueue[0] || allAnimalIds[0];
    state.phase = 'lineup';
    state.awaitingInput = true;
    renderLineup(paradeLineup);
    screens.show('parade');
    if (voice) speak('parade-intro');
    return true;
  }, { busy: false });
}

async function beginParade() {
  if (state.mode !== 'parade' || !state.paradeQueue.length) return false;
  return screens.start(async () => {
    state.paradeIndex = 0;
    state.rep = 0;
    state.animal = state.paradeQueue[0];
    state.phase = 'moving';
    state.awaitingInput = true;
    screens.show('active');
    updateActive();
    armBeatAfterNarration(speak(animalFor()?.instructionKey));
    return true;
  }, { busy: false });
}

function showFinale() {
  stopBeat();
  state.mode = 'parade';
  state.paradeIndex = state.paradeQueue.length;
  state.rep = state.paradeQueue.length;
  state.phase = 'finale';
  state.awaitingInput = true;
  renderLineup(finaleLineup, 'finale-card');
  screens.show('finale');
  celebrationDispose = tada({ host: document.querySelector('#screen-finale'), count: 46, rng });
  speak('parade-complete');
  return true;
}

function goDeck({ voice = true } = {}) {
  stopBeat();
  narrator.stop();
  state.mode = 'cards';
  state.animal = null;
  state.phase = 'choose';
  state.rep = 0;
  state.paradeQueue = [];
  state.paradeIndex = 0;
  state.awaitingInput = true;
  renderDeck();
  screens.show('deck');
  if (voice) speak(state.completed.size ? 'choose-again' : 'choose-animal');
  return true;
}

function replayPrompt() {
  if (screens.is('deck')) {
    return state.completed.size
      ? speak('choose-again')
      : speakSequence(['welcome', 'choose-animal']);
  }
  if (screens.is('instruction')) return speak(animalFor()?.instructionKey);
  if (screens.is('active')) {
    if (state.phase === 'paused') return speak('pause');
    stopBeat();
    const narration = speak(animalFor()?.instructionKey);
    armBeatAfterNarration(narration);
    return narration;
  }
  if (screens.is('reward')) return speak('reward');
  if (screens.is('parade')) return speak('parade-intro');
  if (screens.is('finale')) return speak('parade-complete');
  return Promise.resolve();
}

function addHud(hostId, kind, handler, corner, target, label) {
  const host = document.querySelector(hostId);
  const button = hudButton(kind, handler, { label });
  button.classList.add(corner);
  button.dataset.target = target;
  host.append(button);
  disposers.push(() => button.dispose?.());
  return button;
}

function wireHud() {
  addHud('#deck-hud', 'home', () => { window.location.href = '../../'; }, 'qk-hud-top-left', 'home', 'Back to QLOBE Kids');
  addHud('#deck-hud', 'sound', soundDebounce(replayPrompt, 650), 'qk-hud-top-right', 'sound', 'Hear the invitation again');
  for (const id of ['instruction', 'active', 'reward', 'parade', 'finale']) {
    addHud(`#${id}-hud`, 'back', () => goDeck(), 'qk-hud-top-left', 'back', 'Back to animal cards');
    addHud(`#${id}-hud`, 'sound', soundDebounce(replayPrompt, 650), 'qk-hud-top-right', 'sound', 'Hear that again');
  }
}

function visibleTarget(id) {
  return [...game.querySelectorAll(`[data-target="${CSS.escape(String(id))}"]`)]
    .find((node) => !node.disabled && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function debugState() {
  return {
    debugVersion: 1,
    screen: screens.current,
    mode: state.mode,
    animal: state.animal,
    phase: state.phase,
    rep: state.rep,
    completed: [...state.completed],
    unlocked: [...allAnimalIds],
    paradeAvailable: paradeAvailable(),
    awaitingInput: state.awaitingInput,
    muted: state.muted,
    paradeQueue: [...state.paradeQueue],
    paradeIndex: state.paradeIndex,
    seed: state.seed,
    artFailures: [...artFailures],
  };
}

async function debugWinRound() {
  if (state.mode === 'parade' || screens.is('parade') || screens.is('finale')) {
    if (screens.is('finale')) return debugState();
    if (!state.paradeQueue.length) state.paradeQueue = chooseParadeQueue();
    if (!state.animal) state.animal = state.paradeQueue[0];
    showFinale();
  } else {
    if (!state.animal) state.animal = allAnimalIds.find((id) => !state.completed.has(id)) || allAnimalIds[0];
    finishAnimal();
  }
  await nextFrame();
  return debugState();
}

function resetProgress() {
  state.completed.clear();
  saveProgress();
  goDeck({ voice: false });
  return debugState();
}

buildDeck();
wireHud();

disposers.push(onTap(paradeButton, () => startParade(), {
  feedback: () => { try { sfx.tick(); } catch { /* optional */ } },
}));
disposers.push(onTap(startMovingButton, startMoving, {
  feedback: () => { try { sfx.whoosh(); } catch { /* optional */ } },
}));
disposers.push(onTap(movedButton, () => advanceBeat('tap'), {
  feedback: () => { try { sfx.tick(); } catch { /* optional */ } },
}));
disposers.push(onTap(pauseButton, togglePause, {
  feedback: () => { try { sfx.tick(); } catch { /* optional */ } },
}));
disposers.push(onTap(nextCardButton, nextCard, {
  feedback: () => { try { sfx.whoosh(); } catch { /* optional */ } },
}));
disposers.push(onTap(deckButton, () => goDeck(), {
  feedback: () => { try { sfx.tick(); } catch { /* optional */ } },
}));
disposers.push(onTap(startParadeButton, beginParade, {
  feedback: () => { try { sfx.whoosh(); } catch { /* optional */ } },
}));
disposers.push(onTap(paradeAgainButton, () => startParade({ bypassLock: true }), {
  feedback: () => { try { sfx.whoosh(); } catch { /* optional */ } },
}));
disposers.push(onTap(finaleDeckButton, () => goDeck(), {
  feedback: () => { try { sfx.tick(); } catch { /* optional */ } },
}));

const disposeUnlock = installUnlockOnGesture();
const disposeKiosk = installKioskGuards();

const assetUrls = [
  ...Object.values(config.assets),
  ...config.animals.flatMap((animal) => [animal.card, ...animal.poses, ...(animal.childPoses || [])]),
];

const ready = Promise.all([
  preloadImages(assetUrls),
  voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
]).then(() => {
  renderDeck();
  game.setAttribute('aria-busy', 'false');
  loading.classList.add('is-ready');
  window.setTimeout(() => loading.setAttribute('hidden', ''), 360);
  return true;
});

debugDispose = installDebug({
  gameId: config.id,
  engine: config.engine,
  ready,
  listModes: () => [
    { id: 'cards', title: 'Animal Motion Cards' },
    { id: 'parade', title: 'Animal Parade' },
  ],
  startMode: (id) => {
    if (id === 'cards') return goDeck({ voice: false });
    if (id === 'parade') return startParade({ bypassLock: true, voice: false });
    return false;
  },
  getState: debugState,
  getTargets: () => collectTargets(game, '[data-target]:not(:disabled)'),
  tap: async (id) => {
    const target = visibleTarget(id);
    if (!target) return false;
    target.click();
    await nextFrame();
    return true;
  },
  winRound: debugWinRound,
  mute: setMuted,
  home: () => goDeck({ voice: false }),
  resetProgress,
  getAudioLog: voiceClips.getAudioLog,
  clearAudioLog: voiceClips.clearAudioLog,
  timers,
  narrator,
  voice: voiceClips,
  sfx,
  root: game,
  onSeed: (next, seed) => {
    rng = next;
    state.seed = seed;
  },
});

window.addEventListener('pagehide', () => {
  stopBeat();
  timers.clearAll();
  celebrationDispose?.();
  for (const dispose of disposers.splice(0)) {
    try { dispose(); } catch { /* teardown continues */ }
  }
  disposeUnlock?.();
  disposeKiosk?.();
  debugDispose?.();
  narrator.dispose();
  screens.destroy();
}, { once: true });

ready.catch((error) => {
  console.error('[animal-motion-cards] boot failed', error);
  game.setAttribute('aria-busy', 'false');
  loading.setAttribute('hidden', '');
});
