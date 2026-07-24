// speech.js — native Speech workspace (WP-1d). Ports the "Speak" mode out of the
// legacy iframe (shared/js/stage/puppet-studio.html, mode=speech) into the shell
// contract: mount(host, ctx) -> cleanup. It drives the REAL puppet.js runtime +
// lipsync.js for WYSIWYG cue-driven viseme head-swaps, and shares its
// load/serialize/cue-edit/validation logic with the Node parity harness through
// the DOM-free speech-data.js module.
//
// Scope (matches what legacy speech could do, plus a character switcher):
//   - voice line list per character (from voice/manifest.json, or the
//     /api/studio/voices fallback), with audio playback;
//   - waveform + colored cue band editor: click to seek + preview the head at
//     that instant, drag a boundary to retime, edit viseme value / start / end,
//     split + delete cues, offsetMs (device-latency) adjustment;
//   - playback via the REAL runtime (driveLipsync + puppet.setViseme + talk/idle
//     body clips), full clip or a dragged selection range;
//   - transcript display, and (additive) voice upload -> Whisper transcribe ->
//     whisper-visemes (default) / MFA / Rhubarb cue generation, wired to the
//     NATIVE /api/studio/* endpoints with job polling. Cue edits save through
//     POST /api/studio/cues, byte-for-byte the same payload as legacy.
//
// WP-3e repointed this workspace onto the native /api/studio/* speech surface
// (voices/voice/cues/transcribe/jobs). The server still answers the identical
// /api/puppet/* routes as a frozen compat shim for the embedded legacy builder,
// but native workspaces no longer call them. All endpoint URLs come from
// speech-data.js helpers, so this file references /api/studio/* only.

import { createStage } from '../../stage/stage.js';
import { createPuppet, loadRigArt } from '../../stage/puppet.js';
import { driveLipsync, VISEME_IDENTITY, RHUBARB_TO_VISEME } from '../../stage/lipsync.js';
import { loadStudioObjects } from '../projects.js';
import { RIGGED_CHARACTERS } from './rig-data.js';
import {
  EDITOR_VISEMES, CUE_COLORS,
  voiceManifestPath, cuesSaveEndpoint, voicesEndpoint,
  voiceUploadEndpoint, transcribeEndpoint, jobEndpoint,
  loadManifest, manifestLines, resolveVoiceLines, cueLineKey,
  cueAtTime, buildCuesSavePayload, updateCue, splitCue, deleteCue, dragCueBoundary,
  validateCues,
} from './speech-data.js';

