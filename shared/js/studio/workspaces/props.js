import { createStage } from '../../stage/stage.js';
import { createTheater } from '../../stage/theater.js';
import { normalizePropPack, propRuntimeDefinition } from '../../stage/prop-pack.js';
import { saveDocument, downloadDocument } from '../api.js';
import { loadStudioProjects } from '../projects.js';

const CHARACTERS = ['bear', 'doggy', 'fox', 'frog', 'rabbit', 'unicorn', 'princess-lily', 'princess-zoe'];
const CLIPS = ['idle', 'play-keys', 'play-strum', 'play-blow', 'play-drum', 'play-shake', 'grab', 'offer', 'think'];

const optionList = (items, selected) => items.map(([value, label = value]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('');
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export async function mount(host, { params, toast }) {
  const projects = await loadStudioProjects();
  const GAMES = Object.fromEntries(projects.filter((project) => project.workspaces?.props).map((project) => {
    const ws = project.workspaces.props;
    return [project.id, { label: project.label, base: project.baseUrl, packPath: ws.document, pack: ws.pack, backdrop: ws.backdrop, actorPack: ws.actorPack }];
  }));
  let gameId = (params.get('project') || params.get('game')) in GAMES ? (params.get('project') || params.get('game')) : Object.keys(GAMES)[0];
  let charId = params.get('char') || 'bear';
  let clip = 'idle';
  let raw = null, pack = null, propId = null, selectedSocket = null, stage = null, theater = null, actor = null;
  let guideLayer = null, guideTick = null;
  let renderToken = 0, destroyed = false, actorPack = null, characterIds = CHARACTERS;

  host.innerHTML = `
    <div class="workspace" data-workspace="props">
      <div class="workspace-tools">
        <label>Pack<select data-control="game">${optionList(Object.entries(GAMES).map(([id, value]) => [id, value.label]), gameId)}</select></label>
        <label>Prop<select data-control="prop"></select></label>
        <label>Character<select data-control="char"></select></label>
        <label>Pose<select data-control="clip">${optionList(CLIPS.map((id) => [id, id]), clip)}</select></label>
        <button data-action="save" class="save">Save pack</button><button data-action="export" class="ghost">Export JSON</button>
      </div>
      <div class="workspace-canvas" data-stage><span class="canvas-badge">Prop Pack · socket-aligned preview</span></div>
      <aside class="workspace-inspector"><div class="panel-section"><h2>Prop Studio</h2><p class="hint">Tune reusable art, scale and semantic attachment sockets. The game consumes this same pack.</p></div><div data-inspector></div></aside>
    </div>`;
  const stageHost = host.querySelector('[data-stage]');
  const inspector = host.querySelector('[data-inspector]');
  const control = (name) => host.querySelector(`[data-control="${name}"]`);

  async function loadGame() {
    const game = GAMES[gameId];
    actorPack = game.actorPack ? await fetch(new URL(game.actorPack, game.base), { cache: 'no-store' }).then((response) => response.json()) : null;
    characterIds = actorPack ? Object.keys(actorPack.actors) : CHARACTERS;
    charId = characterIds.includes(charId) ? charId : characterIds[0];
    control('char').innerHTML = optionList(characterIds.map((id) => [id, actorPack?.actors[id]?.label || id]), charId);
    const actorDef=actorPack?.actors?.[charId], availablePoses=actorDef?.renderMode==='pose-sprite'?(actorDef.poses||['neutral']):CLIPS;
    clip=availablePoses.includes(clip)?clip:availablePoses[0];control('clip').innerHTML=optionList(availablePoses.map((id)=>[id,id]),clip);
    const url = new URL(game.pack, game.base);
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load ${game.label} Prop Pack`);
    raw = await response.json();
    pack = normalizePropPack(raw, url.href);
    propId = pack.props[propId] ? propId : Object.keys(pack.props)[0];
    control('prop').innerHTML = optionList(Object.keys(pack.props).map((id) => [id, id]), propId);
    await buildStage();
    drawInspector();
  }

  async function buildStage() {
    const token = ++renderToken;
    if (guideTick && stage) stage.app.ticker.remove(guideTick);
    theater?.destroy(); stage?.destroy(); theater = stage = actor = null;
    guideLayer = guideTick = null;
    stage = await createStage(stageHost);
    theater = await createTheater(stage, { backdrop: new URL(GAMES[gameId].backdrop, GAMES[gameId].base).href, floorY: 0.86, worldScale: 1.8 });
    if (destroyed || token !== renderToken) return;
    stage.root.addChild(theater.view);
    const actorDef=actorPack?.actors?.[charId];
    const actorRef = actorPack ? { id: charId, baseUrl: new URL(actorDef.base, new URL(GAMES[gameId].actorPack, GAMES[gameId].base)).href, rig: actorDef.rig, manifest:actorDef.manifest, renderMode:actorDef.renderMode, voice: false } : charId;
    actor = actorDef?.renderMode==='pose-sprite'
      ? await theater.addPoseActor('model', actorRef, { x: 0.5, scale: 0.9, widthShare:.34 })
      : await theater.addActor('model', actorRef, { x: 0.5, scale: 0.9 });
    if(actor.mode==='pose-sprite')await theater.setSpritePose(actor,clip,{instant:true});else actor.puppet.playClip(clip);
    await renderProp();
  }

  async function renderProp() {
    const token = ++renderToken;
    if (!theater || !pack?.props[propId]) return;
    theater.removeProp('preview');
    const item = pack.props[propId];
    const def = propRuntimeDefinition(pack, propId, {}, charId);
    if (item.placement.mode === 'floor') { def.fx = item.placement.fx ?? 0.5; def.fy = item.placement.fy ?? 0.86; }
    else def.holder = 'model';
    const prop = await theater.addProp('preview', def);
    if (destroyed || token !== renderToken) return;
    if (guideTick) stage.app.ticker.remove(guideTick);
    guideLayer?.destroy({ children: true });
    guideLayer = new stage.PIXI.Container(); stage.root.addChild(guideLayer);
    const guides = Object.entries(item.sockets || {}).map(([id, socket]) => {
      const marker = new stage.PIXI.Graphics();
      marker.circle(0, 0, id === selectedSocket ? 8 : 6).fill(id === selectedSocket ? '#ffd91f' : '#3c83e7').stroke({ color: '#111111', width: 2 });
      guideLayer.addChild(marker); return { marker, point: socket.point || [0, 0] };
    });
    guideTick = () => guides.forEach(({ marker, point }) => marker.position.copyFrom(guideLayer.toLocal(prop.sprite.toGlobal(new stage.PIXI.Point(point[0], point[1])))));
    stage.app.ticker.add(guideTick); guideTick();
    prop.sprite.eventMode = 'static'; prop.sprite.cursor = 'move';
    let drag = null;
    prop.sprite.on('pointerdown', (event) => { drag = { x: event.global.x, y: event.global.y, px: prop.sprite.x, py: prop.sprite.y }; });
    prop.sprite.on('globalpointermove', (event) => {
      if (!drag) return;
      prop.sprite.position.set(drag.px + event.global.x - drag.x, drag.py + event.global.y - drag.y);
    });
    const finish = (event) => {
      if (!drag) return;
      const dx = event.global.x - drag.x, dy = event.global.y - drag.y;
      const source = raw.props[propId];
      source.placement ||= {};
      if (source.placement.mode === 'floor') {
        const { w, h } = stage.size(); source.placement.fx = number(source.placement.fx, 0.5) + dx / w; source.placement.fy = number(source.placement.fy, 0.86) + dy / h;
      } else {
        source.placement.offset ||= [0, 0];
        const k = Math.max(0.01, prop.scale * Math.min(stage.size().w, stage.size().h) / 1024 * 1.8);
        source.placement.offset = [number(source.placement.offset[0]) + dx / k, number(source.placement.offset[1]) + dy / k];
      }
      drag = null; refreshPack(); drawInspector(); renderProp();
    };
    prop.sprite.on('pointerup', finish); prop.sprite.on('pointerupoutside', finish);
  }

  function refreshPack() { pack = normalizePropPack(raw, new URL(GAMES[gameId].pack, GAMES[gameId].base).href); }

  function drawInspector() {
    const item = raw.props[propId];
    item.presentation ||= {}; item.placement ||= {}; item.sockets ||= {}; item.bindings ||= {};
    const primary = item.placement.primary || Object.keys(item.bindings)[0] || Object.keys(item.sockets)[0] || 'grip-main';
    item.sockets[primary] ||= { point: [0, 0] };
    selectedSocket = item.sockets[selectedSocket] ? selectedSocket : primary;
    const point = item.sockets[selectedSocket].point || [0, 0];
    const offset = item.placement.offset || [0, 0];
    inspector.innerHTML = `
      <div class="panel-section"><h3>${propId}</h3><label>Artwork<input data-field="art" value="${item.art || ''}"></label>
        <div class="field-grid"><label>Scale<input type="number" step="0.01" data-field="scale" value="${number(item.presentation.scale, .5)}"></label><label>Rotation (radians)<input type="number" step="0.01" data-field="rotation" value="${number(item.presentation.rotation)}"></label>
        <label>Anchor X<input type="number" step="0.01" data-field="anchorX" value="${number(item.presentation.anchor?.[0], .5)}"></label><label>Anchor Y<input type="number" step="0.01" data-field="anchorY" value="${number(item.presentation.anchor?.[1], .5)}"></label></div>
        <div class="field-grid"><label>Layer<select data-field="layer">${optionList([['front','front'],['back','back']], item.presentation.layer || 'front')}</select></label><label>Placement<select data-field="mode">${optionList([['held','held'],['floor','floor']], item.placement.mode || 'held')}</select></label></div>
        <label class="row"><input type="checkbox" data-field="inheritRotation" ${item.presentation.inheritRotation ? 'checked' : ''}> Follow character rotation</label>
      </div>
      <div class="panel-section"><h3>Attachment sockets</h3><label>Primary prop socket<select data-field="primary">${optionList(Object.keys(item.sockets).map((id) => [id,id]), primary)}</select></label><label>Socket guide to edit<select data-field="guideSocket">${optionList(Object.keys(item.sockets).map((id) => [id,id]), selectedSocket)}</select></label><label>Character binding<select data-field="binding">${optionList(['hand.R','hand.L','mouth','chest','lap'].map((id) => [id,id]), item.bindings[selectedSocket] || 'hand.R')}</select></label>
        <div class="field-grid"><label>Socket X<input type="number" step="1" data-field="socketX" value="${number(point[0])}"></label><label>Socket Y<input type="number" step="1" data-field="socketY" value="${number(point[1])}"></label><label>Offset X<input type="number" step="1" data-field="offsetX" value="${number(offset[0])}"></label><label>Offset Y<input type="number" step="1" data-field="offsetY" value="${number(offset[1])}"></label></div>
        <p class="hint">Drag the prop on stage for coarse placement; use socket and offset values for hand tuning.</p>
      </div>`;
  }

  inspector.addEventListener('input', (event) => {
    const field = event.target.dataset.field; if (!field) return;
    const item = raw.props[propId], p = item.presentation, place = item.placement;
    const primary = place.primary || Object.keys(item.bindings)[0] || Object.keys(item.sockets)[0] || 'grip-main';
    if (field === 'art') item.art = event.target.value;
    if (field === 'scale') p.scale = number(event.target.value, .5);
    if (field === 'rotation') p.rotation = number(event.target.value);
    if (field === 'anchorX') p.anchor = [number(event.target.value, .5), number(p.anchor?.[1], .5)];
    if (field === 'anchorY') p.anchor = [number(p.anchor?.[0], .5), number(event.target.value, .5)];
    if (field === 'layer') p.layer = event.target.value;
    if (field === 'mode') place.mode = event.target.value;
    if (field === 'inheritRotation') p.inheritRotation = event.target.checked;
    if (field === 'binding') item.bindings[selectedSocket] = event.target.value;
    if (field === 'socketX') item.sockets[selectedSocket].point[0] = number(event.target.value);
    if (field === 'socketY') item.sockets[selectedSocket].point[1] = number(event.target.value);
    if (field === 'offsetX') place.offset = [number(event.target.value), number(place.offset?.[1])];
    if (field === 'offsetY') place.offset = [number(place.offset?.[0]), number(event.target.value)];
    refreshPack(); renderProp();
  });
  inspector.addEventListener('change', (event) => {
    if (event.target.dataset.field === 'primary') raw.props[propId].placement.primary = event.target.value;
    else if (event.target.dataset.field === 'guideSocket') selectedSocket = event.target.value;
    else return;
    drawInspector(); refreshPack(); renderProp();
  });
  control('game').addEventListener('change', async (event) => { gameId = event.target.value; propId = null; charId = ''; params.set('project', gameId); const next = new URL(location.href); next.searchParams.set('project', gameId); history.replaceState(null, '', next); await loadGame(); });
  control('prop').addEventListener('change', (event) => { propId = event.target.value; selectedSocket = null; drawInspector(); renderProp(); });
  control('char').addEventListener('change', async (event) => { charId = event.target.value; await buildStage(); });
  control('clip').addEventListener('change', (event) => { clip = event.target.value; if(actor?.mode==='pose-sprite')theater.setSpritePose(actor,clip);else actor?.puppet.playClip(clip); });
  host.querySelector('[data-action="save"]').addEventListener('click', async () => { try { await saveDocument(GAMES[gameId].packPath, raw); toast('Prop Pack saved'); } catch (error) { toast(error.message, { error: true }); } });
  host.querySelector('[data-action="export"]').addEventListener('click', () => downloadDocument(`${raw.id}.json`, raw));

  await loadGame();
  window.QLOBE_STUDIO_DEBUG = { workspace: 'props', getDocument: () => raw, selectProp: (id) => { if (raw.props[id]) { propId = id; control('prop').value = id; drawInspector(); renderProp(); } } };
  return () => { destroyed = true; renderToken += 1; if (guideTick && stage) stage.app.ticker.remove(guideTick); theater?.destroy(); stage?.destroy(); if (window.QLOBE_STUDIO_DEBUG?.workspace === 'props') delete window.QLOBE_STUDIO_DEBUG; };
}
