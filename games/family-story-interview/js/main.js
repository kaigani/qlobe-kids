import config from '../config.js';
import { onTap } from '../../../shared/js/tap.js';
import { escapeHtml } from '../../../shared/js/dom.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as bgm from '../../../shared/js/bgm.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createTimers } from '../../../shared/js/timers.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { preloadImages } from '../../../shared/js/preload.js';
import {
  createRecorder,
  replayBlob,
  imageFileToJpeg,
  serializableMemory,
  createMemoryStore,
} from './story-media.js';

const app = document.querySelector('#app');
const confetti = document.querySelector('#confetti');
const photoInput = document.querySelector('#photo-input');
const narrator = createNarrator({ announcerParent: document.body });
const timers = createTimers();
const store = createMemoryStore();

let rng = Math.random;
let readyResolve;
const ready = new Promise((resolve) => { readyResolve = resolve; });
let renderDisposers = [];
let renderUrls = [];
let screenNudger = null;
let activeRecorder = null;
let recorderGeneration = 0;
let activeReplay = null;
let recordTicker = 0;
let recordStartedAt = 0;
let celebrationCancel = null;
let toastTimer = 0;

const state = {
  screen: 'loading',
  phase: 'idle',
  modeId: null,
  questionId: null,
  audioBlob: null,
  audioDuration: 0,
  photoBlob: null,
  stickerId: 'heart',
  savedId: null,
  memories: [],
  muted: false,
  recording: false,
  replaying: false,
  micMode: 'real',
  micPermission: 'unknown',
  storagePersistent: true,
  saving: false,
  clearConfirm: false,
  topicTurns: Object.fromEntries(config.modes.map((mode) => [mode.id, 0])),
};

const artUrls = [
  config.art.background,
  config.art.title,
  config.art.reporter,
  config.art.grownupListener,
  ...Object.values(config.art.cards),
  ...Object.values(config.art.controls),
  ...Object.values(config.art.props),
  ...Object.values(config.art.stickers),
];

bgm.preload(config.music);
bgm.setVolume(.12);

installUnlockOnGesture({
  extra: [voice.unlock, bgm.unlock],
  onFirst: () => {
    bgm.play(config.music, { key: 'family-scrapbook', fadeInMs: 900, loopFadeOutMs: 2200 });
    if (state.screen === 'choose') speak('welcome');
  },
});
installKioskGuards();
window.addEventListener('pointerdown', () => voice.unlock(), { passive: true });

function modeById(id = state.modeId) {
  return config.modes.find((mode) => mode.id === id) || config.modes[0];
}

function questionById(id = state.questionId) {
  const all = config.modes.flatMap((mode) => mode.questions.map((question) => ({ ...question, mode })));
  return all.find((question) => question.id === id) || { ...config.modes[0].questions[0], mode: config.modes[0] };
}

function stickerById(id = state.stickerId) {
  return config.stickers.find((sticker) => sticker.id === id) || config.stickers[0];
}

function selectedMemory() {
  return state.memories.find((memory) => memory.id === state.savedId) || null;
}

function say(key, text = config.voice[key]) {
  if (!text) return Promise.resolve();
  return bgm.duckDuring(narrator.say(key, text), { down: .15, downMs: 100, upMs: 300 });
}

function setMuted(on) {
  state.muted = Boolean(on);
  narrator.setMuted(state.muted);
  voice.setMuted(state.muted);
  sfx.setMuted(state.muted);
  bgm.setMuted(state.muted);
  document.querySelector('[data-target="sound"]')?.classList.toggle('muted', state.muted);
  return state.muted;
}

function disposeRender() {
  screenNudger?.stop();
  screenNudger = null;
  for (const dispose of renderDisposers.splice(0)) {
    try { dispose(); } catch { /* event teardown must be best effort */ }
  }
  for (const url of renderUrls.splice(0)) URL.revokeObjectURL(url);
  celebrationCancel?.();
  celebrationCancel = null;
  timers.clearAll();
}

function releaseReplay() {
  if (!activeReplay) return;
  try { activeReplay.release(); } catch { /* ignore */ }
  activeReplay = null;
  state.replaying = false;
  bgm.duck(1, 300);
}

