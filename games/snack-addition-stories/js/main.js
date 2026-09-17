import config from '../config.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import * as bgm from '../../../shared/js/bgm.js';
import { burstConfetti, tada } from '../../../shared/js/celebrate.js';
import { collectTargets, installDebug } from '../../../shared/js/debug-harness.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { createScreens } from '../../../shared/js/screens.js';
import * as sfx from '../../../shared/js/sfx.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTimers } from '../../../shared/js/timers.js';
import * as voice from '../../../shared/js/voice-clips.js';

const game = document.getElementById('game');
const els = {
  splash: document.getElementById('splash'),
  splashPrompt: document.getElementById('splash-prompt'),
  splashSound: document.getElementById('splash-sound'),
  modeList: document.getElementById('mode-list'),
  storySelect: document.getElementById('story-select'),
  storySelectHeading: document.getElementById('story-select-heading'),
  storyList: document.getElementById('story-list'),
  storyBack: document.getElementById('story-back'),
  storySound: document.getElementById('story-sound'),
  play: document.getElementById('play'),
  playBack: document.getElementById('play-back'),
  playSound: document.getElementById('play-sound'),
  promptPlaque: document.getElementById('prompt-plaque'),
  promptText: document.getElementById('prompt-text'),
  roundProgress: document.getElementById('round-progress'),
  roundStage: document.getElementById('round-stage'),
  playStatus: document.getElementById('play-status'),
  finale: document.getElementById('finale'),
  finaleStage: document.getElementById('finale-stage'),
  finaleBack: document.getElementById('finale-back'),
  finaleSound: document.getElementById('finale-sound'),
  finaleStatus: document.getElementById('finale-status'),
};

const DEFAULT_SEED = 0x51a7add;
const ANSWER_ART = [
  config.assets.ui.answerPink,
  config.assets.ui.answerLavender,
  config.assets.ui.answerMint,
];

let rng = mulberry32(DEFAULT_SEED);
let seedValue = DEFAULT_SEED;
let roundSerial = 0;
let countPulseSerial = 0;
let modeDisposers = [];
let storyDisposers = [];
let renderDisposers = [];
let roundEffectDisposers = [];
let finaleDisposers = [];

const staticDisposers = [];
const timers = createTimers();
const narrator = createNarrator();
const state = {
  screen: 'splash',
  modeId: null,
  themeId: null,
  roundIndex: 0,
  roundId: null,
  roundOrder: [],
  completedRoundIds: [],
  phase: 'choose',
  placedSecond: 0,
  answerOrder: [],
  attempts: 0,
  locked: false,
  selectedFood: config.picnic.foods[0] || null,
  freeLeft: [],
  freeRight: [],
  muted: false,
};

const screens = createScreens({
  root: game,
  initial: 'splash',
  voice: narrator,
  onEnter(name) { state.screen = name; },
  onExit(name) {
    if (name === 'play') clearRound();
  },
});

const nudger = createNudger({
  first: 10500,
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
    void ready.then(() => {
      if (state.screen === 'splash') return speak('welcome');
      return undefined;
    });
  },
}));

staticDisposers.push(onTap(els.splashSound, () => speak('welcome'), { feedback: tapFeedback }));
staticDisposers.push(onTap(els.storyBack, goHome, { feedback: tapFeedback }));
staticDisposers.push(onTap(els.storySound, () => speak('story-select'), { feedback: tapFeedback }));
staticDisposers.push(onTap(els.playBack, handlePlayBack, { feedback: tapFeedback }));
staticDisposers.push(onTap(els.playSound, replayCurrent, { feedback: tapFeedback }));
staticDisposers.push(onTap(els.finaleBack, goHome, { feedback: tapFeedback }));
staticDisposers.push(onTap(els.finaleSound, replayFinale, { feedback: tapFeedback }));

renderSplash();

const ready = Promise.allSettled([
  voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
  preloadImages(imagePaths(config.assets)),
]).then((results) => {
  for (const result of results) {
    if (result.status === 'rejected') console.warn('[snack-addition-stories] optional media failed', result.reason);
  }
  game.classList.remove('is-loading');
  game.classList.add('is-ready');
  return true;
});

installDebug({
  gameId: config.id,
  engine: config.engine,
  ready,
  listModes: () => config.modes.map(({ id, title, subtitle }) => ({ id, title, subtitle })),
  startMode,
  getState: snapshotState,
  getTargets: () => collectTargets(game),
  tap: debugTap,
  winRound: debugWinRound,
  home: goHome,
  timers,
  narrator,
  voice,
  sfx,
  onSeed(next, value) {
    rng = next;
    seedValue = value;
  },
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
  getLayout: layoutSnapshot,
  chooseTheme,
  setReducedMotion(on = true) {
    game.classList.toggle('debug-reduced-motion', Boolean(on));
    return game.classList.contains('debug-reduced-motion');
  },
});

