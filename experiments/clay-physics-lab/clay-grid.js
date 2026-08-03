const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function parseHexColor(value) {
  const hex = value.replace('#', '');
  const normalized = hex.length === 3
    ? hex.split('').map((part) => `${part}${part}`).join('')
    : hex;
  const number = Number.parseInt(normalized, 16);
  return [number >> 16, (number >> 8) & 255, number & 255];
}

function hashNoise(x, y) {
  let value = Math.imul(x + 31, 374761393) + Math.imul(y + 17, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

/**
 * A deliberately small plastic-clay model.
 *
 * The scalar field stores material height, not color pixels. Every editing
 * operation transports or redistributes that material, so dents persist and
 * the total volume remains approximately constant. This is a 2.5D model: it
 * supports top-down dough and front-facing blobs, but not overhangs.
 */
export class HeightfieldClay {
  constructor(width = 192, height = 128) {
    this.width = width;
    this.height = height;
    this.cells = new Float32Array(width * height);
    this.delta = new Float32Array(width * height);
    this.revision = 0;
  }

  index(x, y) {
    return y * this.width + x;
  }

  heightAt(x, y) {
    const ix = clamp(Math.round(x), 0, this.width - 1);
    const iy = clamp(Math.round(y), 0, this.height - 1);
    return this.cells[this.index(ix, iy)];
  }

  totalVolume() {
    let total = 0;
    for (let index = 0; index < this.cells.length; index += 1) total += this.cells[index];
    return total;
  }

  reset(preset = 'slab') {
    this.cells.fill(0);
    if (preset === 'balls') {
      this.addBall(this.width * .38, this.height * .48, 27, 7.1);
      this.addBall(this.width * .56, this.height * .43, 25, 6.6);
      this.addBall(this.width * .60, this.height * .62, 23, 6.2);
      this.addBall(this.width * .43, this.height * .66, 22, 5.9);
      this.relax(5, .055, .1);
    } else {
      this.addSlab(this.width * .5, this.height * .53, this.width * .35, this.height * .31, 5.6);
    }
    this.revision += 1;
  }

  addBall(cx, cy, radius, peak) {
    const minX = Math.max(1, Math.floor(cx - radius));
    const maxX = Math.min(this.width - 2, Math.ceil(cx + radius));
    const minY = Math.max(1, Math.floor(cy - radius));
    const maxY = Math.min(this.height - 2, Math.ceil(cy + radius));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = (x - cx) / radius;
        const dy = (y - cy) / radius;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared >= 1) continue;
        const dome = Math.sqrt(1 - distanceSquared) * peak;
        const index = this.index(x, y);
        this.cells[index] = Math.max(this.cells[index], dome);
      }
    }
  }

  addSlab(cx, cy, radiusX, radiusY, peak) {
    const minX = Math.max(1, Math.floor(cx - radiusX));
    const maxX = Math.min(this.width - 2, Math.ceil(cx + radiusX));
    const minY = Math.max(1, Math.floor(cy - radiusY));
    const maxY = Math.min(this.height - 2, Math.ceil(cy + radiusY));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = (x - cx) / radiusX;
        const dy = (y - cy) / radiusY;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared >= 1) continue;
        const edge = smoothstep(0, .22, 1 - distanceSquared);
        const crown = .9 + .1 * (1 - distanceSquared);
        this.cells[this.index(x, y)] = Math.max(
          this.cells[this.index(x, y)],
          peak * edge * crown,
        );
      }
    }
  }

  press(cx, cy, radius = 11, depth = .28) {
    const minX = Math.max(1, Math.floor(cx - radius * 1.65));
    const maxX = Math.min(this.width - 2, Math.ceil(cx + radius * 1.65));
    const minY = Math.max(1, Math.floor(cy - radius * 1.65));
    const maxY = Math.min(this.height - 2, Math.ceil(cy + radius * 1.65));
    let removed = 0;

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distance = Math.hypot(x - cx, y - cy) / radius;
        if (distance >= 1) continue;
        const weight = 1 - smoothstep(.08, 1, distance);
        const index = this.index(x, y);
        const amount = Math.min(this.cells[index], depth * weight);
        this.cells[index] -= amount;
        removed += amount;
      }
    }

    if (removed <= 0) return false;
    let weightTotal = 0;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distance = Math.hypot(x - cx, y - cy) / radius;
        if (distance <= .88 || distance >= 1.58) continue;
        weightTotal += Math.sin(((distance - .88) / .7) * Math.PI);
      }
    }
    if (weightTotal <= 0) {
      this.cells[this.index(Math.round(cx), Math.round(cy))] += removed;
      return false;
    }
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distance = Math.hypot(x - cx, y - cy) / radius;
        if (distance <= .88 || distance >= 1.58) continue;
        const weight = Math.sin(((distance - .88) / .7) * Math.PI);
        this.cells[this.index(x, y)] += removed * weight / weightTotal;
      }
    }
    this.revision += 1;
    return true;
  }

  smear(fromX, fromY, toX, toY, radius = 12, strength = .34) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    if (Math.hypot(dx, dy) < .02) return false;
    this.delta.fill(0);
    const minX = Math.max(1, Math.floor(fromX - radius));
    const maxX = Math.min(this.width - 2, Math.ceil(fromX + radius));
    const minY = Math.max(1, Math.floor(fromY - radius));
    const maxY = Math.min(this.height - 2, Math.ceil(fromY + radius));
    let moved = 0;

    const deposit = (x, y, amount) => {
      const targetX = clamp(x, 1, this.width - 2.001);
      const targetY = clamp(y, 1, this.height - 2.001);
      const x0 = Math.floor(targetX);
      const y0 = Math.floor(targetY);
      const tx = targetX - x0;
      const ty = targetY - y0;
      this.delta[this.index(x0, y0)] += amount * (1 - tx) * (1 - ty);
      this.delta[this.index(x0 + 1, y0)] += amount * tx * (1 - ty);
      this.delta[this.index(x0, y0 + 1)] += amount * (1 - tx) * ty;
      this.delta[this.index(x0 + 1, y0 + 1)] += amount * tx * ty;
    };

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distance = Math.hypot(x - fromX, y - fromY) / radius;
        if (distance >= 1) continue;
        const weight = 1 - smoothstep(.18, 1, distance);
        const index = this.index(x, y);
        const amount = this.cells[index] * strength * weight;
        if (amount <= 0) continue;
        this.delta[index] -= amount;
        deposit(x + dx * .92, y + dy * .92, amount);
        moved += amount;
      }
    }
    if (moved <= 0) return false;
    for (let index = 0; index < this.cells.length; index += 1) {
      this.cells[index] = Math.max(0, this.cells[index] + this.delta[index]);
    }
    this.revision += 1;
    return true;
  }

  roll(cx, cy, radius = 14, strength = .42) {
    const minX = Math.max(1, Math.floor(cx - radius));
    const maxX = Math.min(this.width - 2, Math.ceil(cx + radius));
    const minY = Math.max(1, Math.floor(cy - radius));
    const maxY = Math.min(this.height - 2, Math.ceil(cy + radius));
    let weightedHeight = 0;
    let weightTotal = 0;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distance = Math.hypot(x - cx, y - cy) / radius;
        if (distance >= 1) continue;
        const weight = 1 - smoothstep(.45, 1, distance);
        weightedHeight += this.cells[this.index(x, y)] * weight;
        weightTotal += weight;
      }
    }
    if (weightTotal <= 0 || weightedHeight <= 0) return false;
    const mean = weightedHeight / weightTotal;
    let changeTotal = 0;
    this.delta.fill(0);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distance = Math.hypot(x - cx, y - cy) / radius;
        if (distance >= 1) continue;
        const weight = 1 - smoothstep(.45, 1, distance);
        const index = this.index(x, y);
        const change = (mean - this.cells[index]) * strength * weight;
        this.delta[index] = change;
        changeTotal += change;
      }
    }
    const correction = -changeTotal / weightTotal;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distance = Math.hypot(x - cx, y - cy) / radius;
        if (distance >= 1) continue;
        const weight = 1 - smoothstep(.45, 1, distance);
        const index = this.index(x, y);
        this.cells[index] = Math.max(0, this.cells[index] + this.delta[index] + correction * weight);
      }
    }
    this.revision += 1;
    return true;
  }

  relax(iterations = 1, rate = .035, yieldThreshold = .18) {
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      this.delta.fill(0);
      for (let y = 1; y < this.height - 1; y += 1) {
        for (let x = 1; x < this.width - 1; x += 1) {
          const index = this.index(x, y);
          const right = this.index(x + 1, y);
          const down = this.index(x, y + 1);
          this.flowPair(index, right, rate, yieldThreshold);
          this.flowPair(index, down, rate, yieldThreshold);
        }
      }
      for (let index = 0; index < this.cells.length; index += 1) {
        this.cells[index] = Math.max(0, this.cells[index] + this.delta[index]);
      }
    }
    if (iterations > 0) this.revision += 1;
  }

  flowPair(first, second, rate, yieldThreshold) {
    const difference = this.cells[first] - this.cells[second];
    if (Math.abs(difference) <= yieldThreshold) return;
    const amount = Math.sign(difference) * (Math.abs(difference) - yieldThreshold) * rate;
    this.delta[first] -= amount;
    this.delta[second] += amount;
  }
}

