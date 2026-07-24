#!/usr/bin/env node
// tools/build-usage-index.mjs — regenerate shared/data/usage-index.json (§8.2).
//
//   node tools/build-usage-index.mjs [--check]
//
// Scans games.json, every game.json (uses[], characters[]), the static imports in
// each game's index.html / config.js / js/**.js, and pack references, then writes
// forward (game → engine/characters/modules/assets/packs) and reverse
// (asset → games, character → games) maps plus per-engine consumer counts.
//
// The index is a DERIVED, DISPOSABLE artifact (§6.5): it carries generatedBy +
// generatedFrom + a generated timestamp so staleness is detectable, and it is
// never hand-edited. --check regenerates in memory and diffs against the committed
// file (excluding the timestamp) without writing, for CI-ish drift detection.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const abs = (rel) => path.join(ROOT, rel);
const relOf = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const readJSON = (rel) => JSON.parse(fs.readFileSync(abs(rel), 'utf8'));
const tryText = (rel) => { try { return fs.readFileSync(abs(rel), 'utf8'); } catch { return ''; } };
const isDir = (rel) => { try { return fs.statSync(abs(rel)).isDirectory(); } catch { return false; } };

// Recursively list .js files under games/<id>/js (bounded depth).
function listJs(rel, depth = 0, out = []) {
  if (depth > 5 || !isDir(rel)) return out;
  for (const e of fs.readdirSync(abs(rel), { withFileTypes: true })) {
    const child = `${rel}/${e.name}`;
    if (e.isDirectory()) listJs(child, depth + 1, out);
    else if (e.name.endsWith('.js') || e.name.endsWith('.mjs')) out.push(child);
  }
  return out;
}

