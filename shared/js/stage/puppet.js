// puppet.js — segmented bone-rig puppet for Stage v2.
//
// Builds a nested container tree from a rig manifest (see docs/puppet-rig-spec.md
// and shared/characters/<id>/rig.json). Each bone rotates about its joint; named
// clips drive bone poses along spline-eased keyframe tracks (spline.js); a bendy
// "spine" gives the plush squash/wobble; outfit slots parented to bones let you
// dress the puppet so clothes follow the limbs.
//
// Everything internal is authored in the rig's reference-canvas pixel space
// (rig.canvas, e.g. 1024). Only the returned `.view` is scaled/positioned by the
// caller — no per-part scale math here, mirroring how mouth.js scales one rect.
//
// Renderer: PixiJS (passed in, as the other stage/* modules do). Motion respects
// prefers-reduced-motion by holding a still pose.

import { ease } from './tween.js';
import { catmullRom, sampleTrack } from './spline.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Default art factory: draw each part/outfit as a flat tinted shape centered at
// its own origin. Swap this out (opts.partFactory) to return real PNG sprites —
// the engine positions whatever object it gets, so no engine change is needed.
function placeholderFactory(PIXI, desc) {
  const p = desc.placeholder || { shape: 'ellipse', color: '#cccccc', w: 60, h: 60 };
  const g = new PIXI.Graphics();
  const w = p.w || 60, h = p.h || 60;
  if (p.shape === 'roundRect') g.roundRect(-w / 2, -h / 2, w, h, p.r || Math.min(w, h) * 0.4).fill(p.color);
  else if (p.shape === 'triangle') g.poly([0, -h / 2, w / 2, h / 2, -w / 2, h / 2]).fill(p.color);
  else g.ellipse(0, 0, w / 2, h / 2).fill(p.color);
  return g;
}

// Resolve a rig part/outfit descriptor to a positioned display object.
// Two placement models, both leaving the object rotating about the bone joint
// (the bone container's origin):
//  - art sprite: `anchor` fraction is WHERE the joint sits inside the art, so
//    the sprite is anchored there and placed at the joint (origin) + optional
//    pixel `offset`. Rotation about the joint = rotation about the anchor.
//  - placeholder: a shape centered at its own `cx,cy` canvas point, offset from
//    the joint.
function buildDrawable(PIXI, desc, factory, joint) {
  const obj = factory(PIXI, desc);
  if (desc.art && desc.anchor) {
    obj.position.set(desc.offset ? desc.offset[0] : 0, desc.offset ? desc.offset[1] : 0);
  } else {
    const p = desc.placeholder || {};
    const cx = p.cx != null ? p.cx : joint[0];
    const cy = p.cy != null ? p.cy : joint[1];
    obj.position.set(cx - joint[0], cy - joint[1]); // offset from the bone's joint
  }
  return obj;
}

// Build a factory that returns anchored sprites from preloaded textures, falling
// back to placeholder shapes for descriptors with no loaded art.
function makeArtFactory(textures, scale) {
  const f = (PIXI, desc) => {
    const tex = desc.art && textures[desc.art];
    if (!tex) return placeholderFactory(PIXI, desc);
    const sp = new PIXI.Sprite(tex);
    const a = desc.anchor || [0.5, 0.5];
    sp.anchor.set(a[0], a[1]);
    sp.scale.set((desc.scale || 1) * scale);
    return sp;
  };
  f.textures = textures;   // exposed so createPuppet can swap viseme heads
  return f;
}

/**
 * Preload every `art` texture referenced by a rig's parts/outfits and return a
 * partFactory that builds anchored sprites from them. Pass the result as
 * opts.partFactory to createPuppet. baseUrl is the character folder (art paths
 * in the rig are relative to it, e.g. 'parts/head.png'). Pass cacheKey in an
 * authoring tool to append a version query and bypass stale browser/PIXI assets.
 */