const REPO = new URL('../../../../', import.meta.url); // repo root from shared/js/studio/workspaces/
const charBase = (id) => new URL(`shared/characters/${id}/`, REPO).href;
const optionList = (items, selected) =>
  items.map(([value, label = value]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function mount(host, { params, toast }) {
  // Roster from the registry (type: character), falling back to the shared 8.
  let characterIds = RIGGED_CHARACTERS;
  try {
    const objects = await loadStudioObjects();
    const ids = objects.filter((o) => o.type === 'character').map((o) => o.id);
    if (ids.length) characterIds = ids;
  } catch { /* static preview without a registry read still uses the fallback */ }

  let charId = characterIds.includes(params.get('char')) ? params.get('char') : characterIds[0];
  let stage = null, PIXI = null, rig = null, factory = null, puppet = null;
  let manifest = null;                 // raw voice/manifest.json (parity/save target)
  let voiceLines = [];                 // resolveVoiceLines() runtime shape
  let lineIndex = 0;
  let audio = null, stopCues = null, speechOffset = 0;
  let artVersion = Date.now(), destroyed = false;
  let voiceToken = 0, voiceTranscriptFile = null, voiceTranscriptReady = false;
  const cueEditor = {
    lineIndex: -1, data: null, cues: [], buffer: null, selected: -1,
    duration: 0, seekTime: 0, drag: null, pointer: null, renderRAF: 0,
    selectionStart: null, selectionEnd: null, playEnd: null,
  };

  host.innerHTML = `
    <div class="workspace" data-workspace="speech">
      <style>
        [data-workspace="speech"] .workspace-inspector { min-width:360px; }
        [data-workspace="speech"] #cue-wave { width:100%; height:220px; background:#fff;
          border:2px solid var(--ink); touch-action:none; cursor:crosshair; }
        [data-workspace="speech"] .cue-fields { display:flex; gap:6px; flex-wrap:wrap; }
        [data-workspace="speech"] .cue-fields label { flex:1; min-width:88px; }
        [data-workspace="speech"] .cue-fields input, [data-workspace="speech"] .cue-fields select { width:100%; }
        [data-workspace="speech"] .cue-actions { flex-wrap:wrap; gap:6px; }
        [data-workspace="speech"] .cue-actions button { min-height:34px; padding:5px 10px; }
        [data-workspace="speech"] textarea { width:100%; min-height:56px; font:inherit; padding:6px 8px;
          border:2px solid var(--ink); resize:vertical; }
        [data-workspace="speech"] .transcript { background:#eef4fb; border:2px solid var(--ink);
          padding:8px 10px; min-height:1.4em; }
        [data-workspace="speech"] .upload-panel { border-top:3px solid var(--ink); }
        [data-workspace="speech"] .job-line { font:600 12px ui-monospace,monospace; min-height:1.2em; }
      </style>
      <div class="workspace-tools">
        <label style="flex-direction:row;align-items:center;gap:6px">Character<select data-char>${optionList(characterIds.map((id) => [id, id]), charId)}</select></label>
        <label style="flex-direction:row;align-items:center;gap:6px">Voice line<select data-voice style="min-width:170px"></select></label>
        <button data-speak class="save" title="Space">▶ Speak</button>
        <button data-stop class="ghost" title="Stop">■</button>
        <span style="flex:1"></span>
        <label style="flex-direction:row;align-items:center;gap:6px">Offset
          <input type="range" data-offset min="-100" max="400" step="10" value="0" style="width:120px">
          <span class="hint" data-offlabel>0 ms</span></label>
      </div>
      <div class="workspace-canvas" data-stage><span class="canvas-badge" data-badge>Speech · live puppet · viseme heads follow the cues</span></div>
      <aside class="workspace-inspector">
        <div class="panel-section">
          <h2>Transcript</h2>
          <p class="transcript" data-transcript>—</p>
        </div>
        <div class="panel-section">
          <h2>Waveform cue editor</h2>
          <canvas data-wave id="cue-wave" width="880" height="360" aria-label="Voice waveform and editable viseme cues"></canvas>
          <p class="hint" data-readout>Choose a voice line to load its cues.</p>
          <p class="hint" data-selreadout>Drag across the waveform to select a playback range.</p>
          <div class="cue-fields">
            <label>viseme<select data-cue-value></select></label>
            <label>start<input data-cue-start type="number" min="0" step="0.001"></label>
            <label>end<input data-cue-end type="number" min="0" step="0.001"></label>
          </div>
          <div class="row cue-actions">
            <button data-cue-add class="ghost">Split cue</button>
            <button data-cue-delete class="ghost">Delete cue</button>
            <button data-cue-save class="save">▣ Save cues</button>
          </div>
          <div class="row cue-actions">
            <button data-cue-play class="warn">▶ Play selection</button>
            <button data-cue-clear class="ghost">Clear selection</button>
          </div>
          <p class="hint">Click to seek and preview the head. Drag across the wave to highlight a playback range. In the colored band, click a cue or drag a boundary to retime neighbouring shapes. Offset compensates device latency; saving preserves acoustic cue times.</p>
        </div>
        <div class="panel-section upload-panel">
          <h2>Add / regenerate voice</h2>
          <div class="row">
            <label style="flex:1">line id<input data-up-key value="intro" pattern="[a-z][a-z0-9-]*"></label>
            <label style="flex:1">label<input data-up-label value="Intro"></label>
          </div>
          <label>WAV or MP3<input data-up-file type="file" accept=".wav,.mp3,audio/wav,audio/mpeg"></label>
          <label>Transcript (review & edit)<textarea data-up-text disabled placeholder="Choose audio to transcribe"></textarea></label>
          <div class="row">
            <label style="flex:1">aligner<select data-up-aligner><option value="whisper">whisper-visemes · default</option><option value="mfa">MFA · upgrade (if installed)</option><option value="rhubarb">Rhubarb · fallback</option></select></label>
            <label style="flex:1">lead ms<input data-up-lead type="number" value="-40" min="-200" max="400" step="10"></label>
          </div>
          <label class="row"><input type="checkbox" data-up-overwrite style="width:auto"> allow replacing an existing line</label>
          <div class="row cue-actions"><button data-up-go class="warn" disabled>Generate cues + save voice</button></div>
          <p class="job-line" data-up-job></p>
          <p class="hint">Selecting audio runs Whisper. MFA aligns the reviewed transcript to phones; Rhubarb is the fast fallback. The M4A + editable cues save under shared/characters/&lt;id&gt;/voice/ and appear in the voice list.</p>
        </div>
      </aside>
    </div>`;

  const el = (sel) => host.querySelector(sel);
  const stageHost = el('[data-stage]');
  const fail = (error) => { console.error(error); toast(error.message, { error: true, duration: 7000 }); };
  const currentLine = () => voiceLines[lineIndex] || null;
  const lineMap = (line) => (line?.cueMap === 'rhubarb' ? RHUBARB_TO_VISEME : VISEME_IDENTITY);

  // ---- puppet placement ------------------------------------------------------
  function placePuppet() {
    if (!puppet || !stage) return;
    const { width: w, height: h } = stage.app.screen;
    puppet.view.scale.set(Math.min(w, h) / (rig.canvas || 1024) * 0.9);
    puppet.view.position.set(w / 2, h * 0.54);
  }

  // ---- waveform cue editor (ported from legacy) ------------------------------
  function cueCanvasMetrics() {
    const canvas = el('[data-wave]'); const rect = canvas.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    const width = Math.max(320, Math.round(rect.width * dpr));
    const height = Math.max(180, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    return { canvas, width, height, dpr };
  }
  function cueTimeAtEvent(event) {
    const rect = el('[data-wave]').getBoundingClientRect();
    return Math.max(0, Math.min(cueEditor.duration, (event.clientX - rect.left) / rect.width * cueEditor.duration));
  }
  function previewVisemeAt(point) {
    if (!puppet) return;
    const cue = cueAtTime(cueEditor.cues, point, cueEditor.duration), map = lineMap(currentLine());
    puppet.setViseme(cue ? (map[cue.value] || cue.value || 'rest') : 'rest');
  }
  function updateSelectionReadout() {
    const start = cueEditor.selectionStart, end = cueEditor.selectionEnd;
    const valid = Number.isFinite(start) && Number.isFinite(end) && end - start >= 0.02;
    el('[data-cue-play]').disabled = !valid;
    el('[data-cue-clear]').disabled = !valid;
    el('[data-selreadout]').textContent = valid
      ? `Selected ${start.toFixed(3)}–${end.toFixed(3)}s · ${(end - start).toFixed(3)}s`
      : 'Drag across the waveform to select a playback range.';
  }
  function setTimelinePoint(point, { select = true } = {}) {
    cueEditor.seekTime = Math.max(0, Math.min(cueEditor.duration, point));
    const index = cueEditor.cues.findIndex((cue) => cueEditor.seekTime >= cue.start && cueEditor.seekTime < cue.end);
    if (select) selectCue(index); else renderCueEditor();
    previewVisemeAt(cueEditor.seekTime);
  }

  function renderCueEditor() {
    const { canvas, width, height, dpr } = cueCanvasMetrics(); const context = canvas.getContext('2d');
    context.clearRect(0, 0, width, height); context.fillStyle = '#fff'; context.fillRect(0, 0, width, height);
    const duration = cueEditor.duration || 1;
    const waveBottom = Math.round(height * 0.62), bandTop = waveBottom + 5 * dpr;
    context.strokeStyle = '#c5c5c0'; context.lineWidth = Math.max(1, dpr);
    context.beginPath(); context.moveTo(0, waveBottom / 2); context.lineTo(width, waveBottom / 2); context.stroke();
    if (cueEditor.buffer) {
      const samples = cueEditor.buffer.getChannelData(0); const step = Math.max(1, Math.floor(samples.length / width));
      context.strokeStyle = '#111'; context.lineWidth = Math.max(1, dpr); context.beginPath();
      for (let x = 0; x < width; x += 1) {
        let min = 1, max = -1; const start = x * step;
        for (let i = start; i < Math.min(samples.length, start + step); i += 1) { min = Math.min(min, samples[i]); max = Math.max(max, samples[i]); }
        const y1 = waveBottom * (0.5 - max * 0.44), y2 = waveBottom * (0.5 - min * 0.44);
        context.moveTo(x + 0.5, y1); context.lineTo(x + 0.5, y2);
      }
      context.stroke();
    }
    cueEditor.cues.forEach((cue, index) => {
      const x = cue.start / duration * width, right = cue.end / duration * width;
      context.fillStyle = CUE_COLORS[cue.value] || '#ddd'; context.fillRect(x, bandTop, Math.max(1, right - x), height - bandTop);
      context.strokeStyle = index === cueEditor.selected ? '#111' : 'rgba(17,17,17,.45)';
      context.lineWidth = index === cueEditor.selected ? 3 * dpr : dpr; context.strokeRect(x, bandTop, Math.max(1, right - x), height - bandTop);
      if (right - x > 25 * dpr) {
        context.fillStyle = '#111'; context.font = `900 ${10 * dpr}px ui-monospace,monospace`;
        context.fillText(String(cue.value).toUpperCase(), x + 4 * dpr, bandTop + 15 * dpr);
      }
    });
    if (Number.isFinite(cueEditor.selectionStart) && Number.isFinite(cueEditor.selectionEnd)
        && cueEditor.selectionEnd > cueEditor.selectionStart) {
      const x = cueEditor.selectionStart / duration * width;
      const right = cueEditor.selectionEnd / duration * width;
      context.fillStyle = 'rgba(43,132,255,.20)'; context.fillRect(x, 0, right - x, height);
      context.strokeStyle = '#176bc1'; context.lineWidth = 2 * dpr; context.strokeRect(x, dpr, right - x, height - 2 * dpr);
      context.fillStyle = '#176bc1'; context.fillRect(x - 2 * dpr, 0, 4 * dpr, height);
      context.fillRect(right - 2 * dpr, 0, 4 * dpr, height);
    }
    const playTime = audio && !audio.paused ? audio.currentTime : cueEditor.seekTime;
    const playX = Math.max(0, Math.min(width, playTime / duration * width));
    context.strokeStyle = '#ff281d'; context.lineWidth = 2 * dpr; context.beginPath();
    context.moveTo(playX, 0); context.lineTo(playX, height); context.stroke();
    if (audio && !audio.paused && Number.isFinite(cueEditor.playEnd) && audio.currentTime >= cueEditor.playEnd - 0.005) {
      stopSpeech({ previewTime: cueEditor.playEnd });
    } else if (audio && !audio.paused) cueEditor.renderRAF = requestAnimationFrame(renderCueEditor);
    else cueEditor.renderRAF = 0;
  }

  function selectCue(index) {
    cueEditor.selected = Math.max(-1, Math.min(cueEditor.cues.length - 1, index));
    const cue = cueEditor.cues[cueEditor.selected];
    el('[data-cue-value]').disabled = !cue; el('[data-cue-start]').disabled = !cue; el('[data-cue-end]').disabled = !cue;
    el('[data-cue-delete]').disabled = !cue; el('[data-cue-add]').disabled = !cue;
    if (cue) {
      el('[data-cue-value]').value = cue.value; el('[data-cue-start]').value = cue.start.toFixed(3); el('[data-cue-end]').value = cue.end.toFixed(3);
      el('[data-readout]').textContent = `Cue ${cueEditor.selected + 1}/${cueEditor.cues.length} · ${cue.phone || cue.sourceValue || 'edited'} → ${cue.value} · ${(cue.end - cue.start).toFixed(3)}s`;
    } else el('[data-readout]').textContent = cueEditor.cues.length ? 'Click a cue to edit it.' : 'No cues loaded.';
    renderCueEditor();
  }

  async function loadCueEditor() {
    const line = voiceLines[lineIndex];
    if (!line) { cueEditor.lineIndex = -1; cueEditor.data = null; cueEditor.cues = []; cueEditor.buffer = null; selectCue(-1); return; }
    el('[data-readout]').textContent = 'Loading waveform and cues…';
    const base = charBase(charId);
    const [cueResponse, audioResponse] = await Promise.all([
      fetch(base + line.cues, { cache: 'no-store' }), fetch(base + line.audio, { cache: 'no-store' }),
    ]);
    if (!cueResponse.ok || !audioResponse.ok) throw new Error('Could not load voice waveform or cues');
    const data = await cueResponse.json(); const encoded = await audioResponse.arrayBuffer();
    if (destroyed || line !== voiceLines[lineIndex]) return;   // char/line switched mid-load
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    try { cueEditor.buffer = await context.decodeAudioData(encoded.slice(0)); } finally { context.close(); }
    cueEditor.lineIndex = lineIndex; cueEditor.data = data;
    cueEditor.cues = (data.mouthCues || []).map((cue) => ({ ...cue }));   // spread copy — same load path as parity
    cueEditor.duration = data.metadata?.duration || cueEditor.buffer.duration || cueEditor.cues.at(-1)?.end || 0;
    cueEditor.seekTime = 0; cueEditor.selectionStart = null; cueEditor.selectionEnd = null; cueEditor.playEnd = null;
    updateSelectionReadout(); el('[data-cue-save]').disabled = false;
    selectCue(cueEditor.cues.length ? 0 : -1);
    previewVisemeAt(0);
  }

  function updateSelectedCue() {
    const cue = cueEditor.cues[cueEditor.selected]; if (!cue) return;
    updateCue(cueEditor.cues, cueEditor.selected,
      { value: el('[data-cue-value]').value, start: +el('[data-cue-start]').value, end: +el('[data-cue-end]').value },
      cueEditor.duration);
    el('[data-cue-start]').value = cue.start.toFixed(3); el('[data-cue-end]').value = cue.end.toFixed(3);
    selectCue(cueEditor.selected);
    previewVisemeAt(cueEditor.seekTime);
  }
  function splitSelectedCue() {
    const next = splitCue(cueEditor.cues, cueEditor.selected, cueEditor.seekTime);
    if (next < 0) return;
    selectCue(next); previewVisemeAt(cueEditor.seekTime);
  }
  function deleteSelectedCue() {
    if (cueEditor.selected < 0) return;
    const next = deleteCue(cueEditor.cues, cueEditor.selected);
    selectCue(next); previewVisemeAt(cueEditor.seekTime);
  }

  // The exact payload a save would POST (no write here — see debug hooks).
  function cuesPayload() {
    return buildCuesSavePayload(cueEditor.data?.metadata, cueEditor.cues, cueEditor.duration);
  }
  async function saveCueEditor() {
    const line = currentLine(); const key = cueLineKey(line);
    if (!line || !key || cueEditor.lineIndex !== lineIndex) throw new Error('Load a voice line before saving cues.');
    const check = validateCues(cuesPayload());
    if (!check.ok) throw new Error(`Cues are invalid: ${check.errors[0]}`);
    const response = await fetch(cuesSaveEndpoint(charId, key), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuesPayload()),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || response.statusText);
    cueEditor.data = cuesPayload();
    toast(`Saved ${result.cueCount} edited cues to ${key}.cues.json.`);
  }

  function cuePointerDown(event) {
    if (!cueEditor.duration) return;
    const canvas = el('[data-wave]'), rect = canvas.getBoundingClientRect();
    const timeAtPointer = cueTimeAtEvent(event), canvasWidth = rect.width;
    const tolerance = cueEditor.duration * 8 / canvasWidth;
    const inCueBand = (event.clientY - rect.top) / rect.height >= 0.62;
    let boundary = null;
    if (inCueBand) cueEditor.cues.forEach((cue, index) => {
      for (const edge of ['start', 'end']) if (!boundary || Math.abs(cue[edge] - timeAtPointer) < boundary.distance) {
        boundary = { index, edge, distance: Math.abs(cue[edge] - timeAtPointer) };
      }
    });
    if (audio && !audio.paused) stopSpeech({ previewTime: timeAtPointer });
    setTimelinePoint(timeAtPointer);
    if (inCueBand && boundary && boundary.distance <= tolerance) {
      cueEditor.drag = { index: boundary.index, edge: boundary.edge };
      canvas.setPointerCapture(event.pointerId);
    } else if (!inCueBand) {
      cueEditor.pointer = { anchor: timeAtPointer, moved: false };
      cueEditor.selectionStart = timeAtPointer; cueEditor.selectionEnd = timeAtPointer;
      updateSelectionReadout(); canvas.setPointerCapture(event.pointerId);
    }
    renderCueEditor();
  }
  function cuePointerMove(event) {
    if (cueEditor.pointer) {
      const point = cueTimeAtEvent(event), anchor = cueEditor.pointer.anchor;
      cueEditor.pointer.moved ||= Math.abs(point - anchor) >= Math.max(0.01, cueEditor.duration * 3 / el('[data-wave]').getBoundingClientRect().width);
      cueEditor.selectionStart = Math.min(anchor, point); cueEditor.selectionEnd = Math.max(anchor, point);
      setTimelinePoint(point); updateSelectionReadout(); return;
    }
    const drag = cueEditor.drag; if (!drag) return;
    const cue = cueEditor.cues[drag.index]; if (!cue) return;
    const timeAtPointer = cueTimeAtEvent(event);
    dragCueBoundary(cueEditor.cues, drag.index, drag.edge, timeAtPointer, cueEditor.duration);
    cueEditor.seekTime = timeAtPointer; selectCue(drag.index); previewVisemeAt(timeAtPointer);
  }
  function cuePointerUp(event) {
    const canvas = el('[data-wave]');
    if (cueEditor.pointer && !cueEditor.pointer.moved) { cueEditor.selectionStart = null; cueEditor.selectionEnd = null; }
    cueEditor.pointer = null; cueEditor.drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    updateSelectionReadout(); renderCueEditor();
  }
  function clearCueSelection() {
    cueEditor.selectionStart = null; cueEditor.selectionEnd = null;
    updateSelectionReadout(); renderCueEditor();
  }

  // ---- playback (real puppet.js + lipsync.js runtime) ------------------------
  function stopSpeech({ previewTime = null } = {}) {
    const point = Number.isFinite(previewTime) ? previewTime : cueEditor.seekTime;
    if (stopCues) { stopCues(); stopCues = null; }
    if (audio) { audio.pause(); audio = null; }
    cueEditor.playEnd = null;
    if (cueEditor.renderRAF) { cancelAnimationFrame(cueEditor.renderRAF); cueEditor.renderRAF = 0; }
    if (Number.isFinite(previewTime)) { cueEditor.seekTime = point; previewVisemeAt(point); }
    else if (puppet) puppet.setViseme('rest');
    el('[data-speak]').classList.remove('on');
    renderCueEditor();
  }
  async function playVoiceRange(start = 0, end = null) {
    stopSpeech();
    const v = voiceLines[lineIndex];
    if (!v) { toast(`No voice clip for ${charId}`, { error: true }); return; }
    const base = charBase(charId);
    let cues;
    try {
      cues = cueEditor.lineIndex === lineIndex && cueEditor.cues.length
        ? cueEditor.cues : (await (await fetch(base + v.cues, { cache: 'no-store' })).json()).mouthCues;
    } catch { toast(`Cues not found: ${v.cues}`, { error: true }); return; }
    audio = new Audio(base + v.audio);
    await new Promise((resolve, reject) => {
      if (audio.readyState >= 1) return resolve();
      audio.addEventListener('loadedmetadata', resolve, { once: true });
      audio.addEventListener('error', () => reject(new Error('Could not load voice audio.')), { once: true });
      audio.load();
    });
    cueEditor.seekTime = Math.max(0, Math.min(audio.duration || cueEditor.duration, start));
    cueEditor.playEnd = Number.isFinite(end) ? Math.max(cueEditor.seekTime, Math.min(end, audio.duration || cueEditor.duration)) : null;
    if (cueEditor.seekTime > 0.001) {
      await new Promise((resolve, reject) => {
        audio.addEventListener('seeked', resolve, { once: true });
        audio.addEventListener('error', () => reject(new Error('Could not seek voice audio.')), { once: true });
        audio.currentTime = cueEditor.seekTime;
      });
    } else audio.currentTime = 0;
    el('[data-speak]').classList.add('on');
    if (rig.clips?.talk) puppet.playClip('talk');
    stopCues = driveLipsync(puppet, audio, cues, { offsetMs: speechOffset + (v.offsetMs || 0), map: lineMap(v) });
    audio.addEventListener('ended', () => {
      el('[data-speak]').classList.remove('on'); cueEditor.seekTime = cueEditor.duration; cueEditor.playEnd = null; renderCueEditor();
      if (rig.clips?.idle) puppet.playClip('idle');
    }, { once: true });
    await audio.play().then(() => renderCueEditor()).catch((e) => toast(`Audio blocked: ${e.message}`, { error: true }));
  }
  const speak = () => playVoiceRange(0, null);
  async function playCueSelection() {
    const start = cueEditor.selectionStart, end = cueEditor.selectionEnd;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 0.02) return;
    return playVoiceRange(start, end);
  }

  // ---- voice line + character load ------------------------------------------
  function refreshVoiceSelect() {
    const vs = el('[data-voice]');
    vs.innerHTML = voiceLines.length
      ? voiceLines.map((v, i) => `<option value="${i}">${v.label}</option>`).join('')
      : '<option>(no voice clips yet)</option>';
    if (lineIndex >= voiceLines.length) lineIndex = 0;
    vs.value = String(lineIndex);
  }
  function syncTranscript() {
    el('[data-transcript]').textContent = currentLine()?.text || '—';
  }
  async function selectLine(id) {
    const idx = typeof id === 'number' ? id
      : voiceLines.findIndex((v) => v.id === id || v.label === id);
    if (idx < 0 || idx >= voiceLines.length) return;
    stopSpeech();
    lineIndex = idx;
    el('[data-voice]').value = String(idx);
    syncTranscript();
    await loadCueEditor().catch((error) => toast(`Could not load cue editor: ${error.message}`, { error: true }));
  }

  async function discoverVoiceLines() {
    const base = charBase(charId);
    manifest = null; let lines = [];
    try {
      const response = await fetch(base + 'voice/manifest.json', { cache: 'no-store' });
      if (response.ok) { manifest = loadManifest(await response.text()); lines = manifestLines(manifest); }
    } catch { /* a static character may not have a voice manifest yet */ }
    if (!lines.length) {
      try {
        const response = await fetch(voicesEndpoint(charId), { cache: 'no-store' });
        if (response.ok) { const data = await response.json(); lines = data.voices || []; if (!manifest) manifest = { schemaVersion: 1, lines }; }
      } catch { /* ordinary static server without the authoring API */ }
    }
    voiceLines = resolveVoiceLines(lines);
  }

  async function loadCharacter(id) {
    stopSpeech();
    charId = characterIds.includes(id) ? id : characterIds[0];
    el('[data-char]').value = charId;
    params.set('char', charId);
    const next = new URL(location.href); next.searchParams.set('char', charId); history.replaceState(null, '', next);
    const base = charBase(charId);
    const text = await (await fetch(`${base}rig.json?v=${artVersion}`, { cache: 'no-store' })).text();
    rig = JSON.parse(text);
    factory = await loadRigArt(PIXI, rig, base, 1, artVersion);
    await discoverVoiceLines();
    if (destroyed) return;
    if (puppet) puppet.destroy();
    puppet = createPuppet(PIXI, rig, { partFactory: factory });
    puppet.stopClip();
    stage.root.addChildAt(puppet.view, 0);
    placePuppet();
    if (rig.clips?.idle) puppet.playClip('idle');
    lineIndex = 0;
    refreshVoiceSelect();
    syncTranscript();
    cueEditor.lineIndex = -1;
    await loadCueEditor().catch((error) => toast(`Could not load cue editor: ${error.message}`, { error: true }));
    el('[data-badge]').textContent = `Speech · ${charId} · ${voiceLines.length} voice line${voiceLines.length === 1 ? '' : 's'}`;
  }

  // ---- voice upload (additive; native /api/studio/* endpoints) ---------------
  async function pollJob(jobId, onTick, intervalMs) {
    while (true) {
      const response = await fetch(jobEndpoint(jobId), { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'job lookup failed');
      const job = body.job;
      if (onTick) onTick(job);
      if (job.status === 'completed') return job;
      if (job.status === 'failed') throw new Error(job.error || 'job failed');
      await sleep(intervalMs);
    }
  }
  async function transcribeVoice() {
    const file = el('[data-up-file]').files[0];
    const text = el('[data-up-text]'); const button = el('[data-up-go]');
    const token = ++voiceToken;
    voiceTranscriptFile = file || null; voiceTranscriptReady = false;
    button.disabled = true; text.disabled = true;
    if (!file) { text.value = ''; text.placeholder = 'Choose audio to transcribe'; el('[data-up-job]').textContent = ''; return; }
    const format = file.name.toLowerCase().split('.').pop();
    if (!['wav', 'mp3'].includes(format)) throw new Error('Voice sample must be WAV or MP3.');
    text.value = 'Transcribing…'; el('[data-up-job]').textContent = 'Uploading audio to Whisper…';
    try {
      const response = await fetch(transcribeEndpoint(format), { method: 'POST', body: file });
      const submitted = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(submitted.error || `${response.status} ${response.statusText}`);
      const job = await pollJob(submitted.jobId, (j) => {
        if (token === voiceToken) el('[data-up-job]').textContent = j.message || j.status;
      }, 750);
      if (token !== voiceToken) return;
      text.value = job.result?.transcript || '';
      text.disabled = false; button.disabled = false; voiceTranscriptReady = true;
      el('[data-up-job]').textContent = 'Transcript ready — review or edit it, then generate cues.';
    } catch (error) {
      if (token === voiceToken) {
        text.value = ''; text.placeholder = 'Transcription failed — enter the spoken text manually';
        text.disabled = false; button.disabled = false; voiceTranscriptReady = true;
        el('[data-up-job]').textContent = 'Whisper failed; enter or correct the transcript manually.';
      }
      throw error;
    }
  }
  async function buildVoice() {
    const file = el('[data-up-file]').files[0];
    if (!file) throw new Error('Choose a WAV or MP3 voice sample first.');
    if (!voiceTranscriptReady || voiceTranscriptFile !== file || el('[data-up-text]').disabled) {
      throw new Error('Wait for Whisper transcription to finish before generating cues.');
    }
    const format = file.name.toLowerCase().split('.').pop();
    if (!['wav', 'mp3'].includes(format)) throw new Error('Voice sample must be WAV or MP3.');
    const key = el('[data-up-key]').value.trim();
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(key)) throw new Error('Voice line id must be lowercase kebab-case.');
    const endpoint = voiceUploadEndpoint(charId, key, {
      format, label: el('[data-up-label]').value.trim() || key,
      transcript: el('[data-up-text]').value.trim(), overwrite: String(el('[data-up-overwrite]').checked),
      aligner: el('[data-up-aligner]').value,
      leadMs: String(Math.max(-200, Math.min(400, +el('[data-up-lead]').value || 0))),
    });
    const response = await fetch(endpoint, { method: 'POST', body: file });
    const submitted = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(submitted.error || `${response.status} ${response.statusText}`);
    el('[data-up-job]').textContent = `Voice job ${submitted.jobId} queued…`;
    const job = await pollJob(submitted.jobId, (j) => {
      el('[data-up-job]').textContent = `${j.message || j.status} · step ${j.progress || 0}/${j.total || 4}`;
    }, 1000);
    toast(`Saved ${key}.m4a + ${key}.cues.json · ${job.result?.cueCount || 0} cues.`);
    await discoverVoiceLines();
    refreshVoiceSelect();
    await selectLine(voiceLines.findIndex((v) => v.id === key) >= 0 ? voiceLines.findIndex((v) => v.id === key) : lineIndex);
  }

  // ---- wiring ----------------------------------------------------------------
  function wire() {
    el('[data-char]').onchange = (e) => loadCharacter(e.target.value).catch(fail);
    el('[data-voice]').onchange = (e) => selectLine(+e.target.value).catch(fail);
    el('[data-speak]').onclick = () => speak().catch(fail);
    el('[data-stop]').onclick = () => stopSpeech({ previewTime: audio?.currentTime ?? cueEditor.seekTime });
    el('[data-offset]').oninput = (e) => { speechOffset = +e.target.value; el('[data-offlabel]').textContent = `${speechOffset} ms`; };
    for (const value of EDITOR_VISEMES) {
      const option = document.createElement('option'); option.value = option.textContent = value; el('[data-cue-value]').appendChild(option);
    }
    el('[data-cue-value]').onchange = updateSelectedCue;
    el('[data-cue-start]').onchange = updateSelectedCue;
    el('[data-cue-end]').onchange = updateSelectedCue;
    el('[data-cue-add]').onclick = splitSelectedCue;
    el('[data-cue-delete]').onclick = deleteSelectedCue;
    el('[data-cue-save]').onclick = () => saveCueEditor().catch((error) => toast(`Could not save cues: ${error.message}`, { error: true, duration: 7000 }));
    el('[data-cue-play]').onclick = () => playCueSelection().catch(fail);
    el('[data-cue-clear]').onclick = clearCueSelection;
    const wave = el('[data-wave]');
    wave.addEventListener('pointerdown', cuePointerDown);
    wave.addEventListener('pointermove', cuePointerMove);
    wave.addEventListener('pointerup', cuePointerUp);
    wave.addEventListener('pointercancel', cuePointerUp);
    el('[data-up-file]').onchange = () => transcribeVoice().catch(fail);
    el('[data-up-go]').onclick = () => buildVoice().catch(fail);
    el('[data-cue-play]').disabled = true; el('[data-cue-clear]').disabled = true; el('[data-cue-save]').disabled = true;
  }

  // ---- boot ------------------------------------------------------------------
  stage = await createStage(stageHost);
  if (destroyed) { stage.destroy(); return () => {}; }
  PIXI = stage.PIXI;

  wire();
  await loadCharacter(charId);
  stage.onResize(() => { placePuppet(); renderCueEditor(); });

  const onResize = () => renderCueEditor();
  window.addEventListener('resize', onResize);
  const onKey = (e) => {
    if (e.key === ' ' && !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target.tagName)) {
      e.preventDefault();
      if (audio && !audio.paused) stopSpeech({ previewTime: audio.currentTime });
      else if (!el('[data-cue-play]').disabled) playCueSelection().catch(fail);
      else speak().catch(fail);
    }
  };
  window.addEventListener('keydown', onKey);

  // Debug surface for browser automation (parity + A/V verification drive these).
  window.QLOBE_STUDIO_DEBUG = {
    workspace: 'speech',
    loadCharacter: (id) => loadCharacter(id),
    getManifestContent: () => manifest,                       // raw voice/manifest.json (no-op parity target)
    getLines: () => voiceLines.map((v) => ({ id: v.id, label: v.label, cues: v.cues, audio: v.audio, offsetMs: v.offsetMs })),
    selectLine: (id) => selectLine(id),
    getCuesContent: (lineId) => {                             // exact object save() would POST for the LOADED line
      if (lineId != null && cueLineKey(currentLine()) !== lineId && currentLine()?.id !== lineId) {
        return { error: `line "${lineId}" is not loaded — call selectLine("${lineId}") first` };
      }
      return cuesPayload();
    },
    noopSaveCues: (lineId) => {                               // { endpoint, payload } — NO write
      if (lineId != null && currentLine()?.id !== lineId) return { error: `select line "${lineId}" first` };
      return { endpoint: cuesSaveEndpoint(charId, cueLineKey(currentLine())), payload: cuesPayload() };
    },
    validate: () => validateCues(cuesPayload()),
    play: () => speak(),
    playSelection: () => playCueSelection(),
    stop: () => stopSpeech(),
    scrubToCue: (i) => {
      const cue = cueEditor.cues[i]; if (!cue) return null;
      setTimelinePoint(cue.start); return { index: i, start: cue.start, value: cue.value };
    },
    getCurrentViseme: () => (puppet ? puppet.getState().viseme : null),
    getState: () => ({
      char: charId, lineId: currentLine()?.id ?? null, lineIndex,
      lineCount: voiceLines.length, cueCount: cueEditor.cues.length, selectedCue: cueEditor.selected,
      seekTime: cueEditor.seekTime, duration: cueEditor.duration, offsetMs: speechOffset,
      playing: !!audio && !audio.paused,
    }),
  };

  return () => {
    destroyed = true;
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    stopSpeech();
    if (cueEditor.renderRAF) cancelAnimationFrame(cueEditor.renderRAF);
    if (puppet) puppet.destroy();
    stage?.destroy();
    if (window.QLOBE_STUDIO_DEBUG?.workspace === 'speech') delete window.QLOBE_STUDIO_DEBUG;
  };
}
