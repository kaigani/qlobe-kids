// rig-data.js — DOM-free pure logic for the Rig workspace.
//
// Extracted from the legacy inline editor in shared/js/stage/puppet-studio.html
// so both the browser workspace (rig.js) and the Node parity harness
// (tools/parity-rig.mjs) share ONE load/normalize/serialize path. Nothing here
// touches the DOM, PixiJS, or fetch — it is exercised in Node without a browser.

// Serialize exactly as the authoring server persists it and as api.js posts it:
// JSON.stringify(rig, null, 2) + '\n'. The server re-serializes with Python
// json.dumps(indent=2, ensure_ascii=False) + '\n', so identical CONTENT yields
// identical bytes on disk. The parity gate is content deep-equality, not bytes.
export function serializeRig(rig) {
  return JSON.stringify(rig, null, 2) + '\n';
}

export function parseRig(text) {
  return JSON.parse(text);
}

// The legacy editor performs NO normalization on load: `rig = await fetch().json()`
// and every mutation is user-gesture-gated. normalizeRig is therefore identity —
// kept as a named seam so the harness and the workspace share one load path and
// any future normalization lands in exactly one place. Adding normalization here
// would break rig.json parity, so it stays identity until that is intended.
export function normalizeRig(rig) {
  return rig;
}

// Load = parse + normalize (the exact object the workspace holds and would save).
export function loadRig(text) {
  return normalizeRig(parseRig(text));
}

export function getBone(rig, id) {
  return (rig.bones || []).find((b) => b.id === id);
}

export function getPart(rig, id) {
  return (rig.parts || []).find((p) => p.bone === id);
}

// Animatable props per selection target (mirrors the legacy propsFor).
export const propsFor = (target) =>
  target === '$spine' ? ['bend', 'squash']
  : target === '$motion' ? ['x', 'y', 'rotation', 'scaleX', 'scaleY']
  : ['rotation', 'x', 'y', 'scaleX', 'scaleY'];

export function mirrorCounterpartId(id) {
  if (id?.endsWith('.L')) return id.slice(0, -2) + '.R';
  if (id?.endsWith('.R')) return id.slice(0, -2) + '.L';
  return null;
}

// The X axis a .L/.R pair mirrors across: the root/torso joint, falling back to
// the rig anchor and finally the canvas centre.
export function mirrorAxisX(rig) {
  const root = (rig.bones || []).find((b) => b.id === 'torso')
    || (rig.bones || []).find((b) => !b.parent);
  return root?.joint?.[0] ?? rig.anchor?.x ?? (rig.canvas || 1024) / 2;
}

// Where the counterpart joint of `id` should land, or null when there is no
// .L/.R counterpart. Pure: computes coordinates, mutates nothing.
export function mirrorTarget(rig, id) {
  const source = getBone(rig, id);
  const counterpartId = mirrorCounterpartId(id);
  const counterpart = counterpartId && getBone(rig, counterpartId);
  if (!source || !counterpart) return null;
  const axisX = mirrorAxisX(rig);
  return {
    id: counterpartId,
    x: Math.round(axisX * 2 - source.joint[0]),
    y: Math.round(source.joint[1]),
  };
}

// Shared characters exposed by the Rig workspace (the 8 rigged puppets). The
// registry (projects.json objects[] of type "character") is the source of truth
// at runtime; this is the parity-harness roster and a static fallback.
export const RIGGED_CHARACTERS = [
  'bear', 'doggy', 'fox', 'frog', 'rabbit', 'unicorn', 'princess-lily', 'princess-zoe',
];

export const rigDocumentPath = (id) => `shared/characters/${id}/rig.json`;
