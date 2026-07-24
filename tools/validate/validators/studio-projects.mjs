// validators/studio-projects.mjs — qlobe-studio-projects fv2 (the object registry
// at shared/js/studio/projects.json). Checks identity, that every objects[]
// document resolves on disk, that types/ids are well-formed, and that projects[]
// carry the fields the adapter needs.

import { readJSON, isFile, isKebabId, isSafeRelPath } from '../lib.mjs';

const KNOWN_TYPES = new Set(['character', 'pose-actor', 'prop-pack', 'scene-pack', 'story-pack', 'music-sync', 'game']);

function subjects() { return [{ id: 'projects.json', document: 'shared/js/studio/projects.json' }]; }

function validate(subject, r) {
  let reg;
  try { reg = readJSON(subject.document); } catch (e) { r.error(`projects.json is not valid JSON: ${e.message}`); return; }
  if (reg.format !== 'qlobe-studio-projects') r.error(`format must be "qlobe-studio-projects" (found ${JSON.stringify(reg.format)})`);
  if (![1, 2].includes(reg.formatVersion)) r.warn(`formatVersion should be 1 or 2 (found ${JSON.stringify(reg.formatVersion)})`);
  if (!Array.isArray(reg.projects)) r.error('projects[] is missing');

  const objects = Array.isArray(reg.objects) ? reg.objects : [];
  if (reg.formatVersion === 2 && !objects.length) r.warn('fv2 registry has no objects[]');
  const ids = new Set();
  for (const [i, obj] of objects.entries()) {
    const label = obj?.id || `#${i + 1}`;
    if (!isKebabId(obj?.id)) r.error(`object "${label}" has an invalid id`);
    else { if (ids.has(obj.id)) r.error(`duplicate object id "${obj.id}"`); ids.add(obj.id); }
    if (!KNOWN_TYPES.has(obj?.type)) r.warn(`object "${label}" has unknown type ${JSON.stringify(obj?.type)}`);
    if (typeof obj?.document !== 'string' || !isSafeRelPath(obj.document)) r.error(`object "${label}" has an unsafe/missing document path`);
    else if (!isFile(obj.document)) r.error(`object "${label}" document not found: ${obj.document}`);
  }
  for (const [i, project] of (reg.projects || []).entries()) {
    const label = project?.id || `#${i + 1}`;
    if (!isKebabId(project?.id)) r.error(`project "${label}" has an invalid id`);
    if (typeof project?.gameBase !== 'string') r.warn(`project "${label}" has no gameBase`);
  }
  r.info(`${objects.length} object(s), ${(reg.projects || []).length} project(s)`);
}

export default { target: 'studio-projects', aliases: ['projects', 'registry-projects'], subjects, validate };
