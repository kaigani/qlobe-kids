// Freeze Focus Dance — custom claymation movement game.
// Camera pixels stay inside shared/camera-motion.js and only a coarse motion
// summary reaches this file. That summary decorates play; it never judges it.

import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as music from '../../../shared/js/music.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { createScreens } from '../../../shared/js/screens.js';
import { createTimers } from '../../../shared/js/timers.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { installKioskGuards, installUnlockOnGesture, unlockAll } from '../../../shared/js/audio-unlock.js';
import { onTap } from '../../../shared/js/tap.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { createCameraMotion } from '../../../shared/js/camera-motion.js';
import { renderModeCards } from '../../../shared/js/mode-select.js';

const mount = document.querySelector('#game');
const A = config.assets;
const L = config.lines;
const MODES = config.modes;
const INSTRUMENTS = new URL('../../../shared/assets/instruments/manifest.json', import.meta.url).href;

const DANCE_SONG = {
  id: 'pip-clay-hop', title: 'Pip Clay Hop', bpm: 122, beatsPerBar: 4, bars: 4, lead: 'keys',
  scale: [60, 62, 64, 67, 69],
  parts: {
    melody: [
      [0, 67, .5], [1, 69, .5], [2, 72, .5], [3, 69, .5],
      [4, 64, .5], [5, 67, .5], [6, 69, .5], [7, 67, .5],
      [8, 67, .5], [8.5, 69, .5], [10, 72, 1], [11.5, 69, .5],
      [12, 64, .5], [13, 62, .5], [14, 60, 1.5],
    ],
    bass: [[0, 48, 1], [2, 55, 1], [4, 45, 1], [6, 52, 1], [8, 48, 1], [10, 55, 1], [12, 43, 1], [14, 50, 1]],
    chord: [[0, [60, 64, 67], 2], [4, [57, 60, 64], 2], [8, [60, 64, 67], 2], [12, [59, 62, 67], 2]],
    perc: Array.from({ length: 4 }, (_, bar) => {
      const b = bar * 4;
      return [[b, 'a'], [b + 1, 'b'], [b + 2, 'a'], [b + 3, 'b'], [b + 3.5, 'b']];
    }).flat(),
  },
};

const state = {
  screen: 'splash',
  mode: null,
  phase: 'idle',
  round: 0,
  total: 0,
  target: null,
  currentPrompt: 'welcome',
  awaitingInput: false,
  inputLocked: false,
  hintLevel: 0,
  cameraMode: 'off',
  cameraStatus: 'idle',
  cameraSummary: { activity: 0, stillness: 1, baseline: 0, calibrated: false, sampleCount: 0 },
  debugCameraScenario: null,
  muted: false,
  seed: Date.now() >>> 0,
};

let rng = Math.random;
let flowToken = 0;
let transitionToken = 0;
let welcomed = false;
let queue = [];
let camera = null;
let removeCameraListener = null;
let cameraLostSpoken = false;
let animalResolve = null;
let hintTimers = [];
let instrumentsPromise = null;
let songHandle = null;
let voiceToken = 0;

const timers = createTimers();

mount.innerHTML = `
  <div class="qfd-shell">
    <section id="screen-splash" class="qfd-screen" data-qk-screen="splash"></section>
    <section id="screen-choice" class="qfd-screen" data-qk-screen="choice" hidden></section>
    <section id="screen-warmup" class="qfd-screen" data-qk-screen="warmup" hidden></section>
    <section id="screen-play" class="qfd-screen" data-qk-screen="play" hidden></section>
    <section id="screen-end" class="qfd-screen" data-qk-screen="end" hidden></section>
  </div>
  <div id="media-park" class="media-park" aria-hidden="true"></div>`;

const nodes = {
  splash: document.querySelector('#screen-splash'),
  choice: document.querySelector('#screen-choice'),
  warmup: document.querySelector('#screen-warmup'),
  play: document.querySelector('#screen-play'),
  end: document.querySelector('#screen-end'),
  park: document.querySelector('#media-park'),
};

const motionVideo = document.createElement('video');
motionVideo.className = 'motion-video';
motionVideo.muted = true;
motionVideo.defaultMuted = true;
motionVideo.autoplay = true;
motionVideo.playsInline = true;
motionVideo.setAttribute('playsinline', '');
motionVideo.setAttribute('aria-label', 'Local motion mirror');
nodes.park.appendChild(motionVideo);

