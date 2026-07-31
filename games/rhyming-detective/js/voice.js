// voice.js — Rhyming Detective's wrapper around shared/js/voice-clips.js.
//
// game-design.md §3. Everything the game speaks goes through here so that:
//   * one place decides recorded-clip vs Web Speech (voice-clips does the work),
//   * one place owns sequencing with the §3.4 gaps and can cancel a sequence
//     mid-flight when the child taps something else (§3.1 "interruption is
//     always allowed"),
//   * one place feeds the QLOBE_DEBUG audio ring buffer (§7.4).
//
// It MUST survive `assets/audio/manifest.json` being absent — the shell ships
// before the voice pack does. voice-clips.init() never rejects: a 404 on the
// manifest leaves `manifest === null` and every say() falls through to
// speech.js with the text from data/lines.json. Nothing here may assume a clip
// exists.

import * as clips from '../../../shared/js/voice-clips.js';
import * as speech from '../../../shared/js/speech.js';

let ready = false;
let wordKey = 'word-';
let muted = false;

// Monotonic token: a new say()/seq()/stop() supersedes any pending sequence
// step so an interrupted line can never resume two beats later.
let token = 0;

// ---- audio ring buffer (QLOBE_DEBUG.getAudioLog) --------------------------
const LOG_MAX = 80;
const log = [];

function push(kind, key, url) {
  log.push({ t: Math.round(performance.now()), kind, key, url: url || null });
  if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
}

export function getLog() {
  return log.map((entry) => ({ ...entry }));
}

export function clearLog() {
  log.length = 0;
}

// ---- lifecycle ------------------------------------------------------------

/**
 * @param {object} config the parsed config.json — reads `config.voice`.
 * @returns {Promise<boolean>} true when a clip manifest was actually found.
 *   Never rejects; false simply means the game runs on the speech fallback.
 */
export async function init(config) {
  const v = (config && config.voice) || {};
  wordKey = typeof v.wordKey === 'string' ? v.wordKey : 'word-';
  try {
    await clips.init(
      v.manifest || 'assets/audio/manifest.json',
      v.lines || 'data/lines.json',
      {},
    );
  } catch {
    // voice-clips is documented never to reject; belt and braces so a voice
    // problem can never stop the game from booting.
  }
  ready = true;
  return hasClip('welcome');
}

/** Cheap and idempotent — §3.1 calls this on EVERY pointerdown, not just the first. */
export function unlock() {
  try { clips.unlock(); } catch { /* a failed unlock retries on the next gesture */ }
}

export function stop() {
  token += 1;
  try { clips.stop(); } catch { /* ignore */ }
  try { speech.stop(); } catch { /* ignore */ }
}

export function setMuted(value) {
  muted = Boolean(value);
  if (muted) stop();
  return muted;
}

export function isMuted() {
  return muted;
}

/** The manifest entry for a key, or null when this key ships unrecorded. */
export function hasClip(key) {
  try { return Boolean(clips.clipInfo(key)); } catch { return false; }
}

/** Pass-through for the talking-mouth style hook; unused in v1 but free. */
export function onClip(cb) {
  return clips.onClip(cb);
}

/** The shared word-clip key for a word: `word-cat` (§3.3). */
export function keyForWord(word) {
  return wordKey + word;
}

// ---- speaking -------------------------------------------------------------

/**
 * Speak one line. Resolves when it finishes (bounded — voice-clips guarantees
 * the promise settles). Stops whatever was playing first.
 */
export function say(key) {
  return sayInternal(key).promise;
}

// Returns the sequencing token this line owns alongside its promise, so seq()
// can tell "my own line finished" from "something else interrupted me".
function sayInternal(key) {
  const id = ++token;
  if (muted || !key || !ready) return { id, promise: Promise.resolve() };
  const info = (() => { try { return clips.clipInfo(key); } catch { return null; } })();
  push(info ? 'clip' : 'speech', key, info ? info.file : null);
  let promise;
  try {
    promise = clips.say(key) || Promise.resolve();
  } catch {
    promise = Promise.resolve();
  }
  return { id, promise };
}

/** Speak a word through its shared clip (`word-<w>`). */
export function sayWord(word) {
  return say(keyForWord(word));
}

/**
 * Speak a composed sequence (§3.4). `steps` is a list of either a key string
 * or `{ key, gap }` where `gap` is the pause in ms BEFORE that step — the
 * §3.4 table's gap column. `scale` multiplies every gap (fastTimers).
 *
 * The sequence aborts silently the moment anything else speaks, so a tap
 * during the case prompt simply replaces it rather than fighting it.
 */
export async function seq(steps, scale = 1) {
  if (muted || !steps || !steps.length) return;
  let mine = ++token;
  for (let i = 0; i < steps.length; i += 1) {
    const step = typeof steps[i] === 'string' ? { key: steps[i] } : steps[i];
    if (!step || !step.key) continue;
    if (step.gap) {
      await wait(step.gap * scale);
      if (mine !== token) return;     // something else spoke during the gap
    }
    const spoken = sayInternal(step.key);
    mine = spoken.id;
    await spoken.promise;
    if (mine !== token) return;       // superseded while the line played
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
