import * as THREE from 'three';

const canvas = document.querySelector('#solid-canvas');
const sceneHost = document.querySelector('#solid-scene');
const status = document.querySelector('#solid-status');
const joinStatus = document.querySelector('#join-status');
const joinInput = document.querySelector('#join-width');
const joinOutput = document.querySelector('#join-output');
const shadow = document.querySelector('#contact-shadow');
const presetButtons = [...document.querySelectorAll('[data-solid-preset]')];
const materialButtons = [...document.querySelectorAll('[data-solid-material]')];

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
camera.position.z = 1;
const geometry = new THREE.PlaneGeometry(2, 2);

const orange = new THREE.Color('#ff7314');
const teal = new THREE.Color('#24cfb9');
const matcap = new THREE.TextureLoader().load('./assets/matcap-clay-study.png');
matcap.colorSpace = THREE.SRGBColorSpace;
const uniforms = {
  uResolution: { value: new THREE.Vector2(1, 1) },
  uViewScale: { value: 2.05 },
  uBall1: { value: new THREE.Vector4(-.42, .24, .18, .68) },
  uBall2: { value: new THREE.Vector4(.38, -.12, 0, .88) },
  uColor1: { value: orange },
  uColor2: { value: teal },
  uFusion: { value: 1 },
  uJoin: { value: .28 },
  uMatcap: { value: matcap },
  uUseMatcap: { value: 1 },
};

