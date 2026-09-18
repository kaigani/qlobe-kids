import config from '../config.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { onTap } from '../../../shared/js/tap.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { createScreens } from '../../../shared/js/screens.js';
import { createTimers } from '../../../shared/js/timers.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';

const root = document.querySelector('#game');
const timers = createTimers();
const STORAGE_KEY = 'qlobe-instrument-detective-v1';
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

const INSTRUMENTS = {
  maracas: { name: 'Maracas', verb: 'shake', motion: 'shake' },
  drum: { name: 'Drum', verb: 'boom', motion: 'drum' },
  bell: { name: 'Bell', verb: 'ring', motion: 'swing' },
  piano: { name: 'Piano', verb: 'plink', motion: 'bounce' },
  guitar: { name: 'Guitar', verb: 'strum', motion: 'strum' },
  flute: { name: 'Flute', verb: 'sing', motion: 'float' },
};

const ART = {
  backgrounds: ['./assets/backgrounds/theater.webp', './assets/backgrounds/finale.webp'],
  owls: ['listening', 'presenting', 'celebrating', 'conducting']
    .map((pose) => `./assets/characters/owl-${pose}.webp`),
  instruments: config.instruments.map((id) => `${config.assets.instrumentRoot}${id}.webp`),
  ui: ['title', 'card-green', 'card-purple', 'card-blue', 'listen-button', 'primary-button', 'progress-plaque']
    .map((id) => `./assets/ui/${id}.webp`),
};

const state = {
  screen: 'splash',
  mode: null,
  roundIndex: -1,
  roundOrder: [],
  target: null,
  candidates: [],
  solved: [],
  awaitingChoice: false,
  busy: false,
  muted: false,
  seed: 42,
  lastChoice: null,
  lastSample: null,
  firstGesture: false,
  completedBefore: false,
  flow: 0,
};

let rng = mulberry32(state.seed);
let lines = {};
let stopCelebration = null;
const sampleLog = [];
const sampleChannels = new Map();
const roundById = new Map(config.rounds.map((round) => [round.id, round]));

function readProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      complete: Boolean(saved.complete),
      unlocked: Array.isArray(saved.unlocked)
        ? saved.unlocked.filter((id) => config.instruments.includes(id))
        : [],
    };
  } catch {
    return { complete: false, unlocked: [] };
  }
}

function writeProgress() {
  try {
    const previous = readProgress();
    const unlocked = [...new Set([...previous.unlocked, ...state.solved])]
      .filter((id) => config.instruments.includes(id));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      complete: previous.complete || unlocked.length === config.instruments.length,
      unlocked,
    }));
  } catch { /* local progress is a bonus, never a gate */ }
}

function instrumentArt(id) { return `${config.assets.instrumentRoot}${id}.webp`; }
function owlArt(pose) { return `./assets/characters/owl-${pose}.webp`; }
function uiArt(id) { return `./assets/ui/${id}.webp`; }
function audioUrl(id) {
  const round = roundById.get(id);
  return new URL(`${config.audioRoot}${round.audio}`, document.baseURI).href;
}

function safeSfx(name) {
  if (state.muted) return;
  try { sfx[name]?.(); } catch { /* feedback never strands play */ }
}

function buildAudioChannels() {
  for (const id of config.instruments) {
    const channel = new Audio(audioUrl(id));
    channel.preload = 'auto';
    channel.volume = id === 'maracas' ? 0.58 : 0.7;
    sampleChannels.set(id, channel);
  }
}

function unlockSamples() {
  for (const channel of sampleChannels.values()) {
    try {
      const original = channel.src;
      channel.muted = true;
      channel.src = SILENT_WAV;
      const play = channel.play();
      Promise.resolve(play).then(() => {
        channel.pause();
        channel.currentTime = 0;
        channel.src = original;
        channel.load();
        channel.muted = state.muted;
      }, () => {
        channel.src = original;
        channel.muted = state.muted;
      });
    } catch { /* Web Speech and visible interaction remain available */ }
  }
}

function stopSamples() {
  for (const channel of sampleChannels.values()) {
    try { channel.pause(); channel.currentTime = 0; } catch { /* no-op */ }
  }
}

