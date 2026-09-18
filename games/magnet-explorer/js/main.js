import config from '../config.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as bgm from '../../../shared/js/bgm.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { createScreens } from '../../../shared/js/screens.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { onTap } from '../../../shared/js/tap.js';

const root = document.querySelector('#game');
const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
const timers = createTimers();
let rng = mulberry32(42);
let dragCleanup = null;
let stepCleanup = null;
let lastDragAt = 0;

const ART = {
  splash: 'assets/backgrounds/splash.webp',
  workbench: 'assets/backgrounds/workbench.webp',
  maze: 'assets/backgrounds/maze.webp',
  title: 'assets/ui/title.png',
  modeTest: 'assets/ui/mode-test.png',
  modeSweep: 'assets/ui/mode-sweep.png',
  modeMaze: 'assets/ui/mode-maze.png',
  pedestal: 'assets/ui/test-pedestal.png',
  trayMagnetic: 'assets/ui/tray-magnetic.png',
  trayNonmagnetic: 'assets/ui/tray-nonmagnetic.png',
  badge: 'assets/ui/badge.png',
  sparkles: 'assets/ui/sparkles.png',
  magnet: 'assets/objects/magnet.png',
  ball: 'assets/objects/steel-ball.png',
  star: 'assets/objects/star-token.png',
};

const MODE_ART = {
  'test-lab': ART.modeTest,
  'treasure-sweep': ART.modeSweep,
  'magnet-maze': ART.modeMaze,
};

const state = {
  screen: 'splash',
  mode: null,
  phase: 'idle',
  round: 0,
  total: 0,
  deck: [],
  currentId: null,
  tested: [],
  collected: [],
  encountered: [],
  magnet: { x: 0.5, y: 0.78 },
  ball: { x: 0.65, y: 0.858 },
  mazeProgress: 0,
  dragging: false,
  muted: false,
  reducedMotion: reduceQuery.matches,
  artFailures: [],
};

const fallbackLines = {
  intro: config.voice.intro.text,
  nudge: config.voice.nudge.text,
  complete: config.voice.complete.text,
  'mode-test': 'Test lab! Bring the magnet close. Will it stick?',
  'mode-sweep': 'Treasure sweep! Move the magnet around and find five magnetic treasures.',
  'mode-maze': 'Magnet maze! Keep the magnet close and guide the shiny ball to the star.',
  magnetic: 'Clink! It sticks. This object is magnetic.',
  nonmagnetic: 'Boing! It does not stick. Great testing.',
  treasure: 'You found a magnetic treasure!',
  'sweep-done': 'You found all five! The magnetic treasures came along for the ride.',
  'maze-near': 'Nice and close. The ball follows the magnet.',
  'maze-done': 'You guided the ball all the way to the star!',
  ...Object.fromEntries(config.objects.map((object) => [object.result.key, object.result.text])),
};

root.innerHTML = `
  <main class="magnet-game" aria-label="Magnet Explorer">
    <section class="game-screen splash-screen" data-qk-screen="splash" aria-label="Choose an experiment">
      <div class="splash-hud"></div>
      <img class="title-art" src="${ART.title}" alt="Magnet Explorer">
      <p class="splash-prompt">Choose an experiment</p>
      <div class="mode-grid">
        ${config.modes.map((mode) => `
          <button class="mode-card" type="button" data-mode="${mode.id}" data-target="mode-${mode.id}">
            <img src="${MODE_ART[mode.id]}" alt="" draggable="false">
            <span>${mode.title}</span>
          </button>`).join('')}
      </div>
    </section>

    <section class="game-screen play-screen" data-qk-screen="play" hidden aria-label="Experiment table">
      <div class="play-hud"></div>
      <div class="prompt-plaque" aria-hidden="true"><span data-prompt>Move the magnet close</span></div>
      <div class="progress-rail" data-progress aria-hidden="true"></div>
      <div class="playfield" data-playfield></div>
      <div class="mode-result" data-result hidden>
        <img class="result-sparkles" src="${ART.sparkles}" alt="">
        <img class="result-badge" src="${ART.badge}" alt="Explorer star badge">
        <p data-result-copy>Great testing!</p>
        <button class="round-next" type="button" data-target="next" aria-label="Next discovery">
          <img src="../../shared/assets/ui/btn-play.png" alt="">
        </button>
      </div>
    </section>

    <section class="game-screen end-screen" data-qk-screen="end" hidden aria-label="Experiment complete">
      <div class="end-hud"></div>
      <img class="end-sparkles" src="${ART.sparkles}" alt="">
      <img class="end-badge" src="${ART.badge}" alt="Explorer star badge">
      <h1>Magnet power!</h1>
      <p>Tested. Searched. Guided.</p>
      <button class="again-button" type="button" data-target="again">
        <img data-again-art src="${ART.modeTest}" alt="">
        <span>Play again</span>
      </button>
    </section>
  </main>`;

