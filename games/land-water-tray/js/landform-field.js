// Field-space landform rules for Land Explorer.  This module deliberately
// knows nothing about canvases, pointers, or the DOM: the game maps pointer
// coordinates to normalized points and renders the supplied HeightfieldClay.

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const LAND_HEIGHT = .72;

export const CHALLENGES = Object.freeze({
  island: Object.freeze({ tool: 'pour', label: 'Island', clue: 'Make one piece of land with water all around it.' }),
  lake: Object.freeze({ tool: 'scoop', label: 'Lake', clue: 'Scoop water into land so it is surrounded.' }),
  peninsula: Object.freeze({ tool: 'pour', label: 'Peninsula', clue: 'Grow land from the left coast into the water.' }),
  bay: Object.freeze({ tool: 'scoop', label: 'Bay', clue: 'Scoop water in from the right side of the land.' }),
});

function assertKind(kind) {
  if (!Object.hasOwn(CHALLENGES, kind)) throw new RangeError(`Unknown landform kind: ${kind}`);
}

function assertSize(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 5 || height < 5) {
    throw new RangeError('Landform fields need integer width and height of at least 5 cells.');
  }
}

/**
 * Returns a deterministic binary land blueprint.  A value of 1 means land;
 * 0 means water. It is useful for rendering a ghost, scoring, and tests.
 */
export function targetMask(kind, width, height) {
  assertKind(kind);
  assertSize(width, height);
  const mask = new Uint8Array(width * height);
  const set = (x, y, land) => { if (land) mask[y * width + x] = 1; };
  const cx = (width - 1) * .5;
  const cy = (height - 1) * .5;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x - cx) / width;
      const ny = (y - cy) / height;
      let land = false;
      if (kind === 'island') {
        land = (nx / .225) ** 2 + (ny / .235) ** 2 <= 1;
      } else if (kind === 'lake') {
        const outer = (nx / .39) ** 2 + (ny / .39) ** 2 <= 1;
        const hole = (nx / .17) ** 2 + (ny / .165) ** 2 < 1;
        land = outer && !hole;
      } else if (kind === 'peninsula') {
        const t = clamp((x / width - .16) / .58, 0, 1);
        const mainland = x / width <= .235 && Math.abs(ny) <= .37;
        const arm = x / width >= .15 && x / width <= .74 && Math.abs(ny) <= .225 - t * .145;
        land = mainland || arm;
      } else { // bay
        const mainland = ((x / width - .42) / .43) ** 2 + (ny / .43) ** 2 <= 1;
        const inlet = x / width >= .43 && Math.abs(ny) < .095 + (x / width - .43) * .13;
        land = mainland && !inlet;
      }
      set(x, y, land);
    }
  }
  return mask;
}

const recipe = {
  island: { pour: { radius: .115, peak: 4.8 }, scoop: { radius: .09, depth: .7 } },
  lake: { pour: { radius: .085, peak: 4.1 }, scoop: { radius: .10, depth: 1.1 } },
  peninsula: { pour: { radius: .105, peak: 4.8 }, scoop: { radius: .085, depth: .75 } },
  bay: { pour: { radius: .105, peak: 4.6 }, scoop: { radius: .10, depth: 1.12 } },
};

/** Seed the deliberately incomplete starting substrate for one challenge. */
export function resetLandform(field, kind) {
  assertKind(kind);
  field.clear();
  const { width, height } = field;
  if (kind === 'lake') {
    field.addSlab(width * .5, height * .5, width * .40, height * .40, 4.8);
  } else if (kind === 'peninsula') {
    field.addSlab(width * .13, height * .5, width * .20, height * .39, 4.8);
  } else if (kind === 'bay') {
    field.addSlab(width * .42, height * .5, width * .43, height * .43, 4.8);
  }
  // Island intentionally starts as all water. A small settle avoids hard
  // reset edges without allowing initial substrate to solve its own puzzle.
  if (kind !== 'island') field.relax(2, .035, .16);
}

