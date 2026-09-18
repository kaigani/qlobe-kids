import config from '../config.js';
import { createScreens } from '../../../shared/js/screens.js';
import { onTap } from '../../../shared/js/tap.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { installUnlockOnGesture, installKioskGuards, unlockAll } from '../../../shared/js/audio-unlock.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as speech from '../../../shared/js/speech.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as bgm from '../../../shared/js/bgm.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';
import { createMicrophoneRecorder } from './microphone-recorder.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const fallbackLines = { ...config.lines };
for (const pack of config.packs) {
  for (const prompt of pack.prompts) fallbackLines[prompt.voiceKey] = prompt.text;
}
await voice.init(config.voice.manifest, config.voice.lines, fallbackLines);

const root = $('#game');
const timers = createTimers();
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const STORAGE_KEY = 'qlobe-question-ball-v1';
const packMap = new Map(config.packs.map((pack) => [pack.id, pack]));
const packIds = new Set(packMap.keys());
const globalDisposers = [];

const el = {
  splash: $('[data-qk-screen="splash"]'),
  topics: $('[data-qk-screen="topics"]'),
  toss: $('[data-qk-screen="toss"]'),
  question: $('[data-qk-screen="question"]'),
  reward: $('[data-qk-screen="reward"]'),
  start: $('#start-button'),
  splashBall: $('#splash-ball'),
  topicGrid: $('#topic-grid'),
  tossArena: $('#toss-arena'),
  tossBall: $('#toss-ball'),
  tossBallArt: $('#toss-ball img'),
  tossGesture: $('#toss-gesture'),
  questionWord: $('#question-word'),
  questionText: $('#question-text'),
  microphone: $('#microphone-button'),
  microphoneLabel: $('#microphone-label'),
  replay: $('#replay-button'),
  coplay: $('#coplay-button'),
  coplayLabel: $('#coplay-label'),
  shareStatus: $('#share-status'),
  rewardStage: $('#reward-stage'),
  rewardKicker: $('#reward-kicker'),
  rewardTitle: $('#reward-title'),
  next: $('#next-button'),
  chooseTopics: $('#topics-button'),
  status: $('#game-status'),
};

let memoryProgress = defaultProgress();
let progress = loadProgress();
let rngSeed = (Date.now() ^ 0x51424c4c) >>> 0;
let rng = mulberry32(rngSeed);
let currentPack = packMap.get(progress.lastPack) || null;
let currentPrompt = null;
let currentVoice = { key: 'welcome', text: fallbackLines.welcome };
let flowEpoch = 0;
let sessionStars = 0;
let rewardAwarded = false;
let celebrationDispose = null;
let promptHistory = [];
let lastShareMethod = null;
const decks = new Map();
const lastPromptByPack = new Map();

const state = {
  tossPhase: 'idle',
  shareState: 'idle',
  muted: false,
  reducedMotion: motionQuery.matches,
  firstGesture: false,
};

let recordingBlob = null;
let recordingUrl = null;
let recordingAudio = null;
let micHold = null;
let micToken = 0;

let activePointer = null;
let pointerOffset = { x: 0, y: 0 };
let pointerSamples = [];
let pointerTravel = 0;
let suppressBallClickUntil = 0;
let tossAnimation = null;
let tossToken = 0;
let tossMotion = null;

bgm.preload(config.music.src);
bgm.setVolume(config.music.volume);

const microphoneRecorder = createMicrophoneRecorder({
  maxDurationMs: 15_000,
  onLimit() {
    if (state.shareState === 'recording') void finishMicrophone({ cancelled: false, reason: 'limit' });
  },
});

const screens = createScreens({
  root,
  initial: 'splash',
  splash: 'splash',
  voice,
  onExit(name) {
    flowEpoch += 1;
    timers.clearAll();
    nudger.stop();
    voice.stop();
    speech.stop();
    celebrationDispose?.();
    celebrationDispose = null;
    if (name === 'toss') cancelToss({ reset: false });
    if (name === 'question') clearQuestionRecording();
  },
  onEnter() {
    updateStarCounters();
  },
});

const nudger = createNudger({
  first: 6000,
  repeat: 9000,
  onNudge(count) {
    if (screens.is('topics')) {
      const cards = $$('.qb-topic-card', el.topicGrid);
      cards[count % Math.max(1, cards.length)]?.classList.add('is-nudged');
      void speakKey('choose-topic', fallbackLines['choose-topic'], { remember: false });
      return;
    }
    if (screens.is('toss') && state.tossPhase === 'ready') {
      el.tossGesture.classList.remove('is-hidden');
      void speakKey('toss-nudge', fallbackLines['toss-nudge'], { remember: false });
      return;
    }
    if (screens.is('question') && ['idle', 'fallback', 'recorded'].includes(state.shareState)) {
      el.question.classList.add('is-fallback');
      timers.after(2300, () => el.question.classList.remove('is-fallback'));
      void speakKey('share', fallbackLines.share, { remember: false });
    }
  },
});

