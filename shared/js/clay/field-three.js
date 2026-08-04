// field-three.js — a WebGL2 raymarch renderer for the stored clay field
// (field.js), wearing the other engine's material.
//
// PROVENANCE. `experiments/clay-physics-lab/field/field-three.js` promoted. The
// lab copy stays put as the research record; every number quoted below was
// measured against it (§12 of the clay-physics recommendation). Two additions a
// shipping game needed and the lab did not:
//
//   1. LOOSE BALLS. A tray ball that is being dragged, is falling, or is
//      resting on the table unfused is NOT in the field — it has an identity
//      because the child can still move it and still bin it. It is drawn as an
//      analytic sphere unioned into the SAME march, so it composites against
//      the clay correctly with no second pass and no depth plumbing. It wears
//      the exact noise phases it will inherit when it welds, so nothing about
//      it changes shape at the moment it becomes part of the creature.
//   2. onAnimationFrame. The fall-and-squash landing needs a per-frame tick,
//      and interaction-patterns #12 forbids a second rAF loop next to this
//      one's. Same hook, same contract, as lobes-three.js.
//
// WHAT IS DIFFERENT FROM lobes-three.js
// The incumbent uploads a LIST — up to twelve lobes as uniform arrays — and the
// fragment shader re-walks that whole list at every march step, every normal
// tap and every colour lookup. Its cost therefore grows with how much the child
// has built. Measured on this machine through the game's own
// QLOBE_DEBUG.lobeProbe(), at DPR 1.5 on a 1170x891 buffer: 5.2 ms at one lobe,
// 11.7 ms at eight, 14.6 ms at its twelve-lobe cap — about +0.85 ms per lobe.
//
// This renderer uploads a VOLUME. The shader's inner loop is one 3-D texture
// fetch, and a 3-D texture fetch costs the same whether the field holds one ball
// or forty. Same machine, same DPR, an 8% LARGER buffer (1302x867): 2.7 ms at
// one ball, 3.1 ms at eight, 3.9 ms at sixteen — and there is no cap, because
// there is nothing to count. Sculpting complexity is invisible to the fragment
// shader. That flatness is the whole point of the experiment, and the cost
// curve on the lab page (CLAY_FIELD_LAB.costCurve()) exists to keep it honest.
//
// ONE TEXTURE, RGBA8. Colour in RGB, signed distance in A, encoded over
// +/-field.band (see field-core's BAND_VOXELS note). The hardware's trilinear
// filter therefore interpolates colour and distance in the SAME fetch, which is
// why colour smearing across a worked boundary costs this renderer exactly
// nothing: it is not a feature, it is what a filtered texture already does.
//
// INCREMENTAL UPLOADS. A drag dirties a handful of 8^3 bricks. Re-uploading the
// whole 80^3 grid for that would be 2 MB per pointermove — about 120 MB/s at 60
// Hz, which no tablet bus is going to enjoy. So only the dirty region goes up,
// through three's copyTextureToTexture3D (texSubImage3D underneath).
//
// It goes up as ONE region, not one call per brick, and that distinction is
// worth more than it looks: the per-brick version moved the same 128 KB and
// measured 13.5 ms a frame, because each sub-upload costs a bind, three
// pixelStorei calls and several synchronous glGetParameter round trips. The
// bytes were never the problem; the call count was. See field-core's
// dirtyBox().
//
// three.js arrives as `opts.THREE` (house pattern, see water.js and
// lobes-three.js) so the game's one vendored copy is the only one that loads.
// GLSL3 is mandatory here — `sampler3D` does not exist in GLSL ES 1.0 — and
// note that three omits its `gl_FragColor` alias for GLSL3 materials, so the
// fragment shader declares its own output.
//
// RENDER-ON-DEMAND, per docs/interaction-patterns.md #12. There is no rAF tail.
// requestRender() coalesces bursts into one pending frame; settle(n) chains a
// few more (the fix for "the texture upload lands on the frame that draws it").

// The ONE import in this file, and it is here to stop a drift that would be
// invisible until it was ugly: the loose-ball displacement in the shader has to
// use the same amplitude and wave numbers the stamp will bake in.
import { NOISE_AMP, NOISE_FREQ } from './field.js';

const HARD_DPR_CAP = 1.5;
const LOOP_CAP = 160;
/**
 * Step scale. A trilinear interpolant of a Lipschitz-1 field is very nearly
 * Lipschitz-1 itself, but 8-bit quantisation adds a little noise on top, and a
 * march that trusts the raw number can slip through the shell and stipple the
 * silhouette. 0.9 is conservative enough in practice and costs about one extra
 * step per hit.
 */
const STEP_SAFETY = 0.9;
/** The lobe radius the lab authored the clay material against. */
const LAB_REFERENCE_RADIUS = 0.78;

/**
 * How many unwelded tray balls can be on the stage at once.
 *
 * Four, because four is what the Decorate gate asks for, and because the only
 * way to accumulate loose balls is to drop them somewhere nothing catches them
 * — anything a ball lands ON welds, and welding is stamping. Each one costs the
 * march a sphere test per step (a handful of ALU next to a 3-D texture fetch);
 * the nine sines of its baked lumps are gated behind that test, so a step that
 * is nowhere near a loose ball never pays for them.
 *
 * A fifth ball does not fail — the OLDEST loose ball stamps where it is
 * resting, which is the thing clay does if you leave it on the table. The game
 * owns that policy; this constant is what it checks against.
 */
export const MAX_LOOSE = 4;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const glsl = (n) => Number(n).toFixed(6);

