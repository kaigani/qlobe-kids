// speech-data.js — DOM-free pure logic for the Speech workspace (WP-1d).
//
// Extracted from the legacy inline editor in shared/js/stage/puppet-studio.html
// (mode=speech, the "Speak" tab) so both the browser workspace (speech.js) and
// the Node parity harness (tools/parity-speech.mjs) share ONE
// load/normalize/serialize + cue-edit + validation path. Nothing here touches the
// DOM, PixiJS, fetch, lipsync.js or mouth.js — it is exercised in Node without a
// browser, and (like rig-data.js / animate-data.js) it has ZERO imports so the
// parity harness can load its exact source as a data: URL.
//
// The Speech workspace edits ONLY hand-drawn viseme cues, saved per line through
// POST /api/puppet/cues (NOT /api/studio/document). The voice manifest.json is
// never rewritten by cue editing — it is upserted server-side by the voice-upload
// job (update_voice_manifest). So the two parity targets have different write
// paths but the SAME rule: load -> no-op -> serialize is content-idempotent.

// ---------------------------------------------------------------------------
// VISEME SETS — the canonical rig lip-sync shapes. Must match the server's
// tuple in tools/puppet-studio-server.py:
//   VISEMES     = ("a","o","e","wr","ts","ln","uq","mbp","fv")
//   ALL_VISEMES = ("rest",) + VISEMES
// and lipsync.js VISEME_IDENTITY. The cue editor also offers "rest".
export const CANONICAL_VISEMES = ['a', 'o', 'e', 'wr', 'ts', 'ln', 'uq', 'mbp', 'fv'];
export const ALL_VISEMES = ['rest', ...CANONICAL_VISEMES];
// The set offered in the editor's viseme dropdown (rest first — mirrors legacy
// EDITOR_VISEMES ordering).
export const EDITOR_VISEMES = ['rest', 'a', 'o', 'e', 'wr', 'ts', 'ln', 'uq', 'mbp', 'fv'];
const VISEME_SET = new Set(ALL_VISEMES);

// Cue-band colours for the waveform editor (mirrors legacy CUE_COLORS exactly).
export const CUE_COLORS = {
  rest: '#b8b8b4', a: '#ef5350', o: '#8bc34a', e: '#ff8a3d', wr: '#26a6a1',
  ts: '#4f8dcc', ln: '#7468b7', uq: '#27b9ce', mbp: '#d6428d', fv: '#ffd34d',
};

// ---------------------------------------------------------------------------
// PATHS + ENDPOINTS. Disk paths are what the parity harness deep-compares
// against; the endpoints are the EXISTING /api/puppet/* surface (frozen after
// Phase 1, replaced by /api/studio/* in Phase 3 — do not add new endpoints).
export const voiceManifestPath = (id) => `shared/characters/${id}/voice/manifest.json`;
export const voiceCuesPath = (id, key) => `shared/characters/${id}/voice/${key}.cues.json`;
export const cuesSaveEndpoint = (id, key) =>
  `/api/puppet/cues?id=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`;
export const voicesEndpoint = (id) => `/api/puppet/voices?id=${encodeURIComponent(id)}`;
export const voiceUploadEndpoint = (id, key, opts = {}) => {
  const params = new URLSearchParams({ id, key, ...opts });
  return `/api/puppet/voice?${params}`;
};
export const transcribeEndpoint = (format) =>
  `/api/puppet/transcribe?format=${encodeURIComponent(format)}`;
export const jobEndpoint = (jobId) => `/api/puppet/jobs/${encodeURIComponent(jobId)}`;

// ---------------------------------------------------------------------------
// MANIFEST + CUES load/serialize. The legacy editor performs NO normalization on
// load (`data = await fetch().json()`; `cues = data.mouthCues.map(c => ({...c}))`
// preserves every field and its order). These are therefore identity round-trips,
// kept as named seams so the harness and the workspace share one load path. The
// parity gate is content deep-equality, not bytes — the on-disk voice JSON is
// 1-space-indented generator output, and a real POST /api/puppet/cues re-emits it
// 2-space via json_bytes, but neither the workspace nor the harness serialize to
// disk here, so format is irrelevant to content parity.
export function parseManifest(text) { return JSON.parse(text); }
export function serializeManifest(manifest) { return JSON.stringify(manifest, null, 2) + '\n'; }
export function loadManifest(text) { return parseManifest(text); }