function rawVoiceSay(key, text) {
  const mine = ++voiceToken;
  if (!state.muted) music.duck(.2, 120);
  return voice.say(key, text).then(() => {
    if (mine === voiceToken) music.duck(1, 260);
  }, () => {
    if (mine === voiceToken) music.duck(1, 260);
  });
}

function rawVoiceStop() {
  ++voiceToken;
  voice.stop();
  music.duck(1, 120);
}

const narrator = createNarrator({ say: rawVoiceSay, stop: rawVoiceStop });

const screens = createScreens({
  root: mount,
  initial: 'splash',
  splash: 'splash',
  voice: narrator,
  onEnter: (name) => { state.screen = name; },
  onExit: (name, next) => {
    stopSong();
    clearHints();
    timers.clearAll();
    if (animalResolve) { animalResolve(false); animalResolve = null; }
    if (next === 'splash' || next === 'end') teardownCamera(next);
  },
});

function ensureInstruments() {
  if (!instrumentsPromise) instrumentsPromise = music.init(INSTRUMENTS);
  return instrumentsPromise;
}

const disposeUnlock = installUnlockOnGesture({
  extra: [() => music.unlock(), () => ensureInstruments()],
});
const disposeKiosk = installKioskGuards();

const allArt = [
  ...Object.values(A),
  ...MODES.map((mode) => mode.card),
  ...config.animals.flatMap((animal) => [animal.hidden, animal.reveal]),
  ...config.statues.map((statue) => statue.art),
];

const ready = Promise.all([
  preloadImages(allArt),
  voice.init(config.voice.manifest, config.voice.lines, L),
]).then(() => {
  document.documentElement.dataset.gameReady = 'true';
  return true;
});

function playSfx(name) {
  if (state.muted) return;
  try { sfx[name]?.(); } catch { /* feedback cannot strand play */ }
}

// onTap fires `handler` on pointerup over the element (the same press the
// feedback came from), keeping `click` only for keyboard/AT — the split
// pointerdown-feedback + click-action pattern this replaced could drop a tap
// when the browser suppressed or delayed the synthetic click that followed.
function press(element, handler, { feedback = true } = {}) {
  if (!element) return;
  onTap(element, handler, {
    feedback: feedback
      ? () => { unlockAll([() => music.unlock(), () => ensureInstruments()]); playSfx('tick'); }
      : undefined,
  });
}

function scene(src) {
  return `<img class="scene-bg" src="${attr(src)}" alt="" draggable="false">`;
}

function backAndSound(backLabel = 'Back to dance games') {
  return `<div class="qfd-hud">
    <button class="qk-hud-btn qk-hud-back" type="button" data-target="back" data-role="navigation" aria-label="${attr(backLabel)}"></button>
    <button class="qk-hud-btn qk-hud-sound" type="button" data-target="sound" data-role="replay" aria-label="Hear that again"></button>
  </div>`;
}

function plaque(text, extra = 'top-prompt') {
  return `<div class="plaque ${extra}">
    <img src="${attr(A.plaque)}" alt="" draggable="false">
    <div class="plaque-text">${html(text)}</div>
  </div>`;
}

function wireHud(node) {
  press(node.querySelector('[data-target="back"]'), goSplash);
  press(node.querySelector('[data-target="sound"]'), repeatPrompt);
}

function setPrompt(key) {
  state.currentPrompt = key;
  const textNode = nodes[state.screen]?.querySelector?.('.plaque-text');
  if (textNode) textNode.textContent = L[key] || '';
}

function say(key) {
  setPrompt(key);
  return narrator.say(key, L[key] || '');
}

function repeatPrompt() {
  return say(state.currentPrompt || 'welcome');
}

