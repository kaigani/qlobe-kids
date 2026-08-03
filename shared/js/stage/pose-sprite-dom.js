// pose-sprite-dom.js — the DOM twin of pose-sprite.js.
//
// WHY THIS EXISTS
// ---------------
// `qlobe-pose-actor` is a whole-character storybook format: each semantic pose
// ('neutral', 'notice', 'celebrate', …) is a complete illustration, and a change
// of pose is a short "paper-pop" rather than skeletal interpolation. The
// renderer for it, shared/js/stage/pose-sprite.js, draws into a PixiJS scene —
// so counting-treasure-cups, whose play field has to be DOM (its backdrop is a
// real <video> element), forked the whole thing into a local actor.js and said
// so in its header. That fork is what this module deletes.
//
// The pack format, the pose names and the anchor semantics are the Pixi
// module's, unchanged, so packs stay studio- and library-compatible in both
// renderers.
//
// PARITY WITH THE PIXI PAPER-POP
// ------------------------------
// pose-sprite.js runs, on `transition.durationMs` (default 220ms):
//   incoming  alpha 0 -> 1  and  scale 0.92 -> 1.04   over 62% of it, easeOutCubic
//   incoming  scale 1.04 -> 1                         over the remaining 38%, easeInOutSine
//   outgoing  alpha 1 -> 0                            over the whole of it, easeInOutSine
// Those are the numbers in the CSS below, keyframe for keyframe, including the
// two-phase timing function — which is why the incoming pose is a SECOND <img>
// stacked over the outgoing one rather than a new `src` on the same element.
// One element cannot cross-fade with itself, and swapping `src` in place also
// means the child watches the old pose blink out while the new one decodes.
//
// The local fork approximated this with a single <img> whose pop keyframe
// started at `opacity: .5` — a stand-in for the outgoing pose it had thrown
// away. With a real outgoing layer the incoming one can start at 0 like the Pixi
// original does, because there is something behind it.
//
// WHY setPose AWAITS THE IMAGE
// ----------------------------
// pose-sprite.js awaits `PIXI.Assets.load` before it touches the scene, so a
// pose change is atomic: you never see a half-loaded actor. Same here — the new
// <img> is decoded off-screen and only then inserted. `preload()` is what makes
// that await cost nothing in practice, and it deliberately runs in IDLE time,
// one pose at a time: a full cast is ~900 KB, and fetching it all up front would
// compete with the splash and the first backdrop clip for a tablet's bandwidth,
// to spare a flicker the child may never see.
//
// EVERYTHING DEGRADES
// -------------------
// `loadPoseActorDom` throws on a bad manifest, exactly as the Pixi loader does.
// `loadPoseActors` — the plural, which is what a game actually calls — never
// rejects: a missing pack, a missing pose, or a broken image leaves that actor
// absent (or invisible) and the game entirely playable.

/** Fallback paper-pop duration when the manifest does not name one. */
export const POSE_POP_MS = 220;

/** Fraction of the pop spent on the overshoot. Mirrors `up` in pose-sprite.js. */
const POP_UP_FRACTION = 0.62;

/**
 * Warm-up order: the poses that carry the most lines first. A pose the manifest
 * does not list is skipped; a pose not in this list warms after the ones that are.
 */
export const DEFAULT_PRELOAD_ORDER = Object.freeze([
  'neutral', 'interact', 'notice', 'celebrate', 'react', 'enter',
]);

const STYLE_ID = 'qk-pose-sprite-style';

// easeOutCubic / easeInOutSine — the two curves shared/js/stage/tween.js hands
// pose-sprite.js, as their CSS cubic-bezier equivalents.
const EASE_OUT_CUBIC = 'cubic-bezier(.215,.61,.355,1)';
const EASE_IN_OUT_SINE = 'cubic-bezier(.445,.05,.55,.95)';

const CSS = `
.qk-pose-img {
  display: block;
  width: 100%;
  height: auto;
}
.qk-pose-img.qk-pose-out {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  pointer-events: none;
  animation: qk-pose-fade var(--qk-pose-ms, ${POSE_POP_MS}ms) ${EASE_IN_OUT_SINE} both;
}
.qk-pose-img.qk-pose-in {
  animation: qk-pose-pop var(--qk-pose-ms, ${POSE_POP_MS}ms) both;
  will-change: transform, opacity;
}
@keyframes qk-pose-pop {
  0%   { opacity: 0; transform: scale(.92); animation-timing-function: ${EASE_OUT_CUBIC}; }
  62%  { opacity: 1; transform: scale(1.04); animation-timing-function: ${EASE_IN_OUT_SINE}; }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes qk-pose-fade {
  from { opacity: 1; }
  to   { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .qk-pose-img.qk-pose-in,
  .qk-pose-img.qk-pose-out { animation: none; }
  .qk-pose-img.qk-pose-out { display: none; }
}
`;

function ensureStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------- caches

const manifestCache = new Map();
const imageCache = new Map();

