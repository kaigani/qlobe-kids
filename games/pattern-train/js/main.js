import config from '../config.js';
import { createScreens } from '../../../shared/js/screens.js';
import { onTap } from '../../../shared/js/tap.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as bgm from '../../../shared/js/bgm.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { collectTargets, installDebug } from '../../../shared/js/debug-harness.js';

const root = document.querySelector('#game');
const $ = (selector) => root.querySelector(selector);
const allTokenIds = Object.keys(config.tokens);
const validTokens = new Set(allTokenIds);
const timers = createTimers();
const staticDisposers = [];
let dynamicDisposers = [];
const targetHandlers = new Map();

const dom = {
  splashTrain: $('[data-splash-train]'),
  trainStage: $('[data-train-stage]'),
  choices: $('[data-choices]'),
  prompt: $('[data-prompt]'),
  progress: $('[data-progress]'),
  feedback: $('[data-feedback]'),
  sparks: $('[data-sparks]'),
  builderTrain: $('[data-builder-train]'),
  builderPalette: $('[data-builder-palette]'),
  builderFeedback: $('[data-builder-feedback]'),
  builderSparks: $('[data-builder-sparks]'),
  rewardTrain: $('[data-reward-train]'),
  rewardSparks: $('[data-reward-sparks]'),
  whistle: $('[data-target="builder-play"]'),
};

const state = {
  mode: null,
  round: 0,
  misses: 0,
  awaitingInput: false,
  locked: false,
  correct: null,
  choices: [],
  builder: Array(5).fill(null),
  builderSelected: 0,
  playingPattern: false,
  trainRolling: false,
  muted: false,
  seed: 2407,
  rng: mulberry32(2407),
  flow: 0,
};

const narrator = createNarrator({
  announcerParent: root,
  say: (key, text) => bgm.duckDuring(voiceClips.say(key, text), {
    down: 0.2,
    downMs: 100,
    upMs: 300,
  }),
  stop: voiceClips.stop,
});

const screens = createScreens({
  root,
  initial: 'splash',
  voice: narrator,
  onExit: () => {
    state.awaitingInput = false;
    nudger.stop();
    clearDragArtifacts();
  },
});

const nudger = createNudger({
  first: 10500,
  repeat: 12000,
  onNudge: (count) => {
    if (!state.awaitingInput || screens.current !== 'play') return;
    if (count === 0) {
      setFeedback('The glowing wagon is waiting for one more block.');
      void narrator.say('prompt', config.voice.prompt);
      pulseEmptyWagon();
      return;
    }
    void replayKnownPattern(true);
  },
});

function modeConfig(id = state.mode) {
  return config.modes.find((mode) => mode.id === id) || null;
}

function currentRound() {
  const mode = modeConfig();
  return mode && mode.rounds ? mode.rounds[state.round] : null;
}

function tokenConfig(id) {
  return config.tokens[id] || { label: id, voice: id, sound: 'tick' };
}

function clearDynamic() {
  for (const dispose of dynamicDisposers.splice(0)) {
    try { dispose(); } catch { /* stale controls are harmless */ }
  }
  for (const key of [...targetHandlers.keys()]) {
    if (key.startsWith('choice-') || key.startsWith('builder-token-') || key.startsWith('builder-wagon-')) {
      targetHandlers.delete(key);
    }
  }
  clearDragArtifacts();
}

function clearDragArtifacts() {
  document.querySelectorAll('.pt-drag-ghost').forEach((node) => node.remove());
  root.querySelectorAll('.is-lifted, .pt-drop-ready').forEach((node) => {
    node.classList.remove('is-lifted', 'pt-drop-ready');
  });
}

function image(src, className, alt = '') {
  const node = document.createElement('img');
  node.src = src;
  node.alt = alt;
  if (className) node.className = className;
  node.draggable = false;
  return node;
}