async function releaseRecorder({ keepResult = false } = {}) {
  const recorder = activeRecorder;
  recorderGeneration += 1;
  activeRecorder = null;
  if (!recorder) return;
  if (state.recording) {
    try {
      const result = await recorder.stop();
      if (keepResult && result?.blob) {
        state.audioBlob = result.blob;
        state.audioDuration = result.duration || 0;
      }
    } catch { /* permission teardown must not block navigation */ }
  }
  recorder.cleanup?.();
  state.recording = false;
  bgm.duck(1, 250);
}

async function beforeScreen() {
  narrator.stop();
  releaseReplay();
  disposeRender();
}

function bindActions(root = app) {
  root.querySelectorAll('[data-action]').forEach((element) => {
    renderDisposers.push(onTap(element, () => handleAction(element.dataset.action, element.dataset.value, element), {
      feedback: () => { if (!state.muted) sfx.tick(); },
    }));
  });
}

function hud({ back = null, home = false } = {}) {
  const left = home
    ? '<a class="hud-button home" href="../../" data-target="platform-home" aria-label="QLOBE Kids home"></a>'
    : `<button class="hud-button back" data-action="${escapeHtml(back || 'choose')}" data-target="back" aria-label="Go back"></button>`;
  return `${left}<button class="hud-button sound ${state.muted ? 'muted' : ''}" data-action="sound" data-target="sound" aria-label="Turn sound ${state.muted ? 'on' : 'off'}"></button>`;
}

function topLine(title, opts = {}) {
  return `<div class="screen-topline">${hud(opts)}<h1>${escapeHtml(title)}</h1></div>`;
}

function artButton({ action, value = '', label, plate = config.art.controls.play, target = action, disabled = false, className = '' }) {
  return `<button class="art-button ${className}" data-action="${escapeHtml(action)}" data-value="${escapeHtml(value)}" data-target="${escapeHtml(target)}" ${disabled ? 'disabled' : ''} aria-label="${escapeHtml(label)}">
    <img class="button-plate" src="${escapeHtml(plate)}" alt="" />
    <span class="button-label">${escapeHtml(label)}</span>
  </button>`;
}

function blobUrl(blob) {
  if (!blob) return '';
  const url = URL.createObjectURL(blob);
  renderUrls.push(url);
  return url;
}

function photoMat(photoBlob = state.photoBlob, stickerId = state.stickerId) {
  const sticker = stickerById(stickerId);
  const photo = photoBlob
    ? `<img class="photo-preview" src="${blobUrl(photoBlob)}" alt="Family memory photo" />`
    : `<div class="photo-placeholder">
        <img src="${config.art.props.teddyBear}" alt="" />
        <p>Your story belongs here, with or without a photo.</p>
        <img src="${config.art.props.toyTrain}" alt="" />
      </div>`;
  return `<div class="photo-mat">${photo}</div><img class="placed-sticker" src="${sticker.art}" alt="${escapeHtml(sticker.label)}" />`;
}

function showToast(message, ms = 3200) {
  document.querySelector('.toast')?.remove();
  window.clearTimeout(toastTimer);
  const node = document.createElement('div');
  node.className = 'toast';
  node.setAttribute('role', 'status');
  node.textContent = message;
  document.body.appendChild(node);
  toastTimer = window.setTimeout(() => node.remove(), ms);
}

async function renderChoose({ announce = false } = {}) {
  await releaseRecorder();
  await beforeScreen();
  state.screen = 'choose';
  state.phase = 'idle';
  state.micPermission = 'unknown';
  state.modeId = null;
  state.questionId = null;
  state.audioBlob = null;
  state.audioDuration = 0;
  state.photoBlob = null;
  state.stickerId = 'heart';
  state.savedId = null;
  state.clearConfirm = false;
  app.innerHTML = `<section class="screen choose-screen">
    ${hud({ home: true })}
    <div class="choose-stage">
      <img class="title-lockup" src="${config.art.title}" alt="Family Story Interview" />
      <p class="choose-copy">Pick a picture. Ask someone you love.</p>
      <div class="topic-rack" aria-label="Interview topics">
        ${config.modes.map((mode) => `<button class="topic-card" data-action="topic" data-value="${mode.id}" data-target="topic-${mode.id}" aria-label="${escapeHtml(mode.title)}">
          <img src="${mode.art}" alt="" />
          <span class="topic-label">${escapeHtml(mode.title)}</span>
        </button>`).join('')}
      </div>
      <div class="choose-actions">
        ${artButton({ action: 'surprise', label: 'Surprise me', plate: config.art.controls.photo, target: 'surprise' })}
        <button class="book-button" data-action="book" data-target="memory-book" aria-label="Open my memory book. ${state.memories.length} saved stories.">
          <img src="${config.art.props.memoryBook}" alt="" />
          <span class="book-count">${state.memories.length}</span>
          <span>My Memory Book</span>
        </button>
      </div>
    </div>
    <img class="reporter-guide" src="${config.art.reporter}" alt="A cheerful child reporter holds out a microphone" />
    <p class="privacy-note">Private by design. Recordings and photos stay on this device.</p>
  </section>`;
  bindActions();
  if (announce) say('choose');
}

