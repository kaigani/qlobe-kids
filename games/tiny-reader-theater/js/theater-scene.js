// theater-scene.js — the two-puppet stage for Tiny Reader Theater.
//
// Wraps createStage/createTheater for EXACTLY two chosen puppets on the
// selected setting's backdrop, and turns each story line's named beat into a
// real two-actor performance timed against the narrator's recorded clip.
//
// Staging model (the "rescue" rebuild):
//   - Every NODE declares scenery (back-layer props: log, tree, door, den, mud)
//     and story props (map, bird, nut, gem, …) in config.json `staging`.
//     `beginNode()` walks the pair offstage, swaps the set, and strolls them
//     back on while the child is still tapping the first line — a real scene
//     change, never a hard cut.
//   - Every LINE has its own beat (config `beats[i]`), built here from a
//     vocabulary of ~39 bespoke builders that compose walks, clips, prop
//     flights, hand-offs and particle accents, all sized to the narration.
//   - Between performances the puppets are never inert: an ambient fidget loop
//     has them glance, nod and shuffle, and every word the child taps gets a
//     little acknowledging bob from one of them (they're listening!).
//
// The performance is scheduled AROUND `voiceClips.duration('line:<setting>:<node>:<i>')`:
// `performLine()` starts narration and beats together and pads/trims the
// beat's waits so the puppets are still acting when the sentence ends, and not
// long after.
//
// Beat vocabulary uses only clips that exist in
// shared/characters/acting-clips.json (think, ask, offer, grab, nod, hug,
// cheer, sad, stomp, groove, head-shake, …) or in every rig's own clips (idle,
// wave, walk, jump, talk). An unknown beat name degrades to a gentle default.
// Any prop whose art fails to load is skipped — body language alone is still
// a performance, and a greybox rectangle on stage is worse than no prop.

import { createStage } from '../../../shared/js/stage/stage.js';
import { createTheater } from '../../../shared/js/stage/theater.js';

/** Where the pair stands at rest, as stage-width fractions. */
export const HOME_MARKS = { a: 0.33, b: 0.67 };
/** Where they gather for a shared beat. */
const CLOSE_MARKS = { a: 0.41, b: 0.59 };
/** Fully offstage, matching theater.js's own enter positions. */
const OFF = { left: -0.3, right: 1.3 };

/**
 * The prop kit. Art lives in assets/props/ (extracted from the approved
 * choice-card art or generated in the same felt world). `held` props ride a
 * hand bone; everything else is placed in stage fractions. `start` is where a
 * prop waits when its node begins (offstage values let a beat fly it in).
 */
