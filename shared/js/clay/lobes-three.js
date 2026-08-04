// lobes-three.js — a WebGL raymarch renderer for an implicit-lobes clay field
// (shared/js/clay/lobes.js). Turns `field.shading()` into the same procedural
// dough material as experiments/clay-physics-lab/solid.js, generalized from
// two hardcoded balls to a bounded N-lobe smooth union.
//
// Import rules: three.js arrives as `opts.THREE` (house pattern, see
// shared/js/stage/water.js) so the game's one vendored copy is the only one
// that ever loads — this module otherwise touches nothing outside itself,
// with ONE deliberate exception. It imports the four hand-worked-noise tuning
// constants (NOISE_FREQ/NOISE_FALLOFF/NOISE_SAFETY/NOISE_AMP) straight from
// lobes.js, a same-directory sibling with zero dependencies of its own and no
// three.js in it anywhere. The alternative — copying those four numbers into
// this file's template string — is exactly the kind of drift this codebase
// keeps re-discovering the hard way: lobes.js's raycast() and this file's
// fragment shader both march the SAME displaced surface, and a hand-edited
// duplicate of NOISE_FREQ that falls out of sync would make a pull start
// somewhere other than where the child's finger actually lands on the lump.
// A same-directory, dependency-free import is cheap insurance against that.
//
// RENDER-ON-DEMAND, PER docs/interaction-patterns.md #12
// There is no `requestAnimationFrame(render)` tail anywhere in this file.
// `requestRender()` coalesces bursts (pointermove, a field edit) into at most
// one pending rAF; `renderNow()` is the synchronous escape hatch a caller
// uses for thumbnail rasterization; `settle(frames)` chains a few more frames
// after the next one, which is the fix #12 prescribes for the "texture
// uploads on the frame that draws it" problem — a lobe just added needs one
// settle pass or it can flash in a frame late on a still stage.
//
// FILL-RATE DISCIPLINE
// A full-screen quad marching 12 lobes at full step budget is not affordable on a
// tablet GPU. Three things keep it cheap: (1) the quad itself only covers a
// sub-rect of clip space sized from `field.bounds()`, so pixels far from the
// blob are never rasterized at all; (2) every surviving pixel first runs a
// cheap 2-D capsule test (base-to-tip segment, not a fat bounding sphere)
// against every lobe and returns transparent immediately if it misses them
// all; (3) the march range itself is bounded analytically
// from the surviving candidates (`zEnter`/`zExit`) instead of a fixed far
// plane, so most hits resolve in a handful of steps rather than the full
// budget. None of this is optional at lobe counts near the cap.
//
// COLOUR SEAM
// Colour ownership is decided once, at the hit point, from each lobe's own
// (unblended) distance plus a small per-lobe noise offset — never a
// projected decal, never a wash across the whole body. Only lobes within a
// narrow band of the nearest one blend, so two colours meet in a seam
// instead of curdling into mud everywhere they're both "close".
//
// HAND-WORKED SURFACE DISPLACEMENT
// lobes.js's shading() now hands over `noiseAmp` and a per-lobe `noisePhase`
// triple, and this file mirrors its shadeDistanceOrganic() term for term (see
// lobeWave/lobeSample/lobeDistanceOrganic below) rather than approximating
// it, because the CPU trace in lobes.js (what a pull roots on) and the GPU
// march here (what the child sees) have to agree on where the surface is —
// any daylight between them and a pull would start visibly off the lump the
// finger is actually touching. Three things about the port are load-bearing:
//   OBJECT-LOCKED. The displacement samples the same local point
//   lobeDistance()/lobeSample() already computes for the round-cone SDF
//   itself, in the lobe's own material frame, so the lumps ride the clay
//   exactly as lobes.js's header describes — they cannot swim as a limb is
//   drawn out, as the settle runs, or as the canvas resizes.
//   PROPORTIONAL. Amplitude is a fraction of rLocal — the taper's local
//   radius at the sampled point, not the lobe's rest radius — so a needle
//   tip keeps getting needle-sized lumps and the fat-shoulder-to-fine-point
//   silhouette a stretched limb depends on survives intact.
//   STEP-SAFE. Displacing an SDF costs it its Lipschitz-1 property (see
//   NOISE_SAFETY below), so mapDistance's return is scaled down before the
//   march ever sees it, and the two places the un-displaced silhouette used
//   to bound the raymarch — the 2-D capsule rejection's `rMix` and
//   renderNow()'s quad padding — are both grown by the noise amplitude too;
//   otherwise the lumps the displacement adds would get clipped by bounds
//   sized for the smooth surface underneath them.
// This is a different thing from surfaceNoise() above, which is a shading
// bump layered onto the lit colour and never touches the SDF at all.

import { NOISE_FREQ, NOISE_FALLOFF, NOISE_SAFETY, NOISE_AMP } from './lobes.js';

const HARD_DPR_CAP = 1.5;        // never exceeds this regardless of opts or devicePixelRatio
const LOOP_CAP = 128;             // the fragment shader's hard `for` bound on march steps
const QUAD_PAD_FACTOR = 0.22;    // extra clip-space margin, as a fraction of the largest radius
const QUAD_PAD_BASE = 0.03;      // and a flat floor, so a lone small lobe still gets AA room
const LAB_REFERENCE_RADIUS = 0.78; // the lobe size experiments/clay-physics-lab authored the material against

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
// A JS number as a GLSL ES 1.0 FLOAT literal. Interpolating a bare number into
// the shader source is a trap waiting to spring: the moment one of the noise
// constants is retuned to a whole number, `1` arrives as an int, GLSL refuses
// to multiply a float by it, and the whole material fails to compile at
// runtime with an error nothing in the test suite would have caught.
const glsl = (n) => Number(n).toFixed(6);

