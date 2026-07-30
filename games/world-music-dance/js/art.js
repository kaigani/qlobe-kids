// art.js — the drawing bits the map and dance scenes both need.
//
// Two jobs, both about surviving a repo with no finished art in it yet:
//
// 1. `loadTexture` never throws and never rejects. `PIXI.Assets.load` on a
//    missing file rejects (and logs its own noise), which would take out a
//    whole scene build; every art call in this game is optional, so a miss
//    returns null and the caller draws its cut-paper stand-in instead. It also
//    routes through an <img> + decode() so pattern #12 holds: the texture is
//    resident before anything tries to draw it.
// 2. `makeCard` composes a dance card at runtime from a frame + a pose — the
//    game ships zero card art on purpose (the GDD budgets 0 bytes for dance
//    and move cards).

/** Load an image, resolving to null on any failure. Never rejects. */
export function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// One probe per URL per session — INCLUDING the misses. The map scene is built
// fresh on every choose→dance→place cycle, so without a negative cache a repo
// with no art in it yet re-404s the same five files a dozen times a session.
const textureCache = new Map();

/** Load a Pixi texture, or null when the file is absent. Never rejects. */
export function loadTexture(PIXI, url) {
  const key = url || '';
  if (!textureCache.has(key)) {
    textureCache.set(key, (async () => {
      const img = await loadImage(key);
      if (!img) return null;
      // An <img> that fired onload may still be undecoded, and an undecoded
      // image cannot be uploaded to the GPU — the first frame that draws it
      // comes out blank (interaction pattern #12).
      try { await img.decode(); } catch { /* decode is best-effort */ }
      try { return PIXI.Texture.from(img); } catch { return null; }
    })());
  }
  return textureCache.get(key);
}

