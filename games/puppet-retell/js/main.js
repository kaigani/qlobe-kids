import config from '../config.js';
import { createStage } from '../../../shared/js/stage/stage.js';
import { createTheater } from '../../../shared/js/stage/theater.js';
import { createPerformanceRecorder, openPerformanceStore } from '../../../shared/js/performance-recorder.js';
import {
  canExportPerformanceMp4,
  renderPerformanceMp4,
} from '../../../shared/js/performance-video-export.js';
import { onTap } from '../../../shared/js/tap.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as speech from '../../../shared/js/speech.js';
import * as sfx from '../../../shared/js/sfx.js';

const appEl = document.querySelector('#app');
const confettiEl = document.querySelector('#confetti');
const roles = ['a', 'b'];
const names = {
  bear: 'Bear', doggy: 'Doggy', fox: 'Fox', frog: 'Frog',
  rabbit: 'Rabbit', unicorn: 'Unicorn',
  'princess-lily': 'Lily', 'princess-zoe': 'Zoe',
};
const actions = [
  ['wave', './assets/ui/action-wave.png', 'Wave'],
  ['jump', './assets/ui/action-jump.png', 'Jump'],
  ['talk', './assets/ui/action-talk.png', 'Talk'],
  ['think', './assets/ui/action-think.png', 'Think'],
  ['hug', './assets/ui/action-hug.png', 'Hug'],
  ['cheer', './assets/ui/action-cheer.png', 'Cheer'],
];
const uiArt = {
  storyStarters: './assets/ui/mode-story-starters.png',
  freeShow: './assets/ui/mode-free-show.png',
  myShows: './assets/ui/mode-my-shows.png',
  noProp: './assets/ui/no-prop.png',
  privacy: './assets/ui/privacy-lock.png',
  delete: './assets/ui/delete.png',
  loading: './assets/ui/curtain-loading.png',
  saved: './assets/ui/show-saved.png',
  replay: './assets/ui/replay.png',
};
const defaultLines = {
  ...config.voice,
  ...Object.fromEntries(config.stories.flatMap((story) =>
    story.beats.map((beat) => [`story.${story.id}.${beat.id}`, beat.line]))),
};

let current = null;
let store = null;
let pendingExport = null;
let exportController = null;
let readyResolve;
const ready = new Promise((resolve) => { readyResolve = resolve; });

