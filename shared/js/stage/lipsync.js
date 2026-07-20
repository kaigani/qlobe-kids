// lipsync.js — drive a puppet's viseme head-swap from a Rhubarb cue timeline.
//
// Rhubarb Lip Sync emits mouth shapes A–H plus X (rest), where B is the common
// "slightly-open" workhorse. This maps those to a rig's viseme head names and
// walks the timeline against an <audio> element via mouth.js followCues.

import { followCues } from './mouth.js';

// Rhubarb shape (lowercased) → rig viseme name. Tuned so the mouth actually
// opens on the frequent B shape (EE / S / T / D / K / N / R), and closes on the
// plosives A (P / B / M) — the ones that must read as shut.
export const RHUBARB_TO_VISEME = {
  x: 'rest',   // silence
  a: 'mbp',    // P, B, M  — lips closed
  b: 'ts',     // generic consonants — slightly open
  c: 'e',      // EH, AE   — open
  d: 'a',      // AA       — wide open
  e: 'o',      // AO, ER   — rounded
  f: 'uq',     // UW, UH — puckered
  g: 'fv',     // F, V
  h: 'ln',     // L
};

// Pass this as `map` when the cue `value`s are already this rig's viseme names
// (e.g. cues produced by the faster-whisper + CMUdict generator) rather than
// Rhubarb A–H letters.
export const VISEME_IDENTITY = Object.fromEntries(
  ['rest', 'a', 'o', 'e', 'wr', 'ts', 'ln', 'uq', 'mbp', 'fv'].map((v) => [v, v]));

/**
 * Drive lip-sync. Returns a stop() function.
 * @param puppet   a createPuppet() instance (uses puppet.setViseme)
 * @param audioEl  a playing (or about-to-play) HTMLAudioElement
 * @param cues     Rhubarb mouthCues array [{start,end,value}]
 * @param opts.offsetMs  positive delays the visemes to match delayed audio
 *   output (e.g. ~150–250ms for Bluetooth); negative makes them lead.
 * @param opts.map  override RHUBARB_TO_VISEME.
 */
export function driveLipsync(puppet, audioEl, cues, { offsetMs = 0, map = RHUBARB_TO_VISEME } = {}) {
  const off = offsetMs / 1000;
  const shifted = off ? cues.map((c) => ({ start: c.start + off, end: c.end + off, value: c.value })) : cues;
  const stopFollow = followCues(audioEl, shifted, (s) => puppet.setViseme(map[s] || 'rest'));
  // Guarantee the mouth returns to closed-neutral the instant playback stops —
  // event-driven, so it never gets left holding the last talking shape (an rAF
  // loop can miss the moment the audio ends).
  const rest = () => puppet.setViseme('rest');
  audioEl.addEventListener('ended', rest);
  audioEl.addEventListener('pause', rest);
  return () => {
    stopFollow();
    audioEl.removeEventListener('ended', rest);
    audioEl.removeEventListener('pause', rest);
    rest();
  };
}