function playInstrument(id, { overlap = false } = {}) {
  const channel = sampleChannels.get(id);
  state.lastSample = id;
  const entry = { id, at: Math.round(performance.now()), muted: state.muted, ok: state.muted };
  sampleLog.push(entry);
  if (sampleLog.length > 60) sampleLog.splice(0, sampleLog.length - 60);
  if (!channel || state.muted) return Promise.resolve(Boolean(channel));
  if (!overlap) stopSamples();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      entry.ok = Boolean(ok);
      channel.removeEventListener('ended', ended);
      channel.removeEventListener('error', failed);
      resolve(Boolean(ok));
    };
    const ended = () => finish(true);
    const failed = () => finish(false);
    channel.addEventListener('ended', ended);
    channel.addEventListener('error', failed);
    channel.muted = false;
    try { channel.currentTime = 0; } catch { /* stream may not be seekable yet */ }
    const play = channel.play();
    if (play?.catch) play.catch(failed);
    window.setTimeout(() => finish(true), Math.max(1500, (channel.duration || 1) * 1000 + 250));
  });
}

function setMuted(on) {
  state.muted = Boolean(on);
  voice.setMuted(state.muted);
  for (const channel of sampleChannels.values()) channel.muted = state.muted;
  if (state.muted) stopSamples();
  document.querySelectorAll('[data-mute-control]').forEach((button) => {
    button.classList.toggle('is-muted', state.muted);
    button.setAttribute('aria-label', state.muted ? 'Turn sound on' : 'Mute sound');
    button.setAttribute('aria-pressed', String(state.muted));
  });
  return state.muted;
}

function speak(key) { return voice.say(key, lines[key] || ''); }

root.innerHTML = `
  <section class="id-screen id-scene id-splash" data-qk-screen="splash" aria-label="Instrument Detective title screen">
    <div class="id-safe id-splash-layout">
      <img class="id-title" src="${uiArt('title')}" alt="Instrument Detective">
      <img class="id-splash-owl" src="${owlArt('listening')}" alt="A friendly owl detective">
      <div class="id-splash-instruments" aria-hidden="true">
        <img src="${instrumentArt('maracas')}" alt="">
        <img src="${instrumentArt('drum')}" alt="">
        <img src="${instrumentArt('bell')}" alt="">
      </div>
      <p class="id-tagline">Tap, listen, and guess!</p>
      <button class="id-raster-button id-start-button" type="button" data-target="start-listen" aria-label="Play Sound Detective">
        <img src="${uiArt('primary-button')}" alt="">
        <span>PLAY</span>
      </button>
      <button class="id-raster-button id-band-entry" type="button" data-target="open-concert" aria-label="Open your detective band" hidden>
        <img src="${uiArt('progress-plaque')}" alt="">
        <span>MY BAND</span>
      </button>
    </div>
  </section>

  <section class="id-screen id-scene id-play" data-qk-screen="play" hidden aria-label="Listen and choose an instrument">
    <div class="id-safe id-play-layout">
      <header class="id-play-header">
        <p class="id-eyebrow">LISTEN CLOSELY</p>
        <h1 data-play-prompt>Which instrument?</h1>
        <div class="id-progress" aria-live="polite">
          <img src="${uiArt('progress-plaque')}" alt="">
          <span data-progress-text>1 of 6</span>
        </div>
      </header>
      <img class="id-play-owl" src="${owlArt('presenting')}" alt="The owl detective is listening">
      <button class="id-listen-button" type="button" data-target="listen-clue" aria-label="Play the mystery sound">
        <img src="${uiArt('listen-button')}" alt="">
        <span>LISTEN</span>
      </button>
      <div class="id-casebook" data-casebook aria-label="Instruments found"></div>
      <div class="id-choices" data-choices aria-live="polite"></div>
    </div>
  </section>

  <section class="id-screen id-scene id-reveal" data-qk-screen="reveal" hidden aria-label="Instrument discovered">
    <div class="id-safe id-reveal-layout">
      <header class="id-reveal-copy" aria-live="polite">
        <p class="id-eyebrow">CASE SOLVED!</p>
        <h1 data-reveal-title>You found it!</h1>
        <p data-reveal-sound></p>
      </header>
      <img class="id-reveal-owl" src="${owlArt('celebrating')}" alt="The owl detective celebrates">
      <div class="id-hero-spotlight">
        <img class="id-hero-instrument" data-reveal-instrument src="" alt="">
      </div>
      <button class="id-raster-button id-reveal-next" type="button" data-target="reveal-next" aria-label="Add the instrument to the band">
        <img src="${uiArt('primary-button')}" alt="">
        <span data-reveal-action>ADD TO BAND</span>
      </button>
    </div>
  </section>

  <section class="id-screen id-scene id-concert" data-qk-screen="concert" hidden aria-label="Your detective band">
    <div class="id-safe id-concert-layout">
      <header class="id-concert-copy" aria-live="polite">
        <p class="id-eyebrow">CASE CLOSED!</p>
        <h1>Your Detective Band</h1>
        <p>Tap an instrument and make some music.</p>
      </header>
      <div class="id-band-stage" data-band-stage></div>
      <img class="id-conductor" src="${owlArt('conducting')}" alt="The owl detective conducts the band">
      <div class="id-band-controls">
        <button class="id-raster-button id-band-play" type="button" data-target="play-band" aria-label="Play the whole band">
          <img src="${uiArt('primary-button')}" alt="">
          <span>PLAY THE BAND</span>
        </button>
        <button class="id-raster-button id-play-again" type="button" data-target="play-again" aria-label="Solve the sounds again">
          <img src="${uiArt('progress-plaque')}" alt="">
          <span>NEW CASE</span>
        </button>
      </div>
    </div>
  </section>
`;

