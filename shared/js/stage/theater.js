// theater.js — puppet scene substrate for Stage v2 (the layer between
// puppet.js and a game engine).
//
// A theater owns a Pixi scene with a backdrop, a cast of bone-rig puppets
// (shared/characters/<id>/), free-standing or hand-held props, and a beat
// sequencer that plays declarative scene scripts: walk-ons, clips, poses,
// lip-synced character lines, narrator lines, prop hand-offs, particle
// accents. Engines (e.g. engines/puppet-theater.js) drive it with pure data
// so games are authorable as config.
//
// Timing is theater-wide: `timeScale` (set >1 by automation/mute) divides
// every wait and motion so Playwright drives finish in seconds, and
// prefers-reduced-motion degrades acted beats to voiced tableaux (puppet.js
// already holds still poses; moves snap; FX are skipped).
//
// Like the other stage/* modules this is renderer-thin and dependency-free
// beyond Pixi (passed via the stage from stage.js).

import { createPuppet, loadRigArt } from './puppet.js';
import { driveLipsync, VISEME_IDENTITY } from './lipsync.js';
import { catmullRom } from './spline.js';
import { ease, to } from './tween.js';
import { burst, sparkle } from './particles.js';
import * as speech from '../speech.js';
import * as voiceClips from '../voice-clips.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Character folders resolve relative to THIS module (shared/js/stage/ →
// shared/characters/), so games never pass a shared base path.
const CHARACTERS_BASE = new URL('../../characters/', import.meta.url);

// Portable acting clips shared by every rig (see shared/characters/README.md).
// Loaded once, merged under each rig's own clips (rig-tuned clips win).
let packPromise = null;
export function loadActingClips() {
  if (!packPromise) {
    packPromise = fetch(new URL('acting-clips.json', CHARACTERS_BASE))
      .then((r) => (r.ok ? r.json() : { clips: {} }))
      .catch(() => ({ clips: {} }));
  }
  return packPromise;
}

// Session caches (rig JSON + art factories are shared across scenes/games).
const rigCache = new Map();      // charId -> Promise<rig json>
const artCache = new Map();      // charId -> Promise<partFactory>
const cueCache = new Map();      // url -> Promise<mouthCues|null>

function fetchJson(url) {
  return fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
}

function getRig(charId) {
  if (!rigCache.has(charId)) {
    rigCache.set(charId, fetchJson(new URL(`${charId}/rig.json`, CHARACTERS_BASE)));
  }
  return rigCache.get(charId);
}

function getArtFactory(PIXI, charId, rig) {
  if (!artCache.has(charId)) {
    artCache.set(charId, loadRigArt(PIXI, rig, new URL(`${charId}/`, CHARACTERS_BASE).href));
  }
  return artCache.get(charId);
}

function getCues(url) {
  if (!cueCache.has(url)) {
    cueCache.set(url, fetchJson(url).then((j) => (j && j.mouthCues) || null));
  }
  return cueCache.get(url);
}

// Rest values for pose props, used to unwind accumulated setPose overlays
// when a tableau is restored.
const POSE_REST = { rotation: 0, x: 0, y: 0, scaleX: 1, scaleY: 1, bend: 0, squash: 0 };

// Random mouth movement for the Web Speech fallback (no cue timeline).
function visemeFlap(puppet) {
  const talky = ['ts', 'a', 'e', 'o'];
  let timer = 0;
  const step = () => {
    puppet.setViseme(talky[Math.floor(Math.random() * talky.length)]);
    timer = setTimeout(step, 90 + Math.random() * 120);
  };
  step();
  return () => { clearTimeout(timer); puppet.setViseme('rest'); };
}

/**
 * Create a theater scene inside a stage (from createStage()).
 *
 * opts:
 *   backdrop   image URL (cover-fit) or a CSS hex color for greybox
 *   floorY     standing line as a fraction of stage height (default 0.74)
 *   gameClips  config-level clip overrides merged over the acting pack
 *   narrate    async (key, text) => …  narrator voice (engine-owned); when
 *              absent the theater falls back to Web Speech
 *
 * Returns the theater object; add `.view` to stage.root yourself so the
 * caller controls layering against its own chrome.
 */
