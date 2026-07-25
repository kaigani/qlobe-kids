// generate-core.js — the shared machinery of the GENERATE domain (Phase 6, D3).
//
// Everything the studio needs to talk about generated media in one place:
//   • loadTemplates()        — the committed template registry (API, else static file)
//   • postGenerate()         — POST /api/studio/generate (template body or legacy raw body)
//   • createJobTracker()     — the 2s "poll until settled" loop
//   • createMediaController()— media cards, provenance, assign/accept/reject/regenerate
//   • templateFormHtml() + readTemplateForm() — the ONE template form renderer/reader
//   • openPreviewOverlay() / openGalleryOverlay() — ONE full-screen overlay, two
//     content modes: an asset at full size (with the cutout chain's Raw/Cutout/
//     QA/Final stages as tabs) and the refSlot reference chooser.
//
// Extracted from workspaces/library.js (WP-5c) with behaviour unchanged, so two
// consumers can share it:
//   • workspaces/library.js  — read-only media cards ({ readOnly: true }), no mutations.
//   • workspaces/generate.js — the full Review queue plus every template form.
//
// CACHE NOTE: the shell imports workspaces/*.js with ?v=WORKSPACE_VERSION, but a
// module's own imports carry no query — so this file sits OUTSIDE the cache-buster,
// exactly like workspaces/rig-data.js. Chrome's heuristic disk cache can serve a
// stale copy for hours after an edit; hard-reload (shift-reload) after touching it.

// shared/js/studio/workspaces/lib/ -> shared/data/
const TEMPLATES_URL = new URL('../../../../data/generate-templates.json', import.meta.url);

const SETTLED_STATUSES = ['completed', 'failed', 'cancelled', 'interrupted'];

// The studio's usual textContent trick, plus the two quote characters it leaves
// alone: registry prompts and examples land in value="…"/title="…" attributes, and
// a stray double quote there escapes the attribute.
export const escapeHtml = (value) => {
  const node = document.createElement('span'); node.textContent = String(value ?? '');
  return node.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

// ============================================================================
// Overlay — ONE full-screen singleton, two content modes (E1/E2/F1)
// ============================================================================
//
// Chrome is shared: dimmed backdrop, a panel, a title, an ✕. Esc, the ✕ and a
// backdrop click all close; the body scrolls nowhere while it is up; the node
// leaves the DOM entirely on close (no hidden singleton accumulating listeners).
// Two modes ride on it:
//   openPreviewOverlay()  — a media asset at full size, optionally with the
//                           cutout chain's intermediate stages as tabs.
//   openGalleryOverlay()  — the reference chooser a refSlot's "Choose…" opens.

let activeOverlay = null;   // { node, dispose } — at most one, ever.

// Closes whatever is open. Safe to call when nothing is.
export function closeOverlay() { activeOverlay?.dispose(); }

// Low-level chrome. Returns { node, body, close, setBody } so a mode can repaint
// its own body (the gallery does, once its fetches land) without reopening.
function openOverlay({ title = '', subtitle = '', bodyHtml = '', className = '', onClose } = {}) {
  closeOverlay();
  const node = document.createElement('div');
  node.className = `studio-overlay${className ? ` ${className}` : ''}`;
  node.innerHTML = `
    <div class="studio-overlay-backdrop" data-overlay-close></div>
    <div class="studio-overlay-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || 'Preview')}">
      <div class="studio-overlay-head">
        <div class="studio-overlay-titles">
          <h2>${escapeHtml(title)}</h2>
          ${subtitle ? `<p class="hint">${escapeHtml(subtitle)}</p>` : ''}
        </div>
        <button type="button" class="ghost studio-overlay-close" data-overlay-close aria-label="Close">✕</button>
      </div>
      <div class="studio-overlay-body" data-overlay-body>${bodyHtml}</div>
    </div>`;

  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const onClick = (event) => { if (event.target.closest('[data-overlay-close]')) dispose(); };
  // Capture, so a workspace that stops propagation on keydown cannot trap Esc.
  const onKeyDown = (event) => { if (event.key === 'Escape') { event.stopPropagation(); dispose(); } };

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    node.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKeyDown, true);
    node.remove();
    document.body.style.overflow = previousOverflow;
    if (activeOverlay?.node === node) activeOverlay = null;
    onClose?.();
  }

  node.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeyDown, true);
  document.body.appendChild(node);
  node.querySelector('.studio-overlay-close')?.focus?.();

  const body = node.querySelector('[data-overlay-body]');
  activeOverlay = { node, dispose };
  return { node, body, close: dispose, setBody: (html) => { if (!disposed) body.innerHTML = html; } };
}

// --- cutout-chain stages ----------------------------------------------------
// A cutout chain leaves its intermediates beside the final asset, all statically
// served: <id>.raw.png (pre-transparency), <id>.layer2.png (extracted),
// qa-magenta.png (alpha QA composite) and the final <id>.png. There is no
// endpoint for them and none is needed — probe the four names with an Image()
// and keep whichever answer.
const STAGE_DEFS = [
  { id: 'raw', label: 'Raw', checker: false, file: (id) => `${id}.raw.png`,
    hint: 'Straight out of the image workflow, before any background was removed.' },
  { id: 'cutout', label: 'Cutout', checker: true, file: (id) => `${id}.layer2.png`,
    hint: 'The layered extraction — transparency shown against a checkerboard.' },
  { id: 'qa', label: 'QA', checker: false, file: () => 'qa-magenta.png',
    hint: 'The alpha QA composite: anything magenta is a partially transparent pixel.' },
  { id: 'final', label: 'Final', checker: true, file: (id, item) => item?.asset || `${id}.png`,
    hint: 'The media object’s asset — what Accept and Assign act on.' },
];

