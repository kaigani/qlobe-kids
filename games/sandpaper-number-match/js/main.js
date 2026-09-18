import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as bgm from '../../../shared/js/bgm.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { installUnlockOnGesture, installKioskGuards, unlockAll } from '../../../shared/js/audio-unlock.js';
import { createScreens } from '../../../shared/js/screens.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { escapeHtml } from '../../../shared/js/dom.js';
import { createTraceController } from './trace-controller.js';

const mount = document.getElementById('game');
const selectionScreen = mount.querySelector('[data-screen="selection"]');
const playScreen = mount.querySelector('[data-screen="play"]');
const rewardScreen = mount.querySelector('[data-screen="reward"]');
const timers = createTimers();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const numberKeys = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

const state = {
  screen: 'selection',
  mode: null,
  phase: 'selection',
  roundIndex: 0,
  rounds: [],
  number: null,
  counted: [],
  choices: [],
  traceCoverage: 0,
  traceMisses: 0,
  awaitingInput: false,
  locked: false,
  muted: false,
  seed: 42,
  rng: mulberry32(42),
  reducedMotion,
};

let traceController = null;
let lastPromptKey = 'intro';
let lastPromptText = config.voice.intro;

const narrator = createNarrator();
const screens = createScreens({
  root: mount,
  screens: { selection: selectionScreen, play: playScreen, reward: rewardScreen },
  initial: 'selection',
  splash: 'selection',
  voice: narrator,
});

const nudger = createNudger({
  first: 11000,
  repeat: 10500,
  onNudge: (index) => {
    if (!state.awaitingInput || state.locked) return;
    if (state.phase === 'trace') {
      speak(index ? 'traceNudge' : 'trace');
      pulseHint('.trace-stage');
    } else if (state.phase === 'count') {
      speak(index ? 'countNudge' : 'count');
      pulseHint('.star-button:not(.is-counted)');
    } else if (state.phase === 'match') {
      speak('matchNudge');
      if (index > 0) pulseHint(`[data-quantity="${state.number}"]`);
    }
  },
});

bgm.preload(config.music);
bgm.setVolume(0.13);
installKioskGuards();
installUnlockOnGesture({
  extra: [voice.unlock, bgm.unlock],
  onFirst: () => bgm.play(config.music, {
    key: config.id,
    fadeInMs: 1000,
    loopFadeOutMs: 2600,
  }),
});

function allAssetUrls() {
  return [
    config.assets.world,
    config.assets.title,
    config.assets.titleLockup,
    config.assets.button,
    config.assets.home,
    config.assets.back,
    config.assets.sound,
    config.assets.replay,
    config.assets.pencil,
    config.assets.sleepy,
    config.assets.awake,
    config.assets.rosette,
    ...config.assets.numerals,
    ...config.modes.map((mode) => mode.card),
  ];
}

const ready = Promise.all([
  voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
  preloadImages(allAssetUrls()),
]).then(() => {
  renderSelection({ announce: false });
  return true;
});

function art(src, className, alt = '') {
  const safeAlt = escapeHtml(alt);
  return `<img class="${className}" src="${src}" alt="${safeAlt}" draggable="false"${alt ? '' : ' aria-hidden="true"'}>`;
}

function world() {
  return art(config.assets.world, 'world-backdrop');
}

function numeralArt(number, className = 'numeral-art') {
  if (number < 10) return art(config.assets.numerals[number], className, `Number ${number}`);
  return `<span class="numeral-ten" role="img" aria-label="Number 10">
    ${art(config.assets.numerals[1], `${className} numeral-one`)}
    ${art(config.assets.numerals[0], `${className} numeral-zero`)}
  </span>`;
}

function homeControl() {
  return `<a class="felt-hud hud-home" href="../../" data-target="home" aria-label="Back to all games">
    ${art(config.assets.home, 'hud-art')}
  </a>`;
}

function backControl() {
  return `<button class="felt-hud hud-back" type="button" data-action="back" data-target="back" aria-label="Back to game choices">
    ${art(config.assets.back, 'hud-art')}
  </button>`;
}