function normalizedPath(field, points) {
  if (!Array.isArray(points)) throw new TypeError('normalizedPoints must be an array of {x, y} points.');
  return points.map((point) => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new TypeError('Each normalized point needs finite x and y values.');
    }
    return {
      x: 1 + clamp(point.x, 0, 1) * (field.width - 3),
      y: 1 + clamp(point.y, 0, 1) * (field.height - 3),
    };
  });
}

/**
 * Applies one child stroke. Points are normalized (0..1) and are clamped
 * before reaching the solver, so a pointer that strays off the tray cannot
 * write beyond its safe inner border.
 */
export function applyLandStroke(field, kind, tool, normalizedPoints) {
  assertKind(kind);
  if (tool !== 'pour' && tool !== 'scoop') throw new RangeError(`Unknown landform tool: ${tool}`);
  const points = normalizedPath(field, normalizedPoints);
  if (points.length === 0) return false;
  const tune = recipe[kind][tool];
  const scale = Math.min(field.width, field.height);
  let changed;
  if (tool === 'pour') {
    changed = field.depositPath(points, { radius: scale * tune.radius, peak: tune.peak, spacing: 1.6 });
  } else {
    changed = field.pressPath(points, { radius: scale * tune.radius, depth: tune.depth, spacing: 1.8 });
  }
  if (changed) field.relax(1, .025, .22);
  return changed;
}

function components(binary, width, height, wanted) {
  const labels = new Int32Array(binary.length);
  labels.fill(-1);
  const found = [];
  for (let start = 0; start < binary.length; start += 1) {
    if (binary[start] !== wanted || labels[start] !== -1) continue;
    const queue = [start];
    labels[start] = found.length;
    let size = 0; let minX = width; let maxX = -1; let minY = height; let maxY = -1;
    let touchesEdge = false; let touchesLeft = false; let touchesRight = false;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor]; const x = index % width; const y = Math.floor(index / width);
      size += 1; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;
      if (x === 0) touchesLeft = true;
      if (x === width - 1) touchesRight = true;
      const neighbours = [index - 1, index + 1, index - width, index + width];
      for (const next of neighbours) {
        const nx = next % width;
        if (next < 0 || next >= binary.length || (nx !== x - 1 && nx !== x + 1 && next !== index - width && next !== index + width)) continue;
        if (binary[next] === wanted && labels[next] === -1) { labels[next] = labels[start]; queue.push(next); }
      }
    }
    found.push({ size, minX, maxX, minY, maxY, touchesEdge, touchesLeft, touchesRight });
  }
  return found;
}

function hasLandNear(land, width, height, x, y, radius = 2) {
  for (let yy = Math.max(0, y - radius); yy <= Math.min(height - 1, y + radius); yy += 1) {
    for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx += 1) {
      if (land[yy * width + xx]) return true;
    }
  }
  return false;
}

// Unlike the outside ocean (which naturally wraps around a mainland), a bay
// has a *specific* pocket of water that can be reached from the right. Start
// the flood inside that pocket so surrounding ocean water cannot impersonate
// an inlet before the child has scooped one.
function waterPocketReachesRight(land, width, height) {
  const startX = Math.round(width * .55);
  const startY = Math.round((height - 1) * .5);
  const start = startY * width + startX;
  if (land[start]) return false;
  const visited = new Uint8Array(land.length);
  const queue = [start];
  visited[start] = 1;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor]; const x = index % width; const y = Math.floor(index / width);
    if (x === width - 1) return true;
    const next = [index - 1, index + 1, index - width, index + width];
    for (const neighbour of next) {
      const nx = neighbour % width;
      if (neighbour < 0 || neighbour >= land.length || (nx !== x - 1 && nx !== x + 1 && neighbour !== index - width && neighbour !== index + width)) continue;
      if (!land[neighbour] && !visited[neighbour]) { visited[neighbour] = 1; queue.push(neighbour); }
    }
  }
  return false;
}

/**
 * Measures semantic landform evidence. targetCoverage is required-land
 * coverage; preserveCoverage is required-water preservation; spillRatio is
 * the fraction of present land outside the blueprint. All values are plain
 * numbers/strings so this result can be posted from a worker if needed.
 */
