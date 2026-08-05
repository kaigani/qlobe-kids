// Land Explorer — tactile clay landforms on the shared heightfield.

import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import { createScreens } from '../../../shared/js/screens.js';
import { renderModeCards } from '../../../shared/js/mode-select.js';
import { hudButton, progressDots, soundDebounce } from '../../../shared/js/hud.js';
import { onTap } from '../../../shared/js/tap.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createTimers } from '../../../shared/js/timers.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { tada } from '../../../shared/js/celebrate.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createLandformBoard } from './landform-board.js';
import { measureLandform } from './landform-field.js';

const mount = document.getElementById('game');
const narrator = createNarrator();
const timers = createTimers();
const LAND_FORMS = config.challengeOrder;
const ASSET = config.assets;
const LABEL = Object.freeze({ island: 'Island', lake: 'Lake', peninsula: 'Peninsula', bay: 'Bay' });
const MODE_ART = Object.freeze({ guided: ASSET['clay-lump'], mystery: ASSET.cards.island, free: ASSET.boat });
const MODE_KICKER = Object.freeze({ guided: 'Shape it', mystery: 'Find it', free: 'Sail it' });

const state = {
  ready: false,
  screen: 'splash',
  mode: null,
  kind: null,
  tool: 'pour',
  round: 0,
  completed: [],
  strokeCount: 0,
  awaitingInput: true,
  inputLocked: false,
  reward: false,
  mysteryAnswer: null,
  boardMetrics: null,
  muted: false,
  seed: 42,
};

let rng = mulberry32(state.seed);
let board = null;
let mysteryOrder = [];
let mysteryDisposers = [];
let celebrationDispose = null;
let sailDispose = null;

const cardMarkup = (kind, extra = '') => `
  <button class="landform-card ${extra}" type="button" data-kind="${kind}"
          data-target="landform-${kind}" aria-label="${LABEL[kind]}">
    <img src="${ASSET.cards[kind]}" alt="" draggable="false" />
    <span>${LABEL[kind]}</span>
    <img class="card-star" src="${ASSET.fish}" alt="" draggable="false" aria-hidden="true" />
  </button>`;