const els = {
  game: root.querySelector('.magnet-game'),
  splash: root.querySelector('[data-qk-screen="splash"]'),
  play: root.querySelector('[data-qk-screen="play"]'),
  end: root.querySelector('[data-qk-screen="end"]'),
  field: root.querySelector('[data-playfield]'),
  prompt: root.querySelector('[data-prompt]'),
  progress: root.querySelector('[data-progress]'),
  result: root.querySelector('[data-result]'),
  resultCopy: root.querySelector('[data-result-copy]'),
  next: root.querySelector('[data-target="next"]'),
  again: root.querySelector('[data-target="again"]'),
  againArt: root.querySelector('[data-again-art]'),
};

const narrator = createNarrator({ announcerParent: root });
const screens = createScreens({
  root,
  initial: 'splash',
  voice: narrator,
  onExit(name) {
    if (name === 'play') clearPlay();
  },
});

function addHud() {
  const home = hudButton('home', () => { location.href = '../../'; });
  home.classList.add('qk-hud-top-left');
  home.dataset.target = 'home';
  root.querySelector('.splash-hud').append(home);

  const backPlay = hudButton('back', goSplash);
  backPlay.classList.add('qk-hud-top-left');
  backPlay.dataset.target = 'back';
  const replay = soundDebounce(() => repeatPrompt(), 650);
  const soundPlay = hudButton('sound', replay);
  soundPlay.classList.add('qk-hud-top-right');
  soundPlay.dataset.target = 'sound';
  root.querySelector('.play-hud').append(backPlay, soundPlay);

  const backEnd = hudButton('back', goSplash);
  backEnd.classList.add('qk-hud-top-left');
  backEnd.dataset.target = 'back';
  const soundEnd = hudButton('sound', soundDebounce(() => speak('complete'), 650));
  soundEnd.classList.add('qk-hud-top-right');
  soundEnd.dataset.target = 'sound';
  root.querySelector('.end-hud').append(backEnd, soundEnd);
}

function speak(key, text = fallbackLines[key]) {
  return bgm.duckDuring(narrator.say(key, text));
}

function repeatPrompt() {
  if (state.mode === 'test-lab') return speak('mode-test');
  if (state.mode === 'treasure-sweep') return speak('mode-sweep');
  if (state.mode === 'magnet-maze') return speak('mode-maze');
  return speak('intro');
}

function setPrompt(text) {
  els.prompt.textContent = text;
}

function renderProgress() {
  const done = state.mode === 'treasure-sweep' ? state.collected.length : state.round;
  els.progress.innerHTML = '';
  for (let i = 0; i < state.total; i += 1) {
    const star = document.createElement('img');
    star.src = ART.star;
    star.alt = '';
    star.className = i < done ? 'is-done' : i === done ? 'is-now' : '';
    els.progress.append(star);
  }
}

function clearPlay() {
  timers.clearAll();
  nudger.stop();
  dragCleanup?.();
  dragCleanup = null;
  stepCleanup?.();
  stepCleanup = null;
  state.dragging = false;
  els.field.replaceChildren();
  els.result.hidden = true;
  els.play.classList.remove('mode-test-lab', 'mode-treasure-sweep', 'mode-magnet-maze');
}

function goSplash() {
  state.screen = 'splash';
  state.mode = null;
  state.phase = 'idle';
  bgm.stop({ fadeOutMs: 450 });
  screens.show('splash');
  void speak('intro');
}

function objectById(id) {
  return config.objects.find((object) => object.id === id);
}

function chooseBalancedDeck() {
  const magnetic = shuffle(config.objects.filter((object) => object.outcome === 'magnetic'), rng).slice(0, 3);
  const quiet = shuffle(config.objects.filter((object) => object.outcome !== 'magnetic'), rng).slice(0, 3);
  return shuffle([...magnetic, ...quiet], rng);
}