function renderSplash() {
  state.phase = 'idle';
  state.currentPrompt = 'welcome';
  nodes.splash.innerHTML = `${scene(A.forestDay)}
    <div class="qfd-hud">
      <a class="qk-hud-btn qk-hud-home" href="../../" data-target="home" data-role="navigation" aria-label="QLOBE Kids home"></a>
      <button class="qk-hud-btn qk-hud-sound" type="button" data-target="sound" data-role="replay" aria-label="Hear the welcome"></button>
    </div>
    <img class="title-lockup" src="${attr(A.title)}" alt="Freeze Focus Dance" draggable="false">
    <img class="splash-prop splash-note" src="${attr(A.musicNote)}" alt="" draggable="false">
    <img class="splash-prop splash-snow" src="${attr(A.snowflake)}" alt="" draggable="false">
    <img class="splash-pip" src="${attr(A.pipDance)}" alt="Pip, a blue clay dancer" draggable="false">
    <div class="mode-shelf" aria-label="Choose a dance game"></div>`;
  press(nodes.splash.querySelector('[data-target="sound"]'), () => say('welcome'));
  // tap:'s `target.click()` already fires renderModeCards()'s onTap through
  // its click fallback — no debug-harness patch needed.
  renderModeCards({
    host: nodes.splash.querySelector('.mode-shelf'),
    modes: MODES,
    skin: false, // .mode-card keeps its own pixel-for-pixel look; only the
                 // shared .qk-mode-card touch-floor contract is added (a
                 // no-op — cards render far above the 96px floor here).
    cardClass: 'art-button mode-card',
    showTitle: false, // decorate() builds .mode-label itself
    art: (mode) => { const img = document.createElement('img'); img.src = mode.card; img.alt = ''; img.draggable = false; return img; },
    decorate(btn, mode) {
      const label = document.createElement('span');
      label.className = 'mode-label';
      label.textContent = mode.title;
      btn.append(label);
    },
    onPick: (id) => selectMode(id),
    feedback: () => { unlockAll([() => music.unlock(), () => ensureInstruments()]); playSfx('tick'); },
  });
}

function goSplash() {
  ++transitionToken;
  ++flowToken;
  narrator.stop();
  stopSong();
  clearHints();
  timers.clearAll();
  teardownCamera('splash');
  state.mode = null;
  state.target = null;
  state.awaitingInput = false;
  renderSplash();
  screens.show('splash', { force: screens.is('splash') });
}

function selectMode(id) {
  const mode = MODES.find((item) => item.id === id);
  if (!mode || screens.starting) return;
  ++transitionToken;
  ++flowToken;
  stopSong();
  teardownCamera('mode-change');
  state.mode = mode;
  state.inputLocked = false;
  state.round = 0;
  state.total = mode.rounds;
  state.target = null;
  state.cameraMode = 'off';
  state.cameraStatus = 'choice';
  state.cameraSummary = blankMotion();
  renderChoice();
  screens.show('choice');
  const intro = welcomed ? [['camera-offer', L['camera-offer']]] : [
    ['welcome', L.welcome],
    ['camera-offer', L['camera-offer']],
  ];
  welcomed = true;
  state.currentPrompt = 'camera-offer';
  narrator.saySequence(intro);
}

function renderChoice() {
  nodes.choice.innerHTML = `${scene(A.forestDay)}${backAndSound()}
    ${plaque('Choose your sparkle!')}
    <img class="choice-pip" src="${attr(A.pipCheer)}" alt="Pip points to two equally good ways to play" draggable="false">
    <div class="choice-grid">
      <button class="art-button choice-button" type="button" data-target="camera-on" data-role="camera-choice" aria-label="Use motion sparkles with the local camera">
        <img src="${attr(A.camera)}" alt="" draggable="false">
        <span class="choice-label">Camera sparkles</span>
      </button>
      <button class="art-button choice-button" type="button" data-target="camera-skip" data-role="camera-choice" aria-label="Play without the camera">
        <img src="${attr(A.skip)}" alt="" draggable="false">
        <span class="choice-label">No camera</span>
      </button>
    </div>
    <p class="privacy-note">Stays on this tablet. Never recorded or saved.</p>`;
  wireHud(nodes.choice);
  press(nodes.choice.querySelector('[data-target="camera-on"]'), openCamera);
  press(nodes.choice.querySelector('[data-target="camera-skip"]'), playWithoutCamera);
}

async function playWithoutCamera() {
  if (state.inputLocked || !screens.is('choice')) return;
  state.inputLocked = true;
  const mine = ++transitionToken;
  state.cameraMode = 'off';
  state.cameraStatus = 'skipped';
  await say('camera-skip');
  if (mine !== transitionToken || !screens.is('choice')) return;
  await say('safe-space');
  if (mine !== transitionToken || !screens.is('choice')) return;
  state.inputLocked = false;
  beginMode();
}

