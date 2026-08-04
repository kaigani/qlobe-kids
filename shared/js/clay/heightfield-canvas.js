// heightfield-canvas.js — the per-pixel CPU shader for a clay heightfield.
//
// This module owns exactly one thing: turning a scalar height field into a
// lit, dough-like canvas image. It does not simulate clay — it duck-types a
// field object (`.width`, `.height`, `.cells`, `.revision`) and shades
// whatever numbers are in `.cells` as if they were dough thickness. It never
// imports the field module that produces those numbers, so a game can pair
// this renderer with any field implementation that honours the same shape.
//
// RENDER-ON-DEMAND, KEYED ON `revision`
// Per docs/interaction-patterns.md #12 ("An on-demand render pump must be
// driven, not poked"), this renderer never runs its own ticking loop. Shading
// the field is real CPU work (one pass over every cell, with a lighting
// model per pixel), so it only happens when `field.revision` has moved past
// the revision last shaded — an edit bumps the revision, a blit-only frame
// does not reshade. `requestDraw()` is the one entry point meant to be called
// from high-frequency events like pointermove: it coalesces to at most one
// rAF and that callback is a true no-op (not even a blit) when nothing
// changed, so a still dough field costs nothing per frame. `renders` counts
// only actual reshades, which is what QA asserts on to prove this.
//
// WHY DPR IS CAPPED AT `maxDpr` (default 2)
// Shading cost is fixed by the field's resolution, not the canvas's — the
// per-pixel lighting pass always walks `field.width * field.height` cells.
// What DPR drives is the size of the on-screen backing store the shaded
// image gets blitted into. Past 2x, an iPad's extra device pixels buy no
// visible crispness for a soft, blurred dough surface, but they do buy a
// larger canvas allocation and a costlier `drawImage` blit every frame — so
// the ratio is clamped rather than trusted verbatim.
//
// TRANSPARENT MODE
// `background: null` asks for a canvas with a real alpha channel: empty
// cells get alpha 0 (so a game's own tray art shows through) instead of a
// painted beige backdrop, and the soft contact shadow that dough casts on
// its surroundings is expressed as translucent dark rather than a darkened
// beige. This mode is fixed at construction time (it decides whether the
// underlying 2D contexts are opened with `alpha: true` or `alpha: false`,
// and a canvas context's alpha mode cannot change after creation) — pass the
// `background` you intend to keep. `setBackground()` is for retinting within
// that mode (swapping one opaque backdrop colour for another, or leaving
// transparent mode transparent); it does not migrate a renderer from opaque
// to transparent or back.

// Height at which transparent-mode material becomes fully opaque. Below it
// the dough's alpha ramps down to nothing, which is what antialiases the
// silhouette against a game's own backdrop. See the note in `_shadeSurface`.
const EDGE_FEATHER = .7;

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
 * Shades a scalar height field into a canvas, on demand.
 *
 * `field` is duck-typed: anything with `.width`, `.height`, a `Float32Array`
 * (or array-like) `.cells` of length `width * height`, and a `.revision`
 * counter that increases whenever `.cells` has changed works here.
 */
export class ClayRenderer {
  /**
   * @param {HTMLCanvasElement} canvas the visible, DPR-sized canvas to blit into.
   * @param {{width:number, height:number, cells:ArrayLike<number>, revision:number}} field
   * @param {{color?:string, background?:string|null, maxDpr?:number}} [options]
   */
  constructor(canvas, field, options = {}) {
    this.canvas = canvas;
    this.field = field;
    this.color = options.color || '#ef725e';
    this.background = options.background === undefined ? '#dec297' : options.background;
    this.maxDpr = options.maxDpr || 2;

    const transparent = this.background === null;
    this.context = canvas.getContext('2d', { alpha: transparent });

    // The offscreen surface is shaded at field resolution (cheap, one texel
    // per cell) and then scaled up into the DPR-sized canvas by drawImage —
    // this keeps the expensive per-pixel lighting pass independent of DPR.
    this.surface = document.createElement('canvas');
    this.surface.width = field.width;
    this.surface.height = field.height;
    this.surfaceContext = this.surface.getContext('2d', { alpha: transparent });
    this.image = this.surfaceContext.createImageData(field.width, field.height);

    this.lastRevision = -1;
    this._renderCount = 0;
    this._rafHandle = null;
    this._destroyed = false;
  }

  /** Count of reshades actually performed. QA proves render-on-demand with this. */
  get renders() {
    return this._renderCount;
  }

  /** Retint the dough. Takes effect on the next draw. */
  setColor(hex) {
    this.color = hex;
    this.lastRevision = -1;
  }

  /**
   * Change the backdrop colour, or leave/enter transparent mode's absence of
   * a painted backdrop. Does NOT change which alpha mode the canvas contexts
   * were opened with (see the module header) — pass the same nullness this
   * renderer was constructed with unless you know that limitation applies.
   */
  setBackground(hexOrNull) {
    this.background = hexOrNull;
    this.lastRevision = -1;
  }