async function startMode(id) {
  await ready;
  const mode = config.modes.find((candidate) => candidate.id === id);
  if (!mode) return false;
  return screens.start(async () => {
    if (screens.is('play')) clearPlay();
    state.screen = 'play';
    state.mode = id;
    state.phase = 'play';
    state.round = 0;
    state.tested = [];
    state.collected = [];
    state.encountered = [];
    state.currentId = null;
    state.magnet = { x: 0.5, y: 0.8 };
    state.ball = { x: 0.65, y: 0.858 };
    state.mazeProgress = 0;
    els.result.hidden = true;
    screens.show('play', { force: screens.is('play') });
    els.play.classList.add(`mode-${id}`);
    bgm.play(config.music.track, { key: 'magnet-explorer', fadeInMs: 500, loopFadeOutMs: 2200 });

    if (id === 'test-lab') {
      state.deck = chooseBalancedDeck();
      state.total = mode.trials;
      renderTestRound();
      void speak('mode-test');
    } else if (id === 'treasure-sweep') {
      state.total = mode.magneticTreasures;
      renderSweep();
      void speak('mode-sweep');
    } else {
      state.total = 1;
      state.magnet = { x: 0.56, y: 0.825 };
      renderMaze();
      void speak('mode-maze');
    }
    renderProgress();
    nudger.arm();
    return true;
  }, { busy: false });
}

function makeImage(src, className, alt = '') {
  const image = document.createElement('img');
  image.src = src;
  image.alt = alt;
  image.className = className;
  image.draggable = false;
  return image;
}

function setPosition(node, point) {
  node.style.left = `${point.x * 100}%`;
  node.style.top = `${point.y * 100}%`;
}

function fieldPoint(clientX, clientY) {
  const rect = els.field.getBoundingClientRect();
  return {
    x: Math.max(0.08, Math.min(0.92, (clientX - rect.left) / rect.width)),
    y: Math.max(0.12, Math.min(0.9, (clientY - rect.top) / rect.height)),
  };
}

function distanceBetween(a, b) {
  const rect = els.field.getBoundingClientRect();
  return Math.hypot((a.x - b.x) * rect.width, (a.y - b.y) * rect.height);
}

function installMagnet(magnet, onMove) {
  let pointerId = null;
  let moved = false;
  const move = (event) => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    moved = true;
    state.dragging = true;
    state.magnet = fieldPoint(event.clientX, event.clientY);
    setPosition(magnet, state.magnet);
    onMove?.();
    nudger.poke();
  };
  const finish = (event) => {
    if (pointerId === null || (event.pointerId != null && event.pointerId !== pointerId)) return;
    pointerId = null;
    state.dragging = false;
    magnet.classList.remove('is-held');
    if (moved) lastDragAt = performance.now();
  };
  const down = (event) => {
    if (state.phase !== 'play') return;
    event.preventDefault();
    pointerId = event.pointerId;
    moved = false;
    magnet.classList.add('is-held');
    magnet.setPointerCapture?.(pointerId);
  };
  const jump = (event) => {
    if (state.phase !== 'play' || state.mode === 'magnet-maze'
      || performance.now() - lastDragAt < 300 || event.target === magnet) return;
    state.magnet = fieldPoint(event.clientX, event.clientY);
    magnet.classList.add('is-jumping');
    setPosition(magnet, state.magnet);
    timers.after(260, () => magnet.classList.remove('is-jumping'));
    onMove?.();
    nudger.poke();
  };
  const keyMove = (event) => {
    const deltas = {
      ArrowLeft: [-0.045, 0], ArrowRight: [0.045, 0],
      ArrowUp: [0, -0.045], ArrowDown: [0, 0.045],
    };
    const delta = deltas[event.key];
    if (!delta || state.phase !== 'play') return;
    event.preventDefault();
    state.magnet = {
      x: Math.max(0.08, Math.min(0.92, state.magnet.x + delta[0])),
      y: Math.max(0.12, Math.min(0.9, state.magnet.y + delta[1])),
    };
    setPosition(magnet, state.magnet);
    onMove?.();
    nudger.poke();
  };
  const blur = () => finish({});
  magnet.addEventListener('pointerdown', down, { passive: false });
  magnet.addEventListener('keydown', keyMove);
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
  window.addEventListener('blur', blur);
  els.field.addEventListener('click', jump);
  return () => {
    magnet.removeEventListener('pointerdown', down);
    magnet.removeEventListener('keydown', keyMove);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    window.removeEventListener('blur', blur);
    els.field.removeEventListener('click', jump);
  };
}

function makeMagnet() {
  const magnet = makeImage(ART.magnet, 'magnet-tool', 'Red horseshoe magnet');
  magnet.dataset.target = 'magnet';
  magnet.dataset.role = 'drag';
  magnet.tabIndex = 0;
  magnet.setAttribute('role', 'button');
  magnet.setAttribute('aria-roledescription', 'draggable magnet');
  magnet.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown');
  setPosition(magnet, state.magnet);
  return magnet;
}

