import config from '../config.js';
import { createScreens } from '../../../shared/js/screens.js';
import { onTap } from '../../../shared/js/tap.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { createVoiceMeter, voiceSparks } from '../../../shared/js/voice-meter.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { followCues } from '../../../shared/js/stage/mouth.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';

const $ = (selector) => document.querySelector(selector);
const cardsHost = $('#emotion-cards');
const actor = $('#actor');
const actorPuppet = $('#actor-puppet');
const emotionLabel = $('#emotion-label');
const micButton = $('#mic-button');
const micLabel = $('#mic-label');
const fallbackButton = $('#fallback-button');
const listenStatus = $('#listen-status');
const lights = [...document.querySelectorAll('.voice-lights i')];
const progress = $('#progress');
const announcer = $('#announcer');
const resultBear = $('#result-bear');
const resultPuppet = $('#result-puppet');
const resultTitle = $('#result-title');
const resultHint = $('#result-hint');
const resultKicker = $('#result-kicker');
const sparkRow = $('#spark-row');
const nextButton = $('#next-button');
const mouthEls = {
  splash: $('#splash-mouth'),
  play: $('#actor-mouth'),
  result: $('#result-mouth'),
};

const mouthShapes = ['a', 'o', 'e', 'wr', 'ts', 'ln', 'uq', 'mbp', 'fv', 'rest'];
const mouthBase = './assets/characters/teddy/anim/';
const mouthLayouts = {
  neutral: { x: 34.3, y: 40.0, w: 31.25, h: 19.12, rotation: 0 },
  happy: { x: 34.1, y: 32.4, w: 31.25, h: 19.12, rotation: 0 },
  proud: { x: 34.8, y: 39.8, w: 30.5, h: 18.8, rotation: 0 },
  calm: { x: 34.8, y: 40.6, w: 30.5, h: 18.8, rotation: 0 },
  silly: { x: 33.7, y: 35.3, w: 32.0, h: 19.4, rotation: 10 },
};
const meter = createVoiceMeter();
const state = {
  screen: 'splash',
  emotion: null,
  completed: new Set(),
  listening: false,
  micMode: 'real',
  lastSummary: null,
  muted: false,
};

const defaultLines = {
  welcome: 'Welcome to the Feelings Theater! Choose a feeling for Teddy to try.',
  'choose-next': 'Choose another feeling for Teddy.',
  ready: 'When the light glows, say: I can do it!',
  'mic-fallback': 'That is okay. Tap the sparkling star while you say the line.',
  'quiet-nudge': 'I am listening. Bring your voice a little closer.',
  'happy-model': 'Happy voice! I can do it! Now show me your bright, bouncy voice.',
  'proud-model': 'Proud voice! I can do it! Now stand tall and use your strong, steady voice.',
  'calm-model': 'Calm voice. I can do it. Now breathe in and use your soft, smooth voice.',
  'silly-model': 'Silly voice! I can do it! Boing boing! Now make your funniest wiggly voice.',
  'happy-success': 'I heard that happy sparkle!',
  'proud-success': 'That voice sounded strong and proud!',
  'calm-success': 'That was soft and peaceful.',
  'silly-success': 'Ha! That was wonderfully silly!',
  complete: 'Bravo! Your voice brought every feeling to life!',
};

const ready = Promise.all([
  voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', defaultLines),
  preloadImages([
    './assets/felt-stage.webp', './assets/title.webp',
    ...config.emotions.map((item) => `./assets/characters/${item.pose}`),
    ...config.emotions.map((item) => `./assets/ui/${item.card}`),
    './assets/ui/mic.webp', './assets/ui/star.webp',
    ...mouthShapes.map((shape) => `${mouthBase}mouth-${shape}.png`),
  ]),
]);

function setMouthPose(puppet, pose) {
  const layout = mouthLayouts[pose] || mouthLayouts.neutral;
  puppet.dataset.pose = pose;
  puppet.style.setProperty('--mouth-x', `${layout.x}%`);
  puppet.style.setProperty('--mouth-y', `${layout.y}%`);
  puppet.style.setProperty('--mouth-w', `${layout.w}%`);
  puppet.style.setProperty('--mouth-h', `${layout.h}%`);
  puppet.style.setProperty('--mouth-rotation', `${layout.rotation}deg`);
}