function soundControl() {
  return `<button class="felt-hud hud-sound${state.muted ? ' is-muted' : ''}" type="button" data-action="sound"
    data-target="mute" aria-label="${state.muted ? 'Turn sound on' : 'Turn sound off'}" aria-pressed="${state.muted}">
    ${art(config.assets.sound, 'hud-art')}
  </button>`;
}

function promptPlaque(text) {
  return `<header class="prompt-plaque">
    ${art(config.assets.title, 'prompt-plaque-art')}
    <h2>${escapeHtml(text)}</h2>
  </header>`;
}

function roundCounter() {
  const total = state.rounds.length;
  return `<div class="round-counter" aria-label="Round ${state.roundIndex + 1} of ${total}">
    <strong>${state.roundIndex + 1}</strong><span>of</span><strong>${total}</strong>
  </div>`;
}

function actionButton(label, action, target, { replay = false } = {}) {
  return `<button class="action-button${replay ? ' is-replay' : ''}" type="button" data-action="${action}" data-target="${target}">
    ${art(config.assets.button, 'action-button-art')}
    ${replay ? art(config.assets.replay, 'action-replay-art') : ''}
    <span>${escapeHtml(label)}</span>
  </button>`;
}

function feedback({ quiet = false } = {}) {
  unlockAll([voice.unlock, bgm.unlock]);
  nudger.poke();
  if (!quiet && !state.muted) sfx.tick();
}

function bindTap(element, handler, { quiet = false } = {}) {
  if (!element) return;
  screens.hold(onTap(element, (event) => {
    event.preventDefault?.();
    handler(event);
  }, { feedback: () => feedback({ quiet }) }));
}

function bindCommonControls(host) {
  bindTap(host.querySelector('[data-action="back"]'), () => renderSelection({ announce: true }));
  bindTap(host.querySelector('[data-action="sound"]'), () => setMuted(!state.muted));
}

function switchScreen(name, renderer) {
  screens.show(name, { force: screens.is(name) });
  state.screen = name;
  renderer(screens.el(name));
}

function setMuted(on = true) {
  state.muted = Boolean(on);
  narrator.setMuted(state.muted);
  voice.setMuted(state.muted);
  sfx.setMuted(state.muted);
  bgm.setMuted(state.muted);
  for (const button of mount.querySelectorAll('[data-action="sound"]')) {
    button.classList.toggle('is-muted', state.muted);
    button.setAttribute('aria-pressed', String(state.muted));
    button.setAttribute('aria-label', state.muted ? 'Turn sound on' : 'Turn sound off');
  }
  if (!state.muted && lastPromptKey) speak(lastPromptKey, lastPromptText);
  return state.muted;
}

function speak(key, fallbackText = config.voice[key] || '') {
  lastPromptKey = key;
  lastPromptText = fallbackText;
  return bgm.duckDuring(narrator.say(key, fallbackText), {
    down: 0.15,
    downMs: 100,
    upMs: 320,
  });
}

function speakSequence(parts) {
  const normalized = parts.map((part) => ({
    ...part,
    text: part.text || config.voice[part.key] || '',
  }));
  const last = normalized[normalized.length - 1];
  if (last) {
    lastPromptKey = last.key;
    lastPromptText = last.text;
  }
  return bgm.duckDuring(narrator.saySequence(normalized), {
    down: 0.15,
    downMs: 100,
    upMs: 320,
  });
}

function pulseHint(selector) {
  const element = mount.querySelector(selector);
  if (!element) return;
  element.classList.remove('is-hinting');
  requestAnimationFrame(() => element.classList.add('is-hinting'));
  timers.after(1100, () => element.classList.remove('is-hinting'));
}

function modePreview(mode) {
  if (mode.id === 'journey') {
    return `<span class="preview-duo">${numeralArt(3, 'preview-numeral')}${art(config.assets.awake, 'preview-star')}</span>`;
  }
  if (mode.id === 'star-count') {
    return `<span class="preview-stars">${[0, 1, 2].map(() => art(config.assets.awake, 'preview-star')).join('')}</span>`;
  }
  return `<span class="preview-match">${numeralArt(4, 'preview-numeral')}
    <span>${[0, 1, 2, 3].map(() => art(config.assets.awake, 'preview-star mini')).join('')}</span></span>`;
}