const material = new THREE.ShaderMaterial({
  uniforms,
  transparent: true,
  depthTest: false,
  depthWrite: false,
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform vec2 uResolution;
    uniform float uViewScale;
    uniform vec4 uBall1;
    uniform vec4 uBall2;
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    uniform float uFusion;
    uniform float uJoin;
    uniform sampler2D uMatcap;
    uniform float uUseMatcap;

    float sdEllipsoid(vec3 point, vec3 radii) {
      float k0 = length(point / radii);
      float k1 = max(length(point / (radii * radii)), 0.0001);
      return k0 * (k0 - 1.0) / k1;
    }

    float hash31(vec3 point) {
      point = fract(point * .1031);
      point += dot(point, point.yzx + 33.33);
      return fract((point.x + point.y) * point.z);
    }

    float valueNoise(vec3 point) {
      vec3 cell = floor(point);
      vec3 local = fract(point);
      local = local * local * (3.0 - 2.0 * local);
      float n000 = hash31(cell + vec3(0.0, 0.0, 0.0));
      float n100 = hash31(cell + vec3(1.0, 0.0, 0.0));
      float n010 = hash31(cell + vec3(0.0, 1.0, 0.0));
      float n110 = hash31(cell + vec3(1.0, 1.0, 0.0));
      float n001 = hash31(cell + vec3(0.0, 0.0, 1.0));
      float n101 = hash31(cell + vec3(1.0, 0.0, 1.0));
      float n011 = hash31(cell + vec3(0.0, 1.0, 1.0));
      float n111 = hash31(cell + vec3(1.0, 1.0, 1.0));
      return mix(
        mix(mix(n000, n100, local.x), mix(n010, n110, local.x), local.y),
        mix(mix(n001, n101, local.x), mix(n011, n111, local.x), local.y),
        local.z
      );
    }

    float surfaceNoise(vec3 point) {
      float angle = atan(point.y + .07, point.x + .18);
      float radius = length(point.xy + vec2(.18, .07));
      float swirl = .5 + .5 * sin(radius * 112.0 + angle * 2.4 + valueNoise(point * 7.0) * 3.2);
      return valueNoise(point * 11.0) * .56 + valueNoise(point * 29.0) * .27 + swirl * .17;
    }

    float lobeDistance(vec3 point, vec4 ball, vec2 axis, float fusion) {
      vec3 offset = point - ball.xyz;
      vec2 perpendicular = vec2(-axis.y, axis.x);
      vec3 local = vec3(dot(offset.xy, axis), dot(offset.xy, perpendicular), offset.z);
      float axialScale = 1.0 - .10 * fusion;
      float bulgeScale = inversesqrt(axialScale);
      float axial = ball.w * axialScale;
      float bulge = ball.w * bulgeScale;
      return sdEllipsoid(local, vec3(axial, bulge, bulge));
    }

    float mapClay(vec3 point, out float orangeWeight) {
      vec2 separation = uBall2.xy - uBall1.xy;
      vec2 axis = normalize(separation + vec2(.0001, 0.0));
      float first = lobeDistance(point, uBall1, axis, uFusion);
      float second = lobeDistance(point, uBall2, axis, uFusion);
      float blendRadius = .012 + uJoin * uFusion * .22;
      float weight = clamp(.5 + .5 * (second - first) / blendRadius, 0.0, 1.0);
      float distance = mix(second, first, weight) - blendRadius * weight * (1.0 - weight);
      orangeWeight = weight;
      return distance;
    }

    float mapDistance(vec3 point) {
      float weight = 0.0;
      return mapClay(point, weight);
    }

    vec3 clayNormal(vec3 point) {
      vec2 e = vec2(.0028, 0.0);
      vec3 geometric = normalize(vec3(
        mapDistance(point + e.xyy) - mapDistance(point - e.xyy),
        mapDistance(point + e.yxy) - mapDistance(point - e.yxy),
        mapDistance(point + e.yyx) - mapDistance(point - e.yyx)
      ));
      vec2 bumpStep = vec2(.011, 0.0);
      float center = surfaceNoise(point);
      vec3 bump = vec3(
        surfaceNoise(point + bumpStep.xyy) - center,
        surfaceNoise(point + bumpStep.yxy) - center,
        surfaceNoise(point + bumpStep.yyx) - center
      );
      return normalize(geometric - bump * .42);
    }

    void main() {
      vec2 screen = vUv * 2.0 - 1.0;
      screen.x *= uResolution.x / max(uResolution.y, 1.0);
      vec3 rayOrigin = vec3(screen * uViewScale, 4.6);
      vec3 rayDirection = vec3(0.0, 0.0, -1.0);
      float travel = 0.0;
      float distance = 1.0;
      bool hit = false;
      vec3 point = rayOrigin;
      for (int step = 0; step < 72; step++) {
        point = rayOrigin + rayDirection * travel;
        distance = mapDistance(point);
        if (distance < .0015) { hit = true; break; }
        travel += max(distance * .72, .006);
        if (travel > 8.0) break;
      }
      if (!hit) {
        gl_FragColor = vec4(0.0);
        return;
      }

      float orangeWeight = 0.0;
      mapClay(point, orangeWeight);
      float boundaryNoise = (surfaceNoise(point * .78) - .5) * .014;
      float colorOwnership = orangeWeight + boundaryNoise;
      float colorBoundary = smoothstep(.485, .515, colorOwnership);
      vec3 base = mix(uColor2, uColor1, colorBoundary);
      float seam = exp(-pow((orangeWeight - .5 + boundaryNoise) / .052, 2.0));
      base *= 1.0 - seam * .035;

      vec3 normal = clayNormal(point);
      vec3 lightDirection = normalize(vec3(-.55, .72, .78));
      float diffuse = max(dot(normal, lightDirection), 0.0);
      vec3 viewDirection = -rayDirection;
      vec3 halfDirection = normalize(lightDirection + viewDirection);
      float specular = pow(max(dot(normal, halfDirection), 0.0), 20.0) * .2;
      float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.3);
      float grain = (surfaceNoise(point * 1.35) - .5) * .075;
      vec3 color = base * (.69 + diffuse * .37 + grain);
      color += vec3(1.0, .93, .78) * specular;
      color += base * rim * .085;
      color *= .995 + (hash31(floor(point * 115.0)) - .5) * .018;
      vec2 matcapUv = normal.xy * .49 + .5;
      vec3 matcapLight = texture2D(uMatcap, matcapUv).rgb;
      float matcapTone = .38 + dot(matcapLight, vec3(.3333)) * .92;
      vec3 matcapColor = base * matcapTone;
      matcapColor += base * rim * .035;
      matcapColor *= .985 + (hash31(floor(point * 115.0)) - .5) * .014;
      color = mix(color, matcapColor, uUseMatcap);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
});

const quad = new THREE.Mesh(geometry, material);
scene.add(quad);

let activeBall = 0;
let activePointer = null;
let grabOffset = { x: 0, y: 0 };
let fused = true;
let currentPreset = 'pressed';
let frames = 0;
let frameWindowStart = performance.now();
let displayedFps = 0;

function ball(index) {
  return index === 1 ? uniforms.uBall1.value : uniforms.uBall2.value;
}

function worldPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const aspect = rect.width / Math.max(rect.height, 1);
  return {
    x: (((event.clientX - rect.left) / rect.width) * 2 - 1) * aspect * uniforms.uViewScale.value,
    y: (1 - ((event.clientY - rect.top) / rect.height) * 2) * uniforms.uViewScale.value,
  };
}

function contactAmount() {
  const first = uniforms.uBall1.value;
  const second = uniforms.uBall2.value;
  const distance = Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z);
  const radiusSum = first.w + second.w;
  return THREE.MathUtils.clamp((radiusSum * 1.035 - distance) / (radiusSum * .38), 0, 1);
}

function updateContact() {
  const fusion = contactAmount();
  if (fusion > .52) fused = true;
  uniforms.uFusion.value = fusion;
  joinStatus.textContent = fusion < .08
    ? 'Separate sculptural balls'
    : fusion < .48
      ? 'Contact patch forming'
      : 'Permanent two-lobe clay solid';
  shadow.style.width = `${24 + fusion * 14}%`;
  shadow.style.opacity = `${.64 + fusion * .3}`;
}

