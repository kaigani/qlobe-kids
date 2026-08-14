import config from '../config.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as rawSfx from '../../../shared/js/sfx.js';
import { installUnlockOnGesture, installKioskGuards, unlockAll } from '../../../shared/js/audio-unlock.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTimers } from '../../../shared/js/timers.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const screens = Object.fromEntries($$('[data-screen]').map((el) => [el.dataset.screen, el]));
const candidateButtons = $$('.scm-candidate');
const timers = createTimers();
const sampleAudio = new Audio();
sampleAudio.preload = 'auto';

const state = {
  screen: 'splash',
  mode: null,
  round: -1,
  rounds: config.mode.rounds,
  matched: 0,
  target: null,
  candidates: [],
  awaitingInput: false,
  previewing: false,
  instructionActive: false,
  pendingChoice: null,
  promptKey: 'welcome',
  busy: false,
  muted: false,
  seed: 42,
  lastSample: null,
  lastChoice: null,
  flow: 0,
};

let rng = mulberry32(state.seed);
let sessionTargets = [];
let sampleToken = 0;
let samplesUnlocked = false;
let finishCurrentSample = null;
let finishFindInstruction = null;
let activeFindInstruction = null;
const sampleLog = [];

const SAMPLE_BASE = new URL('../assets/samples/', import.meta.url);
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

function soundById(id) { return config.sounds.find((sound) => sound.id === id); }
function sampleUrl(id) { return new URL(soundById(id).file, SAMPLE_BASE).href; }
function safeSfx(name) { if (!state.muted) { try { rawSfx[name]?.(); } catch { /* input never strands */ } } }

function unlockSamples() {
  if (samplesUnlocked) return;
  try {
    sampleAudio.muted = true;
    sampleAudio.src = SILENT_WAV;
    const playing = sampleAudio.play();
    const settle = () => {
      samplesUnlocked = true;
      try { sampleAudio.pause(); sampleAudio.currentTime = 0; } catch { /* no-op */ }
      sampleAudio.muted = state.muted;
    };
    if (playing?.then) playing.then(settle, () => { samplesUnlocked = false; sampleAudio.muted = state.muted; });
    else settle();
  } catch { samplesUnlocked = false; }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) samplesUnlocked = false; });
window.addEventListener('pageshow', () => { samplesUnlocked = false; });

function stopSample() {
  sampleToken += 1;
  try { sampleAudio.pause(); sampleAudio.currentTime = 0; } catch { /* no-op */ }
  finishCurrentSample?.(false);
  finishCurrentSample = null;
}

function playSample(id) {
  const sound = soundById(id);
  if (!sound) return Promise.resolve(false);
  const token = ++sampleToken;
  state.lastSample = id;
  const logEntry = { id, at: Math.round(performance.now()), muted: state.muted, ok: state.muted ? true : null };
  sampleLog.push(logEntry);
  if (sampleLog.length > 40) sampleLog.splice(0, sampleLog.length - 40);
  if (state.muted) return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      logEntry.ok = Boolean(ok);
      if (finishCurrentSample === finish) finishCurrentSample = null;
      sampleAudio.removeEventListener('ended', ended);
      sampleAudio.removeEventListener('error', failed);
      resolve(ok);
    };
    const ended = () => finish(token === sampleToken);
    const failed = () => finish(false);
    finishCurrentSample = finish;
    sampleAudio.addEventListener('ended', ended);
    sampleAudio.addEventListener('error', failed);
    sampleAudio.muted = false;
    sampleAudio.src = sampleUrl(id);
    try { sampleAudio.currentTime = 0; } catch { /* no-op */ }
    const playing = sampleAudio.play();
    if (playing?.catch) playing.catch(failed);
    window.setTimeout(() => finish(token === sampleToken), 2200);
  });
}

function speak(key) {
  state.promptKey = key;
  return voice.say(key, config.lines[key]);
}

function animatePrompt() {
  const prompt = $('.scm-prompt');
  if (!prompt) return;
  prompt.classList.remove('is-replaying');
  void prompt.offsetWidth;
  prompt.classList.add('is-replaying');
  timers.after(520, () => prompt.classList.remove('is-replaying'));
}

function repeatPrompt() {
  if (state.muted) return false;
  animatePrompt();
  const replay = speak(state.promptKey || 'welcome');
  activeFindInstruction?.replay(replay);
  return replay;
}

