#!/usr/bin/env node
// tools/pipeline/sync-games-registry.mjs — keep games.json in step with each
// games/<id>/game.json (§7.5).
//
//   node tools/pipeline/sync-games-registry.mjs            # --check (default)
//   node tools/pipeline/sync-games-registry.mjs --write
//   node tools/pipeline/sync-games-registry.mjs --write --only pattern-train,blend-train
//   node tools/pipeline/sync-games-registry.mjs --check --root /path/to/qlobe-kids
//
// WHO OWNS WHAT
//   games/<id>/game.json is CANONICAL for the mirrored descriptive fields —
//   title, status, category, age, accent, modes, liveDate. Those are authored
//   next to the game, change when the game changes, and get projected into the
//   registry. liveDate is the ISO date (YYYY-MM-DD) a game was last promoted
//   to status "live" — set by puppet-studio-server.py's set_game_status() on
//   that transition, or by hand for a game launched straight into "live".
//   games.json keeps SOLE ownership of everything else: path, icon (the curated
//   hub tile), uses[], iconBg, iconFit, summary, entry ordering, categories[]
//   and schemaVersion. This tool never touches those.
//
//   `icon` is a NAMING COLLISION, not a mirrored field. In games.json it is the
//   curated hub tile (assets/hub/tiles/<id>.jpg — hands-off, the user curates
//   them); in game.json it is an emoji glyph or a splash image used inside the
//   game. Same key, different field. They are never synced.
//
// FORMATTING
//   games.json round-trips byte-identically through both
//   JSON.stringify(value, null, 2) and Python's json.dumps(indent=2,
//   ensure_ascii=False), with NO trailing newline — the same convention the
//   authoring server's set_game_status() uses, so a status flip through
//   POST /api/studio/game-status and a --write here produce identical bytes.
//   Newly added keys are inserted at their canonical slot so the diff is
//   additions and value changes only, never a reshuffle.
//
// Games missing from one side are REPORTED, never invented — registering a game
// stays a deliberate act.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The descriptive fields game.json owns and games.json mirrors.
const MIRRORED = ['title', 'status', 'category', 'age', 'accent', 'modes', 'liveDate'];
// Mirrored fields a game may legitimately not have. The rest are required of a
// manifest; their absence is a manifest bug we report rather than paper over.
const OPTIONAL = new Set(['accent', 'modes', 'liveDate']);
// The subset of each mode object the registry carries.
const MODE_KEYS = ['id', 'title', 'skill'];
// Canonical registry key order — used only to place a key the entry lacks.
const KEY_ORDER = ['id', 'title', 'category', 'path', 'icon', 'age', 'status',
  'liveDate', 'accent', 'uses', 'modes', 'iconBg', 'iconFit', 'summary'];

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const opts = { mode: 'check', only: null, root: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--write') opts.mode = 'write';
    else if (arg === '--check') opts.mode = 'check';
    else if (arg === '--only') opts.only = splitIds(argv[++i]);
    else if (arg.startsWith('--only=')) opts.only = splitIds(arg.slice(7));
    else if (arg === '--root') opts.root = argv[++i];
    else if (arg.startsWith('--root=')) opts.root = arg.slice(7);
    else if (arg === '-h' || arg === '--help') opts.mode = 'help';
    else if (arg.startsWith('-')) fail(`unknown flag: ${arg}`);
    else if (!opts.root) opts.root = arg; // bare positional = repo root
    else fail(`unexpected argument: ${arg}`);
  }
  return opts;
}

const splitIds = (raw) => String(raw || '').split(/[\s,]+/).filter(Boolean);
function fail(message) { console.error(`sync-games-registry: ${message}`); process.exit(2); }

// Repo root: --root / bare arg, else the nearest ancestor of cwd holding both
// games.json and games/, else the tools/pipeline/../.. that ships this script.
function resolveRoot(hint) {
  const looksRight = (dir) => {
    try { return fs.statSync(path.join(dir, 'games.json')).isFile() && fs.statSync(path.join(dir, 'games')).isDirectory(); }
    catch { return false; }
  };
  if (hint) {
    const dir = path.resolve(hint);
    if (!looksRight(dir)) fail(`${dir} does not look like the repo root (no games.json + games/)`);
    return dir;
  }
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    if (looksRight(dir)) return dir;
    if (dir === path.dirname(dir)) break;
  }
  const shipped = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  if (looksRight(shipped)) return shipped;
  fail('could not find the repo root; pass --root <path>');
}

// ---------------------------------------------------------------- projection

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = (v) => (v === undefined ? '(absent)' : JSON.stringify(v));

// The registry-shaped value for one mirrored field, read from game.json.
// modes[] is narrowed to {id, title, skill} — the registry never carries the
// rest of a mode's authoring detail.
function project(field, manifest) {
  const value = manifest[field];
  if (value === undefined) return undefined;
  if (field !== 'modes') return value;
  if (!Array.isArray(value)) return value;
  return value.map((mode) => {
    if (!mode || typeof mode !== 'object') return mode;
    const out = {};
    for (const key of MODE_KEYS) if (mode[key] !== undefined) out[key] = mode[key];
    return out;
  });
}

