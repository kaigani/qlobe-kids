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

const CATEGORY_CLASS = {
  who: 'who',
  action: 'action',
  place: 'place',
  manner: 'manner',
};

const PREVIEW_CHOICES = {
  who: 'cat',
  action: 'dances',
  place: 'moon',
  manner: 'tutu',
};

const game = document.getElementById('game');
const els = {
  splash: document.getElementById('splash'),
  modeList: document.getElementById('mode-list'),
  build: document.getElementById('build'),
  buildBack: document.getElementById('build-back'),
  buildSound: document.getElementById('build-sound'),
  buildProgress: document.getElementById('build-progress'),
  buildProgressStars: document.getElementById('build-progress-stars'),
  sentenceBoard: document.getElementById('sentence-board'),
  sentenceSlots: document.getElementById('sentence-slots'),
  selectionZone: document.getElementById('selection-zone'),
  categoryPrompt: document.getElementById('category-prompt'),
  categoryPromptText: document.getElementById('category-prompt-text'),
  choicePocket: document.getElementById('choice-pocket'),
  pocketArt: document.getElementById('pocket-art'),
  choiceGrid: document.getElementById('choice-grid'),
  readyZone: document.getElementById('ready-zone'),
  showButton: document.getElementById('show-button'),
  buildStatus: document.getElementById('build-status'),
  dragLayer: document.getElementById('drag-layer'),
  reveal: document.getElementById('reveal'),
  revealBack: document.getElementById('reveal-back'),
  revealProgress: document.getElementById('reveal-progress'),
  revealProgressStars: document.getElementById('reveal-progress-stars'),
  revealStage: document.getElementById('reveal-stage'),
  motionRig: document.getElementById('motion-rig'),
  actorRig: document.getElementById('actor-rig'),
  revealPlace: document.getElementById('reveal-place'),
  revealCharacter: document.getElementById('reveal-character'),
  revealAction: document.getElementById('reveal-action'),
  revealManner: document.getElementById('reveal-manner'),
  celebrationLayer: document.getElementById('celebration-layer'),
  revealSentence: document.getElementById('reveal-sentence'),
  revealSentenceText: document.getElementById('reveal-sentence-text'),
  replayButton: document.getElementById('replay-button'),
  editButton: document.getElementById('edit-button'),
  anotherButton: document.getElementById('another-button'),
  revealStatus: document.getElementById('reveal-status'),
  end: document.getElementById('end'),
  endBack: document.getElementById('end-back'),
  storyQuilt: document.getElementById('story-quilt'),
  againButton: document.getElementById('again-button'),
  endStatus: document.getElementById('end-status'),
};

assertConfig(config);

const choiceMaps = Object.fromEntries(
  Object.entries(config.choices).map(([part, choices]) => [
    part,
    new Map(choices.map((choice) => [choice.id, choice])),
  ]),
);

const LINE_FALLBACK = {
  ...config.voice,
  ...Object.values(config.choices).flat().reduce((lines, choice) => {
    lines[choice.voiceKey] = choice.say;
    return lines;
  }, {}),
};

const timers = createTimers();
const staticDisposers = [];
let splashDisposers = [];
let buildDisposers = [];
let drag = null;
let rng = Math.random;
let seedValue = null;
let roundSerial = 0;
let announcementSerial = 0;
let hasWelcomed = false;

const state = {
  screen: 'splash',
  phase: 'splash',
  modeId: null,
  roundIndex: 0,
  activePart: null,
  selections: emptySelections(),
  choiceOrders: {},
  completed: [],
  awaitingInput: false,
  locked: false,
  muted: false,
  revealPeak: false,
};

const screens = createScreens({
  root: game,
  initial: 'splash',
  voice,
  onEnter(name) { state.screen = name; },
  onExit(name) {
    announcementSerial += 1;
    timers.clearAll();
    voice.stop();
    if (name === 'build') clearBuildInteractions();
    nudger.stop();
  },
});

const nudger = createNudger({
  first: 10000,
  repeat: 9500,
  onNudge: handleNudge,
});