function defaultProgress() {
  return {
    stars: 0,
    completedByPack: Object.fromEntries(config.packs.map((pack) => [pack.id, 0])),
    lastPack: null,
  };
}

function sanitizeProgress(value) {
  const clean = defaultProgress();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return clean;
  clean.stars = clamp(Math.floor(Number(value.stars) || 0), 0, 9999);
  if (value.completedByPack && typeof value.completedByPack === 'object') {
    for (const id of packIds) {
      clean.completedByPack[id] = clamp(
        Math.floor(Number(value.completedByPack[id]) || 0),
        0,
        9999,
      );
    }
  }
  clean.lastPack = packIds.has(String(value.lastPack || '')) ? String(value.lastPack) : null;
  return clean;
}

function cloneProgress(value) {
  return JSON.parse(JSON.stringify(sanitizeProgress(value)));
}

function loadProgress() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      memoryProgress = sanitizeProgress(JSON.parse(saved));
      return cloneProgress(memoryProgress);
    }
  } catch { /* storage can be unavailable in private browsing */ }
  return cloneProgress(memoryProgress);
}

function saveProgress() {
  progress = sanitizeProgress(progress);
  memoryProgress = cloneProgress(progress);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch { /* memory fallback remains */ }
}

function clearSaved() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* memory reset remains */ }
  progress = defaultProgress();
  memoryProgress = cloneProgress(progress);
  currentPack = null;
  currentPrompt = null;
  sessionStars = 0;
  promptHistory = [];
  decks.clear();
  lastPromptByPack.clear();
  updateStarCounters();
  updateTopicProgress();
  return true;
}

function renderTopics() {
  el.topicGrid.replaceChildren();
  for (const pack of config.packs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'qb-topic-card';
    button.dataset.target = `topic-${pack.id}`;
    button.dataset.role = 'mode';
    button.dataset.pack = pack.id;
    button.setAttribute('aria-label', `${pack.title}. ${pack.skill}.`);

    const backing = document.createElement('img');
    backing.className = 'qb-topic-backing';
    backing.src = pack.card;
    backing.alt = '';
    backing.setAttribute('aria-hidden', 'true');

    const art = document.createElement('img');
    art.className = 'qb-topic-art';
    art.src = pack.art;
    art.alt = '';
    art.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.className = 'qb-topic-label';
    label.textContent = pack.shortTitle;

    const count = document.createElement('span');
    count.className = 'qb-topic-progress';
    count.dataset.progressPack = pack.id;
    count.setAttribute('aria-hidden', 'true');
    const star = document.createElement('img');
    star.src = config.assets.star;
    star.alt = '';
    const number = document.createElement('strong');
    number.textContent = String(progress.completedByPack[pack.id] || 0);
    count.append(star, number);

    button.append(backing, art, label, count);
    el.topicGrid.append(button);
    globalDisposers.push(onTap(button, () => startPack(pack.id), { feedback: touchFeedback }));
  }
}

function updateTopicProgress() {
  for (const node of $$('[data-progress-pack]', el.topicGrid)) {
    const value = progress.completedByPack[node.dataset.progressPack] || 0;
    const strong = $('strong', node);
    if (strong) strong.textContent = String(value);
  }
}

function installHud() {
  for (const name of ['splash', 'topics', 'toss', 'question', 'reward']) {
    const slot = $(`[data-hud-slot="${name}"]`);
    if (!slot) continue;
    const left = name === 'splash'
      ? hudButton('home', () => { window.location.href = '../../'; }, { label: 'QLOBE Kids home' })
      : hudButton('back', () => navigateBack(name));
    left.classList.add('qk-hud-top-left');
    left.dataset.target = name === 'splash' ? 'catalog-home' : `back-${name}`;
    left.dataset.role = 'navigation';
    slot.append(left);
    globalDisposers.push(left.dispose);

    const sound = hudButton('sound', soundDebounce(() => replayCurrentVoice(), 650));
    sound.classList.add('qk-hud-top-right');
    sound.dataset.target = `sound-${name}`;
    sound.dataset.role = 'replay';
    slot.append(sound);
    globalDisposers.push(sound.dispose);

    if (name !== 'splash') {
      const counter = document.createElement('div');
      counter.className = 'qb-star-counter';
      counter.setAttribute('aria-label', `${progress.stars} Sharing Stars`);
      const art = document.createElement('img');
      art.src = config.assets.star;
      art.alt = '';
      const number = document.createElement('strong');
      number.dataset.starCount = '';
      number.textContent = String(progress.stars);
      counter.append(art, number);
      slot.append(counter);
    }
  }
}

