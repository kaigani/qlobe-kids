// game.js — Rhyming Detective's play field: placement maths, the rhyme
// decision, and the §9 tap choreography.
//
// It owns everything inside the room. It does NOT own screens, the HUD or
// QLOBE_DEBUG — those are js/main.js. The two meet at `createPlayfield`'s
// `ctx` (things main knows: time scale, seed, mode, HUD rects) and `on`
// (things main must react to: a rhyme landed, a case closed).
//
// Contract references are to games/rhyming-detective/game-design.md.

import { createScene } from '../../../shared/js/hotspot-scene.js';
import { createTimers } from '../../../shared/js/timers.js';

// ---------------------------------------------------------------------------
// §4.4 — the game's only PRNG. FNV-1a over a concatenated string, shared by the
// jitter, the Mode-2 zone shuffle and the voice decks, so seed(n) pins all three.
// ---------------------------------------------------------------------------

export function fnv1a(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** §4.4 jitter: an integer in [-jitter, +jitter], stable for (seed, case, word, axis). */
export function jitterFor(seed, caseId, word, axis, span = 20) {
  const range = span * 2 + 1;
  return (fnv1a(`${seed}:${caseId}:${word}:${axis}`) % range) - span;
}

/** Deterministic Fisher-Yates driven by the same hash. Returns a new array. */
export function seededShuffle(list, seedNum) {
  const out = list.slice();
  let h = fnv1a(String(seedNum));
  for (let i = out.length - 1; i > 0; i -= 1) {
    h = fnv1a(`${h}`);
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * §3.5 — a shuffled deck drawn without replacement, reshuffled when exhausted,
 * never repeating the last card across the reshuffle boundary.
 */
export function createDeck(keys, seedNum) {
  const source = (keys || []).slice();
  let pile = [];
  let last = null;
  let round = 0;

  function refill() {
    pile = seededShuffle(source, `${seedNum}:${round}`);
    round += 1;
    if (pile.length > 1 && pile[0] === last) {
      [pile[0], pile[1]] = [pile[1], pile[0]];
    }
  }

  return {
    next() {
      if (!source.length) return null;
      if (!pile.length) refill();
      last = pile.shift();
      return last;
    },
    reseed(nextSeed) {
      seedNum = nextSeed;
      round = 0;
      pile = [];
    },
  };
}

/** §3.5 — no-N is a ladder inside a case, not a deck. Resets every case intro. */
export function noLadderKey(ladder, wrongTapsSoFar) {
  const keys = (ladder && ladder.length) ? ladder : ['no-1'];
  return keys[Math.min(wrongTapsSoFar, keys.length - 1)];
}

// ---------------------------------------------------------------------------
// §4.4 / §4.7 — art-space geometry
// ---------------------------------------------------------------------------

function clamp(v, lo, hi) {
  return hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
}

export function sizeFor(config, word) {
  const n = Number(config.sizes && config.sizes[word]);
  return Number.isFinite(n) && n > 0 ? n : 200;
}

/**
 * The five words of a case with their zone assignment, in authored order
 * (rhymes then distractors). Mode 2 re-assigns them across all eight zones
 * with a seeded shuffle (§4.6).
 */
export function assignZones(config, caseDef, modeDef, seed) {
  const room = config.rooms[caseDef.room];
  const words = [...caseDef.rhymes, ...caseDef.distractors];
  if (modeDef && modeDef.shuffle) {
    const chosen = seededShuffle(room.zones, `${seed}:sound:${caseDef.id}`).slice(0, words.length);
    return words.map((word, i) => ({
      word,
      zone: chosen[i],
      zoneIndex: room.zones.indexOf(chosen[i]),
    }));
  }
  return words.map((word) => {
    const name = caseDef.placements[word];
    const zoneIndex = room.zones.findIndex((z) => z.name === name);
    return { word, zone: room.zones[zoneIndex], zoneIndex };
  });
}

/**
 * §4.4 — centred in the zone, longest edge = size, clamped to the zone less a
 * 10 px margin.
 *
 * GROUNDING (Phase 3). A zone that names a `base` — the art y of the real
 * contact line it was authored against, read off the room plate — places the
 * object's FOOT on that line instead of centring it in the box:
 *
 *     y = base - s / 2
 *
 * Centring is what made a 150 px pen and a 240 px van float at two different
 * heights over the same shelf edge, and it is why every object read as
 * hovering. With a base the object sits on the surface whatever its size, and
 * the y jitter is dropped — a seeded ±20 px on y is exactly the thing that
 * un-grounds it again. x jitter still runs, so the room keeps its hand-placed
 * looseness along the surface. `surface: "wall"` has no base and keeps the
 * original centred behaviour: it hangs.
 *
 * FOOT PADDING. The art box this returns is always square (`s x s`), but
 * hotspot-scene.js draws the sprite inside it with object-fit:contain,
 * centred on both axes — so a sprite wider than it is tall (a flat mat, a
 * squat fruit) is width-constrained and leaves vertical slack split evenly
 * above and below the raster. On a grounded zone that slack puts the raster's
 * own foot `slack/2` art px ABOVE `base`, not on it: the box touches the
 * surface, the drawing inside it does not. `config.footPad[word]` is that
 * half-slack, authored once per sprite (see `_footPadNotes` in config.json);
 * it nudges the grounded y down so the RASTER's foot lands on `base`. It is a
 * no-op on wall zones (no `base`) and for words with no entry.
 */
export function wideBox(config, caseDef, seed, word, zone) {
  const margin = 10;
  const jitterSpan = Number(config.tuning && config.tuning.jitterArtPx) || 20;
  const s = Math.min(sizeFor(config, word), zone.w - margin * 2, zone.h - margin * 2);
  const half = s / 2;
  const cx0 = zone.x + zone.w / 2;
  const cy0 = zone.y + zone.h / 2;
  const jx = jitterFor(seed, caseDef.id, word, 'x', jitterSpan);
  const grounded = Number.isFinite(Number(zone.base));
  const jy = grounded ? 0 : jitterFor(seed, caseDef.id, word, 'y', jitterSpan);
  const footPad = grounded ? (Number(config.footPad && config.footPad[word]) || 0) : 0;
  return {
    x: clamp(cx0 + jx, zone.x + half, zone.x + zone.w - half),
    y: grounded
      ? Number(zone.base) - half + footPad
      : clamp(cy0 + jy, zone.y + half, zone.y + zone.h - half),
    w: s,
    h: s,
  };
}

/** The grounding class a zone earns. Drives the contact shadow only (§CSS). */
export function surfaceClassFor(zone) {
  const kind = zone && zone.surface;
  if (kind === 'wall') return 'rd-surf-wall';
  if (kind === 'floor') return 'rd-surf-floor';
  return 'rd-surf-shelf';
}

/**
 * §4.7's grid shape. Two rows of four is the authored lattice and is what
 * portrait gets. A LANDSCAPE-COMPACT crop (a phone on its side, 1180 x 520) is
 * a different problem: after the banner, the target sprite and the HUD reserve
 * the placeable band is a couple of hundred art px tall and ~1500 wide, so a
 * 4-wide cell is four times wider than it is tall — and the cell's SHORT edge
 * is what sizes the object. Two rows there drew 50 px sprites inside 96 px hit
 * boxes: legal, and unreadable. One row of eight uses the width the crop
 * actually has and doubles the art. Same lattice, same index -> cell mapping,
 * same no-jitter rule; only the fold changes.
 */
export function compactGrid(box) {
  const wide = box.h < (box.w / 4) * 0.85;
  return wide ? { cols: 8, rows: 1 } : { cols: 4, rows: 2 };
}

/**
 * §4.7 — the computed compact grid. `box` is the placeable art rect (visible
 * art, inset 4 % a side and by the HUD reserve converted to art px).
 * Zone index i lands in grid cell i; no jitter (there is no slack to spend).
 *
 * `avoid` is the target sprite's SETTLED art box (see settledTargetArt) and
 * `minSpan` the art-px width the module will inflate a hit box to. A row that
 * runs through the target lays its cells out in the two gutters BESIDE the
 * sprite instead of straight across it. On a 1180 x 520 crop the HUD owns the
 * top 45 % and the dots the bottom, so the single object row lands at exactly
 * the target's own height and the middle two cells drew a mop and a hat across
 * the cat — indistinguishable from one composite object, and both tappable.
 * Yielding vertically is not available there (the band below the sprite is
 * shorter than one 96 px hit box), so the row yields sideways. The index ->
 * cell mapping stays 1:1 and total, so no two objects can ever share a cell.
 */
export function compactBox(box, zoneIndex, avoid = null, minSpan = 0) {
  const { cols, rows } = compactGrid(box);
  const cellW = box.w / cols;
  const cellH = box.h / rows;
  const i = Math.max(0, Math.min(cols * rows - 1, zoneIndex));
  const col = i % cols;
  const row = Math.floor(i / cols);
  const s = Math.min(Math.min(cellW, cellH) * 0.86, 200);
  const y = box.y + (row + 0.5) * cellH;
  let x = box.x + (col + 0.5) * cellW;

  const span = Math.max(s, minSpan);
  if (avoid && avoid.w > 0 && Math.abs(y - avoid.y) < (span + avoid.h) / 2) {
    const gap = (avoid.w + span) / 2 + 8;
    const x1 = avoid.x + gap;                          // left edge, right gutter
    const left = Math.max(0, avoid.x - gap - box.x);
    const right = Math.max(0, box.x + box.w - x1);
    // Both gutters have to hold at least one object, or the row is better off
    // where §4.7 put it than squeezed into a strip narrower than a sprite.
    if (left >= span && right >= span) {
      const nLeft = Math.max(1, Math.min(cols - 1, Math.round((cols * left) / (left + right))));
      const nRight = cols - nLeft;
      x = col < nLeft
        ? box.x + ((col + 0.5) * left) / nLeft
        : x1 + ((col - nLeft + 0.5) * right) / nRight;
    }
  }
  return { x, y, w: s, h: s };
}

// ---------------------------------------------------------------------------
// the play field
// ---------------------------------------------------------------------------

const TARGET_ID = 'target';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * @param {object} o
 * @param {HTMLElement} o.mount    the stage element the scene may fill
 * @param {object} o.config        parsed config.json
 * @param {object} o.voice         js/voice.js
 * @param {object} o.sfx           mute-gated sfx facade from main
 * @param {object} o.ctx           getters main owns: timeScale, seed, modeDef,
 *                                 reserves, traySlot, screen
 * @param {object} o.on            callbacks into main: reflow, found, wrong,
 *                                 complete, neutral
 */
export function createPlayfield({ mount, config, voice, sfx, ctx, on }) {
  const tuning = config.tuning || {};
  const artW = (config.art && config.art.w) || 1600;
  const artH = (config.art && config.art.h) || 1200;

  const scene = createScene(mount, {
    artW,
    artH,
    minHit: Number(tuning.minHitCssPx) || 96,
    ariaLabel: 'The room. Tap the objects to hear their names.',
    className: 'rd-scene',
  });

  // Effects layer (sparkle rings) and the magnifier prop live beside the scene
  // root inside the same mount. §5.1 guarantees the scene never touches them.
  const fx = document.createElement('div');
  fx.className = 'rd-fx';
  mount.appendChild(fx);

  const magnifier = document.createElement('img');
  magnifier.className = 'rd-magnifier';
  magnifier.alt = '';
  magnifier.decoding = 'async';
  magnifier.draggable = false;
  magnifier.hidden = true;
  magnifier.src = 'assets/props/magnifier.webp';
  magnifier.addEventListener('error', () => { magnifier.dataset.missing = 'true'; });
  mount.appendChild(magnifier);

  let caseDef = null;
  let modeDef = null;
  let placement = [];          // [{word, zone, zoneIndex, role, handle}]
  let targetHandle = null;
  let currentRoom = null;
  let layout = 'wide';
  let lastReflow = null;
  // Mirrors bug-hotel-observer/js/game.js's own timerGroup — see that file's
  // comment for the scale convention (ctx.timeScale() stays authoritative;
  // retuneTimers() below is main.js's "fastTimers() changed" hook).
  const timerGroup = createTimers();
  const found = [];            // words, in the order found
  const claimed = new Set();   // tray slots claimed synchronously at t=520
  let wrongTaps = 0;
  let startedCorrect = 0;      // correct sequences begun this case
  let busy = 0;                // in-flight correct choreographies
  let caseToken = 0;

  const T = (ms) => timerGroup.ms(ms);

  function later(ms, fn) {
    return timerGroup.after(ms, fn);
  }

  function cancelTimers() {
    timerGroup.clearAll();
  }

  // -- sprites ---------------------------------------------------------------

  function spritePaths(word) {
    const sprites = config.sprites || {};
    const dir = sprites.dir || 'assets/sprites/';
    const fallbackDir = sprites.fallbackDir || '../../shared/assets/objects/';
    return [`${dir}${word}.webp`, `${fallbackDir}${word}.webp`];
  }

  // §8.5 — the per-sprite fallback, applied at runtime: a word whose room-style
  // sprite is not on disk falls back to the shared Toy Table cut-out, so the
  // game is playable before WP1d lands and stays playable if one sprite fails.
  function applySprite(handle, word) {
    const [primary, fallback] = spritePaths(word);
    handle.setSprite(primary).then((ok) => {
      if (ok || !handle.el) return null;
      handle.el.classList.add('rd-fallback-sprite');
      return handle.setSprite(fallback);
    }).catch(() => {});
  }

  // -- layout ----------------------------------------------------------------

  function reserveArtInsets(V) {
    const rects = (ctx.reserves() || []).filter((r) => r && (r.width || r.w) > 0);
    let top = 0;
    let bottom = 0;
    for (const r of rects) {
      const x = r.x ?? r.left ?? 0;
      const y = r.y ?? r.top ?? 0;
      const w = r.width ?? r.w ?? 0;
      const h = r.height ?? r.h ?? 0;
      const a1 = scene.toArt(x, y);
      const a2 = scene.toArt(x + w, y + h);
      const cy = (a1.y + a2.y) / 2;
      if (cy < V.y + V.h / 2) top = Math.max(top, a2.y - V.y);
      else bottom = Math.max(bottom, V.y + V.h - a1.y);
    }
    // Rounded to whole art px: sub-pixel churn in a HUD rect must not be able
    // to move a placement, and a placement must be reproducible from the seed.
    const cap = V.h * 0.3;
    return {
      top: Math.round(Math.min(Math.max(top, 0), cap)),
      bottom: Math.round(Math.min(Math.max(bottom, 0), cap)),
    };
  }

  /**
   * §4.7's placeable rect: the visible art, inset 4 % a side and by the HUD
   * reserve in art px — plus, below the target sprite. §4.7 does not mention
   * the sprite, but in compact the HUD stack moves to the top and the sprite
   * lands at 30 % height, which is exactly where grid row 0 would sit. Objects
   * stacked on the target read as one blob; the sprite is a fixed landmark, so
   * the derived box yields to it. Nothing authored changes.
   */
  function compactPlaceBox(targetArt) {
    const V = scene.visibleArt();
    const inset = reserveArtInsets(V);
    const padX = V.w * 0.04;
    const padY = V.h * 0.04;
    let top = V.y + padY + inset.top;
    const bottom = V.y + V.h - padY - inset.bottom;
    if (targetArt) top = Math.max(top, targetArt.y + targetArt.h / 2 + 20);
    return {
      x: V.x + padX,
      y: top,
      w: Math.max(120, V.w - padX * 2),
      h: Math.max(120, bottom - top),
    };
  }

  /**
   * WHERE THE TARGET ACTUALLY IS, not where this game asked for it. The module
   * owns the last word on every hit box: it inflates to `minHit` and it slides
   * a spot out from under a reserve rect, and on a short crop it pushes the
   * target 100 px down from the box `targetBox()` returns. Reading its own rect
   * back is the only way the object placement can agree with what was drawn.
   */
  function settledTargetArt() {
    const want = targetBox();
    const r = targetHandle && targetHandle.rect();
    if (!r || !(r.w > 0)) return want;
    const a1 = scene.toArt(r.x, r.y);
    const a2 = scene.toArt(r.x + r.w, r.y + r.h);
    if (!(a2.x > a1.x) || !(a2.y > a1.y)) return want;
    return { x: (a1.x + a2.x) / 2, y: (a1.y + a2.y) / 2, w: a2.x - a1.x, h: a2.y - a1.y };
  }

  function boxFor(entry) {
    if (layout === 'compact') {
      const minHitArt = (Number(tuning.minHitCssPx) || 96) / (scene.scale || 1);
      return compactBox(
        compactPlaceBox(targetBox()), entry.zoneIndex, settledTargetArt(), minHitArt,
      );
    }
    return wideBox(config, caseDef, ctx.seed(), entry.word, entry.zone);
  }

  /**
   * The target sprite is the one hotspot the design pins to a fixed art point
   * (§2.5) INSIDE the column §4.3's keep-out table reserves for the HUD stack.
   * scene.setReserve() would rather push it than let the word card cover it,
   * and its escape is bounded by the visible art rect — so the game does the
   * one thing §2.2 allows it to do, and reads the transform back to slide the
   * sprite clear of the HUD along y. Placements are untouched by this.
   */
  function clearOfHud(box) {
    const rects = (ctx.reserves() || []).filter((r) => r && (r.width || r.w) > 0);
    const halfW = box.w / 2;
    const halfH = box.h / 2;
    let ceiling = -Infinity;   // art y of the lowest HUD edge above the sprite
    let floor = Infinity;      // art y of the highest HUD edge below it
    for (const r of rects) {
      const x = r.x ?? r.left ?? 0;
      const y = r.y ?? r.top ?? 0;
      const w = r.width ?? r.w ?? 0;
      const h = r.height ?? r.h ?? 0;
      const a1 = scene.toArt(x, y);
      const a2 = scene.toArt(x + w, y + h);
      if (a2.x < box.x - halfW || a1.x > box.x + halfW) continue;   // different column
      if (a2.y <= box.y) ceiling = Math.max(ceiling, a2.y);
      else if (a1.y >= box.y) floor = Math.min(floor, a1.y);
    }
    const margin = 12;
    let y = box.y;
    if (floor < Infinity) y = Math.min(y, floor - margin - halfH);
    if (ceiling > -Infinity) y = Math.max(y, ceiling + margin + halfH);
    return { ...box, y };
  }

  function targetBox() {
    if (layout === 'compact') {
      const V = scene.visibleArt();
      // The compact target is a landmark, not a hero: everything the child has
      // to FIND is placed below it, so on a short crop a fixed 240 art px
      // sprite eats the band the objects need and they shrink to fit under it.
      // Tying it to the visible height keeps the 30 % anchor of §4.7 in
      // portrait (where 0.26 * 1200 is over the 240 cap) and yields the room
      // back on a landscape phone.
      const size = Math.max(150, Math.min(240, V.h * 0.26));
      return clearOfHud({ x: V.cx, y: V.y + 0.30 * V.h, w: size, h: size });
    }
    const at = tuning.targetSpriteArt || { x: 800, y: 700 };
    const size = Number(tuning.targetSpriteArtH) || 340;
    return clearOfHud({ x: at.x, y: at.y, w: size, h: size });
  }

  function placeMagnifier() {
    const m = tuning.magnifierArt;
    if (!m || layout === 'compact' || magnifier.dataset.missing || !caseDef) {
      magnifier.hidden = true;
      return;
    }
    const tl = scene.toScreen(m.x, m.y);
    const br = scene.toScreen(m.x + m.w, m.y + m.h);
    const origin = mount.getBoundingClientRect();
    magnifier.hidden = false;
    magnifier.style.left = `${tl.x - origin.left}px`;
    magnifier.style.top = `${tl.y - origin.top}px`;
    magnifier.style.width = `${br.x - tl.x}px`;
    magnifier.style.height = `${br.y - tl.y}px`;
  }

  /**
   * The contact shadow and the findable halo are drawn by GAME css on the
   * module's own (frozen) `.hs-hotspot` class, as ::before / ::after. Neither
   * pseudo can measure the sprite, and the sprite's on-screen size is a
   * function of the live transform — so the one number CSS cannot know is
   * published here, per hotspot, on every reflow. `handle.art` is the module's
   * own record of the art box, so this can never drift from what it drew.
   */
  function paintSpriteVars() {
    const s = scene.scale || 1;
    const put = (handle) => {
      if (!handle || !handle.el) return;
      const a = handle.art;
      handle.el.style.setProperty('--rd-sw', `${a.w * s}px`);
      handle.el.style.setProperty('--rd-sh', `${a.h * s}px`);
    };
    for (const entry of placement) put(entry.handle);
    put(targetHandle);
  }

  /* THE TARGET IS PLACED FIRST. In compact the objects are laid out around
     where the module SETTLED the target (settledTargetArt), so it has to have
     been placed before they are measured against it — otherwise the first pass
     of a case reads a stale rect and lays the row across the sprite. */
  function replaceAll() {
    if (!caseDef) return;
    if (targetHandle) targetHandle.setRect(targetBox());
    for (const entry of placement) {
      if (entry.handle) entry.handle.setRect(boxFor(entry));
    }
    placeMagnifier();
    paintSpriteVars();
  }

  scene.onReflow((payload) => {
    lastReflow = payload;
    const next = payload.layoutHint;
    const changed = next !== layout;
    layout = next;
    // Compact geometry is derived from the live visible-art rect, so it is
    // recomputed on every reflow; wide geometry is seed-derived and stable, so
    // a resize never re-jitters it (§2.8).
    if (changed || layout === 'compact') {
      replaceAll();
    } else {
      // Wide placements are seed-derived and never move on a resize (§2.8);
      // only the target sprite tracks the HUD.
      if (targetHandle) targetHandle.setRect(targetBox());
      placeMagnifier();
      // The scale changed even when the art box did not, so the shadow and the
      // halo have to be re-sized on EVERY reflow, not only on a re-placement.
      paintSpriteVars();
    }
    if (on.reflow) on.reflow(payload, layout);
  });

  scene.setReserve(() => ctx.reserves() || []);

  // -- effects ---------------------------------------------------------------

  function sparkleRing(handle) {
    if (scene.reducedMotion) {
      handle.pulse({ ms: T(200), scale: 1 });
      return;
    }
    const r = handle.rect();
    if (!r || !r.w) return;
    const origin = mount.getBoundingClientRect();
    const ring = document.createElement('div');
    ring.className = 'rd-sparkle';
    ring.style.left = `${r.x + r.w / 2 - origin.left}px`;
    ring.style.top = `${r.y + r.h / 2 - origin.top}px`;
    ring.style.setProperty('--radius', `${Math.max(r.w, r.h) * 0.5}px`);
    for (let i = 0; i < 12; i += 1) {
      const dot = document.createElement('i');
      dot.style.setProperty('--a', `${i * 30}deg`);
      ring.appendChild(dot);
    }
    fx.appendChild(ring);
    later(460, () => ring.remove());
  }

  // -- the rhyme decision ----------------------------------------------------

  function roleOf(id) {
    if (id === TARGET_ID) return 'neutral';
    if (!caseDef) return 'none';
    if (caseDef.rhymes.includes(id)) return 'correct';
    if (caseDef.distractors.includes(id)) return 'wrong';
    return 'none';
  }

  function bubbleFor(word, tone) {
    const labels = !modeDef || modeDef.labels !== false;
    return labels
      ? { text: word, tone, ms: T(260) }
      : { text: '', glyph: 'sound', tone, ms: T(260) };
  }

  function slotRect(index) {
    const el = ctx.traySlot(index);
    if (!el) return { x: 0, y: 0, w: 96, h: 96 };
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }

  // §9.3 — sparkle -> green tint -> flight -> praise. Input is never locked:
  // the child may tap something else at any point and the new tap supersedes.
  async function correctSequence(handle, word) {
    const mine = caseToken;
    busy += 1;
    // §3.4 — the last find's own yes-N is suppressed; great-job lands 400 ms
    // later and the two would collide. Counted on STARTED sequences, not
    // landed ones, so overlapping taps still suppress the right line.
    const ordinal = startedCorrect;
    startedCorrect += 1;
    const isThird = ordinal >= caseDef.rhymes.length - 1;
    sfx.pop();
    let praiseDone = Promise.resolve();
    later(40, () => {
      if (mine !== caseToken) return;
      praiseDone = voice.seq([voice.keyForWord(word), ...(isThird ? [] : [{ key: ctx.yesKey(), gap: 110 }])],
        ctx.timeScale());
      handle.bubble(bubbleFor(word, 'neutral'));
    });
    later(260, () => { if (mine === caseToken) { sfx.sparkle(); sparkleRing(handle); } });
    later(300, () => {
      if (mine !== caseToken) return;
      handle.setState('lit');
      handle.bubble(bubbleFor(word, 'yes'));
    });

    await wait(T(520));
    if (mine !== caseToken) { busy -= 1; return; }

    // Slots are claimed synchronously here so two flights never target one slot.
    let slot = 0;
    while (claimed.has(slot)) slot += 1;
    claimed.add(slot);
    sfx.whoosh();
    await handle.flyTo(slotRect(slot), { ms: T(620), arc: 120 });
    if (mine !== caseToken) { busy -= 1; return; }

    // t = 1140: the flight lands.
    sfx.pop();
    handle.setState('found');
    handle.setEnabled(false);
    found.push(word);
    if (on.found) on.found(word, slot, found.slice());

    busy -= 1;
    if (found.length >= caseDef.rhymes.length) {
      if (on.complete) on.complete(word, found.slice());
      return;
    }
    // The counter must not interrupt the praise line: say() supersedes the
    // seq, and hat's 1.04 s word clip leaves only ~170 ms of margin if this
    // fires on the clock alone.
    (async () => {
      await wait(T(260));
      await praiseDone;
      if (mine !== caseToken) return;
      const remaining = caseDef.rhymes.length - found.length;
      voice.say(remaining === 2 ? 'two-more' : 'one-more');
    })();
  }

  // §9.4 — boing -> wiggle -> grey bubble -> fade. Nothing is consumed.
  async function wrongSequence(handle, word) {
    const mine = caseToken;
    wrongTaps += 1;
    const ladderKey = noLadderKey((config.voice || {}).noLadder, wrongTaps - 1);
    sfx.pop();
    later(40, () => {
      if (mine !== caseToken) return;
      voice.say(voice.keyForWord(word));
      handle.bubble(bubbleFor(word, 'neutral'));
    });
    later(300, () => {
      if (mine !== caseToken) return;
      sfx.boing();
      handle.wiggle({ ms: T(320), deg: 5 });
    });
    later(340, () => {
      if (mine !== caseToken) return;
      handle.bubble(bubbleFor(word, 'no'));
      handle.setState('declined');
    });
    await wait(T(460));
    if (mine !== caseToken) return;
    voice.say(ladderKey);
    if (on.wrong) on.wrong(word, wrongTaps);
    later(780, () => {
      // t = 1240 — declinedHoldMs after `declined` began. Tappable throughout.
      if (mine === caseToken && handle.state === 'declined') handle.setState('idle');
    });
    later(1400, () => {
      if (mine === caseToken) handle.hideBubble({ ms: T(240) });
    });
  }

  // The target sprite: re-speaks the target, pops a neutral bubble, never scores.
  async function neutralSequence(handle, word) {
    const mine = caseToken;
    sfx.pop();
    voice.sayWord(word);
    await handle.bubble(bubbleFor(word, 'neutral'));
    if (mine !== caseToken) return;
    later(Number(tuning.bubbleHoldMs) || 1400, () => {
      if (mine === caseToken) handle.hideBubble({ ms: T(240) });
    });
  }

  /**
   * §7.3 — the single tap handler. `scene.onTap` and QLOBE_DEBUG.tap() both
   * land here; there is no test-only code path. Resolves when the resulting
   * choreography settles.
   */
  async function handleTap(id) {
    const screen = ctx.screen();
    if (screen !== 'play' || !caseDef) return { accepted: false, role: 'none' };
    const handle = scene.get(id);
    const role = roleOf(id);
    if (!handle || role === 'none') return { accepted: false, role: 'none' };
    if (role === 'neutral') {
      await neutralSequence(handle, caseDef.target);
      return { accepted: false, role: 'neutral' };
    }
    if (role === 'correct') {
      if (found.includes(id) || handle.state === 'found') {
        return { accepted: false, role: 'correct' };
      }
      await correctSequence(handle, id);
      return { accepted: true, role: 'correct' };
    }
    await wrongSequence(handle, id);
    return { accepted: false, role: 'wrong' };
  }

  scene.onTap((id) => { void handleTap(id); });

  // -- case lifecycle --------------------------------------------------------

  /** §9.6 room crossfade, then the hotspots, then a staggered pop sweep. */
  async function loadCase(nextCase, nextMode) {
    caseToken += 1;
    const mine = caseToken;
    cancelTimers();
    scene.clear();
    placement = [];
    targetHandle = null;
    found.length = 0;
    claimed.clear();
    wrongTaps = 0;
    startedCorrect = 0;
    busy = 0;
    caseDef = nextCase;
    modeDef = nextMode;

    const room = config.rooms[caseDef.room];
    if (room && room.bg && room.bg !== currentRoom) {
      currentRoom = room.bg;
      await scene.setBackground(room.bg, { ms: T(420) });
      if (mine !== caseToken) return;
    }

    layout = scene.layoutHint();

    // The target sprite is a hotspot (id 'target', role neutral) so it tracks
    // the same transform and the same press feedback as everything else (§2.5).
    targetHandle = scene.addHotspot({
      ...targetBox(),
      id: TARGET_ID,
      sprite: null,
      alt: caseDef.target,
      z: 2,
    });
    if (targetHandle) {
      applySprite(targetHandle, caseDef.target);
      // The target is the answer key, not a candidate: it is grounded like the
      // rest but never wears the findable halo (§2.5 — it never scores).
      targetHandle.el.classList.add('rd-target', 'rd-surf-floor');
    }

    placement = assignZones(config, caseDef, modeDef, ctx.seed()).map((entry) => {
      const handle = scene.addHotspot({
        ...boxFor(entry),
        id: entry.word,
        sprite: null,
        alt: entry.word,   // §5.8 — in Mode 2 the aria-label is still the word
        z: 3,
      });
      if (handle) {
        applySprite(handle, entry.word);
        handle.el.classList.add(surfaceClassFor(entry.zone));
      }
      return { ...entry, handle };
    });

    placeMagnifier();
    paintSpriteVars();

    // §9.6 — pop in, staggered 70 ms in zone-index order.
    const order = placement.slice().sort((a, b) => a.zoneIndex - b.zoneIndex);
    if (targetHandle) targetHandle.pop({ ms: T(340) });
    order.forEach((entry, i) => {
      later(70 * (i + 1), () => { if (entry.handle) entry.handle.pop({ ms: T(260) }); });
    });
  }

  /** §9.8 — one sweep across every unfound hotspot, zone order, 90 ms stagger. */
  function pulseSweep() {
    const mine = caseToken;
    const order = placement
      .slice()
      .sort((a, b) => a.zoneIndex - b.zoneIndex)
      .filter((entry) => entry.handle && entry.handle.state !== 'found');
    order.forEach((entry, i) => {
      later(90 * i, () => {
        if (mine === caseToken) entry.handle.pulse({ ms: T(900), scale: 1.06 });
      });
    });
  }

  function targets() {
    if (!caseDef) return [];
    return scene.rects().map((r) => ({
      id: r.id,
      role: roleOf(r.id),
      rect: { ...r.rect },
      state: r.state,
      word: r.id === TARGET_ID ? caseDef.target : r.id,
    }));
  }

  function zones() {
    if (!caseDef) return [];
    const room = config.rooms[caseDef.room];
    const byZone = new Map(placement.map((p) => [p.zoneIndex, p.word]));
    return room.zones.map((z, i) => {
      const tl = scene.toScreen(z.x, z.y);
      const br = scene.toScreen(z.x + z.w, z.y + z.h);
      return {
        name: z.name,
        art: { x: z.x, y: z.y, w: z.w, h: z.h },
        screen: { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y },
        word: byZone.has(i) ? byZone.get(i) : null,
      };
    });
  }

  function clearCase() {
    caseToken += 1;
    cancelTimers();
    fx.replaceChildren();
    scene.clear();
    placement = [];
    targetHandle = null;
    caseDef = null;
    found.length = 0;
    claimed.clear();
    wrongTaps = 0;
    startedCorrect = 0;
    busy = 0;
    magnifier.hidden = true;
  }

  return {
    scene,
    loadCase,
    pulseSweep,
    handleTap,
    targets,
    zones,
    clearCase,
    get found() { return found.slice(); },
    get wrongTaps() { return wrongTaps; },
    get busy() { return busy > 0; },
    get layout() { return layout; },
    get lastReflow() { return lastReflow; },
    get caseDef() { return caseDef; },
    setEnabled(on_) { scene.setEnabled(on_); },
    reflow() { scene.reflow(); },
    /** main.js's `fastTimers()` hook — mirrors bug-hotel-observer's retuneDwell(). */
    retuneTimers() { timerGroup.setScale(1 / ctx.timeScale()); },
    unfoundRhymes() {
      if (!caseDef) return [];
      return caseDef.rhymes.filter((w) => !found.includes(w));
    },
    destroy() {
      clearCase();
      fx.remove();
      magnifier.remove();
      scene.destroy();
    },
  };
}
