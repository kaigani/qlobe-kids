// word-tap.js — the read-along mechanic: one line of print, one tappable chip
// per word, spoken on every tap, and no way past the line except by touching
// every word in it at least once.
//
// This is the whole reading interaction of the game, so it is deliberately
// small and self-contained: it owns the chips, their tapped state, and the
// "line is finished" signal. It owns NO story knowledge (main.js supplies the
// text and the keys) and NO styling beyond toggling predictable classes and
// data-attributes for css/style.css to paint.
//
// Contract notes that matter for the child:
//   - Re-tapping a word ALWAYS replays it. Repetition is the pedagogy; there is
//     no penalty, no lockout, no "you already did that" state.
//   - The line cannot be skipped. There is no advance button, no timeout, no
//     tap-anywhere-to-continue. `onComplete` fires exactly once, after the last
//     untapped word has been tapped.
//   - Every chip is a real <button>, so keyboard/AT activation works and
//     tap.js's pointerup path is the same press path the finger uses.

import { onTap } from '../../../shared/js/tap.js';
import * as sfx from '../../../shared/js/sfx.js';

/**
 * The manifest key form of a token: lowercased, stripped of everything that is
 * not a letter, digit or an internal apostrophe. "map." -> "map",
 * "Hop," -> "hop", "can't" -> "can't". Exported because main.js and the QA
 * driver both need to reason about coverage against assets/audio/manifest.json.
 * @param {string} token
 * @returns {string}
 */
