import * as THREE from 'three';
import { createPlasticSphere } from './pbd-solver.js';

const canvas = document.querySelector('#pbd-canvas');
const sceneHost = document.querySelector('#pbd-scene');
const status = document.querySelector('#pbd-status');
const stateStatus = document.querySelector('#pbd-state');
const toolButtons = [...document.querySelectorAll('[data-pbd-tool]')];
const creepInput = document.querySelector('#pbd-creep');
const creepOutput = document.querySelector('#pbd-creep-output');
const recoveryInput = document.querySelector('#pbd-recovery');
const recoveryOutput = document.querySelector('#pbd-recovery-output');
const brushInput = document.querySelector('#pbd-brush');
const brushOutput = document.querySelector('#pbd-brush-output');

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
camera.position.set(0, 0.05, 5.2);

const solver = createPlasticSphere({
  detail: 3,
  radius: 1,
  center: [0, 0.06, 0],
  yield: 0.052,
  creep: 7.5,
  recovery: 0,
  substeps: 3,
  iterations: 6,
});

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(solver.positions, 3));
geometry.setAttribute('clayPosition', new THREE.BufferAttribute(solver.positions.slice(), 3));
geometry.setIndex(new THREE.BufferAttribute(solver.indices, 1));
geometry.computeVertexNormals();
geometry.computeBoundingSphere();

