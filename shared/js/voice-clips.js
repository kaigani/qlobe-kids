// voice-clips.js — recorded-clip voice player with a Web Speech fallback.
// Promoted from games/lunchbox-pack/js/voice.js so every polished game gets
// recorded teacher voice + the talking-mouth onClip hook for free.
//
// Contract:
//   await voiceClips.init(manifestUrl, linesUrl, defaultLines);  // never rejects
//   voiceClips.say(key, fallbackText)  // recorded clip if present, else speech
//   voiceClips.onClip(cb)              // cb(key, audioEl) when a clip starts
//   voiceClips.clipInfo(key)           // { file, dur } if recorded, else null
//   voiceClips.unlock()                // call on every pointerdown (iOS)
//   voiceClips.stop()
//   voiceClips.duration(key)           // recorded seconds, or null
//   voiceClips.setMuted(on) / isMuted()
//   voiceClips.getAudioLog() / clearAudioLog()   // ring buffer, {key, text, at}
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
let unlockPending = false;
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

// ---- mute gate ------------------------------------------------------------
// Off by default, so a game that never calls setMuted() behaves exactly as it
// did before this existed. When on, say()/sayFile() stop whatever is talking and
// resolve immediately instead of speaking; trySay() reports `false` (it did not
// start), which is the same answer a caller already has to handle.
let muted = false;

/** Silence (or unsilence) the voice channel. Muting cuts off the current line. */
export function setMuted(on) {
  muted = !!on;
  if (muted) stop();
}

/** @returns {boolean} */
export function isMuted() { return muted; }

// ---- audio log (QLOBE_DEBUG v1 `getAudioLog`) -----------------------------
// A ring buffer of what the game ASKED to say, in order — the one thing that
// makes an audio bug reproducible from a QA driver, where you cannot hear
// anything and a missing clip is indistinguishable from a line that was never
// requested. Games have been forking voice-clips just to get this (see
// games/rhyming-detective/js/voice.js); it belongs here.
const LOG_MAX = 80;
const audioLog = [];

function logSay(key, text, kind) {
  audioLog.push({
    key,
    text: text || '',
    // 'clip' when a recording backs this line, 'speech' when it will be
    // synthesized — QA drivers assert on this to prove the recorded teacher
    // voice actually played (see games/rhyming-detective/tools/qa.mjs).
    kind: kind || 'speech',
    // ms since page load (performance.now), so an entry lines up with console
    // timings and with a driver's own clock without timezone arithmetic.
    at: Math.round(typeof performance !== 'undefined' ? performance.now() : Date.now()),
  });
  if (audioLog.length > LOG_MAX) audioLog.splice(0, audioLog.length - LOG_MAX);
}

/** @returns {Array<{key: string, text: string, kind: 'clip'|'speech', at: number}>} a copy, oldest first. */
export function getAudioLog() { return audioLog.map((entry) => ({ ...entry })); }

/** Empty the audio log (a QA driver clears it between rounds). */
export function clearAudioLog() { audioLog.length = 0; }

/**
 * The recorded length of a clip in seconds, or null when this game ships no
 * recording for the key (or the manifest is absent). Lets a caller time a visual
 * beat to the voice instead of guessing — clipInfo(key)?.dur without the
 * optional-chaining dance, and null rather than undefined so `?? fallback` and
 * `== null` both read cleanly.
 */
export function duration(key) {
  const entry = manifest && manifest[key];
  return entry && typeof entry.dur === 'number' ? entry.dur : null;
}

/**
 * The manifest entry for a key — `{ file, dur }` — or null when this game ships
 * no recording for it. Read-only and additive: it exists so a game can PLAN a
 * spoken sequence around what was actually recorded instead of guessing. (Sink
 * or Float speaks its predict prompt as two clips, "Will it sink," / "or will
 * it float?", popping a guess badge as each one starts; when those two clips
 * are missing it must fall back to the single whole-sentence clip and time the
 * pops off that clip's own `dur`. Neither decision is possible from say()
 * alone, which silently swaps in Web Speech.)
 */
export function clipInfo(key) {
  return (manifest && manifest[key]) || null;
}

// A game's lines.json is normally { key: "spoken text" }. At least one game's
// voice pipeline writes { key: { text: "…" } } instead, and an object dropped
// into an utterance is read to a five-year-old as "object Object". Accept both
// shapes — strictly widening, no existing caller changes behaviour.
function lineText(value) {
  if (typeof value === 'string') return value;
  return value && typeof value.text === 'string' ? value.text : '';
}

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
  const text = lineText(lines && lines[key]) || fallbackText || defaults[key] || '';
  const entry = manifest && manifest[key];
  logSay(key, text, entry && entry.file ? 'clip' : 'speech');
  if (muted) return Promise.resolve();
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
  logSay(fileRel || 'file', fallbackText || '', fileRel ? 'clip' : 'speech');
  if (muted) return Promise.resolve();
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
  if (muted) return Promise.resolve(false);
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
    // `settled` guards the promise; `handled` guards the listeners. They are SEPARATE on
    // purpose. Previously one flag did both, so the error path marked itself done before
    // awaiting the speech fallback — and the safety timeout below then saw "done" and
    // returned without resolving. If that fallback never settled (Web Speech is blocked
    // until a gesture, and silently does nothing when it is), this promise hung forever.
    // Anything awaiting it hung with it: build-assemble gates its round advance on the
    // spoken blend line, so a child was left on a finished round with an empty tray and
    // no way forward. Audio must never be able to strand a game.
    let settled = false;
    let handled = false;
    const cleanup = () => {
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      handled = true;   // a late 'error' after we finished must not fire a stray fallback
      cleanup();
      resolve();
    };
    const onEnded = () => finish();
    const onError = () => {
      if (handled) return;
      handled = true;
      cleanup();
      // superseded by a newer say()/stop() — just resolve, don't speak
      if (token !== playToken) { finish(); return; }
      speech.speak(text).then(finish, finish);
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
 *
 * One attempt at a time: games unlock from a target handler AND a bubbling
 * window handler within the same first gesture, and start the welcome line in
 * between. Without the pending flag both attempts install a settle() that
 * pauses and rewinds the SHARED channel — and the second one lands on the real
 * greeting and cuts it off.
 */
export function unlock() {
  speech.unlock();
  if (unlocked || unlockPending) return;
  try {
    const el = getChannel();
    // a real clip already holds the channel — that playback IS the unlock
    if (el.src && el.src !== SILENT_WAV && !el.paused) { unlocked = true; return; }
    el.muted = true;
    // Prime on silence, never on whatever clip last held the channel: a retry
    // (the first attempt was refused, or a clip has since played and paused)
    // would otherwise prime with a REAL src, settle()'s "a real clip started"
    // guard would early-return, and the element would be left muted with the
    // old line queued up to replay.
    if (!el.src || (el.paused && el.src !== SILENT_WAV)) el.src = SILENT_WAV;
    unlockPending = true;
    const p = el.play();
    const settle = () => {
      unlockPending = false;
      // a real clip started while the muted prime was settling: leave it alone
      if (!el.muted || el.src !== SILENT_WAV) return;
      try { el.pause(); el.currentTime = 0; } catch { /* ignore */ }
      el.muted = false;
    };
    if (p && typeof p.then === 'function') {
      p.then(() => { unlocked = true; settle(); }, () => { unlockPending = false; el.muted = false; });
    } else {
      unlocked = true;
      settle();
    }
  } catch { unlockPending = false; /* ignore — a later gesture retries */ }
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