/** '#e2793d' -> 0xe2793d. Falls back to warm lantern gold. */
export function hexInt(value, fallback = 0xffd98a) {
  if (typeof value !== 'string') return fallback;
  const parsed = Number.parseInt(value.replace('#', ''), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** The stand-in glyph for a pose, used everywhere real pose art is missing. */
export function poseGlyph(pose) {
  switch (pose) {
    case 'move-1': return '💃';
    case 'move-2': return '🕺';
    case 'move-3': return '🤸';
    case 'celebrate': return '🎉';
    default: return '🧍';
  }
}

/** A one-glyph label centred at (0, 0) — the grey-box stand-in for pose art. */
export function glyphText(PIXI, glyph, size) {
  const text = new PIXI.Text({
    text: glyph,
    style: { fontFamily: 'Fredoka, sans-serif', fontSize: Math.round(size), fill: 0xfff3d6, align: 'center' },
  });
  text.anchor.set(0.5);
  return text;
}

/**
 * The culture's neutral pose file, or null when its pack has not been produced.
 *
 * Gated on the pose index (main.js reads assets/pose-actors/index.json) rather
 * than on optimism: asking for ghana's dancer before it exists costs a 404 on
 * every card, stamp and dock in the game.
 */
export function neutralPoseUrl(ctx, culture) {
  if (!ctx || !culture || !ctx.poseReady(culture.id)) return null;
  const base = culture.dancer && culture.dancer.base;
  if (!base) return null;
  return ctx.assetUrl(`${base}poses/neutral.webp`);
}

/**
 * A cut-paper stand-in dancer — rounded-rect body, circle head, accent paper on
 * a cream face — for the cultures whose pose pack has not been produced yet.
 * Origin is at the FEET, matching the pose sprites' (0.5, 1) anchor, so both
 * drop into the same slot on a card.
 */
export function poseSilhouette(PIXI, accent, figureHeight) {
  const g = new PIXI.Graphics();
  const H = Math.max(24, figureHeight);
  const hem = H * 0.46;
  const bodyH = H * 0.66;
  const headR = H * 0.15;
  g.ellipse(0, 0, hem * 0.6, H * 0.05).fill({ color: 0x000000, alpha: 0.14 });
  g.roundRect(-hem / 2, -bodyH, hem, bodyH, hem * 0.36).fill({ color: accent, alpha: 0.92 });
  g.roundRect(-hem / 2, -bodyH, hem, bodyH, hem * 0.36)
    .stroke({ width: Math.max(2, H * 0.026), color: 0xfff3d6, alpha: 0.55 });
  g.circle(0, -bodyH - headR * 0.92, headR).fill({ color: accent, alpha: 0.92 });
  g.circle(0, -bodyH - headR * 0.92, headR)
    .stroke({ width: Math.max(2, H * 0.026), color: 0xfff3d6, alpha: 0.55 });
  return g;
}

/**
 * Put a pose sprite (anchored at its soles) into a card-shaped slot.
 * @returns {object} the sprite, already positioned.
 */
function poseSprite(PIXI, texture, { boxW, boxH, footY }) {
  const art = new PIXI.Sprite(texture);
  art.anchor.set(0.5, 1);
  const scale = Math.min(boxW / art.texture.width, boxH / art.texture.height);
  art.scale.set(scale);
  art.position.set(0, footY);
  return art;
}

/**
 * Fill a card's art slot: real pose art when the culture has a pack, the
 * cut-paper silhouette when it does not. The URL load is async but the slot is
 * never empty — the silhouette draws first and is swapped out the moment the
 * texture resolves (usually the same microtask, since the dance screen has
 * already pulled these files into the texture cache).
 */
function fillPoseSlot(PIXI, parent, { pose, poseUrl, accent, boxW, boxH, footY, figureHeight }) {
  if (pose) { parent.addChild(poseSprite(PIXI, pose, { boxW, boxH, footY })); return; }
  const stand = poseSilhouette(PIXI, accent, figureHeight);
  stand.position.set(0, footY);
  parent.addChild(stand);
  if (!poseUrl) return;
  loadTexture(PIXI, poseUrl).then((texture) => {
    if (!texture || parent.destroyed || stand.destroyed) return;
    stand.destroy();
    parent.addChild(poseSprite(PIXI, texture, { boxW, boxH, footY }));
  });
}

/**
 * A dance card: cream cut-paper backing, the culture's accent border, and the
 * dancer's neutral pose (real texture when the pose pack exists, a cut-paper
 * silhouette when it does not). Origin is the card centre so it can be tweened
 * and scaled freely.
 *
 * @returns {object} PIXI.Container with `cardWidth` / `cardHeight` attached.
 */
export function makeCard(PIXI, {
  culture, width = 240, height = 300, backing = null, pose = null, poseUrl = null,
}) {
  const card = new PIXI.Container();
  const accent = hexInt(culture && culture.accent);
  const half = { x: width / 2, y: height / 2 };

  const shadow = new PIXI.Graphics();
  shadow.roundRect(-half.x, -half.y + 8, width, height, 22).fill({ color: 0x000000, alpha: 0.32 });
  card.addChild(shadow);

  if (backing) {
    const sprite = new PIXI.Sprite(backing);
    sprite.anchor.set(0.5);
    sprite.width = width;
    sprite.height = height;
    card.addChild(sprite);
  } else {
    const face = new PIXI.Graphics();
    face.roundRect(-half.x, -half.y, width, height, 22).fill(0xfff3d6);
    face.roundRect(-half.x + 8, -half.y + 8, width - 16, height - 16, 16)
      .stroke({ width: 4, color: accent, alpha: 0.85 });
    card.addChild(face);
  }

  const band = new PIXI.Graphics();
  band.roundRect(-half.x, half.y - height * 0.18, width, height * 0.18, 18).fill({ color: accent, alpha: 0.9 });
  card.addChild(band);

  // The dancer stands ON the accent band, filling the paper the way the DOM move
  // cards do (.wmd-move img is 104% × 82%) — a pose floating in a sea of cream
  // is the tell that a card was composed by code rather than drawn.
  fillPoseSlot(PIXI, card, {
    pose,
    poseUrl,
    accent,
    boxW: width,
    boxH: height * 0.74,
    footY: half.y - height * 0.19,
    figureHeight: Math.min(width * 0.86, height * 0.72),
  });

  card.cardWidth = width;
  card.cardHeight = height;
  return card;
}

/** The small stamped card left behind on the map once a culture is placed. */
export function makeStamp(PIXI, culture, size = 74, { pose = null, poseUrl = null } = {}) {
  const stamp = new PIXI.Container();
  const accent = hexInt(culture && culture.accent);
  const g = new PIXI.Graphics();
  g.roundRect(-size / 2, -size * 0.62, size, size * 1.24, 12).fill(0xfff3d6);
  g.roundRect(-size / 2, -size * 0.62, size, size * 1.24, 12).stroke({ width: 4, color: accent });
  stamp.addChild(g);
  fillPoseSlot(PIXI, stamp, {
    pose,
    poseUrl,
    accent,
    boxW: size * 0.86,
    boxH: size * 1.02,
    footY: size * 0.5,
    figureHeight: size * 0.86,
  });
  stamp.rotation = -0.06;
  return stamp;
}

/**
 * The music-note glyph that rides inside the big cream call-to-action buttons.
 *
 * Inline SVG rather than the shared btn-play.png: that icon is painted white for
 * dark HUD circles and simply vanishes on a cream button. `currentColor` lets
 * the stylesheet own the brown so there is one place to change it.
 */
export const NOTE_SVG = `<svg class="wmd-note" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path fill="currentColor" d="M9.1 6.2 19.6 3.5v3.4L9.1 9.6z"/>
  <rect fill="currentColor" x="9.1" y="5.6" width="2.1" height="11.4" rx="1"/>
  <rect fill="currentColor" x="17.5" y="3.4" width="2.1" height="11.4" rx="1"/>
  <ellipse fill="currentColor" cx="7.1" cy="17.5" rx="3.9" ry="3"/>
  <ellipse fill="currentColor" cx="15.5" cy="15.3" rx="3.9" ry="3"/>
</svg>`;
