#!/usr/bin/env node
// parity-animate.mjs — data-layer gate for the native Animate workspace (WP-1c).
//
//   node tools/parity-animate.mjs
//
// Two gates, run for every rigged character:
//
//  (1) rig.json content parity (clips included). Simulate the workspace's
//      load -> (no-op) -> serialize path using the SAME pure functions
//      animate.js uses (rig-data.js), then deep-compare against on-disk content.
//      Identical to parity-rig's gate: the Animate workspace edits the SAME rig
//      object's clips{} and saves through the same path, and load stays
//      content-idempotent (no boot-time clip normalization/materialization).
//
//  (2) Clip-resolution parity. Verify the workspace's resolveClips() agrees with
//      what the runtime ACTUALLY does. THE CODE (read 2026-07-24):
//        * puppet.js createPuppet() compiles rig.clips ONLY (no pack merge).
//        * theater.js:251 merges the ACTING pack UNDER the rig:
//              { ...pack.clips, ...gameClips, ...baseRig.clips }   (rig wins)
//          — default-clips.json is NOT a runtime input; it is a build-time seed
//          (puppet-builder.js) already materialized into every rig.json.
//      The gate asserts resolveClips(rig, {default, acting}) equals theater's
//      { ...acting, ...rig.clips } as a clip MAP (name set + per-clip content;
//      map key ORDER is irrelevant for a runtime lookup dict and intentionally
//      not compared here — only rig.json's on-disk order matters, covered by (1)).
//      It also checks the local/inherited split matches rig.clips vs the packs.
//
// Exit 0 = 8/8 on BOTH gates. Exit 1 = any FAIL. Zero dependencies.

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// rig-data.js and animate-data.js are browser ES modules with `.js`/import-free
// bodies; without a package.json (forbidden — no build step) Node treats `.js` as
// CommonJS. Both have ZERO imports, so we load their exact source as data: URLs —
// the SAME source the browser workspace imports, no duplication.
async function importSource(rel) {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  return import(`data:text/javascript,${encodeURIComponent(src)}`);
}
const { loadRig, serializeRig, parseRig, RIGGED_CHARACTERS, rigDocumentPath } =
  await importSource('shared/js/studio/workspaces/rig-data.js');
const { resolveClips, theaterResolveClips, classifyClips } =
  await importSource('shared/js/studio/workspaces/animate-data.js');

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

// Clip-map equality: same clip NAMES (as a set) + per-clip deep-equal content.
// Map key order is intentionally ignored — a resolved clip set is a runtime
// lookup dict, not a file to serialize.
function clipMapEqual(a, b) {
  const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
  if (ak.length !== bk.length || ak.some((k, i) => k !== bk[i])) {
    return `clip names differ: [${ak}] vs [${bk}]`;
  }
  for (const k of ak) if (!deepEqual(a[k], b[k])) return `clip "${k}": ${firstDiff(a[k], b[k], `$.${k}`)}`;
  return null;
}

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const defaultPack = readJson('shared/characters/default-clips.json').clips || {};
const actingPack = readJson('shared/characters/acting-clips.json').clips || {};
const packs = { defaultClips: defaultPack, actingClips: actingPack };

let passContent = 0, passResolve = 0;
const failures = [];

for (const id of RIGGED_CHARACTERS) {
  const rel = rigDocumentPath(id);
  let contentOk = false, resolveOk = false, detail = '';
  try {
    const diskText = readFileSync(join(ROOT, rel), 'utf8');
    const onDisk = parseRig(diskText);              // authoritative content
    const held = loadRig(diskText);                 // what the workspace holds after load (no-op)
    const savedText = serializeRig(held);           // exactly what save() would POST
    const savedBack = parseRig(savedText);          // what the server would persist as content
    contentOk = deepEqual(savedBack, onDisk);
    if (!contentOk) detail = `content: ${firstDiff(savedBack, onDisk) || 'differs'}`;

    // (2) resolution parity vs theater.js's ACTUAL merge
    const workspaceResolved = resolveClips(held, packs);
    const runtimeResolved = theaterResolveClips(held, { actingClips: actingPack });
    const mapDiff = clipMapEqual(workspaceResolved, runtimeResolved);
    const { local, inherited } = classifyClips(held, packs);
    const localExpected = Object.keys(held.clips || {});
    const localOk = local.length === localExpected.length && local.every((n, i) => n === localExpected[i]);
    // every inherited name resolves from a pack, and no inherited name is local
    const packNames = new Set([...Object.keys(defaultPack), ...Object.keys(actingPack)]);
    const inhFromPacks = inherited.every((n) => packNames.has(n));
    const inhNotLocal = inherited.every((n) => !localExpected.includes(n));
    // rig precedence: every local clip wins over any pack clip of the same name
    const rigWins = localExpected.every((n) => deepEqual(workspaceResolved[n], held.clips[n]));
    resolveOk = !mapDiff && localOk && inhFromPacks && inhNotLocal && rigWins;
    if (!resolveOk && !detail) {
      detail = `resolve: ${mapDiff || (!localOk ? 'local set mismatch' : !rigWins ? 'rig did not win' : 'inherited not pack-sourced')}`;
    }
  } catch (error) {
    detail = error.message;
  }

  if (contentOk) passContent += 1;
  if (resolveOk) passResolve += 1;
  const tag = contentOk && resolveOk ? 'PASS' : 'FAIL';
  const extra = contentOk && resolveOk
    ? `local ${Object.keys(parseRig(readFileSync(join(ROOT, rel), 'utf8')).clips || {}).length} / inherited ${classifyClips(loadRig(readFileSync(join(ROOT, rel), 'utf8')), packs).inherited.length}`
    : detail;
  console.log(`  ${tag}  ${id.padEnd(14)} ${rel} — ${extra}`);
  if (!(contentOk && resolveOk)) failures.push({ id, detail });
}

const n = RIGGED_CHARACTERS.length;
console.log(`\nparity-animate: ${passContent}/${n} content-parity, ${passResolve}/${n} clip-resolution-parity`);
if (failures.length) {
  console.log('data-layer gate FAILED.');
  process.exit(1);
}
console.log('data-layer gate PASS: load -> serialize is content-idempotent AND');
console.log('resolveClips agrees with theater.js runtime ({ ...acting, ...rig.clips }; puppet.js uses rig.clips only).');
