import config from '../config.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import { unlockAll, installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { onTap } from '../../../shared/js/tap.js';
import { createScreens } from '../../../shared/js/screens.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { createTimers } from '../../../shared/js/timers.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { escapeHtml } from '../../../shared/js/dom.js';
import { createConstrainedGestureDom } from '../../../shared/js/stage/constrained-gesture-dom.js';
import { createMonsterAudio } from './monster-audio.js';

const root = document.getElementById('game');
const timers = createTimers();
const visualTimers = createTimers();
const narrator = createNarrator({ announcerParent: root });
const actions = new Map();
const staticDisposers = [];
let dynamicDisposers = [];

const UI_ASSETS = [
  'coral-pill', 'teal-pill', 'recording-pill',
  'pitch-high', 'pitch-middle', 'pitch-low',
  'replay', 'pause', 'resume', 'selected-badge',
  'cast-tray', 'purple-label',
  'chorus-heading', 'solo-heading', 'stage-heading',
].map((name) => `./assets/ui/${name}.webp`);

const state = {
  mode: null,
  selected: [...config.defaultSelected],
  activeMonster: 'pink',
  pitch: 'middle',
  stage: 'garden',
  muted: false,
  phraseCounter: 0,
  showPhase: 'idle',
  showElapsed: 0,
  paused: false,
  pausedByVisibility: false,
  recordedEvents: [],
  audioReady: false,
};

const byId = (id) => config.cast.find((monster) => monster.id === id);
const stageById = (id) => config.stages.find((stage) => stage.id === id);
const screen = (name) => root.querySelector(`[data-qk-screen="${name}"]`);

function poseAsset(id, pose = 'neutral') {
  if (pose === 'singing') return `./assets/monsters-singing/${id}.webp`;
  if (pose === 'blink') return `./assets/monsters-blink/${id}.webp`;
  if (pose === 'gaze-left') return `./assets/monsters-gaze-left/${id}.webp`;
  if (pose === 'gaze-right') return `./assets/monsters-gaze-right/${id}.webp`;
  return byId(id)?.asset || config.cast[0].asset;
}

function setVisualPose(node, pose, id = node?.dataset?.monsterVisual) {
  if (!node || !byId(id)) return false;
  node.dataset.monsterVisual = id;
  node.dataset.monsterPose = pose;
  const wanted = poseAsset(id, pose);
  if (!node.getAttribute('src')?.endsWith(wanted.replace('./', ''))) node.src = wanted;
  return true;
}

function card(monster, cls, prefix, { art = monster.card, selectable = true } = {}) {
  return `
    <button class="${cls}" type="button" data-${prefix}="${monster.id}"
      aria-label="${escapeHtml(monster.name)}, ${escapeHtml(monster.role)}">
      <img class="mo-card-art" src="${art}" alt="" draggable="false" />
      ${selectable ? '<img class="mo-selected-badge" src="./assets/ui/selected-badge.webp" alt="" draggable="false" />' : ''}
    </button>`;
}

