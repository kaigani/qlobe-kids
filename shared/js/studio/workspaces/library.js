// library.js — native Library workspace (WP-2c). A facet-browsable index over
// every object the Studio knows about: shared characters plus the fv2 objects[]
// registry (pose-actor / prop-pack / scene-pack / story-pack / music-sync / game).
//
// mount(host, ctx) -> cleanup, matching the shell contract in studio.js and the
// pattern established by workspaces/rig.js. Degrades to a static preview (no
// authoring server) by reading shared/data/usage-index.json directly and
// showing "—" validation/completeness pills instead of calling Phase 2 APIs.

import { serverStatus } from '../api.js';
import { loadStudioObjects } from '../projects.js';
import { RIGGED_CHARACTERS } from './rig-data.js';

const USAGE_INDEX_URL = new URL('../../../data/usage-index.json', import.meta.url);

const TYPE_LABEL = {
  character: 'Character', 'pose-actor': 'Pose Actor', 'prop-pack': 'Prop Pack',
  'scene-pack': 'Scene Pack', 'story-pack': 'Story Pack', 'music-sync': 'Music Sync', game: 'Game',
};

// Where a card sends you when clicked. Games default to Stage — a reasonable
// landing spot even though a game isn't itself a Stage document.
// Pose actors live under a project's "assemble" (pose-library) workspace, not
// Rig — Rig only edits the 8 shared bone-rigged puppets (rig-data.js RIGGED_CHARACTERS).
const TARGET_WORKSPACE = {
  character: 'rig', 'pose-actor': 'assemble', 'prop-pack': 'props',
  'scene-pack': 'stage', 'story-pack': 'stage', 'music-sync': 'music', game: 'stage',
};

const escapeHtml = (value) => {
  const node = document.createElement('span'); node.textContent = String(value ?? ''); return node.innerHTML;
};

