// art-pixi.js — the Pixi counterpart of engines/art.js.
// Resolves the SAME config art refs into Pixi display objects, so game configs
// work unchanged on Stage v2 engines:
//
//   emoji:🐸 | shared:objects/cat.png | char:maya | text:CAT | swatch:#f4c53d
//
// Every returned object is sized to fit a `size` box (contain), centered pivot.

const SHARED = new URL('../../', import.meta.url); // -> shared/

export function artUrlRef(ref) {
  if (ref.startsWith('shared:')) return new URL('assets/' + ref.slice(7), SHARED).href;
  if (ref.startsWith('char:')) return new URL('characters/' + ref.slice(5) + '/portrait.png', SHARED).href;
  return null;
}

/**
 * Build a display object for an art ref.
 * @returns {Promise<PIXI.Container>} centered-pivot object fitting size×size
 */
export async function artObj(PIXI, ref, size, alt = '') {
  const wrap = new PIXI.Container();
  wrap.accessibleTitle = alt;

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
  const url = artUrlRef(ref);
  if (!url) { // unknown ref → render as text (mirrors art.js graceful fallback)
    return artObj(PIXI, 'emoji:' + ref.slice(ref.indexOf(':') + 1), size, alt);
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