function buildTrain(stage, tokens, {
  interactive = false,
  selected = -1,
  seated = -1,
  targetPrefix = 'wagon',
} = {}) {
  stage.replaceChildren();
  const row = document.createElement('div');
  row.className = 'pt-train-row';
  row.append(image(config.assets.locomotive, 'pt-locomotive'));

  tokens.forEach((tokenId, index) => {
    const wagon = document.createElement(interactive ? 'button' : 'div');
    wagon.className = interactive ? 'pt-wagon-button' : 'pt-wagon';
    wagon.dataset.wagonIndex = String(index);
    wagon.dataset.dropIndex = String(index);
    if (interactive) {
      wagon.type = 'button';
      wagon.dataset.target = `${targetPrefix}-${index}`;
      wagon.setAttribute('aria-label', tokenId
        ? `Wagon ${index + 1}, ${tokenConfig(tokenId).label}. Tap to replace it.`
        : `Empty wagon ${index + 1}. Tap to choose it.`);
    }
    if (!tokenId) wagon.classList.add('is-empty');
    if (selected === index) wagon.classList.add('is-selected');
    if (seated === index) wagon.classList.add('is-seated');
    wagon.append(image(config.assets.wagon, 'pt-wagon-art'));
    if (tokenId) {
      wagon.dataset.token = tokenId;
      wagon.append(image(config.assets.tokens[tokenId], 'pt-cargo', tokenConfig(tokenId).label));
    } else {
      const mark = document.createElement('span');
      mark.className = 'pt-wagon-mark';
      mark.textContent = '?';
      mark.setAttribute('aria-hidden', 'true');
      wagon.append(mark);
    }
    row.append(wagon);
  });

  stage.append(row);
  return row;
}

function renderSplashTrain() {
  buildTrain(dom.splashTrain, ['red-triangle', 'blue-square', 'red-triangle', 'blue-square']);
}

function renderProgress() {
  const total = modeConfig()?.rounds?.length || 3;
  dom.progress.replaceChildren();
  for (let index = 0; index < total; index += 1) {
    const star = image(config.assets.effects.star, 'pt-progress-star');
    if (index < state.round) star.classList.add('is-done');
    if (index === state.round) star.classList.add('is-now');
    dom.progress.append(star);
  }
  dom.progress.setAttribute('aria-label', `Round ${Math.min(state.round + 1, total)} of ${total}`);
}

function createChoice(tokenId, targetId, role, choose, dropTargets) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pt-choice';
  button.dataset.target = targetId;
  button.dataset.role = role;
  button.dataset.token = tokenId;
  button.setAttribute('aria-label', tokenConfig(tokenId).label);
  button.append(image(config.assets.tokens[tokenId], '', tokenConfig(tokenId).label));

  const handler = () => choose(tokenId, button);
  targetHandlers.set(targetId, handler);
  dynamicDisposers.push(installTokenGesture(button, {
    onTapChoice: handler,
    dropTargets,
    onDrop: (target) => choose(tokenId, button, Number(target.dataset.dropIndex)),
  }));
  return button;
}

function installTokenGesture(button, { onTapChoice, dropTargets, onDrop }) {
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let grabOffsetX = 0;
  let grabOffsetY = 0;
  let dragging = false;
  let ghost = null;
  let activeDrop = null;
  let suppressUntil = 0;

  const reset = () => {
    pointerId = null;
    dragging = false;
    ghost?.remove();
    ghost = null;
    activeDrop?.classList.remove('pt-drop-ready');
    activeDrop = null;
    button.classList.remove('is-lifted');
  };

  const findDrop = (x, y) => {
    const candidates = typeof dropTargets === 'function' ? dropTargets() : [];
    return candidates.find((node) => {
      const rect = node.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }) || null;
  };

  const onDown = (event) => {
    if (event.isPrimary === false || button.disabled) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    const rect = button.getBoundingClientRect();
    grabOffsetX = event.clientX - (rect.left + rect.width / 2);
    grabOffsetY = event.clientY - (rect.top + rect.height / 2);
    try { button.setPointerCapture(pointerId); } catch { /* capture is optional */ }
    sfx.tick();
  };

  const onMove = (event) => {
    if (event.pointerId !== pointerId) return;
    if (!dragging && Math.hypot(event.clientX - startX, event.clientY - startY) > 10) {
      dragging = true;
      button.classList.add('is-lifted');
      ghost = image(config.assets.tokens[button.dataset.token], 'pt-drag-ghost');
      document.body.append(ghost);
    }
    if (!dragging) return;
    // Preserve where the child grabbed the piece instead of snapping its
    // center under their finger as soon as a drag begins.
    ghost.style.left = `${event.clientX - grabOffsetX}px`;
    ghost.style.top = `${event.clientY - grabOffsetY}px`;
    const nextDrop = findDrop(event.clientX, event.clientY);
    if (nextDrop !== activeDrop) {
      activeDrop?.classList.remove('pt-drop-ready');
      activeDrop = nextDrop;
      activeDrop?.classList.add('pt-drop-ready');
    }
  };

  const onUp = (event) => {
    if (event.pointerId !== pointerId) return;
    suppressUntil = performance.now() + 700;
    const drop = dragging ? (findDrop(event.clientX, event.clientY) || activeDrop) : null;
    const wasDragging = dragging;
    reset();
    if (button.disabled) return;
    if (wasDragging) {
      if (drop) onDrop(drop);
    } else {
      onTapChoice();
    }
  };

  const onCancel = (event) => {
    if (event.pointerId === pointerId) reset();
  };

  const onClick = (event) => {
    if (event.detail > 0 && performance.now() < suppressUntil) {
      event.preventDefault();
      return;
    }
    if (event.detail === 0 && !button.disabled) onTapChoice();
  };

  button.addEventListener('pointerdown', onDown);
  button.addEventListener('pointermove', onMove);
  button.addEventListener('pointerup', onUp);
  button.addEventListener('pointercancel', onCancel);
  button.addEventListener('click', onClick);
  return () => {
    reset();
    button.removeEventListener('pointerdown', onDown);
    button.removeEventListener('pointermove', onMove);
    button.removeEventListener('pointerup', onUp);
    button.removeEventListener('pointercancel', onCancel);
    button.removeEventListener('click', onClick);
  };
}