function createMouthController(image) {
  let stopFollowing = null;
  let flapTimer = 0;
  const setShape = (shape) => {
    const safe = mouthShapes.includes(shape) ? shape : 'rest';
    image.src = `${mouthBase}mouth-${safe}.png`;
  };
  const stop = () => {
    if (stopFollowing) stopFollowing();
    stopFollowing = null;
    clearInterval(flapTimer);
    flapTimer = 0;
    setShape('rest');
    image.classList.remove('talking');
  };
  return {
    stop,
    async syncTo(audioEl, cuesUrl) {
      stop();
      image.classList.add('talking');
      try {
        const response = await fetch(cuesUrl);
        if (!response.ok) throw new Error(`viseme cues ${response.status}`);
        const timeline = await response.json();
        if (audioEl.ended) return stop();
        stopFollowing = followCues(audioEl, timeline.mouthCues || [], setShape);
      } catch {
        const talky = ['a', 'e', 'o', 'ts'];
        let index = 0;
        flapTimer = setInterval(() => setShape(talky[index++ % talky.length]), 125);
      }
      audioEl.addEventListener('ended', stop, { once: true });
      audioEl.addEventListener('error', stop, { once: true });
    },
  };
}

const mouths = Object.fromEntries(Object.entries(mouthEls).map(([key, image]) => [key, createMouthController(image)]));
voice.onClip((key, audioEl) => {
  Object.values(mouths).forEach((mouth) => mouth.stop());
  const target = mouths[state.screen] || mouths.splash;
  const cues = voice.clipInfo(key)?.cues || `${key}.cues.json`;
  target.syncTo(audioEl, `./assets/audio/${cues}`);
});

const screens = createScreens({
  root: $('#game'),
  initial: 'splash',
  voice,
  onEnter(name) { state.screen = name; },
  onExit(name) { if (name === 'play') stopListening(); },
});

installUnlockOnGesture({ onFirst: () => voice.say('welcome', defaultLines.welcome) });
installKioskGuards();

function renderCards() {
  cardsHost.replaceChildren();
  for (const emotion of config.emotions) {
    const button = document.createElement('button');
    button.className = `emotion-card${state.completed.has(emotion.id) ? ' done' : ''}`;
    button.dataset.target = `emotion-${emotion.id}`;
    button.dataset.role = 'choice';
    button.setAttribute('aria-label', `${emotion.label}: ${emotion.hint}`);
    button.style.backgroundImage = `url('./assets/ui/${emotion.card}')`;
    // The custom property is consumed by css/style.css, so its URL resolves
    // against that stylesheet (one directory below the game root).
    button.style.setProperty('--pose', `url('../assets/characters/${emotion.pose}')`);
    button.innerHTML = `<span>${emotion.label}</span>`;
    onTap(button, () => startEmotion(emotion.id));
    cardsHost.append(button);
  }
}

function renderProgress() {
  progress.replaceChildren();
  for (const emotion of config.emotions) {
    const dot = document.createElement('i');
    if (state.completed.has(emotion.id)) dot.className = 'done';
    progress.append(dot);
  }
}

async function startEmotion(id) {
  const emotion = config.emotions.find((item) => item.id === id) || config.emotions[0];
  if (!emotion || state.listening) return;
  state.emotion = emotion;
  state.lastSummary = null;
  renderProgress();
  emotionLabel.textContent = `${emotion.label} voice`;
  actor.src = `./assets/characters/${emotion.pose}`;
  setMouthPose(actorPuppet, emotion.id);
  actor.alt = `Teddy showing a ${emotion.label.toLowerCase()} feeling`;
  actorPuppet.classList.remove('listening');
  fallbackButton.hidden = true;
  micButton.hidden = false;
  micButton.disabled = true;
  micLabel.textContent = 'Listen first';
  listenStatus.textContent = emotion.hint;
  setLights(0);
  screens.show('play');
  await voice.say(emotion.modelLine, defaultLines[emotion.modelLine]);
  if (state.screen !== 'play' || state.emotion !== emotion) return;
  micButton.disabled = false;
  micLabel.textContent = 'My turn!';
  listenStatus.textContent = 'Tap the microphone';
  announcer.textContent = `Your turn. Say I can do it in a ${emotion.label} voice.`;
}

async function perform() {
  if (state.listening || !state.emotion) return;
  state.listening = true;
  micButton.disabled = true;
  micLabel.textContent = 'Get ready';
  listenStatus.textContent = 'Get ready…';

  if (state.micMode === 'fake') {
    await voice.say('ready', defaultLines.ready);
    await delay(120);
    finishPerformance(fakeSummary(state.emotion.id));
    return;
  }

  const allowed = await meter.request();
  if (!allowed) {
    state.listening = false;
    micButton.hidden = true;
    fallbackButton.hidden = false;
    listenStatus.textContent = 'No microphone? You can still play!';
    await voice.say('mic-fallback', defaultLines['mic-fallback']);
    return;
  }

  await voice.say('ready', defaultLines.ready);
  await delay(360);
  micLabel.textContent = 'Listening';
  listenStatus.textContent = 'Say: I can do it!';
  actorPuppet.classList.add('listening');
  const summary = await meter.listen({
    durationMs: 2300,
    onFrame(frame) { setLights(frame.level); },
  });
  actorPuppet.classList.remove('listening');
  if (state.screen !== 'play') return;
  if (!summary.heard) {
    state.listening = false;
    micButton.disabled = false;
    micLabel.textContent = 'Try again';
    listenStatus.textContent = 'Bring your voice a little closer';
    setLights(0);
    sfx.boing();
    await voice.say('quiet-nudge', defaultLines['quiet-nudge']);
    return;
  }
  finishPerformance(summary);
}

