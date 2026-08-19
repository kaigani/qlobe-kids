import config from '../config.js';
import { createScreens } from '../../../shared/js/screens.js';
import { onTap } from '../../../shared/js/tap.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { installUnlockOnGesture, installKioskGuards, unlockAll } from '../../../shared/js/audio-unlock.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as speech from '../../../shared/js/speech.js';
import * as sfx from '../../../shared/js/sfx.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { mulberry32 } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';
import { createComedyAudio } from './stage-audio.js';
import { createMicrophoneRecorder } from './microphone-recorder.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const linesResponse = await fetch(config.voiceLines);
if (!linesResponse.ok) throw new Error(`Could not load Joke Workshop voice lines (${linesResponse.status})`);
const lines = await linesResponse.json();
await voice.init('./assets/audio/manifest.json', config.voiceLines, lines);

const root = $('#game');
const timers = createTimers();
const comedyAudio = createComedyAudio();
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const STORAGE_KEY = 'qlobe-joke-workshop-v2';
const BOOK_LIMIT = 12;
const ANSWER_BACKINGS = [
  config.assets.ui.choiceCardGreen,
  config.assets.ui.choiceCardBlue,
  config.assets.ui.choiceCardViolet,
];
const TOPIC_BACKINGS = [
  config.assets.ui.topicCardGold,
  config.assets.ui.topicCardCream,
  config.assets.ui.topicCardLavender,
];

const jokeMap = new Map(config.jokes.map((joke) => [joke.id, joke]));
const answerMap = new Map(config.jokes.flatMap((joke) => joke.answers.map((answer) => [answer.id, { ...answer, jokeId: joke.id }])));

const el = {
  splash: $('[data-qk-screen="splash"]'),
  deck: $('[data-qk-screen="deck"]'),
  builder: $('[data-qk-screen="builder"]'),
  stage: $('[data-qk-screen="stage"]'),
  book: $('[data-qk-screen="book"]'),
  start: $('#start-button'),
  splashBook: $('#splash-book-button'),
  deckList: $('#joke-deck'),
  setupText: $('#setup-text'),
  answerRow: $('#answer-row'),
  recordButton: $('#record-button'),
  recordButtonLabel: $('#record-button-label'),
  recordCountdown: $('#record-countdown'),
  recordStatus: $('#record-status'),
  performanceSetup: $('#performance-setup'),
  performancePunchline: $('#performance-punchline'),
  audienceVideo: $('#audience-reaction-video'),
  rewardStar: $('#reward-star'),
  stageCaption: $('#stage-caption'),
  stageActions: $('#stage-actions'),
  nextJoke: $('#next-joke-button'),
  stageBook: $('#stage-book-button'),
  bookList: $('#book-list'),
  bookEmpty: $('#book-empty'),
  bookPlay: $('#book-play-button'),
  status: $('#game-status'),
};

let memoryProgress = { stars: 0, entries: [] };
let progress = loadProgress();
let rngSeed = (Date.now() ^ 0x4a4f4b45) >>> 0;
let rng = mulberry32(rngSeed);
let flowEpoch = 0;
let celebrationDispose = null;
let firstGesture = false;
let currentVoiceKey = 'welcome';
let currentPerformance = null;
let stageAwarded = false;
let stagePromise = Promise.resolve(false);
const globalDisposers = [];

const state = {
  selectedJokeId: config.jokes[0]?.id || null,
  selectedAnswerId: null,
  recordingState: 'idle',
  recordingBlob: null,
  busy: false,
  muted: false,
  reducedMotion: reducedMotionQuery.matches,
  stageComplete: false,
};

const microphoneRecorder = createMicrophoneRecorder({
  maxDurationMs: 15_000,
  onLimit() {
    if (state.recordingState === 'recording') void finishRecording();
  },
});

const screens = createScreens({
  root,
  initial: 'splash',
  splash: 'splash',
  voice,
  onExit() {
    flowEpoch += 1;
    timers.clearAll();
    nudger.stop();
    microphoneRecorder.cancel();
    stopRecordedPlayback();
    stopAudienceReaction();
    voice.stop();
    speech.stop();
    comedyAudio.stop();
    celebrationDispose?.();
    celebrationDispose = null;
    clearStageClasses();
  },
  onEnter() {
    updateStarCounters();
  },
});

