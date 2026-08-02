// voice.js — Bug Hotel Observer's wrapper around shared/js/voice-clips.js.
//
// game-design.md §3. Everything the game speaks goes through here so that:
//   * one place decides recorded-clip vs Web Speech (voice-clips does the work),
//   * one place owns the §3.5 sequencing gaps and can abandon a sequence the
//     instant the child does something else ("interruption is always allowed"),
//   * one place feeds the QLOBE_DEBUG audio ring buffer — which is how QA
//     proves a RECORDED clip played and not the system speech voice (§7).
//
// It MUST survive `assets/audio/manifest.json` being absent: the shell ships
// before the voice pack (P5) does. `voice-clips.init()` never rejects, a 404
// leaves the manifest null, and every say() falls through to speech.js with the
// exact same string from `tools/lines.json`. Nothing here may assume a clip
// exists — not even to time a beat, which is why `speakFor()` exists.

import * as clips from '../../../shared/js/voice-clips.js';
import * as speech from '../../../shared/js/speech.js';

let ready = false;
let muted = false;

// `tools/lines.json`, verbatim. voice-clips.js loads the same file for its own
// speech fallback; this second copy exists because the REWARD SPREAD PRINTS THE
// FACT (§8.2 row 14, adults only) and a fact card that read differently from
// the sentence the child just heard would be worse than no card at all. One
// file, one string, two consumers — the browser serves the second from cache.
let lineTable = {};

// Monotonic token: a new say()/seq()/stop() supersedes any pending sequence
// step, so an interrupted line can never resume two beats later.
let token = 0;

// How many lines are in the air. The idle ladder reads it: a nudge that lands
// on top of the sentence the child is still listening to is worse than no nudge
// at all, and it is the exact thing a sped-up QA clock provokes (game beats
// scale with `fastTimer`; a speech engine does not).
let speaking = 0;

// ---- audio ring buffer (QLOBE_DEBUG.getAudioLog) --------------------------

const LOG_MAX = 120;
const log = [];

function push(source, id, file) {
  log.push({ id, source, at: Math.round(performance.now()), file: file || null });
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
  const linesUrl = v.lines || 'tools/lines.json';
  try {
    await clips.init(v.manifest || 'assets/audio/manifest.json', linesUrl, {});
  } catch {
    // voice-clips is documented never to reject; belt and braces, because a
    // voice problem must never stop the game from booting.
  }
  try {
    const res = await fetch(linesUrl);
    if (res.ok) {
      const json = await res.json();
      if (json && typeof json === 'object') lineTable = json;
    }
  } catch {
    // No lines file: the fact card simply stays empty. The child still hears
    // the fact from whichever voice is available.
  }
  ready = true;
  return hasClip('welcome');
}

/**
 * The exact spoken text of a line, for the adult-facing fact card. Accepts both
 * `{ key: "text" }` and `{ key: { text } }`, the two shapes the platform's
 * voice pipelines have produced.
 */
export function text(key) {
  const value = lineTable[key];
  if (typeof value === 'string') return value;
  return value && typeof value.text === 'string' ? value.text : '';
}

/** Cheap and idempotent — §3.1 calls this on EVERY gesture, not just the first. */
export function unlock() {
  try { clips.unlock(); } catch { /* a failed unlock retries on the next gesture */ }
}

export function stop() {
  token += 1;
  try { clips.stop(); } catch { /* ignore */ }
  try { speech.stop(); } catch { /* ignore */ }
  // A stopped clip's promise still settles through the wrapper above, so the
  // counter unwinds on its own; this only makes the common case immediate.
  if (speaking > 0) speaking = 0;
}

export function setMuted(value) {
  muted = Boolean(value);
  if (muted) stop();
  return muted;
}

export function isMuted() {
  return muted;
}

/** True while any line is still playing. Never blocks input — only voice. */
export function isSpeaking() {
  return speaking > 0;
}

/** The manifest entry for a key, or null when this line ships unrecorded. */
export function hasClip(key) {
  try { return Boolean(clips.clipInfo(key)); } catch { return false; }
}

/** Recorded duration in ms (the manifest stores SECONDS), 0 when unrecorded. */
export function clipMs(key) {
  try {
    const dur = Number(clips.clipInfo(key)?.dur);
    return Number.isFinite(dur) && dur > 0 ? dur * 1000 : 0;
  } catch { return 0; }
}

/** Pass-through for the talking-mouth hook; QA uses it to observe real clips. */
export function onClip(cb) {
  return clips.onClip(cb);
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
  speaking += 1;
  promise = promise.then(
    (v) => { speaking -= 1; return v; },
    () => { speaking -= 1; },
  );
  return { id, promise };
}

/**
 * Speak a sequence (§3.5). `steps` is a list of either a key string or
 * `{ key, gap }`, where `gap` is the pause in ms BEFORE that step — exactly the
 * gap column of the §3.5 table. `scale` multiplies every gap (fastTimer).
 *
 * The sequence abandons itself silently the moment anything else speaks, so a
 * tap during the room prompt replaces it rather than fighting it.
 */
export async function seq(steps, scale = 1) {
  if (muted || !steps || !steps.length) return;
  let mine = ++token;
  for (let i = 0; i < steps.length; i += 1) {
    const raw = steps[i];
    const step = typeof raw === 'string' ? { key: raw } : raw;
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

/**
 * Speak a line and resolve when it is DONE — with a hard ceiling, because the
 * §9.6 sticker flight hangs off the end of the fact clip and a Web Speech
 * fallback that a browser silently refuses to start would otherwise leave the
 * child looking at a spread that never resolves into a sticker.
 *
 * @param {string} key
 * @param {number} [capMs=2400] the §9.6 "or +2.4 s under a speech fallback"
 * @param {number} [scale=1]    fastTimer scale, applied to the cap only
 */
export function speakFor(key, capMs = 2400, scale = 1) {
  const spoken = say(key);
  return Promise.race([spoken, wait(capMs * scale)]);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
