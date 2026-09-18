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
import { mulberry32 } from '../../../shared/js/rng.js';
import { onTap } from '../../../shared/js/tap.js';

const root = document.querySelector('#game');
const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
const timers = createTimers();
let rng = mulberry32(42);
let inputCleanup = null;
let lastHintAt = -Infinity;

const state = {
  screen: 'splash',
  modeId: null,
  phase: 'choose',
  routeIndex: 0,
  route: [],
  progress: 0,
  completedModes: new Set(),
  dragging: false,
  pointerId: null,
  muted: false,
  reducedMotion: reduceQuery.matches,
  artFailures: [],
};

const modeById = (id) => config.modes.find((mode) => mode.id === id) || null;
const activeMode = () => modeById(state.modeId);

root.innerHTML = `
  <main class="texture-game" aria-label="Texture Trail">
    <img class="world-art" src="${config.assets.world}" alt="" draggable="false">

    <section class="game-screen splash-screen" data-qk-screen="splash" aria-label="Choose a texture">
      <div class="splash-hud"></div>
      <img class="title-art" src="${config.assets.title}" alt="Texture Trail" draggable="false">
      <img class="splash-snail" src="${config.assets.snails.wait}" alt="Pip the clay snail" draggable="false">
      <p class="choose-prompt">Choose a texture</p>
      <div class="texture-grid">
        ${config.modes.map((mode) => `
          <button class="texture-choice" type="button" data-mode="${mode.id}" data-target="mode-${mode.id}" aria-label="Explore ${mode.title}">
            <img src="${mode.card}" alt="" draggable="false">
            <span>${mode.title}</span>
            <img class="choice-medal" src="${mode.medal}" alt="" draggable="false">
          </button>`).join('')}
      </div>
    </section>

    <section class="game-screen explore-screen" data-qk-screen="explore" aria-label="Explore this texture" hidden>
      <div class="explore-hud"></div>
      <div class="prompt-carrier explore-prompt">
        <img src="${config.assets.promptPlaque}" alt="" draggable="false">
        <h1 data-explore-heading>Explore</h1>
        <p data-explore-copy>How does it feel?</p>
      </div>
      <button class="hero-texture" type="button" data-target="texture-sample" aria-label="Hear this texture again">
        <img data-explore-card src="${config.modes[0].card}" alt="" draggable="false">
        <span data-explore-word>${config.modes[0].title}</span>
      </button>
      <div class="example-pair" aria-label="Texture examples">
        <button class="example-object" type="button" data-example="0" data-target="example-0">
          <img data-example-art="0" src="${config.modes[0].examples[0].art}" alt="" draggable="false">
          <span class="example-label">
            <img src="${config.assets.labelPlaque}" alt="" draggable="false">
            <b data-example-name="0">${config.modes[0].examples[0].name}</b>
          </span>
        </button>
        <button class="example-object" type="button" data-example="1" data-target="example-1">
          <img data-example-art="1" src="${config.modes[0].examples[1].art}" alt="" draggable="false">
          <span class="example-label">
            <img src="${config.assets.labelPlaque}" alt="" draggable="false">
            <b data-example-name="1">${config.modes[0].examples[1].name}</b>
          </span>
        </button>
      </div>
      <img class="explore-snail" src="${config.assets.snails.point}" alt="Pip points to the texture" draggable="false">
      <button class="plaque-button follow-button" type="button" data-target="follow-trail" aria-label="Follow the texture trail">
        <img src="${config.assets.actionPlaque}" alt="" draggable="false">
        <span>Follow the trail</span>
        <img class="plaque-icon" src="../../shared/assets/ui/btn-play.png" alt="" draggable="false">
      </button>
    </section>

    <section class="game-screen trail-screen" data-qk-screen="trail" aria-label="Follow the texture trail" hidden>
      <div class="trail-hud"></div>
      <div class="prompt-carrier trail-prompt">
        <img src="${config.assets.promptPlaque}" alt="" draggable="false">
        <h1 data-trail-heading>Follow the trail</h1>
        <p data-trail-progress aria-live="polite">Start at the glowing step</p>
      </div>
      <div class="trail-stage" data-trail-stage aria-label="Texture stepping-stone trail">
        <div class="marker-layer" data-marker-layer></div>
        <img class="runner-snail" data-runner src="${config.assets.snails.point}" alt="Pip follows along" draggable="false">
      </div>
    </section>

    <section class="game-screen complete-screen" data-qk-screen="complete" aria-label="Trail complete" hidden>
      <div class="complete-hud"></div>
      <div class="celebration-pieces" aria-hidden="true" data-celebration></div>
      <div class="complete-card prompt-carrier">
        <img src="${config.assets.promptPlaque}" alt="" draggable="false">
        <h1 data-complete-heading>Trail complete!</h1>
        <p data-complete-copy>Can you find this texture nearby?</p>
      </div>
      <img class="complete-medal" data-complete-medal src="${config.assets.bumpyMedal}" alt="Texture trail medal" draggable="false">
      <img class="complete-snail" src="${config.assets.snails.cheer}" alt="Pip celebrates" draggable="false">
      <div class="complete-actions">
        <button class="plaque-button again-button" type="button" data-target="again" aria-label="Trace this trail again">
          <img src="${config.assets.actionPlaque}" alt="" draggable="false">
          <span>Again</span>
        </button>
        <button class="plaque-button next-button" type="button" data-target="next" aria-label="Explore the next texture">
          <img src="${config.assets.actionPlaque}" alt="" draggable="false">
          <span>Next texture</span>
          <img class="plaque-icon" src="../../shared/assets/ui/btn-play.png" alt="" draggable="false">
        </button>
      </div>
    </section>
  </main>`;

