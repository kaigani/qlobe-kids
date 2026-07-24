// production.js — native Production workspace (WP-3c). Maps §5.4 of
// docs/qlobe-studio-v2.md: the job queue, the validation dashboard, the
// completeness/usage reports, and the pipeline runbook — processes and
// status, not content categories.
//
// mount(host, ctx) -> cleanup, matching the shell contract in studio.js and
// the pattern established by workspaces/library.js. Four stacked panels
// switched by a tab bar in the tools row: Jobs, Validate, Completeness,
// Usage Index. Degrades to a static preview (no authoring server): the job
// queue, validation, completeness and usage-index refresh are unavailable,
// but the usage-index panel still reads shared/data/usage-index.json
// directly and renders read-only, exactly like library.js.

import { serverStatus } from '../api.js';

const USAGE_INDEX_URL = new URL('../../../data/usage-index.json', import.meta.url);

const JOB_STATUSES = ['queued', 'running', 'completed', 'failed', 'interrupted', 'cancelled'];
const JOB_KINDS = ['story-scene', 'extract', 'voice', 'transcription'];
const SEVERITY_RANK = { error: 0, warn: 1, info: 2 };
const TAB_HINT = {
  jobs: 'Every generation job the authoring server has queued or run — story scenes, extractions, voice takes, transcriptions. Polls every ~2s while this workspace is open.',
  validate: 'Runs the validator suite (tools/validate/run.mjs) over one target id or the whole repo, and groups findings by subject the way the CLI does.',
  completeness: 'The 8-rigged / 5-anim-only character census: parts, viseme heads, voice lines per character.',
  usage: 'Freshness of shared/data/usage-index.json — which games use which shared object, and when the index was last generated.',
};

const escapeHtml = (value) => {
  const node = document.createElement('span'); node.textContent = String(value ?? ''); return node.innerHTML;
};

function statusPill(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'completed') return { text: value, className: 'good' };
  if (value === 'failed') return { text: value, className: 'bad' };
  if (value === 'interrupted' || value === 'cancelled') return { text: value, className: 'muted' };
  return { text: value || 'unknown', className: '' };
}

function serverRequiredEmptyState(title, detail) {
  return `<div class="empty-state"><div><h1>${escapeHtml(title)} needs the server</h1>
    <p class="hint">${escapeHtml(detail)} Not available in this static preview — open Studio through the
    authoring server to use it.</p></div></div>`;
}