function renderTestRound() {
  stepCleanup?.();
  els.result.hidden = true;
  els.result.classList.add('is-test-feedback');
  els.result.classList.remove('outcome-magnetic', 'outcome-nonmagnetic');
  state.phase = 'play';
  const object = state.deck[state.round];
  state.currentId = object.id;
  setPrompt('Drag the magnet to the object');
  els.field.innerHTML = '';

  const pedestal = makeImage(ART.pedestal, 'test-pedestal', 'Testing tray');
  const item = makeImage(object.asset, 'test-object', object.alt);
  item.dataset.target = `object-${object.id}`;
  item.tabIndex = 0;
  item.setAttribute('role', 'button');
  item.setAttribute('aria-label', `Test ${object.alt}`);
  const magneticTray = makeImage(ART.trayMagnetic, 'sorting-tray tray-magnetic', 'Magnetic discoveries tray');
  const quietTray = makeImage(ART.trayNonmagnetic, 'sorting-tray tray-nonmagnetic', 'Not magnetic discoveries tray');
  const magneticLabel = document.createElement('span');
  magneticLabel.className = 'tray-label tray-label-magnetic';
  magneticLabel.textContent = 'MAGNETIC';
  magneticLabel.setAttribute('aria-hidden', 'true');
  const quietLabel = document.createElement('span');
  quietLabel.className = 'tray-label tray-label-nonmagnetic';
  quietLabel.textContent = 'NOT MAGNETIC';
  quietLabel.setAttribute('aria-hidden', 'true');
  const magnet = makeMagnet();
  const sparkle = makeImage(ART.sparkles, 'snap-sparkles', '');
  sparkle.hidden = true;
  els.field.append(pedestal, magneticTray, quietTray, magneticLabel, quietLabel, item, sparkle, magnet);

  const attempt = () => {
    if (state.phase !== 'play') return;
    const itemPoint = { x: 0.5, y: 0.41 };
    if (distanceBetween(state.magnet, itemPoint) < Math.max(92, Math.min(els.field.clientWidth, els.field.clientHeight) * 0.17)) {
      resolveTest(object, item, magnet, sparkle);
    }
  };
  dragCleanup?.();
  dragCleanup = installMagnet(magnet, attempt);
  const tapItem = () => {
    if (state.phase !== 'play') return;
    state.magnet = { x: 0.5, y: 0.52 };
    setPosition(magnet, state.magnet);
    attempt();
  };
  item.addEventListener('click', tapItem);
  const keyItem = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    tapItem();
  };
  item.addEventListener('keydown', keyItem);
  stepCleanup = () => {
    item.removeEventListener('click', tapItem);
    item.removeEventListener('keydown', keyItem);
  };
  renderProgress();
}

function resolveTest(object, item, magnet, sparkle) {
  if (state.phase !== 'play') return false;
  state.phase = 'result';
  item.tabIndex = -1;
  if (document.activeElement === item) item.blur();
  state.tested.push(object.id);
  state.round += 1;
  navigator.vibrate?.(object.outcome === 'magnetic' ? [18, 35, 18] : 20);
  if (object.outcome === 'magnetic') {
    sfx.pop();
    sfx.sparkle();
    sparkle.hidden = false;
    setPosition(sparkle, state.magnet);
    item.classList.add('is-attracted');
    item.style.left = `${state.magnet.x * 100}%`;
    item.style.top = `${state.magnet.y * 100}%`;
    magnet.classList.add('is-powered');
    els.result.classList.add('outcome-magnetic');
    els.resultCopy.textContent = 'IT STICKS!';
  } else {
    sfx.boing();
    item.classList.add('is-repelled');
    magnet.classList.add('is-bounced');
    els.result.classList.add('outcome-nonmagnetic');
    els.resultCopy.textContent = 'DOESN’T STICK';
  }
  setPrompt(object.material === 'steel' || object.material === 'iron' ? 'Steel sticks!' : `${capitalize(object.material)} does not stick`);
  renderProgress();
  void speak(object.result.key, object.result.text);
  timers.after(state.reducedMotion ? 10 : 360, () => {
    item.classList.add('is-sorted');
    item.style.left = object.outcome === 'magnetic' ? '17%' : '83%';
    item.style.top = '85%';
  });
  timers.after(state.reducedMotion ? 80 : 620, () => { els.result.hidden = false; });
  return true;
}

function nextTestRound() {
  if (state.mode !== 'test-lab' || state.phase !== 'result') return false;
  if (state.round >= state.total) {
    finishMode();
    return true;
  }
  renderTestRound();
  return true;
}