export function wordKey(token) {
  return String(token == null ? '' : token)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '')
    .replace(/[^a-z0-9']/g, '');
}

/**
 * Split a line into display tokens (whitespace-separated, punctuation kept for
 * display) plus their manifest keys.
 * @param {string} line
 * @returns {Array<{index: number, text: string, key: string}>}
 */
export function tokenize(line) {
  return String(line == null ? '' : line)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((text, index) => ({ index, text, key: wordKey(text) }));
}

/**
 * Render one line as tappable words.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.host        emptied and filled with the chips
 * @param {string} opts.line             the line's text
 * @param {string} opts.nodeId           story node id (goes on the host, for QA)
 * @param {number} opts.lineIndex        index within the node
 * @param {object} opts.voice            voice-clips module (say/unlock)
 * @param {(info: {index: number, key: string, text: string, first: boolean}) => void} [opts.onWordTap]
 * @param {() => void} [opts.onComplete] fired ONCE, when the last word is tapped
 * @returns {object} the line controller (see the returned object below)
 */
export function createWordLine({
  host,
  line,
  nodeId = '',
  lineIndex = 0,
  voice,
  onWordTap,
  onComplete,
} = {}) {
  const tokens = tokenize(line);
  const tapped = new Array(tokens.length).fill(false);
  const disposers = [];
  const buttons = [];
  let completed = false;
  let completionPending = false;
  let destroyed = false;
  let locked = false;

  host.textContent = '';
  host.classList.add('trt-word-line');
  host.dataset.nodeId = nodeId;
  host.dataset.lineIndex = String(lineIndex);
  host.dataset.wordCount = String(tokens.length);
  host.dataset.complete = 'false';
  host.setAttribute('aria-label', line || '');

  for (const token of tokens) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'trt-word';
    btn.dataset.wordIndex = String(token.index);
    btn.dataset.word = token.key;
    btn.dataset.tapped = 'false';
    // data-target is the QLOBE_DEBUG v1 target vocabulary — a reviewer taps
    // `word-0`, not a CSS selector that the next styling pass may rename.
    btn.dataset.target = `word-${token.index}`;
    btn.dataset.role = 'word';
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', token.key || token.text);
    btn.textContent = token.text;
    host.appendChild(btn);
    buttons.push(btn);

    disposers.push(onTap(btn, () => tapIndex(token.index), {
      feedback: () => {
        // Every gesture re-unlocks: iPadOS revokes playback across an app
        // switch and the chips are the most-touched control in the game.
        try { voice && voice.unlock && voice.unlock(); } catch { /* never block a tap */ }
        try { sfx.tick(); } catch { /* audio is never load-bearing */ }
      },
    }));
  }

  /**
   * Tap word `index` — the SAME path a real pointer takes, which is what
   * QLOBE_DEBUG.tapWord() calls.
   * @param {number} index
   * @returns {boolean} whether the index existed
   */
  function tapIndex(index) {
    // `locked` is on ONLY while the narrator is reading the finished line and
    // the puppets are performing it. Replaying a word over the top of that
    // would cut the narration off mid-sentence (voice-clips has one channel).
    // Outside that window every tap, including a repeat, always speaks.
    if (destroyed || locked || completionPending) return false;
    const token = tokens[index];
    if (!token) return false;
    const first = !tapped[index];
    tapped[index] = true;

    const btn = buttons[index];
    if (btn) {
      btn.dataset.tapped = 'true';
      btn.setAttribute('aria-pressed', 'true');
      btn.classList.add('is-tapped');
      // Restartable one-shot class for the CSS pass to hang a pop/pulse on.
      btn.classList.remove('is-speaking');
      void btn.offsetWidth;
      btn.classList.add('is-speaking');
    }

    // Recorded clip when this word is in the manifest; Web Speech otherwise.
    // say() falls back on its own, so a word outside the recorded vocabulary
    // is still spoken — a chip must never be silent.
    let wordSpeech = Promise.resolve();
    if (voice && typeof voice.say === 'function') {
      try {
        // Keep the promise for the final word. The line narrator must not
        // start until this word's clip (or speech fallback) has finished.
        wordSpeech = Promise.resolve(voice.say(`word:${token.key}`, token.key || token.text));
      } catch {
        // Audio is never load-bearing; a synchronous voice failure should not
        // strand the reader on a completed line.
        wordSpeech = Promise.resolve();
      }
    }

    if (typeof onWordTap === 'function') {
      try { onWordTap({ index, key: token.key, text: token.text, first }); } catch { /* never break a tap */ }
    }

    if (!completed && tapped.every(Boolean)) {
      completed = true;
      host.dataset.complete = 'true';
      host.classList.add('is-complete');
      for (const el of buttons) el.classList.add('is-line-complete');
      if (typeof onComplete === 'function') {
        completionPending = true;
        // The final chip paints immediately, but the performance waits for
        // its word audio. Otherwise voice.say(line) supersedes voice.say(word)
        // on the shared channel and the last word is effectively skipped.
        wordSpeech.then(() => {
          if (!destroyed) onComplete();
        }, () => {
          if (!destroyed) onComplete();
        });
      }
    }
    return true;
  }

  /** Tap every word that has not been tapped yet (QLOBE_DEBUG.tapAllWords). */
  function tapAll() {
    for (let i = 0; i < tokens.length; i += 1) {
      if (!tapped[i]) tapIndex(i);
    }
    return tokens.length;
  }

  /** Stop accepting input (the line has been read and is performing). */
  function lock() {
    locked = true;
    host.dataset.locked = 'true';
    for (const btn of buttons) btn.dataset.locked = 'true';
  }
  function unlock() {
    locked = false;
    delete host.dataset.locked;
    for (const btn of buttons) delete btn.dataset.locked;
  }

  function destroy() {
    destroyed = true;
    for (const dispose of disposers) {
      try { dispose(); } catch { /* ignore */ }
    }
    disposers.length = 0;
    host.textContent = '';
    host.classList.remove('is-complete');
    host.dataset.complete = 'false';
  }

  return {
    /** the chip host element */
    el: host,
    /** the parsed tokens, `{ index, text, key }` */
    tokens: tokens.slice(),
    /** the line's text as given */
    text: line,
    tap: tapIndex,
    tapAll,
    lock,
    unlock,
    destroy,
    /** indices tapped so far, ascending */
    tappedIndices: () => tokens.map((t) => t.index).filter((i) => tapped[i]),
    /** manifest keys tapped so far, in line order */
    tappedWords: () => tokens.filter((t) => tapped[t.index]).map((t) => t.key),
    /** how many distinct words are still untapped */
    remaining: () => tapped.filter((done) => !done).length,
    isComplete: () => completed,
    isLocked: () => locked,
  };
}
