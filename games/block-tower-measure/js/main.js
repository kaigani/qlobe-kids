import config from '../config.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import { installUnlockOnGesture, installKioskGuards, unlockAll } from '../../../shared/js/audio-unlock.js';
import { createScreens } from '../../../shared/js/screens.js';
import { renderModeCards } from '../../../shared/js/mode-select.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';

const game = document.getElementById('game');
const PAPER_PALETTE = ['#f16b4d', '#f6bb2c', '#159ba4', '#8db83e', '#7052a7', '#fff0c9'];

const state = {
  screen: 'splash',
  mode: null,
  phase: 'choose',
  roundIndex: 0,
  rounds: [],
  towerHeight: 0,
  targetHeight: 0,
  compareCase: null,
  awaitingInput: true,
  transition: false,
  robotRevealed: false,
  attempts: 0,
  promptKey: 'welcome',
  seed: 42,
  muted: false,
};

let rng = mulberry32(state.seed);
let lines = {};
let roundDisposers = [];
let modeCards = null;
let dragCleanup = null;
let cancelConfetti = null;
let speechToken = 0;

const timers = createTimers();
const allArt = [
  config.assets.background,
  config.assets.title,
  config.assets.robot,
  config.assets.ruler,
  config.assets.promptPanel,
  config.assets.towerMat,
  config.assets.star,
  config.assets.button,
  config.assets.modeCard,
  ...config.assets.blocks,
];

game.innerHTML = `
  <img class="world-backdrop" src="${config.assets.background}" alt="" draggable="false" />
  <section class="game-screen splash-screen" data-qk-screen="splash">
    <div class="splash-content">
      <img class="title-lockup" src="${config.assets.title}" alt="Block Tower Measure" draggable="false" />
      <div class="splash-hero" aria-hidden="true">
        <div class="hero-tower hero-tower-short"></div>
        <img class="hero-robot" src="${config.assets.robot}" alt="" draggable="false" />
        <div class="hero-tower hero-tower-tall"></div>
      </div>
      <div class="mode-grid" aria-label="Choose a tower game"></div>
    </div>
  </section>
  <section class="game-screen play-screen" data-qk-screen="play" hidden>
    <div class="play-content"></div>
  </section>
  <section class="game-screen end-screen" data-qk-screen="end" hidden>
    <div class="end-content"></div>
  </section>
  <div class="visually-hidden" aria-live="polite" aria-atomic="true" id="btm-live"></div>
`;

const els = {
  splash: game.querySelector('[data-qk-screen="splash"]'),
  play: game.querySelector('[data-qk-screen="play"]'),
  end: game.querySelector('[data-qk-screen="end"]'),
  playContent: game.querySelector('.play-content'),
  endContent: game.querySelector('.end-content'),
  modeGrid: game.querySelector('.mode-grid'),
  live: game.querySelector('#btm-live'),
};

const homeButton = hudButton('home', () => { window.location.href = '../../'; });
homeButton.classList.add('qk-hud-top-left');
homeButton.dataset.target = 'home';
els.splash.append(homeButton);

const splashSound = hudButton('sound', soundDebounce(() => speak('welcome'), 650));
splashSound.classList.add('qk-hud-top-right');
splashSound.dataset.target = 'sound';
els.splash.append(splashSound);

const playBack = hudButton('back', () => showSplash({ announce: true }));
playBack.classList.add('qk-hud-top-left');
playBack.dataset.target = 'back';
els.play.append(playBack);

const playSound = hudButton('sound', soundDebounce(() => repeatPrompt(), 650));
playSound.classList.add('qk-hud-top-right');
playSound.dataset.target = 'sound';
els.play.append(playSound);

const endBack = hudButton('back', () => showSplash({ announce: true }));
endBack.classList.add('qk-hud-top-left');
endBack.dataset.target = 'back';
els.end.append(endBack);

const endSound = hudButton('sound', soundDebounce(() => repeatPrompt(), 650));
endSound.classList.add('qk-hud-top-right');
endSound.dataset.target = 'sound';
els.end.append(endSound);