const SWEEP_POSITIONS = [
  [0.19, 0.28], [0.39, 0.25], [0.61, 0.27], [0.81, 0.3],
  [0.25, 0.53], [0.5, 0.49], [0.76, 0.54], [0.34, 0.72], [0.68, 0.72],
];
const FOLLOW_OFFSETS = [[-52, -32], [48, -26], [-68, 35], [63, 37], [0, 62]];

function renderSweep() {
  els.result.classList.remove('is-test-feedback', 'outcome-magnetic', 'outcome-nonmagnetic');
  setPrompt('Find five magnetic treasures');
  els.field.innerHTML = '';
  const magnetic = shuffle(config.objects.filter((object) => object.outcome === 'magnetic'), rng).slice(0, 5);
  const quiet = shuffle(config.objects.filter((object) => object.outcome !== 'magnetic'), rng).slice(0, 4);
  const deal = shuffle([...magnetic, ...quiet], rng);
  state.deck = deal;
  const tray = makeImage(ART.trayMagnetic, 'sweep-tray', 'Magnetic treasure tray');
  els.field.append(tray);
  deal.forEach((object, index) => {
    const node = makeImage(object.asset, 'sweep-object', object.alt);
    node.dataset.objectId = object.id;
    node.dataset.target = `object-${object.id}`;
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', `Test ${object.alt}`);
    node.style.left = `${SWEEP_POSITIONS[index][0] * 100}%`;
    node.style.top = `${SWEEP_POSITIONS[index][1] * 100}%`;
    node.addEventListener('click', () => moveMagnetToObject(object.id));
    node.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      moveMagnetToObject(object.id);
    });
    els.field.append(node);
  });
  const magnet = makeMagnet();
  els.field.append(magnet);
  dragCleanup?.();
  dragCleanup = installMagnet(magnet, () => checkSweep(magnet));
  renderProgress();
}

function moveMagnetToObject(id) {
  const node = els.field.querySelector(`[data-object-id="${id}"]`);
  if (!node || state.phase !== 'play') return false;
  const fieldRect = els.field.getBoundingClientRect();
  const rect = node.getBoundingClientRect();
  state.magnet = {
    x: (rect.left + rect.width / 2 - fieldRect.left) / fieldRect.width,
    y: (rect.top + rect.height / 2 - fieldRect.top) / fieldRect.height,
  };
  const magnet = els.field.querySelector('.magnet-tool');
  setPosition(magnet, state.magnet);
  checkSweep(magnet);
  return true;
}

function checkSweep(magnet) {
  if (state.phase !== 'play') return;
  const fieldRect = els.field.getBoundingClientRect();
  for (const node of els.field.querySelectorAll('[data-object-id]')) {
    const id = node.dataset.objectId;
    if (state.collected.includes(id)) continue;
    const rect = node.getBoundingClientRect();
    const point = {
      x: (rect.left + rect.width / 2 - fieldRect.left) / fieldRect.width,
      y: (rect.top + rect.height / 2 - fieldRect.top) / fieldRect.height,
    };
    if (distanceBetween(state.magnet, point) > Math.max(80, Math.min(fieldRect.width, fieldRect.height) * 0.14)) continue;
    const object = objectById(id);
    if (object.outcome === 'magnetic') collectTreasure(object, node, magnet);
    else repelSweepObject(object, node);
  }
  updateFollowers();
}

function collectTreasure(object, node, magnet) {
  if (state.collected.includes(object.id)) return;
  state.collected.push(object.id);
  node.classList.add('is-collected');
  node.tabIndex = -1;
  if (document.activeElement === node) node.blur();
  magnet.classList.add('is-powered');
  timers.after(250, () => magnet.classList.remove('is-powered'));
  sfx.pop();
  sfx.sparkle();
  navigator.vibrate?.(16);
  setPrompt(`${state.collected.length} of ${state.total} treasures`);
  renderProgress();
  updateFollowers();
  if (state.collected.length >= state.total) {
    state.phase = 'reward';
    els.resultCopy.textContent = 'All five treasures!';
    timers.after(state.reducedMotion ? 50 : 450, () => { els.result.hidden = false; });
    void speak('sweep-done');
  } else {
    void speak('treasure');
  }
}

function repelSweepObject(object, node) {
  if (state.encountered.includes(object.id)) return;
  state.encountered.push(object.id);
  node.classList.add('is-repelled');
  timers.after(650, () => node.classList.remove('is-repelled'));
  sfx.boing();
  navigator.vibrate?.(12);
  void speak('nonmagnetic');
}

