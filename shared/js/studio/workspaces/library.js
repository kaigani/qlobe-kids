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

// WP-5c: media objects. GET /api/studio/media returns raw generation outputs (images
// and voice takes) not yet assigned into a shared/game asset folder. This maps one
// summary into the same {id,type,...} shape the character/pack/game cards already use
// so it can flow through the same filter()/getCardData() machinery, tagged type:"media".
function mediaToObject(item) {
  return {
    id: item.id, type: 'media', kind: item.kind, asset: item.asset, created: item.created,
    derivedFrom: item.derivedFrom || null, refs: item.refs || {}, role: item.role || null,
    qa: item.qa || {}, hasMagenta: !!item.hasMagenta, hasTranscript: !!item.hasTranscript,
    recipe: item.recipe || null, project: null, tier: null, usageCount: 0, completeness: null,
  };
}

// "+ Generate" allow-list — mirrors the server's own validation in POST /api/studio/generate.
const WORKFLOW_OPTIONS = ['krea2-turbo-t2i', 'flux2-t2i', 'flux2-klein-edit', 'ideogram4-t2i', 'z-image-base-t2i', 'qwen-image-edit'];
const EDIT_WORKFLOWS = new Set(['flux2-klein-edit', 'qwen-image-edit']);

// Friendly kind picker labels -> server kind + sane defaults.
const GENERATE_KINDS = {
  'ui-icon': { label: 'UI icon', kind: 'generate-image', workflow: 'krea2-turbo-t2i', width: 1024, height: 1024 },
  'object-card': { label: 'Object card', kind: 'generate-image', workflow: 'qwen-image-edit', width: 1024, height: 1024 },
  'prop-cutout': { label: 'Prop cutout', kind: 'cutout-chain', workflow: 'krea2-turbo-t2i', target: 'prop' },
  'scene-backdrop': { label: 'Scene backdrop', kind: 'generate-image', workflow: 'krea2-turbo-t2i', width: 1344, height: 768 },
  'voice-line': { label: 'Voice line', kind: 'generate-voice' },
};