const screens = createScreens({
  screens: { splash: els.splash, play: els.play, end: els.end },
  initial: 'splash',
  root: game,
  voice,
});

const nudger = createNudger({
  first: 10500,
  repeat: 10500,
  onNudge: (index) => {
    if (state.screen !== 'play' || !state.awaitingInput) return;
    const key = state.mode === 'compare'
      ? 'idle-compare'
      : state.mode === 'robot' ? 'idle-robot' : 'idle-build';
    if (index === 0) speak(key, { remember: false });
    const target = game.querySelector(
      state.mode === 'compare' ? '.tower-choice' : state.mode === 'robot' ? '.block-source, .wake-button' : '.block-source',
    );
    target?.classList.remove('hint-pulse');
    requestAnimationFrame(() => target?.classList.add('hint-pulse'));
  },
});

const ready = Promise.all([
  voice.init('./assets/audio/manifest.json', './data/lines.json', {}),
  fetch('./data/lines.json')
    .then((response) => (response.ok ? response.json() : {}))
    .then((value) => { lines = value || {}; }, () => { lines = {}; }),
  preloadImages(allArt),
]).then(() => true);

installUnlockOnGesture();
installKioskGuards();
renderHeroTowers();
renderModeChooser();

function announce(text) {
  if (!els.live) return;
  els.live.textContent = '';
  requestAnimationFrame(() => { els.live.textContent = text || ''; });
}

function speak(key, { remember = true, preserveSequence = false } = {}) {
  const text = lines[key] || '';
  if (!preserveSequence) speechToken += 1;
  if (remember) state.promptKey = key;
  announce(text);
  return voice.say(key, text);
}

async function speakSequence(keys, finalPrompt = keys.at(-1)) {
  const token = ++speechToken;
  state.promptKey = finalPrompt;
  for (const key of keys) {
    if (token !== speechToken) return;
    await speak(key, { remember: false, preserveSequence: true });
  }
}

function stopSpeech() {
  speechToken += 1;
  voice.stop();
}

function repeatPrompt() {
  return speak(state.promptKey || 'welcome');
}

function playSfx(name) {
  if (state.muted) return;
  const fn = sfx[name];
  if (typeof fn === 'function') {
    try { fn(); } catch { /* sound is never load-bearing */ }
  }
}

function clearRound() {
  for (const dispose of roundDisposers.splice(0)) {
    try { dispose(); } catch { /* continue teardown */ }
  }
  if (dragCleanup) dragCleanup();
  dragCleanup = null;
  nudger.stop();
  timers.clearAll();
  if (cancelConfetti) cancelConfetti();
  cancelConfetti = null;
}

function showSplash({ announce: shouldAnnounce = false } = {}) {
  clearRound();
  stopSpeech();
  state.screen = 'splash';
  state.mode = null;
  state.phase = 'choose';
  state.rounds = [];
  state.roundIndex = 0;
  state.towerHeight = 0;
  state.targetHeight = 0;
  state.compareCase = null;
  state.robotRevealed = false;
  state.attempts = 0;
  state.awaitingInput = true;
  state.transition = false;
  screens.show('splash');
  renderModeChooser();
  if (shouldAnnounce) speak('back');
  else announce('');
}

function renderHeroTowers() {
  game.querySelector('.hero-tower-short').innerHTML = miniTower(2, 0);
  game.querySelector('.hero-tower-tall').innerHTML = miniTower(4, 2);
}

function miniTower(height, offset = 0) {
  return Array.from({ length: height }, (_, index) => {
    const art = config.assets.blocks[(index + offset) % config.assets.blocks.length];
    return `<img src="${art}" alt="" draggable="false" />`;
  }).join('');
}

