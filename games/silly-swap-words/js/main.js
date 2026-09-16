import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as bgm from '../../../shared/js/bgm.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import * as content from '../../../shared/js/content.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { createScreens } from '../../../shared/js/screens.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { onTap } from '../../../shared/js/tap.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createTimers } from '../../../shared/js/timers.js';
import { tada } from '../../../shared/js/celebrate.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';

const $ = (id) => document.getElementById(id);
const root = $('game');
const els = {
  loading: $('loading'),
  splashHud: $('splash-hud'),
  playHud: $('play-hud'),
  rewardHud: $('reward-hud'),
  prompt: $('prompt-text'),
  progress: $('progress'),
  targetPeek: $('target-peek'),
  objectWrap: $('object-wrap'),
  wordObject: $('word-object'),
  sillyCard: $('silly-card'),
  sparkles: $('clay-sparkles'),
  slots: [...document.querySelectorAll('.letter-slot')],
  magic: $('magic-swap'),
  feedback: $('feedback'),
  rewardObject: $('reward-object'),
  rewardWord: $('reward-word'),
  rewardCopy: $('reward-copy'),
  rewardKicker: $('reward-kicker'),
  confetti: $('confetti-host'),
  again: $('play-again'),
  choose: $('choose-mode'),
};

const timers = createTimers();
const knownWords = new Set(Object.keys(config.words));
const modeIds = Object.keys(config.modes);
let rng = mulberry32(42);
let confettiDispose = null;

const state = {
  screen: 'splash',
  mode: null,
  round: 0,
  step: 0,
  chainIndex: 0,
  word: 'cat',
  target: null,
  activeSlot: null,
  candidateIndex: 0,
  discoveries: 0,
  completed: 0,
  lastRealWord: 'cat',
  awaitingInput: false,
  muted: false,
  seed: 42,
  actionToken: 0,
  session: 0,
  lastPromptKey: 'welcome',
  lastPromptText: config.voice.welcome,
};

const narrator = createNarrator({
  say: (key, text) => bgm.duckDuring(voiceClips.say(key, text), { down: .18, downMs: 100, upMs: 300 }),
  stop: () => voiceClips.stop(),
  announcerParent: root,
});

const screens = createScreens({
  root,
  initial: 'splash',
  voice: narrator,
  onExit() {
    timers.clearAll();
    nudger.stop();
    state.actionToken += 1;
    if (confettiDispose) { confettiDispose(); confettiDispose = null; }
  },
});

const nudger = createNudger({
  first: 10500,
  repeat: 10000,
  onNudge(count) {
    if (state.screen !== 'play' || !state.awaitingInput) return;
    const key = count % 2 ? 'nudge2' : 'nudge1';
    const text = config.voice[key];
    if (state.activeSlot != null) pulseSlot(state.activeSlot);
    setFeedback(text);
    speak(key, text);
  },
});

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wordPath(word) {
  return config.words[word] || config.assets.sillyBlob;
}

function differingSlot(a, b) {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return i;
  return null;
}

function setScreen(name) {
  state.screen = name;
  screens.show(name, { force: screens.current === name });
}

function setFeedback(text = '') {
  els.feedback.textContent = text;
}

function speak(key, text = config.voice[key]) {
  state.lastPromptKey = key;
  state.lastPromptText = text || '';
  return narrator.say(key, text);
}

function pronounceWord(word) {
  const file = knownWords.has(word) ? content.wordAudio(word) : null;
  const promise = file
    ? voiceClips.sayFile(file, word)
    : voiceClips.say(`invented-${word}`, word.split('').join(' '));
  return bgm.duckDuring(promise, { down: .18, downMs: 80, upMs: 250 });
}

function sayLetter(letter) {
  return bgm.duckDuring(
    voiceClips.sayFile(content.letterSoundUrl(letter), letter),
    { down: .18, downMs: 60, upMs: 220 },
  );
}

function replayPrompt() {
  if (state.screen === 'splash') return speak('welcome', config.voice.welcome);
  if (state.screen === 'reward') return speak('modeComplete', config.voice.modeComplete);
  return speak(state.lastPromptKey, state.lastPromptText);
}

function setMuted(on) {
  state.muted = Boolean(on);
  narrator.setMuted(state.muted);
  voiceClips.setMuted(state.muted);
  sfx.setMuted(state.muted);
  bgm.setMuted(state.muted);
  root.classList.toggle('is-muted', state.muted);
  return state.muted;
}

function showSplash({ greet = false } = {}) {
  state.mode = null;
  state.awaitingInput = false;
  setScreen('splash');
  if (greet) speak('welcome', config.voice.welcome);
}