async function chooseTopic(modeId, { surprise = false } = {}) {
  const mode = modeById(modeId);
  const turn = state.topicTurns[mode.id] || 0;
  const question = mode.questions[turn % mode.questions.length];
  state.topicTurns[mode.id] = turn + 1;
  state.modeId = mode.id;
  state.questionId = question.id;
  state.audioBlob = null;
  state.audioDuration = 0;
  state.photoBlob = null;
  state.stickerId = mode.id === 'favorites' ? 'star' : mode.id === 'traditions' ? 'flower' : 'heart';
  state.phase = 'ready';
  await renderInterview();
  if (surprise) await say('surprise');
  await say(question.voiceKey, question.text);
  if (state.screen === 'interview' && state.phase === 'ready') say('ready-record');
}

async function renderInterview() {
  await beforeScreen();
  state.screen = 'interview';
  const mode = modeById();
  const question = questionById();
  const recorded = Boolean(state.audioBlob) || state.phase === 'fallback';
  const stateCopy = state.phase === 'fallback'
    ? 'Tell it together — the page still works beautifully.'
    : state.audioBlob
      ? 'Story captured and ready for your page.'
      : 'Tap the microphone when your grown-up is ready.';
  app.innerHTML = `<section class="screen interview-screen">
    ${topLine('Your Interview Question', { back: 'choose' })}
    <div class="interview-body">
      <article class="question-sheet">
        <div class="question-inner">
          <p class="question-kicker">${escapeHtml(mode.title)}</p>
          <h2 class="question-text">${escapeHtml(question.text)}</h2>
          <p class="question-topic">Listen all the way to the end. There are no wrong answers.</p>
          <button class="listen-question" data-action="hear-question" data-target="hear-question">Hear the question</button>
        </div>
      </article>
      <section class="record-desk ${state.recording ? 'recording' : ''}" aria-label="Story recorder">
        <p class="record-state" role="status">${stateCopy}</p>
        <div class="interview-pair">
          <figure class="grownup-anchor">
            <img src="${config.art.grownupListener}" alt="A caring grown-up listening closely" />
            <figcaption>Your grown-up</figcaption>
          </figure>
          <div class="microphone-wrap">
            <button class="record-hit" data-action="record-toggle" data-target="record-toggle" aria-label="${state.recording ? 'Stop recording' : 'Start recording'}" ${recorded ? 'disabled' : ''}>
              <img class="record-control-plate" src="${config.art.controls.record}" alt="" />
              <span class="record-control-label">${state.recording ? 'Tap to stop' : recorded ? 'Story captured' : 'Tap to record'}</span>
            </button>
            <img class="microphone-art" src="${config.art.props.microphone}" alt="" />
          </div>
        </div>
        <div class="waveform" aria-hidden="true">${Array.from({ length: 17 }, (_, index) => `<i class="wave-bar" data-wave="${index}"></i>`).join('')}</div>
        <div class="timer-readout">${formatDuration(state.audioDuration)}</div>
        ${state.phase === 'fallback' ? '<p class="fallback-note">Microphone permission is optional. You can tell the story face to face and keep a decorated page.</p>' : ''}
        <div class="record-actions">
          ${state.audioBlob ? artButton({ action: 'play-current', label: state.replaying ? 'Playing…' : 'Listen', plate: config.art.controls.play, target: 'play-current' }) : ''}
          ${recorded ? artButton({ action: 'decorate', label: 'Make the page', plate: config.art.controls.photo, target: 'decorate' }) : ''}
        </div>
      </section>
    </div>
  </section>`;
  bindActions();
  if (!recorded) {
    screenNudger = createNudger({ first: 15000, repeat: 18000, onNudge: () => say('nudge') });
    screenNudger.arm();
  }
}