mount.innerHTML = `
  <section class="qk-screen game-screen splash-screen" data-qk-screen="splash" aria-label="Land Explorer menu">
    <div class="tray-stage splash-stage">
      <h1 class="visually-hidden">Land Explorer</h1>
      <img class="title-lockup" src="${ASSET.title}" alt="Land Explorer" draggable="false" />
      <div class="splash-diorama" aria-hidden="true">
        <img class="splash-clay" src="${ASSET['clay-lump']}" alt="" draggable="false" />
        <img class="splash-boat" src="${ASSET.boat}" alt="" draggable="false" />
      </div>
      <div class="mode-shelf" aria-label="Choose a way to explore"></div>
    </div>
    <a class="qk-hud-btn qk-hud-home qk-hud-top-left" data-hud="home" data-target="home"
       href="../../index.html" aria-label="Home"></a>
  </section>

  <section class="qk-screen game-screen shelf-screen" data-qk-screen="guided" aria-label="Choose a landform" hidden>
    <div class="tray-stage">
      <div class="prompt-plaque shelf-prompt">
        <img src="${ASSET['action-plaque']}" alt="" draggable="false" />
        <div><h2>Choose a landform</h2><p>What will you build?</p></div>
      </div>
      <div class="landform-shelf" role="list">
        ${LAND_FORMS.map((kind) => cardMarkup(kind)).join('')}
      </div>
    </div>
    <div class="guided-hud"></div>
  </section>

  <section class="qk-screen game-screen play-screen" data-qk-screen="play" aria-label="Build a landform" hidden>
    <div class="tray-stage play-stage">
      <div class="prompt-plaque play-prompt">
        <img src="${ASSET['action-plaque']}" alt="" draggable="false" />
        <div><h2 data-play-title></h2><p data-play-clue></p></div>
      </div>
      <div class="play-progress" data-play-progress></div>
      <div class="basin-slot" data-board aria-label="Blue water tray"></div>
      <div class="tool-shelf" aria-label="Clay tools">
        <button class="tool-button tool-pour" type="button" data-tool="pour" data-target="tool-pour" aria-label="Pour green land">
          <img src="${ASSET['clay-lump']}" alt="" draggable="false" /><span>Pour land</span>
        </button>
        <button class="tool-button tool-scoop" type="button" data-tool="scoop" data-target="tool-scoop" aria-label="Scoop blue water">
          <img src="${ASSET.scoop}" alt="" draggable="false" /><span>Scoop water</span>
        </button>
        <button class="plaque-button reset-button" type="button" data-action="reset" data-target="reset" aria-label="Reset the tray">
          <img src="${ASSET['action-plaque']}" alt="" draggable="false" /><span>Reset</span>
        </button>
        <button class="plaque-button sail-button" type="button" data-action="sail" data-target="sail" aria-label="Launch the little boat">
          <img src="${ASSET['action-plaque']}" alt="" draggable="false" /><span>Set sail!</span>
          <img class="sail-button-boat" src="${ASSET.boat}" alt="" draggable="false" />
        </button>
      </div>
      <div class="reward-layer" data-reward hidden>
        <img class="reward-boat" src="${ASSET.boat}" alt="" draggable="false" />
        <img class="reward-fish" src="${ASSET.fish}" alt="" draggable="false" />
        <img class="reward-turtle" src="${ASSET.turtle}" alt="" draggable="false" />
        <div class="prompt-plaque reward-plaque">
          <img src="${ASSET['action-plaque']}" alt="" draggable="false" />
          <div><h2 data-reward-title></h2><p data-reward-copy></p></div>
        </div>
        <button class="plaque-button continue-button" type="button" data-action="continue" data-target="continue">
          <img src="${ASSET['action-plaque']}" alt="" draggable="false" /><span>Keep exploring</span>
        </button>
      </div>
      <div class="sailing-layer" data-sailing hidden aria-hidden="true">
        <img class="sailing-boat" src="${ASSET.boat}" alt="" draggable="false" />
        <img class="sailing-fish" src="${ASSET.fish}" alt="" draggable="false" />
        <img class="sailing-turtle" src="${ASSET.turtle}" alt="" draggable="false" />
      </div>
    </div>
    <div class="play-hud"></div>
  </section>

  <section class="qk-screen game-screen mystery-screen" data-qk-screen="mystery" aria-label="Mystery Maps" hidden>
    <div class="tray-stage">
      <div class="prompt-plaque mystery-prompt">
        <img src="${ASSET['action-plaque']}" alt="" draggable="false" />
        <div><h2>Which landform?</h2><p data-mystery-clue></p></div>
      </div>
      <div class="mystery-progress" data-mystery-progress></div>
      <div class="mystery-cards" data-mystery-cards role="list"></div>
      <div class="mystery-friend" data-mystery-friend hidden aria-hidden="true">
        <img src="${ASSET.turtle}" alt="" draggable="false" />
      </div>
    </div>
    <div class="mystery-hud"></div>
  </section>

  <section class="qk-screen game-screen end-screen" data-qk-screen="end" aria-label="Land Explorer celebration" hidden>
    <div class="tray-stage end-stage">
      <img class="end-boat" src="${ASSET.boat}" alt="" draggable="false" />
      <img class="end-turtle" src="${ASSET.turtle}" alt="" draggable="false" />
      <div class="prompt-plaque end-plaque">
        <img src="${ASSET['action-plaque']}" alt="" draggable="false" />
        <div><h2 data-end-title>Wonderful exploring!</h2><p data-end-copy></p></div>
      </div>
      <div class="end-card-row" aria-hidden="true">
        ${LAND_FORMS.map((kind, index) => `
          <div class="end-card" style="--i:${index}">
            <img src="${ASSET.cards[kind]}" alt="" draggable="false" />
            <span>${LABEL[kind]}</span>
          </div>`).join('')}
      </div>
      <div class="end-actions">
        <button class="plaque-button" type="button" data-action="again" data-target="again">
          <img src="${ASSET['action-plaque']}" alt="" draggable="false" /><span>Play again</span>
        </button>
        <button class="plaque-button" type="button" data-action="choose" data-target="choose">
          <img src="${ASSET['action-plaque']}" alt="" draggable="false" /><span>Choose a game</span>
        </button>
      </div>
    </div>
    <div class="end-hud"></div>
  </section>`;

