// tiles.js — visuals for the build mechanic: flat textured sound tiles (using the
// pre-shaded generated PNGs), the two slot drop-targets, and the pop-in picture
// card (generated object art). All meshes live in the single shared scene.

import * as THREE from 'three';
import { getScene, tween, Ease, onFrame } from './scene.js';

// Palette (matches SPEC / data.js). Saturated, "toyetic" letter colors that pop
// on the white picture card.
const CORAL = '#FF5A2B';
const LEAF = '#43BE2E';
const FONT_STACK = "'Fredoka', 'Arial Rounded MT Bold', sans-serif";

const TILE_W = 1.6;
const TILE_H = 1.6;

// shared plane geometry for tiles (cheap to reuse)
let tileGeo = null;
function getTileGeo() {
  if (!tileGeo) tileGeo = new THREE.PlaneGeometry(TILE_W, TILE_H);
  return tileGeo;
}

const texLoader = new THREE.TextureLoader();

// ---- Tile texture (pre-shaded PNG) -----------------------------------

const tileTexCache = new Map();

/**
 * Load the shared letter-tile PNG as an sRGB, transparent texture. Cached by key.
 * THREE.TextureLoader resolves relative to the DOCUMENT, so from a page at
 * /games/<id>/ the `../../shared/...` path reaches /shared/assets/letter-tiles/.
 * @param {string} key the fragment key (e.g. "c", "at")
 * @returns {THREE.Texture}
 */
function tileTexture(key) {
  if (tileTexCache.has(key)) return tileTexCache.get(key);
  const tex = texLoader.load(`../../shared/assets/letter-tiles/${key}.png`);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tileTexCache.set(key, tex);
  return tex;
}

// ---- Tile ------------------------------------------------------------

/**
 * Make a sound tile — a flat plane textured with the pre-shaded PNG. The art is
 * already shaded/glossy, so we use MeshBasicMaterial (no scene light needed).
 * @param {'onset'|'rime'} type
 * @param {string} text the spelled fragment (e.g. "c", "at") — also the PNG key
 * @param {string} spoken the spoken string from data.js
 */