function buildFragmentShader(maxLobes) {
  return `
    precision highp float;

    #define MAX_LOBES ${maxLobes}

    varying vec2 vScreen;

    uniform vec4 uLobes[MAX_LOBES];   // xyz = base point a, w = ra (base radius)
    uniform vec4 uTips[MAX_LOBES];    // xyz = tip point b,  w = rb (tip radius)
    uniform vec3 uColors[MAX_LOBES];
    // xy = unit deform axis, z = SIGNED deform (positive squashes along the
    // axis and bulges perpendicular, negative elongates along the axis and
    // thins perpendicular), w = the smooth-union blend radius in WORLD UNITS.
    // That last channel used to carry the raw 0..1 join and derive k from the
    // lobe's own radius here in the shader. It cannot any more: ra and rb both
    // move under a stretch (the tip especially — it collapses to a fraction of
    // rest), so a radius-derived k would breathe as the limb was drawn out and
    // would tighten the fillet exactly where the shallow limb-to-body angle
    // needs it widest, creasing every shoulder into a hard V. lobes.js computes
    // it now (off restRadius, which a stretch never changes, scaled by how far
    // the limb is drawn out) and hands it over finished.
    uniform vec4 uSquash[MAX_LOBES];
    // xyz = this lobe's noise phase triple (lobes.js's noisePhase(id, seed),
    // a pure hash so a creature's lumps never change across frames, sessions
    // or a shelf thumbnail), w = restRadius — the displacement's wave numbers
    // are in units of 1/restRadius (see lobeDistanceOrganic), and restRadius
    // is the one length a stretch never touches, so keying the frequency off
    // it is what keeps a drawn-out limb's lumps from visibly resizing as it's
    // pulled, the same reason uRefRadius above keys off it too.
    uniform vec4 uNoise[MAX_LOBES];
    // Displacement amplitude as a fraction of the LOCAL taper radius, one
    // scalar for the whole creature because it is one lump of clay worked by
    // one pair of hands — see NOISE_AMP in lobes.js.
    uniform float uNoiseAmp;
    uniform int uCount;
    uniform float uAspect;
    uniform float uSteps;
    uniform float uMinRadius;
    // Mean lobe RESTRADIUS (JS: renderNow() sums shading()[i].restRadius, not
    // .radius/ra), the scale everything material keys off. Keying this off ra
    // instead would make a stretched limb's own clay grain visibly change
    // size as it's pulled — restRadius never changes under a stretch, so it's
    // the one stable reference the material can key its scale off.
    uniform float uRefRadius;
    uniform float uDetail;      // world-space frequency correction, see JS
    uniform float uPixel;       // world units per device pixel
    uniform float uSeamWobble;
    uniform float uGround;      // world y of the ground plane (only meaningful when uGroundOn > 0.5)
    uniform float uGroundOn;    // 0 or 1 — field.ground() can be off, and a rasterizer-only
                                 // field may not implement ground() at all

    // three injects its output-colour-space conversion into the materials it
    // builds, but NOT into a raw ShaderMaterial — a custom shader that writes
    // gl_FragColor gets none of it. Colour uniforms arrive already converted
    // to the linear working space, so without this the whole body renders a
    // full gamma too dark: bright clay reads as saturated vinyl and the cocoa
    // ball crushes to near-black. Same transfer curve three uses.
    vec3 linearToSRGB(vec3 c) {
      c = max(c, vec3(0.0));
      return mix(c * 12.92, 1.055 * pow(c, vec3(0.4166667)) - 0.055, step(vec3(0.0031308), c));
    }

    // Standard iq round-cone SDF: the exact distance to the convex hull of
    // two spheres (a, r1) and (b, r2) — a capsule with unequal end radii.
    // Two degeneracies MUST be guarded before the general formula's 1/l2
    // term, and in that order, because most lobes in a real scene are
    // unstretched balls (a == b) and will hit the FIRST guard on literally
    // every single march step:
    //   - l2 ~ 0 (a and b coincide): the cone collapses to one sphere of
    //     radius r1. The general formula divides by l2 and would NaN.
    //   - a2 <= 0 (one end-sphere fully contains the other, e.g. a stubby
    //     lobe with a much fatter tip than base): the hull is just the
    //     larger sphere. Returning that conservative distance means the
    //     march can never overshoot the shell even though the "cone" part
    //     of the shape doesn't geometrically exist here.
    float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
      vec3 ba = b - a;
      float l2 = dot(ba, ba);
      if (l2 < 1e-8) return length(p - a) - r1;
      float rr = r1 - r2;
      float a2 = l2 - rr * rr;
      if (a2 <= 0.0) return length(p - a) - max(r1, r2);
      float il2 = 1.0 / l2;

      vec3 pa = p - a;
      float y = dot(pa, ba);
      float z = y - l2;
      vec3 xVector = pa * l2 - ba * y;
      float x2 = dot(xVector, xVector);
      float y2 = y * y * l2;
      float z2 = z * z * l2;

      // Single square root, whichever region of the hull (tip cap, base
      // cap, or the conical side) the point actually falls against.
      float k = sign(rr) * rr * rr * x2;
      if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
      if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
      return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
    }

    // Polynomial smooth-min/-max, factored out of mapDistance's inline form
    // so the ground cut (which needs a smooth MAX, not a smooth min) can
    // reuse the identical blend curve rather than authoring a second one that
    // could drift out of sync with it.
    float smoothMin(float a, float b, float k) {
      float h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0);
      return mix(a, b, h) - k * h * (1.0 - h);
    }
    float smoothMax(float a, float b, float k) {
      return -smoothMin(-a, -b, k);
    }

    // Exact port of lobes.js's noiseWave(), evaluated in the caller's local
    // (deform-scaled) frame. Three oblique plane waves, not axis-aligned
    // ones: axis-aligned waves corduroy the surface into visible ridges, and
    // three incommensurate directions over the ~3-radius extent of a lobe
    // never close into a repeat. The shear ahead of them is a per-lobe skew
    // of the whole lattice — without it every lobe's lumps run the same way
    // and the body reads as extruded rather than modelled, and a pure phase
    // offset cannot fix that because it slides the pattern without turning
    // it.
    float lobeWave(vec3 q, vec3 phase) {
      float shear = (phase.x / 6.283185307179586 - 0.5) * 0.6;
      float x = q.x + q.y * shear;
      float y = q.y + q.z * shear;
      float z = q.z + q.x * shear;
      float sum = 0.0;
      sum += 0.42 * sin(1.00 * x + 0.62 * y + -0.35 * z + phase.x);
      sum += 0.34 * sin(-0.48 * x + 1.13 * y + 0.77 * z + phase.y);
      sum += 0.24 * sin(0.71 * x + -0.55 * y + 1.29 * z + phase.z);
      return sum;
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

    // The lab authored this material against lobes of radius ~0.78 in a
    // viewScale-2.05 world. A blob's lobes are roughly half that, so sampling
    // in raw world units stretches every feature: the grain vanishes and the
    // swirl bands into wide hypnotic rings. uDetail restores the lab's
    // feature size *relative to a lobe*, whatever the stage or ball size.
    float surfaceNoise(vec3 point) {
      vec3 q = point * uDetail;
      float angle = atan(q.y + 0.07, q.x + 0.18);
      float radius = length(q.xy + vec2(0.18, 0.07));
      float swirl = 0.5 + 0.5 * sin(radius * 112.0 + angle * 2.4 + valueNoise(q * 7.0) * 3.2);
      return valueNoise(q * 11.0) * 0.56 + valueNoise(q * 29.0) * 0.27 + swirl * 0.17;
    }

    vec2 lobeAxis(int i) {
      vec2 axis = uSquash[i].xy;
      return (dot(axis, axis) < 0.0001) ? vec2(1.0, 0.0) : axis;
    }

    // Zero axis (isolated lobe, never in contact) falls back to zero deform
    // so it stays a clean, unsquashed round cone rather than a degenerate
    // off-axis stretch.
    float lobeDeform(int i) {
      vec2 axis = uSquash[i].xy;
      return (dot(axis, axis) < 0.0001) ? 0.0 : uSquash[i].z;
    }

    // The generalized per-lobe field: a round cone (base a/ra, tip b/rb) with
    // the contact/impact deform applied as a non-uniform scale, then cut by
    // the ground plane. Factored out of lobeDistance() so lobeDistanceOrganic
    // can reuse the exact same frame the noise is sampled in — localPoint,
    // rLocal (the taper's local radius, i.e. mix(ra, rb, t) at the point's
    // projection onto the lobe's own axis) and the distance itself all come
    // out of one pass, because re-deriving the frame a second time per lobe
    // per march step is exactly the cost this file cannot afford. Both
    // lobeDistance (the ONE function mapDistance and clayColor call, so the
    // seam always lands on the true field boundary instead of drifting off
    // some cheaper stand-in) and lobeDistanceOrganic (the displaced surface
    // the march actually walks) build on this.
    float lobeSample(vec3 point, int i, out float rLocal, out vec3 localPoint) {
      vec4 baseBall = uLobes[i];
      vec4 tipBall = uTips[i];
      vec3 base = baseBall.xyz;
      vec3 tip = tipBall.xyz;
      float ra = baseBall.w;
      float rb = tipBall.w;
      vec2 axis = lobeAxis(i);
      float deform = lobeDeform(i);
      vec2 perpendicular = vec2(-axis.y, axis.x);

      // deform > 0 squashes along the axis and bulges perpendicular (a
      // contact press); deform < 0 elongates along the axis and thins
      // perpendicular (the rebound off an impact). Clamped well inside the
      // ±0.35 the JS side already enforces, as a second line of defence.
      float axialScale = clamp(1.0 - deform, 0.6, 1.4);
      float bulgeScale = inversesqrt(axialScale);
      // Non-uniform scaling breaks an SDF's metric (distances measured along
      // a squashed axis are no longer true Euclidean distances), so instead
      // of scaling the radii directly we evaluate in the UNSCALED frame —
      // divide the point into the deform axis before handing it to
      // sdRoundCone — and multiply the result by the SMALLEST scale factor.
      // That keeps the returned value a conservative under-estimate of the
      // true (scaled) distance in every direction, so the raymarch can never
      // step past the real shell, only under-shoot it a little.
      float scaleMin = min(axialScale, bulgeScale);
      vec3 scale = vec3(axialScale, bulgeScale, bulgeScale);

      vec3 offset = point - base;
      localPoint = vec3(dot(offset.xy, axis), dot(offset.xy, perpendicular), offset.z) / scale;
      vec3 tipOffset = tip - base;
      vec3 localTip = vec3(dot(tipOffset.xy, axis), dot(tipOffset.xy, perpendicular), tipOffset.z) / scale;

      // The taper's local radius at the point's own projection onto the
      // lobe's axis — what the hand-worked displacement scales its amplitude
      // by, so a needle tip gets needle-sized lumps instead of ones sized off
      // the whole lobe's rest radius (see lobeDistanceOrganic).
      float l2 = dot(localTip, localTip);
      float t = clamp(dot(localPoint, localTip) / max(l2, 1e-8), 0.0, 1.0);
      rLocal = mix(ra, rb, t);

      // Deliberately NOT ground-cut here. The cut belongs to the finished
      // union (see mapDistance), for three separate reasons, all of which
      // pointed the same way: it is one smoothMax per march step instead of
      // twelve; max() does not distribute over a SMOOTH min, so cutting
      // per-lobe lets the blend at a weld bulge a sliver below the plane
      // while cutting the union cannot; and clayColor() needs the UNCUT
      // per-lobe distances — clamping every lobe to the same plane term
      // flattens their ordering right at the contact patch and the colour
      // ownership there would go ambiguous and mottle the seam.
      return sdRoundCone(localPoint, vec3(0.0), localTip, ra, rb) * scaleMin;
    }

    float lobeDistance(vec3 point, int i) {
      float rLocal;
      vec3 localPoint;
      return lobeSample(point, i, rLocal, localPoint);
    }

    // The same distance with the hand-worked displacement applied — the
    // surface mapDistance's raymarch actually walks. Exact port of lobes.js's
    // shadeDistanceOrganic(): the falloff band keeps the perturbation from
    // reaching past the lobe's own near field (without it both the step
    // safety and the union's far-field behaviour degrade for no visual
    // gain), and the early-out below is what keeps the three sines cheap —
    // every march step skips them for every lobe the point isn't near, and
    // the result stays continuous because the falloff is exactly 0 at that
    // boundary, not clamped there.
    float lobeDistanceOrganic(vec3 point, int i) {
      float rLocal;
      vec3 localPoint;
      float d = lobeSample(point, i, rLocal, localPoint);
      if (!(uNoiseAmp > 0.0)) return d;
      float reach = max(rLocal * ${glsl(NOISE_FALLOFF)}, 1e-6);
      if (abs(d) >= reach) return d; // outside the band the falloff is exactly 0
      vec4 noise = uNoise[i];
      float scale = ${glsl(NOISE_FREQ)} / max(noise.w, 1e-6);
      float wave = lobeWave(localPoint * scale, noise.xyz);
      return d - uNoiseAmp * rLocal * wave * (1.0 - smoothstep(0.0, 1.0, abs(d) / reach));
    }

    // Sequential polynomial smooth-min, applied pairwise down the lobe list
    // — exactly the lab's two-lobe blend, generalized to N. Blend radius k
    // scales with each lobe's own BASE radius and join amount, so two lobes
    // that have never touched (join 0) meet with almost no blend at all: the
    // failure mode this guards against is the whole body turning to liquid.
    float mapDistance(vec3 point) {
      float d = 1000.0;
      float groundK = 0.0;
      for (int i = 0; i < MAX_LOBES; i++) {
        if (i >= uCount) break;
        float di = lobeDistanceOrganic(point, i);
        float k = max(uSquash[i].w, 1e-5); // never 0: smoothMin divides by it
        d = smoothMin(d, di, k);
        groundK = max(groundK, uLobes[i].w * 0.10);
      }
      // GROUND CUT, on the finished union. The flat contact patch this carves
      // is what actually reads as WEIGHT to a child: viewed down the -z camera
      // axis the cut face is edge-on and invisible as a plane, so what they
      // see is the silhouette itself going flat-bottomed and slightly wider
      // where it meets the table — exactly how a real ball of clay looks
      // resting on a surface versus floating in front of it. The fillet radius
      // comes from the widest lobe present, so the softness of that contact
      // edge scales with the clay rather than with the stage.
      if (uGroundOn > 0.5) d = smoothMax(d, uGround - point.y, max(groundK, 1e-4));
      // RAYMARCH STEP SAFETY. Displacing an SDF (lobeDistanceOrganic, above)
      // costs it its Lipschitz-1 property — the reported distance can now
      // shrink faster than the ray actually travels toward the surface — so a
      // march that trusts the raw number can step clean through the shell and
      // stipple the silhouette into a field of holes. Scaling every reported
      // distance down by NOISE_SAFETY keeps the march conservative; see the
      // constant's derivation in lobes.js, which the CPU trace applies in
      // exactly the same place (unionDistance's final multiply) so a pull
      // roots on the same surface this shades.
      return d * ${glsl(NOISE_SAFETY)};
    }

    // 4-tap tetrahedral normal: half the map() evaluations of central
    // differences, which matters here because every tap re-walks the whole
    // lobe list.
    vec3 clayNormal(vec3 point) {
      // The normal's finite difference MUST be wider than the tolerance the
      // march converged to. Sampled tighter than that, it differentiates the
      // residual step noise in the hit position instead of the surface, and
      // the result bands into concentric contour rings over every lobe — the
      // artifact that reads as a topographic map rather than clay. Two pixels
      // is comfortably outside the hit epsilon; the uDetail term keeps it from
      // ever sampling wider than the micro-detail it is meant to resolve.
      float eps = max(uPixel * 2.0, 0.0028 / uDetail);
      const vec2 e = vec2(1.0, -1.0);
      vec3 geometric = normalize(
        e.xyy * mapDistance(point + e.xyy * eps) +
        e.yyx * mapDistance(point + e.yyx * eps) +
        e.yxy * mapDistance(point + e.yxy * eps) +
        e.xxx * mapDistance(point + e.xxx * eps)
      );
      vec2 bumpStep = vec2(0.011 / uDetail, 0.0);
      float center = surfaceNoise(point);
      vec3 bump = vec3(
        surfaceNoise(point + bumpStep.xyy) - center,
        surfaceNoise(point + bumpStep.yxy) - center,
        surfaceNoise(point + bumpStep.yyx) - center
      );
      return normalize(geometric - bump * 0.42);
    }

    // Field-derived colour ownership at the hit point only. Each lobe's raw
    // (un-blended) distance gets a small continuous noise offset so the seam
    // isn't a mathematically perfect line, then only lobes within a narrow
    // band of the closest one contribute — never a wash across the body.
    vec3 clayColor(vec3 point) {
      float di[MAX_LOBES];
      float dMin = 1000.0;
      float dMinSecond = 1000.0;
      // Two octaves, both low frequency and generously scaled. A perfectly
      // straight seam is the single loudest "this is not clay" tell — at two
      // lobes it passes as a turned edge, but at eight or twelve the straight
      // boundaries tile the body into a beach ball. The wobble has to wander
      // across the whole join, not jitter along it, so the coarse octave
      // dominates and the amplitude is a real fraction of a lobe.
      vec3 q = point * uDetail;
      for (int i = 0; i < MAX_LOBES; i++) {
        if (i >= uCount) break;
        // Same generalized lobeDistance() mapDistance uses (base/tip round
        // cone + ground cut), so the seam always sits on the true field
        // boundary rather than some cheaper approximation of it.
        float raw = lobeDistance(point, i);
        float wobble = valueNoise(q * 1.7 + vec3(float(i) * 7.7)) * 0.68
                     + valueNoise(q * 4.4 + vec3(float(i) * 3.1)) * 0.32;
        float value = raw + (wobble - 0.5) * uRefRadius * uSeamWobble;
        di[i] = value;
        if (value < dMin) { dMinSecond = dMin; dMin = value; }
        else if (value < dMinSecond) { dMinSecond = value; }
      }
      // Antialias width belongs in screen space, not object space: one and a
      // half pixels of blend, so the seam is crisp at any lobe size.
      float band = max(uPixel * 1.6, 1e-5);
      vec3 sum = vec3(0.0);
      float weightSum = 0.0;
      for (int i = 0; i < MAX_LOBES; i++) {
        if (i >= uCount) break;
        float w = 1.0 - smoothstep(0.0, band, di[i] - dMin);
        sum += uColors[i] * w;
        weightSum += w;
      }
      vec3 base = sum / max(weightSum, 0.0001);
      // The crease darkening is a material effect, not an antialias, so it
      // keeps an object-space width — a 1.6px version would be invisible.
      float seam = 1.0 - clamp((dMinSecond - dMin) / (uRefRadius * 0.05), 0.0, 1.0);
      base *= 1.0 - seam * 0.05;
      return base;
    }

    void main() {
      if (uCount == 0) { gl_FragColor = vec4(0.0); return; }

      vec2 screen = vScreen;
      screen.x *= uAspect;

      // Cheap 2-D CAPSULE rejection (generalized from the old disc test now
      // that a lobe's base and tip can sit far apart), then an analytic z
      // range from the surviving candidates only — this, not step count, is
      // what makes 12 lobes affordable. A fatter bounding sphere around the
      // whole capsule would be simpler but is exactly the slack the
      // FILL-RATE DISCIPLINE note above warns against: it would rasterize
      // (and then march) the empty space alongside a long thin limb.
      float zEnter = -1000.0;
      float zExit = 1000.0;
      bool any = false;
      for (int i = 0; i < MAX_LOBES; i++) {
        if (i >= uCount) break;
        vec4 baseBall = uLobes[i];
        vec4 tipBall = uTips[i];
        vec2 base2 = baseBall.xy;
        vec2 tip2 = tipBall.xy;
        vec2 segment = tip2 - base2;
        float segLen2 = max(dot(segment, segment), 1e-8);
        // Closest point on the base-tip segment to this pixel, clamped to
        // the segment itself — the 2-D analogue of the round cone's own
        // closest-point test.
        float t = clamp(dot(screen - base2, segment) / segLen2, 0.0, 1.0);
        vec2 closest2D = base2 + segment * t;
        // bulgeScale clamped to >= 1.0 (never shrinks the rejection radius):
        // this bound only ever needs to be conservative, and an elongating
        // deform (negative) that thins the perpendicular cross-section must
        // not be allowed to reject pixels the actual (ground-cut, blended)
        // surface still covers.
        float bulgeScale = max(inversesqrt(clamp(1.0 - lobeDeform(i), 0.6, 1.4)), 1.0);
        // The taper's silhouette is the two discs' common TANGENT line, not
        // the straight lerp between their radii — and the tangent runs
        // strictly outside that lerp, by exactly 1/cos(alpha) where
        // sin(alpha) = (ra - rb) / |b - a|. Testing against the raw lerp
        // therefore rejects pixels the real limb still covers and bites a
        // couple of percent out of the side of every stretched tentacle,
        // which no amount of the slack terms below reliably hides at low
        // join. The correction is exact, so take it rather than pad for it.
        //
        // Exact, and DIRECTION-AGNOSTIC: the perpendicular distance from the
        // axis to that tangent is mix(ra, rb, t) / cos(alpha) whichever end is
        // the fat one, and only sin(alpha)^2 ever reaches the gain, so
        // flipping the taper (fat shoulder, thin tip — see lobes.js coneShape)
        // needs no sign change here. It does make alpha bigger, which only
        // makes this bound MORE generous, never less.
        vec2 segment3 = tipBall.xy - baseBall.xy;
        float segSpan = length(vec3(segment3, tipBall.z - baseBall.z));
        float sinTaper = segSpan > 1e-4 ? clamp((baseBall.w - tipBall.w) / segSpan, -0.999, 0.999) : 0.0;
        float taperGain = inversesqrt(max(1.0 - sinTaper * sinTaper, 1e-4));
        // The hand-worked displacement can push the surface out by up to
        // uNoiseAmp * rLocal beyond the smooth silhouette this bound was
        // originally sized for, so it has to grow by the same fraction here
        // or the capsule test rejects pixels the lumpy surface still covers
        // and the raymarch clips them to nothing.
        float rMix = mix(baseBall.w, tipBall.w, t) * taperGain * (1.0 + uNoiseAmp);
        float k = max(uSquash[i].w, 1e-5);
        // Hug the lobe. Every unit of slack here is empty space the ray has to
        // cross before it can converge, and near the silhouette that axial gap
        // blows up — which is where the step budget actually runs out.
        float rLocal = rMix * bulgeScale + k * 0.5 + uPixel * 2.0;
        vec2 delta = screen - closest2D;
        float d2 = dot(delta, delta);
        if (d2 > rLocal * rLocal) continue;
        any = true;
        // The exact z where this ray enters the lobe's bounding sphere at the
        // closest-approach point, not the front of its bounding box, which
        // would spend most of the step budget crossing empty space before
        // the march could even begin.
        float halfSpan = sqrt(max(rLocal * rLocal - d2, 0.0)); // not "half": reserved in GLSL
        float zc = mix(baseBall.z, tipBall.z, t);
        zEnter = max(zEnter, zc + halfSpan);
        zExit = min(zExit, zc - halfSpan);
      }
      if (!any || zEnter <= zExit) { gl_FragColor = vec4(0.0); return; }

      vec3 rayOrigin = vec3(screen, zEnter);
      float maxTravel = zEnter - zExit;
      // The step floor stays below the hit epsilon. The lab shipped it the
      // other way round (floor 0.006 against an eps of 0.0015), which lets a
      // nearly-converged ray jump clean over the shell and settle on a depth
      // grid. Both are in pixels so the tolerance tracks the render scale.
      float surfaceEps = uPixel * 0.5;
      float stepFloor = uPixel * 0.2;
      float travel = 0.0;
      // Antialiasing the silhouette needs the *closest approach*, not just a
      // hit flag: a ray that grazes past the body by a fraction of a pixel
      // still covers part of it. Without this the edge is a hard stair-step,
      // which no amount of DPR hides on a rounded shape this large.
      float minDist = 1e9;
      vec3 bestPoint = rayOrigin;
      vec3 point = rayOrigin;
      for (int step = 0; step < ${LOOP_CAP}; step++) {
        if (float(step) >= uSteps) break;
        point = rayOrigin - vec3(0.0, 0.0, travel);
        float dist = mapDistance(point);
        if (dist < minDist) { minDist = dist; bestPoint = point; }
        if (dist < surfaceEps) break;
        travel += max(dist, stepFloor);
        if (travel > maxTravel) break;
      }
      // The ramp starts at surfaceEps, not at zero. A ray that genuinely hit
      // still reports a closest approach anywhere up to one hit epsilon, so a
      // ramp from zero makes the entire body translucent and paints the
      // leftover residual across it as concentric rings. Only a miss — a
      // closest approach beyond the tolerance we accept as a hit — should
      // fade, and only over the pixel or so that antialiases the silhouette.
      float alpha = 1.0 - smoothstep(surfaceEps, surfaceEps + uPixel * 1.2, minDist);
      if (alpha <= 0.004) { gl_FragColor = vec4(0.0); return; }
      point = bestPoint;

      vec3 base = clayColor(point);
      vec3 normal = clayNormal(point);
      vec3 lightDirection = normalize(vec3(-0.55, 0.72, 0.78));
      float diffuse = max(dot(normal, lightDirection), 0.0);
      vec3 viewDirection = vec3(0.0, 0.0, 1.0);
      vec3 halfDirection = normalize(lightDirection + viewDirection);
      float specular = pow(max(dot(normal, halfDirection), 0.0), 20.0) * 0.2;
      float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.3);
      float grain = (surfaceNoise(point * 1.35) - 0.5) * 0.075;
      vec3 color = base * (0.69 + diffuse * 0.37 + grain);
      color += vec3(1.0, 0.93, 0.78) * specular;
      color += base * rim * 0.085;
      color *= 0.995 + (hash31(floor(point * uDetail * 115.0)) - 0.5) * 0.018;
      gl_FragColor = vec4(linearToSRGB(color), alpha);
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
 * @param {object} opts.THREE required, the game's vendored three.js
 * @param {HTMLCanvasElement} opts.canvas required
 * @param {object} opts.field required, a createLobeField() instance
 * @param {number} [opts.maxLobes]
 * @param {number} [opts.pixelRatio]
 * @param {number} [opts.dragPixelRatio]
 * @param {Element|null} [opts.shadowEl]
 * @param {number} [opts.steps]
 * @param {number} [opts.dragSteps]
 * @param {(dtMs: number) => boolean} [opts.onAnimationFrame] called at the
 *   top of the rAF-driven frame only (never from renderNow()/toDataURL()),
 *   with ms elapsed since the previous animated frame. Return true to chain
 *   one more frame; the chain hard-stops after 600 consecutive frames.
 */
export function createLobeRenderer(opts = {}) {
  const THREE = opts.THREE;
  if (!THREE) throw new Error('[lobes-three] three.js not passed — pass opts.THREE');
  const canvas = opts.canvas;
  if (!canvas) throw new Error('[lobes-three] opts.canvas is required');
  const field = opts.field;
  if (!field) throw new Error('[lobes-three] opts.field is required');

  const maxLobes = Math.max(1, Math.floor(Number(opts.maxLobes) || 12));
  const shadowEl = opts.shadowEl || null;
  const onAnimationFrame = typeof opts.onAnimationFrame === 'function' ? opts.onAnimationFrame : null;
  const ANIMATION_FRAME_CAP = 600;

  const pixelRatioCapped = Math.min(Number(opts.pixelRatio) || 1.5, HARD_DPR_CAP);
  const dragPixelRatioCapped = Math.min(Number(opts.dragPixelRatio) || 1.0, HARD_DPR_CAP);
  const stepsClamped = clamp(Math.floor(Number(opts.steps) || 96), 1, LOOP_CAP);
  const dragStepsClamped = clamp(Math.floor(Number(opts.dragSteps) || 64), 1, LOOP_CAP);
  const seamWobble = clamp(Number(opts.seamWobble ?? 0.34), 0, 1);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: 'high-performance',
    // The SDF is already smooth (MSAA on a full-screen raymarch quad buys
    // nothing); preserveDrawingBuffer trades a small, bounded per-frame cost
    // for toDataURL()/thumbnail rasterization that never races the render —
    // the documented fallback when the "read in the same task" pattern is
    // too fragile for a shared module used by callers we don't control.
    preserveDrawingBuffer: true,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = true;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  camera.position.z = 1;
  const geometry = new THREE.PlaneGeometry(2, 2);

  const lobesArray = Array.from({ length: maxLobes }, () => new THREE.Vector4(0, 0, 0, 0.0001));
  const tipsArray = Array.from({ length: maxLobes }, () => new THREE.Vector4(0, 0, 0, 0.0001));
  const colorsArray = Array.from({ length: maxLobes }, () => new THREE.Vector3(0, 0, 0));
  const squashArray = Array.from({ length: maxLobes }, () => new THREE.Vector4(0, 0, 0, 0));
  // xyz = noisePhase, w = restRadius (see the uNoise declaration in the
  // shader for why restRadius, not ra/rb, is what the wave frequency keys
  // off). Defaults to a zero phase — not a random one — so a field that
  // predates noisePhase (or omits it) renders an undisplaced lobe rather than
  // a phase hashed from nothing, which would be a different, unreproducible
  // shape from what the CPU side computes for the same lobe.
  const noiseArray = Array.from({ length: maxLobes }, () => new THREE.Vector4(0, 0, 0, 0.0001));

  const uniforms = {
    uQuad: { value: new THREE.Vector4(0, 0, 1, 1) },
    uLobes: { value: lobesArray },
    uTips: { value: tipsArray },
    uColors: { value: colorsArray },
    uSquash: { value: squashArray },
    uNoise: { value: noiseArray },
    uNoiseAmp: { value: 0 },
    uCount: { value: 0 },
    uAspect: { value: 1 },
    uSteps: { value: stepsClamped },
    uMinRadius: { value: 0.1 },
    uRefRadius: { value: 0.1 },
    uDetail: { value: 1 },
    uPixel: { value: 0.004 },
    uSeamWobble: { value: seamWobble },
    uGround: { value: 0 },
    uGroundOn: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    vertexShader: VERTEX_SHADER,
    fragmentShader: buildFragmentShader(maxLobes),
  });

  const mesh = new THREE.Mesh(geometry, material);
  // The vertex shader relocates the quad into an arbitrary clip-space sub-rect,
  // so three's frustum test — which still reasons about the untouched plane at
  // the origin — can only ever be wrong about it.
  mesh.frustumCulled = false;
  scene.add(mesh);

  const tmpColor = new THREE.Color();
  const syncPixel = new Uint8Array(4); // scratch for the cost probe's readPixels barrier

  let quality = 'full';
  let aspect = 1;
  let lastCssWidth = Math.max(1, canvas.clientWidth || 1);
  let lastCssHeight = Math.max(1, canvas.clientHeight || 1);
  let rafHandle = null;
  let settleRemaining = 0;
  let destroyed = false;
  // Consecutive frames onAnimationFrame has chained by returning true. Reset
  // to 0 the moment it returns false (a real animation stopping), so the cap
  // only ever fires on a genuine runaway, never on ordinary start/stop/start.
  let animationFrameCount = 0;
  let lastAnimationFrameTime = 0;
  let animationCapWarned = false;

  const statsState = { renders: 0, lastFrameMs: 0, totalFrameMs: 0, maxFrameMs: 0, lastRenderAt: 0, lastIntervalMs: 0 };

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

  function worldPerPixel() {
    return 2 / lastCssHeight;
  }

  function clientToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const a = rect.width / Math.max(rect.height, 1);
    return {
      x: (((clientX - rect.left) / rect.width) * 2 - 1) * a,
      y: 1 - ((clientY - rect.top) / rect.height) * 2,
    };
  }

  function worldToClient(x, y) {
    const rect = canvas.getBoundingClientRect();
    const a = rect.width / Math.max(rect.height, 1);
    return {
      x: rect.left + ((x / a + 1) / 2) * rect.width,
      y: rect.top + ((1 - y) / 2) * rect.height,
    };
  }

  /**
   * When the field has a ground plane on and at least one lobe actually
   * touches it, drive the shadow from GROUND CONTACT rather than the whole
   * bounds box — a tall lobe standing on a small footprint should cast a
   * shadow the size of its footprint, not one as wide as its whole body,
   * or the illusion of it resting ON the table (not floating in front of
   * it) falls apart. Every other case — ground off, or ground on but
   * nothing currently reaches it (e.g. mid-lift) — falls all the way
   * through to today's bounds-driven behaviour EXACTLY, unchanged: that is
   * the no-regression path this function must never break.
   */
  function updateShadow(count, shading) {
    if (!shadowEl) return;
    if (count === 0) { shadowEl.style.opacity = '0'; return; }

    const groundY = typeof field.ground === 'function' ? field.ground() : null;
    if (typeof groundY === 'number' && Number.isFinite(groundY)) {
      // Reuses the same shading() array renderNow() already pulled this
      // frame instead of asking the field to recompute it — shading() can
      // involve a real solve per lobe (lobes.js's coneShape bisection), and
      // this is called every render, so a second full pass would be wasted
      // work with no benefit.
      let minX = Infinity;
      let maxX = -Infinity;
      let totalDepth = 0;
      for (let i = 0; i < shading.length; i++) {
        const s = shading[i];
        const dy = s.y - groundY;
        const reach2 = s.radius * s.radius - dy * dy; // sqrt(max(ra^2 - (y-ground)^2, 0)), squared form
        if (reach2 <= 0) continue; // this lobe doesn't reach the plane
        const halfWidth = Math.sqrt(reach2);
        if (s.x - halfWidth < minX) minX = s.x - halfWidth;
        if (s.x + halfWidth > maxX) maxX = s.x + halfWidth;
        // Depth fraction of this lobe's own contact (0 = just grazing the
        // plane, 1 = its center is AT the plane) summed and clamped, so more
        // lobes pressed in reads as more contact without needing a second
        // full pass to find a true maximum.
        totalDepth += clamp(halfWidth / Math.max(s.radius, 1e-6), 0, 1);
      }
      if (maxX > minX) {
        const canvasWorldWidth = 2 * Math.max(aspect, 0.0001);
        const pct = clamp(((maxX - minX) / canvasWorldWidth) * 100, 4, 96);
        const contact = clamp(totalDepth, 0, 1);
        shadowEl.style.width = `${pct.toFixed(2)}%`;
        shadowEl.style.opacity = `${(0.64 + contact * 0.3).toFixed(3)}`;
        // The ground plane's own world y, not the bounds box, so the shadow
        // stays pinned to the table as the blob is lifted clear of it.
        // Camera is orthographic Y in [-1, 1] over the full canvas box, so
        // that range maps linearly onto a 0-100% `bottom` inline style.
        // `bottom` positions the element's BOTTOM edge, so half its own height
        // comes back off — otherwise the whole ellipse sits above the contact
        // line and the body reads as hovering over its own shadow, which is
        // the exact illusion this ground work exists to kill. Measured from
        // the element rather than assumed, so no CSS height is baked in here.
        const halfShadowPct = (shadowEl.offsetHeight / Math.max(lastCssHeight, 1)) * 50;
        const bottomPct = clamp(((groundY + 1) / 2) * 100 - halfShadowPct, -20, 100);
        shadowEl.style.bottom = `${bottomPct.toFixed(2)}%`;
        return;
      }
      // Ground is on, but no lobe currently reaches it (e.g. mid-lift) —
      // fall through to the bounds-driven fallback below.
    }

    // Clear any inline `bottom` a previous ground-contact frame left behind
    // — this fallback must reproduce today's exact rendering, which never
    // touches `bottom` at all and leaves the CSS default in charge.
    shadowEl.style.bottom = '';
    const bounds = field.bounds();
    if (!bounds) { shadowEl.style.opacity = '0'; return; }
    const canvasWorldWidth = 2 * Math.max(aspect, 0.0001);
    const pct = clamp((bounds.width / canvasWorldWidth) * 100, 4, 96);
    const contact = field.maxContact();
    shadowEl.style.width = `${pct.toFixed(2)}%`;
    shadowEl.style.opacity = `${(0.64 + contact * 0.3).toFixed(3)}`;
  }

  function recordStats(dt) {
    const now = performance.now();
    statsState.renders += 1;
    statsState.lastFrameMs = dt;
    statsState.totalFrameMs += dt;
    if (dt > statsState.maxFrameMs) statsState.maxFrameMs = dt;
    statsState.lastIntervalMs = statsState.lastRenderAt ? now - statsState.lastRenderAt : 0;
    statsState.lastRenderAt = now;
  }

  /**
   * Synchronous single render. Never NaN on an empty field — it just clears.
   *
   * `sync: true` blocks on gl.finish() before stopping the clock. Without it
   * the measured time is only how long it took to *submit* the draw — the
   * fragment work this module exists to worry about happens after render()
   * has already returned, so an unsynced number reads the same at 12 lobes as
   * at 2 and is worse than no probe at all. Costs a pipeline stall, so it is
   * opt-in and never used by the interactive path.
   */
  function renderNow({ sync = false } = {}) {
    if (destroyed) return;
    const t0 = performance.now();
    const shading = field.shading();
    const count = Math.min(shading.length, maxLobes);
    uniforms.uCount.value = count;

    // Defensive `field.ground?.()`: the rasterizer path shares this same
    // renderer with a field that may not implement ground() at all, and that
    // field must still render — never throw, just render with ground off.
    const groundY = typeof field.ground === 'function' ? field.ground() : null;
    if (typeof groundY === 'number' && Number.isFinite(groundY)) {
      uniforms.uGround.value = groundY;
      uniforms.uGroundOn.value = 1;
    } else {
      uniforms.uGroundOn.value = 0;
    }

    let rendered = false;
    if (count > 0) {
      let minRadius = Infinity;
      let maxRadius = 0;
      let totalRestRadius = 0;
      // One amplitude for the whole creature (see uNoiseAmp in the shader),
      // read off the first lobe and left untouched if a caller's field
      // doesn't emit noiseAmp at all — defaulting to 0 here would silently
      // turn the displacement off for every field except the one this frame
      // happens to be the first entry of, which is not what "leave it alone"
      // means for a rasterizer-only field sharing this same renderer.
      if (shading[0] && shading[0].noiseAmp != null) uniforms.uNoiseAmp.value = shading[0].noiseAmp;
      for (let i = 0; i < count; i++) {
        const s = shading[i];
        lobesArray[i].set(s.x, s.y, s.z, s.radius);
        tipsArray[i].set(s.tipX, s.tipY, s.tipZ, s.tipRadius);
        tmpColor.set(s.color);
        colorsArray[i].set(tmpColor.r, tmpColor.g, tmpColor.b);
        squashArray[i].set(s.deformX, s.deformY, s.deform, s.blend);
        // Defensive: a caller's shading() entry with no noisePhase (an older
        // field, or noise deliberately unimplemented) gets a zero phase, not
        // a thrown error — see the noiseArray comment above for why zero
        // rather than a made-up one.
        const phase = s.noisePhase;
        noiseArray[i].set(phase ? phase.x : 0, phase ? phase.y : 0, phase ? phase.z : 0, s.restRadius);
        if (s.radius < minRadius) minRadius = s.radius;
        if (s.tipRadius < minRadius) minRadius = s.tipRadius;
        if (s.radius > maxRadius) maxRadius = s.radius;
        if (s.tipRadius > maxRadius) maxRadius = s.tipRadius;
        // restRadius, NOT ra — a stretched limb's ra/rb shrink and swell as
        // it's pulled, but its restRadius never changes, and keying the
        // grain/swirl scale off ra would make the clay's own texture
        // visibly resize while being dragged, which is the tell that kills
        // the illusion of it being a fixed lump of material.
        totalRestRadius += s.restRadius;
      }
      const refRadius = Math.max(totalRestRadius / count, 1e-4);
      uniforms.uMinRadius.value = minRadius;
      uniforms.uRefRadius.value = refRadius;
      // Keeps grain, swirl and seam wobble the same size *relative to a lobe*
      // no matter how big the stage is or how small the child's balls are.
      uniforms.uDetail.value = LAB_REFERENCE_RADIUS / refRadius;
      uniforms.uPixel.value = 2 / Math.max(renderer.domElement.height, 1);

      // maxRadius already folds in both ra and rb (the loop above tracks
      // the larger of the two per lobe), so a stretched limb's fatter end —
      // base or tip, whichever it is — still gets enough quad padding for
      // its own antialiasing margin. NOISE_AMP is folded into the padding
      // fraction itself (not added as a separate term) because the
      // displacement's reach scales with the lobe, exactly like
      // QUAD_PAD_FACTOR's own margin does — a lump grown at the widest
      // point in the field must never be clipped by a quad sized for the
      // smooth surface underneath it.
      const pad = maxRadius * (QUAD_PAD_FACTOR + NOISE_AMP) + QUAD_PAD_BASE;
      const bounds = field.bounds({ pad });
      if (bounds && aspect > 0) {
        const ndcMinX = bounds.minX / aspect;
        const ndcMaxX = bounds.maxX / aspect;
        const halfX = Math.max((ndcMaxX - ndcMinX) / 2, 0.001);
        const halfY = Math.max((bounds.maxY - bounds.minY) / 2, 0.001);
        uniforms.uQuad.value.set(
          (ndcMinX + ndcMaxX) / 2,
          (bounds.minY + bounds.maxY) / 2,
          halfX,
          halfY,
        );
        renderer.render(scene, camera);
        rendered = true;
      }
    }
    if (!rendered) renderer.clear();
    if (sync) {
      // gl.finish() is not a real barrier in Chrome — it returns across the
      // command buffer long before the GPU is done, and reports ~0.1ms for
      // work that cannot possibly be that cheap. Reading a single pixel back
      // is a true sync point, so this is what makes the probe trustworthy.
      const gl = renderer.getContext();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPixel);
    }
    updateShadow(count, shading);
    recordStats(performance.now() - t0);
  }

  function scheduleFrame() {
    if (destroyed || rafHandle !== null) return;
    rafHandle = requestAnimationFrame((now) => {
      rafHandle = null;
      // onAnimationFrame runs at the TOP of this rAF-driven callback, and
      // ONLY here — never from renderNow() directly — so toDataURL() and
      // the sync cost probe (both call renderNow() straight, off this rAF
      // path) can never advance an animation a frame it wasn't asked to.
      let chainAnimation = false;
      if (onAnimationFrame) {
        const dtMs = lastAnimationFrameTime ? now - lastAnimationFrameTime : 0;
        lastAnimationFrameTime = now;
        const wantsMore = !!onAnimationFrame(dtMs);
        if (wantsMore) {
          animationFrameCount += 1;
          if (animationFrameCount > ANIMATION_FRAME_CAP) {
            // Hard stop: whatever is animating has been running for 600
            // straight frames without ever settling, which on any real
            // interaction (a squash settle, an idle wobble) is a bug, not
            // an intentional loop — warn once so it's diagnosable, then
            // let this chain die so a stuck callback can't pin the tab at
            // 60fps forever.
            if (!animationCapWarned) {
              animationCapWarned = true;
              console.warn('[lobes-three] onAnimationFrame chained past the 600-frame cap; stopping the animation chain.');
            }
            // Reset the counter as well as breaking the chain: the cap is a
            // circuit breaker against one runaway animation, not a permanent
            // ban — a later, legitimate settle must still be allowed to run.
            animationFrameCount = 0;
            lastAnimationFrameTime = 0;
          } else {
            chainAnimation = true;
          }
        } else {
          animationFrameCount = 0;
          // Forget the clock too, so the next animation's first dt is 0 rather
          // than however many seconds the stage happened to sit idle — a stale
          // dt would make a settle bounce jump straight to its end pose.
          lastAnimationFrameTime = 0;
        }
      }
      renderNow();
      if (settleRemaining > 0) {
        settleRemaining -= 1;
        scheduleFrame();
      } else if (chainAnimation) {
        scheduleFrame();
      }
    });
  }

  /** Coalesces into at most one pending rAF. There is no continuous loop. */
  function requestRender() {
    if (destroyed) return;
    scheduleFrame();
  }

  /** Chains N extra frames after the next one — the fix for interaction-patterns #12. */
  function settle(frames = 2) {
    if (destroyed) return;
    settleRemaining = Math.max(settleRemaining, Math.max(0, Math.floor(frames)));
    scheduleFrame();
  }

  function setQuality(mode) {
    if (destroyed || (mode !== 'drag' && mode !== 'full') || mode === quality) return;
    quality = mode;
    uniforms.uSteps.value = mode === 'drag' ? dragStepsClamped : stepsClamped;
    resizeBuffer();
    requestRender();
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
      lastRenderAt: statsState.lastRenderAt,
      pixelRatio: renderer.getPixelRatio(),
      bufferWidth: renderer.domElement.width,
      bufferHeight: renderer.domElement.height,
      lobeCount: field.count(),
    };
  }

  function resetStats() {
    statsState.renders = 0;
    statsState.lastFrameMs = 0;
    statsState.totalFrameMs = 0;
    statsState.maxFrameMs = 0;
    statsState.lastRenderAt = 0;
    statsState.lastIntervalMs = 0;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
    settleRemaining = 0;
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
  }

  return {
    setViewport,
    worldPerPixel,
    clientToWorld,
    worldToClient,
    requestRender,
    renderNow,
    settle,
    setQuality,
    toDataURL,
    stats,
    resetStats,
    destroy,
  };
}