function renderRound({ seated = false } = {}) {
  clearDynamic();
  const round = currentRound();
  if (!round) return;
  const shown = round.pattern.slice();
  state.correct = shown[shown.length - 1];
  if (!seated) shown[shown.length - 1] = null;
  buildTrain(dom.trainStage, shown, { seated: seated ? shown.length - 1 : -1 });
  // Keep the dock stable while celebrating a correct answer. Re-shuffling
  // here makes the blocks appear to jump at the exact moment the child wins.
  if (!seated || state.choices.length === 0) state.choices = shuffle(round.choices, state.rng);
  dom.choices.replaceChildren();
  state.choices.forEach((tokenId) => {
    const choice = createChoice(
      tokenId,
      `choice-${tokenId}`,
      tokenId === state.correct ? 'correct' : 'wrong',
      chooseDirectedToken,
      () => [...dom.trainStage.querySelectorAll('.is-empty')],
    );
    choice.disabled = seated;
    dom.choices.append(choice);
  });
  dom.prompt.textContent = state.mode === 'actions' ? 'What move comes next?' : 'What comes next?';
  setFeedback('');
  renderProgress();
}

function setFeedback(text, builder = false) {
  const node = builder ? dom.builderFeedback : dom.feedback;
  node.textContent = text;
  node.classList.remove('is-pop');
  if (!text) return;
  void node.offsetWidth;
  node.classList.add('is-pop');
}

function pulseEmptyWagon() {
  const wagon = dom.trainStage.querySelector('.is-empty');
  if (!wagon) return;
  wagon.classList.remove('is-seated');
  void wagon.offsetWidth;
  wagon.classList.add('is-seated');
  timers.after(650, () => wagon.classList.remove('is-seated'));
}

function playTokenSound(tokenId) {
  const name = tokenConfig(tokenId).sound;
  const sound = sfx[name] || sfx.tick;
  try { sound(); } catch { sfx.tick(); }
}

async function playPattern(tokens, stage, ticket = state.flow) {
  const row = stage.querySelector('.pt-train-row');
  if (!row || ticket !== state.flow) return false;
  state.playingPattern = true;
  for (let index = 0; index < tokens.length; index += 1) {
    if (ticket !== state.flow) return false;
    const tokenId = tokens[index];
    if (!tokenId) continue;
    const wagon = row.querySelector(`[data-wagon-index="${index}"]`);
    if (wagon) wagon.dataset.speakingFlow = String(ticket);
    wagon?.classList.add('is-speaking');
    playTokenSound(tokenId);
    const token = tokenConfig(tokenId);
    await narrator.say(token.voice, config.voice[token.voice] || token.label);
    if (wagon?.dataset.speakingFlow === String(ticket)) {
      wagon.classList.remove('is-speaking');
      delete wagon.dataset.speakingFlow;
    }
    if (ticket !== state.flow) return false;
    await timers.wait(120);
  }
  if (ticket === state.flow) state.playingPattern = false;
  return ticket === state.flow;
}