function setWaveLevel(level) {
  const bars = document.querySelectorAll('.wave-bar');
  bars.forEach((bar, index) => {
    const ripple = .32 + Math.abs(Math.sin(index * 1.7 + performance.now() / 170)) * .68;
    bar.style.height = `${12 + Math.round(Math.max(.04, level) * ripple * 52)}px`;
  });
}

function updateRecordingUi() {
  const desk = document.querySelector('.record-desk');
  desk?.classList.add('recording');
  const status = desk?.querySelector('.record-state');
  if (status) status.innerHTML = '<span class="live-dot"></span>Recording — tap the coral button to stop.';
  const button = desk?.querySelector('[data-target="record-toggle"]');
  button?.removeAttribute('disabled');
  button?.setAttribute('aria-label', 'Stop recording');
  const label = desk?.querySelector('.record-control-label');
  if (label) label.textContent = 'Tap to stop';
  const timer = desk?.querySelector('.timer-readout');
  if (timer) timer.textContent = formatDuration(Date.now() - recordStartedAt);
  if (state.micMode === 'fake') {
    setWaveLevel(.48 + Math.sin(performance.now() / 135) * .2);
  }
}

async function startRecording() {
  if (state.recording || state.audioBlob || state.phase === 'requesting' || activeRecorder) return;
  narrator.stop();
  screenNudger?.stop();
  releaseReplay();
  state.micPermission = 'requesting';
  state.phase = 'requesting';
  const status = document.querySelector('.record-state');
  if (status) status.textContent = 'Opening the microphone…';
  const button = document.querySelector('[data-target="record-toggle"]');
  button?.setAttribute('disabled', '');
  button?.setAttribute('aria-label', 'Opening the microphone');
  const label = document.querySelector('.record-control-label');
  if (label) label.textContent = 'Opening…';
  bgm.duck(0, 120);
  const generation = ++recorderGeneration;
  const recorder = createRecorder({
    mode: state.micMode,
    maxDuration: config.timeLimitSeconds * 1000,
    onLevel: setWaveLevel,
    onState: (value) => {
      if (generation !== recorderGeneration) return;
      if (value === 'recording') state.micPermission = state.micMode === 'real' ? 'granted' : 'fake';
      if (value === 'denied') state.micPermission = 'denied';
    },
    onAutoStop: (result) => completeRecording(result),
  });
  activeRecorder = recorder;
  try {
    await recorder.start();
  } catch {
    if (generation === recorderGeneration) state.micPermission = 'denied';
  }
  if (generation !== recorderGeneration || activeRecorder !== recorder || state.screen !== 'interview') {
    recorder.cleanup();
    return;
  }
  if (state.micPermission === 'denied') {
    activeRecorder.cleanup?.();
    activeRecorder = null;
    state.recording = false;
    state.phase = 'fallback';
    bgm.duck(1, 300);
    await renderInterview();
    say('mic-fallback');
    return;
  }
  state.recording = true;
  state.phase = 'recording';
  recordStartedAt = Date.now();
  updateRecordingUi();
  recordTicker = timers.every(100, updateRecordingUi);
}

async function finishRecording() {
  if (!state.recording || !activeRecorder) return;
  let result = null;
  try {
    result = await activeRecorder.stop();
  } catch {
    result = { blob: null, duration: Date.now() - recordStartedAt };
  }
  await completeRecording(result);
}

async function completeRecording(result) {
  if (!state.recording || !activeRecorder) return;
  timers.clear(recordTicker);
  recordTicker = 0;
  state.audioBlob = result?.blob || null;
  state.audioDuration = Math.min(config.timeLimitSeconds * 1000, result?.duration || Date.now() - recordStartedAt);
  activeRecorder.cleanup?.();
  activeRecorder = null;
  recorderGeneration += 1;
  state.recording = false;
  state.phase = state.audioBlob ? 'recorded' : 'fallback';
  bgm.duck(1, 300);
  if (!state.muted) sfx.sparkle();
  await renderInterview();
  say(state.audioBlob ? 'recorded' : 'mic-fallback');
}

