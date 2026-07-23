const REGISTRY_URL = new URL('./projects.json', import.meta.url);
let registryPromise;

export async function loadStudioProjects() {
  if (!registryPromise) registryPromise = fetch(REGISTRY_URL, { cache: 'no-store' }).then(async (response) => {
    if (!response.ok) throw new Error('Could not load the QLOBE Studio project registry.');
    const registry = await response.json();
    if (registry.format !== 'qlobe-studio-projects' || !Array.isArray(registry.projects)) throw new Error('Studio project registry is invalid.');
    return registry.projects.map((project) => ({ ...project, baseUrl: new URL(project.gameBase, REGISTRY_URL) }));
  });
  return registryPromise;
}

export async function studioProject(id, workspace = null) {
  const projects = await loadStudioProjects();
  return projects.find((project) => project.id === id && (!workspace || project.workspaces?.[workspace]))
    || projects.find((project) => !workspace || project.workspaces?.[workspace]);
}

export function projectOptions(projects, workspace, selected) {
  return projects.filter((project) => project.workspaces?.[workspace]).map((project) =>
    `<option value="${project.id}"${project.id === selected ? ' selected' : ''}>${project.label}</option>`).join('');
}
