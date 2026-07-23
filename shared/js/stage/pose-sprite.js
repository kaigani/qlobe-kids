// Whole-character storybook actor renderer. Each semantic pose is a complete
// illustration; changes use a short paper-pop instead of skeletal interpolation.

import { ease, to } from './tween.js';

const manifestCache = new Map();
const textureCache = new Map();

async function fetchManifest(url) {
  const href = new URL(url, document.baseURI).href;
  if (!manifestCache.has(href)) manifestCache.set(href, fetch(href, { cache:'no-store' }).then((response) => {
    if (!response.ok) throw new Error(`Could not load pose manifest ${new URL(href).pathname}`);
    return response.json();
  }));
  return manifestCache.get(href);
}

function texture(PIXI, url) {
  const href = new URL(url, document.baseURI).href;
  if (!textureCache.has(href)) textureCache.set(href, PIXI.Assets.load(href));
  return textureCache.get(href);
}

export async function loadPoseActor(PIXI, manifestUrl) {
  const url = new URL(manifestUrl, document.baseURI);
  const manifest = await fetchManifest(url);
  if (manifest.format !== 'qlobe-pose-actor' || !manifest.poses?.neutral) {
    throw new Error(`Invalid pose actor manifest: ${url.pathname}`);
  }
  const base = new URL('./', url);
  const view = new PIXI.Container();
  let sprite = null, pose = null, destroyed = false, generation = 0;
  const anchor = manifest.anchor || [0.5, 0.94];
  const transition = manifest.transition || { kind:'paper-pop', durationMs:220 };

  const poseUrl = (name) => {
    const definition = manifest.poses[name] || manifest.poses.neutral;
    return { definition, url:new URL(definition.art, base).href };
  };
  const makeSprite = async (name) => {
    const { definition, url:artUrl } = poseUrl(name);
    const next = new PIXI.Sprite(await texture(PIXI, artUrl));
    next.anchor.set(...(definition.anchor || anchor));
    next.label = `pose:${name}`;
    return next;
  };

  async function setPose(name, { instant = false } = {}) {
    if (destroyed) return false;
    const resolved = manifest.poses[name] ? name : 'neutral';
    if (resolved === pose && sprite) return true;
    const ownGeneration = ++generation, next = await makeSprite(resolved);
    if (destroyed || ownGeneration !== generation) { next.destroy(); return false; }
    const old = sprite;
    view.addChild(next); sprite = next; pose = resolved;
    if (!old || instant || transition.kind !== 'paper-pop') {
      next.alpha = 1; next.scale.set(1); old?.destroy(); return true;
    }
    next.alpha = 0; next.scale.set(0.92);
    const total = transition.durationMs || 220, up = Math.round(total * 0.62);
    await Promise.all([
      to(old, { alpha:0 }, { ms:total, easing:ease.inOutSine }),
      to(next, { alpha:1, scale:{ x:1.04, y:1.04 } }, { ms:up, easing:ease.outCubic }),
    ]);
    if (destroyed || ownGeneration !== generation) return false;
    await to(next, { scale:{ x:1, y:1 } }, { ms:total-up, easing:ease.inOutSine });
    old.destroy(); return true;
  }

  async function preload(names = Object.keys(manifest.poses)) {
    await Promise.all(names.map((name) => texture(PIXI, poseUrl(name).url)));
  }
  function destroy() { destroyed = true; generation += 1; view.destroy({ children:true }); }

  await setPose('neutral', { instant:true });
  return { view, manifest, get pose(){ return pose; }, setPose, preload, destroy };
}

export const __test = { fetchManifest };
