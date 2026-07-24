// validators/character.mjs — qlobe-character (rig.json) + tier + completeness.
//
// Covers every directory under shared/characters/. Determines the capability
// tier (rigged | anim-only | pose-actor — §7.3), accepts an explicit `tier`
// field when present and infers it otherwise, and checks the requirements for
// that tier: rig shape, the 10-part biped, the 9 canonical viseme heads, and
// referenced-art existence. Legacy rigs carry no `format`/`tier` field; those
// are accepted (adapter stance) and reported as info, never errors.

import {
  listCharacterIds, isFile, isDir, isKebabId, tryReadJSON, readJSON, listDir,
  CANONICAL_VISEMES, RIG_BONES, ANIM_ONLY_CHARACTERS,
} from '../lib.mjs';

const charDir = (id) => `shared/characters/${id}`;

// Tier inference from what is on disk (mirrors the adapter rule in §7.3: a
// rig.json with bones[] is `rigged`).
function inferTier(id) {
  const rig = tryReadJSON(`${charDir(id)}/rig.json`);
  if (rig && Array.isArray(rig.bones) && rig.bones.length) return 'rigged';
  if (tryReadJSON(`${charDir(id)}/poses.json`)) return 'pose-actor';
  return 'anim-only';
}

function subjects() {
  return listCharacterIds().map((id) => ({ id, characterId: id, document: `${charDir(id)}/rig.json` }));
}

function validateRigged(id, r) {
  const dir = charDir(id);
  const rig = tryReadJSON(`${dir}/rig.json`);
  if (!rig) { r.error(`${id}: rig.json is missing or not valid JSON`); return; }

  // Identity (adapter stance: legacy rigs have no format/formatVersion — info).
  if (rig.format !== undefined && rig.format !== 'qlobe-character') {
    r.error(`rig.format must be "qlobe-character" when present (found ${JSON.stringify(rig.format)})`);
  }
  if (rig.format === undefined) r.info('rig.json has no format field (legacy qlobe-character v1 — accepted)');
  if (rig.formatVersion !== undefined && !Number.isInteger(rig.formatVersion)) {
    r.error(`rig.formatVersion must be an integer (found ${JSON.stringify(rig.formatVersion)})`);
  }
  if (rig.id !== undefined && rig.id !== id) r.error(`rig.id "${rig.id}" does not match directory "${id}"`);

  // tier field (§7.3) — accept when present, must be valid + consistent.
  if (rig.tier !== undefined) {
    if (!['rigged', 'anim-only', 'pose-actor'].includes(rig.tier)) r.error(`rig.tier "${rig.tier}" is not a valid tier`);
    else if (rig.tier !== 'rigged') r.warn(`rig.tier is "${rig.tier}" but a bones[] rig looks rigged`);
  } else {
    r.info('rig.json has no tier field (inferred "rigged")');
  }

  // Core shape.
  if (!Number.isFinite(rig.canvas)) r.warn('rig.canvas is missing or not a number');
  if (!rig.anchor || !Number.isFinite(rig.anchor.x) || !Number.isFinite(rig.anchor.y)) r.warn('rig.anchor {x,y} is missing');
  if (!Array.isArray(rig.bones) || !rig.bones.length) { r.error('rig.bones[] is empty'); return; }
  if (!Array.isArray(rig.parts) || !rig.parts.length) r.error('rig.parts[] is empty');
  if (!rig.spine || !Array.isArray(rig.spine.control)) r.warn('rig.spine.control[] is missing');
  if (rig.clips !== undefined && (typeof rig.clips !== 'object' || rig.clips === null || Array.isArray(rig.clips))) {
    r.error('rig.clips must be an object of named clips when present');
  }

  // The canonical 10-bone biped (warn on drift — some rigs legitimately differ).
  const boneIds = new Set((rig.bones || []).map((b) => b.id));
  for (const bone of RIG_BONES) if (!boneIds.has(bone)) r.warn(`rig is missing the canonical bone "${bone}"`);
  for (const bone of rig.bones || []) {
    if (!bone || typeof bone.id !== 'string') { r.error('a bone has no id'); continue; }
    if (!Array.isArray(bone.joint) || bone.joint.length !== 2 || !bone.joint.every(Number.isFinite)) {
      r.error(`bone "${bone.id}" has an invalid joint [x,y]`);
    }
  }

  // Parts reference real art relative to the character directory.
  for (const part of rig.parts || []) {
    if (!part || typeof part.bone !== 'string') { r.error('a part has no bone binding'); continue; }
    if (!boneIds.has(part.bone)) r.error(`part for bone "${part.bone}" has no matching bone`);
    if (typeof part.art !== 'string' || !part.art) { r.error(`part for "${part.bone}" has no art path`); continue; }
    if (!isFile(`${dir}/${part.art}`)) r.error(`part art not found: ${part.art}`);
  }

  // Viseme heads (§3.4: the 9 canonical heads). Missing heads are completeness
  // warnings, not errors — a rig still loads without every head.
  const animDir = `${dir}/anim`;
  const heads = new Set(listDir(animDir));
  for (const v of CANONICAL_VISEMES) {
    if (!heads.has(`head-${v}.png`)) r.warn(`missing viseme head anim/head-${v}.png`);
  }
  // A neutral/rest head must exist somewhere the rig can draw (parts/head.png or
  // the head part's own art).
  const headPart = (rig.parts || []).find((p) => p.bone === 'head');
  const hasRest = isFile(`${dir}/parts/head.png`) || (headPart && isFile(`${dir}/${headPart.art}`));
  if (!hasRest) r.warn('no rest/neutral head (parts/head.png or the head part art)');
}

function validateAnimOnly(id, r) {
  const dir = charDir(id);
  if (tryReadJSON(`${dir}/rig.json`)) r.warn('anim-only tier but a rig.json is present');
  if (!isFile(`${dir}/portrait.png`)) r.warn('anim-only character has no portrait.png');
  if (!isDir(`${dir}/anim`)) r.warn('anim-only character has no anim/ directory');
}

function validate(subject, r) {
  const id = subject.id;
  if (!isKebabId(id)) { r.error(`character directory "${id}" is not a kebab-case id`); return; }
  const tier = inferTier(id);
  r.info(`tier: ${tier}`);
  if (tier === 'rigged') validateRigged(id, r);
  else if (tier === 'anim-only') {
    validateAnimOnly(id, r);
    if (!ANIM_ONLY_CHARACTERS.includes(id)) r.info('anim-only character not in the documented 5-char census');
  }
}

export default { target: 'character', aliases: ['characters'], subjects, validate };
export { inferTier };