function playBlob(blob, label = 'story') {
  releaseReplay();
  if (!blob || blob.size === 0) {
    showToast('This practice story has no sound. Your page is still ready.');
    return;
  }
  const playback = replayBlob(blob);
  if (!playback) return;
  activeReplay = playback;
  state.replaying = true;
  bgm.duck(0, 120);
  playback.audio.addEventListener('ended', () => {
    if (activeReplay === playback) releaseReplay();
  }, { once: true });
  playback.audio.addEventListener('error', () => {
    if (activeReplay === playback) releaseReplay();
    showToast(`We couldn't play this ${label}, but the memory is still safe.`);
  }, { once: true });
  playback.audio.play().catch(() => {
    releaseReplay();
    showToast('Tap once more to hear the story.');
  });
}

async function renderDecorate({ announce = true } = {}) {
  await releaseRecorder({ keepResult: true });
  await beforeScreen();
  state.screen = 'decorate';
  state.phase = 'decorating';
  const question = questionById();
  app.innerHTML = `<section class="screen decorate-screen">
    ${topLine('Make Your Memory Page', { back: 'interview' })}
    <div class="decorate-body">
      <article class="memory-page">
        <h2 class="page-title">${escapeHtml(question.safeTitle)}</h2>
        ${photoMat()}
        <p class="page-question">${escapeHtml(question.text)}</p>
      </article>
      <aside class="decorate-tools">
        <h2 class="tool-heading">Choose a keepsake sticker</h2>
        <div class="sticker-picker" aria-label="Memory stickers">
          ${config.stickers.map((sticker) => `<button class="sticker-button ${sticker.id === state.stickerId ? 'selected' : ''}" data-action="sticker" data-value="${sticker.id}" data-target="sticker-${sticker.id}" aria-label="${escapeHtml(sticker.label)}"><img src="${sticker.art}" alt="" /></button>`).join('')}
        </div>
        ${artButton({ action: 'photo', label: state.photoBlob ? 'Change photo' : 'Add a photo', plate: config.art.controls.photo, target: 'photo' })}
        ${artButton({ action: 'save', label: 'Save this story', plate: config.art.controls.record, target: 'save' })}
        <p class="tool-note">The photo is optional. Everything stays privately on this device.</p>
      </aside>
    </div>
  </section>`;
  bindActions();
  if (announce) say('decorate');
}

async function saveMemory() {
  if (state.saving) return false;
  state.saving = true;
  document.querySelector('[data-target="save"]')?.setAttribute('disabled', '');
  try {
    const question = questionById();
    const mode = modeById();
    const id = globalThis.crypto?.randomUUID?.() || `memory-${Date.now()}-${Math.round(rng() * 1e6)}`;
    const memory = {
      id,
      createdAt: Date.now(),
      modeId: mode.id,
      modeTitle: mode.title,
      questionId: question.id,
      question: question.text,
      title: question.safeTitle,
      stickerId: state.stickerId,
      audioDuration: state.audioDuration || 0,
      audioBlob: state.audioBlob || null,
      photoBlob: state.photoBlob || null,
    };
    let stored = memory;
    try {
      stored = await store.put(memory);
      state.storagePersistent = store.persistent();
    } catch {
      state.storagePersistent = false;
    }
    state.memories = [stored, ...state.memories.filter((item) => item.id !== stored.id)]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, config.maxMemories);
    state.savedId = stored.id;
    state.phase = 'saved';
    if (!state.muted) sfx.tada();
    await renderSaved({ celebrate: true });
    say(state.storagePersistent ? 'saved' : 'storage-fallback');
    return true;
  } finally {
    state.saving = false;
  }
}

