import config from '../config.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import * as bgm from '../../../shared/js/bgm.js';
import * as celebrate from '../../../shared/js/celebrate.js';
import { collectTargets, installDebug } from '../../../shared/js/debug-harness.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { shuffle } from '../../../shared/js/rng.js';
import { createScreens } from '../../../shared/js/screens.js';
import * as sfx from '../../../shared/js/sfx.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTimers } from '../../../shared/js/timers.js';
import * as voice from '../../../shared/js/voice-clips.js';

const game = document.getElementById('game');
const els = {
  splash: document.getElementById('splash'),
  splashSound: document.getElementById('splash-sound'),
  modeList: document.getElementById('mode-list'),
  play: document.getElementById('play'),
  playStage: document.getElementById('play-stage'),
  playBack: document.getElementById('play-back'),
  playSound: document.getElementById('play-sound'),
  progress: document.getElementById('progress'),
  progressCount: document.getElementById('progress-count'),
  sceneImage: document.getElementById('scene-image'),
  repairSlot: document.getElementById('repair-slot'),
  tornPatch: document.getElementById('torn-patch'),
  promptText: document.getElementById('prompt-text'),
  repairTray: document.getElementById('repair-tray'),
  cardList: document.getElementById('card-list'),
  nextPage: document.getElementById('next-page'),
  dragLayer: document.getElementById('drag-layer'),
  playStatus: document.getElementById('play-status'),
  end: document.getElementById('end'),
  endBack: document.getElementById('end-back'),
  endHeading: document.getElementById('end-heading'),
  again: document.getElementById('again'),
  againArt: document.getElementById('again-art'),
  otherMode: document.getElementById('other-mode'),
  otherModeArt: document.getElementById('other-mode-art'),
  otherModeLabel: document.getElementById('other-mode-label'),
  endStatus: document.getElementById('end-status'),
};

assertConfig(config);

let lines = {};
let rng = Math.random;
let seedValue = null;
let roundSerial = 0;
let drag = null;
let roundDisposers = [];
const staticDisposers = [];
const timers = createTimers();
const completedModes = new Set();

const state = {
  screen: 'splash',
  modeId: null,
  roundIndex: 0,
  caseId: null,
  phase: 'problem',
  choiceOrder: [],
  selectedChoiceId: null,
  attempts: 0,
  completedCaseIds: [],
  awaitingInput: false,
  locked: false,
  muted: false,
};

const narrator = createNarrator();
const screens = createScreens({
  root: game,
  initial: 'splash',
  voice: narrator,
  onEnter(name) { state.screen = name; },
  onExit(name) { if (name === 'play') clearRound(); },
});

const nudger = createNudger({
  first: 9000,
  repeat: 9000,
  onNudge: handleIdleNudge,
});

bgm.setVolume(config.music.volume);
bgm.preload(config.music.track);

staticDisposers.push(installKioskGuards());
staticDisposers.push(installUnlockOnGesture({
  extra: [bgm.unlock],
  onFirst() {
    bgm.play(config.music.track, { key: config.id, fadeInMs: 850 });
    ready.then(() => {
      if (state.screen === 'splash') void speak('welcome');
    });
  },
}));

staticDisposers.push(onTap(els.playBack, goHome, { feedback: tapFeedback }));
staticDisposers.push(onTap(els.splashSound, () => speak('welcome'), { feedback: tapFeedback }));
staticDisposers.push(onTap(els.playSound, replayCurrent, { feedback: tapFeedback }));
staticDisposers.push(onTap(els.repairSlot, handleSlotTap, { feedback: tapFeedback }));
staticDisposers.push(onTap(els.nextPage, nextRound, { feedback: tapFeedback }));
staticDisposers.push(onTap(els.endBack, goHome, { feedback: tapFeedback }));
staticDisposers.push(onTap(els.again, () => {
  if (state.modeId) void startMode(state.modeId);
}, { feedback: tapFeedback }));
staticDisposers.push(onTap(els.otherMode, () => {
  const other = config.modes.find((mode) => mode.id !== state.modeId);
  if (other) void startMode(other.id);
}, { feedback: tapFeedback }));