function updateStarCounters() {
  for (const node of $$('[data-star-count]')) node.textContent = String(progress.stars);
  for (const counter of $$('.qb-star-counter')) {
    counter.setAttribute('aria-label', `${progress.stars} Sharing Stars`);
  }
}

function navigateBack(screenName) {
  if (screenName === 'topics') showSplash({ speak: false });
  else if (screenName === 'toss') showTopics();
  else if (screenName === 'question') showToss();
  else showTopics();
}

function touchFeedback(event) {
  event?.preventDefault?.();
  unlockAll([bgm.unlock]);
  nudger.poke();
  try { sfx.tick(); } catch { /* supportive only */ }
}

function speakKey(key, text = fallbackLines[key], { remember = true } = {}) {
  const spokenText = text || fallbackLines[key] || '';
  if (remember) currentVoice = { key, text: spokenText };
  const promise = voice.say(key, spokenText);
  return bgm.duckDuring(promise, { down: 0.16, downMs: 100, upMs: 320 });
}

function replayCurrentVoice() {
  if (!currentVoice?.key) return Promise.resolve();
  return speakKey(currentVoice.key, currentVoice.text, { remember: false });
}

function showSplash({ speak = false } = {}) {
  currentVoice = { key: 'welcome', text: fallbackLines.welcome };
  screens.show('splash');
  if (speak) void replayCurrentVoice();
  return true;
}

function showTopics({ speak = true } = {}) {
  currentVoice = { key: 'choose-topic', text: fallbackLines['choose-topic'] };
  screens.show('topics');
  updateTopicProgress();
  nudger.arm();
  if (speak) void replayCurrentVoice();
  return true;
}

function startPack(id) {
  const pack = packMap.get(String(id));
  if (!pack) return false;
  currentPack = pack;
  currentPrompt = null;
  rewardAwarded = false;
  progress.lastPack = pack.id;
  saveProgress();
  showToss({ announcementKey: pack.voiceKey });
  return true;
}

function showToss({ announcementKey = 'toss' } = {}) {
  if (!currentPack) currentPack = packMap.get(progress.lastPack) || config.packs[0];
  currentPrompt = null;
  rewardAwarded = false;
  lastShareMethod = null;
  currentVoice = { key: 'toss', text: fallbackLines.toss };
  screens.show('toss');
  state.tossPhase = 'ready';
  requestAnimationFrame(resetBall);
  nudger.arm();

  const epoch = flowEpoch;
  void (async () => {
    if (announcementKey && announcementKey !== 'toss') {
      await speakKey(announcementKey, fallbackLines[announcementKey], { remember: false });
      if (epoch !== flowEpoch || !screens.is('toss')) return;
    }
    await speakKey('toss', fallbackLines.toss);
  })();
  return true;
}

function drawPrompt() {
  if (!currentPack) currentPack = config.packs[0];
  let deck = decks.get(currentPack.id) || [];
  if (deck.length === 0) {
    deck = shuffle(currentPack.prompts, rng);
    const lastId = lastPromptByPack.get(currentPack.id);
    if (deck.length > 1 && deck[0]?.id === lastId) [deck[0], deck[1]] = [deck[1], deck[0]];
  }
  currentPrompt = deck.shift() || currentPack.prompts[0];
  decks.set(currentPack.id, deck);
  lastPromptByPack.set(currentPack.id, currentPrompt.id);
  promptHistory.push(currentPrompt.id);
  if (promptHistory.length > 48) promptHistory = promptHistory.slice(-48);
  return currentPrompt;
}

function revealQuestion() {
  if (!currentPack) currentPack = config.packs[0];
  cancelToss({ reset: false });
  const prompt = drawPrompt();
  rewardAwarded = false;
  state.tossPhase = 'revealed';
  state.shareState = 'idle';
  el.questionWord.textContent = (prompt.text.match(/^\s*(Who|What|Why|How)\b/i)?.[1] || 'Share').toUpperCase();
  el.questionText.textContent = prompt.text;
  updateShareUi();
  screens.show('question');
  nudger.arm();
  currentVoice = { key: prompt.voiceKey, text: prompt.text };

  const epoch = flowEpoch;
  void (async () => {
    await speakKey(prompt.voiceKey, prompt.text);
    if (epoch !== flowEpoch || !screens.is('question')) return;
    await speakKey('share', fallbackLines.share, { remember: false });
  })();
  return true;
}

function nextQuestion() {
  if (!currentPack) currentPack = config.packs[0];
  showToss({ announcementKey: 'next-question' });
  return true;
}