const state = {
  screen: 'loading',
  mode: null,
  storyId: null,
  cast: [],
  stageId: config.stages[0].id,
  activeRole: 'a',
  accessories: { a: null, b: null },
  phase: 'idle',
  beat: 0,
  recording: false,
  replaying: false,
  showCount: 0,
  exporting: false,
  muted: false,
  seed: 1,
  fastTimers: false,
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function unlock() {
  voice.unlock();
  speech.unlock();
  sfx.unlock();
}

function tapAll(root = document) {
  root.querySelectorAll('[data-action]').forEach((el) => {
    onTap(el, () => handleAction(el.dataset.action, el.dataset.value, el), {
      feedback: () => { unlock(); if (!state.muted) sfx.tick(); },
    });
  });
}

function header(title, back = 'splash') {
  return `<header class="screen-header">
    <button class="icon-button back-button" data-action="${back}" data-target="back" aria-label="Go back"></button>
    <h1>${esc(title)}</h1>
    <button class="icon-button sound-button" data-action="sound" data-target="sound" aria-label="Turn sound ${state.muted ? 'on' : 'off'}" style="${state.muted ? 'filter:grayscale(1);opacity:.6' : ''}"></button>
  </header>`;
}

function face(character) {
  return `../../shared/characters/${character}/anim/head-ts.png`;
}

function getStory(id = state.storyId) {
  return config.stories.find((item) => item.id === id) || config.stories[0];
}

function getStage(id = state.stageId) {
  return config.stages.find((item) => item.id === id) || config.stages[0];
}

function speak(key, text = defaultLines[key]) {
  if (state.muted || !text) return Promise.resolve();
  return voice.say(key, text);
}

async function cleanupScene() {
  if (!current) return;
  current.dragCleanup?.();
  current.recorder?.cancelPlayback();
  if (current.recordTimer) clearInterval(current.recordTimer);
  if (current.theater && !current.theater.destroyed) current.theater.destroy();
  current.stage?.destroy();
  current.urls?.forEach((url) => URL.revokeObjectURL(url));
  current = null;
  state.recording = false;
  state.replaying = false;
  voice.stop();
}

function setHtml(html) {
  appEl.innerHTML = html;
  tapAll(appEl);
}

async function renderSplash({ announce = true } = {}) {
  await cleanupScene();
  state.screen = 'splash';
  state.phase = 'idle';
  state.mode = null;
  setHtml(`<section class="screen splash with-bg">
    <div class="splash-scrim"></div>
    <a class="icon-button home-button" data-target="platform-home" href="../../" aria-label="QLOBE Kids home"></a>
    <button class="icon-button sound-button" data-action="sound" data-target="sound" aria-label="Sound"></button>
    <img class="mascot left" src="${face('bear')}" alt="" />
    <img class="mascot right" src="${face('rabbit')}" alt="" />
    <div class="splash-card">
      <div class="logo-kicker">Make your own</div>
      <h1 class="logo">Puppet Retell</h1>
      <p class="tagline">Pick two stars. Tell it your way!</p>
      <div class="splash-actions">
        <button class="mode-button" data-action="mode" data-value="guided" data-target="mode-guided"><img class="mode-art" src="${uiArt.storyStarters}" alt=""><span class="mode-label">Story Starters</span></button>
        <button class="mode-button" data-action="mode" data-value="free" data-target="mode-free"><img class="mode-art" src="${uiArt.freeShow}" alt=""><span class="mode-label">Free Show</span></button>
        <button class="mode-button" data-action="shows" data-target="my-shows"><img class="mode-art" src="${uiArt.myShows}" alt=""><span class="mode-label">My Shows</span></button>
      </div>
    </div>
  </section>`);
  if (announce) speak('intro');
}

function renderStories() {
  state.screen = 'stories';
  const groups = [
    ['original', 'New Story Starters'],
    ['classic', 'Classic Tales'],
  ];
  setHtml(`<section class="screen">
    ${header('Pick a Story')}
    <div class="content-scroll">
      ${groups.map(([collection, label]) => `<h2 class="section-label">${label}</h2>
        <div class="card-grid">${config.stories.filter((story) => story.collection === collection).map((story) => {
          return `<button class="choice-card story-card" data-action="story" data-value="${story.id}" data-target="story-${story.id}">
            <img class="story-illustration" src="${story.art}" alt=""><span class="choice-title">${esc(story.title)}</span>
          </button>`;
        }).join('')}</div>`).join('')}
    </div>
  </section>`);
  speak('pickStory');
}

function renderCast() {
  state.screen = 'cast';
  setHtml(`<section class="screen">
    ${header('Pick Two Puppet Stars', state.mode === 'guided' ? 'stories' : 'splash')}
    <div class="content-scroll">
      <div class="cast-grid">${config.cast.map((character) => {
        const pick = state.cast.indexOf(character);
        return `<button class="choice-card cast-card ${pick >= 0 ? 'selected' : ''}" data-action="cast" data-value="${character}" data-target="cast-${character}" aria-pressed="${pick >= 0}">
          ${pick >= 0 ? `<span class="pick-number">${pick + 1}</span>` : ''}
          <img src="${face(character)}" alt="" /><span class="choice-title">${esc(names[character] || character)}</span>
        </button>`;
      }).join('')}</div>
    </div>
    <div class="continue-bar"><span>${state.cast.length}/2 stars</span><button class="primary-button" ${state.cast.length !== 2 ? 'disabled' : ''} data-action="setup" data-target="cast-next">Dress the Cast →</button></div>
  </section>`);
}

function renderSetup() {
  state.screen = 'setup';
  const stageCards = config.stages.map((stage) =>
    `<button class="choice-card stage-card ${stage.id === state.stageId ? 'selected' : ''}" style="background-image:url('${stage.backdrop}')" data-action="stage" data-value="${stage.id}" data-target="stage-${stage.id}"><span class="choice-title">${esc(stage.title)}</span></button>`).join('');
  const puppetCards = roles.map((role, index) => {
    const character = state.cast[index];
    const selectedAccessory = config.accessories.find((item) => item.id === state.accessories[role]);
    return `<button class="dress-puppet ${state.activeRole === role ? 'active' : ''}" data-action="role" data-value="${role}" data-target="dress-${role}">
      <img src="${face(character)}" alt="" /><strong>${esc(names[character] || character)}</strong>
      <small class="chosen-prop">${selectedAccessory ? `<img src="${selectedAccessory.art}" alt=""><span>${esc(selectedAccessory.title)}</span>` : '<span>No prop</span>'}</small>
    </button>`;
  }).join('');
  const accessories = config.accessories.map((item) =>
    `<button class="accessory ${state.accessories[state.activeRole] === item.id ? 'selected' : ''}" data-action="accessory" data-value="${item.id}" data-target="prop-${item.id}" aria-label="${esc(item.title)}"><img src="${item.art}" alt=""></button>`).join('');
  setHtml(`<section class="screen">
    ${header('Build Your Show', 'cast')}
    <div class="setup-layout">
      <div class="setup-panel"><h2>1. Pick a Stage</h2><div class="stage-grid">${stageCards}</div></div>
      <div class="setup-panel"><h2>2. Dress a Puppet</h2><div class="dress-cast">${puppetCards}</div><div class="accessory-grid"><button class="accessory ${!state.accessories[state.activeRole] ? 'selected' : ''}" data-action="accessory" data-value="" data-target="prop-none" aria-label="No prop"><img src="${uiArt.noProp}" alt=""></button>${accessories}</div></div>
    </div>
    <div class="continue-bar"><span>Tap a puppet, then a prop</span><button class="primary-button" data-action="perform" data-target="stage-ready">Open the Curtain →</button></div>
  </section>`);
  speak('pickStage');
}

function performanceHtml({ replay = false } = {}) {
  const story = state.mode === 'guided' ? getStory() : null;
  const beat = story?.beats[state.beat];
  const loading = state.phase === 'loading';
  return `<section class="screen performance-screen">
    <div class="stage-host" id="stage-host"></div>
    <div class="performance-hud">
      <button class="icon-button back-button" data-action="leave-performance" data-target="back" aria-label="Leave the stage"></button>
      <div class="role-picker" aria-label="Puppet for the next action">
        ${roles.map((role, index) => `<button class="role-button ${state.activeRole === role ? 'active' : ''}" data-action="active-role" data-value="${role}" data-target="active-${role}" aria-label="Choose ${esc(names[state.cast[index]] || state.cast[index])}"><img src="${face(state.cast[index])}" alt="" /></button>`).join('')}
      </div>
      <div class="record-status ${state.recording ? 'live' : ''}" id="record-status">${state.recording ? '<span class="record-dot"></span><span id="record-time">0:00</span>' : loading ? 'Opening curtain…' : replay ? '▶ Replaying' : 'Ready!'}</div>
      ${beat ? `<div class="beat-card" id="beat-card"><img class="beat-art" src="${beat.art}" alt=""><span>${esc(beat.line)}</span>${state.recording && state.beat < story.beats.length - 1 ? '<button class="next-beat" data-action="next-beat" data-target="next-beat" aria-label="Next story part">→</button>' : ''}</div>` : ''}
      <div class="privacy-pill"><img src="${uiArt.privacy}" alt=""> <span>Stays on this device</span></div>
      <div class="action-tray" id="action-tray">
        ${loading ? `<span class="curtain-loader" aria-label="Loading the stage"><img src="${uiArt.loading}" alt=""></span>` : state.recording ? actions.map(([id, art, label]) => `<button class="action-button" data-action="puppet-action" data-value="${id}" data-target="action-${id}" aria-label="${label}"><img src="${art}" alt=""><span>${label}</span></button>`).join('') + '<button class="done-button" data-action="stop-recording" data-target="record-stop">Save<br>Show</button>' : replay ? '<button class="done-button" data-action="stop-replay" data-target="replay-stop">Stop</button>' : '<button class="record-button" data-action="start-recording" data-target="record-start" aria-label="Start recording">●</button>'}
      </div>
    </div>
  </section>`;
}

async function mountPerformance(initial = null, { replay = false } = {}) {
  await cleanupScene();
  if (initial) {
    state.mode = initial.mode || 'free';
    state.storyId = initial.storyId || null;
    state.cast = initial.cast?.slice(0, 2) || config.cast.slice(0, 2);
    state.stageId = initial.stageId || config.stages[0].id;
    state.accessories = { a: initial.accessories?.a || null, b: initial.accessories?.b || null };
  }
  state.screen = 'performance';
  state.phase = 'loading';
  state.replaying = replay;
  state.beat = 0;
  setHtml(performanceHtml({ replay }));
  const stageDef = getStage();
  const stage = await createStage(document.querySelector('#stage-host'));
  const theater = await createTheater(stage, {
    backdrop: stageDef.backdrop,
    floorY: stageDef.floorY,
    worldScale: 1.2,
  });
  stage.root.addChild(theater.view);
  const actors = {
    a: await theater.addActor('a', state.cast[0], { x: .32, flip: false, scale: .68, widthShare: .4 }),
    b: await theater.addActor('b', state.cast[1], { x: .68, flip: true, scale: .68, widthShare: .4 }),
  };
  for (const role of roles) {
    const accessory = config.accessories.find((item) => item.id === state.accessories[role]);
    if (accessory) {
      await theater.addProp(`costume-${role}`, {
        ...accessory,
        holder: role,
        offset: accessory.offset,
      });
    }
  }
  const recorder = createPerformanceRecorder({
    gameId: config.id,
    maxDurationMs: 90_000,
    onLimit: () => finishRecording(),
  });
  current = {
    stage, theater, actors, recorder, urls: [], recordTimer: 0, replayMotion: {},
    dragCleanup: bindDragging(stage, theater, actors),
  };
  state.phase = replay ? 'replay' : 'ready';
  refreshPerformanceHud();
  if (!replay) speak('ready');
}

function bindDragging(stage, theater, actors) {
  const canvas = stage.app.canvas;
  let dragging = null;
  let lastRecorded = 0;
  let lastPoint = { x: 0, y: 0 };
  let lastMoveAt = 0;
  let releaseVelocity = { x: 0, y: 0 };
  const settling = new Map();
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const round = (value) => Math.round(value * 1000) / 1000;
  const topFy = Object.fromEntries(roles.map((role) => {
    const actor = actors[role];
    const { h } = stage.size();
    const bounds = actor.view.getBounds();
    // Derive each character's fly-space ceiling from its actual rendered art,
    // keeping a small strip visible even when the center HUD overlaps it.
    return [role, Math.min(0, (h * .025 - bounds.minY) / h)];
  }));
  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, .02, .98),
      y: clamp((event.clientY - rect.top) / rect.height, .04, .96),
    };
  };
  const ragdollInput = (actor, x, y) => ({ x: actor.flip ? -x : x, y });
  const recordMove = (role, actor, {
    swingX = 0, swingY = 0, dragging: isDragging = false, falling = false,
  } = {}) => {
    current?.recorder.record('move', {
      role,
      x: round(actor.fx),
      y: round(actor.fy || 0),
      swingX: round(swingX),
      swingY: round(swingY),
      dragging: isDragging,
      falling,
    });
  };
  const cancelSettle = (role) => {
    const active = settling.get(role);
    if (active) cancelAnimationFrame(active.raf);
    settling.delete(role);
  };
  const settle = (role, velocity) => {
    cancelSettle(role);
    const actor = actors[role];
    if (!actor) return;
    const ceiling = topFy[role] ?? -.28;
    let y = clamp(Number(actor.fy) || 0, ceiling, .025);
    let vy = clamp(Number(velocity.y) || 0, -1.3, 1.45);
    let driftX = clamp(Number(velocity.x) || 0, -.7, .7);
    let bounce = 0;
    let last = performance.now();
    let lastRecord = 0;
    // Dropping from the floor still gets a small theatrical hop and limb flare.
    if (y > -.015 && vy < .72) vy = .72;
    const state = { raf: 0 };
    settling.set(role, state);

    const step = (now) => {
      if (settling.get(role) !== state) return;
      const dt = clamp((now - last) / 1000 || 1 / 60, 1 / 240, 1 / 30);
      last = now;
      vy += 3.15 * dt;
      y += vy * dt;
      driftX *= Math.exp(-dt * 4.8);
      // Keep an upward toss inside the visible fly space; gravity takes over
      // from the ceiling rather than allowing the puppet to disappear above it.
      if (y < ceiling) {
        y = ceiling;
        if (vy < 0) vy = 0;
      }
      let landed = false;
      let impact = 0;
      if (y >= 0) {
        impact = vy;
        y = 0;
        if (bounce < 1 && impact > .34) {
          vy = -Math.min(.34, impact * .20);
          bounce += 1;
        } else {
          landed = true;
        }
      }

      actor.fy = y;
      theater.placeActor(actor);
      const swingX = clamp(driftX / .8, -1.2, 1.2);
      const swingY = impact > 0
        ? clamp(Math.max(impact, .75) / .8, .75, 1.75)
        : clamp(vy / .8, -1.5, 1.75);
      actor.puppet.setRagdollMotion(ragdollInput(actor, swingX, swingY));

      if (now - lastRecord > 55 || landed) {
        recordMove(role, actor, {
          swingX,
          swingY,
          dragging: false,
          falling: !landed,
        });
        lastRecord = now;
      }
      if (landed) {
        actor.fy = 0;
        theater.placeActor(actor);
        actor.puppet.releaseRagdoll();
        settling.delete(role);
        return;
      }
      state.raf = requestAnimationFrame(step);
    };
    recordMove(role, actor, {
      swingX: clamp(driftX / .8, -1.2, 1.2),
      swingY: clamp(vy / .8, -1.5, 1.75),
      dragging: false,
      falling: true,
    });
    state.raf = requestAnimationFrame(step);
  };
  const down = (event) => {
    if (!state.recording || state.replaying) return;
    const p = point(event);
    const { h } = stage.size();
    dragging = roles.reduce((best, role) => {
      const actor = actors[role];
      const actorY = actor.view.position.y / h;
      const score = (p.x - actor.fx) ** 2 + (p.y - actorY) ** 2 * .7;
      return !best || score < best.score ? { role, score } : best;
    }, null).role;
    cancelSettle(dragging);
    setActiveRole(dragging);
    lastPoint = p;
    lastMoveAt = performance.now();
    lastRecorded = 0;
    releaseVelocity = { x: 0, y: 0 };
    actors[dragging].puppet.setRagdollMotion({ x: 0, y: 0 });
    canvas.setPointerCapture?.(event.pointerId);
  };
  const move = (event) => {
    if (!dragging) return;
    const p = point(event);
    const actor = actors[dragging];
    const now = performance.now();
    const elapsed = Math.max(8, now - lastMoveAt);
    const previousX = actor.fx;
    const previousY = actor.fy || 0;
    actor.fx = clamp(actor.fx + (p.x - lastPoint.x), .08, .92);
    actor.fy = clamp(previousY + (p.y - lastPoint.y), topFy[dragging] ?? -.28, .025);
    const speedX = (actor.fx - previousX) / (elapsed / 1000);
    const speedY = (actor.fy - previousY) / (elapsed / 1000);
    const swingX = clamp(speedX / .82, -1.75, 1.75);
    const swingY = clamp(speedY / .82, -1.5, 1.75);
    theater.placeActor(actor);
    actor.puppet.setRagdollMotion(ragdollInput(actor, swingX, swingY));
    if (now - lastRecorded > 55) {
      recordMove(dragging, actor, {
        swingX,
        swingY,
        dragging: true,
      });
      lastRecorded = now;
    }
    releaseVelocity = { x: speedX, y: speedY };
    lastPoint = p;
    lastMoveAt = now;
  };
  const up = () => {
    if (!dragging) return;
    const role = dragging;
    dragging = null;
    settle(role, releaseVelocity);
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  return () => {
    if (dragging) actors[dragging]?.puppet.releaseRagdoll();
    settling.forEach(({ raf }) => cancelAnimationFrame(raf));
    settling.clear();
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
  };
}

