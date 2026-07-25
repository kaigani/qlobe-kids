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
  closeOverlay, isCutoutChain, qaPillFor, mediaAssetUrl,
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

// Rail glyphs (Phase 6.2, Feature J). Inline SVG, no external asset, currentColor
// so the selected card's mark darkens with its text. Keyed by template first so a
// group can hold two different kinds of thing (a body sheet and a viseme grid),
// then by group so a new template inherits its neighbours' mark for free.
const GLYPHS = {
  person: '<circle cx="12" cy="7" r="3.2"/><path d="M6.5 20.5v-2.6a5.5 5.5 0 0 1 11 0v2.6"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7"/><rect x="13.5" y="3.5" width="7" height="7"/><rect x="3.5" y="13.5" width="7" height="7"/><rect x="13.5" y="13.5" width="7" height="7"/>',
  film: '<rect x="3" y="5" width="18" height="14"/><path d="M7.5 5v14M16.5 5v14M3 12h18"/>',
  wave: '<path d="M3.5 12h1.5M8 7.5v9M12 4.5v15M16 9v6M20.5 11.5v1"/>',
  tile: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="12" cy="12" r="3.4"/>',
  title: '<path d="M4 6.5h16M12 6.5v13"/>',
  landscape: '<rect x="3" y="5" width="18" height="14"/><path d="M3 16.5l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9.2" r="1.5"/>',
  button: '<rect x="3" y="8" width="18" height="8" rx="4"/><circle cx="12" cy="12" r="1.7"/>',
  layers: '<path d="M4 8.5h11v11H4z"/><path d="M9 8.5V4h11v11h-4.5"/>',
};
const TEMPLATE_GLYPH = {
  'menu-category-tile': 'tile', 'menu-game-tile': 'tile', 'menu-splash-title': 'title',
  'menu-splash-background': 'landscape', 'menu-ui-button': 'button',
  'character-body-sheet': 'person', 'character-viseme-grid': 'grid',
  'character-pose': 'person', 'character-pose-derive': 'person',
  'character-video-key': 'film', 'character-voice-line': 'wave',
  'prop-cutout': 'layers', 'scene-backdrop': 'landscape',
};
const GROUP_GLYPH = {
  'game-chooser': 'tile', 'game-splash': 'title', 'shared-ui': 'button',
  puppet: 'person', pose: 'person', video: 'film', voice: 'wave',
  image: 'layers', backdrop: 'landscape',
};
function glyphHtml(template) {
  const paths = GLYPHS[TEMPLATE_GLYPH[template.id] || GROUP_GLYPH[template.group] || 'tile'] || GLYPHS.tile;
  return `<span class="generate-rail-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg></span>`;
}

// The two inspector panels remember whether they are open, per panel, across
// mounts and reloads. A studio that forgets you collapsed the guidance every
// time you pick a template is a studio you collapse it in forever.
const PANEL_STATE_KEY = 'qlobe.studio.generate.inspector';
function panelIsOpen(id, fallback) {
  try {
    const stored = localStorage.getItem(`${PANEL_STATE_KEY}.${id}`);
    return stored === null ? fallback : stored === '1';
  } catch { return fallback; }
}
function rememberPanel(id, open) {
  try { localStorage.setItem(`${PANEL_STATE_KEY}.${id}`, open ? '1' : '0'); } catch { /* private mode — fine */ }
}

// The submit label names what comes out, not the machinery: "Generate voice"
// reads back in the toast and the Review queue as the same noun.
const SUBMIT_LABEL = {
  'generate-voice': 'Generate voice', 'generate-image': 'Generate image', 'cutout-chain': 'Generate cutout',
};

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

// ============================================================================
// Pose-set model (§ pose-set panel) — six media objects, <set>-neutral plus
// five <set>-<pose> derives, reconstructed from the media list on every
// repaint rather than cached: a reload mid-run rebuilds the strip from the
// recipes already on disk, so there is no set-state map to fall out of sync.
// ============================================================================

const POSES = ['neutral', 'enter', 'notice', 'interact', 'react', 'celebrate'];
const POSE_TEMPLATES = ['character-pose', 'character-pose-derive'];
const POSE_NEUTRAL_LABEL = 'Neutral — the resting pose';

const poseMediaId = (setId, pose) => `${setId}-${pose}`;

