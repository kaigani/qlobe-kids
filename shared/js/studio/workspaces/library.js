// library.js — native Library workspace. A browsable, image-led index over every
// object the Studio knows about: shared characters plus the fv2 objects[] registry
// (pose-actor / prop-pack / scene-pack / story-pack / music-sync / game), plus the
// generated media awaiting assignment.
//
// mount(host, ctx) -> cleanup, matching the shell contract in studio.js and the
// pattern established by workspaces/rig.js. Degrades to a static preview (no
// authoring server) by reading shared/data/usage-index.json directly and showing
// "—" where a server-only signal would go.
//
// Phase 6: the Library BROWSES media, it no longer makes it. Generation and the
// whole review loop (accept / reject / assign / regenerate) live in the Generate
// workspace; media cards here are read-only, with an "Open in Generate" deep link
// and the provenance panel (rendered by lib/generate-core.js) in the inspector.
//
// Phase 6.2 (Feature K) — the visual refresh:
//   * the grid-driving controls left the right rail and became a full-width
//     toolbar (search / type / project / status / sort / density / + New asset)
//     with a quiet category row beneath it. The right rail is now a CONTEXTUAL
//     INSPECTOR that opens on selection, and carries the library explainer as its
//     empty state.
//   * cards are image-led. Every object resolves a real thumbnail out of the
//     static tree (character head part, first pose, pack collage, hub tile, media
//     PNG) and falls back to a designed inline-SVG placeholder per type.
//   * one honest status per object (Ready / Needs review / Incomplete / Needs
//     assignment / Error) replaces the old validation pill; capabilities
//     (Rigged · Poses · Voice) became muted chips, which are not statuses.
//   * clicking a card SELECTS it (inspector); "Open asset" is what navigates.

import { serverStatus } from '../api.js';
import { loadStudioObjects } from '../projects.js';
import { RIGGED_CHARACTERS } from './rig-data.js';
import {
  createMediaController, mediaToObject, mediaAssetUrl, mediaPreviewUrl,
  openMediaPreview, openPreviewOverlay, escapeHtml, closeOverlay,
} from './lib/generate-core.js';

const USAGE_INDEX_URL = new URL('../../../data/usage-index.json', import.meta.url);
// workspaces/ -> studio/ -> js/ -> shared/ -> repo root. Everything the Library
// previews is addressed repo-root-relative through here, so the studio keeps
// working from a sub-path deploy (no leading "/" anywhere).
const repoUrl = (path) => new URL(`../../../../${String(path).replace(/^\/+/, '')}`, import.meta.url).href;

const TYPE_LABEL = {
  character: 'Character', 'pose-actor': 'Pose Actor', 'prop-pack': 'Prop Pack',
  'scene-pack': 'Scene Pack', 'story-pack': 'Story Pack', 'music-sync': 'Music Sync',
  game: 'Game', media: 'Media',
};

// Where a card sends you when you press "Open asset". Games default to Stage — a
// reasonable landing spot even though a game isn't itself a Stage document.
// Pose actors live under a project's "assemble" (pose-library) workspace, not
// Rig — Rig only edits the 8 shared bone-rigged puppets (rig-data.js).
const TARGET_WORKSPACE = {
  character: 'rig', 'pose-actor': 'assemble', 'prop-pack': 'props',
  'scene-pack': 'stage', 'story-pack': 'stage', 'music-sync': 'music', game: 'stage',
};

// The category row. Quieter than the global nav, and it drives exactly the same
// filtering the Type facet does — picking a single-type category selects that
// type in the dropdown, picking a type selects the category that contains it, so
// the two controls can never contradict each other.
const CATEGORIES = [
  { id: 'all', label: 'All', types: null },
  { id: 'characters', label: 'Characters', types: ['character', 'pose-actor'] },
  { id: 'props', label: 'Props', types: ['prop-pack'] },
  { id: 'scenes', label: 'Scenes', types: ['scene-pack'] },
  { id: 'packs', label: 'Packs', types: ['story-pack', 'music-sync'] },
  { id: 'games', label: 'Games', types: ['game'] },
  { id: 'media', label: 'Generated Media', types: ['media'] },
];
const categoryFor = (type) => CATEGORIES.find((c) => c.types?.includes(type))?.id || 'all';
// Which Generate section "+ New asset" lands on, per active category.
const GENERATE_SECTION = { characters: 'character', props: 'prop', scenes: 'scene' };

// One coherent status vocabulary. `tone` maps to the dot in studio.css:
// ok = green, warn = amber, warn-hollow = amber ring (incomplete), danger = red.
const STATUS = {
  ready: { label: 'Ready', tone: 'ok' },
  review: { label: 'Needs review', tone: 'warn' },
  incomplete: { label: 'Incomplete', tone: 'warn-hollow' },
  unassigned: { label: 'Needs assignment', tone: 'warn' },
  error: { label: 'Error', tone: 'danger' },
};
const STATUS_IDS = Object.keys(STATUS);

const SORTS = [
  { id: 'newest', label: 'Newest' },
  { id: 'name', label: 'Name A–Z' },
  { id: 'name-desc', label: 'Name Z–A' },
  { id: 'type', label: 'Type' },
  { id: 'used', label: 'Most used' },
];

const DENSITY_KEY = 'qlobe-studio-library-density';

// ---------------------------------------------------------------------------
// Static-tree probes. The server has no thumbnail endpoint and Phase 6.2 adds no
// endpoints, so previews are resolved client-side by asking the static tree for
// paths we already know the shape of. Every answer is cached at MODULE scope, so
// leaving the Library and coming back costs zero requests.
// ---------------------------------------------------------------------------
const probeCache = new Map();  // absolute url -> Promise<boolean>
const docCache = new Map();    // repo path   -> Promise<object|null>
const metaCache = new Map();   // "type:id"   -> {thumbs:[url], caps:[string], counts:{}}
const stampCache = new Map();  // repo path   -> Promise<string|null> (Last-Modified)

function probeImage(url) {
  if (!probeCache.has(url)) {
    probeCache.set(url, new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = url;
    }));
  }
  return probeCache.get(url);
}

async function firstExisting(paths) {
  for (const path of paths) {
    // eslint-disable-next-line no-await-in-loop -- candidates are ordered by preference
    if (await probeImage(repoUrl(path))) return repoUrl(path);
  }
  return null;
}