function renderModeChooser() {
  modeCards?.dispose();
  modeCards = renderModeCards({
    host: els.modeGrid,
    modes: config.modes,
    skin: false,
    cardClass: 'paper-mode-card',
    showTitle: false,
    feedback: (event) => {
      event.preventDefault();
      unlockAll();
      playSfx('pop');
    },
    decorate(button, mode) {
      const art = document.createElement('span');
      art.className = `mode-preview mode-preview-${mode.id}`;
      art.setAttribute('aria-hidden', 'true');
      if (mode.id === 'robot') {
        art.innerHTML = `<img class="mode-robot" src="${config.assets.robot}" alt="" draggable="false" />`;
      } else if (mode.id === 'compare') {
        art.innerHTML = `<span class="mini-pair"><span class="mini-tower">${miniTower(2, 0)}</span><span class="mini-tower">${miniTower(4, 2)}</span></span>`;
      } else {
        art.innerHTML = `<span class="mini-single">${miniTower(3, 1)}</span>`;
      }
      const title = document.createElement('span');
      title.className = 'mode-name';
      title.textContent = mode.title;
      button.append(art, title);
    },
    onPick: (id) => screens.start(() => startMode(id), { busy: false }),
  });
}

async function startMode(modeId) {
  await ready;
  clearRound();
  stopSpeech();
  unlockAll();
  const mode = config.modes.find((entry) => entry.id === modeId) || config.modes[0];
  state.screen = 'play';
  state.mode = mode.id;
  state.phase = 'intro';
  state.roundIndex = 0;
  state.attempts = 0;
  state.transition = false;
  state.robotRevealed = false;
  state.towerHeight = 0;
  state.targetHeight = 0;
  state.compareCase = null;
  state.awaitingInput = false;
  screens.show('play', { force: screens.is('play') });

  if (mode.id === 'build') {
    const possible = mode.heights.filter((height) => height !== 2);
    state.rounds = [2, ...shuffle(possible, rng).slice(0, Math.max(0, mode.rounds - 1))];
    beginBuildRound();
    speakSequence(['build-intro', `build-${state.targetHeight}`], `build-${state.targetHeight}`);
  } else if (mode.id === 'compare') {
    state.rounds = shuffle(mode.cases, rng);
    beginCompareRound();
    speakSequence(['compare-intro', `find-${state.compareCase.relation}`], `find-${state.compareCase.relation}`);
  } else {
    state.rounds = [null];
    state.towerHeight = 2;
    state.targetHeight = 0;
    state.phase = 'build';
    state.awaitingInput = true;
    renderRobotWorkshop();
    speak('robot-intro');
  }
}

function progressMarkup(total, done) {
  return `<div class="paper-progress" aria-label="Round ${Math.min(done + 1, total)} of ${total}">
    ${Array.from({ length: total }, (_, index) => `<img src="${config.assets.star}" alt="" class="progress-star${index < done ? ' is-earned' : index === done ? ' is-current' : ''}" draggable="false" />`).join('')}
  </div>`;
}

function promptMarkup(text, badge = '') {
  const badgeMarkup = badge === 'star'
    ? `<img class="prompt-badge prompt-badge-art" src="${config.assets.star}" alt="" draggable="false" />`
    : badge === 'ruler'
      ? `<img class="prompt-badge prompt-badge-art prompt-badge-ruler" src="${config.assets.ruler}" alt="" draggable="false" />`
      : badge ? `<span class="prompt-badge" aria-hidden="true">${badge}</span>` : '';
  return `<header class="paper-prompt">
    <div class="prompt-copy">${text}</div>
    ${badgeMarkup}
  </header>`;
}