const els = {
  game: root.querySelector('.texture-game'),
  exploreHeading: root.querySelector('[data-explore-heading]'),
  exploreCopy: root.querySelector('[data-explore-copy]'),
  exploreCard: root.querySelector('[data-explore-card]'),
  exploreWord: root.querySelector('[data-explore-word]'),
  exampleArts: [...root.querySelectorAll('[data-example-art]')],
  exampleNames: [...root.querySelectorAll('[data-example-name]')],
  stage: root.querySelector('[data-trail-stage]'),
  markerLayer: root.querySelector('[data-marker-layer]'),
  runner: root.querySelector('[data-runner]'),
  trailHeading: root.querySelector('[data-trail-heading]'),
  trailProgress: root.querySelector('[data-trail-progress]'),
  completeHeading: root.querySelector('[data-complete-heading]'),
  completeCopy: root.querySelector('[data-complete-copy]'),
  completeMedal: root.querySelector('[data-complete-medal]'),
  celebration: root.querySelector('[data-celebration]'),
};

const narrator = createNarrator({ announcerParent: root });
const screens = createScreens({
  root,
  initial: 'splash',
  voice: narrator,
  onExit(name) {
    if (name === 'trail') clearTrailInput();
  },
});

function speak(key) {
  return bgm.duckDuring(narrator.say(key, config.voice[key]));
}

function repeatPrompt() {
  const mode = activeMode();
  if (state.screen === 'splash') return speak('choose');
  if (!mode) return speak('welcome');
  if (state.screen === 'explore') return speak(mode.voice.explore);
  if (state.screen === 'trail') return speak(mode.voice.trail);
  if (state.screen === 'complete') return speak(mode.voice.success);
  return Promise.resolve();
}

function addHud() {
  const home = hudButton('home', () => {
    bgm.stop({ fadeOutMs: 250 });
    location.href = '../../';
  });
  home.classList.add('qk-hud-top-left');
  home.dataset.target = 'home';
  const splashSound = hudButton('sound', soundDebounce(() => speak('choose'), 700));
  splashSound.classList.add('qk-hud-top-right');
  splashSound.dataset.target = 'sound';
  root.querySelector('.splash-hud').append(home, splashSound);

  for (const screen of ['explore', 'trail', 'complete']) {
    const back = hudButton('back', goSplash);
    back.classList.add('qk-hud-top-left');
    back.dataset.target = 'back';
    const sound = hudButton('sound', soundDebounce(repeatPrompt, 700));
    sound.classList.add('qk-hud-top-right');
    sound.dataset.target = 'sound';
    root.querySelector(`.${screen}-hud`).append(back, sound);
  }
}

