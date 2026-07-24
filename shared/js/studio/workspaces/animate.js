// animate.js — native Animate workspace (WP-1c). Ports the animate mode out of
// the legacy iframe (shared/js/stage/puppet-studio.html, mode=animate) into the
// shell contract: mount(host, ctx) -> cleanup. It drives the REAL puppet.js
// runtime for playback (respecting prefers-reduced-motion) and shares its
// load/serialize/clip-resolution logic with the Node parity harness through the
// DOM-free rig-data.js + animate-data.js modules.
//
// Scope (matches what legacy animate could do, plus a character switcher):
//   - clip select: the character's own rig clips (editable) plus resolved
//     shared-pack clips (read-only "inherited" previews);
//   - timeline scrub + play/pause on the real puppet.js runtime;
//   - keyframe inspection/editing for a clip track (t, v, ease), Set/Del key,
//     drag-to-pose a limb (rotate/move) at the current frame;
//   - duration + loop editing; undo; copy JSON; save (authoring server) and
//     export (static fallback).
// Inherited pack clips are NEVER materialized into rig.json (parity + reuse).

import { createStage } from '../../stage/stage.js';
import { createPuppet, loadRigArt } from '../../stage/puppet.js';
import { sampleTrack } from '../../stage/spline.js';
import { ease } from '../../stage/tween.js';
import { saveDocument, downloadDocument } from '../api.js';
import { loadStudioObjects } from '../projects.js';
import {
  loadRig, getBone, getPart, propsFor,
  RIGGED_CHARACTERS, rigDocumentPath,
} from './rig-data.js';
import {
  CLIP_PACK_FILES, resolveClips, classifyClips, isLocalClip,
  round3, setKeyOn, delKeyAt, clipKeyTimes,
} from './animate-data.js';