const screenController = createScreens({
  root,
  screens: {
    splash: '[data-qk-screen="splash"]',
    play: '[data-qk-screen="play"]',
    reveal: '[data-qk-screen="reveal"]',
    concert: '[data-qk-screen="concert"]',
  },
  initial: 'splash',
  voice,
  onExit: () => {
    timers.clearAll();
    stopSamples();
    stopCelebration?.();
    stopCelebration = null;
  },
});

function addHud(screenName, kind) {
  const host = screenController.el(screenName);
  const navigation = hudButton(kind, () => {
    if (kind === 'home') window.location.href = '../../';
    else showSplash();
  });
  navigation.classList.add('qk-hud-top-left');
  navigation.dataset.target = kind === 'home' ? 'home' : `back-${screenName}`;
  host.append(navigation);

  const sound = hudButton('sound', () => setMuted(!state.muted), {
    label: state.muted ? 'Turn sound on' : 'Mute sound',
  });
  sound.classList.add('qk-hud-top-right');
  sound.dataset.muteControl = '';
  sound.dataset.target = `mute-${screenName}`;
  host.append(sound);
}

addHud('splash', 'home');
addHud('play', 'back');
addHud('reveal', 'back');
addHud('concert', 'back');

function setScreen(name) {
  state.flow += 1;
  state.screen = name;
  screenController.show(name);
}

function updateSplash() {
  const progress = readProgress();
  state.completedBefore = progress.complete;
  document.querySelector('[data-target="open-concert"]').hidden = !progress.complete;
}

function showSplash() {
  state.mode = null;
  state.roundIndex = -1;
  state.target = null;
  state.candidates = [];
  state.awaitingChoice = false;
  state.busy = false;
  setScreen('splash');
  updateSplash();
}

function renderCasebook() {
  const host = document.querySelector('[data-casebook]');
  host.replaceChildren();
  for (const id of config.instruments) {
    const item = document.createElement('span');
    item.className = 'id-casebook-item';
    item.classList.toggle('is-found', state.solved.includes(id));
    item.setAttribute('aria-label', state.solved.includes(id) ? `${INSTRUMENTS[id].name} found` : 'Mystery instrument');
    const img = document.createElement('img');
    img.src = instrumentArt(id);
    img.alt = '';
    item.append(img);
    host.append(item);
  }
}

function renderChoices() {
  const host = document.querySelector('[data-choices]');
  host.replaceChildren();
  const plates = ['card-green', 'card-purple', 'card-blue'];
  state.candidates.forEach((id, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'id-choice';
    button.dataset.target = `choice-${id}`;
    button.dataset.role = id === state.target ? 'correct' : 'distractor';
    button.dataset.instrument = id;
    button.setAttribute('aria-label', INSTRUMENTS[id].name);
    button.innerHTML = `
      <img class="id-card-plate" src="${uiArt(plates[index])}" alt="">
      <img class="id-choice-instrument" src="${instrumentArt(id)}" alt="">
      <span>${INSTRUMENTS[id].name.toUpperCase()}</span>
    `;
    onTap(button, () => void chooseInstrument(id, button), {
      feedback: () => safeSfx('tick'),
    });
    host.append(button);
  });
}