function goSplash() {
  clearTrailInput();
  state.screen = 'splash';
  state.modeId = null;
  state.phase = 'choose';
  state.progress = 0;
  for (const card of root.querySelectorAll('[data-mode]')) {
    card.classList.toggle('is-complete', state.completedModes.has(card.dataset.mode));
  }
  screens.show('splash');
  void speak('choose');
  return true;
}

function renderExplore(mode) {
  els.exploreHeading.textContent = `Meet ${mode.title}`;
  els.exploreCopy.textContent = `Look closely. What makes it ${mode.title.toLowerCase()}?`;
  els.exploreCard.src = mode.card;
  els.exploreCard.alt = `${mode.title} clay texture sample`;
  els.exploreWord.textContent = mode.title;
  mode.examples.forEach((example, index) => {
    els.exampleArts[index].src = example.art;
    els.exampleArts[index].alt = example.name;
    els.exampleNames[index].textContent = example.name;
    els.exampleArts[index].closest('button').setAttribute(
      'aria-label',
      `${example.name}, an example of ${mode.title.toLowerCase()}`,
    );
  });
}

async function startMode(id) {
  await ready;
  const mode = modeById(id);
  if (!mode) return false;
  return screens.start(async () => {
    clearTrailInput();
    state.screen = 'explore';
    state.modeId = id;
    state.phase = 'explore';
    state.progress = 0;
    renderExplore(mode);
    screens.show('explore', { force: screens.is('explore') });
    bgm.play(config.music, { key: 'texture-trail', fadeInMs: 500, loopFadeOutMs: 2300 });
    void speak(mode.voice.explore);
    return true;
  }, { busy: false });
}

function setRunnerPosition(point) {
  const [x, y] = point || [0.08, 0.82];
  els.runner.style.setProperty('--runner-x', `${x * 100}%`);
  els.runner.style.setProperty('--runner-y', `${y * 100}%`);
}

function renderTrail(mode) {
  els.trailHeading.textContent = `Follow the ${mode.title.toLowerCase()} trail`;
  els.trailProgress.textContent = 'Start at the glowing step';
  els.markerLayer.replaceChildren();
  state.route.forEach(([x, y], index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'trail-marker';
    button.dataset.index = String(index);
    button.dataset.target = `marker-${index}`;
    button.style.setProperty('--marker-x', `${x * 100}%`);
    button.style.setProperty('--marker-y', `${y * 100}%`);
    button.setAttribute('aria-label', `${mode.title} trail step ${index + 1} of ${state.route.length}`);
    button.innerHTML = `
      <img class="marker-art" src="${mode.marker}" alt="" draggable="false">
      <img class="marker-guide" src="../../shared/assets/ui/btn-play.png" alt="" draggable="false">
      <img class="marker-progress" src="${config.assets.starMedal}" alt="" draggable="false">`;
    button.addEventListener('click', (event) => {
      if (event.detail === 0) attemptMarker(index);
    });
    els.markerLayer.append(button);
  });
  updateExpectedMarker();
  setRunnerPosition(state.route[0]);
  els.runner.src = config.assets.snails.point;
}

function beginTrail() {
  const mode = activeMode();
  if (!mode || state.screen !== 'explore') return false;
  clearTrailInput();
  state.screen = 'trail';
  state.phase = 'trail';
  state.progress = 0;
  state.routeIndex = rng() < 0.5 ? 0 : 1;
  const route = matchMedia('(max-height: 600px) and (orientation: landscape)').matches
    ? mode.compactRoute
    : mode.routes[state.routeIndex];
  state.route = route.map((point) => [...point]);
  screens.show('trail');
  renderTrail(mode);
  installTrailInput();
  nudger.arm();
  void speak(mode.voice.trail);
  return true;
}

