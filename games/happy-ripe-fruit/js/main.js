import config from '../config.js';
import { createScreens } from '../../../shared/js/screens.js';
import { hudButton, progressDots, soundDebounce } from '../../../shared/js/hud.js';
import { onTap } from '../../../shared/js/tap.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as bgm from '../../../shared/js/bgm.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { createTimers } from '../../../shared/js/timers.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';

const app = document.getElementById('app');
const FRUITS = config.progression.fruits;
const STAGES = ['early', 'ripe', 'late'];
const STORAGE_KEY = 'qlobe:happy-ripe-fruit:v1';
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;

function loadProgress() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const saved = Array.isArray(parsed.completed) ? parsed.completed : [];
    const contiguous = [];
    for (const fruit of FRUITS) {
      if (!saved.includes(fruit)) break;
      contiguous.push(fruit);
    }
    return contiguous;
  } catch {
    return [];
  }
}

const state = {
  ready: false,
  screen: 'splash',
  fruitId: null,
  round: 0,
  basketCount: 0,
  hintShown: false,
  wrongAttempts: 0,
  transitioning: false,
  completed: loadProgress(),
  stageOrder: [...STAGES],
  seed: 42,
  muted: false,
};

let rng = mulberry32(state.seed);
let drag = null;
let stopConfetti = null;
const timers = createTimers();

app.innerHTML = `
  <section class="fruit-screen qk-screen" data-qk-screen="splash" aria-label="Happy Ripe Fruit welcome"></section>
  <section class="fruit-screen qk-screen" data-qk-screen="select" aria-label="Choose a fruit patch" hidden></section>
  <section class="fruit-screen qk-screen" data-qk-screen="play" aria-label="Pick the ripe fruit" hidden></section>
  <section class="fruit-screen qk-screen" data-qk-screen="reward" aria-label="Fruit patch complete" hidden></section>
  <section class="fruit-screen qk-screen" data-qk-screen="party" aria-label="Rainbow harvest party" hidden></section>`;

const narrator = createNarrator({
  announcerParent: app,
  say: (key, text) => bgm.duckDuring(voiceClips.say(key, text)),
});

function clearLiveInteraction() {
  timers.clearAll();
  nudger.stop();
  if (drag) {
    drag.cancel();
    drag.detach();
    drag = null;
  }
  if (stopConfetti) {
    stopConfetti();
    stopConfetti = null;
  }
  document.querySelectorAll('[data-qk-drag-ghost]').forEach((node) => node.remove());
}

const screens = createScreens({
  root: app,
  initial: 'splash',
  voice: narrator,
  onExit: clearLiveInteraction,
});

const nudger = createNudger({
  first: 12000,
  repeat: 14000,
  onNudge: (count) => {
    if (state.screen !== 'play' || state.transitioning) return;
    if (count > 0) revealHint();
    narrator.say('idle', config.voice.idle);
  },
});

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ completed: state.completed }));
  } catch {
    // Progress is a convenience; private browsing must never block play.
  }
}

function img(src, className, alt = '') {
  return `<img class="${className}" src="${src}" alt="${alt}" draggable="false">`;
}

function scenePlate(source = config.assets.backgrounds.orchard, alt = '') {
  return img(source, 'orchard-plate', alt);
}

function actionPlaque(label, target, extraClass = '') {
  return `<button class="plaque-button ${extraClass}" type="button" data-target="${target}">
    ${img(config.assets.ui.promptPlaque, 'plaque-button-art')}
    <span>${label}</span>
  </button>`;
}