function finishShare({ recorded = false } = {}) {
  if (!screens.is('question') || rewardAwarded || !currentPack || !currentPrompt) return false;
  rewardAwarded = true;
  lastShareMethod = recorded || state.shareState === 'recorded' ? 'recorded' : 'co-play';
  progress.stars += 1;
  progress.completedByPack[currentPack.id] += 1;
  progress.lastPack = currentPack.id;
  sessionStars += 1;
  saveProgress();

  const celebrationKey = sessionStars === 3
    ? 'session-cheer'
    : `great-sharing-${1 + Math.floor(rng() * 3)}`;
  el.rewardKicker.textContent = sessionStars === 3 ? 'Three stars together!' : 'You shared an idea!';
  el.rewardTitle.textContent = sessionStars === 3 ? 'Conversation Friend!' : 'Sharing Star!';
  screens.show('reward');
  updateStarCounters();
  try { sfx.tada(); } catch { /* supportive only */ }
  celebrationDispose = burstConfetti({ host: el.rewardStage, count: 38, duration: 2600, rng });
  void speakKey(celebrationKey, fallbackLines[celebrationKey]);
  return true;
}

function updateShareUi() {
  const mode = state.shareState;
  const isRecording = mode === 'recording';
  const isProcessing = mode === 'processing';
  el.microphone.classList.toggle('is-recording', isRecording);
  el.microphone.setAttribute('aria-pressed', String(isRecording));
  el.microphone.setAttribute('aria-busy', String(mode === 'requesting' || isProcessing));
  el.microphone.disabled = isProcessing;
  el.coplay.disabled = ['requesting', 'recording', 'processing'].includes(mode);
  el.question.classList.toggle('is-fallback', mode === 'fallback');
  el.replay.hidden = mode !== 'recorded';

  if (mode === 'requesting') {
    el.microphoneLabel.textContent = 'KEEP HOLDING';
    el.shareStatus.textContent = 'Getting the microphone ready… keep holding.';
  } else if (mode === 'recording') {
    el.microphoneLabel.textContent = 'TALK NOW';
    el.shareStatus.textContent = 'I’m listening. Let go when your idea is finished.';
  } else if (isProcessing) {
    el.microphoneLabel.textContent = 'SAVING YOUR IDEA';
    el.coplayLabel.textContent = 'JUST A MOMENT';
    el.shareStatus.textContent = 'Your idea is getting ready…';
  } else if (mode === 'recorded') {
    el.microphoneLabel.textContent = 'HOLD TO TRY AGAIN';
    el.coplayLabel.textContent = 'SHARE MY IDEA';
    el.shareStatus.textContent = 'Your idea is ready! Hear it again, or share it now.';
  } else if (mode === 'fallback') {
    el.microphoneLabel.textContent = 'MICROPHONE RESTING';
    el.coplayLabel.textContent = 'I TOLD A FRIEND';
    el.shareStatus.textContent = 'That’s okay—tell someone beside you, then tap the two friends.';
  } else {
    el.microphoneLabel.textContent = 'HOLD TO TALK';
    el.coplayLabel.textContent = 'TELL A FRIEND';
    el.shareStatus.textContent = 'Hold the microphone while you talk, or tell someone beside you.';
  }
}

async function beginMicrophoneHold(pointerId = 'debug') {
  if (!screens.is('question') || ['requesting', 'recording', 'processing'].includes(state.shareState)) return false;
  clearRecordedAnswer();
  const token = ++micToken;
  micHold = { pointerId, token, down: true };
  state.shareState = 'requesting';
  updateShareUi();
  voice.stop();
  speech.stop();

  const result = await microphoneRecorder.request();
  if (!micHold || micHold.token !== token || !micHold.down || !screens.is('question')) {
    microphoneRecorder.cancel();
    if (screens.is('question') && state.shareState === 'requesting') {
      state.shareState = 'idle';
      updateShareUi();
    }
    return false;
  }
  if (!result.ok) {
    if (result.reason !== 'cancelled') microphoneFallback();
    return false;
  }

  await speakKey('recording', fallbackLines.recording, { remember: false });
  if (!micHold || micHold.token !== token || !micHold.down || !screens.is('question')) {
    microphoneRecorder.cancel();
    if (screens.is('question')) {
      state.shareState = 'idle';
      updateShareUi();
    }
    return false;
  }

  if (!microphoneRecorder.start()) {
    microphoneFallback();
    return false;
  }
  state.shareState = 'recording';
  bgm.duck(0.08, 100);
  updateShareUi();
  return true;
}