function updateExpectedMarker() {
  for (const marker of els.markerLayer.querySelectorAll('.trail-marker')) {
    const index = Number(marker.dataset.index);
    marker.classList.toggle('is-expected', index === state.progress);
    marker.classList.toggle('is-passed', index < state.progress);
  }
}

function hintExpected({ speakHint = true } = {}) {
  const mode = activeMode();
  const marker = els.markerLayer.querySelector(`[data-index="${state.progress}"]`);
  marker?.classList.remove('is-hinting');
  void marker?.offsetWidth;
  marker?.classList.add('is-hinting');
  els.runner.src = config.assets.snails.hint;
  timers.after(950, () => {
    if (state.screen === 'trail') els.runner.src = config.assets.snails.point;
    marker?.classList.remove('is-hinting');
  });
  if (speakHint && mode && performance.now() - lastHintAt > 2500) {
    lastHintAt = performance.now();
    void speak(mode.voice.nudge);
  }
}

function attemptMarker(index) {
  if (state.screen !== 'trail' || state.phase !== 'trail') return false;
  if (!Number.isInteger(index) || index < 0 || index >= state.route.length) return false;
  nudger.poke();
  if (index < state.progress) {
    sfx.tick();
    return true;
  }
  if (index !== state.progress) {
    sfx.boing();
    hintExpected();
    return false;
  }
  const marker = els.markerLayer.querySelector(`[data-index="${index}"]`);
  marker?.classList.add('is-pressing');
  timers.after(280, () => marker?.classList.remove('is-pressing'));
  state.progress += 1;
  sfx.pop();
  try { navigator.vibrate?.(12); } catch { /* vibration is optional */ }
  setRunnerPosition(state.route[index]);
  els.runner.classList.remove('is-hopping');
  void els.runner.offsetWidth;
  els.runner.classList.add('is-hopping');
  updateExpectedMarker();
  els.trailProgress.textContent = state.progress < state.route.length
    ? `${state.progress} of ${state.route.length} steps`
    : 'Every step found!';
  if (state.progress >= state.route.length) {
    state.phase = 'finishing';
    nudger.stop();
    timers.after(state.reducedMotion ? 50 : 520, finishTrail);
  }
  return true;
}

function finishTrail() {
  const mode = activeMode();
  if (!mode || state.screen !== 'trail') return false;
  clearTrailInput();
  state.completedModes.add(mode.id);
  state.screen = 'complete';
  state.phase = 'complete';
  els.completeHeading.textContent = `${mode.title} trail complete!`;
  els.completeCopy.textContent = `Can you find something ${mode.title.toLowerCase()} nearby?`;
  els.completeMedal.src = mode.medal;
  els.completeMedal.alt = `${mode.title} trail medal`;
  renderCelebration(mode);
  screens.show('complete');
  sfx.tada();
  try { navigator.vibrate?.([24, 35, 45]); } catch { /* vibration is optional */ }
  bgm.duckDuring(narrator.saySequence([
    { key: mode.voice.success, text: config.voice[mode.voice.success] },
    { key: 'completeChoice', text: config.voice.completeChoice, gap: 350 },
  ]));
  return true;
}

function renderCelebration(mode) {
  els.celebration.replaceChildren();
  const positions = [
    [8, 18, -18], [22, 76, 15], [78, 14, 18], [89, 64, -12],
    [13, 48, 23], [70, 80, -20], [44, 13, 12], [54, 84, -8],
  ];
  positions.forEach(([x, y, angle], index) => {
    const image = document.createElement('img');
    image.src = index % 3 === 0 ? config.assets.starMedal : mode.marker;
    image.alt = '';
    image.style.setProperty('--piece-x', `${x}%`);
    image.style.setProperty('--piece-y', `${y}%`);
    image.style.setProperty('--piece-angle', `${angle}deg`);
    image.style.setProperty('--piece-delay', `${(index % 4) * 80}ms`);
    els.celebration.append(image);
  });
}