function addHud(screen, { home = false, back = false, sound = true } = {}) {
  if (home) {
    const link = document.createElement('a');
    link.href = '../../';
    link.className = 'qk-hud-btn qk-hud-home qk-hud-top-left';
    link.dataset.target = 'home';
    link.dataset.hud = 'home';
    link.setAttribute('aria-label', 'Home');
    screen.append(link);
  }
  if (back) {
    const button = hudButton('back', showSplash, { label: 'Back to welcome' });
    button.classList.add('qk-hud-top-left');
    button.dataset.target = 'back';
    screen.append(button);
    screens.hold(button.dispose);
  }
  if (sound) {
    const button = hudButton('sound', repeatPrompt, { label: 'Hear that again' });
    button.classList.add('qk-hud-bottom-left');
    button.dataset.target = 'sound';
    screen.append(button);
    screens.hold(button.dispose);
  }
}

function go(name, render, { silent = false } = {}) {
  screens.show(name, { force: screens.is(name), silent });
  state.screen = name;
  render();
}

function speak(key) {
  return narrator.say(key, config.voice[key]);
}

const repeatPrompt = soundDebounce(() => {
  const key = state.screen === 'play' && state.fruitId
    ? `${state.fruitId}-prompt`
    : state.screen === 'select'
      ? 'choose-patch'
      : state.screen === 'party'
        ? 'finale'
        : state.screen === 'reward' && state.fruitId
          ? `${state.fruitId}-complete`
          : 'welcome';
  speak(key);
}, 650);

function renderSplash() {
  const screen = screens.el('splash');
  screen.innerHTML = `${scenePlate(config.assets.backgrounds.orchard, 'A sunny painted fruit orchard')}
    <div class="splash-world">
      ${img(config.assets.backgrounds.title, 'title-lockup', 'Happy Ripe Fruit')}
      <div class="fruit-parade" aria-hidden="true">
        ${FRUITS.map((fruit, index) => img(config.assets.fruits[fruit].ripe, `parade-fruit parade-${index}`)).join('')}
      </div>
      <button class="splash-basket" type="button" data-target="basket-start" aria-label="Start picking with the harvest basket">${img(config.assets.basket.empty, 'basket-art')}</button>
      ${actionPlaque('Start picking!', 'start', 'start-button')}
      <p class="splash-tagline">Look closely. Pick what is just right!</p>
    </div>`;
  addHud(screen, { home: true, sound: true });
  const begin = () => showSelect({ withWelcome: true });
  screen.querySelectorAll('[data-target="start"], [data-target="basket-start"]').forEach((start) => {
    screens.hold(onTap(start, begin, { feedback: () => sfx.pop() }));
  });
}

function isUnlocked(fruit) {
  const index = FRUITS.indexOf(fruit);
  return index === 0 || state.completed.includes(FRUITS[index - 1]);
}

function renderSelect() {
  const screen = screens.el('select');
  const cards = FRUITS.map((fruit, index) => {
    const unlocked = isUnlocked(fruit);
    const complete = state.completed.includes(fruit);
    const detail = config.fruitDetails[fruit];
    return `<button class="fruit-patch ${unlocked ? 'is-unlocked' : 'is-locked'} ${complete ? 'is-complete' : ''}"
      type="button" data-fruit="${fruit}" data-target="fruit-${fruit}" ${unlocked ? '' : 'disabled'}
      aria-label="${unlocked ? `${detail.title}${complete ? ', badge earned' : ''}` : `${detail.title}, locked`}">
      ${img(config.assets.badges[fruit], 'patch-badge')}
      ${complete ? '<span class="patch-check" aria-hidden="true">&#10003;</span>' : ''}
      ${unlocked ? '' : img(config.assets.ui.lockedRibbon, 'patch-lock')}
      <span class="patch-name">${detail.title}</span>
      <span class="patch-number">${index + 1}</span>
    </button>`;
  }).join('');
  screen.innerHTML = `${scenePlate(config.assets.backgrounds.orchard, 'A sunny fruit orchard with six garden patches')}
    <div class="select-world">
      <div class="prompt-sign select-sign">${img(config.assets.ui.promptPlaque, 'prompt-sign-art')}<div><strong>Choose a fruit patch</strong><small>Earn all six sunny badges</small></div></div>
      <div class="patch-grid">${cards}</div>
      ${state.completed.length === FRUITS.length ? actionPlaque('Rainbow party!', 'party', 'party-shortcut') : ''}
    </div>`;
  addHud(screen, { back: true, sound: true });
  screen.querySelectorAll('.fruit-patch:not(:disabled)').forEach((button) => {
    screens.hold(onTap(button, () => startFruit(button.dataset.fruit), { feedback: () => sfx.pop() }));
  });
  const party = screen.querySelector('[data-target="party"]');
  if (party) screens.hold(onTap(party, showParty, { feedback: () => sfx.sparkle() }));
  nudger.arm();
}