async function renderSaved({ celebrate = false } = {}) {
  await beforeScreen();
  state.screen = 'saved';
  state.phase = 'saved';
  const memory = selectedMemory() || {
    title: questionById().safeTitle,
    question: questionById().text,
    stickerId: state.stickerId,
    photoBlob: state.photoBlob,
    audioBlob: state.audioBlob,
  };
  app.innerHTML = `<section class="screen saved-screen">
    ${topLine('Memory Saved', { back: 'book' })}
    <div class="saved-body">
      <article class="memory-page">
        <span class="saved-ribbon">Saved</span>
        <h2 class="page-title">${escapeHtml(memory.title)}</h2>
        ${photoMat(memory.photoBlob, memory.stickerId)}
        <p class="page-question">${escapeHtml(memory.question)}</p>
      </article>
      <aside class="saved-tools">
        <h2 class="saved-message">A new family memory!</h2>
        <button class="play-strip ${memory.audioBlob ? '' : 'no-audio'}" data-action="play-saved" data-value="${memory.id || ''}" data-target="play-saved">
          <img src="${memory.audioBlob ? config.art.props.microphone : config.art.props.memoryBook}" alt="" />
          <span>${memory.audioBlob ? 'Play the story' : 'A together-time page'}</span>
        </button>
        ${artButton({ action: 'saved-photo', label: memory.photoBlob ? 'Change photo' : 'Add a photo', plate: config.art.controls.photo, target: 'saved-photo' })}
        ${artButton({ action: 'choose', label: 'Ask another', plate: config.art.controls.record, target: 'ask-another' })}
        ${artButton({ action: 'book', label: 'Open memory book', plate: config.art.controls.play, target: 'open-book' })}
      </aside>
    </div>
  </section>`;
  bindActions();
  if (celebrate) celebrationCancel = burstConfetti({ host: confetti, count: 54, palette: ['#df6856', '#2f7472', '#e9b84f', '#66895b', '#fff8e6'], duration: 1450 });
}

function memoryCard(memory) {
  const sticker = stickerById(memory.stickerId);
  const photo = memory.photoBlob
    ? `<img class="memory-thumb" src="${blobUrl(memory.photoBlob)}" alt="Family memory photo" />`
    : `<img class="memory-thumb" src="${config.art.cards[memory.modeId] || config.art.cards.childhood}" alt="" />`;
  const date = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(memory.createdAt));
  return `<button class="memory-card" data-action="memory" data-value="${escapeHtml(memory.id)}" data-target="memory-${escapeHtml(memory.id)}" aria-label="${escapeHtml(memory.title)}. ${memory.audioBlob ? 'Play story' : 'Open page'}">
    <h2>${escapeHtml(memory.title)}</h2>
    ${photo}
    <p>${escapeHtml(date)} · ${formatDuration(memory.audioDuration || 0)}</p>
    <span class="memory-play-label">${memory.audioBlob ? 'Tap to hear the story' : 'Tap to open the page'}</span>
    <img class="memory-sticker" src="${sticker.art}" alt="" />
  </button>`;
}

async function renderBook({ announce = true } = {}) {
  await releaseRecorder();
  await beforeScreen();
  state.screen = 'book';
  state.phase = 'book';
  state.clearConfirm = false;
  try {
    const saved = await store.list();
    if (saved.length || !state.memories.length) state.memories = saved.sort((a, b) => b.createdAt - a.createdAt);
    state.storagePersistent = store.persistent();
  } catch { state.storagePersistent = false; }
  const contents = state.memories.length
    ? `<div class="memory-grid ${state.memories.length === 1 ? 'single' : ''}">${state.memories.map(memoryCard).join('')}${state.memories.length === 1 ? `<aside class="next-memory-invite">
        <img src="${config.art.props.cameraNotebook}" alt="A watercolor camera and reporter notebook" />
        <h2>One page, with room for more.</h2>
        <p>Every question can open another family story.</p>
        ${artButton({ action: 'choose', label: 'Ask another', plate: config.art.controls.photo, target: 'book-ask-another' })}
      </aside>` : ''}</div>`
    : `<div class="empty-book"><div class="empty-book-card">
        <img src="${config.art.props.memoryBook}" alt="A closed family memory book" />
        <h2>Your first page is waiting.</h2>
        <p>Pick a question and make a family memory together.</p>
        ${artButton({ action: 'choose', label: 'Pick a question', plate: config.art.controls.photo, target: 'empty-start' })}
      </div></div>`;
  app.innerHTML = `<section class="screen book-screen">
    ${topLine('Our Family Memory Book', { back: 'choose' })}
    <div class="book-body">
      <p class="book-intro">${state.memories.length ? 'Tap a page to hear that memory again.' : 'Stories and photos stay private on this device.'}</p>
      ${contents}
      <footer class="book-footer">
        ${state.memories.length ? '<button class="quiet-button" data-action="clear-book" data-target="clear-book">Grown-up: clear book</button>' : ''}
      </footer>
    </div>
  </section>`;
  bindActions();
  if (announce) say(state.memories.length ? 'book-open' : 'book-empty');
}