// Resolve a relative import/src specifier (from a file at fileRel) to a
// repo-relative path, or null when it escapes the repo or is a bare/URL specifier.
function resolveSpecifier(spec, fileRel) {
  if (!spec || /^(https?:)?\/\//.test(spec) || /^(data|blob):/.test(spec)) return null;
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null; // bare specifier (e.g. import-map "three")
  const fromDir = path.dirname(abs(fileRel));
  const resolved = spec.startsWith('/') ? path.join(ROOT, spec) : path.resolve(fromDir, spec.split('?')[0].split('#')[0]);
  if (!resolved.startsWith(ROOT + path.sep)) return null;
  return relOf(resolved);
}

const IMPORT_RE = /(?:import\s+(?:[^'"]*?\sfrom\s+)?|export\s+[^'"]*?\sfrom\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;
const SRC_RE = /\b(?:src|href)\s*=\s*["']([^"']+)["']/g;

function refsFromText(text, fileRel, re) {
  const out = new Set();
  let m;
  while ((m = re.exec(text))) { const r = resolveSpecifier(m[1], fileRel); if (r) out.add(r); }
  return out;
}

// Classify a repo-relative reference for the forward buckets.
const isModule = (r) => r.startsWith('shared/js/') || r.startsWith('shared/vendor/');
const isPack = (r) => /(?:pack\.json|scene-pack\.json|music-sync\.json|story-pack\.json|poses\.json|manifest\.json)$/.test(r);
const isAsset = (r) => r.startsWith('shared/assets/') || r.startsWith('shared/characters/') || r.startsWith('shared/data/') || /^games\/[^/]+\/assets\//.test(r);

function build() {
  const registry = readJSON('games.json');
  const games = Array.isArray(registry.games) ? registry.games : [];
  const forward = {};
  const engines = {};
  const revModules = {};
  const revAssets = {};
  const revCharacters = {};
  const addRev = (map, key, gameId) => { (map[key] ||= new Set()).add(gameId); };

  for (const entry of games) {
    const id = entry?.id;
    if (typeof id !== 'string') continue;
    const gj = (() => { try { return readJSON(`games/${id}/game.json`); } catch { return {}; } })();
    const uses = Array.isArray(gj.uses) ? gj.uses : Array.isArray(entry.uses) ? entry.uses : [];
    const characters = Array.isArray(gj.characters) ? gj.characters : [];

    // Engine: the engines/<id>.js reference in uses[] (the platform convention).
    const engineHits = uses
      .map((u) => (typeof u === 'string' ? u.match(/shared\/js\/engines\/([a-z0-9-]+)\.js$/) : null))
      .filter(Boolean).map((m) => m[1]);
    const engine = engineHits[0] || null;

    // Static references: uses[] path entries + parsed imports/src across the game.
    const refs = new Set();
    for (const u of uses) if (typeof u === 'string' && u.includes('/')) refs.add(u.replace(/\/$/, u.endsWith('/') ? '/' : ''));
    for (const file of ['index.html', 'config.js']) {
      const text = tryText(`games/${id}/${file}`);
      if (!text) continue;
      for (const r of refsFromText(text, `games/${id}/${file}`, file.endsWith('.html') ? SRC_RE : IMPORT_RE)) refs.add(r);
      if (file.endsWith('.html')) for (const r of refsFromText(text, `games/${id}/${file}`, IMPORT_RE)) refs.add(r);
    }
    for (const jsRel of listJs(`games/${id}/js`)) {
      for (const r of refsFromText(tryText(jsRel), jsRel, IMPORT_RE)) refs.add(r);
    }

    const modules = [], assets = [], packs = [];
    for (const r of refs) {
      const clean = r.replace(/\/$/, '');
      if (isPack(clean)) { packs.push(clean); addRev(revAssets, clean, id); }
      else if (isModule(clean)) { modules.push(clean); addRev(revModules, clean, id); }
      else if (isAsset(clean)) { assets.push(clean); addRev(revAssets, clean, id); }
    }
    for (const c of characters) {
      if (typeof c !== 'string') continue;
      addRev(revCharacters, c, id);
      if (isDir(`shared/characters/${c}`)) addRev(revAssets, `shared/characters/${c}`, id);
    }
    if (engine) {
      (engines[engine] ||= { count: 0, games: [] });
      engines[engine].games.push(id);
      engines[engine].count += 1;
      addRev(revModules, `shared/js/engines/${engine}.js`, id);
    }

    forward[id] = {
      engine,
      status: entry.status || gj.status || null,
      category: entry.category || gj.category || null,
      characters: characters.filter((c) => typeof c === 'string').sort(),
      modules: [...new Set(modules)].sort(),
      assets: [...new Set(assets)].sort(),
      packs: [...new Set(packs)].sort(),
    };
  }

  const sortRev = (map) => Object.fromEntries(
    Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, [...v].sort()]));
  const sortedEngines = Object.fromEntries(
    Object.entries(engines).sort(([, a], [, b]) => b.count - a.count || 0)
      .map(([k, v]) => [k, { count: v.count, games: v.games.sort() }]));

  return {
    format: 'qlobe-usage-index',
    formatVersion: 1,
    generatedBy: 'tools/build-usage-index.mjs',
    generatedFrom: ['games.json', 'games/<id>/game.json', 'games/<id>/index.html', 'games/<id>/config.js', 'games/<id>/js/**/*.js'],
    generated: new Date().toISOString(),
    engines: sortedEngines,
    forward: Object.fromEntries(Object.entries(forward).sort(([a], [b]) => a.localeCompare(b))),
    reverse: {
      modules: sortRev(revModules),
      characters: sortRev(revCharacters),
      assets: sortRev(revAssets),
    },
  };
}

const stripTimestamp = (o) => ({ ...o, generated: '' });

const index = build();
const outRel = 'shared/data/usage-index.json';
const serialized = JSON.stringify(index, null, 2) + '\n';

if (process.argv.includes('--check')) {
  let existing = null;
  try { existing = readJSON(outRel); } catch {}
  const same = existing && JSON.stringify(stripTimestamp(existing)) === JSON.stringify(stripTimestamp(index));
  console.log(same ? 'usage-index up to date.' : 'usage-index is STALE — re-run tools/build-usage-index.mjs');
  process.exit(same ? 0 : 1);
}

fs.writeFileSync(abs(outRel), serialized);
const engineLine = Object.entries(index.engines).map(([k, v]) => `${k} ${v.count}`).join(', ');
console.log(`usage-index: ${Object.keys(index.forward).length} games → ${outRel}`);
console.log(`engines: ${engineLine}`);
