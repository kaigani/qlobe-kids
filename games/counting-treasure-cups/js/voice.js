// voice.js — this game's voice channel: a thin wrapper on the shared recorded-clip
// player. Two speakers share one channel (Captain Goldie `cap-*`, Skipper the
// parrot `par-*`); the key prefix is what routes a line to an actor's pose.
//
// config.json's `voice` map is the single authoring source for every spoken line.
// It is passed to the shared player as the default-lines safety net, and
// assets/audio/lines.json is generated from it by tools/gen-voice.py so the
// recorded clip and its Web Speech fallback can never drift apart.

import * as clips from '../../../shared/js/voice-clips.js';

let lines = {};
let muted = false;

/** @param {Record<string,string>} voiceLines config.voice */
export async function init(voiceLines) {
  lines = voiceLines || {};
  await clips.init('./assets/audio/manifest.json', './assets/audio/lines.json', lines);
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

/** Which speaker a key belongs to, so the right actor animates. */
export function speaker(key) {
  if (!key) return null;
  if (key.startsWith('cap-')) return 'captain';
  if (key.startsWith('par-')) return 'parrot';
  return null;
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
