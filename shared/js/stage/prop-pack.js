// prop-pack.js — versioned reusable prop data and legacy attachment adapters.

const FORMAT = 'qlobe-prop-pack';
const VERSION = 1;

export function defaultCharacterSockets(rig = {}) {
  const has = (id) => (rig.bones || []).some((bone) => bone.id === id);
  const socket = (bone, point) => ({ bone: has(bone) ? bone : (rig.bones?.[0]?.id || 'torso'), point, rotation: 0 });
  const mouthRect = rig.mouth?.rect;
  return {
    'hand.L': socket('arm-lower.L', [0, 110]),
    'hand.R': socket('arm-lower.R', [0, 110]),
    mouth: socket(rig.mouth?.bone || 'head', mouthRect ? [mouthRect.x + mouthRect.w / 2, mouthRect.y + mouthRect.h / 2] : [0, 24]),
    chest: socket('torso', [0, -70]),
    lap: socket('torso', [0, 105]),
  };
}

export function characterSockets(rig = {}) {
  return { ...defaultCharacterSockets(rig), ...(rig.sockets || {}) };
}

export function normalizePropPack(document, sourceUrl = document?.sourceUrl || document?.url || '') {
  const input = document && typeof document === 'object' ? document : {};
  const baseUrl = sourceUrl ? new URL('.', sourceUrl).href : document?.baseUrl || document?.baseURI || '';
  const props = {};
  for (const [id, raw] of Object.entries(input.props || {})) {
    const presentation = raw.presentation || {};
    const art = raw.art || null;
    props[id] = {
      ...raw,
      id,
      art,
      artUrl: art && baseUrl ? new URL(art, baseUrl).href : art,
      presentation: {
        anchor: presentation.anchor || raw.anchor || [0.5, 0.5],
        scale: presentation.scale ?? raw.scale ?? 0.5,
        rotation: presentation.rotation ?? raw.rotation ?? 0,
        layer: presentation.layer || raw.layer || 'front',
        inheritRotation: presentation.inheritRotation ?? raw.inheritRotation ?? false,
      },
      placement: { mode: raw.placement?.mode || (raw.floor ? 'floor' : 'held'), ...(raw.placement || {}) },
      sockets: { ...(raw.sockets || {}) },
      bindings: { ...(raw.bindings || {}) },
      characterOverrides: { ...(raw.characterOverrides || {}) },
    };
  }
  return {
    ...input, format: input.format || FORMAT, formatVersion: input.formatVersion || VERSION,
    id: input.id || 'prop-pack', baseUrl, props,
  };
}

export async function loadPropPack(url) {
  if (!url) return normalizePropPack({ props: {} });
  const absolute = new URL(url, document.baseURI).href;
  const response = await fetch(absolute, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load Prop Pack: ${response.status}`);
  return normalizePropPack(await response.json(), absolute);
}

export function propRuntimeDefinition(pack, id, overrides = {}, characterId = null) {
  const item = pack?.props?.[id];
  if (!item) return { ...overrides };
  const specific = characterId ? item.characterOverrides?.[characterId] || {} : {};
  const presentation = { ...item.presentation, ...(specific.presentation || {}), ...(overrides.presentation || {}) };
  const placement = { ...item.placement, ...(specific.placement || {}), ...(overrides.placement || {}) };
  const bindings = { ...item.bindings, ...(specific.bindings || {}), ...(overrides.bindings || {}) };
  const primaryPropSocket = placement.primary || Object.keys(bindings)[0] || null;
  const primaryCharacterSocket = (primaryPropSocket && bindings[primaryPropSocket]) || placement.characterSocket || null;
  return {
    ...item, ...specific, ...overrides,
    art: overrides.art || specific.artUrl || specific.art || item.artUrl || item.art,
    anchor: presentation.anchor,
    scale: presentation.scale,
    rotation: presentation.rotation,
    layer: presentation.layer,
    inheritRotation: presentation.inheritRotation,
    characterSocket: overrides.characterSocket || primaryCharacterSocket,
    propSocket: overrides.propSocket || primaryPropSocket,
    sockets: { ...item.sockets, ...(specific.sockets || {}), ...(overrides.sockets || {}) },
    offset: overrides.offset || placement.offset || [0, 0],
    fx: overrides.fx ?? placement.fx ?? null,
    fy: overrides.fy ?? placement.fy ?? null,
    bindings,
    placement,
  };
}

export function legacyPropPack(id, definitions = {}, sourceUrl = document.baseURI) {
  const props = {};
  for (const [propId, def] of Object.entries(definitions)) {
    props[propId] = {
      art: def.art,
      presentation: {
        anchor: def.anchor || [0.5, 0.5], scale: def.scale ?? 0.5,
        rotation: def.rotation || 0, layer: def.layer || 'front',
        inheritRotation: !!def.inheritRotation,
      },
      placement: { mode: def.holder ? 'held' : 'floor', characterSocket: def.characterSocket },
      bindings: def.characterSocket ? { 'grip-main': def.characterSocket } : {},
      sockets: def.sockets || {},
    };
  }
  return normalizePropPack({ format: FORMAT, formatVersion: VERSION, id, props }, sourceUrl);
}

export const PROP_PACK_FORMAT = FORMAT;
export const PROP_PACK_VERSION = VERSION;