const nudger = createNudger({
  first: 6000,
  repeat: 11500,
  onNudge(count) {
    if (screens.is('deck')) {
      if (count > 0) {
        const cards = $$('.jw-topic-card', el.deckList);
        cards[count % cards.length]?.classList.add('jw-wiggle');
      }
      speakKey('deck-nudge');
      return;
    }
    if (screens.is('builder')) {
      if (count > 0) {
        const target = state.recordingState === 'recording'
          ? el.recordButton
          : $('.jw-answer-card', el.answerRow);
        target?.classList.add('jw-wiggle');
      }
      speakKey('record-ending');
    }
  },
});

function defaultProgress() {
  return { stars: 0, entries: [] };
}

function normalizeCustomText(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32);
}

function sanitizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const joke = jokeMap.get(String(entry.setupId || ''));
  if (!joke) return null;
  const punchlineId = String(entry.punchlineId || '');
  const answer = punchlineId ? answerMap.get(punchlineId) : null;
  const customText = normalizeCustomText(entry.customText);
  if ((!answer || answer.jokeId !== joke.id) && !customText) return null;
  return {
    setupId: joke.id,
    punchlineId: answer && answer.jokeId === joke.id ? answer.id : null,
    customText: answer && answer.jokeId === joke.id ? '' : customText,
    createdAt: Number.isFinite(Number(entry.createdAt)) ? Number(entry.createdAt) : Date.now(),
  };
}

function sanitizeProgress(value) {
  const clean = defaultProgress();
  if (!value || typeof value !== 'object') return clean;
  clean.stars = Math.max(0, Math.min(99, Math.floor(Number(value.stars) || 0)));
  clean.entries = Array.isArray(value.entries)
    ? value.entries.map(sanitizeEntry).filter(Boolean).slice(0, BOOK_LIMIT)
    : [];
  return clean;
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    memoryProgress = raw ? sanitizeProgress(JSON.parse(raw)) : defaultProgress();
  } catch {
    memoryProgress = defaultProgress();
  }
  return memoryProgress;
}

function saveProgress(next) {
  progress = sanitizeProgress(next);
  memoryProgress = progress;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch { /* in-memory fallback stays live */ }
  updateStarCounters();
  return progress;
}

function savePerformance(performance) {
  const entry = {
    setupId: performance.joke.id,
    punchlineId: performance.answer?.id || null,
    customText: performance.customText || '',
    createdAt: Date.now(),
  };
  return saveProgress({
    stars: Math.min(99, progress.stars + 1),
    entries: performance.recordingBlob
      ? progress.entries.slice(0, BOOK_LIMIT)
      : [entry, ...progress.entries].slice(0, BOOK_LIMIT),
  });
}

function updateStarCounters() {
  for (const node of $$('[data-star-count]')) node.textContent = String(progress.stars);
}

function spokenText(key) {
  return typeof lines[key] === 'string' ? lines[key] : '';
}

function speakKey(key, fallback = '') {
  currentVoiceKey = key;
  const text = spokenText(key) || fallback;
  if (text) el.status.textContent = text;
  return voice.say(key, text);
}

function focusWithoutScroll(node) {
  if (!node) return;
  try { node.focus({ preventScroll: true }); } catch { node.focus(); }
}

function replayCurrent() {
  if (screens.is('stage') && currentPerformance) {
    // Keep replay from interrupting the live stage runner; after the buttons
    // appear, replay is safe and available for both picture and recorded lines.
    if (state.busy) return false;
    if (currentPerformance.recordingBlob) {
      return playRecordedPunchline(currentPerformance.recordingBlob, flowEpoch);
    }
    if (currentPerformance.answer) return speakKey(currentPerformance.answer.id, currentPerformance.text);
    return state.muted ? Promise.resolve(false) : speech.speak(currentPerformance.text);
  }
  if (screens.is('builder')) {
    const joke = jokeMap.get(state.selectedJokeId);
    return joke ? speakKey(joke.setupVoice, joke.setup) : false;
  }
  if (screens.is('deck')) {
    const key = `${state.selectedJokeId}-label`;
    return speakKey(key);
  }
  if (screens.is('book')) return speakKey(progress.entries.length ? 'book-intro' : 'book-empty');
  return speakKey(currentVoiceKey || 'welcome');
}