function addHud() {
  const home = hudButton('home', () => { window.location.href = '../../'; }, { label: 'QLOBE Kids home' });
  home.dataset.target = 'home';
  home.dataset.role = 'navigation';
  const splashSound = hudButton('sound', soundDebounce(replayPrompt), { label: 'Hear welcome again' });
  splashSound.dataset.target = 'splash-sound';
  splashSound.dataset.role = 'audio';
  els.splashHud.append(home, splashSound);

  const back = hudButton('back', () => showSplash({ greet: false }), { label: 'Back to mode choices' });
  back.dataset.target = 'back';
  back.dataset.role = 'navigation';
  const playSound = hudButton('sound', soundDebounce(replayPrompt), { label: 'Hear the clue again' });
  playSound.dataset.target = 'sound';
  playSound.dataset.role = 'audio';
  els.playHud.append(back, playSound);

  const rewardBack = hudButton('back', () => showSplash({ greet: false }), { label: 'Back to mode choices' });
  rewardBack.dataset.target = 'reward-back';
  rewardBack.dataset.role = 'navigation';
  const rewardSound = hudButton('sound', soundDebounce(replayPrompt), { label: 'Hear the celebration again' });
  rewardSound.dataset.target = 'reward-sound';
  rewardSound.dataset.role = 'audio';
  els.rewardHud.append(rewardBack, rewardSound);
}

function setPrompt(key, text) {
  els.prompt.textContent = text;
  state.lastPromptKey = key;
  state.lastPromptText = text;
}

function renderProgress(total, done) {
  els.progress.replaceChildren();
  for (let i = 0; i < total; i += 1) {
    const dot = document.createElement('i');
    dot.className = 'progress-dot';
    if (i < done) dot.classList.add('done');
    else if (i === done) dot.classList.add('now');
    els.progress.append(dot);
  }
}

function renderObject(word, { animate = false } = {}) {
  const isReal = knownWords.has(word);
  els.wordObject.hidden = !isReal;
  els.sillyCard.hidden = isReal;
  if (isReal) {
    els.wordObject.src = wordPath(word);
    els.wordObject.alt = '';
    state.lastRealWord = word;
  }
  if (animate) {
    els.objectWrap.classList.remove('swapping');
    void els.objectWrap.offsetWidth;
    els.objectWrap.classList.add('swapping');
    timers.after(680, () => els.objectWrap.classList.remove('swapping'));
  }
}

function renderLetters(changedSlot = null) {
  els.slots.forEach((slot, i) => {
    slot.querySelector('span').textContent = state.word[i];
    slot.setAttribute('aria-label', `${['First', 'Middle', 'Last'][i]} letter ${state.word[i]}`);
    slot.classList.toggle('active', state.mode !== 'lab' && i === state.activeSlot);
    slot.dataset.role = state.mode === 'lab' || i === state.activeSlot ? 'answer' : 'distractor';
    if (i === changedSlot) {
      slot.classList.remove('changed');
      void slot.offsetWidth;
      slot.classList.add('changed');
      timers.after(600, () => slot.classList.remove('changed'));
    }
  });
}

function renderRound({ changedSlot = null, animate = false } = {}) {
  renderLetters(changedSlot);
  renderObject(state.word, { animate });
  setFeedback('');

  if (state.mode === 'swap') {
    const rounds = config.modes.swap.rounds;
    const round = rounds[state.round];
    setPrompt(`swap${state.round + 1}`, round.prompt);
    els.targetPeek.innerHTML = `Make <b>${state.target.toUpperCase()}</b>`;
    renderProgress(rounds.length, state.round);
  } else if (state.mode === 'trail') {
    const chain = config.modes.trail.chains[state.chainIndex];
    const key = `trail${state.target[0].toUpperCase()}${state.target.slice(1)}`;
    setPrompt(key, config.voice[key]);
    els.targetPeek.innerHTML = `Next step <b>${state.target.toUpperCase()}</b>`;
    renderProgress(chain.length - 1, state.step);
  } else {
    setPrompt('labPrompt', config.voice.labPrompt);
    els.targetPeek.innerHTML = state.discoveries ? `<b>${state.discoveries}</b> discoveries` : 'Mix anything!';
    renderProgress(8, state.discoveries);
  }
}