function renderWarmup(status = 'Opening the magic mirror…') {
  nodes.warmup.innerHTML = `${scene(A.forestDay)}${backAndSound()}
    ${plaque(L['camera-wave'])}
    <div class="mirror-wrap">
      <div class="mirror-video-slot">
        <img class="mirror-backdrop" src="${attr(A.forestDay)}" alt="" draggable="false">
        <img class="mirror-guide" src="${attr(A.pipCheer)}" alt="Pip waves from the magic mirror" draggable="false">
      </div>
      <img class="mirror-frame" src="${attr(A.mirror)}" alt="" draggable="false">
      <p class="mirror-status" aria-live="polite">${html(status)}</p>
    </div>
    <p class="privacy-note">Live on this tablet only. No photos, recording, saving, or uploading.</p>
    ${sparkleField()}`;
  nodes.warmup.querySelector('.mirror-video-slot').appendChild(motionVideo);
  wireHud(nodes.warmup);
}

async function openCamera() {
  if (state.inputLocked || !screens.is('choice')) return;
  state.inputLocked = true;
  const mine = ++transitionToken;
  teardownCamera('new-request');
  renderWarmup();
  screens.show('warmup');
  state.cameraMode = 'requesting';
  state.cameraStatus = 'requesting';
  state.currentPrompt = 'camera-wave';

  const scenario = state.debugCameraScenario;
  if (scenario) {
    await runFakeCameraScenario(scenario, mine);
    return;
  }

  camera = createCameraMotion({ video: motionVideo });
  removeCameraListener = camera.subscribe(onCameraUpdate);
  const result = await camera.request();
  if (mine !== transitionToken || !screens.is('warmup')) return;
  if (result.state === 'live') {
    state.cameraMode = 'local-motion';
    state.cameraStatus = 'live';
    updateMirrorStatus('Wave hello! Your sparkles are waking up.');
    await say('camera-wave');
    await timers.wait(1600);
  } else {
    state.cameraMode = 'off';
    state.cameraStatus = result.state;
    updateMirrorStatus('The mirror is resting. We can still play!');
    await say('camera-lost');
  }
  if (mine !== transitionToken || !screens.is('warmup')) return;
  await say('safe-space');
  if (mine !== transitionToken || !screens.is('warmup')) return;
  state.inputLocked = false;
  parkVideo();
  beginMode();
}

async function runFakeCameraScenario(scenario, mine) {
  if (scenario === 'live' || scenario === 'lost') {
    state.cameraMode = 'fake-motion';
    state.cameraStatus = 'live';
    setMotion(.66, true);
    updateMirrorStatus('Wave hello! Your sparkles are waking up.');
    await say('camera-wave');
    await timers.wait(800);
  } else {
    state.cameraMode = 'off';
    state.cameraStatus = scenario === 'denied' ? 'denied' : 'unavailable';
    updateMirrorStatus('The mirror is resting. We can still play!');
    await say('camera-lost');
  }
  if (mine !== transitionToken || !screens.is('warmup')) return;
  await say('safe-space');
  if (mine !== transitionToken || !screens.is('warmup')) return;
  state.inputLocked = false;
  parkVideo();
  beginMode();
  if (scenario === 'lost') timers.after(600, () => loseCamera('debug-stream-ended'));
}

function updateMirrorStatus(text) {
  const node = nodes.warmup.querySelector('.mirror-status');
  if (node) node.textContent = text;
}

function parkVideo() {
  if (motionVideo.parentNode !== nodes.park) nodes.park.appendChild(motionVideo);
}

function onCameraUpdate(value) {
  state.cameraStatus = value.state;
  state.cameraSummary = { ...value.summary };
  if (value.state === 'live') {
    motionVideo.classList.add('is-live');
    state.cameraMode = 'local-motion';
    setMotion(value.summary.activity, value.summary.calibrated);
    return;
  }
  motionVideo.classList.remove('is-live');
  if (value.state === 'stopped'
      && ['hidden', 'pagehide'].includes(value.reason)
      && (state.cameraMode === 'local-motion' || state.cameraMode === 'fake-motion' || state.cameraMode === 'requesting')) {
    loseCamera(value.reason);
    return;
  }
  if (['ended', 'error', 'unavailable', 'denied'].includes(value.state)
      && (state.cameraMode === 'local-motion' || state.cameraMode === 'requesting')) {
    loseCamera(value.reason || value.state);
  }
}

function loseCamera(reason = 'stream-ended') {
  const wasLive = state.cameraMode === 'local-motion' || state.cameraMode === 'fake-motion';
  removeCameraListener?.();
  removeCameraListener = null;
  camera?.destroy();
  camera = null;
  state.cameraMode = 'off';
  state.cameraStatus = reason;
  state.cameraSummary = blankMotion();
  setMotion(0, false);
  if (wasLive && screens.is('play') && !cameraLostSpoken && !document.hidden) {
    cameraLostSpoken = true;
    say('camera-lost');
  }
  if (screens.is('play')) renderPlay();
}

