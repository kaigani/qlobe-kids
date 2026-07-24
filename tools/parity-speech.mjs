#!/usr/bin/env node
// parity-speech.mjs — data-layer gate for the native Speech workspace (WP-1d).
//
//   node tools/parity-speech.mjs
//
// Three gates, run for every rigged character:
//
//  (1) manifest.json content parity. Simulate the workspace's load -> (no-op) ->
//      serialize path using the SAME pure functions speech.js uses (speech-data.js),
//      then deep-compare against the on-disk manifest.json content. The Speech
//      workspace never rewrites the manifest (it is upserted server-side by the
//      voice-upload job) — this gate just proves the load/serialize path stays
//      content-idempotent, same rule as parity-rig/parity-animate.
//
//  (2) <key>.cues.json content parity, for EVERY line in the manifest. The legacy
//      editor holds cues as `data.mouthCues.map(c => ({...c}))` (spread copy —
//      preserves fields + order) and saves buildCuesSavePayload(metadata, cues,
//      duration). The gate builds that payload from the on-disk cues and deep-
//      compares it against the on-disk {metadata, mouthCues} shape.
//
//  (3) validateCues() WARN pass. Runs the SAME rules the server enforces on write
//      (tools/puppet-studio-server.py validated_cues()) against every on-disk cues
//      file. Violations are printed as WARN and counted, but NEVER fail the gate —
//      they are pre-existing data issues, not a workspace regression.
//
// Exit code 0 = 8/8 manifest-parity AND 8/8 all-cues-parity. Exit code 1 = any
// content-parity FAIL. Validation WARNs never affect the exit code. Zero deps.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// rig-data.js and speech-data.js are browser ES modules with `.js`/import-free
// bodies; without a package.json (forbidden — no build step) Node treats `.js` as
// CommonJS. Both have ZERO imports, so we load their exact source as data: URLs —
// the SAME source the browser workspace imports, no duplication.
async function importSource(rel) {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  return import(`data:text/javascript,${encodeURIComponent(src)}`);
}
const { RIGGED_CHARACTERS } = await importSource('shared/js/studio/workspaces/rig-data.js');
const {
  parseManifest, loadManifest, serializeManifest, manifestLines,
  parseCues, loadCues, serializeCues, buildCuesSavePayload, cueLineKey,
  validateCues, voiceManifestPath, voiceCuesPath,
} = await importSource('shared/js/studio/workspaces/speech-data.js');

// Structural deep-equal, order-sensitive for arrays and object keys (JSON shape).
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  const aArr = Array.isArray(a), bArr = Array.isArray(b);
  if (aArr !== bArr) return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i += 1) {
    if (ak[i] !== bk[i]) return false;              // key order matters for on-disk JSON identity
    if (!deepEqual(a[ak[i]], b[bk[i]])) return false;
  }
  return true;
}

// First differing JSON path, for actionable failure output.
function firstDiff(a, b, path = '$') {
  if (deepEqual(a, b)) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return `${path}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`;
  }
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const k of keys) {
    const seg = Array.isArray(a) ? `${path}[${k}]` : `${path}.${k}`;
    const d = firstDiff(a?.[k], b?.[k], seg);
    if (d) return d;
  }
  return `${path}: key-order or shape differs`;
}

let passManifest = 0, passAllCues = 0, totalCueLines = 0, warnFiles = 0;
const failures = [];

for (const id of RIGGED_CHARACTERS) {
  const manifestRel = voiceManifestPath(id);
  let manifestOk = false, manifestDetail = '';
  let manifest = null;

  // --- GATE 1: manifest content parity -------------------------------------
  try {
    const manifestPath = join(ROOT, manifestRel);
    if (!existsSync(manifestPath)) throw new Error(`missing ${manifestRel}`);
    const diskText = readFileSync(manifestPath, 'utf8');
    const onDisk = parseManifest(diskText);            // authoritative content
    const held = loadManifest(diskText);               // what the workspace holds after load (no-op)
    const savedText = serializeManifest(held);         // exactly what a re-save would write
    const savedBack = parseManifest(savedText);        // what the server would persist as content
    manifestOk = deepEqual(savedBack, onDisk);
    if (!manifestOk) manifestDetail = firstDiff(savedBack, onDisk) || 'content differs';
    manifest = onDisk;
  } catch (error) {
    manifestDetail = error.message;
  }
  if (manifestOk) passManifest += 1;

  // --- GATE 2: cues content parity, every line ------------------------------
  const lines = manifest ? manifestLines(manifest) : [];
  let cuesPass = 0;
  const cuesFailures = [];
  const warnings = [];

  for (const line of lines) {
    const key = cueLineKey(line);
    const cuesRel = voiceCuesPath(id, key);
    try {
      const cuesPath = join(ROOT, cuesRel);
      if (!existsSync(cuesPath)) throw new Error(`missing ${cuesRel}`);
      const diskText = readFileSync(cuesPath, 'utf8');
      const onDisk = parseCues(diskText);              // authoritative content: {metadata, mouthCues}
      const heldDoc = loadCues(diskText);               // what the workspace holds after load (no-op)
      // Legacy editor: `cues = data.mouthCues.map(c => ({...c}))` — spread copy.
      const heldCues = (heldDoc.mouthCues || []).map((c) => ({ ...c }));
      const savedPayload = buildCuesSavePayload(heldDoc.metadata, heldCues, heldDoc.metadata?.duration);
      const ok = deepEqual(savedPayload, onDisk);
      if (ok) {
        cuesPass += 1;
      } else {
        cuesFailures.push({ key, detail: firstDiff(savedPayload, onDisk) || 'content differs' });
      }

      // --- GATE 3: server-rule validation (WARN only) ---------------------
      const { ok: validOk, errors } = validateCues(onDisk);
      if (!validOk) warnings.push({ key, errors });
    } catch (error) {
      cuesFailures.push({ key, detail: error.message });
    }
  }

  totalCueLines += lines.length;
  const allCuesOk = manifestOk && lines.length > 0 && cuesPass === lines.length;
  if (allCuesOk) passAllCues += 1;
  if (warnings.length) warnFiles += warnings.length;

  const tag = manifestOk && allCuesOk ? 'PASS' : 'FAIL';
  console.log(
    `  ${tag}  ${id.padEnd(14)} ${cuesPass}/${lines.length} cue lines · manifest ${manifestOk ? 'ok' : 'FAIL'}`,
  );
  if (!manifestOk) {
    console.log(`        manifest FAIL — ${manifestRel} — ${manifestDetail}`);
    failures.push({ id, detail: `manifest: ${manifestDetail}` });
  }
  for (const f of cuesFailures) {
    console.log(`        FAIL  ${id}/${f.key} — ${f.detail}`);
    failures.push({ id, detail: `cues[${f.key}]: ${f.detail}` });
  }
  for (const w of warnings) {
    console.log(`        WARN  ${id}/${w.key} — ${w.errors.join('; ')}`);
  }
}

const n = RIGGED_CHARACTERS.length;
console.log(
  `\nparity-speech: ${passManifest}/${n} manifest-parity, ${passAllCues}/${n} all-cues-parity `
  + `(${totalCueLines} total cue lines), ${warnFiles} files with validation WARNs`,
);
if (failures.length) {
  console.log('data-layer gate FAILED.');
  process.exit(1);
}
console.log('data-layer gate PASS (manifest and cues load -> serialize are content-idempotent for every rigged character).');