function initialShowState() {
  return {
    mode: state.mode,
    storyId: state.storyId,
    cast: [...state.cast],
    stageId: state.stageId,
    accessories: { ...state.accessories },
  };
}

async function startRecording() {
  if (!current || state.recording) return;
  const mic = await current.recorder.requestMicrophone();
  await speak(mic ? 'micOkay' : 'micNo');
  await speak('recording');
  current.recorder.start(initialShowState(), {
    title: state.mode === 'guided' ? getStory().title : 'Free Show',
    storyArt: state.mode === 'guided' ? getStory().art : uiArt.freeShow,
    microphone: mic,
  });
  state.recording = true;
  state.phase = 'recording';
  state.beat = 0;
  refreshPerformanceHud();
  const started = performance.now();
  current.recordTimer = setInterval(() => {
    const seconds = Math.floor((performance.now() - started) / 1000);
    const clock = document.querySelector('#record-time');
    if (clock) clock.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }, 250);
  if (state.mode === 'guided') {
    const beat = getStory().beats[0];
    current.recorder.record('beat', { index: 0 });
    speak(`story.${getStory().id}.${beat.id}`, beat.line);
  }
}

function refreshPerformanceHud() {
  const hud = document.querySelector('.performance-hud');
  if (!hud) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = performanceHtml({ replay: state.replaying });
  hud.replaceWith(wrapper.firstElementChild.querySelector('.performance-hud'));
  tapAll(document.querySelector('.performance-hud'));
}