function touchFeedback(event) {
  event.preventDefault?.();
  unlockAll([comedyAudio.unlock]);
  nudger.poke();
  try { sfx.tick(); } catch { /* audio is supportive */ }
}

function allImageUrls(value, found = new Set()) {
  if (typeof value === 'string' && /\.(?:webp|png|jpe?g)$/i.test(value)) found.add(value);
  else if (Array.isArray(value)) value.forEach((entry) => allImageUrls(entry, found));
  else if (value && typeof value === 'object') Object.values(value).forEach((entry) => allImageUrls(entry, found));
  return [...found];
}

void preloadImages(allImageUrls(config.assets), { idle: true });

function cardImage(src, className = 'jw-card-backing') {
  const image = document.createElement('img');
  image.className = className;
  image.src = src;
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  return image;
}

function installHud(screenName) {
  const slot = $(`[data-hud-slot="${screenName}"]`);
  if (!slot) return;
  const navKind = screenName === 'splash' ? 'home' : 'back';
  const nav = hudButton(navKind, () => {
    if (navKind === 'home') window.location.href = '../../';
    else showSplash();
  });
  nav.classList.add('qk-hud-top-left');
  nav.dataset.target = navKind === 'home' ? 'home' : `${screenName}-back`;
  nav.dataset.role = 'navigation';
  slot.append(nav);

  const sound = hudButton('sound', soundDebounce(replayCurrent));
  sound.classList.add('qk-hud-top-right');
  sound.dataset.target = `${screenName}-sound`;
  sound.dataset.role = 'replay';
  slot.append(sound);
  globalDisposers.push(nav.dispose, sound.dispose);
}

for (const name of ['splash', 'deck', 'builder', 'stage', 'book']) installHud(name);

function showSplash({ speak = true } = {}) {
  state.busy = false;
  state.stageComplete = false;
  state.selectedAnswerId = null;
  state.recordingState = 'idle';
  state.recordingBlob = null;
  currentPerformance = null;
  screens.show('splash');
  currentVoiceKey = 'welcome';
  updateStarCounters();
  if (speak && firstGesture) speakKey('welcome');
}

function setSelectedJoke(id, { announce = true } = {}) {
  if (!jokeMap.has(id)) return false;
  state.selectedJokeId = id;
  for (const card of $$('.jw-topic-card', el.deckList)) {
    card.setAttribute('aria-pressed', String(card.dataset.jokeId === id));
  }
  if (announce) speakKey(`${id}-label`);
  return true;
}

function renderDeck() {
  el.deckList.replaceChildren();
  config.jokes.forEach((joke, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'jw-topic-card';
    button.dataset.target = `joke-${joke.id}`;
    button.dataset.role = 'choice';
    button.dataset.jokeId = joke.id;
    button.setAttribute('aria-label', joke.label);
    button.setAttribute('aria-pressed', String(state.selectedJokeId === joke.id));
    button.append(cardImage(TOPIC_BACKINGS[index % TOPIC_BACKINGS.length]));
    const art = cardImage(config.assets.topics[joke.id], 'jw-card-art');
    art.alt = joke.label;
    art.removeAttribute('aria-hidden');
    const label = document.createElement('span');
    label.className = 'jw-card-label';
    label.textContent = joke.label.replace(/\.$/, '').replace(/\s+(?=\S+$)/, '\n');
    button.append(art, label);
    el.deckList.append(button);
    screens.hold(onTap(button, () => {
      setSelectedJoke(joke.id, { announce: false });
      return showBuilder(joke.id);
    }, { feedback: touchFeedback }));
  });
}

async function speakDeckPrompt(voiceKey, epoch) {
  await speakKey(voiceKey);
  if (epoch !== flowEpoch || !screens.is('deck')) return;
  for (const joke of config.jokes) {
    setSelectedJoke(joke.id, { announce: false });
    await speakKey(`${joke.id}-label`, joke.label);
    if (epoch !== flowEpoch || !screens.is('deck')) return;
  }
}

function showDeck({ preselect, voiceKey = 'choose-joke' } = {}) {
  if (preselect && jokeMap.has(preselect)) state.selectedJokeId = preselect;
  state.selectedAnswerId = null;
  state.recordingState = 'idle';
  state.recordingBlob = null;
  state.busy = false;
  screens.show('deck');
  renderDeck();
  focusWithoutScroll($('.jw-topic-card', el.deckList));
  currentVoiceKey = voiceKey;
  void speakDeckPrompt(voiceKey, flowEpoch);
  nudger.arm();
}

