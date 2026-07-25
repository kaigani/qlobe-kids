// generate.js — native Generate workspace (Phase 6, Feature D). Maps §5.5 of
// docs/qlobe-studio-v2.md: the means of production, promoted to the first
// primary-nav domain.
//
// mount(host, ctx) -> cleanup, matching the shell contract in studio.js and the
// tab idiom established by workspaces/production.js. Five tabs published through
// ctx.setNav:
//
//   Menu · Character · Prop · Scene   — the template catalogue, one tab per
//     registry `section`: a left rail of that section's groups and templates, a
//     form pane for the selected template, and the outputs it has already made.
//   Review                            — the whole unassigned-media queue:
//     provenance / accept / reject / assign / regenerate.
//
// Every prompt lives in shared/data/generate-templates.json and is expanded
// SERVER-side at enqueue (§7.7/§10): this workspace posts {template, styleId,
// fields, params:{id, seed}} and cannot supply prompt material at all. That is
// the point — a prompt in the UI is a prompt that drifts from the registry.
//
// Degrades to a static preview (no authoring server): loadTemplates() falls back
// to the committed registry file, so browsing and form rendering stay live; only
// the actions (Generate, and every media mutation) disable with the standard
// "needs the authoring server" affordance.
//
// CACHE NOTE: lib/generate-core.js is imported without the ?v= cache-buster the
// shell puts on this file — hard-reload after touching it.

import { serverStatus } from '../api.js';
import {
  loadTemplates, templateById, stylesFor, postGenerate, createJobTracker,
  createMediaController, templateFormHtml, readTemplateForm, wireTemplateForm, escapeHtml,
  closeOverlay,
} from './lib/generate-core.js';

// The four catalogue sections plus Review, in nav order. `section` here is the
// registry field of the same name; a template with an unknown section simply
// never appears in a rail (the validator is what keeps that from happening).
const SECTIONS = [
  { id: 'menu', label: 'Menu' },
  { id: 'character', label: 'Character' },
  { id: 'prop', label: 'Prop' },
  { id: 'scene', label: 'Scene' },
  { id: 'review', label: 'Review' },
];
const SECTION_IDS = SECTIONS.map((section) => section.id);
const CATALOGUE_IDS = SECTION_IDS.filter((id) => id !== 'review');
const DEFAULT_SECTION = 'menu';
const SECTION_LABEL = Object.fromEntries(SECTIONS.map((section) => [section.id, section.label]));

// Group headings inside a rail. Registry `group` ids the map doesn't know fall
// back to a title-cased kebab id, so a new group needs no code change.
const GROUP_LABEL = {
  'game-chooser': 'Game Chooser', 'game-splash': 'Game Splash', 'shared-ui': 'Shared UI',
  puppet: 'Puppet', pose: 'Pose', video: 'Video', voice: 'Voice',
  image: 'Image', backdrop: 'Backdrop',
};
const groupLabel = (id) => GROUP_LABEL[id]
  || String(id || 'other').split('-').map((word) => word.slice(0, 1).toUpperCase() + word.slice(1)).join(' ');

const SECTION_HINT = {
  menu: 'The chooser tiles, the splash screens, and the shared UI furniture. Hub tiles are hand-curated — generation stages them, a human places them.',
  character: 'Puppet source art (body sheet, viseme grid), the six semantic pose sprites, video key frames, and teacher-voice lines.',
  prop: 'Single objects through the cutout chain: dark-ground render → layered extraction → alpha QA → crop and resize.',
  scene: 'Full-bleed 16:9 backdrops, switchable across all four image worlds.',
  review: 'Everything in shared/media/ awaiting a decision. Accept marks QA approved, reject moves the folder to a git-ignored trash, Assign to… copies the asset where it belongs and keeps the recipe alongside it.',
};

// A style that changes nothing but the provenance record. True when no prompt
// this template can resolve to (base or variant) carries {style.suffix} AND every
// ref a declared style would contribute is already pinned by the template or
// supplied per-run through a refSlot — i.e. the look comes from the reference
// image, not from the world. menu-splash-title and character-viseme-grid.
function styleIsCosmetic(registry, template) {
  const prompts = [template?.prompt, ...Object.values(template?.variants || {}).map((variant) => variant?.prompt)];
  if (prompts.some((prompt) => typeof prompt === 'string' && prompt.includes('{style.suffix}'))) return false;
  const pinned = new Set([
    ...Object.keys(template?.refs || {}),
    ...(Array.isArray(template?.refSlots) ? template.refSlots : []).map((slot) => slot.name),
  ]);
  for (const id of template?.styles || []) {
    const styleRefs = registry?.styles?.[id]?.refs || {};
    if (Object.keys(styleRefs).some((key) => !pinned.has(key))) return false;
  }
  return true;
}