export async function mount(host, { params, toast, openWorkspace }) {
  let destroyed = false;
  let objects = [];             // the full flat list of {id, type, project, tier, usageCount, ...}
  let usageIndex = null;        // shared/data/usage-index.json, forward+reverse
  let completeness = null;      // Map<charId, {status, ...}> from /api/studio/completeness?type=character, or null
  let serverAvailable = false;
  const validationCache = new Map(); // id -> {status:'valid'|'warnings'|'incomplete'|'error', warnings?:[], errors?:[]}

  // ---- media (WP-5c) ----
  let media = [];                     // GET /api/studio/media summaries — raw, unassigned generation outputs
  const busyMedia = new Set();        // media ids with a regenerate/accept/reject request in flight
  const openMediaPanel = new Map();   // media id -> 'provenance' | 'assign' (inline expanding panel under the card)
  const activeJobs = new Map();       // jobId -> { label, mediaId } — tracked until settled
  let jobsPollTimer = null;
  let generateState = { open: false, kindKey: 'ui-icon', fields: {}, jobId: null, submitting: false, progress: null };

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
          <option value="media">Media (unassigned)</option>
        </select></label>
        <label>Tier<select data-facet="tier">
          <option value="all">All tiers</option>
          <option value="rigged">Rigged</option>
          <option value="anim-only">Anim-only</option>
          <option value="pose-actor">Pose actor</option>
        </select></label>
        <label>Project<select data-facet="project"><option value="all">All projects</option></select></label>
        <label class="library-search">Search<input type="search" data-facet="q" placeholder="search by id…" autocomplete="off"></label>
        <button type="button" class="ghost" data-action="open-generate">+ Generate</button>
        <span class="status-pill" data-count>0 objects</span>
      </div>
      <div class="workspace-canvas library-canvas" data-grid></div>
      <aside class="workspace-inspector">
        <div class="panel-section">
          <h2>Library</h2>
          <p class="hint">Browse every shared character and packaged object across all projects, plus every generated media object awaiting assignment. Filter by type, tier or project, or search by id. Click a card to open it in the right workspace.</p>
          <p class="hint" data-server-hint></p>
        </div>
      </aside>
      <div class="library-generate-modal" data-generate-modal hidden></div>
    </div>`;

  const grid = host.querySelector('[data-grid]');
  const countPill = host.querySelector('[data-count]');
  const serverHint = host.querySelector('[data-server-hint]');
  const generateModal = host.querySelector('[data-generate-modal]');
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
  // Media objects (type:"media") are merged in here — combinedList() appends them,
  // mapped through mediaToObject(), so the Type facet's "media" option and the
  // existing tier/project/search filters all apply uniformly.
  function combinedList() {
    return media.length ? objects.concat(media.map(mediaToObject)) : objects;
  }

  function filter(activeFacets = facets) {
    const q = (activeFacets.q || '').trim().toLowerCase();
    return combinedList().filter((object) => {
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
    if (object.type === 'media') return mediaCardHtml(object);
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
    if (!object) {
      // Media objects have no contextual workspace yet — clicking one (or driving it
      // through the debug hook) opens its Provenance panel instead of navigating away.
      if (media.find((item) => item.id === id)) { openMediaPanel.set(id, 'provenance'); render(); }
      return;
    }
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

  // ============================================================================
  // Media objects (WP-5c) — GET/POST /api/studio/media*, POST /api/studio/generate.
  // Raw generation outputs (image or voice) awaiting review: assign into a shared or
  // game asset folder, regenerate, or accept/reject. Every media card always shows an
  // UNASSIGNED badge (there is no "assigned" state for a media record — assigning just
  // copies the asset out; the record stays here for provenance).
  // ============================================================================

  async function loadMedia() {
    if (!serverAvailable) { media = []; return; }
    try {
      const response = await fetch('/api/studio/media', { cache: 'no-store' });
      if (!response.ok) throw new Error('no media endpoint');
      const body = await response.json();
      media = Array.isArray(body?.media) ? body.media : [];
    } catch {
      media = []; // static preview / no endpoint — no media, no thrown error
    }
  }

  async function refreshMedia() {
    await loadMedia();
    if (!destroyed) render();
  }

  function qaPillFor(status) {
    const value = String(status || '').toLowerCase();
    if (value === 'accepted') return { text: 'accepted', className: 'good' };
    if (value === 'failed-qa') return { text: 'failed qa', className: 'bad' };
    if (value === 'review') return { text: 'review', className: '' };
    return { text: value || '—', className: '' };
  }

  function mediaAssetUrl(item) {
    return item.asset ? `/shared/media/${encodeURIComponent(item.id)}/${encodeURIComponent(item.asset)}` : '';
  }

  // ---- Provenance panel: recipe steps, derivedFrom lineage, qa block, consumers ----
  function provenancePanelHtml(item) {
    const recipe = item.recipe || {};
    const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
    const stepsHtml = steps.length ? steps.map((step, index) => `
      <div class="library-provenance-step">
        <strong>${index + 1}. ${escapeHtml(step.op || step.workflow || step.kind || 'step')}</strong>
        ${step.prompt ? `<p class="hint">prompt: ${escapeHtml(step.prompt)}</p>` : ''}
        <p class="hint">seed: ${step.seed ?? '—'}${step.width && step.height ? ` · ${step.width}×${step.height}` : ''}</p>
      </div>`).join('') : '<p class="hint">No recipe steps recorded.</p>';

    const chain = [];
    let cursor = item.derivedFrom;
    const seen = new Set([item.id]);
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const parent = media.find((entry) => entry.id === cursor);
      chain.push(parent ? `${parent.id} (${parent.kind})` : `${cursor} (not loaded)`);
      cursor = parent?.derivedFrom || null;
    }
    const chainHtml = chain.length
      ? `<p class="hint">derived from: ${chain.map(escapeHtml).join(' ← ')}</p>`
      : '<p class="hint">no lineage — generated fresh.</p>';

    const qa = item.qa || {};
    const qaBits = [`status: ${qa.status || '—'}`];
    if (Array.isArray(qa.flags) && qa.flags.length) qaBits.push(`flags: ${qa.flags.join(', ')}`);
    if (qa.partialPct != null) qaBits.push(`alpha ${qa.partialPct}%`);
    if (qa.transcriptMatch != null) qaBits.push(`transcript ${qa.transcriptMatch ? '✓' : '✗'}`);
    if (qa.transcriptRatio != null) qaBits.push(`ratio ${qa.transcriptRatio}`);
    const qaHtml = `<p class="hint">qa — ${escapeHtml(qaBits.join(' · '))}</p>`;

    const consumers = usageIndex?.reverse?.media?.[item.id];
    const consumersHtml = consumers?.length
      ? `<p class="hint">consumers: ${consumers.map(escapeHtml).join(', ')}</p>`
      : '<p class="hint">unassigned — no consumers yet.</p>';

    const magentaHtml = item.hasMagenta
      ? `<p class="hint">magenta QA</p><img class="library-media-qa-thumb" loading="lazy" src="${escapeHtml(`/shared/media/${item.id}/qa-magenta.png`)}" alt="magenta QA pass for ${escapeHtml(item.id)}">`
      : '';

    return `
      <div class="library-media-panel" data-panel="provenance">
        <h4>Provenance</h4>
        ${stepsHtml}
        ${chainHtml}
        ${qaHtml}
        ${magentaHtml}
        ${consumersHtml}
        <button type="button" class="ghost" data-media-action="close-panel" data-media-id="${escapeHtml(item.id)}">Close</button>
      </div>`;
  }

  function assignPanelHtml(item) {
    return `
      <div class="library-media-panel" data-panel="assign">
        <h4>Assign to…</h4>
        <label>Destination path<input type="text" data-assign-dest autocomplete="off"
          placeholder="shared/assets/ui/, games/&lt;id&gt;/assets/&lt;subdir&gt;/, shared/characters/&lt;id&gt;/&lt;subdir&gt;/"></label>
        <p class="hint">Copies the asset into that folder and updates its recipe + ASSETS.md. Collisions fail — no overwrite.</p>
        <div class="row">
          <button type="button" data-media-action="assign-confirm" data-media-id="${escapeHtml(item.id)}">Confirm</button>
          <button type="button" class="ghost" data-media-action="close-panel" data-media-id="${escapeHtml(item.id)}">Cancel</button>
        </div>
      </div>`;
  }

  function mediaPanelHtml(item) {
    const mode = openMediaPanel.get(item.id);
    if (mode === 'provenance') return provenancePanelHtml(item);
    if (mode === 'assign') return assignPanelHtml(item);
    return '';
  }

  function mediaCardHtml(item) {
    const qa = item.qa || {};
    const pill = qaPillFor(qa.status);
    const busy = busyMedia.has(item.id);
    const isImage = item.kind === 'image';
    const src = mediaAssetUrl(item);
    const preview = isImage
      ? (src ? `<img class="library-media-thumb" loading="lazy" src="${escapeHtml(src)}" alt="${escapeHtml(item.id)}">`
              : '<div class="library-media-thumb-empty">no image yet</div>')
      : (src ? `<audio class="library-media-audio" controls src="${escapeHtml(src)}"></audio>`
              : '<div class="library-media-thumb-empty">no audio yet</div>');
    let extraPill = '';
    if (isImage && qa.partialPct != null) {
      extraPill = `<span class="status-pill${Number(qa.partialPct) > 2 ? ' bad' : ' good'}">alpha ${qa.partialPct}%</span>`;
    } else if (!isImage && (qa.transcriptMatch != null || qa.transcriptRatio != null)) {
      const ok = !!qa.transcriptMatch;
      extraPill = `<span class="status-pill${ok ? ' good' : ' bad'}">transcript ${ok ? '✓' : '✗'}${qa.transcriptRatio != null ? ` (${qa.transcriptRatio})` : ''}</span>`;
    }
    const accepted = qa.status === 'accepted';
    const guard = !serverAvailable ? ' disabled title="needs the authoring server"' : '';
    const busyGuard = busy ? ' disabled' : '';
    return `
      <article class="library-card library-media-card" data-media-card="${escapeHtml(item.id)}" data-type="media">
        <div class="library-card-head">
          <span class="library-type">${escapeHtml(item.kind === 'voice' ? 'Voice' : 'Image')}</span>
          <span class="library-badge-unassigned">Unassigned</span>
        </div>
        <h3 class="library-card-title">${escapeHtml(item.id)}</h3>
        ${preview}
        <p class="hint">created ${escapeHtml(item.created || '—')}${item.derivedFrom ? ` · from ${escapeHtml(item.derivedFrom)}` : ''}</p>
        <div class="library-card-foot">
          <span class="status-pill${pill.className ? ` ${pill.className}` : ''}">${escapeHtml(pill.text)}</span>
          ${extraPill}
        </div>
        <div class="library-media-actions">
          <button type="button" class="ghost" data-media-action="provenance" data-media-id="${escapeHtml(item.id)}">Provenance</button>
          <button type="button" class="ghost" data-media-action="regenerate" data-media-id="${escapeHtml(item.id)}"${guard}${busyGuard}>${busy ? '…' : 'Regenerate'}</button>
          <button type="button" class="ghost" data-media-action="assign" data-media-id="${escapeHtml(item.id)}"${guard}>Assign to…</button>
          ${accepted ? '' : `<button type="button" data-media-action="accept" data-media-id="${escapeHtml(item.id)}"${guard}${busyGuard}>Accept</button>`}
          ${accepted ? '' : `<button type="button" class="warn" data-media-action="reject" data-media-id="${escapeHtml(item.id)}"${guard}${busyGuard}>Reject</button>`}
        </div>
        ${mediaPanelHtml(item)}
      </article>`;
  }

  // ---- job tracking ---------------------------------------------------------
  // Every regenerate / +Generate submit returns a jobId (202). Poll GET /api/studio/jobs
  // every ~2s — only while something is tracked — until each settles, then refresh the
  // media list so new/changed objects show up in the grid.
  function ensurePolling() {
    if (jobsPollTimer || !serverAvailable) return;
    jobsPollTimer = setInterval(pollJobsOnce, 2000);
  }

  function stopPollingIfIdle() {
    if (activeJobs.size === 0 && jobsPollTimer) { clearInterval(jobsPollTimer); jobsPollTimer = null; }
  }

  function trackJob(jobId, label, mediaId) {
    if (!jobId) return;
    activeJobs.set(jobId, { label, mediaId });
    ensurePolling();
  }

  async function pollJobsOnce() {
    if (destroyed || activeJobs.size === 0) { stopPollingIfIdle(); return; }
    try {
      const response = await fetch('/api/studio/jobs', { cache: 'no-store' });
      if (!response.ok) return;
      const body = await response.json();
      const jobs = Array.isArray(body?.jobs) ? body.jobs : [];
      let settled = false;
      for (const [jobId, info] of [...activeJobs]) {
        const job = jobs.find((j) => j.id === jobId);
        if (!job) continue;
        if (jobId === generateState.jobId) generateState.progress = { message: job.message, progress: job.progress, total: job.total };
        if (['completed', 'failed', 'cancelled', 'interrupted'].includes(job.status)) {
          activeJobs.delete(jobId);
          if (info.mediaId) busyMedia.delete(info.mediaId);
          if (jobId === generateState.jobId) generateState.jobId = null;
          settled = true;
          if (job.status === 'completed') toast(`${info.label} — done.`);
          else toast(`${info.label} — ${job.error || job.status}`, { error: true, duration: 7000 });
        }
      }
      if (settled) await refreshMedia();
      else if (!destroyed) render();
      if (generateState.open && !destroyed) renderGenerateModal();
    } catch { /* transient — try again on the next tick */ }
    stopPollingIfIdle();
  }

  // ---- media actions ----------------------------------------------------------
  async function regenerateMedia(id, seed) {
    if (!serverAvailable) { toast('Regenerate needs the authoring server.'); return null; }
    busyMedia.add(id); render();
    try {
      const payload = seed != null ? { seed } : {};
      const response = await fetch(`/api/studio/media/${encodeURIComponent(id)}/regenerate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Could not regenerate ${id}`);
      trackJob(body.jobId, `Regenerate ${id}`, id);
      toast(`Regenerating ${id}…`);
      return body;
    } catch (error) {
      busyMedia.delete(id);
      toast(error.message, { error: true, duration: 7000 });
      return null;
    } finally {
      if (!destroyed) render();
    }
  }

  async function assignMedia(id, dest) {
    if (!serverAvailable) { toast('Assign needs the authoring server.'); return null; }
    try {
      const response = await fetch(`/api/studio/media/${encodeURIComponent(id)}/assign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dest }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Could not assign ${id}`);
      openMediaPanel.delete(id);
      toast(`Assigned ${id} → ${body.dest || dest}`);
      await refreshMedia();
      return body;
    } catch (error) {
      toast(error.message, { error: true, duration: 7000 });
      return null;
    }
  }

  async function acceptMedia(id) {
    if (!serverAvailable) { toast('Accept needs the authoring server.'); return null; }
    busyMedia.add(id); render();
    try {
      const response = await fetch(`/api/studio/media/${encodeURIComponent(id)}/accept`, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Could not accept ${id}`);
      toast(`${id} accepted.`);
      return body;
    } catch (error) {
      toast(error.message, { error: true, duration: 7000 });
      return null;
    } finally {
      busyMedia.delete(id);
      await refreshMedia();
    }
  }

  async function rejectMedia(id) {
    if (!serverAvailable) { toast('Reject needs the authoring server.'); return null; }
    busyMedia.add(id); render();
    try {
      const response = await fetch(`/api/studio/media/${encodeURIComponent(id)}/reject`, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Could not reject ${id}`);
      openMediaPanel.delete(id);
      toast(`${id} rejected.`);
      return body;
    } catch (error) {
      toast(error.message, { error: true, duration: 7000 });
      return null;
    } finally {
      busyMedia.delete(id);
      await refreshMedia();
    }
  }

  function handleMediaAction(action, id, button) {
    if (!id) return;
    if (action === 'provenance' || action === 'assign') {
      const current = openMediaPanel.get(id);
      if (current === action) openMediaPanel.delete(id); else openMediaPanel.set(id, action);
      render();
      return;
    }
    if (action === 'close-panel') { openMediaPanel.delete(id); render(); return; }
    if (action === 'assign-confirm') {
      const card = button.closest('[data-media-card]');
      const input = card?.querySelector('[data-assign-dest]');
      const dest = (input?.value || '').trim();
      if (!dest) { toast('Enter a destination path.', { error: true }); return; }
      assignMedia(id, dest);
      return;
    }
    if (action === 'regenerate') { regenerateMedia(id); return; }
    if (action === 'accept') { acceptMedia(id); return; }
    if (action === 'reject') { rejectMedia(id); return; }
  }

  // ---- "+ Generate" form ------------------------------------------------------
  // POST /api/studio/generate {kind, params}. The kind picker maps a friendly label to
  // the server kind + defaults (GENERATE_KINDS above); the workflow allow-list and the
  // edit-workflow style-ref requirement mirror the server's own validation.
  function captureGenerateFields(form) {
    const data = {};
    for (const field of form.querySelectorAll('[data-gen-field]')) data[field.dataset.genField] = field.value;
    return data;
  }

  function fieldValue(name, fallback = '') {
    const value = generateState.fields?.[name];
    return value === undefined || value === '' ? fallback : value;
  }

  function generateFormHtml() {
    const preset = GENERATE_KINDS[generateState.kindKey] || GENERATE_KINDS['ui-icon'];
    const isVoice = preset.kind === 'generate-voice';
    const isCutout = preset.kind === 'cutout-chain';
    const workflow = fieldValue('workflow', preset.workflow || '');
    const showStyle = EDIT_WORKFLOWS.has(workflow);
    const defaultSeed = isVoice ? 7 : 42;
    const busy = generateState.submitting || !!generateState.jobId;
    return `
      <form data-generate-form>
        <label>Kind<select data-gen-field="kindKey">
          ${Object.entries(GENERATE_KINDS).map(([key, p]) => `<option value="${key}"${key === generateState.kindKey ? ' selected' : ''}>${escapeHtml(p.label)}</option>`).join('')}
        </select></label>
        <label>Id (kebab-case)<input type="text" data-gen-field="id" value="${escapeHtml(fieldValue('id'))}" placeholder="e.g. icon-star" required pattern="[a-z0-9]+(-[a-z0-9]+)*" autocomplete="off"></label>
        <label>${isVoice ? 'Text' : 'Prompt'}<textarea data-gen-field="prompt" required>${escapeHtml(fieldValue('prompt'))}</textarea></label>
        ${!isVoice ? `<label>Workflow<select data-gen-field="workflow">
          ${WORKFLOW_OPTIONS.map((w) => `<option value="${w}"${w === workflow ? ' selected' : ''}>${w}</option>`).join('')}
        </select></label>` : ''}
        ${!isVoice && !isCutout ? `<div class="field-grid">
          <label>Width<input type="number" data-gen-field="width" value="${escapeHtml(fieldValue('width', preset.width || 1024))}" min="64" step="8"></label>
          <label>Height<input type="number" data-gen-field="height" value="${escapeHtml(fieldValue('height', preset.height || 1024))}" min="64" step="8"></label>
        </div>` : ''}
        ${isCutout ? `<div class="field-grid">
          <label>Target<select data-gen-field="target">
            ${['prop', 'character', 'object'].map((t) => `<option value="${t}"${t === fieldValue('target', preset.target || 'prop') ? ' selected' : ''}>${t}</option>`).join('')}
          </select></label>
          <label>Max size<input type="number" data-gen-field="maxSize" value="${escapeHtml(fieldValue('maxSize'))}" placeholder="e.g. 512"></label>
        </div>
        <label>Pad<input type="number" data-gen-field="pad" value="${escapeHtml(fieldValue('pad'))}" placeholder="e.g. 24"></label>
        <label>Extract prompt (optional)<input type="text" data-gen-field="extractPrompt" value="${escapeHtml(fieldValue('extractPrompt'))}"></label>` : ''}
        <label>Seed<input type="number" data-gen-field="seed" value="${escapeHtml(fieldValue('seed', defaultSeed))}"></label>
        ${showStyle ? `<label>Style ref (required for edit workflows)<input type="text" data-gen-field="styleRef" value="${escapeHtml(fieldValue('styleRef'))}" placeholder="shared:objects/cat.png" required></label>` : ''}
        ${generateState.jobId ? `<p class="hint">Job ${escapeHtml(generateState.jobId)} — ${escapeHtml(generateState.progress?.message || 'queued')}${generateState.progress?.total ? ` (${generateState.progress.progress ?? 0}/${generateState.progress.total})` : ''}</p>` : ''}
        <div class="row">
          <button type="submit"${busy ? ' disabled' : ''}>${generateState.submitting ? 'Queuing…' : generateState.jobId ? 'Running…' : 'Generate'}</button>
          <button type="button" class="ghost" data-action="close-generate">${generateState.jobId ? 'Close' : 'Cancel'}</button>
        </div>
      </form>`;
  }

  function renderGenerateModal() {
    if (!generateModal) return;
    generateModal.hidden = !generateState.open;
    if (!generateState.open) { generateModal.innerHTML = ''; return; }
    generateModal.innerHTML = `
      <div class="library-generate-panel" role="dialog" aria-modal="true" aria-label="Generate media">
        <div class="library-generate-head">
          <h3>Generate media</h3>
          <button type="button" class="ghost" data-action="close-generate" aria-label="Close">×</button>
        </div>
        ${generateFormHtml()}
      </div>`;
  }

  async function postGenerate(kind, generateParams) {
    const response = await fetch('/api/studio/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, params: generateParams }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Could not queue generation');
    return body;
  }

  async function submitGenerate(form) {
    if (!serverAvailable) { toast('Generate needs the authoring server.'); return; }
    const raw = captureGenerateFields(form);
    const preset = GENERATE_KINDS[generateState.kindKey] || GENERATE_KINDS['ui-icon'];
    const id = (raw.id || '').trim();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) { toast('Id must be kebab-case (lowercase letters, digits, hyphens).', { error: true }); return; }
    const workflow = raw.workflow || preset.workflow;
    const styleRef = (raw.styleRef || '').trim();
    if (preset.kind !== 'generate-voice' && EDIT_WORKFLOWS.has(workflow) && !styleRef) {
      toast('This workflow needs a style ref, e.g. shared:objects/cat.png.', { error: true }); return;
    }
    let genParams;
    if (preset.kind === 'generate-voice') {
      genParams = { id, text: raw.prompt || '', seed: raw.seed ? Number(raw.seed) : 7 };
    } else if (preset.kind === 'cutout-chain') {
      genParams = { id, workflow, prompt: raw.prompt || '', seed: raw.seed ? Number(raw.seed) : 42, target: raw.target || preset.target || 'prop' };
      if (raw.maxSize) genParams.maxSize = Number(raw.maxSize);
      if (raw.pad) genParams.pad = Number(raw.pad);
      if (raw.extractPrompt) genParams.extractPrompt = raw.extractPrompt;
      if (styleRef) genParams.refs = { style: styleRef };
    } else {
      genParams = { id, workflow, prompt: raw.prompt || '', seed: raw.seed ? Number(raw.seed) : 42 };
      if (raw.width) genParams.width = Number(raw.width);
      if (raw.height) genParams.height = Number(raw.height);
      if (styleRef) genParams.refs = { style: styleRef };
    }
    generateState.submitting = true; renderGenerateModal();
    try {
      const response = await postGenerate(preset.kind, genParams);
      generateState.jobId = response.jobId;
      generateState.progress = null;
      trackJob(response.jobId, `Generate ${id}`, response.mediaId || id);
      toast(`Queued ${id}.`);
    } catch (error) {
      toast(error.message, { error: true, duration: 7000 });
    } finally {
      generateState.submitting = false;
      if (!destroyed) renderGenerateModal();
    }
  }

  function openGenerateModal() {
    if (!serverAvailable) { toast('Generate needs the authoring server.'); return; }
    generateState = { open: true, kindKey: 'ui-icon', fields: {}, jobId: null, submitting: false, progress: null };
    renderGenerateModal();
  }

  // ---- media + generate event wiring — delegated on host, survives grid re-renders ----
  function wireMediaAndGenerate() {
    host.addEventListener('click', (event) => {
      if (event.target.closest('[data-action="open-generate"]')) { openGenerateModal(); return; }
      if (event.target.closest('[data-action="close-generate"]')) { generateState.open = false; renderGenerateModal(); return; }
      const mediaButton = event.target.closest('[data-media-action]');
      if (mediaButton) {
        event.stopPropagation();
        handleMediaAction(mediaButton.dataset.mediaAction, mediaButton.dataset.mediaId, mediaButton);
      }
    });
    host.addEventListener('change', (event) => {
      const field = event.target.closest('[data-gen-field]');
      if (!field) return;
      const form = field.closest('[data-generate-form]');
      if (!form) return;
      if (field.dataset.genField === 'kindKey') {
        const captured = captureGenerateFields(form);
        generateState.kindKey = field.value;
        generateState.fields = { id: captured.id, prompt: captured.prompt };
        renderGenerateModal();
      } else if (field.dataset.genField === 'workflow') {
        generateState.fields = captureGenerateFields(form);
        generateState.fields.workflow = field.value;
        renderGenerateModal();
      }
    });
    host.addEventListener('submit', (event) => {
      const form = event.target.closest('[data-generate-form]');
      if (!form) return;
      event.preventDefault();
      submitGenerate(form);
    });
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
    await loadMedia();
    if (destroyed) return () => {};
    facetEl('project').innerHTML += projectOptionsHtml();
    serverHint.textContent = serverAvailable
      ? 'Authoring server connected — use "check" on a card to validate it, or "+ Generate" to create new media.'
      : 'Static preview — usage counts come from the on-disk usage index; validation, media browsing and generation are unavailable.';
    const generateButton = host.querySelector('[data-action="open-generate"]');
    if (generateButton && !serverAvailable) { generateButton.disabled = true; generateButton.title = 'needs the authoring server'; }
    wireFacets();
    wireMediaAndGenerate();
    render();
  } catch (error) {
    console.error(error);
    grid.innerHTML = `<div class="empty-state"><div><h1>Library unavailable</h1><p>${escapeHtml(error.message)}</p></div></div>`;
    toast(`Could not load the Library: ${error.message}`, { error: true, duration: 7000 });
  }

  // Debug surface for browser automation (WP-2c gate, extended WP-5c for media/generate).
  window.QLOBE_STUDIO_DEBUG = {
    workspace: 'library',
    listObjects: () => objects.slice(),
    filter: (activeFacets) => filter({ ...facets, ...activeFacets }),
    openObject: (id) => openObject(id),
    getCardData: (id) => objects.find((object) => object.id === id) ||
      (media.find((item) => item.id === id) ? mediaToObject(media.find((item) => item.id === id)) : null),
    getFacets: () => ({ ...facets }),
    // -- media (WP-5c) --
    listMedia: () => media.slice(),
    // generate({kind, params}) -> POST /api/studio/generate {kind, params}, tracked the
    // same way the "+ Generate" form tracks its own submit. Returns {ok, jobId, mediaId}.
    generate: async (payload) => {
      const response = await postGenerate(payload?.kind, payload?.params || {});
      trackJob(response.jobId, `Generate ${payload?.params?.id || ''}`, response.mediaId);
      return response;
    },
    getRecipe: async (id) => {
      const found = media.find((item) => item.id === id);
      if (found?.recipe) return found.recipe;
      try {
        const response = await fetch(`/api/studio/media/${encodeURIComponent(id)}`, { cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || `Could not load ${id}`);
        return body.media?.recipe || null;
      } catch {
        return null;
      }
    },
    regenerate: (id, seed) => regenerateMedia(id, seed),
    assign: (id, dest) => assignMedia(id, dest),
  };

  return () => {
    destroyed = true;
    if (jobsPollTimer) { clearInterval(jobsPollTimer); jobsPollTimer = null; }
    if (window.QLOBE_STUDIO_DEBUG?.workspace === 'library') delete window.QLOBE_STUDIO_DEBUG;
  };
}