function setupMode(mode) {
  state.mode = mode;
  state.round = 0;
  state.step = 0;
  state.discoveries = 0;
  state.completed = 0;
  state.candidateIndex = 0;
  state.session += 1;

  if (mode === 'swap') {
    const round = config.modes.swap.rounds[0];
    state.word = round.from;
    state.target = round.to;
    state.activeSlot = round.slot;
  } else if (mode === 'trail') {
    state.chainIndex = (state.seed + state.session) % config.modes.trail.chains.length;
    const chain = config.modes.trail.chains[state.chainIndex];
    state.word = chain[0];
    state.target = chain[1];
    state.activeSlot = differingSlot(state.word, state.target);
  } else {
    const starts = config.modes.lab.startingWords;
    state.word = starts[(state.seed + state.session) % starts.length];
    state.target = null;
    state.activeSlot = null;
  }
}

async function startMode(mode) {
  if (!modeIds.includes(mode)) return false;
  return screens.start(async () => {
    await ready;
    setupMode(mode);
    setScreen('play');
    bgm.play(config.music, { key: 'silly-swap-words', fadeInMs: 700, loopFadeOutMs: 1800 });
    renderRound();
    state.awaitingInput = true;
    nudger.arm();
    const introKey = mode === 'swap' ? 'swapIntro' : mode === 'trail' ? 'trailIntro' : 'labIntro';
    narrator.saySequence([
      { key: introKey, text: config.voice[introKey] },
      { key: state.lastPromptKey, text: state.lastPromptText, gap: 140 },
    ]);
    return true;
  }, { busy: false });
}

function pulseSlot(index) {
  const slot = els.slots[index];
  if (!slot) return;
  slot.classList.remove('wrong');
  void slot.offsetWidth;
  slot.classList.add('wrong');
  timers.after(450, () => slot.classList.remove('wrong'));
}

function popSparkles() {
  els.sparkles.classList.remove('pop');
  void els.sparkles.offsetWidth;
  els.sparkles.classList.add('pop');
  timers.after(720, () => els.sparkles.classList.remove('pop'));
}

async function morphWord(nextWord, slot, { sillyLine = true } = {}) {
  const mine = ++state.actionToken;
  state.awaitingInput = false;
  nudger.stop();
  const nextLetter = nextWord[slot];
  const letterPromise = sayLetter(nextLetter);
  try { sfx.pop(); } catch { /* sound is optional */ }
  await timers.wait(120);
  if (mine !== state.actionToken || state.screen !== 'play') return false;
  state.word = nextWord;
  renderLetters(slot);
  renderObject(nextWord, { animate: true });
  popSparkles();
  await letterPromise;
  if (mine !== state.actionToken || state.screen !== 'play') return false;
  if (knownWords.has(nextWord)) {
    await pronounceWord(nextWord);
  } else {
    await pronounceWord(nextWord);
    if (sillyLine) await speak('sillyWord', config.voice.sillyWord);
  }
  return mine === state.actionToken && state.screen === 'play';
}

async function attemptGuided(slot, { forceTarget = false } = {}) {
  if (slot !== state.activeSlot) {
    try { sfx.boing(); } catch { /* optional */ }
    pulseSlot(slot);
    setFeedback('That sound is staying put. Try the glowing one!');
    speak('nudge1', config.voice.nudge1);
    return false;
  }

  const round = config.modes.swap.rounds[state.round];
  const candidate = forceTarget
    ? state.target[state.activeSlot]
    : round.candidates[Math.min(state.candidateIndex, round.candidates.length - 1)];
  state.candidateIndex += 1;
  const nextWord = `${state.word.slice(0, slot)}${candidate}${state.word.slice(slot + 1)}`;
  const alive = await morphWord(nextWord, slot);
  if (!alive) return false;

  if (nextWord !== state.target) {
    setFeedback(`${nextWord.toUpperCase()} is a real word too! Keep swapping…`);
    try { sfx.sparkle(); } catch { /* optional */ }
    state.awaitingInput = true;
    nudger.arm();
    return true;
  }

  state.completed += 1;
  setFeedback(`${round.from.toUpperCase()} → ${state.target.toUpperCase()}! One sound changed it.`);
  els.objectWrap.classList.add('celebrating');
  timers.after(720, () => els.objectWrap.classList.remove('celebrating'));
  try { sfx.sparkle(); } catch { /* optional */ }
  await speak('targetFound', config.voice.targetFound);
  await timers.wait(520);
  if (state.round >= config.modes.swap.rounds.length - 1) {
    showReward();
    return true;
  }
  state.round += 1;
  state.candidateIndex = 0;
  const next = config.modes.swap.rounds[state.round];
  state.word = next.from;
  state.target = next.to;
  state.activeSlot = next.slot;
  renderRound({ animate: true });
  state.awaitingInput = true;
  nudger.arm();
  speak(state.lastPromptKey, state.lastPromptText);
  return true;
}