function teardownCamera(reason = 'stopped') {
  removeCameraListener?.();
  removeCameraListener = null;
  if (camera) {
    camera.destroy();
    camera = null;
  }
  try { motionVideo.pause(); motionVideo.srcObject = null; } catch { /* already gone */ }
  motionVideo.classList.remove('is-live');
  parkVideo();
  state.cameraMode = 'off';
  state.cameraStatus = reason;
  state.cameraSummary = blankMotion();
  setMotion(0, false);
}

function blankMotion() {
  return { activity: 0, stillness: 1, baseline: 0, calibrated: false, sampleCount: 0 };
}

function setMotion(value, calibrated = true) {
  const activity = Math.max(0, Math.min(1, Number(value) || 0));
  state.cameraSummary = {
    ...state.cameraSummary,
    activity: round(activity),
    stillness: round(1 - activity),
    calibrated: Boolean(calibrated),
  };
  document.documentElement.style.setProperty('--motion-level', String(activity));
  document.documentElement.style.setProperty('--sparkle-opacity', String(.13 + activity * .87));
  document.documentElement.style.setProperty('--sparkle-scale', String(.7 + activity * .55));
  document.documentElement.style.setProperty('--snow-opacity', String(.28 + (1 - activity) * .68));
}

async function beginMode() {
  if (!state.mode) return;
  state.inputLocked = false;
  state.round = 0;
  state.total = state.mode.rounds;
  state.awaitingInput = false;
  cameraLostSpoken = false;
  queue = makeQueue(state.mode);
  const mine = ++flowToken;
  setPlayPhase('intro', state.mode.intro);
  screens.show('play');
  await say(state.mode.intro);
  if (!isFlow(mine)) return;
  runRound(mine);
}

function makeQueue(mode) {
  if (mode.id === 'lookout') return shuffle(config.animals, rng).slice(0, mode.rounds);
  if (mode.id === 'statues') return shuffle(config.statues, rng).slice(0, mode.rounds);
  return Array.from({ length: mode.rounds }, (_, index) => ({ id: `beat-${index + 1}` }));
}

async function runRound(mine) {
  if (!isFlow(mine)) return;
  if (state.round >= state.total) { showEnd(); return; }

  const danceKey = ['dance-one', 'dance-two', 'dance-three'][state.round % 3];
  setPlayPhase('dance', danceKey);
  await say(danceKey);
  if (!isFlow(mine)) return;
  startSong();
  const timing = config.roundTiming;
  const danceMs = timing.danceMin + Math.floor(rng() * (timing.danceMax - timing.danceMin + 1));
  await timers.wait(danceMs);
  if (!isFlow(mine)) return;
  stopSong();

  if (state.mode.id === 'beat') await runBeatStop(mine);
  else if (state.mode.id === 'lookout') await runLookout(mine);
  else await runStatue(mine);
}

async function runBeatStop(mine) {
  const key = ['freeze-one', 'freeze-two', 'freeze-three'][state.round % 3];
  setPlayPhase('freeze', key);
  playSfx('whoosh');
  await say(key);
  await timers.wait(config.roundTiming.freeze);
  if (!isFlow(mine)) return;
  setPlayPhase('praise', 'beat-round');
  playSfx('sparkle');
  await say('beat-round');
  await timers.wait(config.roundTiming.praise);
  if (isFlow(mine)) completeRound(mine);
}

async function runLookout(mine) {
  const animal = queue[state.round];
  state.target = animal.id;
  state.hintLevel = 0;
  setPlayPhase('freeze', animal.find);
  playSfx('whoosh');
  await say(animal.find);
  await timers.wait(config.roundTiming.searchSettle);
  if (!isFlow(mine)) return;
  setPlayPhase('search', animal.find);
  state.awaitingInput = true;
  scheduleHints(animal);
  const found = await new Promise((resolve) => { animalResolve = resolve; });
  animalResolve = null;
  if (!found || !isFlow(mine)) return;
  await timers.wait(config.roundTiming.praise);
  if (isFlow(mine)) completeRound(mine);
}

async function foundAnimal(id) {
  if (!state.awaitingInput || state.phase !== 'search' || id !== state.target) return false;
  state.awaitingInput = false;
  clearHints();
  const animal = config.animals.find((item) => item.id === id);
  setPlayPhase('reveal', animal.found);
  playSfx('sparkle');
  await say(animal.found);
  const resolve = animalResolve;
  if (resolve) resolve(true);
  return true;
}

