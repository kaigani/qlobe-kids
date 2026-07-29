// art-pixi.js — the Pixi counterpart of engines/art.js.
// Resolves the SAME config art refs into Pixi display objects, so game configs
// work unchanged on Stage v2 engines:
//
//   emoji:🐸 | shared:objects/cat.webp | char:maya | text:CAT | swatch:#f4c53d
//   game:assets/engine.webp            game-local file, resolved against `base`
//
// A ref may also be an ARRAY of layers, painted bottom-to-top:
//
//   [ 'game:assets/car.webp',
//     { ref: 'text:A', scale: 0.42, dx: 0.06, dy: -0.08 } ]
//
// Layer offsets dx/dy are FRACTIONS OF `size`, never pixels, so a composed
// stack survives every rescale (tray card → drag lift → slot tween) without
// drifting apart.
//
// Every returned object is sized to fit a `size` box (contain), centered pivot.

const SHARED = new URL('../../', import.meta.url); // -> shared/

/**
 * Resolve an art ref to a URL string, or null when the ref is not file-backed.
 * @param {string} ref
 * @param {string} [base] base URL for `game:` refs (default: document.baseURI)
 * @returns {string|null}
 */
export function artUrlRef(ref, base) {
  if (typeof ref !== 'string') return null; // arrays/objects have no single URL
  if (ref.startsWith('shared:')) return new URL('assets/' + ref.slice(7), SHARED).href;
  if (ref.startsWith('char:')) return new URL('characters/' + ref.slice(5) + '/portrait.png', SHARED).href;
  if (ref.startsWith('game:')) return new URL(ref.slice(5), base || document.baseURI).href;
  return null;
}

/** Normalise a layer entry: a bare ref string, or { ref, scale, dx, dy, alpha, tint }. */
function layerSpec(entry) {
  return (entry && typeof entry === 'object' && !Array.isArray(entry)) ? entry : { ref: entry };
}

/**
 * Build a display object for an art ref.
 * @param {any} PIXI
 * @param {string|Array} ref string ref, or array of layers (index 0 = bottom)
 * @param {number} size box to fit, in px
 * @param {string} [alt] accessible name
 * @param {{base?: string}} [opts] base URL for `game:` refs
 * @returns {Promise<PIXI.Container>} centered-pivot object fitting size×size
 */
export async function artObj(PIXI, ref, size, alt = '', opts = {}) {
  const base = opts && opts.base;
  const wrap = new PIXI.Container();
  wrap.accessibleTitle = alt;

  // --- composed / layered ref ------------------------------------------
  if (Array.isArray(ref)) {
    const specs = ref.map(layerSpec);
    const objs = await Promise.all(specs.map(
      (s) => artObj(PIXI, s.ref, size * (s.scale ?? 1), '', opts),
    ));
    for (let i = 0; i < objs.length; i++) {
      const s = specs[i];
      const obj = objs[i];
      // dx/dy are fractions of size — scale-invariant by construction.
      obj.x = (s.dx ?? 0) * size;
      obj.y = (s.dy ?? 0) * size;
      if (s.alpha != null) obj.alpha = s.alpha;
      if (s.tint != null) {
        const inner = obj.children && obj.children[0];
        if (inner && 'tint' in inner) inner.tint = s.tint;
        else if ('tint' in obj) obj.tint = s.tint;
      }
      wrap.addChild(obj); // painter order = array order
    }
    return wrap;
  }

  if (typeof ref !== 'string') return wrap; // nothing to draw

  if (ref.startsWith('emoji:') || (!ref.includes(':'))) {
    const text = ref.startsWith('emoji:') ? ref.slice(6) : ref;
    const t = new PIXI.Text({ text, style: { fontSize: Math.round(size * 0.72) } });
    t.anchor.set(0.5);
    wrap.addChild(t);
    return wrap;
  }
  if (ref.startsWith('text:')) {
    const t = new PIXI.Text({
      text: ref.slice(5),
      style: {
        fontFamily: 'Fredoka, Arial Rounded MT Bold, sans-serif',
        fontWeight: '600',
        fontSize: Math.round(size * 0.6),
        fill: 0x17517e,
      },
    });
    t.anchor.set(0.5);
    // shrink to fit long words
    if (t.width > size * 0.94) t.scale.set((size * 0.94) / t.width);
    wrap.addChild(t);
    return wrap;
  }
  if (ref.startsWith('swatch:')) {
    const g = new PIXI.Graphics();
    const s = size * 0.78;
    g.roundRect(-s / 2, -s / 2, s, s, s * 0.22)
      .fill(ref.slice(7))
      .stroke({ width: 3, color: 0x17517e, alpha: 0.15 });
    wrap.addChild(g);
    return wrap;
  }
  const url = artUrlRef(ref, base);
  if (!url) { // unknown ref → render as text (mirrors art.js graceful fallback)
    return artObj(PIXI, 'emoji:' + ref.slice(ref.indexOf(':') + 1), size, alt, opts);
  }
  const tex = await PIXI.Assets.load(url);
  const sp = new PIXI.Sprite(tex);
  sp.anchor.set(0.5);
  const k = Math.min(size / sp.width, size / sp.height);
  sp.scale.set(k);
  wrap.addChild(sp);
  return wrap;
}

/** Rounded-card backing (the soft white tile behind art), centered pivot. */
export function card(PIXI, w, h, { fill = 0xffffff, stroke = 0x2d7dd2, strokeWidth = 4, radius = 22 } = {}) {
  const g = new PIXI.Graphics();
  g.roundRect(-w / 2, -h / 2, w, h, radius).fill(fill);
  if (strokeWidth) g.stroke({ width: strokeWidth, color: stroke });
  return g;
}