const screens = createScreens({
  root: mount,
  initial: 'splash',
  splash: 'splash',
  voice: narrator,
  onExit(name) {
    nudger.stop();
    timers.clearAll();
    celebrationDispose?.();
    celebrationDispose = null;
    sailDispose?.();
    sailDispose = null;
    if (name === 'play') destroyBoard();
    if (name === 'mystery') clearMysteryHandlers();
  },
});

function performIdleNudge() {
  if (!state.awaitingInput) return false;
  if (state.screen === 'play' && state.mode === 'guided') {
    say(`${state.kind}-hint`);
    pulseRecommendedTool();
  } else if (state.screen === 'play') {
    say('idle');
    pulseRecommendedTool();
  } else if (state.screen === 'mystery') {
    say('mystery-nudge');
    document.querySelector('.mystery-card[data-role="correct"]')?.classList.add('is-hinting');
    timers.after(1100, () => document.querySelector('.mystery-card.is-hinting')?.classList.remove('is-hinting'));
  } else {
    return false;
  }
  return true;
}

const nudger = createNudger({ first: 13000, repeat: 17000, onNudge: performIdleNudge });

function say(key, text = config.voice[key]) {
  return narrator.say(key, text || '');
}

function playSfx(name) {
  if (state.muted) return;
  try { sfx[name]?.(); } catch { /* sound is never load-bearing */ }
}

function tick(event) {
  event?.preventDefault?.();
  playSfx('tick');
}

function go(name, options) {
  state.screen = name;
  return screens.show(name, options);
}

function destroyBoard() {
  if (!board) return;
  board.destroy();
  board = null;
  document.querySelector('[data-board]')?.replaceChildren();
}

function clearMysteryHandlers() {
  mysteryDisposers.forEach((dispose) => dispose());
  mysteryDisposers = [];
}

function setHud(hostSelector, { back = true, sound = true } = {}) {
  const host = document.querySelector(hostSelector);
  if (back) {
    const button = hudButton('back', showSplash, { label: 'Back to Land Explorer menu' });
    button.classList.add('qk-hud-top-left');
    button.dataset.target = 'back';
    host.append(button);
  }
  if (sound) {
    const repeat = soundDebounce(repeatPrompt, 650);
    const button = hudButton('sound', repeat);
    button.classList.add('qk-hud-bottom-left');
    button.dataset.target = 'sound';
    host.append(button);
  }
}

setHud('.guided-hud');
setHud('.play-hud');
setHud('.mystery-hud');
setHud('.end-hud', { sound: false });

renderModeCards({
  host: document.querySelector('.mode-shelf'),
  modes: config.modes,
  skin: false,
  cardClass: 'mode-plaque',
  art: (mode) => MODE_ART[mode.id],
  onPick: (id) => startMode(id),
  feedback: tick,
  decorate(button, mode) {
    const plaque = document.createElement('img');
    plaque.className = 'mode-plaque-art';
    plaque.src = ASSET['action-plaque'];
    plaque.alt = '';
    plaque.draggable = false;
    button.prepend(plaque);
    const kicker = document.createElement('small');
    kicker.textContent = MODE_KICKER[mode.id];
    button.append(kicker);
  },
});

for (const card of document.querySelectorAll('.shelf-screen .landform-card')) {
  onTap(card, () => startGuided(card.dataset.kind), { feedback: tick });
}

for (const tool of document.querySelectorAll('.tool-button')) {
  onTap(tool, () => chooseTool(tool.dataset.tool, true), { feedback: tick });
}
onTap(document.querySelector('[data-action="reset"]'), resetBoard, { feedback: tick });
onTap(document.querySelector('[data-action="sail"]'), launchBoat, { feedback: tick });
onTap(document.querySelector('[data-action="continue"]'), continueGuided, { feedback: tick });
onTap(document.querySelector('[data-action="again"]'), playAgain, { feedback: tick });
onTap(document.querySelector('[data-action="choose"]'), showSplash, { feedback: tick });