bgm.preload(config.music);
staticDisposers.push(installKioskGuards());
staticDisposers.push(installUnlockOnGesture({
  extra: [bgm.unlock],
  onFirst() {
    bgm.play(config.music, { key: config.id, fadeInMs: 800 });
  },
}));

staticDisposers.push(onTap(els.buildBack, goHome, { feedback: tapFeedback }));
staticDisposers.push(onTap(els.revealBack, goHome, { feedback: tapFeedback }));
staticDisposers.push(onTap(els.endBack, goHome, { feedback: tapFeedback }));
staticDisposers.push(onTap(els.buildSound, replayBuildPrompt, { feedback: tapFeedback }));
staticDisposers.push(onTap(els.showButton, () => void showReveal(), { feedback: tapFeedback }));
staticDisposers.push(onTap(els.replayButton, replayReveal, { feedback: tapFeedback }));
staticDisposers.push(onTap(els.editButton, editSentence, { feedback: tapFeedback }));
staticDisposers.push(onTap(els.anotherButton, advanceFromReveal, { feedback: tapFeedback }));
staticDisposers.push(onTap(els.againButton, () => {
  if (state.modeId) void startMode(state.modeId);
}, { feedback: tapFeedback }));

const criticalArt = [
  './assets/backgrounds/theater.webp',
  './assets/ui/title.webp',
  ...Object.values(config.categories).flatMap((category) => [category.tray, category.card]),
  ...['action-button', 'label-plaque', 'progress-star', 'sentence-strip']
    .map((name) => `./assets/ui/${name}.webp`),
  ...Object.values(config.choices).flat().map((choice) => choice.art),
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
  engine: 'custom-dom-silly-sentence-builder',
  ready,
  listModes: () => config.modes.map(({ id, title, skill }) => ({ id, title, skill })),
  startMode,
  getState: snapshotState,
  getTargets: () => collectTargets(game),
  tap: debugTap,
  winRound: debugWinRound,
  home: goHome,
  timers,
  voice,
  sfx,
  onSeed(next, value) {
    rng = next;
    seedValue = value;
  },
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
    roundIndex: state.roundIndex,
    parts: currentMode()?.parts ? [...currentMode().parts] : [],
    choiceOrders: cloneOrders(),
    previousCombination: state.completed.at(-1)?.combination || null,
  }),
  getSelectedSentence: () => ({
    text: sentenceText(),
    selections: { ...state.selections },
  }),
  getLayout: layoutSnapshot,
  setReducedMotion(on = true) {
    game.classList.toggle('debug-reduced-motion', Boolean(on));
    return game.classList.contains('debug-reduced-motion');
  },
  showReveal: () => showReveal({ debugPeak: true, forced: true }),
});

window.addEventListener('pagehide', () => {
  clearBuildInteractions();
  nudger.stop();
  timers.clearAll();
  voice.stop();
  bgm.stop({ fadeOutMs: 0 });
  for (const dispose of staticDisposers.splice(0)) dispose?.();
}, { once: true });

function assertConfig(next) {
  if (!next || next.id !== 'silly-sentence-builder') throw new Error('Silly Sentence Builder config is missing');
  if (!Array.isArray(next.modes) || next.modes.length !== 2) throw new Error('Exactly two sentence modes are required');
  if (next.roundsPerSession !== 3) throw new Error('A story quilt requires exactly three rounds');
  const knownParts = new Set(Object.keys(next.categories || {}));
  for (const mode of next.modes) {
    if (!mode.id || !Array.isArray(mode.parts) || mode.parts.length < 3) throw new Error(`Incomplete mode ${mode.id || 'unknown'}`);
    for (const part of mode.parts) if (!knownParts.has(part)) throw new Error(`Unknown category ${part}`);
  }
  for (const part of knownParts) {
    const category = next.categories[part];
    const choices = next.choices?.[part];
    if (!category?.tray || !category?.card || !category?.promptKey) throw new Error(`Incomplete category ${part}`);
    if (!Array.isArray(choices) || choices.length !== 6) throw new Error(`Category ${part} requires six choices`);
    const ids = new Set();
    for (const choice of choices) {
      if (!choice.id || !choice.art || !choice.voiceKey || !choice.label || ids.has(choice.id)) throw new Error(`Incomplete or duplicate ${part} choice`);
      ids.add(choice.id);
    }
  }
}