function renderSelection({ announce = false } = {}) {
  traceController?.destroy();
  traceController = null;
  timers.clearAll();
  nudger.stop();
  state.mode = null;
  state.phase = 'selection';
  state.roundIndex = 0;
  state.rounds = [];
  state.number = null;
  state.awaitingInput = false;
  state.locked = false;
  switchScreen('selection', (host) => {
    host.setAttribute('aria-label', 'Choose a number game');
    host.innerHTML = `${world()}${homeControl()}${soundControl()}
      <div class="selection-content">
        <header class="selection-heading">
          ${art(config.assets.titleLockup, 'title-lockup')}
          <h1 class="visually-hidden">Sandpaper Number Match</h1>
        </header>
        <div class="mode-grid" role="group" aria-label="Number game choices">
          ${config.modes.map((mode) => `<button class="mode-card" type="button" data-mode="${mode.id}"
            data-target="mode-${mode.id}" aria-label="${escapeHtml(mode.title)}: ${escapeHtml(mode.skill)}">
            ${art(mode.card, 'mode-art')}
            <span class="mode-preview">${modePreview(mode)}</span>
            <span class="mode-name">${escapeHtml(mode.title)}</span>
          </button>`).join('')}
        </div>
        ${art(config.assets.pencil, 'selection-pencil')}
      </div>`;
    bindTap(host.querySelector('[data-action="sound"]'), () => setMuted(!state.muted));
    for (const card of host.querySelectorAll('[data-mode]')) {
      bindTap(card, () => screens.start(() => startMode(card.dataset.mode)));
    }
  });
  if (announce) speak('intro');
}

function modeById(id) {
  return config.modes.find((mode) => mode.id === id) || null;
}

function tracePathsFor(number) {
  const authored = config.trace.paths[String(number)] || [];
  return Array.isArray(authored[0]?.[0]) ? authored : [authored];
}

function drawRounds(mode) {
  const pool = shuffle(mode.numbers, state.rng);
  const selected = pool.slice(0, mode.roundCount);
  if (mode.id === 'journey') selected.sort((a, b) => a - b);
  return selected;
}

async function startMode(modeId) {
  await ready;
  const mode = modeById(modeId);
  if (!mode) return false;
  narrator.stop();
  timers.clearAll();
  state.mode = mode.id;
  state.roundIndex = 0;
  state.rounds = drawRounds(mode);
  state.number = state.rounds[0];
  showRound({ announce: false });
  const phaseKey = mode.id === 'journey' ? 'trace' : mode.id === 'star-count' ? 'count' : 'match';
  speakSequence([
    { key: mode.spokenKey },
    { key: phaseKey, gap: 120 },
  ]);
  return true;
}

function showRound({ announce = true } = {}) {
  state.number = state.rounds[state.roundIndex];
  state.counted = [];
  state.choices = [];
  state.traceCoverage = 0;
  state.locked = false;
  if (state.mode === 'journey') renderTracePhase({ announce });
  else if (state.mode === 'star-count') renderCountPhase({ announce });
  else renderMatchPhase({ announce });
}

