import { serverStatus } from './api.js';
import { loadStudioProjects, studioProject, canonicalWorkspaceId } from './projects.js';

// Bump when any workspaces/*.js changes — same discipline as studio.css?v=.
// Without it Chrome's heuristic disk cache can serve stale workspace modules
// for hours after a deploy (bit us during the nav refactor verification).
const WORKSPACE_VERSION = 9;

const CHARACTER_WORKSPACES = new Set(['rig', 'animate', 'speech']);
// Rig (WP-1b), Animate (WP-1c) and Speech (WP-1d) are ported to native
// workspaces. No character workspace embeds the legacy iframe by default anymore.
// `?legacy=1` forces a ported workspace back onto the iframe as an escape hatch.
const IFRAME_WORKSPACES = new Set([]);
const LEGACY_ESCAPE = new Set(['rig', 'animate', 'speech']); // native workspaces with a ?legacy=1 fallback
const DEFAULT_WORKSPACE = 'rig';
const params = new URLSearchParams(location.search);
const legacyRig = params.get('legacy') === '1';
const useIframe = (workspace) => IFRAME_WORKSPACES.has(workspace) || (LEGACY_ESCAPE.has(workspace) && legacyRig);
const nav = document.querySelector('#workspace-nav');
const subnav = document.querySelector('#studio-subnav');
const crumbBar = document.querySelector('#studio-crumbs');
const iframe = document.querySelector('#character-workspace');
const nativeHost = document.querySelector('#native-workspace');
const serverPill = document.querySelector('#server-status');
const legacyLink = document.querySelector('#legacy-link');
const toastNode = document.querySelector('#studio-toast');
let activeCleanup = null;
let activeWorkspace = null;
// Mount-generation guard: bumped on every openWorkspace. The per-mount ctx
// closures (setNav/setParam) capture the generation live at mount and no-op
// once a newer workspace has mounted, so a late async setNav from a workspace
// the user already navigated away from can never repaint the shell.
let mountGeneration = 0;
// Shell-owned navigation state. Crumb/tab items may carry onClick handlers
// (not serializable); getState() exposes labels only.
let navState = { tabs: [], activeTab: null, crumbs: [], count: null };

async function applyProjectNavigation() {
  const projects = await loadStudioProjects();
  const project = projects.find((item) => item.id === params.get('project')) || projects[0];
  const available = new Set(Object.keys(project?.workspaces || {}));
  available.add('rig'); // native Rig edits the shared character library — always reachable
  available.add('animate'); // native Animate edits shared character clips — always reachable, like Rig
  available.add('speech'); // native Speech edits shared character voice cues — always reachable, like Rig
  available.add('library'); // native Library browses every object across every project — always reachable
  available.add('modules'); // native Modules browses engines/services/stage/templates — always reachable
  available.add('games'); // native Games browses the registry + per-game dashboards — always reachable
  available.add('production'); // native Production (jobs/validate/completeness/usage) — always reachable
  available.add('generate'); // native Generate (template registry + review queue) — always reachable
  for (const button of nav.querySelectorAll('button[data-workspace]')) {
    button.hidden = !available.has(button.dataset.workspace);
    if (button.dataset.workspace === 'assemble') button.textContent = project?.workspaces?.assemble?.label || 'Assemble';
  }
  const labels = nav.querySelectorAll('.nav-group-label');
  if (labels[0]) labels[0].hidden = !['rig', 'animate', 'speech', 'assemble'].some((id) => available.has(id));
  if (labels[1]) labels[1].hidden = !['props', 'stage', 'music'].some((id) => available.has(id));
  return { project, available };
}