function emptySelections() {
  return Object.fromEntries(Object.keys(config.categories).map((part) => [part, null]));
}

function cloneOrders() {
  return Object.fromEntries(Object.entries(state.choiceOrders).map(([part, ids]) => [part, [...ids]]));
}

function currentMode() {
  return config.modes.find((mode) => mode.id === state.modeId) || null;
}

function getChoice(part, id = state.selections[part]) {
  return choiceMaps[part]?.get(id) || null;
}

function tapFeedback(event) {
  event?.preventDefault?.();
  try { sfx.tick(); } catch { /* feedback is optional */ }
}

function renderSplash() {
  for (const dispose of splashDisposers.splice(0)) dispose?.();
  els.modeList.replaceChildren();
  for (const mode of config.modes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `mode-button mode-${mode.id}`;
    button.dataset.target = `mode:${mode.id}`;
    button.dataset.role = 'mode';
    button.setAttribute('aria-label', `${mode.title}. ${mode.skill}.`);

    const base = image('./assets/ui/action-button.webp', '', 'mode-button-art');
    const preview = document.createElement('span');
    preview.className = 'mode-preview';
    for (const part of mode.parts) {
      const choice = getChoice(part, PREVIEW_CHOICES[part]);
      const previewImage = image(choice.art, '', `mode-preview-${part}`);
      preview.append(previewImage);
    }
    const copy = document.createElement('span');
    copy.className = 'mode-copy';
    const title = document.createElement('strong');
    title.textContent = mode.title;
    const count = document.createElement('small');
    count.textContent = mode.parts.map((part) => config.categories[part].spokenLabel).join(' • ');
    copy.append(title, count);
    button.append(base, preview, copy);
    els.modeList.append(button);
    splashDisposers.push(onTap(button, () => void startMode(mode.id), { feedback: tapFeedback }));
  }
}

async function startMode(modeId) {
  await ready;
  const mode = config.modes.find((entry) => entry.id === modeId);
  if (!mode) return false;
  return screens.start(async () => {
    clearBuildInteractions();
    timers.clearAll();
    voice.stop();
    state.modeId = modeId;
    state.roundIndex = 0;
    state.completed = [];
    screens.show('build', { force: screens.is('build') });
    startRound();
    return snapshotState();
  }, { busy: false });
}

function startRound() {
  clearBuildInteractions();
  timers.clearAll();
  voice.stop();
  const mode = currentMode();
  if (!mode) return false;
  roundSerial += 1;
  announcementSerial += 1;
  state.phase = 'choosing';
  state.activePart = mode.parts[0];
  state.selections = emptySelections();
  state.choiceOrders = Object.fromEntries(mode.parts.map((part) => [
    part,
    shuffle(config.choices[part].map((choice) => choice.id), rng),
  ]));
  avoidPreviousLeadCombination(mode);
  state.awaitingInput = true;
  state.locked = false;
  state.revealPeak = false;
  renderBuild();
  nudger.arm();
  void announceRound(roundSerial);
  return true;
}

function avoidPreviousLeadCombination(mode) {
  const previous = state.completed.at(-1)?.selections;
  if (!previous) return;
  const repeats = mode.parts.every((part) => state.choiceOrders[part][0] === previous[part]);
  if (repeats && state.choiceOrders[mode.parts[0]].length > 1) {
    state.choiceOrders[mode.parts[0]].push(state.choiceOrders[mode.parts[0]].shift());
  }
}

async function announceRound(serial) {
  const token = ++announcementSerial;
  if (!hasWelcomed) {
    hasWelcomed = true;
    await speak('welcome');
  }
  if (!isBuildAnnouncementCurrent(serial, token)) return;
  if (state.roundIndex === 0) await speak(currentMode().introKey);
  if (!isBuildAnnouncementCurrent(serial, token)) return;
  await speak(config.categories[state.activePart].promptKey);
}