function towerMarkup(height, {
  id = '', offset = 0, interactive = false, topRemovable = false, correct = false, showMeasure = true,
} = {}) {
  const blocks = Array.from({ length: height }, (_, index) => {
    const src = config.assets.blocks[(index + offset) % config.assets.blocks.length];
    const isTop = index === height - 1;
    if (interactive && topRemovable && isTop) {
      return `<span class="tower-block tower-block-interactive"><img src="${src}" alt="" draggable="false" /><button class="tower-block-button" type="button" data-target="${id || 'remove-top'}" aria-label="Remove the top block"></button></span>`;
    }
    return `<img class="tower-block" src="${src}" alt="" draggable="false" />`;
  }).join('');
  return `<div class="tower-stack-area" aria-hidden="${interactive ? 'false' : 'true'}">
    <div class="tower-visible${correct ? ' is-correct' : ''}">
      ${blocks || '<span class="tower-placeholder"></span>'}
      ${height && showMeasure ? '<span class="measure-line" aria-hidden="true"></span>' : ''}
    </div>
  </div>`;
}

function beginBuildRound() {
  state.targetHeight = Number(state.rounds[state.roundIndex]) || 2;
  state.towerHeight = 0;
  state.phase = 'build';
  state.awaitingInput = true;
  state.transition = false;
  state.attempts = 0;
  renderBuildRound();
}

function renderBuildRound() {
  clearRound();
  state.screen = 'play';
  const done = state.phase === 'measured';
  const prompt = done ? `You measured ${state.targetHeight} blocks!` : `Build ${state.targetHeight} blocks tall`;
  els.playContent.innerHTML = `
    <div class="play-shell build-shell">
      ${promptMarkup(prompt, String(state.targetHeight))}
      ${progressMarkup(state.rounds.length, state.roundIndex)}
      <div class="build-workspace">
        <div class="measure-kit" aria-hidden="true"><img src="${config.assets.ruler}" alt="" draggable="false" /></div>
        <div class="single-tower-zone${done ? ' is-measured' : ''}" data-drop-zone>
          <img class="tower-mat" src="${config.assets.towerMat}" alt="" draggable="false" />
          ${towerMarkup(state.towerHeight, { id: 'remove-top', interactive: true, topRemovable: !done })}
          <div class="height-label" aria-label="${state.towerHeight} blocks tall">${state.towerHeight}</div>
        </div>
        ${done ? measuredPanel() : blockSourceMarkup(state.towerHeight)}
      </div>
    </div>`;

  if (done) {
    bindTap('.next-button', 'next', advanceBuildRound, 'sparkle');
    cancelConfetti = burstConfetti({ host: els.play, count: 26, palette: PAPER_PALETTE, duration: 1900, rng });
    return;
  }

  const top = els.playContent.querySelector('[data-target="remove-top"]');
  if (top) roundDisposers.push(onTap(top, removeBlock, { feedback: () => playSfx('unpop') }));
  const source = els.playContent.querySelector('.block-source');
  dragCleanup = attachBlockSource(source, () => addBuildBlock(), els.playContent.querySelector('[data-drop-zone]'));
  nudger.arm();
}

function blockSourceMarkup(height) {
  const next = config.assets.blocks[height % config.assets.blocks.length];
  const behindA = config.assets.blocks[(height + 1) % config.assets.blocks.length];
  const behindB = config.assets.blocks[(height + 2) % config.assets.blocks.length];
  return `<button class="block-source" type="button" data-target="add-block" aria-label="Add a paper block">
    <span class="loose-blocks" aria-hidden="true">
      <img src="${behindB}" alt="" draggable="false" />
      <img src="${behindA}" alt="" draggable="false" />
      <img class="next-block" src="${next}" alt="" draggable="false" />
    </span>
  </button>`;
}

function measuredPanel() {
  return `<div class="round-result" role="status">
    <img class="result-star" src="${config.assets.star}" alt="" draggable="false" />
    <button class="paper-action next-button" type="button">NEXT</button>
  </div>`;
}

function addBuildBlock() {
  if (!state.awaitingInput || state.towerHeight >= state.targetHeight) return;
  nudger.poke();
  state.towerHeight += 1;
  playSfx('pop');
  if (state.towerHeight >= state.targetHeight) {
    state.awaitingInput = false;
    state.phase = 'measured';
    renderBuildRound();
    speak(`measured-${state.targetHeight}`);
    playSfx('sparkle');
  } else {
    renderBuildRound();
  }
}