window.addEventListener('pagehide', () => {
  clearRound();
  disposeAll(modeDisposers);
  disposeAll(storyDisposers);
  disposeAll(finaleDisposers);
  narrator.dispose();
  voice.stop();
  bgm.stop({ fadeOutMs: 0 });
  disposeAll(staticDisposers);
}, { once: true });

function imagePaths(value) {
  const paths = [];
  const visit = (entry) => {
    if (typeof entry === 'string' && /\.(?:avif|gif|jpe?g|png|webp)$/i.test(entry)) paths.push(entry);
    else if (Array.isArray(entry)) entry.forEach(visit);
    else if (entry && typeof entry === 'object') Object.values(entry).forEach(visit);
  };
  visit(value);
  return paths;
}

function tapFeedback(event) {
  event?.preventDefault?.();
  try { sfx.tick(); } catch { /* audio is never load-bearing */ }
}

function speak(key, fallback = line(key)) {
  return bgm.duckDuring(narrator.say(key, fallback));
}

function speakSequence(parts) {
  const resolved = parts.map((part) => {
    if (typeof part === 'string') return { key: part, text: line(part) };
    return { ...part, text: part.text ?? line(part.key) };
  });
  return bgm.duckDuring(narrator.saySequence(resolved));
}

function line(key) {
  return config.voice[key] || '';
}

function renderSplash() {
  disposeAll(modeDisposers);
  els.splashPrompt.textContent = config.copy.splashPrompt;
  els.modeList.replaceChildren();

  for (const mode of config.modes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `mode-card mode-${mode.id}`;
    button.dataset.target = `mode:${mode.id}`;
    button.dataset.role = 'mode';
    button.setAttribute('aria-label', `${mode.title}. ${mode.subtitle}`);
    button.innerHTML = `
      <img class="card-plate" src="${config.assets.ui.storyCard}" alt="">
      <span class="card-foods" aria-hidden="true">
        ${mode.previewFoods.map((food, index) => foodImage(food, `preview-food preview-${index}`)).join('')}
      </span>
      <strong>${escapeHtml(mode.title)}</strong>
      <span class="card-subtitle">${escapeHtml(mode.subtitle)}</span>
    `;
    els.modeList.append(button);
    modeDisposers.push(onTap(button, () => startMode(mode.id), { feedback: tapFeedback }));
  }
}

function renderStorySelect() {
  disposeAll(storyDisposers);
  els.storySelectHeading.textContent = config.copy.storySelectPrompt;
  els.storyList.replaceChildren();

  for (const theme of config.themes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `story-card story-${theme.id}`;
    button.dataset.target = `story:${theme.id}`;
    button.dataset.role = 'story';
    button.setAttribute('aria-label', `${theme.title}. ${theme.subtitle}`);
    button.innerHTML = `
      <img class="card-plate" src="${config.assets.ui.storyCard}" alt="">
      <span class="card-foods story-foods" aria-hidden="true">
        ${theme.previewFoods.map((food, index) => foodImage(food, `preview-food preview-${index}`)).join('')}
      </span>
      <strong>${escapeHtml(theme.title)}</strong>
      <span class="card-subtitle">${escapeHtml(theme.subtitle)}</span>
    `;
    els.storyList.append(button);
    storyDisposers.push(onTap(button, () => chooseTheme(theme.id), { feedback: tapFeedback }));
  }
}

async function startMode(modeId) {
  await ready;
  const mode = config.modes.find((candidate) => candidate.id === modeId);
  if (!mode) return false;

  return screens.start(async () => {
    clearRound();
    state.modeId = modeId;
    state.themeId = null;
    state.roundIndex = 0;
    state.roundId = null;
    state.roundOrder = [];
    state.completedRoundIds = [];
    state.phase = 'choose';
    state.locked = false;
    bgm.play(config.music.track, { key: config.id, fadeInMs: 500 });

    if (modeId === 'guided') {
      renderStorySelect();
      screens.show('story-select');
      void speak('story-select');
      return snapshotState();
    }

    if (modeId === 'counter') {
      state.roundOrder = shuffle(config.counterRounds.map(({ id }) => id), rng);
      state.roundIndex = 0;
      startRound();
      return snapshotState();
    }

    if (modeId === 'picnic') {
      state.phase = 'free';
      state.selectedFood = config.picnic.foods[0];
      state.freeLeft = [];
      state.freeRight = [];
      screens.show('play', { force: screens.is('play') });
      renderPicnic();
      armNudge();
      void speak('picnic-intro');
      return snapshotState();
    }

    return false;
  }, { busy: false });
}