function isBuildAnnouncementCurrent(serial, token) {
  return serial === roundSerial && token === announcementSerial && state.screen === 'build' && state.phase === 'choosing';
}

function renderBuild() {
  clearBuildInteractions();
  const mode = currentMode();
  if (!mode) return;
  updateProgress(els.buildProgress, els.buildProgressStars, false);
  els.sentenceBoard.dataset.parts = String(mode.parts.length);
  els.sentenceSlots.replaceChildren();

  for (const part of mode.parts) {
    const category = config.categories[part];
    const choice = getChoice(part);
    const isActive = state.phase === 'choosing' && state.activePart === part;
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = `sentence-slot category-${CATEGORY_CLASS[part]}${choice ? ' is-filled' : ''}${isActive ? ' is-active' : ''}`;
    slot.dataset.slot = part;
    slot.setAttribute('aria-label', choice ? `${category.spokenLabel}: ${choice.label}. Tap to change.` : `${category.spokenLabel} story spot${isActive ? '. Ready for a picture.' : ''}`);
    const card = image(category.card, '', 'slot-card-art');
    const label = document.createElement('span');
    label.className = 'slot-label';
    label.textContent = choice ? choice.label : category.label;
    slot.append(card);
    if (choice) slot.append(image(choice.art, '', 'slot-choice-art'));
    slot.append(label);

    if (choice || isActive) {
      slot.dataset.target = `slot:${part}`;
      slot.dataset.role = choice ? 'edit' : 'active-slot';
      buildDisposers.push(onTap(slot, () => openPart(part), { feedback: tapFeedback }));
    } else {
      slot.disabled = true;
    }
    els.sentenceSlots.append(slot);
  }

  const readyToShow = state.phase === 'ready';
  els.selectionZone.hidden = readyToShow;
  els.readyZone.hidden = !readyToShow;
  if (readyToShow) {
    els.buildStatus.textContent = `${sentenceText()} Your sentence is ready. Show it, or tap a story piece to change it.`;
    return;
  }

  renderChoicePocket(state.activePart);
}

