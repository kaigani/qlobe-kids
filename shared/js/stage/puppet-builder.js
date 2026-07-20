// Puppet Builder — deterministic authoring steps around the local Qwen Layered
// extractor. Image work stays in the browser (Canvas); a localhost companion
// server handles safe repo writes and long-running model jobs.

const VISEMES = ['a', 'o', 'e', 'wr', 'ts', 'ln', 'uq', 'mbp', 'fv'];
const PART_ORDER = [
  'head', 'torso',
  'arm-upper.L', 'arm-lower.L', 'arm-lower.R', 'arm-upper.R',
  'leg-upper.L', 'leg-lower.L', 'leg-upper.R', 'leg-lower.R',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

async function api(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) throw new Error(body.error || `${response.status} ${response.statusText}`);
  return body;
}

function sourceUrl(id, path) {
  return `/__puppet_files__/source/${encodeURIComponent(id)}/${path}?v=${Date.now()}`;
}

async function loadBitmap(source) {
  if (source instanceof Blob) return createImageBitmap(source);
  const response = await fetch(source, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load ${source}`);
  return createImageBitmap(await response.blob());
}

function canvasFor(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}

function bitmapPixels(bitmap) {
  const canvas = canvasFor(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  return { canvas, context, data: context.getImageData(0, 0, canvas.width, canvas.height) };
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Canvas PNG encoding failed')),
    'image/png',
  ));
}

// Connected components without dependencies. predicate receives (rgbaIndex, x, y).
function components(imageData, predicate, minArea = 32) {
  const { width, height, data } = imageData;
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const found = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (seen[start] || !predicate(start * 4, x, y)) continue;
      let read = 0, write = 1, area = 0;
      let minX = x, maxX = x, minY = y, maxY = y, sumX = 0, sumY = 0;
      queue[0] = start; seen[start] = 1;
      while (read < write) {
        const index = queue[read++];
        const px = index % width, py = Math.floor(index / width);
        area += 1; sumX += px; sumY += py;
        minX = Math.min(minX, px); maxX = Math.max(maxX, px);
        minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = px + dx, ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (!seen[ni] && predicate(ni * 4, nx, ny)) {
            seen[ni] = 1; queue[write++] = ni;
          }
        }
      }
      if (area >= minArea) found.push({
        area, minX, minY, maxX: maxX + 1, maxY: maxY + 1,
        cx: sumX / area, cy: sumY / area,
        width: maxX - minX + 1, height: maxY - minY + 1,
      });
    }
  }
  return found;
}

function alphaStats(imageData) {
  let transparent = 0, partial = 0, opaque = 0;
  for (let i = 3; i < imageData.data.length; i += 4) {
    const a = imageData.data[i];
    if (a === 0) transparent += 1;
    else if (a === 255) opaque += 1;
    else partial += 1;
  }
  const count = imageData.width * imageData.height;
  return {
    transparent: transparent / count,
    partial: partial / count,
    opaque: opaque / count,
  };
}

function sampleCornerColor(imageData, sampleSize = 8) {
  const { width, height, data } = imageData;
  const channels = [[], [], []];
  const w = Math.min(sampleSize, width), h = Math.min(sampleSize, height);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const i = (y * width + x) * 4;
    channels[0].push(data[i]); channels[1].push(data[i + 1]); channels[2].push(data[i + 2]);
  }
  return channels.map((values) => median(values));
}

function cropCanvas(source, box, pad = 2) {
  const x = Math.max(0, Math.floor(box.minX - pad));
  const y = Math.max(0, Math.floor(box.minY - pad));
  const right = Math.min(source.width, Math.ceil(box.maxX + pad));
  const bottom = Math.min(source.height, Math.ceil(box.maxY + pad));
  const out = canvasFor(right - x, bottom - y);
  out.getContext('2d').drawImage(source, x, y, right - x, bottom - y, 0, 0, right - x, bottom - y);
  return out;
}

function alphaBounds(bitmap, threshold = 16) {
  const { data: imageData } = bitmapPixels(bitmap);
  const { width, height, data } = imageData;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (data[(y * width + x) * 4 + 3] <= threshold) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (maxX < minX || maxY < minY) throw new Error('Transparent Qwen result contains no visible head');
  return { minX, minY, maxX: maxX + 1, maxY: maxY + 1, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function splitParts(bitmap) {
  const { canvas, data } = bitmapPixels(bitmap);
  const stats = alphaStats(data);
  const candidates = components(data, (i) => data.data[i + 3] > 16, 350)
    .filter((c) => c.area > data.width * data.height * 0.00045)
    .sort((a, b) => a.cy - b.cy);
  if (candidates.length !== 10) {
    throw new Error(`Expected 10 alpha-separated sprites; found ${candidates.length}. Retry Qwen or review the layer.`);
  }
  const rows = [candidates.slice(0, 2), candidates.slice(2, 6), candidates.slice(6, 10)]
    .map((row) => row.sort((a, b) => a.cx - b.cx));
  const ordered = [...rows[0], ...rows[1], ...rows[2]];
  const parts = {};
  ordered.forEach((box, i) => { parts[PART_ORDER[i]] = cropCanvas(canvas, box, 2); });
  return { parts, components: ordered, stats };
}

function sliceVisemeGrid(bitmap) {
  const { canvas, data } = bitmapPixels(bitmap);
  const output = {};
  const cropInfo = {};
  const detectionBg = sampleCornerColor(data);
  for (let row = 0; row < 3; row += 1) for (let col = 0; col < 3; col += 1) {
    const index = row * 3 + col;
    const x0 = Math.floor(col * data.width / 3), x1 = Math.floor((col + 1) * data.width / 3);
    const y0 = Math.floor(row * data.height / 3), y1 = Math.floor((row + 1) * data.height / 3);
    // Generated grids are not always perfectly contained: a head can bleed a
    // few pixels into the neighbouring nominal cell. Search an overlapping
    // region, then assign complete components by a centre that remains inside
    // this cell. Neighbouring heads may enter the search region but are rejected
    // by that centre test.
    const bleedX = Math.min(96, Math.floor((x1 - x0) * 0.2));
    const bleedY = Math.min(96, Math.floor((y1 - y0) * 0.15));
    const searchX0 = Math.max(0, x0 - bleedX), searchX1 = Math.min(data.width, x1 + bleedX);
    const searchY0 = Math.max(0, y0 - bleedY), searchY1 = Math.min(data.height, y1 + bleedY);
    const foreground = (i, x, y) => {
      if (x < searchX0 || x >= searchX1 || y < searchY0 || y >= searchY1) return false;
      const dr = data.data[i] - detectionBg[0], dg = data.data[i + 1] - detectionBg[1], db = data.data[i + 2] - detectionBg[2];
      return dr * dr + dg * dg + db * db > 24 * 24;
    };
    const blobs = components(data, foreground, 24)
      .filter((c) => c.cx >= x0 && c.cx < x1 && c.cy >= y0 && c.cy < y1)
      .sort((a, b) => b.area - a.area);
    if (!blobs.length) throw new Error(`Could not locate the head in viseme cell ${index + 1}`);
    const head = blobs[0];
    const padX = 30, padTop = 24, padBottom = 8;
    const cropX = Math.max(0, head.minX - padX), cropY = Math.max(0, head.minY - padTop);
    const cropR = Math.min(data.width, head.maxX + padX), cropB = Math.min(data.height, head.maxY + padBottom);
    const cropWidth = cropR - cropX, cropHeight = cropB - cropY;
    if (cropWidth > 1024 || cropHeight > 1024) {
      throw new Error(`Viseme cell ${index + 1} crop is ${cropWidth}×${cropHeight}; a 1:1 crop cannot fit on the 1024×1024 Qwen canvas.`);
    }
    const crop = canvasFor(cropWidth, cropHeight); const cropContext = crop.getContext('2d');
    cropContext.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    const cropPixels = cropContext.getImageData(0, 0, cropWidth, cropHeight);
    const bg = sampleCornerColor(cropPixels);
    const tile = canvasFor(1024, 1024); const context = tile.getContext('2d');
    context.fillStyle = `rgb(${bg[0]} ${bg[1]} ${bg[2]})`; context.fillRect(0, 0, 1024, 1024);
    const headCx = (head.minX + head.maxX) / 2, headCy = (head.minY + head.maxY) / 2;
    context.drawImage(
      crop,
      Math.round(512 - (headCx - cropX)), Math.round(512 - (headCy - cropY)),
    );
    const key = VISEMES[index];
    output[key] = tile;
    cropInfo[key] = { width: cropWidth, height: cropHeight, background: bg };
  }
  Object.defineProperty(output, 'crops', { value: cropInfo, enumerable: false });
  return output;
}

function featureBox(bitmap, mode = 'light') {
  const { data } = bitmapPixels(bitmap);
  const predicate = mode === 'light'
    ? (i) => {
      const r = data.data[i], g = data.data[i + 1], b = data.data[i + 2], a = data.data[i + 3];
      return a > 40 && Math.min(r, g, b) > 145 && Math.max(r, g, b) - Math.min(r, g, b) < 58;
    }
    : (i) => data.data[i + 3] > 24;
  const blobs = components(data, predicate, 100).sort((a, b) => b.area - a.area);
  const box = blobs[0];
  if (mode === 'light' && (!box || box.area < bitmap.width * bitmap.height * 0.015)) return featureBox(bitmap, 'alpha');
  if (!box) throw new Error('Transparent cutout contains no visible subject');
  return { ...box, mode };
}

function registerVisemes(bitmaps) {
  const keys = Object.keys(bitmaps);
  const sourceFeatures = {};
  for (const key of keys) sourceFeatures[key] = featureBox(bitmaps[key], 'light');
  const lightCount = Object.values(sourceFeatures).filter((f) => f.mode === 'light').length;
  const mode = lightCount >= Math.ceil(keys.length * 0.7) ? 'light' : 'alpha';
  if (mode === 'alpha') for (const key of keys) sourceFeatures[key] = featureBox(bitmaps[key], 'alpha');
  const sourceRef = sourceFeatures.rest || sourceFeatures.ts;
  const sourceRefCx = (sourceRef.minX + sourceRef.maxX) / 2;
  const sourceRefCy = (sourceRef.minY + sourceRef.maxY) / 2;
  const offsets = keys.map((key) => {
    const f = sourceFeatures[key];
    return Math.hypot((f.minX + f.maxX) / 2 - sourceRefCx, (f.minY + f.maxY) / 2 - sourceRefCy);
  });

  // Qwen returns each viseme on a transparent canvas. Trim empty pixels and
  // align by integer translation. The neutral base-sheet head is the rest pose;
  // it alone is deterministically scaled to match the viseme sheet's head size.
  // The nine authored visemes remain pixel-preserving and are never resized.
  const trimmed = {};
  for (const key of keys) trimmed[key] = cropCanvas(bitmaps[key], alphaBounds(bitmaps[key]), 2);
  const features = {};
  for (const key of keys) features[key] = featureBox(trimmed[key], mode);
  let restScale = 1;
  if (features.rest && features.ts) {
    restScale = median([
      features.ts.width / features.rest.width,
      features.ts.height / features.rest.height,
    ]);
    if (restScale >= 0.5 && restScale <= 2.5 && Math.abs(restScale - 1) > 0.015) {
      const source = trimmed.rest;
      const scaled = canvasFor(Math.round(source.width * restScale), Math.round(source.height * restScale));
      const context = scaled.getContext('2d'); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      context.drawImage(source, 0, 0, scaled.width, scaled.height);
      trimmed.rest = scaled; features.rest = featureBox(scaled, mode);
    } else restScale = 1;
  }
  const ref = features.rest || features.ts;
  const refCx = (ref.minX + ref.maxX) / 2, refCy = (ref.minY + ref.maxY) / 2;
  const shifts = {};
  for (const key of keys) {
    const f = features[key];
    shifts[key] = {
      x: Math.round(refCx - (f.minX + f.maxX) / 2),
      y: Math.round(refCy - (f.minY + f.maxY) / 2),
    };
  }
  const minX = Math.min(...keys.map((key) => shifts[key].x));
  const minY = Math.min(...keys.map((key) => shifts[key].y));
  const maxX = Math.max(...keys.map((key) => shifts[key].x + trimmed[key].width));
  const maxY = Math.max(...keys.map((key) => shifts[key].y + trimmed[key].height));
  const width = maxX - minX, height = maxY - minY;
  const output = {};
  for (const key of keys) {
    const canvas = canvasFor(width, height); const context = canvas.getContext('2d');
    context.drawImage(trimmed[key], shifts[key].x - minX, shifts[key].y - minY);
    output[key] = canvas;
  }
  return { output, mode, restScale, medianDrift: median(offsets), maxDrift: Math.max(...offsets), width, height };
}

function makeRig(template, clips, id, name) {
  const rig = structuredClone(template);
  delete rig._comment;
  rig.id = id; rig.name = name || id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  rig.art = `Built in Puppet Studio from ${id}/raw-base.png and head-visemes.png. Qwen Layered supplied alpha extraction; browser-side deterministic processing supplied crops, registration, and this starter rig.`;
  rig.clips = structuredClone(clips.clips || clips);
  return rig;
}

async function uploadFile(id, kind, body, overwrite) {
  return api(`/api/puppet/file?id=${encodeURIComponent(id)}&kind=${encodeURIComponent(kind)}&overwrite=${overwrite}`, {
    method: 'POST', body,
  });
}

export function mountPuppetBuilder({ panel, stage, currentChar = 'bear', onOpenCharacter, onVoiceReady, notify = () => {} }) {
  panel.innerHTML = `
    <div class="build-card"><h3><span class="step-number">1</span> Character project</h3>
      <label>id <input id="build-id" value="${currentChar}" pattern="[a-z][a-z0-9-]*"></label>
      <label>display name <input id="build-name" placeholder="Starlight"></label>
      <label><input id="build-overwrite" type="checkbox"> allow replacing existing pipeline files</label>
      <div class="row"><button id="build-refresh" class="mini ghost">Refresh status</button><span id="build-server" class="hint"></span></div>
    </div>
    <div class="build-card"><h3><span class="step-number">2</span> Ingest source sheets</h3>
      <label>body parts sheet <input id="build-base" type="file" accept="image/png"></label>
      <label>3×3 viseme sheet <input id="build-visemes" type="file" accept="image/png"></label>
      <div class="row"><button id="build-upload" class="mini">Save both sources</button>
        <button id="build-slice-visemes" class="mini ghost">Slice 9 visemes</button></div>
      <p class="hint">Slicing is 1:1 and pixel-preserving: labels are excluded, no crop is resized, and each 1024² tile uses grey sampled from that crop's corner.</p>
    </div>
    <div class="build-card"><h3><span class="step-number">3</span> Qwen alpha extraction</h3>
      <label>seed <input id="build-seed" type="number" value="42"></label>
      <label style="display:block">body prompt<textarea id="build-base-prompt">Solid grey background layer. Top layer contains the exact same ten plush puppet part sprites from the input, in their original arrangement. Keep every sprite identical to the input image.</textarea></label>
      <label style="display:block">head prompt<textarea id="build-head-prompt">Solid grey background, Character head on top layer on transparent background</textarea></label>
      <div class="row"><button id="build-qwen-base" class="mini warn">Extract body sheet</button>
        <button id="build-qwen-heads" class="mini warn">Extract 9 heads</button></div>
      <div id="build-job" class="hint"></div>
    </div>
    <div class="build-card"><h3><span class="step-number">4</span> QC and assemble</h3>
      <div class="row"><button id="build-qc-base" class="mini ghost">QC / slice body</button>
        <button id="build-finalize" class="mini">Register heads + build rig</button></div>
      <p class="hint">QC requires a transparent background, a soft partial-alpha edge band, exactly 10 body components, and mutually registered heads. The base-sheet head becomes rest; the nine Qwen visemes remain pixel-preserving.</p>
    </div>
    <div class="build-card"><h3><span class="step-number">5</span> Set up voice cues</h3>
      <div class="row"><label>line id <input id="build-voice-key" value="intro" pattern="[a-z][a-z0-9-]*"></label>
        <label>label <input id="build-voice-label" value="Intro"></label></div>
      <label>WAV or MP3 <input id="build-voice-file" type="file" accept=".wav,.mp3,audio/wav,audio/mpeg"></label>
      <label style="display:block">Whisper transcript (review and edit)<textarea id="build-voice-text" disabled placeholder="Choose audio to transcribe"></textarea></label>
      <div class="row"><label>aligner <select id="build-aligner"><option value="mfa">MFA · high quality</option><option value="rhubarb">Rhubarb · fast</option></select></label>
        <label>mouth lead ms <input id="build-lead" type="number" min="-200" max="400" step="10" value="-40"></label></div>
      <div class="row"><button id="build-voice" class="mini warn" disabled>Generate cues + save voice</button></div>
      <div id="build-voice-job" class="hint"></div>
      <p class="hint">Selecting audio runs Whisper over the workflow API. MFA aligns the reviewed transcript to phones; Rhubarb remains the fast fallback. Silence detection inserts neutral rest cues. The M4A and editable cues are saved under shared/characters/&lt;id&gt;/voice/.</p>
    </div>
    <div class="build-card"><h3><span class="step-number">6</span> Tune</h3>
      <button id="build-open" class="mini">Open character in Rig mode</button>
      <p class="hint">The generated rig starts from default-rig.json and default-clips.json. Joint placement remains a visual authoring step.</p>
    </div>`;
  stage.innerHTML = `<div class="builder-welcome"><h2>Character build pipeline</h2>
    <p>Import → slice → extract alpha → inspect → assemble → tune</p>
    <div id="build-summary" class="build-summary"></div><div id="build-gallery" class="build-gallery"></div></div>`;

  const $ = (id) => panel.querySelector(`#${id}`) || stage.querySelector(`#${id}`);
  const gallery = $('build-gallery'); const summary = $('build-summary');
  let voiceTranscriptionToken = 0;
  let voiceTranscriptFile = null;
  let voiceTranscriptReady = false;
  const getId = () => {
    const id = $('build-id').value.trim();
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(id)) throw new Error('Use a lowercase kebab-case character id.');
    return id;
  };
  const overwrite = () => $('build-overwrite').checked;
  const report = (message, bad = false) => {
    summary.textContent = message; summary.classList.toggle('bad', bad);
  };
  const fail = (error) => {
    console.error(error); const message = error.message || String(error);
    report(message, true); notify(message, { kind: 'error', duration: 7000 });
  };
  const showCanvases = async (items, details = {}) => {
    gallery.innerHTML = '';
    for (const [label, canvas] of Object.entries(items)) {
      const card = document.createElement('figure');
      const img = document.createElement('img'); img.src = URL.createObjectURL(await canvasBlob(canvas));
      const caption = document.createElement('figcaption'); caption.textContent = `${label}${details[label] ? ` · ${details[label]}` : ''}`;
      card.append(img, caption); gallery.appendChild(card);
    }
  };

  async function refresh() {
    try {
      const [status, projects] = await Promise.all([api('/api/puppet/status'), api('/api/puppet/projects')]);
      const project = projects.projects.find((p) => p.id === getId());
      const extraction = status.qwen.reachable ? 'Qwen ready'
        : status.qwen.configured ? 'Qwen offline' : 'Qwen not configured';
      const alignment = status.aligners?.mfa?.available ? 'MFA ready' : 'MFA unavailable · Rhubarb fallback';
      $('build-server').textContent = `authoring server · ${extraction} · ${alignment}`;
      $('build-aligner').querySelector('option[value="mfa"]').textContent = status.aligners?.mfa?.available
        ? 'MFA · high quality' : 'MFA · fallback if unavailable';
      report(project ? `Existing: sources ${+project.rawBase + +project.visemeSheet}/2 · tiles ${project.tiles}/9 · cutouts ${project.cutouts}/9 · parts ${project.parts}/10 · heads ${project.anim}/10 · voices ${project.voices || 0} · rig ${project.rig ? 'yes' : 'no'}`
        : 'New project. Choose both PNG source sheets.');
    } catch (error) {
      $('build-server').textContent = 'authoring API unavailable';
      report('Launch tools/puppet-studio-server.py instead of python -m http.server to enable the build pipeline.', true);
    }
  }

  async function saveSources() {
    const id = getId(), base = $('build-base').files[0], visemes = $('build-visemes').files[0];
    if (!base || !visemes) throw new Error('Choose both PNG source sheets first.');
    report('Saving source sheets…'); notify(`Saving ${id} source sheets to disk…`);
    await uploadFile(id, 'raw-base', base, overwrite());
    await uploadFile(id, 'head-visemes', visemes, overwrite());
    report('Both source sheets saved.');
    notify(`Saved ${id} body and viseme source sheets.`, { kind: 'success' });
    await refresh();
  }

  async function sliceHeads() {
    const id = getId(); report('Locating and slicing 9 heads…');
    notify(`Slicing and saving 9 ${id} viseme tiles…`);
    const file = $('build-visemes').files[0];
    const bitmap = await loadBitmap(file || sourceUrl(id, 'head-visemes.png'));
    const tiles = sliceVisemeGrid(bitmap); await showCanvases(tiles);
    for (const key of VISEMES) await uploadFile(id, `viseme-tile-${key}`, await canvasBlob(tiles[key]), overwrite());
    report('9 pixel-preserving 1:1 tiles saved. Each 1024×1024 background was sampled from its own crop corner. Review the gallery before Qwen extraction.');
    notify(`Saved 9 ${id} viseme tiles to disk.`, { kind: 'success' });
  }

  async function startQwen(target) {
    const id = getId();
    const prompt = target === 'base' ? $('build-base-prompt').value : $('build-head-prompt').value;
    const body = await api('/api/puppet/qwen/extract', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, target, prompt, seed: +$('build-seed').value || 42, overwrite: overwrite() }),
    });
    notify(`${target === 'base' ? 'Body transparency' : 'Head transparency'} job started. It will continue in the background.`, { duration: 6500 });
    $('build-job').textContent = `Job ${body.jobId} queued…`;
    while (true) {
      const result = await api(`/api/puppet/jobs/${body.jobId}`); const job = result.job;
      $('build-job').textContent = `${job.message || job.status}${job.remote_job ? ` · model job ${job.remote_job}` : ''}`;
      if (job.status === 'completed') break;
      if (job.status === 'failed') throw new Error(job.error || 'Qwen extraction failed');
      await sleep(2500);
    }
    report(`${target === 'base' ? 'Body sheet' : '9 heads'} extracted to transparent layer_2. Run QC before assembling.`);
    notify(`${target === 'base' ? 'Body sheet' : '9 heads'} transparency extraction finished.`, { kind: 'success', duration: 6500 });
    await refresh();
  }

  async function qcBody() {
    const id = getId(); report('Analyzing alpha and connected components…');
    const bitmap = await loadBitmap(sourceUrl(id, `sprites-${id}.png`));
    const result = splitParts(bitmap);
    const detail = {}; Object.entries(result.parts).forEach(([name, canvas]) => { detail[name] = `${canvas.width}×${canvas.height}`; });
    await showCanvases(result.parts, detail);
    const pct = (v) => `${(100 * v).toFixed(1)}%`;
    report(`PASS · 10 parts · transparent ${pct(result.stats.transparent)} · partial edge ${pct(result.stats.partial)} · opaque ${pct(result.stats.opaque)}`);
    return result;
  }

  async function finalize() {
    const id = getId(); report('Slicing body, registering visemes, and writing the starter rig…');
    notify(`Building and saving ${id} parts, heads, and rig…`, { duration: 6000 });
    const body = await qcBody();
    const headBitmaps = { rest: body.parts.head };
    for (const key of VISEMES) headBitmaps[key] = await loadBitmap(sourceUrl(id, `viseme-cutouts/head-${key}.png`));
    const registered = registerVisemes(headBitmaps);
    for (const [bone, canvas] of Object.entries(body.parts)) {
      await uploadFile(id, `part-${bone}`, await canvasBlob(canvas), overwrite());
    }
    for (const key of ['rest', ...VISEMES]) {
      await uploadFile(id, `anim-${key}`, await canvasBlob(registered.output[key]), overwrite());
    }
    const [template, clips] = await Promise.all([
      fetch('../../characters/default-rig.json').then((r) => r.json()),
      fetch('../../characters/default-clips.json').then((r) => r.json()),
    ]);
    const rig = makeRig(template, clips, id, $('build-name').value.trim());
    await uploadFile(id, 'rig', new Blob([JSON.stringify(rig, null, 2) + '\n'], { type: 'application/json' }), overwrite());
    await showCanvases(registered.output);
    report(`PASS · 10 rig parts + neutral rest + 9 registered viseme heads (${registered.width}×${registered.height}) + rig.json saved · rest scale ${registered.restScale.toFixed(3)} · registration feature: ${registered.mode} · pre-correction drift median ${registered.medianDrift.toFixed(1)}px, max ${registered.maxDrift.toFixed(1)}px. Open Rig mode to place joints.`);
    notify(`Saved ${id}: 10 parts, rest + 9 viseme heads, and rig.json.`, { kind: 'success', duration: 6500 });
    await refresh();
  }

  async function transcribeVoice() {
    const file = $('build-voice-file').files[0];
    const text = $('build-voice-text'); const button = $('build-voice');
    const token = ++voiceTranscriptionToken;
    voiceTranscriptFile = file || null; voiceTranscriptReady = false;
    button.disabled = true; text.disabled = true;
    if (!file) {
      text.value = ''; text.placeholder = 'Choose audio to transcribe';
      $('build-voice-job').textContent = '';
      return;
    }
    const format = file.name.toLowerCase().split('.').pop();
    if (!['wav', 'mp3'].includes(format)) throw new Error('Voice sample must be WAV or MP3.');
    text.value = 'Transcribing...';
    $('build-voice-job').textContent = 'Uploading audio to Whisper…';
    notify(`Whisper transcription started for ${file.name}.`, { duration: 6000 });
    try {
      const response = await fetch(`/api/puppet/transcribe?format=${encodeURIComponent(format)}`, {
        method: 'POST', body: file,
      });
      const submitted = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(submitted.error || `${response.status} ${response.statusText}`);
      while (true) {
        const result = await api(`/api/puppet/jobs/${submitted.jobId}`); const job = result.job;
        if (token !== voiceTranscriptionToken) return;
        $('build-voice-job').textContent = job.message || job.status;
        if (job.status === 'completed') {
          text.value = job.result?.transcript || '';
          text.disabled = false; button.disabled = false;
          voiceTranscriptReady = true;
          $('build-voice-job').textContent = 'Transcript ready — review or edit it, then generate cues.';
          notify('Whisper transcript is ready to review.', { kind: 'success' });
          return;
        }
        if (job.status === 'failed') throw new Error(job.error || 'Whisper transcription failed');
        await sleep(750);
      }
    } catch (error) {
      if (token === voiceTranscriptionToken) {
        text.value = ''; text.placeholder = 'Transcription failed — enter the spoken text manually';
        text.disabled = false; button.disabled = false;
        voiceTranscriptReady = true;
        $('build-voice-job').textContent = 'Whisper failed; enter or correct the transcript manually.';
      }
      throw error;
    }
  }

  async function buildVoice() {
    const id = getId();
    const file = $('build-voice-file').files[0];
    if (!file) throw new Error('Choose a WAV or MP3 voice sample first.');
    if (!voiceTranscriptReady || voiceTranscriptFile !== file || $('build-voice-text').disabled) {
      throw new Error('Wait for Whisper transcription to finish before generating cues.');
    }
    const format = file.name.toLowerCase().split('.').pop();
    if (!['wav', 'mp3'].includes(format)) throw new Error('Voice sample must be WAV or MP3.');
    const key = $('build-voice-key').value.trim();
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(key)) throw new Error('Voice line id must be lowercase kebab-case.');
    const params = new URLSearchParams({
      id, key, format, label: $('build-voice-label').value.trim() || key,
      transcript: $('build-voice-text').value.trim(), overwrite: String(overwrite()),
      aligner: $('build-aligner').value,
      leadMs: String(Math.max(-200, Math.min(400, +$('build-lead').value || 0))),
    });
    const response = await fetch(`/api/puppet/voice?${params}`, { method: 'POST', body: file });
    const submitted = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(submitted.error || `${response.status} ${response.statusText}`);
    notify(`Generating and saving voice cues for ${key}…`, { duration: 6000 });
    $('build-voice-job').textContent = `Voice job ${submitted.jobId} queued…`;
    while (true) {
      const result = await api(`/api/puppet/jobs/${submitted.jobId}`); const job = result.job;
      $('build-voice-job').textContent = `${job.message || job.status} · step ${job.progress || 0}/${job.total || 4}`;
      if (job.status === 'completed') {
        const fallback = job.result?.fallback ? ` · MFA fallback: ${job.result.fallback}` : '';
        report(`Voice ready: ${key}.m4a + ${key}.cues.json · ${job.result?.cueCount || 0} cues · ${job.result?.aligner || 'aligner'}${fallback}. Available now in Speak mode.`);
        notify(`Saved ${key}.m4a and ${key}.cues.json.`, { kind: 'success', duration: 6500 });
        await refresh();
        await onVoiceReady?.(id, key);
        break;
      }
      if (job.status === 'failed') throw new Error(job.error || 'Voice cue generation failed');
      await sleep(1000);
    }
  }

  $('build-refresh').onclick = () => refresh().catch(fail);
  $('build-id').onchange = () => refresh().catch(fail);
  $('build-upload').onclick = () => saveSources().catch(fail);
  $('build-slice-visemes').onclick = () => sliceHeads().catch(fail);
  $('build-qwen-base').onclick = () => startQwen('base').catch(fail);
  $('build-qwen-heads').onclick = () => startQwen('visemes').catch(fail);
  $('build-qc-base').onclick = () => qcBody().catch(fail);
  $('build-finalize').onclick = () => finalize().catch(fail);
  $('build-voice-file').onchange = () => transcribeVoice().catch(fail);
  $('build-voice').onclick = () => buildVoice().catch(fail);
  $('build-open').onclick = () => onOpenCharacter(getId());
  refresh();

  return { refresh };
}

export const __test = { alphaStats, alphaBounds, sampleCornerColor, components, splitParts, sliceVisemeGrid, featureBox, registerVisemes, makeRig };
