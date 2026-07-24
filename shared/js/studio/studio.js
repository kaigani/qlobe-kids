import { serverStatus } from './api.js';
import { loadStudioProjects, studioProject, canonicalWorkspaceId } from './projects.js';

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
const iframe = document.querySelector('#character-workspace');
const nativeHost = document.querySelector('#native-workspace');
const serverPill = document.querySelector('#server-status');
const legacyLink = document.querySelector('#legacy-link');
const toastNode = document.querySelector('#studio-toast');
let activeCleanup = null;
let activeWorkspace = null;

async function applyProjectNavigation() {
  const projects = await loadStudioProjects();
  const project = projects.find((item) => item.id === params.get('project')) || projects[0];
  const available = new Set(Object.keys(project?.workspaces || {}));
  available.add('rig'); // native Rig edits the shared character library — always reachable
  available.add('library'); // native Library browses every object across every project — always reachable
  available.add('modules'); // native Modules browses engines/services/stage/templates — always reachable
  available.add('games'); // native Games browses the registry + per-game dashboards — always reachable
  available.add('production'); // native Production (jobs/validate/completeness/usage) — always reachable
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

function updateUrl(workspace) {
  const next = new URL(location.href);
  next.searchParams.set('workspace', workspace);
  history.replaceState(null, '', next);
}

async function openWorkspace(workspace, { update = true } = {}) {
  workspace = canonicalWorkspaceId(workspace); // "build" is a legacy alias for "assemble"
  if (!CHARACTER_WORKSPACES.has(workspace) && !['assemble', 'props', 'stage', 'music', 'library', 'modules', 'games', 'production'].includes(workspace)) workspace = DEFAULT_WORKSPACE;
  const { available } = await applyProjectNavigation();
  if (!available.has(workspace)) workspace = ['assemble', 'props', 'stage', 'music', 'rig', 'animate', 'speech', 'library', 'modules', 'games', 'production'].find((id) => available.has(id)) || DEFAULT_WORKSPACE;
  if (activeCleanup) { activeCleanup(); activeCleanup = null; }
  activeWorkspace = workspace;
  for (const button of nav.querySelectorAll('button')) button.classList.toggle('on', button.dataset.workspace === workspace);
  if (update) updateUrl(workspace);

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
    const module = await import(`./workspaces/${workspace}.js`);
    const result = await module.mount(nativeHost, { params, toast, openWorkspace });
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
  const next = new URL(location.href); next.searchParams.set('char', event.data.char);
  history.replaceState(null, '', next);
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
  getState: () => ({ workspace: activeWorkspace, embedded: useIframe(activeWorkspace) }),
};