function setAnswerSelection(answerId, { announce = true } = {}) {
  const answer = answerMap.get(answerId);
  if (!answer || answer.jokeId !== state.selectedJokeId) return false;
  state.selectedAnswerId = answerId;
  for (const card of $$('.jw-answer-card', el.answerRow)) {
    card.setAttribute('aria-pressed', String(card.dataset.answerId === answerId));
  }
  if (announce) speakKey(answer.id, answer.text);
  return true;
}

function shuffledAnswers(joke) {
  const answers = [...joke.answers];
  for (let index = answers.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [answers[index], answers[swapIndex]] = [answers[swapIndex], answers[index]];
  }
  return answers;
}

function renderAnswers(joke) {
  el.answerRow.replaceChildren();
  shuffledAnswers(joke).forEach((answer, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'jw-answer-card';
    button.dataset.target = `answer-${answer.id}`;
    button.dataset.role = 'choice';
    button.dataset.answerId = answer.id;
    button.setAttribute('aria-label', answer.text);
    button.setAttribute('aria-pressed', String(state.selectedAnswerId === answer.id));
    button.append(cardImage(ANSWER_BACKINGS[index % ANSWER_BACKINGS.length]));
    const art = cardImage(config.assets.answers[answer.id], 'jw-card-art');
    art.alt = answer.text;
    art.removeAttribute('aria-hidden');
    const label = document.createElement('span');
    label.className = 'jw-card-label';
    label.textContent = answer.text;
    button.append(art, label);
    if (answer.classic) {
      const classic = document.createElement('span');
      classic.className = 'jw-classic-badge';
      classic.textContent = '★';
      classic.setAttribute('aria-label', 'Classic wordplay');
      button.append(classic);
    }
    el.answerRow.append(button);
    screens.hold(onTap(button, () => chooseAnswer(answer.id), { feedback: touchFeedback }));
  });
}

async function speakBuilderPrompt(joke, epoch) {
  await speakKey(joke.setupVoice, joke.setup);
  if (epoch !== flowEpoch || !screens.is('builder')) return;
  await speakKey('record-ending');
}

function showBuilder(jokeId = state.selectedJokeId) {
  const joke = jokeMap.get(jokeId);
  if (!joke) return false;
  state.selectedJokeId = joke.id;
  state.selectedAnswerId = null;
  state.recordingState = 'idle';
  state.recordingBlob = null;
  state.busy = false;
  microphoneRecorder.cancel();
  updateRecordingUi();
  el.setupText.textContent = joke.setup;
  screens.show('builder');
  renderAnswers(joke);
  focusWithoutScroll($('.jw-answer-card', el.answerRow) || el.recordButton);
  const epoch = flowEpoch;
  void speakBuilderPrompt(joke, epoch);
  nudger.arm();
  return true;
}

function updateRecordingUi(status = '') {
  const recording = state.recordingState === 'recording';
  const waiting = ['requesting', 'countdown', 'stopping'].includes(state.recordingState);
  const labels = {
    idle: 'Record My Own',
    requesting: 'Getting the microphone…',
    countdown: 'Get Ready!',
    recording: 'Tap When Done',
    stopping: 'Saving Your Punchline…',
  };
  el.recordButtonLabel.textContent = labels[state.recordingState] || labels.idle;
  el.recordButton.setAttribute('aria-pressed', String(recording));
  el.recordButton.disabled = waiting;
  el.recordCountdown.hidden = state.recordingState !== 'countdown';
  if (status) el.recordStatus.textContent = status;
  else if (recording) el.recordStatus.textContent = 'Say your punchline, then tap the microphone when you are done.';
  else if (state.recordingState === 'countdown') el.recordStatus.textContent = 'Get ready to tell your joke!';
  else if (state.recordingState === 'stopping') el.recordStatus.textContent = 'Nice! Your punchline is ready.';
  else el.recordStatus.textContent = 'Tap the microphone to record your own punchline.';
}

function chooseAnswer(answerId) {
  if (state.busy || state.recordingState !== 'idle') return false;
  if (!setAnswerSelection(answerId, { announce: false })) return false;
  return performBuilderPunchline();
}

function recordingFlowIsCurrent(epoch) {
  return epoch === flowEpoch && screens.is('builder');
}

