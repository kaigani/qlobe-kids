// narrator.js — the game's one voice.
//
// Every polished game grew the same ~25-line block: a `say()` that mirrors the
// spoken line into an aria-live announcer, gates on a mute flag and delegates to
// voice-clips; a `saySequence()` that speaks several lines in a row; and a
// monotonic token so that when the child interrupts — taps a new card, hits
// replay, goes home — the in-flight sequence stops instead of waking up two
// beats later and talking over the newer line. (sound-painting/js/main.js,
// sand-tray-letters/js/game.js and rhyming-detective/js/voice.js are three
// hand-rolled copies of exactly this.) One factory now, so the token discipline
// is written once and can't be half-implemented in game twenty-one.
//
// Contract (docs/shared-platform-refactor.md):
//   createNarrator({ say, saySeq, announcerParent }) ->
//     { say(key, fallbackText), saySequence(parts), stop(),
//       setMuted(on), isMuted(), dispose(), token }
//   saySequence() parts accept a per-step `gap` (ms, pause BEFORE that step) —
//   the sequencing-gap column bug-hotel-observer/js/voice.js and
//   rhyming-detective/js/voice.js each hand-roll their own copy of. `token` is
//   the read-only interrupt counter, for a caller that needs to tell "my line
//   finished" from "something newer interrupted" without its own shadow
//   counter (sound-painting/js/main.js used to keep one).
//
// Muting silences audio only. The announcer keeps updating, because a screen
// reader user has muted nothing — the game's own sound toggle is not their
// assistive tech's volume.

import * as voiceClips from './voice-clips.js';

/**
 * Normalise one saySequence() part into { key, text, gap }.
 * Accepts 'key' | ['key', 'spoken text'] | { key, text, gap } | { key, fallbackText, gap }.
 * `gap` (ms) is a pause BEFORE this step — the §3.5-style gap column every
 * hand-rolled sequencer (bug-hotel-observer/js/voice.js,
 * rhyming-detective/js/voice.js) re-implements identically.
 */
function normalizePart(part) {
  if (Array.isArray(part)) return { key: part[0], text: part[1], gap: 0 };
  if (part && typeof part === 'object') {
    return {
      key: part.key,
      text: part.text != null ? part.text : part.fallbackText,
      gap: Number(part.gap) || 0,
    };
  }
  return { key: part, text: undefined, gap: 0 };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * Build a narrator.
 *
 * @param {object} [opts]
 * @param {(key: string, fallbackText?: string) => Promise<any>} [opts.say]
 *   speak one line; defaults to voice-clips `say`.
 * @param {(parts: any[]) => Promise<any>} [opts.saySeq]
 *   speak a whole sequence in one call. Defaults to speaking the parts one at a
 *   time through `say`. Supply this only when the underlying voice layer has its
 *   own inter-line timing worth keeping.
 * @param {() => void} [opts.stop] cancel in-flight audio; defaults to
 *   voice-clips `stop` (which also cancels Web Speech).
 * @param {Node|null} [opts.announcerParent=document.body] where the aria-live
 *   node is appended. Pass null to skip the announcer entirely.
 * @returns {{say: Function, saySequence: Function, stop: Function,
 *            setMuted: Function, isMuted: Function, dispose: Function,
 *            announcer: HTMLElement|null}}
 */
export function createNarrator({
  say: sayFn,
  saySeq: saySeqFn,
  stop: stopFn,
  announcerParent = typeof document !== 'undefined' ? document.body : null,
} = {}) {
  const speakOne = typeof sayFn === 'function' ? sayFn : voiceClips.say;
  const speakSeq = typeof saySeqFn === 'function' ? saySeqFn : null;
  const cancel = typeof stopFn === 'function' ? stopFn : voiceClips.stop;

  // Monotonic. Bumped by say(), saySequence() and stop(); a sequence compares
  // the token it captured after every await and bails the moment it is stale.
  let token = 0;
  let muted = false;
  let disposed = false;

  let announcer = null;
  if (announcerParent && typeof document !== 'undefined') {
    announcer = document.createElement('p');
    announcer.className = 'visually-hidden'; // shipped by shared/css/base.css
    announcer.setAttribute('aria-live', 'polite');
    announcerParent.appendChild(announcer);
  }

  function announce(text) {
    if (announcer && typeof text === 'string' && text) announcer.textContent = text;
  }

  /** Speak without touching the token — the sequence owns its own token. */
  function speakInternal(key, fallbackText) {
    announce(fallbackText);
    if (muted || disposed) return Promise.resolve();
    try {
      return Promise.resolve(speakOne(key, fallbackText));
    } catch {
      return Promise.resolve(); // a broken voice layer must never strand a game
    }
  }

  /**
   * Speak one line. Supersedes anything already talking, including an in-flight
   * saySequence().
   * @returns {Promise<void>} resolves when the line finishes (or immediately
   *   when muted) — never rejects.
   */
  function say(key, fallbackText) {
    token += 1;
    return speakInternal(key, fallbackText).then(() => undefined);
  }

  /**
   * Speak several lines back to back. A newer say()/saySequence()/stop() cancels
   * whatever is left.
   * @param {Array<string | [string, string] | {key: string, text?: string, gap?: number}>} parts
   *   `gap` (ms) is an optional pause BEFORE that step; omit/0 for back-to-back.
   * @returns {Promise<void>}
   */
  async function saySequence(parts) {
    const mine = ++token;
    if (!parts || !parts.length) return;
    if (muted || disposed) {
      // Still announce the text — muting is an audio decision, not an a11y one.
      for (const part of parts) announce(normalizePart(part).text);
      return;
    }
    if (speakSeq) {
      for (const part of parts) announce(normalizePart(part).text);
      try {
        await speakSeq(parts);
      } catch { /* never strand the caller */ }
      return;
    }
    for (const part of parts) {
      if (mine !== token || muted || disposed) return;
      const { key, text, gap } = normalizePart(part);
      if (gap) {
        await wait(gap);
        if (mine !== token || muted || disposed) return; // something else spoke during the gap
      }
      await speakInternal(key, text);
      // Re-check AFTER the await: the line we just spoke may have been cut off
      // mid-word by a newer say(), and continuing would talk over it.
      if (mine !== token) return;
    }
  }

  /** Stop talking now, and invalidate any in-flight sequence. */
  function stop() {
    token += 1;
    try {
      cancel();
    } catch { /* ignore */ }
  }

  /** Mute the voice. Muting stops whatever is currently speaking. */
  function setMuted(on) {
    const next = !!on;
    if (next === muted) return;
    muted = next;
    if (muted) stop();
  }

  function isMuted() {
    return muted;
  }

  /** Stop, drop the announcer node, and make every later call a no-op. */
  function dispose() {
    if (disposed) return;
    stop();
    disposed = true;
    if (announcer && announcer.parentNode) announcer.parentNode.removeChild(announcer);
    announcer = null;
  }

  return {
    say,
    saySequence,
    stop,
    setMuted,
    isMuted,
    dispose,
    get announcer() { return announcer; },
    // Read-only: the current interrupt token, for a caller that needs to tell
    // "my own line finished" from "something newer interrupted me" without
    // keeping its own shadow counter (sound-painting/js/main.js used to).
    get token() { return token; },
  };
}