function showSelect({ withWelcome = false } = {}) {
  go('select', renderSelect, { silent: withWelcome });
  if (withWelcome) {
    narrator.saySequence([
      ['welcome', config.voice.welcome],
      { key: 'choose-patch', text: config.voice['choose-patch'], gap: 120 },
    ]);
  } else {
    speak('choose-patch');
  }
}

function harvestedMarkup() {
  return Array.from({ length: state.basketCount }, (_, index) =>
    img(config.assets.fruits[state.fruitId].ripe, `harvested-fruit harvested-${index}`)).join('');
}

function playChoicesMarkup() {
  return state.stageOrder.map((stage, position) => `<button class="fruit-choice choice-${position}"
    type="button" data-fruit-choice data-stage="${stage}" data-target="${stage}" data-result="${stage === 'ripe' ? 'correct' : 'wrong'}"
    aria-label="Fruit choice ${position + 1}">
    ${img(config.assets.fruits[state.fruitId][stage], 'choice-fruit')}
    ${img(config.assets.stageTokens[stage], 'stage-token', `${stage} fruit`)}
  </button>`).join('');
}

function renderPlay() {
  state.transitioning = false;
  state.hintShown = false;
  state.wrongAttempts = 0;
  state.stageOrder = shuffle(STAGES, rng);
  const fruit = state.fruitId;
  const detail = config.fruitDetails[fruit];
  const screen = screens.el('play');
  screen.classList.remove('hint-is-on');
  screen.innerHTML = `${scenePlate(config.assets.backgrounds.orchard, `The ${detail.title}`)}
    <div class="play-world" data-current-fruit="${fruit}">
      <div class="round-progress" aria-label="Round ${state.round + 1} of ${config.progression.rounds}"></div>
      <div class="prompt-sign play-sign">${img(config.assets.ui.promptPlaque, 'prompt-sign-art')}<div><strong>Which ${detail.short} is ripe?</strong><small data-hint-copy>Look for ${detail.ripeCue}</small></div></div>
      <div class="plant-stage">
        ${img(config.assets.plants[fruit], 'fruit-plant', `${detail.title} plant`)}
        <div class="fruit-choices">${playChoicesMarkup()}</div>
      </div>
      <div class="basket-shell" data-slot="basket" data-target="basket" aria-label="Harvest basket">
        ${img(config.assets.basket[state.basketCount === 0 ? 'empty' : ['one', 'two', 'three'][state.basketCount - 1]], 'basket-art', 'Harvest basket')}
        <div class="harvested-layer" aria-hidden="true">${harvestedMarkup()}</div>
        <span class="basket-callout">Tap or drag</span>
      </div>
    </div>`;
  const dots = progressDots(config.progression.rounds, state.round);
  screen.querySelector('.round-progress').append(dots);
  addHud(screen, { back: true, sound: true });
  wireFruitChoices(screen);
  nudger.arm();
}