function showSplash() {
  state.mode = null;
  state.kind = null;
  state.round = 0;
  state.completed = [];
  state.strokeCount = 0;
  state.awaitingInput = true;
  state.inputLocked = false;
  state.reward = false;
  state.mysteryAnswer = null;
  state.boardMetrics = null;
  go('splash');
}

async function startMode(id) {
  return screens.start(async () => {
    const mode = config.modes.find((item) => item.id === id);
    if (!mode) return false;
    state.mode = id;
    state.completed = [];
    state.round = 0;
    state.reward = false;
    state.inputLocked = false;
    if (id === 'guided') {
      state.awaitingInput = true;
      go('guided');
      refreshGuidedShelf();
      say('guided-intro');
    } else if (id === 'mystery') {
      mysteryOrder = shuffle(LAND_FORMS, rng);
      go('mystery');
      renderMysteryRound(true);
    } else {
      go('play');
      setupPlay('island', 'free');
    }
    return true;
  }, { busy: false });
}

function refreshGuidedShelf() {
  document.querySelectorAll('.shelf-screen .landform-card').forEach((card) => {
    card.classList.toggle('is-complete', state.completed.includes(card.dataset.kind));
  });
}

function startGuided(kind) {
  if (!LAND_FORMS.includes(kind)) return false;
  state.mode = 'guided';
  go('play');
  setupPlay(kind, 'guided');
  return true;
}

function setupPlay(kind, mode) {
  destroyBoard();
  state.mode = mode;
  state.kind = kind;
  state.tool = mode === 'guided' ? config.challenges[kind].tool : 'pour';
  state.strokeCount = 0;
  state.awaitingInput = true;
  state.inputLocked = false;
  state.reward = false;
  state.boardMetrics = null;

  const screen = screens.el('play');
  screen.classList.toggle('is-free', mode === 'free');
  screen.querySelector('[data-reward]').hidden = true;
  screen.querySelector('[data-sailing]').hidden = true;
  screen.querySelector('[data-play-title]').textContent = mode === 'free' ? 'Build your own coast' : config.voice[`${kind}-prompt`];
  screen.querySelector('[data-play-clue]').textContent = mode === 'free'
    ? 'Pour land, scoop water, then launch your little boat.'
    : config.voice[`${kind}-clue`];
  const progressHost = screen.querySelector('[data-play-progress]');
  progressHost.replaceChildren();
  if (mode === 'guided') progressHost.append(progressDots(LAND_FORMS.length, state.completed.length));

  const basin = screen.querySelector('[data-board]');
  board = createLandformBoard(basin, {
    kind,
    tool: state.tool,
    color: config.field.color,
    guide: mode === 'guided',
    onStroke: onBoardStroke,
  });
  chooseTool(state.tool, false);
  requestAnimationFrame(() => board?.resize());
  nudger.arm();
  if (mode === 'free') say('free-intro');
  else narrator.saySequence([
    [`${kind}-prompt`, config.voice[`${kind}-prompt`]],
    [`${kind}-clue`, config.voice[`${kind}-clue`]],
  ]);
}

function chooseTool(tool, speak = false) {
  if (tool !== 'pour' && tool !== 'scoop') return false;
  state.tool = tool;
  board?.setTool(tool);
  document.querySelectorAll('.tool-button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tool === tool);
  });
  if (speak) say(`${tool}-tool`);
  nudger.poke();
  return true;
}

function pulseRecommendedTool() {
  const wanted = state.mode === 'guided' ? config.challenges[state.kind]?.tool : state.tool;
  const button = document.querySelector(`.tool-button[data-tool="${wanted}"]`);
  button?.classList.add('is-hinting');
  timers.after(1200, () => button?.classList.remove('is-hinting'));
}

function resetBoard() {
  if (!board || state.inputLocked) return false;
  state.strokeCount = 0;
  state.boardMetrics = board.reset(state.kind);
  chooseTool(state.mode === 'guided' ? config.challenges[state.kind].tool : 'pour', false);
  if (state.mode === 'guided') say(`${state.kind}-prompt`);
  else say('free-intro');
  nudger.poke();
  return true;
}

