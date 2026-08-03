// audio-unlock.js — the platform's one first-gesture audio unlock.
//
// See docs/interaction-patterns.md §1 (audio unlock) and §9 (iPad tuning).
// Roughly twenty games hand-rolled this block; ~half of them latched it with a
// plain `let audioUnlocked = false` that never reopened. On iPadOS that guard
// goes stale the moment the child switches apps, takes a call, or lets the
// screen lock: the WebAudio context parks on 'suspended'/'interrupted', the
// speech queue wedges, and the recorded-clip element loses its play permission —
// but the boolean still says "unlocked", so every later touch unlocks nothing
// and the game goes silent for the rest of the session. That is the story-stones
// stale-guard bug, and the fix lives here: the latch RESETS whenever the page
// comes back to the foreground, so the very next touch genuinely re-unlocks.
//
// Contract (docs/shared-platform-refactor.md):
//   unlockAll(extra = [])                            // fan out, each try/caught
//   installUnlockOnGesture({ target, extra, onFirst }) -> dispose
//   installKioskGuards()                             -> dispose
//
// Every call is individually try/caught: one channel throwing (no AudioContext,
// no speechSynthesis, an Audio element the browser refused) must never stop the
// other three from unlocking, and must never break the gesture handler that a
// game also uses to start play.

import * as sfx from './sfx.js';
import * as speech from './speech.js';
import * as voiceClips from './voice-clips.js';
import * as audio from './audio.js';

/** Call fn, swallowing anything it throws. */
function guard(fn) {
  if (typeof fn !== 'function') return;
  try {
    fn();
  } catch { /* one dead channel must never silence the others */ }
}

/**
 * Unlock every audio channel the platform owns, plus any extra unlockers the
 * game passes (music.js, a game-local voice fork, an engine's own channel).
 *
 * Must be called SYNCHRONOUSLY inside a user gesture — iOS only grants playback
 * permission to code running in the gesture's own task. Do not await anything
 * before calling it.
 *
 * @param {Array<() => void>} [extra] additional unlock functions, each try/caught
 */
export function unlockAll(extra = []) {
  guard(() => sfx.unlock());
  guard(() => speech.unlock());
  guard(() => voiceClips.unlock());
  guard(() => audio.unlock());
  if (extra && extra.length) for (const fn of extra) guard(fn);
}

/**
 * Install the global first-gesture unlock listener.
 *
 * @param {object} [opts]
 * @param {EventTarget} [opts.target=window] where to listen for pointerdown
 * @param {Array<() => void>} [opts.extra] extra unlockers, see unlockAll()
 * @param {(event: PointerEvent) => void} [opts.onFirst] fired once, ever, on the
 *   first gesture — after the unlock fan-out, so a greeting started from here is
 *   already allowed to play. NOT re-fired when the unlock latch resets (a child
 *   coming back from another app must not get the intro line again).
 * @returns {() => void} dispose
 */
export function installUnlockOnGesture({ target = window, extra = [], onFirst } = {}) {
  // TWO latches on purpose, with different lifetimes:
  //   `unlocked`  — gates the unlock fan-out. Resets on foreground, because the
  //                 permissions it represents are the thing iPadOS revokes.
  //   `firstDone` — gates onFirst. Never resets: it means "the child has touched
  //                 this page at least once", which stays true forever.
  let unlocked = false;
  let firstDone = false;
  let disposed = false;

  const onPointerDown = (event) => {
    if (disposed) return;
    if (!unlocked) {
      unlocked = true;
      unlockAll(extra);
    }
    if (!firstDone) {
      firstDone = true;
      if (typeof onFirst === 'function') {
        try {
          onFirst(event);
        } catch { /* a game's intro must never break the unlock path */ }
      }
    }
  };

  // Foreground again: whatever we unlocked before the app switch may be dead.
  // Reopen the latch (the next touch re-unlocks) and nudge speechSynthesis,
  // which some engines leave paused after a background trip and never resume.
  const onForeground = () => {
    if (disposed || document.hidden) return;
    unlocked = false;
    try {
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.resume();
    } catch { /* ignore */ }
  };

  // pageshow also covers an iOS bfcache restore, which can hand the page back
  // without ever firing visibilitychange.
  const onPageShow = () => onForeground();

  target.addEventListener('pointerdown', onPointerDown, { passive: true });
  document.addEventListener('visibilitychange', onForeground);
  window.addEventListener('pageshow', onPageShow);

  return () => {
    if (disposed) return;
    disposed = true;
    target.removeEventListener('pointerdown', onPointerDown, { passive: true });
    document.removeEventListener('visibilitychange', onForeground);
    window.removeEventListener('pageshow', onPageShow);
  };
}

/**
 * Suppress the iPad long-press callout menu and pinch-zoom, so a two-finger
 * fumble or a held tile can't drop the child out of the game (§9).
 * @returns {() => void} dispose
 */
export function installKioskGuards() {
  const block = (event) => event.preventDefault();
  window.addEventListener('contextmenu', block);
  window.addEventListener('gesturestart', block);
  return () => {
    window.removeEventListener('contextmenu', block);
    window.removeEventListener('gesturestart', block);
  };
}
