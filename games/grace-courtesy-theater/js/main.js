import config from '../config.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import * as bgm from '../../../shared/js/bgm.js';
import * as sfx from '../../../shared/js/sfx.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { createScreens } from '../../../shared/js/screens.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { onTap } from '../../../shared/js/tap.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { tada } from '../../../shared/js/celebrate.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { escapeHtml } from '../../../shared/js/dom.js';

const mount = document.getElementById('game');
const timers = createTimers();
const narrator = createNarrator();
const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const ART = config.assets;

const state = {
  ready: false,
  screen: 'splash',
  scenarioId: config.scenarios[0].id,
  phase: 'choose',
  awaitingInput: false,
  attempts: 0,
  choiceOrder: [],
  costumes: [0, 0],
  completed: [],
  muted: false,
  reducedMotion: reduceQuery.matches,
  seed: 42,
};

let rng = mulberry32(state.seed);
let runEpoch = 0;
let choiceDisposers = [];
let celebrationDispose = null;

function loadSavedState() {
  try {
    const saved = JSON.parse(localStorage.getItem('qk-grace-courtesy-theater') || '{}');
    if (Array.isArray(saved.costumes) && saved.costumes.length === 2) {
      state.costumes = saved.costumes.map((value, index) => Number.isInteger(value)
        ? Math.max(0, Math.min(config.costumes.length - 1, value))
        : index);
    }
    if (Array.isArray(saved.completed)) {
      const known = new Set(config.scenarios.map(({ id }) => id));
      state.completed = [...new Set(saved.completed.filter((id) => known.has(id)))];
    }
  } catch {
    // A corrupt local preference must never block play.
  }
}

function saveState() {
  try {
    localStorage.setItem('qk-grace-courtesy-theater', JSON.stringify({
      costumes: state.costumes,
      completed: state.completed,
    }));
  } catch {
    // Private browsing can reject storage; the game still works for the session.
  }
}

loadSavedState();

const scenarioCard = (scenario) => `
  <button class="scenario-card" type="button" data-scenario="${scenario.id}"
          data-target="scenario-${scenario.id}" aria-label="${escapeHtml(scenario.title)}: ${escapeHtml(scenario.skill)}">
    <img class="card-frame" src="${ART.ui['scenario-card']}" alt="" draggable="false" />
    <span class="mini-stage" aria-hidden="true">
      <img class="mini-puppet mini-poppy poppy-image" src="${ART.characters[`poppy-${scenario.poppyPose}`]}" alt="" draggable="false" />
      <img class="mini-costume mini-costume-poppy poppy-costume" src="${config.costumes[0].poppyAccessory}" alt="" draggable="false" />
      <img class="mini-prop" src="${ART.props[scenario.prop]}" alt="" draggable="false" />
      <img class="mini-puppet mini-coco coco-image" src="${ART.characters[`coco-${scenario.cocoPose}`]}" alt="" draggable="false" />
      <img class="mini-costume mini-costume-coco coco-costume" src="${config.costumes[0].cocoAccessory}" alt="" draggable="false" />
    </span>
    <span class="scenario-label">${escapeHtml(scenario.shortTitle)}</span>
    <img class="scene-star" src="${ART.ui['reward-star']}" alt="" draggable="false" />
  </button>`;