function restartTrail() {
  if (state.screen !== 'complete' || !activeMode()) return false;
  state.screen = 'explore';
  state.phase = 'explore';
  return beginTrail();
}

function nextTexture() {
  const current = config.modes.findIndex((mode) => mode.id === state.modeId);
  const next = config.modes[(current + 1 + config.modes.length) % config.modes.length];
  return startMode(next.id);
}

function pointSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  if (!dx && !dy) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function traceClient(clientX, clientY, previous = null) {
  if (state.screen !== 'trail' || state.phase !== 'trail') return false;
  const rect = els.stage.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  const radius = Math.max(58, Math.min(rect.width, rect.height) * 0.075);
  let advanced = false;
  while (state.progress < state.route.length) {
    const [nx, ny] = state.route[state.progress];
    const tx = rect.left + nx * rect.width;
    const ty = rect.top + ny * rect.height;
    const distance = previous
      ? pointSegmentDistance(tx, ty, previous.x, previous.y, clientX, clientY)
      : Math.hypot(clientX - tx, clientY - ty);
    if (distance > radius) break;
    advanced = attemptMarker(state.progress) || advanced;
  }
  return advanced;
}

function installTrailInput() {
  clearTrailInput();
  let previous = null;
  const down = (event) => {
    if (event.isPrimary === false || state.pointerId !== null) return;
    state.pointerId = event.pointerId;
    state.dragging = true;
    previous = { x: event.clientX, y: event.clientY };
    try { els.stage.setPointerCapture(event.pointerId); } catch { /* window listeners remain */ }
    const advanced = traceClient(event.clientX, event.clientY);
    const marker = event.target.closest?.('.trail-marker');
    if (!advanced && marker) attemptMarker(Number(marker.dataset.index));
    event.preventDefault();
  };
  const move = (event) => {
    if (event.pointerId !== state.pointerId) return;
    const before = previous;
    previous = { x: event.clientX, y: event.clientY };
    traceClient(event.clientX, event.clientY, before);
    event.preventDefault();
  };
  const end = (event) => {
    if (event && event.pointerId != null && event.pointerId !== state.pointerId) return;
    state.pointerId = null;
    state.dragging = false;
    previous = null;
  };
  els.stage.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  window.addEventListener('blur', end);
  inputCleanup = () => {
    els.stage.removeEventListener('pointerdown', down);
    window.removeEventListener('pointermove', move, { passive: false });
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    window.removeEventListener('blur', end);
  };
}

function clearTrailInput() {
  inputCleanup?.();
  inputCleanup = null;
  timers.clearAll();
  nudger.stop();
  state.pointerId = null;
  state.dragging = false;
}

function tracePoint({ x, y, phase = 'move' } = {}) {
  const nx = Math.max(0, Math.min(1, Number(x)));
  const ny = Math.max(0, Math.min(1, Number(y)));
  const rect = els.stage.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  const clientX = rect.left + nx * rect.width;
  const clientY = rect.top + ny * rect.height;
  if (phase === 'up' || phase === 'cancel') {
    state.pointerId = null;
    state.dragging = false;
    return true;
  }
  return traceClient(clientX, clientY);
}

async function completeTrail() {
  if (state.screen !== 'trail') return false;
  while (state.screen === 'trail' && state.phase === 'trail' && state.progress < state.route.length) {
    attemptMarker(state.progress);
  }
  if (state.screen === 'trail' && state.phase === 'finishing') finishTrail();
  return state.screen === 'complete';
}

function layoutSnapshot() {
  const stage = els.stage.getBoundingClientRect();
  return {
    stage: { x: stage.x, y: stage.y, w: stage.width, h: stage.height },
    markers: [...els.markerLayer.querySelectorAll('.trail-marker')].map((marker) => {
      const rect = marker.getBoundingClientRect();
      return { index: Number(marker.dataset.index), x: rect.x, y: rect.y, w: rect.width, h: rect.height };
    }),
  };
}