const PROP_KIT = {
  // Scales are tuned to the SHIPPED cutout sizes (256–640px sources), not the
  // 1024 canvas the layered extractor works on — see the 2026-08 staging shots.
  map: { art: './assets/props/map.webp', scale: 0.45, held: { handBone: 'arm-lower.R', handOffset: [0, 120] }, rotation: -0.12, start: { x: 0.5, y: 0.86 } },
  gem: { art: './assets/props/gem.webp', scale: 0.3, start: { x: 0.32, y: 0.86, alpha: 0 } },
  nut: { art: './assets/props/nut.webp', scale: 0.3, start: { x: 1.15, y: 0.6 } },
  bird: { art: './assets/props/bird.webp', scale: 0.3, start: { x: -0.15, y: 0.35 } },
  'mama-bird': { art: './assets/props/bird.webp', scale: 0.52, flip: true, start: { x: 1.18, y: 0.15 } },
  nest: { art: './assets/props/nest.webp', scale: 0.38, start: { x: -0.18, y: 0.55 } },
  moon: { art: './assets/props/moon.webp', scale: 0.4, start: { x: 0.84, y: 0.5, alpha: 0 } },
  'fox-cub': { art: './assets/props/fox-cub.webp', scale: 0.4, start: { x: 0.28, y: 0.82, alpha: 0 } },
  squirrel: { art: './assets/props/squirrel.webp', scale: 0.42, start: { x: 1.18, y: 0.84 } },
  'bug-1': { art: './assets/props/bug.webp', scale: 0.3, start: { x: 0.62, y: 0.78, alpha: 0 } },
  'bug-2': { art: './assets/props/bug.webp', scale: 0.26, start: { x: 0.74, y: 0.84, alpha: 0 } },
  'bug-3': { art: './assets/props/bug.webp', scale: 0.22, start: { x: 0.86, y: 0.76, alpha: 0 } },
  // Scenery (back layer). x/y/scale come from config staging entries.
  log: { art: './assets/props/log.webp', scenery: true },
  tree: { art: './assets/props/tree.webp', scenery: true },
  door: { art: './assets/props/door.webp', scenery: true },
  den: { art: './assets/props/den.webp', scenery: true },
  mud: { art: './assets/props/mud.webp', scenery: true },

  // --- castle (2026-08) ---------------------------------------------------
  trumpet: { art: './assets/props/trumpet.webp', scale: 0.36, start: { x: 1.15, y: 0.32, alpha: 0 } },
  crown: { art: './assets/props/crown.webp', scale: 0.28, start: { x: 0.5, y: 0.6, alpha: 0 } },
  cat: { art: './assets/props/cat.webp', scale: 0.4, start: { x: 0.62, y: 0.8, alpha: 0 } },
  mouse: { art: './assets/props/mouse.webp', scale: 0.26, start: { x: 1.18, y: 0.85, alpha: 0 } },
  dragon: { art: './assets/props/dragon.webp', scale: 0.46, start: { x: 0.5, y: 0.82, alpha: 0 } },
  tissue: { art: './assets/props/tissue.webp', scale: 0.32, start: { x: 1.15, y: 0.6, alpha: 0 } },
  'ring-1': { art: './assets/props/ring.webp', scale: 0.2, start: { x: 0.5, y: 0.7, alpha: 0 } },
  'ring-2': { art: './assets/props/ring.webp', scale: 0.16, start: { x: 0.56, y: 0.58, alpha: 0 } },
  'ring-3': { art: './assets/props/ring.webp', scale: 0.13, start: { x: 0.62, y: 0.46, alpha: 0 } },
  drum: { art: './assets/props/drum.webp', scale: 0.4, start: { x: -0.15, y: 0.86, alpha: 0 } },
  // Scenery (back layer). x/y/scale come from config staging entries.
  gate: { art: './assets/props/gate.webp', scenery: true, scale: 1.0 },
  throne: { art: './assets/props/throne.webp', scenery: true, scale: 0.75 },

  // --- outer space (2026-08) ------------------------------------------------
  // Scales computed from the SHIPPED cutout pixel widths (rocket 254px, flag
  // 177px, star 256px, earth 320px, moon-friend 320px, snack 320px — all
  // narrower than forest/castle's typical ~512px props), not copied from
  // forest/castle's 0.3-ish numbers (that undersizes ~2.5x per the recipe note).
  rocket: { art: './assets/props/rocket.webp', scale: 0.78, start: { x: 0.5, y: 0.84 } },
  flag: { art: './assets/props/flag.webp', scale: 0.62, start: { x: 0.5, y: 0.6, alpha: 0 } },
  star: { art: './assets/props/star.webp', scale: 0.5, start: { x: 0.18, y: 0.12, alpha: 1 } },
  // x:0.82 (not 0.36) — that x/y sat behind the title banner artwork and was
  // invisible in the 2026-08 staging pass; mirrors `star`'s clear left-side spot.
  'star-2': { art: './assets/props/star.webp', scale: 0.38, start: { x: 0.82, y: 0.12, alpha: 1 } },
  earth: { art: './assets/props/earth.webp', scale: 0.46, start: { x: 0.62, y: 0.25, alpha: 0 } },
  'moon-friend': { art: './assets/props/moon-friend.webp', scale: 0.58, start: { x: 0.62, y: 0.8, alpha: 1 } },
  snack: { art: './assets/props/snack.webp', scale: 0.44, start: { x: 1.15, y: 0.6, alpha: 0 } },
  // Scenery (back layer). x/y/scale come from config staging entries.
  rock: { art: './assets/props/rock.webp', scenery: true },
  crater: { art: './assets/props/crater.webp', scenery: true },
  'moon-house': { art: './assets/props/moon-house.webp', scenery: true },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * How long a line takes to say when no recording backs it (Web Speech).
 * Deliberately generous: a beat that finishes slightly early reads as the
 * puppets settling; one that finishes late reads as a bug.
 */
function estimateMs(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length || 1;
  return clamp(600 + words * 420, 1400, 6000);
}

/** Decode an image up front; null means "skip this prop entirely". */
function probeImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/**
 * Mount the stage and cast.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.host       the element the Pixi canvas fills
 * @param {object} opts.setting         a config.json settings[] entry
 * @param {string[]} opts.cast          exactly two shared/characters ids
 * @param {object} opts.voice           the voice-clips module
 * @param {() => number} [opts.random]  seeded RNG for the cosmetic fidgets
 * @returns {Promise<object>} the scene controller
 */
export async function createTheaterScene({ host, setting, cast, voice, random = Math.random }) {
  const pair = (cast || []).slice(0, 2);
  if (pair.length !== 2) throw new Error('theater-scene: exactly two cast members are required');

  const stage = await createStage(host);
  const theater = await createTheater(stage, {
    backdrop: setting?.stage?.backdrop,
    floorY: setting?.stage?.floorY ?? 0.84,
    worldScale: 1.1,
    // The theater's narrator IS the game's voice channel, so a `{ narrator }`
    // beat and a directly-awaited line are the same audio path — no second
    // channel to unlock, mute or race against.
    narrate: (key, text) => (voice && typeof voice.say === 'function'
      ? voice.say(key, text)
      : Promise.resolve()),
  });
  stage.root.addChild(theater.view);

  // The pair mounts OFFSTAGE: the first node's beginNode() strolls them on, so
  // the story always opens with an entrance instead of two dangling puppets.
  const actors = {
    a: await theater.addActor('a', pair[0], { x: OFF.left, flip: false, scale: 0.62, widthShare: 0.38 }),
    b: await theater.addActor('b', pair[1], { x: OFF.right, flip: true, scale: 0.62, widthShare: 0.38 }),
  };
  actors.a.puppet.playClip('idle');
  actors.b.puppet.playClip('idle');

  // Which PROP_KIT entries actually have decodable art this session.
  const availableArt = {};
  await Promise.all(Object.entries(PROP_KIT).map(async ([id, def]) => {
    availableArt[id] = await probeImage(new URL(def.art, document.baseURI).href);
  }));

  let destroyed = false;
  let performing = false;
  let transitioning = null;   // beginNode's in-flight promise
  let nodeCount = 0;
  let lastTapReact = 0;       // alternates the word-tap bob between actors
  const livePropIds = new Set();

  // Interruption: theater.runBeats tokens only cover ONE runBeats call, and a
  // performance here is a LIST of runBeats calls (plus custom steps). runGen is
  // the scene-wide "everything before this is cancelled" counter.
  let runGen = 0;
  function interruptAll() {
    runGen += 1;
    theater.interrupt();
  }

  const onStage = (actor) => actor.fx > 0.02 && actor.fx < 0.98;

  // ---- ambient life ---------------------------------------------------------
  // A gentle fidget loop: every few seconds one puppet glances, nods, shuffles
  // half a step, or waves at the other. Silent, cosmetic, and skipped when a
  // performance is running, when the pair is offstage, in fast/QA mode, and
  // under prefers-reduced-motion.
  const FIDGETS = ['nod', 'ask', 'wave', 'head-shake', 'jump'];
  let fidgetOn = true;
  (async function fidgetLoop() {
    while (!destroyed) {
      await theater.wait(2800 + random() * 4200);
      if (destroyed || !fidgetOn || performing || transitioning) continue;
      if (theater.timeScale > 1 || theater.reduced) continue;
      const actor = random() < 0.5 ? actors.a : actors.b;
      if (!onStage(actor)) continue;
      const roll = random();
      if (roll < 0.18) {
        // a half-step shuffle toward (or away from) the other puppet
        const dir = (random() < 0.5 ? -1 : 1) * (0.02 + random() * 0.03);
        const fx = clamp(actor.fx + dir, 0.12, 0.88);
        actor.puppet.playClip('walk');
        await theater.moveActor(actor, fx, { ms: 600 });
        if (!destroyed && !performing) actor.puppet.playClip('idle');
      } else {
        const clip = FIDGETS[Math.floor(random() * FIDGETS.length)];
        playOneShot(actor, clip);
      }
    }
  })();

  /** Play a one-shot clip and settle back to idle without blocking anyone. */
  function playOneShot(actor, clip) {
    if (destroyed || !actor.rig.clips[clip]) return;
    actor.puppet.playClip(clip, { loop: false, onDone: () => {
      if (!destroyed && !performing) actor.puppet.playClip('idle');
    } });
  }

  /**
   * The child tapped a word: one puppet gives a quick acknowledging bob, so
   * reading TO the puppets is the fiction. Alternates actors; stays out of the
   * way of performances, transitions, and QA drives.
   */
  function reactToWord() {
    if (destroyed || performing || transitioning || theater.timeScale > 1 || theater.reduced) return;
    lastTapReact = 1 - lastTapReact;
    const actor = lastTapReact ? actors.a : actors.b;
    if (!onStage(actor)) return;
    playOneShot(actor, random() < 0.85 ? 'nod' : 'jump');
  }

  // ---- props ----------------------------------------------------------------

  function hasProp(id) { return livePropIds.has(id); }

  async function spawnProp(id, override = {}) {
    const def = PROP_KIT[id];
    if (!def || !availableArt[id]) return false;
    const start = { ...(def.start || {}), ...override };
    await theater.addProp(id, {
      art: def.art,
      scale: override.scale ?? def.scale ?? 0.5,
      rotation: def.rotation || 0,
      layer: def.scenery ? 'back' : undefined,
      fx: start.x ?? 0.5,
      fy: start.y ?? theater.floorY,
      alpha: start.alpha ?? 1,
      ...(def.held ? { handBone: def.held.handBone, handOffset: def.held.handOffset } : {}),
    });
    if (def.flip) {
      const prop = theater.props[id];
      if (prop) { prop.sprite.scale.x *= -1; prop.baseFlip = true; }
    }
    livePropIds.add(id);
    return true;
  }

  /** Tween a held prop's own rotation (layoutProp re-reads it every frame). */
  async function spinProp(id, toRotation, ms) {
    const prop = theater.props[id];
    if (!prop) return;
    const gen = runGen;
    const from = prop.rotation;
    if (theater.reduced || theater.timeScale > 1) {
      prop.rotation = toRotation;
      await theater.wait(ms);
      return;
    }
    const steps = Math.max(4, Math.round(ms / 90));
    for (let i = 1; i <= steps; i += 1) {
      if (destroyed || gen !== runGen) return;
      prop.rotation = from + ((toRotation - from) * i) / steps;
      await theater.wait(ms / steps);
    }
  }

  /**
   * Rise/descend an actor vertically (fy is a stage-height fraction added to
   * the floor line; negative is up). theater.moveActor only knows x, so this
   * is the game's own little elevator — used for tree climbing.
   */
  async function riseActor(actor, toFy, ms) {
    const gen = runGen;
    const from = Number(actor.fy) || 0;
    if (theater.reduced || theater.timeScale > 1) {
      actor.fy = toFy; theater.placeActor(actor);
      await theater.wait(ms);
      return;
    }
    const steps = Math.max(4, Math.round(ms / 60));
    for (let i = 1; i <= steps; i += 1) {
      if (destroyed || gen !== runGen) return;
      actor.fy = from + ((toFy - from) * i) / steps;
      theater.placeActor(actor);
      await theater.wait(ms / steps);
    }
  }

  // ---- node transitions -----------------------------------------------------

  /**
   * A new story node: walk the pair offstage (if they're on), strike the set,
   * dress the new one, and stroll the pair back on — all while the child is
   * already tapping the new node's first line. Fire-and-forget from main.js;
   * performLine() awaits the tail end so a fast tapper never overlaps it.
   */
  function beginNode(node) {
    const run = (async () => {
      if (destroyed) return;
      interruptAll();
      const wasOn = onStage(actors.a) || onStage(actors.b);
      nodeCount += 1;
      const gen = runGen;
      if (wasOn) {
        // exit toward the nearest wing, together, briskly
        actors.a.puppet.playClip('walk');
        actors.b.puppet.playClip('walk');
        await Promise.all([
          theater.moveActor(actors.a, actors.a.fx < 0.5 ? OFF.left : OFF.right, { ms: 800 }),
          theater.moveActor(actors.b, actors.b.fx < 0.5 ? OFF.left : OFF.right, { ms: 800 }),
        ]);
      }
      if (destroyed || gen !== runGen) return;
      // strike the old set, dress the new one
      theater.clearProps();
      livePropIds.clear();
      actors.a.fy = 0; actors.b.fy = 0;
      const staging = node?.staging || {};
      for (const item of staging.scenery || []) {
        if (!item || !item.prop) continue;
        await spawnProp(item.prop, { x: item.x, y: item.y, scale: item.scale });
      }
      for (const entry of staging.props || []) {
        const id = typeof entry === 'string' ? entry : entry?.prop;
        if (!id) continue;
        const override = typeof entry === 'object' ? { x: entry.x, y: entry.y } : {};
        await spawnProp(id, override);
      }
      if (destroyed || gen !== runGen) return;
      // stroll back on from opposite wings
      actors.a.fx = OFF.left; actors.b.fx = OFF.right;
      theater.placeActor(actors.a); theater.placeActor(actors.b);
      actors.a.puppet.playClip('walk');
      actors.b.puppet.playClip('walk');
      await Promise.all([
        theater.moveActor(actors.a, HOME_MARKS.a, { ms: 1500 }),
        theater.moveActor(actors.b, HOME_MARKS.b, { ms: 1500 }),
      ]);
      if (destroyed) return;
      actors.a.puppet.playClip('idle');
      actors.b.puppet.playClip('idle');
    })();
    transitioning = run.finally(() => { if (transitioning === run) transitioning = null; });
    return transitioning;
  }

  // ---- beat builders --------------------------------------------------------
  // Each builder returns a runBeats-grammar list sized to `ms` of narration.
  // Shared shape: setup moves, a clip phase with known durations, prop/fx
  // accents, then the leftover budget as a trailing wait.

  const both = (clipA, clipB) => ({ parallel: [{ actor: 'a', clip: clipA }, { actor: 'b', clip: clipB || clipA }] });
  const goTo = (fa, fb, ms) => ({ parallel: [{ actor: 'a', to: [fa], ms }, { actor: 'b', to: [fb], ms }] });
  const rest = [{ parallel: [{ actor: 'a', clip: 'idle' }, { actor: 'b', clip: 'idle' }] }];
  const fly = (id, target, ms) => (hasProp(id) ? [{ prop: id, transform: target, ms }] : []);
  const hand = (id, holder, ms = 480) => (hasProp(id) ? [{ prop: id, holder, ms }] : []);
  const spark = (at) => ({ fx: 'sparkle', at });
  const boom = (at) => ({ fx: 'burst', at });

  /**
   * The beat table. Each entry: (budget, pad) => beats[]. `pad(used)` turns the
   * unused narration budget into a trailing wait.
   */
  const BEATS = {
    // --- beginning: the upside-down map -------------------------------------
    // The map is picked up UPSIDE DOWN (that's the joke), gets peered at and
    // wobbled through line 2, and only spins right-side-up on line 3.
    'walk-on-discover': (b, pad) => {
      const move = clamp(b * 0.3, 420, 1200);
      return [
        goTo(CLOSE_MARKS.a, CLOSE_MARKS.b, move),
        ...hand('map', 'a'),
        { custom: () => spinProp('map', Math.PI - 0.15, 350) },
        both('think', 'ask'),
        spark('map'),
      ].concat(pad(move + 480 + 350 + 1200), rest);
    },
    'flip-map': (b, pad) => [
      { parallel: [{ actor: 'a', clip: 'offer' }, { actor: 'b', clip: 'head-shake' }] },
      { custom: () => spinProp('map', Math.PI + 0.35, 400) },
      { custom: () => spinProp('map', Math.PI - 0.35, 400) },
      spark('map'),
      both('head-shake', 'think'),
    ].concat(pad(1100 + 800 + 900), rest),
    'pass-map': (b, pad) => [
      ...hand('map', 'b'),
      { custom: () => spinProp('map', Math.PI * 2 - 0.12, 700) },
      both('nod', 'think'),
      ...hand('map', 'a'),
      spark('map'),
      both('cheer'),
    ].concat(pad(480 + 700 + 900 + 480 + 1100), rest),

    // --- middle-1: the wrong way --------------------------------------------
    'wrong-way': (b, pad) => {
      const walk = clamp(b * 0.32, 500, 1400);
      return [
        goTo(0.2, 0.36, walk),
        both('head-shake', 'ask'),
        goTo(0.48, 0.64, walk),
        spark('a'),
      ].concat(pad(walk * 2 + 1200), rest);
    },
    'march-past': (b, pad) => {
      const walk = clamp(b * 0.35, 600, 1600);
      return [
        goTo(0.24, 0.4, walk),
        both('stomp'),
        spark('log'),
      ].concat(pad(walk + 900), rest);
    },
    'splash-peek': (b, pad) => {
      const walk = clamp(b * 0.3, 420, 1100);
      return [
        goTo(0.48, 0.72, walk),
        both('think', 'jump'),
        boom('mud'),
      ].concat(pad(walk + 1200), rest);
    },

    // --- ending-1-1: dig up a gem -------------------------------------------
    'dig-dig': (b, pad) => {
      const walk = clamp(b * 0.28, 420, 1100);
      return [
        goTo(0.38, 0.52, walk),
        both('grab'),
        both('grab'),
        spark('log'),
      ].concat(pad(walk + 1600), rest);
    },
    'muddy-shake': (b, pad) => [
      both('stomp'),
      boom('a'),
      both('head-shake'),
    ].concat(pad(1800), rest),
    'gem-reveal': (b, pad) => [
      ...fly('gem', { x: 0.42, y: 0.66, alpha: 1, scale: 0.5 }, 900),
      spark('gem'),
      both('cheer'),
      boom('gem'),
    ].concat(pad(900 + 1100), rest),

    // --- ending-1-2: muddy puddles ------------------------------------------
    'puddle-jump': (b, pad) => {
      const walk = clamp(b * 0.3, 420, 1100);
      return [
        goTo(0.42, 0.6, walk),
        both('jump'),
        boom('mud'),
      ].concat(pad(walk + 900), rest);
    },
    'splash-splash': (b, pad) => [
      { actor: 'a', clip: 'jump' },
      boom('mud'),
      { actor: 'b', clip: 'jump' },
      boom('mud'),
      both('cheer'),
    ].concat(pad(2700), rest),
    'laugh-home': (b, pad) => {
      const walk = clamp(b * 0.4, 900, 2400);
      return [
        both('groove'),
        { wait: 700 },
        rest[0],
        { parallel: [{ actor: 'a', to: [OFF.right], ms: walk }, { actor: 'b', to: [OFF.right + 0.12], ms: walk }] },
      ].concat(pad(700 + walk));
    },

    // --- ending-1-3: up the big tree ----------------------------------------
    'climb-up': (b, pad) => {
      const walk = clamp(b * 0.25, 400, 1000);
      return [
        goTo(0.6, 0.76, walk),
        both('jump'),
        { custom: async () => {
          await Promise.all([riseActor(actors.a, -0.16, 900), riseActor(actors.b, -0.2, 1100)]);
        } },
        spark('tree'),
      ].concat(pad(walk + 800 + 1100), rest);
    },
    'see-forest': (b, pad) => [
      both('think', 'ask'),
      spark('b'),
      both('ask', 'think'),
    ].concat(pad(2400), rest),
    'wave-hello': (b, pad) => [
      ...fly('bird', { x: 1.15, y: 0.22 }, clamp(b * 0.6, 1200, 2600)),
      both('wave'),
      spark('a'),
    ].concat(pad(clamp(b * 0.6, 1200, 2600)), rest),

    // --- middle-2: the lost bird --------------------------------------------
    'bird-lands': (b, pad) => [
      ...fly('bird', { x: 0.5, y: 0.82 }, clamp(b * 0.45, 800, 1800)),
      both('ask', 'ask'),
      spark('bird'),
    ].concat(pad(clamp(b * 0.45, 800, 1800) + 1200), rest),
    'sad-bird': (b, pad) => {
      const move = clamp(b * 0.25, 360, 900);
      return [
        goTo(CLOSE_MARKS.a, CLOSE_MARKS.b, move),
        { fx: 'sad-puff', at: 'bird' },
        both('sad'),
        { wait: 1400 },
      ].concat(pad(move + 1400), rest);
    },
    'promise-help': (b, pad) => [
      both('nod'),
      { actor: 'a', clip: 'offer' },
      spark('bird'),
    ].concat(pad(900 + 1100), rest),

    // --- ending-2-1: a cozy nest --------------------------------------------
    'build-nest': (b, pad) => [
      ...fly('nest', { x: 0.5, y: 0.86, alpha: 1 }, clamp(b * 0.4, 700, 1400)),
      both('grab', 'offer'),
      spark('nest'),
    ].concat(pad(clamp(b * 0.4, 700, 1400) + 1100), rest),
    'bird-home': (b, pad) => [
      ...fly('bird', { x: 0.5, y: 0.8 }, clamp(b * 0.4, 700, 1400)),
      spark('nest'),
      both('nod'),
    ].concat(pad(clamp(b * 0.4, 700, 1400) + 900), rest),
    'thank-you': (b, pad) => {
      const move = clamp(b * 0.22, 340, 800);
      return [
        goTo(CLOSE_MARKS.a, CLOSE_MARKS.b, move),
        both('hug'),
        boom('nest'),
      ].concat(pad(move + 1600), rest);
    },

    // --- ending-2-2: sing the bird home -------------------------------------
    'silly-song': (b, pad) => [
      both('groove'),
      spark('a'),
      { wait: 1000 },
      spark('b'),
    ].concat(pad(1000), rest),
    'la-la-tweet': (b, pad) => [
      both('groove'),
      ...fly('bird', { y: 0.78 }, 400),
      spark('bird'),
      ...fly('bird', { y: 0.82 }, 400),
      ...fly('bird', { y: 0.78 }, 400),
      ...fly('bird', { y: 0.82 }, 400),
    ].concat(pad(1600), rest),
    'mama-swoops': (b, pad) => [
      ...fly('mama-bird', { x: 0.62, y: 0.72 }, clamp(b * 0.45, 900, 1800)),
      boom('mama-bird'),
      both('cheer'),
    ].concat(pad(clamp(b * 0.45, 900, 1800) + 1100), rest),

    // --- ending-2-3: the cheeky squirrel ------------------------------------
    'share-nut': (b, pad) => [
      ...hand('nut', 'a'),
      { actor: 'a', clip: 'offer' },
      ...hand('nut', 'b'),
      spark('nut'),
    ].concat(pad(480 + 1100 + 480), rest),
    'nut-steal': (b, pad) => {
      const zip = clamp(b * 0.2, 350, 700);
      return [
        ...fly('squirrel', { x: 0.66, y: 0.85 }, zip),
        ...fly('nut', { x: 0.66, y: 0.84 }, 200),
        { parallel: [
          ...(hasProp('squirrel') ? [{ prop: 'squirrel', transform: { x: OFF.left + 0.1, y: 0.85 }, ms: zip }] : []),
          ...(hasProp('nut') ? [{ prop: 'nut', transform: { x: OFF.left + 0.14, y: 0.84 }, ms: zip }] : []),
        ] },
        both('stomp'),
        both('head-shake'),
      ].concat(pad(zip * 2 + 200 + 1800), rest);
    },
    'share-giggle': (b, pad) => {
      const back = clamp(b * 0.3, 600, 1200);
      return [
        { parallel: [
          ...(hasProp('squirrel') ? [{ prop: 'squirrel', transform: { x: 0.24, y: 0.85 }, ms: back }] : []),
          ...(hasProp('nut') ? [{ prop: 'nut', transform: { x: 0.5, y: 0.88 }, ms: back }] : []),
        ] },
        both('offer'),
        boom('nut'),
        both('cheer'),
      ].concat(pad(back + 2200), rest);
    },

    // --- middle-3: the secret door ------------------------------------------
    'spot-door': (b, pad) => {
      const walk = clamp(b * 0.3, 500, 1300);
      return [
        goTo(0.42, 0.58, walk),
        { actor: 'a', clip: 'ask' },
        spark('door'),
      ].concat(pad(walk + 1200), rest);
    },
    'knock-knock': (b, pad) => [
      { actor: 'a', to: [0.68], ms: 500 },
      { actor: 'a', clip: 'grab' },
      spark('door'),
      { actor: 'a', clip: 'grab' },
      spark('door'),
      { actor: 'b', clip: 'think' },
    ].concat(pad(500 + 1600), rest),
    'door-creaks': (b, pad) => [
      ...fly('door', { rotation: 0.06 }, 300),
      ...fly('door', { rotation: 0 }, 300),
      spark('door'),
      both('think', 'ask'),
    ].concat(pad(600 + 1200), rest),

    // --- ending-3-1: the secret party ---------------------------------------
    'tiptoe-in': (b, pad) => {
      const walk = clamp(b * 0.55, 1200, 2800);
      return [
        goTo(0.44, 0.58, walk),
        spark('a'),
      ].concat(pad(walk), rest);
    },
    'surprise-party': (b, pad) => [
      boom('a'),
      boom('b'),
      both('cheer'),
      { fx: 'burst', at: 'tree' },
    ].concat(pad(1100), rest),
    'dance-moon': (b, pad) => [
      both('groove'),
      ...fly('moon', { x: 0.84, y: 0.16, alpha: 1 }, clamp(b * 0.55, 1200, 2600)),
      spark('moon'),
    ].concat(pad(clamp(b * 0.55, 1200, 2600)), rest),

    // --- ending-3-2: the sleepy fox cub -------------------------------------
    'peek-in': (b, pad) => {
      const walk = clamp(b * 0.32, 500, 1300);
      return [
        goTo(0.4, 0.52, walk),
        both('think'),
        { wait: 900 },
        spark('den'),
      ].concat(pad(walk + 900), rest);
    },
    'sleepy-cub': (b, pad) => [
      ...fly('fox-cub', { alpha: 1 }, 900),
      spark('fox-cub'),
      both('nod'),
    ].concat(pad(900 + 900), rest),
    'tiptoe-away': (b, pad) => {
      const walk = clamp(b * 0.6, 1400, 3200);
      return [
        both('nod'),
        { parallel: [{ actor: 'a', to: [OFF.right], ms: walk }, { actor: 'b', to: [OFF.right + 0.12], ms: walk }] },
      ].concat(pad(900 + walk));
    },

    // --- ending-3-3: the glow bugs ------------------------------------------
    'bugs-blink': (b, pad) => [
      ...fly('bug-1', { alpha: 1 }, 350),
      spark('bug-1'),
      ...fly('bug-2', { alpha: 1 }, 350),
      spark('bug-2'),
      ...fly('bug-3', { alpha: 1 }, 350),
      spark('bug-3'),
      both('ask'),
    ].concat(pad(1050 + 1200), rest),
    'follow-parade': (b, pad) => {
      const drift = clamp(b * 0.6, 1400, 3000);
      return [
        { parallel: [
          ...(hasProp('bug-1') ? [{ prop: 'bug-1', transform: { x: 0.2, y: 0.78 }, ms: drift }] : []),
          ...(hasProp('bug-2') ? [{ prop: 'bug-2', transform: { x: 0.32, y: 0.84 }, ms: drift }] : []),
          ...(hasProp('bug-3') ? [{ prop: 'bug-3', transform: { x: 0.44, y: 0.76 }, ms: drift }] : []),
          { actor: 'a', to: [0.52], ms: drift },
          { actor: 'b', to: [0.66], ms: drift },
        ] },
        spark('bug-1'),
      ].concat(pad(drift), rest);
    },
    'twinkle-stars': (b, pad) => [
      { parallel: [
        ...(hasProp('bug-1') ? [{ prop: 'bug-1', transform: { x: 0.24, y: 0.18 }, ms: 1600 }] : []),
        ...(hasProp('bug-2') ? [{ prop: 'bug-2', transform: { x: 0.44, y: 0.12 }, ms: 1600 }] : []),
        ...(hasProp('bug-3') ? [{ prop: 'bug-3', transform: { x: 0.62, y: 0.2 }, ms: 1600 }] : []),
      ] },
      spark('bug-1'),
      spark('bug-2'),
      spark('bug-3'),
      both('cheer'),
      both('wave'),
    ].concat(pad(1600 + 2000), rest),

    // --- beginning: the castle gate ------------------------------------------
    'trumpet-hello': (b, pad) => {
      const move = clamp(b * 0.3, 420, 1200);
      const fly1 = clamp(b * 0.35, 700, 1400);
      return [
        goTo(CLOSE_MARKS.a, CLOSE_MARKS.b, move),
        // At actor a's (bear's) mouth height, not dead-center between both
        // heads — x:0.5 overlapped the fox's face since the two puppets
        // stand close together here.
        ...fly('trumpet', { x: CLOSE_MARKS.a + 0.06, y: 0.46, alpha: 1 }, fly1),
        { actor: 'a', clip: 'play-blow' },
        spark('trumpet'),
        { wait: 900 },
      ].concat(pad(move + fly1 + 900), rest);
    },
    'gate-opens': (b, pad) => [
      ...fly('gate', { rotation: 0.05 }, 250),
      ...fly('gate', { rotation: -0.03 }, 250),
      ...fly('gate', { rotation: 0 }, 250),
      both('ask'),
      spark('gate'),
    ].concat(pad(750 + 1200), rest),
    'walk-in': (b, pad) => {
      const walk = clamp(b * 0.5, 900, 2400);
      return [
        goTo(0.62, 0.78, walk),
        spark('gate'),
      ].concat(pad(walk + 900), rest);
    },

    // --- middle-1: the lost crown --------------------------------------------
    'crown-gone': (b, pad) => {
      const move = clamp(b * 0.22, 340, 900);
      return [
        goTo(CLOSE_MARKS.a, CLOSE_MARKS.b, move),
        { parallel: [{ actor: 'a', clip: 'ask' }, { actor: 'b', clip: 'head-shake' }] },
        { fx: 'sad-puff', at: 'a' },
      ].concat(pad(move + 1600), rest);
    },
    'look-around': (b, pad) => {
      const walk = clamp(b * 0.28, 420, 1100);
      return [
        goTo(0.24, 0.4, walk),
        both('ask'),
        goTo(0.5, 0.66, walk),
        both('think'),
      ].concat(pad(walk * 2 + 1800), rest);
    },
    'who-hid': (b, pad) => [
      both('think'),
      spark('a'),
      { wait: 900 },
    ].concat(pad(1800), rest),

    // --- ending-1-1: the sleepy cat -------------------------------------------
    'peek-throne': (b, pad) => {
      const walk = clamp(b * 0.32, 500, 1300);
      return [
        goTo(0.5, 0.58, walk),
        both('think'),
        { wait: 900 },
      ].concat(pad(walk + 900), rest);
    },
    'sleepy-cat': (b, pad) => [
      ...fly('cat', { alpha: 1 }, 900),
      { fx: 'sad-puff', at: 'cat' },
      spark('cat'),
      both('nod'),
    ].concat(pad(900 + 1600), rest),
    'crown-shared': (b, pad) => {
      const fly1 = clamp(b * 0.35, 700, 1400);
      return [
        ...fly('crown', { x: 0.5, y: 0.62, alpha: 1 }, fly1),
        both('cheer'),
        boom('crown'),
      ].concat(pad(fly1 + 1600), rest);
    },

    // --- ending-1-2: the twisty tower ------------------------------------------
    'twisty-climb': (b, pad) => {
      const rise = clamp(b * 0.5, 900, 2000);
      return [
        both('jump'),
        { custom: async () => {
          await Promise.all([riseActor(actors.a, -0.18, rise), riseActor(actors.b, -0.22, rise + 200)]);
        } },
        spark('a'),
      ].concat(pad(1200 + rise + 200), rest);
    },
    'window-twinkle': (b, pad) => [
      // y 0.42, not higher: the word-tap chip row occupies roughly the top
      // third of the stage (y < ~0.35) and fully occludes anything behind it.
      ...fly('crown', { x: 0.5, y: 0.42, alpha: 1 }, 900),
      spark('crown'),
    ].concat(pad(1800), rest),
    'tower-wave': (b, pad) => [
      both('wave'),
      spark('crown'),
      boom('crown'),
    ].concat(pad(1600), rest),

    // --- ending-1-3: the helpful mouse ------------------------------------------
    'mouse-squeaks': (b, pad) => {
      const zip = clamp(b * 0.3, 500, 1100);
      return [
        ...fly('mouse', { x: 0.5, y: 0.86, alpha: 1 }, zip),
        both('ask'),
        spark('mouse'),
      ].concat(pad(zip + 1200), rest);
    },
    'tiny-hole': (b, pad) => {
      const zip = clamp(b * 0.3, 500, 1100);
      return [
        ...fly('mouse', { x: OFF.left + 0.05, y: 0.9 }, zip),
        both('think'),
      ].concat(pad(zip + 1400), rest);
    },
    'crown-safe': (b, pad) => {
      const zip = clamp(b * 0.35, 700, 1400);
      return [
        { parallel: [
          ...(hasProp('mouse') ? [{ prop: 'mouse', transform: { x: 0.44, y: 0.86, alpha: 1 }, ms: zip }] : []),
          ...(hasProp('crown') ? [{ prop: 'crown', transform: { x: 0.56, y: 0.7, alpha: 1 }, ms: zip }] : []),
        ] },
        both('cheer'),
        boom('mouse'),
      ].concat(pad(zip + 1600), rest);
    },

    // --- middle-2: the sneezy baby dragon ------------------------------------
    'meet-dragon': (b, pad) => {
      const fly1 = clamp(b * 0.4, 800, 1600);
      return [
        ...fly('dragon', { alpha: 1 }, fly1),
        { parallel: [{ actor: 'a', clip: 'think' }, { actor: 'b', clip: 'nod' }] },
        { wait: 700 },
        spark('dragon'),
      ].concat(pad(fly1 + 700 + 1000), rest);
    },
    'big-sneeze': (b, pad) => [
      ...fly('dragon', { y: 0.78 }, 200),
      ...fly('dragon', { y: 0.86 }, 200),
      ...fly('dragon', { y: 0.82 }, 200),
      both('stomp'),
      boom('dragon'),
    ].concat(pad(600 + 1800), rest),
    'smoke-rings': (b, pad) => {
      const drift = clamp(b * 0.5, 900, 1800);
      return [
        { parallel: [
          ...fly('ring-1', { x: 0.56, y: 0.6, alpha: 1 }, drift),
          ...fly('ring-2', { x: 0.62, y: 0.46, alpha: 1 }, drift),
        ] },
        spark('ring-1'),
        spark('ring-2'),
      ].concat(pad(drift + 900), rest);
    },

    // --- ending-2-1: the big tissue --------------------------------------------
    'bring-tissue': (b, pad) => {
      const fly1 = clamp(b * 0.28, 500, 1000);
      const fly2 = clamp(b * 0.28, 500, 1000);
      return [
        ...fly('tissue', { x: CLOSE_MARKS.a, y: 0.7, alpha: 1 }, fly1),
        { actor: 'a', clip: 'offer' },
        ...fly('tissue', { x: 0.5, y: 0.76 }, fly2),
      ].concat(pad(fly1 + 1100 + fly2), rest);
    },
    'catch-sneeze': (b, pad) => [
      boom('tissue'),
      both('jump'),
    ].concat(pad(1600), rest),
    'bless-you': (b, pad) => {
      const move = clamp(b * 0.2, 340, 800);
      return [
        both('nod'),
        goTo(CLOSE_MARKS.a, CLOSE_MARKS.b, move),
        both('hug'),
        spark('dragon'),
      ].concat(pad(900 + move + 1600), rest);
    },

    // --- ending-2-2: the sleepy song -------------------------------------------
    'sleepy-song': (b, pad) => [
      both('groove'),
      spark('a'),
      { wait: 900 },
      spark('b'),
    ].concat(pad(900), rest),
    'dragon-yawns': (b, pad) => [
      ...fly('dragon', { y: 0.78 }, 500),
      ...fly('dragon', { y: 0.82 }, 500),
      ...fly('dragon', { y: 0.78 }, 500),
      ...fly('dragon', { y: 0.82 }, 500),
    ].concat(pad(2000), rest),
    'snore-night': (b, pad) => [
      { fx: 'sad-puff', at: 'dragon' },
      { wait: 700 },
      { fx: 'sad-puff', at: 'dragon' },
      both('nod'),
    ].concat(pad(700 + 700 + 1200), rest),

    // --- ending-2-3: the smoke rings --------------------------------------------
    'puff-rings': (b, pad) => {
      const drift = clamp(b * 0.55, 1000, 2000);
      const step = drift * 0.4;
      return [
        ...fly('ring-1', { x: 0.5, y: 0.62, alpha: 1 }, step),
        ...fly('ring-2', { x: 0.56, y: 0.48, alpha: 1 }, step),
        ...fly('ring-3', { x: 0.62, y: 0.4, alpha: 1 }, step),
      ].concat(pad(step * 3), rest);
    },
    'hop-through': (b, pad) => [
      { actor: 'a', clip: 'jump' },
      ...fly('ring-1', { x: 0.4 }, 500),
      { actor: 'b', clip: 'jump' },
      ...fly('ring-2', { x: 0.6 }, 500),
    ].concat(pad(2600), rest),
    'best-game': (b, pad) => [
      both('cheer'),
      boom('a'),
      boom('b'),
    ].concat(pad(1400), rest),

    // --- middle-3: the royal ball -----------------------------------------------
    'royal-ball': (b, pad) => {
      const walk = clamp(b * 0.3, 500, 1200);
      const fly1 = clamp(b * 0.3, 600, 1200);
      return [
        goTo(CLOSE_MARKS.a, CLOSE_MARKS.b, walk),
        { parallel: [
          ...fly('drum', { x: 0.28, y: 0.86, alpha: 1 }, fly1),
          ...fly('trumpet', { x: 0.72, y: 0.4, alpha: 1 }, fly1),
        ] },
        both('groove'),
        spark('drum'),
      ].concat(pad(walk + fly1 + 1400), rest);
    },
    'music-stops': (b, pad) => [
      { wait: 500 },
      both('head-shake'),
      { fx: 'sad-puff', at: 'a' },
    ].concat(pad(500 + 1600), rest),
    'band-asleep': (b, pad) => [
      { fx: 'sad-puff', at: 'drum' },
      both('think'),
      { wait: 900 },
    ].concat(pad(1100 + 900), rest),

    // --- ending-3-1: the royal drum -----------------------------------------------
    'boom-boom': (b, pad) => {
      const fly1 = clamp(b * 0.3, 500, 1000);
      return [
        ...fly('drum', { x: 0.5, y: 0.86, alpha: 1 }, fly1),
        both('play-drum'),
        boom('drum'),
        { wait: 500 },
        boom('drum'),
      ].concat(pad(fly1 + 500 + 500 + 900), rest);
    },
    'hop-beat': (b, pad) => [
      { actor: 'a', clip: 'jump' },
      boom('drum'),
      { actor: 'b', clip: 'jump' },
      boom('drum'),
      both('cheer'),
    ].concat(pad(2700), rest),
    'castle-dances': (b, pad) => [
      both('groove'),
      boom('a'),
      boom('b'),
    ].concat(pad(1600), rest),

    // --- ending-3-2: the silly wiggle dance --------------------------------------
    'wiggle-dance': (b, pad) => [
      both('groove'),
      spark('a'),
    ].concat(pad(1600), rest),
    'wiggle-hop': (b, pad) => {
      const step = clamp(b * 0.22, 300, 700);
      return [
        goTo(0.28, 0.72, step),
        both('jump'),
        goTo(0.38, 0.62, step),
        both('jump'),
      ].concat(pad(step * 2 + 1600), rest);
    },
    'all-join': (b, pad) => [
      both('cheer'),
      boom('a'),
      boom('b'),
      spark('a'),
    ].concat(pad(1600), rest),

    // --- ending-3-3: the royal band plays ----------------------------------------
    'wake-up': (b, pad) => {
      const walk = clamp(b * 0.3, 500, 1200);
      return [
        goTo(0.36, 0.62, walk),
        both('ask'),
        boom('drum'),
      ].concat(pad(walk + 1400), rest);
    },
    'tap-toot': (b, pad) => [
      { actor: 'a', clip: 'grab' },
      spark('drum'),
      { actor: 'b', clip: 'grab' },
      spark('trumpet'),
    ].concat(pad(2200), rest),
    'band-plays': (b, pad) => [
      { parallel: [{ actor: 'a', clip: 'play-drum' }, { actor: 'b', clip: 'play-blow' }] },
      boom('drum'),
      { wait: 500 },
      boom('trumpet'),
    ].concat(pad(500 + 500 + 1200), rest),

    // --- beginning: blast off -------------------------------------------------
    'countdown': (b, pad) => {
      const move = clamp(b * 0.22, 320, 800);
      const hop = 220;
      return [
        goTo(CLOSE_MARKS.a, CLOSE_MARKS.b, move),
        ...fly('rocket', { y: 0.78 }, hop),
        spark('rocket'),
        ...fly('rocket', { y: 0.84 }, hop),
        ...fly('rocket', { y: 0.76 }, hop),
        spark('rocket'),
        ...fly('rocket', { y: 0.84 }, hop),
        ...fly('rocket', { y: 0.72 }, hop),
        spark('rocket'),
      ].concat(pad(move + hop * 6 + 900), rest);
    },
    'zoom-up': (b, pad) => {
      const fly1 = clamp(b * 0.55, 1000, 2200);
      return [
        ...fly('rocket', { y: -0.3 }, fly1),
        boom('rocket'),
        both('cheer'),
      ].concat(pad(fly1 + 1100), rest);
    },
    'moon-close': (b, pad) => [
      both('ask', 'ask'),
      spark('a'),
      spark('b'),
    ].concat(pad(2000), rest),

    // --- middle-1: moon bounce -------------------------------------------------
    'moon-boing': (b, pad) => [
      both('jump'),
      boom('a'),
      boom('b'),
      { wait: 300 },
      both('jump'),
      boom('a'),
      boom('b'),
    ].concat(pad(950 * 2 + 300 + 1200), rest),
    'bounce-rock': (b, pad) => {
      const walk = clamp(b * 0.28, 420, 1000);
      return [
        goTo(0.5, 0.66, walk),
        both('jump'),
        boom('rock'),
        goTo(0.66, 0.82, walk),
      ].concat(pad(walk * 2 + 1100), rest);
    },
    'dust-achoo': (b, pad) => [
      { fx: 'sad-puff', at: 'a' },
      { fx: 'sad-puff', at: 'b' },
      both('stomp'),
      spark('a'),
    ].concat(pad(1400 + 1600), rest),

    // --- ending-1-1: the hello echo ---------------------------------------------
    'crater-peek': (b, pad) => {
      const walk = clamp(b * 0.3, 500, 1200);
      return [
        goTo(0.46, 0.6, walk),
        both('think'),
        { wait: 700 },
      ].concat(pad(walk + 700 + 900), rest);
    },
    'echo-hello': (b, pad) => [
      spark('crater'),
      { wait: 300 },
      spark('a'),
      { wait: 300 },
      spark('b'),
      both('ask'),
    ].concat(pad(300 + 300 + 300 + 1200), rest),
    'echo-giggle': (b, pad) => [
      boom('crater'),
      both('nod'),
      boom('a'),
      boom('b'),
      both('cheer'),
    ].concat(pad(900 + 900 + 1100), rest),

    // --- ending-1-2: a happy flag ------------------------------------------------
    'plant-flag': (b, pad) => {
      const fly1 = clamp(b * 0.4, 700, 1400);
      return [
        ...fly('flag', { x: 0.5, y: 0.84, alpha: 1 }, fly1),
        { actor: 'a', clip: 'grab' },
      ].concat(pad(fly1 + 1100), rest);
    },
    'flag-smile': (b, pad) => [
      spark('flag'),
      both('nod'),
    ].concat(pad(900 + 900), rest),
    'wave-stars': (b, pad) => [
      both('wave'),
      spark('a'),
      spark('b'),
      boom('flag'),
    ].concat(pad(1800), rest),

    // --- ending-1-3: the biggest jump --------------------------------------------
    'ready-set': (b, pad) => [
      both('stomp'),
      spark('a'),
      spark('b'),
    ].concat(pad(1800), rest),
    'star-jump': (b, pad) => {
      const rise = clamp(b * 0.5, 900, 2000);
      return [
        both('jump'),
        { custom: async () => {
          await Promise.all([riseActor(actors.a, -0.25, rise), riseActor(actors.b, -0.28, rise + 200)]);
        } },
        boom('a'),
        boom('b'),
      ].concat(pad(1200 + rise + 200), rest);
    },
    'wow-wow': (b, pad) => {
      const fall = clamp(b * 0.35, 700, 1400);
      return [
        { custom: async () => {
          await Promise.all([riseActor(actors.a, 0, fall), riseActor(actors.b, 0, fall)]);
        } },
        both('cheer'),
        boom('a'),
        boom('b'),
        boom('a'),
      ].concat(pad(fall + 1600), rest);
    },

    // --- middle-2: a falling star ------------------------------------------------
    'star-falls': (b, pad) => {
      const drift = clamp(b * 0.5, 900, 1900);
      const step = drift / 2;
      return [
        ...fly('star', { x: 0.36, y: 0.5 }, step),
        spark('star'),
        ...fly('star', { x: 0.5, y: 0.82 }, step),
        spark('star'),
      ].concat(pad(drift + 900), rest);
    },
    'soft-landing': (b, pad) => [
      ...fly('star', { y: 0.86 }, 500),
      { fx: 'sad-puff', at: 'star' },
      both('nod'),
    ].concat(pad(500 + 1600), rest),
    'shy-star': (b, pad) => [
      ...fly('star', { alpha: 0.25 }, 400),
      ...fly('star', { alpha: 1 }, 400),
      both('think'),
    ].concat(pad(800 + 1600), rest),

    // --- ending-2-1: toss it home -------------------------------------------------
    'big-toss': (b, pad) => [
      both('grab'),
      ...fly('star', { y: 0.78 }, 250),
      both('grab'),
      ...fly('star', { y: 0.72 }, 250),
      both('grab'),
      ...fly('star', { y: 0.64 }, 250),
    ].concat(pad(750 + 800 * 3), rest),
    'zoom-back': (b, pad) => {
      const fly1 = clamp(b * 0.5, 900, 1800);
      return [
        ...fly('star', { y: -0.3 }, fly1),
        boom('star'),
      ].concat(pad(fly1 + 1100), rest);
    },
    'twinkle-thanks': (b, pad) => [
      spark('a'),
      spark('b'),
      both('wave'),
    ].concat(pad(1800), rest),

    // --- ending-2-2: show it our home --------------------------------------------
    'look-home': (b, pad) => [
      ...fly('earth', { alpha: 1 }, 900),
      { actor: 'a', clip: 'ask' },
      spark('earth'),
    ].concat(pad(900 + 1100), rest),
    'blue-green': (b, pad) => [
      spark('earth'),
      both('nod'),
    ].concat(pad(900 + 900), rest),
    'twinkle-smile': (b, pad) => [
      spark('star'),
      ...fly('star', { y: 0.8 }, 300),
      ...fly('star', { y: 0.84 }, 300),
      both('hug'),
    ].concat(pad(600 + 1600), rest),

    // --- ending-2-3: a twinkle dance ----------------------------------------------
    'twinkle-dance': (b, pad) => [
      both('groove'),
      ...fly('star', { y: 0.76 }, 400),
      ...fly('star', { y: 0.8 }, 400),
      ...fly('star', { y: 0.76 }, 400),
    ].concat(pad(1200), rest),
    'blink-hop-spin': (b, pad) => [
      ...fly('star', { alpha: 0.3 }, 200),
      ...fly('star', { alpha: 1, x: 0.46 }, 220),
      ...fly('star', { y: 0.76 }, 220),
      ...fly('star', { x: 0.54 }, 220),
      ...fly('star', { y: 0.8 }, 220),
      ...fly('star', { x: 0.5 }, 220),
      both('jump'),
    ].concat(pad(1300 + 1200), rest),
    'glow-bright': (b, pad) => [
      ...fly('star', { scale: 0.3, alpha: 1 }, 700),
      boom('star'),
      both('cheer'),
      boom('a'),
    ].concat(pad(700 + 1600), rest),

    // --- middle-3: a moon house ----------------------------------------------------
    'moon-house': (b, pad) => {
      const walk = clamp(b * 0.3, 500, 1200);
      return [
        ...fly('moon-friend', { alpha: 0 }, 1),
        goTo(0.5, 0.66, walk),
        { actor: 'a', clip: 'ask' },
        spark('moon-house'),
      ].concat(pad(walk + 1200), rest);
    },
    'ding-dong': (b, pad) => [
      { actor: 'a', clip: 'grab' },
      spark('moon-house'),
      { actor: 'a', clip: 'grab' },
      spark('moon-house'),
      { actor: 'b', clip: 'think' },
    ].concat(pad(1600), rest),
    'friend-peeks': (b, pad) => [
      ...fly('moon-friend', { x: 0.62, y: 0.8, alpha: 1 }, 900),
      both('wave'),
      spark('moon-friend'),
    ].concat(pad(900 + 1200), rest),

    // --- ending-3-1: a space snack -----------------------------------------------
    'space-snack': (b, pad) => {
      const fly1 = clamp(b * 0.35, 600, 1200);
      return [
        ...fly('snack', { x: 0.5, y: 0.84, alpha: 1 }, fly1),
        both('offer'),
      ].concat(pad(fly1 + 1400), rest);
    },
    'munch-crunch': (b, pad) => [
      ...fly('snack', { scale: 0.32 }, 220),
      spark('snack'),
      ...fly('snack', { scale: 0.26 }, 220),
      ...fly('snack', { scale: 0.32 }, 220),
      spark('snack'),
      ...fly('snack', { scale: 0.26 }, 220),
      ...fly('snack', { scale: 0.32 }, 220),
      spark('snack'),
      ...fly('snack', { scale: 0.26 }, 220),
    ].concat(pad(220 * 9), rest),
    'friend-loves': (b, pad) => [
      ...fly('moon-friend', { y: 0.78 }, 300),
      ...fly('moon-friend', { y: 0.82 }, 300),
      boom('moon-friend'),
      both('cheer'),
    ].concat(pad(600 + 1600), rest),

    // --- ending-3-2: hide and seek -----------------------------------------------
    'count-hide': (b, pad) => {
      const walk = clamp(b * 0.35, 600, 1400);
      return [
        { parallel: [
          { actor: 'a', to: [0.12], ms: walk },
          { actor: 'b', to: [0.88], ms: walk },
          ...fly('moon-friend', { x: 0.22, y: 0.85, scale: 0.18 }, walk),
        ] },
        spark('rock'),
      ].concat(pad(walk + 900), rest);
    },
    'where-friend': (b, pad) => {
      const cross = clamp(b * 0.3, 500, 1200);
      return [
        both('think'),
        { parallel: [
          { actor: 'a', to: [0.4], ms: cross },
          { actor: 'b', to: [0.6], ms: cross },
        ] },
      ].concat(pad(900 + cross), rest);
    },
    'found-you': (b, pad) => [
      ...fly('moon-friend', { x: 0.5, y: 0.8, scale: 0.3 }, 700),
      boom('moon-friend'),
      both('cheer'),
    ].concat(pad(700 + 1600), rest),

    // --- ending-3-3: a moon picnic -----------------------------------------------
    'moon-picnic': (b, pad) => {
      const gather = clamp(b * 0.35, 600, 1200);
      return [
        { parallel: [
          ...fly('snack', { x: 0.42, y: 0.85, alpha: 1 }, gather),
          ...fly('moon-friend', { x: 0.58, y: 0.82, alpha: 1 }, gather),
          { actor: 'a', to: [0.36], ms: gather },
          { actor: 'b', to: [0.64], ms: gather },
        ] },
        both('sit-nod'),
      ].concat(pad(gather + 900), { wait: 250 }, rest);
    },
    'tiny-lights': (b, pad) => [
      ...fly('star', { alpha: 0.4 }, 300),
      ...fly('star', { alpha: 1 }, 300),
      spark('star'),
      ...fly('star-2', { alpha: 0.4 }, 300),
      ...fly('star-2', { alpha: 1 }, 300),
      spark('star-2'),
    ].concat(pad(1800), rest),
    'good-night': (b, pad) => [
      both('wave'),
      { fx: 'sad-puff', at: 'a' },
      { wait: 500 },
      { fx: 'sad-puff', at: 'b' },
      spark('star'),
      spark('star-2'),
    ].concat(pad(900 + 500 + 900), rest),
  };

  /** Legacy node-level names (config `beat`) as gentle fallbacks. */
  const FALLBACK = {
    investigate: (b, pad) => {
      const move = clamp(b * 0.3, 420, 1300);
      return [goTo(CLOSE_MARKS.a, CLOSE_MARKS.b, move), both('think', 'ask'), spark('a')]
        .concat(pad(move + 1200), rest);
    },
    travel: (b, pad) => {
      const walk = clamp(b - 400, 800, 4200);
      return [goTo(0.24, 0.5, walk), spark('b')].concat(pad(walk), rest);
    },
    help: (b, pad) => {
      const move = clamp(b * 0.25, 360, 900);
      return [goTo(CLOSE_MARKS.a, CLOSE_MARKS.b, move), both('offer', 'nod'), spark('b')]
        .concat(pad(move + 1100), rest);
    },
    celebrate: (b, pad) => [both('cheer'), boom('a'), boom('b')].concat(pad(1100), rest),
    finale: (b, pad) => {
      const move = clamp(b * 0.22, 340, 900);
      return [goTo(CLOSE_MARKS.a, CLOSE_MARKS.b, move), both('hug'), boom('a'), both('wave')]
        .concat(pad(move + 1600 + 800), rest);
    },
  };

  /** Build the beat list for a named beat, sized to `ms` of narration. */
  function buildBeats(name, ms) {
    const budget = clamp(Number(ms) || 0, 900, 12000);
    const pad = (used) => (budget - used > 180 ? [{ wait: budget - used }] : []);
    const builder = BEATS[name] || FALLBACK[name] || FALLBACK.investigate;
    return builder(budget, pad);
  }

  /** runBeats with support for the scene's own `{ custom }` async steps. */
  async function runSceneBeats(beats) {
    const gen = runGen;
    for (const beat of beats) {
      if (destroyed || gen !== runGen) return;
      if (beat && typeof beat.custom === 'function') { await beat.custom(); continue; }
      await theater.runBeats([beat]);
    }
  }

  /**
   * Read one line: narration and performance together.
   *
   * @param {object} line
   * @param {string} line.nodeId
   * @param {number} line.lineIndex
   * @param {string} line.text
   * @param {string} line.beat   the LINE's beat name (config beats[i] or the
   *                             node-level fallback)
   * @returns {Promise<{key: string, ms: number, beat: string}>}
   */
  async function performLine({ nodeId, lineIndex, text, beat }) {
    // Scoped by settingId: forest/castle/outer-space all reuse the exact same
    // node ids (beginning, middle-1, ending-1-1, ...), so an unscoped key here
    // would silently collide across settings — see the 2026-08 audio-key fix.
    const key = `line:${setting?.id}:${nodeId}:${lineIndex}`;
    if (destroyed) return { key, ms: 0, beat };
    // A scene change may still be strolling the pair back on — never perform
    // over the top of it (a fast tapper CAN finish a line before the walk-on).
    if (transitioning) { try { await transitioning; } catch { /* ignore */ } }
    const recorded = voice && typeof voice.duration === 'function' ? voice.duration(key) : null;
    // A recorded clip's tail is mostly silence; give the beat the whole clip
    // plus a short breath so the puppets settle after the sentence, not during.
    const ms = Math.round((recorded != null ? recorded * 1000 : estimateMs(text)) + 350);
    const beats = buildBeats(beat, ms);

    performing = true;
    try {
      // Concurrent on purpose: beats and narration are separate promises so a
      // multi-step performance can play under a single spoken sentence.
      await Promise.all([
        runSceneBeats(beats),
        theater.narrate(key, text),
      ]);
    } finally {
      performing = false;
    }
    return { key, ms, beat };
  }

  /** The Complete-screen bow: cheer, wave, burst. Brings strays back on. */
  async function bow() {
    if (destroyed) return;
    actors.a.fy = 0; actors.b.fy = 0;
    theater.placeActor(actors.a); theater.placeActor(actors.b);
    await theater.runBeats([
      { parallel: [
        { actor: 'a', to: [CLOSE_MARKS.a], ms: 600 },
        { actor: 'b', to: [CLOSE_MARKS.b], ms: 600 },
      ] },
      { parallel: [{ actor: 'a', clip: 'cheer' }, { actor: 'b', clip: 'cheer' }] },
      { fx: 'burst', at: 'a' },
      { fx: 'burst', at: 'b' },
      { parallel: [{ actor: 'a', clip: 'wave' }, { actor: 'b', clip: 'wave' }] },
    ]);
  }

  /** Put the pair back in the wings, idling, set struck. */
  async function resetStage() {
    if (destroyed) return;
    interruptAll();
    theater.clearProps();
    livePropIds.clear();
    actors.a.fy = 0; actors.b.fy = 0;
    actors.a.fx = OFF.left;
    actors.b.fx = OFF.right;
    theater.placeActor(actors.a);
    theater.placeActor(actors.b);
    actors.a.puppet.playClip('idle');
    actors.b.puppet.playClip('idle');
  }

  /**
   * Re-measure the canvas. Pixi's `resizeTo` only recomputes on a window
   * resize event, so a stage whose host was display:none when it mounted (or
   * that has just been revealed) keeps a stale — possibly 0×0 — size until
   * something asks. Every screen change that shows the stage calls this.
   */
  function relayout() {
    if (destroyed) return;
    try { stage.app.resize(); } catch { /* ignore */ }
    theater.placeActor(actors.a);
    theater.placeActor(actors.b);
    Object.values(theater.props).forEach((p) => theater.layoutProp(p));
  }

  function setTimeScale(scale) {
    theater.timeScale = Math.max(1, Number(scale) || 1);
    return theater.timeScale;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    try { theater.destroy(); } catch { /* ignore */ }
    try { stage.destroy(); } catch { /* ignore */ }
  }

  return {
    stage,
    theater,
    actors,
    cast: pair.slice(),
    settingId: setting?.id || null,
    hasProp,
    listProps: () => [...livePropIds],
    isPerforming: () => performing,
    isTransitioning: () => Boolean(transitioning),
    setFidget: (on) => { fidgetOn = Boolean(on); },
    beginNode,
    performLine,
    reactToWord,
    bow,
    resetStage,
    relayout,
    setTimeScale,
    interrupt: interruptAll,
    destroy,
  };
}
