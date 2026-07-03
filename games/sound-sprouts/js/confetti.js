// confetti.js — a THREE.Points particle burst with gravity + fade.

import * as THREE from 'three';
import { getScene, onFrame } from './scene.js';

const WARM = ['#FF8A66', '#FFD166', '#7ECB66', '#66B8FF', '#FF66A3'];
const GOLD = ['#FFD166', '#FFC233', '#FFE08A', '#FFB300', '#FFEFAF'];

/**
 * Fire a confetti burst at a world position.
 * @param {THREE.Vector3|{x:number,y:number,z:number}} at
 * @param {{count?:number, gold?:boolean, spread?:number, power?:number}} [opts]
 */
export function burst(at, opts = {}) {
  const scene = getScene();
  if (!scene) return;

  const count = opts.count ?? 120;
  const palette = opts.gold ? GOLD : WARM;
  const spread = opts.spread ?? 1;
  const power = opts.power ?? 1;

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const vel = [];
  const c = new THREE.Color();

  for (let i = 0; i < count; i++) {
    positions[i * 3] = at.x;
    positions[i * 3 + 1] = at.y;
    positions[i * 3 + 2] = at.z;

    const ang = Math.random() * Math.PI * 2;
    const up = 2 + Math.random() * 4;
    const out = (0.5 + Math.random() * 3) * spread;
    vel.push(
      Math.cos(ang) * out * power,
      up * power,
      Math.sin(ang) * out * power * 0.4
    );

    c.set(palette[(Math.random() * palette.length) | 0]);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.28 * (opts.gold ? 1.2 : 1),
    vertexColors: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  points.renderOrder = 50;
  scene.add(points);

  const life = 1.5;
  let age = 0;
  const posAttr = geo.getAttribute('position');

  const unsub = onFrame((dt) => {
    age += dt;
    const arr = posAttr.array;
    for (let i = 0; i < count; i++) {
      vel[i * 3 + 1] -= 9.8 * dt * 0.55; // gravity
      arr[i * 3] += vel[i * 3] * dt;
      arr[i * 3 + 1] += vel[i * 3 + 1] * dt;
      arr[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    posAttr.needsUpdate = true;
    mat.opacity = Math.max(0, 1 - age / life);

    if (age >= life) {
      unsub();
      scene.remove(points);
      geo.dispose();
      mat.dispose();
    }
  });
}