async function startRecording() {
  if (state.busy || state.recordingState !== 'idle' || !screens.is('builder')) return false;
  const epoch = flowEpoch;
  state.busy = true;
  state.recordingState = 'requesting';
  nudger.stop();
  voice.stop();
  speech.stop();
  updateRecordingUi('Allow microphone access to record your punchline.');
  const granted = await microphoneRecorder.request();
  if (!recordingFlowIsCurrent(epoch)) {
    microphoneRecorder.cancel();
    return false;
  }
  if (!granted) {
    state.busy = false;
    state.recordingState = 'idle';
    updateRecordingUi('The microphone is not ready. Please try again.');
    nudger.arm();
    return false;
  }

  state.recordingState = 'countdown';
  updateRecordingUi();
  for (const count of [3, 2, 1]) {
    if (!recordingFlowIsCurrent(epoch)) {
      microphoneRecorder.cancel();
      return false;
    }
    el.recordCountdown.textContent = String(count);
    await Promise.all([
      timers.wait(720),
      state.muted ? Promise.resolve() : speech.speak(String(count)),
    ]);
  }
  if (!recordingFlowIsCurrent(epoch)) {
    microphoneRecorder.cancel();
    return false;
  }
  el.recordCountdown.textContent = 'GO!';
  await timers.wait(320);
  if (!recordingFlowIsCurrent(epoch)) {
    microphoneRecorder.cancel();
    return false;
  }

  if (!microphoneRecorder.start()) {
    state.busy = false;
    state.recordingState = 'idle';
    updateRecordingUi('The microphone could not start. Please try again.');
    nudger.arm();
    return false;
  }
  state.recordingState = 'recording';
  updateRecordingUi();
  return true;
}

async function finishRecording() {
  if (state.recordingState !== 'recording') return false;
  const epoch = flowEpoch;
  state.recordingState = 'stopping';
  updateRecordingUi();
  const blob = await microphoneRecorder.stop();
  if (!recordingFlowIsCurrent(epoch)) return false;
  if (!blob?.size) {
    state.busy = false;
    state.recordingState = 'idle';
    updateRecordingUi('I could not hear that. Please try again.');
    nudger.arm();
    return false;
  }
  state.recordingBlob = blob;
  state.recordingState = 'idle';
  const performance = currentBuilderPerformance();
  return showPerformance(performance);
}

function currentBuilderPerformance() {
  const joke = jokeMap.get(state.selectedJokeId);
  if (!joke) return null;
  if (state.recordingBlob) {
    return {
      joke,
      answer: null,
      text: 'My punchline!',
      customText: '',
      recordingBlob: state.recordingBlob,
      classic: false,
      replay: false,
    };
  }
  const answer = answerMap.get(state.selectedAnswerId);
  if (!answer || answer.jokeId !== joke.id) return null;
  return {
    joke,
    answer,
    text: answer.text,
    customText: '',
    classic: Boolean(answer.classic),
    replay: false,
  };
}

function clearStageClasses() {
  el.stage.classList.remove('is-revealed', 'is-laughing');
}

let recordedPlayback = null;

function stopRecordedPlayback() {
  const playback = recordedPlayback;
  if (!playback) return;
  recordedPlayback = null;
  playback.audio.pause();
  playback.audio.removeAttribute('src');
  playback.audio.load();
  URL.revokeObjectURL(playback.url);
  playback.finish?.(false);
}

function playRecordedPunchline(blob, epoch) {
  stopRecordedPlayback();
  if (state.muted || !(blob instanceof Blob) || !blob.size) return Promise.resolve(false);
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  const playback = { audio, url, finish: null };
  recordedPlayback = playback;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (played) => {
      if (settled) return;
      settled = true;
      if (recordedPlayback === playback) {
        recordedPlayback = null;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        URL.revokeObjectURL(url);
      }
      resolve(played);
    };
    playback.finish = finish;
    audio.addEventListener('ended', () => finish(true), { once: true });
    audio.addEventListener('error', () => finish(false), { once: true });
    if (epoch !== flowEpoch || !screens.is('stage')) {
      finish(false);
      return;
    }
    audio.play().catch(() => finish(false));
  });
}

let audiencePlayback = null;