  /**
   * Resizes the backing store to the canvas's current CSS rect × DPR
   * (clamped to `maxDpr`, and never below 1x1 so a `display:none` canvas —
   * whose rect is all zeroes — can't produce a zero-size or NaN backing
   * store). Only touches the canvas and redraws when the size actually
   * changed, so repeated ResizeObserver firings with an unchanged rect cost
   * nothing.
   */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scale));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.draw(true);
  }

  /**
   * Reshades only when `force` or the field's revision has moved since the
   * last reshade, then blits the (possibly just-refreshed) offscreen surface
   * into the visible canvas.
   * @param {boolean} [force]
   * @returns {boolean} true if this call actually reshaded, false if it was
   *   a cheap blit of the already-current surface.
   */
  draw(force = false) {
    this._syncSurfaceSize();
    const reshaded = force || this.lastRevision !== this.field.revision;
    if (reshaded) {
      this._shadeSurface();
      this.lastRevision = this.field.revision;
      this._renderCount += 1;
    }

    const { context, canvas } = this;
    if (this.background === null) context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(this.surface, 0, 0, canvas.width, canvas.height);
    return reshaded;
  }

  /**
   * The render-on-demand entry point for high-frequency callers (pointer
   * moves, drag ticks). Coalesces to at most one pending `requestAnimationFrame`;
   * if a frame is already scheduled, this is a no-op. The scheduled callback
   * itself does nothing — no blit, no further scheduling — when the field's
   * revision hasn't moved since the last draw, so a still field never grows
   * a self-perpetuating rAF loop.
   */
  requestDraw() {
    if (this._destroyed || this._rafHandle !== null) return;
    this._rafHandle = requestAnimationFrame(() => {
      this._rafHandle = null;
      if (this.lastRevision === this.field.revision) return;
      this.draw();
    });
  }

  /** Cancels any pending frame and drops references. Safe to call once; further `requestDraw()` calls become no-ops. */
  destroy() {
    if (this._rafHandle !== null) {
      cancelAnimationFrame(this._rafHandle);
      this._rafHandle = null;
    }
    this._destroyed = true;
    this.canvas = null;
    this.field = null;
    this.context = null;
    this.surface = null;
    this.surfaceContext = null;
    this.image = null;
  }

  // Recreates the offscreen surface (and its ImageData) if the field's
  // dimensions have changed since it was last sized. A field is expected to
  // keep a fixed resolution for its lifetime, but this guard keeps a stale
  // surface from silently mismatching it.
  _syncSurfaceSize() {
    const { width, height } = this.field;
    if (this.surface.width === width && this.surface.height === height) return;
    this.surface.width = width;
    this.surface.height = height;
    this.image = this.surfaceContext.createImageData(width, height);
    this.lastRevision = -1;
  }

  // The shading maths below are a reviewed art result, carried over from
  // experiments/clay-physics-lab/clay-grid.js unchanged except for: the
  // backdrop colour coming from `this.background` instead of a hardcoded
  // beige, and the transparent-background branch (alpha 0 for empty cells,
  // the contact shadow expressed as translucent dark instead of a darkened
  // beige). The light vector, ridge/noise micro-detail, diffuse+specular
  // terms, edge smoothstep and warm bounce for actual dough are untouched.
  _shadeSurface() {
    const { width, height, cells } = this.field;
    const pixels = this.image.data;
    const base = parseHexColor(this.color);
    const transparent = this.background === null;
    const backdrop = transparent ? null : parseHexColor(this.background);
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
        const shadowSource = cells[clamp(y - 3, 0, height - 1) * width + clamp(x - 4, 0, width - 1)];
        const shadow = clamp(shadowSource * .055, 0, .18);
        const shadowAlpha = clamp(shadow * 900, 0, 220);
        if (value <= .018) {
          if (transparent) {
            // No backdrop to paint: empty cells stay fully transparent, and
            // the cast shadow reads as translucent dark laid over whatever
            // the game has drawn underneath, rather than a darkened beige.
            pixels[pixel] = 0;
            pixels[pixel + 1] = 0;
            pixels[pixel + 2] = 0;
            pixels[pixel + 3] = shadowAlpha;
          } else {
            const grain = noise * 7 + Math.sin(x * .09 + y * .025) * 2.2;
            pixels[pixel] = clamp(backdrop[0] + grain - shadow * 110, 0, 255);
            pixels[pixel + 1] = clamp(backdrop[1] + grain - shadow * 90, 0, 255);
            pixels[pixel + 2] = clamp(backdrop[2] + grain - shadow * 70, 0, 255);
            pixels[pixel + 3] = 255;
          }
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
        // Opaque mode has a backdrop to blend into, so material is simply
        // solid. Transparent mode does not: a hard alpha step at the .018
        // cutoff draws the field's own cell grid as a visible staircase
        // around the dough's silhouette. Feathering alpha across the first
        // sliver of thickness lets the edge resolve at sub-cell precision —
        // and it is physically the right story, since that is exactly where
        // the dough thins out to nothing.
        //
        // EDGE_FEATHER is in height units, and it has to be a real slice of
        // a dough's peak rather than a hairline: a slab's height climbs from
        // zero to full within roughly one cell, so a ramp of a few hundredths
        // covered less than a cell and left the staircase exactly as it was.
        pixels[pixel + 3] = transparent
          ? Math.max(shadowAlpha, clamp(smoothstep(.018, EDGE_FEATHER, value) * 255, 0, 255))
          : 255;
      }
    }
    this.surfaceContext.putImageData(this.image, 0, 0);
  }
}