function updateFollowers() {
  state.collected.forEach((id, index) => {
    const node = els.field.querySelector(`[data-object-id="${id}"]`);
    if (!node) return;
    const offset = FOLLOW_OFFSETS[index] || [0, 0];
    node.style.left = `calc(${state.magnet.x * 100}% + ${offset[0]}px)`;
    node.style.top = `calc(${state.magnet.y * 100}% + ${offset[1]}px)`;
  });
}

// The generated board is artwork, so the physical groove is represented by a
// matching authored polyline. The ball is always evaluated on this route: the
// magnet may move freely, but it cannot pull the ball through a painted wall.
const MAZE_ROUTE = [
  { x: 0.65, y: 0.858 }, { x: 0.50, y: 0.858 }, { x: 0.36, y: 0.855 },
  { x: 0.24, y: 0.845 }, { x: 0.15, y: 0.79 }, { x: 0.105, y: 0.715 },
  { x: 0.105, y: 0.64 }, { x: 0.16, y: 0.565 }, { x: 0.245, y: 0.492 },
  { x: 0.19, y: 0.44 }, { x: 0.115, y: 0.375 }, { x: 0.105, y: 0.25 },
  { x: 0.16, y: 0.16 }, { x: 0.34, y: 0.15 }, { x: 0.45, y: 0.155 },
  { x: 0.53, y: 0.225 }, { x: 0.59, y: 0.16 }, { x: 0.66, y: 0.15 },
  { x: 0.70, y: 0.22 }, { x: 0.71, y: 0.355 }, { x: 0.755, y: 0.45 },
  { x: 0.83, y: 0.435 }, { x: 0.86, y: 0.355 }, { x: 0.85, y: 0.183 },
];
const MAZE_SEGMENTS = MAZE_ROUTE.slice(1).map((end, index) => {
  const start = MAZE_ROUTE[index];
  return { start, end, length: Math.hypot(end.x - start.x, end.y - start.y) };
});
const MAZE_TOTAL_LENGTH = MAZE_SEGMENTS.reduce((sum, segment) => sum + segment.length, 0);

function mazePointAt(progress) {
  const distance = Math.max(0, Math.min(1, progress)) * MAZE_TOTAL_LENGTH;
  let walked = 0;
  for (const segment of MAZE_SEGMENTS) {
    if (walked + segment.length >= distance) {
      const amount = segment.length ? (distance - walked) / segment.length : 0;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * amount,
        y: segment.start.y + (segment.end.y - segment.start.y) * amount,
      };
    }
    walked += segment.length;
  }
  return { ...MAZE_ROUTE.at(-1) };
}

function projectNearMazeProgress(point, progress) {
  const field = els.field.getBoundingClientRect();
  const centerDistance = progress * MAZE_TOTAL_LENGTH;
  const minDistance = Math.max(0, centerDistance - MAZE_TOTAL_LENGTH * 0.055);
  const maxDistance = Math.min(MAZE_TOTAL_LENGTH, centerDistance + MAZE_TOTAL_LENGTH * 0.085);
  let walked = 0;
  let best = null;
  for (const segment of MAZE_SEGMENTS) {
    const segmentStart = walked;
    const segmentEnd = walked + segment.length;
    walked = segmentEnd;
    if (segmentEnd < minDistance || segmentStart > maxDistance) continue;
    const vx = segment.end.x - segment.start.x;
    const vy = segment.end.y - segment.start.y;
    const raw = segment.length ? ((point.x - segment.start.x) * vx + (point.y - segment.start.y) * vy) / (segment.length ** 2) : 0;
    const low = Math.max(0, (minDistance - segmentStart) / segment.length);
    const high = Math.min(1, (maxDistance - segmentStart) / segment.length);
    const amount = Math.max(low, Math.min(high, raw));
    const candidate = { x: segment.start.x + vx * amount, y: segment.start.y + vy * amount };
    const pixelDistance = Math.hypot((point.x - candidate.x) * field.width, (point.y - candidate.y) * field.height);
    if (!best || pixelDistance < best.pixelDistance) {
      best = { progress: (segmentStart + segment.length * amount) / MAZE_TOTAL_LENGTH, pixelDistance };
    }
  }
  return best;
}