function renderChoicePocket(part) {
  const category = config.categories[part];
  els.selectionZone.dataset.category = part;
  els.categoryPrompt.className = `category-prompt category-${CATEGORY_CLASS[part]}`;
  els.categoryPromptText.textContent = category.prompt;
  els.pocketArt.src = category.tray;
  els.pocketArt.alt = '';
  els.choiceGrid.replaceChildren();
  els.buildStatus.textContent = `${category.prompt} Tap a picture, or drag it to the glowing ${category.spokenLabel} spot.`;

  const pieces = new Map();
  for (const id of state.choiceOrders[part] || []) {
    const choice = getChoice(part, id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `choice-card category-${CATEGORY_CLASS[part]}${state.selections[part] === id ? ' is-selected' : ''}`;
    button.dataset.target = `choice:${part}:${id}`;
    button.dataset.role = 'choice';
    button.dataset.choiceId = id;
    button.setAttribute('aria-label', choice.label);
    button.append(
      image(category.card, '', 'choice-card-art'),
      image(choice.art, '', 'choice-picture'),
    );
    const label = document.createElement('span');
    label.textContent = choice.label;
    button.append(label);
    els.choiceGrid.append(button);
    pieces.set(id, { el: button, part, choice });
  }

  drag = createDragToSlotDom({
    getPiece: (id) => pieces.get(String(id)),
    root: els.build,
    ghostHost: els.dragLayer,
    slotSelector: '[data-slot]',
    slotPad: 26,
    hoverClass: 'is-drop-hovered',
    ghostClass: 'choice-card dragging',
    canStart: () => state.screen === 'build' && state.phase === 'choosing' && !state.locked,
    onDrop: (piece, info) => chooseCard(piece.part, piece.choice.id, {
      source: 'drag',
      slotPart: info.slot?.dataset.slot || null,
    }),
    onTap: (piece) => chooseCard(piece.part, piece.choice.id, { source: 'tap', slotPart: piece.part }),
    onCancel: () => {
      els.buildStatus.textContent = 'The picture is safely back in its felt pocket.';
    },
  });
  buildDisposers.push(() => {
    drag?.detach();
    drag = null;
  });

  for (const [id, piece] of pieces) {
    const onDown = (event) => {
      tapFeedback(event);
      drag?.begin(event, id);
    };
    const onClick = (event) => {
      if (event.detail === 0) chooseCard(piece.part, piece.choice.id, { source: 'keyboard', slotPart: piece.part });
    };
    piece.el.addEventListener('pointerdown', onDown);
    piece.el.addEventListener('click', onClick);
    buildDisposers.push(() => {
      piece.el.removeEventListener('pointerdown', onDown);
      piece.el.removeEventListener('click', onClick);
    });
  }
}

function chooseCard(part, id, { slotPart = part } = {}) {
  if (state.screen !== 'build' || state.phase !== 'choosing' || state.locked) return false;
  if (part !== state.activePart || slotPart !== part) {
    els.buildStatus.textContent = `That picture stays in its pocket. Put it in the glowing ${config.categories[part].spokenLabel} spot.`;
    return false;
  }
  const choice = getChoice(part, id);
  if (!choice) return false;
  nudger.poke();
  const token = ++announcementSerial;
  state.selections[part] = id;
  const mode = currentMode();
  state.activePart = mode.parts.find((candidate) => !state.selections[candidate]) || null;
  state.phase = state.activePart ? 'choosing' : 'ready';
  state.awaitingInput = true;
  try { sfx.pop(); } catch { /* optional */ }
  renderBuild();
  const spoken = speak(choice.voiceKey, choice.say);
  if (state.phase === 'ready') {
    void spoken.then(() => {
      if (token !== announcementSerial || state.screen !== 'build' || state.phase !== 'ready') return;
      return speak('ready-show');
    });
  }
  return true;
}

function openPart(part) {
  const mode = currentMode();
  if (state.screen !== 'build' || state.locked || !mode?.parts.includes(part)) return false;
  announcementSerial += 1;
  voice.stop();
  state.phase = 'choosing';
  state.activePart = part;
  state.awaitingInput = true;
  renderBuild();
  nudger.arm();
  void speak(config.categories[part].promptKey);
  return true;
}

async function showReveal({ debugPeak = false, forced = false } = {}) {
  await ready;
  if (state.screen !== 'build' && state.screen !== 'reveal') return false;
  const mode = currentMode();
  if (!mode) return false;
  if (!mode.parts.every((part) => state.selections[part])) {
    if (!forced) return false;
    fillDeterministicSentence();
  }

  if (state.screen === 'build') {
    const record = sentenceRecord();
    const prior = state.completed.findIndex((entry) => entry.roundIndex === state.roundIndex);
    if (prior >= 0) state.completed[prior] = record;
    else state.completed.push(record);
    state.phase = 'reveal';
    state.activePart = null;
    state.awaitingInput = true;
    state.locked = false;
    state.revealPeak = Boolean(debugPeak);
    screens.show('reveal');
  } else {
    state.revealPeak = Boolean(debugPeak);
  }

  renderReveal();
  try { sfx.tada(); } catch { /* optional */ }
  void narrateSentence();
  return snapshotState();
}

function fillDeterministicSentence() {
  const mode = currentMode();
  if (!mode) return;
  for (const [index, part] of mode.parts.entries()) {
    const order = state.choiceOrders[part]?.length
      ? state.choiceOrders[part]
      : config.choices[part].map((choice) => choice.id);
    state.selections[part] = order[(state.roundIndex + index) % order.length];
  }
  const previous = state.completed.at(-1)?.combination;
  if (combinationKey() === previous) {
    const first = mode.parts[0];
    const order = state.choiceOrders[first];
    const index = Math.max(0, order.indexOf(state.selections[first]));
    state.selections[first] = order[(index + 1) % order.length];
  }
  state.phase = 'ready';
  state.activePart = null;
}

function renderReveal() {
  const who = getChoice('who');
  const action = getChoice('action');
  const place = getChoice('place');
  const manner = getChoice('manner');
  if (!who || !action || !place) return;

  els.revealStage.className = [
    'reveal-stage',
    'is-performing',
    `action-${action.motion || action.id}`,
    manner ? `manner-${manner.motion || manner.id}` : 'manner-none',
    state.revealPeak ? 'debug-peak' : '',
  ].filter(Boolean).join(' ');
  els.revealPlace.src = place.art;
  els.revealCharacter.src = who.art;
  els.revealAction.src = action.art;
  if (manner) {
    els.revealManner.src = manner.art;
    els.revealManner.hidden = false;
  } else {
    els.revealManner.removeAttribute('src');
    els.revealManner.hidden = true;
  }
  els.revealStage.setAttribute('aria-label', sentenceText());
  renderSentence(els.revealSentenceText, state.selections, currentMode().parts);
  renderCelebration();
  updateProgress(els.revealProgress, els.revealProgressStars, true);
  els.anotherButton.querySelector('span').textContent = state.completed.length >= config.roundsPerSession ? 'See my quilt!' : 'Make another';
  els.anotherButton.setAttribute('aria-label', state.completed.length >= config.roundsPerSession ? 'See my silly story quilt' : 'Make another silly sentence');
  els.revealStatus.textContent = `${sentenceText()} The felt puppets are performing your sentence.`;
}

function renderCelebration() {
  els.celebrationLayer.replaceChildren();
  for (let index = 0; index < 8; index += 1) {
    const star = image('./assets/ui/progress-star.webp', '', 'celebration-star');
    star.style.setProperty('--star-x', `${10 + ((index * 13) % 82)}%`);
    star.style.setProperty('--star-y', `${8 + ((index * 23) % 62)}%`);
    star.style.setProperty('--star-delay', `${(index % 4) * 110}ms`);
    star.style.setProperty('--star-size', `${34 + (index % 3) * 15}px`);
    els.celebrationLayer.append(star);
  }
}

async function narrateSentence() {
  const serial = roundSerial;
  const token = ++announcementSerial;
  const mode = currentMode();
  for (const part of mode.parts) {
    const choice = getChoice(part);
    if (!choice) return false;
    await speak(choice.voiceKey, choice.say);
    if (!isRevealAnnouncementCurrent(serial, token)) return false;
    await timers.wait(130);
  }
  if (!isRevealAnnouncementCurrent(serial, token)) return false;
  await speak(`reveal-${(state.roundIndex % 3) + 1}`);
  return true;
}

function isRevealAnnouncementCurrent(serial, token) {
  return serial === roundSerial && token === announcementSerial && state.screen === 'reveal';
}

function replayReveal() {
  if (state.screen !== 'reveal') return false;
  announcementSerial += 1;
  timers.clearAll();
  voice.stop();
  state.revealPeak = false;
  els.revealStage.classList.remove('is-performing', 'debug-peak');
  void els.revealStage.offsetWidth;
  els.revealStage.classList.add('is-performing');
  try { sfx.sparkle(); } catch { /* optional */ }
  void narrateSentence();
  return true;
}

function editSentence() {
  if (state.screen !== 'reveal') return false;
  const index = state.completed.findIndex((entry) => entry.roundIndex === state.roundIndex);
  if (index >= 0) state.completed.splice(index, 1);
  state.phase = 'choosing';
  state.activePart = currentMode().parts.at(-1);
  state.awaitingInput = true;
  state.locked = false;
  state.revealPeak = false;
  screens.show('build');
  renderBuild();
  nudger.arm();
  void speak('edit-hint');
  return true;
}

function advanceFromReveal() {
  if (state.screen !== 'reveal') return false;
  if (state.completed.length >= config.roundsPerSession) {
    showEnd();
    return true;
  }
  state.roundIndex = state.completed.length;
  screens.show('build');
  startRound();
  return true;
}

function showEnd() {
  announcementSerial += 1;
  timers.clearAll();
  voice.stop();
  state.phase = 'end';
  state.activePart = null;
  state.awaitingInput = true;
  state.locked = false;
  renderQuilt();
  screens.show('end');
  try { sfx.tada(); } catch { /* optional */ }
  els.endStatus.textContent = 'Three silly shows are stitched into your story quilt.';
  void speak('session-complete');
}

function renderQuilt() {
  els.storyQuilt.replaceChildren();
  for (const record of state.completed.slice(0, config.roundsPerSession)) {
    const who = getChoice('who', record.selections.who);
    const action = getChoice('action', record.selections.action);
    const place = getChoice('place', record.selections.place);
    const manner = getChoice('manner', record.selections.manner);
    const card = document.createElement('article');
    card.className = 'quilt-card';
    card.setAttribute('aria-label', record.text);
    card.append(image(config.categories.place.card, '', 'quilt-frame'));

    const scene = document.createElement('div');
    scene.className = 'quilt-scene';
    scene.append(
      image(place.art, '', 'quilt-place'),
      image(action.art, '', 'quilt-action'),
      image(who.art, '', 'quilt-character'),
    );
    if (manner) scene.append(image(manner.art, '', 'quilt-manner'));
    const star = image('./assets/ui/progress-star.webp', '', 'quilt-star');
    const label = document.createElement('div');
    label.className = 'quilt-label';
    label.append(image('./assets/ui/sentence-strip.webp', '', 'quilt-label-art'));
    const copy = document.createElement('p');
    renderSentence(copy, record.selections, record.parts);
    label.append(copy);
    card.append(scene, star, label);
    els.storyQuilt.append(card);
  }
}

function renderSentence(host, selections, parts) {
  host.replaceChildren();
  parts.forEach((part, index) => {
    const choice = getChoice(part, selections[part]);
    if (!choice) return;
    if (index > 0) host.append(document.createTextNode(' '));
    const span = document.createElement('span');
    span.className = `sentence-part part-${CATEGORY_CLASS[part]}`;
    let copy = choice.label;
    if (index === 0) copy = copy.charAt(0).toUpperCase() + copy.slice(1);
    if (index === parts.length - 1) copy += '.';
    span.textContent = copy;
    host.append(span);
  });
}

function sentenceText(selections = state.selections, parts = currentMode()?.parts || []) {
  const words = parts.map((part) => getChoice(part, selections[part])?.label).filter(Boolean);
  if (!words.length) return '';
  const line = words.join(' ');
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
}

function combinationKey() {
  return (currentMode()?.parts || []).map((part) => state.selections[part] || '').join('|');
}

function sentenceRecord() {
  return {
    roundIndex: state.roundIndex,
    modeId: state.modeId,
    parts: [...currentMode().parts],
    selections: { ...state.selections },
    combination: combinationKey(),
    text: sentenceText(),
  };
}

function replayBuildPrompt() {
  if (state.screen !== 'build') return false;
  nudger.poke();
  announcementSerial += 1;
  voice.stop();
  if (state.phase === 'ready') {
    void speak('ready-show');
    return true;
  }
  const category = config.categories[state.activePart];
  if (!category) return false;
  void speak(category.promptKey);
  return true;
}

function handleNudge(count) {
  if (state.screen !== 'build' || state.locked) return;
  if (state.phase === 'ready') {
    els.showButton.classList.add('needs-help');
    timers.after(1300, () => els.showButton.classList.remove('needs-help'));
    void speak(count === 0 ? 'ready-show' : 'edit-hint');
    return;
  }
  els.categoryPrompt.classList.add('needs-help');
  const sample = els.choiceGrid.querySelector('.choice-card');
  if (count > 0) sample?.classList.add('needs-help');
  timers.after(1300, () => {
    els.categoryPrompt.classList.remove('needs-help');
    sample?.classList.remove('needs-help');
  });
  void speak(count === 0 ? config.categories[state.activePart].promptKey : 'drag-hint');
}

function updateProgress(host, starHost, includeCurrent) {
  const done = state.completed.length;
  const current = Math.min(config.roundsPerSession, Math.max(1, includeCurrent ? done : state.roundIndex + 1));
  host.setAttribute('aria-label', `Show ${current} of ${config.roundsPerSession}`);
  starHost.replaceChildren();
  for (let index = 0; index < config.roundsPerSession; index += 1) {
    const star = image('./assets/ui/progress-star.webp', '', `progress-star${index < done ? ' is-earned' : ''}`);
    starHost.append(star);
  }
}

function clearBuildInteractions() {
  if (drag) {
    void drag.cancel();
    drag.detach();
    drag = null;
  }
  for (const dispose of buildDisposers.splice(0)) {
    try { dispose?.(); } catch { /* stale UI cannot strand navigation */ }
  }
  els.dragLayer.replaceChildren();
}

function goHome() {
  roundSerial += 1;
  announcementSerial += 1;
  clearBuildInteractions();
  timers.clearAll();
  nudger.stop();
  voice.stop();
  state.phase = 'splash';
  state.modeId = null;
  state.roundIndex = 0;
  state.activePart = null;
  state.selections = emptySelections();
  state.choiceOrders = {};
  state.completed = [];
  state.awaitingInput = false;
  state.locked = false;
  state.revealPeak = false;
  screens.show('splash');
  renderSplash();
  return snapshotState();
}

function image(src, alt = '', className = '') {
  const node = document.createElement('img');
  node.src = src;
  node.alt = alt;
  if (className) node.className = className;
  return node;
}

function speak(key, fallback) {
  return bgm.duckDuring(voice.say(key, fallback || LINE_FALLBACK[key] || ''), {
    down: 0.16,
    downMs: 100,
    upMs: 300,
  });
}

function snapshotState() {
  return {
    screen: state.screen,
    phase: state.phase,
    modeId: state.modeId,
    roundIndex: state.roundIndex,
    roundsPerSession: config.roundsPerSession,
    activePart: state.activePart,
    selections: { ...state.selections },
    sentence: sentenceText(),
    choiceOrders: cloneOrders(),
    completed: state.completed.map((entry) => ({
      ...entry,
      parts: [...entry.parts],
      selections: { ...entry.selections },
    })),
    awaitingInput: state.awaitingInput,
    locked: state.locked,
    muted: state.muted,
    reducedMotion: game.classList.contains('debug-reduced-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches,
    revealPeak: state.revealPeak,
    seed: seedValue,
  };
}

function layoutSnapshot() {
  const rect = (node) => {
    const box = node?.getBoundingClientRect();
    return box ? { x: box.x, y: box.y, w: box.width, h: box.height } : null;
  };
  return {
    viewport: { width: innerWidth, height: innerHeight },
    orientation: innerWidth >= innerHeight ? 'landscape' : 'portrait',
    screen: state.screen,
    phase: state.phase,
    modeId: state.modeId,
    targets: collectTargets(game),
    sentenceBoard: rect(els.sentenceBoard),
    choicePocket: rect(els.choicePocket),
    revealStage: rect(els.revealStage),
    revealSentence: rect(els.revealSentence),
  };
}

async function debugTap(targetId) {
  const id = String(targetId || '');
  if (id.startsWith('mode:')) return startMode(id.slice(5));
  if (id === 'back' || id === 'reveal-back' || id === 'end-back') return goHome();
  if (id === 'sound') return replayBuildPrompt();
  if (id === 'show') return showReveal();
  if (id === 'replay') return replayReveal();
  if (id === 'edit') return editSentence();
  if (id === 'another') return advanceFromReveal();
  if (id === 'again') return state.modeId ? startMode(state.modeId) : false;
  if (id.startsWith('slot:')) return openPart(id.slice(5));
  const choiceMatch = /^choice:([^:]+):(.+)$/.exec(id);
  if (choiceMatch) return chooseCard(choiceMatch[1], choiceMatch[2], { source: 'debug', slotPart: choiceMatch[1] });
  return false;
}

async function debugWinRound() {
  if (state.screen === 'build') return showReveal({ forced: true, debugPeak: true });
  if (state.screen === 'reveal') return advanceFromReveal();
  return false;
}
