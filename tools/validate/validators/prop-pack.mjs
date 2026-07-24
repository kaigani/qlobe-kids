// validators/prop-pack.mjs — qlobe-prop-pack (games/*/assets/props/pack.json).
// Subjects come from the fv2 registry (type: prop-pack). Checks identity, the
// props{} map, and that every prop art file exists relative to the document.

import { registryObjectsOfType, isFile, tryReadJSON, relOf, abs } from '../lib.mjs';
import path from 'node:path';

const docDir = (document) => relOf(abs(path.dirname(document)));

function subjects() {
  return registryObjectsOfType('prop-pack').map((o) => ({ id: o.id, project: o.project, document: o.document }));
}

function validate(subject, r) {
  const doc = tryReadJSON(subject.document);
  if (!doc) { r.error(`${subject.id}: ${subject.document} is missing or not valid JSON`); return; }
  if (doc.format !== 'qlobe-prop-pack') r.error(`format must be "qlobe-prop-pack" (found ${JSON.stringify(doc.format)})`);
  if (!Number.isInteger(doc.formatVersion)) r.warn('formatVersion should be an integer');
  if (doc.id !== undefined && doc.id !== subject.id) r.warn(`document id "${doc.id}" differs from registry id "${subject.id}"`);
  const props = doc.props;
  if (!props || typeof props !== 'object') { r.error('props{} is missing'); return; }
  const dir = docDir(subject.document);
  let count = 0;
  for (const [name, prop] of Object.entries(props)) {
    count += 1;
    if (typeof prop?.art !== 'string' || !prop.art) { r.error(`prop "${name}" has no art`); continue; }
    if (!isFile(`${dir}/${prop.art}`)) r.error(`prop "${name}" art not found: ${prop.art}`);
  }
  if (!count) r.warn('prop pack has no props');
  r.info(`${count} prop(s)`);
}

export default { target: 'prop-pack', aliases: ['prop-packs', 'props'], subjects, validate };