function renderMaze() {
  els.result.classList.remove('is-test-feedback', 'outcome-magnetic', 'outcome-nonmagnetic');
  setPrompt('Guide the ball to the star');
  els.field.innerHTML = '';
  const ball = makeImage(ART.ball, 'maze-ball', 'Shiny steel ball');
  ball.dataset.target = 'steel-ball';
  const goal = document.createElement('div');
  goal.className = 'maze-goal';
  goal.dataset.target = 'maze-goal';
  goal.setAttribute('aria-label', 'Golden star finish');
  const start = document.createElement('span');
  start.className = 'maze-start';
  start.textContent = 'START';
  start.setAttribute('aria-hidden', 'true');
  const magnet = makeMagnet();
  state.ball = mazePointAt(state.mazeProgress);
  setPosition(ball, state.ball);
  els.field.append(goal, start, ball, magnet);
  dragCleanup?.();
  dragCleanup = installMagnet(magnet, () => advanceMaze(ball, magnet));
  renderProgress();
}

function advanceMaze(ball, magnet) {
  if (state.phase !== 'play') return;
  const gap = distanceBetween(state.magnet, state.ball);
  const range = Math.max(115, Math.min(els.field.clientWidth, els.field.clientHeight) * 0.21);
  if (gap > range) return;
  if (!state.encountered.includes('maze-near')) {
    state.encountered.push('maze-near');
    void speak('maze-near');
  }
  const projected = projectNearMazeProgress(state.magnet, state.mazeProgress);
  if (!projected || projected.pixelDistance > range * 0.72) return;
  const trail = projected.progress > 0.96 ? 0 : 0.045;
  const followProgress = projected.progress >= state.mazeProgress
    ? Math.max(state.mazeProgress, projected.progress - trail)
    : projected.progress;
  const requested = followProgress - state.mazeProgress;
  const step = Math.max(-0.01, Math.min(state.reducedMotion ? 0.028 : 0.009, requested * 0.48));
  state.mazeProgress = Math.max(0, Math.min(1, state.mazeProgress + step));
  state.ball = mazePointAt(state.mazeProgress);
  setPosition(ball, state.ball);
  ball.classList.toggle('is-pulled', true);
  magnet.classList.toggle('is-powered', true);
  timers.after(180, () => { ball.classList.remove('is-pulled'); magnet.classList.remove('is-powered'); });
  if (state.mazeProgress >= 0.985) completeMaze();
}

function completeMaze() {
  if (state.phase !== 'play') return false;
  state.phase = 'reward';
  state.round = 1;
  state.mazeProgress = 1;
  state.ball = { ...MAZE_ROUTE.at(-1) };
  const ball = els.field.querySelector('.maze-ball');
  if (ball) { setPosition(ball, state.ball); ball.classList.add('is-goal'); }
  sfx.tada();
  navigator.vibrate?.([15, 30, 20]);
  renderProgress();
  els.resultCopy.textContent = 'You reached the star!';
  timers.after(state.reducedMotion ? 50 : 500, () => { els.result.hidden = false; });
  void speak('maze-done');
  return true;
}

function previewMazeProgress(value) {
  if (state.mode !== 'magnet-maze' || state.phase !== 'play') return false;
  state.mazeProgress = Math.max(0, Math.min(1, Number(value) || 0));
  state.ball = mazePointAt(state.mazeProgress);
  state.magnet = mazePointAt(Math.min(1, state.mazeProgress + 0.07));
  const ball = els.field.querySelector('.maze-ball');
  const magnet = els.field.querySelector('.magnet-tool');
  if (ball) setPosition(ball, state.ball);
  if (magnet) setPosition(magnet, state.magnet);
  return { progress: state.mazeProgress, ball: { ...state.ball }, magnet: { ...state.magnet } };
}

function finishMode() {
  if (state.screen !== 'play') return false;
  state.screen = 'end';
  state.phase = 'complete';
  els.againArt.src = MODE_ART[state.mode];
  screens.show('end');
  sfx.tada();
  void speak('complete');
  return true;
}

function nextAction() {
  if (state.mode === 'test-lab') return nextTestRound();
  if (state.phase === 'reward') return finishMode();
  return false;
}

function capitalize(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : '';
}

const nudger = createNudger({
  first: 10500,
  repeat: 13000,
  onNudge: (count) => {
    if (state.screen !== 'play' || !['play'].includes(state.phase)) return;
    const magnet = els.field.querySelector('.magnet-tool');
    magnet?.classList.add('is-nudging');
    timers.after(900, () => magnet?.classList.remove('is-nudging'));
    void speak(count > 0 ? (state.mode === 'magnet-maze' ? 'mode-maze' : 'nudge') : 'nudge');
  },
});

addHud();

for (const card of root.querySelectorAll('[data-mode]')) {
  onTap(card, () => startMode(card.dataset.mode), { feedback: () => sfx.tick() });
}
onTap(els.next, nextAction, { feedback: () => sfx.tick() });
onTap(els.again, () => startMode(state.mode), { feedback: () => sfx.tick() });