// Per-pose labels and default action text ride on the registry (the derive
// template's `pose` field options), never client constants — a new pose needs
// only a new registry option. A missing option degrades to the bare pose id
// (label) or an empty string (action) rather than throwing.
function poseFieldOptions(registry) {
  const template = templateById(registry, 'character-pose-derive');
  const field = (template?.fields || []).find((entry) => entry.name === 'pose');
  return Array.isArray(field?.options) ? field.options : [];
}
function poseLabel(registry, pose) {
  if (pose === 'neutral') return POSE_NEUTRAL_LABEL;
  return poseFieldOptions(registry).find((option) => option.value === pose)?.label || pose;
}
function poseActionText(registry, pose) {
  return poseFieldOptions(registry).find((option) => option.value === pose)?.action || '';
}

// A media item belongs to set S when it ran one of the two pose templates AND
// is either S's neutral itself or was derived from it.
function belongsToSet(item, setId) {
  if (!POSE_TEMPLATES.includes(item?.recipe?.template?.id)) return false;
  const neutralId = `${setId}-neutral`;
  return item.id === neutralId || item.derivedFrom === neutralId;
}

function slotItem(mediaList, setId, pose) {
  const id = poseMediaId(setId, pose);
  return mediaList.find((item) => item.id === id && belongsToSet(item, setId)) || null;
}

// -> sorted set ids found in the media list. A neutral contributes its own id
// minus the suffix; a derived pose contributes its derivedFrom minus the suffix.
function discoverSets(mediaList) {
  const sets = new Set();
  for (const item of mediaList) {
    if (!POSE_TEMPLATES.includes(item?.recipe?.template?.id)) continue;
    if (item.id?.endsWith('-neutral')) sets.add(item.id.slice(0, -'-neutral'.length));
    else if (item.derivedFrom?.endsWith('-neutral')) sets.add(item.derivedFrom.slice(0, -'-neutral'.length));
  }
  return [...sets].sort();
}

// One set's six-slot state, rebuilt fresh every call. `poseJobs` is the
// workspace's own in-flight tracking set (jobs the tracker is polling for).
// Precedence per slot: running > extracted > accepted/review/failed-qa > empty.
function computePoseSet(mediaList, setId, registry, poseJobs) {
  const slots = POSES.map((pose) => {
    const id = poseMediaId(setId, pose);
    const item = slotItem(mediaList, setId, pose);
    const running = poseJobs.has(id);
    const extracted = item ? isCutoutChain(item) : false;
    let state;
    if (running) state = 'running';
    else if (!item) state = 'empty';
    else if (extracted) state = 'extracted';
    else if (item.qa?.status === 'accepted') state = 'accepted';
    else if (item.qa?.status === 'failed-qa') state = 'failed-qa';
    else state = 'review';
    return {
      pose, id, item, state, extracted,
      label: poseLabel(registry, pose),
      status: item?.qa?.status || null,
      asset: item ? mediaAssetUrl(item) : '',
    };
  });
  const anyRunning = slots.some((slot) => poseJobs.has(slot.id));
  const neutral = slots[0];
  const allExist = slots.every((slot) => !!slot.item);
  const notExtractedCount = slots.filter((slot) => slot.item && !slot.extracted).length;
  return {
    set: setId,
    slots,
    anyRunning,
    canDerive: !!neutral.item && neutral.item.qa?.status === 'accepted' && !anyRunning,
    canExtract: allExist && !anyRunning && notExtractedCount > 0,
    notExtractedCount,
    missing: slots.filter((slot) => !slot.item).map((slot) => slot.pose),
  };
}