function setPreset(name) {
  currentPreset = name;
  const first = uniforms.uBall1.value;
  const second = uniforms.uBall2.value;
  if (name === 'touch') {
    first.set(-.73, .11, .14, .68);
    second.set(.66, -.10, 0, .88);
    fused = false;
  } else {
    first.set(-.42, .24, .18, .68);
    second.set(.38, -.12, 0, .88);
    fused = true;
  }
  presetButtons.forEach((button) => {
    const active = button.dataset.solidPreset === name;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  updateContact();
}

function restrainFusedBall(movingIndex) {
  if (!fused) return;
  const moving = ball(movingIndex);
  const fixed = ball(movingIndex === 1 ? 2 : 1);
  const dx = moving.x - fixed.x;
  const dy = moving.y - fixed.y;
  const distance = Math.hypot(dx, dy);
  const maximum = (moving.w + fixed.w) * 1.02;
  if (distance <= maximum) return;
  moving.x = fixed.x + dx / distance * maximum;
  moving.y = fixed.y + dy / distance * maximum;
}

canvas.addEventListener('pointerdown', (event) => {
  if (activePointer !== null || event.isPrimary === false) return;
  const point = worldPoint(event);
  const first = uniforms.uBall1.value;
  const second = uniforms.uBall2.value;
  const firstDistance = Math.hypot(point.x - first.x, point.y - first.y);
  const secondDistance = Math.hypot(point.x - second.x, point.y - second.y);
  if (firstDistance > first.w * 1.12 && secondDistance > second.w * 1.12) return;
  activeBall = firstDistance / first.w < secondDistance / second.w ? 1 : 2;
  const selected = ball(activeBall);
  grabOffset = { x: point.x - selected.x, y: point.y - selected.y };
  activePointer = event.pointerId;
  canvas.setPointerCapture?.(activePointer);
  canvas.classList.add('is-dragging');
});

canvas.addEventListener('pointermove', (event) => {
  if (event.pointerId !== activePointer) return;
  event.preventDefault();
  const point = worldPoint(event);
  const selected = ball(activeBall);
  const aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
  selected.x = THREE.MathUtils.clamp(point.x - grabOffset.x, -aspect * 1.75, aspect * 1.75);
  selected.y = THREE.MathUtils.clamp(point.y - grabOffset.y, -1.0, 1.25);
  restrainFusedBall(activeBall);
  updateContact();
});

function endPointer(event) {
  if (event.type !== 'blur' && event.pointerId !== activePointer) return;
  activePointer = null;
  activeBall = 0;
  canvas.classList.remove('is-dragging');
}

window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);
window.addEventListener('blur', endPointer);

joinInput.addEventListener('input', () => {
  const value = Number(joinInput.value) / 100;
  uniforms.uJoin.value = value;
  joinOutput.value = value < .2 ? 'narrow' : value < .48 ? 'restrained' : value < .75 ? 'soft' : 'very soft';
});

presetButtons.forEach((button) => button.addEventListener('click', () => setPreset(button.dataset.solidPreset)));
materialButtons.forEach((button) => button.addEventListener('click', () => {
  const useMatcap = button.dataset.solidMaterial === 'matcap';
  uniforms.uUseMatcap.value = useMatcap ? 1 : 0;
  materialButtons.forEach((candidate) => {
    const active = candidate === button;
    candidate.classList.toggle('is-active', active);
    candidate.setAttribute('aria-pressed', String(active));
  });
}));
document.querySelector('#solid-reset').addEventListener('click', () => setPreset(currentPreset));

function resize() {
  const rect = sceneHost.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  uniforms.uResolution.value.set(renderer.domElement.width, renderer.domElement.height);
}

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(sceneHost);

function render(now) {
  frames += 1;
  const elapsed = now - frameWindowStart;
  if (elapsed >= 600) {
    displayedFps = Math.round(frames * 1000 / elapsed);
    frames = 0;
    frameWindowStart = now;
    status.textContent = `${displayedFps} fps · ${renderer.domElement.width}×${renderer.domElement.height} buffer`;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

resize();
setPreset('pressed');
requestAnimationFrame(render);

window.CLAY_SOLID_LAB = {
  setPreset,
  state: () => ({
    ball1: uniforms.uBall1.value.toArray(),
    ball2: uniforms.uBall2.value.toArray(),
    fusion: uniforms.uFusion.value,
    join: uniforms.uJoin.value,
    material: uniforms.uUseMatcap.value ? 'matcap' : 'procedural',
    fused,
    fps: displayedFps,
    buffer: [renderer.domElement.width, renderer.domElement.height],
  }),
};