export function parseCues(text) { return JSON.parse(text); }
export function serializeCues(cues) { return JSON.stringify(cues, null, 2) + '\n'; }
export function loadCues(text) { return parseCues(text); }

// The manifest's lines[] as held for save/parity (raw, unmodified).
export function manifestLines(manifest) { return (manifest && manifest.lines) || []; }

// ---------------------------------------------------------------------------
// qlobe-voice-pack v1 ADAPTER (§7.2). Voice manifests carry `schemaVersion` but
// (until first touch) no `format` field. This adapter READS a manifest's identity
// in memory — defaulting the format to qlobe-voice-pack v1 and the id from the
// character — WITHOUT rewriting anything on disk. It is deliberately NOT wired
// into loadManifest/serializeManifest so those stay identity round-trips (the
// parity gate). It exists so the studio/library can display and reason about the
// format, and so first-touch materialization has one canonical shape to write.
// Both shapes are accepted: a present format/formatVersion/id is preserved as-is.
export function voicePackIdentity(manifest, id = null) {
  const m = manifest || {};
  return {
    format: typeof m.format === 'string' ? m.format : 'qlobe-voice-pack',
    formatVersion: Number.isInteger(m.formatVersion) ? m.formatVersion : 1,
    id: typeof m.id === 'string' ? m.id : id,
    materialized: !(typeof m.format === 'string'), // true when defaults were supplied
  };
}