const REPO = new URL('../../../../', import.meta.url); // repo root from shared/js/studio/workspaces/
const charBase = (id) => new URL(`shared/characters/${id}/`, REPO).href;
const packUrl = (file) => new URL(`shared/characters/${file}`, REPO).href;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const optionList = (items, selected) =>
  items.map(([value, label = value]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('');

// Ease names offered per key (mirrors the legacy EASES list; '' = auto/spline).
const EASES = ['', 'linear', 'outQuad', 'outCubic', 'inOutSine', 'outBack', 'outElastic'];

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
  let overlay = null, gizmo = null;
  const packs = { defaultClips: {}, actingClips: {} }; // loaded once, shared for every character
  let resolved = {};                 // resolveClips(rig, packs) — recomputed per character load
  let clip = null;                   // current clip name (local OR inherited)
  let time = 0;                      // 0..1 across the current clip
  let selBone = null, prop = 'rotation', lockSel = false, dragMode = 'rot';
  let playing = false, playRAF = 0, playStart = 0;
  let drag = null;                   // { id, kind, ... } while posing on the canvas
  let artVersion = Date.now(), destroyed = false;
  const undoStack = [];

  host.innerHTML = `
    <div class="workspace" data-workspace="animate">
      <style>
        [data-workspace="animate"] #ticks { position:relative; height:16px; margin:2px 0; }
        [data-workspace="animate"] #ticks .k { position:absolute; top:2px; width:11px; height:11px;
          background:#ff3b3b; border:1px solid #fff; cursor:pointer;
          transform:translateX(-50%) rotate(45deg); }
        [data-workspace="animate"] #ticks .k:hover { background:#ff6b6b; }
        [data-workspace="animate"] #ticks .k.ghost { background:transparent; border:1px dashed #ff3b3b; opacity:.5; }
        [data-workspace="animate"] #keylist { display:flex; flex-direction:column; gap:4px; }
        [data-workspace="animate"] .key { display:flex; gap:4px; align-items:center; background:#e7eff9;
          border:2px solid var(--ink); padding:3px 5px; }
        [data-workspace="animate"] .key input[type=number] { width:78px; }
        [data-workspace="animate"] .key select { max-width:78px; padding:3px 4px; }
        [data-workspace="animate"] .key button { min-height:30px; padding:4px 8px; }
        [data-workspace="animate"] .seg { display:flex; border:2px solid var(--ink); }
        [data-workspace="animate"] .seg button { border:0; border-right:2px solid var(--ink);
          background:var(--white); color:var(--ink); min-height:34px; }
        [data-workspace="animate"] .seg button:last-child { border-right:0; }
        [data-workspace="animate"] .seg button.on { background:var(--yellow); }
        [data-workspace="animate"] .inherited-note { background:#fff3cf; border:2px solid var(--ink); padding:6px 8px; }
        [data-workspace="animate"] optgroup { font-weight:900; }
      </style>
      <div class="workspace-tools">
        <label style="flex-direction:row;align-items:center;gap:6px">Character<select data-char>${optionList(characterIds.map((id) => [id, id]), charId)}</select></label>
        <label style="flex-direction:row;align-items:center;gap:6px">Clip<select data-clip style="min-width:150px"></select></label>
        <button data-play class="save" title="Space">▶ Play</button>
        <button data-stop class="ghost" title="Stop">■</button>
        <span style="flex:1"></span>
        <button data-undo class="ghost" title="Ctrl+Z">⟲ Undo</button>
        <button data-reset class="ghost">Reset</button>
        <button data-copy class="ghost">Copy JSON</button>
        <button data-save class="save">▣ Save rig</button>
        <button data-export class="warn">⬇ Export rig.json</button>
      </div>
      <div class="workspace-canvas" data-stage><span class="canvas-badge" data-badge>Animate · live puppet</span></div>
      <aside class="workspace-inspector">
        <div class="panel-section" data-inherited hidden>
          <p class="inherited-note hint" style="margin:0">Inherited from a shared clip pack — read-only. Acting-pack clips resolve at runtime via theater.js. Editing them here is intentionally not offered (a rig-tuned copy already wins at runtime); duplicating one into rig.json would break reuse.</p>
        </div>
        <div class="panel-section">
          <h2>Timeline</h2>
          <input type="range" data-time min="0" max="1000" value="0">
          <div id="ticks" data-ticks></div>
          <div class="row"><span class="hint" data-tlabel>t = 0.000</span></div>
          <div class="field-grid">
            <label>Duration ms<input type="number" step="50" data-dur></label>
            <label class="row" style="align-self:end"><input type="checkbox" data-loop style="width:auto"> loop</label>
          </div>
        </div>
        <div class="panel-section">
          <h3>Pose target</h3>
          <label>Bone / target<select data-bone></select></label>
          <label class="row"><input type="checkbox" data-lock style="width:auto"> 🔒 Lock selection</label>
          <div class="row">
            <span class="hint" style="flex:1">Drag a limb on the canvas to key it →</span>
            <div class="seg" data-dragseg>
              <button data-drag="rot" class="on">⟳ rotate</button>
              <button data-drag="move">✦ move</button>
            </div>
          </div>
          <p class="hint">Dragging sets a key at the current frame. Hold Shift to move even in rotate mode.</p>
        </div>
        <div class="panel-section">
          <h3 data-proplabel>Track</h3>
          <label>Property<select data-prop></select></label>
          <div class="row">
            <label style="flex:1">Value<input type="number" step="0.01" data-val></label>
            <button data-setkey class="ghost">Set key @t</button>
            <button data-delkey class="ghost">Del key @t</button>
          </div>
          <div id="keylist" data-keylist></div>
        </div>
      </aside>
    </div>`;

  const stageHost = host.querySelector('[data-stage]');
  const el = (sel) => host.querySelector(sel);
  const fail = (error) => { console.error(error); toast(error.message, { error: true, duration: 7000 }); };

  // ---- clip helpers ----------------------------------------------------------
  const currentClip = () => resolved[clip] || null;      // may be local OR inherited
  const editable = () => isLocalClip(rig, clip);          // only rig.clips are editable

  // ---- pose sampling (mirrors puppet.js sampleInto exactly) -------------------
  const resolveKeys = (keys) => keys.map((k) => (k.ease ? { ...k, ease: ease[k.ease] || null } : k));
  function sampleValue(c, target, p, t) {
    const tr = (c?.tracks || []).find((x) => x.target === target && x.prop === p);
    if (!tr) return p.startsWith('scale') ? 1 : 0;
    return sampleTrack(resolveKeys(tr.keys), t, ease.inOutSine);
  }
  function sampleClip(c, t) {
    const pose = {};
    for (const tr of c?.tracks || []) {
      const v = sampleTrack(resolveKeys(tr.keys), t, ease.inOutSine);
      (pose[tr.target] || (pose[tr.target] = {}))[tr.prop] = v;
    }
    return pose;
  }

  // ---- undo + live-puppet helpers --------------------------------------------
  function pushUndo() { undoStack.push(JSON.stringify(rig)); if (undoStack.length > 80) undoStack.shift(); }

  function placePuppet() {
    if (!puppet || !stage) return;
    const { width: w, height: h } = stage.app.screen;
    puppet.view.scale.set(Math.min(w, h) / (rig.canvas || 1024) * 0.9);
    puppet.view.position.set(w / 2, h * 0.54);
  }

  function hookBones() {
    for (const id in puppet.bones) {
      const c = puppet.bones[id].container;
      c.eventMode = 'static'; c.cursor = 'pointer';
      for (const ch of c.children) ch.eventMode = 'static';
      c.on('pointerdown', (event) => { event.stopPropagation(); onBoneDown(id, event); });
    }
  }

  // Build the puppet from a MERGED rig (rig.clips + shared packs) so the REAL
  // puppet.js runtime can play any resolvable clip. The pristine `rig` object
  // (what save/export/parity use) is never mutated by this merge.
  function buildPuppet() {
    if (puppet) puppet.destroy();
    puppet = createPuppet(PIXI, { ...rig, clips: resolved }, { partFactory: factory });
    puppet.stopClip();
    stage.root.addChildAt(puppet.view, 0);   // keep the gizmo overlay on top
    placePuppet();
    hookBones();
    applyFrame();
  }

  function drawGizmo() {
    if (!gizmo) return;
    gizmo.clear();
    const b = selBone && puppet && puppet.bones[selBone];
    if (!b) return;
    const p = b.container.getGlobalPosition();
    gizmo.circle(p.x, p.y, 15).stroke({ width: 3, color: 0xffffff });
    gizmo.circle(p.x, p.y, 15).stroke({ width: 1.5, color: 0xff5252 });
    gizmo.circle(p.x, p.y, 4).fill(0xff5252);
  }

  // ---- frame application (scrub / edit preview) ------------------------------
  // Manual sampling through the SAME spline path puppet.js uses internally, so a
  // scrubbed frame is WYSIWYG with runtime playback and reflects edits instantly
  // without an art-reloading rebuild.
  function applyFrame() {
    if (!puppet) return;
    const c = currentClip();
    puppet.previewPose(c ? sampleClip(c, time) : {});
    drawGizmo();
  }

  // ---- playback (real puppet.js runtime) -------------------------------------
  function play() {
    if (playing || !currentClip()) return;
    // Rebuild so the runtime compiles the CURRENT (possibly edited) clip tracks.
    buildPuppet();
    const c = currentClip();
    const dur = c.duration || 1000, loop = !!c.loop;
    playing = true; el('[data-play]').classList.add('on');
    puppet.playClip(clip, { loop, onDone: () => stopPlay() });
    // Under reduced motion puppet.playClip holds a still frame-0 pose; show that
    // held pose and return to the stopped state (no cosmetic scrubber motion).
    if (reduced) { time = 0; syncTime(); stopPlay(); return; }
    // Cosmetic scrubber sync: advance the slider off the same clock puppet uses.
    playStart = performance.now();
    const stepSlider = (now) => {
      if (!playing) return;
      const elapsed = now - playStart;
      time = loop ? (elapsed % dur) / dur : Math.min(1, elapsed / dur);
      syncTime(); syncVal();
      if (!loop && time >= 1) return;   // onDone will call stopPlay
      playRAF = requestAnimationFrame(stepSlider);
    };
    playRAF = requestAnimationFrame(stepSlider);
  }
  function stopPlay() {
    playing = false; el('[data-play]').classList.remove('on');
    if (playRAF) { cancelAnimationFrame(playRAF); playRAF = 0; }
    if (puppet) puppet.stopClip();
    applyFrame();                       // freeze at the scrubbed frame
  }

  // ---- selection & inspector sync --------------------------------------------
  function boneOptions() {
    const targets = [...rig.bones.map((b) => b.id), '$spine', '$motion'];
    el('[data-bone]').innerHTML = targets.map((id) => `<option value="${id}">${id}</option>`).join('');
    if (!targets.includes(selBone)) selBone = targets[0];
    el('[data-bone]').value = selBone;
  }

  function selectBone(id) {
    const targets = [...rig.bones.map((b) => b.id), '$spine', '$motion'];
    if (!targets.includes(id)) return;
    selBone = id;
    el('[data-bone]').value = id;
    const props = propsFor(id);
    if (!props.includes(prop)) prop = props[0];
    syncPropSel();
    drawGizmo();
  }

  function refreshClipSelect() {
    const { local, inherited } = classifyClips(rig, packs);
    const localOpts = local.map((n) => `<option value="${n}">${n}</option>`).join('');
    const inhOpts = inherited.map((n) => `<option value="${n}">${n}</option>`).join('');
    el('[data-clip]').innerHTML =
      `<optgroup label="This character (${local.length})">${localOpts}</optgroup>` +
      (inherited.length ? `<optgroup label="Inherited · shared packs (${inherited.length})">${inhOpts}</optgroup>` : '');
    if (!resolved[clip]) clip = local[0] || inherited[0] || null;
    el('[data-clip]').value = clip;
  }

  function selectClip(name) {
    if (!resolved[name]) return;
    clip = name;
    el('[data-clip]').value = name;
    stopPlay();
    // Preserve scrub position across clip switches (legacy clipsel.onchange kept `time`).
    syncClipMeta();
    syncTime();
    syncPropSel();
    updateEditGating();
  }

  // Duration + loop reflect the current clip; disabled for inherited clips.
  function syncClipMeta() {
    const c = currentClip();
    el('[data-dur]').value = c?.duration ?? 1000;
    el('[data-loop]').checked = !!c?.loop;
    el('[data-badge]').textContent = `Animate · ${clip || '—'}${editable() ? '' : ' (inherited)'}`;
  }

  function updateEditGating() {
    const canEdit = editable();
    el('[data-inherited]').hidden = canEdit;
    for (const sel of ['[data-dur]', '[data-loop]', '[data-val]', '[data-setkey]', '[data-delkey]']) el(sel).disabled = !canEdit;
    // The keyframe rows are rebuilt read-only vs editable inside renderKeys().
  }

  function syncPropSel() {
    const sel = el('[data-prop]');
    sel.innerHTML = propsFor(selBone).map((p) => `<option value="${p}">${p}</option>`).join('');
    sel.value = prop;
    el('[data-proplabel]').textContent = `Track — ${selBone} · ${prop}`;
    renderKeys();
    syncVal();
  }

  function syncTime() {
    el('[data-time]').value = Math.round(time * 1000);
    el('[data-tlabel]').textContent = `t = ${time.toFixed(3)}`;
  }

  function syncVal() {
    const c = currentClip(); if (!c) return;
    el('[data-val]').value = round3(sampleValue(c, selBone, prop, time));
  }

  function renderKeys() {
    const list = el('[data-keylist]'); list.innerHTML = '';
    const c = currentClip(); if (!c) { renderTicks(null); return; }
    const tr = (c.tracks || []).find((x) => x.target === selBone && x.prop === prop);
    renderTicks(tr);
    if (!tr) { list.innerHTML = '<p class="hint">no keys on this track yet.</p>'; return; }
    const canEdit = editable();
    tr.keys.forEach((k, i) => {
      const row = document.createElement('div'); row.className = 'key';
      const t = document.createElement('input'); t.type = 'number'; t.step = '0.01'; t.value = k.t; t.title = 'time'; t.disabled = !canEdit;
      const v = document.createElement('input'); v.type = 'number'; v.step = '0.01'; v.value = k.v; v.title = 'value'; v.disabled = !canEdit;
      const es = document.createElement('select'); es.disabled = !canEdit;
      for (const e of EASES) { const o = document.createElement('option'); o.value = e; o.textContent = e || 'auto'; es.appendChild(o); }
      es.value = k.ease || '';
      const del = document.createElement('button'); del.className = 'ghost'; del.textContent = '✕'; del.disabled = !canEdit;
      if (canEdit) {
        t.onchange = () => { pushUndo(); k.t = Math.max(0, Math.min(1, +t.value)); tr.keys.sort((a, b) => a.t - b.t); applyFrame(); renderKeys(); };
        v.onchange = () => { pushUndo(); k.v = +v.value; applyFrame(); syncVal(); renderTicks(tr); };
        es.onchange = () => { pushUndo(); if (es.value) k.ease = es.value; else delete k.ease; applyFrame(); };
        del.onclick = () => { pushUndo(); tr.keys.splice(i, 1); if (!tr.keys.length) c.tracks.splice(c.tracks.indexOf(tr), 1); applyFrame(); renderKeys(); syncVal(); };
      }
      row.append(t, v, es, del); list.appendChild(row);
    });
  }

  function renderTicks(tr) {
    const host2 = el('[data-ticks]'); host2.innerHTML = '';
    const c = currentClip(); if (!c) return;
    const realTs = new Set((tr ? tr.keys : []).map((k) => k.t));
    const ghostTs = clipKeyTimes(c).filter((t) => !realTs.has(t));
    for (const t of ghostTs) host2.appendChild(makeTick(t, false));
    (tr ? tr.keys : []).forEach((k) => host2.appendChild(makeTick(k.t, true, k.v)));
  }
  function makeTick(t, real, v) {
    const d = document.createElement('div');
    d.className = real ? 'k' : 'k ghost';
    d.style.left = (t * 100) + '%';
    d.title = real ? `jump to t=${t} (v=${v})` : `t=${t} — keyframe on another track. Click to jump.`;
    d.onclick = () => goToTime(t);
    return d;
  }
  function goToTime(t) {
    stopPlay();
    time = Math.max(0, Math.min(1, t));
    syncTime(); applyFrame(); syncVal();
  }
  function scrubTo(t) { goToTime(t); }

  // ---- canvas drag-to-pose (animate: keys the current frame) -----------------
  const parentContainer = (id) => { const b = getBone(rig, id); return b && b.parent ? puppet.bones[b.parent].container : puppet.motion; };
  function onBoneDown(id, e) {
    if (lockSel && selBone && puppet.bones[selBone]) id = selBone;
    else selectBone(id);
    if (!editable()) return;   // inherited clips are read-only — no posing
    pushUndo();
    if (dragMode === 'move' || e.shiftKey) {
      const pc = parentContainer(id);
      drag = { id, kind: 'move', pc, p0: pc.toLocal(e.global),
        v0x: sampleValue(currentClip(), id, 'x', time),
        v0y: sampleValue(currentClip(), id, 'y', time) };
      prop = 'x'; syncPropSel();
    } else {
      const c = puppet.bones[id].container.getGlobalPosition();
      drag = { id, kind: 'rot',
        a0: Math.atan2(e.global.y - c.y, e.global.x - c.x),
        v0: sampleValue(currentClip(), id, 'rotation', time) };
      prop = 'rotation'; syncPropSel();
    }
  }
  function onMove(e) {
    if (!drag) return;
    const c = currentClip();
    if (drag.kind === 'move') {
      const cur = drag.pc.toLocal(e.global);
      setKeyOn(c, drag.id, 'x', time, drag.v0x + (cur.x - drag.p0.x));
      setKeyOn(c, drag.id, 'y', time, drag.v0y + (cur.y - drag.p0.y));
    } else {
      const cc = puppet.bones[drag.id].container.getGlobalPosition();
      const a = Math.atan2(e.global.y - cc.y, e.global.x - cc.x);
      setKeyOn(c, drag.id, 'rotation', time, drag.v0 + (a - drag.a0));
    }
    applyFrame(); renderKeys(); syncVal();
  }
  const onUp = () => { drag = null; };

  // ---- wiring ----------------------------------------------------------------
  function wire() {
    el('[data-char]').onchange = (e) => loadCharacter(e.target.value).catch(fail);
    el('[data-clip]').onchange = (e) => selectClip(e.target.value);
    el('[data-play]').onclick = () => play();
    el('[data-stop]').onclick = () => stopPlay();
    el('[data-undo]').onclick = undo;
    el('[data-reset]').onclick = reset;
    el('[data-copy]').onclick = copyJson;
    el('[data-save]').onclick = () => saveAnim();
    el('[data-export]').onclick = () => downloadDocument('rig.json', rig);
    el('[data-bone]').onchange = (e) => selectBone(e.target.value);
    el('[data-lock]').onchange = (e) => { lockSel = e.target.checked; };
    el('[data-prop]').onchange = (e) => { prop = e.target.value; el('[data-proplabel]').textContent = `Track — ${selBone} · ${prop}`; renderKeys(); syncVal(); };
    el('[data-time]').oninput = (e) => { stopPlay(); time = +e.target.value / 1000; syncTime(); applyFrame(); syncVal(); };
    el('[data-dur]').onchange = () => { if (!editable()) return; pushUndo(); currentClip().duration = +el('[data-dur]').value; };
    el('[data-loop]').onchange = () => { if (!editable()) return; pushUndo(); currentClip().loop = el('[data-loop]').checked; };
    el('[data-val]').onchange = () => { if (!editable()) return; pushUndo(); setKeyOn(currentClip(), selBone, prop, time, +el('[data-val]').value); applyFrame(); renderKeys(); };
    el('[data-setkey]').onclick = () => { if (!editable()) return; pushUndo(); setKeyOn(currentClip(), selBone, prop, time, +el('[data-val]').value); applyFrame(); renderKeys(); };
    el('[data-delkey]').onclick = () => { if (!editable()) return; pushUndo(); delKeyAt(currentClip(), selBone, prop, time); applyFrame(); renderKeys(); syncVal(); };
    for (const b of el('[data-dragseg]').children) b.onclick = () => { dragMode = b.dataset.drag; for (const x of el('[data-dragseg]').children) x.classList.toggle('on', x === b); };
  }

  function undo() {
    if (!undoStack.length) return;
    stopPlay();
    rig = JSON.parse(undoStack.pop());
    resolved = resolveClips(rig, packs);
    buildPuppet();
    refreshClipSelect(); boneOptions();
    if (!resolved[clip]) clip = Object.keys(resolved)[0] || null;
    selectClip(clip); selectBone(selBone);
  }

  async function reset() {
    if (!confirm('Reload rig.json from disk and discard edits?')) return;
    artVersion = Date.now();
    await loadCharacter(charId, { keepUndo: false });
    toast('Reloaded rig and artwork from disk.');
  }

  function copyJson() {
    navigator.clipboard.writeText(JSON.stringify(rig, null, 2))
      .then(() => toast('Copied rig JSON to the clipboard.'))
      .catch((error) => toast(`Could not copy JSON: ${error.message}`, { error: true }));
  }

  async function saveAnim() {
    const path = rigDocumentPath(charId);
    try {
      await saveDocument(path, rig);
      toast(`Saved ${charId}/rig.json to disk.`);
    } catch (error) {
      toast(`Could not save rig (needs the authoring server): ${error.message}`, { error: true, duration: 7000 });
    }
  }

  // ---- character (re)load ----------------------------------------------------
  async function loadCharacter(id, { keepUndo = false } = {}) {
    stopPlay();
    charId = characterIds.includes(id) ? id : characterIds[0];
    el('[data-char]').value = charId;
    params.set('char', charId);
    const next = new URL(location.href); next.searchParams.set('char', charId); history.replaceState(null, '', next);
    if (!keepUndo) undoStack.length = 0;
    artVersion = artVersion || Date.now();
    const base = charBase(charId);
    const text = await (await fetch(`${base}rig.json?v=${artVersion}`, { cache: 'no-store' })).text();
    rig = loadRig(text);                                    // same load path as the parity harness
    resolved = resolveClips(rig, packs);
    factory = await loadRigArt(PIXI, rig, base, 1, artVersion);
    if (destroyed) return;
    const { local, inherited } = classifyClips(rig, packs);
    if (!resolved[clip]) clip = local[0] || inherited[0] || null;
    selBone = [...rig.bones.map((b) => b.id), '$spine', '$motion'].includes(selBone) ? selBone : (rig.bones[0]?.id || null);
    buildPuppet();
    refreshClipSelect(); boneOptions();
    selectClip(clip); selectBone(selBone);
  }

  // ---- boot ------------------------------------------------------------------
  // Load the shared clip packs once (best-effort; a static preview may lack them).
  await Promise.all(CLIP_PACK_FILES.map(async (file, i) => {
    try {
      const data = await (await fetch(packUrl(file), { cache: 'no-store' })).json();
      if (i === 0) packs.defaultClips = data.clips || {};
      else packs.actingClips = data.clips || {};
    } catch { /* pack missing in static preview — inherited previews just won't show */ }
  }));

  stage = await createStage(stageHost);
  if (destroyed) { stage.destroy(); return () => {}; }
  PIXI = stage.PIXI;
  overlay = new PIXI.Container(); gizmo = new PIXI.Graphics(); overlay.addChild(gizmo);

  wire();
  await loadCharacter(charId, { keepUndo: false });
  stage.root.addChild(overlay);            // above the puppet (added at index 0)

  stage.app.stage.eventMode = 'static';
  stage.app.stage.hitArea = stage.app.screen;
  stage.app.stage.on('globalpointermove', onMove);
  stage.app.stage.on('pointerup', onUp);
  stage.app.stage.on('pointerupoutside', onUp);
  stage.app.ticker.add(drawGizmo);
  stage.onResize(() => placePuppet());

  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
    // Space toggles play unless focus is in an editable/interactive field.
    else if (e.key === ' ' && !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target.tagName)) { e.preventDefault(); playing ? stopPlay() : play(); }
  };
  window.addEventListener('keydown', onKey);

  // Debug surface for browser automation (parity checks drive these).
  window.QLOBE_STUDIO_DEBUG = {
    workspace: 'animate',
    getDocument: () => rig,
    getRigContent: () => rig,                                    // exact object save() would persist
    noopSave: () => ({ path: rigDocumentPath(charId), content: rig }), // NO write
    save: () => saveAnim(),
    loadCharacter: (id) => loadCharacter(id),
    selectClip,
    getClipNames: () => { const { local, inherited } = classifyClips(rig, packs); return { local, inherited }; },
    scrub: (t) => scrubTo(t),
    play: () => play(),
    stop: () => stopPlay(),
    selectBone,
    getState: () => ({
      char: charId, clip, inherited: !editable(), time, prop, selBone, playing,
      dur: currentClip()?.duration ?? null, loop: !!currentClip()?.loop,
    }),
  };

  return () => {
    destroyed = true;
    window.removeEventListener('keydown', onKey);
    if (playRAF) cancelAnimationFrame(playRAF);
    if (puppet) puppet.destroy();
    stage?.destroy();
    if (window.QLOBE_STUDIO_DEBUG?.workspace === 'animate') delete window.QLOBE_STUDIO_DEBUG;
  };
}
