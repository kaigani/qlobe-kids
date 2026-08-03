const EPSILON = 1e-8;

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function normalizeVertex(vertex, radius) {
  const length = Math.hypot(vertex[0], vertex[1], vertex[2]) || 1;
  return [vertex[0] / length * radius, vertex[1] / length * radius, vertex[2] / length * radius];
}

/** Build a welded icosphere without depending on three.js geometry helpers. */
export function createIcosphere(detail = 3, radius = 1) {
  const phi = (1 + Math.sqrt(5)) / 2;
  let vertices = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ].map((vertex) => normalizeVertex(vertex, radius));

  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  for (let level = 0; level < detail; level += 1) {
    const midpointCache = new Map();
    const midpoint = (first, second) => {
      const low = Math.min(first, second);
      const high = Math.max(first, second);
      const key = `${low}:${high}`;
      if (midpointCache.has(key)) return midpointCache.get(key);
      const a = vertices[first];
      const b = vertices[second];
      const index = vertices.length;
      vertices.push(normalizeVertex([
        (a[0] + b[0]) * 0.5,
        (a[1] + b[1]) * 0.5,
        (a[2] + b[2]) * 0.5,
      ], radius));
      midpointCache.set(key, index);
      return index;
    };

    const subdivided = [];
    faces.forEach(([a, b, c]) => {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      subdivided.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    });
    faces = subdivided;
  }

  const positions = new Float32Array(vertices.length * 3);
  vertices.forEach((vertex, index) => positions.set(vertex, index * 3));
  const indices = new Uint16Array(faces.length * 3);
  faces.forEach((face, index) => indices.set(face, index * 3));
  return { positions, indices };
}

function signedVolume(positions, indices) {
  let volume = 0;
  for (let offset = 0; offset < indices.length; offset += 3) {
    const ia = indices[offset] * 3;
    const ib = indices[offset + 1] * 3;
    const ic = indices[offset + 2] * 3;
    const ax = positions[ia];
    const ay = positions[ia + 1];
    const az = positions[ia + 2];
    const bx = positions[ib];
    const by = positions[ib + 1];
    const bz = positions[ib + 2];
    const cx = positions[ic];
    const cy = positions[ic + 1];
    const cz = positions[ic + 2];
    volume += ax * (by * cz - bz * cy)
      + ay * (bz * cx - bx * cz)
      + az * (bx * cy - by * cx);
  }
  return volume / 6;
}

