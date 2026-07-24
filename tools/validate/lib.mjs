// tools/validate/lib.mjs — shared, zero-dependency framework for the QLOBE
// Studio v2 validator suite (docs/qlobe-studio-v2.md §8.1). Generalizes the
// tools/validate-story-stones.mjs pattern: Node, no deps, exhaustive, exit-code
// + JSON output. Every per-format validator module (./validators/*.mjs) imports
// these helpers and the Reporter contract; run.mjs orchestrates them.
//
// A validator module default-exports:
//   {
//     target: 'character',            // the format-name target token (run.mjs [target])
//     aliases: ['characters'],        // optional extra target tokens
//     subjects(),                     // -> [{ id, document?, gameId?, project?, ... }]
//     validate(subject, r),           // push findings via the scoped reporter r
//   }
// The scoped reporter r has r.error(msg), r.warn(msg), r.info(msg). Severity
// contract: `error` = a real contract break (broken required reference, missing
// required file for the declared tier, id/path/registry disagreement). `warn` =
// a soft or legacy data issue that must be reported but never fails the build.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const abs = (rel) => path.join(ROOT, rel);
export const relOf = (p) => path.relative(ROOT, p).split(path.sep).join('/');

export function isFile(rel) { try { return fs.statSync(abs(rel)).isFile(); } catch { return false; } }
export function isDir(rel) { try { return fs.statSync(abs(rel)).isDirectory(); } catch { return false; } }
export function exists(rel) { return fs.existsSync(abs(rel)); }
export function readText(rel) { return fs.readFileSync(abs(rel), 'utf8'); }
export function readJSON(rel) { return JSON.parse(readText(rel)); }
export function tryReadJSON(rel) { try { return readJSON(rel); } catch { return null; } }
export function listDir(rel) { try { return fs.readdirSync(abs(rel)); } catch { return []; } }
export function listSubdirs(rel) {
  try { return fs.readdirSync(abs(rel), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); }
  catch { return []; }
}

const ID_RE = /^[a-z][a-z0-9-]{0,39}$/;
export const isKebabId = (id) => typeof id === 'string' && ID_RE.test(id);

// A path is repo-safe if it is relative, lowercase-friendly, and has no traversal.
export function isSafeRelPath(p) {
  const v = String(p || '').replaceAll('\\', '/');
  return !!v && !v.startsWith('/') && !v.split('/').includes('..');
}

// ---- shared repo readers ---------------------------------------------------

// The fv2 studio object registry, resolved (objects[] verbatim, or synthesized
// from a v1 project list — mirrors shared/js/studio/projects.js adaptRegistry).
export function registryObjects() {
  const reg = readJSON('shared/js/studio/projects.json');
  if (reg.format !== 'qlobe-studio-projects' || !Array.isArray(reg.projects)) {
    throw new Error('shared/js/studio/projects.json is not a valid qlobe-studio-projects registry');
  }
  if (Array.isArray(reg.objects) && reg.objects.length) return reg.objects.map((o) => ({ ...o }));
  const objects = [];
  for (const project of reg.projects) {
    objects.push({ type: 'game', id: project.id, document: `games/${project.id}/game.json`, project: project.id });
    for (const [workspace, config] of Object.entries(project.workspaces || {})) {
      if (config && typeof config.document === 'string') {
        const type = workspace === 'stage' ? 'scene-pack' : workspace === 'music' ? 'music-sync' : workspace;
        objects.push({ type, id: `${project.id}-${workspace}`, document: config.document, project: project.id });
      }
    }
  }
  return objects;
}

export function registryObjectsOfType(type) {
  return registryObjects().filter((o) => o.type === type);
}

// The 8 rigged shared characters (the parity roster + validator default set).
export const RIGGED_CHARACTERS = ['bear', 'doggy', 'fox', 'frog', 'rabbit', 'unicorn', 'princess-lily', 'princess-zoe'];
// The 5 anim-only shared characters (portraits, no rig).
export const ANIM_ONLY_CHARACTERS = ['leo', 'maya', 'nia', 'ravi', 'sam'];

// Every directory under shared/characters/ (a character id per subdir).
export function listCharacterIds() {
  return listSubdirs('shared/characters').filter(isKebabId).sort();
}

export function loadGamesRegistry() { return readJSON('games.json'); }

export function listGameIds() {
  return listSubdirs('games').filter(isKebabId).sort();
}

// The canonical rig viseme set (9) and the cue set (rest + 9). Kept here as the
// single source so validators do not re-derive it; must match speech-data.js
// CANONICAL_VISEMES / ALL_VISEMES and the server's VISEMES tuple.
export const CANONICAL_VISEMES = ['a', 'o', 'e', 'wr', 'ts', 'ln', 'uq', 'mbp', 'fv'];
export const ALL_VISEMES = ['rest', ...CANONICAL_VISEMES];
export const RIG_BONES = [
  'head', 'torso',
  'arm-upper.L', 'arm-lower.L', 'arm-upper.R', 'arm-lower.R',
  'leg-upper.L', 'leg-lower.L', 'leg-upper.R', 'leg-lower.R',
];

// ---- reporting -------------------------------------------------------------

export class Reporter {
  constructor() { this.findings = []; }
  scope(format, id) {
    const push = (severity) => (message, extra) =>
      this.findings.push({ severity, format, id, message, ...(extra || {}) });
    return { error: push('error'), warn: push('warn'), info: push('info') };
  }
  get errors() { return this.findings.filter((f) => f.severity === 'error'); }
  get warns() { return this.findings.filter((f) => f.severity === 'warn'); }
  get infos() { return this.findings.filter((f) => f.severity === 'info'); }
}