async function nextBeat() {
  const story = getStory();
  if (state.beat >= story.beats.length - 1) return;
  state.beat += 1;
  current.recorder.record('beat', { index: state.beat });
  refreshPerformanceHud();
  await speak('nextBeat');
  const beat = story.beats[state.beat];
  speak(`story.${story.id}.${beat.id}`, beat.line);
}

function applyPuppetAction(role, action, { record = true, sound = true } = {}) {
  if (!current?.actors?.[role] || !current.theater) return;
  const actor = current.actors[role];
  if (record) current.recorder.record('action', { role, action });
  if (action === 'hug') {
    current.actors.a.fx = .45;
    current.actors.b.fx = .55;
    current.theater.placeActor(current.actors.a);
    current.theater.placeActor(current.actors.b);
    current.actors.a.puppet.playClip('hug');
    current.actors.b.puppet.playClip('hug');
  } else {
    actor.puppet.playClip(action);
  }
  if (action === 'cheer') {
    current.theater.playFx('burst', role);
    if (sound && !state.muted) sfx.sparkle();
  } else if (sound && !state.muted) {
    action === 'jump' ? sfx.boing() : sfx.pop();
  }
  const delay = state.fastTimers ? 60 : 1050;
  setTimeout(() => {
    if (!current?.actors) return;
    if (action === 'hug') roles.forEach((item) => current.actors[item]?.puppet.playClip('idle'));
    else current.actors[role]?.puppet.playClip('idle');
  }, delay);
}

