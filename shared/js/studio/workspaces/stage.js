import { createStage } from '../../stage/stage.js';
import { createTheater } from '../../stage/theater.js';
import { loadPropPack, propRuntimeDefinition } from '../../stage/prop-pack.js';
import { normalizeScenePack, applyScenePack } from '../../stage/scene-pack.js';
import { saveDocument, downloadDocument } from '../api.js';

const GAME_BASE = new URL('../../../../games/puppet-problem-solvers/', import.meta.url);
const CONFIG_URL = new URL('config.js', GAME_BASE);
const PACK_URL = new URL('scene-pack.json', GAME_BASE);
const PACK_PATH = 'games/puppet-problem-solvers/scene-pack.json';
const CHARACTERS = ['bear', 'doggy', 'fox', 'frog', 'rabbit', 'unicorn', 'princess-lily', 'princess-zoe'];
const clone = (value) => structuredClone(value);
const options = (values, selected) => values.map(([value, label = value]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('');
const num = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export async function mount(host, { toast, params }) {
  if (params?.get('project') === 'story-stones') {
    const module = await import('./stage-story-stones.js');
    return module.mount(host, { toast, params });
  }
  const sourceConfig = clone((await import(CONFIG_URL.href)).default);
  const packResponse = await fetch(PACK_URL, { cache: 'no-store' });
  let rawPack = normalizeScenePack(packResponse.ok ? await packResponse.json() : {}, sourceConfig.id);
  let config = applyScenePack(clone(sourceConfig), rawPack);
  let scenes = config.modes.flatMap((mode) => mode.scenarios.map((scene) => ({ mode, scene })));
  let sceneId = scenes[0].scene.id, castA = 'bear', castB = 'fox', sequenceKey = 'setup', beatIndex = 0, selectedPropId = null;
  let propPack = await loadPropPack(new URL(sourceConfig.propPack, GAME_BASE).href);
  let stage = null, theater = null, destroyed = false, generation = 0;

  host.innerHTML = `
    <div class="workspace" data-workspace="stage">
      <div class="workspace-tools">
        <label>Scene<select data-control="scene"></select></label><label>Role A<select data-control="a">${options(CHARACTERS.map((id) => [id,id]), castA)}</select></label><label>Role B<select data-control="b">${options(CHARACTERS.map((id) => [id,id]), castB)}</select></label>
        <label>Sequence<select data-control="sequence"></select></label>
        <button data-action="play">Play sequence</button><button data-action="stop" class="warn">Stop</button><button data-action="save" class="save">Save scene</button><button data-action="export" class="ghost">Export JSON</button>
      </div>
      <div class="workspace-canvas" data-stage><span class="canvas-badge">Puppet Problem Solvers · shipping runtime</span></div>
      <aside class="workspace-inspector"><div class="panel-section"><h2>Stage Studio</h2><p class="hint">Block actors and props, reorder beats, and preview the exact theater runtime.</p></div><div data-inspector></div></aside>
    </div>`;
  const stageHost = host.querySelector('[data-stage]'), inspector = host.querySelector('[data-inspector]');
  const ctl = (name) => host.querySelector(`[data-control="${name}"]`);

  function currentEntry() { return scenes.find((entry) => entry.scene.id === sceneId) || scenes[0]; }
  function currentSequence() {
    const scene = currentEntry().scene;
    if (sequenceKey === 'setup') return scene.setup;
    const [, choiceId, kind] = sequenceKey.split(':');
    return scene.choices.find((choice) => choice.id === choiceId)?.[kind] || [];
  }
  function fillControls() {
    ctl('scene').innerHTML = options(scenes.map(({ mode, scene }) => [scene.id, `${mode.title} / ${scene.id}`]), sceneId);
    const scene = currentEntry().scene;
    const seqs = [['setup', 'Setup']];
    for (const choice of scene.choices || []) {
      seqs.push([`choice:${choice.id}:preview`, `${choice.id} / preview`], [`choice:${choice.id}:resolution`, `${choice.id} / resolution`]);
    }
    if (!seqs.some(([id]) => id === sequenceKey)) sequenceKey = 'setup';
    ctl('sequence').innerHTML = options(seqs, sequenceKey);
  }

  async function buildStage() {
    const token = ++generation;
    theater?.destroy(); stage?.destroy(); theater = stage = null;
    const { scene } = currentEntry();
    stage = await createStage(stageHost);
    theater = await createTheater(stage, { floorY: scene.floorY ?? config.stage?.floorY ?? .84, worldScale: 2 });
    if (destroyed || token !== generation) return;
    stage.root.addChild(theater.view);
    await theater.setBackdrop(new URL(config.backdrops[scene.backdrop] || scene.backdrop, GAME_BASE).href);
    await theater.addActor('a', castA, { x: scene.actors?.a?.x ?? .28, scale: .88 });
    await theater.addActor('b', castB, { x: scene.actors?.b?.x ?? .72, flip: true, scale: .88 });
    for (const [id, legacy] of Object.entries(scene.props || {})) {
      const base = propPack.props[id];
      const placement = base ? { holder: legacy.holder, fx: legacy.fx, fy: legacy.fy, characterSocket: legacy.characterSocket, presentation: legacy.presentation } : { ...legacy, art: legacy.art ? new URL(legacy.art, GAME_BASE).href : null };
      await theater.addProp(id, propRuntimeDefinition(propPack, id, placement, legacy.holder ? (legacy.holder === 'a' ? castA : castB) : null));
    }
    drawInspector();
  }

  function beatLabel(beat, index) {
    if (beat.narrator) return `${index + 1}. Narrator · ${beat.narrator}`;
    if (beat.actor && beat.say) return `${index + 1}. ${beat.actor.toUpperCase()} says · ${beat.say}`;
    if (beat.actor && beat.clip) return `${index + 1}. ${beat.actor.toUpperCase()} · ${beat.clip}`;
    if (beat.actor && beat.enter) return `${index + 1}. ${beat.actor.toUpperCase()} enters`;
    if (beat.prop) return `${index + 1}. Prop · ${beat.prop}`;
    if (beat.parallel) return `${index + 1}. Parallel (${beat.parallel.length})`;
    return `${index + 1}. Beat`;
  }
  function drawInspector() {
    const { scene } = currentEntry(), beats = currentSequence();
    beatIndex = Math.max(0, Math.min(beatIndex, beats.length - 1));
    scene.actors ||= { a: { x: .28 }, b: { x: .72 } };
    const propIds = Object.keys(scene.props || {});
    selectedPropId = propIds.includes(selectedPropId) ? selectedPropId : propIds[0] || null;
    const sceneProp = selectedPropId ? scene.props[selectedPropId] : null;
    const baseProp = selectedPropId ? propPack.props[selectedPropId] : null;
    if (sceneProp) sceneProp.presentation ||= {};
    inspector.innerHTML = `
      <div class="panel-section"><h3>Stage marks</h3><div class="field-grid"><label>Floor Y<input type="number" step=".01" data-field="floor" value="${num(scene.floorY, config.stage?.floorY ?? .84)}"></label><label>Backdrop<select data-field="backdrop">${options(Object.keys(config.backdrops).map((id) => [id,id]), scene.backdrop)}</select></label><label>Actor A X<input type="number" step=".01" data-field="actorA" value="${num(scene.actors.a?.x,.28)}"></label><label>Actor B X<input type="number" step=".01" data-field="actorB" value="${num(scene.actors.b?.x,.72)}"></label></div></div>
      <div class="panel-section"><h3>Scene props</h3>${sceneProp ? `<label>Prop<select data-field="selectedProp">${options(propIds.map((id) => [id,id]), selectedPropId)}</select></label><div class="field-grid"><label>Holder<select data-field="propHolder">${options([['','floor'],['a','role A'],['b','role B']], sceneProp.holder || '')}</select></label><label>Layer<select data-field="propLayer">${options([['front','front'],['back','back']], sceneProp.presentation.layer || baseProp?.presentation.layer || 'front')}</select></label><label>Position X<input type="number" step=".01" data-field="propX" value="${num(sceneProp.fx,.5)}"></label><label>Position Y<input type="number" step=".01" data-field="propY" value="${num(sceneProp.fy,scene.floorY ?? .84)}"></label><label>Scale<input type="number" step=".01" data-field="propScale" value="${num(sceneProp.presentation.scale,baseProp?.presentation.scale ?? .5)}"></label><label>Rotation<input type="number" step=".01" data-field="propRotation" value="${num(sceneProp.presentation.rotation,baseProp?.presentation.rotation ?? 0)}"></label></div>` : '<p class="hint">This scene has no props.</p>'}</div>
      <div class="panel-section"><h3>Beat timeline</h3><div class="list">${beats.map((beat, index) => `<button class="list-item${index === beatIndex ? ' selected' : ''}" data-beat="${index}"><span>${index + 1}</span><span>${beatLabel(beat,index).replace(`${index + 1}. `,'')}</span><span>›</span></button>`).join('') || '<p class="hint">This sequence has no beats.</p>'}</div><div class="row"><button data-action="up" class="ghost">Move up</button><button data-action="down" class="ghost">Move down</button><button data-action="add" class="ghost">Add wait</button></div></div>
      <div class="panel-section"><h3>Selected beat JSON</h3><textarea data-beat-json>${beats[beatIndex] ? JSON.stringify(beats[beatIndex], null, 2) : ''}</textarea><button data-action="apply-beat">Apply beat</button><p class="hint">The JSON editor preserves the full theater beat grammar, including parallel action and speech cues.</p></div>`;
  }

  async function playSequence() {
    if (!theater) return;
    theater.interrupt(); theater.timeScale = 1;
    for (const actor of Object.values(theater.actors)) { theater.resetActorPose(actor); actor.puppet.playClip('idle'); }
    try { await theater.runBeats(clone(currentSequence())); toast('Sequence preview complete'); } catch (error) { toast(error.message, { error: true }); }
  }
  function materializeScene() {
    const scene = currentEntry().scene;
    rawPack.scenes[scene.id] = clone(scene);
    rawPack.stage = { ...(rawPack.stage || {}), floorY: config.stage?.floorY ?? .84 };
  }

  host.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const beatButton = event.target.closest('[data-beat]');
    if (beatButton) { beatIndex = Number(beatButton.dataset.beat); drawInspector(); return; }
    if (action === 'play') playSequence();
    if (action === 'stop') { theater?.interrupt(); Object.values(theater?.actors || {}).forEach((actor) => actor.puppet.playClip('idle')); }
    const beats = currentSequence();
    if (action === 'up' && beatIndex > 0) { [beats[beatIndex - 1], beats[beatIndex]] = [beats[beatIndex], beats[beatIndex - 1]]; beatIndex -= 1; drawInspector(); }
    if (action === 'down' && beatIndex < beats.length - 1) { [beats[beatIndex + 1], beats[beatIndex]] = [beats[beatIndex], beats[beatIndex + 1]]; beatIndex += 1; drawInspector(); }
    if (action === 'add') { beats.push({ wait: 500 }); beatIndex = beats.length - 1; drawInspector(); }
    if (action === 'apply-beat') { try { beats[beatIndex] = JSON.parse(inspector.querySelector('[data-beat-json]').value); drawInspector(); toast('Beat updated'); } catch (error) { toast(`Invalid beat JSON: ${error.message}`, { error: true }); } }
    if (action === 'save') { try { materializeScene(); await saveDocument(PACK_PATH, rawPack); toast(`${sceneId} saved to Scene Pack`); } catch (error) { toast(error.message, { error: true }); } }
    if (action === 'export') { materializeScene(); downloadDocument(`${rawPack.id}.json`, rawPack); }
  });
  inspector.addEventListener('change', async (event) => {
    const field = event.target.dataset.field; if (!field) return;
    const scene = currentEntry().scene;
    if (field === 'floor') scene.floorY = num(event.target.value, .84);
    if (field === 'backdrop') scene.backdrop = event.target.value;
    if (field === 'actorA') { scene.actors.a ||= {}; scene.actors.a.x = num(event.target.value, .28); }
    if (field === 'actorB') { scene.actors.b ||= {}; scene.actors.b.x = num(event.target.value, .72); }
    if (field === 'selectedProp') { selectedPropId = event.target.value; drawInspector(); return; }
    const prop = selectedPropId ? scene.props?.[selectedPropId] : null;
    if (prop) {
      prop.presentation ||= {};
      if (field === 'propHolder') prop.holder = event.target.value || null;
      if (field === 'propLayer') prop.presentation.layer = event.target.value;
      if (field === 'propX') prop.fx = num(event.target.value, .5);
      if (field === 'propY') prop.fy = num(event.target.value, scene.floorY ?? .84);
      if (field === 'propScale') prop.presentation.scale = num(event.target.value, .5);
      if (field === 'propRotation') prop.presentation.rotation = num(event.target.value);
    }
    await buildStage();
  });
  ctl('scene').addEventListener('change', async (event) => { sceneId = event.target.value; sequenceKey = 'setup'; beatIndex = 0; fillControls(); await buildStage(); });
  ctl('sequence').addEventListener('change', (event) => { sequenceKey = event.target.value; beatIndex = 0; drawInspector(); });
  ctl('a').addEventListener('change', async (event) => { castA = event.target.value; await buildStage(); });
  ctl('b').addEventListener('change', async (event) => { castB = event.target.value; await buildStage(); });

  fillControls(); await buildStage();
  window.QLOBE_STUDIO_DEBUG = { workspace: 'stage', getDocument: () => rawPack, getScene: () => currentEntry().scene, play: playSequence };
  return () => { destroyed = true; generation += 1; theater?.destroy(); stage?.destroy(); if (window.QLOBE_STUDIO_DEBUG?.workspace === 'stage') delete window.QLOBE_STUDIO_DEBUG; };
}
