// validators/registry.mjs — games.json registry + per-game game.json completeness
// (§8.1). Registry-wide checks (schemaVersion, categories, duplicate/orphan ids)
// run under the synthetic subject "games.json"; every registered game gets a
// per-game subject (targetable by game id) covering folder agreement, uses[]
// sanity, ASSETS.md presence, and registry<->game.json consistency.
//
// Legacy data reality across 102 games is expected: soft disagreements are WARN,
// only hard breaks (missing folder/manifest, id/path disagreement, a referenced
// runtime module that does not exist) are ERROR. Data is reported, never fixed.
//
// One class of disagreement is NOT soft: the mirrored descriptive fields (§7.5).
// game.json is canonical for title/status/category/age/accent/modes and games.json
// mirrors them, so a mismatch means the hub is showing something the game does not
// do. Those are ERROR and name their own fix.

import { loadGamesRegistry, listGameIds, isFile, isDir, exists, readText, tryReadJSON, isKebabId } from '../lib.mjs';

const STATUS_VOCAB = new Set(['live', 'beta', 'in-design', 'proposed', 'archived']);

// The descriptive fields games.json mirrors from game.json (§7.5). `icon` is
// deliberately absent: it is a NAMING COLLISION, not a mirrored field — the
// registry's icon is the curated hub tile (assets/hub/tiles/<id>.jpg, hands-off),
// game.json's icon is an emoji glyph. They are never compared.
const MIRRORED = ['title', 'status', 'category', 'age', 'accent', 'modes'];
// Mirrored fields a game may legitimately not carry.
const OPTIONAL_MIRRORED = new Set(['accent', 'modes']);
// The subset of each mode object the registry carries.
const MODE_KEYS = ['id', 'title', 'skill'];

const FIX = 'run tools/pipeline/sync-games-registry.mjs --write, or POST /api/studio/game-status';

const shown = (v) => (v === undefined ? '(absent)' : JSON.stringify(v));

// The registry-shaped value of a mirrored field, read from game.json.
function projectMirrored(field, gj) {
  const value = gj[field];
  if (field !== 'modes' || !Array.isArray(value)) return value;
  return value.map((mode) => {
    if (!mode || typeof mode !== 'object') return mode;
    const out = {};
    for (const key of MODE_KEYS) if (mode[key] !== undefined) out[key] = mode[key];
    return out;
  });
}

// modes[] disagreements are dumped as a readable summary rather than two JSON
// blobs: which mode ids each side lists, and — when the ids line up — the first
// title/skill that actually differs.
function describeModes(registryModes, canonicalModes) {
  const a = Array.isArray(registryModes) ? registryModes : [];
  const b = Array.isArray(canonicalModes) ? canonicalModes : [];
  const idsA = a.map((m) => m?.id);
  const idsB = b.map((m) => m?.id);
  if (JSON.stringify(idsA) !== JSON.stringify(idsB)) {
    return `registry lists ${JSON.stringify(idsA)}, game.json lists ${JSON.stringify(idsB)}`;
  }
  for (let i = 0; i < b.length; i++) {
    for (const key of MODE_KEYS) {
      if (JSON.stringify(a[i]?.[key]) === JSON.stringify(b[i]?.[key])) continue;
      return `mode "${idsB[i]}" ${key} is ${shown(a[i]?.[key])} in the registry, ${shown(b[i]?.[key])} in game.json`;
    }
  }
  return `registry ${shown(registryModes)} vs game.json ${shown(canonicalModes)}`;
}

// games.json must agree with game.json on every mirrored field. Reported per
// field so a sweep names exactly what to regenerate.
function validateMirroredFields(id, entry, gj, r) {
  for (const field of MIRRORED) {
    const canonical = projectMirrored(field, gj);
    if (JSON.stringify(entry[field]) === JSON.stringify(canonical)) continue;
    if (canonical === undefined && !OPTIONAL_MIRRORED.has(field)) {
      r.error(`game.json has no "${field}" but games.json claims ${shown(entry[field])} — game.json is canonical, so fix the manifest`);
      continue;
    }
    const detail = field === 'modes'
      ? describeModes(entry.modes, canonical)
      : `registry ${shown(entry[field])} vs game.json ${shown(canonical)}`;
    r.error(`${field} disagrees: ${detail} — game.json is canonical; ${FIX}`);
  }
}

function subjects() {
  const registry = loadGamesRegistry();
  const games = Array.isArray(registry.games) ? registry.games : [];
  const perGame = games
    .filter((g) => isKebabId(g?.id))
    .map((g) => ({ id: g.id, gameId: g.id, document: `games/${g.id}/game.json`, entry: g }));
  return [{ id: 'games.json', registryWide: true }, ...perGame];
}