/** Mirrors pose-sprite.js's fetchManifest, cache policy included. */
async function fetchManifest(url) {
  const href = new URL(url, document.baseURI).href;
  if (!manifestCache.has(href)) {
    manifestCache.set(href, fetch(href, { cache: 'no-store' }).then((response) => {
      if (!response.ok) throw new Error(`Could not load pose manifest ${new URL(href).pathname}`);
      return response.json();
    }));
  }
  return manifestCache.get(href);
}

/**
 * Decode one pose image off-screen. The DOM analogue of `PIXI.Assets.load`, and
 * cached the same way so a repeat pose costs nothing.
 * @returns {Promise<boolean>} false when the art 404s or fails to decode —
 *          never rejects, because a missing pose must not take the game down.
 */
function loadImage(href) {
  if (!imageCache.has(href)) {
    imageCache.set(href, new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = href;
    }));
  }
  return imageCache.get(href);
}

// -------------------------------------------------------------------- actor

/**
 * Load a `qlobe-pose-actor` pack and render it as DOM.
 *
 * The Pixi loader's `{ view, manifest, pose, setPose, preload, destroy }` with
 * `el` in place of `view`, plus the two things a DOM actor needs that a Pixi
 * scene graph handles by parenting: `show()` / `hide()`.
 *
 * @param {string|URL} manifestUrl
 * @param {object} [opts]
 * @param {?Element} [opts.host]                appended here when given
 * @param {string} [opts.className='qk-pose-actor'] base class on the wrapper
 * @param {?string} [opts.side]                 adds `${className}-${side}`
 * @param {?number} [opts.scale]                written to `opts.scaleVar`
 * @param {string} [opts.scaleVar='--actor-scale']
 * @param {string} [opts.visibleClass='is-in']  toggled by show()/hide()
 * @param {string} [opts.brokenClass='is-broken'] added when the art fails to load
 * @param {string[]} [opts.preloadOrder=DEFAULT_PRELOAD_ORDER]
 * @param {Function} [opts.reducedMotion]       () -> boolean
 * @returns {Promise<object>} the actor
 * @throws when the manifest is missing or is not a `qlobe-pose-actor` with a
 *         `neutral` pose — same contract as loadPoseActor().
 */
