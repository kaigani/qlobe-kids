// games.js — native Games workspace (WP-4a). A facet-browsable index over the
// root games.json registry, plus an in-workspace per-game dashboard: manifest
// summary, uses[] existence check, validation findings, what the game
// consumes (reverse usage), a playtest link, and — for config.json games only
// — a small editable Content panel.
//
// PREVIEWS (Feature L): a game's card and its dashboard header show the same
// picture a shared link shows — `games/<id>/assets/og-image.jpg`, the 1200×630
// splash shot produced by tools/pipeline/capture_og_images.mjs — plus the
// `shareTitle`/`description` link copy from that game's game.json. This is
// deliberately NOT the hub tile (that stays the catalog's job, in Library);
// the Games workspace previews what the world sees when the link is shared.
// The image path is deterministic, so cards render it optimistically and swap
// in a designed placeholder on error; descriptions are hydrated from the
// per-game manifests in a lazy, cancellable pass after the grid paints.
//
// mount(host, ctx) -> cleanup, matching the shell contract in studio.js and
// the pattern established by workspaces/library.js and workspaces/production.js.
// Games owns its own dashboard (a second in-workspace view, not openWorkspace)
// because a game isn't itself a Stage/Props/Music document. Degrades to a
// static preview: browse, the manifest, uses[] existence and consumes all
// work from the on-disk files alone; only validation and config.json editing
// need the authoring server.

import { serverStatus, readDocument, saveDocument } from '../api.js';

const GAMES_JSON_URL = new URL('../../../../games.json', import.meta.url);
const USAGE_INDEX_URL = new URL('../../../data/usage-index.json', import.meta.url);

const STATUS_OPTIONS = ['live', 'beta', 'in-design', 'proposed', 'archived'];
const SEVERITY_RANK = { error: 0, warn: 1, info: 2 };

const escapeHtml = (value) => {
  const node = document.createElement('span'); node.textContent = String(value ?? ''); return node.innerHTML;
};

// ---- link preview (og:image) ------------------------------------------------
// Same file the game's own <meta property="og:image"> points at.
const REPO_ROOT_URL = new URL('../../../../', import.meta.url);
const ogImageUrl = (id) => new URL(`games/${id}/assets/og-image.jpg`, REPO_ROOT_URL).href;

// Designed fallback for a game with no capture yet — inline SVG in the same
// idiom as Library's placeholders, so it re-tones with the token block instead
// of showing a broken-image box.
const OG_PLACEHOLDER = `<div class="library-thumb-fill" data-placeholder>
  <svg class="library-thumb-svg" viewBox="0 0 120 63" role="img" aria-hidden="true" focusable="false">
    <rect x="6" y="8" width="108" height="47" fill="var(--sunken)" stroke="var(--muted-soft)" stroke-width="2"/>
    <rect x="30" y="24" width="60" height="15" rx="7" fill="var(--muted-soft)"/>
    <g fill="var(--card)"><rect x="41" y="30" width="12" height="3"/><rect x="45.5" y="25.5" width="3" height="12"/>
    <circle cx="72" cy="29" r="3"/><circle cx="79" cy="35" r="3"/></g>
  </svg></div>`;

const previewHtml = (game) => `<img class="games-preview-img" loading="lazy" decoding="async"
  src="${escapeHtml(ogImageUrl(game.id))}" data-og="${escapeHtml(game.id)}"
  alt="${escapeHtml(`${game.title || game.id} splash screen`)}">`;

function statusPill(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'live') return { text: value, className: 'good' };
  if (value === 'archived') return { text: value, className: 'bad' };
  return { text: value || '—', className: '' };
}

function usePill(status) {
  if (status === 'ok') return { text: 'present', className: 'good' };
  if (status === 'missing') return { text: 'missing', className: 'bad' };
  return { text: 'check failed', className: '' };
}

function serverRequiredHint(title, detail) {
  return `<p class="hint">${escapeHtml(title)} needs the authoring server. ${escapeHtml(detail)}</p>`;
}

