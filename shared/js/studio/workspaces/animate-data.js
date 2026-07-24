// animate-data.js — DOM-free pure logic for the Animate workspace (WP-1c).
//
// Extracted from the legacy inline editor in shared/js/stage/puppet-studio.html
// (mode=animate) so both the browser workspace (animate.js) and the Node parity
// harness (tools/parity-animate.mjs) share ONE clip-resolution + keyframe-edit
// path. Nothing here touches the DOM, PixiJS, fetch, spline.js or tween.js — it
// is exercised in Node without a browser, and (like rig-data.js) it has ZERO
// imports so the parity harness can load its exact source as a data: URL.
//
// The Animate workspace edits ONLY the character's own rig.clips (character-local
// clips). Shared-pack clips are surfaced as read-only "inherited" previews; they
// are never materialized into rig.json — that would break rig.json parity and
// violate reuse-before-specialization (a rig-tuned clip already wins at runtime,
// so copying the pack version in is redundant). See resolveClips() below.

// Shared clip packs, filenames relative to shared/characters/. Ordered as they
// layer for preview (default baseline first, acting emotions second).
export const CLIP_PACK_FILES = ['default-clips.json', 'acting-clips.json'];

// ---------------------------------------------------------------------------
// CLIP RESOLUTION — what set of clips a character can perform, and where each
// one comes from.
//
// THE CODE (authoritative), as read on 2026-07-24:
//   * puppet.js createPuppet() compiles `rig.clips` ONLY — it never sees a pack.
//   * theater.js:251 builds the runtime rig as
//         { ...baseRig, clips: { ...pack.clips, ...gameClips, ...baseRig.clips } }
//     where `pack` is acting-clips.json ALONE. Object-spread = last wins, so the
//     runtime precedence is:  rig.clips  >  gameClips  >  acting-clips.
//   * default-clips.json is NOT merged at runtime. It is a BUILD-TIME seed:
//     puppet-builder.js makeRig() copies it into each new rig.json, so every
//     shipped rig already carries idle/wave/walk/jump/talk inline as its OWN
//     (character-local) clips.
//
// resolveClips() folds BOTH packs under the rig for preview completeness (a
// future rig missing a baseline clip would still be previewable). Because every
// shipped rig overrides all five default names, for the 8 rigged characters this
// is byte-identical (as a clip map) to theater's runtime { ...acting, ...rig }.
// parity-animate.mjs asserts that equality against theater's ACTUAL merge, so if
// a rig ever drifts from the runtime resolution the gate catches it.
//
// No game-level `gameClips` exist here (the Studio edits the shared library, not
// a game config), so that layer is intentionally omitted.
export function resolveClips(rig, { defaultClips = {}, actingClips = {} } = {}) {
  return { ...defaultClips, ...actingClips, ...(rig.clips || {}) };
}

// The EXACT runtime resolution theater.js performs (acting pack under the rig,
// no default-clips). Used by the parity harness as the ground-truth the workspace
// resolution must agree with. gameClips is always empty in the Studio.
export function theaterResolveClips(rig, { actingClips = {} } = {}) {
  return { ...actingClips, ...(rig.clips || {}) };
}

// Split the resolvable clip set into character-local (editable, live in rig.json)
// and inherited (read-only, resolved from the shared packs at runtime).
export function classifyClips(rig, packs = {}) {
  const resolved = resolveClips(rig, packs);
  const local = Object.keys(rig.clips || {});
  const localSet = new Set(local);
  const inherited = Object.keys(resolved).filter((name) => !localSet.has(name));
  return { local, inherited, resolved };
}

// True when `name` is a character-local clip the workspace may edit.
export function isLocalClip(rig, name) {
  return !!(rig.clips && Object.prototype.hasOwnProperty.call(rig.clips, name));
}

// ---------------------------------------------------------------------------
// KEYFRAME EDITS — pure mutations of a single clip object, mirroring the legacy
// setKey / delKeyAt / round3 semantics exactly. Callers gate these on a
// character-local clip; they never touch the DOM.

export const round3 = (v) => Math.round(v * 1000) / 1000;

export function ensureTrack(clip, target, prop) {
  let track = (clip.tracks || (clip.tracks = [])).find((x) => x.target === target && x.prop === prop);
  if (!track) { track = { target, prop, keys: [] }; clip.tracks.push(track); }
  return track;
}

// Set (or update) a key at time t on the (target, prop) track. t is clamped to
// 0..1 and quantized to 1e-3; a key within 0.02 of t is updated in place.
export function setKeyOn(clip, target, prop, t, v) {
  const track = ensureTrack(clip, target, prop);
  t = Math.round(Math.max(0, Math.min(1, t)) * 1000) / 1000;
  const existing = track.keys.find((k) => Math.abs(k.t - t) < 0.02);
  if (existing) existing.v = round3(v); else track.keys.push({ t, v: round3(v) });
  track.keys.sort((a, b) => a.t - b.t);
  return track;
}

// Delete the key nearest t (within 0.06) on the (target, prop) track; drop the
// track entirely when it empties. Mirrors legacy delKeyAt.
export function delKeyAt(clip, target, prop, t) {
  const track = (clip.tracks || []).find((x) => x.target === target && x.prop === prop);
  if (!track) return;
  let best = -1, bestDist = 1;
  track.keys.forEach((k, i) => { const d = Math.abs(k.t - t); if (d < bestDist) { bestDist = d; best = i; } });
  if (best >= 0 && bestDist < 0.06) track.keys.splice(best, 1);
  if (!track.keys.length) clip.tracks.splice(clip.tracks.indexOf(track), 1);
}

// Every keyframe time used by ANY track in the clip (the union that drives the
// timeline's "ghost" jump markers). Pure; returns a sorted number array.
export function clipKeyTimes(clip) {
  const times = new Set();
  for (const track of clip?.tracks || []) for (const k of track.keys) times.add(k.t);
  return [...times].sort((a, b) => a - b);
}
