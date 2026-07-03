// main.js — boot the scene, unlock audio on first gesture, route between the
// menu and an active Game, and wire the DOM HUD + canvas pointer input.

import { initScene } from './scene.js';
import { Game } from './game.js';
import * as speech from '../../../shared/js/speech.js';
import * as audio from '../../../shared/js/audio.js';
import * as sfx from '../../../shared/js/sfx.js';

const canvas = document.getElementById('scene');
const menu = document.getElementById('menu');
const hudRoot = document.getElementById('hud');

const hud = {
  btnHome: document.getElementById('btn-home'),
  btnSpeaker: document.getElementById('btn-speaker'),
  btnShuffle: document.getElementById('btn-shuffle'),
  btnAgain: document.getElementById('btn-again'),
  gardenRow: document.getElementById('garden-row'),
};

let game = null;
let audioUnlocked = false;
let starting = false; // guards against rapid menu taps spawning multiple games

// Wait for the font so canvas-texture letters render in Fredoka (if available).
// We never block forever — fonts.ready resolves even when the file is missing
// (it just falls back to the system stack defined in CSS / our font lists).
function ready() {
  if (document.fonts && document.fonts.ready) {
    return document.fonts.ready.catch(() => {});
  }
  return Promise.resolve();
}

ready().then(() => {
  initScene(canvas);
});

// Kick off manifest loading at boot (non-blocking — fallbacks cover the gap).
audio.ready.catch(() => {});

// ---- audio unlock on first gesture -----------------------------------

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  sfx.unlock();
  speech.unlock();
  audio.unlock();
}
// any first interaction unlocks
window.addEventListener('pointerdown', unlockAudio, { once: false });

// ---- screen routing --------------------------------------------------

function showMenu() {
  if (game) {
    game.destroy();
    game = null;
  }
  starting = false;
  speech.stop();
  audio.stop();
  menu.classList.remove('hidden');
  hudRoot.classList.add('hidden');
}

function startMode(mode) {
  if (starting || game) return; // one game at a time
  starting = true;
  menu.classList.add('hidden');
  hudRoot.classList.remove('hidden');
  hud.btnAgain.classList.add('hidden');
  hud.btnShuffle.classList.add('hidden');
  game = new Game(mode, hud);
  game.start();
}

// menu buttons
menu.querySelectorAll('.big-button').forEach((btn) => {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    unlockAudio();
    sfx.tick();
  });
  btn.addEventListener('click', () => {
    const mode = btn.getAttribute('data-mode');
    startMode(mode);
  });
});

// ---- HUD buttons -----------------------------------------------------

hud.btnHome.addEventListener('click', () => {
  sfx.tick();
  showMenu();
});

let lastSpeak = 0;
hud.btnSpeaker.addEventListener('click', () => {
  const now = performance.now();
  if (now - lastSpeak < 600) return; // debounce rapid replay taps
  lastSpeak = now;
  sfx.tick();
  if (game) game.speakPrompt();
});

hud.btnShuffle.addEventListener('click', () => {
  sfx.tick();
  if (game && game.mode === 'freeplay') game.dealFreeplay();
});

hud.btnAgain.addEventListener('click', () => {
  sfx.tick();
  if (game) game.again();
});

// prevent the HUD buttons' pointerdown from reaching the canvas handler
for (const el of [hud.btnHome, hud.btnSpeaker, hud.btnShuffle, hud.btnAgain]) {
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
}

// ---- canvas pointer input (the build mechanic) -----------------------

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  unlockAudio();
  if (!game) return;
  // free play: a picture card waiting to be dismissed swallows the tap
  if (game.freeplayCardUp) {
    game.dismissCard();
    return;
  }
  game.onPointer(e.clientX, e.clientY);
}, { passive: false });

// ---- read-only debug hook (for automated testing) -------------------
// Harmless, no behaviour changes. `state()` reports the current screen, mode,
// slotted fragment ids and last evaluation result; `tileXY()` projects each
// active tappable tile center to CSS pixel canvas coordinates.
window.SPROUTS = {
  state: () => {
    const onMenu = !menu.classList.contains('hidden');
    if (onMenu || !game) {
      return { screen: 'menu', mode: null, slots: { onset: null, rime: null }, lastResult: null };
    }
    const s = game.debugState();
    return { screen: s.mode, mode: s.mode, slots: s.slots, lastResult: s.lastResult };
  },
  tileXY: () => (game ? game.debugTileXY() : []),
};

// suppress long-press context menu / selection on iPad
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('gesturestart', (e) => e.preventDefault());

// resume speech when returning to the tab
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    try { window.speechSynthesis && window.speechSynthesis.resume(); } catch { /* ignore */ }
  }
});