function removeBlock() {
  if (!state.awaitingInput || state.towerHeight <= 0) return;
  state.towerHeight -= 1;
  playSfx('unpop');
  renderBuildRound();
}

function advanceBuildRound() {
  if (state.transition) return;
  state.transition = true;
  if (state.roundIndex + 1 >= state.rounds.length) {
    finishMode();
    return;
  }
  state.roundIndex += 1;
  beginBuildRound();
  speak(`build-${state.targetHeight}`);
}

function beginCompareRound() {
  state.compareCase = { ...state.rounds[state.roundIndex] };
  state.phase = 'compare';
  state.awaitingInput = true;
  state.transition = false;
  state.attempts = 0;
  renderCompareRound();
}

function renderCompareRound() {
  clearRound();
  state.screen = 'play';
  const item = state.compareCase;
  const success = state.phase === 'success';
  const prompt = success
    ? successText(item.relation)
    : item.relation === 'same' ? 'Which towers are the same height?' : `Which tower is ${item.relation}?`;
  els.playContent.innerHTML = `
    <div class="play-shell compare-shell${success ? ' has-success' : ''}">
      ${promptMarkup(prompt, success ? 'star' : 'ruler')}
      ${progressMarkup(state.rounds.length, state.roundIndex)}
      <div class="compare-workspace">
        ${towerChoiceMarkup('left', item.left, 0, success)}
        <div class="compare-ruler" aria-hidden="true"><img src="${config.assets.ruler}" alt="" draggable="false" /></div>
        ${towerChoiceMarkup('right', item.right, 2, success)}
      </div>
      ${success ? `<div class="compare-success">${measuredPanel()}</div>` : ''}
    </div>`;

  if (success) {
    bindTap('.next-button', 'next', advanceCompareRound, 'sparkle');
    cancelConfetti = burstConfetti({ host: els.play, count: 30, palette: PAPER_PALETTE, duration: 2000, rng });
    return;
  }

  bindTap('[data-side="left"]', 'tower-left', () => answerCompare('left'), 'whoosh');
  bindTap('[data-side="right"]', 'tower-right', () => answerCompare('right'), 'whoosh');
  nudger.arm();
}

function towerChoiceMarkup(side, height, offset, success) {
  const correct = success && isCorrectSide(side);
  return `<button class="tower-choice${correct ? ' is-correct' : ''}" type="button" data-side="${side}" data-target="tower-${side}" aria-label="${side} tower, ${height} blocks tall" ${success ? 'disabled' : ''}>
    <span class="choice-stack">
      ${towerMarkup(height, { offset, correct, showMeasure: false })}
      <span class="compare-height-guide compare-height-guide-${side} guide-height-${height}" aria-hidden="true"></span>
    </span>
    <span class="count-plate"><strong>${height}</strong><span>blocks</span></span>
  </button>`;
}

function successText(relation) {
  if (relation === 'same') return 'Same height!';
  return relation === 'taller' ? 'That tower is taller!' : 'That tower is shorter!';
}

function isCorrectSide(side) {
  const { left, right, relation } = state.compareCase;
  if (relation === 'same') return left === right;
  if (relation === 'taller') return side === (left > right ? 'left' : 'right');
  return side === (left < right ? 'left' : 'right');
}

function answerCompare(side) {
  if (!state.awaitingInput || state.transition) return;
  nudger.poke();
  if (!isCorrectSide(side)) {
    state.attempts += 1;
    const choice = els.playContent.querySelector(`[data-side="${side}"]`);
    choice?.classList.remove('gentle-wobble');
    requestAnimationFrame(() => choice?.classList.add('gentle-wobble'));
    els.playContent.querySelectorAll('.compare-height-guide').forEach((guide) => {
      guide.classList.remove('replay-guide');
      void guide.offsetWidth;
      guide.classList.add('replay-guide');
    });
    playSfx('boing');
    speak('gentle-retry', { remember: false });
    return;
  }
  state.awaitingInput = false;
  state.phase = 'success';
  renderCompareRound();
  playSfx('sparkle');
  speak(`success-${state.compareCase.relation}`);
}