function buildEdges(indices, positions) {
  const pairs = [];
  const seen = new Set();
  const add = (first, second) => {
    const low = Math.min(first, second);
    const high = Math.max(first, second);
    const key = `${low}:${high}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push(low, high);
  };
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset];
    const b = indices[offset + 1];
    const c = indices[offset + 2];
    add(a, b);
    add(b, c);
    add(c, a);
  }

  const edgeIndices = new Uint16Array(pairs);
  const edgeRest = new Float32Array(pairs.length / 2);
  for (let edge = 0; edge < edgeRest.length; edge += 1) {
    const first = edgeIndices[edge * 2] * 3;
    const second = edgeIndices[edge * 2 + 1] * 3;
    edgeRest[edge] = Math.hypot(
      positions[first] - positions[second],
      positions[first + 1] - positions[second + 1],
      positions[first + 2] - positions[second + 2],
    );
  }
  return { edgeIndices, edgeRest };
}

/**
 * A deliberately bounded surface-PBD plastic sphere.
 *
 * It is a local-deformation experiment, not a topology or fusion solver.
 */
export function createPlasticSphere(options = {}) {
  const radius = options.radius ?? 1;
  const detail = options.detail ?? 3;
  const center = new Float32Array(options.center ?? [0, 0, 0]);
  const mesh = createIcosphere(detail, radius);
  const positions = mesh.positions;
  for (let index = 0; index < positions.length; index += 3) {
    positions[index] += center[0];
    positions[index + 1] += center[1];
    positions[index + 2] += center[2];
  }

  const initialPositions = positions.slice();
  const previousPositions = positions.slice();
  const velocities = new Float32Array(positions.length);
  const gradients = new Float32Array(positions.length);
  const { edgeIndices, edgeRest } = buildEdges(mesh.indices, positions);
  const edgeOriginal = edgeRest.slice();
  const spokeRest = new Float32Array(positions.length / 3);
  for (let vertex = 0; vertex < spokeRest.length; vertex += 1) {
    const offset = vertex * 3;
    spokeRest[vertex] = Math.hypot(
      positions[offset] - center[0],
      positions[offset + 1] - center[1],
      positions[offset + 2] - center[2],
    );
  }
  const spokeOriginal = spokeRest.slice();
  const targetVolume = Math.abs(signedVolume(positions, mesh.indices));

  const settings = {
    yield: options.yield ?? 0.055,
    creep: options.creep ?? 7.5,
    recovery: options.recovery ?? 0,
    edgeStiffness: options.edgeStiffness ?? 0.82,
    spokeStiffness: options.spokeStiffness ?? 0.22,
    volumeStiffness: options.volumeStiffness ?? 0.72,
    velocityDamping: options.velocityDamping ?? 0.86,
    maxGrab: options.maxGrab ?? 0.48,
    substeps: options.substeps ?? 3,
    iterations: options.iterations ?? 6,
  };

  let grab = null;
  let stillTime = 0;
  let settled = true;
  let lastMaxSpeed = 0;

  function applyGrab(strength = 1) {
    if (!grab) return;
    for (let vertex = 0; vertex < grab.weights.length; vertex += 1) {
      const weight = grab.weights[vertex];
      if (weight <= 0) continue;
      const offset = vertex * 3;
      const alpha = Math.min(0.94, strength * (0.18 + weight * 0.76));
      positions[offset] += (
        grab.starts[offset] + grab.displacement[0] * weight - positions[offset]
      ) * alpha;
      positions[offset + 1] += (
        grab.starts[offset + 1] + grab.displacement[1] * weight - positions[offset + 1]
      ) * alpha;
      positions[offset + 2] += (
        grab.starts[offset + 2] + grab.displacement[2] * weight - positions[offset + 2]
      ) * alpha;
    }
  }

  function updatePlasticity(dt) {
    const creepAlpha = 1 - Math.exp(-settings.creep * dt);
    const recoveryAlpha = 1 - Math.exp(-settings.recovery * dt);
    for (let edge = 0; edge < edgeRest.length; edge += 1) {
      const first = edgeIndices[edge * 2] * 3;
      const second = edgeIndices[edge * 2 + 1] * 3;
      const length = Math.hypot(
        positions[first] - positions[second],
        positions[first + 1] - positions[second + 1],
        positions[first + 2] - positions[second + 2],
      );
      const rest = edgeRest[edge];
      if (Math.abs(length - rest) / Math.max(rest, EPSILON) > settings.yield) {
        edgeRest[edge] += (length - rest) * creepAlpha;
      }
      edgeRest[edge] += (edgeOriginal[edge] - edgeRest[edge]) * recoveryAlpha;
      edgeRest[edge] = clamp(edgeRest[edge], edgeOriginal[edge] * 0.72, edgeOriginal[edge] * 1.38);
    }

    for (let vertex = 0; vertex < spokeRest.length; vertex += 1) {
      const offset = vertex * 3;
      const length = Math.hypot(
        positions[offset] - center[0],
        positions[offset + 1] - center[1],
        positions[offset + 2] - center[2],
      );
      const rest = spokeRest[vertex];
      if (Math.abs(length - rest) / Math.max(rest, EPSILON) > settings.yield) {
        spokeRest[vertex] += (length - rest) * creepAlpha;
      }
      spokeRest[vertex] += (spokeOriginal[vertex] - spokeRest[vertex]) * recoveryAlpha;
      spokeRest[vertex] = clamp(spokeRest[vertex], spokeOriginal[vertex] * 0.6, spokeOriginal[vertex] * 1.5);
    }
  }

  function solveEdges() {
    for (let edge = 0; edge < edgeRest.length; edge += 1) {
      const first = edgeIndices[edge * 2] * 3;
      const second = edgeIndices[edge * 2 + 1] * 3;
      const dx = positions[first] - positions[second];
      const dy = positions[first + 1] - positions[second + 1];
      const dz = positions[first + 2] - positions[second + 2];
      const length = Math.hypot(dx, dy, dz);
      if (length < EPSILON) continue;
      const correction = (length - edgeRest[edge]) / length * 0.5 * settings.edgeStiffness;
      positions[first] -= dx * correction;
      positions[first + 1] -= dy * correction;
      positions[first + 2] -= dz * correction;
      positions[second] += dx * correction;
      positions[second + 1] += dy * correction;
      positions[second + 2] += dz * correction;
    }
  }

  function solveSpokes() {
    for (let vertex = 0; vertex < spokeRest.length; vertex += 1) {
      const offset = vertex * 3;
      const dx = positions[offset] - center[0];
      const dy = positions[offset + 1] - center[1];
      const dz = positions[offset + 2] - center[2];
      const length = Math.hypot(dx, dy, dz);
      if (length < EPSILON) continue;
      const correction = (length - spokeRest[vertex]) / length * settings.spokeStiffness;
      positions[offset] -= dx * correction;
      positions[offset + 1] -= dy * correction;
      positions[offset + 2] -= dz * correction;
    }
  }

  function solveVolume() {
    gradients.fill(0);
    let volume = 0;
    const indices = mesh.indices;
    for (let offset = 0; offset < indices.length; offset += 3) {
      const ia = indices[offset] * 3;
      const ib = indices[offset + 1] * 3;
      const ic = indices[offset + 2] * 3;
      const ax = positions[ia];
      const ay = positions[ia + 1];
      const az = positions[ia + 2];
      const bx = positions[ib];
      const by = positions[ib + 1];
      const bz = positions[ib + 2];
      const cx = positions[ic];
      const cy = positions[ic + 1];
      const cz = positions[ic + 2];
      volume += ax * (by * cz - bz * cy)
        + ay * (bz * cx - bx * cz)
        + az * (bx * cy - by * cx);

      gradients[ia] += (by * cz - bz * cy) / 6;
      gradients[ia + 1] += (bz * cx - bx * cz) / 6;
      gradients[ia + 2] += (bx * cy - by * cx) / 6;
      gradients[ib] += (cy * az - cz * ay) / 6;
      gradients[ib + 1] += (cz * ax - cx * az) / 6;
      gradients[ib + 2] += (cx * ay - cy * ax) / 6;
      gradients[ic] += (ay * bz - az * by) / 6;
      gradients[ic + 1] += (az * bx - ax * bz) / 6;
      gradients[ic + 2] += (ax * by - ay * bx) / 6;
    }
    volume /= 6;
    let denominator = 0;
    for (let index = 0; index < gradients.length; index += 3) {
      denominator += gradients[index] * gradients[index]
        + gradients[index + 1] * gradients[index + 1]
        + gradients[index + 2] * gradients[index + 2];
    }
    if (denominator < EPSILON) return;
    const correction = -(Math.abs(volume) - targetVolume) / denominator * settings.volumeStiffness;
    const orientation = volume < 0 ? -1 : 1;
    for (let index = 0; index < positions.length; index += 1) {
      positions[index] += gradients[index] * correction * orientation;
    }
  }

  function integrate(dt) {
    previousPositions.set(positions);
    for (let index = 0; index < positions.length; index += 1) {
      positions[index] += velocities[index] * dt;
    }
    applyGrab(1);
    updatePlasticity(dt);
    for (let iteration = 0; iteration < settings.iterations; iteration += 1) {
      solveEdges();
      solveSpokes();
      solveVolume();
      applyGrab(iteration === settings.iterations - 1 ? 0.92 : 0.52);
    }

    lastMaxSpeed = 0;
    for (let index = 0; index < positions.length; index += 1) {
      velocities[index] = (positions[index] - previousPositions[index]) / dt * settings.velocityDamping;
      lastMaxSpeed = Math.max(lastMaxSpeed, Math.abs(velocities[index]));
    }
  }

  function step(frameDt) {
    const dt = clamp(frameDt || 1 / 60, 1 / 240, 1 / 30);
    const substeps = Math.max(1, Math.round(settings.substeps));
    const subDt = dt / substeps;
    for (let substep = 0; substep < substeps; substep += 1) integrate(subDt);
    if (!grab && lastMaxSpeed < 0.012) stillTime += dt;
    else stillTime = 0;
    settled = !grab && stillTime > 0.28;
    return !settled;
  }

  function beginGrab(point, optionsForGrab = {}) {
    const brushRadius = optionsForGrab.brushRadius ?? radius * 0.58;
    const weights = new Float32Array(positions.length / 3);
    let affected = 0;
    for (let vertex = 0; vertex < weights.length; vertex += 1) {
      const offset = vertex * 3;
      const distance = Math.hypot(
        positions[offset] - point[0],
        positions[offset + 1] - point[1],
        positions[offset + 2] - point[2],
      );
      if (distance >= brushRadius) continue;
      const amount = 1 - distance / brushRadius;
      weights[vertex] = amount * amount * (3 - 2 * amount);
      affected += 1;
    }
    grab = {
      starts: positions.slice(),
      weights,
      displacement: new Float32Array(3),
      affected,
    };
    settled = false;
    stillTime = 0;
    return affected;
  }

  function setGrabDisplacement(displacement) {
    if (!grab) return;
    const length = Math.hypot(displacement[0], displacement[1], displacement[2]);
    const maximum = radius * settings.maxGrab;
    const scale = length > maximum ? maximum / length : 1;
    grab.displacement[0] = displacement[0] * scale;
    grab.displacement[1] = displacement[1] * scale;
    grab.displacement[2] = displacement[2] * scale;
    settled = false;
  }

  function releaseGrab() {
    grab = null;
    stillTime = 0;
    settled = false;
  }

  function reset() {
    positions.set(initialPositions);
    previousPositions.set(initialPositions);
    velocities.fill(0);
    edgeRest.set(edgeOriginal);
    spokeRest.set(spokeOriginal);
    grab = null;
    stillTime = 0;
    settled = true;
    lastMaxSpeed = 0;
  }

  function setSettings(next = {}) {
    Object.keys(settings).forEach((key) => {
      if (Number.isFinite(next[key])) settings[key] = next[key];
    });
    settled = false;
    stillTime = 0;
  }

  function metrics() {
    const volume = Math.abs(signedVolume(positions, mesh.indices));
    let invertedTriangles = 0;
    for (let face = 0; face < mesh.indices.length; face += 3) {
      const ia = mesh.indices[face] * 3;
      const ib = mesh.indices[face + 1] * 3;
      const ic = mesh.indices[face + 2] * 3;
      const abx = positions[ib] - positions[ia];
      const aby = positions[ib + 1] - positions[ia + 1];
      const abz = positions[ib + 2] - positions[ia + 2];
      const acx = positions[ic] - positions[ia];
      const acy = positions[ic + 1] - positions[ia + 1];
      const acz = positions[ic + 2] - positions[ia + 2];
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      const cx = (positions[ia] + positions[ib] + positions[ic]) / 3 - center[0];
      const cy = (positions[ia + 1] + positions[ib + 1] + positions[ic + 1]) / 3 - center[1];
      const cz = (positions[ia + 2] + positions[ib + 2] + positions[ic + 2]) / 3 - center[2];
      if (nx * cx + ny * cy + nz * cz <= 0) invertedTriangles += 1;
    }
    let plasticStrain = 0;
    for (let edge = 0; edge < edgeRest.length; edge += 1) {
      plasticStrain += Math.abs(edgeRest[edge] - edgeOriginal[edge]) / edgeOriginal[edge];
    }
    for (let spoke = 0; spoke < spokeRest.length; spoke += 1) {
      plasticStrain += Math.abs(spokeRest[spoke] - spokeOriginal[spoke]) / spokeOriginal[spoke];
    }
    plasticStrain /= edgeRest.length + spokeRest.length;
    return {
      vertices: positions.length / 3,
      triangles: mesh.indices.length / 3,
      constraints: edgeRest.length + spokeRest.length + 1,
      volume,
      targetVolume,
      volumeDriftPercent: Math.abs(volume - targetVolume) / targetVolume * 100,
      plasticStrain,
      invertedTriangles,
      maxSpeed: lastMaxSpeed,
      affected: grab?.affected ?? 0,
      settled,
      grabbed: Boolean(grab),
    };
  }

  return {
    positions,
    indices: mesh.indices,
    center,
    settings,
    step,
    beginGrab,
    setGrabDisplacement,
    releaseGrab,
    reset,
    setSettings,
    metrics,
  };
}