export async function loadPoseActorDom(manifestUrl, {
  host = null,
  className = 'qk-pose-actor',
  side = null,
  scale = null,
  scaleVar = '--actor-scale',
  visibleClass = 'is-in',
  brokenClass = 'is-broken',
  preloadOrder = DEFAULT_PRELOAD_ORDER,
  reducedMotion = prefersReducedMotion,
} = {}) {
  const url = new URL(manifestUrl, document.baseURI);
  const manifest = await fetchManifest(url);
  if (manifest.format !== 'qlobe-pose-actor' || !manifest.poses?.neutral) {
    throw new Error(`Invalid pose actor manifest: ${url.pathname}`);
  }
  ensureStyle();

  const base = new URL('./', url);
  const transition = manifest.transition || { kind: 'paper-pop', durationMs: POSE_POP_MS };
  const popMs = Number.isFinite(transition.durationMs) ? transition.durationMs : POSE_POP_MS;

  const el = document.createElement('div');
  el.className = side ? `${className} ${className}-${side}` : className;
  // Decorative: the pose art restates what the voice line already said, and the
  // game must never require reading it.
  el.setAttribute('aria-hidden', 'true');
  el.style.setProperty('--qk-pose-ms', `${popMs}ms`);
  if (scale != null) el.style.setProperty(scaleVar, String(scale));
  if (host) host.append(el);

  let img = null;          // the live (incoming) layer
  let pose = null;
  let visible = false;
  let destroyed = false;
  let generation = 0;
  let popTimer = null;

  const poseUrl = (name) => {
    const definition = manifest.poses[name] || manifest.poses.neutral;
    return definition ? { definition, url: new URL(definition.art, base).href } : null;
  };

  function makeImg(href) {
    const next = document.createElement('img');
    next.className = 'qk-pose-img';
    next.alt = '';
    next.draggable = false;
    next.decoding = 'async';
    next.src = href;
    return next;
  }

  /**
   * Swap to `name`. Resolves true when the pose is on screen.
   *
   * Mirrors pose-sprite.js: an unknown pose falls back to 'neutral', re-setting
   * the current pose is a no-op, and a generation token means a newer swap
   * always wins over one still awaiting its art.
   *
   * @param {string} name
   * @param {{instant?: boolean}} [opts] instant skips the pop entirely
   * @returns {Promise<boolean>}
   */
  async function setPose(name, { instant = false } = {}) {
    if (destroyed) return false;
    const resolved = manifest.poses[name] ? name : 'neutral';
    if (resolved === pose && img) return true;

    const target = poseUrl(resolved);
    if (!target) return false;

    const ownGeneration = ++generation;
    const ok = await loadImage(target.url);
    if (destroyed || ownGeneration !== generation) return false;
    if (!ok) {
      // A broken pose is not a broken game: hide this actor and carry on. The
      // fork did this with an `error` listener on the live <img>; doing it from
      // the decode result means the child never sees the broken-image glyph.
      if (brokenClass) el.classList.add(brokenClass);
      return false;
    }
    if (brokenClass) el.classList.remove(brokenClass);

    const old = img;
    const next = makeImg(target.url);
    pose = resolved;

    if (!old || instant || transition.kind !== 'paper-pop' || reducedMotion()) {
      old?.remove();
      el.append(next);
      img = next;
      return true;
    }

    // The outgoing layer is absolutely positioned over the incoming one, so the
    // wrapper's height keeps coming from the pose that is staying.
    old.classList.remove('qk-pose-in');
    old.classList.add('qk-pose-out');
    next.classList.add('qk-pose-in');
    el.append(next);
    img = next;

    if (popTimer) clearTimeout(popTimer);
    return new Promise((resolve) => {
      popTimer = setTimeout(() => {
        popTimer = null;
        old.remove();
        // Leaving `qk-pose-in` on would re-run the pop on any later reflow that
        // restarts animations (a class change on an ancestor, a re-parent).
        next.classList.remove('qk-pose-in');
        resolve(!destroyed && ownGeneration === generation);
      }, popMs + 40);
    });
  }

  /**
   * Warm the pose art in idle time, one pose at a time. Skips whatever is on
   * screen — the live <img> is already fetching it and a second concurrent
   * request for the same URL just races the first.
   * @param {string[]} [names] defaults to every pose in the manifest
   */
  function preload(names = Object.keys(manifest.poses)) {
    const rank = (name) => {
      const i = preloadOrder.indexOf(name);
      return i === -1 ? preloadOrder.length : i;
    };
    const queue = names
      .filter((name) => manifest.poses[name] && name !== pose)
      .sort((a, b) => rank(a) - rank(b));
    const idle = (typeof window !== 'undefined' && window.requestIdleCallback)
      ? window.requestIdleCallback.bind(window)
      : ((fn) => setTimeout(fn, 400));
    const next = (i) => {
      if (destroyed || i >= queue.length) return;
      idle(() => {
        if (destroyed) return;
        const target = poseUrl(queue[i]);
        if (!target) { next(i + 1); return; }
        loadImage(target.url).then(() => next(i + 1));
      });
    };
    next(0);
  }

  /** Bring the actor on screen holding `pose`. */
  function show(name = 'neutral') {
    if (destroyed) return;
    setPose(name);
    visible = true;
    if (visibleClass) el.classList.add(visibleClass);
  }

  /** Send the actor back off screen. The pose it holds is left alone. */
  function hide() {
    visible = false;
    if (visibleClass) el.classList.remove(visibleClass);
  }

  function destroy() {
    destroyed = true;
    generation += 1;
    if (popTimer) { clearTimeout(popTimer); popTimer = null; }
    el.remove();
  }

  await setPose('neutral', { instant: true });

  return {
    el,
    manifest,
    base,
    get pose() { return pose; },
    get visible() { return visible; },
    get img() { return img; },
    poseUrl: (name) => poseUrl(name)?.url ?? null,
    setPose,
    preload,
    show,
    hide,
    destroy,
  };
}

/**
 * Build a cast from a `{ role: { pack, side?, scale? } }` map.
 *
 * Never rejects. Roles whose pack is missing or invalid are simply absent from
 * the result, so callers keep using optional chaining (`actors.parrot?.show(…)`)
 * and the game never depends on any one character existing.
 *
 * @param {Element} host  the layer every actor is appended to
 * @param {Record<string, {pack: string, side?: string, scale?: number}>} defs
 * @param {object} [opts] passed through to loadPoseActorDom (className, …)
 * @returns {Promise<Record<string, object>>} role -> actor
 */
export async function loadPoseActors(host, defs, opts = {}) {
  const entries = await Promise.all(
    Object.entries(defs || {}).map(async ([role, def]) => {
      if (!def || !def.pack) return null;
      try {
        const actor = await loadPoseActorDom(def.pack, {
          ...opts,
          host,
          side: def.side ?? opts.side ?? null,
          scale: def.scale ?? opts.scale ?? null,
        });
        actor.preload();
        return [role, actor];
      } catch {
        return null;
      }
    })
  );
  const loaded = entries.filter(Boolean);

  // Each actor appends itself as soon as ITS manifest resolves, so without this
  // the sibling order — and therefore which character is painted in front where
  // the cast overlaps — is decided by whichever fetch won the race. Re-append in
  // the order `defs` declares, so the config is the answer and it is the same
  // answer on a cold load, a warm cache, and a slow tablet.
  if (host) for (const [, actor] of loaded) host.append(actor.el);

  return Object.fromEntries(loaded);
}

export const __test = { fetchManifest, loadImage, manifestCache, imageCache };