function advanceCompareRound() {
  if (state.transition) return;
  state.transition = true;
  if (state.roundIndex + 1 >= state.rounds.length) {
    finishMode();
    return;
  }
  state.roundIndex += 1;
  beginCompareRound();
  speak(`find-${state.compareCase.relation}`);
}

function renderRobotWorkshop() {
  clearRound();
  state.screen = 'play';
  if (state.robotRevealed) {
    renderRobotReveal();
    return;
  }
  state.phase = 'build';
  state.awaitingInput = true;
  const canWake = state.towerHeight >= 2;
  els.playContent.innerHTML = `
    <div class="play-shell robot-shell">
      ${promptMarkup('Build a robot tower', String(state.towerHeight))}
      <div class="robot-workspace">
        <div class="measure-kit" aria-hidden="true"><img src="${config.assets.ruler}" alt="" draggable="false" /></div>
        <div class="single-tower-zone" data-drop-zone>
          <img class="tower-mat" src="${config.assets.towerMat}" alt="" draggable="false" />
          ${towerMarkup(state.towerHeight, { id: 'remove-top', interactive: true, topRemovable: state.towerHeight > 2 })}
          <div class="height-label" aria-label="${state.towerHeight} blocks tall">${state.towerHeight}</div>
        </div>
        <div class="robot-controls">
          ${state.towerHeight < 6 ? blockSourceMarkup(state.towerHeight) : '<div class="max-height" aria-label="Maximum height">6</div>'}
          <button class="paper-action wake-button" type="button" data-target="wake-robot" ${canWake ? '' : 'disabled'}>
            <img src="${config.assets.robot}" alt="" draggable="false" /><span>WAKE!</span>
          </button>
        </div>
      </div>
    </div>`;

  const top = els.playContent.querySelector('[data-target="remove-top"]');
  if (top) roundDisposers.push(onTap(top, removeRobotBlock, { feedback: () => playSfx('unpop') }));
  const source = els.playContent.querySelector('.block-source');
  if (source) dragCleanup = attachBlockSource(source, addRobotBlock, els.playContent.querySelector('[data-drop-zone]'));
  bindTap('.wake-button:not(:disabled)', 'wake-robot', revealRobot, 'sparkle');
  nudger.arm();
}

function addRobotBlock() {
  if (!state.awaitingInput || state.towerHeight >= 6) return;
  state.towerHeight += 1;
  playSfx('pop');
  renderRobotWorkshop();
  if (state.towerHeight === 2) speak('robot-ready', { remember: false });
}

function removeRobotBlock() {
  if (!state.awaitingInput || state.towerHeight <= 2) return;
  state.towerHeight -= 1;
  playSfx('unpop');
  renderRobotWorkshop();
}

function revealRobot() {
  if (!state.awaitingInput || state.towerHeight < 2) return false;
  state.awaitingInput = false;
  state.robotRevealed = true;
  state.phase = 'robot';
  renderRobotReveal();
  speak('robot-celebrate');
  playSfx('tada');
  return true;
}

function renderRobotReveal() {
  clearRound();
  els.playContent.innerHTML = `
    <div class="play-shell robot-reveal-shell">
      ${promptMarkup(`You built ${state.towerHeight} blocks! Robot awake!`, 'star')}
      <div class="robot-reveal" role="status">
        <img class="reveal-star reveal-star-left" src="${config.assets.star}" alt="" draggable="false" />
        <img class="revealed-robot" src="${config.assets.robot}" alt="A cheerful paper robot" draggable="false" />
        <img class="reveal-star reveal-star-right" src="${config.assets.star}" alt="" draggable="false" />
      </div>
      <button class="paper-action rebuild-button" type="button">BUILD AGAIN</button>
    </div>`;
  bindTap('.rebuild-button', 'build-again', () => {
    state.robotRevealed = false;
    state.towerHeight = 2;
    state.awaitingInput = true;
    renderRobotWorkshop();
    speak('robot-intro');
  }, 'pop');
  cancelConfetti = burstConfetti({ host: els.play, count: 42, palette: PAPER_PALETTE, duration: 2400, rng });
}