async function fallbackPerform() {
  if (state.listening || !state.emotion) return;
  state.listening = true;
  fallbackButton.disabled = true;
  listenStatus.textContent = 'Say: I can do it!';
  setLights(.75);
  await delay(1700);
  fallbackButton.disabled = false;
  finishPerformance(fakeSummary(state.emotion.id));
}

async function finishPerformance(summary) {
  const emotion = state.emotion;
  if (!emotion) return;
  state.lastSummary = summary;
  state.completed.add(emotion.id);
  state.listening = false;
  const sparks = voiceSparks(emotion.id, summary) || 1;
  resultBear.src = `./assets/characters/${emotion.pose}`;
  setMouthPose(resultPuppet, emotion.id);
  resultBear.alt = `Teddy celebrating a ${emotion.label.toLowerCase()} voice`;
  resultKicker.textContent = 'That sounded';
  resultTitle.textContent = `${emotion.label.toLowerCase()}!`;
  resultHint.textContent = emotion.hint;
  renderSparks(sparks);
  const complete = state.completed.size === config.emotions.length;
  nextButton.textContent = complete ? 'Encore!' : 'Next feeling';
  screens.show('result');
  sfx.sparkle();
  burstConfetti({ count: complete ? 54 : 26 });
  await voice.say(complete ? 'complete' : emotion.successLine, complete ? defaultLines.complete : defaultLines[emotion.successLine]);
}

function next() {
  const complete = state.completed.size === config.emotions.length;
  if (complete) state.completed.clear();
  state.emotion = null;
  renderCards();
  screens.show('splash');
  voice.say(complete ? 'welcome' : 'choose-next', complete ? defaultLines.welcome : defaultLines['choose-next']);
}

function backToSplash() {
  state.emotion = null;
  renderCards();
  screens.show('splash');
}

function renderSparks(count) {
  sparkRow.replaceChildren();
  for (let index = 0; index < count; index += 1) {
    const star = document.createElement('img');
    star.src = './assets/ui/star.webp';
    star.alt = '';
    sparkRow.append(star);
  }
}

function setLights(level) {
  const value = Math.max(0, Math.min(1, Number(level) || 0));
  lights.forEach((light, index) => {
    const scale = Math.max(.28, Math.min(1.35, value * (1.65 - index * .18)));
    light.style.setProperty('--level', scale.toFixed(2));
    light.style.opacity = value > index * .22 ? '1' : '.42';
  });
}

function stopListening() {
  state.listening = false;
  actorPuppet.classList.remove('listening');
  meter.close();
  setLights(0);
}

function fakeSummary(profile) {
  return {
    heard: true,
    durationMs: 1700,
    activeRatio: .78,
    meanRms: profile === 'calm' ? .035 : .095,
    peak: .22,
    pitchMean: 220,
    pitchRange: profile === 'silly' ? 190 : profile === 'happy' ? 120 : 55,
    energyVariation: profile === 'silly' ? .9 : profile === 'calm' ? .18 : .38,
  };
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

onTap(micButton, perform);
onTap(fallbackButton, fallbackPerform);
onTap(nextButton, next);
for (const button of document.querySelectorAll('.play-back, .result-back')) onTap(button, backToSplash);

renderCards();
renderProgress();

installDebug({
  gameId: config.id,
  engine: 'voice-meter',
  ready,
  voice,
  sfx,
  listModes: () => [{ id: 'feelings-show', title: 'Feelings Show' }],
  startMode: async () => { await ready; return startEmotion(config.emotions[0].id); },
  getState: () => ({
    screen: state.screen,
    emotion: state.emotion?.id || null,
    completed: [...state.completed],
    listening: state.listening,
    micPermission: meter.permission,
    micMode: state.micMode,
    lastSummary: state.lastSummary,
  }),
  tap: async (id) => {
    const target = document.querySelector(`[data-target="${CSS.escape(id)}"]`);
    if (!target) return false;
    target.click();
    return true;
  },
  winRound: async () => finishPerformance(fakeSummary(state.emotion?.id || 'happy')),
  home: backToSplash,
  setMicMode(mode) { state.micMode = mode === 'fake' ? 'fake' : 'real'; return state.micMode; },
  getAudioLog: voice.getAudioLog,
});

ready.then(() => document.documentElement.dataset.ready = 'true');
window.addEventListener('pagehide', () => meter.close(), { once: true });