function beginFindInstruction() {
  let gateSettled = false;
  let doneSettled = false;
  let resolveGate;
  let resolveDone;
  let replayToken = 0;
  const gate = new Promise((resolve) => { resolveGate = resolve; });
  const done = new Promise((resolve) => { resolveDone = resolve; });
  const finish = () => {
    if (!gateSettled) {
      gateSettled = true;
      resolveGate();
    }
    if (!doneSettled) {
      doneSettled = true;
      resolveDone();
    }
  };
  const replay = (promise) => {
    const token = ++replayToken;
    Promise.resolve(promise).then(() => {
      if (token === replayToken && !doneSettled) {
        doneSettled = true;
        resolveDone();
      }
    }, () => {
      if (token === replayToken && !doneSettled) {
        doneSettled = true;
        resolveDone();
      }
    });
  };
  finishFindInstruction = finish;
  const instruction = { gate, done, finish, replay };
  activeFindInstruction = instruction;
  return instruction;
}

function showScreen(name) {
  timers.clearAll();
  stopSample();
  finishFindInstruction?.();
  finishFindInstruction = null;
  activeFindInstruction = null;
  voice.stop();
  state.flow += 1;
  state.previewing = false;
  state.instructionActive = false;
  state.pendingChoice = null;
  for (const [id, el] of Object.entries(screens)) el.hidden = id !== name;
  state.screen = name;
}

function setPrompt(text, key = null) {
  if (key) state.promptKey = key;
  $('[data-prompt]').textContent = text;
}

function renderProgress() {
  const host = $('[data-progress]');
  host.replaceChildren();
  for (let index = 0; index < state.rounds; index += 1) {
    const img = document.createElement('img');
    img.src = './assets/art/star.webp';
    img.alt = '';
    if (index < state.matched) img.className = 'is-done';
    else if (index === state.round) img.className = 'is-now';
    host.append(img);
  }
  host.setAttribute('aria-label', `${state.matched} of ${state.rounds} sounds matched`);
}

function resetRoundVisuals() {
  $('.scm-reference').classList.remove('is-shaking', 'is-correct');
  $('[data-connector]').classList.remove('is-visible');
  for (const button of candidateButtons) button.classList.remove('is-shaking', 'is-pending', 'is-wrong', 'is-correct');
}

function animateOnce(element, className, ms = 700) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  timers.after(ms, () => element.classList.remove(className));
}

function pickDistractors(target) {
  const others = config.sounds.filter((sound) => sound.id !== target.id);
  const differentGroups = others.filter((sound) => sound.group !== target.group);
  const sameGroup = others.filter((sound) => sound.group === target.group);
  const pool = state.round < 2 ? differentGroups : [...sameGroup, ...differentGroups];
  return shuffle(pool, rng).slice(0, 2);
}

async function showRound(index) {
  if (state.screen !== 'play') return;
  const flow = ++state.flow;
  state.round = index;
  state.target = sessionTargets[index];
  state.lastChoice = null;
  state.awaitingInput = false;
  state.previewing = false;
  state.instructionActive = false;
  state.pendingChoice = null;
  state.promptKey = 'welcome';
  state.busy = true;
  resetRoundVisuals();
  const choices = shuffle([state.target, ...pickDistractors(state.target)], rng);
  state.candidates = choices.map((sound) => sound.id);
  candidateButtons.forEach((button, choiceIndex) => {
    const id = state.candidates[choiceIndex];
    button.dataset.sound = id;
    button.dataset.role = id === state.target.id ? 'correct' : 'different';
  });
  renderProgress();

  const lineKey = index === 0 ? 'start' : `round-${['one', 'two', 'three', 'four'][index]}`;
  setPrompt(index === 0 ? 'Listen to the coral shaker.' : 'A new mystery sound!', lineKey);
  if (config.lines[lineKey]) await speak(lineKey);
  if (flow !== state.flow || state.screen !== 'play') return;
  await tapReference(true);
  if (flow !== state.flow || state.screen !== 'play') return;

  // Let the child hear every aqua option before the game asks for a choice.
  // The buttons remain interruptible during this sequence so an eager child
  // can tap an option as soon as it sounds familiar.
  state.previewing = true;
  await previewCandidates(flow);
  if (flow !== state.flow || state.screen !== 'play' || !state.previewing) return;
  state.previewing = false;
  setPrompt('Which aqua shaker sounds the same?', 'find');
  state.instructionActive = true;
  const instruction = beginFindInstruction();
  instruction.replay(speak('find'));
  await Promise.race([instruction.done, instruction.gate]);
  instruction.finish();
  if (finishFindInstruction === instruction.finish) finishFindInstruction = null;
  if (activeFindInstruction === instruction) activeFindInstruction = null;
  if (flow !== state.flow || state.screen !== 'play') return;
  state.instructionActive = false;
  if (state.pendingChoice) {
    const { index, id } = state.pendingChoice;
    state.pendingChoice = null;
    return finishCandidateChoice(index, id, { samplePlayed: true });
  }
  state.busy = false;
  state.awaitingInput = true;
  scheduleIdle();
}