const toast = (message, { error = false, duration = 4000 } = {}) => {
  toastNode.textContent = message;
  toastNode.className = `show${error ? ' error' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { toastNode.className = ''; toastNode.textContent = ''; }, duration);
};

async function checkServer() {
  try {
    await serverStatus();
    serverPill.textContent = 'authoring server'; serverPill.className = 'status-pill good';
  } catch {
    serverPill.textContent = 'static preview'; serverPill.className = 'status-pill bad';
  }
}

// The shared `params` object is the single source of truth for the URL query;
// every writer (updateUrl, setParam, the char message handler) mutates it and
// then mirrors it onto the address bar via replaceState.
function syncUrl() {
  const next = new URL(location.href);
  next.search = params.toString();
  history.replaceState(null, '', next);
}

function updateUrl(workspace) {
  params.set('workspace', workspace);
  syncUrl();
}

// Root crumb label = the primary-nav button's text (picks up the project
// relabel of "Assemble" applied by applyProjectNavigation).
function rootLabel(workspace) {
  const button = nav.querySelector(`button[data-workspace="${workspace}"]`);
  return (button?.textContent || workspace).trim();
}

// Full-replace render of the two shell rows from navState. Called by the shell
// (openWorkspace reset) and by ctx.setNav. Shell owns all DOM and the .on /
// aria-selected / aria-current bookkeeping; workspaces never touch these rows.
function renderNav() {
  const tabs = Array.isArray(navState.tabs) ? navState.tabs : [];
  subnav.hidden = tabs.length === 0;
  subnav.replaceChildren();
  for (const tab of tabs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.dataset.tabId = tab.id;
    button.textContent = tab.label;
    const active = tab.id === navState.activeTab;
    button.classList.toggle('on', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    subnav.appendChild(button);
  }

  const crumbs = (Array.isArray(navState.crumbs) && navState.crumbs.length)
    ? navState.crumbs : [{ label: rootLabel(activeWorkspace) }];
  crumbBar.hidden = false; // always visible while a workspace is mounted
  crumbBar.replaceChildren();
  crumbs.forEach((crumb, index) => {
    const isLast = index === crumbs.length - 1;
    if (isLast) {
      const current = document.createElement('span');
      current.className = 'crumb crumb-current';
      current.setAttribute('aria-current', 'page');
      current.textContent = crumb.label;
      crumbBar.appendChild(current);
    } else {
      const clickable = typeof crumb.onClick === 'function';
      const el = document.createElement(clickable ? 'button' : 'span');
      el.className = 'crumb';
      el.textContent = crumb.label;
      if (clickable) { el.type = 'button'; el.dataset.crumbIndex = String(index); }
      crumbBar.appendChild(el);
      const sep = document.createElement('span');
      sep.className = 'crumb-sep';
      sep.setAttribute('aria-hidden', 'true');
      sep.textContent = '▸';
      crumbBar.appendChild(sep);
    }
  });

  // Project chip: shell-automatic from ?project, with an × that clears the
  // param and remounts the current workspace.
  const project = params.get('project');
  if (project) {
    const chip = document.createElement('span');
    chip.className = 'crumb-chip';
    const label = document.createElement('span');
    label.textContent = project;
    chip.appendChild(label);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'crumb-chip-x';
    remove.dataset.crumbChipRemove = '1';
    remove.setAttribute('aria-label', `Clear project ${project}`);
    remove.textContent = '×';
    chip.appendChild(remove);
    crumbBar.appendChild(chip);
  }

  if (navState.count != null && navState.count !== '') {
    const count = document.createElement('span');
    count.className = 'status-pill crumb-count';
    count.textContent = navState.count;
    crumbBar.appendChild(count);
  }
}

// Event delegation lives on the shell rows, added once. Tab / crumb items look
// their handler up out of the live navState so a re-render never orphans a
// listener.
subnav.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-tab-id]');
  if (!button) return;
  const tab = (navState.tabs || []).find((item) => item.id === button.dataset.tabId);
  tab?.onClick?.(tab.id);
});
crumbBar.addEventListener('click', (event) => {
  if (event.target.closest('[data-crumb-chip-remove]')) {
    params.delete('project');
    syncUrl();
    openWorkspace(activeWorkspace);
    return;
  }
  const button = event.target.closest('button[data-crumb-index]');
  if (!button) return;
  (navState.crumbs || [])[Number(button.dataset.crumbIndex)]?.onClick?.();
});

async function openWorkspace(workspace, { update = true } = {}) {
  workspace = canonicalWorkspaceId(workspace); // "build" is a legacy alias for "assemble"
  if (!CHARACTER_WORKSPACES.has(workspace) && !['assemble', 'props', 'stage', 'music', 'generate', 'library', 'modules', 'games', 'production'].includes(workspace)) workspace = DEFAULT_WORKSPACE;
  const { available } = await applyProjectNavigation();
  if (!available.has(workspace)) workspace = ['assemble', 'props', 'stage', 'music', 'rig', 'animate', 'speech', 'generate', 'library', 'modules', 'games', 'production'].find((id) => available.has(id)) || DEFAULT_WORKSPACE;
  if (activeCleanup) { activeCleanup(); activeCleanup = null; }
  activeWorkspace = workspace;
  for (const button of nav.querySelectorAll('button')) button.classList.toggle('on', button.dataset.workspace === workspace);
  if (update) updateUrl(workspace);

  // Bump the mount generation and build this mount's shell-owned ctx closures.
  const generation = ++mountGeneration;
  const setNav = (config = {}) => {
    if (generation !== mountGeneration) return; // stale call from a prior mount
    navState = {
      tabs: Array.isArray(config.tabs) ? config.tabs : [],
      activeTab: config.activeTab ?? null,
      crumbs: (Array.isArray(config.crumbs) && config.crumbs.length)
        ? config.crumbs : [{ label: rootLabel(workspace) }],
      count: config.count ?? null,
    };
    renderNav();
  };
  const setParam = (key, value) => {
    if (generation !== mountGeneration) return; // stale call from a prior mount
    if (value === null || value === undefined) params.delete(key);
    else params.set(key, String(value));
    syncUrl();
  };
  // Reset both shell rows to the default root crumb on EVERY openWorkspace,
  // including the iframe/legacy early-return path below.
  setNav({});

  if (CHARACTER_WORKSPACES.has(workspace) && useIframe(workspace)) {
    nativeHost.hidden = true; iframe.hidden = false;
    const project = await studioProject(params.get('project'), workspace);
    let char = params.get('char') || 'bear';
    let actorQuery = '';
    const actorPackPath = project?.workspaces?.[workspace]?.actorPack;
    if (actorPackPath) {
      const actorPackUrl = new URL(actorPackPath, project.baseUrl);
      const actorPack = await fetch(actorPackUrl, { cache: 'no-store' }).then((response) => response.json());
      char = actorPack.actors[char] ? char : Object.keys(actorPack.actors)[0];
      const actor = actorPack.actors[char];
      const base = new URL(actor.base || `${char}/`, actorPackUrl).href;
      actorQuery = `&base=${encodeURIComponent(base)}&rigPath=${encodeURIComponent(`games/${project.id}/assets/actors/${char}/${actor.rig || 'rig.json'}`)}`;
    }
    iframe.src = `../stage/puppet-studio.html?char=${encodeURIComponent(char)}&mode=${encodeURIComponent(workspace)}&embedded=1${actorQuery}`;
    legacyLink.href = iframe.src;
    return;
  }

  iframe.hidden = true; nativeHost.hidden = false; nativeHost.innerHTML = '';
  // For a ported native workspace, point "Legacy Studio" at its ?legacy=1 escape hatch.
  legacyLink.href = LEGACY_ESCAPE.has(workspace)
    ? `?workspace=${workspace}&legacy=1${params.get('char') ? `&char=${encodeURIComponent(params.get('char'))}` : ''}`
    : '../stage/puppet-studio.html';
  try {
    const module = await import(`./workspaces/${workspace}.js?v=${WORKSPACE_VERSION}`);
    const result = await module.mount(nativeHost, { params, toast, openWorkspace, setNav, setParam });
    activeCleanup = typeof result === 'function' ? result : result?.destroy || null;
  } catch (error) {
    nativeHost.innerHTML = `<div class="empty-state"><div><h1>Workspace error</h1><p>${escapeHtml(error.message)}</p></div></div>`;
    toast(error.message, { error: true, duration: 7000 });
  }
}

nav.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-workspace]');
  if (button) openWorkspace(button.dataset.workspace);
});
window.addEventListener('popstate', () => openWorkspace(new URLSearchParams(location.search).get('workspace'), { update: false }));
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.data?.type !== 'qlobe-studio-character') return;
  params.set('char', event.data.char);
  syncUrl();
});

function escapeHtml(value) {
  const node = document.createElement('span'); node.textContent = value; return node.innerHTML;
}

checkServer();
openWorkspace(params.get('workspace') || DEFAULT_WORKSPACE, { update: false });

window.QLOBE_STUDIO = {
  version: 1,
  ready: true,
  openWorkspace,
  getState: () => ({
    workspace: activeWorkspace,
    embedded: useIframe(activeWorkspace),
    tabs: (navState.tabs || []).map((tab) => tab.label),
    activeTab: navState.activeTab,
    crumbs: (navState.crumbs || []).map((crumb) => crumb.label),
  }),
};