export async function createTheater(stage, opts = {}) {
  const { PIXI } = stage;
  const floorY = opts.floorY ?? 0.74;
  // worldScale scales everything that isn't a puppet view (prop sizes, fx
  // offsets, flight arcs) so a cast rendered bigger keeps its props/effects
  // proportionate without re-authoring per-prop scales.
  const worldScale = opts.worldScale ?? 1;
  const pack = await loadActingClips();
  const gameClips = opts.gameClips || {};

  const view = new PIXI.Container();
  const bgLayer = new PIXI.Container();
  const actorLayer = new PIXI.Container();
  const propLayer = new PIXI.Container();   // above actors: a held toy reads in front of the paw
  const fxLayer = new PIXI.Container();
  view.addChild(bgLayer, actorLayer, propLayer, fxLayer);

  const actors = {};   // name -> actor
  const props = {};    // id -> prop
  let backdropSprite = null;

  // engine-provided narrator voice; kept OFF the theater object so the public
  // theater.narrate below can never recurse into itself
  const narrateCb = opts.narrate || null;

  const theater = {
    view, actors, props, floorY,
    timeScale: 1,
    muted: false,
    destroyed: false,
  };

  // --- abort plumbing ---------------------------------------------------------
  // interrupt() retires the current run token: in-flight beat loops check it
  // and stop; RAF motions cancel; audio stops. A fresh token starts the next run.
  let token = { aborted: false };
  const motions = new Set();   // cancel() fns for live RAF motions
  function interrupt() {
    token.aborted = true;
    token = { aborted: false };
    motions.forEach((cancel) => cancel());
    motions.clear();
    stopLip();
    voiceClips.stop();
    speech.stop();
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms / theater.timeScale)));

  // --- backdrop ----------------------------------------------------------------
  async function setBackdrop(src) {
    const old = backdropSprite;
    backdropSprite = null;
    if (src) {
      if (/^#|^0x/.test(src)) {
        backdropSprite = new PIXI.Graphics();
        backdropSprite.rect(0, 0, 4, 4).fill(src.replace(/^0x/, '#'));
        backdropSprite.isColor = true;
      } else {
        const tex = await PIXI.Assets.load(new URL(src, document.baseURI).href).catch(() => null);
        if (tex) backdropSprite = new PIXI.Sprite(tex);
      }
      if (backdropSprite) {
        bgLayer.addChildAt(backdropSprite, 0);   // beneath the outgoing one
        layoutBackdrop();
      }
    }
    if (!old) return;
    // crossfade the old scene out (a place change mid-show shouldn't hard-cut)
    if (reduced || theater.timeScale > 1 || !backdropSprite) { old.destroy(); return; }
    await to(old, { alpha: 0 }, { ms: 450, easing: ease.inOutSine });
    old.destroy();
  }
  function layoutBackdrop() {
    if (!backdropSprite) return;
    const { w, h } = stage.size();
    if (backdropSprite.isColor) { backdropSprite.width = w; backdropSprite.height = h; return; }
    const tex = backdropSprite.texture;
    const k = Math.max(w / tex.width, h / tex.height);   // cover
    backdropSprite.scale.set(k);
    backdropSprite.position.set((w - tex.width * k) / 2, (h - tex.height * k) / 2);
  }

  // --- actors -------------------------------------------------------------------
  function actorScale(actor) {
    const { w, h } = stage.size();
    const canvas = actor.rig.canvas || 1024;
    const k = (Math.min(w, h) / canvas) * actor.scaleFactor;
    // width cap so the whole cast fits side by side: each actor may take at
    // most widthShare of stage width (puppet art spans ~0.62 of its canvas).
    // Default 0.45 suits a two-hander; a band of five passes ~0.18 each.
    const kMax = ((actor.widthShare || 0.45) * w) / (0.62 * canvas);
    return Math.min(k, kMax);
  }
  // Feet on the floor line: the rig's `ground` sits (ground - anchor.y) below
  // the view pivot, so back the pivot up by that much (scaled).
  function placeActor(actor) {
    const { w, h } = stage.size();
    const k = actorScale(actor);
    actor.puppet.view.scale.set(actor.flip ? -k : k, k);
    const groundDrop = ((actor.rig.ground || actor.rig.canvas * 0.9) - actor.rig.anchor.y) * k;
    actor.puppet.view.position.set(actor.fx * w, floorY * h - groundDrop);
  }

  /**
   * Add a puppet to the cast. name is the scenario role ('a'/'b'/'red'…);
   * charId is the shared character folder. Voice manifest is optional —
   * actors without one speak through Web Speech at fallbackPitch.
   */
  async function addActor(name, charId, { x = 0.5, flip = false, scale = 0.5, fallbackPitch = 1.05, widthShare = 0.45 } = {}) {
    const baseRig = await getRig(charId);
    if (!baseRig) throw new Error(`theater: no rig for character '${charId}'`);
    // merge portable acting clips under the rig's own (rig-tuned clips win)
    const rig = { ...baseRig, clips: { ...pack.clips, ...gameClips, ...baseRig.clips } };
    const factory = await getArtFactory(PIXI, charId, rig);
    const puppet = createPuppet(PIXI, rig, { partFactory: factory });
    actorLayer.addChild(puppet.view);

    const voiceBase = new URL(`${charId}/voice/`, CHARACTERS_BASE);
    const manifest = await fetchJson(new URL('manifest.json', voiceBase));
    const lines = manifest && manifest.lines
      ? Object.fromEntries(manifest.lines.map((l) => [l.id, l])) : {};

    const actor = {
      name, char: charId, puppet, rig, lines, voiceBase,
      fx: x, flip, scaleFactor: scale, fallbackPitch, widthShare,
      poseState: {},
    };
    actors[name] = actor;
    placeActor(actor);
    return actor;
  }

  function removeActor(name) {
    const a = actors[name];
    if (!a) return;
    a.puppet.destroy();
    delete actors[name];
  }

  // Pose overlays are tracked per-actor so a tableau restore can unwind them
  // (puppet.setPose merges forever; we remember which keys we touched).
  function setActorPose(actor, map) {
    for (const [target, propsMap] of Object.entries(map || {})) {
      actor.poseState[target] = { ...(actor.poseState[target] || {}), ...propsMap };
    }
    actor.puppet.setPose(map);
  }
  function resetActorPose(actor) {
    const zero = {};
    for (const [target, propsMap] of Object.entries(actor.poseState)) {
      zero[target] = {};
      for (const prop of Object.keys(propsMap)) zero[target][prop] = POSE_REST[prop] ?? 0;
    }
    actor.puppet.setPose(zero);
    actor.poseState = {};
  }

  // Glide an actor to a stage-fraction x. Cancelable; snaps under reduced
  // motion. The walk cycle itself is the caller's clip choice.
  function moveActor(actor, toFx, { ms = 1400 } = {}) {
    const { w } = stage.size();
    const fromFx = actor.fx;
    actor.fx = toFx;
    if (reduced || theater.timeScale > 1 || Math.abs(toFx - fromFx) < 0.001) {
      placeActor(actor);
      return wait(reduced ? 0 : ms);   // fast mode still consumes (scaled) time
    }
    return new Promise((resolve) => {
      const start = performance.now();
      const dur = ms / theater.timeScale;
      let raf = 0;
      const cancel = () => { if (raf) cancelAnimationFrame(raf); motions.delete(cancel); placeActor(actor); resolve(); };
      motions.add(cancel);
      const step = (now) => {
        const t = Math.min(1, (now - start) / dur);
        const fx = fromFx + (toFx - fromFx) * ease.inOutSine(t);
        const save = actor.fx; actor.fx = fx; placeActor(actor); actor.fx = save;
        if (t < 1) { raf = requestAnimationFrame(step); } else { motions.delete(cancel); placeActor(actor); resolve(); }
      };
      raf = requestAnimationFrame(step);
    });
  }

  // --- props ---------------------------------------------------------------------
  const stageK = () => (Math.min(stage.size().w, stage.size().h) / 1024) * worldScale;

  function propTargetGlobal(prop) {
    const holder = actors[prop.holder];
    if (!holder) return null;
    const bone = holder.puppet.bones[prop.handBone];
    if (!bone) return null;
    const off = prop.handOffset;
    return bone.container.toGlobal(new PIXI.Point(off[0], off[1]));
  }

  function layoutProp(prop) {
    const s = prop.scale * stageK();
    const holder = actors[prop.holder];
    prop.sprite.scale.set(holder && holder.flip ? -s : s, s);
    if (prop.holder) {
      const g = propTargetGlobal(prop);
      if (g) prop.sprite.position.copyFrom(propLayer.toLocal(g));
    } else if (prop.fx != null) {
      const { w, h } = stage.size();
      prop.sprite.position.set(prop.fx * w, prop.fy * h);
    }
  }

  // One ticker follows every held prop so any arm clip animates it for free.
  const followProps = () => {
    for (const prop of Object.values(props)) if (prop.holder && !prop.animating) layoutProp(prop);
  };
  stage.app.ticker.add(followProps);

  /** Spawn a prop sprite. Held (holder+handBone+handOffset) or placed (fx/fy). */
  async function addProp(id, def = {}) {
    let sprite;
    if (def.art) {
      const tex = await PIXI.Assets.load(new URL(def.art, document.baseURI).href).catch(() => null);
      sprite = tex ? new PIXI.Sprite(tex) : null;
    }
    if (!sprite) {   // greybox placeholder
      sprite = new PIXI.Graphics();
      sprite.roundRect(-70, -50, 140, 100, 24).fill(def.color || '#e8b23a');
    }
    if (sprite.anchor) sprite.anchor.set(0.5);
    propLayer.addChild(sprite);
    const prop = {
      id, sprite,
      scale: def.scale ?? 0.5,
      holder: def.holder || null,
      handBone: def.handBone || 'arm-lower.R',
      handOffset: def.handOffset || [0, 110],
      fx: def.fx ?? null, fy: def.fy ?? null,
      animating: false,
    };
    props[id] = prop;
    layoutProp(prop);
    return prop;
  }

  // Animate a prop from where it is to a global point along a little arc,
  // then run `settle`. Cancelable; snaps in fast/reduced mode.
  function flyProp(prop, targetGlobal, { ms = 500 } = {}, settle) {
    const from = prop.sprite.position.clone();
    const to = propLayer.toLocal(targetGlobal);
    const finish = () => { prop.animating = false; if (settle) settle(); layoutProp(prop); };
    if (reduced || theater.timeScale > 1) { finish(); return wait(reduced ? 0 : ms); }
    prop.animating = true;
    const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 60 * stageK() };
    const path = [from, mid, to];
    return new Promise((resolve) => {
      const start = performance.now();
      let raf = 0;
      const cancel = () => { if (raf) cancelAnimationFrame(raf); motions.delete(cancel); finish(); resolve(); };
      motions.add(cancel);
      const step = (now) => {
        const t = Math.min(1, (now - start) / ms);
        const p = catmullRom(path, ease.inOutSine(t));
        prop.sprite.position.set(p.x, p.y);
        if (t < 1) { raf = requestAnimationFrame(step); } else { motions.delete(cancel); finish(); resolve(); }
      };
      raf = requestAnimationFrame(step);
    });
  }

  function removeProp(id) {
    const prop = props[id];
    if (!prop) return;
    prop.sprite.destroy();
    delete props[id];
  }
  function clearProps() { Object.keys(props).forEach(removeProp); }

  /** Hand a prop to an actor (arc flight into their paw), or drop it at fx/fy. */
  function handProp(id, holderName, { ms = 500 } = {}) {
    const prop = props[id];
    const holder = actors[holderName];
    if (!prop || !holder) return Promise.resolve();
    const probe = { ...prop, holder: holderName };
    const g = propTargetGlobal(probe) || prop.sprite.getGlobalPosition();
    return flyProp(prop, g, { ms }, () => { prop.holder = holderName; prop.fx = null; prop.fy = null; });
  }
  function placeProp(id, fx, fy, { ms = 500 } = {}) {
    const prop = props[id];
    if (!prop) return Promise.resolve();
    const { w, h } = stage.size();
    const g = propLayer.toGlobal(new PIXI.Point(fx * w, fy * h));
    return flyProp(prop, g, { ms }, () => { prop.holder = null; prop.fx = fx; prop.fy = fy; });
  }

  // --- voice ----------------------------------------------------------------------
  // Character lines play through the game's single unlocked voice channel
  // (voice-clips.js). We latch the puppet+cues just before sayFile() and start
  // lip-sync the moment the channel fires onClip with the element.
  let pendingLip = null;
  let lipStop = null;
  let lipGen = 0;   // bumped on every stop/new-line so a stale 'playing' can't arm
  function stopLip() { lipGen++; if (lipStop) { lipStop(); lipStop = null; } pendingLip = null; }
  const offClip = voiceClips.onClip((key, el) => {
    if (!pendingLip) return;
    const lip = pendingLip;
    stopLip();               // stops any running lip, bumps gen, clears pendingLip
    const gen = lipGen;
    // onClip fires BEFORE el.play() — if driveLipsync's cue walker ticks while
    // the element is still paused it exits instantly and the mouth never moves.
    // Arm it only once playback has actually begun.
    const start = () => {
      if (theater.destroyed || gen !== lipGen) return;
      lipStop = driveLipsync(lip.puppet, el, lip.cues,
        { offsetMs: lip.offsetMs, map: VISEME_IDENTITY });
    };
    if (!el.paused && !el.ended) start();
    else el.addEventListener('playing', start, { once: true });
  });

  /**
   * A character speaks: recorded line + viseme cues when the character's
   * voice folder has it, Web Speech (+ mouth flap) otherwise. Plays `talk`
   * during the line and restores the previous looping clip after.
   */
  async function sayLine(actor, lineId, text) {
    if (theater.muted) return wait(200);
    const prev = actor.puppet.currentClip;
    actor.puppet.playClip('talk');
    const line = actor.lines[lineId];
    if (line && line.audio) {
      const cues = line.cues ? await getCues(new URL(line.cues, actor.voiceBase).href) : null;
      if (cues) pendingLip = { puppet: actor.puppet, cues, offsetMs: line.offsetMs || 0 };
      await voiceClips.sayFile(new URL(line.audio, actor.voiceBase).href, text || line.text, line.dur);
      stopLip();
    } else {
      const stopFlap = visemeFlap(actor.puppet);
      await speech.speak(text || lineId, { pitch: actor.fallbackPitch });
      stopFlap();
    }
    actor.puppet.playClip(prev && prev !== 'talk' ? prev : 'idle');
  }

  async function narrate(key, text) {
    if (theater.muted) return wait(200);
    if (narrateCb) return narrateCb(key, text);
    return speech.speak(text);
  }

  // --- beat sequencer ----------------------------------------------------------------
  // One beat at a time; `{ parallel: [...] }` runs its beats simultaneously.
  // See engines/puppet-theater.js and the game config for the grammar.
  async function runBeat(beat, tok) {
    if (tok.aborted || theater.destroyed) return;
    if (beat.parallel) { await Promise.all(beat.parallel.map((b) => runBeat(b, tok))); return; }
    if (beat.wait) { await wait(beat.wait); return; }
    if (beat.narrator) { await narrate(beat.narrator, beat.text); return; }
    if (beat.fx) { playFx(beat.fx, beat.at); return; }
    if (beat.prop) {
      if (beat.holder) await handProp(beat.prop, beat.holder, { ms: beat.ms ?? 500 });
      else if (beat.to) await placeProp(beat.prop, beat.to[0], beat.to[1] === 'floor' ? floorY : beat.to[1], { ms: beat.ms ?? 500 });
      return;
    }

    const actor = actors[beat.actor];
    if (!actor) return;

    if (beat.enter) {
      actor.fx = beat.enter === 'left' ? -0.3 : 1.3;   // fully offstage even at 2× cast scale
      placeActor(actor);
      actor.puppet.playClip('walk');
      await moveActor(actor, beat.to ? beat.to[0] : 0.5, { ms: beat.ms ?? 1800 });
      if (!tok.aborted) actor.puppet.playClip('idle');
      return;
    }
    if (beat.to) {
      actor.puppet.playClip('walk');
      await moveActor(actor, beat.to[0], { ms: beat.ms ?? 1200 });
      if (!tok.aborted) actor.puppet.playClip('idle');
      return;
    }
    if (beat.pose) setActorPose(actor, beat.pose);
    if (beat.clip) {
      const clip = actor.rig.clips[beat.clip];
      if (!clip) return;
      const oneShot = beat.loop != null ? !beat.loop : !clip.loop;
      if (!oneShot) { actor.puppet.playClip(beat.clip, { loop: true }); return; }
      if (theater.timeScale > 1) {   // automation: don't wait out real durations
        actor.puppet.playClip(beat.clip);
        await wait(clip.duration || 800);
        return;
      }
      await new Promise((res) => actor.puppet.playClip(beat.clip, { loop: false, onDone: res }));
      return;
    }
    if (beat.say) { await sayLine(actor, beat.say, beat.text); return; }
  }

  /** Run a beat list. Resolves when done or when interrupt() aborts it. */
  async function runBeats(beats) {
    const tok = token;
    for (const beat of beats || []) {
      if (tok.aborted || theater.destroyed) return false;
      await runBeat(beat, tok);
    }
    return !tok.aborted;
  }

  // --- fx --------------------------------------------------------------------------
  function fxPoint(at) {
    if (props[at]) return props[at].sprite.position;
    const a = actors[at];
    if (a) {
      const p = a.puppet.view.position;
      return { x: p.x, y: p.y - 40 * stageK() };
    }
    const { w, h } = stage.size();
    return { x: w / 2, y: h / 2 };
  }
  function playFx(kind, at) {
    if (reduced || theater.muted) return;
    const p = fxPoint(at);
    if (kind === 'burst') burst(PIXI, fxLayer, p.x, p.y);
    else if (kind === 'sparkle') sparkle(PIXI, fxLayer, p.x, p.y);
    else if (kind === 'sad-puff') sadPuff(p.x, p.y);
  }
  // Three soft gray-blue wisps drifting up — the gentle "that felt bad" accent.
  function sadPuff(x, y) {
    const bits = [];
    for (let i = 0; i < 3; i++) {
      const g = new PIXI.Graphics();
      g.circle(0, 0, 7 + i * 3).fill({ color: 0x8ea4b8, alpha: 0.55 });
      g.position.set(x + (i - 1) * 22, y);
      fxLayer.addChild(g);
      bits.push(g);
    }
    const start = performance.now();
    const tick = (now) => {
      const t = (now - start) / 1300;
      if (t >= 1) { bits.forEach((b) => b.destroy()); return; }
      bits.forEach((b, i) => { b.y -= 0.5 + i * 0.15; b.alpha = 0.55 * (1 - t); });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // --- tableau capture / restore ------------------------------------------------------
  // The problem tableau is captured once (end of setup) and snapped back to
  // after each preview / failed resolution, so vignettes never leak state.
  function captureTableau() {
    return {
      actors: Object.fromEntries(Object.entries(actors).map(([name, a]) => [name, {
        fx: a.fx, flip: a.flip,
        clip: a.puppet.currentClip || 'idle',
        pose: JSON.parse(JSON.stringify(a.poseState)),
      }])),
      props: Object.fromEntries(Object.entries(props).map(([id, p]) => [id, {
        holder: p.holder, fx: p.fx, fy: p.fy,
      }])),
    };
  }
  function restoreTableau(t) {
    if (!t) return;
    motions.forEach((cancel) => cancel());
    motions.clear();
    stopLip();
    for (const [name, snap] of Object.entries(t.actors)) {
      const a = actors[name];
      if (!a) continue;
      a.fx = snap.fx; a.flip = snap.flip;
      resetActorPose(a);
      setActorPose(a, snap.pose);
      placeActor(a);
      a.puppet.playClip(snap.clip);
    }
    for (const [id, snap] of Object.entries(t.props)) {
      const p = props[id];
      if (!p) continue;
      p.animating = false;
      p.holder = snap.holder; p.fx = snap.fx; p.fy = snap.fy;
      layoutProp(p);
    }
  }

  // --- layout / lifecycle ----------------------------------------------------------
  const offResize = stage.onResize(() => {
    layoutBackdrop();
    Object.values(actors).forEach(placeActor);
    Object.values(props).forEach(layoutProp);
  });

  function destroy() {
    theater.destroyed = true;
    interrupt();
    offClip();
    offResize();
    stage.app.ticker.remove(followProps);
    Object.values(actors).forEach((a) => a.puppet.destroy());
    view.destroy({ children: true });
  }

  if (opts.backdrop) await setBackdrop(opts.backdrop);

  return Object.assign(theater, {
    addActor, removeActor, placeActor, moveActor,
    setActorPose, resetActorPose,
    addProp, removeProp, clearProps, handProp, placeProp,
    sayLine, narrate,
    runBeats, interrupt,
    playFx, setBackdrop,
    captureTableau, restoreTableau,
    wait, destroy,
    get reduced() { return reduced; },
  });
}
