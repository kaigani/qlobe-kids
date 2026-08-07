// main.js — boot Feelings Charades: audio unlock, splash ⇄ game ⇄ end
// routing (navigation rule: splash home → catalog; in-game back → splash),
// the talking Ravi host, and the QLOBE_DEBUG v1 hook.

import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import { onTap } from '../../../shared/js/tap.js';
import { soundDebounce } from '../../../shared/js/hud.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createTalkingMouth } from '../../../shared/js/stage/mouth.js';
import { renderModeCards } from '../../../shared/js/mode-select.js';
import { Game, FEELINGS, DEFAULT_LINES } from './game.js';

// This game has no engine config.modes — the splash's two modes are fixed,
// so the same {id,title} pairs installDebug()'s listModes already used are
// promoted to a real local array renderModeCards() can render from.
const MODES = [
  { id: 'act', title: 'Act It Out', emoji: '🎭' },
  { id: 'guess', title: 'Guess the Feeling', emoji: '👂' },
];

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
let fastTimersOn = false;
// Outlives any one Game: seed(42) is normally called BEFORE startMode(), and
// the generator has to survive into the instance that mode creates or the
// run is not reproducible after all (see games/counting-treasure-cups).
let seedRng = null;

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

// ---- audio unlock on the first gesture --------------------------------------

// The shared first-gesture unlock: sfx/speech/voice-clips/audio fan-out, latch
// reopens on visibilitychange/pageshow (the iPad app-switch fix — this game
// never resumed speechSynthesis on foreground before, so a real bug fix rides
// along here too). No onFirst greeting: this game never speaks on load — the
// splash's own sound button and the mode buttons are the only ways a line
// starts, so there is nothing to defer.
installUnlockOnGesture();

// voice.unlock() stays armed until the clip channel has actually PLAYED, so it
// runs on every gesture rather than only while the shared latch is open —
// otherwise a first attempt the browser refuses is never retried and recorded
// voice falls back to Web Speech for the rest of the session (same pattern as
// games/counting-treasure-cups).
window.addEventListener('pointerdown', () => voice.unlock(), { passive: true });

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
  // A seed set on the splash has to reach the Game this mode is about to
  // build, not just one that already existed when seed() was called.
  if (seedRng) game.rng = seedRng;
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
renderModeCards({
  host: document.querySelector('.mode-buttons'),
  modes: MODES,
  skin: false, // .mode-button keeps its own pixel-for-pixel look; only the
               // shared .qk-mode-card touch-floor contract is added (a
               // no-op — .mode-button's own size already clears it).
  cardClass: 'mode-button',
  showTitle: false, // decorate() builds the emoji span + text itself,
                     // matching the original markup's bare-text-node shape
  decorate(btn, mode) {
    const emoji = document.createElement('span');
    emoji.setAttribute('aria-hidden', 'true');
    emoji.textContent = mode.emoji;
    btn.append(emoji, ` ${mode.title}`);
  },
  onPick: (id) => startMode(id),
  feedback: (e) => {
    // Unlock is the global first-gesture listener's job (installUnlockOnGesture
    // above) — it fires on this same pointerdown, before this feedback runs.
    e.preventDefault();
    sfx.tick();
  },
});

// in-game controls
onTap(els.btnBack, () => { sfx.tick(); showSplash(); });
onTap(els.btnEndBack, () => { sfx.tick(); showSplash(); });
onTap(els.btnAgain, () => { sfx.tick(); if (currentMode) startMode(currentMode); });

// soundDebounce: the hand-rolled 600ms replay guard, now the shared one.
onTap(els.btnSound, soundDebounce(() => {
  sfx.tick();
  if (game) game.replay();
}));
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

installDebug({
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
  home: () => showSplash(),
  // channels the default mute() fans out to (voice.stop()+speech cancel is what
  // the old hand-rolled mute() did; the default also mutes/unmutes, not just
  // silences once, and catches any stray <audio>/<video> element)
  voice,
  sfx,
  // Compress every timed beat so QA does not sit through the act-along ring,
  // the breathing cycles, or the encouragement waits. This game already has a
  // working timeScale, so its own fastTimers() replaces the timers.js default.
  fastTimers: () => {
    fastTimersOn = true;
    if (game) game.timeScale = 0.02;
    return 0.02;
  },
  // Where the seeded generator lands. No content in this game is drawn from
  // rng today (see the comment in game.js's constructor) — wired anyway so
  // seed(42) is not a silent no-op and a future shuffle has somewhere to plug
  // in, matching the contract other migrated games use.
  onSeed: (rng) => { seedRng = rng; if (game) game.rng = rng; },
});

// ---- iPad niceties ----------------------------------------------------------

// contextmenu + gesturestart; visibilitychange -> speechSynthesis.resume() is
// wired by installUnlockOnGesture above (a live bug fix: this game never
// resumed speech on foreground before, so an iPad app-switch could leave it
// silent for the rest of the session).
installKioskGuards();