export function makeTile(type, text, spoken) {
  const group = new THREE.Group();

  const tex = tileTexture(text);
  const plane = new THREE.Mesh(
    getTileGeo(),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  group.add(plane);

  group.userData = {
    pickRoot: true,
    kind: 'tile',
    type,
    text,
    spoken,
    slotted: false,
    baseScale: 1,
    phase: Math.random() * Math.PI * 2,
    home: new THREE.Vector3(),
    busy: false,
  };

  getScene().add(group);
  return group;
}

/** Place a tile's resting "home" (arc) position; it bobs around this point. */
export function setTileHome(tile, x, y, z = 0) {
  tile.userData.home.set(x, y, z);
  tile.position.set(x, y, z);
}

/** Idle bob + sway, phase-offset per tile. Driven from the render loop. */
export function startIdle(tiles) {
  return onFrame((dt, t) => {
    for (const tile of tiles) {
      const d = tile.userData;
      if (d.slotted || d.busy) continue;
      const ph = d.phase;
      tile.position.y = d.home.y + Math.sin(t * 1.6 + ph) * 0.09;
      tile.rotation.z = Math.sin(t * 1.1 + ph) * 0.05;
      tile.rotation.x = Math.sin(t * 0.9 + ph) * 0.03;
    }
  });
}

/** Squash-and-stretch tap bounce, relative to the tile's layout scale. */
export async function bounceTile(tile) {
  const s = tile.userData.baseScale || 1;
  await tween(tile.scale, { x: 1.18 * s, y: 0.82 * s, z: 1.1 * s }, 90, Ease.out);
  await tween(tile.scale, { x: 0.92 * s, y: 1.14 * s, z: 0.98 * s }, 90, Ease.out);
  await tween(tile.scale, { x: s, y: s, z: s }, 140, Ease.outBack);
}

/** Comedic jiggle for the silly response. */
export async function jiggleTile(tile) {
  const r0 = tile.rotation.z;
  for (let i = 0; i < 3; i++) {
    await tween(tile.rotation, { z: r0 + 0.35 }, 70, Ease.inOut);
    await tween(tile.rotation, { z: r0 - 0.35 }, 70, Ease.inOut);
  }
  await tween(tile.rotation, { z: r0 }, 70, Ease.inOut);
}

/**
 * Fly a tile from its current position to a target, with a gentle arc.
 * @returns {Promise<void>}
 */
export async function flyTo(tile, x, y, z = 0.2) {
  const d = tile.userData;
  d.busy = true;
  // reset idle rotation so it lands flat
  await Promise.all([
    tween(tile.position, { x, y, z }, 360, Ease.inOut),
    tween(tile.rotation, { x: 0, y: 0, z: 0 }, 360, Ease.inOut),
  ]);
  d.busy = false;
}

export function disposeTile(tile) {
  getScene().remove(tile);
  tile.traverse((o) => {
    // tile plane geometry is shared (getTileGeo) — never dispose it.
    if (o.geometry && o.geometry !== tileGeo) o.geometry.dispose();
    // tile textures are cached & shared across tiles, so we deliberately do NOT
    // dispose o.material.map here; only dispose the (cheap) material.
    if (o.material) o.material.dispose();
  });
}

// ---- Bench + slots ---------------------------------------------------

/**
 * Build the wooden bench plank with two slot rims. Returns { group, slots:[L,R] }
 * where each slot has a world position and a `tile` ref when filled.
 */
export function makeBench(y = -2.6) {
  const group = new THREE.Group();

  // The wooden podium is painted into the background plate, so there is no bench
  // mesh anymore — just two subtle translucent rounded drop-target panels that
  // sit on the podium top and read as "put a sound here".
  const slotTex = slotPanelTexture();
  const slots = [];
  const slotX = [-1.25, 1.25];
  const slotSize = 1.75;
  for (let i = 0; i < 2; i++) {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(slotSize, slotSize),
      new THREE.MeshBasicMaterial({ map: slotTex, transparent: true, opacity: 0.26, depthWrite: false })
    );
    panel.position.set(slotX[i], 0, 0.02);
    panel.renderOrder = 1;
    group.add(panel);

    // World drop position for slot/flyTo logic. z slightly forward so a slotted
    // tile sits just in front of the translucent panel. `panel` is hidden while a
    // tile occupies the slot so there's no "box around the tile" when they meet.
    const world = new THREE.Vector3(slotX[i], y, 0.2);
    slots.push({ index: i, world, tile: null, panel });
  }

  group.position.set(0, y, 0);
  getScene().add(group);
  return { group, slots };
}

// A soft rounded translucent panel texture, cached, for the slot drop-targets.
let slotPanelTex = null;
function slotPanelTexture() {
  if (slotPanelTex) return slotPanelTex;
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const pad = 14;
  roundRect(g, pad, pad, S - pad * 2, S - pad * 2, 44);
  g.fillStyle = 'rgba(255,255,255,0.30)';
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(255,255,255,0.65)';
  g.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  slotPanelTex = tex;
  return tex;
}

// ---- Picture / goal card --------------------------------------------

// Cache of decoded object images (the generated picture art), keyed by the asset
// name (word, or "mystery"). Each entry is a 512² canvas holding the picture
// (either the loaded PNG drawn onto white, or the glyph fallback).
const objImgCache = new Map();

/**
 * Load the shared object card ../../shared/assets/objects/<name>.png and draw it
 * (contained) onto a 512² canvas. Image src resolves relative to the DOCUMENT,
 * so from /games/<id>/ this reaches /shared/assets/objects/.
 * Falls back to drawing the `char` glyph if the PNG can't be fetched/decoded.
 * Returns a wrapper with an `.image` canvas the card composer draws from.
 * @param {string} name asset key — the word, or "mystery"
 * @param {string} char native glyph fallback
 * @returns {Promise<{image: HTMLCanvasElement}>}
 */
