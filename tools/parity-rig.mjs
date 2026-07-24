#!/usr/bin/env node
// parity-rig.mjs — data-layer gate for the native Rig workspace (WP-1b).
//
//   node tools/parity-rig.mjs
//
// For every rigged character, simulate the workspace's load -> (no-op) ->
// serialize path using the SAME pure functions rig.js uses (rig-data.js), then
// deep-compare against the on-disk rig.json content. The gate is content
// deep-equality, NOT byte-to-disk: on save the server re-serializes with
// json.dumps(indent=2, ensure_ascii=False)+'\n', so byte drift on the source
// files (bear's compact arrays; rabbit/unicorn's missing trailing newline) is
// expected and harmless. What must never drift is the CONTENT.
//
// Exit code 0 = 8/8 content-parity. Exit code 1 = any FAIL. Zero dependencies.

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// rig-data.js is a browser ES module with a `.js` extension; without a
// package.json (forbidden here — no build step) Node would treat `.js` as
// CommonJS. It has zero imports of its own, so we load its source as an ESM
// data: URL — the SAME source the browser workspace imports, no duplication.
const rigDataSource = readFileSync(
  join(ROOT, 'shared', 'js', 'studio', 'workspaces', 'rig-data.js'), 'utf8');
const {
  loadRig, serializeRig, parseRig, RIGGED_CHARACTERS, rigDocumentPath,
} = await import(`data:text/javascript,${encodeURIComponent(rigDataSource)}`);

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

let pass = 0;
const failures = [];
for (const id of RIGGED_CHARACTERS) {
  const rel = rigDocumentPath(id);
  let ok = false, detail = '';
  try {
    const diskText = readFileSync(join(ROOT, rel), 'utf8');
    const onDisk = parseRig(diskText);                 // authoritative content
    const held = loadRig(diskText);                    // what the workspace holds after load (no-op)
    const savedText = serializeRig(held);              // exactly what save() would POST
    const savedBack = parseRig(savedText);             // what the server would persist as content
    ok = deepEqual(savedBack, onDisk);
    if (!ok) detail = firstDiff(savedBack, onDisk) || 'content differs';
  } catch (error) {
    detail = error.message;
  }
  if (ok) { pass += 1; console.log(`  PASS  ${id.padEnd(14)} ${rel}`); }
  else { failures.push({ id, detail }); console.log(`  FAIL  ${id.padEnd(14)} ${rel} — ${detail}`); }
}

console.log(`\nparity-rig: ${pass}/${RIGGED_CHARACTERS.length} content-parity`);
if (failures.length) {
  console.log('data-layer gate FAILED.');
  process.exit(1);
}
console.log('data-layer gate PASS (load -> serialize is content-idempotent for every rigged character).');