function validateRegistryWide(r) {
  const registry = loadGamesRegistry();
  if (registry.schemaVersion !== 1) r.warn(`schemaVersion should be 1 (found ${JSON.stringify(registry.schemaVersion)})`);
  const categories = new Set((registry.categories || []).map((c) => c.id));
  if (!categories.size) r.error('games.json has no categories');
  const games = Array.isArray(registry.games) ? registry.games : [];
  const seen = new Set();
  for (const g of games) {
    if (!isKebabId(g?.id)) { r.error(`a game entry has an invalid id: ${JSON.stringify(g?.id)}`); continue; }
    if (seen.has(g.id)) r.error(`duplicate registry entry for "${g.id}"`);
    seen.add(g.id);
    if (g.category && !categories.has(g.category)) r.error(`"${g.id}" has unknown category "${g.category}"`);
    if (g.status && !STATUS_VOCAB.has(g.status)) r.error(`"${g.id}" has unknown status "${g.status}"`);
  }
  // Folders present on disk but not registered (invisible to the hub).
  for (const id of listGameIds()) {
    if (!seen.has(id) && isFile(`games/${id}/game.json`)) r.warn(`games/${id}/ exists but is not registered in games.json`);
  }
  r.info(`${games.length} registered game(s), ${categories.size} categories`);
}

// Feature L: per-game link metadata completeness, warn-level only.
//   game.json  shareTitle + description  (the canonical link copy)
//   index.html og:title/og:description/og:url + a twitter card
//   assets/og-image.jpg + og:image        (the 1200×630 splash shot)
// Only live/beta games are checked — in-design/proposed/archived games are not
// shareable yet, and warning about them would be noise.
const SHAREABLE = new Set(['live', 'beta']);

function validateLinkMetadata(id, gj, r) {
  const status = gj.status || null;
  if (!SHAREABLE.has(status)) return;

  if (typeof gj.shareTitle !== 'string' || !gj.shareTitle.trim()) r.warn('game.json has no shareTitle (link copy)');
  if (typeof gj.description !== 'string' || !gj.description.trim()) r.warn('game.json has no description (link copy)');

  const hasImage = isFile(`games/${id}/assets/og-image.jpg`);
  if (!hasImage) r.warn('assets/og-image.jpg is missing (regen: tools/pipeline/capture_og_images.mjs)');

  if (!isFile(`games/${id}/index.html`)) return; // already warned above
  let html = '';
  try { html = readText(`games/${id}/index.html`); } catch { return; }
  const missing = ['og:title', 'og:description', 'og:url'].filter((tag) => !html.includes(`property="${tag}"`));
  if (missing.length) r.warn(`index.html <head> is missing ${missing.join(', ')}`);
  if (!html.includes('name="twitter:card"')) r.warn('index.html <head> is missing the twitter:card meta');
  if (hasImage && !html.includes('property="og:image"')) r.warn('assets/og-image.jpg exists but index.html has no og:image');
}

function validatePerGame(subject, r) {
  const id = subject.id;
  const entry = subject.entry || {};
  if (!isDir(`games/${id}`)) { r.error(`registered game folder is missing: games/${id}/`); return; }
  const gj = tryReadJSON(`games/${id}/game.json`);
  if (!gj) { r.error('game.json is missing or not valid JSON'); return; }

  if (gj.id !== undefined && gj.id !== id) r.error(`game.json id "${gj.id}" does not match folder "${id}"`);
  if (gj.status && !STATUS_VOCAB.has(gj.status)) r.error(`game.json status "${gj.status}" is not in the vocabulary`);
  if (entry.path && entry.path !== `games/${id}/`) r.warn(`registry path "${entry.path}" is not "games/${id}/"`);

  // Mirrored descriptive fields — ERROR, because the hub reads the registry copy.
  validateMirroredFields(id, entry, gj, r);

  if (!isFile(`games/${id}/ASSETS.md`)) r.warn('ASSETS.md is missing');
  if (!isFile(`games/${id}/index.html`)) r.warn('index.html is missing');

  // uses[] sanity: every path-shaped reference should resolve on disk.
  const uses = Array.isArray(gj.uses) ? gj.uses : [];
  for (const u of uses) {
    if (typeof u !== 'string' || !u.includes('/')) continue;
    const dir = u.endsWith('/');
    if (dir) { if (!isDir(u.replace(/\/$/, '')) && !exists(u)) r.warn(`uses[] path not found: ${u}`); }
    else if (/\.(js|mjs|json|png|jpe?g|webp|m4a|mp3|woff2|css|html)$/i.test(u)) {
      if (!isFile(u)) r.error(`uses[] file not found: ${u}`);
    } else if (!exists(u)) r.warn(`uses[] path not found: ${u}`);
  }

  // characters[] should name real shared characters.
  for (const c of Array.isArray(gj.characters) ? gj.characters : []) {
    if (typeof c === 'string' && isKebabId(c) && !isDir(`shared/characters/${c}`)) r.warn(`characters[] references unknown character "${c}"`);
  }

  // Link metadata (Feature L). A game that is live or beta is shareable, so it
  // owes the world a title, a description, a splash shot and the meta block that
  // points at them. All WARN — copy and captures are authored work, and a
  // missing one must never break the sweep or block an unrelated change.
  validateLinkMetadata(id, gj, r);
  r.info(`${uses.length} uses[] entr${uses.length === 1 ? 'y' : 'ies'}, status ${gj.status || '?'}`);
}

function validate(subject, r) {
  if (subject.registryWide) validateRegistryWide(r);
  else validatePerGame(subject, r);
}

export default { target: 'registry', aliases: ['games', 'game'], subjects, validate };
