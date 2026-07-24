const REGISTRY_URL = new URL('./projects.json', import.meta.url);
let registryPromise;

// "build" is the v1 workspace name; v2 renames it to "assemble" and keeps
// "build" as a permanent alias so old registries, URLs, and links still work.
const WORKSPACE_ALIASES = { build: 'assemble' };
export function canonicalWorkspaceId(id) {
  return WORKSPACE_ALIASES[id] || id;
}

// Fold a legacy "build" workspace key onto "assemble" without losing config.
function normalizeWorkspaces(workspaces) {
  if (!workspaces || typeof workspaces !== 'object') return workspaces;
  if (!('build' in workspaces)) return workspaces;
  const { build, ...rest } = workspaces;
  return { assemble: rest.assemble || build, ...rest };
}

// Synthesize the object-centric list for a v1 registry: each project expands to
// its implied objects (a game plus any workspace that names a single document).
function objectsFromV1Projects(projects) {
  const objects = [];
  for (const project of projects) {
    objects.push({ type: 'game', id: project.id, document: `games/${project.id}/game.json`, project: project.id });
    for (const [workspace, config] of Object.entries(project.workspaces || {})) {
      if (config && typeof config.document === 'string') {
        const type = workspace === 'stage' ? 'scene-pack' : workspace === 'music' ? 'music-sync' : workspace;
        objects.push({ type, id: `${project.id}-${workspace}`, document: config.document, project: project.id });
      }
    }
  }
  return objects;
}

function adaptRegistry(registry) {
  if (registry.format !== 'qlobe-studio-projects' || !Array.isArray(registry.projects)) {
    throw new Error('Studio project registry is invalid.');
  }
  const projects = registry.projects.map((project) => ({
    ...project,
    workspaces: normalizeWorkspaces(project.workspaces),
    baseUrl: new URL(project.gameBase, REGISTRY_URL),
  }));
  const objects = Array.isArray(registry.objects) && registry.objects.length
    ? registry.objects.map((object) => ({ ...object }))
    : objectsFromV1Projects(projects);
  return { formatVersion: registry.formatVersion || 1, projects, objects };
}

async function loadRegistry() {
  if (!registryPromise) {
    registryPromise = fetch(REGISTRY_URL, { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('Could not load the QLOBE Studio project registry.');
      return adaptRegistry(await response.json());
    });
  }
  return registryPromise;
}

export async function loadStudioProjects() {
  return (await loadRegistry()).projects;
}

// The resolved object-centric registry (v2 objects[], or synthesized from v1).
export async function loadStudioObjects() {
  return (await loadRegistry()).objects;
}

export async function studioProject(id, workspace = null) {
  const projects = await loadStudioProjects();
  const ws = workspace ? canonicalWorkspaceId(workspace) : null;
  return projects.find((project) => project.id === id && (!ws || project.workspaces?.[ws]))
    || projects.find((project) => !ws || project.workspaces?.[ws]);
}

export function projectOptions(projects, workspace, selected) {
  const ws = canonicalWorkspaceId(workspace);
  return projects.filter((project) => project.workspaces?.[ws]).map((project) =>
    `<option value="${project.id}"${project.id === selected ? ' selected' : ''}>${project.label}</option>`).join('');
}