async function attemptTrail(slot, { forceTarget = false } = {}) {
  if (slot !== state.activeSlot) {
    try { sfx.boing(); } catch { /* optional */ }
    pulseSlot(slot);
    setFeedback('Almost! Only one stepping-stone sound changes.');
    speak('nudge1', config.voice.nudge1);
    return false;
  }
  const nextWord = forceTarget ? state.target : state.target;
  const before = state.word;
  const alive = await morphWord(nextWord, slot);
  if (!alive) return false;
  state.completed += 1;
  state.step += 1;
  setFeedback(`${before.toUpperCase()} → ${nextWord.toUpperCase()}. Trail step found!`);
  try { sfx.sparkle(); } catch { /* optional */ }
  const chain = config.modes.trail.chains[state.chainIndex];
  if (state.step >= chain.length - 1) {
    await speak('trailComplete', config.voice.trailComplete);
    showReward();
    return true;
  }
  state.target = chain[state.step + 1];
  state.activeSlot = differingSlot(state.word, state.target);
  renderRound();
  state.awaitingInput = true;
  nudger.arm();
  speak(state.lastPromptKey, state.lastPromptText);
  return true;
}

function nextLabWord(slot) {
  const wheel = config.modes.lab.letterWheels[String(slot)];
  const current = state.word[slot];
  const index = Math.max(0, wheel.indexOf(current));
  const letter = wheel[(index + 1) % wheel.length];
  return `${state.word.slice(0, slot)}${letter}${state.word.slice(slot + 1)}`;
}

async function attemptLab(slot, forcedWord = null) {
  const before = state.word;
  const nextWord = forcedWord || nextLabWord(slot);
  const alive = await morphWord(nextWord, slot);
  if (!alive) return false;
  state.discoveries += 1;
  if (knownWords.has(nextWord)) {
    setFeedback(`${before.toUpperCase()} → ${nextWord.toUpperCase()}. A real word popped out!`);
    try { sfx.sparkle(); } catch { /* optional */ }
  } else {
    setFeedback(`${nextWord.toUpperCase()}! A brand-new silly word.`);
    try { sfx.silly(); } catch { /* optional */ }
  }
  renderProgress(8, state.discoveries);
  els.targetPeek.innerHTML = `<b>${state.discoveries}</b> discoveries`;
  if (state.discoveries >= 8) {
    await timers.wait(420);
    showReward();
    return true;
  }
  state.awaitingInput = true;
  nudger.arm();
  return true;
}

async function handleLetter(slot) {
  if (!state.awaitingInput || state.screen !== 'play') return false;
  nudger.poke();
  if (state.mode === 'swap') return attemptGuided(slot);
  if (state.mode === 'trail') return attemptTrail(slot);
  return attemptLab(slot);
}

function oneAwayWords(word) {
  return [...knownWords].filter((candidate) => (
    candidate.length === 3
    && candidate !== word
    && [...candidate].filter((letter, i) => letter !== word[i]).length === 1
  ));
}

async function magicSwap() {
  if (!state.awaitingInput || state.screen !== 'play') return false;
  try { sfx.whoosh(); } catch { /* optional */ }
  els.magic.animate(
    [{ transform: 'rotate(0) scale(1)' }, { transform: 'rotate(15deg) scale(1.08)' }, { transform: 'rotate(-8deg) scale(.96)' }, { transform: 'rotate(0) scale(1)' }],
    { duration: timers.ms(520), easing: 'ease-out' },
  );
  if (state.mode === 'swap') return attemptGuided(state.activeSlot);
  if (state.mode === 'trail') return attemptTrail(state.activeSlot);

  const neighbors = oneAwayWords(state.word);
  if (neighbors.length) {
    const next = neighbors[Math.floor(rng() * neighbors.length)];
    return attemptLab(differingSlot(state.word, next), next);
  }
  const slot = Math.floor(rng() * 3);
  return attemptLab(slot);
}

function showReward() {
  state.awaitingInput = false;
  nudger.stop();
  setScreen('reward');
  const real = knownWords.has(state.word);
  els.rewardObject.src = real ? wordPath(state.word) : config.assets.sillyBlob;
  els.rewardWord.textContent = state.word.toUpperCase();
  if (state.mode === 'trail') {
    els.rewardKicker.textContent = 'TRAIL BLAZER!';
    els.rewardCopy.textContent = 'You changed one tiny sound at every step!';
  } else if (state.mode === 'lab') {
    els.rewardKicker.textContent = 'SILLY GENIUS!';
    els.rewardCopy.textContent = `${state.discoveries} word discoveries — real and wonderfully silly!`;
  } else {
    els.rewardKicker.textContent = 'WORD WIZARD!';
    els.rewardCopy.textContent = 'You made a whole parade of words, one sound at a time!';
  }
  confettiDispose = tada({ host: els.confetti, count: 46, duration: 2600, rng });
  speak('modeComplete', config.voice.modeComplete);
}

