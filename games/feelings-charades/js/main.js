// main.js — boot Feelings Charades: audio unlock, splash ⇄ game ⇄ end
// routing (navigation rule: splash home → catalog; in-game back → splash),
// the talking Ravi host, and the QLOBE_DEBUG v1 hook.

import * as sfx from '../../../shared/js/sfx.js';
import * as speech from '../../../shared/js/speech.js';
import * as voice from '../../../shared/js/voice-clips.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTalkingMouth } from '../../../shared/js/stage/mouth.js';
import { Game, FEELINGS, DEFAULT_LINES } from './game.js';

const els = {
  splash: document.getElementById('splash'),
  game: document.getElementById('game'),
  endScreen: document.getElementById('end-screen'),
  hostPortrait: document.getElementById('host-portrait'),
  splashSound: document.getElementById('splash-sound'),
  btnBack: document.getElementById('btn-back'),
  btnSound: document.getElementById('btn-sound'),
  btnEndBack: document.getElementById('btn-end-back'),
  btnAgain: document.getElementById('btn-again'),
  endTitle: document.getElementById('end-title'),

  grid: document.getElementById('grid'),
  demo: document.getElementById('demo'),
  act: document.getElementById('act'),
  cope: document.getElementById('cope'),
  affirm: document.getElementById('affirm'),
  guess: document.getElementById('guess'),

  demoTitle: document.getElementById('demo-title'),
  demoVideo: document.getElementById('demo-video'),
  demoArt: document.getElementById('demo-art'),
  yourTurnBtn: document.getElementById('btn-your-turn'),
  actTitle: document.getElementById('act-title'),
  actRing: document.getElementById('act-ring'),
  actEmoji: document.getElementById('act-emoji'),
  actArt: document.getElementById('act-art'),
  actDone: document.getElementById('btn-act-done'),
  copeTitle: document.getElementById('cope-title'),
  copeCopyTitle: document.getElementById('cope-copy-title'),
  copeCopySub: document.getElementById('cope-copy-sub'),
  breathWrap: document.getElementById('breath-wrap'),
  breathSteps: document.getElementById('breath-steps'),
  breathLabel: document.getElementById('breath-label'),
  copeArtWrap: document.getElementById('cope-art-wrap'),
  copeArt: document.getElementById('cope-art'),
  copeDone: document.getElementById('btn-cope-done'),
  affirmText: document.getElementById('affirm-text'),
  affirmNext: document.getElementById('btn-affirm-next'),
  guessDots: document.getElementById('guess-dots'),
  guessArt: document.getElementById('guess-art'),
  guessAnswers: document.getElementById('guess-answers'),
  confetti: document.getElementById('confetti-layer'),
};

let game = null;
let currentMode = null;
let starting = false;
let audioUnlocked = false;
let fastTimersOn = false;

els.hostPortrait.src = '../../shared/characters/ravi/portrait.png';

// voice manifest loads at boot; falls back to DEFAULT_LINES + Web Speech
const dataReady = voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', DEFAULT_LINES);

// talking Ravi on the splash (viseme sync when timelines exist; safe no-op otherwise)
let mouth = null;
createTalkingMouth(els.hostPortrait, 'ravi', '../../shared/').then((m) => { mouth = m; });
voice.onClip((key, audioEl) => {
  if (key === 'intro' && mouth) {
    mouth.syncTo(audioEl, './assets/audio/intro.viseme.json');
  }
});

// ---- audio unlock on every gesture (voice.unlock is self-limiting) --------

function unlockAudio() {
  voice.unlock();
  if (audioUnlocked) return;
  audioUnlocked = true;
  sfx.unlock();
  speech.unlock();
}
window.addEventListener('pointerdown', unlockAudio);

// ---- routing ---------------------------------------------------------------

function showSplash() {
  if (game) { game.destroy(); game = null; }
  starting = false;
  voice.stop();
  els.endScreen.classList.add('hidden');
  els.game.classList.add('hidden');
  els.splash.classList.remove('hidden');
  voice.say('intro');
}

async function startMode(mode) {
  if (starting) return;
  starting = true;
  await dataReady;
  if (game) { game.destroy(); game = null; }
  currentMode = mode;
  voice.stop();
  els.splash.classList.add('hidden');
  els.endScreen.classList.add('hidden');
  els.game.classList.remove('hidden');
  game = new Game(mode, els, { onEnd: showEnd });
  if (fastTimersOn) game.timeScale = 0.02;
  game.start();
  starting = false;
}

function showEnd(kind) {
  if (game) { game.destroy(); game = null; }
  els.game.classList.add('hidden');
  els.endScreen.classList.remove('hidden');
  els.endTitle.textContent = kind === 'act'
    ? 'You are a feelings expert!'
    : 'You know your feelings!';
}

// splash mode buttons — one press path
els.splash.querySelectorAll('.mode-button').forEach((btn) => {
  onTap(btn, () => startMode(btn.dataset.mode), {
    feedback: (e) => { e.preventDefault(); unlockAudio(); sfx.tick(); },
  });
});

// in-game controls
onTap(els.btnBack, () => { sfx.tick(); showSplash(); });
onTap(els.btnEndBack, () => { sfx.tick(); showSplash(); });
onTap(els.btnAgain, () => { sfx.tick(); if (currentMode) startMode(currentMode); });

let lastReplay = 0;
onTap(els.btnSound, () => {
  const now = performance.now();
  if (now - lastReplay < 600) return;
  lastReplay = now;
  sfx.tick();
  if (game) game.replay();
});
onTap(els.splashSound, () => {
  sfx.tick();
  voice.say('intro');
});

// phase CTAs route through the game's real input paths
onTap(els.yourTurnBtn, () => { if (game) game.tap('your-turn'); });
onTap(els.actDone, () => { if (game) game.tap('act-done'); });
onTap(els.affirmNext, () => { if (game) game.tap('affirm-next'); });
onTap(els.copeDone, () => { if (game) game.tap('cope-done'); });

// ---- QLOBE_DEBUG v1 ---------------------------------------------------------

window.QLOBE_DEBUG = {
  version: 1,
  gameId: 'feelings-charades',
  engine: 'custom',
  ready: dataReady,
  listModes: () => [
    { id: 'act', title: 'Act It Out' },
    { id: 'guess', title: 'Guess the Feeling' },
  ],
  startMode: (id) => startMode(id),
  getState: () => {
    if (!els.splash.classList.contains('hidden')) {
      return { screen: 'splash', mode: null, phase: null, stars: 0, round: 0, roundsTotal: 0, awaitingInput: false };
    }
    if (!els.endScreen.classList.contains('hidden')) {
      return { screen: 'end', mode: currentMode, phase: null, stars: 0, round: 0, roundsTotal: 0, awaitingInput: false };
    }
    return game ? game.getState() : { screen: 'play', mode: currentMode, phase: null };
  },
  getTargets: () => (game ? game.getTargets() : []),
  tap: (id) => (game ? game.tap(id) : { accepted: false }),
  winRound: () => (game ? game.winRound() : Promise.resolve()),
  mute: () => { voice.stop(); speech.stop(); window.__qkMuted = true; },
  seed: () => {},
  fastTimers: () => {
    fastTimersOn = true;
    if (game) game.timeScale = 0.02;
  },
};

// ---- iPad niceties ----------------------------------------------------------

window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    try { window.speechSynthesis && window.speechSynthesis.resume(); } catch { /* ignore */ }
  }
});