async function openMemory(id) {
  const memory = state.memories.find((item) => item.id === id);
  if (!memory) return;
  state.savedId = id;
  state.modeId = memory.modeId;
  state.questionId = memory.questionId;
  state.audioBlob = memory.audioBlob || null;
  state.audioDuration = memory.audioDuration || 0;
  state.photoBlob = memory.photoBlob || null;
  state.stickerId = memory.stickerId || 'heart';
  await renderSaved();
  if (memory.audioBlob) playBlob(memory.audioBlob);
}

async function updateSavedPhoto(blob) {
  const memory = selectedMemory();
  if (!memory) return;
  memory.photoBlob = blob;
  state.photoBlob = blob;
  try { await store.put(memory); } catch { state.storagePersistent = false; }
  await renderSaved();
  say('photo-added');
}

async function handlePhoto(file) {
  if (!file) return;
  try {
    const jpeg = await imageFileToJpeg(file);
    if (!jpeg) throw new Error('image conversion failed');
    if (state.screen === 'saved') await updateSavedPhoto(jpeg);
    else {
      state.photoBlob = jpeg;
      await renderDecorate({ announce: false });
      say('photo-added');
    }
  } catch {
    showToast('That photo could not be opened. Try a smaller JPG or PNG.');
  } finally {
    photoInput.value = '';
  }
}

photoInput.addEventListener('change', () => handlePhoto(photoInput.files?.[0]));

async function clearBook() {
  if (!state.clearConfirm) {
    state.clearConfirm = true;
    const button = document.querySelector('[data-target="clear-book"]');
    if (button) {
      button.classList.add('confirm');
      button.textContent = 'Tap again to clear every page';
    }
    showToast('Grown-up check: tap again to remove all saved stories and photos.', 5000);
    return;
  }
  try {
    await store.clear();
  } catch {
    state.clearConfirm = false;
    const button = document.querySelector('[data-target="clear-book"]');
    if (button) {
      button.classList.remove('confirm');
      button.textContent = 'Grown-up: clear book';
    }
    showToast('The book could not be cleared. Your stories are still here — please try again.', 5000);
    return false;
  }
  state.memories = [];
  state.clearConfirm = false;
  if (!state.muted) sfx.unpop();
  await renderBook({ announce: false });
  showToast('The memory book is clear.');
  return true;
}

async function handleAction(action, value) {
  switch (action) {
    case 'sound':
      setMuted(!state.muted);
      break;
    case 'choose': await renderChoose({ announce: true }); break;
    case 'topic': await chooseTopic(value); break;
    case 'surprise': {
      const mode = config.modes[Math.floor(rng() * config.modes.length) % config.modes.length];
      await chooseTopic(mode.id, { surprise: true });
      break;
    }
    case 'hear-question': {
      const question = questionById();
      await say(question.voiceKey, question.text);
      break;
    }
    case 'record-toggle': state.recording ? await finishRecording() : await startRecording(); break;
    case 'play-current': playBlob(state.audioBlob); break;
    case 'decorate': await renderDecorate(); break;
    case 'sticker':
      state.stickerId = value;
      if (!state.muted) sfx.pop();
      await renderDecorate({ announce: false });
      break;
    case 'photo': photoInput.click(); break;
    case 'save': await saveMemory(); break;
    case 'play-saved': playBlob(selectedMemory()?.audioBlob || state.audioBlob); break;
    case 'saved-photo': photoInput.click(); break;
    case 'book': await renderBook(); break;
    case 'memory': await openMemory(value); break;
    case 'clear-book': await clearBook(); break;
    case 'interview': await renderInterview(); break;
    default: break;
  }
}