function scheduleHints(animal) {
  clearHints();
  hintTimers.push(timers.after(8000, () => {
    if (!state.awaitingInput || state.target !== animal.id) return;
    state.hintLevel = 1;
    markAnimalHint();
    say(animal.hint);
  }));
  hintTimers.push(timers.after(16000, () => {
    if (!state.awaitingInput || state.target !== animal.id) return;
    state.hintLevel = 2;
    markAnimalHint();
    say(animal.hint);
  }));
}

function clearHints() {
  for (const id of hintTimers) timers.clear(id);
  hintTimers = [];
}

function markAnimalHint() {
  const target = nodes.play.querySelector('.animal-hit');
  target?.classList.toggle('is-hinted', state.hintLevel >= 1);
  target?.classList.toggle('is-pointed', state.hintLevel >= 2);
  const pip = nodes.play.querySelector('.play-pip');
  if (pip && state.hintLevel >= 2) pip.src = A.pipDance;
}

async function runStatue(mine) {
  const statue = queue[state.round];
  state.target = statue.id;
  setPlayPhase('statue', statue.prompt);
  playSfx('whoosh');
  await say(statue.prompt);
  if (!isFlow(mine)) return;
  await say('statue-hold');
  await timers.wait(config.roundTiming.statueHold);
  if (!isFlow(mine)) return;
  setPlayPhase('praise', 'statue-round');
  playSfx('sparkle');
  await say('statue-round');
  await timers.wait(config.roundTiming.praise);
  if (isFlow(mine)) completeRound(mine);
}

function completeRound(mine) {
  if (!isFlow(mine)) return;
  state.round += 1;
  state.target = null;
  state.awaitingInput = false;
  if (state.round >= state.total) {
    showEnd();
    return;
  }
  timers.after(350, () => runRound(mine));
}

function isFlow(token) {
  return token === flowToken && screens.is('play');
}

function setPlayPhase(phase, promptKey) {
  state.phase = phase;
  state.currentPrompt = promptKey;
  renderPlay();
}

function renderPlay() {
  const content = playContent();
  nodes.play.className = `qfd-screen phase-${state.phase}`;
  nodes.play.innerHTML = `${scene(A.forestDay)}${backAndSound()}
    <div class="round-stars" aria-label="Round ${Math.min(state.round + 1, state.total)} of ${state.total}">${roundStars()}</div>
    ${plaque(L[state.currentPrompt] || '', 'play-prompt')}
    ${content}
    ${cameraPill()}`;
  wireHud(nodes.play);
  const animal = nodes.play.querySelector('[data-animal]');
  if (animal) press(animal, () => foundAnimal(animal.dataset.animal), { feedback: false });
  markAnimalHint();
}

function playContent() {
  if (state.phase === 'dance') {
    return `${sparkleField()}
      <img class="phase-prop music-prop" src="${attr(A.musicNote)}" alt="" draggable="false">
      <img class="play-pip" src="${attr(A.pipDance)}" alt="Pip dances" draggable="false">`;
  }
  if (state.phase === 'freeze') {
    return `${snowField()}
      <img class="phase-lockup" src="${attr(A.freeze)}" alt="Freeze!" draggable="false">
      <img class="phase-prop snow-prop" src="${attr(A.snowflake)}" alt="" draggable="false">
      <img class="play-pip" src="${attr(A.pipFreeze)}" alt="Pip freezes on one foot" draggable="false">`;
  }
  if (state.phase === 'search') {
    const animal = config.animals.find((item) => item.id === state.target);
    return `${snowField()}
      <img class="play-pip" src="${attr(state.hintLevel >= 2 ? A.pipDance : A.pipFreeze)}" alt="Pip looks for a forest friend" draggable="false">
      <button class="art-button animal-hit" type="button" data-target="friend-${attr(animal.id)}" data-role="answer" data-animal="${attr(animal.id)}" aria-label="${attr(animal.id)}" style="--animal-x:${animal.x};--animal-y:${animal.y}">
        <img src="${attr(animal.hidden)}" alt="" draggable="false">
      </button>`;
  }
  if (state.phase === 'reveal') {
    const animal = config.animals.find((item) => item.id === state.target);
    return `${sparkleField()}
      <img class="play-pip" src="${attr(A.pipCheer)}" alt="Pip cheers" draggable="false">
      <img class="animal-reveal" src="${attr(animal.reveal)}" alt="${attr(animal.id)}" draggable="false">`;
  }
  if (state.phase === 'statue') {
    const statue = config.statues.find((item) => item.id === state.target);
    return `${snowField()}
      <img class="phase-prop snow-prop" src="${attr(A.focusStar)}" alt="" draggable="false">
      <img class="play-pip" src="${attr(statue.art)}" alt="Pip makes a ${attr(statue.id)} statue" draggable="false">`;
  }
  if (state.phase === 'praise') {
    return `${sparkleField()}
      <img class="phase-prop snow-prop" src="${attr(A.focusStar)}" alt="" draggable="false">
      <img class="play-pip" src="${attr(A.pipCheer)}" alt="Pip cheers" draggable="false">`;
  }
  return `<img class="play-pip" src="${attr(A.pipCheer)}" alt="Pip welcomes the dancer" draggable="false">`;
}