export async function mount(host, { params, toast, openWorkspace, setNav, setParam }) {
  let destroyed = false;
  let serverAvailable = false;
  let registry = { styles: {}, templates: [] };

  // ---- view state ----
  let activeSection = DEFAULT_SECTION;   // owns ?section
  let selectedId = null;                 // owns ?template
  let activeStyle = null;                // transient — never a URL param
  let formSeed = { fields: {}, refs: {}, id: '', seed: null }; // survives a style re-render
  let submitting = false;
  let jobStatus = '';

  const templatesIn = (section) => (registry.templates || []).filter((template) => template.section === section);
  const selected = () => (selectedId ? templateById(registry, selectedId) : null);

  // ---- jobs ----------------------------------------------------------------
  // ONE poll loop for this workspace: generate submissions and the media
  // controller's regenerate jobs share it, so navigating away stops everything
  // with a single tracker.stop() in cleanup.
  const tracker = createJobTracker({
    onTick: ({ job, info }) => {
      if (destroyed) return;
      const progress = (job.progress != null && job.total != null) ? ` ${job.progress}/${job.total}` : '';
      jobStatus = `${info?.label || job.id} — ${job.status}${progress}${job.message ? ` · ${job.message}` : ''}`;
      paintJobStatus();
    },
    onSettled: ({ job, info }) => {
      // With an injected tracker the controller's own settle handler is not
      // installed, so clearing its in-flight flag is this workspace's job.
      if (info?.mediaId) mediaController.clearBusy(info.mediaId);
      const label = info?.label || job.id;
      if (job.status === 'completed') {
        jobStatus = `${label} — done.`;
        toast(`${label} — done.`);
      } else {
        jobStatus = `${label} — ${job.error || job.status}`;
        toast(jobStatus, { error: true, duration: 7000 });
      }
      paintJobStatus();
    },
    onPoll: async ({ settled }) => {
      if (destroyed) return;
      if (settled) await mediaController.refresh(); else renderMedia();
    },
  });

  // ---- media ---------------------------------------------------------------
  // Full controller (not read-only): Review IS the queue now. render() repaints
  // only the media surfaces — never the form, which would eat what the user is
  // typing on every 2s poll.
  const mediaController = createMediaController({
    tracker,
    render: () => { if (!destroyed) renderMedia(); },
    toast,
    serverAvailable: () => serverAvailable,
    destroyed: () => destroyed,
    usageIndex: () => null,
    extraActions: (item) => (item.recipe?.template?.id && templateById(registry, item.recipe.template.id)
      ? `<button type="button" class="ghost" data-media-action="open-template" data-media-id="${escapeHtml(item.id)}">Open template</button>`
      : ''),
  });

  host.innerHTML = `
    <div class="workspace generate-workspace" data-workspace="generate">
      <div class="workspace-canvas generate-canvas">
        <div class="generate-body" data-body data-rail="on">
          <nav class="generate-rail" aria-label="Templates"></nav>
          <div class="generate-main">
            <div class="generate-pane" data-pane="catalogue">
              <div data-form-host></div>
              <p class="hint generate-job-status" data-job-status hidden></p>
              <section class="generate-outputs" data-outputs></section>
            </div>
            <div class="generate-pane" data-pane="review" hidden></div>
          </div>
        </div>
      </div>
      <aside class="workspace-inspector">
        <div class="panel-section" data-detail></div>
        <div class="panel-section">
          <h2>Generate</h2>
          <p class="hint">Every generative call is a committed template — prompt, references, workflow and
          dimensions harvested from a proven run. Pick one, fill its slots, pick an art world, queue it.
          The server expands the prompt from the registry, so what ships is what was reviewed.</p>
          <p class="hint" data-server-hint></p>
        </div>
      </aside>
    </div>`;

  const body = host.querySelector('[data-body]');
  const rail = host.querySelector('.generate-rail');
  const formHost = host.querySelector('[data-form-host]');
  const jobStatusNode = host.querySelector('[data-job-status]');
  const outputsNode = host.querySelector('[data-outputs]');
  const cataloguePane = host.querySelector('[data-pane="catalogue"]');
  const reviewPane = host.querySelector('[data-pane="review"]');
  const detailNode = host.querySelector('[data-detail]');
  const serverHint = host.querySelector('[data-server-hint]');

  const fail = (error) => { console.error(error); toast(error.message, { error: true, duration: 7000 }); };

  // ---- nav (tabs + crumbs + count pill) ------------------------------------
  function navConfig() {
    const tabs = SECTIONS.map((section) => ({
      id: section.id, label: section.label, onClick: () => setSection(section.id),
    }));
    const crumbs = [{ label: 'Generate', onClick: () => setSection(DEFAULT_SECTION) }];
    const template = selected();
    if (activeSection === 'review') {
      crumbs.push({ label: 'Review' });
    } else {
      crumbs.push(template
        ? { label: SECTION_LABEL[activeSection], onClick: () => selectTemplate(null) }
        : { label: SECTION_LABEL[activeSection] });
      if (template) crumbs.push({ label: template.label || template.id });
    }
    const count = activeSection === 'review'
      ? `${mediaController.list().length} unassigned`
      : `${templatesIn(activeSection).length} template${templatesIn(activeSection).length === 1 ? '' : 's'}`;
    return { tabs, activeTab: activeSection, crumbs, count };
  }
  const syncNav = () => setNav(navConfig());

  // ---- ?section / ?template hygiene (spec §9.1) ----------------------------
  // One owner, set on enter, deleted on return to the section root, validated on
  // mount, mutated only through setParam. `menu` is the default, so it stays out
  // of the URL entirely (production.js's tab idiom).
  function setSection(section, { syncParams = true } = {}) {
    if (!SECTION_IDS.includes(section)) return;
    activeSection = section;
    selectedId = null;              // entering a section lands on its root
    if (syncParams) {
      setParam('section', section === DEFAULT_SECTION ? null : section);
      setParam('template', null);
    }
    renderAll();
  }

  function selectTemplate(id, { syncParams = true } = {}) {
    const template = id ? templateById(registry, id) : null;
    if (id && (!template || template.section !== activeSection)) return false;
    selectedId = template ? template.id : null;
    activeStyle = template ? (template.defaultStyle || (template.styles || [])[0] || null) : null;
    formSeed = { fields: {}, refs: {}, id: '', seed: null };
    jobStatus = '';
    if (syncParams) setParam('template', selectedId);
    renderRail(); renderForm(); renderOutputs(); renderDetail(); syncNav();
    return true;
  }

  // ---- rail ----------------------------------------------------------------
  function renderRail() {
    const off = activeSection === 'review';
    body.dataset.rail = off ? 'off' : 'on';
    if (off) { rail.hidden = true; rail.innerHTML = ''; return; }
    rail.hidden = false;
    const list = templatesIn(activeSection);
    const groups = [];
    for (const template of list) {
      const key = template.group || 'other';
      let group = groups.find((entry) => entry.id === key);
      if (!group) { group = { id: key, templates: [] }; groups.push(group); }
      group.templates.push(template);
    }
    const groupsHtml = groups.length ? groups.map((group) => `
      <div class="generate-rail-group">
        <h3>${escapeHtml(groupLabel(group.id))}</h3>
        ${group.templates.map((template) => `
          <button type="button" class="generate-rail-item${template.id === selectedId ? ' on' : ''}"
            data-template="${escapeHtml(template.id)}" aria-pressed="${template.id === selectedId ? 'true' : 'false'}">
            <strong>${escapeHtml(template.label || template.id)}</strong>
            <span>${escapeHtml(template.kind || '')}</span>
          </button>`).join('')}
      </div>`).join('') : '<p class="hint">No templates in this section yet.</p>';
    rail.innerHTML = `
      <div class="generate-rail-head">
        <strong>${escapeHtml(SECTION_LABEL[activeSection])}</strong>
        ${selectedId ? '<button type="button" class="ghost" data-action="section-root">All</button>' : ''}
      </div>
      ${groupsHtml}`;
  }

  // ---- form ----------------------------------------------------------------
  function renderForm() {
    const template = selected();
    if (!template) {
      formHost.innerHTML = `<div class="empty-state"><div><h1>Pick a template</h1>
        <p class="hint">${escapeHtml(SECTION_HINT[activeSection] || '')}</p></div></div>`;
      return;
    }
    const choices = stylesFor(registry, template);
    const cosmetic = choices.length > 0 && styleIsCosmetic(registry, template);
    const note = cosmetic
      ? `<p class="hint gen-form-warn">This template takes its look from the reference image, not from the art
         world — the style only tags the provenance record.</p>`
      : '';
    formHost.innerHTML = note + templateFormHtml(template, activeStyle, formSeed.fields, {
      styles: registry.styles,
      refs: formSeed.refs,
      id: formSeed.id,
      seed: formSeed.seed,
      // The gallery chooser reads GET /api/studio/ref-candidates; in a static
      // preview "Choose…" disables and the chooser's free-text row is the way in.
      canBrowse: serverAvailable,
      submitLabel: 'Generate',
    });
    if (!serverAvailable) {
      const submit = formHost.querySelector('button[type="submit"]');
      if (submit) { submit.disabled = true; submit.title = 'needs the authoring server'; }
    }
    paintJobStatus();
  }

  function paintJobStatus() {
    jobStatusNode.hidden = !(jobStatus && activeSection !== 'review');
    jobStatusNode.textContent = jobStatus;
  }

  // Snapshot whatever is typed into the live form so a re-render (style switch,
  // variant swap) does not throw it away.
  function captureForm() {
    const payload = readTemplateForm(formHost);
    if (!payload) return;
    formSeed = {
      fields: payload.fields || {},
      refs: payload.refs || {},
      id: payload.params?.id || '',
      seed: payload.params?.seed ?? null,
    };
  }

  function setStyle(id) {
    const template = selected();
    if (!template || !(template.styles || []).includes(id)) return false;
    captureForm();
    activeStyle = id;
    renderForm(); renderDetail();
    return true;
  }

  // ---- outputs + review ----------------------------------------------------
  function assignHintFor(item) {
    const template = item.recipe?.template?.id ? templateById(registry, item.recipe.template.id) : null;
    return template?.assignHint
      ? `<p class="hint gen-form-warn generate-assign-hint">${escapeHtml(template.assignHint)}</p>`
      : '';
  }

  const mediaItemHtml = (item) => `
    <div class="generate-media-item">${mediaController.mediaCardHtml(item)}${assignHintFor(item)}</div>`;

  function renderOutputs() {
    const template = selected();
    if (!template) { outputsNode.innerHTML = ''; return; }
    const list = mediaController.list().filter((item) => item.recipe?.template?.id === template.id);
    outputsNode.innerHTML = `
      <h3>Recent outputs</h3>
      ${list.length
    ? `<div class="library-grid">${list.map(mediaItemHtml).join('')}</div>`
    : `<p class="hint">${serverAvailable
      ? 'Nothing generated from this template yet.'
      : 'Generated media needs the authoring server.'}</p>`}`;
  }

  function renderReview() {
    if (!serverAvailable) {
      reviewPane.innerHTML = `<div class="empty-state"><div><h1>Review needs the server</h1>
        <p class="hint">The review queue reads shared/media/ through the authoring server. Not available in this
        static preview — open Studio through the authoring server to accept, reject or assign.</p></div></div>`;
      return;
    }
    const list = mediaController.list();
    reviewPane.innerHTML = list.length
      ? `<div class="library-grid">${list.map(mediaItemHtml).join('')}</div>`
      : `<div class="empty-state"><div><h1>Nothing to review</h1>
         <p class="hint">Every generated asset has been accepted, assigned or rejected.</p></div></div>`;
  }

  // Repaint everything media-shaped. Safe to call from the poll loop — it never
  // touches the form.
  function renderMedia() {
    renderOutputs();
    renderReview();
    syncNav();
  }

  // ---- inspector detail ----------------------------------------------------
  function renderDetail() {
    const template = selected();
    if (activeSection === 'review') {
      detailNode.innerHTML = `<h3>Review</h3><p class="hint">${escapeHtml(SECTION_HINT.review)}</p>`;
      return;
    }
    if (!template) {
      detailNode.innerHTML = `<h3>${escapeHtml(SECTION_LABEL[activeSection])}</h3>
        <p class="hint">${escapeHtml(SECTION_HINT[activeSection] || '')}</p>`;
      return;
    }
    const style = activeStyle ? registry.styles?.[activeStyle] : null;
    const size = template.width && template.height ? ` · ${template.width}×${template.height}` : '';
    detailNode.innerHTML = `
      <h3>${escapeHtml(template.label || template.id)}</h3>
      <p class="hint">${escapeHtml(template.id)} · ${escapeHtml(template.kind || '')} · ${escapeHtml(template.workflow || '')}${escapeHtml(size)}</p>
      ${style ? `<p class="hint">world: <strong>${escapeHtml(style.label || activeStyle)}</strong>${style.status === 'proven' ? '' : ' <span class="gen-form-badge">unproven</span>'}</p>` : ''}
      ${template.provenance ? `<p class="hint">provenance: ${escapeHtml(template.provenance)}</p>` : ''}`;
  }

  function renderAll() {
    renderRail(); renderForm(); renderOutputs(); renderReview(); renderDetail();
    cataloguePane.hidden = activeSection === 'review';
    reviewPane.hidden = activeSection !== 'review';
    paintJobStatus();
    syncNav();
  }

  // ---- generate ------------------------------------------------------------
  // Builds the D2 body by hand rather than posting readTemplateForm()'s shape
  // straight through: refs belong under params.refs, and a template that declares
  // no styles must not carry a styleId at all (the server 400s on one).
  async function submitGenerate() {
    if (submitting) return { ok: false, error: 'already submitting' };
    if (!serverAvailable) { toast('Generate needs the authoring server.'); return { ok: false, error: 'no authoring server' }; }
    const template = selected();
    if (!template) return { ok: false, error: 'no template selected' };
    const form = readTemplateForm(formHost);
    if (!form) return { ok: false, error: 'no form rendered' };
    if (!form.params?.id) { toast('Give the output a kebab-case id.', { error: true }); return { ok: false, error: 'id is required' }; }

    const payload = { template: template.id, fields: form.fields || {}, params: { ...form.params } };
    if ((template.styles || []).length && form.styleId) payload.styleId = form.styleId;
    if (form.refs && Object.keys(form.refs).length) payload.params.refs = form.refs;

    submitting = true;
    captureForm();
    jobStatus = `Queuing ${payload.params.id}…`;
    paintJobStatus();
    try {
      const result = await postGenerate(payload);
      tracker.track(result.jobId, { label: `${template.label || template.id} → ${result.mediaId || payload.params.id}`, mediaId: result.mediaId });
      jobStatus = `${result.mediaId || payload.params.id} queued (job ${result.jobId}).`;
      toast(`Queued ${result.mediaId || payload.params.id}.`);
      return { ok: true, jobId: result.jobId, mediaId: result.mediaId };
    } catch (error) {
      jobStatus = error.message;
      toast(error.message, { error: true, duration: 7000 });
      return { ok: false, error: error.message };
    } finally {
      submitting = false;
      if (!destroyed) paintJobStatus();
    }
  }

  // ---- wiring --------------------------------------------------------------
  // `host` is the shell's persistent #native-workspace node (studio.js only
  // clears its innerHTML between mounts), so BOTH listeners below must come off
  // again in cleanup or every revisit stacks another handler on the same node.
  const onHostClick = (event) => {
    const railItem = event.target.closest('[data-template]');
    if (railItem) { selectTemplate(railItem.dataset.template); return; }
    const action = event.target.closest('[data-action]');
    if (action?.dataset.action === 'section-root') { selectTemplate(null); return; }
    const mediaButton = event.target.closest('[data-media-action]');
    if (!mediaButton) return;
    const id = mediaButton.dataset.mediaId;
    if (mediaButton.dataset.mediaAction === 'open-template') {
      const item = mediaController.get(id);
      const template = item?.recipe?.template?.id ? templateById(registry, item.recipe.template.id) : null;
      if (!template) { toast('That media object carries no registry template.'); return; }
      setSection(template.section);
      selectTemplate(template.id);
      return;
    }
    mediaController.handleAction(mediaButton.dataset.mediaAction, id, mediaButton);
  };

  const onHostSubmit = (event) => {
    if (!event.target.closest('[data-template-form]')) return;
    event.preventDefault();
    submitGenerate().catch(fail);
  };

  host.addEventListener('click', onHostClick);
  host.addEventListener('submit', onHostSubmit);
  // One call on the persistent container, so it survives every form re-render.
  const disposeForm = wireTemplateForm(formHost, {
    onChange: (change) => { if (change.reason === 'style') setStyle(change.styleId); },
  });

  // ---- boot ----------------------------------------------------------------
  try {
    try { await serverStatus(); serverAvailable = true; } catch { serverAvailable = false; }
    registry = await loadTemplates();
    if (destroyed) return () => {};
    await mediaController.load();
    if (destroyed) return () => {};

    serverHint.textContent = serverAvailable
      ? 'Authoring server connected — jobs queue through Production and land in Review.'
      : 'Static preview — the registry and every form still render from shared/data/generate-templates.json, but generating and reviewing need the authoring server.';

    // Validate the two owned params, deleting anything that does not resolve.
    const requestedSection = params.get('section');
    if (requestedSection && !SECTION_IDS.includes(requestedSection)) setParam('section', null);
    activeSection = SECTION_IDS.includes(requestedSection) ? requestedSection : DEFAULT_SECTION;
    if (activeSection === DEFAULT_SECTION && requestedSection) setParam('section', null);

    const requestedTemplate = params.get('template');
    const template = requestedTemplate ? templateById(registry, requestedTemplate) : null;
    if (requestedTemplate && (!template || template.section !== activeSection)) setParam('template', null);
    selectedId = (template && template.section === activeSection) ? template.id : null;
    if (selectedId) activeStyle = template.defaultStyle || (template.styles || [])[0] || null;

    renderAll();
  } catch (error) {
    console.error(error);
    host.querySelector('.generate-body').innerHTML = `<div class="empty-state"><div>
      <h1>Generate unavailable</h1><p>${escapeHtml(error.message)}</p></div></div>`;
    toast(`Could not load the template registry: ${error.message}`, { error: true, duration: 7000 });
  }

  // Debug surface for browser automation (Phase 6 gate). Serializable returns
  // only; deleted on cleanup like every other workspace's.
  const debugState = () => ({
    workspace: 'generate',
    section: activeSection,
    template: selectedId,
    style: activeStyle,
    fields: readTemplateForm(formHost)?.fields || {},
    serverAvailable,
    jobs: tracker.size,
    jobStatus,
    mediaCount: mediaController.list().length,
  });

  window.QLOBE_STUDIO_DEBUG = {
    workspace: 'generate',
    listSections: () => SECTIONS.map((section) => ({
      id: section.id, label: section.label,
      templates: section.id === 'review' ? null : templatesIn(section.id).length,
    })),
    listTemplates: (section) => (registry.templates || [])
      .filter((template) => !section || template.section === section)
      .map((template) => ({
        id: template.id, label: template.label, section: template.section, group: template.group,
        kind: template.kind, workflow: template.workflow,
        styles: (template.styles || []).slice(), defaultStyle: template.defaultStyle || null,
      })),
    openSection: (id) => { setSection(id); return debugState(); },
    selectTemplate: (id) => { selectTemplate(id); return debugState(); },
    setStyle: (id) => { setStyle(id); return debugState(); },
    setField: (name, value) => {
      const control = formHost.querySelector(`[data-gen-field="${CSS.escape(String(name))}"]`)
        || formHost.querySelector(`[data-gen-param="${CSS.escape(String(name))}"]`);
      if (!control) return false;
      control.value = value;
      return true;
    },
    generate: () => submitGenerate(),
    listMedia: () => mediaController.list(),
    getRecipe: (id) => mediaController.getRecipe(id),
    state: debugState,
  };

  return () => {
    destroyed = true;
    // The overlay lives on document.body, not in `host` — leaving it up would
    // survive the unmount and keep the body scroll locked.
    closeOverlay();
    tracker.stop();
    disposeForm();
    mediaController.dispose();
    host.removeEventListener('click', onHostClick);
    host.removeEventListener('submit', onHostSubmit);
    if (window.QLOBE_STUDIO_DEBUG?.workspace === 'generate') delete window.QLOBE_STUDIO_DEBUG;
  };
}