// One slot card: a thumbnail button (the shell's existing [data-media-action]
// delegation opens the preview overlay), a QA pill, and the buttons this slot's
// state allows. An empty slot — including one whose job is merely queued —
// shows a muted placeholder with the id it would take, and no buttons: there is
// nothing yet for [data-media-action] to act on.
function poseSlotHtml(slot, serverAvailable) {
  const guard = serverAvailable ? '' : ' disabled title="needs the authoring server"';
  if (!slot.item) {
    return `
      <li class="pose-slot pose-slot-empty" data-pose-slot="${escapeHtml(slot.pose)}" data-state="${escapeHtml(slot.state)}">
        <span class="pose-slot-label">${escapeHtml(slot.label)}</span>
        <span class="pose-slot-id">${escapeHtml(slot.id)}</span>
        <div class="pose-slot-thumb pose-slot-placeholder">${slot.state === 'running' ? 'queued…' : 'not generated'}</div>
      </li>`;
  }
  const pill = qaPillFor(slot.status);
  const busyGuard = slot.state === 'running' ? ' disabled' : '';
  const buttons = [
    `<button type="button" class="ghost" data-media-action="regenerate" data-media-id="${escapeHtml(slot.id)}"${guard}${busyGuard}>Regenerate</button>`,
  ];
  // Accept follows the QA status, not the slot state: an extracted pose is still
  // waiting on a human (extraction resets qa to review precisely because the
  // asset changed), and the strip is where that decision is made.
  if (slot.status === 'review') {
    buttons.push(`<button type="button" data-media-action="accept" data-media-id="${escapeHtml(slot.id)}"${guard}${busyGuard}>Accept</button>`);
  }
  if (!slot.extracted) {
    buttons.push(`<button type="button" class="ghost" data-pose-action="extract-one" data-pose-slot-id="${escapeHtml(slot.id)}"${guard}${busyGuard}>Remove background</button>`);
  }
  return `
    <li class="pose-slot" data-pose-slot="${escapeHtml(slot.pose)}" data-state="${escapeHtml(slot.state)}">
      <span class="pose-slot-label">${escapeHtml(slot.label)}</span>
      <span class="pose-slot-id">${escapeHtml(slot.id)}</span>
      <button type="button" class="pose-slot-thumb-btn" data-media-action="preview" data-media-id="${escapeHtml(slot.id)}" title="Open full-screen preview">
        <span class="pose-slot-thumb" data-checker="${slot.extracted ? 'on' : 'off'}">${slot.asset ? `<img loading="lazy" src="${escapeHtml(slot.asset)}" alt="${escapeHtml(slot.id)}">` : ''}</span>
      </button>
      <span class="status-pill${pill.className ? ` ${pill.className}` : ''}">${escapeHtml(pill.text)}</span>
      <div class="pose-slot-actions">${buttons.join('')}</div>
    </li>`;
}