async function thumbnailBlob() {
  const renderer = current?.stage?.app?.renderer;
  if (!renderer || !current?.theater?.view) return null;
  return new Promise((resolve) => {
    Promise.resolve(renderer.extract.canvas({ target: current.theater.view }))
      .then((canvas) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', .72))
      .catch(() => resolve(null));
  });
}

function setActiveRole(role) {
  if (!roles.includes(role)) return;
  state.activeRole = role;
  document.querySelectorAll('.role-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.value === role);
  });
}

async function finishRecording() {
  if (!current?.recorder?.isRecording()) return;
  state.recording = false;
  state.phase = 'saving';
  if (current.recordTimer) clearInterval(current.recordTimer);
  const show = await current.recorder.stop({
    finalBeat: state.beat,
    title: state.mode === 'guided' ? getStory().title : 'Free Show',
  });
  if (!show) return;
  show.thumbnailBlob = await thumbnailBlob();
  try {
    await store.save(show);
    state.showCount = (await store.list()).length;
    state.phase = 'saved';
    if (!state.muted) sfx.tada();
    burstConfetti();
    showSaved(show.id);
    speak('saved');
  } catch (error) {
    state.phase = 'ready';
    refreshPerformanceHud();
    if (error.code === 'SHELF_FULL') {
      showModal('Show Shelf Full', config.voice.shelfFull, [
        ['My Shows', 'shows', '', 'secondary-button'],
        ['Back to Stage', 'close-modal', '', 'primary-button'],
      ]);
      speak('shelfFull');
    } else {
      showModal('Could Not Save', 'Please try your show one more time.', [
        ['Try Again', 'close-modal', '', 'primary-button'],
      ]);
    }
  }
}

function showSaved(showId) {
  appEl.insertAdjacentHTML('beforeend', `<div class="saved-overlay">
    <div class="celebration-card">
      <img class="saved-art" src="${uiArt.saved}" alt=""><h2>Show Saved!</h2>
      <p>Your voice and puppet moves stay right here on this device.</p>
      <div class="celebration-actions">
        <button class="secondary-button replay-button" data-action="play-show" data-value="${showId}" data-target="replay-saved"><img src="${uiArt.replay}" alt="">Replay</button>
        <button class="secondary-button export-button" data-action="export-show" data-value="${showId}" data-target="export-saved">Export MP4</button>
        <button class="primary-button" data-action="again" data-target="make-another">Make Another</button>
        <button class="secondary-button" data-action="shows" data-target="saved-shows">My Shows</button>
      </div>
    </div>
  </div>`);
  tapAll(appEl.querySelector('.saved-overlay'));
}

async function renderShows() {
  await cleanupScene();
  state.screen = 'shows';
  state.phase = 'shelf';
  const shows = await store.list();
  state.showCount = shows.length;
  const urls = [];
  const cards = shows.map((show) => {
    const url = show.thumbnailBlob instanceof Blob && show.thumbnailBlob.size
      ? URL.createObjectURL(show.thumbnailBlob) : '';
    if (url) urls.push(url);
    const date = new Date(show.createdAt);
    const length = Math.max(1, Math.round((show.durationMs || 0) / 1000));
    return `<article class="choice-card show-card" data-target="show-${show.id}">
      <button class="show-thumb" style="${url ? `background-image:url('${url}')` : ''}" data-action="play-show" data-value="${show.id}" aria-label="Play ${esc(show.metadata?.title || 'puppet show')}">${url ? '' : `<img src="${esc(show.metadata?.storyArt || uiArt.freeShow)}" alt="">`}</button>
      <div class="show-meta"><span>${esc(show.metadata?.title || 'Puppet Show')}<br><small>${date.toLocaleDateString()} · ${length}s</small></span><div class="show-card-actions"><button class="show-export" data-action="export-show" data-value="${show.id}" aria-label="Export ${esc(show.metadata?.title || 'puppet show')} as MP4">MP4</button><button class="show-delete" data-action="delete-show" data-value="${show.id}" aria-label="Delete show"><img src="${uiArt.delete}" alt=""></button></div></div>
    </article>`;
  }).join('');
  setHtml(`<section class="screen">
    ${header('My Shows')}
    <div class="content-scroll">${shows.length ? `<p class="section-label">${shows.length} of ${store.maxShows} saved on this device</p><div class="shows-grid">${cards}</div>` : `<div class="empty-shelf"><img class="empty-art" src="${uiArt.freeShow}" alt=""><h2>Your stage is waiting!</h2><p>Make a show and it will appear here.</p><button class="primary-button" data-action="splash">Make a Show</button></div>`}</div>
  </section>`);
  current = { urls };
  speak('shows');
}