function onBoardStroke(metrics) {
  if (state.inputLocked) return;
  state.boardMetrics = { ...metrics };
  if (!metrics.changed) {
    nudger.poke();
    return;
  }
  state.strokeCount += 1;
  playSfx(state.tool === 'pour' ? 'pop' : 'whoosh');
  nudger.poke();
  if (state.mode === 'guided' && metrics.complete) completeGuided();
}

function completeGuided() {
  if (state.reward || state.inputLocked) return;
  state.reward = true;
  state.inputLocked = true;
  state.awaitingInput = false;
  if (!state.completed.includes(state.kind)) state.completed.push(state.kind);
  board?.setGuide(false);
  if (board?.canvas) board.canvas.style.pointerEvents = 'none';
  nudger.stop();

  const reward = document.querySelector('[data-reward]');
  reward.hidden = false;
  reward.querySelector('[data-reward-title]').textContent = `You made a ${LABEL[state.kind]}!`;
  reward.querySelector('[data-reward-copy]').textContent = config.voice[`${state.kind}-clue`];
  celebrationDispose = tada({
    host: screens.el('play'),
    count: 34,
    duration: 2300,
    rng,
    palette: ['#78b82a', '#f0cc66', '#36a7a8', '#f48772', '#fff4cf'],
    piece: { width: 13, height: 10, radius: '48% 42% 50% 38%' },
  });
  say(`made-${state.kind}`);
}

function continueGuided() {
  if (!state.reward || state.mode !== 'guided') return false;
  if (state.completed.length >= LAND_FORMS.length) {
    showEnd('guided');
  } else {
    go('guided');
    refreshGuidedShelf();
    say('again');
  }
  return true;
}

function launchBoat() {
  if (state.mode !== 'free' || !board || state.inputLocked) return false;
  if (state.strokeCount < 3) {
    say('sail-nudge');
    pulseRecommendedTool();
    return false;
  }
  state.inputLocked = true;
  state.awaitingInput = false;
  const layer = document.querySelector('[data-sailing]');
  layer.hidden = false;
  layer.style.setProperty('--sail-duration', `${timers.ms(3000)}ms`);
  layer.style.setProperty('--sail-friend-duration', `${timers.ms(500)}ms`);
  layer.style.setProperty('--sail-friend-delay', `${timers.ms(1650)}ms`);
  layer.classList.remove('is-sailing');
  void layer.offsetWidth;
  layer.classList.add('is-sailing');
  playSfx('whoosh');

  const scored = LAND_FORMS.map((kind) => measureLandform(board.getField(), kind)).sort((a, b) => b.score - a.score);
  const nearest = scored[0];
  const secondLine = nearest.complete ? [`made-${nearest.kind}`, config.voice[`made-${nearest.kind}`]] : ['new-coast', config.voice['new-coast']];
  narrator.saySequence([['sail-ready', config.voice['sail-ready']], secondLine]);
  sailDispose = () => {
    layer.hidden = true;
    layer.classList.remove('is-sailing');
  };
  timers.after(3300, () => {
    sailDispose?.();
    sailDispose = null;
    state.inputLocked = false;
    state.awaitingInput = true;
    nudger.arm();
  });
  return true;
}

function renderMysteryRound(includeIntro = false) {
  clearMysteryHandlers();
  celebrationDispose?.();
  celebrationDispose = null;
  const answer = mysteryOrder[state.round];
  state.kind = answer;
  state.mysteryAnswer = answer;
  state.awaitingInput = true;
  state.inputLocked = false;
  state.reward = false;
  document.querySelector('[data-mystery-clue]').textContent = config.voice[`${answer}-clue`];
  const progressHost = document.querySelector('[data-mystery-progress]');
  progressHost.replaceChildren(progressDots(LAND_FORMS.length, state.round));
  const host = document.querySelector('[data-mystery-cards]');
  const order = shuffle(LAND_FORMS, rng);
  host.innerHTML = order.map((kind) => cardMarkup(kind, 'mystery-card')).join('');
  document.querySelector('[data-mystery-friend]').hidden = true;
  host.querySelectorAll('.mystery-card').forEach((card) => {
    card.dataset.role = card.dataset.kind === answer ? 'correct' : 'wrong';
    mysteryDisposers.push(onTap(card, () => chooseMystery(card), { feedback: tick }));
  });
  nudger.arm();
  const clue = [`${answer}-clue`, config.voice[`${answer}-clue`]];
  if (includeIntro) narrator.saySequence([['mystery-intro', config.voice['mystery-intro']], clue]);
  else narrator.say(...clue);
}