function buildFragmentShader() {
  return `
    precision highp float;
    precision highp sampler3D;

    // three omits its gl_FragColor alias for GLSL3 materials, so declare one.
    layout(location = 0) out vec4 fragColor;

    varying vec2 vScreen;

    uniform sampler3D uField;   // rgb = colour, a = signed distance / band
    uniform float uBand;        // world units the alpha channel spans, half-range
    uniform float uVoxel;       // world units per voxel
    uniform vec3 uFieldMin;     // world AABB of the whole grid
    uniform vec3 uFieldMax;
    uniform vec3 uBoxMin;       // world AABB of the MATERIAL, in field space
    uniform vec3 uBoxMax;
    uniform mat3 uToField;      // world -> field rotation (R transpose)
    uniform mat3 uToWorld;      // field -> world rotation (R)
    uniform vec3 uPivot;
    uniform vec3 uShift;
    uniform float uAspect;
    uniform float uViewScale;
    uniform float uSteps;
    uniform float uPixel;       // world units per device pixel
    uniform float uDetail;      // material feature-size correction
    uniform float uBumpStrength;

    // --- loose (unwelded) tray balls -------------------------------------
    // xyz = centre in FIELD space, w = radius. Count first so the loop can
    // leave early; a stage with no loose ball pays one compare per step.
    uniform int  uLooseCount;
    uniform vec4 uLooseSphere[${MAX_LOOSE}];
    uniform vec3 uLooseColor[${MAX_LOOSE}];   // sRGB, exactly as the tray gave it
    uniform vec3 uLoosePhase[${MAX_LOOSE}];   // the phases this ball will stamp with
    // xyz = contact normal, w = squash amount (0 = round). The landing bounce.
    uniform vec4 uLooseSquash[${MAX_LOOSE}];
    uniform float uNoiseAmp;
    uniform float uNoiseFreq;

    // three injects its output-colour-space conversion into the materials it
    // builds, but NOT into a raw ShaderMaterial. Colour arrives already in the
    // linear working space, so without this the whole body renders a full gamma
    // too dark. Same transfer curve three uses. (Ported from lobes-three.js.)
    vec3 linearToSRGB(vec3 c) {
      c = max(c, vec3(0.0));
      return mix(c * 12.92, 1.055 * pow(c, vec3(0.4166667)) - 0.055, step(vec3(0.0031308), c));
    }

    // ...and the matching inverse, which is NOT optional. The volume stores
    // colour as the sRGB bytes the tray handed over ('#3fbf6f' is an sRGB
    // triple), so lighting them directly would be doing linear maths on
    // gamma-encoded numbers and then gamma-encoding the result a second time.
    // The first version of this shader skipped it and every colour came out a
    // washed pastel — mint instead of clay green, peach instead of orange —
    // which reads as plastic rather than as pigment.
    vec3 srgbToLinear(vec3 c) {
      c = clamp(c, vec3(0.0), vec3(1.0));
      return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
    }

    float hash31(vec3 point) {
      point = fract(point * 0.1031);
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

    // The incumbent's shading grain, verbatim. Sampled in FIELD space, which is
    // the quiet win of a stored representation: the field never moves, so the
    // grain is object-locked for free — no material frame to carry around, no
    // triplanar projection, and nothing for the clay to swim through when a
    // limb is drawn out.
    float surfaceNoise(vec3 point) {
      vec3 q = point * uDetail;
      float angle = atan(q.y + 0.07, q.x + 0.18);
      float radius = length(q.xy + vec2(0.18, 0.07));
      float swirl = 0.5 + 0.5 * sin(radius * 112.0 + angle * 2.4 + valueNoise(q * 7.0) * 3.2);
      return valueNoise(q * 11.0) * 0.56 + valueNoise(q * 29.0) * 0.27 + swirl * 0.17;
    }

    vec3 fieldUV(vec3 p) {
      return (p - uFieldMin) / (uFieldMax - uFieldMin);
    }

    /**
     * THE ENTIRE DISTANCE FUNCTION. One fetch. No loop over primitives, no
     * per-lobe round-cone solve, no smooth-min chain. This is the line the
     * experiment is really about.
     *
     * Outside the grid the field is treated as empty at the saturation
     * distance, which keeps a ray that leaves the domain marching forward
     * rather than stalling on a clamped edge texel.
     */
    float mapDistance(vec3 p) {
      vec3 uv = fieldUV(p);
      if (any(lessThan(uv, vec3(0.0))) || any(greaterThan(uv, vec3(1.0)))) return uBand;
      return (texture(uField, uv).a * 2.0 - 1.0) * uBand;
    }

    /**
     * field.js's noiseWave(), transliterated. THESE TWO MUST MATCH TERM FOR
     * TERM. A loose ball is drawn here and stamped there, and if the two
     * displacements disagree the ball visibly changes shape at the instant it
     * welds — which is the one moment in the whole toy the child is watching
     * most closely.
     */
    float noiseWave(vec3 p, vec3 phase) {
      float shear = (phase.x / 6.283185307179586 - 0.5) * 0.6;
      vec3 q = vec3(p.x + p.y * shear, p.y + p.z * shear, p.z + p.x * shear);
      return 0.42 * sin( 1.00 * q.x + 0.62 * q.y - 0.35 * q.z + phase.x)
           + 0.34 * sin(-0.48 * q.x + 1.13 * q.y + 0.77 * q.z + phase.y)
           + 0.24 * sin( 0.71 * q.x - 0.55 * q.y + 1.29 * q.z + phase.z);
    }

    /**
     * Signed distance to loose ball i, lumps and landing squash included.
     *
     * The squash is an ellipsoid: the ball compresses along the contact normal
     * and bulges across it, and the warp is applied to the sample point BEFORE
     * the noise, so the lumps squash with the clay instead of sliding over a
     * deforming surface. The trailing min(ka, kp) is the standard
     * conservative correction that keeps a warped sphere safe to sphere-trace.
     */
    float looseBall(int i, vec3 p) {
      vec4 s = uLooseSphere[i];
      vec4 sq = uLooseSquash[i];
      vec3 q = p - s.xyz;
      float scale = 1.0;
      if (abs(sq.w) > 0.0005) {
        float along = dot(q, sq.xyz);
        vec3 perp = q - sq.xyz * along;
        float ka = max(1.0 - sq.w, 0.25);
        float kp = max(1.0 + sq.w * 0.5, 0.25);
        q = sq.xyz * (along / ka) + perp / kp;
        scale = min(ka, kp);
      }
      float d = (length(q) - s.w) * scale;
      // CHEAP BOUND FIRST. The displacement can only move the surface by
      // uNoiseAmp * r, so a point further out than that cannot be near this
      // ball and never pays for the nine sines. This is what keeps four loose
      // balls off the march's critical path.
      float amp = uNoiseAmp * s.w;
      if (d > amp * 2.0) return d - amp;
      return d - amp * noiseWave((p - s.xyz) * (uNoiseFreq / s.w), uLoosePhase[i]) * scale;
    }

    /** The whole scene: the clay field unioned with every loose ball. */
    float mapScene(vec3 p) {
      float d = mapDistance(p);
      for (int i = 0; i < ${MAX_LOOSE}; i++) {
        if (i >= uLooseCount) break;
        // A hard min, not a smooth one. A loose ball is NOT joined to the
        // creature — it is a separate lump of clay resting against it — and a
        // fillet here would draw the weld the child has not made yet.
        d = min(d, looseBall(i, p));
      }
      return d;
    }

    /**
     * Colour at a surface point, with the same one-voxel ownership blend the
     * stamp uses (field.js, stampBall). Evaluated once per pixel, so the loop
     * costs nothing worth measuring.
     */
    vec3 clayColor(vec3 p) {
      float d = mapDistance(p);
      vec3 c = texture(uField, fieldUV(p)).rgb;
      for (int i = 0; i < ${MAX_LOOSE}; i++) {
        if (i >= uLooseCount) break;
        float db = looseBall(i, p);
        float w = clamp(0.5 + (d - db) / (2.0 * uVoxel), 0.0, 1.0);
        c = mix(c, uLooseColor[i], w);
        d = min(d, db);
      }
      return srgbToLinear(c);
    }

    /**
     * 4-tap tetrahedral normal. The finite-difference width must be at least
     * about a voxel: sampled tighter than the grid, it differentiates the
     * trilinear interpolant's own cell-to-cell kinks and the surface facets into
     * visible voxel walls. Sampled much wider it rounds real modelling away.
     */
    vec3 clayNormal(vec3 p) {
      float eps = max(uVoxel * 1.05, uPixel * 1.5);
      const vec2 e = vec2(1.0, -1.0);
      vec3 geometric = normalize(
        e.xyy * mapScene(p + e.xyy * eps) +
        e.yyx * mapScene(p + e.yyx * eps) +
        e.yxy * mapScene(p + e.yxy * eps) +
        e.xxx * mapScene(p + e.xxx * eps)
      );
      vec2 bumpStep = vec2(0.011 / uDetail, 0.0);
      float center = surfaceNoise(p);
      vec3 bump = vec3(
        surfaceNoise(p + bumpStep.xyy) - center,
        surfaceNoise(p + bumpStep.yxy) - center,
        surfaceNoise(p + bumpStep.yyx) - center
      );
      return normalize(geometric - bump * uBumpStrength);
    }

    /** Slab test against the material's own AABB, in field space. */
    bool boxRange(vec3 origin, vec3 dir, out float tNear, out float tFar) {
      vec3 inv = 1.0 / dir;
      vec3 a = (uBoxMin - origin) * inv;
      vec3 b = (uBoxMax - origin) * inv;
      vec3 lo = min(a, b);
      vec3 hi = max(a, b);
      tNear = max(max(lo.x, lo.y), max(lo.z, 0.0));
      tFar = min(min(hi.x, hi.y), hi.z);
      return tFar > tNear;
    }

    void main() {
      vec2 screen = vScreen;
      screen.x *= uAspect;
      vec3 world = vec3(screen * uViewScale, uViewScale * 2.0);

      // Camera is orthographic down -z in WORLD space; the field may be posed
      // (a settle animation rotates the clay without touching a single voxel),
      // so both ends of the ray are carried into field space and the march
      // happens there.
      vec3 originWorld = world;
      vec3 dirWorld = vec3(0.0, 0.0, -1.0);
      vec3 origin = uToField * (originWorld - uPivot - uShift) + uPivot;
      vec3 dir = uToField * dirWorld;

      float tNear, tFar;
      if (!boxRange(origin, dir, tNear, tFar)) { fragColor = vec4(0.0); return; }

      float travel = tNear;
      float surfaceEps = max(uPixel * 0.6, uVoxel * 0.12);
      float stepFloor = max(uPixel * 0.25, uVoxel * 0.10);
      float minDist = 1e9;
      vec3 best = origin + dir * tNear;
      float used = 0.0;

      for (int step = 0; step < ${LOOP_CAP}; step++) {
        if (float(step) >= uSteps) break;
        vec3 p = origin + dir * travel;
        float d = mapScene(p);
        if (d < minDist) { minDist = d; best = p; }
        used += 1.0;
        if (d < surfaceEps) break;
        travel += max(d * ${glsl(STEP_SAFETY)}, stepFloor);
        if (travel > tFar) break;
      }

      // Silhouette antialias from the closest approach, not a hit flag: a ray
      // that grazes past by a fraction of a pixel still covers part of the body.
      // The ramp starts AT the hit tolerance — starting it at zero would make
      // the whole body translucent and paint the march residual across it as
      // contour rings. (The lesson is lobes-three.js's; the bug is easy to
      // re-introduce.)
      float alpha = 1.0 - smoothstep(surfaceEps, surfaceEps + uPixel * 1.2, minDist);
      if (alpha <= 0.004) { fragColor = vec4(0.0); return; }

      vec3 p = best;
      vec3 base = clayColor(p);
      vec3 normalField = clayNormal(p);
      vec3 normal = normalize(uToWorld * normalField);

      // The incumbent's procedural studio clay, term for term, so the two
      // representations can be compared on shape and behaviour rather than on
      // whose material happened to be prettier.
      vec3 lightDirection = normalize(vec3(-0.55, 0.72, 0.78));
      float diffuse = max(dot(normal, lightDirection), 0.0);
      vec3 viewDirection = vec3(0.0, 0.0, 1.0);
      vec3 halfDirection = normalize(lightDirection + viewDirection);
      float specular = pow(max(dot(normal, halfDirection), 0.0), 20.0) * 0.2;
      float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.3);
      float grain = (surfaceNoise(p * 1.35) - 0.5) * 0.075;
      vec3 color = base * (0.69 + diffuse * 0.37 + grain);
      color += vec3(1.0, 0.93, 0.78) * specular;
      color += base * rim * 0.085;
      color *= 0.995 + (hash31(floor(p * uDetail * 115.0)) - 0.5) * 0.018;

      fragColor = vec4(linearToSRGB(color), alpha);
    }
  `;
}

