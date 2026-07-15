// voice-clips.js — recorded-clip voice player with a Web Speech fallback.
// Promoted from games/lunchbox-pack/js/voice.js so every polished game gets
// recorded teacher voice + the talking-mouth onClip hook for free.
//
// Contract:
//   await voiceClips.init(manifestUrl, linesUrl, defaultLines);  // never rejects
//   voiceClips.say(key, fallbackText)  // recorded clip if present, else speech
//   voiceClips.onClip(cb)              // cb(key, audioEl) when a clip starts
//   voiceClips.unlock()                // call on every pointerdown (iOS)
//   voiceClips.stop()
//
// Recorded clips are optional: every fetch/play failure falls back cleanly to
// speech.js. Spoken fallback text comes from lines.json when present (so
// recorded and fallback voice always match), else the caller's fallbackText,
// else the game's defaultLines passed to init().
//
// iOS note: Safari only lets an audio element auto-play once it has *already*
// played during a user gesture. Creating a new Audio() per clip therefore
// works for the first clip in a sequence but gets the rest blocked — they fall
// back to Web Speech, so one utterance slips between the recorded voice and the
// synth voice. The fix is a SINGLE reusable element, unlocked once on the first
// gesture and then src-swapped for every clip.

import * as speech from './speech.js';

let manifest = null; // { key: { file, dur } }
let lines = null;    // { key: "spoken text" }
let defaults = {};   // game-supplied safety net
let baseUrl = './assets/audio/';

// The one reusable audio element. Once it has played during a gesture (unlock),
// every later src-swap + play() is allowed by iOS without a fresh gesture.
let channel = null;
let unlocked = false;
// Monotonic token: a new say()/stop() supersedes any in-flight clip so its
// pending fallback can't fire late and double up.
let playToken = 0;

function getChannel() {
  if (!channel) {
    channel = new Audio();
    channel.preload = 'auto';
  }
  return channel;
}

async function loadJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// A manifest entry's `file` is normally relative to the game's own audio dir
// (baseUrl). A game may instead point an entry at the SHARED library with a
// path that escapes its folder (starts with ../ or /) or a full URL — pass
// those through document-relative so shared clips can be reused, not re-copied.
function clipUrl(file) {
  return /^(?:https?:|\/|\.\.\/)/.test(file) ? file : baseUrl + file;
}

/**
 * Load the clip manifest and the spoken-lines table. Never rejects — a 404 on
 * either just means we run on the speech.js fallback.
 */
export async function init(
  manifestUrl = './assets/audio/manifest.json',
  linesUrl = './data/lines.json',
  defaultLines = {}
) {
  baseUrl = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
  defaults = defaultLines || {};
  [manifest, lines] = await Promise.all([loadJson(manifestUrl), loadJson(linesUrl)]);
}

// Optional clip-start listeners (e.g. talking-mouth sync). cb(key, audioEl).
const clipListeners = new Set();
export function onClip(cb) { clipListeners.add(cb); return () => clipListeners.delete(cb); }

/**
 * Speak one line: the recorded clip when the manifest has it, otherwise
 * synthesized speech. Stops whatever was playing first. Resolves when done
 * (bounded — never hangs the game). Plays every clip through the one unlocked
 * channel element so a sequence never slips into the synth voice on iOS.
 */
export function say(key, fallbackText) {
  const token = ++playToken;
  pauseChannel();
  speech.stop();
  const text = (lines && lines[key]) || fallbackText || defaults[key] || '';
  const entry = manifest && manifest[key];
  if (!entry || !entry.file) return speech.speak(text);
  return playClip(clipUrl(entry.file), text, token, key, entry.dur);
}

/**
 * Speak one line from a clip file addressed directly (not via the manifest) —
 * e.g. a shared library clip a game references by path. Same one-channel + Web
 * Speech fallback behaviour as say(); if the file is missing the fallbackText
 * is synthesized. `fileRel` may be a shared relative path (`../…`) or a URL.
 */
export function sayFile(fileRel, fallbackText, dur) {
  const token = ++playToken;
  pauseChannel();
  speech.stop();
  if (!fileRel) return speech.speak(fallbackText || '');
  return playClip(clipUrl(fileRel), fallbackText || '', token, 'file', dur);
}

/**
 * Attempt a recorded clip without any Web Speech fallback. Resolves `true` if
 * playback actually started, `false` if the browser blocked it (e.g. a fresh
 * page load with no in-document gesture yet — user activation does not survive
 * a navigation). Lets a caller try to greet on load and, if blocked, defer to
 * the first gesture instead of slipping to the synth voice. `key` may be a
 * manifest key or, when `isFile`, a direct clip path.
 */
export function trySay(key, isFile = false) {
  ++playToken;
  pauseChannel();
  speech.stop();
  const src = isFile ? key : (manifest && manifest[key] && manifest[key].file);
  if (!src) return Promise.resolve(false);
  const el = getChannel();
  el.muted = false;
  el.src = clipUrl(src);
  try { el.currentTime = 0; } catch { /* not always seekable pre-play */ }
  clipListeners.forEach((cb) => { try { cb(key, el); } catch { /* never break voice */ } });
  const p = el.play();
  if (p && typeof p.then === 'function') {
    return p.then(() => true, () => {
      // Blocked: reset the channel so a later unlock()/say() starts clean
      // (a leftover src would be re-primed muted and collide with the replay).
      try { el.pause(); el.removeAttribute('src'); el.load(); } catch { /* ignore */ }
      return false;
    });
  }
  return Promise.resolve(true); // older browsers: no promise means it started
}

function playClip(src, text, token, key, dur) {
  const el = getChannel();
  return new Promise((resolve) => {
    let done = false;
    const cleanup = () => {
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
    };
    const finish = () => { if (done) return; done = true; cleanup(); resolve(); };
    const onEnded = () => finish();
    const onError = () => {
      if (done) return;
      done = true;
      cleanup();
      // superseded by a newer say()/stop() — just resolve, don't speak
      if (token !== playToken) { resolve(); return; }
      speech.speak(text).then(resolve);
    };
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);
    el.muted = false;
    el.src = src;
    try { el.currentTime = 0; } catch { /* not always seekable pre-play */ }
    clipListeners.forEach((cb) => { try { cb(key, el); } catch { /* never break voice */ } });
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => onError());
    // safety guard: never hang if the element drops its events
    setTimeout(finish, (dur ? dur * 1000 : 4000) + 2000);
  });
}

/**
 * Unlock recorded-clip playback on the first user gesture (iOS autoplay
 * policy): play then pause the channel muted so later programmatic src-swaps
 * are allowed. Runs once; also unlocks Web Speech every call (cheap, idempotent).
 */
export function unlock() {
  speech.unlock();
  if (unlocked) return;
  try {
    const el = getChannel();
    el.muted = true;
    if (!el.src) el.src = SILENT_WAV;
    const p = el.play();
    const settle = () => { try { el.pause(); el.currentTime = 0; } catch { /* ignore */ } el.muted = false; };
    if (p && typeof p.then === 'function') {
      p.then(() => { unlocked = true; settle(); }).catch(() => { el.muted = false; });
    } else {
      unlocked = true;
      settle();
    }
  } catch { /* ignore — a later gesture retries */ }
}

// 44-byte silent WAV used only to prime the channel on the first gesture.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

function pauseChannel() {
  if (channel) {
    try { channel.pause(); } catch { /* ignore */ }
  }
}

/** Stop the current clip and any synthesized speech. */
export function stop() {
  playToken++; // invalidate any in-flight clip's pending fallback
  pauseChannel();
  speech.stop();
}
