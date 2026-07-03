// main.js — the boot + mode-dispatch skeleton for a QLOBE Kids game family.
//
// This file teaches the pattern every game follows:
//   1. Import the shared voice + sound-effect libraries from ../../shared/js/.
//   2. Unlock audio on the FIRST user gesture (iOS blocks sound until then).
//   3. Route between the menu overlay and an active "mode".
//   4. Give every mode a Home button back to the menu.
//
// Copy this whole folder, rename it to games/<your-id>/, then grow the two
// stub modes below into real mini-games. One skill per mode. 30–90s loops.
// Keep it vanilla ES modules — no bundler, no framework, no build step.

// ---- shared platform libraries ---------------------------------------
// audio.js  = PRIMARY voice channel. Plays recorded teacher-voice clips from the
//             audio manifest, and falls back to device Web Speech when a clip
//             (or the whole manifest) is missing. Exported: ready, unlock,
//             play(category, key, opts), playSeq(items, opts), stop().
// speech.js = the Web Speech wrapper audio.js falls back to. You can also call
//             speech.speak('...') directly for text you have no recording for.
// sfx.js    = WebAudio sound effects, zero files. Exported effects include
//             pop(), tick(), tada(), sparkle(), whoosh(), boing().
// PATH NOTE: these imports resolve relative to THIS module's own URL. main.js
// lives in js/ (one level below the game root), so it needs three hops
// (../../../) to climb js/ -> game-family/ -> templates/ -> repo root, then into
// shared/. This is the SAME depth once you copy the folder to games/<id>/js/
// (js/ -> <id>/ -> games/ -> repo root), so the path does not change.
// (Note: index.html's importmap uses only ../../shared/ because it resolves
//  relative to the document, which sits one level shallower than this module.)
import * as audio from '../../../shared/js/audio.js';
import * as speech from '../../../shared/js/speech.js';
import * as sfx from '../../../shared/js/sfx.js';

// ---- DOM handles -----------------------------------------------------
const menu = document.getElementById('menu');
const stage = document.getElementById('stage');
const stageText = document.getElementById('stage-text');
const hud = document.getElementById('hud');
const btnHome = document.getElementById('btn-home');

let currentMode = null; // id of the running mode, or null on the menu

// Kick off manifest loading at boot. It never rejects — a missing manifest
// simply leaves audio.js in speech-fallback mode, so we don't block on it.
audio.ready.catch(() => {});

// ---- audio unlock on first gesture -----------------------------------
// iOS Safari will not play any sound until the user has interacted. We unlock
// all three channels on the very first pointerdown, then it's a no-op.
let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  sfx.unlock();
  speech.unlock();
  audio.unlock();
}
window.addEventListener('pointerdown', unlockAudio, { once: false });

// ---- screen routing --------------------------------------------------
function showMenu() {
  currentMode = null;
  audio.stop();      // stop any in-flight voice clip
  speech.stop();
  menu.classList.remove('hidden');
  stage.classList.add('hidden');
  hud.classList.add('hidden');
}

// startMode(mode) — the dispatch switch. Add a `case` per mode id, matching the
// data-mode values on the menu buttons in index.html. Each mode below is a stub
// that just says/logs something; replace the bodies with real gameplay.
function startMode(mode) {
  if (currentMode) return; // one mode at a time
  currentMode = mode;
  menu.classList.add('hidden');
  stage.classList.remove('hidden');
  hud.classList.remove('hidden');

  switch (mode) {
    case 'mode-a':
      stageText.textContent = 'Mode A is playing';
      console.log('[template] started Mode A');
      // Try a recorded prompt; fall back to spoken text if there's no clip.
      // (Swap 'prompts'/'start' for real manifest keys once you record audio.)
      audio.play('prompts', 'start', { fallbackText: 'Let’s play Mode A!' });
      sfx.pop();
      break;

    case 'mode-b':
      stageText.textContent = 'Mode B is playing';
      console.log('[template] started Mode B');
      speech.speak('Let’s play Mode B!');
      sfx.sparkle();
      break;

    default:
      // Unknown mode id — bail back to the menu rather than showing a blank stage.
      console.warn('[template] unknown mode:', mode);
      showMenu();
  }
}

// ---- wire the menu buttons -------------------------------------------
// pointerdown gives instant tactile feedback (and unlocks audio); the actual
// launch happens on click so a stray drag off the button cancels cleanly.
menu.querySelectorAll('.big-button').forEach((btn) => {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    unlockAudio();
    sfx.tick();
  });
  btn.addEventListener('click', () => {
    startMode(btn.getAttribute('data-mode'));
  });
});

// ---- HUD: Home returns to the menu -----------------------------------
btnHome.addEventListener('click', () => {
  sfx.tick();
  showMenu();
});

// ---- iPad niceties ---------------------------------------------------
// Suppress long-press context menu and pinch gestures on tablets.
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('gesturestart', (e) => e.preventDefault());

// Start on the menu.
showMenu();