function chooseMystery(card) {
  if (state.inputLocked || state.screen !== 'mystery') return false;
  const kind = card.dataset.kind;
  nudger.poke();
  if (kind !== state.mysteryAnswer) {
    card.classList.add('is-wrong');
    playSfx('boing');
    say('mystery-nudge');
    timers.after(650, () => card.classList.remove('is-wrong'));
    return false;
  }

  state.inputLocked = true;
  state.awaitingInput = false;
  state.reward = true;
  card.classList.add('is-correct');
  document.querySelector('[data-mystery-friend]').hidden = false;
  celebrationDispose = tada({ host: screens.el('mystery'), count: 24, duration: 1800, rng });
  say('mystery-cheer');
  timers.after(1450, () => {
    state.round += 1;
    if (state.round >= mysteryOrder.length) showEnd('mystery');
    else renderMysteryRound(false);
  });
  return true;
}

function showEnd(mode = state.mode) {
  state.mode = mode;
  state.awaitingInput = false;
  state.inputLocked = false;
  state.reward = true;
  go('end');
  const title = document.querySelector('[data-end-title]');
  const copy = document.querySelector('[data-end-copy]');
  if (mode === 'mystery') {
    title.textContent = 'Mystery Map master!';
    copy.textContent = 'You found every landform.';
    say('mystery-cheer');
  } else {
    title.textContent = 'Wonderful exploring!';
    copy.textContent = 'You built all four landforms.';
    say('all-built');
  }
  celebrationDispose = tada({ host: screens.el('end'), count: 42, duration: 2600, rng });
}

function playAgain() {
  const mode = state.mode;
  if (!mode) return showSplash();
  if (mode === 'guided') {
    state.kind = null;
    state.tool = 'pour';
    state.completed = [];
    state.round = 0;
    state.strokeCount = 0;
    state.awaitingInput = true;
    state.inputLocked = false;
    state.reward = false;
    state.boardMetrics = null;
    go('guided');
    refreshGuidedShelf();
    say('guided-intro');
  } else if (mode === 'mystery') {
    state.round = 0;
    mysteryOrder = shuffle(LAND_FORMS, rng);
    go('mystery');
    renderMysteryRound(true);
  } else {
    go('play');
    setupPlay('island', 'free');
  }
  return true;
}

function repeatPrompt() {
  if (state.screen === 'guided') return say('guided-intro');
  if (state.screen === 'mystery' && state.mysteryAnswer) return say(`${state.mysteryAnswer}-clue`);
  if (state.screen === 'play' && state.mode === 'guided') return say(`${state.kind}-prompt`);
  if (state.screen === 'play') return say('free-intro');
  if (state.screen === 'end') return say(state.mode === 'mystery' ? 'mystery-cheer' : 'all-built');
  return say('welcome');
}

installUnlockOnGesture({
  onFirst(event) {
    if (state.screen !== 'splash') return;
    if (event.target?.closest?.('[data-mode], [data-hud="home"]')) return;
    say('welcome');
  },
});
installKioskGuards();

const imagePaths = [
  ASSET.tray, ASSET.title, ASSET['clay-lump'], ASSET.scoop, ASSET['action-plaque'],
  ASSET.boat, ASSET.fish, ASSET.turtle, ...Object.values(ASSET.cards),
];
const preloadImages = Promise.all(imagePaths.map((src) => new Promise((resolve) => {
  const image = new Image();
  image.onload = image.onerror = resolve;
  image.src = src;
})));
const ready = Promise.all([
  voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
  preloadImages,
]).then(() => { state.ready = true; });