async function finishMicrophone({ cancelled = false } = {}) {
  if (micHold) micHold.down = false;
  if (state.shareState === 'requesting') {
    microphoneRecorder.cancel();
    state.shareState = 'idle';
    updateShareUi();
    return false;
  }
  if (state.shareState !== 'recording') return false;

  const token = micHold?.token ?? micToken;
  state.shareState = 'processing';
  updateShareUi();
  bgm.duck(1, 280);
  if (cancelled) {
    microphoneRecorder.cancel();
    state.shareState = 'idle';
    updateShareUi();
    return false;
  }

  const blob = await microphoneRecorder.stop();
  if (token !== micToken || !screens.is('question')) return false;
  if (!blob?.size) {
    microphoneFallback();
    return false;
  }
  micHold = null;
  clearRecordedAnswer();
  recordingBlob = blob;
  recordingUrl = URL.createObjectURL(blob);
  state.shareState = 'recorded';
  updateShareUi();
  await speakKey('recorded', fallbackLines.recorded, { remember: false });
  return true;
}

function microphoneFallback() {
  microphoneRecorder.cancel();
  if (micHold) micHold.down = false;
  micHold = null;
  bgm.duck(1, 260);
  state.shareState = 'fallback';
  updateShareUi();
  void speakKey('mic-fallback', fallbackLines['mic-fallback'], { remember: false });
}

function clearRecordedAnswer() {
  if (recordingAudio) {
    try { recordingAudio.pause(); } catch { /* ignore */ }
    recordingAudio = null;
  }
  if (recordingUrl) URL.revokeObjectURL(recordingUrl);
  recordingUrl = null;
  recordingBlob = null;
}

function clearQuestionRecording() {
  ++micToken;
  if (micHold) micHold.down = false;
  micHold = null;
  microphoneRecorder.cancel();
  bgm.duck(1, 180);
  clearRecordedAnswer();
  state.shareState = 'idle';
  updateShareUi();
}

function replayRecordedAnswer() {
  if (!recordingUrl || state.shareState !== 'recorded') return false;
  if (recordingAudio) {
    try { recordingAudio.pause(); } catch { /* ignore */ }
  }
  const audio = new Audio(recordingUrl);
  recordingAudio = audio;
  audio.muted = state.muted;
  const playback = new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (recordingAudio === audio) recordingAudio = null;
      resolve();
    };
    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener('error', finish, { once: true });
    window.setTimeout(finish, 16_000);
    audio.play().catch(finish);
  });
  bgm.duckDuring(playback, { down: 0.08, downMs: 90, upMs: 300 });
  return true;
}

function ballBounds() {
  const width = el.tossArena.clientWidth;
  const height = el.tossArena.clientHeight;
  const ballWidth = el.tossBall.offsetWidth;
  const ballHeight = el.tossBall.offsetHeight;
  const pad = Math.max(8, Math.min(width, height) * 0.018);
  return { width, height, ballWidth, ballHeight, pad };
}

function setBallPosition(x, y) {
  const bounds = ballBounds();
  const left = clamp(x, bounds.pad, Math.max(bounds.pad, bounds.width - bounds.ballWidth - bounds.pad));
  const top = clamp(y, bounds.pad, Math.max(bounds.pad, bounds.height - bounds.ballHeight - bounds.pad));
  el.tossBall.style.left = `${left}px`;
  el.tossBall.style.top = `${top}px`;
  return { x: left, y: top };
}

function resetBall() {
  if (!screens.is('toss') || !el.tossArena.clientWidth) return;
  tossAnimation?.cancel();
  tossAnimation = null;
  const bounds = ballBounds();
  const x = (bounds.width - bounds.ballWidth) / 2;
  const y = bounds.height - bounds.ballHeight - Math.max(bounds.pad, bounds.height * 0.025);
  const position = setBallPosition(x, y);
  el.tossBall.style.transform = '';
  el.tossBall.classList.remove('is-dragging', 'is-landing');
  el.tossBall.classList.add('is-ready');
  el.tossBall.disabled = false;
  el.tossGesture.classList.remove('is-hidden');
  el.tossGesture.style.left = `${clamp(position.x + bounds.ballWidth * .68, 8, bounds.width - 130)}px`;
  el.tossGesture.style.top = `${clamp(position.y - bounds.ballHeight * .42, 8, bounds.height - 120)}px`;
  state.tossPhase = 'ready';
  tossMotion = null;
}

function onBallDown(event) {
  if (!screens.is('toss') || state.tossPhase !== 'ready' || activePointer !== null) return;
  event.preventDefault();
  touchFeedback(event);
  const ballRect = el.tossBall.getBoundingClientRect();
  activePointer = event.pointerId;
  pointerOffset = { x: event.clientX - ballRect.left, y: event.clientY - ballRect.top };
  pointerSamples = [{ x: event.clientX, y: event.clientY, t: performance.now() }];
  pointerTravel = 0;
  el.tossBall.classList.remove('is-ready');
  el.tossBall.classList.add('is-dragging');
  el.tossGesture.classList.add('is-hidden');
  try { el.tossBall.setPointerCapture(event.pointerId); } catch { /* not all synthetic pointers */ }
}