export async function loadRigArt(PIXI, rig, baseUrl, scale = 1, cacheKey = null) {
  const base = new URL(baseUrl, document.baseURI);
  const rels = new Set();
  for (const p of rig.parts || []) {
    if (p.art) rels.add(p.art);
    if (p.visemes) for (const v of Object.values(p.visemes)) rels.add(v);   // lip-sync heads
  }
  for (const s of rig.outfitSlots || []) for (const pc of s.pieces || []) if (pc.art) rels.add(pc.art);
  const textures = {};
  await Promise.all([...rels].map(async (rel) => {
    const url = new URL(rel, base);
    if (cacheKey !== null && cacheKey !== undefined) url.searchParams.set('v', String(cacheKey));
    textures[rel] = await PIXI.Assets.load(url.href);
  }));
  return makeArtFactory(textures, scale);
}

/**
 * Create a puppet from a rig manifest.
 * @returns {{
 *   view, motion, bones,
 *   setPose, playClip, stopClip, currentClip,
 *   setOutfit, listOutfits,
 *   setMouthShape, mouth,
 *   enableDrag, moveAlong,
 *   getState, destroy
 * }}
 */
export function createPuppet(PIXI, rig, opts = {}) {
  const factory = opts.partFactory || placeholderFactory;
  const canvas = rig.canvas || 1024;
  const anchor = rig.anchor || { x: canvas / 2, y: canvas / 2 };

  // --- container tree ---------------------------------------------------------
  const view = new PIXI.Container();      // caller scales/positions this
  view.pivot.set(anchor.x, anchor.y);
  const motion = new PIXI.Container();    // $motion transforms (hop/sway) live here
  view.addChild(motion);

  // Draw order is GLOBAL, decoupled from the bone transform hierarchy. Every leaf
  // sprite still lives under its bone (so it inherits the bone's world transform),
  // but it's rendered through this one layer sorted by its own zIndex. That lets
  // e.g. arm-lower draw IN FRONT of the torso while arm-upper draws BEHIND it —
  // even though arm-lower is a child of arm-upper for the elbow rotation. So a
  // part's `z` is a global paint order across the whole puppet, not just within
  // its bone.
  const skinLayer = new PIXI.RenderLayer({ sortableChildren: true });
  view.addChild(skinLayer);
  const layerAdd = (obj, z) => { obj.zIndex = z || 0; skinLayer.attach(obj); };

  const bones = {};       // id -> { container, joint, base:{x,y} }
  const byId = Object.fromEntries(rig.bones.map((b) => [b.id, b]));
  // create containers
  for (const b of rig.bones) {
    const c = new PIXI.Container();
    c.sortableChildren = true;            // sort this bone's parts, outfits AND child bones by z
    c.zIndex = b.z || 0;                  // this bone's layer among its siblings (e.g. head over torso)
    bones[b.id] = { container: c, joint: b.joint, def: b };
  }
  // parent them (rig order preserved -> traversal draw order: legs, arms, head)
  for (const b of rig.bones) {
    const c = bones[b.id].container;
    const parentJoint = b.parent ? byId[b.parent].joint : [0, 0];
    c.position.set(b.joint[0] - parentJoint[0], b.joint[1] - parentJoint[1]);
    bones[b.id].base = { x: c.position.x, y: c.position.y };
    (b.parent ? bones[b.parent].container : motion).addChild(c);
  }

  // --- parts ------------------------------------------------------------------
  let visemeHead = null;       // { sprite, tex:{key->texture} } for lip-sync head-swap
  for (const part of rig.parts || []) {
    const bone = bones[part.bone];
    if (!bone) continue;
    const obj = buildDrawable(PIXI, part, factory, bone.joint);
    bone.container.addChild(obj);        // transform parent (inherits the bone's pose)
    layerAdd(obj, part.z);               // global draw order
    if (part.visemes && factory.textures) {
      visemeHead = { sprite: obj, tex: {} };
      for (const [k, rel] of Object.entries(part.visemes)) {
        if (factory.textures[rel]) visemeHead.tex[k] = factory.textures[rel];
      }
    }
  }

  // Swap the head to a viseme sprite (lip-sync). Keys are the rig's viseme names
  // (e.g. 'rest','a','o',…); unknown keys fall back to 'rest'. No-op if the rig
  // has no viseme head.
  let currentViseme = 'rest';
  function setViseme(key) {
    if (!visemeHead) return;
    const t = visemeHead.tex[key] || visemeHead.tex.rest;
    if (t) { visemeHead.sprite.texture = t; currentViseme = key; }
  }

  // --- mouth (a redrawable placeholder patch on the head bone) ----------------
  const OPEN = { x: 0, a: 0.18, b: 0.85, c: 0.7, d: 0.8, e: 0.6, f: 0.35, g: 0.55, h: 0.5 };
  let mouthShape = 'x';
  let mouthG = null;
  if (rig.mouth && bones[rig.mouth.bone]) {
    const bone = bones[rig.mouth.bone];
    const r = rig.mouth.rect;
    mouthG = new PIXI.Graphics();
    mouthG.position.set((r.x + r.w / 2) - bone.joint[0], (r.y + r.h / 2) - bone.joint[1]);
    bone.container.addChild(mouthG);
    layerAdd(mouthG, 36);
    drawMouth();
  }
  function drawMouth() {
    if (!mouthG) return;
    const r = rig.mouth.rect;
    const open = (OPEN[mouthShape] ?? 0) * r.h;
    mouthG.clear();
    if (open < 3) mouthG.roundRect(-r.w * 0.32, -2, r.w * 0.64, 5, 3).fill('#5a2f22');
    else mouthG.ellipse(0, 0, r.w * 0.32, open / 2).fill('#5a2f22');
  }
  function setMouthShape(s) { mouthShape = s || 'x'; drawMouth(); }

  // --- outfits ----------------------------------------------------------------
  const slots = {};
  for (const slot of rig.outfitSlots || []) {
    slots[slot.id] = { def: slot, current: null, currentId: null };
  }
  function setOutfit(slotId, pieceId) {
    const slot = slots[slotId];
    if (!slot) return;
    const bone = bones[slot.def.bone];
    if (slot.current) { skinLayer.detach(slot.current); slot.current.destroy(); slot.current = null; slot.currentId = null; }
    if (!pieceId || pieceId === 'none') return;
    const piece = (slot.def.pieces || []).find((p) => p.id === pieceId);
    if (!piece || !bone) return;
    const obj = buildDrawable(PIXI, piece, factory, bone.joint);
    bone.container.addChild(obj);
    layerAdd(obj, slot.def.z);
    slot.current = obj;
    slot.currentId = pieceId;
  }
  const listOutfits = () => Object.fromEntries(
    Object.entries(slots).map(([id, s]) => [id, (s.def.pieces || []).map((p) => p.id)]));

  // --- pose application -------------------------------------------------------
  // dynamicPose[target][prop] recomputed each frame from clip tracks; missing
  // targets fall back to rest (rotation 0, scale 1). staticPose holds setPose().
  const staticPose = {};
  let dynamicPose = {};
  function get(pose, target, prop, fallback) {
    return pose[target] && pose[target][prop] != null ? pose[target][prop] : fallback;
  }
  function val(target, prop, fallback) {
    const d = get(dynamicPose, target, prop, undefined);
    if (d != null) return d;
    return get(staticPose, target, prop, fallback);
  }

  function applyPose() {
    // regular bones — animated x/y offset rides on top of the structural joint
    for (const b of rig.bones) {
      const c = bones[b.id].container;
      const base = bones[b.id].base;
      c.position.set(base.x + val(b.id, 'x', 0), base.y + val(b.id, 'y', 0));
      c.rotation = val(b.id, 'rotation', 0);
      c.scale.set(val(b.id, 'scaleX', 1), val(b.id, 'scaleY', 1));
    }
    // $motion: whole-body hop / drift
    motion.position.set(val('$motion', 'x', 0), val('$motion', 'y', 0));
    motion.rotation = val('$motion', 'rotation', 0);
    motion.scale.set(val('$motion', 'scaleX', 1), val('$motion', 'scaleY', 1));
    // $spine: squash + bend fold onto torso/head on top of any bone rotation
    applySpine(val('$spine', 'bend', 0), val('$spine', 'squash', 0));
  }

  const spine = rig.spine || { control: [[anchor.x, anchor.y + 100], [anchor.x, anchor.y], [anchor.x, anchor.y - 100]] };
  function applySpine(bend, squash) {
    const torso = bones[rig.bones[0].id];
    if (torso) {
      // compose squash ONTO the animated scale set by applyPose (don't overwrite),
      // so a torso scaleX/scaleY track still takes effect
      torso.container.scale.set(
        torso.container.scale.x * (1 + squash * 0.30),
        torso.container.scale.y * (1 - squash * 0.45),
      );
      torso.container.rotation += bend * 0.25;
    }
    const head = bones.head;
    if (head) {
      // bend the spine: rotate the tip control point about the base, move the
      // head to the bent tip so the plush body arcs (sampled via spline math).
      const base = spine.control[0];
      const tip = spine.control[spine.control.length - 1];
      const vx = tip[0] - base[0], vy = tip[1] - base[1];
      const cos = Math.cos(bend), sin = Math.sin(bend);
      const dx = (vx * cos - vy * sin) - vx;
      const dy = (vx * sin + vy * cos) - vy;
      // additive: applyPose already placed head at base + its animated x/y offset
      head.container.position.set(head.container.position.x + dx, head.container.position.y + dy);
      head.container.rotation += bend;
    }
  }

  // --- clip playback ----------------------------------------------------------
  const easeName = (n) => (n && ease[n]) || null;
  // pre-resolve per-key ease strings to functions once
  const clips = {};
  for (const [name, clip] of Object.entries(rig.clips || {})) {
    clips[name] = {
      ...clip,
      tracks: (clip.tracks || []).map((t) => ({
        ...t,
        keys: t.keys.map((k) => (k.ease ? { ...k, ease: easeName(k.ease) } : k)),
      })),
    };
  }

  let raf = 0;
  let current = null;    // clip name
  let startT = 0;
  let onDoneCb = null;

  function sampleInto(clip, t) {
    dynamicPose = {};
    for (const tr of clip.tracks) {
      const v = sampleTrack(tr.keys, t, ease.inOutSine);
      (dynamicPose[tr.target] || (dynamicPose[tr.target] = {}))[tr.prop] = v;
    }
    applyPose();
  }

  function stopClip() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    current = null;
    onDoneCb = null;
  }

  function playClip(name, { loop, onDone } = {}) {
    const clip = clips[name];
    if (!clip) return;
    stopClip();
    current = name;
    onDoneCb = onDone || null;
    const dur = clip.duration || 1000;
    const doLoop = loop != null ? loop : !!clip.loop;

    if (reduced) {
      sampleInto(clip, 0);           // hold a still first-frame pose
      if (!doLoop) { current = null; const cb = onDoneCb; onDoneCb = null; if (cb) cb(); }
      return;
    }

    startT = performance.now();
    const tick = (now) => {
      const elapsed = now - startT;
      let t;
      if (doLoop) t = (elapsed % dur) / dur;
      else t = Math.min(1, elapsed / dur);
      sampleInto(clip, t);
      if (!doLoop && t >= 1) {
        raf = 0; current = null;
        const cb = onDoneCb; onDoneCb = null;
        if (cb) cb();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  // Music Sync hook: sample a clip from an external musical clock instead of
  // letting the clip free-run against performance.now().
  function setClipPhase(name, phase = 0) {
    const clip = clips[name];
    if (!clip) return false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    current = name;
    onDoneCb = null;
    const wrapped = ((Number(phase) || 0) % 1 + 1) % 1;
    sampleInto(clip, wrapped);
    return true;
  }

  function setPose(map) {
    for (const [target, props] of Object.entries(map || {})) {
      staticPose[target] = { ...(staticPose[target] || {}), ...props };
    }
    if (!current) applyPose();
  }

  // Editor hook: freeze the puppet on an arbitrary pose frame (a { target: {prop:v} }
  // map, exactly the shape a clip samples to). Stops any running clip.
  function previewPose(pose) {
    stopClip();
    dynamicPose = pose || {};
    applyPose();
  }

  // Editor hook: move a bone's joint live (canvas px) without a rebuild —
  // repositions the bone and its direct children, and mutates the rig in place.
  function setJoint(id, x, y) {
    const b = bones[id];
    if (!b) return;
    b.joint[0] = x; b.joint[1] = y;                    // b.joint aliases rig bone.joint
    const parentId = b.def.parent;
    const pj = parentId ? bones[parentId].joint : [0, 0];
    b.container.position.set(x - pj[0], y - pj[1]);
    b.base = { x: b.container.position.x, y: b.container.position.y };
    for (const cb of rig.bones) {
      if (cb.parent !== id) continue;
      const c = bones[cb.id];
      c.container.position.set(c.joint[0] - x, c.joint[1] - y);
      c.base = { x: c.container.position.x, y: c.container.position.y };
    }
  }

  // --- drag & path-follow -----------------------------------------------------
  let dragCleanup = null;
  function enableDrag(app) {
    if (!app || dragCleanup) return;
    view.eventMode = 'static';
    view.cursor = 'grab';
    let dragging = false;
    let grab = null;      // pointer offset in parent space
    const target = { x: view.x, y: view.y };
    const stage = app.stage;
    stage.eventMode = 'static';

    const down = (e) => {
      dragging = true;
      view.cursor = 'grabbing';
      const local = e.getLocalPosition(view.parent);
      grab = { x: local.x - view.x, y: local.y - view.y };
      target.x = view.x; target.y = view.y;
    };
    const move = (e) => {
      if (!dragging) return;
      const local = e.getLocalPosition(view.parent);
      target.x = local.x - grab.x;
      target.y = local.y - grab.y;
    };
    const up = () => { dragging = false; view.cursor = 'grab'; };
    const follow = () => {
      if (reduced) { view.x = target.x; view.y = target.y; return; }
      view.x += (target.x - view.x) * 0.34;
      view.y += (target.y - view.y) * 0.34;
    };
    view.on('pointerdown', down);
    stage.on('pointermove', move);
    stage.on('pointerup', up);
    stage.on('pointerupoutside', up);
    app.ticker.add(follow);
    dragCleanup = () => {
      view.off('pointerdown', down);
      stage.off('pointermove', move);
      stage.off('pointerup', up);
      stage.off('pointerupoutside', up);
      app.ticker.remove(follow);
    };
  }

  // Glide the whole puppet along a Catmull-Rom path of {x,y}|[x,y] points.
  function moveAlong(points, { ms = 1400 } = {}) {
    const pts = points.map((p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : p));
    if (reduced || pts.length < 2) {
      const last = pts[pts.length - 1]; if (last) view.position.set(last.x, last.y);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / ms);
        const p = catmullRom(pts, ease.inOutSine(t));
        view.position.set(p.x, p.y);
        if (t < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  // --- lifecycle --------------------------------------------------------------
  function getState() {
    return {
      currentClip: current,
      outfits: Object.fromEntries(Object.entries(slots).map(([id, s]) => [id, s.currentId])),
      mouth: mouthShape,
      pos: { x: view.x, y: view.y },
      viseme: currentViseme,
      reduced,
    };
  }
  function destroy() {
    stopClip();
    if (dragCleanup) dragCleanup();
    view.destroy({ children: true });
  }

  // start life idling
  applyPose();
  playClip('idle');

  return {
    view, motion, bones,
    setPose, playClip, stopClip, setClipPhase, get currentClip() { return current; },
    previewPose, setJoint, setViseme,
    setOutfit, listOutfits,
    setMouthShape, get mouth() { return { setShape: setMouthShape }; },
    enableDrag, moveAlong,
    getState, destroy,
  };
}
