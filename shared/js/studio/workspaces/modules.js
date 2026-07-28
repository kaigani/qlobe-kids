// modules.js — native Modules workspace (WP-4c). Maps §5.2 of
// docs/qlobe-studio-v2.md: a browse/document/test-launch surface over the four
// kinds of shared code modules — engines, services, stage modules, templates.
//
// HARD BOUNDARY (the whole point of this file): Modules are read / browse /
// document / test-launch ONLY. Module code (shared/js/**) is authored in
// Claude Code sessions, never in the GUI. This workspace renders ZERO editing
// affordances — no save, no document writes, no uploads. It only reads
// shared/js/engines/README.md and the usage index, and links out to source
// files and *.test.html harnesses in new tabs.
//
// mount(host, ctx) -> cleanup, matching the shell contract in studio.js and
// the pattern established by workspaces/library.js. Degrades to a static
// preview (no authoring server) exactly like library.js: usage counts come
// from shared/data/usage-index.json read directly off disk. Nothing here
// requires the server at all — even the live pass is just a nicer usage-index
// source.

import { serverStatus } from '../api.js';

const USAGE_INDEX_URL = new URL('../../../data/usage-index.json', import.meta.url);
const ENGINES_README_URL = new URL('../../engines/README.md', import.meta.url);

// ---- curated module inventories -------------------------------------------
// There is no directory-listing endpoint and this is a client-side module, so
// the four inventories below are curated constants mirroring the canonical
// lists in docs/qlobe-studio-v2.md §3.1 and the repo layout. They must be kept
// in sync BY HAND whenever an engine/service/stage module/template is added,
// renamed, or removed on disk.

// 13 game engines. `harness:true` marks the 10 that ship a *.test.html
// harness under shared/js/engines/ — the others have no harness link.
// `art` is listed alongside the engines (it lives in shared/js/engines/) but
// is an engine-SUPPORT resolver, not a playable game engine — flagged via
// `support:true` so the UI never presents it as one of the 13.
const ENGINES = [
  { id: 'choose-one', harness: true },
  { id: 'match-pairs', harness: true },
  { id: 'sort-into-bins', harness: true },
  { id: 'sequence-order', harness: true },
  { id: 'tap-count', harness: true },
  { id: 'pattern-continue', harness: true },
  { id: 'trace-path', harness: true },
  { id: 'build-assemble', harness: true },
  { id: 'observe-journal', harness: true },
  { id: 'coach-timer', harness: true },
  { id: 'story-stones', harness: false },
  { id: 'puppet-theater', harness: false },
  { id: 'puppet-band', harness: false },
  { id: 'art', harness: false, support: true },
];

// shared/js/*.js top-level services.
const SERVICES = [
  'audio', 'speech', 'sfx', 'tap', 'voice-clips', 'content', 'music',
  'musical-canvas',
];

// shared/js/stage/*.js stage modules.
const STAGE_MODULES = [
  'stage', 'puppet', 'theater', 'lipsync', 'mouth', 'pose-sprite',
  'prop-pack', 'scene-pack', 'music-sync', 'spline', 'tween', 'particles', 'art-pixi',
];

// templates/* game scaffolds. No consumer counts — these are starting points,
// not imported modules.
const TEMPLATES = [
  { id: 'stub-game', title: 'Stub Game', description: 'Engine-based config game scaffold — index.html mounts an archetype engine; config.js supplies the content. This IS most games.' },
  { id: 'game-family', title: 'Game Family', description: 'Hand-coded skeleton for a game whose mini-GDD needs behavior no engine has — index.html + js/main.js written by hand.' },
];

const KIND_LABEL = { engine: 'Engine', service: 'Service', stage: 'Stage', template: 'Template' };

const escapeHtml = (value) => {
  const node = document.createElement('span'); node.textContent = String(value ?? ''); return node.innerHTML;
};

// ---- shared/js/engines/README.md — minimal, honest markdown reading -------
// We only ever DISPLAY README prose, never invent it. Two things are pulled
// out: the one-liner module list (the fenced block with no language tag near
// the top of the file) and the named "## " sections referenced in the WP-4c
// brief (Engine module contract / Config shape / Required debug hook /
// Placeholder art refs).