renderSplash();

const criticalArt = [
  ...Object.values(config.ui),
  ...config.modes.flatMap((mode) => mode.cases.flatMap((story) => [
    story.scene,
    ...story.choices.map((choice) => choice.image),
  ])),
];

const ready = Promise.all([
  fetch('./data/lines.json')
    .then((response) => {
      if (!response.ok) throw new Error(`Story Repair Shop lines failed: ${response.status}`);
      return response.json();
    })
    .then((loaded) => { lines = loaded; }),
  voice.init('./assets/audio/manifest.json', './data/lines.json', lines),
  preloadImages(criticalArt),
]).then(() => {
  document.body.classList.add('is-ready');
  return true;
}).catch((error) => {
  document.body.classList.add('is-ready');
  throw error;
});

installDebug({
  gameId: config.id,
  engine: config.engine,
  ready,
  listModes: () => config.modes.map(({ id, title, skill }) => ({ id, title, skill })),
  startMode,
  getState: snapshotState,
  getTargets: () => collectTargets(game),
  tap: debugTap,
  winRound: () => completeRound({ forced: true }),
  home: goHome,
  timers,
  narrator,
  voice,
  sfx,
  onSeed(next, value) { rng = next; seedValue = value; },
  mute(on = true) {
    state.muted = Boolean(on);
    narrator.setMuted(state.muted);
    voice.setMuted(state.muted);
    sfx.setMuted(state.muted);
    bgm.setMuted(state.muted);
    return state.muted;
  },
  getAudioLog: voice.getAudioLog,
  clearAudioLog: voice.clearAudioLog,
  getLayout: () => ({
    viewport: { width: innerWidth, height: innerHeight },
    orientation: innerWidth >= innerHeight ? 'landscape' : 'portrait',
    stage: rectJson(els.playStage),
    screen: state.screen,
    phase: state.phase,
    targets: collectTargets(game),
  }),
  getRoundPlan: () => ({
    seed: seedValue,
    modeId: state.modeId,
    caseId: state.caseId,
    choiceOrder: [...state.choiceOrder],
  }),
  chooseCase,
  openRepair,
  setReducedMotion(on = true) {
    game.classList.toggle('debug-reduced-motion', Boolean(on));
    return game.classList.contains('debug-reduced-motion');
  },
});

window.addEventListener('pagehide', () => {
  clearRound();
  narrator.dispose();
  voice.stop();
  bgm.stop({ fadeOutMs: 0 });
  for (const dispose of staticDisposers.splice(0)) dispose?.();
}, { once: true });

function assertConfig(next) {
  if (!next || next.id !== 'story-repair-shop') throw new Error('Story Repair Shop config is missing');
  if (!Array.isArray(next.modes) || next.modes.length !== 2) throw new Error('Story Repair Shop requires exactly two modes');
  const caseIds = new Set();
  const choiceIds = new Set();
  for (const mode of next.modes) {
    if (!Array.isArray(mode.cases) || mode.cases.length !== 3) throw new Error(`${mode.id} requires exactly three stories`);
    for (const story of mode.cases) {
      if (caseIds.has(story.id)) throw new Error(`Duplicate story ${story.id}`);
      caseIds.add(story.id);
      if (!story.scene || !story.setupLine || !story.successLine || !story.missing) throw new Error(`Incomplete story ${story.id}`);
      if (!Array.isArray(story.choices) || story.choices.length !== 3) throw new Error(`${story.id} requires exactly three repairs`);
      if (story.choices.filter((choice) => choice.correct).length !== 1) throw new Error(`${story.id} requires exactly one fitting repair`);
      for (const choice of story.choices) {
        if (choiceIds.has(choice.id)) throw new Error(`Duplicate repair ${choice.id}`);
        choiceIds.add(choice.id);
        if (!choice.image || !choice.alt) throw new Error(`Incomplete repair ${choice.id}`);
      }
    }
  }
}

function line(key) {
  return typeof lines[key] === 'string' ? lines[key] : '';
}

function speak(key) {
  return bgm.duckDuring(narrator.say(key, line(key)));
}

