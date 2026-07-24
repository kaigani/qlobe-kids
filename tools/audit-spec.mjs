#!/usr/bin/env node
// audit-spec.mjs — verify every backticked path, endpoint, and format name in
// docs/qlobe-studio-v2.md against the repository. Zero dependencies.
//
//   node tools/audit-spec.mjs [--json] [specPath]
//
// Exit code 0 = every claim verified (planned artifacts reported, not fatal).
// Exit code 1 = at least one unverifiable claim.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const specPath = args.find((a) => !a.startsWith('--')) || join(ROOT, 'docs', 'qlobe-studio-v2.md');

// Artifacts the spec plans to create in later phases — reported, never fatal.
// Phase 2 realized tools/validate/, tools/build-usage-index.mjs, and
// shared/data/usage-index.json. Phase 3 realized tools/pipeline/ (committed, now
// verified on disk) and tools/state/ (git-ignored, server-managed — allow-listed
// below like shared/props). Phase 4 realized the config.json + shim pattern
// (templates/stub-game/config.json + config.js), so `config.json` and
// `games/<id>/config.json` now verify against the repo like any real path.
// Phase 5 (Media & Generation) landed: shared/media/ is now an allow-listed
// server-managed staging root (see ALLOWLISTED_VIRTUAL below — empty on a fresh
// checkout, verified by presence in the server source), and qlobe-recipe v1 is a
// real format written by every generation job. Nothing remains planned.
const PLANNED = new Set([]);
const PLANNED_FORMATS = [];

// Paths the spec references as RETIRED — the spec (§3.5/§11/Appendix B) still
// describes tools/content-pipeline/ in the present tense as the dir being
// retired, but Phase 3 executed that retirement (keepers ported to tools/pipeline/,
// rest to git history). Reported like planned artifacts, never fatal. Spec-
// staleness item: the orchestrator should update the spec's present-tense
// references to past tense.
const RETIRED = new Set(['tools/content-pipeline/', 'tools/content-pipeline']);

// Server-managed / allow-listed roots that legitimately may not exist on disk on
// a fresh checkout (shared/props is an allow-listed write root; tools/state/ is
// the git-ignored job store the server creates on boot). Verified by presence in
// the server source rather than by an on-disk directory.
const ALLOWLISTED_VIRTUAL = new Set([
  'shared/props', 'shared/props/', 'tools/state', 'tools/state/',
  'shared/media', 'shared/media/',
]);

const spec = readFileSync(specPath, 'utf8');
const tokens = [...new Set([...spec.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]))];

const serverSource = readFileSync(join(ROOT, 'tools', 'puppet-studio-server.py'), 'utf8');

// Cache of repo text for format-name checks (json + docs + tools, shallow scan).
let formatHaystack = null;
function loadFormatHaystack() {
  if (formatHaystack) return formatHaystack;
  const chunks = [];
  const roots = ['docs', 'shared', 'games', 'tools', 'templates'];
  const wanted = /\.(json|md|js|mjs|py|html)$/;
  const walk = (dir, depth) => {
    if (depth > 4) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, depth + 1); continue; }
      if (!wanted.test(e.name)) continue;
      // The spec itself must never verify its own format-name claims.
      if (resolve(p) === resolve(specPath)) continue;
      try { if (statSync(p).size < 2_000_000) chunks.push(readFileSync(p, 'utf8')); } catch {}
    }
  };
  for (const r of roots) walk(join(ROOT, r), 0);
  formatHaystack = chunks.join('\n');
  return formatHaystack;
}

const results = { verified: [], planned: [], skipped: [], failed: [] };

// Index of every file and directory path in the repo (repo-relative, '/' sep),
// for suffix matching of contextual references like `engines/art.js`.
let pathIndex = null;
function loadPathIndex() {
  if (pathIndex) return pathIndex;
  pathIndex = [];
  const walk = (dir, rel, depth) => {
    if (depth > 7) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '__pycache__' || e.name === 'venv') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      pathIndex.push(e.isDirectory() ? `${r}/` : r);
      if (e.isDirectory()) walk(join(dir, e.name), r, depth + 1);
    }
  };
  walk(ROOT, '', 0);
  return pathIndex;
}

function suffixMatch(token) {
  const t = token.endsWith('/') ? token : token;
  return loadPathIndex().some((p) => p === t || p.endsWith(`/${t}`) || (t.endsWith('/') && (p === t || p.endsWith(`/${t}`))));
}