function stopAudienceReaction() {
  const playback = audiencePlayback;
  audiencePlayback = null;
  const video = playback?.video || el.audienceVideo;
  if (!video) return;
  video.pause();
  try { video.currentTime = 0; } catch { /* metadata may not be ready */ }
  playback?.finish?.(false);
}

function playAudienceReaction(epoch) {
  stopAudienceReaction();
  const video = el.audienceVideo;
  if (!video || epoch !== flowEpoch || !screens.is('stage')) return Promise.resolve(false);
  video.muted = state.muted;
  try { video.currentTime = 0; } catch { /* metadata may not be ready */ }
  if (state.reducedMotion) return Promise.resolve(true);
  const playback = { video, finish: null, timeout: 0 };
  audiencePlayback = playback;
  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
    };
    const finish = (played) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (playback.timeout) window.clearTimeout(playback.timeout);
      if (audiencePlayback === playback) audiencePlayback = null;
      if (!played) video.pause();
      resolve(played);
    };
    const onEnded = () => finish(true);
    const onError = () => finish(false);
    playback.finish = finish;
    video.addEventListener('ended', onEnded, { once: true });
    video.addEventListener('error', onError, { once: true });
    playback.timeout = window.setTimeout(() => finish(false), 20_000);
    const retryMuted = () => {
      if (settled || video.muted || state.muted) {
        finish(false);
        return;
      }
      video.muted = true;
      try {
        const retryPromise = video.play();
        retryPromise?.catch?.(() => finish(false));
      } catch {
        finish(false);
      }
    };
    try {
      const playPromise = video.play();
      playPromise?.catch?.(retryMuted);
    } catch {
      retryMuted();
    }
  });
}

function audienceReactionFor(performance) {
  return performance?.recordingBlob || performance?.classic ? 'laugh' : 'confused';
}

function renderPerformance(performance) {
  stopAudienceReaction();
  clearStageClasses();
  el.performanceSetup.textContent = performance.joke.setup;
  el.performancePunchline.textContent = '';
  el.stageCaption.textContent = 'The audience is ready…';
  el.stageActions.hidden = true;
  el.rewardStar.hidden = true;
  const reaction = audienceReactionFor(performance);
  el.audienceVideo.poster = config.assets.stage.audienceNeutral;
  el.audienceVideo.src = reaction === 'laugh'
    ? config.assets.stage.audienceLaugh
    : config.assets.stage.audienceConfused;
  el.audienceVideo.muted = state.muted;
  el.audienceVideo.load();
}

function performanceFromEntry(entry) {
  const clean = sanitizeEntry(entry);
  if (!clean) return null;
  const joke = jokeMap.get(clean.setupId);
  const answer = clean.punchlineId ? answerMap.get(clean.punchlineId) : null;
  const text = answer?.text || clean.customText;
  return {
    joke,
    answer,
    text,
    customText: answer ? '' : clean.customText,
    classic: Boolean(answer?.classic),
    replay: true,
  };
}

function awardStageIfNeeded() {
  if (!currentPerformance || currentPerformance.replay || stageAwarded) return false;
  stageAwarded = true;
  savePerformance(currentPerformance);
  el.rewardStar.hidden = false;
  try { sfx.sparkle(); } catch { /* supportive only */ }
  return true;
}

function finishStageNow() {
  if (!screens.is('stage') || !currentPerformance) return false;
  flowEpoch += 1;
  voice.stop();
  speech.stop();
  stopRecordedPlayback();
  stopAudienceReaction();
  el.performancePunchline.textContent = currentPerformance.text;
  el.stage.classList.add('is-revealed');
  awardStageIfNeeded();
  el.stageCaption.textContent = currentPerformance.replay
    ? 'Encore!'
    : audienceReactionFor(currentPerformance) === 'laugh'
      ? 'The audience is laughing!'
      : 'The audience is thinking…';
  el.stageActions.hidden = false;
  focusWithoutScroll(el.nextJoke);
  state.busy = false;
  state.stageComplete = true;
  return true;
}