function renderTracePhase({ announce = true } = {}) {
  traceController?.destroy();
  traceController = null;
  state.phase = 'trace';
  state.awaitingInput = true;
  state.traceMisses = 0;
  switchScreen('play', (host) => {
    host.setAttribute('aria-label', `Trace number ${state.number}`);
    host.innerHTML = `${world()}${backControl()}${soundControl()}${roundCounter()}
      ${promptPlaque(`Trace number ${state.number}`)}
      <div class="trace-stage" data-target="trace" data-role="neutral">
        <div class="numeral-stack">${numeralArt(state.number)}</div>
        <canvas id="trace-canvas" tabindex="0" role="button"
          aria-label="Trace number ${state.number} from the glowing dot. Press Enter for switch access."></canvas>
        <div class="lift-cue" aria-live="polite" aria-atomic="true">
          ${art(config.assets.button, 'lift-cue-art')}<span></span>
        </div>
        ${art(config.assets.pencil, 'pencil-buddy')}
      </div>`;
    bindCommonControls(host);
    const canvas = host.querySelector('#trace-canvas');
    let liftPathIndex = null;
    let liftBaseline = 0;
    traceController = createTraceController(canvas, {
      paths: tracePathsFor(state.number),
      threshold: config.trace.threshold,
      startTolerance: config.trace.startTolerance,
      pathTolerance: config.trace.pathTolerance,
      reducedMotion,
      onProgress: ({ coverage, targets }) => {
        state.traceCoverage = Math.round(coverage * 1000) / 1000;
        if (liftPathIndex !== null
            && (targets?.[liftPathIndex]?.coverage || 0) > liftBaseline + 0.08) {
          const cue = playScreen.querySelector('.lift-cue');
          cue?.classList.remove('is-visible');
          playScreen.querySelector('.pencil-buddy')?.classList.remove('is-lifting');
          const label = cue?.querySelector('span');
          if (label) label.textContent = '';
          liftPathIndex = null;
        }
      },
      onPathAdvance: ({ pathIndex, result }) => {
        liftPathIndex = pathIndex;
        liftBaseline = result.targets?.[pathIndex]?.coverage || 0;
        const cue = playScreen.querySelector('.lift-cue');
        cue?.classList.add('is-visible');
        const label = cue?.querySelector('span');
        if (label) label.textContent = 'Lift. Start at the new dot.';
        playScreen.querySelector('.pencil-buddy')?.classList.add('is-lifting');
      },
      onComplete: () => finishTrace(),
      onMiss: () => {
        state.traceMisses += 1;
        pulseHint('.trace-stage');
        if (state.traceMisses === 2 || state.traceMisses === 5) speak('traceNudge');
      },
    });
    const onTraceKey = (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      completeTrace();
    };
    canvas.addEventListener('keydown', onTraceKey);
    const resize = () => traceController?.resize();
    addEventListener('resize', resize);
    screens.hold(() => canvas.removeEventListener('keydown', onTraceKey), () => removeEventListener('resize', resize), () => {
      traceController?.destroy();
      traceController = null;
    });
    nudger.arm();
    screens.hold(nudger.stop);
  });
  if (announce) speak('trace');
}

function finishTrace() {
  if (state.locked || state.phase !== 'trace') return false;
  state.locked = true;
  state.awaitingInput = false;
  nudger.stop();
  playScreen.querySelector('.trace-stage')?.classList.add('is-complete');
  if (!state.muted) sfx.sparkle();
  speak('traceDone').then(() => {
    if (state.phase === 'trace' && state.locked) renderCountPhase();
  });
  return true;
}

function renderCountPhase({ announce = true } = {}) {
  traceController?.destroy();
  traceController = null;
  state.phase = 'count';
  state.counted = [];
  state.locked = false;
  state.awaitingInput = true;
  const target = state.number;
  switchScreen('play', (host) => {
    host.setAttribute('aria-label', `Count ${target} stars`);
    host.innerHTML = `${world()}${backControl()}${soundControl()}${roundCounter()}
      ${promptPlaque(`Count ${target} ${target === 1 ? 'star' : 'stars'}`)}
      <div class="count-stage">
        <div class="count-badge" aria-live="polite"><strong>0</strong><span>of</span><strong>${target}</strong></div>
        <div class="star-field count-${target}" role="group" aria-label="${target} sleepy stars">
          ${Array.from({ length: target }, (_, index) => `<button class="star-button" type="button"
            data-star="${index}" data-target="star-${index}" data-role="correct" aria-label="Sleepy star ${index + 1}">
            ${art(config.assets.sleepy, 'star-art')}
          </button>`).join('')}
        </div>
      </div>`;
    bindCommonControls(host);
    for (const star of host.querySelectorAll('[data-star]')) {
      bindTap(star, () => countStar(Number(star.dataset.star)), { quiet: true });
    }
    nudger.arm();
    screens.hold(nudger.stop);
  });
  if (announce) speak('count');
}

