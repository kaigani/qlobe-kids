// validators/scene-pack.mjs — qlobe-scene-pack (games/*/scene-pack.json).
// Subjects come from the fv2 registry (type: scene-pack). Checks identity, the
// scenes{} map, and referenced backdrop art where declared.

import { registryObjectsOfType, isFile, tryReadJSON, relOf, abs } from '../lib.mjs';
import path from 'node:path';

const docDir = (document) => relOf(abs(path.dirname(document)));

function subjects() {
  return registryObjectsOfType('scene-pack').map((o) => ({ id: o.id, project: o.project, document: o.document }));
}

function validate(subject, r) {
  const doc = tryReadJSON(subject.document);
  if (!doc) { r.error(`${subject.id}: ${subject.document} is missing or not valid JSON`); return; }
  if (doc.format !== 'qlobe-scene-pack') r.error(`format must be "qlobe-scene-pack" (found ${JSON.stringify(doc.format)})`);
  if (!Number.isInteger(doc.formatVersion)) r.warn('formatVersion should be an integer');
  if (doc.id !== undefined && doc.id !== subject.id) r.warn(`document id "${doc.id}" differs from registry id "${subject.id}"`);
  const scenes = doc.scenes;
  if (!scenes || typeof scenes !== 'object') { r.warn('scenes{} is missing'); return; }
  const dir = docDir(subject.document);
  let count = 0;
  for (const [name, scene] of Object.entries(scenes)) {
    count += 1;
    const backdrop = scene?.backdrop || scene?.setting?.backdrop;
    if (typeof backdrop === 'string' && backdrop && !/^(emoji|shared|char|text|swatch):/.test(backdrop) && !isFile(`${dir}/${backdrop}`)) {
      r.error(`scene "${name}" backdrop not found: ${backdrop}`);
    }
  }
  if (!count) r.info('scene pack has no authored scenes yet');
  else r.info(`${count} scene(s)`);
}

export default { target: 'scene-pack', aliases: ['scene-packs', 'scenes'], subjects, validate };