function objectImage(name, char) {
  const key = name || char;
  if (objImgCache.has(key)) return Promise.resolve(objImgCache.get(key));

  return new Promise((resolve) => {
    const size = 512;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');

    const finishGlyph = () => {
      g.clearRect(0, 0, size, size);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `360px ${FONT_STACK}`;
      g.fillText(char || '⭐', size / 2, size / 2 + 20);
      const wrap = { image: cv };
      objImgCache.set(key, wrap);
      resolve(wrap);
    };

    if (!name) { finishGlyph(); return; }

    const img = new Image();
    img.onload = () => {
      g.clearRect(0, 0, size, size);
      // The object PNGs are RGB on white; draw full-bleed (no padding needed).
      g.drawImage(img, 0, 0, size, size);
      const wrap = { image: cv };
      objImgCache.set(key, wrap);
      resolve(wrap);
    };
    img.onerror = finishGlyph;
    img.src = `../../shared/assets/objects/${name}.png`;
  });
}

/**
 * Compose a picture-card texture: white rounded card with the object image up
 * top and (optionally) the uppercase word below, per-letter coral/green.
 * @param {{image: HTMLCanvasElement}} objImg
 * @param {object} [opts] { word, onsetLen, mystery }
 */
function cardTexture(objImg, opts = {}) {
  const W = 512;
  const H = 640;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');

  // rounded white card
  roundRect(g, 8, 8, W - 16, H - 16, 48);
  g.fillStyle = '#ffffff';
  g.fill();

  // image area
  const imgSize = 360;
  const imgX = (W - imgSize) / 2;
  const imgY = 40;
  if (objImg && objImg.image) {
    g.drawImage(objImg.image, imgX, imgY, imgSize, imgSize);
  }

  // the written word (the teaching moment)
  if (opts.word) {
    const word = opts.word.toUpperCase();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const fontSize = 130;
    g.font = `600 ${fontSize}px ${FONT_STACK}`;
    // measure per-letter to color onset vs rime
    const letters = word.split('');
    const widths = letters.map((ch) => g.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0);
    let x = W / 2 - total / 2;
    const baseY = 510;
    const onsetLen = opts.onsetLen ?? 1;
    for (let i = 0; i < letters.length; i++) {
      g.fillStyle = i < onsetLen ? CORAL : LEAF;
      g.fillText(letters[i], x + widths[i] / 2, baseY);
      x += widths[i];
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * Build a card plane mesh (hidden until popped in). Returns the mesh; set its
 * texture via setCardContent then call popCard / hideCard.
 */
export function makeCard() {
  const w = 3.2;
  const h = 4.0;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 1 })
  );
  mesh.visible = false;
  mesh.scale.setScalar(0.001);
  mesh.renderOrder = 30;
  getScene().add(mesh);
  return mesh;
}

/**
 * Set the card's picture/word content.
 * @param {THREE.Mesh} card
 * @param {object} cfg { codepoint, char, word, onsetLen, mystery }
 */
export async function setCardContent(card, cfg) {
  let objImg;
  if (cfg.mystery) {
    objImg = await objectImage('mystery', '❓');
  } else {
    objImg = await objectImage(cfg.word, cfg.char);
  }
  const tex = cardTexture(objImg, {
    word: cfg.mystery ? '' : cfg.word,
    onsetLen: cfg.onsetLen,
  });
  if (card.material.map) card.material.map.dispose();
  card.material.map = tex;
  card.material.needsUpdate = true;
}

/** Spring-scale + slight spin pop-in. */
export async function popCard(card, x, y, z = 1.0, scale = 1) {
  card.position.set(x, y, z);
  card.visible = true;
  card.scale.setScalar(0.001);
  card.rotation.z = -0.25;
  card.material.opacity = 1;
  await Promise.all([
    tween(card.scale, { x: scale, y: scale, z: scale }, 520, Ease.outBack),
    tween(card.rotation, { z: 0 }, 520, Ease.outBack),
  ]);
}

/** Show a small translucent goal card (guided/mystery) without spin overshoot. */
export async function showGoalCard(card, x, y, scale = 0.62) {
  card.position.set(x, y, 0.6);
  card.visible = true;
  card.scale.setScalar(0.001);
  card.rotation.z = 0;
  card.material.opacity = 0.92;
  await tween(card.scale, { x: scale, y: scale, z: scale }, 420, Ease.outBack);
}

export async function hideCard(card) {
  if (!card.visible) return;
  await Promise.all([
    tween(card.scale, { x: 0.001, y: 0.001, z: 0.001 }, 240, Ease.out),
    tween(card.material, { opacity: 0 }, 240, Ease.out),
  ]);
  card.visible = false;
}

export { TILE_W, TILE_H };