function wireFruitChoices(screen) {
  drag = createDragToSlotDom({
    root: screen,
    ghostHost: screen,
    slotSelector: '[data-slot="basket"]',
    slotPad: 72,
    hoverClass: 'is-ready',
    ghostClass: 'qk-drag-ghost fruit-drag-ghost',
    getPiece: (stage) => {
      const el = screen.querySelector(`[data-fruit-choice][data-stage="${stage}"]`);
      return el ? { el, stage } : null;
    },
    makeGhost: (piece) => {
      const ghost = piece.el.querySelector('.choice-fruit').cloneNode(true);
      ghost.removeAttribute('alt');
      return ghost;
    },
    canStart: () => !state.transitioning && state.screen === 'play',
    onLift: () => sfx.whoosh(),
    onTap: (piece) => chooseStage(piece.stage, piece.el),
    onDrop: (piece, record) => {
      if (record.slot?.matches('[data-slot="basket"]')) chooseStage(piece.stage, piece.el);
    },
  });
  screens.hold(() => drag?.cancel(), () => drag?.detach());
  screen.querySelectorAll('[data-fruit-choice]').forEach((button) => {
    const onDown = (event) => drag?.begin(event, button.dataset.stage);
    const onClick = (event) => {
      if (event.detail === 0) chooseStage(button.dataset.stage, button);
    };
    button.addEventListener('pointerdown', onDown);
    button.addEventListener('click', onClick);
    screens.hold(() => {
      button.removeEventListener('pointerdown', onDown);
      button.removeEventListener('click', onClick);
    });
  });
}

function revealHint() {
  if (state.screen !== 'play') return;
  state.hintShown = true;
  const screen = screens.el('play');
  screen.classList.add('hint-is-on');
  screen.querySelector('[data-stage="ripe"]')?.classList.add('is-ripe-hint');
  const copy = screen.querySelector('[data-hint-copy]');
  if (copy) copy.textContent = `Ripe means ${config.fruitDetails[state.fruitId].ripeCue}`;
}

function chooseStage(stage, button) {
  if (state.transitioning || state.screen !== 'play') return false;
  nudger.poke();
  if (stage !== 'ripe') {
    state.wrongAttempts += 1;
    revealHint();
    button?.classList.remove('is-wrong');
    void button?.offsetWidth;
    button?.classList.add('is-wrong');
    sfx.boing();
    speak(stage === 'early' ? 'retry-early' : 'retry-late');
    timers.after(650, () => button?.classList.remove('is-wrong'));
    return false;
  }

  state.transitioning = true;
  const basket = screens.el('play').querySelector('.basket-shell');
  const from = button?.getBoundingClientRect();
  const to = basket?.getBoundingClientRect();
  if (button && from && to && !reducedMotion) {
    button.style.setProperty('--fly-x', `${to.left + to.width * 0.5 - (from.left + from.width * 0.5)}px`);
    button.style.setProperty('--fly-y', `${to.top + to.height * 0.35 - (from.top + from.height * 0.5)}px`);
    button.classList.add('is-picked');
  }
  sfx.sparkle();
  timers.after(reducedMotion ? 80 : 540, () => {
    state.basketCount = Math.min(config.progression.rounds, state.round + 1);
    updateBasket();
    speak(['praise-one', 'praise-two', 'praise-three'][state.round]);
    if (state.round < config.progression.rounds - 1) {
      timers.after(760, () => {
        state.round += 1;
        go('play', renderPlay);
        speak(`${state.fruitId}-prompt`);
      });
    } else {
      timers.after(900, finishFruit);
    }
  });
  return true;
}

function updateBasket() {
  const shell = screens.el('play').querySelector('.basket-shell');
  if (!shell) return;
  const art = shell.querySelector('.basket-art');
  art.src = config.assets.basket[['empty', 'one', 'two', 'three'][state.basketCount]];
  shell.querySelector('.harvested-layer').innerHTML = harvestedMarkup();
  shell.classList.remove('basket-pop');
  void shell.offsetWidth;
  shell.classList.add('basket-pop');
}