function speakSequence(parts) {
  const expanded = parts.map((part) => {
    if (typeof part === 'string') return { key: part, text: line(part) };
    return { ...part, text: part.text || line(part.key) };
  });
  return bgm.duckDuring(narrator.saySequence(expanded));
}

function tapFeedback(event) {
  event?.preventDefault?.();
  try { sfx.tick(); } catch { /* audio is never load-bearing */ }
}

function renderSplash() {
  els.modeList.replaceChildren();
  for (const mode of config.modes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mode-button';
    button.dataset.target = `mode:${mode.id}`;
    button.dataset.role = 'mode';
    button.setAttribute('aria-label', `${mode.title}. ${mode.skill}`);

    const art = document.createElement('img');
    art.src = mode.medallion;
    art.alt = '';
    const copy = document.createElement('span');
    copy.className = 'mode-copy';
    const title = document.createElement('strong');
    title.textContent = mode.title;
    const detail = document.createElement('small');
    detail.textContent = mode.id === 'repair' ? 'What makes sense?' : 'What makes you giggle?';
    copy.append(title, detail);
    button.append(art, copy);
    els.modeList.append(button);
    staticDisposers.push(onTap(button, () => void startMode(mode.id), { feedback: tapFeedback }));
  }
}

async function startMode(modeId) {
  await ready;
  const mode = modeById(modeId);
  if (!mode) return false;
  return screens.start(async () => {
    clearRound();
    state.modeId = mode.id;
    state.roundIndex = 0;
    state.completedCaseIds = [];
    screens.show('play', { force: screens.is('play') });
    startRound();
    return snapshotState();
  }, { busy: false });
}

function startRound() {
  clearRound();
  const serial = ++roundSerial;
  const mode = currentMode();
  const story = currentStory();
  if (!mode || !story) return;

  state.caseId = story.id;
  state.phase = 'problem';
  state.choiceOrder = shuffle(story.choices, rng).map((choice) => choice.id);
  state.selectedChoiceId = null;
  state.attempts = 0;
  state.awaitingInput = true;
  state.locked = false;

  els.playStage.dataset.phase = 'problem';
  els.playStage.classList.remove('is-turning', 'has-selection');
  els.sceneImage.src = story.scene;
  els.sceneImage.alt = story.choices.find((choice) => choice.correct)?.alt
    ? `${mode.title} story illustration, waiting to be repaired`
    : 'A watercolor story waiting to be repaired';
  els.promptText.textContent = line(story.setupLine);
  els.repairSlot.hidden = false;
  els.repairSlot.disabled = false;
  els.repairSlot.className = 'repair-slot';
  els.repairSlot.setAttribute('aria-label', 'Open the Repair Shop');
  els.repairSlot.style.left = `${story.missing.x * 100}%`;
  els.repairSlot.style.top = `${story.missing.y * 100}%`;
  els.repairSlot.style.width = `${story.missing.w * 100}%`;
  els.repairSlot.style.height = `${story.missing.h * 100}%`;
  els.repairSlot.style.setProperty('--repair-rotate', `${story.missing.rotate || 0}deg`);
  els.repairTray.hidden = true;
  els.cardList.replaceChildren();
  els.nextPage.hidden = true;
  els.nextPage.classList.remove('is-in');
  els.progressCount.textContent = `${state.roundIndex + 1} / ${mode.cases.length}`;
  els.progress.setAttribute('aria-label', `Story ${state.roundIndex + 1} of ${mode.cases.length}`);
  els.playStatus.textContent = line(story.setupLine);

  void speakSequence([
    story.setupLine,
    { key: 'open-repair', gap: 180 },
  ]).then(() => {
    if (serial === roundSerial && state.phase === 'problem') state.awaitingInput = true;
  });
  nudger.arm();
}

