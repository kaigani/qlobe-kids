// validators/pose-actor.mjs — qlobe-pose-actor (games/*/assets/pose-actors/*/poses.json).
// Subjects come from the fv2 registry (type: pose-actor) PLUS any pack still
// staged in shared/media/ (Feature N: the studio assembles a pack into the media
// bucket, where it is reviewed and only then assigned into a game — an assembled
// pack is held to the same contract before it ships). Checks identity, the
// poses{} map, and that every pose art file exists relative to the document.

import { registryObjectsOfType, isFile, isDir, listSubdirs, tryReadJSON, relOf, abs } from '../lib.mjs';
import path from 'node:path';

const MEDIA_ROOT = 'shared/media';
const docDir = (document) => relOf(abs(path.dirname(document)));

// Assembled-but-unassigned packs: a shared/media/<id>/ whose qlobe-recipe is of
// kind pose-actor. Identified through the recipe, never by filename, so a stray
// poses.json in the bucket is not mistaken for one.
function stagedSubjects() {
  if (!isDir(MEDIA_ROOT)) return [];
  const found = [];
  for (const id of listSubdirs(MEDIA_ROOT)) {
    const recipe = tryReadJSON(`${MEDIA_ROOT}/${id}/recipe.json`);
    if (recipe?.kind !== 'pose-actor') continue;
    // The SUBJECT id is the media id (a staged `dragon-pose-actor` must not
    // collide in the report with the assigned `dragon` already in a game);
    // `actorId` is what the manifest's own id is checked against.
    found.push({
      id,
      actorId: recipe.actor?.id || id,
      project: null,
      document: `${MEDIA_ROOT}/${id}/${recipe.asset || 'poses.json'}`,
    });
  }
  return found;
}

function subjects() {
  return [
    ...registryObjectsOfType('pose-actor').map((o) => ({ id: o.id, project: o.project, document: o.document })),
    ...stagedSubjects(),
  ];
}

function validate(subject, r) {
  const doc = tryReadJSON(subject.document);
  if (!doc) { r.error(`${subject.id}: ${subject.document} is missing or not valid JSON`); return; }
  if (doc.format !== 'qlobe-pose-actor') r.error(`format must be "qlobe-pose-actor" (found ${JSON.stringify(doc.format)})`);
  if (!Number.isInteger(doc.formatVersion)) r.warn('formatVersion should be an integer');
  const expectedId = subject.actorId ?? subject.id;
  if (doc.id !== undefined && doc.id !== expectedId) r.warn(`document id "${doc.id}" differs from registry id "${expectedId}"`);
  // The runtime (shared/js/stage/pose-sprite.js) throws without poses.neutral —
  // it is both the required entry pose and the fallback for any unknown name.
  if (doc.poses && typeof doc.poses === 'object' && !doc.poses.neutral)
    r.error('poses.neutral is required — the runtime opens on it and falls back to it');
  const poses = doc.poses;
  if (!poses || typeof poses !== 'object') { r.error('poses{} is missing'); return; }
  const dir = docDir(subject.document);
  let count = 0;
  for (const [name, pose] of Object.entries(poses)) {
    count += 1;
    if (typeof pose?.art !== 'string' || !pose.art) { r.error(`pose "${name}" has no art`); continue; }
    if (!isFile(`${dir}/${pose.art}`)) r.error(`pose "${name}" art not found: ${pose.art}`);
  }
  if (!count) r.warn('pose actor has no poses');
  r.info(`${count} pose(s)`);
}

export default { target: 'pose-actor', aliases: ['pose-actors'], subjects, validate };
