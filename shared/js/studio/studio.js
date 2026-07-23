import { serverStatus } from './api.js';
import { loadStudioProjects, studioProject } from './projects.js';

const CHARACTER_WORKSPACES = new Set(['rig', 'animate', 'speech']);
const DEFAULT_WORKSPACE = 'rig';
const params = new URLSearchParams(location.search);
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
  for (const button of nav.querySelectorAll('button[data-workspace]')) {
    button.hidden = !available.has(button.dataset.workspace);
    if (button.dataset.workspace === 'build') button.textContent = project?.workspaces?.build?.label || 'Build';
  }
  const labels = nav.querySelectorAll('.nav-group-label');
  if (labels[0]) labels[0].hidden = !['rig', 'animate', 'speech', 'build'].some((id) => available.has(id));
  if (labels[1]) labels[1].hidden = !['props', 'stage', 'music'].some((id) => available.has(id));
  return { project, available };
}

const toast = (message, { error = false, duration = 4000 } = {}) => {
  toastNode.textContent = message;
  toastNode.className = `show${error ? ' error' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { toastNode.className = ''; }, duration);
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
  if (!CHARACTER_WORKSPACES.has(workspace) && !['build', 'props', 'stage', 'music'].includes(workspace)) workspace = DEFAULT_WORKSPACE;
  const { available } = await applyProjectNavigation();
  if (!available.has(workspace)) workspace = ['build', 'props', 'stage', 'music', 'rig', 'animate', 'speech'].find((id) => available.has(id)) || DEFAULT_WORKSPACE;
  if (activeCleanup) { activeCleanup(); activeCleanup = null; }
  activeWorkspace = workspace;
  for (const button of nav.querySelectorAll('button')) button.classList.toggle('on', button.dataset.workspace === workspace);
  if (update) updateUrl(workspace);

  if (CHARACTER_WORKSPACES.has(workspace)) {
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
  getState: () => ({ workspace: activeWorkspace, embedded: CHARACTER_WORKSPACES.has(activeWorkspace) }),
};