function animateInstrumentNode(node, id, duration = 760) {
  if (!node) return;
  node.classList.remove('is-performing', ...Object.values(INSTRUMENTS).map((item) => `motion-${item.motion}`));
  void node.offsetWidth;
  node.classList.add('is-performing', `motion-${INSTRUMENTS[id].motion}`);
  timers.after(duration, () => node.classList.remove('is-performing', `motion-${INSTRUMENTS[id].motion}`));
}

function scheduleIdleClue(flow) {
  timers.after(9000, async () => {
    if (flow !== state.flow || state.screen !== 'play' || !state.awaitingChoice || state.busy) return;
    state.busy = true;
    state.awaitingChoice = false;
    await speak('replay');
    if (flow !== state.flow || state.screen !== 'play') return;
    await replayClue({ idle: true });
  });
}

async function showRound(index) {
  const flow = ++state.flow;
  timers.clearAll();
  stopSamples();
  voice.stop();
  state.screen = 'play';
  state.mode = 'listen';
  state.roundIndex = index;
  const round = state.roundOrder[index];
  state.target = round.id;
  state.candidates = shuffle(round.choices, rng);
  state.lastChoice = null;
  state.awaitingChoice = false;
  state.busy = true;
  screenController.show('play');

  const prompt = document.querySelector('[data-play-prompt]');
  prompt.textContent = 'Which instrument?';
  document.querySelector('[data-progress-text]').textContent = `${index + 1} of ${state.roundOrder.length}`;
  renderCasebook();
  renderChoices();

  const listen = document.querySelector('[data-target="listen-clue"]');
  listen.classList.remove('is-try-again');
  listen.classList.add('is-playing');
  await playInstrument(state.target);
  listen.classList.remove('is-playing');
  if (flow !== state.flow || state.screen !== 'play') return false;
  await speak(`round-${state.target}`);
  if (flow !== state.flow || state.screen !== 'play') return false;
  state.busy = false;
  state.awaitingChoice = true;
  scheduleIdleClue(flow);
  return true;
}

async function replayClue({ idle = false } = {}) {
  if (state.screen !== 'play' || !state.target || (state.busy && !idle)) return false;
  const flow = state.flow;
  state.busy = true;
  state.awaitingChoice = false;
  timers.clearAll();
  const button = document.querySelector('[data-target="listen-clue"]');
  button.classList.remove('is-try-again');
  button.classList.add('is-playing');
  safeSfx('pop');
  await playInstrument(state.target);
  button.classList.remove('is-playing');
  if (flow !== state.flow || state.screen !== 'play') return false;
  state.busy = false;
  state.awaitingChoice = true;
  scheduleIdleClue(flow);
  return true;
}

async function chooseInstrument(id, button) {
  if (state.screen !== 'play' || !state.awaitingChoice || state.busy) return false;
  const flow = state.flow;
  state.awaitingChoice = false;
  state.busy = true;
  state.lastChoice = id;
  timers.clearAll();
  document.querySelector('[data-target="listen-clue"]')?.classList.remove('is-try-again');
  animateInstrumentNode(button.querySelector('.id-choice-instrument'), id);
  await playInstrument(id);
  if (flow !== state.flow || state.screen !== 'play') return false;

  if (id === state.target) {
    if (!state.solved.includes(id)) state.solved.push(id);
    writeProgress();
    button.classList.add('is-correct');
    safeSfx('sparkle');
    await timers.wait(240);
    if (flow !== state.flow || state.screen !== 'play') return false;
    return showReveal(id);
  }

  button.classList.add('is-gentle-retry');
  safeSfx('boing');
  await speak('nudge');
  if (flow !== state.flow || state.screen !== 'play') return false;
  button.classList.remove('is-gentle-retry');
  const listen = document.querySelector('[data-target="listen-clue"]');
  listen.classList.add('is-try-again');
  listen.classList.add('is-playing');
  await playInstrument(state.target);
  listen.classList.remove('is-playing');
  if (flow !== state.flow || state.screen !== 'play') return false;
  state.busy = false;
  state.awaitingChoice = true;
  scheduleIdleClue(flow);
  return false;
}

