// audio.js — recorded-clip player for the generated voice assets, with a
// Web-Speech fallback so the game still runs when a clip (or the whole manifest)
// is missing. Mirrors speech.js semantics but plays HTMLAudioElements driven by
// assets/audio/manifest.json.
//
// Manifest shape:
//   { "<category>": { "<key>": { "file": "<category>/<key>.m4a", "dur": <sec> } } }
// Categories: fragments, words, celebrate, prompts, bonus, misc.
//
// This is the PRIMARY voice channel. SFX (sfx.js, WebAudio) is a separate layer
// and keeps firing alongside these clips.

import * as speech from './speech.js';

// Resolve module-relative (not document-relative) so any consuming page — a game
// at /games/<id>/ or the hub at / — reaches the shared audio library correctly.
// audio.js lives at shared/js/, the library at shared/assets/audio/.
const MANIFEST_URL = new URL('../assets/audio/manifest.json', import.meta.url).href;
const AUDIO_BASE = new URL('../assets/audio/', import.meta.url).href;

/** @type {Record<string, Record<string, {file:string, dur:number}>>} */
let manifest = null;
let manifestOk = false;

// Lazy HTMLAudioElement cache, keyed by "category/key".
const elCache = new Map();

// The clip currently playing through the primary channel (so we can stop it).
let activeEl = null;
// Settles the superseded play() promise the moment a newer play()/stop() takes
// over — without this the old promise lingers until its safety timeout and a
// stale playSeq() can wake up seconds later and interrupt newer audio.
let activeCancel = null;
// Monotonic token so a stop()/new play() invalidates an in-flight resolve.
let playToken = 0;
// Sequence token: any new play()/stop() outside a sequence supersedes every
// in-flight playSeq(), which checks it between items and bails silently.
let seqToken = 0;

/**
 * Fetch the manifest once. Resolves (never rejects) so callers can `await ready`
 * without guarding — a missing/invalid manifest simply leaves us in
 * fallback-only mode where every play() delegates to speech.js.
 * @type {Promise<void>}
 */
export const ready = (async () => {
  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('manifest ' + res.status);
    const data = await res.json();
    if (data && typeof data === 'object') {
      manifest = data;
      manifestOk = true;
    }
  } catch {
    manifest = null;
    manifestOk = false;
  }
})();

/** Cache-bust suffix from the manifest version, so clip URLs change on each
 *  audio release (the manifest itself is fetched no-cache). */
function verSuffix() {
  return manifest && manifest._v ? '?v=' + manifest._v : '';
}

/** Look up a clip descriptor, or null if absent. */
function lookup(category, key) {
  if (!manifestOk || !manifest) return null;
  if (category[0] === '_') return null; // skip the _v version field
  const cat = manifest[category];
  if (!cat) return null;
  const entry = cat[key];
  if (!entry || !entry.file) return null;
  return entry;
}

/** Get (or lazily create) the cached HTMLAudioElement for a clip. */
function getEl(category, key) {
  const ck = category + '/' + key;
  let el = elCache.get(ck);
  if (el) return el;
  const entry = lookup(category, key);
  if (!entry) return null;
  el = new Audio(AUDIO_BASE + entry.file + verSuffix());
  el.preload = 'auto';
  elCache.set(ck, el);
  return el;
}

/** Stop whatever primary clip is playing (does not touch speech). */
function stopActiveEl() {
  if (activeEl) {
    try {
      activeEl.pause();
      activeEl.currentTime = 0;
    } catch { /* ignore */ }
    activeEl = null;
  }
  if (activeCancel) {
    const cancel = activeCancel;
    activeCancel = null;
    cancel(); // resolve the superseded play() promise now, not at its timeout
  }
}

/**
 * Unlock recorded audio on the first user gesture (iOS autoplay policy): play
 * then immediately pause a clip so subsequent programmatic play() is allowed.
 * Also unlocks Web Speech.
 */