function checkPath(token) {
  const clean = token.replace(/[?#].*$/, '');
  if (PLANNED.has(clean)) { results.planned.push(token); return; }
  if (RETIRED.has(clean)) { results.planned.push(`${token} (retired Phase 3)`); return; }
  if (ALLOWLISTED_VIRTUAL.has(clean)) {
    if (serverSource.includes(clean.replace(/\/$/, ''))) results.verified.push(`${token} (allow-listed root)`);
    else results.failed.push({ token, reason: 'virtual root not found in server allow-list' });
    return;
  }
  // Prose-ish token: contains '/' but no extension and no trailing slash
  // (e.g. status vocab written as a slash list). Directories are always
  // written with a trailing '/' in the spec.
  if (clean.includes('/') && !clean.endsWith('/') && !/\.[a-z0-9]+$/i.test(clean)) {
    results.skipped.push(token);
    return;
  }
  // Placeholder segments (<id>, <actor>, *) — verify the static prefix only.
  const placeholderAt = clean.search(/[<*{]/);
  const probe = placeholderAt === -1 ? clean : clean.slice(0, placeholderAt).replace(/[^/]*$/, '');
  if (!probe) { results.skipped.push(token); return; }
  const base = probe.startsWith('../') ? resolve(ROOT, '..') : ROOT;
  const rel = probe.startsWith('../') ? probe.slice(3) : probe;
  if (existsSync(join(base, rel))) {
    results.verified.push(placeholderAt === -1 ? token : `${token} (prefix ${probe})`);
  } else if (!probe.startsWith('../') && suffixMatch(placeholderAt === -1 ? clean : probe)) {
    results.verified.push(`${token} (contextual)`);
  } else {
    results.failed.push({ token, reason: `not found: ${join(base, rel)}` });
  }
}

function checkEndpoint(token) {
  const path = token.replace(/^(GET|POST|PUT|DELETE)\|?[A-Z]*\s+/, '').replace(/[?<].*$/, '').replace(/\/?\*$/, '').replace(/\/$/, '');
  // Planned endpoints — spec marks them by section; treat unknown /api/studio/
  // additions as planned. Phase 2 landed usage-index/validate/completeness and
  // Phase 3 landed persistent /api/studio/jobs v2 — all now in the server, so
  // they verify directly. Nothing remains planned.
  const plannedEndpoints = [];
  if (serverSource.includes(path)) { results.verified.push(token); return; }
  if (plannedEndpoints.some((p) => path.startsWith(p))) { results.planned.push(token); return; }
  results.failed.push({ token, reason: `endpoint ${path} not in puppet-studio-server.py` });
}

function checkFormat(token) {
  if (PLANNED_FORMATS.includes(token)) { results.planned.push(token); return; }
  if (loadFormatHaystack().includes(token)) results.verified.push(token);
  else results.failed.push({ token, reason: 'format name not found in repo (outside the spec itself)' });
}

for (const token of tokens) {
  if (/^(GET|POST)[\s|]/.test(token) || token.startsWith('/api/') || token.startsWith('/__puppet_files__')) {
    checkEndpoint(token);
  } else if (/^qlobe-[a-z-]+$/.test(token)) {
    checkFormat(token);
  } else if ((token.includes('/') || /\.(js|mjs|json|md|py|html|css|png|webp|m4a|woff2)$/.test(token)) &&
             !token.includes(' ') && !token.includes('→') && !token.includes('|') && !/^\.\.\/00-reference/.test(token) &&
             !/[(){}]/.test(token) && !token.includes('..*') && !token.startsWith('http') && !token.includes('://')) {
    checkPath(token);
  } else {
    results.skipped.push(token);
  }
}

const summary = {
  spec: specPath,
  verified: results.verified.length,
  planned: results.planned.length,
  skipped: results.skipped.length,
  failed: results.failed,
};

if (asJson) {
  console.log(JSON.stringify({ ...summary, verifiedList: results.verified, plannedList: results.planned, skippedList: results.skipped }, null, 2));
} else {
  console.log(`audit-spec: ${summary.verified} verified, ${summary.planned} planned (later phase), ${summary.skipped} skipped (prose/patterns)`);
  if (results.planned.length) console.log('  planned:', results.planned.join(', '));
  if (results.failed.length) {
    console.log(`\n${results.failed.length} UNVERIFIABLE CLAIM(S):`);
    for (const f of results.failed) console.log(`  ✗ ${f.token} — ${f.reason}`);
  } else {
    console.log('all claims verified.');
  }
}
process.exit(results.failed.length ? 1 : 0);