function applyShowEvent(event, { showBeat = false, sound = true } = {}) {
  if (event.type === 'move') {
    const actor = current?.actors?.[event.payload.role];
    if (actor) {
      const x = Math.max(.1, Math.min(.9, Number(event.payload.x) || .5));
      const payloadY = Number(event.payload.y);
      const y = Number.isFinite(payloadY)
        ? Math.max(-.42, Math.min(.025, payloadY))
        : 0;
      const motion = current.replayMotion[event.payload.role] || null;
      const eventTime = Number(event.t);
      const elapsed = motion && Number.isFinite(eventTime)
        ? Math.max(8, eventTime - motion.t)
        : 70;
      const derivedSwingX = motion ? (x - motion.x) / (elapsed / 1000) / .82 : 0;
      const derivedSwingY = motion ? (y - motion.y) / (elapsed / 1000) / .82 : 0;
      const recordedSwingX = Number(event.payload.swingX);
      const legacySwing = Number(event.payload.swing);
      const recordedSwingY = Number(event.payload.swingY);
      const swingX = Number.isFinite(recordedSwingX)
        ? recordedSwingX
        : Number.isFinite(legacySwing)
          ? legacySwing
          : Math.max(-1.75, Math.min(1.75, derivedSwingX));
      const swingY = Number.isFinite(recordedSwingY)
        ? recordedSwingY
        : Math.max(-1.5, Math.min(1.75, derivedSwingY));
      actor.fx = x;
      actor.fy = y;
      current.theater.placeActor(actor);
      actor.puppet.setRagdollMotion({ x: actor.flip ? -swingX : swingX, y: swingY });
      if (event.payload.dragging === false && event.payload.falling !== true) {
        actor.puppet.releaseRagdoll();
      }
      current.replayMotion[event.payload.role] = {
        x,
        y,
        t: Number.isFinite(eventTime) ? eventTime : (motion?.t || 0) + elapsed,
      };
    }
  } else if (event.type === 'action') {
    applyPuppetAction(event.payload.role, event.payload.action, { record: false, sound });
  } else if (event.type === 'beat' && state.mode === 'guided') {
    state.beat = Number(event.payload.index) || 0;
    if (showBeat) refreshPerformanceHud();
  }
}

async function playShow(id) {
  const show = await store.get(id);
  if (!show) return;
  await mountPerformance(show.initialState, { replay: true });
  state.phase = 'replay';
  state.replaying = true;
  current.recorder.play(show, {
    applyEvent: (event) => applyShowEvent(event, { showBeat: true }),
    onEnd: () => {
      state.replaying = false;
      state.phase = 'replay-done';
      showModal('The End!', 'What a wonderful puppet story!', [
        ['Replay', 'play-show', id, 'secondary-button'],
        ['My Shows', 'shows', '', 'primary-button'],
      ]);
      if (!state.muted) sfx.tada();
      speak('cheer');
    },
  });
}

async function exportShow(id) {
  if (state.exporting) return;
  const capabilityCanvas = document.createElement('canvas');
  if (!canExportPerformanceMp4(capabilityCanvas)) {
    showModal('MP4 Export Needs a Newer Browser', 'This show is still safe on this device. Open QLOBE Kids in a current version of Safari or Chrome to export it.', [
      ['Okay', 'close-modal', '', 'primary-button'],
    ]);
    return;
  }
  const show = await store.get(id);
  if (!show) return;

  exportController?.abort();
  exportController = new AbortController();
  state.exporting = true;
  confettiEl.innerHTML = '';
  try {
    await mountPerformance(show.initialState, { replay: true });
    state.replaying = false;
    state.phase = 'exporting';
    document.querySelector('.performance-hud')?.remove();
    const renderer = current.stage.app.renderer;
    // Detach Pixi's responsive ResizePlugin before fixing the capture surface.
    // Otherwise it can restore the onscreen CSS size after this resize, which
    // changes H.264 codec description mid-recording and invalidates avc1 MP4s.
    current.stage.app.resizeTo = null;
    renderer.resolution = 1;
    renderer.resize(1280, 720);
    current.stage.app.canvas.style.width = '100%';
    current.stage.app.canvas.style.height = '100%';
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    showExportProgress(show.metadata?.title || 'Puppet Show');
    const blob = await renderPerformanceMp4({
      canvas: current.stage.app.canvas,
      show,
      applyEvent: (event) => applyShowEvent(event, { sound: false }),
      onProgress: updateExportProgress,
      signal: exportController.signal,
    });
    const filename = exportFilename(show);
    pendingExport = { blob, filename };
    state.phase = 'export-ready';
    showExportReady();
  } catch (error) {
    if (error?.code === 'EXPORT_CANCELLED') {
      await renderShows();
    } else {
      console.error(error);
      await renderShows();
      showModal('Could Not Export MP4', 'Your saved show is still safe. Please try the export again.', [
        ['Okay', 'close-modal', '', 'primary-button'],
      ]);
    }
  } finally {
    exportController = null;
    state.exporting = false;
  }
}