function countStar(index) {
  if (state.locked || state.phase !== 'count' || state.counted.includes(index)) return false;
  state.counted.push(index);
  nudger.poke();
  const button = playScreen.querySelector(`[data-star="${index}"]`);
  if (button) {
    button.classList.add('is-counted', 'is-waking');
    button.dataset.role = 'done';
    button.setAttribute('aria-pressed', 'true');
    button.setAttribute('aria-label', `Star ${index + 1}, awake`);
    const image = button.querySelector('img');
    if (image) image.src = config.assets.awake;
  }
  if (!state.muted) sfx.pop();
  const count = state.counted.length;
  const badge = playScreen.querySelector('.count-badge strong');
  if (badge) badge.textContent = String(count);
  const countLine = speak(numberKeys[count], config.voice[numberKeys[count]]);
  if (count >= state.number) {
    const completed = { mode: state.mode, roundIndex: state.roundIndex, number: state.number };
    state.locked = true;
    state.awaitingInput = false;
    nudger.stop();
    countLine.then(() => {
      if (state.phase !== 'count' || !state.locked
          || state.mode !== completed.mode || state.roundIndex !== completed.roundIndex
          || state.number !== completed.number) return;
      timers.after(120, () => {
        if (state.phase === 'count' && state.locked && state.mode === completed.mode
            && state.roundIndex === completed.roundIndex && state.number === completed.number) {
          completeRound('count');
        }
      });
    });
  }
  return true;
}

function makeChoices(answer) {
  const pool = [answer];
  const offsets = shuffle([-2, -1, 1, 2, -3, 3], state.rng);
  for (const offset of offsets) {
    const candidate = answer + offset;
    if (candidate >= 1 && candidate <= 9 && !pool.includes(candidate)) pool.push(candidate);
    if (pool.length === 3) break;
  }
  return shuffle(pool, state.rng);
}

function quantityStars(quantity) {
  return Array.from({ length: quantity }, () => art(config.assets.awake, 'choice-star')).join('');
}

function renderMatchPhase({ announce = true } = {}) {
  state.phase = 'match';
  state.locked = false;
  state.awaitingInput = true;
  state.choices = makeChoices(state.number);
  switchScreen('play', (host) => {
    host.setAttribute('aria-label', `Match number ${state.number} to a group of stars`);
    host.innerHTML = `${world()}${backControl()}${soundControl()}${roundCounter()}
      ${promptPlaque(`Find ${state.number} stars`)}
      <div class="match-stage">
        <div class="match-target">${numeralArt(state.number)}</div>
        <div class="choice-grid" role="group" aria-label="Quantity choices">
          ${state.choices.map((quantity, index) => `<button class="quantity-card" type="button"
            data-quantity="${quantity}" data-target="quantity-${quantity}" data-role="${quantity === state.number ? 'correct' : 'wrong'}"
            aria-label="${quantity} stars">
            ${art(config.modes[index % config.modes.length].card, 'quantity-card-art')}
            <span class="choice-stars quantity-${quantity}">${quantityStars(quantity)}</span>
          </button>`).join('')}
        </div>
      </div>`;
    bindCommonControls(host);
    for (const choice of host.querySelectorAll('[data-quantity]')) {
      bindTap(choice, () => chooseQuantity(Number(choice.dataset.quantity)), { quiet: true });
    }
    nudger.arm();
    screens.hold(nudger.stop);
  });
  if (announce) speak('match');
}

function chooseQuantity(quantity) {
  if (state.locked || state.phase !== 'match') return false;
  nudger.poke();
  const choice = playScreen.querySelector(`[data-quantity="${quantity}"]`);
  if (quantity !== state.number) {
    choice?.classList.remove('is-wrong');
    requestAnimationFrame(() => choice?.classList.add('is-wrong'));
    if (!state.muted) sfx.unpop();
    speak('tryAgain');
    return false;
  }
  state.locked = true;
  state.awaitingInput = false;
  const completed = { mode: state.mode, roundIndex: state.roundIndex, number: state.number };
  choice?.classList.add('is-correct');
  nudger.stop();
  if (!state.muted) sfx.sparkle();
  speak('correct').then(() => {
    if (state.phase !== 'match' || !state.locked
        || state.mode !== completed.mode || state.roundIndex !== completed.roundIndex
        || state.number !== completed.number) return;
    timers.after(120, () => {
      if (state.phase === 'match' && state.locked && state.mode === completed.mode
          && state.roundIndex === completed.roundIndex && state.number === completed.number) {
        completeRound('match');
      }
    });
  });
  return true;
}