function openRepair() {
  if (state.screen !== 'play' || state.phase !== 'problem' || state.locked) return false;
  const story = currentStory();
  if (!story) return false;
  narrator.stop();
  nudger.poke();
  state.phase = 'tray';
  state.selectedChoiceId = null;
  state.awaitingInput = true;
  els.playStage.dataset.phase = 'tray';
  els.repairSlot.setAttribute('aria-label', 'Put the selected repair into the torn spot');
  els.promptText.textContent = 'Choose a painted piece for the torn spot.';
  els.repairTray.hidden = false;
  els.cardList.replaceChildren();

  const choiceById = new Map(story.choices.map((choice) => [choice.id, choice]));
  state.choiceOrder.forEach((id, index) => {
    const choice = choiceById.get(id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'repair-card';
    button.dataset.choiceId = id;
    button.dataset.target = `card:${id}`;
    button.dataset.role = 'choice';
    button.style.setProperty('--card-rotate', `${[-2.3, 1.4, -1][index]}deg`);
    button.setAttribute('aria-label', choice.alt);
    const image = document.createElement('img');
    image.src = choice.image;
    image.alt = '';
    button.append(image);
    els.cardList.append(button);

    const onPointerDown = (event) => drag?.begin(event, id);
    const onKeyboardClick = (event) => {
      if (event.detail === 0) selectCard(id, { announce: true });
    };
    button.addEventListener('pointerdown', onPointerDown);
    button.addEventListener('click', onKeyboardClick);
    roundDisposers.push(() => button.removeEventListener('pointerdown', onPointerDown));
    roundDisposers.push(() => button.removeEventListener('click', onKeyboardClick));
    timers.after(70 + index * 95, () => button.classList.add('is-in'));
  });

  drag = createDragToSlotDom({
    getPiece: (id) => {
      const choice = choiceById.get(id);
      const el = els.cardList.querySelector(`[data-choice-id="${cssEscape(id)}"]`);
      return choice && el ? { id, choice, el } : null;
    },
    ghostHost: els.dragLayer,
    root: els.playStage,
    slotSelector: '#repair-slot',
    slotPad: 42,
    hoverClass: 'is-hovered',
    ghostClass: 'dragging',
    canStart: () => state.phase === 'tray' && !state.locked,
    onGrab() { nudger.poke(); return true; },
    onLift() {
      try { sfx.whoosh(); } catch { /* audio is never load-bearing */ }
    },
    onDrop: async (piece, record) => {
      if (record.slot) await attemptChoice(piece.id, { source: 'drag' });
      else returnCard(piece.id);
    },
    onCancel: async (piece) => returnCard(piece.id),
    onTap: (piece) => selectCard(piece.id, { announce: true }),
  });

  void speak('drag-piece');
  return true;
}

function selectCard(choiceId, { announce = true } = {}) {
  if (state.phase !== 'tray' || state.locked) return false;
  const story = currentStory();
  if (!story?.choices.some((choice) => choice.id === choiceId)) return false;
  state.selectedChoiceId = choiceId;
  state.awaitingInput = true;
  nudger.poke();
  els.playStage.classList.add('has-selection');
  for (const card of els.cardList.querySelectorAll('.repair-card')) {
    const selected = card.dataset.choiceId === choiceId;
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-pressed', String(selected));
  }
  els.repairSlot.classList.add('is-selected');
  els.promptText.textContent = 'Now put your painted piece into the torn spot.';
  els.playStatus.textContent = line('tap-piece');
  try { sfx.pop(); } catch { /* audio is never load-bearing */ }
  if (announce) void speak('tap-piece');
  return true;
}

function handleSlotTap() {
  nudger.poke();
  if (state.phase === 'problem') return openRepair();
  if (state.phase === 'tray' && state.selectedChoiceId) {
    return attemptChoice(state.selectedChoiceId, { source: 'tap' });
  }
  if (state.phase === 'tray' && !state.locked) void speak('drag-piece');
  return false;
}

async function attemptChoice(choiceId, { source = 'tap' } = {}) {
  if (state.phase !== 'tray' || state.locked) return false;
  const story = currentStory();
  const choice = story?.choices.find((entry) => entry.id === choiceId);
  if (!choice) return false;
  state.selectedChoiceId = choiceId;
  state.attempts += 1;
  state.awaitingInput = false;
  nudger.poke();
  if (choice.correct) {
    await completeRound({ choiceId, source });
    return true;
  }
  await handleWrongChoice(choiceId);
  return false;
}

async function handleWrongChoice(choiceId) {
  const serial = roundSerial;
  state.locked = true;
  els.playStage.classList.remove('has-selection');
  const card = els.cardList.querySelector(`[data-choice-id="${cssEscape(choiceId)}"]`);
  card?.classList.add('is-wrong');
  els.repairSlot.classList.remove('is-selected', 'is-hovered');
  const retryKey = state.modeId === 'repair' ? 'retry-repair' : 'retry-silly';
  els.promptText.textContent = line(retryKey);
  els.playStatus.textContent = line(retryKey);
  try { sfx.unpop(); } catch { /* audio is never load-bearing */ }
  void speakSequence([
    retryKey,
    { key: currentStory().setupLine, gap: 180 },
  ]);
  await timers.wait(650);
  if (serial !== roundSerial || state.phase !== 'tray') return;
  card?.classList.remove('is-wrong', 'is-selected');
  state.selectedChoiceId = null;
  state.locked = false;
  state.awaitingInput = true;
  els.promptText.textContent = line(currentStory().setupLine);
}

async function completeRound({ choiceId = null, forced = false } = {}) {
  if (state.screen !== 'play') return false;
  if (state.phase === 'success') return true;
  const story = currentStory();
  if (!story) return false;
  const correct = story.choices.find((choice) => choice.correct);
  if (!forced && choiceId && choiceId !== correct.id) return false;

  const serial = roundSerial;
  state.locked = true;
  state.awaitingInput = false;
  state.phase = 'success';
  state.selectedChoiceId = correct.id;
  if (!state.completedCaseIds.includes(story.id)) state.completedCaseIds.push(story.id);
  nudger.stop();
  drag?.detach();
  drag = null;
  narrator.stop();

  els.playStage.dataset.phase = 'success';
  els.playStage.classList.remove('has-selection');
  els.repairTray.hidden = true;
  els.repairSlot.disabled = true;
  els.repairSlot.classList.remove('is-hovered', 'is-selected', 'is-modeling');
  els.promptText.textContent = line(story.successLine);
  els.playStatus.textContent = line(story.successLine);
  try { celebrate.tada({ confetti: false }); } catch { /* audio is never load-bearing */ }
  void speakSequence([
    'success-generic',
    { key: story.successLine, gap: 130 },
  ]);

  await timers.wait(780);
  if (serial !== roundSerial || state.phase !== 'success') return false;
  els.nextPage.hidden = false;
  requestAnimationFrame(() => els.nextPage.classList.add('is-in'));
  state.locked = false;
  state.awaitingInput = true;
  timers.after(8000, () => {
    if (serial === roundSerial && state.phase === 'success' && !state.locked) void nextRound();
  });
  return true;
}

async function nextRound() {
  if (state.phase !== 'success' || state.locked) return false;
  state.locked = true;
  state.awaitingInput = false;
  els.playStage.classList.add('is-turning');
  try { sfx.whoosh(); } catch { /* audio is never load-bearing */ }
  await timers.wait(670);
  state.roundIndex += 1;
  if (state.roundIndex >= currentMode().cases.length) {
    finishMode();
    return true;
  }
  startRound();
  return true;
}

function finishMode() {
  const mode = currentMode();
  if (!mode) return;
  completedModes.add(mode.id);
  clearRound();
  state.caseId = null;
  state.phase = 'complete';
  state.awaitingInput = true;
  state.locked = false;
  screens.show('end');
  renderEnd();
  const endKey = completedModes.size === config.modes.length ? 'all-complete' : 'mode-complete';
  els.endStatus.textContent = line(endKey);
  void speak(endKey);
}

function renderEnd() {
  const mode = currentMode() || config.modes[0];
  const other = config.modes.find((entry) => entry.id !== mode.id) || config.modes[0];
  const allDone = completedModes.size === config.modes.length;
  els.endHeading.textContent = allDone ? line('all-complete') : line('mode-complete');
  els.againArt.src = mode.medallion;
  els.again.setAttribute('aria-label', `Play ${mode.title} again`);
  els.otherModeArt.src = other.medallion;
  els.otherModeLabel.textContent = `Try ${other.title}`;
  els.otherMode.setAttribute('aria-label', `Play ${other.title}`);
}

function replayCurrent() {
  if (state.screen !== 'play') return false;
  const story = currentStory();
  if (!story) return false;
  nudger.poke();
  if (state.phase === 'success') void speak(story.successLine);
  else if (state.phase === 'tray') void speakSequence([story.setupLine, { key: 'drag-piece', gap: 180 }]);
  else void speakSequence([story.setupLine, { key: 'open-repair', gap: 180 }]);
  return true;
}

function handleIdleNudge(count) {
  if (state.screen !== 'play' || state.locked || state.phase === 'success') return;
  const story = currentStory();
  if (!story) return;
  if (count % 2 === 0) {
    els.promptText.textContent = line(story.setupLine);
    void speakSequence(['idle-repeat', { key: story.setupLine, gap: 120 }]);
    return;
  }
  els.repairSlot.classList.add('is-modeling');
  timers.after(1800, () => els.repairSlot.classList.remove('is-modeling'));
  void speak('idle-model');
}

function returnCard(choiceId) {
  if (state.phase !== 'tray') return;
  const card = els.cardList.querySelector(`[data-choice-id="${cssEscape(choiceId)}"]`);
  card?.classList.add('is-wrong');
  timers.after(380, () => card?.classList.remove('is-wrong'));
  try { sfx.unpop(); } catch { /* audio is never load-bearing */ }
}

function goHome() {
  clearRound();
  state.modeId = null;
  state.roundIndex = 0;
  state.caseId = null;
  state.phase = 'problem';
  state.choiceOrder = [];
  state.selectedChoiceId = null;
  state.awaitingInput = true;
  state.locked = false;
  screens.show('splash');
  void speak('welcome');
  return snapshotState();
}

async function chooseCase(caseId) {
  await ready;
  for (const mode of config.modes) {
    const index = mode.cases.findIndex((story) => story.id === caseId);
    if (index < 0) continue;
    clearRound();
    state.modeId = mode.id;
    state.roundIndex = index;
    state.completedCaseIds = [];
    screens.show('play', { force: screens.is('play') });
    startRound();
    return snapshotState();
  }
  return false;
}

function clearRound() {
  roundSerial += 1;
  timers.clearAll();
  nudger.stop();
  narrator.stop();
  els.playStage?.classList.remove('has-selection');
  if (drag) {
    drag.detach();
    drag = null;
  }
  for (const dispose of roundDisposers.splice(0)) {
    try { dispose?.(); } catch { /* teardown must keep going */ }
  }
  els.cardList?.replaceChildren();
}

function modeById(id) {
  return config.modes.find((mode) => mode.id === id) || null;
}

function currentMode() {
  return modeById(state.modeId);
}

function currentStory() {
  return currentMode()?.cases[state.roundIndex] || null;
}

function snapshotState() {
  return {
    ...state,
    choiceOrder: [...state.choiceOrder],
    completedCaseIds: [...state.completedCaseIds],
    completedModes: [...completedModes],
    seed: seedValue,
  };
}

async function debugTap(id) {
  if (id?.startsWith('mode:')) return startMode(id.slice(5));
  if (id?.startsWith('card:')) return selectCard(id.slice(5), { announce: false });
  if (id === 'repair-slot') return handleSlotTap();
  if (id === 'next') return nextRound();
  if (id === 'back' || id === 'end-back') return goHome();
  if (id === 'sound') return replayCurrent();
  if (id === 'splash-sound') return speak('welcome');
  if (id === 'again') return state.modeId ? startMode(state.modeId) : false;
  if (id === 'other-mode') {
    const other = config.modes.find((mode) => mode.id !== state.modeId);
    return other ? startMode(other.id) : false;
  }
  return false;
}

function rectJson(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(rect.x * 100) / 100,
    y: Math.round(rect.y * 100) / 100,
    w: Math.round(rect.width * 100) / 100,
    h: Math.round(rect.height * 100) / 100,
  };
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