// The whole panel: head row (set input + Use + discovered-set chips), the two
// set-level actions, and the six-card strip. `data` is null until a set is
// active — the head row (and the naming hint) still renders so a fresh set can
// be named. Neither the Use button nor the chips touch the network, so they
// stay live even in a static preview; only the two set actions and the
// per-slot buttons carry the "needs the authoring server" guard.
function poseSetPanelHtml({ sets, activeSetId, data, serverAvailable }) {
  const chipsHtml = sets.length
    ? sets.map((id) => `<button type="button" class="ghost pose-set-chip${id === activeSetId ? ' on' : ''}" data-pose-set-chip="${escapeHtml(id)}">${escapeHtml(id)}</button>`).join('')
    : '<p class="hint">No pose sets yet — generate a resting pose to start one.</p>';
  const headHtml = `
    <div class="pose-set-head">
      <label class="gen-form-field">Set
        <input type="text" data-pose-set-input value="${escapeHtml(activeSetId || '')}"
          placeholder="e.g. dragon-pose" pattern="[a-z0-9]+(-[a-z0-9]+)*" autocomplete="off">
      </label>
      <button type="button" data-pose-action="use-set">Use</button>
      <div class="pose-set-chips">${chipsHtml}</div>
    </div>
    <p class="hint">Name the resting pose &lt;set&gt;-neutral; the five derived poses take &lt;set&gt;-&lt;pose&gt;.</p>`;

  if (!data) return `<h2 class="generate-panel-title">Pose set</h2>${headHtml}`;

  const deriveDisabled = !serverAvailable || !data.canDerive;
  const deriveTitle = !serverAvailable ? 'needs the authoring server'
    : data.canDerive ? ''
      : !data.slots[0].item ? 'generate the resting pose first'
        : data.slots[0].status !== 'accepted' ? 'accept the resting pose first'
          : 'a pose job is already running';

  const allExist = data.slots.every((slot) => !!slot.item);
  const extractDisabled = !serverAvailable || !data.canExtract;
  const extractTitle = !serverAvailable ? 'needs the authoring server'
    : data.canExtract ? ''
      : !allExist ? 'generate all six poses first'
        : data.anyRunning ? 'a pose job is already running'
          : 'every pose is already extracted';

  const actionsHtml = `
    <div class="pose-set-actions">
      <button type="button" data-pose-action="generate-remaining"${deriveDisabled ? ` disabled title="${escapeHtml(deriveTitle)}"` : ''}>Generate remaining 5 poses</button>
      <button type="button" data-pose-action="extract-set"${extractDisabled ? ` disabled title="${escapeHtml(extractTitle)}"` : ''}>Remove backgrounds (${data.notExtractedCount})</button>
    </div>`;

  const stripHtml = `<ol class="pose-set-strip">${data.slots.map((slot) => poseSlotHtml(slot, serverAvailable)).join('')}</ol>`;

  return `<h2 class="generate-panel-title">Pose set — ${escapeHtml(activeSetId)}</h2>${headHtml}${actionsHtml}${stripHtml}`;
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
  let activeSet = null;                  // pose-set panel — the set currently on the strip

  const templatesIn = (section) => (registry.templates || []).filter((template) => template.section === section);
  const selected = () => (selectedId ? templateById(registry, selectedId) : null);

  // ---- jobs ----------------------------------------------------------------
  // ONE poll loop for this workspace: generate submissions and the media
  // controller's regenerate jobs share it, so navigating away stops everything
  // with a single tracker.stop() in cleanup. poseJobs rides the same loop: it
  // is just the subset of tracked ids the pose-set panel needs to flag "running".
  const poseJobs = new Set();
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
      if (info?.mediaId) poseJobs.delete(info.mediaId);
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

  // Three zones down the centre (Feature J): the page head answers "what am I
  // making?", the form card "what should it say?", and Recent outputs "what came
  // back" — each a separate surface on the grey canvas rather than one
  // undifferentiated column of boxes.
  host.innerHTML = `
    <div class="workspace generate-workspace" data-workspace="generate">
      <div class="workspace-canvas generate-canvas">
        <div class="generate-body" data-body data-rail="on">
          <nav class="generate-rail" aria-label="Templates"></nav>
          <div class="generate-main">
            <div class="generate-pane" data-pane="catalogue">
              <div class="generate-stack">
                <header class="generate-head" data-page-head></header>
                <div data-form-host></div>
                <p class="generate-job-status" data-job-status hidden></p>
                <section class="pose-set generate-panel" data-pose-set-host hidden></section>
                <section class="generate-outputs generate-panel" data-outputs></section>
              </div>
            </div>
            <div class="generate-pane" data-pane="review" hidden></div>
          </div>
        </div>
      </div>
      <aside class="workspace-inspector generate-inspector">
        <details class="gen-inspector-panel" data-inspector-panel="details"${panelIsOpen('details', true) ? ' open' : ''}>
          <summary>
            <span class="gen-inspector-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/></svg></span>
            <span>Template details</span>
          </summary>
          <div class="gen-inspector-body" data-detail></div>
        </details>
        <details class="gen-inspector-panel" data-inspector-panel="guidance"${panelIsOpen('guidance', true) ? ' open' : ''}>
          <summary>
            <span class="gen-inspector-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7.2C10.4 5.9 8.4 5.4 4.5 5.4v12c3.9 0 5.9.5 7.5 1.8 1.6-1.3 3.6-1.8 7.5-1.8v-12c-3.9 0-5.9.5-7.5 1.8z"/><path d="M12 7.2V19"/></svg></span>
            <span>Generation guidance</span>
          </summary>
          <div class="gen-inspector-body">
            <p>Every generative call is a committed template — prompt, references, workflow and
            dimensions harvested from a proven run. Pick one, fill its slots, pick an art world, queue it.
            The server expands the prompt from the registry, so what ships is what was reviewed.</p>
            <p data-server-hint></p>
          </div>
        </details>
      </aside>
    </div>`;

  const body = host.querySelector('[data-body]');
  const rail = host.querySelector('.generate-rail');
  const pageHead = host.querySelector('[data-page-head]');
  const inspector = host.querySelector('.generate-inspector');
  const formHost = host.querySelector('[data-form-host]');
  const jobStatusNode = host.querySelector('[data-job-status]');
  const poseSetHost = host.querySelector('[data-pose-set-host]');
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
    renderRail(); renderPageHead(); renderForm(); renderOutputs(); renderPoseSet(); renderDetail(); syncNav();
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
    // Card = the group's mark, the template name in the display face, and the
    // operation type underneath as a quiet micro-label. The group heading above
    // carries the category, so the card never repeats it.
    const groupsHtml = groups.length ? groups.map((group) => `
      <div class="generate-rail-group">
        <h3>${escapeHtml(groupLabel(group.id))}</h3>
        ${group.templates.map((template) => `
          <button type="button" class="generate-rail-item${template.id === selectedId ? ' on' : ''}"
            data-template="${escapeHtml(template.id)}" aria-pressed="${template.id === selectedId ? 'true' : 'false'}">
            ${glyphHtml(template)}
            <span class="generate-rail-item-body">
              <strong>${escapeHtml(template.label || template.id)}</strong>
              <span class="generate-rail-op">${escapeHtml(template.kind || '')}</span>
            </span>
          </button>`).join('')}
      </div>`).join('') : '<p class="hint">No templates in this section yet.</p>';
    rail.innerHTML = `
      <div class="generate-rail-head">
        <strong>Templates</strong>
        ${selectedId ? '<button type="button" class="ghost" data-action="section-root">All</button>' : ''}
      </div>
      ${groupsHtml}`;
  }

  // ---- zone 1: page head ---------------------------------------------------
  // Title + one-line description + the kind as a small outlined badge. With no
  // template selected the section itself is the page, so its own hint is the
  // description — the head never blanks out.
  function renderPageHead() {
    const template = selected();
    const title = template ? (template.label || template.id) : SECTION_LABEL[activeSection];
    const description = template
      ? (template.description || SECTION_HINT[activeSection] || '')
      : (SECTION_HINT[activeSection] || '');
    pageHead.innerHTML = `
      <div class="generate-head-titles">
        <h1>${escapeHtml(title)}</h1>
        ${description ? `<p class="generate-head-desc">${escapeHtml(description)}</p>` : ''}
      </div>
      ${template?.kind ? `<span class="generate-kind-badge">${escapeHtml(template.kind)}</span>` : ''}`;
  }

  // ---- form ----------------------------------------------------------------
  function renderForm() {
    const template = selected();
    if (!template) {
      // The section's own explanation now lives in the page head, so this is
      // one instruction and nothing else.
      formHost.innerHTML = `<div class="generate-empty"><h2>Pick a template</h2>
        <p>Choose one from the list on the left to see what it needs.</p></div>`;
      return;
    }
    const choices = stylesFor(registry, template);
    const cosmetic = choices.length > 0 && styleIsCosmetic(registry, template);
    const note = cosmetic
      ? 'This template takes its look from the reference image, not from the art world — the style only tags the provenance record.'
      : '';
    formHost.innerHTML = templateFormHtml(template, activeStyle, formSeed.fields, {
      styles: registry.styles,
      refs: formSeed.refs,
      id: formSeed.id,
      seed: formSeed.seed,
      note,
      // The gallery chooser reads GET /api/studio/ref-candidates; in a static
      // preview "Choose…" disables and the chooser's free-text row is the way in.
      canBrowse: serverAvailable,
      submitLabel: SUBMIT_LABEL[template.kind] || 'Generate',
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
    outputsNode.hidden = !template;
    if (!template) { outputsNode.innerHTML = ''; return; }
    const list = mediaController.list().filter((item) => item.recipe?.template?.id === template.id);
    outputsNode.innerHTML = `
      <h2 class="generate-panel-title">Recent outputs
        ${list.length ? `<span class="generate-panel-count">${list.length}</span>` : ''}</h2>
      ${list.length
    ? `<div class="library-grid">${list.map(mediaItemHtml).join('')}</div>`
    : `<p class="generate-panel-empty">${serverAvailable
      ? 'Nothing generated from this template yet.'
      : 'Generated media needs the authoring server.'}</p>`}`;
  }

  // Review is its own page: same three-zone reading order, but zone 2 is the
  // whole queue rather than one form.
  function renderReview() {
    const head = (count) => `
      <header class="generate-head">
        <div class="generate-head-titles">
          <h1>Review</h1>
          <p class="generate-head-desc">${escapeHtml(SECTION_HINT.review)}</p>
        </div>
        ${count == null ? '' : `<span class="generate-kind-badge">${count} unassigned</span>`}
      </header>`;
    if (!serverAvailable) {
      reviewPane.innerHTML = `<div class="generate-stack">${head(null)}
        <div class="generate-empty"><h2>Review needs the authoring server</h2>
        <p>The queue reads shared/media/, which only the authoring server serves. Open Studio through it to
        accept, reject or assign.</p></div></div>`;
      return;
    }
    const list = mediaController.list();
    reviewPane.innerHTML = `<div class="generate-stack">${head(list.length)}
      ${list.length
    ? `<div class="library-grid">${list.map(mediaItemHtml).join('')}</div>`
    : `<div class="generate-empty"><h2>Nothing to review</h2>
       <p>Every generated asset has been accepted, assigned or rejected.</p></div>`}</div>`;
  }

  // ---- pose-set panel --------------------------------------------------
  // Shown only for the two pose templates, between the form and Recent
  // outputs. Rebuilt from mediaController.list() every call — see
  // computePoseSet()'s own note; this function owns none of that state.
  // Which set the panel lands on when nothing has been chosen yet: whatever the
  // form's id names (a half-typed `dragon-pose-neutral` is already the author
  // telling us the set), else the first set already on disk.
  function inferSet(mediaList) {
    const typed = (formHost.querySelector('[data-gen-param="id"]')?.value || '').trim();
    const match = POSES.map((pose) => `-${pose}`).find((suffix) => typed.endsWith(suffix));
    if (match && typed.length > match.length) return typed.slice(0, -match.length);
    return discoverSets(mediaList)[0] || null;
  }

  function renderPoseSet() {
    const template = selected();
    const show = !!template && POSE_TEMPLATES.includes(template.id);
    poseSetHost.hidden = !show;
    if (!show) { poseSetHost.innerHTML = ''; return; }
    const mediaList = mediaController.list();
    const sets = discoverSets(mediaList);
    if (!activeSet) activeSet = inferSet(mediaList);
    // The poll loop repaints this panel every ~2s while a pose job runs, so the
    // one editable control in it has to survive the repaint the way the template
    // form does — otherwise a set name typed mid-run is eaten mid-keystroke.
    const input = poseSetHost.querySelector('[data-pose-set-input]');
    const typed = input ? input.value : null;
    const hadFocus = !!input && document.activeElement === input;
    const data = activeSet ? computePoseSet(mediaList, activeSet, registry, poseJobs) : null;
    poseSetHost.innerHTML = poseSetPanelHtml({ sets, activeSetId: activeSet, data, serverAvailable });
    const next = poseSetHost.querySelector('[data-pose-set-input]');
    if (next && typed) next.value = typed;
    if (next && hadFocus) next.focus();
  }

  // Repaint everything media-shaped. Safe to call from the poll loop — it never
  // touches the form.
  function renderMedia() {
    renderOutputs();
    renderReview();
    renderPoseSet();
    syncNav();
  }

  // ---- inspector detail ----------------------------------------------------
  // Mono is reserved for the identifiers (id · kind · workflow · dimensions).
  // Provenance is prose and reads as prose — it is the sentence that explains
  // where this recipe came from, not a log line.
  function renderDetail() {
    const template = selected();
    if (activeSection === 'review') {
      detailNode.innerHTML = `<p>${escapeHtml(SECTION_HINT.review)}</p>`;
      return;
    }
    if (!template) {
      detailNode.innerHTML = `<p>${escapeHtml(SECTION_HINT[activeSection] || '')}</p>`;
      return;
    }
    const style = activeStyle ? registry.styles?.[activeStyle] : null;
    const size = template.width && template.height ? ` · ${template.width}×${template.height}` : '';
    detailNode.innerHTML = `
      <p class="gen-detail-ids">${escapeHtml(template.id)} · ${escapeHtml(template.kind || '')} · ${escapeHtml(template.workflow || '')}${escapeHtml(size)}</p>
      ${style ? `<p class="gen-detail-world">Art world <strong>${escapeHtml(style.label || activeStyle)}</strong>${style.status === 'proven' ? '' : ' <span class="gen-form-badge">unproven</span>'}</p>` : ''}
      ${template.provenance ? `<p>${escapeHtml(template.provenance)}</p>` : ''}`;
  }

  function renderAll() {
    renderRail(); renderPageHead(); renderForm(); renderOutputs(); renderReview(); renderPoseSet(); renderDetail();
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

  // ---- pose-set actions ------------------------------------------------
  // Makes `id` the active set. `fillFormId` is only true from the panel's Use
  // button (never from a chip or the debug setPoseSet): only a deliberate "use
  // this set" click should overwrite whatever the author has typed as the id.
  function makeActiveSet(id, { fillFormId = false } = {}) {
    const value = (id || '').trim();
    if (!value) return;
    activeSet = value;
    if (fillFormId) {
      const template = selected();
      if (template?.id === 'character-pose') {
        const idInput = formHost.querySelector('[data-gen-param="id"]');
        if (idInput) idInput.value = `${value}-neutral`;
      }
    }
    renderPoseSet();
  }

  // Enqueues the five derives against the accepted neutral, one at a time (not
  // Promise.all) so a 4xx on one pose is reported without cancelling the rest.
  // Skips any pose whose id already exists — re-running this after a partial
  // failure only fills the gaps.
  async function generateRemaining(setId) {
    if (!serverAvailable) { toast('Generate needs the authoring server.'); return { ok: false, error: 'no authoring server' }; }
    const set = (setId || '').trim();
    if (!set) return { ok: false, error: 'no active set' };
    const neutral = slotItem(mediaController.list(), set, 'neutral');
    if (!neutral) return { ok: false, error: 'no resting pose yet' };
    const character = neutral.recipe?.template?.fields?.character;
    const queued = [];
    const errors = [];
    for (const pose of POSES) {
      if (pose === 'neutral') continue;
      const id = poseMediaId(set, pose);
      if (mediaController.has(id)) continue;
      const fields = { pose, action: poseActionText(registry, pose) };
      if (character) fields.character = character;
      try {
        const result = await postGenerate({
          template: 'character-pose-derive',
          fields,
          params: { id, refs: { style: `media:${set}-neutral` } },
        });
        poseJobs.add(id);
        tracker.track(result.jobId, { label: `${poseLabel(registry, pose)} → ${id}`, mediaId: id });
        queued.push({ pose, id, jobId: result.jobId });
      } catch (error) {
        errors.push({ pose, id, error: error.message });
      }
    }
    if (queued.length) toast(`Queued ${queued.length} pose${queued.length === 1 ? '' : 's'} for ${set}.`);
    if (errors.length) toast(`${errors.length} pose${errors.length === 1 ? '' : 's'} could not be queued for ${set}.`, { error: true, duration: 7000 });
    renderPoseSet();
    return { ok: errors.length === 0, queued, errors };
  }

  // POSTs the extract endpoint for one media id. A 409 (already extracted) is
  // reported back as a skip, not an error — extractSet relies on that to keep
  // going rather than abort the rest of the set.
  async function extractOne(mediaId, { force = false } = {}) {
    if (!serverAvailable) { toast('Remove background needs the authoring server.'); return { ok: false, error: 'no authoring server' }; }
    if (!mediaId) return { ok: false, error: 'no media id' };
    try {
      const response = await fetch(`/api/studio/media/${encodeURIComponent(mediaId)}/extract`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(force ? { force: true } : {}),
      });
      if (response.status === 409) {
        toast(`${mediaId} — already extracted.`);
        return { ok: true, queued: [], skipped: [mediaId] };
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Could not extract ${mediaId}`);
      poseJobs.add(mediaId);
      tracker.track(body.jobId, { label: `Remove background · ${mediaId}`, mediaId });
      toast(`Removing background for ${mediaId}…`);
      renderPoseSet();
      return { ok: true, queued: [{ id: mediaId, jobId: body.jobId }], skipped: [] };
    } catch (error) {
      toast(error.message, { error: true, duration: 7000 });
      return { ok: false, error: error.message };
    }
  }

  // Extracts every slot in the set that exists and isn't extracted yet, through
  // extractOne so 409-as-skip and job tracking stay in one place.
  async function extractSet(setId) {
    if (!serverAvailable) { toast('Remove backgrounds needs the authoring server.'); return { ok: false, error: 'no authoring server' }; }
    const set = (setId || '').trim();
    if (!set) return { ok: false, error: 'no active set' };
    const mediaList = mediaController.list();
    const queued = [];
    const skipped = [];
    const errors = [];
    for (const pose of POSES) {
      const item = slotItem(mediaList, set, pose);
      if (!item || isCutoutChain(item)) continue;
      const result = await extractOne(item.id);
      if (!result.ok) { errors.push({ id: item.id, error: result.error }); continue; }
      queued.push(...(result.queued || []));
      skipped.push(...(result.skipped || []));
    }
    return { ok: errors.length === 0, queued, skipped, errors };
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

    const poseChip = event.target.closest('[data-pose-set-chip]');
    if (poseChip) { makeActiveSet(poseChip.dataset.poseSetChip); return; }
    const poseAction = event.target.closest('[data-pose-action]');
    if (poseAction) {
      const kind = poseAction.dataset.poseAction;
      if (kind === 'use-set') {
        const input = poseSetHost.querySelector('[data-pose-set-input]');
        makeActiveSet(input?.value, { fillFormId: true });
      } else if (kind === 'generate-remaining') {
        generateRemaining(activeSet).catch(fail);
      } else if (kind === 'extract-set') {
        extractSet(activeSet).catch(fail);
      } else if (kind === 'extract-one') {
        extractOne(poseAction.dataset.poseSlotId).catch(fail);
      }
      return;
    }

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

  // A pose set is a long job chain, and the studio is a page that gets reloaded
  // in the middle of one. The strip itself rebuilds from the recipes on disk,
  // but "running" lives only in this tab — so on mount, adopt whatever the
  // server still has in flight: the tracker picks the jobs back up, the slots
  // show as running again, and their cards settle normally. Failures are
  // ignored on purpose: a studio that cannot list jobs still browses fine.
  async function adoptRunningJobs() {
    if (!serverAvailable) return;
    try {
      const response = await fetch('/api/studio/jobs', { cache: 'no-store' });
      if (!response.ok) return;
      const body = await response.json();
      for (const job of (Array.isArray(body?.jobs) ? body.jobs : [])) {
        if (!job?.mediaId || !['queued', 'running'].includes(job.status)) continue;
        tracker.track(job.id, { label: `${job.kind} · ${job.mediaId}`, mediaId: job.mediaId });
        poseJobs.add(job.mediaId);
      }
    } catch { /* no job list — the panel simply shows the on-disk state */ }
  }

  // `toggle` does not bubble, so this listens in the capture phase on the aside.
  const onInspectorToggle = (event) => {
    const panel = event.target.closest?.('[data-inspector-panel]');
    if (panel) rememberPanel(panel.dataset.inspectorPanel, panel.open);
  };

  host.addEventListener('click', onHostClick);
  host.addEventListener('submit', onHostSubmit);
  inspector.addEventListener('toggle', onInspectorToggle, true);
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
    await adoptRunningJobs();
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

  // Pure state read for the pose-set panel — no id defaults to the active set.
  // Slots are trimmed to the debug-shape fields; `item` (the raw media record)
  // is deliberately left off so this stays plain JSON.
  const debugPoseSet = (setId) => {
    const id = (setId || activeSet || '').trim();
    if (!id) return null;
    const data = computePoseSet(mediaController.list(), id, registry, poseJobs);
    return {
      set: data.set,
      slots: data.slots.map((slot) => ({
        pose: slot.pose, id: slot.id, state: slot.state, status: slot.status,
        extracted: slot.extracted, asset: slot.asset,
      })),
      canDerive: data.canDerive,
      canExtract: data.canExtract,
      missing: data.missing,
    };
  };

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
    poseSet: (setId) => debugPoseSet(setId),
    setPoseSet: (setId) => { makeActiveSet(setId); return debugPoseSet(setId); },
    generateRemaining: (setId) => generateRemaining(setId || activeSet),
    extractSet: (setId) => extractSet(setId || activeSet),
    extractOne: (mediaId, opts) => extractOne(mediaId, opts),
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
    inspector.removeEventListener('toggle', onInspectorToggle, true);
    if (window.QLOBE_STUDIO_DEBUG?.workspace === 'generate') delete window.QLOBE_STUDIO_DEBUG;
  };
}