const mediaFileUrl = (id, file) => `/shared/media/${encodeURIComponent(id)}/${encodeURIComponent(file)}`;

// Probing is idempotent and cheap, but a Review repaint can ask for the same
// four URLs every 2s — cache the answers for the life of the page.
const probeCache = new Map();
function probeImage(url) {
  if (probeCache.has(url)) return probeCache.get(url);
  const promise = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
  probeCache.set(url, promise);
  return promise;
}

// True when this media object plausibly ran the cutout chain, so the step files
// are worth probing at all. Cheap and sync: recipe kind, a layered/extract step,
// or the magenta QA pass the chain is the only thing that writes.
export function isCutoutChain(item) {
  if (!item || item.kind !== 'image') return false;
  if (item.hasMagenta) return true;
  const recipe = item.recipe || {};
  if (recipe.kind === 'cutout-chain') return true;
  return (Array.isArray(recipe.steps) ? recipe.steps : [])
    .some((step) => /layered|extract|cutout|finalize/i.test(String(step?.workflow || step?.op || step?.kind || '')));
}

// mediaStages(item) -> [{id, label, src, checker, hint}] for the stage files that
// actually exist, in pipeline order. A plain generate-image media object has only
// its final asset, so the overlay shows no tabs.
export async function mediaStages(item) {
  if (!item?.id || item.kind !== 'image') return [];
  const defs = isCutoutChain(item) ? STAGE_DEFS : STAGE_DEFS.filter((def) => def.id === 'final');
  const found = await Promise.all(defs.map(async (def) => {
    const file = def.file(item.id, item);
    if (!file) return null;
    const src = mediaFileUrl(item.id, file);
    return (await probeImage(src)) ? { id: def.id, label: def.label, src, checker: def.checker, hint: def.hint, file } : null;
  }));
  return found.filter(Boolean);
}

// --- preview mode -----------------------------------------------------------

function previewBodyHtml(stages, activeId) {
  const active = stages.find((stage) => stage.id === activeId) || stages[0];
  if (!active) return '<p class="hint">Nothing to preview.</p>';
  const tabs = stages.length > 1 ? `
    <div class="studio-preview-tabs" role="tablist">${stages.map((stage) => `
      <button type="button" class="ghost studio-preview-tab${stage.id === active.id ? ' on' : ''}"
        role="tab" aria-selected="${stage.id === active.id ? 'true' : 'false'}"
        data-preview-stage="${escapeHtml(stage.id)}">${escapeHtml(stage.label)}</button>`).join('')}
    </div>` : '';
  return `
    ${tabs}
    <figure class="studio-preview-figure" data-checker="${active.checker ? 'on' : 'off'}">
      <img src="${escapeHtml(active.src)}" alt="${escapeHtml(active.label)} stage">
    </figure>
    <figcaption class="hint studio-preview-caption">${escapeHtml(active.file || '')}${active.hint ? ` — ${escapeHtml(active.hint)}` : ''}</figcaption>`;
}

// openPreviewOverlay({src, title, stages?, stage?, subtitle?})
// The one entry point for "show me that image big". With `stages` (from
// mediaStages()) it grows the Raw/Cutout/QA/Final tabs; with a bare `src` it is
// just a full-bleed image. Returns the overlay handle.
export function openPreviewOverlay({ src, title = '', subtitle = '', stages = null, stage = null } = {}) {
  const list = (Array.isArray(stages) && stages.length)
    ? stages
    : (src ? [{ id: 'final', label: 'Final', src, checker: true, hint: '', file: '' }] : []);
  const wanted = list.some((entry) => entry.id === stage) ? stage : list[0]?.id;
  const overlay = openOverlay({
    title: title || 'Preview',
    subtitle,
    className: 'studio-overlay-preview',
    bodyHtml: previewBodyHtml(list, wanted),
  });
  overlay.node.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-preview-stage]');
    if (!tab) return;
    overlay.setBody(previewBodyHtml(list, tab.dataset.previewStage));
  });
  return overlay;
}

// Convenience for a media card / provenance link: probe the stages, then open.
export async function openMediaPreview(item, stage = null) {
  if (!item || item.kind !== 'image') return null;
  const stages = await mediaStages(item);
  const src = mediaAssetUrl(item);
  if (!stages.length && !src) return null;
  return openPreviewOverlay({
    src, stages, stage,
    title: item.id,
    subtitle: stages.length > 1 ? 'Every step the cutout chain wrote, in order.' : (item.asset || ''),
  });
}

// --- gallery mode (F1) ------------------------------------------------------

// GET /api/studio/ref-candidates?source=… per declared source, in order.
// Never throws: a dead source becomes a {error} group the overlay renders inline,
// so one bad entry cannot blank the whole chooser.
export async function loadRefCandidates(sources = []) {
  const list = (Array.isArray(sources) ? sources : []).filter((source) => typeof source === 'string' && source);
  return Promise.all(list.map(async (source) => {
    try {
      const response = await fetch(`/api/studio/ref-candidates?source=${encodeURIComponent(source)}`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `could not list ${source}`);
      return { source, items: Array.isArray(body.items) ? body.items : [] };
    } catch (error) {
      return { source, items: [], error: error.message };
    }
  }));
}

const SOURCE_LABEL = {
  media: 'Staging media', 'shared:ui': 'Shared UI', 'shared:refs': 'Style references',
  'shared:objects': 'Object cards', 'shared:letter-tiles': 'Letter tiles',
};
const sourceLabel = (source) => SOURCE_LABEL[source]
  || String(source).replace(/^shared:/, '').split('-').map((word) => word.slice(0, 1).toUpperCase() + word.slice(1)).join(' ');

