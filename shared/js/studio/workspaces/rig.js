// rig.js — native Rig workspace (WP-1b). Ports the rig mode out of the legacy
// iframe (shared/js/stage/puppet-studio.html) into the shell contract:
// mount(host, ctx) -> cleanup. It drives the REAL puppet.js runtime for a
// WYSIWYG live preview and shares its load/serialize logic with the Node parity
// harness through the DOM-free rig-data.js module.
//
// Scope: joint rigging of the 8 shared rigged characters — part/bone select,
// joint x/y drag + numeric entry, anchor, scale, layer z, lock, mirror,
// undo/reset, copy JSON, save (authoring server) and export (static fallback).
// Animate and Speech remain on the iframe until WP-1c/1d.

import { createStage } from '../../stage/stage.js';
import { createPuppet, loadRigArt } from '../../stage/puppet.js';
import { saveDocument, downloadDocument } from '../api.js';
import { loadStudioObjects } from '../projects.js';
import {
  loadRig, getBone, getPart, mirrorCounterpartId, mirrorTarget,
  RIGGED_CHARACTERS, rigDocumentPath,
} from './rig-data.js';

const REPO = new URL('../../../../', import.meta.url); // repo root from shared/js/studio/workspaces/
const charBase = (id) => new URL(`shared/characters/${id}/`, REPO).href;
const optionList = (items, selected) =>
  items.map(([value, label = value]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('');

export async function mount(host, { params, toast, openWorkspace, setNav, setParam }) {
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
  let selBone = null, lockSel = false, artVersion = Date.now(), destroyed = false;
  let drag = null;                 // { id } while dragging a joint on the canvas
  const undoStack = [];

  host.innerHTML = `
    <div class="workspace" data-workspace="rig">
      <div class="workspace-canvas" data-stage><span class="canvas-badge">Rig · live puppet · drag a part to move its joint</span></div>
      <aside class="workspace-inspector">
        <div class="panel-section">
          <div class="sidebar-session">
            <label>Character<select data-char>${optionList(characterIds.map((id) => [id, id]), charId)}</select></label>
            <button data-undo class="ghost" title="Ctrl+Z">⟲ Undo</button>
            <button data-reset class="ghost">Reset</button>
            <button data-copy class="ghost">Copy JSON</button>
            <button data-save class="save">▣ Save rig</button>
            <button data-export class="warn">⬇ Export rig.json</button>
          </div>
        </div>
        <div class="panel-section">
          <h2>Rig Parts</h2>
          <label>Part / bone<select data-bone></select></label>
          <label class="row"><input type="checkbox" data-lock> 🔒 Lock selection</label>
          <p class="hint">Drag the part on the canvas to move its joint, or set values exactly below.</p>
        </div>
        <div class="panel-section">
          <h3 data-sel-label>part</h3>
          <div class="field-grid">
            <label>Joint X<input type="number" step="1" data-jx></label>
            <label>Joint Y<input type="number" step="1" data-jy></label>
            <label>Anchor X<input type="number" step="0.01" data-ax></label>
            <label>Anchor Y<input type="number" step="0.01" data-ay></label>
            <label>Scale<input type="number" step="0.02" data-pscale></label>
            <label>Layer Z<input type="number" step="1" data-pz></label>
          </div>
          <button data-mirror class="ghost" style="width:100%" title="Reflect this joint onto its .L/.R counterpart">⇆ Mirror part</button>
          <p class="hint">Mirror reflects the selected joint onto its .L/.R counterpart. Anchor, scale and layer stay unchanged.</p>
          <p class="hint">Anchor = where the joint sits inside the art (0–1). Higher Z draws in front.</p>
        </div>
      </aside>
    </div>`;

  const stageHost = host.querySelector('[data-stage]');
  const el = (sel) => host.querySelector(sel);
  const fail = (error) => { console.error(error); toast(error.message, { error: true, duration: 7000 }); };
  // Breadcrumbs: RIG ▸ <char>, updated whenever the character switches.
  const syncNav = () => setNav({ crumbs: [{ label: 'Rig' }, { label: charId }] });

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
      c.on('pointerdown', (event) => { event.stopPropagation(); onBoneDown(id); });
    }
  }

  function buildPuppet() {
    if (puppet) puppet.destroy();
    puppet = createPuppet(PIXI, rig, { partFactory: factory });
    puppet.stopClip();
    stage.root.addChildAt(puppet.view, 0);   // keep the gizmo overlay on top
    placePuppet();
    hookBones();
    puppet.previewPose({});                  // neutral rest pose — WYSIWYG rig frame
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

  // ---- selection & inspector sync --------------------------------------------
  function refreshBones() {
    const bs = el('[data-bone]');
    bs.innerHTML = rig.bones.map((b) => `<option value="${b.id}">${b.id}</option>`).join('');
    if (!getBone(rig, selBone)) selBone = rig.bones[0]?.id || null;
    bs.value = selBone;
  }

  function selectBone(id) {
    if (!getBone(rig, id)) return;
    selBone = id;
    el('[data-bone]').value = id;
    el('[data-sel-label]').textContent = id;
    const counterpartId = mirrorCounterpartId(id);
    el('[data-mirror]').disabled = !counterpartId || !getBone(rig, counterpartId);
    syncRigInputs();
    drawGizmo();
  }

  function syncRigInputs() {
    const b = getBone(rig, selBone), part = getPart(rig, selBone);
    if (b) {
      el('[data-jx]').value = Math.round(b.joint[0]);
      el('[data-jy]').value = Math.round(b.joint[1]);
      el('[data-pz]').value = b.z ?? 0;
    }
    const hasPart = !!part;
    for (const key of ['[data-ax]', '[data-ay]', '[data-pscale]']) el(key).disabled = !hasPart;
    if (part) {
      el('[data-ax]').value = part.anchor ? part.anchor[0] : 0.5;
      el('[data-ay]').value = part.anchor ? part.anchor[1] : 0.5;
      el('[data-pscale]').value = part.scale ?? 1;
    }
  }

  // ---- canvas joint dragging (rig mode only) ---------------------------------
  function onBoneDown(id) {
    if (lockSel && selBone && puppet.bones[selBone]) id = selBone; // locked: overlapping parts can't hijack
    else selectBone(id);
    pushUndo();
    drag = { id };
  }
  function onMove(event) {
    if (!drag) return;
    const p = puppet.view.toLocal(event.global);
    puppet.setJoint(drag.id, Math.round(p.x), Math.round(p.y)); // aliases rig bone.joint
    syncRigInputs();
    drawGizmo();
  }
  const onUp = () => { drag = null; };

  // ---- mutations (undo-gated) -------------------------------------------------
  const rigChange = (fn) => () => { pushUndo(); fn(); };
  function wireInspector() {
    el('[data-bone]').onchange = (e) => selectBone(e.target.value);
    el('[data-lock]').onchange = (e) => { lockSel = e.target.checked; };
    el('[data-jx]').onchange = rigChange(() => {
      const b = getBone(rig, selBone); b.joint[0] = +el('[data-jx]').value;
      puppet.setJoint(selBone, +el('[data-jx]').value, +el('[data-jy]').value); drawGizmo();
    });
    el('[data-jy]').onchange = rigChange(() => {
      const b = getBone(rig, selBone); b.joint[1] = +el('[data-jy]').value;
      puppet.setJoint(selBone, +el('[data-jx]').value, +el('[data-jy]').value); drawGizmo();
    });
    el('[data-ax]').onchange = rigChange(() => {
      const p = getPart(rig, selBone); if (!p) return;
      p.anchor = [+el('[data-ax]').value, p.anchor ? p.anchor[1] : 0.5]; rebuild();
    });
    el('[data-ay]').onchange = rigChange(() => {
      const p = getPart(rig, selBone); if (!p) return;
      p.anchor = [p.anchor ? p.anchor[0] : 0.5, +el('[data-ay]').value]; rebuild();
    });
    el('[data-pscale]').onchange = rigChange(() => {
      const p = getPart(rig, selBone); if (!p) return;
      p.scale = +el('[data-pscale]').value; rebuild();
    });
    el('[data-pz]').onchange = rigChange(() => {
      const b = getBone(rig, selBone), p = getPart(rig, selBone);
      b.z = +el('[data-pz]').value; if (p) p.z = b.z; rebuild();
    });
    el('[data-mirror]').onclick = mirrorSelectedPart;
    el('[data-undo]').onclick = undo;
    el('[data-reset]').onclick = reset;
    el('[data-copy]').onclick = copyJson;
    el('[data-save]').onclick = () => saveRig();
    el('[data-export]').onclick = () => downloadDocument('rig.json', rig);
    el('[data-char]').onchange = (e) => loadCharacter(e.target.value).catch(fail);
  }

  function mirrorSelectedPart() {
    const target = mirrorTarget(rig, selBone);
    if (!target) { toast(`${selBone || 'selection'} has no .L/.R counterpart`, { error: true }); return; }
    pushUndo();
    puppet.setJoint(target.id, target.x, target.y); // aliases rig bone.joint
    drawGizmo();
    toast(`Mirrored ${selBone} → ${target.id} at ${target.x}, ${target.y}`);
  }

  // Rebuild the puppet in place (anchor/scale/z changes need a fresh sprite tree).
  function rebuild() {
    buildPuppet();
    selectBone(selBone);
  }

  function undo() {
    if (!undoStack.length) return;
    rig = JSON.parse(undoStack.pop());
    buildPuppet(); refreshBones(); selectBone(selBone);
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

  async function saveRig() {
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
    charId = characterIds.includes(id) ? id : characterIds[0];
    el('[data-char]').value = charId;
    setParam('char', charId);       // shell choke point: syncs params + replaceState
    syncNav();                      // crumbs track the selected character
    if (!keepUndo) undoStack.length = 0;
    artVersion = artVersion || Date.now();
    const base = charBase(charId);
    const text = await (await fetch(`${base}rig.json?v=${artVersion}`, { cache: 'no-store' })).text();
    rig = loadRig(text);                                   // same load path as the parity harness
    factory = await loadRigArt(PIXI, rig, base, 1, artVersion);
    if (destroyed) return;
    selBone = getBone(rig, selBone) ? selBone : (rig.bones[0]?.id || null);
    buildPuppet();
    refreshBones();
    selectBone(selBone);
  }

  // ---- boot ------------------------------------------------------------------
  stage = await createStage(stageHost);
  if (destroyed) { stage.destroy(); return () => {}; }
  PIXI = stage.PIXI;
  overlay = new PIXI.Container(); gizmo = new PIXI.Graphics(); overlay.addChild(gizmo);

  wireInspector();
  await loadCharacter(charId, { keepUndo: false });
  stage.root.addChild(overlay);            // above the puppet (added at index 0)

  // drag routing on the stage
  stage.app.stage.eventMode = 'static';
  stage.app.stage.hitArea = stage.app.screen;
  stage.app.stage.on('globalpointermove', onMove);
  stage.app.stage.on('pointerup', onUp);
  stage.app.stage.on('pointerupoutside', onUp);
  stage.app.ticker.add(drawGizmo);
  stage.onResize(() => placePuppet());

  const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); } };
  window.addEventListener('keydown', onKey);

  // Debug surface for browser automation (parity checks drive these).
  window.QLOBE_STUDIO_DEBUG = {
    workspace: 'rig',
    getDocument: () => rig,
    getRigContent: () => rig,                                  // exact object save() would persist
    noopSave: () => ({ path: rigDocumentPath(charId), content: rig }), // NO write
    save: () => saveRig(),
    loadCharacter: (id) => loadCharacter(id),
    selectBone,
    getState: () => ({ char: charId, selBone, lock: lockSel, bones: rig.bones.map((b) => b.id) }),
  };

  return () => {
    destroyed = true;
    window.removeEventListener('keydown', onKey);
    if (puppet) puppet.destroy();
    stage?.destroy();
    if (window.QLOBE_STUDIO_DEBUG?.workspace === 'rig') delete window.QLOBE_STUDIO_DEBUG;
  };
}