export async function mount(host, { params, toast, openWorkspace }) {
  let destroyed = false;
  let objects = [];             // the full flat list of {id, type, project, tier, usageCount, ...}
  let usageIndex = null;        // shared/data/usage-index.json, forward+reverse
  let completeness = null;      // Map<charId, {status, ...}> from /api/studio/completeness?type=character, or null
  let serverAvailable = false;
  const validationCache = new Map(); // id -> {status:'valid'|'warnings'|'incomplete'|'error', warnings?:[], errors?:[]}

  const facets = { type: 'all', tier: 'all', project: 'all', q: '' };

  host.innerHTML = `
    <div class="workspace library-workspace" data-workspace="library">
      <div class="workspace-tools">
        <label>Type<select data-facet="type">
          <option value="all">All types</option>
          <option value="character">Character</option>
          <option value="pose-actor">Pose Actor</option>
          <option value="prop-pack">Prop Pack</option>
          <option value="scene-pack">Scene Pack</option>
          <option value="story-pack">Story Pack</option>
          <option value="music-sync">Music Sync</option>
          <option value="game">Game</option>
        </select></label>
        <label>Tier<select data-facet="tier">
          <option value="all">All tiers</option>
          <option value="rigged">Rigged</option>
          <option value="anim-only">Anim-only</option>
          <option value="pose-actor">Pose actor</option>
        </select></label>
        <label>Project<select data-facet="project"><option value="all">All projects</option></select></label>
        <label class="library-search">Search<input type="search" data-facet="q" placeholder="search by id…" autocomplete="off"></label>
        <span class="status-pill" data-count>0 objects</span>
      </div>
      <div class="workspace-canvas library-canvas" data-grid></div>
      <aside class="workspace-inspector">
        <div class="panel-section">
          <h2>Library</h2>
          <p class="hint">Browse every shared character and packaged object across all projects. Filter by type, tier or project, or search by id. Click a card to open it in the right workspace.</p>
          <p class="hint" data-server-hint></p>
        </div>
      </aside>
    </div>`;

  const grid = host.querySelector('[data-grid]');
  const countPill = host.querySelector('[data-count]');
  const serverHint = host.querySelector('[data-server-hint]');
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
      completeness = null; // static preview — completeness pill falls back to "—"
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

  // 'valid' | 'incomplete' | null (null = no completeness data, static preview pill "—").
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
    objects = list.map((object) => ({
      ...object,
      tier: tierFor(object.type, object.id),
      usageCount: usageCountFor(object.type, object.id),
      completeness: completenessFor(object.type, object.id),
    }));
  }

  function projectOptionsHtml() {
    const ids = [...new Set(objects.map((object) => object.project).filter(Boolean))].sort();
    return ids.map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join('');
  }

  // ---- facet filtering -----------------------------------------------------
  function filter(activeFacets = facets) {
    const q = (activeFacets.q || '').trim().toLowerCase();
    return objects.filter((object) => {
      if (activeFacets.type !== 'all' && object.type !== activeFacets.type) return false;
      if (activeFacets.tier !== 'all' && object.tier !== activeFacets.tier) return false;
      if (activeFacets.project !== 'all' && object.project !== activeFacets.project) return false;
      if (q && !object.id.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  // ---- validation (on-demand, lazy) ----------------------------------------
  // POST /api/studio/validate {target} -> { ok, report: { counts:{error,warn,info}, findings:[{severity,format,id,message}] } }.
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

  function pillLabel(object) {
    const cached = validationCache.get(object.id);
    if (cached) {
      if (cached.status === 'valid') return { text: 'valid', className: 'good' };
      if (cached.status === 'warnings') return { text: `${cached.warnCount} warnings`, className: '' };
      if (cached.status === 'incomplete') return { text: 'incomplete', className: 'bad' };
      return { text: '—', className: '' };
    }
    if (object.completeness === 'valid') return { text: 'valid', className: 'good' };
    if (object.completeness === 'incomplete') return { text: 'incomplete', className: 'bad' };
    if (typeof object.completeness === 'string') return { text: object.completeness, className: '' };
    return { text: '—', className: '' };
  }

  // ---- rendering -------------------------------------------------------
  function cardHtml(object) {
    const pill = pillLabel(object);
    const tierBadge = object.tier ? `<span class="library-tier">${escapeHtml(object.tier)}</span>` : '';
    return `
      <article class="library-card" data-card="${escapeHtml(object.id)}" data-type="${escapeHtml(object.type)}" tabindex="0" role="button"
        aria-label="Open ${escapeHtml(object.id)} (${escapeHtml(TYPE_LABEL[object.type] || object.type)})">
        <div class="library-card-head">
          <span class="library-type">${escapeHtml(TYPE_LABEL[object.type] || object.type)}</span>
          ${tierBadge}
        </div>
        <h3 class="library-card-title">${escapeHtml(object.id)}</h3>
        <p class="hint">${object.project ? `project: ${escapeHtml(object.project)}` : 'shared'}</p>
        <div class="library-card-foot">
          <span class="status-pill" data-usage>used by ${object.usageCount}</span>
          <button type="button" class="ghost library-check" data-check="${escapeHtml(object.id)}">check</button>
          <span class="status-pill${pill.className ? ` ${pill.className}` : ''}" data-pill>${escapeHtml(pill.text)}</span>
        </div>
      </article>`;
  }

  function render() {
    const filtered = filter();
    countPill.textContent = `${filtered.length} object${filtered.length === 1 ? '' : 's'}`;
    if (!filtered.length) {
      grid.innerHTML = `<div class="empty-state"><div><h1>No matches</h1><p class="hint">Try clearing a facet or the search box.</p></div></div>`;
      return;
    }
    grid.innerHTML = `<div class="library-grid">${filtered.map(cardHtml).join('')}</div>`;
    for (const card of grid.querySelectorAll('[data-card]')) {
      card.addEventListener('click', (event) => {
        if (event.target.closest('[data-check]')) return; // the check button handles its own click
        openObject(card.dataset.card).catch(fail);
      });
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openObject(card.dataset.card).catch(fail); }
      });
    }
    for (const button of grid.querySelectorAll('[data-check]')) {
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        const id = button.dataset.check;
        button.disabled = true; button.textContent = '…';
        const result = await fetchValidation(id);
        if (destroyed) return;
        const card = grid.querySelector(`[data-card="${cssEscape(id)}"]`);
        if (card) {
          const pillNode = card.querySelector('[data-pill]');
          const object = objects.find((o) => o.id === id);
          const pill = pillLabel(object || { id, completeness: null });
          pillNode.textContent = pill.text;
          pillNode.className = `status-pill${pill.className ? ` ${pill.className}` : ''}`;
        }
        button.disabled = false; button.textContent = 'check';
        if (result.status === 'unknown') toast(`No validate endpoint available for ${id} (static preview).`);
      });
    }
  }

  function cssEscape(value) {
    return window.CSS?.escape ? window.CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  const fail = (error) => { console.error(error); toast(error.message, { error: true, duration: 7000 }); };

  // ---- open an object in its contextual workspace ---------------------
  async function openObject(id) {
    const object = objects.find((item) => item.id === id);
    if (!object) return;
    const workspace = TARGET_WORKSPACE[object.type] || 'stage';
    if (object.type === 'character' || object.type === 'pose-actor') {
      params.set('char', id);
      const next = new URL(location.href); next.searchParams.set('char', id); history.replaceState(null, '', next);
    }
    if (object.project) {
      params.set('project', object.project);
      const next = new URL(location.href); next.searchParams.set('project', object.project); history.replaceState(null, '', next);
    }
    await openWorkspace(workspace);
  }

  // ---- facet wiring ------------------------------------------------------
  function wireFacets() {
    facetEl('type').onchange = (e) => { facets.type = e.target.value; render(); };
    facetEl('tier').onchange = (e) => { facets.tier = e.target.value; render(); };
    facetEl('project').onchange = (e) => { facets.project = e.target.value; render(); };
    let searchTimer = null;
    facetEl('q').oninput = (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { facets.q = e.target.value; render(); }, 120);
    };
  }

  // ---- boot ---------------------------------------------------------------
  try {
    await loadServerFlags();
    await loadUsageIndex();
    await loadCompleteness();
    await buildObjects();
    if (destroyed) return () => {};
    facetEl('project').innerHTML += projectOptionsHtml();
    serverHint.textContent = serverAvailable
      ? 'Authoring server connected — use "check" on a card to validate it.'
      : 'Static preview — usage counts come from the on-disk usage index; validation is unavailable.';
    wireFacets();
    render();
  } catch (error) {
    console.error(error);
    grid.innerHTML = `<div class="empty-state"><div><h1>Library unavailable</h1><p>${escapeHtml(error.message)}</p></div></div>`;
    toast(`Could not load the Library: ${error.message}`, { error: true, duration: 7000 });
  }

  // Debug surface for browser automation (WP-2c gate).
  window.QLOBE_STUDIO_DEBUG = {
    workspace: 'library',
    listObjects: () => objects.slice(),
    filter: (activeFacets) => filter({ ...facets, ...activeFacets }),
    openObject: (id) => openObject(id),
    getCardData: (id) => objects.find((object) => object.id === id) || null,
    getFacets: () => ({ ...facets }),
  };

  return () => {
    destroyed = true;
    if (window.QLOBE_STUDIO_DEBUG?.workspace === 'library') delete window.QLOBE_STUDIO_DEBUG;
  };
}