mount.innerHTML = `
  <section class="game-screen splash-screen" data-qk-screen="splash" aria-label="Choose a kindness story">
    <img class="viewport-backdrop" src="${ART.stage}" alt="" draggable="false" />
    <div class="felt-stage splash-stage">
      <img class="stage-backdrop" src="${ART.stage}" alt="" draggable="false" />
      <img class="title-lockup" src="${ART.title}" alt="Grace and Courtesy Theater" draggable="false" />
      <p class="screen-kicker">Choose a story</p>
      <div class="scenario-grid">${config.scenarios.map(scenarioCard).join('')}</div>
      <div class="reward-shelf" data-reward-shelf aria-label="Completed stories"></div>
    </div>
    <div class="splash-hud"></div>
  </section>

  <section class="game-screen cast-screen" data-qk-screen="cast" aria-label="Dress the puppets" hidden>
    <img class="viewport-backdrop" src="${ART.stage}" alt="" draggable="false" />
    <div class="felt-stage cast-stage">
      <img class="stage-backdrop" src="${ART.stage}" alt="" draggable="false" />
      <div class="bubble-title cast-title">
        <img src="${ART.ui['speech-bubble']}" alt="" draggable="false" />
        <h1 data-cast-title>Dress the puppets</h1>
      </div>
      <img class="costume-trunk" src="${ART.ui['costume-trunk']}" alt="A felt costume trunk" draggable="false" />
      <div class="cast-pickers">
        <article class="cast-card poppy-card" aria-label="Choose Poppy's felt color">
          <img class="card-frame" src="${ART.ui['scenario-card']}" alt="" draggable="false" />
          <h2>Poppy</h2>
          <img class="cast-puppet poppy-image" src="${ART.characters['poppy-wave']}" alt="Poppy, a peach felt puppet" draggable="false" />
          <img class="cast-costume poppy-costume" src="${config.costumes[0].poppyAccessory}" alt="" draggable="false" />
          <div class="swatch-row" data-swatches="poppy"></div>
        </article>
        <article class="cast-card coco-card" aria-label="Choose Coco's felt color">
          <img class="card-frame" src="${ART.ui['scenario-card']}" alt="" draggable="false" />
          <h2>Coco</h2>
          <img class="cast-puppet coco-image" src="${ART.characters['coco-wave']}" alt="Coco, a cocoa felt puppet" draggable="false" />
          <img class="cast-costume coco-costume" src="${config.costumes[0].cocoAccessory}" alt="" draggable="false" />
          <div class="swatch-row" data-swatches="coco"></div>
        </article>
      </div>
      <button class="felt-button cast-start" type="button" data-target="start-show" aria-label="Open the curtain and start the show">
        <img src="${ART.ui['button-orange']}" alt="" draggable="false" />
        <span>Open Curtain</span>
      </button>
    </div>
    <div class="cast-hud"></div>
  </section>

  <section class="game-screen play-screen" data-qk-screen="play" aria-label="Kindness puppet show" hidden>
    <img class="viewport-backdrop" src="${ART.stage}" alt="" draggable="false" />
    <div class="felt-stage play-stage">
      <img class="stage-backdrop" src="${ART.stage}" alt="" draggable="false" />
      <div class="bubble-title play-prompt">
        <img src="${ART.ui['speech-bubble']}" alt="" draggable="false" />
        <h1 data-play-title>Watch the story</h1>
        <p data-play-question></p>
      </div>
      <img class="actor actor-poppy poppy-image" data-actor-poppy src="${ART.characters['poppy-neutral']}" alt="Poppy" draggable="false" />
      <img class="actor-costume actor-costume-poppy poppy-costume" src="${config.costumes[0].poppyAccessory}" alt="" draggable="false" />
      <img class="stage-prop" data-stage-prop src="${ART.props['welcome-mat']}" alt="" draggable="false" />
      <img class="stage-prop secondary-prop" data-secondary-prop src="${ART.props['wait-clock']}" alt="" draggable="false" hidden />
      <img class="actor actor-coco coco-image" data-actor-coco src="${ART.characters['coco-neutral']}" alt="Coco" draggable="false" />
      <img class="actor-costume actor-costume-coco coco-costume" src="${config.costumes[0].cocoAccessory}" alt="" draggable="false" />
      <div class="choice-row" data-choice-row aria-label="Choose what Poppy can do"></div>
      <div class="rewind-ribbon" data-rewind-ribbon hidden>Let's rewind gently</div>
    </div>
    <div class="play-hud"></div>
  </section>

  <section class="game-screen end-screen" data-qk-screen="end" aria-label="Kindness curtain call" hidden>
    <img class="viewport-backdrop" src="${ART.stage}" alt="" draggable="false" />
    <div class="felt-stage end-stage">
      <img class="stage-backdrop" src="${ART.stage}" alt="" draggable="false" />
      <div class="bubble-title end-title">
        <img src="${ART.ui['speech-bubble']}" alt="" draggable="false" />
        <h1>Kindness shines!</h1>
      </div>
      <img class="end-puppet end-poppy poppy-image" src="${ART.characters['poppy-celebrate']}" alt="Poppy taking a bow" draggable="false" />
      <img class="end-costume end-costume-poppy poppy-costume" src="${config.costumes[0].poppyAccessory}" alt="" draggable="false" />
      <img class="end-heart" src="${ART.props['heart-reward']}" alt="A glowing felt heart" draggable="false" />
      <img class="end-puppet end-coco coco-image" src="${ART.characters['coco-celebrate']}" alt="Coco taking a bow" draggable="false" />
      <img class="end-costume end-costume-coco coco-costume" src="${config.costumes[0].cocoAccessory}" alt="" draggable="false" />
      <div class="end-stars" data-end-stars aria-label="Story stars"></div>
      <div class="end-actions">
        <button class="felt-button again-button" type="button" data-target="again" aria-label="Play this story again">
          <img src="${ART.ui['choice-green']}" alt="" draggable="false" /><span>Again</span>
        </button>
        <button class="felt-button another-button" type="button" data-target="another" aria-label="Choose another story">
          <img src="${ART.ui['choice-plum']}" alt="" draggable="false" /><span>Another Story</span>
        </button>
      </div>
    </div>
    <div class="end-hud"></div>
  </section>`;