const textureLoader = new THREE.TextureLoader();
const matcap = textureLoader.load('./assets/matcap-clay-study.png');
matcap.colorSpace = THREE.SRGBColorSpace;
const clayHeight = textureLoader.load('./assets/clay-height-study.png');
clayHeight.colorSpace = THREE.NoColorSpace;
clayHeight.wrapS = THREE.RepeatWrapping;
clayHeight.wrapT = THREE.RepeatWrapping;
const material = new THREE.ShaderMaterial({
  uniforms: {
    uColor: { value: new THREE.Color('#ff9a42') },
    uMatcap: { value: matcap },
    uClayHeight: { value: clayHeight },
    uTextureScale: { value: 0.72 },
    uBumpStrength: { value: 2.8 },
  },
  side: THREE.FrontSide,
  extensions: { derivatives: true },
  vertexShader: `
    attribute vec3 clayPosition;
    varying vec3 vViewNormal;
    varying vec3 vViewPosition;
    varying vec3 vClayPosition;
    varying vec3 vObjectNormal;
    void main() {
      vViewNormal = normalize(normalMatrix * normal);
      vObjectNormal = normalize(normal);
      vClayPosition = clayPosition;
      vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
      vViewPosition = viewPosition.xyz;
      gl_Position = projectionMatrix * viewPosition;
    }
  `,
  fragmentShader: `
    precision highp float;
    varying vec3 vViewNormal;
    varying vec3 vViewPosition;
    varying vec3 vClayPosition;
    varying vec3 vObjectNormal;
    uniform vec3 uColor;
    uniform sampler2D uMatcap;
    uniform sampler2D uClayHeight;
    uniform float uTextureScale;
    uniform float uBumpStrength;

    float clayHeight(vec3 point, vec3 objectNormal) {
      vec3 weights = pow(abs(objectNormal), vec3(4.0));
      weights /= max(weights.x + weights.y + weights.z, .0001);
      vec3 scaled = point * uTextureScale;
      float xProjection = texture2D(uClayHeight, scaled.zy + vec2(.17, .31)).r;
      float yProjection = texture2D(uClayHeight, scaled.xz + vec2(.53, .11)).r;
      float zProjection = texture2D(uClayHeight, scaled.xy + vec2(.29, .67)).r;
      return dot(vec3(xProjection, yProjection, zProjection), weights);
    }

    vec3 perturbClayNormal(vec3 viewPosition, vec3 viewNormal, vec2 heightDelta) {
      vec3 sigmaX = dFdx(viewPosition);
      vec3 sigmaY = dFdy(viewPosition);
      vec3 r1 = cross(sigmaY, viewNormal);
      vec3 r2 = cross(viewNormal, sigmaX);
      float determinant = dot(sigmaX, r1);
      vec3 gradient = sign(determinant) * (heightDelta.x * r1 + heightDelta.y * r2);
      return normalize(abs(determinant) * viewNormal - gradient);
    }

    void main() {
      vec3 objectNormal = normalize(vObjectNormal);
      float height = clayHeight(vClayPosition, objectNormal);
      float heightX = clayHeight(vClayPosition + dFdx(vClayPosition), objectNormal);
      float heightY = clayHeight(vClayPosition + dFdy(vClayPosition), objectNormal);
      vec2 heightDelta = vec2(heightX - height, heightY - height) * uBumpStrength;
      vec3 normal = perturbClayNormal(vViewPosition, normalize(vViewNormal), heightDelta);
      vec3 matcapLight = texture2D(uMatcap, normal.xy * .49 + .5).rgb;
      float tone = .55 + dot(matcapLight, vec3(.3333)) * .57;
      tone *= .975 + (height - .5) * .075;
      float rim = pow(1.0 - max(normal.z, 0.0), 2.6);
      vec3 color = uColor * tone + uColor * rim * .01;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
});
const clayMesh = new THREE.Mesh(geometry, material);
scene.add(clayMesh);

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
let activePointer = null;
let tool = 'push';
let brushRadius = 0.58;
let grabStart = null;
let grabNormal = null;
let lastFrame = performance.now();
let frames = 0;
let frameWindowStart = performance.now();
let displayedFps = 0;

function rayHit(event) {
  const rect = canvas.getBoundingClientRect();
  pointerNdc.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    1 - ((event.clientY - rect.top) / rect.height) * 2,
  );
  raycaster.setFromCamera(pointerNdc, camera);
  return raycaster.intersectObject(clayMesh, false)[0] ?? null;
}

function selectTool(name) {
  tool = name;
  toolButtons.forEach((button) => {
    const active = button.dataset.pbdTool === name;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelector('#pbd-gesture').innerHTML = name === 'push'
    ? '<span>☝</span> Touch clay, then drag down to press inward'
    : '<span>☝</span> Touch clay, then drag to pull a lasting lobe';
}

canvas.addEventListener('pointerdown', (event) => {
  if (activePointer !== null || event.isPrimary === false) return;
  const hit = rayHit(event);
  if (!hit) return;
  activePointer = event.pointerId;
  grabStart = { x: event.clientX, y: event.clientY };
  grabNormal = hit.point.clone().sub(new THREE.Vector3(...solver.center)).normalize();
  solver.beginGrab(hit.point.toArray(), { brushRadius });
  canvas.setPointerCapture?.(activePointer);
  canvas.classList.add('is-dragging');
  event.preventDefault();
});

canvas.addEventListener('pointermove', (event) => {
  if (event.pointerId !== activePointer || !grabStart) return;
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  if (tool === 'push') {
    const depth = THREE.MathUtils.clamp((event.clientY - grabStart.y) / rect.height * 2.3, 0, 0.54);
    solver.setGrabDisplacement(grabNormal.clone().multiplyScalar(-depth).toArray());
  } else {
    const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * camera.position.z;
    const viewWidth = viewHeight * camera.aspect;
    const dx = (event.clientX - grabStart.x) / rect.width * viewWidth;
    const dy = -(event.clientY - grabStart.y) / rect.height * viewHeight;
    solver.setGrabDisplacement([dx, dy, 0]);
  }
});

function endPointer(event) {
  if (event.type !== 'blur' && event.pointerId !== activePointer) return;
  if (activePointer === null) return;
  activePointer = null;
  grabStart = null;
  grabNormal = null;
  solver.releaseGrab();
  canvas.classList.remove('is-dragging');
}

window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);
window.addEventListener('blur', endPointer);

toolButtons.forEach((button) => button.addEventListener('click', () => selectTool(button.dataset.pbdTool)));

creepInput.addEventListener('input', () => {
  const normalized = Number(creepInput.value) / 100;
  const creep = 0.8 + normalized * 10.2;
  solver.setSettings({ creep });
  creepOutput.value = normalized < 0.28 ? 'slow' : normalized < 0.7 ? 'clay' : 'fast';
});

recoveryInput.addEventListener('input', () => {
  const normalized = Number(recoveryInput.value) / 100;
  const recovery = normalized * 0.12;
  solver.setSettings({ recovery });
  recoveryOutput.value = normalized < 0.05 ? 'off' : normalized < 0.55 ? 'very slow' : 'visible';
});

brushInput.addEventListener('input', () => {
  const normalized = Number(brushInput.value) / 100;
  brushRadius = 0.34 + normalized * 0.54;
  brushOutput.value = normalized < 0.34 ? 'small' : normalized < 0.72 ? 'finger' : 'broad';
});

document.querySelector('#pbd-reset').addEventListener('click', () => solver.reset());

function resize() {
  const rect = sceneHost.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / Math.max(rect.height, 1);
  camera.updateProjectionMatrix();
}

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(sceneHost);

function render(now) {
  const dt = Math.min((now - lastFrame) / 1000, 1 / 30) || 1 / 60;
  lastFrame = now;
  solver.step(dt);
  geometry.attributes.position.needsUpdate = true;
  geometry.computeVertexNormals();
  renderer.render(scene, camera);

  frames += 1;
  const elapsed = now - frameWindowStart;
  if (elapsed >= 600) {
    displayedFps = Math.round(frames * 1000 / elapsed);
    frames = 0;
    frameWindowStart = now;
    const metrics = solver.metrics();
    status.textContent = `${displayedFps} fps · ${metrics.vertices} vertices · ${metrics.constraints} constraints`;
    stateStatus.textContent = `${metrics.volumeDriftPercent.toFixed(2)}% volume drift · ${metrics.invertedTriangles ? `${metrics.invertedTriangles} folded faces` : metrics.plasticStrain > .002 ? 'plastic mark stored' : 'original rest shape'}`;
  }
  requestAnimationFrame(render);
}

resize();
selectTool('push');
requestAnimationFrame(render);

window.CLAY_PBD_LAB = {
  solver,
  selectTool,
  state: () => ({
    ...solver.metrics(),
    tool,
    brushRadius,
    fps: displayedFps,
    buffer: [renderer.domElement.width, renderer.domElement.height],
  }),
};