function finishMode() {
  clearRound();
  stopSpeech();
  state.screen = 'end';
  state.phase = 'complete';
  state.awaitingInput = false;
  state.transition = false;
  state.promptKey = 'finish';
  screens.show('end');
  const mode = config.modes.find((entry) => entry.id === state.mode);
  els.endContent.innerHTML = `
    <div class="finish-card">
      <div class="finish-stars" aria-hidden="true">${Array.from({ length: 3 }, () => `<img src="${config.assets.star}" alt="" draggable="false" />`).join('')}</div>
      <h1>${mode?.id === 'compare' ? 'Great measuring!' : 'Tower terrific!'}</h1>
      <img class="finish-robot" src="${config.assets.robot}" alt="Cheerful paper robot" draggable="false" />
      <div class="finish-actions">
        <button class="paper-action play-again-button" type="button">PLAY AGAIN</button>
        <button class="paper-action choose-button" type="button">CHOOSE A GAME</button>
      </div>
    </div>`;
  bindEndTap('.play-again-button', 'play-again', () => screens.start(() => startMode(state.mode), { busy: false }), 'pop');
  bindEndTap('.choose-button', 'choose-game', () => showSplash({ announce: true }), 'unpop');
  cancelConfetti = burstConfetti({ host: els.end, count: 52, palette: PAPER_PALETTE, duration: 2800, rng });
  speak('finish');
}

function bindTap(selector, id, action, sound = 'tick') {
  const element = els.playContent.querySelector(selector);
  if (!element) return;
  element.dataset.target = id;
  roundDisposers.push(onTap(element, action, {
    feedback: (event) => {
      event.preventDefault();
      unlockAll();
      playSfx(sound);
    },
  }));
}

function bindEndTap(selector, id, action, sound = 'tick') {
  const element = els.endContent.querySelector(selector);
  if (!element) return;
  element.dataset.target = id;
  roundDisposers.push(onTap(element, action, {
    feedback: () => { unlockAll(); playSfx(sound); },
  }));
}

function attachBlockSource(source, onDrop, dropZone) {
  if (!source || !dropZone) return () => {};
  let active = null;

  const removeGhost = () => {
    active?.ghost?.remove();
    source.classList.remove('is-dragging');
  };
  const reset = () => {
    removeGhost();
    active = null;
  };
  const insideDrop = (x, y) => {
    const rect = dropZone.getBoundingClientRect();
    const padding = Math.min(90, rect.width * 0.18);
    return x >= rect.left - padding && x <= rect.right + padding
      && y >= rect.top - padding && y <= rect.bottom + padding;
  };
  const moveGhost = (event) => {
    if (!active || event.pointerId !== active.pointerId) return;
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    if (!active.moved && Math.hypot(dx, dy) > 8) {
      active.moved = true;
      active.ghost = source.querySelector('.next-block')?.cloneNode(true);
      if (active.ghost) {
        active.ghost.className = 'drag-ghost';
        document.body.append(active.ghost);
      }
      source.classList.add('is-dragging');
    }
    if (active.ghost) {
      active.ghost.style.left = `${event.clientX - active.offsetX}px`;
      active.ghost.style.top = `${event.clientY - active.offsetY}px`;
    }
    if (active.moved) event.preventDefault();
  };
  const end = (event, cancelled = false) => {
    if (!active || event.pointerId !== active.pointerId) return;
    const accepted = !cancelled && (!active.moved || insideDrop(event.clientX, event.clientY));
    reset();
    if (accepted) onDrop();
    else playSfx('boing');
  };
  const down = (event) => {
    if (event.isPrimary === false || source.disabled || active) return;
    unlockAll();
    const img = source.querySelector('.next-block');
    const rect = img?.getBoundingClientRect() || source.getBoundingClientRect();
    active = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
      ghost: null,
    };
    try { source.setPointerCapture(event.pointerId); } catch { /* window listeners are authoritative */ }
  };
  const click = (event) => {
    if (event.detail === 0 && !source.disabled) onDrop();
  };
  const cancelOnBlur = () => reset();

  source.addEventListener('pointerdown', down);
  source.addEventListener('click', click);
  window.addEventListener('pointermove', moveGhost, { passive: false });
  window.addEventListener('pointerup', end);
  const cancelPointer = (event) => end(event, true);
  window.addEventListener('pointercancel', cancelPointer);
  window.addEventListener('blur', cancelOnBlur);

  return () => {
    source.removeEventListener('pointerdown', down);
    source.removeEventListener('click', click);
    window.removeEventListener('pointermove', moveGhost);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', cancelPointer);
    window.removeEventListener('blur', cancelOnBlur);
    reset();
  };
}