async function debugWinRound() {
  if (state.screen !== 'play') return false;
  if (state.mode === 'swap') return attemptGuided(state.activeSlot, { forceTarget: true });
  if (state.mode === 'trail') return attemptTrail(state.activeSlot, { forceTarget: true });
  const neighbors = oneAwayWords(state.word);
  if (neighbors.length) return attemptLab(differingSlot(state.word, neighbors[0]), neighbors[0]);
  return attemptLab(0);
}

function wireInteractions() {
  document.querySelectorAll('.mode-card').forEach((card) => {
    onTap(card, () => startMode(card.dataset.mode), { feedback: () => { try { sfx.pop(); } catch { /* optional */ } } });
  });
  els.slots.forEach((slot) => {
    onTap(slot, () => handleLetter(Number(slot.dataset.slot)), { feedback: () => { try { sfx.tick(); } catch { /* optional */ } } });
  });
  onTap(els.magic, magicSwap, { feedback: () => { try { sfx.tick(); } catch { /* optional */ } } });
  onTap(els.again, () => startMode(state.mode), { feedback: () => { try { sfx.pop(); } catch { /* optional */ } } });
  onTap(els.choose, () => showSplash({ greet: false }), { feedback: () => { try { sfx.tick(); } catch { /* optional */ } } });
}

const imageUrls = [
  config.assets.background,
  config.assets.title,
  config.assets.letterWell,
  config.assets.promptPlaque,
  config.assets.modeSwap,
  config.assets.modeTrail,
  config.assets.modeLab,
  config.assets.magicSwap,
  config.assets.successRibbon,
  config.assets.actionPill,
  config.assets.actionPillBlue,
  config.assets.claySparkles,
  config.assets.sillyBlob,
  ...Object.values(config.words),
];

bgm.preload(config.music);

const ready = Promise.all([
  preloadImages(imageUrls),
  voiceClips.init('./assets/audio/manifest.json', './data/lines.json', config.voice),
  content.ready(),
]).then(() => {
  bgm.setVolume(.13);
  els.loading.classList.add('ready');
  return true;
});

addHud();
wireInteractions();
installKioskGuards();
installUnlockOnGesture({ extra: [bgm.unlock] });

installDebug({
  gameId: config.id,
  engine: 'custom-dom',
  ready,
  listModes: () => modeIds.map((id) => ({ id, title: config.modes[id].title })),
  startMode,
  getState: () => ({
    screen: state.screen,
    mode: state.mode,
    round: state.round,
    step: state.step,
    chainIndex: state.chainIndex,
    word: state.word,
    target: state.target,
    activeSlot: state.activeSlot,
    discoveries: state.discoveries,
    completed: state.completed,
    awaitingInput: state.awaitingInput,
    muted: state.muted,
    seed: state.seed,
    pendingTimers: timers.size(),
  }),
  getTargets: () => collectTargets(root),
  tap: async (id) => {
    const target = root.querySelector(`[data-target="${CSS.escape(String(id))}"]`);
    if (!target) return false;
    target.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return true;
  },
  winRound: debugWinRound,
  home: () => showSplash({ greet: false }),
  back: () => showSplash({ greet: false }),
  mute: setMuted,
  seed: (n = 42) => {
    state.seed = Number(n) >>> 0;
    rng = mulberry32(state.seed);
    return state.seed;
  },
  fastTimers: (scale = .05) => {
    const value = Number(scale);
    const multiplier = Number.isFinite(value) && value > 1 ? 1 / value : Math.max(.01, Math.min(1, value || .05));
    timers.setScale(1 / multiplier);
    return multiplier;
  },
  timers,
  narrator,
  voice: voiceClips,
  sfx,
  getAudioLog: () => voiceClips.getAudioLog(),
  clearAudioLog: () => voiceClips.clearAudioLog(),
  getBgmStats: () => bgm.stats(),
  magicSwap,
  setWord: async (word) => {
    if (state.mode !== 'lab' || typeof word !== 'string' || word.length !== 3) return false;
    const differences = [...word.toLowerCase()].filter((letter, index) => letter !== state.word[index]);
    if (differences.length !== 1) return false;
    const slot = differingSlot(state.word, word.toLowerCase());
    return attemptLab(slot, word.toLowerCase());
  },
});

ready.catch(() => els.loading.classList.add('ready'));