async function runStage(performance, epoch) {
  el.performancePunchline.textContent = performance.text;
  await speakKey(performance.joke.setupVoice, performance.joke.setup);
  if (epoch !== flowEpoch || !screens.is('stage')) return false;

  if (performance.recordingBlob) await playRecordedPunchline(performance.recordingBlob, epoch);
  else if (performance.answer) await speakKey(performance.answer.id, performance.text);
  else if (!state.muted) await speech.speak(performance.text);
  if (epoch !== flowEpoch || !screens.is('stage')) return false;

  const reaction = audienceReactionFor(performance);
  el.stageCaption.textContent = reaction === 'laugh'
    ? 'The audience is laughing!'
    : 'The audience is thinking…';
  await playAudienceReaction(epoch);
  if (epoch !== flowEpoch || !screens.is('stage')) return false;

  try { sfx.tada(); } catch { /* supportive only */ }
  celebrationDispose?.();
  celebrationDispose = burstConfetti({
    host: el.stage,
    count: 38,
    duration: 2600,
    rng,
    drift: 120,
  });
  awardStageIfNeeded();
  if (reaction === 'laugh') el.stage.classList.add('is-laughing');
  el.stageActions.hidden = false;
  focusWithoutScroll(el.nextJoke);
  state.busy = false;
  state.stageComplete = true;
  return true;
}

function showPerformance(performance) {
  if (!performance?.joke || !performance.text) return false;
  currentPerformance = performance;
  stageAwarded = false;
  state.busy = true;
  state.stageComplete = false;
  screens.show('stage');
  renderPerformance(performance);
  const epoch = flowEpoch;
  stagePromise = runStage(performance, epoch);
  return true;
}

function performBuilderPunchline() {
  if (state.busy) return false;
  const performance = currentBuilderPerformance();
  if (!performance) {
    const target = el.answerRow;
    target.classList.remove('jw-wiggle');
    requestAnimationFrame(() => target.classList.add('jw-wiggle'));
    speakKey('record-ending');
    return false;
  }
  state.busy = true;
  return showPerformance(performance);
}

function showBook() {
  state.busy = false;
  screens.show('book');
  renderBook();
  focusWithoutScroll($('.jw-book-entry', el.bookList) || el.bookPlay);
  speakKey(progress.entries.length ? 'book-intro' : 'book-empty');
}

function renderBook() {
  el.bookList.replaceChildren();
  el.bookEmpty.hidden = progress.entries.length > 0;
  el.bookList.hidden = progress.entries.length === 0;
  updateStarCounters();
  progress.entries.forEach((entry, index) => {
    const performance = performanceFromEntry(entry);
    if (!performance) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'jw-book-entry';
    button.dataset.target = `book-entry-${index}`;
    button.dataset.role = 'replay';
    button.setAttribute('aria-label', `Perform again: ${performance.joke.setup} ${performance.text}`);
    button.append(cardImage(config.assets.ui.questionBanner));
    const art = cardImage(
      performance.answer ? config.assets.answers[performance.answer.id] : config.assets.topics[performance.joke.id],
      'jw-book-entry-art',
    );
    art.alt = '';
    const copy = document.createElement('span');
    copy.className = 'jw-book-entry-copy';
    const setup = document.createElement('small');
    setup.textContent = performance.joke.setup;
    const punchline = document.createElement('strong');
    punchline.textContent = performance.text;
    copy.append(setup, punchline);
    button.append(art, copy);
    el.bookList.append(button);
    screens.hold(onTap(button, () => showPerformance(performance), { feedback: touchFeedback }));
  });
}

function nextJoke() {
  const index = config.jokes.findIndex((joke) => joke.id === currentPerformance?.joke.id);
  const next = config.jokes[(index + 1 + config.jokes.length) % config.jokes.length] || config.jokes[0];
  showDeck({ preselect: next?.id, voiceKey: 'next-joke' });
}

function setMuted(on = true) {
  const muted = Boolean(on);
  state.muted = muted;
  voice.setMuted(muted);
  comedyAudio.setMuted(muted);
  if (el.audienceVideo) el.audienceVideo.muted = muted;
  try { sfx.setMuted(muted); } catch { /* supportive only */ }
  if (muted) {
    speech.stop();
    stopRecordedPlayback();
  }
  return muted;
}

function tapTarget(id) {
  const node = $$('[data-target]').find((target) => target.dataset.target === String(id));
  if (!node || node.disabled || node.getBoundingClientRect().width <= 0) return false;
  node.click();
  return true;
}

function clearSavedBook() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* memory reset still works */ }
  progress = defaultProgress();
  memoryProgress = progress;
  updateStarCounters();
  if (screens.is('book')) renderBook();
  return true;
}