async function showReveal(id) {
  const flow = ++state.flow;
  state.screen = 'reveal';
  state.busy = true;
  state.awaitingChoice = false;
  screenController.show('reveal');
  const meta = INSTRUMENTS[id];
  const hero = document.querySelector('[data-reveal-instrument]');
  hero.src = instrumentArt(id);
  hero.alt = meta.name;
  hero.dataset.instrument = id;
  document.querySelector('[data-reveal-title]').textContent = `You found the ${meta.name}!`;
  document.querySelector('[data-reveal-sound]').textContent = `${meta.verb.toUpperCase()} · ${meta.verb.toUpperCase()}!`;
  const finalRound = state.roundIndex + 1 >= state.roundOrder.length;
  document.querySelector('[data-reveal-action]').textContent = finalRound ? 'MEET THE BAND' : 'ADD TO BAND';
  document.querySelector('[data-target="reveal-next"]').setAttribute(
    'aria-label', finalRound ? 'Meet your detective band' : `Add ${meta.name} to the band`,
  );
  animateInstrumentNode(hero, id, 1200);
  stopCelebration = burstConfetti({ host: screenController.el('reveal'), count: 18, duration: 1900, rng });
  await speak(`correct-${id}`);
  if (flow !== state.flow || state.screen !== 'reveal') return false;
  if (state.solved.length === 3) await speak('halfway');
  if (flow !== state.flow || state.screen !== 'reveal') return false;
  state.busy = false;
  return true;
}

async function nextFromReveal() {
  if (state.screen !== 'reveal' || state.busy) return false;
  if (state.roundIndex + 1 >= state.roundOrder.length) {
    state.solved = [...config.instruments];
    writeProgress();
    return showConcert({ celebrate: true });
  }
  return showRound(state.roundIndex + 1);
}

function renderBand() {
  const host = document.querySelector('[data-band-stage]');
  host.replaceChildren();
  for (const id of config.instruments) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'id-band-instrument';
    button.dataset.target = `concert-${id}`;
    button.dataset.instrument = id;
    button.setAttribute('aria-label', `Play ${INSTRUMENTS[id].name}`);
    const img = document.createElement('img');
    img.src = instrumentArt(id);
    img.alt = '';
    button.append(img);
    onTap(button, () => void playConcertInstrument(id, button), {
      feedback: () => safeSfx('tick'),
    });
    host.append(button);
  }
}

async function playConcertInstrument(id, button) {
  if (state.screen !== 'concert') return false;
  animateInstrumentNode(button.querySelector('img'), id, 900);
  safeSfx('pop');
  return playInstrument(id, { overlap: true });
}

async function showConcert({ celebrate = false, announce = true } = {}) {
  const flow = ++state.flow;
  state.screen = 'concert';
  state.mode = 'concert';
  state.target = null;
  state.candidates = [];
  state.awaitingChoice = false;
  state.busy = false;
  screenController.show('concert');
  renderBand();
  if (celebrate) {
    safeSfx('tada');
    stopCelebration = burstConfetti({ host: screenController.el('concert'), count: 36, duration: 2700, rng });
    await speak('finale');
  }
  if (announce && flow === state.flow && state.screen === 'concert') await speak('concert');
  return true;
}

async function playWholeBand() {
  if (state.screen !== 'concert' || state.busy) return false;
  const flow = state.flow;
  state.busy = true;
  const pattern = ['drum', 'maracas', 'piano', 'bell', 'guitar', 'flute', 'drum', 'piano', 'maracas', 'guitar', 'bell', 'flute'];
  for (const id of pattern) {
    if (flow !== state.flow || state.screen !== 'concert') return false;
    const button = document.querySelector(`[data-target="concert-${id}"]`);
    animateInstrumentNode(button?.querySelector('img'), id, 620);
    void playInstrument(id, { overlap: true });
    await timers.wait(id === 'maracas' ? 520 : 410);
  }
  if (flow !== state.flow || state.screen !== 'concert') return false;
  state.busy = false;
  safeSfx('sparkle');
  return true;
}

async function startListen() {
  await ready;
  state.mode = 'listen';
  state.solved = [];
  state.roundOrder = shuffle(config.rounds, rng);
  state.roundIndex = -1;
  state.target = null;
  state.candidates = [];
  state.busy = true;
  setScreen('play');
  await speak('intro');
  if (state.screen !== 'play') return false;
  return showRound(0);
}