const disposeUnlock = installUnlockOnGesture({ extra: [bgm.unlock] });
const disposeKiosk = installKioskGuards();
bgm.preload(config.music.track);
bgm.setVolume(config.music.volume);

const artUrls = [
  ...Object.values(ART),
  ...config.objects.map((object) => object.asset),
  '../../shared/assets/ui/btn-play.png',
];

function preloadArt(urls) {
  return Promise.all([...new Set(urls)].map((url) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => { state.artFailures.push(url); resolve(); };
    image.src = url;
  })));
}

const ready = Promise.all([
  voiceClips.init('./assets/audio/manifest.json', './data/lines.json', fallbackLines),
  preloadArt(artUrls),
]).then(() => true);

const disposeDebug = installDebug({
  gameId: config.id,
  engine: 'magnet-explorer-custom',
  ready,
  listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
  startMode,
  getState: () => ({
    screen: state.screen,
    mode: state.mode,
    phase: state.phase,
    round: state.round,
    total: state.total,
    currentId: state.currentId,
    tested: [...state.tested],
    collected: [...state.collected],
    encountered: [...state.encountered],
    magnet: { ...state.magnet },
    ball: { ...state.ball },
    mazeProgress: state.mazeProgress,
    dragging: state.dragging,
    muted: state.muted,
    reducedMotion: state.reducedMotion,
    artFailures: [...state.artFailures],
  }),
  tap: (id) => {
    const node = root.querySelector(`[data-target="${CSS.escape(id)}"]`);
    if (!node) return false;
    node.click();
    return true;
  },
  winRound: () => {
    if (state.mode === 'test-lab') {
      if (state.phase === 'result') return nextTestRound();
      const object = objectById(state.currentId);
      return resolveTest(object, els.field.querySelector('.test-object'), els.field.querySelector('.magnet-tool'), els.field.querySelector('.snap-sparkles'));
    }
    if (state.mode === 'treasure-sweep') {
      for (const object of state.deck.filter((item) => item.outcome === 'magnetic')) {
        const node = els.field.querySelector(`[data-object-id="${object.id}"]`);
        if (node) collectTreasure(object, node, els.field.querySelector('.magnet-tool'));
      }
      return true;
    }
    return completeMaze();
  },
  home: goSplash,
  timers,
  narrator,
  voice: voiceClips,
  sfx,
  mute: (on = true) => {
    state.muted = Boolean(on);
    narrator.setMuted(state.muted);
    voiceClips.setMuted(state.muted);
    sfx.setMuted(state.muted);
    bgm.setMuted(state.muted);
    return state.muted;
  },
  onSeed: (next) => { rng = next; },
  moveMagnetTo: (x, y) => {
    state.magnet = { x: Math.max(0.08, Math.min(0.92, Number(x))), y: Math.max(0.12, Math.min(0.9, Number(y))) };
    const magnet = els.field.querySelector('.magnet-tool');
    if (magnet) setPosition(magnet, state.magnet);
    if (state.mode === 'test-lab') {
      const object = objectById(state.currentId);
      if (distanceBetween(state.magnet, { x: 0.5, y: 0.41 }) < 150) {
        resolveTest(object, els.field.querySelector('.test-object'), magnet, els.field.querySelector('.snap-sparkles'));
      }
    } else if (state.mode === 'treasure-sweep') checkSweep(magnet);
    else if (state.mode === 'magnet-maze') advanceMaze(els.field.querySelector('.maze-ball'), magnet);
    return { ...state.magnet };
  },
  testCurrent: () => {
    if (state.mode !== 'test-lab' || state.phase !== 'play') return false;
    const object = objectById(state.currentId);
    return resolveTest(object, els.field.querySelector('.test-object'), els.field.querySelector('.magnet-tool'), els.field.querySelector('.snap-sparkles'));
  },
  previewMazeProgress,
  solveMaze: completeMaze,
  getAudioLog: voiceClips.getAudioLog,
  getAudioState: () => ({ bgm: bgm.stats(), voiceMuted: voiceClips.isMuted(), sfxMuted: sfx.isMuted() }),
});

reduceQuery.addEventListener('change', (event) => { state.reducedMotion = event.matches; });
window.addEventListener('pagehide', () => {
  clearPlay();
  bgm.stop({ fadeOutMs: 0 });
  narrator.dispose();
  disposeUnlock();
  disposeKiosk();
  disposeDebug();
}, { once: true });
