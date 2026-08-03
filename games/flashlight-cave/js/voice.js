// voice.js — this game's voice channel: a thin wrapper on the shared recorded-clip
// player. One speaker, Ari the armadillo (`ari-*` guide chrome, plus the
// unprefixed prompt stems `find-intro`/`says-intro`/`starts-intro`, the 26
// `letter-*` names and the 78 `isfor-*` reveal lines).
//
// config.json's `voice` map is the single authoring source for every spoken line.
// It is passed to the shared player as the default-lines safety net, and
// assets/audio/lines.json is generated from it by tools/gen-voice.py so the
// recorded clip and its Web Speech fallback can never drift apart.
//
// duration()/setMuted()/isMuted() delegate straight to shared/js/voice-clips.js
// now that it ships them — this used to fetch manifest.json a SECOND time just
// to build its own key -> dur table, which was the same data voice-clips.js
// already held from its own (first) fetch inside init(). say()/trySay() do not
// need their own mute gate either: clips.say()/clips.trySay() already check the
// shared muted flag internally, so muting here is muting there.

import * as clips from '../../../shared/js/voice-clips.js';

const MANIFEST_URL = './assets/audio/manifest.json';

let lines = {};

/** @param {Record<string,string>} voiceLines config.voice */
export async function init(voiceLines) {
  lines = voiceLines || {};
  await clips.init(MANIFEST_URL, './assets/audio/lines.json', lines);
}

/** Recorded length of a line in seconds, or 0 when it isn't recorded. */
export function duration(key) {
  return clips.duration(key) || 0;
}

/**
 * Silence the voice channel. Used by window.QLOBE_DEBUG.mute() so an automated
 * run isn't paced by real clip durations — every line resolves immediately
 * instead of waiting out the Web Speech guard timeout.
 */
export const setMuted = clips.setMuted;
export const isMuted = clips.isMuted;

/** Speak one line by key. Resolves when it finishes; never rejects, never hangs. */
export function say(key) {
  if (!key) return Promise.resolve();
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
  if (!key) return Promise.resolve(false);
  return clips.trySay(key);
}

export const stop = clips.stop;
export const unlock = clips.unlock;
export const onClip = clips.onClip;