async function chooseTheme(themeId) {
  await ready;
  const theme = config.themes.find((candidate) => candidate.id === themeId);
  if (!theme) return false;
  clearRound();
  state.modeId = 'guided';
  state.themeId = themeId;
  state.roundIndex = 0;
  state.roundId = null;
  state.roundOrder = shuffle(theme.rounds.map(({ id }) => id), rng);
  state.completedRoundIds = [];
  startRound();
  return snapshotState();
}

function startRound() {
  clearRound();
  const round = roundById(state.roundOrder[state.roundIndex]);
  if (!round) {
    showFinale();
    return false;
  }

  state.roundId = round.id;
  state.phase = 'staging';
  state.placedSecond = 0;
  state.answerOrder = makeAnswers(round.total);
  state.attempts = 0;
  state.locked = false;
  screens.show('play', { force: screens.is('play') });
  renderRound();
  armNudge();

  const intro = state.modeId === 'guided' ? 'guided-intro' : 'counter-intro';
  if (state.roundIndex === 0) {
    void speakSequence([intro, { key: round.promptKey, gap: 180 }]);
  } else {
    void speak(round.promptKey);
  }
  return true;
}

function renderRound() {
  disposeAll(renderDisposers);
  const round = currentRound();
  if (!round) return;
  const isGuided = state.modeId === 'guided';
  const isAnswer = state.phase === 'answer';
  const isSuccess = state.phase === 'success';
  const firstItems = snackSpans(round.first.food, round.first.count, 'tray-snack first-snack');
  const secondItems = snackSpans(round.second.food, state.placedSecond, 'tray-snack second-snack');
  const equation = isSuccess
    ? `${round.first.count} + ${round.second.count} = ${round.total}`
    : `${round.first.count} + ${round.second.count} = ?`;

  els.promptText.textContent = isAnswer
    ? config.copy.answerPrompt
    : isSuccess
      ? config.copy.successPrompt
      : round.display.replace(' + ', '\n+ ');
  els.roundProgress.hidden = false;
  els.roundProgress.textContent = `${state.roundIndex + 1} / ${state.roundOrder.length}`;
  els.roundProgress.setAttribute('aria-label', `Round ${state.roundIndex + 1} of ${state.roundOrder.length}`);
  els.roundStage.className = `round-stage addition-round phase-${state.phase} mode-${state.modeId}`;
  els.roundStage.innerHTML = `
    <div class="math-board">
      <div class="tray-scene" aria-label="${escapeHtml(round.display)}">
        <img class="tray-art" src="${config.assets.ui.tray}" alt="Picnic serving tray">
        <div class="tray-half tray-left" aria-label="First group of ${round.first.count}">
          ${firstItems}
        </div>
        <span class="live-plus" aria-hidden="true">+</span>
        <div class="tray-half tray-right" aria-label="Second group of ${state.placedSecond}">
          ${secondItems}
        </div>
        ${state.phase === 'staging' ? stagingMarkup(round, isGuided) : ''}
      </div>
      <div class="equation-plaque ${isSuccess ? 'is-solved' : ''}" aria-label="${equationSpeech(round.first.count, round.second.count, isSuccess ? round.total : null)}">
        <img src="${config.assets.ui.equationPlaque}" alt="">
        <p>${equation}</p>
      </div>
      ${isAnswer ? answersMarkup() : ''}
      ${isSuccess ? successMarkup(round) : ''}
    </div>
  `;

  if (state.phase === 'staging') {
    if (isGuided) {
      const staging = els.roundStage.querySelector('[data-target="add-group"]');
      if (staging) renderDisposers.push(onTap(staging, landGuidedGroup, { feedback: tapFeedback }));
    } else {
      for (const button of els.roundStage.querySelectorAll('[data-add-index]')) {
        renderDisposers.push(onTap(button, () => addCounterSnack(Number(button.dataset.addIndex)), { feedback: tapFeedback }));
      }
    }
  }

  if (isAnswer) {
    for (const button of els.roundStage.querySelectorAll('[data-answer]')) {
      renderDisposers.push(onTap(button, () => chooseAnswer(Number(button.dataset.answer)), { feedback: tapFeedback }));
    }
  }

  if (isSuccess) {
    const next = els.roundStage.querySelector('[data-target="next"]');
    if (next) renderDisposers.push(onTap(next, nextRound, { feedback: tapFeedback }));
  }
}