root.innerHTML = `
  <section class="mo-screen mo-splash" data-qk-screen="splash" aria-label="Monster Opera menu">
    <img class="mo-bg mo-bg-splash-landscape" src="./assets/bg/splash.webp" alt="" draggable="false" />
    <img class="mo-bg mo-bg-splash-portrait" src="./assets/bg/splash-portrait.webp" alt="" draggable="false" />
    <a class="qk-hud-btn qk-hud-home qk-hud-top-left" href="../../" data-target="catalog-home" aria-label="Home"></a>
    <button class="qk-hud-btn qk-hud-sound qk-hud-top-right" type="button" data-sound data-target="sound-splash" aria-label="Mute sound"></button>
    <h1 class="visually-hidden">Monster Opera</h1>
    <div class="mo-splash-cast" role="group" aria-label="Pick a monster to sing solo">
      ${config.cast.map((monster) => card(monster, 'mo-splash-card', 'splash-monster', {
        art: monster.asset,
        selectable: false,
      })).join('')}
    </div>
    <button class="mo-play-main" type="button" data-action="start-chorus" aria-label="Make a chorus">
      <img src="../../shared/assets/ui/btn-play.png" alt="" draggable="false" />
      <span class="mo-control-label">
        <img src="./assets/ui/coral-pill.webp" alt="" draggable="false" />
        <span>MAKE A CHORUS</span>
      </span>
    </button>
  </section>

  <section class="mo-screen mo-chorus" data-qk-screen="chorus" aria-label="Make a Chorus" hidden>
    <img class="mo-bg" src="./assets/bg/solo.webp" alt="" draggable="false" />
    <button class="qk-hud-btn qk-hud-back qk-hud-top-left" type="button" data-back data-target="back-chorus" aria-label="Back to menu"></button>
    <button class="qk-hud-btn qk-hud-sound qk-hud-top-right" type="button" data-sound data-target="sound-chorus" aria-label="Mute sound"></button>
    <header class="mo-heading">
      <img class="mo-heading-art" src="./assets/ui/chorus-heading.webp" alt="" draggable="false" />
      <h2 class="visually-hidden">Make a chorus</h2>
      <span class="mo-cast-count">
        <img src="./assets/ui/purple-label.webp" alt="" draggable="false" />
        <span aria-live="polite" data-cast-count></span>
      </span>
    </header>
    <button class="mo-stage-shortcut" type="button" data-action="open-stages" aria-label="Pick a stage">
      <img src="./assets/bg/garden.webp" alt="" draggable="false" data-stage-thumb />
      <span class="mo-stage-shortcut-label">
        <img src="./assets/ui/purple-label.webp" alt="" draggable="false" />
        <span>STAGE</span>
      </span>
    </button>
    <div class="mo-chorus-grid" role="group" aria-label="Monster singers">
      ${config.cast.map((monster) => card(monster, 'mo-chorus-card', 'chorus-monster')).join('')}
    </div>
    <button class="mo-play-all" type="button" data-action="play-all" aria-label="Play all selected monsters">
      <img src="../../shared/assets/ui/btn-play.png" alt="" draggable="false" />
      <span class="mo-control-label">
        <img src="./assets/ui/coral-pill.webp" alt="" draggable="false" />
        <span>PLAY ALL</span>
      </span>
    </button>
  </section>

  <section class="mo-screen mo-solo" data-qk-screen="solo" aria-label="Sing with Me" hidden>
    <img class="mo-bg" src="./assets/bg/solo.webp" alt="" draggable="false" />
    <button class="qk-hud-btn qk-hud-back qk-hud-top-left" type="button" data-back data-target="back-solo" aria-label="Back to menu"></button>
    <button class="qk-hud-btn qk-hud-sound qk-hud-top-right" type="button" data-sound data-target="sound-solo" aria-label="Mute sound"></button>
    <header class="mo-heading">
      <img class="mo-heading-art" src="./assets/ui/solo-heading.webp" alt="" draggable="false" />
      <h2 class="visually-hidden">Sing with me</h2>
    </header>
    <div class="mo-solo-rail" role="group" aria-label="Pick a singer">
      ${config.cast.map((monster) => card(monster, 'mo-solo-card', 'solo-monster')).join('')}
    </div>
    <button class="mo-solo-star" type="button" data-action="solo-sing"
      aria-label="Tap the monster to sing. Swipe left or right to choose another singer.">
      <img data-solo-active data-monster-visual="pink" data-monster-pose="neutral"
        data-pose-token="0" src="./assets/monsters/pink.webp" alt="Pink fuzzy monster" draggable="false" />
    </button>
    <button class="mo-sing-cta" type="button" data-action="solo-sing" aria-label="Tap to sing">
      <img class="mo-button-plate" src="./assets/ui/coral-pill.webp" alt="" draggable="false" />
      <span>TAP TO SING</span>
    </button>
    <div class="mo-pitches" role="group" aria-label="Choose pitch">
      <button class="mo-pitch mo-pitch-high" type="button" data-pitch="high" aria-label="High pitch"><img src="./assets/ui/pitch-high.webp" alt="" draggable="false" /></button>
      <button class="mo-pitch mo-pitch-middle" type="button" data-pitch="middle" aria-label="Middle pitch"><img src="./assets/ui/pitch-middle.webp" alt="" draggable="false" /></button>
      <button class="mo-pitch mo-pitch-low" type="button" data-pitch="low" aria-label="Low pitch"><img src="./assets/ui/pitch-low.webp" alt="" draggable="false" /></button>
    </div>
  </section>

  <section class="mo-screen mo-stages" data-qk-screen="stages" aria-label="Pick a Stage" hidden>
    <img class="mo-bg" src="./assets/bg/solo.webp" alt="" draggable="false" />
    <button class="qk-hud-btn qk-hud-back qk-hud-top-left" type="button" data-action="back-to-chorus" data-target="back-stages" aria-label="Back to chorus"></button>
    <button class="qk-hud-btn qk-hud-sound qk-hud-top-right" type="button" data-sound data-target="sound-stages" aria-label="Mute sound"></button>
    <header class="mo-heading">
      <img class="mo-heading-art" src="./assets/ui/stage-heading.webp" alt="" draggable="false" />
      <h2 class="visually-hidden">Pick a stage</h2>
    </header>
    <div class="mo-stage-grid" role="group" aria-label="Stages">
      ${config.stages.map((stage) => `
        <button class="mo-stage-card" type="button" data-stage="${stage.id}" aria-label="${escapeHtml(stage.title)}">
          <img src="${stage.asset}" alt="" draggable="false" />
          <span class="mo-stage-label">
            <img src="./assets/ui/purple-label.webp" alt="" draggable="false" />
            <span>${escapeHtml(stage.title)}</span>
          </span>
        </button>`).join('')}
    </div>
    <div class="mo-cast-tray" aria-hidden="true">
      <img class="mo-cast-tray-plate" src="./assets/ui/cast-tray.webp" alt="" draggable="false" />
      <div class="mo-cast-tray-monsters" data-stage-cast></div>
    </div>
    <button class="mo-start-show" type="button" data-action="start-show" aria-label="Start the show">
      <img class="mo-button-plate" src="./assets/ui/coral-pill.webp" alt="" draggable="false" />
      <span>START THE SHOW</span>
    </button>
  </section>

  <section class="mo-screen mo-show" data-qk-screen="show" aria-label="Monster Opera performance" hidden>
    <img class="mo-bg" data-stage-bg src="./assets/bg/garden.webp" alt="" draggable="false" />
    <button class="qk-hud-btn qk-hud-back qk-hud-top-left" type="button" data-back data-target="back-show" aria-label="Back to menu"></button>
    <button class="qk-hud-btn qk-hud-sound qk-hud-top-right" type="button" data-sound data-target="sound-show" aria-label="Mute sound"></button>
    <div class="mo-recording" aria-live="polite">
      <img data-recording-plate src="./assets/ui/recording-pill.webp" alt="" draggable="false" />
      <span data-recording>RECORDING 00:00</span>
    </div>
    <div class="mo-performers" data-performers role="group" aria-label="Performing monsters"></div>
    <div class="mo-show-controls">
      <button class="mo-replay" type="button" data-action="replay-show" aria-label="Replay performance"><img src="./assets/ui/replay.webp" alt="" draggable="false" /></button>
      <button class="mo-pause" type="button" data-action="pause-show" aria-label="Pause performance"><img data-pause-icon src="./assets/ui/pause.webp" alt="" draggable="false" /></button>
      <button class="mo-done" type="button" data-action="done-show" aria-label="Done">
        <img src="./assets/ui/teal-pill.webp" alt="" draggable="false" />
        <span>DONE</span>
      </button>
    </div>
  </section>`;