function showExportProgress(title) {
  document.querySelector('.export-progress')?.remove();
  appEl.insertAdjacentHTML('beforeend', `<div class="export-progress modal">
    <div class="modal-card export-card">
      <img class="export-art" src="${uiArt.replay}" alt="">
      <h2>Making Your MP4</h2>
      <p>${esc(title)} is playing into a shareable video right here on this device.</p>
      <div class="export-meter" role="progressbar" aria-label="MP4 export progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="export-meter-fill"></i></div>
      <strong id="export-percent">0%</strong>
      <button class="secondary-button compact-button" data-action="cancel-export">Cancel</button>
    </div>
  </div>`);
  tapAll(appEl.querySelector('.export-progress'));
}

function updateExportProgress(value) {
  const percent = Math.max(0, Math.min(100, Math.round(Number(value) * 100)));
  const meter = document.querySelector('.export-meter');
  const fill = document.querySelector('#export-meter-fill');
  const label = document.querySelector('#export-percent');
  meter?.setAttribute('aria-valuenow', String(percent));
  if (fill) fill.style.width = `${percent}%`;
  if (label) label.textContent = `${percent}%`;
}

function showExportReady() {
  document.querySelector('.export-progress')?.remove();
  const actions = [
    ['Save MP4', 'save-export', '', 'primary-button'],
  ];
  if (pendingExport && typeof navigator.share === 'function' && typeof File !== 'undefined') {
    const file = new File([pendingExport.blob], pendingExport.filename, { type: 'video/mp4' });
    if (navigator.canShare?.({ files: [file] })) actions.push(['Share', 'share-export', '', 'secondary-button']);
  }
  actions.push(['My Shows', 'shows', '', 'secondary-button']);
  showModal('Your MP4 Is Ready!', 'Save it for posterity or open the device share sheet. Nothing was uploaded.', actions);
}

function exportFilename(show) {
  const title = String(show.metadata?.title || 'puppet-show')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'puppet-show';
  const date = String(show.createdAt || new Date().toISOString()).slice(0, 10);
  return `puppet-retell-${title}-${date}.mp4`;
}