function loadDoc(path) {
  if (!docCache.has(path)) {
    docCache.set(path, fetch(repoUrl(path), { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null));
  }
  return docCache.get(path);
}

// "Updated" for a registry object is the document's Last-Modified — the only
// honest date available without a new endpoint. One HEAD per object, once.
function loadStamp(path) {
  if (!stampCache.has(path)) {
    stampCache.set(path, fetch(repoUrl(path), { method: 'HEAD', cache: 'no-store' })
      .then((response) => (response.ok ? response.headers.get('last-modified') : null))
      .catch(() => null));
  }
  return stampCache.get(path);
}

const dirOf = (path) => path.slice(0, path.lastIndexOf('/') + 1);
const isoDay = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

// kebab-id -> Title Case. The card shows the human name; the id stays in mono in
// the inspector, where identifiers belong.
function displayName(object) {
  if (object.type === 'media') return object.id; // media ids ARE the name (generated)
  return object.id.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

// The badge names what the thing IS. A media record's type is its kind — the
// mockup badges them "IMAGE" / "VOICE", and "Media" tells a reader nothing.
function typeLabel(object) {
  if (object.type === 'media') {
    return object.kind === 'voice' ? 'Voice'
      : object.kind === 'pose-actor' ? 'Pose actor' : 'Image';
  }
  return TYPE_LABEL[object.type] || object.type;
}

// ---- designed placeholders ------------------------------------------------
// Inline SVG only — no external asset, no data-URI decode, and they inherit the
// page's custom properties so they re-tone with the token block.
const svg = (body) => `<svg class="library-thumb-svg" viewBox="0 0 120 90" role="img" aria-hidden="true" focusable="false">${body}</svg>`;
const PLACEHOLDER = {
  character: svg(`<circle cx="60" cy="34" r="17" fill="var(--muted-soft)"/>
    <path d="M28 88c0-18 14-30 32-30s32 12 32 30z" fill="var(--muted-soft)"/>`),
  'pose-actor': svg(`<circle cx="60" cy="30" r="13" fill="var(--muted-soft)"/>
    <path d="M60 43v26M60 50l-18 10M60 50l18 10M60 69l-13 17M60 69l13 17" stroke="var(--muted-soft)"
      stroke-width="7" stroke-linecap="round" fill="none"/>`),
  'prop-pack': svg(`<rect x="16" y="46" width="30" height="30" fill="var(--muted-soft)"/>
    <circle cx="76" cy="60" r="16" fill="var(--muted-soft)"/>
    <path d="M40 38 56 12 72 38z" fill="var(--muted-soft)"/>`),
  'scene-pack': svg(`<rect x="8" y="14" width="104" height="62" fill="var(--sunken)"/>
    <circle cx="90" cy="32" r="9" fill="var(--muted-soft)"/>
    <path d="M8 76 42 40l22 26 14-14 28 24z" fill="var(--muted-soft)"/>`),
  'story-pack': svg(`<rect x="14" y="18" width="80" height="54" fill="var(--muted-soft)"/>
    <rect x="22" y="24" width="80" height="54" fill="var(--divider)" stroke="var(--muted-soft)" stroke-width="3"/>
    <path d="M62 24v54" stroke="var(--muted-soft)" stroke-width="3"/>`),
  'music-sync': svg(`<g fill="var(--muted-soft)">
    <rect x="14" y="38" width="7" height="14"/><rect x="27" y="28" width="7" height="34"/>
    <rect x="40" y="16" width="7" height="58"/><rect x="53" y="32" width="7" height="26"/>
    <rect x="66" y="22" width="7" height="46"/><rect x="79" y="34" width="7" height="22"/>
    <rect x="92" y="40" width="7" height="10"/></g>`),
  game: svg(`<rect x="12" y="28" width="96" height="40" rx="18" fill="var(--muted-soft)"/>
    <g fill="var(--card)"><rect x="28" y="44" width="20" height="6"/><rect x="35" y="37" width="6" height="20"/>
    <circle cx="80" cy="43" r="5"/><circle cx="92" cy="53" r="5"/></g>`),
  media: svg(`<rect x="12" y="16" width="96" height="58" fill="var(--sunken)" stroke="var(--muted-soft)" stroke-width="3"/>
    <circle cx="42" cy="36" r="7" fill="var(--muted-soft)"/>
    <path d="M18 68 46 44l16 14 14-10 24 20z" fill="var(--muted-soft)"/>`),
  audio: svg(`<g fill="var(--muted-soft)">
    <rect x="10" y="40" width="6" height="10"/><rect x="22" y="30" width="6" height="30"/>
    <rect x="34" y="18" width="6" height="54"/><rect x="46" y="34" width="6" height="22"/>
    <rect x="58" y="24" width="6" height="42"/><rect x="70" y="12" width="6" height="66"/>
    <rect x="82" y="30" width="6" height="30"/><rect x="94" y="38" width="6" height="14"/>
    <rect x="106" y="42" width="6" height="6"/></g>`),
};
const placeholderFor = (object) => PLACEHOLDER[object.type === 'media' && object.kind === 'voice' ? 'audio' : object.type]
  || PLACEHOLDER.media;

// ---- per-object preview + capabilities ------------------------------------
// Resolved once per object and cached module-wide. Returns:
//   thumbs  0 urls (placeholder), 1 url (single preview) or 4 (pack collage)
//   caps    capability chips — what the object CAN do, never how healthy it is
async function resolveMeta(object, { completeness, usageIndex }) {
  const key = `${object.type}:${object.id}`;
  if (metaCache.has(key)) return metaCache.get(key);
  const meta = { thumbs: [], caps: [], counts: {} };

  if (object.type === 'character') {
    const found = await firstExisting([
      `shared/characters/${object.id}/parts/head.png`,
      `shared/characters/${object.id}/portrait.png`,
      `shared/characters/${object.id}/anim/head.png`,
    ]);
    if (found) meta.thumbs = [found];
    const entry = completeness?.get(object.id);
    meta.caps.push(object.tier === 'rigged' ? 'Rigged' : object.tier === 'anim-only' ? 'Anim-only' : 'Character');
    if (entry?.visemeHeads?.have) meta.caps.push('Visemes');
    if (entry?.voiceLines) meta.caps.push('Voice');
  } else if (object.type === 'pose-actor') {
    const doc = object.document ? await loadDoc(object.document) : null;
    const poses = doc?.poses && typeof doc.poses === 'object' ? doc.poses : {};
    const names = Object.keys(poses);
    const first = poses.neutral?.art || (names.length ? poses[names[0]].art : null);
    if (first && object.document) {
      const url = repoUrl(dirOf(object.document) + first);
      if (await probeImage(url)) meta.thumbs = [url];
    }
    if (names.length) meta.caps.push(`${names.length} poses`);
    meta.counts.poses = names.length;
  } else if (object.type === 'prop-pack') {
    const doc = object.document ? await loadDoc(object.document) : null;
    const props = doc?.props && typeof doc.props === 'object' ? doc.props : {};
    const arts = Object.values(props).map((prop) => prop?.art).filter(Boolean).slice(0, 4);
    meta.thumbs = arts.map((art) => repoUrl(dirOf(object.document) + art));
    const total = Object.keys(props).length;
    if (total) meta.caps.push(`${total} props`);
    meta.counts.props = total;
  } else if (object.type === 'scene-pack') {
    const doc = object.document ? await loadDoc(object.document) : null;
    const scenes = doc?.scenes && typeof doc.scenes === 'object' ? doc.scenes : {};
    const arts = Object.values(scenes).map((scene) => scene?.backdrop || scene?.art).filter(Boolean).slice(0, 4);
    meta.thumbs = arts.map((art) => repoUrl(dirOf(object.document) + art));
    const total = Object.keys(scenes).length;
    meta.caps.push(total ? `${total} scenes` : 'No scenes yet');
    meta.counts.scenes = total;
  } else if (object.type === 'story-pack') {
    const doc = object.document ? await loadDoc(object.document) : null;
    if (doc?.backdrop && object.document) {
      const url = repoUrl(dirOf(object.document) + doc.backdrop);
      if (await probeImage(url)) meta.thumbs = [url];
    }
    const stories = Array.isArray(doc?.stories) ? doc.stories.length : Object.keys(doc?.stories || {}).length;
    const stones = Array.isArray(doc?.stones) ? doc.stones.length : Object.keys(doc?.stones || {}).length;
    if (stories) meta.caps.push(`${stories} stories`);
    if (stones) meta.caps.push(`${stones} stones`);
    meta.counts.stories = stories;
  } else if (object.type === 'music-sync') {
    const doc = object.document ? await loadDoc(object.document) : null;
    const profiles = Object.keys(doc?.profiles || {}).length;
    if (profiles) meta.caps.push(`${profiles} instruments`);
    meta.counts.profiles = profiles;
  } else if (object.type === 'game') {
    // assets/hub/tiles/ is curated by hand — read-only reference, never written.
    const found = await firstExisting([`assets/hub/tiles/${object.id}.jpg`, `assets/hub/tiles/${object.id}.png`]);
    if (found) meta.thumbs = [found];
    const entry = usageIndex?.forward?.[object.id];
    if (entry?.engine) meta.caps.push(entry.engine);
    if (entry?.status) meta.caps.push(entry.status);
  } else if (object.type === 'media') {
    // Same visual Generate shows: the server-named preview (a pose actor's
    // contact strip) wins over the asset itself, which may not be an image.
    const url = mediaPreviewUrl(object) || (object.kind !== 'voice' ? mediaAssetUrl(object) : '');
    if (url && object.kind !== 'voice') meta.thumbs = [url];
    meta.caps.push(object.kind === 'voice' ? 'Voice'
      : object.kind === 'pose-actor' ? 'Pose actor' : 'Image');
    if (object.hasMagenta) meta.caps.push('Alpha QA');
    if (object.hasTranscript) meta.caps.push('Transcript');
  }

  metaCache.set(key, meta);
  return meta;
}

export async function mount(host, { params, toast, openWorkspace, setNav, setParam }) {
  let destroyed = false;
  let objects = [];             // the full flat list of {id, type, project, tier, usageCount, ...}
  let usageIndex = null;        // shared/data/usage-index.json, forward+reverse
  let completeness = null;      // Map<charId, {...}> from /api/studio/completeness, or null
  let serverAvailable = false;
  let selectedId = null;        // inspector subject
  let openMenuId = null;        // which card's ••• overflow is open
  let inspectorPanel = null;    // 'provenance' when a media card's lineage is showing
  let resolving = false;        // guards the async thumbnail pass against re-entry
  const validationCache = new Map(); // id -> {status:'valid'|'warnings'|'incomplete'|'error', ...}
  const stamps = new Map();     // id -> 'YYYY-MM-DD' | null (document Last-Modified)

  let density = 'grid';
  try { density = localStorage.getItem(DENSITY_KEY) === 'list' ? 'list' : 'grid'; } catch { density = 'grid'; }

  // `tier` has no toolbar control any more (the mockup's toolbar is search + four
  // dropdowns, and tier now reads off the capability chips) but it stays in the
  // facet state: the debug hook filters on it, and a tier set that way shows up
  // as a removable chip like every other active filter.
  const facets = { view: 'all', type: 'all', tier: 'all', project: 'all', status: 'all', q: '', sort: 'newest' };

  // ---- media (read-only since Phase 6) ------------------------------------
  // The controller owns the media list, the provenance panel markup and every
  // /api/studio/media* call. The Library renders its own image-led cards for
  // media so they sit in the same grid as everything else, and borrows the
  // controller's provenance panel for the inspector.
  const mediaController = createMediaController({
    readOnly: true,
    render: () => { if (!destroyed) render(); },
    toast,
    serverAvailable: () => serverAvailable,
    destroyed: () => destroyed,
    usageIndex: () => usageIndex,
  });

  host.innerHTML = `
    <div class="workspace library-workspace" data-workspace="library">
      <header class="library-head">
        <h1 class="library-title">Library</h1>
        <p class="library-lede">Browse and manage reusable assets across projects.</p>
        <span class="library-count" data-count>—</span>
      </header>
      <div class="library-toolbar">
        <div class="library-toolbar-row">
          <label class="library-search">
            <span class="library-search-icon" aria-hidden="true">
              <svg viewBox="0 0 16 16" focusable="false"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.5 10.5 14 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </span>
            <input type="search" data-facet="q" placeholder="Search assets, IDs or projects…"
              autocomplete="off" aria-label="Search assets, IDs or projects">
          </label>
          <select data-facet="type" aria-label="Filter by type">
            <option value="all">All types</option>
            <option value="character">Character</option>
            <option value="pose-actor">Pose Actor</option>
            <option value="prop-pack">Prop Pack</option>
            <option value="scene-pack">Scene Pack</option>
            <option value="story-pack">Story Pack</option>
            <option value="music-sync">Music Sync</option>
            <option value="game">Game</option>
            <option value="media">Generated Media</option>
          </select>
          <select data-facet="project" aria-label="Filter by project"><option value="all">All projects</option></select>
          <select data-facet="status" aria-label="Filter by status">
            <option value="all">All statuses</option>
            ${STATUS_IDS.map((id) => `<option value="${id}">${STATUS[id].label}</option>`).join('')}
          </select>
          <select data-facet="sort" aria-label="Sort">
            ${SORTS.map((sort) => `<option value="${sort.id}">Sort: ${sort.label}</option>`).join('')}
          </select>
          <div class="nav-segmented library-density" role="group" aria-label="Density">
            <button type="button" data-density="grid">Grid</button>
            <button type="button" data-density="list">List</button>
          </div>
          <button type="button" class="library-new" data-action="new-asset">+ New asset</button>
        </div>
        <div class="library-chips" data-chips hidden></div>
        <div class="nav-segmented library-views" role="group" aria-label="Category" data-views>
          ${CATEGORIES.map((category) => `<button type="button" data-view="${category.id}">${escapeHtml(category.label)}</button>`).join('')}
        </div>
      </div>
      <div class="workspace-canvas library-canvas" data-grid></div>
      <aside class="workspace-inspector library-inspector" data-inspector></aside>
    </div>`;

  const grid = host.querySelector('[data-grid]');
  const inspector = host.querySelector('[data-inspector]');
  const chipBar = host.querySelector('[data-chips]');
  const countNode = host.querySelector('[data-count]');
  const facetEl = (name) => host.querySelector(`[data-facet="${name}"]`);

  // ---- data loading ------------------------------------------------------
  async function loadServerFlags() {
    try {
      await serverStatus();
      serverAvailable = true;
    } catch {
      serverAvailable = false;
    }
  }

  async function loadUsageIndex() {
    // GET /api/studio/usage-index -> { ok, index: <the same document as usage-index.json> }.
    try {
      const response = await fetch('/api/studio/usage-index', { cache: 'no-store' });
      if (!response.ok) throw new Error('no usage-index endpoint');
      const body = await response.json();
      if (!body?.index) throw new Error('malformed usage-index response');
      usageIndex = body.index;
      return;
    } catch { /* fall through to the static registry file below */ }
    try {
      const response = await fetch(USAGE_INDEX_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error('could not load usage-index.json');
      usageIndex = await response.json();
    } catch (error) {
      console.warn('Library: usage index unavailable', error);
      usageIndex = null;
    }
  }

  async function loadCompleteness() {
    // GET /api/studio/completeness?type=character
    //  -> { ok, type, characters: [{ id, tier, rig, parts:{have,need}, visemeHeads:{have,need}, restHead, voiceLines, voiceCues, portrait, complete }] }.
    if (!serverAvailable) { completeness = null; return; }
    try {
      const response = await fetch('/api/studio/completeness?type=character', { cache: 'no-store' });
      if (!response.ok) throw new Error('no completeness endpoint');
      const body = await response.json();
      const list = Array.isArray(body?.characters) ? body.characters : [];
      completeness = new Map(list.map((item) => [item.id, item]));
    } catch {
      completeness = null; // static preview — characters fall back to "Ready"
    }
  }

  function usageCountFor(type, id) {
    if (!usageIndex) return 0;
    const reverse = usageIndex.reverse || {};
    if (type === 'character' || type === 'pose-actor') return reverse.characters?.[id]?.length || 0;
    if (type === 'game') return usageIndex.forward?.[id] ? 1 : 0;
    return 0;
  }

  function tierFor(type, id) {
    if (type === 'pose-actor') return 'pose-actor';
    if (type !== 'character') return null;
    const entry = completeness?.get(id);
    if (entry?.tier === 'rigged' || entry?.tier === 'anim-only' || entry?.tier === 'pose-actor') return entry.tier;
    return RIGGED_CHARACTERS.includes(id) ? 'rigged' : 'anim-only';
  }

  // 'valid' | 'incomplete' | null (null = no completeness data, static preview).
  function completenessFor(type, id) {
    if (type !== 'character') return null;
    const entry = completeness?.get(id);
    if (!entry) return null;
    return entry.complete ? 'valid' : 'incomplete';
  }

  async function buildObjects() {
    let registryObjects = [];
    try {
      registryObjects = await loadStudioObjects();
    } catch (error) {
      console.warn('Library: could not load the studio project registry', error);
    }
    // registryObjects already includes type:"character" entries for the 8 shared
    // rigged puppets (projects.json objects[]); fall back to the static roster
    // only if the registry read failed entirely.
    const hasCharacters = registryObjects.some((object) => object.type === 'character');
    const list = hasCharacters ? registryObjects.slice() : [
      ...RIGGED_CHARACTERS.map((id) => ({ type: 'character', id, document: `shared/characters/${id}/rig.json` })),
      ...registryObjects,
    ];
    objects = list.map((object, index) => ({
      ...object,
      order: index,
      tier: tierFor(object.type, object.id),
      usageCount: usageCountFor(object.type, object.id),
      completeness: completenessFor(object.type, object.id),
    }));
  }

  function projectOptionsHtml() {
    const ids = [...new Set(objects.map((object) => object.project).filter(Boolean))].sort();
    return ids.map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join('');
  }

  // ---- status --------------------------------------------------------------
  // Mapped from what the studio actually knows, in priority order. A card never
  // claims a state it cannot evidence: with no authoring server, characters and
  // packs read "Ready" (they exist and nothing has reported otherwise) rather
  // than inventing a health signal.
  function statusFor(object) {
    if (object.exists === false) return 'error';
    const checked = validationCache.get(object.id);
    if (checked && checked.status !== 'unknown') {
      if (checked.status === 'incomplete' || checked.errorCount) return 'error';
      if (checked.status === 'warnings') return 'review';
      if (checked.status === 'valid') return 'ready';
    }
    if (object.type === 'media') {
      const qaStatus = String(object.qa?.status || '').toLowerCase();
      if (qaStatus === 'failed-qa') return 'error';
      if (qaStatus === 'review') return 'review';
      return 'unassigned'; // accepted or unmarked: still sitting in the inbox
    }
    if (object.completeness === 'incomplete') return 'incomplete';
    return 'ready';
  }

  const capsFor = (object) => metaCache.get(`${object.type}:${object.id}`)?.caps || [];
  const thumbsFor = (object) => metaCache.get(`${object.type}:${object.id}`)?.thumbs || [];

  function updatedFor(object) {
    if (object.type === 'media') return object.created || null;
    return stamps.get(object.id) || null;
  }

  // ---- facet filtering -----------------------------------------------------
  // Media objects (type:"media") are merged in here — combinedList() appends them,
  // mapped through mediaToObject(), so the Type facet, the category row and the
  // search/project/status filters all apply uniformly.
  function combinedList() {
    const media = mediaController.list();
    return media.length ? objects.concat(media.map(mediaToObject)) : objects;
  }

  function matchesSearch(object, q) {
    if (!q) return true;
    const haystack = [object.id, displayName(object), object.project || 'shared library',
      typeLabel(object)].join(' ').toLowerCase();
    return haystack.includes(q);
  }

  function sortList(list, sort) {
    const byName = (a, b) => displayName(a).localeCompare(displayName(b));
    const copy = list.slice();
    if (sort === 'name') return copy.sort(byName);
    if (sort === 'name-desc') return copy.sort((a, b) => byName(b, a));
    if (sort === 'type') return copy.sort((a, b) => (TYPE_LABEL[a.type] || a.type)
      .localeCompare(TYPE_LABEL[b.type] || b.type) || byName(a, b));
    if (sort === 'used') return copy.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0) || byName(a, b));
    // newest: document Last-Modified (or a media record's created date) descending;
    // anything with no date yet keeps its registry order, below the dated ones.
    return copy.sort((a, b) => {
      const left = updatedFor(a);
      const right = updatedFor(b);
      if (left && right && left !== right) return new Date(right) - new Date(left);
      if (left && !right) return -1;
      if (!left && right) return 1;
      return (a.order ?? 0) - (b.order ?? 0);
    });
  }

  function filter(activeFacets = facets) {
    const q = (activeFacets.q || '').trim().toLowerCase();
    const viewTypes = CATEGORIES.find((category) => category.id === (activeFacets.view || 'all'))?.types;
    const list = combinedList().filter((object) => {
      if (viewTypes && !viewTypes.includes(object.type)) return false;
      if (activeFacets.type !== 'all' && object.type !== activeFacets.type) return false;
      if (activeFacets.tier !== 'all' && object.tier !== activeFacets.tier) return false;
      if (activeFacets.project !== 'all' && object.project !== activeFacets.project) return false;
      if (activeFacets.status && activeFacets.status !== 'all' && statusFor(object) !== activeFacets.status) return false;
      if (!matchesSearch(object, q)) return false;
      return true;
    });
    return sortList(list, activeFacets.sort || 'newest');
  }

  const objectById = (id) => combinedList().find((object) => object.id === id) || null;

  // ---- validation (on-demand, from the ••• overflow) -----------------------
  // POST /api/studio/validate {target} -> { ok, report: { counts:{error,warn,info}, findings:[...] } }.
  async function fetchValidation(id) {
    if (validationCache.has(id)) return validationCache.get(id);
    if (!serverAvailable) { const result = { status: 'unknown' }; validationCache.set(id, result); return result; }
    try {
      const response = await fetch('/api/studio/validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: id }),
      });
      if (!response.ok) throw new Error('no validate endpoint');
      const body = await response.json();
      const report = body.report || {};
      const counts = report.counts || {};
      const findings = report.findings || [];
      const result = {
        status: report.subjectsRun === 0 ? 'unknown' : counts.error ? 'incomplete' : counts.warn ? 'warnings' : 'valid',
        warnCount: counts.warn || 0, errorCount: counts.error || 0, findings,
      };
      validationCache.set(id, result);
      return result;
    } catch {
      const result = { status: 'unknown' };
      validationCache.set(id, result);
      return result;
    }
  }

  // ---- previews ------------------------------------------------------------
  // One async pass per repaint: resolve any visible object that has no cached
  // preview yet, then repaint ONCE. Every answer is cached module-wide, so the
  // pass no-ops from the second render on and the grid never hammers the tree.
  // Work runs through a small pool rather than one Promise.all over everything:
  // 30 objects would be fine either way, but a 100+ library would otherwise open
  // a hundred simultaneous probes at the static tree in one burst.
  async function pooled(tasks, limit = 8) {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (cursor < tasks.length && !destroyed) {
        const task = tasks[cursor++];
        await task();
      }
    });
    await Promise.all(workers);
  }

  async function ensureMeta(list) {
    if (resolving || destroyed) return;
    const pending = list.filter((object) => !metaCache.has(`${object.type}:${object.id}`));
    const undated = list.filter((object) => object.type !== 'media' && object.document && !stamps.has(object.id));
    if (!pending.length && !undated.length) return;
    resolving = true;
    try {
      await pooled([
        ...pending.map((object) => () => resolveMeta(object, { completeness, usageIndex })),
        ...undated.map((object) => async () => { stamps.set(object.id, isoDay(await loadStamp(object.document))); }),
      ]);
    } finally {
      resolving = false;
    }
    if (!destroyed) render();
  }

  // ---- card + row markup ---------------------------------------------------
  function thumbHtml(object) {
    const thumbs = thumbsFor(object);
    if (!thumbs.length) return `<div class="library-thumb-fill" data-placeholder>${placeholderFor(object)}</div>`;
    if (thumbs.length === 1) {
      return `<img class="library-thumb-img" loading="lazy" decoding="async" alt=""
        src="${escapeHtml(thumbs[0])}" data-thumb="${escapeHtml(object.id)}">`;
    }
    return `<div class="library-thumb-collage">${thumbs.slice(0, 4).map((url) => `
      <img loading="lazy" decoding="async" alt="" src="${escapeHtml(url)}" data-thumb="${escapeHtml(object.id)}">`).join('')}</div>`;
  }

  function statusHtml(object, { compact = false } = {}) {
    const status = STATUS[statusFor(object)];
    return `<span class="library-status" data-tone="${status.tone}"${compact ? ' title="' + escapeHtml(status.label) + '"' : ''}>
      <i class="library-dot" aria-hidden="true"></i>${escapeHtml(status.label)}</span>`;
  }

  function menuHtml(object) {
    if (openMenuId !== object.id) return '';
    const guard = serverAvailable ? '' : ' disabled title="needs the authoring server"';
    const items = [`<button type="button" role="menuitem" data-menu-action="open" data-menu-id="${escapeHtml(object.id)}">Open asset</button>`];
    if (object.type === 'media') {
      items.push(`<button type="button" role="menuitem" data-menu-action="provenance" data-menu-id="${escapeHtml(object.id)}">Provenance</button>`);
      items.push(`<button type="button" role="menuitem" data-menu-action="generate" data-menu-id="${escapeHtml(object.id)}">Open in Generate</button>`);
    } else {
      items.push(`<button type="button" role="menuitem" data-menu-action="check" data-menu-id="${escapeHtml(object.id)}"${guard}>Check</button>`);
    }
    items.push(`<button type="button" role="menuitem" data-menu-action="copy" data-menu-id="${escapeHtml(object.id)}">Copy ID</button>`);
    return `<div class="library-menu" role="menu" data-menu>${items.join('')}</div>`;
  }

  function cardHtml(object) {
    const caps = capsFor(object);
    const scope = object.project ? `Project: ${escapeHtml(object.project)}` : 'Shared library';
    return `
      <article class="library-card" data-card="${escapeHtml(object.id)}" data-type="${escapeHtml(object.type)}"
        ${selectedId === object.id ? 'data-selected="1" ' : ''}tabindex="0" role="button"
        aria-pressed="${selectedId === object.id}"
        aria-label="${escapeHtml(displayName(object))} — ${escapeHtml(typeLabel(object))}">
        <div class="library-thumb">
          ${thumbHtml(object)}
          <span class="library-type">${escapeHtml(typeLabel(object))}</span>
          <button type="button" class="library-more" data-more="${escapeHtml(object.id)}"
            aria-haspopup="menu" aria-expanded="${openMenuId === object.id}"
            aria-label="More actions for ${escapeHtml(displayName(object))}">•••</button>
          ${menuHtml(object)}
        </div>
        <div class="library-card-body">
          <h3 class="library-card-title">${escapeHtml(displayName(object))}</h3>
          <p class="library-scope">${scope}</p>
          ${caps.length ? `<p class="library-caps">${caps.map(escapeHtml).join(' · ')}</p>` : ''}
        </div>
        <div class="library-card-foot">
          ${statusHtml(object)}
          <span class="library-used">Used by ${object.usageCount || 0}</span>
        </div>
      </article>`;
  }

  function rowHtml(object) {
    const updated = updatedFor(object);
    return `
      <div class="library-row" data-card="${escapeHtml(object.id)}" data-type="${escapeHtml(object.type)}"
        ${selectedId === object.id ? 'data-selected="1" ' : ''}tabindex="0" role="button"
        aria-pressed="${selectedId === object.id}"
        aria-label="${escapeHtml(displayName(object))} — ${escapeHtml(typeLabel(object))}">
        <span class="library-row-thumb">${thumbHtml(object)}</span>
        <span class="library-row-name">${escapeHtml(displayName(object))}</span>
        <span class="library-type">${escapeHtml(typeLabel(object))}</span>
        <span class="library-row-project">${object.project ? escapeHtml(object.project) : 'shared'}</span>
        ${statusHtml(object)}
        <span class="library-used">Used by ${object.usageCount || 0}</span>
        <span class="library-row-date mono">${escapeHtml(updated || '—')}</span>
        <span class="library-row-more">
          <button type="button" class="library-more" data-more="${escapeHtml(object.id)}"
            aria-haspopup="menu" aria-expanded="${openMenuId === object.id}"
            aria-label="More actions for ${escapeHtml(displayName(object))}">•••</button>
          ${menuHtml(object)}
        </span>
      </div>`;
  }

  // ---- chips ---------------------------------------------------------------
  function chipsHtml() {
    const chips = [];
    if (facets.q.trim()) chips.push({ facet: 'q', label: `Search: ${facets.q.trim()}` });
    if (facets.view !== 'all') chips.push({ facet: 'view', label: CATEGORIES.find((c) => c.id === facets.view)?.label || facets.view });
    if (facets.type !== 'all') chips.push({ facet: 'type', label: TYPE_LABEL[facets.type] || facets.type });
    if (facets.tier !== 'all') chips.push({ facet: 'tier', label: `Tier: ${facets.tier}` });
    if (facets.project !== 'all') chips.push({ facet: 'project', label: `Project: ${facets.project}` });
    if (facets.status !== 'all') chips.push({ facet: 'status', label: STATUS[facets.status]?.label || facets.status });
    return chips.map((chip) => `<button type="button" class="library-chip" data-clear-facet="${chip.facet}"
      aria-label="Remove filter ${escapeHtml(chip.label)}">
      ${escapeHtml(chip.label)}<span class="library-chip-x" aria-hidden="true">×</span></button>`).join('');
  }

  // ---- inspector -----------------------------------------------------------
  function aboutHtml() {
    const serverLine = serverAvailable
      ? 'Authoring server connected — “Check” on a card’s ••• menu validates it. Generated media is read-only here; open it in Generate to review, accept or assign it.'
      : 'Static preview — usage counts come from the on-disk usage index; validation and media browsing need the authoring server.';
    return `
      <div class="panel-section library-about">
        <h2>About the library</h2>
        <p class="hint">The library is your central place for shared assets across all projects. Search, filter and
          organise every character, pack, game and generated file, then open one to keep working on it.</p>
        <p class="hint">Select a card to see its details here. The <strong>project</strong> filter above narrows the
          cards; the project chip in the breadcrumb bar scopes the whole studio.</p>
        <p class="hint" data-server-hint>${escapeHtml(serverLine)}</p>
      </div>`;
  }

  function detailRow(label, valueHtml, { mono = false } = {}) {
    return `<div class="library-detail"><dt>${escapeHtml(label)}</dt>
      <dd${mono ? ' class="mono"' : ''}>${valueHtml}</dd></div>`;
  }

  function inspectorHtml() {
    if (!selectedId) return aboutHtml();
    const object = objectById(selectedId);
    if (!object) return aboutHtml();
    const caps = capsFor(object);
    const isMedia = object.type === 'media';
    const editable = isMedia || object.type === 'character' || object.type === 'pose-actor';
    const created = isMedia ? object.created : null;
    const updated = updatedFor(object);
    const provenance = (isMedia && inspectorPanel === 'provenance' && mediaController.get(object.id))
      ? mediaController.provenancePanelHtml(mediaController.get(object.id)) : '';
    return `
      <div class="panel-section library-detail-panel">
        <div class="library-detail-head">
          <h2>${escapeHtml(displayName(object))}</h2>
          <button type="button" class="library-close" data-action="close-inspector" aria-label="Close details">×</button>
        </div>
        <button type="button" class="library-detail-preview library-detail-zoom" data-action="zoom-preview"
          title="Open full-size preview">${thumbHtml(object)}</button>
        <dl class="library-details">
          ${detailRow('Type', escapeHtml(typeLabel(object)))}
          ${detailRow('ID', escapeHtml(object.id), { mono: true })}
          ${detailRow('Scope', object.project ? escapeHtml(object.project) : 'Shared library')}
          ${detailRow('Status', statusHtml(object))}
          ${caps.length ? detailRow('Capabilities', `<span class="library-cap-chips">${caps.map((cap) => `<span class="library-cap">${escapeHtml(cap)}</span>`).join('')}</span>`) : ''}
          ${detailRow('Used by', `${object.usageCount || 0} ${object.usageCount === 1 ? 'game' : 'games'}`)}
          ${created ? detailRow('Created', escapeHtml(created), { mono: true }) : ''}
          ${detailRow('Updated', escapeHtml(updated || '—'), { mono: true })}
        </dl>
        <div class="library-detail-actions">
          <button type="button" class="library-open" data-action="open-asset">Open asset</button>
          ${editable ? '<button type="button" class="ghost wide" data-action="edit-in-generate">Edit in Generate</button>' : ''}
          ${isMedia ? `<button type="button" class="ghost wide" data-action="toggle-provenance">${provenance ? 'Hide provenance' : 'Provenance'}</button>` : ''}
        </div>
        ${provenance}
      </div>`;
  }

  // ---- rendering -----------------------------------------------------------
  function render() {
    const filtered = filter();
    const total = combinedList().length;
    countNode.textContent = filtered.length === total
      ? `${total} object${total === 1 ? '' : 's'}`
      : `${filtered.length} of ${total} objects`;

    for (const button of host.querySelectorAll('[data-view]')) {
      button.classList.toggle('on', button.dataset.view === facets.view);
    }
    for (const button of host.querySelectorAll('[data-density]')) {
      button.classList.toggle('on', button.dataset.density === density);
    }
    const chips = chipsHtml();
    chipBar.innerHTML = chips;
    chipBar.hidden = !chips;

    if (!filtered.length) {
      grid.innerHTML = `<div class="empty-state"><div><h1>No matches</h1>
        <p class="hint">Nothing here fits those filters. Clear one of the chips above, or search for a different id.</p></div></div>`;
    } else if (density === 'list') {
      grid.innerHTML = `<div class="library-list" role="list">
        <div class="library-list-head" aria-hidden="true">
          <span></span><span>Name</span><span>Type</span><span>Project</span>
          <span>Status</span><span>Usage</span><span>Updated</span><span></span>
        </div>${filtered.map(rowHtml).join('')}</div>`;
    } else {
      grid.innerHTML = `<div class="library-grid">${filtered.map(cardHtml).join('')}</div>`;
    }
    inspector.innerHTML = inspectorHtml();
    inspector.dataset.state = selectedId ? 'detail' : 'about';

    // A thumbnail that 404s (a pack whose art moved, a hub tile not drawn yet)
    // degrades to the designed placeholder rather than a broken-image box.
    for (const image of grid.querySelectorAll('[data-thumb]')) {
      image.addEventListener('error', () => {
        const holder = image.closest('.library-thumb, .library-thumb-collage, .library-row-thumb, .library-detail-preview');
        const object = objectById(image.dataset.thumb);
        if (!holder || !object) { image.remove(); return; }
        image.replaceWith(...new DOMParser().parseFromString(
          `<div class="library-thumb-fill" data-placeholder>${placeholderFor(object)}</div>`, 'text/html').body.childNodes);
      }, { once: true });
    }
    updateNav(filtered.length);
  }

  function updateNav(shown) {
    const n = shown ?? filter().length;
    setNav({ crumbs: [{ label: 'Library' }], count: `${n} object${n === 1 ? '' : 's'}` });
  }

  const fail = (error) => { console.error(error); toast(error.message, { error: true, duration: 7000 }); };

  // ---- selection + navigation ---------------------------------------------
  function select(id) {
    selectedId = id;
    inspectorPanel = null;
    openMenuId = null;
    render();
  }

  // Open an object in its contextual workspace. Media has no workspace of its
  // own — it opens its provenance in the inspector, and "Open in Generate" is the
  // route to the editing loop.
  async function openObject(id) {
    const object = objects.find((item) => item.id === id);
    if (!object) {
      if (mediaController.has(id)) { selectedId = id; inspectorPanel = 'provenance'; openMenuId = null; render(); }
      return;
    }
    const workspace = TARGET_WORKSPACE[object.type] || 'stage';
    if (object.type === 'character' || object.type === 'pose-actor') setParam('char', id);
    if (object.project) setParam('project', object.project);
    await openWorkspace(workspace);
  }

  // Deep link into the Generate workspace. openWorkspace(id, {update}) takes shell
  // options, not workspace state, so the section travels as a URL param
  // (studio.js §9.1 hygiene: the workspace validates ?section on mount).
  async function openInGenerate(section = 'review') {
    setParam('section', section === 'menu' ? null : section);
    await openWorkspace('generate');
  }

  async function newAsset() {
    const section = GENERATE_SECTION[facets.view] || 'menu';
    await openInGenerate(section);
  }

  async function runCheck(id, button) {
    if (button) { button.disabled = true; button.textContent = '…'; }
    const result = await fetchValidation(id);
    if (destroyed) return;
    if (result.status === 'unknown') toast(`No validate endpoint available for ${id} (static preview).`);
    else toast(`${id}: ${result.status === 'valid' ? 'valid' : result.status === 'warnings' ? `${result.warnCount} warnings` : 'errors found'}`);
    openMenuId = null;
    render();
  }

  // ---- wiring — one delegated listener on the persistent host node ----------
  // `host` is the shell's #native-workspace node (studio.js only clears its
  // innerHTML between mounts), so these listeners MUST come off again in cleanup
  // or every revisit stacks another handler on the same node.
  let onHostClick = null;
  let onHostKey = null;
  let onHostDblClick = null;
  let onDocClick = null;

  function wireEvents() {
    onHostClick = (event) => {
      const clearChip = event.target.closest('[data-clear-facet]');
      if (clearChip) { clearFacet(clearChip.dataset.clearFacet); return; }

      const viewButton = event.target.closest('[data-view]');
      if (viewButton) { setView(viewButton.dataset.view); return; }

      const densityButton = event.target.closest('[data-density]');
      if (densityButton) { setDensity(densityButton.dataset.density); return; }

      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'new-asset') { newAsset().catch(fail); return; }
      if (action === 'close-inspector') { selectedId = null; inspectorPanel = null; render(); return; }
      if (action === 'zoom-preview') {
        const object = objectById(selectedId);
        if (!object) return;
        // Media (incl. pose actors) get the full Generate overlay — stage tabs
        // and pose flip; everything else zooms its resolved preview image.
        if (object.type === 'media') {
          const item = mediaController.get(object.id) || object;
          openMediaPreview(item).catch(fail);
          return;
        }
        const img = inspector.querySelector('.library-detail-preview img');
        if (img?.getAttribute('src')) {
          openPreviewOverlay({ src: img.getAttribute('src'), title: displayName(object) });
        }
        return;
      }
      if (action === 'open-asset') { openObject(selectedId).catch(fail); return; }
      if (action === 'edit-in-generate') {
        const object = objectById(selectedId);
        if (object && object.type !== 'media' && (object.type === 'character' || object.type === 'pose-actor')) setParam('char', object.id);
        openInGenerate(object?.type === 'media' ? 'review' : 'character').catch(fail);
        return;
      }
      if (action === 'toggle-provenance') {
        inspectorPanel = inspectorPanel === 'provenance' ? null : 'provenance';
        render();
        return;
      }

      const more = event.target.closest('[data-more]');
      if (more) {
        event.stopPropagation();
        openMenuId = openMenuId === more.dataset.more ? null : more.dataset.more;
        render();
        return;
      }

      const menuButton = event.target.closest('[data-menu-action]');
      if (menuButton) {
        event.stopPropagation();
        const id = menuButton.dataset.menuId;
        const menuAction = menuButton.dataset.menuAction;
        if (menuAction === 'open') { openMenuId = null; openObject(id).catch(fail); return; }
        if (menuAction === 'check') { runCheck(id, menuButton).catch(fail); return; }
        if (menuAction === 'provenance') { selectedId = id; inspectorPanel = 'provenance'; openMenuId = null; render(); return; }
        if (menuAction === 'generate') { openMenuId = null; openInGenerate('review').catch(fail); return; }
        if (menuAction === 'copy') {
          openMenuId = null;
          navigator.clipboard?.writeText(id).then(() => toast(`Copied ${id}`)).catch(() => toast(`Could not copy ${id}`));
          render();
          return;
        }
        return;
      }

      // The provenance panel the media controller renders into the inspector
      // still speaks [data-media-action] (stage links, the preview overlay). Its
      // "Close" is ours to answer: the panel's visibility is inspector state here,
      // not the controller's per-card openPanels map.
      const mediaButton = event.target.closest('[data-media-action]');
      if (mediaButton) {
        event.stopPropagation();
        if (mediaButton.dataset.mediaAction === 'close-panel') { inspectorPanel = null; render(); return; }
        mediaController.handleAction(mediaButton.dataset.mediaAction, mediaButton.dataset.mediaId, mediaButton);
        return;
      }

      const card = event.target.closest('[data-card]');
      if (card) select(card.dataset.card);
    };
    host.addEventListener('click', onHostClick);

    onHostKey = (event) => {
      const card = event.target.closest('[data-card]');
      if (!card) return;
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(card.dataset.card); }
      if (event.key === 'Escape' && openMenuId) { openMenuId = null; render(); }
    };
    host.addEventListener('keydown', onHostKey);

    // A click anywhere else dismisses an open overflow menu.
    onDocClick = (event) => {
      if (!openMenuId) return;
      if (host.contains(event.target) && event.target.closest('[data-more], [data-menu]')) return;
      openMenuId = null;
      render();
    };
    document.addEventListener('click', onDocClick);

    // Double-click is the shortcut for "Open asset" — a single click selects.
    onHostDblClick = (event) => {
      const card = event.target.closest('[data-card]');
      if (card) openObject(card.dataset.card).catch(fail);
    };
    host.addEventListener('dblclick', onHostDblClick);
  }

  function setView(view) {
    facets.view = view;
    const types = CATEGORIES.find((category) => category.id === view)?.types;
    facets.type = types && types.length === 1 ? types[0] : 'all';
    facetEl('type').value = facets.type;
    render();
  }

  function setDensity(next) {
    density = next === 'list' ? 'list' : 'grid';
    try { localStorage.setItem(DENSITY_KEY, density); } catch { /* private mode: session-only */ }
    render();
  }

  function clearFacet(name) {
    if (name === 'q') { facets.q = ''; facetEl('q').value = ''; }
    else if (name === 'view') { setView('all'); return; }
    else {
      facets[name] = 'all';
      const control = facetEl(name);
      if (control) control.value = 'all';
      if (name === 'type') facets.view = 'all';
    }
    render();
  }

  function wireFacets() {
    facetEl('type').onchange = (event) => {
      facets.type = event.target.value;
      facets.view = facets.type === 'all' ? (facets.view === 'all' ? 'all' : facets.view) : categoryFor(facets.type);
      render();
    };
    facetEl('project').onchange = (event) => { facets.project = event.target.value; render(); };
    facetEl('status').onchange = (event) => { facets.status = event.target.value; render(); };
    facetEl('sort').onchange = (event) => { facets.sort = event.target.value; render(); };
    let searchTimer = null;
    facetEl('q').oninput = (event) => {
      clearTimeout(searchTimer);
      const value = event.target.value;
      searchTimer = setTimeout(() => { facets.q = value; render(); }, 120);
    };
  }

  // ---- boot ---------------------------------------------------------------
  try {
    await loadServerFlags();
    await loadUsageIndex();
    await loadCompleteness();
    await buildObjects();
    await mediaController.load();
    if (destroyed) return () => {};
    facetEl('project').innerHTML += projectOptionsHtml();
    facetEl('sort').value = facets.sort;
    wireFacets();
    wireEvents();
    render();
    ensureMeta(combinedList()).catch((error) => console.warn('Library: preview pass failed', error));
  } catch (error) {
    console.error(error);
    grid.innerHTML = `<div class="empty-state"><div><h1>Library unavailable</h1><p>${escapeHtml(error.message)}</p></div></div>`;
    toast(`Could not load the Library: ${error.message}`, { error: true, duration: 7000 });
  }

  // Debug surface for browser automation. Read-only since Phase 6: generate /
  // regenerate / assign / accept / reject live on the Generate workspace's own
  // debug object. Phase 6.2 extends it additively (status, capabilities,
  // selection, density) — nothing that existed changed shape.
  window.QLOBE_STUDIO_DEBUG = {
    workspace: 'library',
    listObjects: () => objects.slice(),
    filter: (activeFacets) => filter({ ...facets, ...activeFacets }),
    openObject: (id) => openObject(id),
    getCardData: (id) => objects.find((object) => object.id === id) ||
      (mediaController.get(id) ? mediaToObject(mediaController.get(id)) : null),
    getFacets: () => ({ ...facets }),
    // -- media — read only --
    listMedia: () => mediaController.list(),
    getRecipe: (id) => mediaController.getRecipe(id),
    // -- Phase 6.2 additions --
    getStatus: (id) => { const object = objectById(id); return object ? statusFor(object) : null; },
    getCapabilities: (id) => { const object = objectById(id); return object ? capsFor(object).slice() : null; },
    getThumbs: (id) => { const object = objectById(id); return object ? thumbsFor(object).slice() : null; },
    getDensity: () => density,
    setDensity: (value) => { setDensity(value); return density; },
    select: (id) => { select(id); return selectedId; },
    getSelection: () => selectedId,
    getVisible: () => filter().map((object) => object.id),
  };

  return () => {
    destroyed = true;
    // The preview overlay a provenance stage link opens lives on document.body,
    // outside `host` — dropping the workspace must take it down with it.
    closeOverlay();
    if (onHostClick) { host.removeEventListener('click', onHostClick); onHostClick = null; }
    if (onHostKey) { host.removeEventListener('keydown', onHostKey); onHostKey = null; }
    if (onHostDblClick) { host.removeEventListener('dblclick', onHostDblClick); onHostDblClick = null; }
    if (onDocClick) { document.removeEventListener('click', onDocClick); onDocClick = null; }
    mediaController.dispose();
    if (window.QLOBE_STUDIO_DEBUG?.workspace === 'library') delete window.QLOBE_STUDIO_DEBUG;
  };
}