function roundStars() {
  return Array.from({ length: state.total }, (_, index) => {
    const kind = index < state.round ? 'is-done' : index === state.round ? 'is-current' : '';
    return `<img class="${kind}" src="${attr(A.focusStar)}" alt="" draggable="false">`;
  }).join('');
}

function sparkleField() {
  const points = [[13, 24], [29, 60], [48, 31], [66, 68], [84, 27], [91, 70], [8, 77]];
  return `<div class="sparkle-field" aria-hidden="true">${points.map(([x, y], index) =>
    `<img class="sparkle" src="${attr(A.sparkles)}" alt="" style="left:${x}%;top:${y}%;animation-delay:-${index * .17}s" draggable="false">`).join('')}</div>`;
}

function snowField() {
  const points = [[13, 25], [28, 55], [44, 35], [63, 63], [82, 27], [91, 67], [8, 78]];
  return `<div class="snow-field" aria-hidden="true">${points.map(([x, y], index) =>
    `<img class="snow-bit" src="${attr(A.snowflake)}" alt="" style="left:${x}%;top:${y}%;animation-delay:-${index * .21}s" draggable="false">`).join('')}</div>`;
}

function cameraPill() {
  if (!['local-motion', 'fake-motion'].includes(state.cameraMode)) return '';
  return `<div class="camera-pill" aria-label="Local motion sparkles are on">
    <img src="${attr(A.camera)}" alt="" draggable="false"><span>Local sparkles</span>
  </div>`;
}

function startSong() {
  stopSong();
  if (state.muted || !music.ready.loaded) return;
  const available = new Set(music.instrumentIds());
  const band = ['vibraphone', 'guitar', 'bongos', 'maracas']
    .filter((instr) => available.has(instr))
    .map((instr) => ({ instr }));
  if (!band.length) return;
  try { songHandle = music.playSong(DANCE_SONG, band); } catch { songHandle = null; }
}

function stopSong() {
  try { songHandle?.stop?.(); } catch { /* already stopped */ }
  songHandle = null;
  try { music.stopSong(); } catch { /* no context yet */ }
}

function showEnd() {
  ++flowToken;
  stopSong();
  clearHints();
  timers.clearAll();
  teardownCamera('mode-complete');
  state.phase = 'complete';
  state.awaitingInput = false;
  state.currentPrompt = state.mode.end;
  renderEnd();
  screens.show('end');
  playSfx('tada');
  say(state.mode.end);
}

function renderEnd() {
  let friend = '';
  if (state.mode?.id === 'lookout') {
    const animal = queue[Math.max(0, queue.length - 1)] || config.animals[0];
    friend = `<img class="end-friend" src="${attr(animal.reveal)}" alt="${attr(animal.id)} celebrates too" draggable="false">`;
  } else {
    friend = `<img class="end-friend end-side-prop" src="${attr(A.snowflake)}" alt="" draggable="false">`;
  }
  nodes.end.className = `qfd-screen end-mode-${state.mode?.id || 'beat'}`;
  nodes.end.innerHTML = `${scene(A.forestNight)}${backAndSound()}
    ${plaque(L[state.mode.end], 'end-prompt')}
    ${sparkleField()}
    <img class="end-pip" src="${attr(A.pipCheer)}" alt="Pip celebrates" draggable="false">
    <img class="end-star" src="${attr(A.focusStar)}" alt="A golden Focus Star" draggable="false">
    ${friend}
    <div class="end-actions">
      <button class="art-button action-carrier" type="button" data-target="again" data-role="primary" aria-label="Dance again">
        <img src="${attr(A.action)}" alt="" draggable="false"><span>Dance Again</span>
      </button>
      <button class="art-button secondary-carrier" type="button" data-target="choose" data-role="navigation" aria-label="Choose another dance game">
        <img src="${attr(A.plaque)}" alt="" draggable="false"><span>Choose another</span>
      </button>
    </div>`;
  wireHud(nodes.end);
  press(nodes.end.querySelector('[data-target="again"]'), () => selectMode(state.mode.id));
  press(nodes.end.querySelector('[data-target="choose"]'), goSplash);
}