function publicState() {
  return {
    ...state,
    completed: [...state.completed],
    boardMetrics: state.boardMetrics ? { ...state.boardMetrics } : null,
    mysteryOrder: [...mysteryOrder],
    timerCount: timers.size(),
  };
}

async function debugTap(id) {
  // Several screens intentionally reuse semantic ids (the guided and Mystery
  // shelves both expose `landform-island`, for example). Resolve the visible
  // target, not merely the first matching node in DOM order.
  const target = [...mount.querySelectorAll('[data-target]')].find((node) => (
    node.dataset.target === id && node.getClientRects().length > 0 && !node.disabled
  ));
  if (!target) return false;
  // Exercise tap.js's real pointer path. Calling HTMLElement.click() can be
  // truthfully suppressed for 700ms after a real touch (tap.js's duplicate-
  // click guard), which would make a fast QA tap look rejected even though a
  // child's next pointer press is accepted.
  const pointerId = 9001;
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId, isPrimary: true, pointerType: 'touch' }));
  target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId, isPrimary: true, pointerType: 'touch' }));
  await Promise.resolve();
  return true;
}

async function debugWinRound() {
  if (state.screen === 'guided') {
    const next = LAND_FORMS.find((kind) => !state.completed.includes(kind)) || 'island';
    startGuided(next);
  }
  if (state.screen === 'mystery') return debugTap(`landform-${state.mysteryAnswer}`);
  if (state.screen !== 'play') return false;
  if (state.mode === 'free') {
    board.applyStroke([{ x: .34, y: .5 }, { x: .66, y: .5 }], 'pour');
    board.applyStroke([{ x: .36, y: .42 }, { x: .64, y: .42 }], 'pour');
    board.applyStroke([{ x: .40, y: .60 }, { x: .60, y: .60 }], 'pour');
    return launchBoat();
  }
  const recipes = {
    island: [[[{ x: .35, y: .5 }, { x: .65, y: .5 }], 'pour']],
    lake: Array.from({ length: 4 }, () => [[{ x: .5, y: .5 }], 'scoop']),
    peninsula: [[[{ x: .20, y: .5 }, { x: .70, y: .5 }], 'pour']],
    bay: [
      [[{ x: .88, y: .5 }, { x: .42, y: .5 }], 'scoop'],
      [[{ x: .88, y: .5 }, { x: .42, y: .5 }], 'scoop'],
    ],
  };
  for (const [points, tool] of recipes[state.kind]) {
    if (state.reward) break;
    board.applyStroke(points, tool);
  }
  return state.reward;
}

installDebug({
  gameId: config.id,
  engine: 'clay-heightfield-landforms',
  ready,
  listModes: () => config.modes.map(({ id, title, skill }) => ({ id, title, skill })),
  startMode,
  getState: publicState,
  tap: debugTap,
  winRound: debugWinRound,
  home: showSplash,
  mute(on = true) {
    state.muted = Boolean(on);
    narrator.setMuted(state.muted);
    voiceClips.setMuted(state.muted);
    if (state.muted) {
      narrator.stop();
      voiceClips.stop();
      try { window.speechSynthesis?.cancel(); } catch { /* optional browser channel */ }
    }
    document.querySelectorAll('audio, video').forEach((node) => { node.muted = state.muted; });
    return state.muted;
  },
  timers,
  narrator,
  voice: voiceClips,
  sfx,
  onSeed(nextRng, seed) {
    rng = nextRng;
    state.seed = seed;
  },
  applyStroke(points, tool = state.tool) {
    if (!board) return null;
    return board.applyStroke(points, tool);
  },
  getBoardMetrics: () => board?.getMetrics() || null,
  triggerIdleHint: performIdleNudge,
  setLandform(kind) {
    if (!LAND_FORMS.includes(kind)) return false;
    if (state.screen !== 'play') startGuided(kind);
    else {
      state.kind = kind;
      state.reward = false;
      state.inputLocked = false;
      state.awaitingInput = true;
      state.strokeCount = 0;
      state.boardMetrics = board.reset(kind);
      chooseTool(config.challenges[kind].tool, false);
    }
    return true;
  },
  getAudioLog: voiceClips.getAudioLog,
  clearAudioLog: voiceClips.clearAudioLog,
});
