import { createStage } from '../../stage/stage.js';
import { createTheater } from '../../stage/theater.js';
import { loadPropPack, propRuntimeDefinition } from '../../stage/prop-pack.js';
import { normalizeMusicSyncProfiles, createMusicSync, createReactiveMeter } from '../../stage/music-sync.js';
import * as music from '../../music.js';
import { saveDocument, downloadDocument } from '../api.js';

const GAME_BASE = new URL('../../../../games/my-puppet-band/', import.meta.url);
const CONFIG_URL = new URL('config.js', GAME_BASE);
const SYNC_URL = new URL('music-sync.json', GAME_BASE);
const SYNC_PATH = 'games/my-puppet-band/music-sync.json';
const MANIFEST_URL = new URL('../../../../shared/assets/instruments/manifest.json', import.meta.url);
const CHARACTERS = ['bear', 'doggy', 'fox', 'frog', 'rabbit', 'unicorn', 'princess-lily', 'princess-zoe'];
const options = (values, selected) => values.map(([value, label = value]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('');
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export async function mount(host, { toast }) {
  const config = (await import(CONFIG_URL.href)).default;
  const response = await fetch(SYNC_URL, { cache: 'no-store' });
  let raw = response.ok ? await response.json() : { format: 'qlobe-music-sync', formatVersion: 1, id: 'my-puppet-band-performance', profiles: {} };
  let profiles = normalizeMusicSyncProfiles(raw, SYNC_URL.href);
  const propPack = await loadPropPack(new URL(config.propPack, GAME_BASE).href);
  await music.init(MANIFEST_URL.href);
  let instrument = config.instruments[0].id, songId = config.songs[0].id, charId = 'bear';
  let stage = null, theater = null, actor = null, sync = null, meter = null, playing = null;
  let destroyed = false, generation = 0, eventCount = 0;

  host.innerHTML = `
    <div class="workspace" data-workspace="music">
      <div class="workspace-tools">
        <label>Song<select data-control="song">${options(config.songs.map((song) => [song.id, song.title]), songId)}</select></label><label>Instrument<select data-control="instrument">${options(config.instruments.map((item) => [item.id,item.id]), instrument)}</select></label><label>Character<select data-control="char">${options(CHARACTERS.map((id) => [id,id]), charId)}</select></label>
        <button data-action="play">Play synced</button><button data-action="note" class="ghost">Preview note</button><button data-action="stop" class="warn">Stop</button><button data-action="save" class="save">Save profile</button><button data-action="export" class="ghost">Export JSON</button>
      </div>
      <div class="workspace-canvas" data-stage><span class="canvas-badge">My Puppet Band · score + analyser hooks</span></div>
      <aside class="workspace-inspector"><div class="panel-section"><h2>Music Sync</h2><p class="hint">Lock a performance clip to musical time and inspect scheduled note and audio-energy hooks.</p></div><div data-inspector></div></aside>
    </div>`;
  const stageHost = host.querySelector('[data-stage]'), inspector = host.querySelector('[data-inspector]');
  const ctl = (name) => host.querySelector(`[data-control="${name}"]`);
  const song = () => config.songs.find((item) => item.id === songId) || config.songs[0];
  const instrumentDef = () => config.instruments.find((item) => item.id === instrument) || {};
  const rawProfile = () => (raw.profiles[instrument] ||= { baseClip: 'idle', cycleBeats: 1, gestures: {} });

  function drawInspector() {
    const profile = rawProfile();
    inspector.innerHTML = `
      <div class="panel-section"><h3>${instrument}</h3><div class="field-grid"><label>Base clip<input data-field="baseClip" value="${profile.baseClip || 'idle'}"></label><label>Cycle beats<input type="number" step=".25" min=".25" data-field="cycleBeats" value="${num(profile.cycleBeats,1)}"></label><label>Phase offset<input type="number" step=".05" data-field="phaseOffset" value="${num(profile.phaseOffset)}"></label><label>Latency ms<input type="number" step="1" data-field="latencyMs" value="${num(profile.latencyMs)}"></label></div><label>Note gesture clip<input data-field="gesture" value="${profile.gestures?.note || ''}" placeholder="optional transient clip"></label></div>
      <div class="panel-section"><h3>Audio reactive hooks</h3>${['rms','low','mid','high'].map((id) => `<label>${id}<span class="meter"><i data-meter="${id}"></i></span></label>`).join('')}</div>
      <div class="panel-section"><h3>Scheduled hooks</h3><p class="hint" data-event>Press Play synced to inspect exact score events.</p><p class="hint"><strong data-count>${eventCount}</strong> note hooks received</p></div>`;
  }

  function stop() {
    music.stopSong(); playing = null; sync?.destroy(); sync = null; meter?.destroy(); meter = null;
    if (actor) actor.puppet.playClip('idle');
  }
  async function buildStage() {
    stop();
    const token = ++generation;
    theater?.destroy(); stage?.destroy(); theater = stage = actor = null;
    stage = await createStage(stageHost);
    theater = await createTheater(stage, { floorY: song().floorY || .88, worldScale: 1.5 });
    if (destroyed || token !== generation) return;
    stage.root.addChild(theater.view);
    await theater.setBackdrop(new URL(song().backdrop || config.stageBackdrop, GAME_BASE).href);
    actor = await theater.addActor('performer', charId, { x: .5, scale: .85 });
    const def = instrumentDef();
    const prop = propRuntimeDefinition(propPack, instrument, {}, charId);
    if (def.floor) { prop.fx = .5; prop.fy = (song().floorY || .88) + .03; } else prop.holder = 'performer';
    await theater.addProp('instrument', prop);
    actor.puppet.playClip(rawProfile().baseClip || 'idle');
  }

  function play() {
    stop(); music.unlock(); eventCount = 0; drawInspector();
    sync = createMusicSync({ puppet: actor.puppet, profile: profiles.profiles[instrument], onHook(kind, detail) {
      if (kind !== 'beat' && kind !== 'bar') return;
      const node = inspector.querySelector('[data-event]');
      if (node) node.textContent = `${kind.toUpperCase()} ${kind === 'beat' ? detail.beatIndex : detail.barIndex + 1} · transport ${detail.beat.toFixed(2)} beats`;
    } });
    playing = music.playSong(song(), [{ instr: instrument }], {
      onNote(_member, atContextTime, event) {
        eventCount += 1; sync?.note(event);
        const node = inspector.querySelector('[data-event]'), count = inspector.querySelector('[data-count]');
        if (node) node.textContent = `NOTE · beat ${event.beat} · ${event.hit || event.midi} · ctx ${atContextTime.toFixed(3)}`;
        if (count) count.textContent = String(eventCount);
      },
    });
    sync.start(() => music.songNow());
    meter = createReactiveMeter(music.attachAnalyser(), (levels) => {
      for (const [id, value] of Object.entries(levels)) {
        const bar = inspector.querySelector(`[data-meter="${id}"]`); if (bar) bar.style.width = `${Math.min(100, value * 180)}%`;
      }
    });
  }

  inspector.addEventListener('input', (event) => {
    const field = event.target.dataset.field; if (!field) return;
    const profile = rawProfile(); profile.gestures ||= {};
    if (field === 'baseClip') profile.baseClip = event.target.value;
    if (field === 'cycleBeats') profile.cycleBeats = Math.max(.25, num(event.target.value, 1));
    if (field === 'phaseOffset') profile.phaseOffset = num(event.target.value);
    if (field === 'latencyMs') profile.latencyMs = num(event.target.value);
    if (field === 'gesture') profile.gestures.note = event.target.value;
    profiles = normalizeMusicSyncProfiles(raw, SYNC_URL.href);
    sync?.setProfile(profiles.profiles[instrument]);
    if (!playing && field === 'baseClip') actor?.puppet.playClip(profile.baseClip);
  });
  ctl('song').addEventListener('change', async (event) => { songId = event.target.value; await buildStage(); });
  ctl('instrument').addEventListener('change', async (event) => { instrument = event.target.value; profiles = normalizeMusicSyncProfiles(raw, SYNC_URL.href); drawInspector(); await buildStage(); });
  ctl('char').addEventListener('change', async (event) => { charId = event.target.value; await buildStage(); });
  host.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'play') play();
    if (action === 'note') { music.unlock(); music.preview(instrument); sync?.note({ beat: music.songNow()?.beat || 0, note: 'note' }); }
    if (action === 'stop') stop();
    if (action === 'save') { try { await saveDocument(SYNC_PATH, raw); toast('Music Sync profiles saved'); } catch (error) { toast(error.message, { error: true }); } }
    if (action === 'export') downloadDocument(`${raw.id}.json`, raw);
  });

  drawInspector(); await buildStage();
  window.QLOBE_STUDIO_DEBUG = { workspace: 'music', getDocument: () => raw, play, stop, getState: () => ({ instrument, songId, eventCount, playing: !!playing }) };
  return () => { destroyed = true; generation += 1; stop(); theater?.destroy(); stage?.destroy(); if (window.QLOBE_STUDIO_DEBUG?.workspace === 'music') delete window.QLOBE_STUDIO_DEBUG; };
}
