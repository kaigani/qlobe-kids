// voice.js — Rhyming Detective's one voice.
//
// game-design.md §3. Most of what used to live here is now shared/js/voice-clips.js:
// the mute gate, the QLOBE_DEBUG audio ring buffer (§7.4) and the recorded-clip /
// Web Speech decision are the shared player's own job. What survives is the part
// that is genuinely this game's:
//
//   * init() reads `config.voice` (manifest path, lines path, word-key prefix),
//   * keyForWord()/sayWord() encode the shared `word-<w>` clip key (§3.3),
//   * seq() is the §3.4 gap-aware sequencer — a pause BEFORE each step, and the
//     whole sequence abandons itself the moment anything else speaks (§3.1
//     "interruption is always allowed"). narrator.js's saySequence has no gap
//     column, so this one stays local.
//
// It MUST survive `assets/audio/manifest.json` being absent — the shell ships
// before the voice pack does. voice-clips.init() never rejects: a 404 on the
// manifest leaves every say() falling through to speech.js with the text from
// data/lines.json. Nothing here may assume a clip exists.

import * as clips from '../../../shared/js/voice-clips.js';

let ready = false;
let wordKey = 'word-';

// Monotonic token: a new say()/seq()/stop() supersedes any pending sequence step
// so an interrupted line can never resume two beats later. voice-clips has a
// token of its own for the audio element; this one is about the SEQUENCE, which
// only this module knows exists.
let token = 0;

// The shared player owns these outright now — re-exported so call sites (and the
// QLOBE_DEBUG extensions in main.js) keep reading as "the game's voice".
export {
  unlock,
  isMuted,
  getAudioLog,
  clearAudioLog,
} from '../../../shared/js/voice-clips.js';

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
  try { return Boolean(clips.clipInfo('welcome')); } catch { return false; }
}

/** Stop talking, and invalidate any sequence still walking its steps. */
export function stop() {
  token += 1;
  try { clips.stop(); } catch { /* ignore */ }
}

export function setMuted(value) {
  const on = Boolean(value);
  if (on) stop();          // bump the token too: mute must kill a running seq
  clips.setMuted(on);
  return on;
}

/** The shared word-clip key for a word: `word-cat` (§3.3). */
export function keyForWord(word) {
  return wordKey + word;
}

// ---- speaking -------------------------------------------------------------

// Speak one line and report the token it owns, so seq() can tell "my own line
// finished" from "something else interrupted me".
function speakInternal(key) {
  const id = ++token;
  if (!ready || !key) return { id, promise: Promise.resolve() };
  let promise;
  try {
    promise = clips.say(key) || Promise.resolve();
  } catch {
    promise = Promise.resolve();
  }
  return { id, promise };
}

/**
 * Speak one line. Resolves when it finishes (bounded — voice-clips guarantees
 * the promise settles). Stops whatever was playing first.
 */
export function say(key) {
  return speakInternal(key).promise;
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
  if (clips.isMuted() || !steps || !steps.length) return;
  let mine = ++token;
  for (let i = 0; i < steps.length; i += 1) {
    const step = typeof steps[i] === 'string' ? { key: steps[i] } : steps[i];
    if (!step || !step.key) continue;
    if (step.gap) {
      await wait(step.gap * scale);
      if (mine !== token) return;     // something else spoke during the gap
    }
    const spoken = speakInternal(step.key);
    mine = spoken.id;
    await spoken.promise;
    if (mine !== token) return;       // superseded while the line played
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