function galleryBodyHtml(groups, value, { loading = false } = {}) {
  const advanced = `
    <details class="studio-gallery-advanced"${value && !groups.some((g) => g.items.some((i) => i.ref === value)) ? ' open' : ''}>
      <summary>Advanced — type a reference by hand</summary>
      <div class="row studio-gallery-freetext">
        <input type="text" data-gallery-freetext value="${escapeHtml(value || '')}"
          placeholder="shared:refs/bus.png, media:&lt;id&gt;, or a styleRefs key" autocomplete="off">
        <button type="button" data-gallery-use>Use</button>
      </div>
      <p class="hint">Anything the server's ref resolver accepts: a committed asset, a staged media object, or a
      styleRefs key configured on this machine.</p>
    </details>`;
  if (loading) return `<p class="hint">Loading references…</p>${advanced}`;
  const groupsHtml = groups.map((group) => {
    if (group.error) return `<section class="studio-gallery-group"><h3>${escapeHtml(sourceLabel(group.source))}</h3>
      <p class="hint">${escapeHtml(group.error)}</p></section>`;
    if (!group.items.length) return `<section class="studio-gallery-group"><h3>${escapeHtml(sourceLabel(group.source))}</h3>
      <p class="hint">Nothing here yet.</p></section>`;
    return `
      <section class="studio-gallery-group">
        <h3>${escapeHtml(sourceLabel(group.source))}</h3>
        <div class="studio-gallery-grid">${group.items.map((item) => `
          <button type="button" class="studio-gallery-item${item.ref === value ? ' on' : ''}"
            data-gallery-pick="${escapeHtml(item.ref)}" title="${escapeHtml(item.ref)}">
            <img loading="lazy" src="${escapeHtml(item.url)}" alt="${escapeHtml(item.name)}">
            <span>${escapeHtml(item.name)}</span>
            ${item.status ? `<span class="status-pill">${escapeHtml(item.status)}</span>` : ''}
          </button>`).join('')}
        </div>
      </section>`;
  }).join('');
  return `${groupsHtml || '<p class="hint">No candidate sources declared for this slot.</p>'}${advanced}`;
}

// openGalleryOverlay({title, sources, value, onPick}) — the refSlot chooser.
// Picking calls onPick(ref) and closes; ✕/Esc/backdrop cancel without calling it.
export function openGalleryOverlay({ title = 'Choose a reference', subtitle = '', sources = [], value = '', onPick } = {}) {
  let groups = [];
  const overlay = openOverlay({
    title, subtitle, className: 'studio-overlay-gallery',
    bodyHtml: galleryBodyHtml([], value, { loading: true }),
  });
  overlay.node.addEventListener('click', (event) => {
    const pick = event.target.closest('[data-gallery-pick]');
    if (pick) { onPick?.(pick.dataset.galleryPick); overlay.close(); return; }
    if (event.target.closest('[data-gallery-use]')) {
      const input = overlay.node.querySelector('[data-gallery-freetext]');
      const typed = (input?.value || '').trim();
      if (!typed) return;
      onPick?.(typed);
      overlay.close();
    }
  });
  loadRefCandidates(sources).then((loaded) => {
    groups = loaded;
    overlay.setBody(galleryBodyHtml(groups, value));
  });
  return overlay;
}

// ============================================================================
// Template registry
// ============================================================================

function normalizeRegistry(registry) {
  return {
    format: registry?.format || 'qlobe-generate-templates',
    formatVersion: registry?.formatVersion ?? 1,
    styles: registry?.styles && typeof registry.styles === 'object' ? registry.styles : {},
    templates: Array.isArray(registry?.templates) ? registry.templates : [],
  };
}

// GET /api/studio/templates -> {ok, registry} when the authoring server is up;
// otherwise the committed shared/data/generate-templates.json, so the whole
// registry stays browsable in a static preview (actions are what degrade, not
// the catalogue). Throws only if BOTH paths fail.
export async function loadTemplates({ url = TEMPLATES_URL } = {}) {
  try {
    const response = await fetch('/api/studio/templates', { cache: 'no-store' });
    if (response.ok) {
      const body = await response.json();
      if (body?.registry) return normalizeRegistry(body.registry);
    }
  } catch { /* no authoring server (or no endpoint yet) — fall through to the file */ }
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('could not load generate-templates.json');
  return normalizeRegistry(await response.json());
}

export function templateById(registry, id) {
  return (registry?.templates || []).find((template) => template.id === id) || null;
}

// [{id, label, status, unproven}] for a template's declared styles, in registry order.
// Templates with no styles[] (voice) return an empty list — no style picker.
export function stylesFor(registry, template) {
  const styles = registry?.styles || {};
  return (template?.styles || []).map((id) => {
    const style = styles[id] || {};
    return { id, label: style.label || id, status: style.status || 'unproven', unproven: style.status !== 'proven' };
  });
}

// ============================================================================
// POST /api/studio/generate
// ============================================================================

// Accepts either shape:
//   template : {template, styleId, fields, refs?, params:{id, seed?}}  (D2 — server expands)
//   legacy   : {kind, params}                                          (raw prompt/workflow)
// Returns the parsed body ({ok, jobId, mediaId}); throws with the server's error text.
export async function postGenerate(payload) {
  const body = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) continue;
    body[key] = value;
  }
  const response = await fetch('/api/studio/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(parsed.error || 'Could not queue generation');
  return parsed;
}

// ============================================================================
// Job tracking
// ============================================================================

