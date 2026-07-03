// scene.js — three.js renderer, scene, camera, garden background, resize, the
// render loop, and a tiny self-contained tween helper used everywhere else.

import * as THREE from 'three';

// ---- Easing ----------------------------------------------------------

export const Ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  // ease-out-back: a little overshoot, great for pops
  outBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

// ---- Module state ----------------------------------------------------

let renderer, scene, camera;
const tweens = [];
const everyFrame = [];
let raycaster, ndc;

/**
 * Boot the renderer/scene/camera. The illustrated background plate is a CSS
 * background behind a TRANSPARENT WebGL canvas (see index.html / style.css), so
 * the renderer clears to alpha 0 and we no longer build sky/hills/clouds here.
 * @param {HTMLCanvasElement} canvas
 */
export function initScene(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearAlpha(0);
  renderer.setSize(window.innerWidth, window.innerHeight);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 12);
  camera.lookAt(0, 0, 0);

  buildLights();

  raycaster = new THREE.Raycaster();
  ndc = new THREE.Vector2();

  window.addEventListener('resize', onResize);
  onResize();

  renderer.setAnimationLoop(renderLoop);
  return { scene, camera, renderer };
}

function buildLights() {
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const dir = new THREE.DirectionalLight(0xffffff, 0.7);
  dir.position.set(3, 6, 6);
  scene.add(dir);
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// ---- Visible-plane math (fit layout to viewport at z=0) --------------

/**
 * The visible width/height of the z=0 plane in world units, given the camera.
 * Used to scale and place tiles/bench so the layout fits portrait & landscape.
 */
export function visibleSize(z = 0) {
  const dist = camera.position.z - z;
  const vH = 2 * Math.tan((camera.fov * Math.PI) / 180 / 2) * dist;
  const vW = vH * camera.aspect;
  return { width: vW, height: vH };
}

// ---- Tween system ----------------------------------------------------

/**
 * Tween numeric props on an object (e.g. position/scale/rotation sub-objects or
 * plain numbers). `props` is a flat map: { 'position.x': 1, scale: 1.2 }.
 * Supports nested dotted paths. Returns a Promise resolving on completion.
 *
 * @param {object} obj
 * @param {Record<string, number>} props
 * @param {number} ms
 * @param {(t:number)=>number} [ease]
 * @param {object} [extra] { delay, onUpdate }
 * @returns {Promise<void>}
 */
export function tween(obj, props, ms, ease = Ease.out, extra = {}) {
  return new Promise((resolve) => {
    const delay = extra.delay || 0;
    const keys = Object.keys(props);
    const t = {
      obj,
      keys,
      to: props,
      from: null,
      ms: Math.max(1, ms),
      ease,
      elapsed: -delay,
      onUpdate: extra.onUpdate,
      resolve,
      done: false,
    };
    tweens.push(t);
  });
}

function getPath(obj, path) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  return o[parts[parts.length - 1]];
}

function setPath(obj, path, val) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts[parts.length - 1]] = val;
}

function stepTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const t = tweens[i];
    t.elapsed += dt * 1000;
    if (t.elapsed < 0) continue;
    if (!t.from) {
      t.from = {};
      for (const k of t.keys) t.from[k] = getPath(t.obj, k);
    }
    let p = t.elapsed / t.ms;
    if (p >= 1) p = 1;
    const e = t.ease(p);
    for (const k of t.keys) {
      setPath(t.obj, k, t.from[k] + (t.to[k] - t.from[k]) * e);
    }
    if (t.onUpdate) t.onUpdate(p);
    if (p >= 1) {
      t.done = true;
      tweens.splice(i, 1);
      t.resolve();
    }
  }
}

/** Register a callback run every frame with (dt, time). Returns an unsubscribe. */
export function onFrame(fn) {
  everyFrame.push(fn);
  return () => {
    const i = everyFrame.indexOf(fn);
    if (i >= 0) everyFrame.splice(i, 1);
  };
}

let lastT = 0;
let elapsedTime = 0;

function renderLoop(time) {
  const tSec = time / 1000;
  let dt = tSec - lastT;
  lastT = tSec;
  if (dt > 0.1) dt = 0.1; // clamp big gaps (tab switch)
  elapsedTime += dt;

  stepTweens(dt);

  for (const fn of everyFrame) fn(dt, elapsedTime);

  renderer.render(scene, camera);
}

// ---- Raycasting (pointerdown) ----------------------------------------

/**
 * Raycast from a client x/y against a set of meshes; returns first hit object
 * (the .userData.pickRoot if present, else the object itself), or null.
 * @param {number} clientX
 * @param {number} clientY
 * @param {THREE.Object3D[]} targets
 */
export function pick(clientX, clientY, targets) {
  ndc.x = (clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(targets, true);
  if (!hits.length) return null;
  let o = hits[0].object;
  while (o && !o.userData.pickRoot && o.parent) o = o.parent;
  return (o && o.userData.pickRoot) ? o : hits[0].object;
}

export function getScene() { return scene; }
export function getCamera() { return camera; }
export function now() { return elapsedTime; }