export async function mount(host, { params, toast, openWorkspace, setNav, setParam }) {
  let destroyed = false;
  let openToken = 0; // guards openGame() against a superseded resolution (backToBrowse or a newer openGame)
  let games = [];        // the raw games.json games[] array, unmodified
  let gameRows = [];      // games + a computed `engine` field, used for browse/facets
  let categories = [];    // games.json categories[]
  let usageIndex = null;  // shared/data/usage-index.json, forward+reverse+engines
  let serverAvailable = false;

  let view = 'browse';    // 'browse' | 'dashboard'
  let currentDashboard = null; // the assembled dashboard record for the open game
  const validationCache = new Map(); // gameId -> {status:'idle'|'loading'|'done'|'error', report?, error?}
  const manifestCache = new Map();   // gameId -> game.json object (or null when unreadable)
  let hydrateToken = 0;              // guards the lazy description pass against a re-render

  const activeFacets = { category: 'all', status: 'all', engine: 'all', q: '' };

  host.innerHTML = `
    <div class="workspace games-workspace" data-workspace="games">
      <div class="workspace-canvas library-canvas" data-canvas></div>
      <aside class="workspace-inspector">
        <div class="panel-section" data-browse-filters>
          <div class="sidebar-filters">
            <label>Category<select data-facet="category"><option value="all">All categories</option></select></label>
            <label>Status<select data-facet="status">
              <option value="all">All statuses</option>
              ${STATUS_OPTIONS.map((s) => `<option value="${s}">${s}</option>`).join('')}
            </select></label>
            <label>Engine<select data-facet="engine"><option value="all">All engines</option></select></label>
            <label class="library-search">Search<input type="search" data-facet="q" placeholder="search id or title…" autocomplete="off"></label>
          </div>
        </div>
        <div class="panel-section">
          <h2>Games</h2>
          <p class="hint">Browse the games.json registry — filter by category, status or engine, or search by
          id/title. Click a card to open its dashboard: manifest, uses[] existence, validation, what it consumes,
          and a playtest link. config.json games get an editable Content panel; config.js games are read-only here.</p>
          <p class="hint" data-server-hint></p>
        </div>
      </aside>
    </div>`;

  const canvas = host.querySelector('[data-canvas]');
  const serverHint = host.querySelector('[data-server-hint]');
  const browseFilters = host.querySelector('[data-browse-filters]');
  const facetEl = (name) => host.querySelector(`[data-facet="${name}"]`);

  // ---- data loading -------------------------------------------------------
  async function loadServerFlags() {
    try { await serverStatus(); serverAvailable = true; } catch { serverAvailable = false; }
  }

  async function loadRegistry() {
    const response = await fetch(GAMES_JSON_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error('could not load games.json');
    const body = await response.json();
    categories = Array.isArray(body.categories) ? body.categories.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [];
    games = Array.isArray(body.games) ? body.games : [];
  }

  // Mirrors library.js's loadUsageIndex verbatim: prefer the live server
  // endpoint (which can be refreshed), fall back to the static registry file
  // so browse + consumes still work in a static preview.
  async function loadUsageIndex() {
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
      console.warn('Games: usage index unavailable', error);
      usageIndex = null;
    }
  }

  function engineFor(game) {
    return usageIndex?.forward?.[game.id]?.engine || game.engine || null;
  }

  function buildRows() {
    gameRows = games.map((game) => ({ ...game, engine: engineFor(game) }));
  }

  function categoryTitle(id) {
    return categories.find((c) => c.id === id)?.title || id || '—';
  }

  function categoryOptionsHtml() {
    return categories.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.title)}</option>`).join('');
  }

  function engineOptionsHtml() {
    const engines = usageIndex?.engines ? Object.keys(usageIndex.engines).sort() : [];
    return engines.map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join('');
  }

  // ---- facet filtering ------------------------------------------------------
  function filter(facets = activeFacets) {
    const q = (facets.q || '').trim().toLowerCase();
    return gameRows.filter((game) => {
      if (facets.category !== 'all' && game.category !== facets.category) return false;
      if (facets.status !== 'all' && game.status !== facets.status) return false;
      if (facets.engine !== 'all' && game.engine !== facets.engine) return false;
      if (q && !(game.id.toLowerCase().includes(q) || (game.title || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }

  // ---- uses[] existence check ------------------------------------------------
  // A use[] path may be a file (…/audio.js) or a directory root (…/objects/,
  // trailing slash). Under `python3 -m http.server` a directory with no
  // index.html still resolves — 200 via autoindex, or 403 on a stricter
  // static host — so we treat 200 OR 403 as "present" and only a genuine 404
  // as "missing"; any other outcome (network error, etc.) is "check failed".
  async function checkUseExists(path) {
    try {
      const response = await fetch(new URL(`../../../../${path}`, import.meta.url), { method: 'GET', cache: 'no-store' });
      if (response.ok || response.status === 403) return 'ok';
      return 'missing';
    } catch {
      return 'error';
    }
  }

  // ---- per-game manifest ------------------------------------------------------
  // game.json is the canonical home of a game's link copy (shareTitle +
  // description), so browse reads it too. Cached per id; the dashboard asks for
  // a fresh copy so a server-side write (status flip, config save) is never read
  // back stale.
  async function loadManifest(id, { fresh = false } = {}) {
    if (!fresh && manifestCache.has(id)) return manifestCache.get(id);
    try {
      const response = await fetch(new URL(`../../../../games/${id}/game.json`, import.meta.url), { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const manifest = await response.json();
      manifestCache.set(id, manifest);
      return manifest;
    } catch (error) {
      if (!manifestCache.has(id)) manifestCache.set(id, null);
      throw error;
    }
  }

  // ---- per-game dashboard assembly -------------------------------------------
  async function buildDashboard(id) {
    const registryEntry = games.find((g) => g.id === id) || null;
    let manifest = null, manifestError = null;
    try {
      manifest = await loadManifest(id, { fresh: true });
    } catch (error) {
      manifestError = error.message;
    }

    const usesList = manifest?.uses || registryEntry?.uses || [];
    const uses = await Promise.all(usesList.map(async (path) => ({ path, status: await checkUseExists(path) })));

    const consumesRaw = usageIndex?.forward?.[id] || {};
    const consumes = {
      characters: consumesRaw.characters || [],
      modules: consumesRaw.modules || [],
      assets: consumesRaw.assets || [],
      packs: consumesRaw.packs || [],
    };
    const engine = consumesRaw.engine || registryEntry?.engine || manifest?.engine || null;

    // config.json detection: a game is either a config.json game (content
    // editable in the Studio) or a config.js game (a JS module authored in a
    // Claude Code session, read-only here). We probe by fetching config.json
    // directly so this works in a static preview too — response.ok means it
    // exists; we keep that parsed body as a read-only preview for when the
    // server is down.
    let isConfigJson = false, configPreview = null, configDoc = null, configDocError = null;
    try {
      const response = await fetch(new URL(`../../../../games/${id}/config.json`, import.meta.url), { cache: 'no-store' });
      if (response.ok) { isConfigJson = true; configPreview = await response.json().catch(() => null); }
    } catch { /* no config.json — this is a config.js game */ }

    if (isConfigJson && serverAvailable) {
      try {
        configDoc = await readDocument(`games/${id}/config.json`); // canonical, editable, mutated in place on save
      } catch (error) {
        configDocError = error.message;
      }
    }

    return { id, registryEntry, manifest, manifestError, uses, consumes, engine, isConfigJson, configPreview, configDoc, configDocError };
  }

  // ---- validation (on-demand, lazy, cached per game id) ------------------------
  // POST /api/studio/validate {target} -> { ok, report: { counts, findings } }.
  function groupFindings(findings) {
    const groups = new Map();
    for (const finding of findings) {
      const key = `${finding.format} · ${finding.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(finding);
    }
    const rows = [];
    for (const [key, items] of groups) {
      const shown = items.filter((f) => f.severity !== 'info')
        .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
      if (!shown.length) continue;
      rows.push({ key, items: shown, hasError: shown.some((f) => f.severity === 'error') });
    }
    rows.sort((a, b) => (a.hasError === b.hasError) ? 0 : (a.hasError ? -1 : 1));
    return rows;
  }

  async function runValidation(id) {
    if (!serverAvailable) { toast('Validation requires the authoring server (static preview).'); return; }
    validationCache.set(id, { status: 'loading' });
    renderDashboard();
    try {
      const response = await fetch('/api/studio/validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Validation failed');
      validationCache.set(id, { status: 'done', report: body.report || {} });
    } catch (error) {
      validationCache.set(id, { status: 'error', error: error.message });
      toast(error.message, { error: true, duration: 7000 });
    } finally {
      if (!destroyed) renderDashboard();
    }
  }

  function validationSectionHtml(id) {
    if (!serverAvailable) {
      return `<div class="panel-section"><h3>Validation</h3>
        ${serverRequiredHint('Validation', 'It runs tools/validate/run.mjs on the authoring server.')}</div>`;
    }
    const v = validationCache.get(id);
    if (!v || v.status === 'idle') {
      return `<div class="panel-section"><h3>Validation</h3>
        <p class="hint">Not checked yet.</p>
        <button type="button" data-action="run-validate" data-game="${escapeHtml(id)}">Run validation</button></div>`;
    }
    if (v.status === 'loading') {
      return `<div class="panel-section"><h3>Validation</h3><p class="hint">Validating…</p></div>`;
    }
    if (v.status === 'error') {
      return `<div class="panel-section"><h3>Validation</h3><p class="hint">${escapeHtml(v.error)}</p>
        <button type="button" data-action="run-validate" data-game="${escapeHtml(id)}">Retry</button></div>`;
    }
    const counts = v.report.counts || {};
    const summary = `<p class="hint">${counts.error || 0} error${counts.error === 1 ? '' : 's'} ·
      ${counts.warn || 0} warning${counts.warn === 1 ? '' : 's'}</p>`;
    const groups = groupFindings(v.report.findings || []);
    const rowsHtml = groups.length ? `<div class="production-triage-list">${groups.map((group) => `
      <div class="production-triage">
        <strong>${escapeHtml(group.key)}</strong>
        ${group.items.map((f) => `<p class="hint">${f.severity === 'error' ? 'ERROR' : 'WARN'} — ${escapeHtml(f.message)}</p>`).join('')}
      </div>`).join('')}</div>` : '<p class="hint">No errors or warnings.</p>';
    return `<div class="panel-section"><h3>Validation</h3>${summary}${rowsHtml}
      <button type="button" class="ghost" data-action="run-validate" data-game="${escapeHtml(id)}">Re-check</button></div>`;
  }

  // ---- content editor (config.json games only) ---------------------------------
  function configPreviewLinesHtml(doc) {
    const voiceEntries = Object.entries(doc?.voice || {}).filter(([, v]) => typeof v === 'string');
    const modes = Array.isArray(doc?.modes) ? doc.modes : [];
    return `
      ${voiceEntries.length ? `<p class="hint"><strong>voice:</strong> ${voiceEntries.map(([k, v]) => `${escapeHtml(k)} = "${escapeHtml(v)}"`).join(' · ')}</p>` : ''}
      ${modes.length ? `<p class="hint"><strong>modes:</strong> ${modes.map((m) => escapeHtml(m.title || m.id)).join(' · ')}</p>` : ''}`;
  }

  function contentSectionHtml(d) {
    if (!d.isConfigJson) {
      return `<div class="panel-section"><h3>Content</h3>
        <p class="hint">config.js game — read-only in the studio (JS modules are authored in Claude Code sessions).</p></div>`;
    }
    if (!serverAvailable) {
      return `<div class="panel-section"><h3>Content</h3>
        <p class="hint">config.json exists but editing needs the authoring server. Showing it read-only.</p>
        ${d.configPreview ? configPreviewLinesHtml(d.configPreview) : '<p class="hint">Could not read config.json.</p>'}</div>`;
    }
    if (d.configDocError) {
      return `<div class="panel-section"><h3>Content</h3><p class="hint">Could not load config.json: ${escapeHtml(d.configDocError)}</p></div>`;
    }
    const doc = d.configDoc || {};
    const voiceEntries = Object.entries(doc.voice || {}).filter(([, v]) => typeof v === 'string');
    const modes = Array.isArray(doc.modes) ? doc.modes : [];
    return `<div class="panel-section">
      <h3>Content</h3>
      <p class="hint">Editing games/${escapeHtml(d.id)}/config.json — voice lines and mode titles. Unknown fields are preserved on save.</p>
      ${voiceEntries.length ? voiceEntries.map(([key, value]) => `
        <label>voice.${escapeHtml(key)}<input type="text" data-voice-key="${escapeHtml(key)}" value="${escapeHtml(value)}"></label>`).join('')
        : '<p class="hint">No string voice lines in this config.</p>'}
      ${modes.length ? modes.map((mode, i) => `
        <div class="row">
          <label>mode id<input type="text" value="${escapeHtml(mode.id || '')}" disabled></label>
          <label>mode title<input type="text" data-mode-title-index="${i}" value="${escapeHtml(mode.title || '')}"></label>
        </div>`).join('') : '<p class="hint">No modes[] array in this config.</p>'}
      <button type="button" class="save" data-action="save-config" data-game="${escapeHtml(d.id)}">Save</button>
    </div>`;
  }

  // ---- status flip (registry + game.json, validation-gated server-side) --------
  const GAME_STATUSES = ['live', 'beta', 'in-design', 'proposed', 'archived'];

  function statusSectionHtml(d) {
    const current = d.registryEntry?.status || d.manifest?.status || 'in-design';
    if (!serverAvailable) {
      return `<div class="panel-section"><h3>Status</h3>
        ${serverRequiredHint('Status changes', 'The authoring server writes games.json and game.json together.')}</div>`;
    }
    return `<div class="panel-section"><h3>Status</h3>
      <p class="hint">Setting live or beta runs validation first — errors block the change.
        Live games count on the hub; beta games appear with an in-progress chip.</p>
      <div class="sidebar-session">
        <select data-status-select>${GAME_STATUSES.map((s) =>
          `<option value="${s}"${s === current ? ' selected' : ''}>${s}</option>`).join('')}</select>
        <button type="button" data-action="set-status" data-game="${escapeHtml(d.id)}">Set status</button>
      </div></div>`;
  }

  async function setStatus(button, id) {
    const select = canvas.querySelector('[data-status-select]');
    if (!select) return;
    const status = select.value;
    button.disabled = true;
    toast(`Setting ${id} to ${status}…`);
    try {
      const response = await fetch('/api/studio/game-status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Status change failed');
      if (currentDashboard?.registryEntry) currentDashboard.registryEntry.status = status;
      if (currentDashboard?.manifest) currentDashboard.manifest.status = status;
      const listed = games.find((g) => g.id === id);
      if (listed) listed.status = status;
      buildRows(); // browse cards render from the enriched copies — rebuild them
      toast(`${id} is now ${status}.`);
    } catch (error) {
      toast(error.message, { error: true, duration: 7000 });
    } finally {
      button.disabled = false;
      if (!destroyed) renderDashboard();
    }
  }

  // ---- dashboard rendering ------------------------------------------------------
  function usesListHtml(uses) {
    if (!uses.length) return '<p class="hint">No uses[] listed.</p>';
    return `<div class="list">${uses.map((u) => {
      const pill = usePill(u.status);
      return `<div class="list-item"><span></span><span>${escapeHtml(u.path)}</span>
        <span class="status-pill${pill.className ? ` ${pill.className}` : ''}">${escapeHtml(pill.text)}</span></div>`;
    }).join('')}</div>`;
  }

  function consumesLineHtml(label, items) {
    return `<p class="hint"><strong>${escapeHtml(label)}:</strong> ${items.length ? items.map(escapeHtml).join(' · ') : 'none'}</p>`;
  }

  function renderDashboard() {
    const d = currentDashboard;
    if (!d) { canvas.innerHTML = `<div class="empty-state"><div><h1>No game open</h1></div></div>`; return; }
    if (!d.manifest) {
      canvas.innerHTML = `<div class="empty-state"><div><h1>Could not load game.json</h1>
        <p class="hint">${escapeHtml(d.manifestError || 'Unknown error')}</p></div></div>`;
      return;
    }
    const m = d.manifest;
    const status = statusPill(m.status || d.registryEntry?.status);
    const age = m.age ? `${m.age.min ?? '?'}–${m.age.max ?? '?'}` : '—';
    const goals = Array.isArray(m.learningGoals) ? m.learningGoals : [];
    const modes = Array.isArray(m.modes) ? m.modes : [];

    canvas.innerHTML = `
      <div class="panel-section games-hero">
        <div class="games-hero-thumb">
          ${previewHtml({ id: d.id, title: m.title || d.id })}
        </div>
        <div class="games-hero-body">
          <h3 class="games-hero-title">${escapeHtml(m.shareTitle || m.title || d.id)}</h3>
          <p class="hint">${escapeHtml(d.id)} · ${escapeHtml(categoryTitle(m.category))} ·
            <span class="status-pill${status.className ? ` ${status.className}` : ''}">${escapeHtml(status.text)}</span> ·
            age ${escapeHtml(age)}</p>
          ${m.description ? `<p class="games-hero-desc">${escapeHtml(m.description)}</p>` : ''}
          ${goals.length ? `<p class="hint"><strong>learning goals:</strong></p><ul>${goals.map((g) => `<li class="hint">${escapeHtml(g)}</li>`).join('')}</ul>` : ''}
        </div>
      </div>
      ${statusSectionHtml(d)}
      <div class="panel-section">
        <h3>Modes</h3>
        ${modes.length ? `<div class="list">${modes.map((mode) => `
          <div class="list-item"><span></span><span>${escapeHtml(mode.title || mode.id)} <span class="hint">${escapeHtml(mode.id || '')}</span></span>
            <span class="hint">${escapeHtml(mode.skill || '')}</span></div>`).join('')}</div>` : '<p class="hint">No modes[] listed.</p>'}
      </div>
      <div class="panel-section">
        <h3>Uses</h3>
        ${usesListHtml(d.uses)}
      </div>
      ${validationSectionHtml(d.id)}
      <div class="panel-section">
        <h3>Consumes</h3>
        ${consumesLineHtml('characters', d.consumes.characters)}
        ${consumesLineHtml('modules', d.consumes.modules)}
        ${consumesLineHtml('assets', d.consumes.assets)}
        ${consumesLineHtml('packs', d.consumes.packs)}
      </div>
      <div class="panel-section">
        <h3>Playtest</h3>
        <p class="hint">engine: ${escapeHtml(d.engine || 'unknown')} — this engine installs
          <code>window.QLOBE_DEBUG</code> at runtime (verify via playtest; not checked from here).</p>
        <a class="button-link" href="/games/${encodeURIComponent(d.id)}/" target="_blank" rel="noopener">Play ▸</a>
      </div>
      ${contentSectionHtml(d)}`;
    wirePreviewFallbacks();
  }

  // ---- browse rendering -----------------------------------------------------
  // Image-led, matching Library's card anatomy: preview well (og splash shot +
  // category badge), body (title, id, link description), foot (status, engine).
  // data-type="game" borrows Library's green type badge and cover-fit rule.
  function cardHtml(game) {
    const pill = statusPill(game.status);
    return `
      <article class="library-card" data-type="game" data-card="${escapeHtml(game.id)}" tabindex="0" role="button"
        aria-label="Open ${escapeHtml(game.title || game.id)}">
        <div class="library-thumb games-thumb">
          <span class="library-type">${escapeHtml(categoryTitle(game.category))}</span>
          ${previewHtml(game)}
        </div>
        <div class="library-card-body">
          <h3 class="library-card-title">${escapeHtml(game.title || game.id)}</h3>
          <p class="library-scope">${escapeHtml(game.id)}</p>
          <p class="games-card-desc" data-desc="${escapeHtml(game.id)}"></p>
        </div>
        <div class="library-card-foot">
          <span class="status-pill${pill.className ? ` ${pill.className}` : ''}">${escapeHtml(pill.text)}</span>
          <span class="status-pill">${escapeHtml(game.engine || 'no engine')}</span>
        </div>
      </article>`;
  }

  // A game whose splash has never been captured degrades to the designed
  // placeholder rather than a broken-image box (Library's rule, same shape).
  function wirePreviewFallbacks() {
    for (const image of canvas.querySelectorAll('[data-og]')) {
      image.addEventListener('error', () => {
        const well = image.closest('.library-thumb, .games-hero-thumb');
        if (!well) return;
        image.remove();
        well.insertAdjacentHTML('beforeend', OG_PLACEHOLDER);
      }, { once: true });
    }
  }

  // Lazy, cancellable description pass: the grid paints immediately from the
  // registry, then each card's game.json fills in its link copy.
  async function hydrateDescriptions(rows) {
    const token = ++hydrateToken;
    const queue = rows.slice();
    const worker = async () => {
      while (queue.length) {
        if (destroyed || token !== hydrateToken) return;
        const game = queue.shift();
        let manifest = null;
        try { manifest = await loadManifest(game.id); } catch { manifest = null; }
        if (destroyed || token !== hydrateToken) return;
        const node = canvas.querySelector(`[data-desc="${game.id}"]`);
        if (node) node.textContent = manifest?.description || '';
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }

  function renderBrowse() {
    const filtered = filter();
    if (!filtered.length) {
      hydrateToken++;   // nothing on screen to fill in
      canvas.innerHTML = `<div class="empty-state"><div><h1>No matches</h1><p class="hint">Try clearing a facet or the search box.</p></div></div>`;
    } else {
      canvas.innerHTML = `<div class="library-grid">${filtered.map(cardHtml).join('')}</div>`;
      wirePreviewFallbacks();
      hydrateDescriptions(filtered).catch((error) => console.warn('Games: description hydration failed', error));
    }
    browseNav();
  }

  // ---- shell nav (tabs/crumbs/count) --------------------------------------
  function browseNav() {
    const n = filter().length;
    setNav({
      tabs: [{ id: 'registry', label: 'Registry', onClick: () => { if (view !== 'browse') backToBrowse(); } }],
      activeTab: 'registry',
      crumbs: [{ label: 'Games' }],
      count: `${n} game${n === 1 ? '' : 's'}`,
    });
  }

  function dashboardNav() {
    const title = currentDashboard?.manifest?.title || currentDashboard?.registryEntry?.title || currentDashboard?.id || '';
    setNav({
      tabs: [
        { id: 'registry', label: 'Registry', onClick: () => backToBrowse() },
        { id: 'game', label: title, onClick: () => { if (currentDashboard) openGame(currentDashboard.id).catch(fail); } },
      ],
      activeTab: 'game',
      crumbs: [
        { label: 'Games', onClick: () => backToBrowse() },
        { label: title },
      ],
    });
  }

  function setView(next) {
    view = next;
    browseFilters.hidden = view !== 'browse';
    if (view === 'browse') renderBrowse();      // renderBrowse() calls browseNav()
    else { renderDashboard(); dashboardNav(); }
  }

  // ---- open a game's dashboard ------------------------------------------------
  async function openGame(id) {
    const token = ++openToken;
    const record = await buildDashboard(id);
    if (destroyed || token !== openToken) return record; // superseded by backToBrowse or another openGame
    currentDashboard = record;
    if (!validationCache.has(id)) validationCache.set(id, { status: 'idle' });
    setParam('game', id);
    setView('dashboard');
    return record;
  }

  function backToBrowse() {
    openToken++;               // supersede any pending openGame
    currentDashboard = null;
    setParam('game', null);    // drop ?game so a remount won't reopen the dashboard
    setView('browse');
  }

  const fail = (error) => { console.error(error); toast(error.message, { error: true, duration: 7000 }); };

  // ---- wiring ---------------------------------------------------------------
  function wire() {
    facetEl('category').onchange = (e) => { activeFacets.category = e.target.value; renderBrowse(); };
    facetEl('status').onchange = (e) => { activeFacets.status = e.target.value; renderBrowse(); };
    facetEl('engine').onchange = (e) => { activeFacets.engine = e.target.value; renderBrowse(); };
    let searchTimer = null;
    facetEl('q').oninput = (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { activeFacets.q = e.target.value; renderBrowse(); }, 120);
    };

    canvas.addEventListener('click', (event) => {
      const card = event.target.closest('[data-card]');
      if (card) { openGame(card.dataset.card).catch(fail); return; }

      const actionButton = event.target.closest('[data-action]');
      if (!actionButton) return;
      if (actionButton.dataset.action === 'run-validate') {
        runValidation(actionButton.dataset.game);
      } else if (actionButton.dataset.action === 'save-config') {
        saveConfig(actionButton, actionButton.dataset.game);
      } else if (actionButton.dataset.action === 'set-status') {
        setStatus(actionButton, actionButton.dataset.game);
      }
    });
    canvas.addEventListener('keydown', (event) => {
      const card = event.target.closest('[data-card]');
      if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openGame(card.dataset.card).catch(fail); }
    });

    // Editable Content fields mutate currentDashboard.configDoc in place as the
    // user types — Save just persists whatever is currently in memory, and
    // every field the form doesn't render (unknown to this pragmatic editor)
    // stays untouched on the same object.
    canvas.addEventListener('input', (event) => {
      const doc = currentDashboard?.configDoc;
      if (!doc) return;
      const voiceInput = event.target.closest('[data-voice-key]');
      if (voiceInput) {
        doc.voice = doc.voice || {};
        doc.voice[voiceInput.dataset.voiceKey] = voiceInput.value;
        return;
      }
      const modeInput = event.target.closest('[data-mode-title-index]');
      if (modeInput && Array.isArray(doc.modes)) {
        const mode = doc.modes[Number(modeInput.dataset.modeTitleIndex)];
        if (mode) mode.title = modeInput.value;
      }
    });
  }

  async function saveConfig(button, id) {
    const doc = currentDashboard?.id === id ? currentDashboard.configDoc : null;
    if (!doc) { toast('Nothing to save.', { error: true }); return; }
    button.disabled = true; button.textContent = 'saving…';
    try {
      await saveDocument(`games/${id}/config.json`, doc);
      toast(`Saved games/${id}/config.json.`);
    } catch (error) {
      toast(error.message, { error: true, duration: 7000 });
    } finally {
      if (!destroyed) { button.disabled = false; button.textContent = 'Save'; }
    }
  }

  // ---- boot ---------------------------------------------------------------
  try {
    await loadServerFlags();
    await loadRegistry();
    await loadUsageIndex();
    if (destroyed) return () => {};
    buildRows();
    facetEl('category').innerHTML += categoryOptionsHtml();
    facetEl('engine').innerHTML += engineOptionsHtml();
    serverHint.textContent = serverAvailable
      ? 'Authoring server connected — validation and config.json editing are live.'
      : 'Static preview — browse, manifest, uses[] existence and consumes all work from disk; validation and config.json editing need the authoring server.';
    wire();
    const initialGame = params.get('game');
    if (initialGame && games.some((g) => g.id === initialGame)) await openGame(initialGame);
    else { if (initialGame) setParam('game', null); setView('browse'); }
  } catch (error) {
    console.error(error);
    canvas.innerHTML = `<div class="empty-state"><div><h1>Games unavailable</h1><p>${escapeHtml(error.message)}</p></div></div>`;
    toast(`Could not load Games: ${error.message}`, { error: true, duration: 7000 });
  }

  // Debug surface for browser automation (WP-4a gate).
  window.QLOBE_STUDIO_DEBUG = {
    workspace: 'games',
    listGames: () => games.slice(),
    filterGames: (facets) => filter({ ...activeFacets, ...facets }),
    openGame: (id) => openGame(id),
    getDashboard: async (id) => ({ ...(await buildDashboard(id)), validation: validationCache.get(id) || null }),
    // Feature L: link-preview surface (og splash shot + game.json link copy).
    previewUrl: (id) => ogImageUrl(id),
    getManifest: (id) => loadManifest(id).catch(() => null),
  };

  return () => {
    destroyed = true;
    if (window.QLOBE_STUDIO_DEBUG?.workspace === 'games') delete window.QLOBE_STUDIO_DEBUG;
  };
}
