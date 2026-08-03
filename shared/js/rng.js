// rng.js — the one seeded random source for the platform.
//
// Half a dozen engines and games each carried their own private copy of
// mulberry32 + Fisher-Yates. They were the same algorithm written three ways,
// which is fine until a QLOBE_DEBUG `seed(42)` run has to reproduce and two of
// the copies disagree about whether shuffle mutates its input.
//
// This module is the canonical copy. `mulberry32` is bit-identical to the
// engine copies it replaces, so a migrated game reproduces the sequences its
// old private copy produced for the same seed.
//
// Zero imports, by design: everything else in shared/ may depend on this.

/**
 * Seeded PRNG — small, fast, and good enough for shuffling picture cards.
 * @param {number} seed  coerced to uint32 (non-numbers become 0)
 * @returns {() => number} generator returning a float in [0, 1)
 */
export function mulberry32(seed) {
  let value = Number(seed) >>> 0;
  return function random() {
    value = (value + 0x6D2B79F5) >>> 0;
    let result = Math.imul(value ^ (value >>> 15), value | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a — turn a string into a uint32, so a game can seed from a stable name
 * ("round-3", a word, a mode id) instead of inventing magic numbers.
 * @param {string} str
 * @returns {number} uint32
 */
export function hashString(str) {
  let hash = 0x811C9DC5; // FNV offset basis
  const text = String(str == null ? '' : str);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0; // FNV prime
  }
  return hash >>> 0;
}

/**
 * Fisher-Yates. Returns a NEW array — callers in the engines pass config data
 * straight in and rely on the source order surviving the call.
 * @param {Array<*>} arr
 * @param {() => number} [rng]  defaults to Math.random
 * @returns {Array<*>} a shuffled copy (never the input)
 */
export function shuffle(arr, rng = Math.random) {
  const result = Array.isArray(arr) ? arr.slice() : [];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * One random element.
 * @param {Array<*>} arr
 * @param {() => number} [rng]  defaults to Math.random
 * @returns {*} undefined for an empty or non-array input
 */
export function pick(arr, rng = Math.random) {
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}