const screens = createScreens({
  root,
  screens: {
    splash: screen('splash'),
    chorus: screen('chorus'),
    solo: screen('solo'),
    stages: screen('stages'),
    show: screen('show'),
  },
  initial: 'splash',
  voice: narrator,
  onExit: () => {
    timers.clearAll();
    audio?.stop();
  },
});

const audio = createMonsterAudio(config, { onNote: animateSinger });

function clearDynamicBindings() {
  dynamicDisposers.forEach((dispose) => { try { dispose(); } catch { /* no-op */ } });
  dynamicDisposers = [];
  for (const key of [...actions.keys()]) {
    if (key.startsWith('performer-')) actions.delete(key);
  }
}

function bind(el, id, fn, { dynamic = false, feedback = true } = {}) {
  if (!el) return;
  el.dataset.target = id;
  actions.set(id, fn);
  const dispose = onTap(el, (event) => {
    // Pointer activation is covered by the shared first-gesture listener.
    // Keyboard and assistive-tech activation arrives as a zero-detail click,
    // so reopen every audio channel synchronously in that gesture task too.
    if (event.type === 'click' && event.detail === 0) unlockAll([() => audio.unlock()]);
    return fn(event);
  }, {
    feedback: feedback ? () => sfx.tick() : undefined,
  });
  (dynamic ? dynamicDisposers : staticDisposers).push(dispose);
}

function speak(key) {
  return narrator.say(key, config.voice[key]);
}

function updateSoundControls() {
  root.querySelectorAll('[data-sound]').forEach((button) => {
    button.classList.toggle('is-muted', state.muted);
    button.setAttribute('aria-label', state.muted ? 'Turn sound on' : 'Mute sound');
    button.setAttribute('aria-pressed', String(state.muted));
  });
}