export class ClayRenderer {
  constructor(canvas, clay, options = {}) {
    this.canvas = canvas;
    this.clay = clay;
    this.color = options.color || '#ef725e';
    this.context = canvas.getContext('2d', { alpha: false });
    this.surface = document.createElement('canvas');
    this.surface.width = clay.width;
    this.surface.height = clay.height;
    this.surfaceContext = this.surface.getContext('2d', { alpha: false });
    this.image = this.surfaceContext.createImageData(clay.width, clay.height);
    this.lastRevision = -1;
  }

  setColor(color) {
    this.color = color;
    this.lastRevision = -1;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scale));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.draw(true);
  }

  draw(force = false) {
    if (force || this.lastRevision !== this.clay.revision) this.shadeSurface();
    const { context } = this;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(this.surface, 0, 0, this.canvas.width, this.canvas.height);
  }

  shadeSurface() {
    const { width, height, cells } = this.clay;
    const pixels = this.image.data;
    const base = parseHexColor(this.color);
    const light = [-.48, -.64, .6];
    const lightLength = Math.hypot(...light);
    const lx = light[0] / lightLength;
    const ly = light[1] / lightLength;
    const lz = light[2] / lightLength;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const pixel = index * 4;
        const value = cells[index];
        const noise = hashNoise(x, y) - .5;
        if (value <= .018) {
          const shadowSource = cells[clamp(y - 3, 0, height - 1) * width + clamp(x - 4, 0, width - 1)];
          const shadow = clamp(shadowSource * .055, 0, .18);
          const grain = noise * 7 + Math.sin(x * .09 + y * .025) * 2.2;
          pixels[pixel] = clamp(222 + grain - shadow * 110, 0, 255);
          pixels[pixel + 1] = clamp(194 + grain - shadow * 90, 0, 255);
          pixels[pixel + 2] = clamp(151 + grain - shadow * 70, 0, 255);
          pixels[pixel + 3] = 255;
          continue;
        }

        const left = cells[y * width + Math.max(0, x - 1)];
        const right = cells[y * width + Math.min(width - 1, x + 1)];
        const up = cells[Math.max(0, y - 1) * width + x];
        const down = cells[Math.min(height - 1, y + 1) * width + x];
        const ridge = Math.sin(x * .47 + Math.sin(y * .14) * 2.4) * .045;
        const nxRaw = -(right - left) * .38 + ridge;
        const nyRaw = -(down - up) * .38 + Math.cos(y * .41 + x * .035) * .022;
        const normalLength = Math.hypot(nxRaw, nyRaw, 1);
        const nx = nxRaw / normalLength;
        const ny = nyRaw / normalLength;
        const nz = 1 / normalLength;
        const diffuse = clamp(nx * lx + ny * ly + nz * lz, 0, 1);
        const halfX = lx;
        const halfY = ly;
        const halfZ = lz + 1;
        const halfLength = Math.hypot(halfX, halfY, halfZ);
        const specular = Math.pow(clamp(
          nx * halfX / halfLength + ny * halfY / halfLength + nz * halfZ / halfLength,
          0,
          1,
        ), 24) * .38;
        const edge = smoothstep(.02, .7, value);
        const lightLevel = (.49 + diffuse * .56 + specular + noise * .035) * (.73 + edge * .27);
        const warmBounce = (1 - diffuse) * .045;
        pixels[pixel] = clamp(base[0] * lightLevel + 255 * specular + 60 * warmBounce, 0, 255);
        pixels[pixel + 1] = clamp(base[1] * lightLevel + 242 * specular + 28 * warmBounce, 0, 255);
        pixels[pixel + 2] = clamp(base[2] * lightLevel + 218 * specular + 20 * warmBounce, 0, 255);
        pixels[pixel + 3] = 255;
      }
    }
    this.surfaceContext.putImageData(this.image, 0, 0);
    this.lastRevision = this.clay.revision;
  }
}
