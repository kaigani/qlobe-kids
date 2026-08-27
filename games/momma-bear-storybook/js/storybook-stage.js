// Pose-actor stage adapter for Momma Bear's Storybook.
//
// This deliberately leaves reading state to main.js.  It translates the small,
// declarative page tableau in config.json into the shared Pixi theater contract.

import { createStage } from '../../../shared/js/stage/stage.js';
import { createTheater } from '../../../shared/js/stage/theater.js';

const HERO_ROLE = 'hero';
const POSE_NAMES = new Set(['neutral', 'enter', 'notice', 'interact', 'react', 'celebrate']);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

async function fetchJson(url, fallback) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    return response.ok ? await response.json() : fallback;
  } catch (_) {
    return fallback;
  }
}

function resolved(url, base) {
  try { return new URL(url, base).href; } catch (_) { return null; }
}

function poseName(name, fallback = 'neutral') {
  return POSE_NAMES.has(name) ? name : fallback;
}

function pageStage(page) {
  return page && typeof page === 'object' && page.stage && typeof page.stage === 'object'
    ? page.stage : {};
}

/**
 * A deliberately small, browser-independent motion grammar.  The values are
 * used by performPage() and make unknown asset actions safely read as a reveal.
 */
export function propMotion(action, authored = {}) {
  const x = Number(authored.x) || 0.5;
  const y = Number(authored.y) || 0.78;
  const scale = Number(authored.scale) || 0.25;
  const base = { x, y, scale, rotation: 0, alpha: 1 };
  switch (action) {
    case 'enter-right': return { from: { ...base, x: 1.12, alpha: 0 }, to: base, ms: 480 };
    case 'float': return { from: { ...base, y: y + 0.08, alpha: 0 }, to: { ...base, y: y - 0.025 }, ms: 360 };
    case 'pop': return { from: { ...base, scale: scale * 0.45, alpha: 0 }, to: base, ms: 300, fx: 'sparkle' };
    case 'pop-three': return { from: { ...base, scale: scale * 0.42, alpha: 0 }, to: { ...base, scale: scale * 1.06 }, ms: 520, fx: 'sparkle' };
    case 'spin': return { from: base, to: { ...base, rotation: Math.PI * 2 }, ms: 620, fx: 'sparkle' };
    case 'spill': return { from: { ...base, x: x - 0.08, alpha: 0 }, to: base, ms: 520, fx: 'sparkle' };
    case 'pour': return { from: { ...base, y: y - 0.08, alpha: 0 }, to: { ...base, rotation: -0.18 }, ms: 440, fx: 'sparkle' };
    case 'climb': return { from: { ...base, y: y + 0.12, alpha: 0 }, to: { ...base, y: y - 0.04 }, ms: 620, fx: 'sparkle' };
    case 'fan': return { from: { ...base, scale: scale * 0.6, alpha: 0 }, to: base, ms: 480, fx: 'sparkle' };
    case 'bounce': return { from: { ...base, y: y + 0.05, alpha: 0 }, to: { ...base, y: y - 0.02 }, ms: 360 };
    case 'glow': return { from: { ...base, alpha: 0 }, to: base, ms: 400, fx: 'sparkle' };
    case 'bob': return { from: { ...base, y: y + 0.03 }, to: { ...base, y: y - 0.02 }, ms: 340 };
    case 'sway': return { from: { ...base, rotation: -0.07 }, to: { ...base, rotation: 0.05 }, ms: 360 };
    case 'rustle': return { from: { ...base, rotation: -0.09, alpha: 0 }, to: { ...base, rotation: 0.06 }, ms: 350 };
    case 'tilt': return { from: { ...base, rotation: -0.12, alpha: 0 }, to: { ...base, rotation: 0.1 }, ms: 390 };
    case 'unfold': return { from: { ...base, scale: scale * 0.55, alpha: 0 }, to: base, ms: 460, fx: 'sparkle' };
    case 'settle': case 'still': return { from: base, to: base, ms: 120 };
    default: return { from: { ...base, scale: scale * 0.7, alpha: 0 }, to: base, ms: 300 };
  }
}

/**
 * Mount the papercraft story stage.  Failed packs or generated images are
 * intentionally non-fatal: the reading game remains usable with its word row
 * and voice even while an author is still producing the final assets.
 */