export function measureLandform(field, kind) {
  assertKind(kind);
  const { width, height, cells } = field;
  assertSize(width, height);
  const target = targetMask(kind, width, height);
  const land = new Uint8Array(cells.length);
  let targetLand = 0; let targetHit = 0; let targetWater = 0; let waterKept = 0; let allLand = 0; let spill = 0; let edgeContacts = 0;
  for (let i = 0; i < cells.length; i += 1) {
    const present = Number.isFinite(cells[i]) && cells[i] >= LAND_HEIGHT;
    if (present) { land[i] = 1; allLand += 1; }
    if (target[i]) { targetLand += 1; if (present) targetHit += 1; }
    else { targetWater += 1; if (!present) waterKept += 1; else spill += 1; }
  }
  for (let x = 0; x < width; x += 1) edgeContacts += land[x] + land[(height - 1) * width + x];
  for (let y = 1; y < height - 1; y += 1) edgeContacts += land[y * width] + land[y * width + width - 1];
  const landGroups = components(land, width, height, 1);
  const waterGroups = components(land, width, height, 0);
  const waterHoles = waterGroups.filter((group) => !group.touchesEdge).length;
  const targetCoverage = targetLand ? targetHit / targetLand : 0;
  const preserveCoverage = targetWater ? waterKept / targetWater : 1;
  const spillRatio = allLand ? spill / allLand : 0;
  const mainLand = landGroups.reduce((largest, group) => group.size > largest.size ? group : largest, { size: 0, minX: width, maxX: -1 });
  const centreY = Math.round((height - 1) * .5);
  const peninsulaAnchored = hasLandNear(land, width, height, Math.round(width * .10), centreY, 3);
  const peninsulaReach = mainLand.maxX >= Math.floor(width * .57);
  const bayBounded = hasLandNear(land, width, height, Math.round(width * .38), centreY, 2)
    && hasLandNear(land, width, height, Math.round(width * .58), Math.round(height * .28), 3)
    && hasLandNear(land, width, height, Math.round(width * .58), Math.round(height * .72), 3);
  const bayOpen = waterPocketReachesRight(land, width, height);

  let complete = false;
  let hint = CHALLENGES[kind].clue;
  if (kind === 'island') {
    complete = landGroups.length === 1 && mainLand.size >= width * height * .045 && edgeContacts === 0 && targetCoverage >= .34 && spillRatio <= .60;
    hint = complete ? 'That land is an island!' : edgeContacts ? 'Keep the island away from every edge.' : 'Make one round land mass in the water.';
  } else if (kind === 'lake') {
    complete = landGroups.length === 1 && waterHoles >= 1 && targetCoverage >= .52 && preserveCoverage >= .62 && spillRatio <= .48;
    hint = complete ? 'That water is a lake!' : waterHoles === 0 ? 'Scoop a water space that land surrounds.' : 'Keep the lake inside one piece of land.';
  } else if (kind === 'peninsula') {
    complete = landGroups.length === 1 && peninsulaAnchored && peninsulaReach && targetCoverage >= .38 && preserveCoverage >= .54 && spillRatio <= .62;
    hint = complete ? 'That land is a peninsula!' : !peninsulaAnchored ? 'Join it to the left mainland.' : 'Stretch the land farther into the water.';
  } else {
    complete = landGroups.length === 1 && bayOpen && bayBounded && targetCoverage >= .52 && preserveCoverage >= .58 && spillRatio <= .48;
    hint = complete ? 'That water is a bay!' : !bayOpen ? 'Open the water to the right edge.' : 'Keep land around the bay on three sides.';
  }
  const score = Math.round(clamp((targetCoverage * .55 + preserveCoverage * .25 + (1 - spillRatio) * .20) * 100, 0, 100));
  return { kind, score, complete, targetCoverage, preserveCoverage, spillRatio, edgeContacts, landComponents: landGroups.length, waterHoles, hint };
}