function onBallMove(event) {
  if (event.pointerId !== activePointer || state.tossPhase !== 'ready') return;
  event.preventDefault();
  const arenaRect = el.tossArena.getBoundingClientRect();
  const previous = pointerSamples[pointerSamples.length - 1];
  pointerTravel += Math.hypot(event.clientX - previous.x, event.clientY - previous.y);
  setBallPosition(
    event.clientX - arenaRect.left - pointerOffset.x,
    event.clientY - arenaRect.top - pointerOffset.y,
  );
  const now = performance.now();
  pointerSamples.push({ x: event.clientX, y: event.clientY, t: now });
  pointerSamples = pointerSamples.filter((sample) => now - sample.t <= 170).slice(-8);
}

function onBallUp(event) {
  if (event.pointerId !== activePointer) return;
  event.preventDefault();
  const pointerId = activePointer;
  activePointer = null;
  suppressBallClickUntil = performance.now() + 700;
  try { el.tossBall.releasePointerCapture(pointerId); } catch { /* pointer may already be gone */ }
  el.tossBall.classList.remove('is-dragging');

  const first = pointerSamples[0];
  const last = pointerSamples[pointerSamples.length - 1] || first;
  const seconds = Math.max(.035, (last.t - first.t) / 1000);
  let vx = (last.x - first.x) / seconds;
  let vy = (last.y - first.y) / seconds;
  if (pointerTravel < 16 || Math.hypot(vx, vy) < 360) {
    vx = 520;
    vy = -930;
  } else {
    const speed = Math.hypot(vx, vy);
    if (speed < 760) {
      const boost = 760 / Math.max(1, speed);
      vx *= boost;
      vy *= boost;
    }
    if (vy > -360) vy = -Math.max(620, Math.abs(vy));
  }
  launchToss(vx, vy);
}

function onBallCancel(event) {
  if (event.pointerId !== activePointer) return;
  activePointer = null;
  suppressBallClickUntil = performance.now() + 700;
  pointerSamples = [];
  pointerTravel = 0;
  el.tossBall.classList.remove('is-dragging');
  if (screens.is('toss')) resetBall();
}

function launchToss(vx = 520, vy = -930) {
  if (!screens.is('toss') || state.tossPhase !== 'ready') return false;
  activePointer = null;
  const token = ++tossToken;
  const bounds = ballBounds();
  const start = {
    x: parseFloat(el.tossBall.style.left) || (bounds.width - bounds.ballWidth) / 2,
    y: parseFloat(el.tossBall.style.top) || bounds.height - bounds.ballHeight - bounds.pad,
  };
  const boundedVx = clamp(Number(vx) || 0, -1200, 1200);
  const boundedVy = clamp(Number(vy) || -850, -1500, -380);
  const endX = clamp(
    start.x + boundedVx * .32,
    bounds.pad,
    bounds.width - bounds.ballWidth - bounds.pad,
  );
  const landingY = bounds.height - bounds.ballHeight - bounds.pad;
  const apexY = clamp(
    start.y + boundedVy * .24,
    bounds.pad,
    Math.max(bounds.pad, bounds.height * .27),
  );
  const midX = clamp(start.x + boundedVx * .18, bounds.pad, bounds.width - bounds.ballWidth - bounds.pad);
  tossMotion = { vx: boundedVx, vy: boundedVy, start, apex: { x: midX, y: apexY }, end: { x: endX, y: landingY } };
  state.tossPhase = state.reducedMotion ? 'reduced-reveal' : 'flight';
  el.tossBall.disabled = true;
  el.tossBall.classList.remove('is-ready', 'is-dragging');
  el.tossGesture.classList.add('is-hidden');
  nudger.stop();
  try { sfx.whoosh(); } catch { /* supportive only */ }

  if (state.reducedMotion || typeof el.tossBall.animate !== 'function') {
    setBallPosition(endX, landingY);
    timers.after(90, () => { if (token === tossToken && screens.is('toss')) revealQuestion(); });
    return true;
  }

  const duration = timers.ms(860);
  tossAnimation = el.tossBall.animate([
    { left: `${start.x}px`, top: `${start.y}px`, transform: 'rotate(0deg) scale(1)' },
    { left: `${midX}px`, top: `${apexY}px`, transform: `rotate(${boundedVx >= 0 ? 150 : -150}deg) scale(1.09)`, offset: .48 },
    { left: `${endX}px`, top: `${landingY}px`, transform: `rotate(${boundedVx >= 0 ? 310 : -310}deg) scale(1)`, offset: 1 },
  ], { duration, easing: 'cubic-bezier(.19,.67,.31,1)', fill: 'forwards' });

  tossAnimation.finished.then(async () => {
    if (token !== tossToken || !screens.is('toss')) return;
    setBallPosition(endX, landingY);
    tossAnimation?.cancel();
    tossAnimation = null;
    el.tossBall.style.transform = '';
    el.tossBall.classList.add('is-landing');
    state.tossPhase = 'landing';
    try { sfx.boing(); } catch { /* supportive only */ }
    await timers.wait(330);
    if (token === tossToken && screens.is('toss')) revealQuestion();
  }).catch(() => {});
  return true;
}