function savePendingExport() {
  if (!pendingExport) return;
  const url = URL.createObjectURL(pendingExport.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = pendingExport.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function sharePendingExport() {
  if (!pendingExport) return;
  const file = new File([pendingExport.blob], pendingExport.filename, { type: 'video/mp4' });
  if (!navigator.canShare?.({ files: [file] })) {
    savePendingExport();
    return;
  }
  try {
    await navigator.share({
      files: [file],
      title: 'My Puppet Retell Show',
      text: 'A puppet story made with QLOBE Kids',
    });
  } catch (error) {
    if (error?.name !== 'AbortError') savePendingExport();
  }
}

function showModal(title, message, buttons) {
  document.querySelector('.modal')?.remove();
  appEl.insertAdjacentHTML('beforeend', `<div class="modal"><div class="modal-card"><h2>${esc(title)}</h2><p>${esc(message)}</p><div class="celebration-actions">
    ${buttons.map(([label, action, value, cls]) => `<button class="${cls}" data-action="${action}" data-value="${esc(value)}">${esc(label)}</button>`).join('')}
  </div></div></div>`);
  tapAll(appEl.querySelector('.modal'));
}

function confirmDelete(id) {
  showModal('Erase This Show?', 'This cannot be undone.', [
    ['Keep It', 'close-modal', '', 'secondary-button'],
    ['Erase', 'confirm-delete', id, 'danger-button'],
  ]);
}

function burstConfetti() {
  confettiEl.innerHTML = '';
  const colors = ['#f7c94b', '#ef6148', '#17b8bd', '#8f70d7', '#fff'];
  for (let i = 0; i < 48; i += 1) {
    const bit = document.createElement('i');
    bit.className = 'confetti-bit';
    bit.style.left = `${Math.random() * 100}%`;
    bit.style.background = colors[i % colors.length];
    bit.style.animationDelay = `${Math.random() * .6}s`;
    bit.style.setProperty('--drift', `${Math.round((Math.random() - .5) * 240)}px`);
    confettiEl.appendChild(bit);
  }
  setTimeout(() => { confettiEl.innerHTML = ''; }, 3400);
}

async function handleAction(action, value, el) {
  if (action === 'sound') {
    state.muted = !state.muted;
    if (state.muted) voice.stop();
    el.style.filter = state.muted ? 'grayscale(1)' : '';
    el.style.opacity = state.muted ? '.6' : '';
    return;
  }
  if (action === 'splash') return renderSplash({ announce: false });
  if (action === 'mode') {
    state.mode = value;
    state.cast = [];
    state.accessories = { a: null, b: null };
    if (value === 'guided') {
      renderStories();
      speak('guided');
    } else {
      state.storyId = null;
      renderCast();
      speak('free');
    }
    return;
  }
  if (action === 'stories') return renderStories();
  if (action === 'story') {
    state.storyId = value;
    state.stageId = getStory(value).stage;
    state.cast = [];
    renderCast();
    speak('pickCast');
    return;
  }
  if (action === 'cast') {
    const index = state.cast.indexOf(value);
    if (index >= 0) state.cast.splice(index, 1);
    else if (state.cast.length < 2) state.cast.push(value);
    else state.cast[1] = value;
    renderCast();
    return;
  }
  if (action === 'setup' && state.cast.length === 2) return renderSetup();
  if (action === 'stage') { state.stageId = value; renderSetup(); return; }
  if (action === 'role') { state.activeRole = value; renderSetup(); return; }
  if (action === 'accessory') {
    const other = state.activeRole === 'a' ? 'b' : 'a';
    state.accessories[state.activeRole] = value || null;
    if (value && state.accessories[other] === value) state.accessories[other] = null;
    renderSetup();
    return;
  }
  if (action === 'perform') return mountPerformance();
  if (action === 'active-role') { setActiveRole(value); return; }
  if (action === 'leave-performance') {
    if (state.recording) {
      showModal('Leave the Stage?', 'This show has not been saved yet.', [
        ['Keep Playing', 'close-modal', '', 'secondary-button'],
        ['Leave', 'discard-show', '', 'danger-button'],
      ]);
    } else return renderSplash({ announce: false });
    return;
  }
  if (action === 'discard-show') {
    await current?.recorder?.destroy();
    return renderSplash({ announce: false });
  }
  if (action === 'start-recording') return startRecording();
  if (action === 'stop-recording') return finishRecording();
  if (action === 'next-beat') return nextBeat();
  if (action === 'puppet-action') {
    applyPuppetAction(state.activeRole, value);
    const pressed = document.querySelector(`[data-target="action-${value}"]`);
    pressed?.classList.add('active');
    setTimeout(() => pressed?.classList.remove('active'), 300);
    return;
  }
  if (action === 'again') {
    await cleanupScene();
    state.cast = [];
    state.accessories = { a: null, b: null };
    return state.mode === 'guided' ? renderStories() : renderCast();
  }
  if (action === 'shows') return renderShows();
  if (action === 'play-show') {
    document.querySelector('.modal')?.remove();
    return playShow(value);
  }
  if (action === 'export-show') {
    document.querySelector('.modal')?.remove();
    return exportShow(value);
  }
  if (action === 'cancel-export') { exportController?.abort(); return; }
  if (action === 'save-export') { savePendingExport(); return; }
  if (action === 'share-export') return sharePendingExport();
  if (action === 'stop-replay') {
    current?.recorder?.cancelPlayback();
    return renderShows();
  }
  if (action === 'delete-show') return confirmDelete(value);
  if (action === 'close-modal') { document.querySelector('.modal')?.remove(); return; }
  if (action === 'confirm-delete') {
    await store.remove(value);
    speak('deleted');
    return renderShows();
  }
}

async function init() {
  await Promise.all([
    voice.init('./assets/audio/manifest.json', './data/lines.json', defaultLines),
    openPerformanceStore(config.id).then((result) => { store = result; }),
  ]);
  state.showCount = (await store.list()).length;
  await renderSplash({ announce: false });
  readyResolve();
}

window.addEventListener('pagehide', () => {
  exportController?.abort();
  current?.recorder?.destroy();
  voice.stop();
  speech.stop();
});

window.QLOBE_DEBUG = {
  version: 1,
  ready,
  listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
  startMode: async (id) => {
    unlock();
    await handleAction('mode', id === 'free' ? 'free' : 'guided');
  },
  getState: () => ({
    screen: state.screen,
    mode: state.mode,
    phase: state.phase,
    storyId: state.storyId,
    cast: [...state.cast],
    stageId: state.stageId,
    recording: state.recording,
    replaying: state.replaying,
    showCount: state.showCount,
    exporting: state.exporting,
    round: state.mode === 'guided' ? state.beat + 1 : 1,
    roundsTotal: state.mode === 'guided' ? 3 : 1,
    awaitingInput: !['saving'].includes(state.phase),
  }),
  getTargets: () => [...document.querySelectorAll('[data-target]')].map((el) => {
    const rect = el.getBoundingClientRect();
    return { id: el.dataset.target, x: rect.x, y: rect.y, width: rect.width, height: rect.height, disabled: !!el.disabled };
  }),
  getPuppetMotion: () => Object.fromEntries(Object.entries(current?.actors || {}).map(([role, actor]) => [
    role,
    actor.puppet ? {
      ...actor.puppet.getState().ragdoll,
      fx: actor.fx,
      fy: actor.fy || 0,
    } : null,
  ])),
  tap: async (id) => {
    const el = document.querySelector(`[data-target="${CSS.escape(id)}"]`);
    if (!el) throw new Error(`No target: ${id}`);
    el.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
  },
  winRound: async () => {
    if (state.screen === 'stories') return handleAction('story', config.stories[0].id);
    if (state.screen === 'cast') {
      state.cast = config.cast.slice(0, 2);
      renderCast();
      return;
    }
    if (state.screen === 'setup') return mountPerformance();
    if (state.screen === 'performance' && state.recording) return finishRecording();
    if (state.screen === 'performance') return startRecording();
  },
  mute: (value = true) => { state.muted = !!value; if (value) voice.stop(); },
  seed: (value) => { state.seed = Number(value) || 1; },
  extras: {
    fastTimers: (value = true) => { state.fastTimers = !!value; },
    finishRecording,
  },
};

init().catch((error) => {
  console.error(error);
  setHtml(`<section class="screen"><div class="empty-shelf"><img class="empty-art" src="${uiArt.loading}" alt=""><h1>The puppets need a quick rest.</h1><p>Reload the page to open the curtain.</p></div></section>`);
  readyResolve();
});
