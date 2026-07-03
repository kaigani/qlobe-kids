// speech.js — thin wrapper over the Web Speech API (speechSynthesis).
// All spoken text comes from data.js `spoken` strings. No recorded audio.

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

let chosenVoice = null;
let voicesReady = false;

// iOS GC bug: utterances can be collected mid-speech and go silent. Keep refs.
const liveUtterances = new Set();

/** Pick the friendliest available local English voice, once. */
function pickVoice() {
  if (!synth) return;
  const voices = synth.getVoices();
  if (!voices || !voices.length) return;
  voicesReady = true;

  const byName = (needle) =>
    voices.find((v) => v.name && v.name.toLowerCase().includes(needle));

  chosenVoice =
    byName('samantha') ||
    byName('karen') ||
    byName('google us english') ||
    voices.find((v) => v.lang === 'en-US' && v.localService) ||
    voices.find((v) => v.lang && v.lang.startsWith('en') && v.localService) ||
    voices.find((v) => v.lang && v.lang.startsWith('en')) ||
    voices[0] ||
    null;
}

if (synth) {
  pickVoice();
  synth.addEventListener('voiceschanged', pickVoice);
  // Some engines pause when the tab is hidden then never resume cleanly.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && synth) {
      try { synth.resume(); } catch { /* ignore */ }
    }
  });
}

/**
 * Unlock speech on the first user gesture (iOS requires an in-gesture utterance).
 */
export function unlock() {
  if (!synth) return;
  try {
    if (!voicesReady) pickVoice();
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    if (chosenVoice) u.voice = chosenVoice;
    synth.speak(u);
  } catch { /* ignore */ }
}

/**
 * Speak a single phrase. Resolves when speech ends (or immediately if no synth).
 * @param {string} text
 * @param {{rate?:number, pitch?:number, cancel?:boolean}} [opts]
 * @returns {Promise<void>}
 */
export function speak(text, opts = {}) {
  if (!synth || !text) return Promise.resolve();
  const { rate = 0.8, pitch = 1.05, cancel = true } = opts;

  return new Promise((resolve) => {
    try {
      // iOS: cancel stale queue before each batch
      if (cancel) synth.cancel();
      if (!chosenVoice) pickVoice();

      const u = new SpeechSynthesisUtterance(String(text));
      u.rate = rate;
      u.pitch = pitch;
      u.lang = (chosenVoice && chosenVoice.lang) || 'en-US';
      if (chosenVoice) u.voice = chosenVoice;

      liveUtterances.add(u);
      const done = () => {
        liveUtterances.delete(u);
        resolve();
      };
      u.onend = done;
      u.onerror = done;

      // Safety: never hang the game loop if the engine drops the events.
      const guardMs = 1500 + String(text).length * 90;
      setTimeout(done, guardMs);

      synth.speak(u);
    } catch {
      resolve();
    }
  });
}

/**
 * Speak a sequence of fragments with small gaps between them.
 * @param {string[]} parts
 * @param {{rate?:number, pitch?:number, gap?:number}} [opts]
 * @returns {Promise<void>}
 */
export async function speakSeq(parts, opts = {}) {
  if (!synth || !parts || !parts.length) return;
  const { gap = 250 } = opts;
  for (let i = 0; i < parts.length; i++) {
    // only cancel the queue on the first fragment of the batch
    await speak(parts[i], { ...opts, cancel: i === 0 });
    if (i < parts.length - 1) await wait(gap);
  }
}

/** Stop everything immediately. */
export function stop() {
  if (synth) {
    try { synth.cancel(); } catch { /* ignore */ }
  }
  liveUtterances.clear();
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