async function rollTrain(stage, ticket = state.flow) {
  const row = stage.querySelector('.pt-train-row');
  if (!row || ticket !== state.flow) return false;
  state.trainRolling = true;
  row.dataset.rollingFlow = String(ticket);
  row.classList.add('is-rolling');
  sfx.honk();
  sfx.motor(1050);
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  await timers.wait(reduced ? 180 : 1120);
  if (row.dataset.rollingFlow === String(ticket)) {
    row.classList.remove('is-rolling');
    delete row.dataset.rollingFlow;
  }
  if (ticket === state.flow) state.trainRolling = false;
  return ticket === state.flow;
}

function spawnSparks(layer, count = 14) {
  layer.replaceChildren();
  for (let index = 0; index < count; index += 1) {
    const spark = image(config.assets.effects.spark, 'pt-spark');
    const x = 18 + state.rng() * 64;
    const y = 48 + state.rng() * 34;
    const size = 38 + state.rng() * 52;
    spark.style.setProperty('--spark-x', `${x}%`);
    spark.style.setProperty('--spark-y', `${y}%`);
    spark.style.setProperty('--spark-size', `${size}px`);
    spark.style.setProperty('--spark-duration', `${650 + state.rng() * 550}ms`);
    spark.style.setProperty('--spark-delay', `${state.rng() * 220}ms`);
    spark.style.setProperty('--spark-drift', `${-80 + state.rng() * 160}px`);
    layer.append(spark);
  }
  timers.after(1800, () => layer.replaceChildren());
}

async function startMode(id) {
  await ready;
  const mode = modeConfig(id);
  if (!mode) return false;
  let ticket = null;
  const started = await screens.start(() => {
    state.mode = id;
    state.round = 0;
    state.misses = 0;
    state.correct = null;
    state.awaitingInput = false;
    state.locked = true;
    ticket = ++state.flow;
    narrator.stop();
    nudger.stop();

    if (id === 'builder') {
      screens.show('builder', { force: screens.current === 'builder' });
      renderBuilder();
    } else {
      screens.show('play', { force: screens.current === 'play' });
      renderRound();
    }
    return true;
  }, { busy: false });

  // The screen-start latch protects only the atomic state/render transition.
  // Narration can last several seconds and must never prevent a child who has
  // backed out from immediately choosing another ride.
  if (!started || ticket === null) return false;
  if (id === 'builder') {
    state.locked = false;
    await narrator.say(mode.introVoice, config.voice[mode.introVoice]);
    return ticket === state.flow;
  }

  await narrator.say(mode.introVoice, config.voice[mode.introVoice]);
  if (ticket !== state.flow) return false;
  await narrator.say('model', config.voice.model);
  if (ticket !== state.flow) return false;
  await playPattern(currentRound().pattern.slice(0, -1), dom.trainStage, ticket);
  if (ticket !== state.flow) return false;
  state.locked = false;
  state.awaitingInput = true;
  nudger.arm();
  await narrator.say('prompt', config.voice.prompt);
  return ticket === state.flow;
}

async function chooseDirectedToken(tokenId, button) {
  if (!state.awaitingInput || state.locked || screens.current !== 'play') return false;
  const isCorrect = tokenId === state.correct;
  state.awaitingInput = false;
  state.locked = true;
  nudger.stop();
  const ticket = ++state.flow;

  if (!isCorrect) {
    state.misses += 1;
    sfx.unpop();
    button?.classList.add('is-wrong');
    setFeedback(state.misses > 1 ? 'Watch the pattern glow, then try again.' : 'Almost! Try another block.');
    await timers.wait(480);
    button?.classList.remove('is-wrong');
    if (ticket !== state.flow) return false;
    if (state.misses > 1) {
      await narrator.say('nudge', config.voice.nudge);
      if (ticket !== state.flow) return false;
      await playPattern(currentRound().pattern.slice(0, -1), dom.trainStage, ticket);
    }
    if (ticket !== state.flow) return false;
    state.locked = false;
    state.awaitingInput = true;
    nudger.arm();
    return false;
  }

  state.misses = 0;
  renderRound({ seated: true });
  spawnSparks(dom.sparks, 16);
  sfx.sparkle();
  const praises = ['correct1', 'correct2', 'correct3'];
  const praiseKey = praises[Math.min(state.round, praises.length - 1)];
  setFeedback(config.voice[praiseKey]);
  await narrator.say(praiseKey, config.voice[praiseKey]);
  if (ticket !== state.flow) return true;
  await playPattern(currentRound().pattern, dom.trainStage, ticket);
  if (ticket !== state.flow) return true;
  await narrator.say('roundComplete', config.voice.roundComplete);
  if (ticket !== state.flow) return true;
  await rollTrain(dom.trainStage, ticket);
  if (ticket !== state.flow) return true;

  state.round += 1;
  if (state.round >= modeConfig().rounds.length) {
    await showReward(ticket);
    return true;
  }

  state.locked = true;
  renderRound();
  await narrator.say('model', config.voice.model);
  if (ticket !== state.flow) return true;
  await playPattern(currentRound().pattern.slice(0, -1), dom.trainStage, ticket);
  if (ticket !== state.flow) return true;
  state.locked = false;
  state.awaitingInput = true;
  nudger.arm();
  await narrator.say('prompt', config.voice.prompt);
  return true;
}