function toggleSound() {
  state.muted = !state.muted;
  narrator.setMuted(state.muted);
  voiceClips.setMuted(state.muted);
  sfx.setMuted(state.muted);
  audio.setMuted(state.muted);
  updateSoundControls();
  return state.muted;
}

function goSplash() {
  audio.stop();
  state.mode = null;
  state.showPhase = 'idle';
  state.paused = false;
  state.pausedByVisibility = false;
  screens.show('splash');
  armNudger();
  return true;
}

function updateChorus() {
  root.querySelectorAll('[data-chorus-monster]').forEach((button) => {
    const selected = state.selected.includes(button.dataset.chorusMonster);
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.dataset.role = selected ? 'selected' : 'neutral';
  });
  const count = root.querySelector('[data-cast-count]');
  if (count) count.textContent = `${state.selected.length} of ${config.maxSelected} singers`;
  const play = root.querySelector('[data-action="play-all"]');
  const stage = root.querySelector('[data-action="open-stages"]');
  const hasSinger = state.selected.length > 0;
  if (play) {
    play.disabled = !hasSinger;
    play.classList.toggle('is-ready', hasSinger);
  }
  if (stage) stage.disabled = !hasSinger;
}

function updateSolo() {
  const monster = byId(state.activeMonster) || config.cast[0];
  const active = root.querySelector('[data-solo-active]');
  active.alt = `${monster.name}, fuzzy monster singer`;
  active.dataset.poseToken = String(Number(active.dataset.poseToken || 0) + 1);
  setVisualPose(active, 'neutral', monster.id);
  root.querySelectorAll('[data-solo-monster]').forEach((button) => {
    const selected = button.dataset.soloMonster === monster.id;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  root.querySelectorAll('[data-pitch]').forEach((button) => {
    const selected = button.dataset.pitch === state.pitch;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function updateStages() {
  const stage = stageById(state.stage) || config.stages[0];
  root.querySelectorAll('[data-stage]').forEach((button) => {
    const selected = button.dataset.stage === stage.id;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const thumb = root.querySelector('[data-stage-thumb]');
  if (thumb) thumb.src = stage.asset;
  const tray = root.querySelector('[data-stage-cast]');
  tray.innerHTML = currentCast().map((id) => {
    const monster = byId(id);
    return `<img src="${monster.asset}" alt="" draggable="false" />`;
  }).join('');
}

function currentCast() {
  return state.selected.slice(0, config.maxSelected);
}

function chooseChorus(id) {
  const at = state.selected.indexOf(id);
  if (at >= 0) state.selected.splice(at, 1);
  else {
    if (state.selected.length >= config.maxSelected) state.selected.shift();
    state.selected.push(id);
  }
  state.activeMonster = id;
  updateChorus();
  updateStages();
  audio.playMonster(id, { pitch: 'middle', phraseIndex: state.phraseCounter++ });
  animateSinger({ id });
  return true;
}

function chooseSolo(id, { sing = true } = {}) {
  if (!byId(id)) return false;
  state.activeMonster = id;
  updateSolo();
  if (sing) singSolo();
  return true;
}

function cycleSolo(direction = 1) {
  const current = Math.max(0, config.cast.findIndex((monster) => monster.id === state.activeMonster));
  const next = (current + Math.sign(direction || 1) + config.cast.length) % config.cast.length;
  return chooseSolo(config.cast[next].id);
}

function setPitch(pitch) {
  if (!(pitch in { low: 1, middle: 1, high: 1 })) return false;
  state.pitch = pitch;
  updateSolo();
  speak(pitch);
  singSolo();
  return true;
}

function singSolo() {
  const result = audio.playMonster(state.activeMonster, {
    pitch: state.pitch,
    phraseIndex: state.phraseCounter++,
  });
  animateSinger({ id: state.activeMonster });
  return result.accepted;
}

async function startMode(id) {
  const mode = config.modes.find((entry) => entry.id === id);
  if (!mode) return false;
  state.mode = id;
  if (id === 'solo') {
    screens.show('solo');
    updateSolo();
    speak('choose-singer');
  } else if (id === 'stage-show') {
    screens.show('stages');
    updateStages();
    speak('choose-stage');
  } else {
    if (!state.selected.length) state.selected = [...config.defaultSelected];
    screens.show('chorus');
    updateChorus();
    speak('choose-chorus');
  }
  armNudger();
  return true;
}

function openStages() {
  state.mode = 'stage-show';
  screens.show('stages');
  updateStages();
  speak('choose-stage');
  armNudger();
  return true;
}

function chooseStage(id) {
  if (!stageById(id)) return false;
  state.stage = id;
  updateStages();
  audio.stageSting(id);
  return true;
}

function renderPerformers() {
  clearDynamicBindings();
  const cast = currentCast();
  const host = root.querySelector('[data-performers]');
  host.style.setProperty('--performer-count', cast.length);
  host.innerHTML = cast.map((id, index) => {
    const monster = byId(id);
    return `
      <button class="mo-performer" type="button" data-performer="${id}"
        style="--slot:${index};--monster-color:${monster.color}"
        aria-label="${escapeHtml(monster.name)} sing now">
        <img src="${monster.asset}" alt="" draggable="false"
          data-monster-visual="${id}" data-monster-pose="neutral" data-pose-token="0" />
      </button>`;
  }).join('');
  host.querySelectorAll('[data-performer]').forEach((button) => {
    const id = button.dataset.performer;
    bind(button, `performer-${id}`, () => performLive(id), { dynamic: true, feedback: false });
  });
}

function recordEvent(id, pitch, phraseIndex, automatic = false) {
  const event = {
    id,
    pitch,
    phraseIndex,
    at: Math.round(state.showElapsed * 1000) / 1000,
    automatic,
  };
  state.recordedEvents.push(event);
  return event;
}

function playEvent(event, when = null) {
  return audio.playMonster(event.id, {
    pitch: event.pitch,
    phraseIndex: event.phraseIndex,
    when,
  });
}

function performLive(id) {
  if (state.showPhase !== 'performing' || state.paused) return false;
  const index = currentCast().indexOf(id);
  const pitch = index % 3 === 0 ? 'middle' : index % 3 === 1 ? 'low' : 'high';
  const phraseIndex = state.phraseCounter++;
  const event = recordEvent(id, pitch, phraseIndex, false);
  playEvent(event);
  return true;
}

function showTick() {
  if (state.showPhase !== 'performing' || state.paused) return;
  state.showElapsed = Math.min(config.showDurationSeconds, state.showElapsed + 0.25);
  updateRecording();
  const quarter = Math.round(state.showElapsed * 4);
  if (quarter > 0 && quarter % 8 === 0) {
    const cast = currentCast();
    const id = cast[(quarter / 8) % cast.length];
    const phraseIndex = state.phraseCounter++;
    const event = recordEvent(id, quarter % 16 === 0 ? 'high' : 'middle', phraseIndex, true);
    playEvent(event);
  }
  if (state.showElapsed >= config.showDurationSeconds) finishShow();
}

function updateRecording() {
  const seconds = Math.floor(state.showElapsed);
  const label = root.querySelector('[data-recording]');
  label.textContent = `${state.showPhase === 'finished' ? 'RECORDED' : 'RECORDING'} 00:${String(seconds).padStart(2, '0')}`;
  root.querySelector('.mo-recording')?.classList.toggle('is-finished', state.showPhase === 'finished');
  const recordingPlate = root.querySelector('[data-recording-plate]');
  if (recordingPlate) recordingPlate.src = state.showPhase === 'finished'
    ? './assets/ui/teal-pill.webp'
    : './assets/ui/recording-pill.webp';
  const pauseIcon = root.querySelector('[data-pause-icon]');
  if (pauseIcon) pauseIcon.src = state.paused ? './assets/ui/resume.webp' : './assets/ui/pause.webp';
}

function startShow() {
  if (!currentCast().length) {
    screens.show('chorus');
    state.mode = 'chorus';
    updateChorus();
    speak('choose-chorus');
    armNudger();
    return false;
  }
  audio.stop();
  state.mode = 'stage-show';
  state.showPhase = 'performing';
  state.showElapsed = 0;
  state.paused = false;
  state.pausedByVisibility = false;
  state.recordedEvents = [];
  const stage = stageById(state.stage) || config.stages[0];
  root.querySelector('[data-stage-bg]').src = stage.asset;
  renderPerformers();
  screens.show('show');
  armNudger();
  updateRecording();
  speak('ready-show');

  const cast = currentCast();
  const audioStart = audio.now() + 0.22;
  cast.forEach((id, index) => {
    const event = {
      id,
      pitch: index % 3 === 0 ? 'middle' : index % 3 === 1 ? 'low' : 'high',
      phraseIndex: state.phraseCounter++,
      at: index * 0.22,
      automatic: true,
    };
    state.recordedEvents.push(event);
    playEvent(event, audioStart + event.at);
  });
  timers.every(250, showTick);
  return true;
}

function pauseShow() {
  if (state.showPhase !== 'performing') return false;
  state.paused = !state.paused;
  state.pausedByVisibility = false;
  if (state.paused) audio.stop();
  else {
    const cast = currentCast();
    if (cast.length) playEvent(recordEvent(cast[0], 'middle', state.phraseCounter++, true));
  }
  updateRecording();
  return true;
}

function finishShow() {
  if (state.showPhase === 'finished') return true;
  state.showPhase = 'finished';
  state.paused = false;
  state.pausedByVisibility = false;
  state.showElapsed = config.showDurationSeconds;
  timers.clearAll();
  audio.stop();
  updateRecording();
  speak('lovely');
  sfx.tada();
  return true;
}

function replayPerformance() {
  if (!state.recordedEvents.length) return false;
  timers.clearAll();
  audio.stop();
  state.showPhase = 'replay';
  state.paused = false;
  state.pausedByVisibility = false;
  state.showElapsed = 0;
  updateRecording();
  speak('replay');
  const start = audio.now() + 0.25;
  for (const event of state.recordedEvents) playEvent(event, start + event.at);
  const endAt = Math.min(config.showDurationSeconds, Math.max(...state.recordedEvents.map((event) => event.at), 0) + 1.4);
  let elapsed = 0;
  timers.every(250, () => {
    elapsed += 0.25;
    state.showElapsed = Math.min(endAt, elapsed);
    updateRecording();
    if (elapsed >= endAt) {
      state.showPhase = 'finished';
      updateRecording();
      timers.clearAll();
    }
  });
  return true;
}

function doneShow() {
  audio.stop();
  state.showPhase = 'idle';
  state.paused = false;
  state.pausedByVisibility = false;
  screens.show('chorus');
  state.mode = 'chorus';
  updateChorus();
  speak('again');
  armNudger();
  return true;
}

function animateSinger({ id }) {
  root.querySelectorAll(`[data-monster-visual="${CSS.escape(id)}"]`).forEach((node) => {
    const token = Number(node.dataset.poseToken || 0) + 1;
    node.dataset.poseToken = String(token);
    node.classList.remove('is-singing');
    void node.offsetWidth;
    node.classList.add('is-singing');

    const poseAt = (delay, pose) => visualTimers.after(delay, () => {
      if (Number(node.dataset.poseToken) !== token || node.dataset.monsterVisual !== id) return;
      setVisualPose(node, pose, id);
      if (pose === 'neutral') node.classList.remove('is-singing');
    });
    setVisualPose(node, 'singing', id);
    poseAt(115, 'neutral');
    poseAt(205, 'singing');
    poseAt(320, 'neutral');
    poseAt(405, 'singing');
    poseAt(520, 'neutral');
  });
}

let blinkCursor = 0;
function blinkOneVisibleMonster() {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  const visible = [...screen(screens.current)?.querySelectorAll('[data-monster-visual]') || []]
    .filter((node) => node.dataset.monsterPose === 'neutral');
  if (!visible.length) return false;
  const node = visible[blinkCursor % visible.length];
  blinkCursor += 1;
  const id = node.dataset.monsterVisual;
  const token = Number(node.dataset.poseToken || 0) + 1;
  node.dataset.poseToken = String(token);
  setVisualPose(node, 'blink', id);
  visualTimers.after(155, () => {
    if (Number(node.dataset.poseToken) === token && node.dataset.monsterVisual === id) {
      setVisualPose(node, 'neutral', id);
    }
  });
  return true;
}

function updateLook(event) {
  if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
  const activeScreen = screen(screens.current);
  if (!activeScreen) return;
  const rect = activeScreen.getBoundingClientRect();
  const nx = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
  const ny = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2));
  const gazePose = nx < -0.22 ? 'gaze-left' : nx > 0.22 ? 'gaze-right' : 'neutral';
  activeScreen.querySelectorAll('[data-monster-visual]').forEach((node) => {
    if (['neutral', 'gaze-left', 'gaze-right'].includes(node.dataset.monsterPose)) {
      setVisualPose(node, gazePose);
    }
    node.style.setProperty('--mo-look-x', `${(nx * 5).toFixed(2)}px`);
    node.style.setProperty('--mo-look-y', `${(ny * 3).toFixed(2)}px`);
    node.style.setProperty('--mo-look-turn', `${(nx * 1.2).toFixed(2)}deg`);
  });
}

function resetLook() {
  root.querySelectorAll('[data-monster-visual]').forEach((node) => {
    if (node.dataset.monsterPose === 'gaze-left' || node.dataset.monsterPose === 'gaze-right') {
      setVisualPose(node, 'neutral');
    }
    node.style.removeProperty('--mo-look-x');
    node.style.removeProperty('--mo-look-y');
    node.style.removeProperty('--mo-look-turn');
  });
}

const nudger = createNudger({
  first: 9000,
  repeat: 11000,
  onNudge: (index) => {
    if (screens.is('splash')) {
      if (index === 0) speak('intro');
      else root.querySelector('[data-action="start-chorus"]')?.classList.add('is-nudged');
    } else if (screens.is('chorus')) {
      if (index === 0) speak('choose-chorus');
      else chooseChorus(config.cast[0].id);
    } else if (screens.is('solo')) {
      if (index === 0) speak('choose-singer');
      else singSolo();
    } else if (screens.is('stages')) {
      if (index === 0) speak('choose-stage');
      else audio.stageSting(state.stage);
    }
  },
});

function armNudger() {
  nudger.stop();
  if (!screens.is('show')) nudger.arm();
}

const soloStar = root.querySelector('.mo-solo-star[data-action="solo-sing"]');
const soloStarImage = soloStar.querySelector('[data-solo-active]');
const resetSoloSwipe = () => {
  soloStar.classList.remove('is-swiping');
  soloStarImage.style.removeProperty('--mo-swipe-x');
};
const soloGesture = createConstrainedGestureDom({
  slop: 14,
  getHandle: () => soloStar,
  canStart: () => screens.is('solo'),
  project: (point, active) => ({
    progress: 0.5 + (point.x - active.startPoint.x) / 260,
    point,
  }),
  onStart: () => soloStar.classList.add('is-swiping'),
  onProgress: (active) => {
    const dx = Math.max(-34, Math.min(34, active.lastPoint.x - active.startPoint.x));
    soloStarImage.style.setProperty('--mo-swipe-x', `${dx.toFixed(1)}px`);
  },
  onRelease: (active) => {
    const dx = active.lastPoint.x - active.startPoint.x;
    resetSoloSwipe();
    if (Math.abs(dx) < 36) return singSolo();
    return cycleSolo(dx < 0 ? 1 : -1);
  },
  onTap: () => singSolo(),
  onCancel: resetSoloSwipe,
});

const beginSoloGesture = (event) => soloGesture.begin(event, 'solo-singer');
const keyboardSoloSing = (event) => {
  if (event.detail !== 0) return;
  unlockAll([() => audio.unlock()]);
  singSolo();
};
soloStar.dataset.target = 'solo-monster';
actions.set('solo-monster', singSolo);
soloStar.addEventListener('pointerdown', beginSoloGesture);
soloStar.addEventListener('click', keyboardSoloSing);
staticDisposers.push(() => {
  soloStar.removeEventListener('pointerdown', beginSoloGesture);
  soloStar.removeEventListener('click', keyboardSoloSing);
  soloGesture.detach();
});

// Static controls.
root.querySelectorAll('[data-sound]').forEach((button) => bind(button, button.dataset.target, toggleSound));
root.querySelectorAll('[data-back]').forEach((button) => bind(button, button.dataset.target, goSplash));
bind(root.querySelector('[data-action="start-chorus"]'), 'start-chorus', () => startMode('chorus'));
bind(root.querySelector('[data-action="open-stages"]'), 'open-stages', openStages);
bind(root.querySelector('[data-action="play-all"]'), 'play-all', startShow);
bind(root.querySelector('[data-action="back-to-chorus"]'), 'back-to-chorus', () => startMode('chorus'));
bind(root.querySelector('[data-action="start-show"]'), 'start-show', startShow);
bind(root.querySelector('.mo-sing-cta[data-action="solo-sing"]'), 'solo-sing', singSolo, { feedback: false });
bind(root.querySelector('[data-action="pause-show"]'), 'pause-show', pauseShow);
bind(root.querySelector('[data-action="replay-show"]'), 'replay-show', replayPerformance);
bind(root.querySelector('[data-action="done-show"]'), 'done-show', doneShow);

root.querySelectorAll('[data-splash-monster]').forEach((button) => {
  const id = button.dataset.splashMonster;
  bind(button, `splash-${id}`, () => {
    state.activeMonster = id;
    return startMode('solo').then(() => singSolo());
  }, { feedback: false });
});
root.querySelectorAll('[data-chorus-monster]').forEach((button) => {
  const id = button.dataset.chorusMonster;
  bind(button, `chorus-${id}`, () => chooseChorus(id), { feedback: false });
});
root.querySelectorAll('[data-solo-monster]').forEach((button) => {
  const id = button.dataset.soloMonster;
  bind(button, `solo-${id}`, () => chooseSolo(id), { feedback: false });
});
root.querySelectorAll('[data-pitch]').forEach((button) => {
  const pitch = button.dataset.pitch;
  bind(button, `pitch-${pitch}`, () => setPitch(pitch));
});
root.querySelectorAll('[data-stage]').forEach((button) => {
  const id = button.dataset.stage;
  bind(button, `stage-${id}`, () => chooseStage(id), { feedback: false });
});

installUnlockOnGesture({
  extra: [() => audio.unlock()],
  onFirst: () => speak('intro'),
});
installKioskGuards();
root.addEventListener('pointerdown', updateLook, { passive: true });
root.addEventListener('pointermove', updateLook, { passive: true });
root.addEventListener('pointerleave', resetLook);
staticDisposers.push(() => {
  root.removeEventListener('pointerdown', updateLook);
  root.removeEventListener('pointermove', updateLook);
  root.removeEventListener('pointerleave', resetLook);
});
visualTimers.every(3200, blinkOneVisibleMonster);

const imageUrls = [
  './assets/bg/splash.webp', './assets/bg/splash-portrait.webp', './assets/bg/solo.webp',
  ...UI_ASSETS,
  ...config.stages.map((stage) => stage.asset),
  ...config.cast.flatMap((monster) => [
    monster.asset,
    monster.card,
    poseAsset(monster.id, 'singing'),
    poseAsset(monster.id, 'blink'),
    poseAsset(monster.id, 'gaze-left'),
    poseAsset(monster.id, 'gaze-right'),
  ]),
];
const ready = Promise.all([audio.init(), preloadImages(imageUrls)]).then(([status]) => {
  state.audioReady = status.loaded > 0;
  updateChorus();
  updateSolo();
  updateStages();
  updateSoundControls();
  armNudger();
  root.dataset.ready = 'true';
  return status;
});

installDebug({
  gameId: config.id,
  engine: 'custom-monster-opera',
  ready,
  listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
  startMode,
  getState: () => ({
    screen: screens.current,
    mode: state.mode,
    stage: state.stage,
    selected: [...state.selected],
    activeMonster: state.activeMonster,
    pitch: state.pitch,
    showPhase: state.showPhase,
    showElapsed: state.showElapsed,
    paused: state.paused,
    pausedByVisibility: state.pausedByVisibility,
    recordedEvents: state.recordedEvents.map((event) => ({ ...event })),
    audioReady: state.audioReady,
    muted: state.muted,
    activePose: root.querySelector('[data-solo-active]')?.dataset.monsterPose || 'neutral',
  }),
  getTargets: () => collectTargets(screen(screens.current)),
  tap: async (id) => {
    const action = actions.get(id);
    if (!action) return { accepted: false };
    const result = await action();
    return { accepted: result !== false };
  },
  winRound: async () => {
    if (!screens.is('show')) startShow();
    return finishShow();
  },
  home: goSplash,
  timers,
  narrator,
  voice: audio,
  sfx,
  mute: (on = true) => {
    const wanted = Boolean(on);
    if (state.muted !== wanted) toggleSound();
    return state.muted;
  },
  onSeed: (_rng, seed) => { state.phraseCounter = seed % 5; },
  getAudioLog: () => audio.getLog(),
  clearAudioLog: () => audio.clearLog(),
  getSampleStatus: () => audio.getStatus(),
  playMonster: (id, pitch = 'middle') => audio.playMonster(id, { pitch, phraseIndex: state.phraseCounter++ }),
  swipeSolo: (direction = 1) => cycleSolo(Number(direction) < 0 ? -1 : 1),
  blinkMonster: blinkOneVisibleMonster,
  selectStage: chooseStage,
  finishShow,
  replayPerformance,
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state.showPhase === 'performing' && !state.paused) {
      state.paused = true;
      state.pausedByVisibility = true;
      updateRecording();
    }
    audio.stop();
    soloGesture.cancel('visibility');
    resetLook();
  }
});
window.addEventListener('pagehide', () => {
  timers.clearAll();
  visualTimers.clearAll();
  nudger.stop();
  soloGesture.detach();
  audio.stop();
});