// Every regenerate / generate submit returns a jobId (202). Poll GET /api/studio/jobs
// every ~2s — only while something is tracked — until each settles.
//   onTick({jobId, job, info})    — every poll, per tracked job that the server knows
//   onSettled({jobId, job, info}) — once, as a job reaches a terminal status
//   onPoll({settled})             — after each poll pass (settled = any job settled)
// stop() clears the timer and forgets everything: call it from the workspace cleanup.
export function createJobTracker({ onTick, onSettled, onPoll, intervalMs = 2000 } = {}) {
  const jobs = new Map();       // jobId -> info ({label, mediaId, ...} — caller's own shape)
  let timer = null;
  let stopped = false;

  function ensurePolling() {
    if (timer || stopped) return;
    timer = setInterval(() => { pollOnce(); }, intervalMs);
  }

  function stopPollingIfIdle() {
    if (jobs.size === 0 && timer) { clearInterval(timer); timer = null; }
  }

  async function pollOnce() {
    if (stopped || jobs.size === 0) { stopPollingIfIdle(); return; }
    try {
      const response = await fetch('/api/studio/jobs', { cache: 'no-store' });
      if (!response.ok) return;
      const body = await response.json();
      const list = Array.isArray(body?.jobs) ? body.jobs : [];
      let settled = false;
      for (const [jobId, info] of [...jobs]) {
        const job = list.find((entry) => entry.id === jobId);
        if (!job) continue;
        onTick?.({ jobId, job, info });
        if (SETTLED_STATUSES.includes(job.status)) {
          jobs.delete(jobId);
          settled = true;
          onSettled?.({ jobId, job, info });
        }
      }
      if (!stopped) onPoll?.({ settled });
    } catch { /* transient — try again on the next tick */ }
    stopPollingIfIdle();
  }

  return {
    track(jobId, info = {}) {
      if (!jobId || stopped) return;
      jobs.set(jobId, info);
      ensurePolling();
    },
    has: (jobId) => jobs.has(jobId),
    info: (jobId) => jobs.get(jobId) || null,
    get size() { return jobs.size; },
    poll: pollOnce,
    stop() {
      stopped = true;
      if (timer) { clearInterval(timer); timer = null; }
      jobs.clear();
    },
  };
}

// ============================================================================
// Media objects — GET/POST /api/studio/media*
// ============================================================================

// Raw generation outputs (image or voice) awaiting review. Every media card always
// shows an UNASSIGNED badge: there is no "assigned" state for a media record —
// assigning copies the asset out and the record stays here for provenance.

// Maps one GET /api/studio/media summary into the same {id,type,...} shape the
// character/pack/game cards use, tagged type:"media", so it flows through the
// Library's filter()/getCardData() machinery unchanged.
export function mediaToObject(item) {
  return {
    id: item.id, type: 'media', kind: item.kind, asset: item.asset, created: item.created,
    derivedFrom: item.derivedFrom || null, refs: item.refs || {}, role: item.role || null,
    qa: item.qa || {}, hasMagenta: !!item.hasMagenta, hasTranscript: !!item.hasTranscript,
    recipe: item.recipe || null, project: null, tier: null, usageCount: 0, completeness: null,
  };
}

export function mediaAssetUrl(item) {
  return item?.asset ? `/shared/media/${encodeURIComponent(item.id)}/${encodeURIComponent(item.asset)}` : '';
}

export function qaPillFor(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'accepted') return { text: 'accepted', className: 'good' };
  if (value === 'failed-qa') return { text: 'failed qa', className: 'bad' };
  if (value === 'review') return { text: 'review', className: '' };
  return { text: value || '—', className: '' };
}