// Rewrite an entry with `updates` applied, preserving the existing key order and
// slotting any brand-new key at its canonical position.
function applyUpdates(entry, updates, removals) {
  const keys = Object.keys(entry).filter((k) => !removals.has(k));
  for (const key of Object.keys(updates)) {
    if (keys.includes(key)) continue;
    const rank = KEY_ORDER.indexOf(key);
    const at = keys.findIndex((k) => {
      const other = KEY_ORDER.indexOf(k);
      return other !== -1 && rank !== -1 && other > rank;
    });
    if (at === -1) keys.push(key); else keys.splice(at, 0, key);
  }
  const out = {};
  for (const key of keys) out[key] = key in updates ? updates[key] : entry[key];
  return out;
}

// ---------------------------------------------------------------- comparison

// One game's verdict: the fixable disagreements, plus problems this tool must
// report rather than resolve.
function compareGame(entry, manifest) {
  const updates = {};
  const removals = new Set();
  const diffs = [];
  const blocked = [];
  for (const field of MIRRORED) {
    const registryValue = entry[field];
    const canonical = project(field, manifest);
    if (same(registryValue, canonical)) continue;
    if (canonical === undefined) {
      if (!OPTIONAL.has(field)) {
        blocked.push(`game.json has no "${field}" (canonical); registry says ${show(registryValue)} — fix the manifest, not the registry`);
        continue;
      }
      removals.add(field);
    } else {
      updates[field] = canonical;
    }
    diffs.push({ field, registry: registryValue, canonical });
  }
  return { updates, removals, diffs, blocked };
}

// ---------------------------------------------------------------- main

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.mode === 'help') {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')
      .split('\n').filter((l) => l.startsWith('//')).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return 0;
  }

  const root = resolveRoot(opts.root);
  const registryPath = path.join(root, 'games.json');
  const raw = fs.readFileSync(registryPath, 'utf8');
  const registry = JSON.parse(raw);
  const entries = Array.isArray(registry.games) ? registry.games : [];

  const only = opts.only ? new Set(opts.only) : null;
  if (only) {
    const known = new Set(entries.map((g) => g.id));
    for (const id of only) if (!known.has(id)) console.log(`? ${id} — not in games.json (--only)`);
  }

  const changedGames = [];
  const problems = [];
  let diffCount = 0;

  for (const entry of entries) {
    if (only && !only.has(entry.id)) continue;
    const manifestPath = path.join(root, 'games', entry.id, 'game.json');
    if (!fs.existsSync(manifestPath)) {
      problems.push(`${entry.id}: registered in games.json but games/${entry.id}/game.json is missing`);
      continue;
    }
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
    catch (err) { problems.push(`${entry.id}: games/${entry.id}/game.json is not valid JSON (${err.message})`); continue; }

    const { updates, removals, diffs, blocked } = compareGame(entry, manifest);
    for (const message of blocked) problems.push(`${entry.id}: ${message}`);
    if (!diffs.length) continue;
    diffCount += diffs.length;
    for (const d of diffs) {
      console.log(`${entry.id}  ${d.field}\n    registry:  ${show(d.registry)}\n    game.json: ${show(d.canonical)}`);
    }
    if (Object.keys(updates).length || removals.size) changedGames.push({ entry, updates, removals });
  }

  // Folders carrying a manifest that nobody registered. Reported, never added.
  const registered = new Set(entries.map((g) => g.id));
  const gamesDir = path.join(root, 'games');
  for (const name of fs.existsSync(gamesDir) ? fs.readdirSync(gamesDir).sort() : []) {
    if (only && !only.has(name)) continue;
    if (registered.has(name)) continue;
    if (fs.existsSync(path.join(gamesDir, name, 'game.json'))) {
      problems.push(`${name}: games/${name}/game.json exists but the game is not registered in games.json (registration is a deliberate act — add the entry by hand)`);
    }
  }

  if (opts.mode === 'write' && changedGames.length) {
    const byId = new Map(changedGames.map((c) => [c.entry.id, c]));
    registry.games = entries.map((entry) => {
      const change = byId.get(entry.id);
      return change ? applyUpdates(entry, change.updates, change.removals) : entry;
    });
    const next = JSON.stringify(registry, null, 2); // byte-parity with json.dumps(indent=2, ensure_ascii=False), no trailing newline
    if (next !== raw) {
      const tmp = `${registryPath}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, next, 'utf8');
      fs.renameSync(tmp, registryPath);
    }
  }

  for (const message of problems) console.log(`! ${message}`);

  const scope = only ? ` (--only ${[...only].join(', ')})` : '';
  if (opts.mode === 'write') {
    console.log(`\nsynced ${changedGames.length} game(s), ${diffCount} field(s) in games.json${scope}`);
  } else if (diffCount) {
    console.log(`\n${diffCount} mirrored-field disagreement(s) across ${changedGames.length} game(s)${scope}`);
    console.log('fix: node tools/pipeline/sync-games-registry.mjs --write   (game.json is canonical)');
  } else {
    console.log(`games.json agrees with every game.json on ${MIRRORED.join(', ')}${scope}`);
  }
  if (problems.length) console.log(`${problems.length} problem(s) reported above need a human`);

  if (opts.mode === 'write') return problems.length ? 1 : 0;
  return diffCount || problems.length ? 1 : 0;
}

process.exit(main());