const VERTEX_SHADER = `
  uniform vec4 uQuad; // xy = NDC centre, zw = NDC half-size
  varying vec2 vScreen;
  void main() {
    vec2 ndc = uQuad.xy + position.xy * uQuad.zw;
    vScreen = ndc;
    gl_Position = vec4(ndc, 0.0, 1.0);
  }
`;

/**
 * @param {object} opts
 * @param {object} opts.THREE             required, the vendored three.js
 * @param {HTMLCanvasElement} opts.canvas required
 * @param {object} opts.field             required, a createClayField() instance
 * @param {Element|null} [opts.shadowEl]
 * @param {number} [opts.pixelRatio]      full-quality DPR cap (<= 1.5)
 * @param {number} [opts.dragPixelRatio]  DPR while a pointer is down
 * @param {number} [opts.steps]
 * @param {number} [opts.dragSteps]
 * @param {number} [opts.viewScale]       world units per NDC unit
 */
export function createFieldRenderer(opts = {}) {
  const THREE = opts.THREE;
  if (!THREE) throw new Error('[field-three] three.js not passed — pass opts.THREE');
  const canvas = opts.canvas;
  if (!canvas) throw new Error('[field-three] opts.canvas is required');
  // `let`, not `const`: the shelf rasteriser draws many saved creatures through
  // ONE WebGL context, and each saved creature is its own field (the noise seed
  // is baked in at construction). See setField().
  let field = opts.field;
  if (!field) throw new Error('[field-three] opts.field is required');

  const shadowEl = opts.shadowEl || null;
  const pixelRatioCapped = Math.min(Number(opts.pixelRatio) || 1.5, HARD_DPR_CAP);
  const dragPixelRatioCapped = Math.min(Number(opts.dragPixelRatio) || 1.0, HARD_DPR_CAP);
  const stepsFull = clamp(Math.floor(Number(opts.steps) || 96), 1, LOOP_CAP);
  const stepsDrag = clamp(Math.floor(Number(opts.dragSteps) || 64), 1, LOOP_CAP);
  let viewScale = Number(opts.viewScale) || 1.0; // let — see setViewScale()

  const res = field.res;
  const brick = field.brickSize;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: 'high-performance',
    // The march antialiases its own silhouette, so MSAA would buy nothing;
    // preserveDrawingBuffer keeps toDataURL() from racing the render.
    preserveDrawingBuffer: true,
  });
  if (!renderer.capabilities.isWebGL2) {
    throw new Error('[field-three] needs WebGL2 — a 3-D texture is the whole representation');
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  camera.position.z = 1;
  const geometry = new THREE.PlaneGeometry(2, 2);

  // ---------------------------------------------------------------------------
  // The volume texture
  // ---------------------------------------------------------------------------

  const fieldTexture = new THREE.Data3DTexture(field.packAll(), res, res, res);
  fieldTexture.format = THREE.RGBAFormat;
  fieldTexture.type = THREE.UnsignedByteType;
  // LINEAR on all three axes is not a nicety here — it IS the blend. Nearest
  // filtering would show the grid as faceted voxel walls and would make colour
  // change in hard steps instead of smearing.
  fieldTexture.minFilter = THREE.LinearFilter;
  fieldTexture.magFilter = THREE.LinearFilter;
  fieldTexture.wrapS = THREE.ClampToEdgeWrapping;
  fieldTexture.wrapT = THREE.ClampToEdgeWrapping;
  fieldTexture.wrapR = THREE.ClampToEdgeWrapping;
  fieldTexture.unpackAlignment = 1;
  fieldTexture.generateMipmaps = false;
  fieldTexture.flipY = false;
  fieldTexture.needsUpdate = true;

  // One reusable staging texture for the incremental path.
  // copyTextureToTexture3D reads its `image.data` straight through to
  // texSubImage3D and never uploads the source in its own right, so this is
  // just a typed array wearing a three.js hat — which is what lets its
  // dimensions be rewritten per upload to match whatever region is dirty.
  const stageBuffer = new Uint8Array(res * res * res * 4);
  const stageTexture = new THREE.Data3DTexture(stageBuffer, 1, 1, 1);
  stageTexture.format = THREE.RGBAFormat;
  stageTexture.type = THREE.UnsignedByteType;
  stageTexture.unpackAlignment = 1;
  stageTexture.flipY = false;
  const stagePosition = new THREE.Vector3();

  const half = field.size / 2;
  const uniforms = {
    uQuad: { value: new THREE.Vector4(0, 0, 1, 1) },
    uField: { value: fieldTexture },
    uBand: { value: field.band },
    uVoxel: { value: field.h },
    uFieldMin: { value: new THREE.Vector3(-half, -half, -half) },
    uFieldMax: { value: new THREE.Vector3(half, half, half) },
    uBoxMin: { value: new THREE.Vector3(-half, -half, -half) },
    uBoxMax: { value: new THREE.Vector3(half, half, half) },
    uToField: { value: new THREE.Matrix3() },
    uToWorld: { value: new THREE.Matrix3() },
    uPivot: { value: new THREE.Vector3() },
    uShift: { value: new THREE.Vector3() },
    uAspect: { value: 1 },
    uViewScale: { value: viewScale },
    uSteps: { value: stepsFull },
    uPixel: { value: 0.004 },
    uDetail: { value: LAB_REFERENCE_RADIUS / 0.30 },
    uBumpStrength: { value: Number.isFinite(opts.bumpStrength) ? opts.bumpStrength : 0.42 },
    uLooseCount: { value: 0 },
    uLooseSphere: { value: Array.from({ length: MAX_LOOSE }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uLooseColor: { value: Array.from({ length: MAX_LOOSE }, () => new THREE.Vector3(0.8, 0.8, 0.8)) },
    uLoosePhase: { value: Array.from({ length: MAX_LOOSE }, () => new THREE.Vector3(0, 0, 0)) },
    uLooseSquash: { value: Array.from({ length: MAX_LOOSE }, () => new THREE.Vector4(0, 1, 0, 0)) },
    uNoiseAmp: { value: Number.isFinite(opts.noiseAmp) ? opts.noiseAmp : NOISE_AMP },
    uNoiseFreq: { value: Number.isFinite(opts.noiseFreq) ? opts.noiseFreq : NOISE_FREQ },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    glslVersion: THREE.GLSL3,
    vertexShader: VERTEX_SHADER,
    fragmentShader: buildFragmentShader(),
  });

  const mesh = new THREE.Mesh(geometry, material);
  // The vertex shader relocates the quad into an arbitrary clip-space sub-rect,
  // so three's frustum test — which still reasons about the untouched plane at
  // the origin — can only ever be wrong about it.
  mesh.frustumCulled = false;
  scene.add(mesh);

  const syncPixel = new Uint8Array(4);
  const tmpQuat = new THREE.Quaternion();
  const tmpMat4 = new THREE.Matrix4();
  const tmpVec = new THREE.Vector3();

  let quality = 'full';
  let aspect = 1;
  let lastCssWidth = Math.max(1, canvas.clientWidth || 1);
  let lastCssHeight = Math.max(1, canvas.clientHeight || 1);
  let rafHandle = null;
  let settleRemaining = 0;
  let destroyed = false;
  let firstUploadDone = false;

  // Pose: a rigid transform applied to the FIELD at draw time only. The settle
  // animation lives entirely here — sixty frames of rotation cost sixty
  // uniform writes and not one voxel of resampling. field-core bakes the pose
  // once at the end.
  const pose = { quat: [0, 0, 0, 1], pivot: [0, 0, 0], shift: [0, 0, 0] };

  // The unwelded tray balls, newest last. Plain data, mirrored into uniforms by
  // setLoose(); nothing here is a source of truth, the game owns the list.
  let loose = [];

  const onAnimationFrame = typeof opts.onAnimationFrame === 'function' ? opts.onAnimationFrame : null;
  let lastFrameAt = 0;

  const statsState = {
    renders: 0, lastFrameMs: 0, totalFrameMs: 0, maxFrameMs: 0,
    lastRenderAt: 0, lastIntervalMs: 0,
    uploads: 0, lastUploadBricks: 0, lastUploadBytes: 0, lastUploadMs: 0,
    lastUploadRegion: '', totalUploadBytes: 0, totalUploadMs: 0,
  };

  function activePixelRatio() {
    return quality === 'drag' ? dragPixelRatioCapped : pixelRatioCapped;
  }

  function resizeBuffer() {
    const dpr = Math.min(activePixelRatio(), window.devicePixelRatio || 1, HARD_DPR_CAP);
    renderer.setPixelRatio(dpr);
    renderer.setSize(lastCssWidth, lastCssHeight, false);
    aspect = lastCssWidth / Math.max(lastCssHeight, 1);
    uniforms.uAspect.value = aspect;
  }
  resizeBuffer();

  function setViewport(cssWidth, cssHeight) {
    if (destroyed) return;
    lastCssWidth = Math.max(1, Number(cssWidth) || 1);
    lastCssHeight = Math.max(1, Number(cssHeight) || 1);
    resizeBuffer();
    requestRender();
  }

  /**
   * World units per NDC unit — how much of the world the stage shows.
   *
   * A game whose stage is wider than it is tall sets this to 1/aspect so the
   * WHOLE stage lands inside the field's own cube: without it, clay could be
   * placed at a world x the grid does not cover, and a ball dropped near the
   * edge of the table would be quietly half-missing. It changes on every
   * orientation change, so it cannot be a construction-time constant.
   */
  function setViewScale(value) {
    const next = Number(value);
    if (!Number.isFinite(next) || next <= 0 || next === viewScale) return;
    viewScale = next;
    uniforms.uViewScale.value = viewScale;
    requestRender();
  }

  /**
   * Point this renderer at a different field. Same grid resolution only — the
   * volume texture is allocated once and is not going to be reallocated per
   * shelf card, which is the entire reason this exists.
   */
  function setField(next) {
    if (destroyed || !next || next === field) return false;
    if (next.res !== res) return false;
    field = next;
    uniforms.uBand.value = field.band;
    uniforms.uVoxel.value = field.h;
    // Force the whole-texture path on the next upload: the incremental path
    // would push the new field's dirty region into the old field's texels.
    firstUploadDone = false;
    return true;
  }

  /** World units per device pixel — the tolerance everything screen-sized uses. */
  function worldPerPixel() {
    return (2 * viewScale) / Math.max(renderer.domElement.height, 1);
  }

  /** Pointer client coords -> world x/y on the camera plane. */
  function clientToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const a = rect.width / Math.max(rect.height, 1);
    return {
      x: (((clientX - rect.left) / rect.width) * 2 - 1) * a * viewScale,
      y: (1 - ((clientY - rect.top) / rect.height) * 2) * viewScale,
    };
  }

  function worldToClient(x, y) {
    const rect = canvas.getBoundingClientRect();
    const a = rect.width / Math.max(rect.height, 1);
    return {
      x: rect.left + ((x / (a * viewScale) + 1) / 2) * rect.width,
      y: rect.top + ((1 - y / viewScale) / 2) * rect.height,
    };
  }

  // ---------------------------------------------------------------------------
  // Pose
  // ---------------------------------------------------------------------------

  /**
   * Show the field rotated/translated without changing it. Pass nulls to clear.
   * @param {number[]|null} quat  [x,y,z,w], field -> world
   * @param {number[]|null} pivot
   * @param {number[]|null} shift
   */
  function setPose(quat, pivot, shift) {
    pose.quat = quat ? quat.slice() : [0, 0, 0, 1];
    pose.pivot = pivot ? pivot.slice() : [0, 0, 0];
    pose.shift = shift ? shift.slice() : [0, 0, 0];
    syncPose();
    requestRender();
  }

  // ---------------------------------------------------------------------------
  // Loose balls
  // ---------------------------------------------------------------------------

  /**
   * Replace the set of unwelded tray balls drawn on top of the field.
   *
   * @param {Array<{x:number,y:number,z:number,radius:number,color:number[]|string,
   *   phase:number[], squash?:{x:number,y:number,z:number,amount:number}}>} list
   *   at most MAX_LOOSE entries; extras are ignored (the GAME is responsible
   *   for stamping the overflow, see MAX_LOOSE).
   *
   * `color` arrives as the sRGB bytes the tray handed over, exactly as the
   * field stores them, and the shader linearises it in the same place it
   * linearises a texture fetch. Handing this a linear colour is the single
   * easiest way to make a loose ball a visibly different shade from the clay it
   * is about to become.
   */
  function setLoose(list) {
    if (destroyed) return;
    loose = (Array.isArray(list) ? list : []).slice(0, MAX_LOOSE);
    syncLoose();
  }

  /**
   * Mirror `loose` into the uniforms, carrying each ball from WORLD space into
   * FIELD space through the current pose.
   *
   * This is the one place the pose and the loose balls have to be reconciled,
   * and getting it wrong is not subtle: a settle rotates the FIELD, and a ball
   * lying on the table beside the creature must not rotate with it. The march
   * runs in field space, so a ball that is to hold still in the world has to be
   * written down at R^T (W - pivot - shift) + pivot — the same map the shader
   * applies to the ray. With no pose (the overwhelmingly common case) that is
   * the identity and this costs three multiplies.
   */
  function syncLoose() {
    uniforms.uLooseCount.value = loose.length;
    const m = uniforms.uToField.value;
    const px = pose.pivot[0]; const py = pose.pivot[1]; const pz = pose.pivot[2];
    const sx = pose.shift[0]; const sy = pose.shift[1]; const sz = pose.shift[2];
    for (let i = 0; i < loose.length; i++) {
      const b = loose[i];
      tmpVec.set((b.x || 0) - px - sx, (b.y || 0) - py - sy, (b.z || 0) - pz - sz).applyMatrix3(m);
      uniforms.uLooseSphere.value[i].set(tmpVec.x + px, tmpVec.y + py, tmpVec.z + pz, Math.max(1e-4, b.radius || 0));
      const rgb = Array.isArray(b.color) ? b.color : [204, 204, 204];
      uniforms.uLooseColor.value[i].set(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
      const ph = Array.isArray(b.phase) ? b.phase : [0, 0, 0];
      uniforms.uLoosePhase.value[i].set(ph[0] || 0, ph[1] || 0, ph[2] || 0);
      const sq = b.squash;
      if (sq && sq.amount) {
        // A direction, so it takes the rotation and not the translation.
        tmpVec.set(sq.x || 0, sq.y || 0, sq.z || 0).applyMatrix3(m).normalize();
        uniforms.uLooseSquash.value[i].set(tmpVec.x, tmpVec.y, tmpVec.z, sq.amount);
      } else {
        uniforms.uLooseSquash.value[i].set(0, 1, 0, 0);
      }
    }
  }

  /** A loose ball's full reach: lumps plus the sideways bulge of a squash. */
  function looseReach(ball) {
    return (ball.radius || 0) * (1 + uniforms.uNoiseAmp.value + 0.5 * Math.abs(ball.squash?.amount || 0)) + field.h;
  }

  /**
   * FIELD-space AABB for the shader's slab test: the material's own box, grown
   * to cover every loose ball at its pose-mapped position. A ball outside this
   * box is culled by boxRange() before the march ever samples it.
   */
  function sceneBoundsField() {
    const b = field.bounds();
    if (!loose.length) return b;
    let minX = b ? b.minX : Infinity; let minY = b ? b.minY : Infinity; let minZ = b ? b.minZ : Infinity;
    let maxX = b ? b.maxX : -Infinity; let maxY = b ? b.maxY : -Infinity; let maxZ = b ? b.maxZ : -Infinity;
    for (let i = 0; i < loose.length; i++) {
      const s = uniforms.uLooseSphere.value[i];
      const r = looseReach(loose[i]);
      if (s.x - r < minX) minX = s.x - r; if (s.x + r > maxX) maxX = s.x + r;
      if (s.y - r < minY) minY = s.y - r; if (s.y + r > maxY) maxY = s.y + r;
      if (s.z - r < minZ) minZ = s.z - r; if (s.z + r > maxZ) maxZ = s.z + r;
    }
    if (minX === Infinity) return null;
    return {
      minX, minY, minZ, maxX, maxY, maxZ,
      width: maxX - minX, height: maxY - minY, depth: maxZ - minZ,
    };
  }

  function syncPose() {
    tmpQuat.set(pose.quat[0], pose.quat[1], pose.quat[2], pose.quat[3]).normalize();
    tmpMat4.makeRotationFromQuaternion(tmpQuat);
    uniforms.uToWorld.value.setFromMatrix4(tmpMat4);
    uniforms.uToField.value.copy(uniforms.uToWorld.value).transpose();
    uniforms.uPivot.value.set(pose.pivot[0], pose.pivot[1], pose.pivot[2]);
    uniforms.uShift.value.set(pose.shift[0], pose.shift[1], pose.shift[2]);
    syncLoose();
  }
  syncPose();

  // ---------------------------------------------------------------------------
  // Upload
  // ---------------------------------------------------------------------------

  /**
   * Push the field's dirty bricks into the volume texture and clear the flags.
   *
   * The first call has to go through three's own full upload, because the GL
   * texture object does not exist until three has created it — and there is no
   * public handle to it in r166, which is exactly why the incremental path goes
   * through copyTextureToTexture3D rather than a raw texSubImage3D of our own.
   */
  function uploadDirty() {
    const box = field.dirtyBox();
    // Nothing dirty AND the texture already holds this field: nothing to do.
    // The second half matters after setField() — a freshly replayed field
    // usually has everything dirty, but a restored snapshot may not, and
    // skipping here would leave the previous creature on screen.
    if (!box && firstUploadDone) return 0;
    const t0 = performance.now();
    const boxVoxels = box ? box.w * box.h * box.d : field.voxelCount;
    let bytes = 0;

    // ONE region upload, not one per brick. See field-core's dirtyBox() note:
    // the per-brick version measured 13.5 ms per drag frame for 128 KB, all of
    // it API overhead, and this is the same bytes in a single call. Past
    // roughly half the grid a whole-texture upload wins anyway, and that is the
    // path simplify() and settleRest() take — a drag never does.
    if (!firstUploadDone || boxVoxels >= field.voxelCount * 0.5) {
      field.packAll(fieldTexture.image.data);
      fieldTexture.needsUpdate = true;
      renderer.initTexture(fieldTexture);
      firstUploadDone = true;
      bytes = fieldTexture.image.data.length;
    } else {
      field.packBox(box, stageBuffer);
      stageTexture.image.width = box.w;
      stageTexture.image.height = box.h;
      stageTexture.image.depth = box.d;
      stagePosition.set(box.i0, box.j0, box.k0);
      renderer.copyTextureToTexture3D(stageTexture, fieldTexture, null, stagePosition, 0);
      // copyTextureToTexture3D binds the destination behind three's back;
      // resetState drops the state cache so the next draw re-binds cleanly.
      renderer.resetState();
      bytes = boxVoxels * 4;
    }

    field.clearDirty();
    statsState.uploads += 1;
    statsState.lastUploadBricks = box ? box.bricks : field.brickCount;
    statsState.lastUploadBytes = bytes;
    statsState.lastUploadRegion = box ? `${box.w}×${box.h}×${box.d}` : `${res}×${res}×${res}`;
    statsState.lastUploadMs = performance.now() - t0;
    statsState.totalUploadBytes += bytes;
    statsState.totalUploadMs += statsState.lastUploadMs;
    return bytes;
  }

  // ---------------------------------------------------------------------------
  // Shadow
  // ---------------------------------------------------------------------------

  function updateShadow(bounds) {
    if (!shadowEl) return;
    if (!bounds) { shadowEl.style.opacity = '0'; return; }
    const groundY = field.ground();
    const canvasWorldWidth = 2 * Math.max(aspect, 0.0001) * viewScale;
    const pct = clamp((bounds.width / canvasWorldWidth) * 100, 4, 96);
    shadowEl.style.width = `${pct.toFixed(2)}%`;
    if (typeof groundY === 'number') {
      // How close the material actually gets to the table, so lifting the clay
      // fades its shadow instead of dragging a hard ellipse around under it.
      const gap = clamp((bounds.minY - groundY) / Math.max(bounds.height, 1e-4), 0, 1);
      shadowEl.style.opacity = `${(0.86 - gap * 0.7).toFixed(3)}`;
      const halfShadowPct = (shadowEl.offsetHeight / Math.max(lastCssHeight, 1)) * 50;
      const bottomPct = clamp(((groundY / viewScale + 1) / 2) * 100 - halfShadowPct, -20, 100);
      shadowEl.style.bottom = `${bottomPct.toFixed(2)}%`;
    } else {
      shadowEl.style.opacity = '0.7';
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  function recordStats(dt) {
    const t = performance.now();
    statsState.renders += 1;
    statsState.lastFrameMs = dt;
    statsState.totalFrameMs += dt;
    if (dt > statsState.maxFrameMs) statsState.maxFrameMs = dt;
    statsState.lastIntervalMs = statsState.lastRenderAt ? t - statsState.lastRenderAt : 0;
    statsState.lastRenderAt = t;
  }

  /**
   * Synchronous single render.
   *
   * `sync: true` blocks on a one-pixel readPixels before stopping the clock.
   * gl.finish() is not a real barrier in Chrome — it returns across the command
   * buffer long before the GPU is done and reports numbers that cannot be true
   * — so reading a pixel back is what makes the fill-rate probe trustworthy.
   * It costs a pipeline stall, so it is opt-in and the interactive path never
   * uses it. (Same reasoning, same fix, as lobes-three.js.)
   */
  function renderNow({ sync = false, skipUpload = false } = {}) {
    if (destroyed) return;
    const t0 = performance.now();
    if (!skipUpload) uploadDirty();

    const bounds = sceneBoundsField();
    let rendered = false;
    if (bounds) {
      // March range in FIELD space (the field never moves; the pose moves the
      // ray). Padded by the material's own noise reach plus a voxel of slack.
      const pad = field.h * 2;
      uniforms.uBoxMin.value.set(bounds.minX - pad, bounds.minY - pad, bounds.minZ - pad);
      uniforms.uBoxMax.value.set(bounds.maxX + pad, bounds.maxY + pad, bounds.maxZ + pad);
      uniforms.uPixel.value = worldPerPixel();

      // The quad only covers the posed body's screen rect, so pixels far from
      // the clay are never rasterised — the first and biggest of the fill-rate
      // savings, and the one that makes a full-screen raymarch affordable at
      // all. Eight transformed corners, projected.
      const q = tmpQuat.set(pose.quat[0], pose.quat[1], pose.quat[2], pose.quat[3]).normalize();
      tmpMat4.makeRotationFromQuaternion(q);
      const m = tmpMat4.elements;
      let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
      for (let c = 0; c < 8; c++) {
        const x = (c & 1 ? bounds.maxX : bounds.minX) - pose.pivot[0];
        const y = (c & 2 ? bounds.maxY : bounds.minY) - pose.pivot[1];
        const z = (c & 4 ? bounds.maxZ : bounds.minZ) - pose.pivot[2];
        const wx = m[0] * x + m[4] * y + m[8] * z + pose.pivot[0] + pose.shift[0];
        const wy = m[1] * x + m[5] * y + m[9] * z + pose.pivot[1] + pose.shift[1];
        if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
      }
      // ...and the loose balls, which live in WORLD space and therefore do NOT
      // ride the pose. Folded in after the projection rather than before it,
      // for exactly that reason.
      for (const ball of loose) {
        const r = looseReach(ball);
        if (ball.x - r < minX) minX = ball.x - r; if (ball.x + r > maxX) maxX = ball.x + r;
        if (ball.y - r < minY) minY = ball.y - r; if (ball.y + r > maxY) maxY = ball.y + r;
      }
      const margin = worldPerPixel() * 3 + field.h;
      const ndcMinX = (minX - margin) / (viewScale * aspect);
      const ndcMaxX = (maxX + margin) / (viewScale * aspect);
      const ndcMinY = (minY - margin) / viewScale;
      const ndcMaxY = (maxY + margin) / viewScale;
      uniforms.uQuad.value.set(
        (ndcMinX + ndcMaxX) / 2,
        (ndcMinY + ndcMaxY) / 2,
        Math.max((ndcMaxX - ndcMinX) / 2, 0.001),
        Math.max((ndcMaxY - ndcMinY) / 2, 0.001),
      );
      renderer.render(scene, camera);
      rendered = true;
    }
    if (!rendered) renderer.clear();
    if (sync) {
      const gl = renderer.getContext();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPixel);
    }
    updateShadow(bounds);
    recordStats(performance.now() - t0);
  }

  function scheduleFrame() {
    if (destroyed || rafHandle !== null) return;
    rafHandle = requestAnimationFrame((t) => {
      rafHandle = null;
      // ONE rAF, per interaction-patterns #12. The landing fall and squash, and
      // the settle pose animation, all tick from here rather than opening a
      // second loop next to this one — two loops is how a stage ends up
      // rendering while it is idle without anything in the code saying so.
      let more = false;
      if (onAnimationFrame) {
        const dt = lastFrameAt ? Math.min(64, t - lastFrameAt) : 16.7;
        lastFrameAt = t;
        try { more = onAnimationFrame(dt) === true; } catch (error) {
          console.warn('[field-three] onAnimationFrame threw:', error?.message || error);
          more = false;
        }
      }
      if (!more) lastFrameAt = 0; // next burst starts its clock fresh
      renderNow();
      if (more || settleRemaining > 0) {
        if (!more && settleRemaining > 0) settleRemaining -= 1;
        scheduleFrame();
      }
    });
  }

  /** Coalesces into at most one pending rAF. There is no continuous loop. */
  function requestRender() {
    if (destroyed) return;
    scheduleFrame();
  }

  /** Chains N extra frames after the next one — interaction-patterns #12. */
  function settle(frames = 2) {
    if (destroyed) return;
    settleRemaining = Math.max(settleRemaining, Math.max(0, Math.floor(frames)));
    scheduleFrame();
  }

  function setQuality(mode) {
    if (destroyed || (mode !== 'drag' && mode !== 'full') || mode === quality) return;
    quality = mode;
    uniforms.uSteps.value = mode === 'drag' ? stepsDrag : stepsFull;
    resizeBuffer();
    requestRender();
  }

  /**
   * Cost probe: N synchronous renders with a readPixels barrier, reported as a
   * median. The number the experiment lives or dies by is whether this stays
   * FLAT as the child sculpts, so the probe also reports what it was measuring.
   */
  function probe(frames = 12) {
    const samples = [];
    for (let i = 0; i < frames; i++) {
      const t0 = performance.now();
      renderNow({ sync: true, skipUpload: i > 0 });
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    return {
      frames,
      medianMs: samples[Math.floor(samples.length / 2)],
      minMs: samples[0],
      maxMs: samples[samples.length - 1],
      pixelRatio: renderer.getPixelRatio(),
      bufferWidth: renderer.domElement.width,
      bufferHeight: renderer.domElement.height,
      steps: uniforms.uSteps.value,
      quality,
    };
  }

  function toDataURL(type = 'image/png') {
    renderNow();
    return canvas.toDataURL(type);
  }

  function stats() {
    return {
      renders: statsState.renders,
      lastFrameMs: statsState.lastFrameMs,
      avgFrameMs: statsState.renders ? statsState.totalFrameMs / statsState.renders : 0,
      maxFrameMs: statsState.maxFrameMs,
      lastIntervalMs: statsState.lastIntervalMs,
      uploads: statsState.uploads,
      lastUploadBricks: statsState.lastUploadBricks,
      lastUploadBytes: statsState.lastUploadBytes,
      lastUploadRegion: statsState.lastUploadRegion,
      lastUploadMs: statsState.lastUploadMs,
      avgUploadBytes: statsState.uploads ? statsState.totalUploadBytes / statsState.uploads : 0,
      pixelRatio: renderer.getPixelRatio(),
      bufferWidth: renderer.domElement.width,
      bufferHeight: renderer.domElement.height,
      steps: uniforms.uSteps.value,
      textureBytes: res * res * res * 4,
    };
  }

  function resetStats() {
    statsState.renders = 0;
    statsState.lastFrameMs = 0;
    statsState.totalFrameMs = 0;
    statsState.maxFrameMs = 0;
    statsState.lastRenderAt = 0;
    statsState.lastIntervalMs = 0;
    statsState.uploads = 0;
    statsState.totalUploadBytes = 0;
    statsState.totalUploadMs = 0;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (rafHandle !== null) { cancelAnimationFrame(rafHandle); rafHandle = null; }
    settleRemaining = 0;
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
    fieldTexture.dispose();
    stageTexture.dispose();
    renderer.dispose();
  }

  return {
    setViewport, setViewScale, setField, worldPerPixel, clientToWorld, worldToClient,
    setPose, setLoose, uploadDirty,
    requestRender, renderNow, settle, setQuality,
    bounds: sceneBoundsField,
    probe, toDataURL, stats, resetStats, destroy,
    maxLoose: MAX_LOOSE,
    uniforms,
  };
}