function completeRound(source) {
  if (!state.mode) return;
  state.phase = 'reward';
  state.locked = true;
  state.awaitingInput = false;
  const last = state.roundIndex >= state.rounds.length - 1;
  switchScreen('reward', (host) => {
    host.setAttribute('aria-label', last ? 'Number game complete' : `Number ${state.number} complete`);
    host.innerHTML = `${world()}${backControl()}${soundControl()}
      <div class="reward-content">
        ${art(config.assets.rosette, 'rosette')}
        <div class="reward-number">${numeralArt(state.number)}</div>
        <h2>${last ? 'NUMBER STAR!' : source === 'match' ? 'A PERFECT MATCH!' : `YOU MADE ${state.number}!`}</h2>
        <div class="reward-actions">
          ${last
            ? `${actionButton('PLAY AGAIN', 'again', 'again', { replay: true })}${actionButton('PICK A GAME', 'choose', 'choose')}`
            : actionButton('NEXT', 'next', 'next')}
        </div>
      </div>`;
    bindCommonControls(host);
    bindTap(host.querySelector('[data-action="next"]'), nextRound);
    bindTap(host.querySelector('[data-action="again"]'), () => startMode(state.mode));
    bindTap(host.querySelector('[data-action="choose"]'), () => renderSelection({ announce: true }));
    const stopConfetti = burstConfetti({
      host,
      count: last ? 42 : 24,
      duration: 2300,
      palette: ['#d97861', '#e6ad4d', '#3f827e', '#8b6a9e'],
      rng: state.rng,
    });
    screens.hold(stopConfetti);
  });
  speak(last ? 'sessionComplete' : 'roundComplete');
}

function nextRound() {
  if (state.roundIndex >= state.rounds.length - 1) return false;
  state.roundIndex += 1;
  showRound();
  return true;
}

function debugTap(id) {
  const selector = `[data-target="${CSS.escape(String(id))}"]`;
  const target = mount.querySelector(selector);
  if (!target || target.getBoundingClientRect().width <= 0) return false;
  target.click();
  return true;
}

function debugTrace(points) {
  if (state.phase !== 'trace' || !traceController) return null;
  return traceController.ingest(points);
}

function completeTrace() {
  const paths = tracePathsFor(state.number);
  if (!paths.length || !traceController) return null;
  let result = null;
  for (const path of paths) result = traceController.ingest(path);
  return result;
}

function winRound() {
  if (state.phase === 'trace') return Boolean(completeTrace());
  if (state.phase === 'count') {
    for (let i = 0; i < state.number; i += 1) countStar(i);
    return true;
  }
  if (state.phase === 'match') return chooseQuantity(state.number);
  if (state.phase === 'reward') return nextRound();
  return false;
}

function debugState() {
  return {
    screen: screens.current,
    mode: state.mode,
    phase: state.phase,
    roundIndex: state.roundIndex,
    round: state.roundIndex,
    roundsTotal: state.rounds.length,
    rounds: [...state.rounds],
    number: state.number,
    counted: [...state.counted],
    choices: [...state.choices],
    traceCoverage: state.traceCoverage,
    traceMisses: state.traceMisses,
    awaitingInput: state.awaitingInput,
    locked: state.locked,
    muted: state.muted,
    seed: state.seed,
    reducedMotion: state.reducedMotion,
  };
}

installDebug({
  gameId: config.id,
  engine: config.engine,
  ready,
  listModes: () => config.modes.map(({ id, title, skill }) => ({ id, title, skill })),
  startMode,
  getState: debugState,
  tap: debugTap,
  winRound,
  home: () => renderSelection({ announce: false }),
  mute: (on = true) => setMuted(on),
  timers,
  narrator,
  voice,
  sfx,
  onSeed: (rng, seed) => {
    state.rng = rng;
    state.seed = seed;
  },
  trace: debugTrace,
  completeTrace,
  getAudioLog: voice.getAudioLog,
  clearAudioLog: voice.clearAudioLog,
  getBgmStats: bgm.stats,
  getLayout: () => ({
    viewport: { width: innerWidth, height: innerHeight },
    screen: screens.current,
    targetCount: mount.querySelectorAll('[data-target]').length,
    canvas: (() => {
      const rect = mount.querySelector('#trace-canvas')?.getBoundingClientRect();
      return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
    })(),
  }),
});

addEventListener('pagehide', () => {
  nudger.stop();
  timers.clearAll();
  traceController?.destroy();
  traceController = null;
  narrator.dispose();
  bgm.stop();
}, { once: true });