// ---------------------------------------------------------------------------
// RUNTIME LINE RESOLUTION — mirrors the legacy normalizeVoiceLines(). Produces
// the shape the playback UI uses; it is NEVER serialized back (the raw manifest
// is what parity/save touch). `cueMap` is returned as a string tag ('identity' |
// 'rhubarb') so this module stays import-free; speech.js resolves the tag to the
// actual VISEME_IDENTITY / RHUBARB_TO_VISEME map from lipsync.js.
export function resolveVoiceLines(lines) {
  return (lines || []).map((line) => ({
    id: line.id || line.cues?.replace(/^voice\//, '').replace(/\.cues\.json$/, ''),
    label: line.label || line.id || 'Voice line',
    audio: line.audio.startsWith('voice/') ? line.audio : `voice/${line.audio}`,
    cues: line.cues.startsWith('voice/') ? line.cues : `voice/${line.cues}`,
    cueMap: line.cueMap === 'rhubarb' ? 'rhubarb' : 'identity',
    offsetMs: Number.isFinite(+line.offsetMs) ? +line.offsetMs : 0,
    text: typeof line.text === 'string' ? line.text : '',
  }));
}

// The server cues key for a line (its <key>.cues.json stem). Mirrors legacy
// cueLineKey — id first, else derived from the cues filename.
export function cueLineKey(line) {
  return line?.id || line?.cues?.split('/').pop()?.replace(/\.cues\.json$/, '') || '';
}

// ---------------------------------------------------------------------------
// CUE EDITING — pure mutations of a mouthCues array, mirroring the legacy
// updateSelectedCue / splitSelectedCue / deleteSelectedCue / boundary-drag
// semantics exactly. Callers own selection + DOM; these only touch the array.
const r3 = (v) => +Number(v).toFixed(3);

// The cue containing `point` (or the last cue when point is past the end).
export function cueAtTime(cues, point, duration) {
  return cues.find((cue) => point >= cue.start && point < cue.end)
    || (point >= duration ? cues.at(-1) : null);
}

// The save payload the workspace POSTs (legacy saveCueEditor): the line's
// metadata (falling back to {duration}) plus the live cues array. The server's
// validated_cues() rounds/re-orders/strips this on write and stamps editedAt —
// that transform is NOT applied here (it is not idempotent), matching how
// rig/animate parity compares the client payload, not the server re-serialization.
export function buildCuesSavePayload(metadata, cues, duration) {
  return {
    metadata: metadata || { duration },
    mouthCues: cues,
  };
}

// Retime the selected cue from edited (value, start, end), clamped to its
// neighbours exactly as legacy updateSelectedCue did. Mutates cues[index].
export function updateCue(cues, index, { value, start, end }, duration) {
  const cue = cues[index];
  if (!cue) return;
  const previous = cues[index - 1], next = cues[index + 1];
  if (value !== undefined) cue.value = value;
  cue.start = Math.max(previous?.end || 0, Math.min(+start || 0, cue.end - 0.02));
  cue.end = Math.min(next?.start ?? duration, Math.max(+end || 0, cue.start + 0.02));
  cue.start = r3(cue.start); cue.end = r3(cue.end);
  return cue;
}

// Split the selected cue at seekTime (or its midpoint). Returns the new index
// (index+1) or -1 when the cue is too short. Mirrors legacy splitSelectedCue,
// including the sourceValue:'edited' tag on the new half.
export function splitCue(cues, index, seekTime) {
  const cue = cues[index];
  if (!cue || cue.end - cue.start < 0.05) return -1;
  const split = Math.max(cue.start + 0.02, Math.min(cue.end - 0.02,
    seekTime > cue.start && seekTime < cue.end ? seekTime : (cue.start + cue.end) / 2));
  const second = { ...cue, start: r3(split), sourceValue: 'edited' };
  cue.end = r3(split);
  cues.splice(index + 1, 0, second);
  return index + 1;
}

// Delete cue[index], healing the gap into a neighbour. Returns the index to
// select next. Mirrors legacy deleteSelectedCue.
export function deleteCue(cues, index) {
  if (index < 0 || index >= cues.length) return Math.min(index, cues.length - 1);
  const removed = cues[index], previous = cues[index - 1], next = cues[index + 1];
  cues.splice(index, 1);
  if (previous) previous.end = next ? next.start : removed.end;
  else if (next) next.start = removed.start;
  return Math.min(index, cues.length - 1);
}

// Drag a cue boundary to timeAtPointer, pulling the touching neighbour edge with
// it. Mirrors the legacy cuePointerMove drag branch. Mutates the array in place.
export function dragCueBoundary(cues, index, edge, timeAtPointer, duration) {
  const cue = cues[index];
  if (!cue) return;
  const previous = cues[index - 1], next = cues[index + 1];
  if (edge === 'start') {
    const old = cue.start, minimum = previous ? previous.start + 0.02 : 0;
    const value = Math.max(minimum, Math.min(timeAtPointer, cue.end - 0.02));
    cue.start = r3(value);
    if (previous && Math.abs(previous.end - old) < 0.011) previous.end = cue.start;
  } else {
    const old = cue.end, maximum = next ? next.end - 0.02 : duration;
    const value = Math.min(maximum, Math.max(timeAtPointer, cue.start + 0.02));
    cue.end = r3(value);
    if (next && Math.abs(next.start - old) < 0.011) next.start = cue.end;
  }
}

// ---------------------------------------------------------------------------
// VALIDATION — the SAME rules the server's validated_cues() enforces before it
// writes (tools/puppet-studio-server.py:714). Non-throwing: returns a list of
// violations so the workspace can gate Save client-side and the parity harness
// can surface pre-existing on-disk data issues as WARN (not FAIL — they are data,
// not a workspace regression). Rules: mouthCues is an array of <=5000 objects;
// each has finite start>=0 and end>start; cues are monotonic/non-overlapping
// (start + 0.001 >= previous end); value is in ALL_VISEMES.
export function validateCues(payload) {
  const errors = [];
  const cues = payload && payload.mouthCues;
  if (!Array.isArray(cues)) {
    return { ok: false, errors: ['mouthCues must be an array'], cueCount: 0 };
  }
  if (cues.length > 5000) errors.push(`mouthCues has ${cues.length} entries (max 5000)`);
  let previousEnd = 0;
  cues.forEach((cue, i) => {
    const n = i + 1;
    if (!cue || typeof cue !== 'object') { errors.push(`cue ${n} must be an object`); return; }
    const start = Number(cue.start), end = Number(cue.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      errors.push(`cue ${n} has invalid times (${cue.start}..${cue.end})`);
    } else if (start + 0.001 < previousEnd) {
      errors.push(`cue ${n} overlaps the preceding cue (${start} < ${previousEnd})`);
    }
    if (!VISEME_SET.has(String(cue.value))) errors.push(`cue ${n} has unsupported viseme ${JSON.stringify(cue.value)}`);
    if (Number.isFinite(end)) previousEnd = end;
  });
  return { ok: errors.length === 0, errors, cueCount: cues.length };
}