export async function mount(host, { toast }) {
  let destroyed = false;
  let serverAvailable = false;
  let activeTab = 'jobs';

  // ---- job queue state ----
  let jobs = [];
  let jobsError = null;
  const jobFilters = { status: 'all', kind: 'all' };
  let jobsPollTimer = null;

  // ---- validation state ----
  let validationReport = null;
  let validationError = null;
  let validating = false;

  // ---- completeness state ----
  let completenessList = null;
  let completenessError = null;
  let loadingCompleteness = false;

  // ---- usage index state ----
  let usageIndex = null;
  let usageSource = null; // 'server' | 'static' | null
  let usageError = null;
  let refreshingUsage = false;

  host.innerHTML = `
    <div class="workspace production-workspace" data-workspace="production">
      <div class="workspace-tools">
        <div class="production-tabs" role="tablist">
          <button type="button" data-tab="jobs" class="on" aria-selected="true">Job Queue</button>
          <button type="button" data-tab="validate" aria-selected="false">Validation</button>
          <button type="button" data-tab="completeness" aria-selected="false">Completeness</button>
          <button type="button" data-tab="usage" aria-selected="false">Usage Index</button>
        </div>
        <div class="row" data-tab-tools="jobs">
          <label>Status<select data-job-status>
            <option value="all">All statuses</option>
            ${JOB_STATUSES.map((s) => `<option value="${s}">${s}</option>`).join('')}
          </select></label>
          <label>Type<select data-job-kind>
            <option value="all">All types</option>
            ${JOB_KINDS.map((k) => `<option value="${k}">${k}</option>`).join('')}
          </select></label>
          <span class="status-pill" data-job-count>0 jobs</span>
        </div>
        <div class="row" data-tab-tools="validate" hidden>
          <label>Target<input type="text" data-validate-target placeholder="blank = full sweep" autocomplete="off"></label>
          <button type="button" data-action="run-validate">Run validation</button>
        </div>
        <div class="row" data-tab-tools="completeness" hidden>
          <button type="button" class="ghost" data-action="refresh-completeness">Refresh</button>
        </div>
        <div class="row" data-tab-tools="usage" hidden>
          <button type="button" class="ghost" data-action="refresh-usage">Refresh</button>
        </div>
      </div>
      <div class="workspace-canvas production-canvas" data-canvas>
        <section data-panel="jobs"></section>
        <section data-panel="validate" hidden></section>
        <section data-panel="completeness" hidden></section>
        <section data-panel="usage" hidden></section>
      </div>
      <aside class="workspace-inspector">
        <div class="panel-section">
          <h2>Production</h2>
          <p class="hint">Processes and status, not content categories — the job queue, the validation
          dashboard, completeness/usage reports, and the pipeline runbook.</p>
          <p class="hint" data-server-hint></p>
        </div>
        <div class="panel-section">
          <h3>This tab</h3>
          <p class="hint" data-tab-hint></p>
        </div>
      </aside>
    </div>`;

  const canvas = host.querySelector('[data-canvas]');
  const panels = {
    jobs: host.querySelector('[data-panel="jobs"]'),
    validate: host.querySelector('[data-panel="validate"]'),
    completeness: host.querySelector('[data-panel="completeness"]'),
    usage: host.querySelector('[data-panel="usage"]'),
  };
  const jobCountPill = host.querySelector('[data-job-count]');
  const jobStatusSelect = host.querySelector('[data-job-status]');
  const jobKindSelect = host.querySelector('[data-job-kind]');
  const validateTargetInput = host.querySelector('[data-validate-target]');
  const serverHint = host.querySelector('[data-server-hint]');
  const tabHint = host.querySelector('[data-tab-hint]');

  // ---- tabs ---------------------------------------------------------------
  function setTab(tab) {
    if (!panels[tab]) return;
    activeTab = tab;
    for (const button of host.querySelectorAll('[data-tab]')) {
      const on = button.dataset.tab === activeTab;
      button.classList.toggle('on', on);
      button.setAttribute('aria-selected', String(on));
    }
    for (const [name, panel] of Object.entries(panels)) panel.hidden = name !== activeTab;
    for (const tools of host.querySelectorAll('[data-tab-tools]')) tools.hidden = tools.dataset.tabTools !== activeTab;
    tabHint.textContent = TAB_HINT[activeTab] || '';
  }

  // ---- job queue ------------------------------------------------------------
  // GET /api/studio/jobs -> { ok, jobs: [ job, ... ] }, newest-first.
  async function fetchJobs() {
    if (!serverAvailable || destroyed) return;
    try {
      const response = await fetch('/api/studio/jobs', { cache: 'no-store' });
      if (!response.ok) throw new Error(`no job queue endpoint (HTTP ${response.status})`);
      const body = await response.json();
      jobs = Array.isArray(body?.jobs) ? body.jobs : [];
      jobsError = null;
    } catch (error) {
      jobsError = error.message;
    }
    if (!destroyed) renderJobs();
  }

  function filteredJobs() {
    return jobs.filter((job) => {
      if (jobFilters.status !== 'all' && job.status !== jobFilters.status) return false;
      if (jobFilters.kind !== 'all' && job.kind !== jobFilters.kind) return false;
      return true;
    });
  }

  function jobRowHtml(job) {
    const pill = statusPill(job.status);
    const progress = (job.progress != null && job.total != null) ? ` (${job.progress}/${job.total})` : '';
    const meta = [job.workflow, job.character, job.storyId, job.voice].filter(Boolean).map(escapeHtml).join(' · ');
    return `
      <div class="list-item production-job" data-job-row="${escapeHtml(job.id ?? '')}">
        <span class="status-pill${pill.className ? ` ${pill.className}` : ''}">${escapeHtml(pill.text)}</span>
        <div class="production-job-body">
          <strong>${escapeHtml(job.kind || 'job')}${job.id ? ` <span class="hint">#${escapeHtml(job.id)}</span>` : ''}</strong>
          ${meta ? `<span class="hint">${meta}</span>` : ''}
          ${job.message ? `<span class="hint">${escapeHtml(job.message)}${progress}</span>` : ''}
          ${job.status === 'failed' && job.error ? `<span class="hint production-error">${escapeHtml(job.error)}</span>` : ''}
          ${job.interrupted ? `<span class="hint">interrupted${job.resumable ? ' · resumable' : ''}</span>` : ''}
        </div>
        ${job.status === 'queued' ? `<button type="button" class="ghost" data-cancel-job="${escapeHtml(job.id ?? '')}">cancel</button>` : ''}
      </div>`;
  }

  function renderJobs() {
    const list = filteredJobs();
    jobCountPill.textContent = `${list.length} job${list.length === 1 ? '' : 's'}`;
    if (!serverAvailable) {
      panels.jobs.innerHTML = serverRequiredEmptyState('Job queue', "The job queue is served by the authoring server's job system.");
      return;
    }
    const errorBanner = jobsError ? `<p class="hint production-error">${escapeHtml(jobsError)}</p>` : '';
    if (!list.length) {
      panels.jobs.innerHTML = `${errorBanner}<div class="empty-state"><div><h1>No jobs</h1>
        <p class="hint">${jobs.length ? 'Nothing matches the current filters.' : 'Nothing queued yet.'}</p></div></div>`;
      return;
    }
    panels.jobs.innerHTML = `${errorBanner}<div class="list production-job-list">${list.map(jobRowHtml).join('')}</div>`;
  }

  // POST /api/studio/jobs/<id>/cancel (no body) -> refetch on success.
  async function cancelJob(id) {
    try {
      const response = await fetch(`/api/studio/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { toast(body.error || `Could not cancel ${id}`, { error: true, duration: 7000 }); return; }
      await fetchJobs();
    } catch (error) {
      toast(error.message, { error: true, duration: 7000 });
    }
  }

  // ---- validation -----------------------------------------------------------
  // POST /api/studio/validate {} | {target} -> { ok, report: { ok, target, subjectsRun, counts, findings } }.
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
      if (!shown.length) continue; // suppress info-only groups, same as the CLI sweep
      rows.push({ key, items: shown, hasError: shown.some((f) => f.severity === 'error') });
    }
    rows.sort((a, b) => (a.hasError === b.hasError) ? 0 : (a.hasError ? -1 : 1));
    return rows;
  }

  async function runValidation(target) {
    if (!serverAvailable) { toast('Validation requires the authoring server (static preview).'); return null; }
    validating = true; validationError = null; renderValidation();
    try {
      const payload = target ? { target } : {};
      const response = await fetch('/api/studio/validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Validation failed');
      validationReport = body.report || null;
      return validationReport;
    } catch (error) {
      validationError = error.message;
      validationReport = null;
      toast(error.message, { error: true, duration: 7000 });
      return null;
    } finally {
      validating = false;
      if (!destroyed) renderValidation();
    }
  }

  function renderValidation() {
    if (!serverAvailable) {
      panels.validate.innerHTML = serverRequiredEmptyState('Validation', 'Validation runs tools/validate/run.mjs on the authoring server.');
      return;
    }
    if (validating) {
      panels.validate.innerHTML = `<div class="empty-state"><div><h1>Validating…</h1><p class="hint">Running the validator sweep.</p></div></div>`;
      return;
    }
    if (validationError) {
      panels.validate.innerHTML = `<div class="empty-state"><div><h1>Validation failed</h1><p class="hint">${escapeHtml(validationError)}</p></div></div>`;
      return;
    }
    if (!validationReport) {
      panels.validate.innerHTML = `<div class="empty-state"><div><h1>No report yet</h1><p class="hint">Run validation to see findings, grouped by subject (format · id), errors first.</p></div></div>`;
      return;
    }
    const counts = validationReport.counts || {};
    const summary = `<p class="hint">${counts.error || 0} error${counts.error === 1 ? '' : 's'} ·
      ${counts.warn || 0} warning${counts.warn === 1 ? '' : 's'} across
      ${validationReport.subjectsRun || 0} subject${validationReport.subjectsRun === 1 ? '' : 's'}
      ${validationReport.target ? `· target: ${escapeHtml(validationReport.target)}` : '· full sweep'}</p>`;
    const groups = groupFindings(validationReport.findings || []);
    if (!groups.length) {
      panels.validate.innerHTML = `<div class="panel-section">${summary}<p class="hint">No errors or warnings.</p></div>`;
      return;
    }
    const rowsHtml = groups.map((group) => `
      <div class="production-triage">
        <strong>${escapeHtml(group.key)}</strong>
        ${group.items.map((f) => `<p class="hint">${f.severity === 'error' ? 'ERROR' : 'WARN'} — ${escapeHtml(f.message)}</p>`).join('')}
      </div>`).join('');
    panels.validate.innerHTML = `<div class="panel-section">${summary}</div><div class="production-triage-list">${rowsHtml}</div>`;
  }

  // ---- completeness -----------------------------------------------------------
  // GET /api/studio/completeness?type=character -> { ok, type, characters: [...] }.
  async function loadCompleteness() {
    if (!serverAvailable) { completenessList = null; completenessError = null; renderCompleteness(); return; }
    loadingCompleteness = true; renderCompleteness();
    try {
      const response = await fetch('/api/studio/completeness?type=character', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not load completeness');
      completenessList = Array.isArray(body.characters) ? body.characters : [];
      completenessError = null;
    } catch (error) {
      completenessError = error.message;
      completenessList = null;
    } finally {
      loadingCompleteness = false;
      if (!destroyed) renderCompleteness();
    }
  }

  function completenessRowHtml(entry) {
    const parts = entry.parts || {};
    const visemes = entry.visemeHeads || {};
    return `
      <tr>
        <td>${escapeHtml(entry.id)}</td>
        <td>${escapeHtml(entry.tier || '—')}</td>
        <td><span class="status-pill${entry.complete ? ' good' : ' bad'}">${entry.complete ? 'complete' : 'incomplete'}</span></td>
        <td>${parts.have ?? '—'}/${parts.need ?? '—'}</td>
        <td>${visemes.have ?? '—'}/${visemes.need ?? '—'}</td>
        <td>${entry.voiceLines ?? '—'}</td>
      </tr>`;
  }

  function renderCompleteness() {
    if (!serverAvailable) {
      panels.completeness.innerHTML = serverRequiredEmptyState('Completeness', 'The completeness census reads shared/characters/* on disk via the authoring server.');
      return;
    }
    if (loadingCompleteness) {
      panels.completeness.innerHTML = `<div class="empty-state"><div><h1>Loading…</h1></div></div>`;
      return;
    }
    if (completenessError) {
      panels.completeness.innerHTML = `<div class="empty-state"><div><h1>Completeness unavailable</h1><p class="hint">${escapeHtml(completenessError)}</p></div></div>`;
      return;
    }
    if (!completenessList || !completenessList.length) {
      panels.completeness.innerHTML = `<div class="empty-state"><div><h1>No characters</h1></div></div>`;
      return;
    }
    panels.completeness.innerHTML = `<div class="production-table-wrap"><table class="production-table">
      <thead><tr><th>id</th><th>tier</th><th>status</th><th>parts</th><th>viseme heads</th><th>voice lines</th></tr></thead>
      <tbody>${completenessList.map(completenessRowHtml).join('')}</tbody>
    </table></div>`;
  }

  // ---- usage index -----------------------------------------------------------
  // GET /api/studio/usage-index -> { ok, index }; ?refresh=1 re-runs the generator first.
  // Static preview falls back to shared/data/usage-index.json directly, read-only.
  async function loadUsageIndex({ refresh = false } = {}) {
    if (refresh) {
      if (!serverAvailable) { toast('Refreshing the usage index requires the authoring server.'); return; }
      refreshingUsage = true; renderUsage();
      try {
        const response = await fetch('/api/studio/usage-index?refresh=1', { cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Could not refresh the usage index');
        if (!body?.index) throw new Error('malformed usage-index response');
        usageIndex = body.index; usageSource = 'server'; usageError = null;
        toast('Usage index refreshed.');
      } catch (error) {
        usageError = error.message;
        toast(error.message, { error: true, duration: 7000 });
      } finally {
        refreshingUsage = false;
        if (!destroyed) renderUsage();
      }
      return;
    }
    if (serverAvailable) {
      try {
        const response = await fetch('/api/studio/usage-index', { cache: 'no-store' });
        if (response.ok) {
          const body = await response.json();
          if (body?.index) { usageIndex = body.index; usageSource = 'server'; usageError = null; if (!destroyed) renderUsage(); return; }
        }
      } catch { /* fall through to the static registry file below */ }
    }
    try {
      const response = await fetch(USAGE_INDEX_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error('could not load usage-index.json');
      usageIndex = await response.json();
      usageSource = 'static';
      usageError = null;
    } catch (error) {
      usageIndex = null; usageSource = null; usageError = error.message;
    }
    if (!destroyed) renderUsage();
  }

  function renderUsage() {
    if (refreshingUsage) {
      panels.usage.innerHTML = `<div class="empty-state"><div><h1>Refreshing…</h1><p class="hint">Re-running tools/build-usage-index.mjs on the authoring server.</p></div></div>`;
      return;
    }
    if (!usageIndex) {
      panels.usage.innerHTML = `<div class="empty-state"><div><h1>Usage index unavailable</h1><p class="hint">${escapeHtml(usageError || 'Could not load shared/data/usage-index.json.')}</p></div></div>`;
      return;
    }
    const forward = usageIndex.forward || {};
    const reverse = usageIndex.reverse || {};
    const forwardCount = Object.keys(forward).length;
    const reverseCounts = Object.entries(reverse).map(([key, value]) => `${escapeHtml(key)}: ${Object.keys(value || {}).length}`).join(' · ');
    const generatedFrom = Array.isArray(usageIndex.generatedFrom) ? usageIndex.generatedFrom.join(', ') : (usageIndex.generatedFrom || '—');
    panels.usage.innerHTML = `
      <div class="panel-section">
        <h3>Freshness</h3>
        <p class="hint">generated ${escapeHtml(usageIndex.generated || usageIndex.timestamp || '—')} by ${escapeHtml(usageIndex.generatedBy || '—')}</p>
        <p class="hint">generated from: ${escapeHtml(generatedFrom)}</p>
        <p class="hint">source: ${usageSource === 'server' ? 'authoring server (live)' : 'static file — shared/data/usage-index.json'}</p>
        ${!serverAvailable ? '<p class="hint">Refresh needs the authoring server\'s live browser pass.</p>' : ''}
      </div>
      <div class="panel-section">
        <h3>Sanity readout</h3>
        <p class="hint">forward map: ${forwardCount} game${forwardCount === 1 ? '' : 's'} indexed</p>
        <p class="hint">reverse map: ${reverseCounts || '—'}</p>
      </div>`;
  }

  // ---- wiring ---------------------------------------------------------------
  function wire() {
    jobStatusSelect.onchange = (e) => { jobFilters.status = e.target.value; renderJobs(); };
    jobKindSelect.onchange = (e) => { jobFilters.kind = e.target.value; renderJobs(); };

    host.addEventListener('click', (event) => {
      const tabButton = event.target.closest('[data-tab]');
      if (tabButton) { setTab(tabButton.dataset.tab); return; }

      const cancelButton = event.target.closest('[data-cancel-job]');
      if (cancelButton) {
        cancelButton.disabled = true; cancelButton.textContent = '…';
        cancelJob(cancelButton.dataset.cancelJob).finally(() => {
          if (destroyed) return;
          cancelButton.disabled = false; cancelButton.textContent = 'cancel';
        });
        return;
      }

      const actionButton = event.target.closest('[data-action]');
      if (!actionButton) return;
      if (actionButton.dataset.action === 'run-validate') runValidation(validateTargetInput.value.trim());
      else if (actionButton.dataset.action === 'refresh-completeness') loadCompleteness();
      else if (actionButton.dataset.action === 'refresh-usage') loadUsageIndex({ refresh: true });
    });
  }

  // ---- boot ---------------------------------------------------------------
  try {
    try { await serverStatus(); serverAvailable = true; } catch { serverAvailable = false; }
    wire();
    setTab('jobs');
    serverHint.textContent = serverAvailable
      ? 'Authoring server connected — job queue, validation and completeness are live.'
      : 'Static preview — job queue, validation, completeness and the usage-index refresh need the authoring server. The usage index still reads from disk, read-only.';
    renderJobs(); renderValidation(); renderCompleteness(); renderUsage();
    if (serverAvailable) {
      await fetchJobs();
      jobsPollTimer = setInterval(fetchJobs, 2000);
      await loadCompleteness();
    }
    await loadUsageIndex();
  } catch (error) {
    console.error(error);
    canvas.innerHTML = `<div class="empty-state"><div><h1>Production unavailable</h1><p>${escapeHtml(error.message)}</p></div></div>`;
    toast(`Could not load Production: ${error.message}`, { error: true, duration: 7000 });
  }

  // Debug surface for browser automation (WP-3c gate).
  window.QLOBE_STUDIO_DEBUG = {
    workspace: 'production',
    listJobs: () => jobs.slice(),
    getJob: (id) => jobs.find((job) => job.id === id) || null,
    runValidation: (target) => runValidation(target),
    getReports: () => ({ validation: validationReport, completeness: completenessList, usageIndex }),
  };

  return () => {
    destroyed = true;
    if (jobsPollTimer) { clearInterval(jobsPollTimer); jobsPollTimer = null; }
    if (window.QLOBE_STUDIO_DEBUG?.workspace === 'production') delete window.QLOBE_STUDIO_DEBUG;
  };
}