async function replayKnownPattern(withModel = false) {
  if (screens.current !== 'play' || !currentRound()) return false;
  state.awaitingInput = false;
  state.locked = true;
  nudger.stop();
  const ticket = ++state.flow;
  if (withModel) await narrator.say('model', config.voice.model);
  if (ticket !== state.flow) return false;
  await playPattern(currentRound().pattern.slice(0, -1), dom.trainStage, ticket);
  if (ticket !== state.flow) return false;
  state.locked = false;
  state.awaitingInput = true;
  nudger.arm();
  await narrator.say('prompt', config.voice.prompt);
  return true;
}

function loadBuilder() {
  try {
    const saved = JSON.parse(localStorage.getItem(config.storageKey) || '[]');
    if (Array.isArray(saved)) {
      const clean = saved.slice(0, 5).map((id) => validTokens.has(id) ? id : null);
      state.builder = [...clean, ...Array(5).fill(null)].slice(0, 5);
    }
  } catch { /* a corrupt keepsake becomes a fresh train */ }
}

function saveBuilder() {
  try { localStorage.setItem(config.storageKey, JSON.stringify(state.builder)); } catch { /* private mode */ }
}

function renderBuilder() {
  clearDynamic();
  buildTrain(dom.builderTrain, state.builder, {
    interactive: true,
    selected: state.builderSelected,
    targetPrefix: 'builder-wagon',
  });

  dom.builderTrain.querySelectorAll('.pt-wagon-button').forEach((wagon) => {
    const index = Number(wagon.dataset.wagonIndex);
    const id = wagon.dataset.target;
    const handler = () => selectBuilderWagon(index);
    targetHandlers.set(id, handler);
    dynamicDisposers.push(onTap(wagon, handler, { feedback: () => sfx.tick() }));
  });

  dom.builderPalette.replaceChildren();
  modeConfig('builder').palette.forEach((tokenId) => {
    dom.builderPalette.append(createChoice(
      tokenId,
      `builder-token-${tokenId}`,
      'neutral',
      placeBuilderToken,
      () => [...dom.builderTrain.querySelectorAll('[data-drop-index]')],
    ));
  });
}

function selectBuilderWagon(index) {
  if (state.locked || screens.current !== 'builder') return false;
  state.builderSelected = Math.max(0, Math.min(4, index));
  renderBuilder();
  const tokenId = state.builder[state.builderSelected];
  setFeedback(tokenId
    ? `Wagon ${state.builderSelected + 1} has ${tokenConfig(tokenId).label}. Pick a new block if you like.`
    : `Wagon ${state.builderSelected + 1} is ready for a block.`, true);
  return true;
}

function placeBuilderToken(tokenId, _button, dropIndex) {
  if (state.locked || screens.current !== 'builder' || !validTokens.has(tokenId)) return false;
  const firstEmpty = state.builder.findIndex((id) => !id);
  const requested = Number.isInteger(dropIndex) && dropIndex >= 0 && dropIndex < 5 ? dropIndex : null;
  const index = requested ?? (firstEmpty >= 0 ? firstEmpty : state.builderSelected);
  state.builder[index] = tokenId;
  const nextEmpty = state.builder.findIndex((id, candidate) => !id && candidate > index);
  state.builderSelected = nextEmpty >= 0 ? nextEmpty : Math.min(index + 1, 4);
  saveBuilder();
  renderBuilder();
  playTokenSound(tokenId);
  void narrator.say(tokenConfig(tokenId).voice, config.voice[tokenConfig(tokenId).voice]);
  setFeedback(`${tokenConfig(tokenId).label} is on wagon ${index + 1}!`, true);
  return true;
}

