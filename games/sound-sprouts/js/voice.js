// voice.js — this game's voice channel over the SHARED clip library.
//
// Every clip Sound Sprouts speaks lives in shared/assets/audio/, addressed by
// category + key. iOS, though, only keeps ONE audio element playable after a
// gesture: fan a four-clip mystery prompt across four elements and everything
// after the first is blocked, so the sentence slips into the synth voice
// mid-way. shared/js/voice-clips.js owns the single-reusable-channel fix but
// addresses clips by path, so this module resolves category/key against the
// shared manifest and hands voice-clips the resolved path + duration.
//
// Lookups are synchronous: a play() before the manifest lands speaks the
// fallback text, same as an unrecorded clip.

import * as speech from '../../../shared/js/speech.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';

// Resolve module-relative (not document-relative) so the shared library is
// reached from this file's location — voice.js lives at games/sound-sprouts/js/.
const MANIFEST_URL = new URL('../../../shared/assets/audio/manifest.json', import.meta.url).href;
const AUDIO_BASE = new URL('../../../shared/assets/audio/', import.meta.url).href;

/** @type {Record<string, Record<string, {file:string, dur:number}>>} */
let manifest = null;

/**
 * Fetch the shared manifest once. Resolves (never rejects) so callers can
 * `await ready` without guarding — a missing/invalid manifest simply leaves us
 * in fallback-only mode where every play() delegates to speech.js.
 * @type {Promise<void>}
 */
export const ready = (async () => {
  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('manifest ' + res.status);
    const data = await res.json();
    if (data && typeof data === 'object') manifest = data;
  } catch {
    manifest = null;
  }
})();

/**
 * Clip URL + duration for a category/key pair, or null when unrecorded. The
 * `?v=` suffix comes from the manifest version so clip URLs change on each
 * audio release (the manifest itself is fetched no-cache).
 */
function lookup(category, key) {
  if (!manifest || category[0] === '_') return null; // skip the _v version field
  const cat = manifest[category];
  const entry = cat && cat[key];
  if (!entry || !entry.file) return null;
  const ver = manifest._v ? '?v=' + manifest._v : '';
  return { src: AUDIO_BASE + entry.file + ver, dur: entry.dur };
}

// Sequence token: any play()/stop() outside a sequence supersedes every
// in-flight playSeq(), which checks it between items and bails silently.
let seqToken = 0;

/**
 * Play a shared clip as the primary voice. Stops whatever was playing first so
 * prompts/words never overlap, and falls back to speech.speak(fallbackText)
 * when the clip is missing.
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
  const clip = lookup(category, key);
  if (!clip) {
    // Speak here rather than via sayFile(): only this path can carry rate/pitch
    // through to the synth voice.
    voiceClips.stop();
    return fallbackText ? speech.speak(fallbackText, { rate, pitch }) : Promise.resolve();
  }
  return voiceClips.sayFile(clip.src, fallbackText, clip.dur);
}

/**
 * Play clips back to back through the one channel, with a gap between them.
 * @param {Array<{cat:string, key:string, fallbackText?:string, rate?:number, pitch?:number}>} items
 * @param {{gap?:number}} [opts]
 * @returns {Promise<void>}
 */
export async function playSeq(items, opts = {}) {
  const { gap = 250 } = opts;
  if (!items || !items.length) return;
  const token = ++seqToken; // a newer play()/playSeq()/stop() cancels this one
  for (let i = 0; i < items.length; i++) {
    const { cat, key, ...rest } = items[i];
    await playOne(cat, key, rest);
    if (token !== seqToken) return;
    if (i < items.length - 1) {
      await wait(gap);
      if (token !== seqToken) return;
    }
  }
}

/** Unlock clip playback on the first user gesture (iOS). Also unlocks speech. */
export function unlock() {
  voiceClips.unlock();
}

/** Stop the active clip, any in-flight sequence, and Web Speech. */
export function stop() {
  seqToken++;
  voiceClips.stop();
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