const els = {
  castTitle: mount.querySelector('[data-cast-title]'),
  playTitle: mount.querySelector('[data-play-title]'),
  playQuestion: mount.querySelector('[data-play-question]'),
  poppy: mount.querySelector('[data-actor-poppy]'),
  coco: mount.querySelector('[data-actor-coco]'),
  prop: mount.querySelector('[data-stage-prop]'),
  secondaryProp: mount.querySelector('[data-secondary-prop]'),
  choices: mount.querySelector('[data-choice-row]'),
  rewind: mount.querySelector('[data-rewind-ribbon]'),
  rewardShelf: mount.querySelector('[data-reward-shelf]'),
  endStars: mount.querySelector('[data-end-stars]'),
};

const screens = createScreens({
  root: mount,
  screens: {
    splash: mount.querySelector('[data-qk-screen="splash"]'),
    cast: mount.querySelector('[data-qk-screen="cast"]'),
    play: mount.querySelector('[data-qk-screen="play"]'),
    end: mount.querySelector('[data-qk-screen="end"]'),
  },
  initial: 'splash',
  voice: narrator,
});

function currentScenario() {
  return config.scenarios.find(({ id }) => id === state.scenarioId) || config.scenarios[0];
}

function choiceArt(choice) {
  return `./assets/choices/${choice.art}.webp`;
}

function playSfx(name) {
  if (state.muted) return;
  try { sfx[name]?.(); } catch { /* audio must not block play */ }
}

function speak(key, text = config.voice[key]) {
  return bgm.duckDuring(narrator.say(key, text));
}

function setScreen(name) {
  state.screen = name;
  screens.show(name);
}

