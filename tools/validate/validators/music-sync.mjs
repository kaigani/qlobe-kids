// validators/music-sync.mjs — qlobe-music-sync (games/*/music-sync.json).
// Subjects come from the fv2 registry (type: music-sync). Checks identity and
// the profiles{} map. Clip names are resolved by the runtime against a rig's
// clips, so they are not file-checked here (no orphan-clip false positives).

import { registryObjectsOfType, tryReadJSON } from '../lib.mjs';

function subjects() {
  return registryObjectsOfType('music-sync').map((o) => ({ id: o.id, project: o.project, document: o.document }));
}

function validate(subject, r) {
  const doc = tryReadJSON(subject.document);
  if (!doc) { r.error(`${subject.id}: ${subject.document} is missing or not valid JSON`); return; }
  if (doc.format !== 'qlobe-music-sync') r.error(`format must be "qlobe-music-sync" (found ${JSON.stringify(doc.format)})`);
  if (!Number.isInteger(doc.formatVersion)) r.warn('formatVersion should be an integer');
  if (doc.id !== undefined && doc.id !== subject.id) r.warn(`document id "${doc.id}" differs from registry id "${subject.id}"`);
  const profiles = doc.profiles;
  if (!profiles || typeof profiles !== 'object') { r.error('profiles{} is missing'); return; }
  let count = 0;
  for (const [name, profile] of Object.entries(profiles)) {
    count += 1;
    if (typeof profile?.baseClip !== 'string' || !profile.baseClip) r.warn(`profile "${name}" has no baseClip`);
  }
  if (!count) r.warn('music sync has no profiles');
  r.info(`${count} profile(s)`);
}

export default { target: 'music-sync', aliases: ['music'], subjects, validate };