function formatDuration(milliseconds) {
  const total = Math.max(0, Math.round(Number(milliseconds || 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

async function createFakePhoto() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 420;
  const context = canvas.getContext('2d');
  context.fillStyle = '#d8eee4';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#2f7472';
  context.font = 'bold 42px sans-serif';
  context.textAlign = 'center';
  context.fillText('Our family memory', canvas.width / 2, canvas.height / 2);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .82));
}

installDebug({
  gameId: config.id,
  engine: 'family-story-interview',
  ready,
  timers,
  narrator,
  voice,
  sfx,
  listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
  startMode: async (id) => {
    const mode = modeById(id);
    await chooseTopic(mode.id);
    return getDebugState();
  },
  getState: () => getDebugState(),
  mute: (on = true) => setMuted(on),
  tap: async (id) => {
    const target = [...document.querySelectorAll('[data-target]')].find((node) => node.dataset.target === id);
    if (!target) return false;
    target.click();
    await Promise.resolve();
    return true;
  },
  home: () => renderChoose({ announce: false }),
  onSeed: (seeded) => { rng = seeded; },
  setMicMode: (mode) => {
    if (!['real', 'fake', 'denied'].includes(mode)) return false;
    state.micMode = mode;
    return mode;
  },
  finishAnswer: async () => {
    if (!state.questionId) await chooseTopic(config.modes[0].id);
    await releaseRecorder();
    state.audioBlob = new Blob(['QLOBE local QA audio'], { type: 'audio/webm' });
    state.audioDuration = 4200;
    state.phase = 'recorded';
    await renderInterview();
    return getDebugState();
  },
  addFakePhoto: async () => {
    state.photoBlob = await createFakePhoto();
    if (state.screen === 'decorate') await renderDecorate({ announce: false });
    return Boolean(state.photoBlob);
  },
  saveCurrentStory: async () => {
    if (!state.questionId) await chooseTopic(config.modes[0].id);
    if (!state.audioBlob && state.phase !== 'fallback') {
      state.audioBlob = new Blob(['QLOBE local QA audio'], { type: 'audio/webm' });
      state.audioDuration = 4200;
    }
    await saveMemory();
    return getDebugState();
  },
  getSavedStories: () => state.memories.map(serializableMemory),
  clearStories: async () => {
    await store.clear();
    state.memories = [];
    if (state.screen === 'book') await renderBook({ announce: false });
    return true;
  },
  getAudioLog: voice.getAudioLog,
});

function getDebugState() {
  return {
    screen: state.screen,
    phase: state.phase,
    modeId: state.modeId,
    questionId: state.questionId,
    recording: state.recording,
    replaying: state.replaying,
    micMode: state.micMode,
    micPermission: state.micPermission,
    hasAudio: Boolean(state.audioBlob),
    hasPhoto: Boolean(state.photoBlob),
    stickerId: state.stickerId,
    savedCount: state.memories.length,
    storagePersistent: state.storagePersistent,
    muted: state.muted,
  };
}

async function preserveInterruptedRecording() {
  if (!activeRecorder) return;
  const wasRecording = state.recording;
  await releaseRecorder({ keepResult: wasRecording });
  if (wasRecording) state.phase = state.audioBlob ? 'recorded' : 'fallback';
  else {
    state.phase = 'ready';
    state.micPermission = 'unknown';
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    preserveInterruptedRecording();
    releaseReplay();
    narrator.stop();
    return;
  }
  if (state.screen === 'interview' && ['ready', 'recorded', 'fallback'].includes(state.phase)) {
    renderInterview();
  }
});
window.addEventListener('pagehide', () => {
  preserveInterruptedRecording();
  releaseReplay();
  narrator.stop();
  bgm.stop({ fadeOutMs: 0 });
});

async function init() {
  await Promise.all([
    voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
    preloadImages(artUrls),
  ]);
  try {
    state.memories = (await store.list()).sort((a, b) => b.createdAt - a.createdAt);
    state.storagePersistent = store.persistent();
  } catch { state.storagePersistent = false; }
  await renderChoose();
  readyResolve(true);
}

init().catch((error) => {
  console.error('Family Story Interview failed to start', error);
  app.innerHTML = '<section class="screen"><div class="empty-book"><div class="empty-book-card"><h1>Let\'s try that again.</h1><p>Reload the page to open the family memory book.</p></div></div></section>';
  readyResolve(false);
});