function clearBuilder() {
  if (state.locked) return false;
  state.builder = Array(5).fill(null);
  state.builderSelected = 0;
  saveBuilder();
  renderBuilder();
  setFeedback(config.voice.builderClear, true);
  void narrator.say('builderClear', config.voice.builderClear);
  sfx.unpop();
  return true;
}

async function playBuilderPattern() {
  if (state.locked || screens.current !== 'builder') return false;
  const filledTokens = state.builder.filter(Boolean);
  if (filledTokens.length < 2) {
    setFeedback(config.voice.builderNeeds, true);
    pulseBuilderWagons();
    sfx.unpop();
    await narrator.say('builderNeeds', config.voice.builderNeeds);
    return false;
  }

  state.locked = true;
  const ticket = ++state.flow;
  dom.whistle.classList.add('is-playing');
  setFeedback(config.voice.builderPlay, true);
  sfx.honk();
  await narrator.say('builderPlay', config.voice.builderPlay);
  dom.whistle.classList.remove('is-playing');
  if (ticket !== state.flow) return false;
  // Keep null slots so narration and glow stay attached to their real wagons.
  await playPattern(state.builder.slice(), dom.builderTrain, ticket);
  if (ticket !== state.flow) return false;
  spawnSparks(dom.builderSparks, 18);
  sfx.tada();
  await rollTrain(dom.builderTrain, ticket);
  if (ticket !== state.flow) return false;
  state.locked = false;
  setFeedback('Your pattern train is ready for another ride!', true);
  return true;
}

function pulseBuilderWagons() {
  dom.builderTrain.querySelectorAll('.is-empty').forEach((wagon, index) => {
    timers.after(index * 100, () => wagon.classList.add('is-selected'));
    timers.after(650 + index * 100, () => wagon.classList.remove('is-selected'));
  });
}

async function showReward(ticket = state.flow) {
  if (ticket !== state.flow) return false;
  state.awaitingInput = false;
  state.locked = false;
  nudger.stop();
  const completed = modeConfig().rounds.at(-1).pattern;
  screens.show('reward');
  clearDynamic();
  buildTrain(dom.rewardTrain, completed);
  spawnSparks(dom.rewardSparks, 26);
  sfx.tada();
  const key = state.mode === 'actions' ? 'actionComplete' : 'shapeComplete';
  await narrator.say(key, config.voice[key]);
  if (ticket !== state.flow) return false;
  await rollTrain(dom.rewardTrain, ticket);
  return true;
}

function navigate(screen, voiceKey = null) {
  ++state.flow;
  state.awaitingInput = false;
  state.locked = false;
  state.playingPattern = false;
  state.trainRolling = false;
  nudger.stop();
  narrator.stop();
  dom.whistle.classList.remove('is-playing');
  root.querySelectorAll('.is-speaking, .is-rolling').forEach((node) => {
    node.classList.remove('is-speaking', 'is-rolling');
    delete node.dataset.speakingFlow;
    delete node.dataset.rollingFlow;
  });
  clearDynamic();
  screens.show(screen);
  if (voiceKey) void narrator.say(voiceKey, config.voice[voiceKey]);
  return true;
}

function wireTap(id, handler, { sound = true } = {}) {
  const node = root.querySelector(`[data-target="${id}"]`);
  if (!node) return;
  targetHandlers.set(id, handler);
  staticDisposers.push(onTap(node, (event) => {
    nudger.poke();
    return handler(event);
  }, sound ? { feedback: () => sfx.tick() } : {}));
}

wireTap('play', () => navigate('depot', 'depot'));
wireTap('splash-sound', () => narrator.say('welcome', config.voice.welcome));
wireTap('depot-back', () => navigate('splash', 'welcome'));
wireTap('depot-sound', () => narrator.say('depot', config.voice.depot));
wireTap('mode-shapes', () => startMode('shapes'));
wireTap('mode-actions', () => startMode('actions'));
wireTap('mode-builder', () => startMode('builder'));
wireTap('play-back', () => navigate('depot', 'depot'));
wireTap('play-sound', () => replayKnownPattern(true));
wireTap('builder-back', () => navigate('depot', 'depot'));
wireTap('builder-sound', () => narrator.say('builderIntro', config.voice.builderIntro));
wireTap('builder-clear', clearBuilder);
wireTap('builder-play', playBuilderPattern);
wireTap('reward-back', () => navigate('depot', 'depot'));
wireTap('reward-choose', () => navigate('depot', 'depot'));
wireTap('reward-again', () => startMode(state.mode));
targetHandlers.set('home', () => { window.location.href = '../../index.html'; return true; });

