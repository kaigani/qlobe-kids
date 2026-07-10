// main.js — boot Lunchbox Pack: load data, unlock audio on the first gesture,
// route splash ⇄ game ⇄ end screen, wire the HUD, expose window.LUNCH.

import * as sfx from '../../../shared/js/sfx.js';
import * as speech from '../../../shared/js/speech.js';
import { onTap } from '../../../shared/js/tap.js';
import * as voice from './voice.js';
import { Game } from './game.js';
import { initConfetti, clearConfetti } from './confetti.js';

const els = {
  splash: document.getElementById('splash'),
  game: document.getElementById('game'),
  endScreen: document.getElementById('end-screen'),
  btnHome: document.getElementById('btn-home'),
  btnSound: document.getElementById('btn-sound'),
  btnReplay: document.getElementById('btn-replay'),
  btnMenu: document.getElementById('btn-menu'),
  confetti: document.getElementById('confetti-canvas'),
};

let data = null;
let game = null;
let currentMode = null;
let starting = false;
let audioUnlocked = false;

initConfetti(els.confetti);

// data + voice manifest load at boot (voice.init resolves even on 404 — the
// recorded clips are optional and speech.js covers every line).
const dataReady = (async () => {
  await voice.init('./assets/audio/manifest.json', './data/lines.json');
  const res = await fetch('./data/foods.json');
  data = await res.json();
})();

// ---- audio unlock on first gesture ------------------------------------

function unlockAudio() {
  // voice.unlock() is self-limiting and stays armed until the clip manifest
  // has loaded, so it runs on every gesture (not just the first) — otherwise
  // recorded teacher voice can fail on iPad and fall back to Web Speech.
  voice.unlock();
  if (audioUnlocked) return;
  audioUnlocked = true;
  sfx.unlock();
  speech.unlock();
}
window.addEventListener('pointerdown', unlockAudio);

// ---- screen routing -----------------------------------------------------

function showSplash() {
  if (game) {
    game.destroy();
    game = null;
  }
  starting = false;
  voice.stop();
  clearConfetti();
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
  clearConfetti();
  els.splash.classList.add('hidden');
  els.endScreen.classList.add('hidden');
  els.game.classList.remove('hidden');
  game = new Game(mode, data);
  game.start();
  starting = false;
}

// splash mode buttons — feedback and action share one press path (onTap), so
// a touch can't tick on pointerdown and then drop the action with the click
els.splash.querySelectorAll('.mode-button').forEach((btn) => {
  onTap(btn, () => startMode(btn.dataset.mode), {
    feedback: (e) => {
      e.preventDefault();
      unlockAudio();
      sfx.tick();
    },
  });
});

// ---- HUD -----------------------------------------------------------------

onTap(els.btnHome, () => {
  sfx.tick();
  showSplash();
});

let lastReplay = 0;
onTap(els.btnSound, () => {
  const now = performance.now();
  if (now - lastReplay < 600) return; // debounce
  lastReplay = now;
  sfx.tick();
  if (game) game.replayRequest();
});

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

// ---- debug hook (REQUIRED for automated QA — mirrors sound-sprouts) ------
// window.LUNCH.state() → { screen, mode, character, requests, currentRequest,
// packed, stars, ... }; window.LUNCH.pack(foodId) attempts a pack through the
// exact same code path as a drag-drop. Read-only otherwise.

window.LUNCH = {
  state: () => {
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
  },
  pack: (foodId) => (game ? game.attemptPack(foodId) : { ok: false, reason: 'no-game' }),
};

// ---- iPad niceties --------------------------------------------------------

window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    try {
      window.speechSynthesis && window.speechSynthesis.resume();
    } catch {
      /* ignore */
    }
  }
});