function cancelToss({ reset = true } = {}) {
  ++tossToken;
  if (activePointer !== null) {
    try { el.tossBall.releasePointerCapture(activePointer); } catch { /* pointer already lost */ }
  }
  activePointer = null;
  pointerSamples = [];
  pointerTravel = 0;
  tossAnimation?.cancel();
  tossAnimation = null;
  tossMotion = null;
  el.tossBall.classList.remove('is-dragging', 'is-landing');
  if (reset && screens.is('toss')) resetBall();
}

function onMicDown(event) {
  if (!screens.is('question') || event.isPrimary === false) return;
  event.preventDefault();
  touchFeedback(event);
  try { el.microphone.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
  void beginMicrophoneHold(event.pointerId);
}

function onMicUp(event) {
  if (!micHold || micHold.pointerId !== event.pointerId) return;
  event.preventDefault();
  micHold.down = false;
  try { el.microphone.releasePointerCapture(event.pointerId); } catch { /* pointer already gone */ }
  void finishMicrophone({ cancelled: false });
}

function onMicCancel(event) {
  if (!micHold || micHold.pointerId !== event.pointerId) return;
  event.preventDefault();
  micHold.down = false;
  void finishMicrophone({ cancelled: true });
}

function setMuted(on = true) {
  const muted = Boolean(on);
  state.muted = muted;
  voice.setMuted(muted);
  sfx.setMuted(muted);
  bgm.setMuted(muted);
  if (muted) speech.stop();
  if (recordingAudio) recordingAudio.muted = muted;
  return muted;
}

function tapTarget(id) {
  const node = $$('[data-target]', root).find((candidate) => candidate.dataset.target === String(id));
  if (!node || node.disabled || node.getBoundingClientRect().width <= 0) return false;
  node.click();
  return true;
}

function getState() {
  return {
    screen: screens.current,
    packId: currentPack?.id || null,
    promptId: currentPrompt?.id || null,
    promptText: currentPrompt?.text || null,
    promptHistory: promptHistory.slice(),
    tossPhase: state.tossPhase,
    shareState: state.shareState,
    hasRecording: Boolean(recordingBlob && recordingUrl),
    microphoneActive: microphoneRecorder.isRecording() || microphoneRecorder.hasStream(),
    muted: state.muted,
    reducedMotion: state.reducedMotion,
    stars: progress.stars,
    sessionStars,
    completedByPack: { ...progress.completedByPack },
    lastPack: progress.lastPack,
    lastShareMethod,
    timers: timers.size(),
    seed: rngSeed,
    activePointer,
    rewardAwarded,
  };
}

function rectOf(node) {
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return {
    x: Math.round(rect.x * 100) / 100,
    y: Math.round(rect.y * 100) / 100,
    width: Math.round(rect.width * 100) / 100,
    height: Math.round(rect.height * 100) / 100,
  };
}

function getLayout() {
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    orientation: window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait',
    screen: screens.current,
    reducedMotion: state.reducedMotion,
    arena: rectOf(el.tossArena),
    ball: rectOf(el.tossBall),
    question: rectOf($('.qb-question-card')),
    shareZone: rectOf($('.qb-share-zone')),
    motion: tossMotion ? JSON.parse(JSON.stringify(tossMotion)) : null,
    music: bgm.stats(),
    targets: collectTargets(root),
  };
}

async function debugFinishShare(options = {}) {
  const recorded = Boolean(options?.recorded);
  if (recorded && state.shareState === 'recording') await finishMicrophone({ cancelled: false });
  return finishShare({ recorded });
}

async function debugWinRound() {
  if (screens.is('splash')) return showTopics({ speak: false });
  if (screens.is('topics')) return startPack(currentPack?.id || config.packs[0].id);
  if (screens.is('toss')) return revealQuestion();
  if (screens.is('question')) return finishShare({ recorded: state.shareState === 'recorded' });
  if (screens.is('reward')) return nextQuestion();
  return false;
}

renderTopics();
installHud();
updateStarCounters();
updateShareUi();