function stagingMarkup(round, isGuided) {
  if (isGuided) {
    return `
      <button class="staging-cluster guided-staging" type="button" data-target="add-group" data-role="add" aria-label="Add ${round.second.count} ${foodName(round.second.food, round.second.count)}">
        <span class="staging-callout">Tap to add</span>
        ${snackImages(round.second.food, round.second.count, 'waiting-snack')}
      </button>
    `;
  }

  return `
    <div class="staging-cluster counter-staging" aria-label="Waiting snacks">
      <span class="staging-callout">Tap each one</span>
      ${Array.from({ length: round.second.count }, (_, index) => {
        if (index < state.placedSecond) return '';
        return `
          <button class="waiting-snack-button" type="button" data-target="add-snack:${index}" data-role="add" data-add-index="${index}" aria-label="Add ${foodName(round.second.food, 1)} ${index + 1}">
            ${foodImage(round.second.food, 'waiting-snack')}
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function answersMarkup() {
  return `
    <div class="answer-dock" role="group" aria-label="Choose the total">
      ${state.answerOrder.map((answer, index) => `
        <button class="answer-card" type="button" data-target="answer:${answer}" data-role="answer" data-answer="${answer}" aria-label="${answer}">
          <img src="${ANSWER_ART[index % ANSWER_ART.length]}" alt="">
          <span>${answer}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function successMarkup(round) {
  return `
    <div class="success-layer" aria-live="polite">
      <div class="success-banner">
        <img src="${config.assets.ui.celebrationBanner}" alt="">
        <strong>That's right!</strong>
      </div>
      <img class="sun-friend sun-cheer" src="${config.assets.characters.sunCheer}" alt="A happy sun celebrates">
      <p class="success-total">${round.total} ${round.total === 1 ? 'snack' : 'snacks'} altogether</p>
      <button class="art-action next-action" type="button" data-target="next" data-role="next" aria-label="${config.copy.next}">
        <img src="${config.assets.ui.actionButton}" alt="">
        <span>${escapeHtml(config.copy.next)}</span>
      </button>
    </div>
  `;
}

async function landGuidedGroup() {
  if (state.locked || state.phase !== 'staging' || state.modeId !== 'guided') return false;
  const round = currentRound();
  const cluster = els.roundStage.querySelector('[data-target="add-group"]');
  if (!round || !cluster) return false;
  state.locked = true;
  nudger.poke();
  cluster.removeAttribute('data-target');
  cluster.classList.add('is-launching');
  try { sfx.whoosh(); } catch { /* audio is never load-bearing */ }
  const serial = roundSerial;
  await timers.wait(reducedMotion() ? 30 : 700);
  if (serial !== roundSerial) return false;
  state.placedSecond = round.second.count;
  state.phase = 'answer';
  state.locked = false;
  renderRound();
  nudger.poke();
  void speak('how-many');
  return true;
}

async function addCounterSnack(index) {
  if (state.locked || state.phase !== 'staging' || state.modeId !== 'counter') return false;
  const round = currentRound();
  if (!round || index < state.placedSecond || index >= round.second.count) return false;
  const button = els.roundStage.querySelector(`[data-add-index="${index}"]`);
  if (!button) return false;
  state.locked = true;
  nudger.poke();
  button.removeAttribute('data-target');
  button.classList.add('is-launching');
  try { sfx.pop(); } catch { /* audio is never load-bearing */ }
  const serial = roundSerial;
  await timers.wait(reducedMotion() ? 30 : 420);
  if (serial !== roundSerial) return false;
  state.placedSecond += 1;
  state.locked = false;
  if (state.placedSecond >= round.second.count) state.phase = 'answer';
  renderRound();
  nudger.poke();
  if (state.phase === 'answer') void speak('how-many');
  else void speak(`count-${round.first.count + state.placedSecond}`);
  return true;
}

function chooseAnswer(value) {
  if (state.locked || state.phase !== 'answer') return false;
  const round = currentRound();
  if (!round) return false;
  nudger.poke();

  if (value !== round.total) {
    state.attempts += 1;
    const button = els.roundStage.querySelector(`[data-answer="${value}"]`);
    button?.classList.remove('is-wrong');
    void button?.offsetWidth;
    button?.classList.add('is-wrong');
    timers.after(620, () => button?.classList.remove('is-wrong'));
    try { sfx.unpop(); } catch { /* audio is never load-bearing */ }
    countTogether();
    return false;
  }

  state.phase = 'success';
  state.locked = true;
  state.completedRoundIds.push(round.id);
  nudger.stop();
  countPulseSerial += 1;
  renderRound();
  els.playStatus.textContent = line(round.successKey);
  void speak(round.successKey);
  tada({ confetti: false });
  if (!reducedMotion()) {
    roundEffectDisposers.push(burstConfetti({
      host: els.play,
      count: 26,
      duration: 2100,
      rng,
    }));
  }
  return true;
}

function countTogether() {
  const serial = ++countPulseSerial;
  const snacks = [...els.roundStage.querySelectorAll('.tray-snack')];
  snacks.forEach((snack, index) => {
    timers.after(250 + index * 390, () => {
      if (serial !== countPulseSerial || state.phase !== 'answer') return;
      snack.classList.add('is-counting');
      try { sfx.tick(); } catch { /* audio is never load-bearing */ }
      timers.after(300, () => snack.classList.remove('is-counting'));
    });
  });
  void speakSequence([
    'count-together',
    ...snacks.map((_, index) => ({ key: `count-${index + 1}`, gap: index === 0 ? 220 : 70 })),
  ]);
}

function nextRound() {
  if (state.phase !== 'success') return false;
  if (state.roundIndex >= state.roundOrder.length - 1) {
    showFinale();
    return true;
  }
  state.roundIndex += 1;
  startRound();
  return true;
}

function renderPicnic() {
  disposeAll(renderDisposers);
  const left = state.freeLeft.length;
  const right = state.freeRight.length;
  const total = left + right;
  const celebrating = state.phase === 'celebrating';
  const selectedName = foodName(state.selectedFood, 1);
  els.promptText.textContent = celebrating
    ? `${total} snacks!\nDelicious addition!`
    : total >= config.picnic.limit
      ? config.copy.picnicFull
      : config.copy.picnicPrompt;
  els.roundProgress.hidden = true;
  els.roundStage.className = `round-stage picnic-round ${celebrating ? 'is-celebrating' : ''}`;
  els.roundStage.innerHTML = `
    <div class="picnic-builder">
      <img class="sun-friend picnic-sun" src="${celebrating ? config.assets.characters.sunCheer : config.assets.characters.sunIdle}" alt="${celebrating ? 'A happy sun celebrates' : 'A friendly sun watches the picnic'}">
      <div class="tray-scene free-tray" aria-label="${left} plus ${right} equals ${total}">
        <img class="tray-art" src="${config.assets.ui.tray}" alt="Picnic serving tray">
        <div class="tray-half tray-left free-half">
          <button class="half-add-hit" type="button" data-target="picnic-left" data-role="add" aria-label="Add ${escapeHtml(selectedName)} to the left side" ${celebrating ? 'disabled' : ''}></button>
          ${freeSnackButtons('left', state.freeLeft)}
        </div>
        <span class="live-plus" aria-label="plus">+</span>
        <div class="tray-half tray-right free-half">
          <button class="half-add-hit" type="button" data-target="picnic-right" data-role="add" aria-label="Add ${escapeHtml(selectedName)} to the right side" ${celebrating ? 'disabled' : ''}></button>
          ${freeSnackButtons('right', state.freeRight)}
        </div>
      </div>
      <div class="equation-plaque free-equation" aria-live="polite" aria-label="${equationSpeech(left, right, total)}">
        <img src="${config.assets.ui.equationPlaque}" alt="">
        <p>${left} + ${right} = ${total}</p>
      </div>
      <div class="snack-palette" role="group" aria-label="Choose a snack">
        ${config.picnic.foods.map((food) => `
          <button class="palette-snack ${food === state.selectedFood ? 'is-selected' : ''}" type="button" data-target="food:${food}" data-role="palette" data-food="${food}" aria-label="Choose ${escapeHtml(foodName(food, 1))}" aria-pressed="${food === state.selectedFood}" ${celebrating ? 'disabled' : ''}>
            ${foodImage(food, '')}
          </button>
        `).join('')}
      </div>
      ${total > 0 ? `
        <button class="art-action celebrate-action" type="button" data-target="celebrate" data-role="celebrate" aria-label="${config.copy.celebrate}" ${celebrating ? 'disabled' : ''}>
          <img src="${config.assets.ui.actionButton}" alt="">
          <span>${escapeHtml(config.copy.celebrate)}</span>
        </button>
      ` : `<p class="empty-invitation">${escapeHtml(config.copy.picnicEmpty)}</p>`}
    </div>
  `;

  if (celebrating) return;
  const leftHit = els.roundStage.querySelector('[data-target="picnic-left"]');
  const rightHit = els.roundStage.querySelector('[data-target="picnic-right"]');
  if (leftHit) renderDisposers.push(onTap(leftHit, () => addPicnicSnack('left'), { feedback: tapFeedback }));
  if (rightHit) renderDisposers.push(onTap(rightHit, () => addPicnicSnack('right'), { feedback: tapFeedback }));
  for (const button of els.roundStage.querySelectorAll('[data-remove-side]')) {
    renderDisposers.push(onTap(button, () => removePicnicSnack(button.dataset.removeSide, Number(button.dataset.removeIndex)), { feedback: tapFeedback }));
  }
  for (const button of els.roundStage.querySelectorAll('[data-food]')) {
    renderDisposers.push(onTap(button, () => selectPicnicFood(button.dataset.food), { feedback: tapFeedback }));
  }
  const celebrate = els.roundStage.querySelector('[data-target="celebrate"]');
  if (celebrate) renderDisposers.push(onTap(celebrate, celebratePicnic, { feedback: tapFeedback }));
}

function freeSnackButtons(side, foods) {
  return foods.map((food, index) => `
    <button class="tray-snack free-snack" type="button" data-target="remove:${side}:${index}" data-role="remove" data-remove-side="${side}" data-remove-index="${index}" style="--i:${index}" aria-label="Remove ${escapeHtml(foodName(food, 1))} from the ${side} side">
      ${foodImage(food, '')}
    </button>
  `).join('');
}

function selectPicnicFood(food) {
  if (state.locked || state.phase !== 'free' || !config.picnic.foods.includes(food)) return false;
  state.selectedFood = food;
  nudger.poke();
  renderPicnic();
  try { sfx.pop(); } catch { /* audio is never load-bearing */ }
  return true;
}

function addPicnicSnack(side) {
  if (state.locked || state.phase !== 'free' || !['left', 'right'].includes(side)) return false;
  const total = state.freeLeft.length + state.freeRight.length;
  if (total >= config.picnic.limit) {
    void speak('picnic-full');
    pulseElement(els.roundStage.querySelector('.free-equation'));
    return false;
  }
  const target = side === 'left' ? state.freeLeft : state.freeRight;
  target.push(state.selectedFood);
  nudger.poke();
  try { sfx.pop(); } catch { /* audio is never load-bearing */ }
  renderPicnic();
  return true;
}

function removePicnicSnack(side, index) {
  if (state.locked || state.phase !== 'free' || !['left', 'right'].includes(side)) return false;
  const target = side === 'left' ? state.freeLeft : state.freeRight;
  if (!Number.isInteger(index) || index < 0 || index >= target.length) return false;
  target.splice(index, 1);
  nudger.poke();
  try { sfx.unpop(); } catch { /* audio is never load-bearing */ }
  renderPicnic();
  return true;
}

async function celebratePicnic() {
  const total = state.freeLeft.length + state.freeRight.length;
  if (state.locked || state.phase !== 'free' || total <= 0) {
    if (total <= 0) void speak('picnic-empty');
    return false;
  }
  state.phase = 'celebrating';
  state.locked = true;
  nudger.stop();
  renderPicnic();
  els.playStatus.textContent = line('picnic-celebrate');
  void speak('picnic-celebrate');
  tada({ confetti: false });
  if (!reducedMotion()) {
    const cancel = burstConfetti({ host: els.play, count: 30, duration: 2100, rng });
    roundEffectDisposers.push(cancel);
  }
  const serial = roundSerial;
  await timers.wait(reducedMotion() ? 260 : 1850);
  if (serial !== roundSerial) return false;
  state.phase = 'free';
  state.locked = false;
  renderPicnic();
  armNudge();
  return true;
}

function showFinale() {
  clearRound();
  disposeAll(finaleDisposers);
  state.phase = 'complete';
  const guided = state.modeId === 'guided';
  const heading = guided ? config.copy.guidedComplete : config.copy.counterComplete;
  const voiceKey = guided ? 'complete-guided' : 'complete-counter';
  els.finaleStage.innerHTML = `
    <img class="finale-title" src="${config.assets.title}" alt="Snack Addition Stories">
    <div class="finale-banner">
      <img src="${config.assets.ui.celebrationBanner}" alt="">
      <strong>${escapeHtml(heading)}</strong>
    </div>
    <img class="finale-sun" src="${config.assets.characters.sunCheer}" alt="A happy sun celebrates">
    <div class="finale-actions">
      <button class="art-action" type="button" data-target="again" data-role="again" aria-label="${config.copy.playAgain}">
        <img src="${config.assets.ui.actionButton}" alt="">
        <span>${escapeHtml(config.copy.playAgain)}</span>
      </button>
      <button class="art-action" type="button" data-target="choose-another" data-role="navigation" aria-label="${config.copy.chooseAnother}">
        <img src="${config.assets.ui.actionButton}" alt="">
        <span>${escapeHtml(config.copy.chooseAnother)}</span>
      </button>
    </div>
  `;
  const again = els.finaleStage.querySelector('[data-target="again"]');
  const choose = els.finaleStage.querySelector('[data-target="choose-another"]');
  finaleDisposers.push(onTap(again, replayMode, { feedback: tapFeedback }));
  finaleDisposers.push(onTap(choose, goHome, { feedback: tapFeedback }));
  screens.show('finale');
  els.finaleStatus.textContent = line(voiceKey);
  void speak(voiceKey);
  tada({ confetti: false });
  if (!reducedMotion()) {
    finaleDisposers.push(burstConfetti({ host: els.finale, count: 34, duration: 2300, rng }));
  }
}

function replayMode() {
  if (state.modeId === 'guided' && state.themeId) return chooseTheme(state.themeId);
  if (state.modeId) return startMode(state.modeId);
  return false;
}

function replayFinale() {
  if (state.screen !== 'finale') return false;
  return speak(state.modeId === 'guided' ? 'complete-guided' : 'complete-counter');
}

function replayCurrent() {
  if (state.screen !== 'play') return false;
  nudger.poke();
  if (state.modeId === 'picnic') {
    const left = state.freeLeft.length;
    const right = state.freeRight.length;
    const total = left + right;
    if (state.phase === 'celebrating') return speak('picnic-celebrate');
    if (total === 0) return speak('picnic-empty');
    return speak(`picnic-equation-${left}-${right}`, equationSpeech(left, right, total));
  }

  const round = currentRound();
  if (!round) return false;
  if (state.phase === 'success') return speak(round.successKey);
  if (state.phase === 'answer') return speak('how-many');
  return speak(round.promptKey);
}

function handleIdleNudge(count) {
  if (state.screen !== 'play' || state.locked || state.phase === 'success' || state.phase === 'celebrating') return;
  if (state.modeId === 'picnic') {
    if (count % 2 === 0) void speak('picnic-intro');
    else pulseElement(els.roundStage.querySelector('.palette-snack.is-selected'));
    return;
  }
  if (state.phase === 'answer') {
    if (count % 2 === 0) void speak('how-many');
    else els.roundStage.querySelectorAll('.answer-card').forEach(pulseElement);
    return;
  }
  if (state.modeId === 'guided') {
    if (count % 2 === 0) void speak('stage-hint');
    else pulseElement(els.roundStage.querySelector('.guided-staging'));
    return;
  }
  if (count % 2 === 0) void speak('counter-hint');
  else pulseElement(els.roundStage.querySelector('.waiting-snack-button'));
}

function armNudge() {
  nudger.arm();
}

function handlePlayBack() {
  if (state.modeId === 'guided') {
    clearRound();
    renderStorySelect();
    screens.show('story-select');
    void speak('story-select');
    return snapshotState();
  }
  return goHome();
}

function goHome() {
  clearRound();
  // Finish the stop before welcome narration can start a ducking tween.
  bgm.stop({ fadeOutMs: 0 });
  state.modeId = null;
  state.themeId = null;
  state.roundIndex = 0;
  state.roundId = null;
  state.roundOrder = [];
  state.completedRoundIds = [];
  state.phase = 'choose';
  state.placedSecond = 0;
  state.answerOrder = [];
  state.attempts = 0;
  state.locked = false;
  state.freeLeft = [];
  state.freeRight = [];
  renderSplash();
  screens.show('splash');
  void speak('welcome');
  return snapshotState();
}

function clearRound() {
  roundSerial += 1;
  countPulseSerial += 1;
  timers.clearAll();
  nudger.stop();
  narrator.stop();
  disposeAll(renderDisposers);
  disposeAll(roundEffectDisposers);
}

function disposeAll(list) {
  for (const dispose of list.splice(0)) {
    try { dispose?.(); } catch { /* teardown must continue */ }
  }
}

function makeAnswers(total) {
  const wrong = shuffle([1, 2, 3, 4, 5, 6].filter((value) => value !== total), rng).slice(0, 2);
  return shuffle([total, ...wrong], rng);
}

function roundById(id) {
  if (!id) return null;
  if (id.startsWith('counter-')) return config.counterRounds.find((round) => round.id === id) || null;
  for (const theme of config.themes) {
    const round = theme.rounds.find((candidate) => candidate.id === id);
    if (round) return round;
  }
  return null;
}

function currentRound() {
  return roundById(state.roundId);
}

function foodName(food, count) {
  const names = config.foodNames[food];
  if (!names) return String(food || 'snack');
  return count === 1 ? names.one : names.many;
}

function foodImage(food, className) {
  return `<img class="${className}" src="${config.assets.foods[food]}" alt="">`;
}

function snackImages(food, count, className) {
  return Array.from({ length: count }, (_, index) => (
    `<img class="${className}" src="${config.assets.foods[food]}" alt="" style="--i:${index}">`
  )).join('');
}

function snackSpans(food, count, className) {
  return Array.from({ length: count }, (_, index) => `
    <span class="${className}" data-count-item style="--i:${index}">
      ${foodImage(food, '')}
    </span>
  `).join('');
}

function equationSpeech(first, second, total) {
  const firstWord = config.numbers[first] || String(first);
  const secondWord = config.numbers[second] || String(second);
  if (total == null) return `${capitalize(firstWord)} plus ${secondWord} equals what?`;
  const totalWord = config.numbers[total] || String(total);
  return `${capitalize(firstWord)} plus ${secondWord} equals ${totalWord}.`;
}

function capitalize(value) {
  const text = String(value || '');
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function pulseElement(element) {
  if (!element) return;
  element.classList.remove('is-nudged');
  void element.offsetWidth;
  element.classList.add('is-nudged');
  timers.after(900, () => element.classList.remove('is-nudged'));
}

function reducedMotion() {
  return game.classList.contains('debug-reduced-motion')
    || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function snapshotState() {
  const round = currentRound();
  return {
    ...state,
    roundOrder: [...state.roundOrder],
    completedRoundIds: [...state.completedRoundIds],
    answerOrder: [...state.answerOrder],
    freeLeft: [...state.freeLeft],
    freeRight: [...state.freeRight],
    seed: seedValue,
    total: state.modeId === 'picnic'
      ? state.freeLeft.length + state.freeRight.length
      : round?.total ?? 0,
  };
}

function layoutSnapshot() {
  return {
    viewport: { width: innerWidth, height: innerHeight },
    orientation: innerWidth >= innerHeight ? 'landscape' : 'portrait',
    screen: state.screen,
    modeId: state.modeId,
    phase: state.phase,
    prompt: rectJson(els.promptPlaque),
    stage: rectJson(els.roundStage),
    tray: rectJson(els.roundStage.querySelector('.tray-scene')),
    equation: rectJson(els.roundStage.querySelector('.equation-plaque')),
    answers: rectJson(els.roundStage.querySelector('.answer-dock')),
    targets: collectTargets(game),
  };
}

function rectJson(element) {
  if (!element || element.closest('[hidden]')) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(rect.x * 100) / 100,
    y: Math.round(rect.y * 100) / 100,
    w: Math.round(rect.width * 100) / 100,
    h: Math.round(rect.height * 100) / 100,
  };
}

async function debugTap(id) {
  if (id?.startsWith('mode:')) return startMode(id.slice(5));
  if (id?.startsWith('story:')) return chooseTheme(id.slice(6));
  if (id === 'add-group') return landGuidedGroup();
  if (id?.startsWith('add-snack:')) return addCounterSnack(Number(id.slice(10)));
  if (id?.startsWith('answer:')) return chooseAnswer(Number(id.slice(7)));
  if (id?.startsWith('food:')) return selectPicnicFood(id.slice(5));
  if (id === 'picnic-left') return addPicnicSnack('left');
  if (id === 'picnic-right') return addPicnicSnack('right');
  if (id?.startsWith('remove:')) {
    const [, side, index] = id.split(':');
    return removePicnicSnack(side, Number(index));
  }
  if (id === 'celebrate') return celebratePicnic();
  if (id === 'next') return nextRound();
  if (id === 'play-back') return handlePlayBack();
  if (id === 'story-back' || id === 'finale-back') return goHome();
  if (id === 'play-sound') return replayCurrent();
  if (id === 'story-sound') return speak('story-select');
  if (id === 'splash-sound') return speak('welcome');
  if (id === 'finale-sound') return replayFinale();
  if (id === 'again') return replayMode();
  if (id === 'choose-another') return goHome();
  const node = [...game.querySelectorAll('[data-target]')]
    .find((candidate) => candidate.dataset.target === id && !candidate.closest('[hidden]'));
  if (!node || node.disabled) return false;
  node.click();
  await Promise.resolve();
  return snapshotState();
}

async function debugWinRound() {
  if (state.screen === 'story-select') {
    const theme = config.themes[0];
    if (!theme) return false;
    await chooseTheme(theme.id);
  }
  if (state.modeId === 'picnic') {
    if (state.freeLeft.length + state.freeRight.length === 0) addPicnicSnack('left');
    return celebratePicnic();
  }
  if (state.phase === 'staging' && state.modeId === 'guided') await landGuidedGroup();
  while (state.phase === 'staging' && state.modeId === 'counter') {
    await addCounterSnack(state.placedSecond);
  }
  const round = currentRound();
  if (state.phase === 'answer' && round) return chooseAnswer(round.total);
  return state.phase === 'success';
}