function applyCostumes() {
  const poppy = config.costumes[state.costumes[0]] || config.costumes[0];
  const coco = config.costumes[state.costumes[1]] || config.costumes[0];
  mount.querySelectorAll('.poppy-costume').forEach((image) => { image.src = poppy.poppyAccessory; });
  mount.querySelectorAll('.coco-costume').forEach((image) => { image.src = coco.cocoAccessory; });
  mount.querySelectorAll('[data-costume-owner]').forEach((button) => {
    const owner = button.dataset.costumeOwner === 'poppy' ? 0 : 1;
    const selected = Number(button.dataset.costumeIndex) === state.costumes[owner];
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
}

function selectCostume(owner, index) {
  const slot = owner === 'poppy' ? 0 : 1;
  if (!config.costumes[index]) return false;
  state.costumes[slot] = index;
  applyCostumes();
  saveState();
  playSfx('pop');
  return true;
}

function renderSwatches() {
  for (const owner of ['poppy', 'coco']) {
    const host = mount.querySelector(`[data-swatches="${owner}"]`);
    host.replaceChildren();
    config.costumes.forEach((costume, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'costume-swatch';
      button.style.setProperty('--swatch', costume.swatch);
      button.dataset.target = `costume-${owner}-${costume.id}`;
      button.dataset.costumeOwner = owner;
      button.dataset.costumeIndex = String(index);
      button.setAttribute('aria-label', `${owner === 'poppy' ? 'Poppy' : 'Coco'}: ${costume.label}`);
      button.setAttribute('aria-pressed', 'false');
      onTap(button, () => selectCostume(owner, index), { feedback: () => playSfx('tick') });
      host.append(button);
    });
  }
  applyCostumes();
}

function renderRewards() {
  els.rewardShelf.replaceChildren();
  els.endStars.replaceChildren();
  config.scenarios.forEach((scenario) => {
    const complete = state.completed.includes(scenario.id);
    for (const host of [els.rewardShelf, els.endStars]) {
      const star = document.createElement('img');
      star.src = ART.ui['reward-star'];
      star.alt = complete ? `${scenario.title} complete` : '';
      star.className = `reward-star${complete ? ' is-earned' : ''}`;
      star.dataset.reward = scenario.id;
      star.draggable = false;
      host.append(star);
    }
    mount.querySelector(`[data-scenario="${scenario.id}"]`)?.classList.toggle('is-complete', complete);
  });
}

function showSplash({ speakPrompt = false } = {}) {
  runEpoch += 1;
  timers.clearAll();
  nudger.stop();
  celebrationDispose?.();
  celebrationDispose = null;
  state.phase = 'choose';
  state.awaitingInput = true;
  setScreen('splash');
  renderRewards();
  if (speakPrompt) speak('welcome');
  return true;
}

function chooseScenario(id, { silent = false } = {}) {
  const scenario = config.scenarios.find((entry) => entry.id === id);
  if (!scenario) return false;
  runEpoch += 1;
  timers.clearAll();
  state.scenarioId = id;
  state.phase = 'customize';
  state.awaitingInput = true;
  els.castTitle.textContent = scenario.title;
  setScreen('cast');
  // The wardrobe must be immediately playable even while its friendly
  // instruction is speaking; screens.start() only guards the transition work.
  if (!silent) speak('choose-costumes');
  return true;
}

function renderStage(scenario) {
  els.playTitle.textContent = scenario.title;
  els.playQuestion.textContent = 'Watch their faces';
  els.poppy.src = ART.characters[`poppy-${scenario.poppyPose}`];
  els.coco.src = ART.characters[`coco-${scenario.cocoPose}`];
  els.prop.src = ART.props[scenario.prop];
  els.prop.alt = scenario.title;
  if (scenario.secondaryProp) {
    els.secondaryProp.src = ART.props[scenario.secondaryProp];
    els.secondaryProp.hidden = false;
  } else {
    els.secondaryProp.hidden = true;
  }
  els.rewind.hidden = true;
}

function clearChoiceListeners() {
  choiceDisposers.forEach((dispose) => dispose());
  choiceDisposers = [];
}

function renderChoices(scenario) {
  clearChoiceListeners();
  els.choices.replaceChildren();
  state.choiceOrder = shuffle(scenario.choices, rng).map(({ id }) => id);
  const wrongPlaques = ['choice-coral', 'choice-plum'];
  let wrongIndex = 0;
  state.choiceOrder.forEach((id) => {
    const choice = scenario.choices.find((entry) => entry.id === id);
    const plaque = choice.correct ? 'choice-green' : wrongPlaques[wrongIndex++];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-card';
    button.dataset.choice = choice.id;
    button.dataset.target = `choice-${choice.id}`;
    button.dataset.role = choice.correct ? 'correct' : 'wrong';
    button.setAttribute('aria-label', choice.label);
    button.innerHTML = `
      <img class="choice-plaque" src="${ART.ui[plaque]}" alt="" draggable="false" />
      <img class="choice-picture" src="${choiceArt(choice)}" alt="" draggable="false" />
      <span>${escapeHtml(choice.label)}</span>`;
    const dispose = onTap(button, () => attemptChoice(choice.id), { feedback: () => playSfx('tick') });
    choiceDisposers.push(dispose);
    els.choices.append(button);
  });
}

async function playScenario(id = state.scenarioId) {
  const scenario = config.scenarios.find((entry) => entry.id === id);
  if (!scenario) return false;
  const epoch = ++runEpoch;
  timers.clearAll();
  nudger.stop();
  celebrationDispose?.();
  celebrationDispose = null;
  state.scenarioId = id;
  state.phase = 'intro';
  state.awaitingInput = false;
  state.attempts = 0;
  renderStage(scenario);
  renderChoices(scenario);
  els.choices.classList.add('is-waiting');
  setScreen('play');
  playSfx('whoosh');
  await speak('curtain-up');
  if (epoch !== runEpoch || state.screen !== 'play') return false;
  await speak(scenario.prompt);
  if (epoch !== runEpoch || state.screen !== 'play') return false;
  state.phase = 'choice';
  state.awaitingInput = true;
  els.playQuestion.textContent = 'What helps both friends?';
  els.choices.classList.remove('is-waiting');
  nudger.arm();
  return true;
}

async function attemptChoice(choiceId) {
  if (state.screen !== 'play' || state.phase !== 'choice' || !state.awaitingInput) return false;
  const scenario = currentScenario();
  const choice = scenario.choices.find(({ id }) => id === choiceId);
  if (!choice) return false;
  const epoch = runEpoch;
  state.awaitingInput = false;
  nudger.stop();
  const button = els.choices.querySelector(`[data-choice="${choice.id}"]`);

  if (!choice.correct) {
    state.phase = 'retry';
    state.attempts += 1;
    button?.classList.add('is-wrong');
    els.coco.src = ART.characters['coco-sad'];
    els.rewind.hidden = false;
    playSfx('boing');
    await speak(scenario.retry);
    if (epoch !== runEpoch || state.screen !== 'play') return false;
    await timers.wait(state.reducedMotion ? 1 : 240);
    if (epoch !== runEpoch || state.screen !== 'play') return false;
    button?.classList.remove('is-wrong');
    els.coco.src = ART.characters[`coco-${scenario.cocoPose}`];
    els.rewind.hidden = true;
    state.phase = 'choice';
    state.awaitingInput = true;
    const correct = els.choices.querySelector('[data-role="correct"]');
    correct?.classList.add('is-hinting');
    timers.after(900, () => correct?.classList.remove('is-hinting'));
    nudger.arm();
    return false;
  }

  state.phase = 'success';
  button?.classList.add('is-correct');
  els.poppy.src = ART.characters['poppy-celebrate'];
  els.coco.src = ART.characters['coco-celebrate'];
  els.prop.src = ART.props['heart-reward'];
  els.secondaryProp.hidden = true;
  playSfx('sparkle');
  celebrationDispose?.();
  celebrationDispose = tada({ host: mount.querySelector('.play-stage'), count: 38, duration: 2600, rng });
  if (!state.completed.includes(scenario.id)) state.completed.push(scenario.id);
  saveState();
  renderRewards();
  await speak(scenario.success);
  if (epoch !== runEpoch || state.screen !== 'play') return true;
  await timers.wait(state.reducedMotion ? 1 : 480);
  if (epoch !== runEpoch || state.screen !== 'play') return true;
  state.phase = 'complete';
  state.awaitingInput = true;
  setScreen('end');
  celebrationDispose?.();
  celebrationDispose = tada({ host: mount.querySelector('.end-stage'), count: 44, duration: 3000, rng });
  await speak('take-a-bow');
  return true;
}

function repeatPrompt() {
  if (state.screen === 'splash') return speak('welcome');
  if (state.screen === 'cast') return speak('choose-costumes');
  if (state.screen === 'end') return speak('take-a-bow');
  if (state.phase === 'retry') return speak(currentScenario().retry);
  return speak(currentScenario().prompt);
}

function addHud() {
  const home = hudButton('home', () => { location.href = '../../'; }, { label: 'Back to QLOBE Kids' });
  home.classList.add('qk-hud-top-left');
  home.dataset.target = 'home';
  mount.querySelector('.splash-hud').append(home);

  for (const selector of ['.cast-hud', '.play-hud', '.end-hud']) {
    const host = mount.querySelector(selector);
    const back = hudButton('back', () => showSplash({ speakPrompt: true }), { label: 'Back to story choices' });
    back.classList.add('qk-hud-top-left');
    back.dataset.target = 'back';
    const sound = hudButton('sound', soundDebounce(repeatPrompt, 650), { label: 'Hear the prompt again' });
    sound.classList.add('qk-hud-bottom-left');
    sound.dataset.target = 'sound';
    host.append(back, sound);
  }
}

addHud();
renderSwatches();
renderRewards();

mount.querySelectorAll('.scenario-card').forEach((button) => {
  onTap(button, () => screens.start(() => chooseScenario(button.dataset.scenario), { busy: false }), {
    feedback: () => playSfx('pop'),
  });
});

onTap(mount.querySelector('.cast-start'), () => screens.start(() => playScenario(), { busy: false }), {
  feedback: () => playSfx('whoosh'),
});
onTap(mount.querySelector('.again-button'), () => screens.start(() => playScenario(), { busy: false }), {
  feedback: () => playSfx('pop'),
});
onTap(mount.querySelector('.another-button'), () => showSplash({ speakPrompt: true }), {
  feedback: () => playSfx('tick'),
});

const nudger = createNudger({
  first: 11000,
  repeat: 12000,
  onNudge(index) {
    if (state.screen !== 'play' || state.phase !== 'choice') return;
    speak(index === 0 ? 'idle' : currentScenario().prompt);
    const correct = els.choices.querySelector('[data-role="correct"]');
    correct?.classList.add('is-hinting');
    timers.after(950, () => correct?.classList.remove('is-hinting'));
  },
});

bgm.preload(config.music.track);
bgm.setVolume(config.music.volume);
const disposeUnlock = installUnlockOnGesture({
  extra: [bgm.unlock],
  onFirst: () => {
    bgm.play(config.music.track, { key: config.id, fadeInMs: 700, loopFadeOutMs: 2400 });
    if (state.screen === 'splash') speak('welcome');
  },
});
const disposeKiosk = installKioskGuards();

const choiceUrls = config.scenarios.flatMap(({ choices }) => choices.map(choiceArt));
const assetUrls = [
  ART.stage,
  ART.title,
  ...Object.values(ART.characters),
  ...Object.values(ART.props),
  ...Object.values(ART.ui),
  ...config.costumes.flatMap(({ poppyAccessory, cocoAccessory }) => [poppyAccessory, cocoAccessory]),
  ...choiceUrls,
];

const ready = Promise.all([
  voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
  preloadImages(assetUrls),
]).then(() => {
  state.ready = true;
  return true;
});

const disposeDebug = installDebug({
  gameId: config.id,
  engine: 'grace-courtesy-theater-custom',
  ready,
  timers,
  narrator,
  voice: voiceClips,
  sfx,
  root: mount,
  listModes: () => config.scenarios.map(({ id, title, skill }) => ({ id, title, skill })),
  startMode: (id) => playScenario(id),
  getState: () => ({
    screen: state.screen,
    mode: state.scenarioId,
    round: state.phase === 'complete' ? 1 : 0,
    roundsTotal: 1,
    awaitingInput: state.awaitingInput,
    phase: state.phase,
    attempts: state.attempts,
    choiceOrder: [...state.choiceOrder],
    costumes: [...state.costumes],
    completed: [...state.completed],
    muted: state.muted,
  }),
  tap(targetId) {
    if (targetId.startsWith('choice-')) return attemptChoice(targetId.slice(7));
    const node = [...mount.querySelectorAll('[data-target]')]
      .find((entry) => entry.dataset.target === targetId && entry.getClientRects().length);
    if (!node) return false;
    node.click();
    return true;
  },
  winRound() {
    const correct = currentScenario().choices.find(({ correct: isCorrect }) => isCorrect);
    return attemptChoice(correct.id);
  },
  home: showSplash,
  chooseScenario,
  chooseCostume: selectCostume,
  mute(on = true) {
    state.muted = Boolean(on);
    narrator.setMuted(state.muted);
    voiceClips.setMuted(state.muted);
    sfx.setMuted(state.muted);
    bgm.setMuted(state.muted);
    return state.muted;
  },
  onSeed(next, seed) {
    rng = next;
    state.seed = seed;
    if (state.screen === 'play' && state.phase === 'choice') renderChoices(currentScenario());
  },
  getAudioLog: voiceClips.getAudioLog,
  clearAudioLog: voiceClips.clearAudioLog,
  resetProgress() {
    state.completed = [];
    saveState();
    renderRewards();
    return true;
  },
});

applyCostumes();
reduceQuery.addEventListener('change', (event) => { state.reducedMotion = event.matches; });

window.addEventListener('pagehide', () => {
  runEpoch += 1;
  timers.clearAll();
  nudger.stop();
  clearChoiceListeners();
  celebrationDispose?.();
  bgm.stop({ fadeOutMs: 0 });
  narrator.dispose();
  disposeUnlock();
  disposeKiosk();
  disposeDebug();
}, { once: true });