// createMediaController(deps) — owns the media list, the inline panel state, the
// in-flight set and every /api/studio/media* call.
//
// deps:
//   render()          repaint the host (the controller never touches the DOM itself)
//   toast(msg, opts)  the shell toast
//   serverAvailable() live getter — actions no-op with a toast when false
//   destroyed()       live getter — suppresses repaints after unmount
//   usageIndex()      live getter for the usage index (provenance "consumers" line)
//   tracker           a createJobTracker() to hand regenerate jobs to. Omit and the
//                     controller makes (and disposes) its own.
//   readOnly          true renders cards WITHOUT mutation buttons (Library); the
//                     provenance panel stays. Mutating methods still exist but the
//                     UI never offers them.
//   extraActions(item)-> html appended to the action row (Library's "Open in Generate").
export function createMediaController({
  render = () => {},
  toast = () => {},
  serverAvailable = () => true,
  destroyed = () => false,
  usageIndex = () => null,
  tracker = null,
  readOnly = false,
  extraActions = null,
} = {}) {
  let media = [];                   // GET /api/studio/media summaries
  const busy = new Set();           // ids with a regenerate/accept/reject in flight
  const openPanels = new Map();     // id -> 'provenance' | 'assign'
  const ownTracker = tracker || createJobTracker({
    onSettled: ({ job, info }) => {
      if (info?.mediaId) busy.delete(info.mediaId);
      if (job.status === 'completed') toast(`${info?.label || job.id} — done.`);
      else toast(`${info?.label || job.id} — ${job.error || job.status}`, { error: true, duration: 7000 });
    },
    onPoll: async ({ settled }) => {
      if (destroyed()) return;
      if (settled) await refresh(); else render();
    },
  });
  const ownsTracker = !tracker;

  // ---- data ----------------------------------------------------------------
  async function load() {
    if (!serverAvailable()) { media = []; return media; }
    try {
      const response = await fetch('/api/studio/media', { cache: 'no-store' });
      if (!response.ok) throw new Error('no media endpoint');
      const body = await response.json();
      media = Array.isArray(body?.media) ? body.media : [];
    } catch {
      media = []; // static preview / no endpoint — no media, no thrown error
    }
    return media;
  }

  async function refresh() {
    await load();
    if (!destroyed()) render();
    return media;
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

    // The template block a Phase 6 recipe carries (id + style + fields it was expanded from).
    const template = recipe.template;
    const templateHtml = template?.id
      ? `<p class="hint">template: ${escapeHtml(template.id)}${template.style ? ` · style ${escapeHtml(template.style)}` : ''}</p>`
      : '';

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

    const consumers = usageIndex()?.reverse?.media?.[item.id];
    const consumersHtml = consumers?.length
      ? `<p class="hint">consumers: ${consumers.map(escapeHtml).join(', ')}</p>`
      : '<p class="hint">unassigned — no consumers yet.</p>';

    const magentaHtml = item.hasMagenta
      ? `<p class="hint">magenta QA</p><img class="library-media-qa-thumb" loading="lazy" src="${escapeHtml(`/shared/media/${item.id}/qa-magenta.png`)}" alt="magenta QA pass for ${escapeHtml(item.id)}">`
      : '';

    // A cutout chain keeps every intermediate beside the final asset; these open
    // the preview overlay straight at that stage. Availability is settled by the
    // overlay's own probe — a stage that never got written simply falls back.
    const stageLinks = isCutoutChain(item)
      ? STAGE_DEFS.filter((def) => def.id !== 'qa' || item.hasMagenta).map((def) => `
        <button type="button" class="ghost library-media-stage-link" data-media-action="preview-stage"
          data-media-id="${escapeHtml(item.id)}" data-media-stage="${escapeHtml(def.id)}">${escapeHtml(def.label)}</button>`).join('')
      : '';
    const stagesHtml = stageLinks
      ? `<p class="hint">steps</p><div class="library-media-stages">${stageLinks}</div>`
      : '';

    return `
      <div class="library-media-panel" data-panel="provenance">
        <h4>Provenance</h4>
        ${stepsHtml}
        ${stagesHtml}
        ${templateHtml}
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

  function panelHtml(item) {
    const mode = openPanels.get(item.id);
    if (mode === 'provenance') return provenancePanelHtml(item);
    if (mode === 'assign' && !readOnly) return assignPanelHtml(item);
    return '';
  }

  function mediaCardHtml(item) {
    const qa = item.qa || {};
    const pill = qaPillFor(qa.status);
    const isBusy = busy.has(item.id);
    const isImage = item.kind === 'image';
    const src = mediaAssetUrl(item);
    // The thumbnail is a button so the shell's existing [data-media-action]
    // delegation opens the preview overlay — no host wiring changes, and it works
    // in the Library's read-only mode too. A voice card stays inert: its inline
    // <audio> is already the thing you interact with.
    const preview = isImage
      ? (src ? `<button type="button" class="library-media-thumb-btn" data-media-action="preview"
            data-media-id="${escapeHtml(item.id)}" title="Open full-screen preview">
            <img class="library-media-thumb" loading="lazy" src="${escapeHtml(src)}" alt="${escapeHtml(item.id)}">
          </button>`
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
    const guard = !serverAvailable() ? ' disabled title="needs the authoring server"' : '';
    const busyGuard = isBusy ? ' disabled' : '';
    const mutations = readOnly ? '' : `
          <button type="button" class="ghost" data-media-action="regenerate" data-media-id="${escapeHtml(item.id)}"${guard}${busyGuard}>${isBusy ? '…' : 'Regenerate'}</button>
          <button type="button" class="ghost" data-media-action="assign" data-media-id="${escapeHtml(item.id)}"${guard}>Assign to…</button>
          ${accepted ? '' : `<button type="button" data-media-action="accept" data-media-id="${escapeHtml(item.id)}"${guard}${busyGuard}>Accept</button>`}
          ${accepted ? '' : `<button type="button" class="warn" data-media-action="reject" data-media-id="${escapeHtml(item.id)}"${guard}${busyGuard}>Reject</button>`}`;
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
          ${mutations}
          ${extraActions ? extraActions(item) || '' : ''}
        </div>
        ${panelHtml(item)}
      </article>`;
  }

  // ---- actions -------------------------------------------------------------
  async function regenerate(id, seed) {
    if (!serverAvailable()) { toast('Regenerate needs the authoring server.'); return null; }
    busy.add(id); render();
    try {
      const payload = seed != null ? { seed } : {};
      const response = await fetch(`/api/studio/media/${encodeURIComponent(id)}/regenerate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Could not regenerate ${id}`);
      ownTracker.track(body.jobId, { label: `Regenerate ${id}`, mediaId: id });
      toast(`Regenerating ${id}…`);
      return body;
    } catch (error) {
      busy.delete(id);
      toast(error.message, { error: true, duration: 7000 });
      return null;
    } finally {
      if (!destroyed()) render();
    }
  }

  async function assign(id, dest) {
    if (!serverAvailable()) { toast('Assign needs the authoring server.'); return null; }
    try {
      const response = await fetch(`/api/studio/media/${encodeURIComponent(id)}/assign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dest }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Could not assign ${id}`);
      openPanels.delete(id);
      toast(`Assigned ${id} → ${body.dest || dest}`);
      await refresh();
      return body;
    } catch (error) {
      toast(error.message, { error: true, duration: 7000 });
      return null;
    }
  }

  async function accept(id) {
    if (!serverAvailable()) { toast('Accept needs the authoring server.'); return null; }
    busy.add(id); render();
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
      busy.delete(id);
      await refresh();
    }
  }

  async function reject(id) {
    if (!serverAvailable()) { toast('Reject needs the authoring server.'); return null; }
    busy.add(id); render();
    try {
      const response = await fetch(`/api/studio/media/${encodeURIComponent(id)}/reject`, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Could not reject ${id}`);
      openPanels.delete(id);
      toast(`${id} rejected.`);
      return body;
    } catch (error) {
      toast(error.message, { error: true, duration: 7000 });
      return null;
    } finally {
      busy.delete(id);
      await refresh();
    }
  }

  async function getRecipe(id) {
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
  }

  // Delegated [data-media-action] handler. Unknown actions are ignored so a host
  // can add its own buttons to the same row (see deps.extraActions).
  function handleAction(action, id, button) {
    if (!id) return;
    // Read-only too: looking at an asset is not a mutation.
    if (action === 'preview' || action === 'preview-stage') {
      const item = media.find((entry) => entry.id === id);
      if (item) openMediaPreview(item, button?.dataset?.mediaStage || null);
      return;
    }
    if (action === 'provenance' || (action === 'assign' && !readOnly)) {
      const current = openPanels.get(id);
      if (current === action) openPanels.delete(id); else openPanels.set(id, action);
      render();
      return;
    }
    if (action === 'close-panel') { openPanels.delete(id); render(); return; }
    if (readOnly) return;
    if (action === 'assign-confirm') {
      const card = button?.closest('[data-media-card]');
      const input = card?.querySelector('[data-assign-dest]');
      const dest = (input?.value || '').trim();
      if (!dest) { toast('Enter a destination path.', { error: true }); return; }
      assign(id, dest);
      return;
    }
    if (action === 'regenerate') { regenerate(id); return; }
    if (action === 'accept') { accept(id); return; }
    if (action === 'reject') { reject(id); return; }
  }

  return {
    load, refresh, handleAction, getRecipe,
    regenerate, assign, accept, reject,
    mediaCardHtml, provenancePanelHtml, assignPanelHtml,
    list: () => media.slice(),
    get: (id) => media.find((item) => item.id === id) || null,
    has: (id) => media.some((item) => item.id === id),
    openPanel(id, mode = 'provenance') { openPanels.set(id, mode); },
    closePanel(id) { openPanels.delete(id); },
    panelMode: (id) => openPanels.get(id) || null,
    isBusy: (id) => busy.has(id),
    // regenerate() marks a card in-flight and the OWNED tracker's onSettled is
    // what clears it. A host that injects its own tracker (to share one poll
    // loop) therefore has to clear it from that tracker's onSettled instead —
    // otherwise a regenerated card stays disabled forever. See generate.js.
    clearBusy: (id) => busy.delete(id),
    tracker: ownTracker,
    readOnly,
    // Stops the poll loop this controller owns. Call from the workspace cleanup —
    // an injected tracker is the caller's to stop.
    dispose() {
      if (ownsTracker) ownTracker.stop();
      openPanels.clear();
      busy.clear();
    },
  };
}

// ============================================================================
// Template form — one renderer, one reader
// ============================================================================

// Which field the template's examples[] belong to. Registry templates carry one
// examples[] list for the whole template; it almost always feeds the "big" free
// text field. opts.exampleField (or a future template.exampleField) pins it.
function exampleFieldName(template, override) {
  const fields = Array.isArray(template?.fields) ? template.fields : [];
  if (override && fields.some((field) => field.name === override)) return override;
  if (template?.exampleField && fields.some((field) => field.name === template.exampleField)) return template.exampleField;
  return (fields.find((field) => field.type === 'textarea')
    || fields.find((field) => field.required)
    || fields[0])?.name || null;
}

function optionsOf(field) {
  return (field.options || []).map((option) => (typeof option === 'string' ? { value: option, label: option } : option));
}

function fieldControlHtml(field, value, placeholder, off = '') {
  const name = escapeHtml(field.name);
  const required = field.required ? ' required' : '';
  const ph = placeholder ? ` placeholder="${escapeHtml(placeholder)}"` : '';
  if (field.type === 'select') {
    return `<select data-gen-field="${name}"${required}${off}>${optionsOf(field).map((option) => `
        <option value="${escapeHtml(option.value)}"${option.value === value ? ' selected' : ''}>${escapeHtml(option.label ?? option.value)}</option>`).join('')}
      </select>`;
  }
  if (field.type === 'textarea') {
    return `<textarea data-gen-field="${name}"${required}${ph}${off}>${escapeHtml(value)}</textarea>`;
  }
  return `<input type="text" data-gen-field="${name}" value="${escapeHtml(value)}"${required}${ph}${off} autocomplete="off">`;
}

const truncate = (text, max = 64) => (String(text).length > max ? `${String(text).slice(0, max - 1)}…` : String(text));

// A symbolic ref the browser can show directly. Only `shared:` maps to a static
// URL; `media:<id>` needs the object's recipe to know its asset name, and a bare
// styleRefs key is a path on the operator's machine — both render as no thumb.
export function refPreviewUrl(ref) {
  const value = String(ref || '');
  if (!value.startsWith('shared:')) return '';
  const rel = value.slice('shared:'.length).split('/').filter(Boolean);
  if (!rel.length || rel.includes('..')) return '';
  return `/shared/assets/${rel.map(encodeURIComponent).join('/')}`;
}

function refThumbHtml(ref) {
  const url = refPreviewUrl(ref);
  return url ? `<img class="gen-ref-thumb" src="${escapeHtml(url)}" alt="">` : '';
}

// templateFormHtml(template, styleId, fieldValues, opts) -> html string.
// Purely presentational: no listeners, no state. Render it into any container and
// read it back with readTemplateForm(container).
//
// opts:
//   styles        registry.styles (for style labels + the unproven badge)
//   refs          {slotName: value} overrides for the refSlot inputs
//   id            the media id input's value
//   seed          the seed input's value (defaults to template.seed)
//   exampleField  which field the example chips fill
//   disabled      renders every control disabled (static preview)
//   canBrowse     false disables the refSlot "Choose…" buttons — the gallery
//                 reads GET /api/studio/ref-candidates, which only the authoring
//                 server serves — AND un-readonlys the value, so a static preview
//                 falls back to typing the ref. With the server up the value is
//                 read-only and free text lives in the chooser's advanced row.
//   submitLabel   default "Generate"; showSubmit=false drops the button row
//   status        an extra hint line under the button (job progress)
export function templateFormHtml(template, styleId = null, fieldValues = {}, opts = {}) {
  if (!template) return '<p class="hint">No template selected.</p>';
  const {
    styles = {}, refs = {}, id = '', seed = null, exampleField, disabled = false,
    canBrowse = true, submitLabel = 'Generate', showSubmit = true, status = '',
  } = opts;
  const choices = stylesFor({ styles }, template);
  const activeStyle = choices.find((choice) => choice.id === styleId)
    || choices.find((choice) => choice.id === template.defaultStyle)
    || choices[0] || null;
  const off = disabled ? ' disabled' : '';
  const fields = Array.isArray(template.fields) ? template.fields : [];
  const examples = Array.isArray(template.examples) ? template.examples : [];
  const chipTarget = examples.length ? exampleFieldName(template, exampleField) : null;

  const styleHtml = choices.length > 1 ? `
      <label class="gen-form-style">Style
        <select data-gen-style${off}>${choices.map((choice) => `
          <option value="${escapeHtml(choice.id)}"${choice.id === activeStyle?.id ? ' selected' : ''}>${escapeHtml(choice.label)}${choice.unproven ? ' — unproven' : ''}</option>`).join('')}
        </select>
      </label>
      ${activeStyle?.unproven ? '<p class="hint gen-form-warn"><span class="gen-form-badge">unproven</span> This world has never produced an accepted asset. Expect to iterate.</p>' : ''}`
    : (activeStyle ? `<p class="hint">style: <strong>${escapeHtml(activeStyle.label)}</strong>${activeStyle.unproven ? ' <span class="gen-form-badge">unproven</span>' : ''}</p>` : '');

  const fieldsHtml = fields.map((field) => {
    const raw = fieldValues[field.name];
    const value = raw === undefined || raw === null || raw === '' ? (field.default ?? '') : raw;
    const placeholder = field.name === chipTarget ? examples[0] : field.placeholder;
    return `
      <label class="gen-form-field">${escapeHtml(field.label || field.name)}${field.required ? ' *' : ''}
        ${fieldControlHtml(field, value, placeholder, off)}
      </label>
      ${field.help ? `<p class="hint">${escapeHtml(field.help)}</p>` : ''}`;
  }).join('');

  const slots = Array.isArray(template.refSlots) ? template.refSlots : [];
  const chooseOff = (disabled || !canBrowse) ? ' disabled title="needs the authoring server"' : '';
  const refsHtml = slots.length ? `
      <div class="gen-form-refs">${slots.map((slot) => {
    const value = refs[slot.name] ?? template.refs?.[slot.name] ?? slot.default ?? '';
    const gallery = (Array.isArray(slot.gallery) ? slot.gallery : []).filter((source) => typeof source === 'string' && source);
    const help = slot.help ? `<p class="hint">${escapeHtml(slot.help)}</p>` : '';
    // A slot that declares gallery sources is CHOSEN, not typed: the value goes
    // read-only and "Choose…" opens the gallery overlay. Free text is not lost —
    // it moves to the chooser's advanced row. A slot with no gallery is
    // unchanged from Phase 6: a plain symbolic-ref input.
    if (!gallery.length) {
      return `
        <label class="gen-form-field">${escapeHtml(slot.label || slot.name)}${slot.required ? ' *' : ''}
          <input type="text" data-gen-ref="${escapeHtml(slot.name)}" value="${escapeHtml(value)}"
            placeholder="shared:refs/bus.png"${slot.required ? ' required' : ''}${off} autocomplete="off">
        </label>
        ${help}`;
    }
    return `
        <div class="gen-form-field gen-ref-slot" data-ref-slot="${escapeHtml(slot.name)}">
          <span class="gen-ref-label">${escapeHtml(slot.label || slot.name)}${slot.required ? ' *' : ''}</span>
          <div class="gen-ref-row">
            <span class="gen-ref-thumb-slot" data-ref-thumb>${refThumbHtml(value)}</span>
            <input type="text" data-gen-ref="${escapeHtml(slot.name)}" value="${escapeHtml(value)}"
              ${canBrowse ? 'readonly placeholder="nothing chosen yet"' : 'placeholder="shared:refs/bus.png"'}${slot.required ? ' required' : ''}${off} autocomplete="off">
            <button type="button" class="ghost gen-ref-choose" data-gen-ref-choose="${escapeHtml(slot.name)}"
              data-gen-ref-gallery="${escapeHtml(gallery.join(','))}"
              data-gen-ref-label="${escapeHtml(slot.label || slot.name)}"${chooseOff}>Choose…</button>
          </div>
        </div>
        ${help}`;
  }).join('')}</div>` : '';

  const examplesHtml = examples.length ? `
      <div class="gen-form-examples">
        <p class="hint">Examples${chipTarget ? ` — fills “${escapeHtml(fields.find((field) => field.name === chipTarget)?.label || chipTarget)}”` : ''}</p>
        <div class="gen-form-chips">${examples.map((example, index) => `
          <button type="button" class="ghost gen-form-chip" data-gen-example="${index}"${chipTarget ? ` data-gen-target="${escapeHtml(chipTarget)}"` : ''}
            title="${escapeHtml(example)}"${off}>${escapeHtml(truncate(example))}</button>`).join('')}
        </div>
      </div>` : '';

  return `
    <form class="gen-form" data-template-form data-template-id="${escapeHtml(template.id)}" data-style-id="${escapeHtml(activeStyle?.id || '')}">
      <div class="gen-form-head">
        <h3>${escapeHtml(template.label || template.id)}</h3>
        <span class="status-pill">${escapeHtml(template.kind || '')}</span>
      </div>
      ${styleHtml}
      ${fieldsHtml}
      ${refsHtml}
      <div class="field-grid">
        <label class="gen-form-field">Id (kebab-case)
          <input type="text" data-gen-param="id" value="${escapeHtml(id)}" placeholder="e.g. ${escapeHtml(template.id)}-1"
            pattern="[a-z0-9]+(-[a-z0-9]+)*" required${off} autocomplete="off">
        </label>
        <label class="gen-form-field">Seed
          <input type="number" data-gen-param="seed" value="${escapeHtml(seed ?? template.seed ?? '')}"${off}>
        </label>
      </div>
      ${examplesHtml}
      ${template.assignHint ? `<p class="hint gen-form-warn">${escapeHtml(template.assignHint)}</p>` : ''}
      ${status ? `<p class="hint">${escapeHtml(status)}</p>` : ''}
      ${showSubmit ? `<div class="row"><button type="submit"${off}>${escapeHtml(submitLabel)}</button></div>` : ''}
    </form>`;
}

function formOf(container) {
  if (!container) return null;
  return container.matches?.('[data-template-form]') ? container : container.querySelector?.('[data-template-form]') || null;
}

// readTemplateForm(container) -> {template, styleId, fields, refs, params} — the exact
// body postGenerate() wants. Blank fields are dropped so the server's own defaults and
// required-field validation stay authoritative (the client never invents values).
export function readTemplateForm(container) {
  const form = formOf(container);
  if (!form) return null;
  const styleSelect = form.querySelector('[data-gen-style]');
  const fields = {};
  for (const control of form.querySelectorAll('[data-gen-field]')) {
    const value = typeof control.value === 'string' ? control.value.trim() : control.value;
    if (value !== '') fields[control.dataset.genField] = value;
  }
  const refs = {};
  for (const control of form.querySelectorAll('[data-gen-ref]')) {
    const value = (control.value || '').trim();
    if (value) refs[control.dataset.genRef] = value;
  }
  const params = {};
  const idInput = form.querySelector('[data-gen-param="id"]');
  const seedInput = form.querySelector('[data-gen-param="seed"]');
  const id = (idInput?.value || '').trim();
  if (id) params.id = id;
  const seed = (seedInput?.value ?? '').toString().trim();
  if (seed !== '') params.seed = Number(seed);
  const payload = { template: form.dataset.templateId, fields, params };
  const styleId = styleSelect ? styleSelect.value : (form.dataset.styleId || '');
  if (styleId) payload.styleId = styleId;
  if (Object.keys(refs).length) payload.refs = refs;
  return payload;
}

// Optional wiring for a rendered form: example chips fill their target field, a
// refSlot's "Choose…" opens the gallery overlay, and a style change reports back
// so the host can re-render (variants can change the form).
// Returns a disposer; the listener lives on `container`, so one call survives
// re-renders of the form inside it.
export function wireTemplateForm(container, { onChange } = {}) {
  if (!container) return () => {};
  const onClick = (event) => {
    const chooser = event.target.closest('[data-gen-ref-choose]');
    if (chooser) {
      event.preventDefault();
      if (chooser.disabled) return;
      const form = formOf(chooser.closest('[data-template-form]') || container);
      const name = chooser.dataset.genRefChoose;
      const input = form?.querySelector(`[data-gen-ref="${CSS.escape(name)}"]`);
      const thumb = chooser.closest('.gen-ref-slot')?.querySelector('[data-ref-thumb]');
      openGalleryOverlay({
        title: chooser.dataset.genRefLabel || 'Choose a reference',
        subtitle: 'Click one to use it. Esc or ✕ leaves the current choice alone.',
        sources: (chooser.dataset.genRefGallery || '').split(',').filter(Boolean),
        value: input?.value || '',
        onPick: (ref) => {
          if (input) input.value = ref;
          if (thumb) thumb.innerHTML = refThumbHtml(ref);
          onChange?.({ reason: 'ref', slot: name, value: ref });
        },
      });
      return;
    }
    const chip = event.target.closest('[data-gen-example]');
    if (!chip) return;
    event.preventDefault();
    const form = formOf(chip.closest('[data-template-form]') || container);
    const target = chip.dataset.genTarget;
    const control = target && form?.querySelector(`[data-gen-field="${CSS.escape(target)}"]`);
    if (!control) return;
    control.value = chip.title;
    control.focus();
    onChange?.({ reason: 'example', field: target, value: chip.title });
  };
  const onSelectChange = (event) => {
    const select = event.target.closest('[data-gen-style]');
    if (!select) return;
    const form = formOf(select.closest('[data-template-form]') || container);
    if (form) form.dataset.styleId = select.value;
    onChange?.({ reason: 'style', styleId: select.value });
  };
  container.addEventListener('click', onClick);
  container.addEventListener('change', onSelectChange);
  return () => {
    container.removeEventListener('click', onClick);
    container.removeEventListener('change', onSelectChange);
  };
}