function startFruit(fruit) {
  if (!FRUITS.includes(fruit)) return false;
  return screens.start(() => {
    state.fruitId = fruit;
    state.round = 0;
    state.basketCount = 0;
    state.hintShown = false;
    state.transitioning = false;
    go('play', renderPlay);
    speak(`${fruit}-prompt`);
    return true;
  }, { busy: false });
}

function finishFruit() {
  const fruit = state.fruitId;
  if (!state.completed.includes(fruit)) {
    state.completed.push(fruit);
    state.completed.sort((a, b) => FRUITS.indexOf(a) - FRUITS.indexOf(b));
    saveProgress();
  }
  go('reward', renderReward);
  speak(`${fruit}-complete`);
}

function renderReward() {
  const screen = screens.el('reward');
  const detail = config.fruitDetails[state.fruitId];
  screen.innerHTML = `${scenePlate(config.assets.backgrounds.orchard, 'The sunny orchard')}
    <div class="reward-world">
      <p class="reward-kicker">Patch complete!</p>
      <div class="reward-badge-stack">
        ${img(config.assets.ui.rewardWreath, 'reward-wreath')}
        ${img(config.assets.badges[state.fruitId], 'reward-badge', `${detail.title} badge`)}
      </div>
      <div class="reward-harvest" aria-label="Three ripe fruits collected">
        ${[0, 1, 2].map((index) => img(config.assets.fruits[state.fruitId].ripe, `reward-fruit reward-fruit-${index}`)).join('')}
        ${img(config.assets.basket.three, 'reward-basket')}
      </div>
      <h2>${detail.title} badge!</h2>
      ${actionPlaque(state.completed.length === FRUITS.length ? 'Rainbow party!' : 'Keep picking!', 'continue', 'continue-button')}
    </div>`;
  addHud(screen, { back: true, sound: true });
  const button = screen.querySelector('[data-target="continue"]');
  screens.hold(onTap(button, () => {
    if (state.completed.length === FRUITS.length) showParty();
    else showSelect();
  }, { feedback: () => sfx.tada() }));
  stopConfetti = burstConfetti({ host: screen, count: 30, duration: 2200, rng });
}

function renderParty() {
  const screen = screens.el('party');
  screen.innerHTML = `${scenePlate(config.assets.backgrounds.party, 'All six happy ripe fruits celebrate in the orchard')}
    <div class="party-world">
      ${img(config.assets.backgrounds.title, 'party-title', 'Happy Ripe Fruit')}
      <p class="party-kicker">Rainbow harvest!</p>
      <div class="party-badges" aria-label="Six fruit badges earned">
        ${FRUITS.map((fruit) => img(config.assets.badges[fruit], 'party-badge', `${config.fruitDetails[fruit].title} badge`)).join('')}
      </div>
      ${actionPlaque('Visit the orchard', 'visit-orchard', 'party-button')}
    </div>`;
  addHud(screen, { back: true, sound: true });
  const button = screen.querySelector('[data-target="visit-orchard"]');
  screens.hold(onTap(button, showSelect, { feedback: () => sfx.tada() }));
  stopConfetti = burstConfetti({
    host: screen,
    count: 42,
    duration: 3600,
    loop: true,
    rng,
    palette: ['#ff665d', '#ffd85b', '#77c95a', '#65b8ed', '#b886d9'],
  });
}

function showParty() {
  go('party', renderParty);
  speak('finale');
}

function showSplash() {
  state.fruitId = null;
  state.transitioning = false;
  go('splash', renderSplash);
}

function flattenAssetPaths(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenAssetPaths);
  if (value && typeof value === 'object') return Object.values(value).flatMap(flattenAssetPaths);
  return [];
}

bgm.preload(config.music);
const voiceReady = Promise.race([
  voiceClips.init(config.assets.audio.manifest, config.assets.audio.lines, config.voice),
  new Promise((resolve) => window.setTimeout(resolve, 2500)),
]);
const ready = Promise.all([
  voiceReady,
  preloadImages(flattenAssetPaths(config.assets).filter((path) => /\.(?:png|jpe?g|webp)$/i.test(path))),
]).then(() => {
  state.ready = true;
  return true;
});