const guardedClue = soundDebounce(() => void replayClue(), 520);
onTap(document.querySelector('[data-target="start-listen"]'), () => void screenController.start(startListen), {
  feedback: () => safeSfx('pop'),
});
onTap(document.querySelector('[data-target="open-concert"]'), () => void showConcert(), {
  feedback: () => safeSfx('pop'),
});
onTap(document.querySelector('[data-target="listen-clue"]'), guardedClue, {
  feedback: () => safeSfx('tick'),
});
onTap(document.querySelector('[data-target="reveal-next"]'), () => void nextFromReveal(), {
  feedback: () => safeSfx('pop'),
});
onTap(document.querySelector('[data-target="play-band"]'), () => void playWholeBand(), {
  feedback: () => safeSfx('pop'),
});
onTap(document.querySelector('[data-target="play-again"]'), () => void screenController.start(startListen), {
  feedback: () => safeSfx('pop'),
});

buildAudioChannels();
installUnlockOnGesture({
  extra: [unlockSamples],
  onFirst: () => { state.firstGesture = true; },
});
installKioskGuards();

const ready = (async () => {
  const response = await fetch('./data/lines.json');
  lines = response.ok ? await response.json() : {};
  await Promise.all([
    voice.init('./assets/audio/manifest.json', './data/lines.json', lines),
    preloadImages([...ART.backgrounds, ...ART.owls, ...ART.instruments, ...ART.ui]),
  ]);
  updateSplash();
  document.documentElement.classList.add('id-ready');
  return true;
})();

async function debugTap(id) {
  const button = [...document.querySelectorAll('[data-target]')]
    .find((node) => node.dataset.target === id && node.getClientRects().length);
  if (!button || button.disabled) return false;
  button.click();
  await new Promise((resolve) => window.setTimeout(resolve, 30));
  return true;
}

async function debugWinRound() {
  if (state.screen === 'splash') return startListen();
  if (state.screen === 'reveal') return nextFromReveal();
  if (state.screen === 'concert') return playWholeBand();
  for (let i = 0; i < 100 && (!state.awaitingChoice || state.busy); i += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 20));
  }
  if (state.screen !== 'play' || !state.target) return false;
  const button = document.querySelector(`[data-target="choice-${state.target}"]`);
  return chooseInstrument(state.target, button);
}

async function debugCompleteMode() {
  if (state.mode !== 'listen' || state.screen === 'splash') await startListen();
  let guard = 0;
  while (state.screen !== 'concert' && guard++ < 20) {
    await debugWinRound();
  }
  return state.screen === 'concert';
}

installDebug({
  gameId: config.id,
  engine: 'instrument-detective-custom',
  version: 1,
  ready,
  timers,
  voice,
  sfx,
  listModes: () => [
    { id: 'listen', title: 'Sound Detective', skill: 'auditory discrimination' },
    { id: 'concert', title: 'Tiny Concert', skill: 'musical cause and effect' },
  ],
  startMode: async (id) => {
    await ready;
    if (id === 'listen') return startListen();
    if (id === 'concert') return showConcert({ announce: false });
    return false;
  },
  getState: () => ({
    screen: state.screen,
    mode: state.mode,
    roundIndex: state.roundIndex,
    roundCount: state.roundOrder.length,
    target: state.target,
    candidates: [...state.candidates],
    solved: [...state.solved],
    awaitingChoice: state.awaitingChoice,
    busy: state.busy,
    muted: state.muted,
    seed: state.seed,
    lastChoice: state.lastChoice,
    lastSample: state.lastSample,
    firstGesture: state.firstGesture,
  }),
  getTargets: () => collectTargets(root),
  tap: debugTap,
  winRound: debugWinRound,
  completeMode: debugCompleteMode,
  mute: (on = true) => setMuted(on),
  seed: (value) => {
    state.seed = Number.isFinite(Number(value)) ? Number(value) >>> 0 : 42;
    rng = mulberry32(state.seed);
    return state.seed;
  },
  fastTimers: (scale = 0.05) => {
    const n = Number(scale);
    const multiplier = Number.isFinite(n) && n > 0 ? (n > 1 ? 1 / n : n) : 0.05;
    timers.setScale(1 / Math.min(1, Math.max(0.01, multiplier)));
    return multiplier;
  },
  home: () => showSplash(),
  getAudioLog: () => ({ voice: voice.getAudioLog(), samples: sampleLog.map((entry) => ({ ...entry })) }),
  clearAudioLog: () => { voice.clearAudioLog(); sampleLog.length = 0; },
  getLayout: () => ({
    viewport: { width: innerWidth, height: innerHeight },
    orientation: innerWidth >= innerHeight ? 'landscape' : 'portrait',
    targets: collectTargets(root),
  }),
});

window.addEventListener('pagehide', () => {
  timers.clearAll();
  stopSamples();
  voice.stop();
});

showSplash();
