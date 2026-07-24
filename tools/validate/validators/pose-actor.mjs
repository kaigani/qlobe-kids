// validators/pose-actor.mjs — qlobe-pose-actor (games/*/assets/pose-actors/*/poses.json).
// Subjects come from the fv2 registry (type: pose-actor). Checks identity, the
// poses{} map, and that every pose art file exists relative to the document.

import { registryObjectsOfType, isFile, tryReadJSON, relOf, abs } from '../lib.mjs';
import path from 'node:path';

const docDir = (document) => relOf(abs(path.dirname(document)));

function subjects() {
  return registryObjectsOfType('pose-actor').map((o) => ({ id: o.id, project: o.project, document: o.document }));
}

function validate(subject, r) {
  const doc = tryReadJSON(subject.document);
  if (!doc) { r.error(`${subject.id}: ${subject.document} is missing or not valid JSON`); return; }
  if (doc.format !== 'qlobe-pose-actor') r.error(`format must be "qlobe-pose-actor" (found ${JSON.stringify(doc.format)})`);
  if (!Number.isInteger(doc.formatVersion)) r.warn('formatVersion should be an integer');
  if (doc.id !== undefined && doc.id !== subject.id) r.warn(`document id "${doc.id}" differs from registry id "${subject.id}"`);
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