function getState() {
  return {
    screen: screens.current,
    selectedJokeId: state.selectedJokeId,
    selectedAnswerId: state.selectedAnswerId,
    recordingState: state.recordingState,
    busy: state.busy,
    muted: state.muted,
    reducedMotion: state.reducedMotion,
    stageComplete: state.stageComplete,
    stars: progress.stars,
    bookCount: progress.entries.length,
    performance: currentPerformance ? {
      jokeId: currentPerformance.joke.id,
      answerId: currentPerformance.answer?.id || null,
      text: currentPerformance.text,
      replay: currentPerformance.replay,
    } : null,
    timers: timers.size(),
    seed: rngSeed,
  };
}

function debugStartMode(id) {
  if (id === 'record-my-own' || id === 'make-my-own') return showBuilder(config.jokes[0]?.id);
  if (id === 'picture-punchlines') {
    showDeck({ preselect: config.jokes[0]?.id });
    return true;
  }
  return false;
}

async function debugWinRound() {
  if (screens.is('deck')) return showBuilder(state.selectedJokeId);
  if (screens.is('builder')) {
    const joke = jokeMap.get(state.selectedJokeId);
    const classic = joke?.answers.find((answer) => answer.classic) || joke?.answers[0];
    if (!classic) return false;
    setAnswerSelection(classic.id, { announce: false });
    return performBuilderPunchline();
  }
  if (screens.is('stage')) return finishStageNow();
  return false;
}

globalDisposers.push(
  onTap(el.start, () => showDeck(), { feedback: touchFeedback }),
  onTap(el.splashBook, showBook, { feedback: touchFeedback }),
  onTap(el.recordButton, () => (
    state.recordingState === 'recording' ? finishRecording() : startRecording()
  ), { feedback: touchFeedback }),
  onTap(el.nextJoke, nextJoke, { feedback: touchFeedback }),
  onTap(el.stageBook, showBook, { feedback: touchFeedback }),
  onTap(el.bookPlay, () => showDeck(), { feedback: touchFeedback }),
);

const removeMotionListener = () => {
  const onChange = (event) => { state.reducedMotion = event.matches; };
  reducedMotionQuery.addEventListener?.('change', onChange);
  return () => reducedMotionQuery.removeEventListener?.('change', onChange);
};
globalDisposers.push(removeMotionListener());

globalDisposers.push(installKioskGuards());
globalDisposers.push(installUnlockOnGesture({
  extra: [comedyAudio.unlock],
  onFirst() {
    firstGesture = true;
    if (screens.is('splash')) speakKey('welcome');
  },
}));

const ready = Promise.resolve(true);
const disposeDebug = installDebug({
  gameId: config.id,
  engine: 'custom-comedy-stage',
  ready,
  listModes: () => [
    { id: 'picture-punchlines', title: 'Picture Punchlines' },
    { id: 'record-my-own', title: 'Record My Own' },
  ],
  startMode: debugStartMode,
  getState,
  getTargets: () => collectTargets(root),
  tap: tapTarget,
  winRound: debugWinRound,
  home: () => showSplash({ speak: false }),
  mute: setMuted,
  timers,
  voice,
  sfx,
  onSeed(nextRng, seed) {
    rng = nextRng;
    rngSeed = seed;
  },
  selectJoke(id) {
    if (!setSelectedJoke(id, { announce: false })) return false;
    return showBuilder(id);
  },
  selectAnswer(id) {
    return setAnswerSelection(id, { announce: false });
  },
  recordOwn: startRecording,
  perform: performBuilderPunchline,
  completeStage: finishStageNow,
  waitForStage: () => stagePromise,
  openBook: showBook,
  getBook: () => JSON.parse(JSON.stringify(progress)),
  clearStorage: clearSavedBook,
  getAudioLog: voice.getAudioLog,
  clearAudioLog: voice.clearAudioLog,
});

globalDisposers.push(disposeDebug);
updateStarCounters();
currentVoiceKey = 'welcome';

window.addEventListener('pagehide', () => {
  for (const dispose of globalDisposers.splice(0)) {
    try { dispose?.(); } catch { /* page is leaving */ }
  }
  screens.destroy();
  timers.clearAll();
  nudger.stop();
  microphoneRecorder.cancel();
  stopRecordedPlayback();
  stopAudienceReaction();
  voice.stop();
  speech.stop();
  comedyAudio.stop();
}, { once: true });