const nudger = createNudger({
  first: 9000,
  repeat: 12500,
  onNudge: () => {
    if (state.screen === 'trail' && state.phase === 'trail') hintExpected();
  },
});

addHud();

for (const card of root.querySelectorAll('[data-mode]')) {
  onTap(card, () => startMode(card.dataset.mode), { feedback: () => sfx.tick() });
}
onTap(root.querySelector('[data-target="texture-sample"]'), () => {
  root.querySelector('.hero-texture').classList.remove('is-touched');
  void root.querySelector('.hero-texture').offsetWidth;
  root.querySelector('.hero-texture').classList.add('is-touched');
  void repeatPrompt();
}, { feedback: () => sfx.pop() });
for (const example of root.querySelectorAll('[data-example]')) {
  onTap(example, () => {
    example.classList.remove('is-touched');
    void example.offsetWidth;
    example.classList.add('is-touched');
    void repeatPrompt();
  }, { feedback: () => sfx.pop() });
}
onTap(root.querySelector('[data-target="follow-trail"]'), beginTrail, { feedback: () => sfx.whoosh() });
onTap(root.querySelector('[data-target="again"]'), restartTrail, { feedback: () => sfx.tick() });
onTap(root.querySelector('[data-target="next"]'), nextTexture, { feedback: () => sfx.tick() });

bgm.preload(config.music);
bgm.setVolume(0.15);
const disposeUnlock = installUnlockOnGesture({
  extra: [bgm.unlock],
  onFirst: () => {
    bgm.play(config.music, { key: 'texture-trail', fadeInMs: 650, loopFadeOutMs: 2300 });
    if (state.screen === 'splash') void speak('welcome');
  },
});
const disposeKiosk = installKioskGuards();

const artUrls = [
  config.assets.world,
  config.assets.title,
  config.assets.promptPlaque,
  config.assets.actionPlaque,
  config.assets.labelPlaque,
  config.assets.starMedal,
  config.assets.bumpyMedal,
  ...Object.values(config.assets.snails),
  ...config.modes.flatMap((mode) => [mode.card, mode.marker, mode.medal, ...mode.examples.map((example) => example.art)]),
  '../../shared/assets/ui/btn-play.png',
];

function preloadArt(urls) {
  return Promise.all([...new Set(urls)].map((url) => new Promise((resolve) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = () => { state.artFailures.push(url); resolve(); };
    image.src = url;
  })));
}

const ready = Promise.all([
  voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
  preloadArt(artUrls),
]).then(() => true);

const disposeDebug = installDebug({
  gameId: config.id,
  engine: config.engine,
  ready,
  listModes: () => config.modes.map(({ id, title, skill }) => ({ id, title, skill })),
  startMode,
  getState: () => ({
    screen: state.screen,
    mode: state.modeId,
    phase: state.phase,
    routeIndex: state.routeIndex,
    progress: state.progress,
    total: state.route.length,
    completedModes: [...state.completedModes],
    dragging: state.dragging,
    muted: state.muted,
    reducedMotion: state.reducedMotion,
    artFailures: [...state.artFailures],
  }),
  tap: (id) => {
    const node = root.querySelector(`[data-target="${CSS.escape(String(id))}"]`);
    if (!node) return false;
    node.click();
    return true;
  },
  winRound: completeTrail,
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
  tapMarker: (index) => attemptMarker(Number(index)),
  tracePoint,
  completeTrail,
  getLayout: layoutSnapshot,
  getAudioLog: voiceClips.getAudioLog,
  getAudioState: () => ({ bgm: bgm.stats(), voiceMuted: voiceClips.isMuted(), sfxMuted: sfx.isMuted() }),
});

reduceQuery.addEventListener('change', (event) => { state.reducedMotion = event.matches; });
window.addEventListener('pagehide', () => {
  clearTrailInput();
  bgm.stop({ fadeOutMs: 0 });
  narrator.dispose();
  disposeUnlock();
  disposeKiosk();
  disposeDebug();
  screens.destroy();
}, { once: true });