function parseEnginesReadme(text) {
  const oneLiners = new Map();
  const listBlock = text.match(/```\n([\s\S]*?)```/); // the plain (unlabeled) fence = the module list
  if (listBlock) {
    for (const line of listBlock[1].split('\n')) {
      const match = line.match(/^\s*([a-z-]+)\.js\s+(.+)$/);
      if (match) oneLiners.set(match[1], match[2].trim());
    }
  }
  const sections = new Map();
  for (const part of text.split(/^## /m).slice(1)) {
    const breakAt = part.indexOf('\n');
    const title = (breakAt === -1 ? part : part.slice(0, breakAt)).trim();
    const body = breakAt === -1 ? '' : part.slice(breakAt + 1).trim();
    sections.set(title, body);
  }
  return { oneLiners, sections };
}

function findSection(sections, titleStartsWith) {
  if (sections.has(titleStartsWith)) return sections.get(titleStartsWith);
  for (const [key, body] of sections) { if (key.startsWith(titleStartsWith)) return body; }
  return null;
}

// Tiny, honest markdown-to-HTML: strips fenced-code markers (keeping the code
// text inline) and turns blank-line-separated chunks into <p class="hint">
// paragraphs. No invented structure — just enough to read the README prose
// without a markdown dependency.
function renderMarkdownLite(markdown) {
  if (!markdown) return '';
  const text = markdown.replace(/```\w*\n?/g, '').trim();
  return text.split(/\n\n+/).filter(Boolean)
    .map((para) => `<p class="hint">${escapeHtml(para).replace(/\n/g, '<br>')}</p>`).join('');
}

export async function mount(host, { params, toast, openWorkspace, setNav, setParam }) {
  let destroyed = false;
  let modules = [];          // the enriched flat list of {id, kind, count, harness?, source, ...}
  let usageIndex = null;     // shared/data/usage-index.json
  let engineDoc = null;      // parsed shared/js/engines/README.md, or null if unreadable
  let serverAvailable = false;
  let selectedId = null;

  const facets = { kind: 'all', q: '' };

  host.innerHTML = `
    <div class="workspace library-workspace" data-workspace="modules">
      <div class="workspace-canvas library-canvas" data-grid></div>
      <aside class="workspace-inspector">
        <div class="panel-section">
          <div class="sidebar-filters">
            <label>Kind<select data-facet="kind">
              <option value="all">All kinds</option>
              <option value="engine">Engines</option>
              <option value="service">Services</option>
              <option value="stage">Stage</option>
              <option value="template">Templates</option>
            </select></label>
            <label class="library-search">Search<input type="search" data-facet="q" placeholder="search by module name…" autocomplete="off"></label>
          </div>
        </div>
        <div class="panel-section">
          <h2>Modules</h2>
          <p class="hint">Engines, services, stage modules and templates — the shared code every game is built
          from. <strong>Modules are read-only here: engines, services and stage code are authored in Claude Code
          sessions, never in the studio. Browse contracts and launch test harnesses.</strong></p>
          <p class="hint" data-server-hint></p>
        </div>
        <div data-detail></div>
      </aside>
    </div>`;

  const grid = host.querySelector('[data-grid]');
  const serverHint = host.querySelector('[data-server-hint]');
  const detailHost = host.querySelector('[data-detail]');
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
      console.warn('Modules: usage index unavailable', error);
      usageIndex = null;
    }
  }

  async function loadEnginesReadme() {
    try {
      const response = await fetch(ENGINES_README_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error('could not load engines/README.md');
      engineDoc = parseEnginesReadme(await response.text());
    } catch (error) {
      console.warn('Modules: engines README unavailable', error);
      engineDoc = null;
    }
  }

  // ---- build the enriched, flat module list -------------------------------
  function buildModules() {
    const engineUsage = usageIndex?.engines || {};
    const reverseModules = usageIndex?.reverse?.modules || {};

    const engines = ENGINES.map((entry) => ({
      id: entry.id,
      kind: 'engine',
      support: !!entry.support,
      harness: entry.harness ? `/shared/js/engines/${entry.id}.test.html` : null,
      source: `/shared/js/engines/${entry.id}.js`,
      count: engineUsage[entry.id]?.count ?? 0,
      games: engineUsage[entry.id]?.games || [],
    }));

    const services = SERVICES.map((name) => ({
      id: name,
      kind: 'service',
      source: `/shared/js/${name}.js`,
      count: (reverseModules[`shared/js/${name}.js`] || []).length,
      games: reverseModules[`shared/js/${name}.js`] || [],
    }));

    const stage = STAGE_MODULES.map((name) => ({
      id: name,
      kind: 'stage',
      source: `/shared/js/stage/${name}.js`,
      count: (reverseModules[`shared/js/stage/${name}.js`] || []).length,
      games: reverseModules[`shared/js/stage/${name}.js`] || [],
    }));

    const templates = TEMPLATES.map((entry) => ({
      id: entry.id,
      kind: 'template',
      description: entry.description,
      source: `/templates/${entry.id}/index.html`,
    }));

    modules = [...engines, ...services, ...stage, ...templates];
  }

  // ---- facet filtering -----------------------------------------------------
  function filter(activeFacets = facets) {
    const q = (activeFacets.q || '').trim().toLowerCase();
    return modules.filter((mod) => {
      if (activeFacets.kind !== 'all' && mod.kind !== activeFacets.kind) return false;
      if (q && !mod.id.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  // ---- documentation lookup (engines only have a README; say so honestly) --
  function documentationHtml(mod) {
    if (mod.kind !== 'engine') {
      return '<p class="hint">No README section — browse the source.</p>';
    }
    if (!engineDoc) {
      return '<p class="hint">Could not load shared/js/engines/README.md — browse the source.</p>';
    }
    if (mod.id === 'art') {
      const artSection = findSection(engineDoc.sections, 'Placeholder art refs');
      if (!artSection) return '<p class="hint">No README section — browse the source.</p>';
      return `<p class="hint">art.js resolves placeholder art refs (emoji:, shared:, char:, text:, swatch:) to
        renderable nodes for every engine — an engine-support resolver, not a playable game engine.</p>
        ${renderMarkdownLite(artSection)}`;
    }
    const oneLiner = engineDoc.oneLiners.get(mod.id);
    const contract = findSection(engineDoc.sections, 'Engine module contract');
    const configShape = findSection(engineDoc.sections, 'Config shape');
    const debugHook = findSection(engineDoc.sections, 'Required debug hook');
    if (!oneLiner && !contract && !configShape && !debugHook) {
      return '<p class="hint">No README section — browse the source.</p>';
    }
    return [
      oneLiner ? `<p class="hint"><strong>${escapeHtml(mod.id)}</strong> — ${escapeHtml(oneLiner)}</p>` : '',
      contract ? `<h4>Engine module contract</h4>${renderMarkdownLite(contract)}` : '',
      configShape ? `<h4>Config shape</h4>${renderMarkdownLite(configShape)}` : '',
      debugHook ? `<h4>Required debug hook</h4>${renderMarkdownLite(debugHook)}` : '',
    ].join('');
  }

  // ---- rendering -------------------------------------------------------
  function cardHtml(mod) {
    const supportBadge = mod.support ? '<span class="library-tier">support resolver</span>' : '';
    const subtitle = mod.kind === 'template' ? escapeHtml(mod.description || '') : `source: ${escapeHtml(mod.source)}`;
    const countPillHtml = mod.kind === 'template' ? '' : `<span class="status-pill" data-usage>used by ${mod.count}</span>`;
    const harnessLink = mod.harness ? `<a class="button-link" href="${mod.harness}" target="_blank" rel="noopener">Launch harness</a>` : '';
    return `
      <article class="library-card" data-card="${escapeHtml(mod.id)}" data-kind="${escapeHtml(mod.kind)}" tabindex="0" role="button"
        aria-label="Open ${escapeHtml(mod.id)} (${escapeHtml(KIND_LABEL[mod.kind] || mod.kind)})">
        <div class="library-card-head">
          <span class="library-type">${escapeHtml(KIND_LABEL[mod.kind] || mod.kind)}</span>
          ${supportBadge}
        </div>
        <h3 class="library-card-title">${escapeHtml(mod.id)}</h3>
        <p class="hint">${subtitle}</p>
        <div class="library-card-foot">
          ${countPillHtml}
          ${harnessLink}
        </div>
      </article>`;
  }

  function updateNav() {
    const n = filter().length;
    const crumbs = selectedId
      ? [{ label: 'Modules', onClick: () => selectModule(null) }, { label: selectedId }]
      : [{ label: 'Modules' }];
    setNav({ crumbs, count: `${n} module${n === 1 ? '' : 's'}` });
  }

  function render() {
    const filtered = filter();
    if (!filtered.length) {
      grid.innerHTML = '<div class="empty-state"><div><h1>No matches</h1><p class="hint">Try a different kind or search term.</p></div></div>';
      updateNav();
      return;
    }
    grid.innerHTML = `<div class="library-grid">${filtered.map(cardHtml).join('')}</div>`;
    for (const card of grid.querySelectorAll('[data-card]')) {
      card.addEventListener('click', (event) => {
        if (event.target.closest('a')) return; // let harness/source links open their own tab
        selectModule(card.dataset.card);
      });
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectModule(card.dataset.card); }
      });
    }
    updateNav();
  }

  // ---- detail (selection only — never an editor) ---------------------------
  function detailHtml(mod) {
    if (!mod) {
      return `<div class="panel-section">
        <h3>Detail</h3>
        <p class="hint">Select a module in the grid to see its contract, consumers and source link.</p>
      </div>`;
    }
    const kindNote = mod.support ? ' · engine-support resolver (not a playable game engine)' : '';
    const usageBlock = mod.kind === 'template'
      ? `<p class="hint">${escapeHtml(mod.description || '')}</p>`
      : `<p class="hint">used by ${mod.count} game${mod.count === 1 ? '' : 's'}${mod.games?.length ? ` — ${mod.games.map(escapeHtml).join(', ')}` : ''}</p>`;
    const links = `<p class="hint">
        <a class="button-link" href="${mod.source}" target="_blank" rel="noopener">View source</a>
        ${mod.harness ? ` <a class="button-link" href="${mod.harness}" target="_blank" rel="noopener">Launch test harness</a>` : ''}
      </p>`;
    return `
      <div class="panel-section">
        <h3>${escapeHtml(mod.id)}</h3>
        <p class="hint">${escapeHtml(KIND_LABEL[mod.kind] || mod.kind)}${kindNote}</p>
        ${usageBlock}
        ${links}
      </div>
      <div class="panel-section">
        <h3>Documentation</h3>
        ${documentationHtml(mod)}
      </div>`;
  }

  function selectModule(id) {
    selectedId = id;
    const mod = id ? modules.find((item) => item.id === id) : null;
    detailHost.innerHTML = detailHtml(mod);
    updateNav();
  }

  // ---- facet wiring ------------------------------------------------------
  function wireFacets() {
    facetEl('kind').onchange = (e) => { facets.kind = e.target.value; render(); };
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
    await loadEnginesReadme();
    buildModules();
    if (destroyed) return () => {};
    serverHint.textContent = serverAvailable
      ? 'Authoring server connected — everything here is still static: read-only browsing, no editing. Consumer counts come from the on-disk usage index.'
      : 'Static preview — no server needed here. Consumer counts come from the on-disk usage index (shared/data/usage-index.json).';
    detailHost.innerHTML = detailHtml(null);
    wireFacets();
    render();
  } catch (error) {
    console.error(error);
    grid.innerHTML = `<div class="empty-state"><div><h1>Modules unavailable</h1><p>${escapeHtml(error.message)}</p></div></div>`;
    toast(`Could not load Modules: ${error.message}`, { error: true, duration: 7000 });
  }

  // Debug surface for browser automation (WP-4c gate).
  window.QLOBE_STUDIO_DEBUG = {
    workspace: 'modules',
    listModules: (kind) => (kind ? modules.filter((mod) => mod.kind === kind) : modules.slice()),
    getModule: (id) => modules.find((mod) => mod.id === id) || null,
  };

  return () => {
    destroyed = true;
    if (window.QLOBE_STUDIO_DEBUG?.workspace === 'modules') delete window.QLOBE_STUDIO_DEBUG;
  };
}
