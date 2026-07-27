// voice.js — this game's voice channel: a thin wrapper on the shared recorded-clip
// player. One speaker, Ari the armadillo (`ari-*` guide chrome, plus the
// unprefixed prompt stems `find-intro`/`says-intro`/`starts-intro`, the 26
// `letter-*` names and the 78 `isfor-*` reveal lines).
//
// config.json's `voice` map is the single authoring source for every spoken line.
// It is passed to the shared player as the default-lines safety net, and
// assets/audio/lines.json is generated from it by tools/gen-voice.py so the
// recorded clip and its Web Speech fallback can never drift apart.

import * as clips from '../../../shared/js/voice-clips.js';

const MANIFEST_URL = './assets/audio/manifest.json';

let lines = {};
let durations = {};
let muted = false;

/** @param {Record<string,string>} voiceLines config.voice */
export async function init(voiceLines) {
  lines = voiceLines || {};
  await clips.init(MANIFEST_URL, './assets/audio/lines.json', lines);
  // Keep the per-clip durations so callers can wait for a line to actually
  // finish instead of guessing. Swapping a voice changes every length, and a
  // hard-coded timeout silently starts clipping the ends off.
  try {
    const res = await fetch(MANIFEST_URL);
    if (res.ok) durations = await res.json();
  } catch { /* fine — callers fall back to their own minimum */ }
}

/** Recorded length of a line in seconds, or 0 when it isn't recorded. */
export function duration(key) {
  const entry = durations[key];
  return entry && entry.dur ? entry.dur : 0;
}

/**
 * Silence the voice channel. Used by window.QLOBE_DEBUG.mute() so an automated
 * run isn't paced by real clip durations — every line resolves immediately
 * instead of waiting out the Web Speech guard timeout.
 */
export function setMuted(on) {
  muted = !!on;
  if (muted) clips.stop();
}

/** Speak one line by key. Resolves when it finishes; never rejects, never hangs. */
export function say(key) {
  if (!key || muted) return Promise.resolve();
  return clips.say(key, lines[key] || '');
}

/** The written text of a line — used for aria labels and the debug surface. */
export function text(key) { return lines[key] || ''; }

/**
 * Which speaker a key belongs to, so the right actor animates. Flashlight
 * Cave has one speaker, Ari, who voices every prefixed `ari-*` line plus the
 * unprefixed prompt stems and reveal lines — so anything that isn't silence
 * is Ari.
 */
export function speaker(key) {
  return key ? 'ari' : null;
}

/**
 * Attempt a recorded clip with no Web Speech fallback. Resolves false when the
 * browser blocks it for want of a user gesture, so the caller can defer to the
 * first touch rather than slipping into the synth voice.
 */
export function trySay(key) {
  if (!key || muted) return Promise.resolve(false);
  return clips.trySay(key);
}

export const stop = clips.stop;
export const unlock = clips.unlock;
export const onClip = clips.onClip;