const disposeUnlock = installUnlockOnGesture({
  extra: [bgm.unlock],
  onFirst: () => {
    bgm.setVolume(0.14);
    void bgm.play(config.music, { key: 'pattern-train-theme', fadeInMs: 900 });
  },
});
const disposeKiosk = installKioskGuards();

async function boot() {
  renderSplashTrain();
  loadBuilder();
  bgm.preload(config.music);
  const art = collectArtUrls(config.assets);
  await Promise.all([
    preloadImages(art),
    voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
  ]);
  root.dataset.ready = 'true';
  return true;
}

function collectArtUrls(value, result = []) {
  if (typeof value === 'string') {
    if (/\.(?:png|jpe?g|webp|gif)(?:\?|$)/i.test(value)) result.push(value);
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectArtUrls(entry, result));
    return result;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((entry) => collectArtUrls(entry, result));
  }
  return result;
}

const ready = boot();

function snapshot() {
  return {
    screen: screens.current,
    mode: state.mode,
    round: state.round,
    misses: state.misses,
    awaitingInput: state.awaitingInput,
    locked: state.locked,
    correct: state.correct,
    choices: state.choices.slice(),
    builder: state.builder.slice(),
    builderSelected: state.builderSelected,
    playingPattern: state.playingPattern,
    trainRolling: state.trainRolling,
    muted: state.muted,
    seed: state.seed,
  };
}

function debugMute(on = true) {
  state.muted = Boolean(on);
  narrator.setMuted(state.muted);
  voiceClips.setMuted(state.muted);
  sfx.setMuted(state.muted);
  bgm.setMuted(state.muted);
  document.querySelectorAll('audio, video').forEach((node) => { node.muted = state.muted; });
  return state.muted;
}

installDebug({
  gameId: config.id,
  engine: 'custom-dom',
  ready,
  listModes: () => config.modes.map(({ id, title, tagline }) => ({ id, title, tagline })),
  startMode,
  getState: snapshot,
  getTargets: () => collectTargets(screens.el(screens.current) || root),
  tap: async (id) => {
    const handler = targetHandlers.get(id);
    if (!handler) return false;
    return handler();
  },
  winRound: async () => {
    if (state.mode === 'builder') {
      if (state.builder.filter(Boolean).length < 2) {
        state.builder = ['red-triangle', 'blue-square', null, null, null];
        saveBuilder();
        renderBuilder();
      }
      return playBuilderPattern();
    }
    return chooseDirectedToken(state.correct, dom.choices.querySelector('[data-role="correct"]'));
  },
  mute: debugMute,
  home: () => navigate('splash', 'welcome'),
  timers,
  narrator,
  voice: voiceClips,
  sfx,
  onSeed: (rng, seed) => {
    state.rng = rng;
    state.seed = seed;
    if (screens.current === 'play' && currentRound()) renderRound();
  },
  getAudioLog: voiceClips.getAudioLog,
  clearAudioLog: voiceClips.clearAudioLog,
  playPattern: () => state.mode === 'builder' ? playBuilderPattern() : replayKnownPattern(true),
  getBuilderPattern: () => state.builder.slice(),
  clearBuilder,
  getLayout: () => ({
    viewport: { width: window.innerWidth, height: window.innerHeight },
    screen: screens.current,
    train: rectOf(screens.current === 'builder' ? dom.builderTrain : dom.trainStage),
    dock: rectOf(screens.current === 'builder' ? dom.builderPalette : dom.choices),
  }),
});

function rectOf(node) {
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

window.addEventListener('beforeunload', () => {
  ++state.flow;
  nudger.stop();
  narrator.dispose();
  voiceClips.stop();
  bgm.stop({ fadeOutMs: 0 });
  disposeUnlock();
  disposeKiosk();
  clearDynamic();
  staticDisposers.forEach((dispose) => dispose());
}, { once: true });