export function unlock() {
  speech.unlock();
  try {
    // Prefer a real manifest clip if we have one (warms the element); otherwise
    // a tiny silent data-URI WAV still satisfies the gesture requirement.
    let el = null;
    for (const cat of Object.keys(manifest || {})) {
      const keys = Object.keys(manifest[cat] || {});
      if (keys.length) { el = getEl(cat, keys[0]); break; }
    }
    if (!el) el = new Audio(SILENT_WAV);
    el.muted = true;
    const p = el.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        try { el.pause(); el.currentTime = 0; el.muted = false; } catch { /* ignore */ }
      }).catch(() => { try { el.muted = false; } catch { /* ignore */ } });
    } else {
      try { el.pause(); el.muted = false; } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

/**
 * Play a recorded clip as the primary voice. Stops any current primary clip and
 * cancels Web Speech first so prompts/words never overlap. Falls back to
 * speech.speak(fallbackText) when the clip/manifest is missing.
 *
 * Recorded clips have a fixed voice, so rate/pitch only affect the fallback.
 *
 * @param {string} category
 * @param {string} key
 * @param {{fallbackText?:string, rate?:number, pitch?:number}} [opts]
 * @returns {Promise<void>} resolves when the clip ends (or on error/timeout).
 */
export function play(category, key, opts = {}) {
  seqToken++; // a direct play() supersedes any in-flight playSeq()
  return playOne(category, key, opts);
}

/** Internal single-clip player — playSeq() calls this so its own items don't
 *  invalidate the sequence they belong to. */
function playOne(category, key, opts = {}) {
  const { fallbackText, rate, pitch } = opts;

  // Take over the primary channel.
  const token = ++playToken;
  stopActiveEl();
  speech.stop();

  const el = getEl(category, key);
  if (!el) {
    // No recorded clip — fall back to Web Speech if we have text.
    if (fallbackText) return speech.speak(fallbackText, { rate, pitch });
    return Promise.resolve();
  }

  const entry = lookup(category, key);
  const durMs = entry && entry.dur ? entry.dur * 1000 + 300 : 4000;

  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
      if (activeEl === el) activeEl = null;
      if (activeCancel === finish) activeCancel = null;
      resolve();
    };
    const onEnded = () => finish();
    const onError = () => {
      // Clip failed to load/decode — fall back to speech if we can.
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
      if (activeEl === el) activeEl = null;
      if (activeCancel === finish) activeCancel = null;
      if (token !== playToken) { resolve(); return; }
      if (fallbackText) { speech.speak(fallbackText, { rate, pitch }).then(resolve); }
      else resolve();
    };

    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);

    try {
      el.currentTime = 0;
    } catch { /* ignore — not always seekable before play */ }
    activeEl = el;
    activeCancel = finish;

    const p = el.play();
    if (p && typeof p.then === 'function') {
      p.catch(() => onError());
    }

    // Safety timeout: resolve even if 'ended' never fires.
    timer = setTimeout(finish, durMs);
  });
}

/**
 * Play a sequence of clips one after another with gaps between them.
 * @param {Array<[string,string] | {cat:string, key:string, fallbackText?:string, rate?:number, pitch?:number}>} items
 * @param {{gap?:number}} [opts]
 * @returns {Promise<void>}
 */
export async function playSeq(items, opts = {}) {
  const { gap = 250 } = opts;
  if (!items || !items.length) return;
  const token = ++seqToken; // a newer play()/playSeq()/stop() cancels this one
  for (let i = 0; i < items.length; i++) {
    const raw = items[i];
    let cat, key, rest;
    if (Array.isArray(raw)) {
      [cat, key] = raw;
      rest = {};
    } else {
      ({ cat, key, ...rest } = raw);
    }
    await playOne(cat, key, rest);
    if (token !== seqToken) return;
    if (i < items.length - 1) {
      await wait(gap);
      if (token !== seqToken) return;
    }
  }
}

/** Stop the active primary clip, any in-flight sequence, and Web Speech. */
export function stop() {
  playToken++;
  seqToken++;
  stopActiveEl();
  speech.stop();
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

// 44-byte silent WAV (1 sample) used only as a last-resort unlock element when
// no manifest clip exists yet. data: URI, no network.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