const disposeUnlock = installUnlockOnGesture({
  target: window,
  extra: [bgm.unlock],
  onFirst: () => bgm.play(config.music, { key: 'happy-ripe-fruit', fadeInMs: 750 }),
});
const disposeKiosk = installKioskGuards();

function getState() {
  return {
    ...state,
    completed: [...state.completed],
    stageOrder: [...state.stageOrder],
    unlocked: FRUITS.filter(isUnlocked),
    timers: timers.size(),
    reducedMotion,
  };
}

function getTargets() {
  return [...app.querySelectorAll('[data-target]')].flatMap((node) => {
    const rect = node.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return [];
    return [{
      id: node.dataset.target,
      role: node.dataset.result || (node.disabled ? 'locked' : 'neutral'),
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    }];
  });
}

function debugTap(id) {
  const escaped = window.CSS?.escape ? CSS.escape(String(id)) : String(id).replace(/"/g, '\\"');
  const node = app.querySelector(`[data-target="${escaped}"]`);
  if (!node || node.disabled) return false;
  node.click();
  return true;
}

function debugCompleteFruit(fruit) {
  if (!FRUITS.includes(fruit)) return false;
  state.fruitId = fruit;
  state.round = config.progression.rounds - 1;
  state.basketCount = config.progression.rounds;
  if (!state.completed.includes(fruit)) state.completed.push(fruit);
  state.completed.sort((a, b) => FRUITS.indexOf(a) - FRUITS.indexOf(b));
  saveProgress();
  if (state.completed.length === FRUITS.length) showParty();
  else {
    go('reward', renderReward);
  }
  return true;
}

function debugSetRound(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return false;
  state.round = Math.max(0, Math.min(config.progression.rounds - 1, Math.floor(n)));
  state.basketCount = state.round;
  if (state.screen === 'play') go('play', renderPlay);
  return state.round;
}

function debugWinRound() {
  const button = screens.el('play')?.querySelector('[data-stage="ripe"]');
  return chooseStage('ripe', button);
}

function getLayout() {
  const rect = (selector) => {
    const box = app.querySelector(selector)?.getBoundingClientRect();
    return box ? { x: box.x, y: box.y, w: box.width, h: box.height } : null;
  };
  return { viewport: { w: innerWidth, h: innerHeight }, prompt: rect('.prompt-sign'), plant: rect('.plant-stage'), basket: rect('.basket-shell') };
}

installDebug({
  gameId: config.id,
  engine: 'dom-raster-orchard',
  version: 1,
  ready,
  root: app,
  timers,
  narrator,
  sfx,
  voice: voiceClips,
  listModes: () => FRUITS.map((id) => ({ id, title: config.fruitDetails[id].title })),
  startMode: startFruit,
  startFruit,
  setRound: debugSetRound,
  completeFruit: debugCompleteFruit,
  getState,
  getTargets,
  tap: debugTap,
  winRound: debugWinRound,
  home: showSplash,
  getLayout,
  getAudioLog: voiceClips.getAudioLog,
  clearAudioLog: voiceClips.clearAudioLog,
  audio: { get log() { return voiceClips.getAudioLog(); } },
  onSeed: (next, seed) => {
    rng = next;
    state.seed = seed;
    if (state.screen === 'play') go('play', renderPlay);
  },
  mute: (on = true) => {
    state.muted = Boolean(on);
    voiceClips.setMuted(state.muted);
    narrator.setMuted(state.muted);
    bgm.setMuted(state.muted);
    return state.muted;
  },
});

window.addEventListener('pagehide', () => {
  clearLiveInteraction();
  bgm.stop({ fadeOutMs: 0 });
  disposeUnlock();
  disposeKiosk();
}, { once: true });

renderSplash();