async function previewCandidates(flow) {
  for (const [choiceIndex, id] of state.candidates.entries()) {
    if (flow !== state.flow || state.screen !== 'play' || !state.previewing) return false;
    const button = candidateButtons[choiceIndex];
    animateOnce(button, 'is-shaking', 560);
    safeSfx('pop');
    await playSample(id);
  }
  return true;
}

async function tapReference(fromFlow = false) {
  if (state.screen !== 'play' || !state.target) return false;
  if (!fromFlow && state.busy) return false;
  const wasBusy = state.busy;
  state.busy = true;
  state.awaitingInput = false;
  timers.clearAll();
  const button = $('.scm-reference');
  animateOnce(button, 'is-shaking', 560);
  safeSfx('pop');
  await playSample(state.target.id);
  state.busy = wasBusy;
  if (!wasBusy) { state.awaitingInput = true; scheduleIdle(); }
  return true;
}

async function chooseCandidate(index) {
  if (state.screen !== 'play' || (!state.awaitingInput && !state.previewing && !state.instructionActive)) return false;
  const button = candidateButtons[index];
  const chosen = state.candidates[index];
  if (!button || !chosen) return false;

  // During the spoken instruction, commit the first tap immediately and let
  // its sample play on the independent sample channel. The instruction keeps
  // speaking; showRound consumes this pending choice as soon as that line
  // ends, so the result follows directly without another prompt.
  if (state.instructionActive) {
    if (state.pendingChoice) return false;
    state.pendingChoice = { index, id: chosen };
    state.lastChoice = chosen;
    button.classList.add('is-pending');
    animateOnce(button, 'is-shaking', 560);
    safeSfx('pop');
    void playSample(chosen);
    return true;
  }

  state.flow += 1;
  state.previewing = false;
  timers.clearAll();
  $('.scm-reference').classList.remove('is-shaking');
  for (const candidate of candidateButtons) candidate.classList.remove('is-shaking');
  voice.stop();
  stopSample();
  state.busy = true;
  state.awaitingInput = false;
  state.lastChoice = chosen;
  animateOnce(button, 'is-shaking', 560);
  safeSfx('pop');
  await playSample(chosen);
  return finishCandidateChoice(index, chosen, { samplePlayed: true });
}

async function finishCandidateChoice(index, chosen, { samplePlayed = false } = {}) {
  if (state.screen !== 'play') return false;
  const button = candidateButtons[index];
  button.classList.remove('is-pending');
  if (!samplePlayed) await playSample(chosen);
  if (state.screen !== 'play') return false;

  if (chosen === state.target.id) {
    state.matched += 1;
    button.classList.add('is-correct');
    $('.scm-reference').classList.add('is-correct');
    $('[data-connector]').classList.add('is-visible');
    safeSfx('sparkle');
    renderProgress();
    setPrompt('You found the sound twin!', 'same');
    await speak('same');
    await timers.wait(650);
    if (state.round + 1 >= state.rounds) return finishGame();
    return showRound(state.round + 1);
  }

  button.classList.add('is-wrong');
  safeSfx('boing');
  setPrompt('Different sounds. Listen again.', 'different');
  await speak('different');
  if (state.screen !== 'play') return false;
  await playSample(state.target.id);
  button.classList.remove('is-wrong');
  setPrompt('Which aqua shaker sounds the same?', 'find');
  state.busy = false;
  state.awaitingInput = true;
  scheduleIdle();
  return false;
}

function scheduleIdle() {
  timers.clearAll();
  timers.after(9000, async () => {
    if (state.screen !== 'play' || !state.awaitingInput || state.busy) return;
    state.busy = true;
    state.awaitingInput = false;
    setPrompt('Listen to the coral shaker again.', 'idle-reference');
    await speak('idle-reference');
    await tapReference(true);
    if (state.screen !== 'play') return;
    setPrompt('Try an aqua shaker.', 'idle-candidate');
    await speak('idle-candidate');
    state.busy = false;
    state.awaitingInput = true;
    scheduleIdle();
  });
}

async function startMode({ replay = false } = {}) {
  await ready;
  showScreen('play');
  state.mode = config.mode.id;
  state.round = -1;
  state.matched = 0;
  state.target = null;
  state.candidates = [];
  state.awaitingInput = false;
  state.previewing = false;
  state.instructionActive = false;
  state.pendingChoice = null;
  state.busy = true;
  sessionTargets = shuffle(config.sounds, rng).slice(0, state.rounds);
  renderProgress();
  setPrompt('Get your listening ears ready!', replay ? 'again' : 'welcome');
  await speak(replay ? 'again' : 'welcome');
  if (state.screen === 'play') await showRound(0);
}