export async function createStorybookStage({ host, config, voice } = {}) {
  if (!host) throw new Error('storybook-stage: host is required');
  const stageConfig = config?.stage || {};
  const actorPackUrl = resolved(stageConfig.actorPack || './assets/actors/pack.json', document.baseURI);
  const propPackUrl = resolved(stageConfig.propPack || './assets/props/pack.json', document.baseURI);
  const [rawActors, rawProps, stage] = await Promise.all([
    fetchJson(actorPackUrl, { actors: {} }),
    fetchJson(propPackUrl, { props: {} }),
    createStage(host),
  ]);
  const theater = await createTheater(stage, {
    floorY: Number(stageConfig.floorY) || 0.84,
    worldScale: Number(stageConfig.worldScale) || 1,
    narrate: (key, text) => (voice && typeof voice.say === 'function'
      ? Promise.resolve(voice.say(key, text)).catch(() => undefined)
      : Promise.resolve()),
  });
  stage.root.addChild(theater.view);
  const landscapeFloorY = Number(stageConfig.floorY) || 0.84;
  const portraitFloorY = Number(stageConfig.portraitFloorY) || 0.65;
  const landscapePropShiftY = Number(stageConfig.landscapePropShiftY) || 0.18;
  const portraitPropShiftY = Number(stageConfig.portraitPropShiftY) || 0.18;
  const isPortraitStage = (width, height) => height > width * 1.05;
  const responsiveFloorY = (width, height) => (
    isPortraitStage(width, height) ? portraitFloorY : landscapeFloorY
  );
  const responsivePropY = (authoredY, width, height) => clamp(
    authoredY - (isPortraitStage(width, height) ? portraitPropShiftY : landscapePropShiftY),
    -0.1,
    1.1,
  );

  // Resolve asset paths once, from their *pack* documents.  Theater normally
  // resolves from document.baseURI, which would silently break packs nested in
  // an asset folder.
  const actorPack = Object.fromEntries(Object.entries(rawActors.actors || {}).map(([id, def]) => {
    const baseUrl = resolved(def.baseUrl || def.base || `${id}/`, actorPackUrl);
    return [id, {
      ...def,
      id: def.id || id,
      baseUrl,
      manifest: resolved(def.manifest || 'poses.json', baseUrl),
    }];
  }));
  const propPack = Object.fromEntries(Object.entries(rawProps.props || {}).map(([id, def]) => [id, {
    ...def,
    id,
    art: def.art ? resolved(def.art, propPackUrl) : null,
  }]));

  let currentStory = null;
  let hero = null;
  let destroyed = false;
  let performing = false;
  let generation = 0;
  let tapGeneration = 0;
  let propSerial = 0;
  const liveProps = [];

  const offResponsiveLayout = stage.onResize((width, height) => {
    theater.setFloorY(responsiveFloorY(width, height));
    liveProps.forEach((entry) => {
      if (!Number.isFinite(entry.authoredY)) return;
      const nextY = responsivePropY(entry.authoredY, width, height);
      const delta = nextY - entry.cue.y;
      entry.cue.y = nextY;
      entry.def.fy = nextY;
      entry.prop.fy = Number(entry.prop.fy) + delta;
      theater.layoutProp(entry.prop);
    });
  });

  const isLive = (run) => !destroyed && run === generation;
  const resetProps = () => {
    theater.clearProps();
    liveProps.length = 0;
    propSerial = 0;
  };

  async function artExists(url) {
    if (!url) return false;
    try {
      const response = await fetch(url, { cache: 'force-cache' });
      return response.ok;
    } catch (_) {
      return false;
    }
  }

  async function addPageProp(cue, visible) {
    const packed = propPack[cue?.id];
    if (!packed || !await artExists(packed.art)) return null;
    const id = `${cue.id}-${propSerial += 1}`;
    const authoredY = Number(cue.y);
    const { w: stageWidth, h: stageHeight } = stage.size();
    const propY = Number.isFinite(authoredY)
      ? responsivePropY(authoredY, stageWidth, stageHeight)
      : theater.floorY;
    const def = {
      art: packed.art,
      anchor: packed.anchor || [0.5, 0.5],
      layer: packed.layer || 'front',
      rotation: packed.rotation || 0,
      // Page values are authored in the story config and intentionally win.
      fx: clamp(Number(cue.x) || 0.5, -0.1, 1.1),
      fy: propY,
      scale: Number(cue.scale) || Number(packed.scale) || 0.25,
      alpha: visible ? 1 : 0,
    };
    try {
      const prop = await theater.addProp(id, def);
      const entry = { id, cue: { ...cue, y: propY }, authoredY, prop, def };
      liveProps.push(entry);
      return entry;
    } catch (_) {
      return null;
    }
  }

  async function setStory(story) {
    const run = ++generation;
    tapGeneration += 1;
    performing = false;
    theater.interrupt();
    resetProps();
    if (hero) theater.removeActor(HERO_ROLE);
    hero = null;
    currentStory = story || null;
    if (!story) return false;

    const backdrop = resolved(story.backdrop, document.baseURI);
    if (backdrop) await theater.setBackdrop(backdrop).catch(() => undefined);
    if (!isLive(run)) return false;
    const descriptor = actorPack[story.hero];
    if (!descriptor?.baseUrl || !descriptor.manifest) return false;
    try {
      hero = await theater.addPoseActor(HERO_ROLE, descriptor, {
        x: 0.5,
        scale: Number(descriptor.scale) || 0.9,
        widthShare: Number(descriptor.widthShare) || 0.34,
      });
      hero.poseActor.preload?.(['neutral', 'enter', 'notice', 'interact', 'react', 'celebrate']).catch(() => undefined);
      await theater.setSpritePose(hero, 'enter');
      if (isLive(run)) await theater.setSpritePose(hero, 'neutral');
    } catch (_) {
      hero = null;
    }
    return Boolean(hero) && isLive(run);
  }

  async function preparePage(page) {
    const run = ++generation;
    tapGeneration += 1;
    performing = false;
    theater.interrupt();
    resetProps();
    const cue = pageStage(page);
    if (hero) {
      hero.fx = clamp(Number(cue.heroX) || 0.5, 0.08, 0.92);
      theater.placeActor(hero);
      await theater.setSpritePose(hero, poseName(cue.beforePose, 'neutral'));
    }
    if (!isLive(run)) return false;
    const props = Array.isArray(cue.props) ? cue.props : [];
    for (const prop of props) {
      if (!isLive(run)) return false;
      await addPageProp(prop, prop.phase !== 'story');
    }
    return isLive(run);
  }

  function reactToWord() {
    const run = generation;
    const tap = ++tapGeneration;
    if (!hero || performing || destroyed) return;
    // Never interrupt narration/performance; a tap is only a tiny, optional
    // acknowledgement while the child is still assembling the sentence.
    theater.setSpritePose(hero, 'notice').catch(() => undefined);
    theater.wait(150).then(() => {
      if (isLive(run) && tap === tapGeneration && !performing && hero) {
        theater.setSpritePose(hero, 'neutral').catch(() => undefined);
      }
    }).catch(() => undefined);
  }

  async function revealEntry(entry, run) {
    if (!entry || !isLive(run)) return;
    const motion = propMotion(entry.cue.action, entry.cue);
    // Set the authored start without animating it, then let theater own the
    // scale/timeScale/reduced-motion-aware move to the authored endpoint.
    await theater.transformProp(entry.id, motion.from, { ms: 0 });
    if (!isLive(run)) return;
    await theater.transformProp(entry.id, motion.to, { ms: motion.ms });
    if (motion.fx && isLive(run)) theater.playFx(motion.fx, entry.id);
  }

  async function performPage(page) {
    const run = generation;
    const cue = pageStage(page);
    if (destroyed || !isLive(run)) return false;
    performing = true;
    tapGeneration += 1;
    try {
      if (hero) await theater.setSpritePose(hero, poseName(cue.storyPose, 'interact'));
      if (!isLive(run)) return false;
      const storyEntries = liveProps.filter((entry) => entry.cue.phase === 'story');
      await Promise.all(storyEntries.map((entry) => revealEntry(entry, run)));
      if (!isLive(run)) return false;
      // This is the only spoken whole-line call in this adapter.
      if (voice && typeof voice.say === 'function') {
        await Promise.resolve(voice.say(page?.lineKey, page?.line)).catch(() => undefined);
      }
      if (!isLive(run)) return false;
      if (cue.effect) theater.playFx(cue.effect === 'burst' ? 'burst' : 'sparkle', HERO_ROLE);
      if (hero) await theater.setSpritePose(hero, poseName(cue.settlePose, 'neutral'));
      return isLive(run);
    } finally {
      if (isLive(run)) performing = false;
    }
  }

  function celebrate() {
    if (destroyed) return;
    tapGeneration += 1;
    if (hero) theater.setSpritePose(hero, 'celebrate').catch(() => undefined);
    theater.playFx('burst', HERO_ROLE);
  }

  function relayout() {
    if (destroyed) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width > 0 && height > 0) stage.app.renderer.resize(width, height);
    if (hero) theater.placeActor(hero);
    liveProps.forEach((entry) => theater.layoutProp(entry.prop));
  }

  function setTimeScale(scale) {
    theater.timeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  function interrupt() {
    generation += 1;
    tapGeneration += 1;
    performing = false;
    theater.interrupt();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    interrupt();
    offResponsiveLayout();
    theater.destroy();
    stage.destroy();
  }

  return { setStory, preparePage, reactToWord, performPage, celebrate, relayout, setTimeScale, interrupt, destroy };
}