globalDisposers.push(
  onTap(el.start, () => showTopics(), { feedback: touchFeedback }),
  onTap(el.splashBall, () => showTopics(), { feedback: touchFeedback }),
  onTap(el.replay, replayRecordedAnswer, { feedback: touchFeedback }),
  onTap(el.coplay, () => finishShare({ recorded: state.shareState === 'recorded' }), { feedback: touchFeedback }),
  onTap(el.next, nextQuestion, { feedback: touchFeedback }),
  onTap(el.chooseTopics, () => showTopics(), { feedback: touchFeedback }),
);

el.tossBall.addEventListener('pointerdown', onBallDown);
el.tossBall.addEventListener('pointermove', onBallMove);
el.tossBall.addEventListener('pointerup', onBallUp);
el.tossBall.addEventListener('pointercancel', onBallCancel);
el.tossBall.addEventListener('click', (event) => {
  if (event.detail > 0 && performance.now() < suppressBallClickUntil) return;
  if (event.detail === 0) launchToss(520, -930);
});

el.microphone.addEventListener('pointerdown', onMicDown);
el.microphone.addEventListener('pointerup', onMicUp);
el.microphone.addEventListener('pointercancel', onMicCancel);
el.microphone.addEventListener('click', (event) => {
  if (event.detail > 0) return;
  if (state.shareState === 'recording' || state.shareState === 'requesting') void finishMicrophone({ cancelled: false });
  else void beginMicrophoneHold('keyboard');
});

function onWindowBlur() {
  if (screens.is('toss') && ['ready', 'flight', 'landing'].includes(state.tossPhase)) cancelToss();
  if (screens.is('question') && ['requesting', 'recording'].includes(state.shareState)) {
    if (micHold) micHold.down = false;
    void finishMicrophone({ cancelled: true });
  }
}

function onVisibilityChange() {
  if (!document.hidden) return;
  if (screens.is('question')) clearQuestionRecording();
  if (screens.is('toss')) cancelToss();
}

function onResize() {
  if (screens.is('toss') && state.tossPhase === 'ready' && activePointer === null) resetBall();
}

window.addEventListener('blur', onWindowBlur);
window.addEventListener('resize', onResize);
document.addEventListener('visibilitychange', onVisibilityChange);
globalDisposers.push(() => window.removeEventListener('blur', onWindowBlur));
globalDisposers.push(() => window.removeEventListener('resize', onResize));
globalDisposers.push(() => document.removeEventListener('visibilitychange', onVisibilityChange));

const onMotionChange = (event) => {
  state.reducedMotion = event.matches;
  if (state.reducedMotion && screens.is('toss') && state.tossPhase === 'flight') {
    cancelToss({ reset: false });
    revealQuestion();
  }
};
motionQuery.addEventListener?.('change', onMotionChange);
globalDisposers.push(() => motionQuery.removeEventListener?.('change', onMotionChange));

globalDisposers.push(installKioskGuards());
globalDisposers.push(installUnlockOnGesture({
  extra: [bgm.unlock],
  onFirst() {
    state.firstGesture = true;
    bgm.setVolume(config.music.volume);
    bgm.play(config.music.src, { key: config.music.key, fadeInMs: 900, loopFadeOutMs: 2400 });
    if (screens.is('splash')) void speakKey('welcome', fallbackLines.welcome);
  },
}));

void preloadImages(Object.values(config.assets), { idle: true });

const ready = Promise.resolve(true);
const disposeDebug = installDebug({
  gameId: config.id,
  engine: 'custom-question-ball',
  ready,
  listModes: () => config.packs.map(({ id, title, skill }) => ({ id, title, skill })),
  startMode: (id) => startPack(id),
  getState,
  getTargets: () => collectTargets(root),
  tap: tapTarget,
  winRound: debugWinRound,
  mute: setMuted,
  home: () => showSplash({ speak: false }),
  timers,
  voice,
  sfx,
  onSeed(nextRng, seed) {
    rng = nextRng;
    rngSeed = seed;
    decks.clear();
    lastPromptByPack.clear();
    promptHistory = [];
  },
  toss: (vx, vy) => launchToss(vx, vy),
  reveal: revealQuestion,
  startShare: () => beginMicrophoneHold('debug'),
  finishShare: debugFinishShare,
  nextQuestion,
  getAudioLog: voice.getAudioLog,
  clearAudioLog: voice.clearAudioLog,
  clearSaved,
  getLayout,
});
globalDisposers.push(disposeDebug);

window.addEventListener('pagehide', () => {
  for (const dispose of globalDisposers.splice(0)) {
    try { dispose?.(); } catch { /* page is leaving */ }
  }
  screens.destroy();
  timers.clearAll();
  nudger.stop();
  cancelToss({ reset: false });
  clearQuestionRecording();
  voice.stop();
  speech.stop();
  bgm.stop({ fadeOutMs: 0 });
}, { once: true });