async function finishGame() {
  showScreen('end');
  state.round = state.rounds;
  state.awaitingInput = false;
  state.previewing = false;
  state.instructionActive = false;
  state.pendingChoice = null;
  state.busy = false;
  safeSfx('tada');
  await speak('complete');
  return true;
}

function renderSplash() {
  showScreen('splash');
  state.mode = null;
  state.round = -1;
  state.matched = 0;
  state.target = null;
  state.candidates = [];
  state.awaitingInput = false;
  state.previewing = false;
  state.instructionActive = false;
  state.pendingChoice = null;
  state.busy = false;
}

function setMuted(on = !state.muted) {
  state.muted = Boolean(on);
  voice.setMuted(state.muted);
  sampleAudio.muted = state.muted;
  if (state.muted) {
    stopSample();
    finishFindInstruction?.();
    finishFindInstruction = null;
    activeFindInstruction = null;
    voice.stop();
  }
  for (const button of $$('[data-action="sound"]')) {
    button.setAttribute('aria-label', state.muted ? 'Sound is muted' : 'Hear the prompt again');
    button.classList.toggle('is-muted', state.muted);
  }
  return state.muted;
}

function prepareAudio() { unlockAll([unlockSamples]); }

async function tapTarget(id) {
  if (id === 'play') return startMode();
  if (id === 'again') return startMode({ replay: true });
  if (id === 'reference') return tapReference();
  if (id === 'back-play' || id === 'back-end') return renderSplash();
  if (id.startsWith('sound-')) return repeatPrompt();
  const match = id.match(/^candidate-(\d)$/);
  if (match) return chooseCandidate(Number(match[1]));
  return false;
}

function wireControls() {
  for (const button of $$('[data-action]')) {
    const action = button.dataset.action;
    onTap(button, () => {
      prepareAudio();
      if (action === 'play') startMode();
      else if (action === 'again') startMode({ replay: true });
      else if (action === 'back') renderSplash();
      else if (action === 'sound') repeatPrompt();
      else if (action === 'reference') tapReference();
    }, { feedback: () => { prepareAudio(); safeSfx('tick'); } });
  }
  candidateButtons.forEach((button, index) => onTap(button, () => { prepareAudio(); chooseCandidate(index); }, {
    feedback: prepareAudio,
  }));
}

function buildConfetti() {
  const host = $('[data-confetti]');
  for (let index = 0; index < 14; index += 1) {
    const img = document.createElement('img');
    img.src = './assets/art/star.webp'; img.alt = '';
    img.style.left = `${3 + (index * 7.1) % 92}%`;
    img.style.top = `${7 + (index * 17) % 77}%`;
    img.style.animationDelay = `${-(index % 5) * .34}s`;
    host.append(img);
  }
}

const ready = Promise.all([
  voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.lines),
  ...config.sounds.map((sound) => fetch(sampleUrl(sound.id)).then((response) => {
    if (!response.ok) throw new Error(`Missing sound sample: ${sound.file}`);
    return response.arrayBuffer();
  })),
]).then(() => true).catch((error) => {
  console.error(error);
  $('[data-status]').textContent = 'Sound files need an adult check.';
  $('.scm-play-button').disabled = true;
  throw error;
});

wireControls();
buildConfetti();
installUnlockOnGesture({ extra: [unlockSamples] });
installKioskGuards();

installDebug({
  gameId: config.id,
  engine: 'custom-sound-cylinder',
  ready,
  listModes: () => [{ id: config.mode.id, title: config.mode.title }],
  startMode: (id) => id === config.mode.id ? startMode() : false,
  getState: () => ({
    screen: state.screen, mode: state.mode, round: state.round, rounds: state.rounds,
    matched: state.matched, target: state.target?.id || null,
    candidates: state.candidates.slice(), awaitingInput: state.awaitingInput,
    previewing: state.previewing,
    instructionActive: state.instructionActive,
    pendingChoice: state.pendingChoice?.id || null,
    busy: state.busy, muted: state.muted, seed: state.seed,
    lastSample: state.lastSample, lastChoice: state.lastChoice,
  }),
  getTargets: () => collectTargets(screens[state.screen]),
  tap: tapTarget,
  winRound: () => {
    const index = state.candidates.indexOf(state.target?.id);
    return index >= 0 ? chooseCandidate(index) : false;
  },
  complete: finishGame,
  mute: setMuted,
  seed: (value) => {
    state.seed = Number.isFinite(Number(value)) ? Number(value) >>> 0 : 42;
    rng = mulberry32(state.seed);
    return state.seed;
  },
  timers,
  getAudioLog: () => ({ voice: voice.getAudioLog(), samples: sampleLog.map((entry) => ({ ...entry })) }),
  home: renderSplash,
});

ready.then(() => { $('[data-status]').textContent = ''; });