async function debugWinRound() {
  if (!screens.is('play')) return false;
  if (state.phase === 'search' && state.target) return foundAnimal(state.target);
  ++flowToken;
  timers.clearAll();
  stopSong();
  state.awaitingInput = false;
  state.round += 1;
  if (state.round >= state.total) showEnd();
  else runRound(++flowToken);
  return true;
}

function debugCompleteMode() {
  if (!state.mode || !screens.is('play')) return false;
  showEnd();
  return true;
}

function setCameraScenario(scenario) {
  const allowed = [null, 'live', 'denied', 'unavailable', 'lost', 'off'];
  const value = scenario === 'none' ? null : scenario;
  if (!allowed.includes(value)) throw new Error(`Unknown camera scenario: ${scenario}`);
  state.debugCameraScenario = value;
  if (!screens.is('play')) return getCameraState();
  if (value === 'live') {
    teardownCamera('debug');
    state.cameraMode = 'fake-motion';
    state.cameraStatus = 'live';
    setMotion(.66, true);
    renderPlay();
  } else if (value === 'lost') {
    loseCamera('debug-stream-ended');
  } else if (value === 'denied' || value === 'unavailable' || value === 'off') {
    teardownCamera(value);
    renderPlay();
  }
  return getCameraState();
}

function getCameraState() {
  return {
    mode: state.cameraMode,
    status: state.cameraStatus,
    activity: state.cameraSummary.activity,
    stillness: state.cameraSummary.stillness,
    baseline: state.cameraSummary.baseline,
    calibrated: state.cameraSummary.calibrated,
    sampleCount: state.cameraSummary.sampleCount,
  };
}

function getState() {
  return {
    screen: state.screen,
    mode: state.mode?.id || null,
    phase: state.phase,
    round: state.round,
    roundsTotal: state.total,
    awaitingInput: state.awaitingInput,
    target: state.target,
    prompt: state.currentPrompt,
    camera: getCameraState(),
    muted: state.muted,
    pendingTimers: timers.size(),
  };
}

const disposeDebug = installDebug({
  gameId: config.id,
  engine: 'freeze-focus-dance-custom',
  version: 1,
  ready,
  timers,
  root: mount,
  listModes: () => MODES.map((mode) => ({ id: mode.id, title: mode.title })),
  startMode: async (id) => { await ready; selectMode(id); return getState(); },
  getState,
  tap: async (id) => {
    const target = mount.querySelector(`[data-target="${cssEscape(id)}"]`);
    if (!target) return false;
    target.click();
    await Promise.resolve();
    return true;
  },
  winRound: debugWinRound,
  home: () => { goSplash(); return getState(); },
  mute: (on = true) => {
    state.muted = Boolean(on);
    narrator.setMuted(state.muted);
    voice.setMuted(state.muted);
    music.setMuted(state.muted);
    sfx.setMuted?.(state.muted);
    if (state.muted) stopSong();
    return state.muted;
  },
  onSeed: (next, seed) => { rng = next; state.seed = seed; },
  getAudioLog: () => voice.getAudioLog(),
  repeatPrompt,
  completeMode: debugCompleteMode,
  setCameraScenario,
  simulateCameraStop: (reason = 'hidden') => {
    onCameraUpdate({ state: 'stopped', reason, summary: blankMotion() });
    return getCameraState();
  },
  setMotion: (amount) => { setMotion(amount, true); renderPlay(); return getCameraState(); },
  getCameraState,
});

function cleanup() {
  ++flowToken;
  ++transitionToken;
  stopSong();
  teardownCamera('destroyed');
  narrator.dispose();
  screens.destroy();
  disposeDebug?.();
  disposeUnlock?.();
  disposeKiosk?.();
}

window.addEventListener('pagehide', cleanup, { once: true });

function cssEscape(value) {
  if (globalThis.CSS?.escape) return CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function html(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function attr(value) { return html(value); }
function round(value) { return Math.round(value * 1000) / 1000; }

setMotion(0, false);
renderSplash();