function debugTap(id) {
  const target = [...game.querySelectorAll('[data-target]')].find((node) => node.dataset.target === id);
  if (!target || target.disabled) return false;
  target.click();
  return true;
}

function debugWinRound() {
  if (state.mode === 'build') {
    state.towerHeight = state.targetHeight;
    state.awaitingInput = false;
    state.phase = 'measured';
    renderBuildRound();
    return true;
  }
  if (state.mode === 'compare') {
    const side = state.compareCase.relation === 'same'
      ? 'left'
      : state.compareCase.relation === 'taller'
        ? (state.compareCase.left > state.compareCase.right ? 'left' : 'right')
        : (state.compareCase.left < state.compareCase.right ? 'left' : 'right');
    answerCompare(side);
    return true;
  }
  if (state.mode === 'robot') return revealRobot();
  return false;
}

function debugSetHeight(value) {
  const height = Math.max(0, Math.min(6, Math.round(Number(value) || 0)));
  state.towerHeight = height;
  if (state.mode === 'build') renderBuildRound();
  else if (state.mode === 'robot') renderRobotWorkshop();
  return height;
}

function debugSetCompareCase(left, right, relation = 'taller') {
  if (state.mode !== 'compare') return false;
  const cleanRelation = ['taller', 'shorter', 'same'].includes(relation) ? relation : 'taller';
  state.compareCase = {
    left: Math.max(1, Math.min(6, Math.round(Number(left) || 1))),
    right: Math.max(1, Math.min(6, Math.round(Number(right) || 1))),
    relation: cleanRelation,
  };
  state.phase = 'compare';
  state.awaitingInput = true;
  renderCompareRound();
  return { ...state.compareCase };
}

installDebug({
  gameId: config.id,
  engine: config.engine,
  ready,
  listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
  startMode,
  getState: () => ({
    screen: state.screen,
    mode: state.mode,
    phase: state.phase,
    roundIndex: state.roundIndex,
    roundTotal: state.rounds.length,
    towerHeight: state.towerHeight,
    targetHeight: state.targetHeight,
    compareCase: state.compareCase ? { ...state.compareCase } : null,
    awaitingInput: state.awaitingInput,
    transition: state.transition,
    robotRevealed: state.robotRevealed,
    attempts: state.attempts,
    seed: state.seed,
  }),
  getTargets: () => collectTargets(game),
  tap: debugTap,
  winRound: debugWinRound,
  home: () => showSplash(),
  timers,
  voice,
  sfx: { stop() {}, setMuted(on) { state.muted = !!on; } },
  onSeed: (nextRng, seed) => { rng = nextRng; state.seed = seed; },
  getAudioLog: voice.getAudioLog,
  clearAudioLog: voice.clearAudioLog,
  setTowerHeight: debugSetHeight,
  setCompareCase: debugSetCompareCase,
  revealRobot,
});

window.addEventListener('pagehide', () => {
  clearRound();
  stopSpeech();
}, { once: true });
