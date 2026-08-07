// main.js — boot Lunchbox Pack: load data, unlock audio on the first gesture,
// route splash ⇄ game ⇄ end screen, wire the HUD, and install the platform
// window.QLOBE_DEBUG v1 contract (see docs/shared-platform-refactor.md).
//
// LIVE BUG FIX: this game used to expose a bespoke window.LUNCH instead of
// QLOBE_DEBUG, which made it invisible to every QA driver on the platform.
// The LUNCH-specific helpers (`state()`, `pack(foodId)`) still exist, as
// extra keys on the SAME QLOBE_DEBUG hook, for anything still reaching for
// them by their old names.

import * as sfx from '../../../shared/js/sfx.js';
import { onTap } from '../../../shared/js/tap.js';
import { soundDebounce } from '../../../shared/js/hud.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { renderModeCards } from '../../../shared/js/mode-select.js';
import * as voice from './voice.js';
import { Game } from './game.js';

// No engine config.modes here — the splash's three modes are fixed, so the
// same {id,title} data installDebug()'s listModes already used is promoted
// to a real local array renderModeCards() can render from.
const MODES = [
  { id: 'pack', title: 'Pack for Me!', emoji: '🎒' },
  { id: 'healthy', title: 'Healthy Helper', emoji: '🥗' },
  { id: 'count', title: 'Count & Pack', emoji: '🔢' },
];

const els = {
  splash: document.getElementById('splash'),
  game: document.getElementById('game'),
  endScreen: document.getElementById('end-screen'),
  btnHome: document.getElementById('btn-home'),
  btnSound: document.getElementById('btn-sound'),
  btnReplay: document.getElementById('btn-replay'),
  btnMenu: document.getElementById('btn-menu'),
};

let data = null;
let game = null;
let currentMode = null;
let starting = false;

// data + voice manifest load at boot (voice.init resolves even on 404 — the
// recorded clips are optional and speech.js covers every line).
const dataReady = (async () => {
  await voice.init('./assets/audio/manifest.json', './data/lines.json');
  const res = await fetch('./data/foods.json');
  data = await res.json();
})();

// ---- audio unlock on the first gesture -------------------------------------

// voice.unlock() (this game's recorded-clip channel) is self-limiting and
// stays armed until the clip channel has actually played, so it runs on
// EVERY gesture rather than only while the shared unlock latch is open —
// otherwise a first attempt the browser refuses is never retried and
// recorded teacher voice falls back to Web Speech for the rest of the
// session. installUnlockOnGesture's own `extra` fan-out only fires while its
// latch is open, so this stays a separate, always-on listener.
window.addEventListener('pointerdown', () => voice.unlock(), { passive: true });

installUnlockOnGesture({});

// ---- screen routing ---------------------------------------------------------

function showSplash() {
  if (game) {
    game.destroy();
    game = null;
  }
  starting = false;
  voice.stop();
  els.endScreen.classList.add('hidden');
  els.game.classList.add('hidden');
  els.splash.classList.remove('hidden');
}

async function startMode(mode) {
  if (starting) return;
  starting = true;
  await dataReady;
  if (game) {
    game.destroy();
    game = null;
  }
  currentMode = mode;
  voice.stop();
  els.splash.classList.add('hidden');
  els.endScreen.classList.add('hidden');
  els.game.classList.remove('hidden');
  game = new Game(mode, data);
  // A seed set on the splash (before this mode's Game existed) has to reach
  // the instance being built now, not just one that already existed when
  // seed() was called.
  if (seedRng) game.rng = seedRng;
  game.start();
  starting = false;
}

// splash mode buttons — feedback and action share one press path (onTap), so
// a touch can't tick on pointerdown and then drop the action with the click
renderModeCards({
  host: document.querySelector('.splash-buttons'),
  modes: MODES,
  skin: false, // .mode-button keeps its own pixel-for-pixel look; only the
               // shared .qk-mode-card touch-floor contract is added (a
               // no-op — .mode-button's own size already clears it).
  cardClass: 'mode-button',
  showTitle: false, // decorate() builds the emoji span + text itself,
                     // matching the original markup's bare-text-node shape
  decorate(btn, mode) {
    const emoji = document.createElement('span');
    emoji.className = 'mode-emoji';
    emoji.textContent = mode.emoji;
    btn.append(emoji, ` ${mode.title}`);
  },
  onPick: (id) => startMode(id),
  feedback: (e) => {
    e.preventDefault();
    sfx.tick();
  },
});

// ---- HUD ---------------------------------------------------------------------

onTap(els.btnHome, () => {
  sfx.tick();
  showSplash();
});

// soundDebounce: the hand-rolled 600ms replay guard this used to carry by
// hand, swallowing presses inside 600ms so rapid taps can't stack.
onTap(els.btnSound, soundDebounce(() => {
  sfx.tick();
  if (game) game.replayRequest();
}));

// end-screen buttons
onTap(els.btnReplay, () => {
  sfx.tick();
  if (currentMode) startMode(currentMode);
});
onTap(els.btnMenu, () => {
  sfx.tick();
  showSplash();
});

for (const el of [els.btnHome, els.btnSound, els.btnReplay, els.btnMenu]) {
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
}

// ---- window.QLOBE_DEBUG v1 (review automation depends on this) -------------

// `seedRng` outlives any one Game: seed(42) is normally called BEFORE
// startMode(), and the generator has to survive into the instance that mode
// creates or the run is not reproducible after all.
let seedRng = null;

function currentState() {
  if (!game) {
    return {
      screen: 'splash',
      mode: null,
      phase: null,
      character: null,
      requests: [],
      currentRequest: null,
      packed: [],
      shelf: [],
      stars: 0,
    };
  }
  return game.debugState();
}

installDebug({
  gameId: 'lunchbox-pack',
  ready: dataReady,
  listModes: () => [
    { id: 'pack', title: 'Pack for Me!' },
    { id: 'healthy', title: 'Healthy Helper' },
    { id: 'count', title: 'Count & Pack' },
  ],
  startMode: async (id) => {
    await startMode(id);
    return game ? game.debugState() : null;
  },
  getState: currentState,
  getTargets: () => (game ? game.getTargets() : []),
  tap: async (id) => (game ? game.tap(id) : { ok: false, reason: 'no-game' }),
  winRound: async () => {
    if (game) await game.winRound();
    return currentState();
  },
  home: () => showSplash(),
  // channels the default mute() fans out to (reserved keys — never published)
  voice,
  sfx,
  // where the seeded generator lands — see requests.js / game.js `this.rng`
  onSeed: (rng) => { seedRng = rng; if (game) game.rng = rng; },
  // a ring buffer of what the game ASKED to say, oldest first — the one thing
  // that makes an audio bug reproducible from a driver that cannot hear
  getAudioLog: () => voice.getAudioLog(),
  // ---- LUNCH-specific extras, kept for anything still reaching for the old
  // window.LUNCH names directly ----
  state: currentState,
  pack: (foodId) => (game ? game.attemptPack(foodId) : { ok: false, reason: 'no-game' }),
});

// ---- iPad niceties ------------------------------------------------------------

// contextmenu + gesturestart; visibilitychange -> speechSynthesis.resume() is
// wired by installUnlockOnGesture above.
installKioskGuards();
