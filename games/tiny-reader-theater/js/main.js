// main.js — Tiny Reader Theater.
//
// The loop, per the GDD's screen map:
//
//   Setup ──(world + 2 puppets)──► Read ──(every word tapped)──► perform line
//     ▲                              │                              │
//     │                              └──────── more lines ──────────┘
//     │                              │
//     │                     last line of the node
//     │                       ├─ node has choices ─► Choice ─► Read (next node, line 0)
//     │                       └─ node is an ending ─► Complete
//     └──────────────── Back / Choose a new path ────────────────────┘
//
// Nothing here requires reading: every word is spoken on tap, every line is
// read aloud by the narrator, every choice is a picture, and the two puppets
// act each line out on stage while it is read.
//
// Screen switching is hand-rolled rather than shared/js/screens.js: the Setup
// screen is a two-step picker (world, then two of eight puppets) with its own
// enablement rule, which screens.js's card-splash + start-latch shape does not
// model. The per-screen teardown bag from screens.js IS reused, so the one part
// that actually leaks (tap disposers, nudgers) is still shared code.

import config from '../config.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import { onTap } from '../../../shared/js/tap.js';
import { createBag } from '../../../shared/js/screens.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { tada } from '../../../shared/js/celebrate.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import {
  getNode, getLines, getChoices, getChoice, nextNodeId,
  isEnding, getSummary, startNodeId, listEndingIds, validateTree,
} from './story-tree.js';
import { createWordLine } from '../../../shared/js/word-tap.js';
import { createTheaterScene } from './theater-scene.js';

const GAME_ID = 'tiny-reader-theater';
const DEFAULT_SETTING = 'forest';
const CHOICE_ART = (choiceId) => `./assets/ui/choice-${choiceId}.webp`;
const WORLD_ART = (settingId) => `./assets/ui/world-${settingId}.webp`;
const FACE_ART = (charId) => `../../shared/characters/${charId}/anim/head-ts.png`;
const STAMP_ART = { found: './assets/ui/ending-stamp-filled.webp', missing: './assets/ui/ending-stamp-outline.webp' };
const endingsKey = (settingId) => `qk:${GAME_ID}:${settingId}:endings`;

// ---- dom ------------------------------------------------------------------

const $ = (sel) => document.querySelector(sel);
const dom = {
  root: $('#game'),
  stageLayer: $('#trt-stage-layer'),
  stageHost: $('#trt-stage-host'),
  screens: Array.from(document.querySelectorAll('[data-qk-screen]')),
  setupHud: $('#trt-setup-hud'),
  worldGrid: $('#trt-world-grid'),
  castGrid: $('#trt-cast-grid'),
  start: $('#trt-start'),
  readHud: $('#trt-read-hud'),
  line: $('#trt-line'),
  lineDots: $('#trt-line-dots'),
  choiceHud: $('#trt-choice-hud'),
  choiceProgress: $('#trt-choice-progress'),
  choiceCards: $('#trt-choice-cards'),
  completeHud: $('#trt-complete-hud'),
  summary: $('#trt-summary'),
  endingsTracker: $('#trt-endings-tracker'),
  endingsStamps: $('#trt-endings-stamps'),
  endingsCount: $('#trt-endings-count'),
  replay: $('#trt-replay'),
  newPath: $('#trt-new-path'),
  castPair: $('#trt-cast-pair'),
};

// ---- state ----------------------------------------------------------------

const settings = Array.isArray(config.settings) ? config.settings : [];
const cast = Array.isArray(config.cast) ? config.cast : [];

const state = {
  screen: 'setup',
  settingId: null,
  cast: [],           // exactly two character ids once Start is enabled
  nodeId: null,
  lineIndex: 0,
  path: [],           // choice ids taken, in order
  endings: new Set(), // discovered ending ids for the CURRENT setting
  busy: false,        // a line is performing / a transition is running
};

let rng = mulberry32(42);
let scene = null;             // the theater-scene controller, when mounted
let wordLine = null;          // the live createWordLine controller
let promptedNode = null;      // node whose "tap each word" prompt already played
const timers = createTimers();
const screenBag = createBag();
let readNudger = null;
let fastScale = 1;            // theater timeScale requested by QLOBE_DEBUG.fastTimers()
// Bumped whenever the child is moved somewhere else (a new node, or out to
// Setup). A performance that was in flight when that happened must NOT go on to
// render the next line on top of wherever they are now.
let flowToken = 0;
let readyResolve;
const ready = new Promise((resolve) => { readyResolve = resolve; });

const setting = (id) => settings.find((s) => s && s.id === id) || null;
const currentSetting = () => setting(state.settingId);
const unlockedSettings = () => settings.filter((s) => s && !s.locked);

// ---- persistence ----------------------------------------------------------

function loadEndings(settingId) {
  const found = new Set();
  const valid = new Set(listEndingIds(setting(settingId)));
  try {
    const raw = localStorage.getItem(endingsKey(settingId));
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list)) {
      for (const id of list) if (valid.has(id)) found.add(id);
    }
  } catch { /* private mode / corrupt value — start fresh, never throw */ }
  return found;
}

function saveEndings(settingId, found) {
  try {
    localStorage.setItem(endingsKey(settingId), JSON.stringify([...found]));
  } catch { /* storage full or blocked — the run still plays */ }
}

// ---- screens --------------------------------------------------------------

function showScreen(name) {
  screenBag.run();
  state.screen = name;
  for (const section of dom.screens) {
    section.hidden = section.dataset.qkScreen !== name;
  }
  dom.root.dataset.screen = name;
  // The Pixi stage is a persistent layer BEHIND the screens, not a child of
  // one, so the puppets stay on stage across Read → Choice → Complete without
  // being rebuilt. Setup is the only screen that hides it.
  const showStage = Boolean(scene) && name !== 'setup';
  dom.stageLayer.hidden = !showStage;
  dom.root.dataset.stage = showStage ? 'on' : 'off';
  // Pixi's resizeTo only recomputes on a window resize, so a canvas that was
  // hidden when it mounted stays 0×0 until asked. Ask on every reveal.
  if (showStage && scene) scene.relayout();
}

function backButton(host, onPress) {
  host.textContent = '';
  const btn = hudButton('back', onPress, { label: 'Back to the puppet picker' });
  btn.dataset.target = 'back';
  btn.classList.add('qk-hud-top-left');
  host.appendChild(btn);
  screenBag.add(btn.dispose);
  return btn;
}

// ---- setup screen ---------------------------------------------------------

function characterName(id) {
  return String(id || '')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function renderSetup() {
  showScreen('setup');
  renderWorlds();
  renderCast();
  refreshStart();

  dom.setupHud.textContent = '';
  const home = document.createElement('a');
  home.id = 'trt-home';
  home.className = 'qk-hud-btn qk-hud-home qk-hud-top-left trt-home-link';
  home.href = '../../index.html';
  home.dataset.hud = 'home';
  home.dataset.target = 'home';
  home.setAttribute('aria-label', 'Back to all games');
  dom.setupHud.appendChild(home);

  screenBag.add(onTap(dom.start, () => startStory(), { feedback: () => sfx.pop() }));
}

function renderWorlds() {
  dom.worldGrid.textContent = '';
  for (const world of settings) {
    const locked = Boolean(world.locked);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'trt-world-card';
    btn.dataset.world = world.id;
    btn.dataset.locked = String(locked);
    btn.dataset.selected = String(state.settingId === world.id);
    btn.dataset.target = `world-${world.id}`;
    btn.dataset.role = locked ? 'locked' : 'world';
    // Deliberately NOT `disabled`, and deliberately NOT `aria-disabled`: a
    // locked world still receives the tap and answers out loud, so it is an
    // operable control. Marking it disabled would be a lie to assistive tech
    // (and to automation) about a button that does something when pressed.
    // "Coming soon" lives in the accessible name and in `data-locked`.
    btn.setAttribute('aria-pressed', String(state.settingId === world.id));
    btn.setAttribute('aria-label', locked ? `${world.title}, coming soon` : world.title);

    const art = document.createElement('img');
    art.className = 'trt-world-art';
    art.src = WORLD_ART(world.id);
    art.alt = '';
    const title = document.createElement('span');
    title.className = 'trt-world-title';
    title.textContent = world.title || world.id;
    btn.append(art, title);

    if (locked) {
      const badge = document.createElement('span');
      badge.className = 'trt-lock-badge';
      badge.textContent = 'Coming soon';
      btn.appendChild(badge);
    }

    dom.worldGrid.appendChild(btn);
    screenBag.add(onTap(btn, () => pickWorld(world.id), { feedback: () => sfx.tick() }));
  }
}

function renderCast() {
  dom.castGrid.textContent = '';
  for (const charId of cast) {
    const picked = state.cast.includes(charId);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'trt-cast-card';
    btn.dataset.char = charId;
    btn.dataset.selected = String(picked);
    btn.dataset.target = `cast-${charId}`;
    btn.dataset.role = 'cast';
    btn.setAttribute('aria-pressed', String(picked));
    btn.setAttribute('aria-label', characterName(charId));

    const face = document.createElement('img');
    face.className = 'trt-cast-face';
    face.src = FACE_ART(charId);
    face.alt = '';
    const name = document.createElement('span');
    name.className = 'trt-cast-name';
    name.textContent = characterName(charId);
    const order = document.createElement('span');
    order.className = 'trt-cast-order';
    order.hidden = !picked;
    order.textContent = picked ? String(state.cast.indexOf(charId) + 1) : '';
    order.setAttribute('aria-hidden', 'true');
    btn.append(face, name, order);

    dom.castGrid.appendChild(btn);
    screenBag.add(onTap(btn, () => pickCast(charId), { feedback: () => sfx.tick() }));
  }
}

function syncSetupSelection() {
  for (const btn of dom.worldGrid.querySelectorAll('.trt-world-card')) {
    const on = btn.dataset.world === state.settingId;
    btn.dataset.selected = String(on);
    btn.setAttribute('aria-pressed', String(on));
  }
  for (const btn of dom.castGrid.querySelectorAll('.trt-cast-card')) {
    const pickedAt = state.cast.indexOf(btn.dataset.char);
    const on = pickedAt >= 0;
    btn.dataset.selected = String(on);
    btn.setAttribute('aria-pressed', String(on));
    const order = btn.querySelector('.trt-cast-order');
    if (order) {
      order.hidden = !on;
      order.textContent = on ? String(pickedAt + 1) : '';
    }
  }
  refreshStart();
}

function refreshStart() {
  const ok = Boolean(state.settingId) && state.cast.length === 2;
  dom.start.disabled = !ok || state.busy;
  dom.start.dataset.ready = String(ok);
  dom.start.setAttribute('aria-disabled', String(!ok || state.busy));
  if (dom.castPair) {
    dom.castPair.textContent = ok
      ? state.cast.map((id) => characterName(id).replace(/^Princess\s+/, '')).join(' + ')
      : 'Pick two puppet stars';
    dom.castPair.dataset.ready = String(ok);
  }
}

function pickWorld(settingId) {
  if (state.busy) return;
  const world = setting(settingId);
  if (!world) return;
  if (world.locked) {
    sfx.unpop();
    voice.say('ui:lockedWorld', 'That world is still being built. Try Forest!');
    return;   // and nothing else — the pick does not change
  }
  if (state.settingId !== settingId) {
    state.settingId = settingId;
    state.endings = loadEndings(settingId);
  }
  sfx.pop();
  syncSetupSelection();
}

/**
 * Puppet picking is exactly two. A third pick replaces the OLDEST rather than
 * refusing: refusing reads as a broken button to a five-year-old, replacing
 * reads as "that one's in now".
 */
function pickCast(charId) {
  if (state.busy) return;
  const at = state.cast.indexOf(charId);
  if (at >= 0) {
    state.cast.splice(at, 1);
    sfx.unpop();
  } else {
    state.cast.push(charId);
    if (state.cast.length > 2) state.cast.shift();
    sfx.pop();
  }
  syncSetupSelection();
}

// ---- starting a story -----------------------------------------------------

async function startStory() {
  if (state.busy) return;
  const world = currentSetting();
  if (!world || world.locked || state.cast.length !== 2) return;
  state.busy = true;
  dom.root.dataset.loading = 'true';
  refreshStart();
  try {
    await mountScene(world, state.cast);
    state.path = [];
    await enterNode(startNodeId(world), { fresh: true });
  } finally {
    dom.root.dataset.loading = 'false';
    state.busy = false;
    refreshStart();
  }
}

async function mountScene(world, pair) {
  const same = scene
    && scene.settingId === world.id
    && scene.cast.length === 2
    && scene.cast[0] === pair[0]
    && scene.cast[1] === pair[1];
  // Reveal the layer BEFORE createStage: Pixi measures its mount element on
  // init, and a display:none host would give the whole theater a 0×0 world.
  dom.stageLayer.hidden = false;
  dom.root.dataset.stage = 'on';
  if (same) {
    scene.relayout();
    await scene.resetStage();
    return scene;
  }
  disposeScene();
  scene = await createTheaterScene({
    host: dom.stageHost,
    setting: world,
    cast: pair,
    voice,
    random: () => rng(),
  });
  // A scene mounted AFTER QLOBE_DEBUG.fastTimers() must inherit the fast clock,
  // or a QA drive waits out every walk cycle in real time.
  if (fastScale > 1) scene.setTimeScale(fastScale);
  return scene;
}

function disposeScene() {
  if (!scene) return;
  try { scene.destroy(); } catch { /* ignore */ }
  scene = null;
  dom.stageHost.textContent = '';
}

// ---- read screen ----------------------------------------------------------

async function enterNode(nodeId, { fresh = false } = {}) {
  const world = currentSetting();
  const node = getNode(world, nodeId);
  if (!world || !node) return;
  flowToken += 1;
  state.nodeId = nodeId;
  state.lineIndex = 0;
  if (fresh) promptedNode = null;
  // Scene change runs WHILE the child starts tapping the new node's first
  // line: the pair strolls off, the set swaps, and they stroll back on.
  // performLine awaits the tail of this, so a fast tapper can't outrun it.
  if (scene) scene.beginNode(node);
  await renderLine();
}

async function renderLine() {
  const world = currentSetting();
  const lines = getLines(world, state.nodeId);
  const text = lines[state.lineIndex];
  if (text == null) { await finishNode(); return; }

  showScreen('read');
  backButton(dom.readHud, () => toSetup());
  renderLineDots(lines.length, state.lineIndex);

  if (wordLine) wordLine.destroy();
  wordLine = createWordLine({
    host: dom.line,
    line: text,
    nodeId: state.nodeId,
    lineIndex: state.lineIndex,
    voice,
    onWordTap: () => {
      if (readNudger) readNudger.poke();
      // One puppet gives a little acknowledging bob per tapped word — the
      // child is reading TO them.
      if (scene) scene.reactToWord();
    },
    onComplete: () => { performCurrentLine(); },
  });

  // "Tap each word to hear it!" once per node, not once per line.
  if (promptedNode !== state.nodeId) {
    promptedNode = state.nodeId;
    voice.say('ui:tapPrompt', 'Tap each word to hear it!');
  }

  readNudger = createNudger({
    first: 14000,
    repeat: 16000,
    onNudge: () => {
      if (state.busy || !wordLine || wordLine.isComplete()) return;
      voice.say('ui:tapPrompt', 'Tap each word to hear it!');
    },
  });
  screenBag.add(() => { if (readNudger) { readNudger.stop(); readNudger = null; } });
  readNudger.arm();
}

function renderLineDots(total, done) {
  dom.lineDots.textContent = '';
  dom.lineDots.dataset.total = String(total);
  dom.lineDots.dataset.done = String(done);
  for (let i = 0; i < total; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'trt-line-dot';
    if (i < done) dot.classList.add('is-done');
    if (i === done) dot.classList.add('is-now');
    dom.lineDots.appendChild(dot);
  }
}

/** Every word of the current line has been tapped: sparkle, then perform. */
async function performCurrentLine() {
  if (!wordLine) return;
  if (state.busy) {
    // A transition is still settling (the story mount, a choice whoosh). The
    // line IS finished and word-tap fires onComplete exactly once, so dropping
    // the call here would strand the child on a line with nothing left to tap
    // and no way forward. Wait for the traffic to clear and perform it then.
    const waited = flowToken;
    timers.after(220, () => { if (waited === flowToken) performCurrentLine(); });
    return;
  }
  state.busy = true;
  const token = flowToken;
  const world = currentSetting();
  const node = getNode(world, state.nodeId);
  const text = wordLine.text;
  wordLine.lock();
  dom.line.dataset.performing = 'true';
  try { sfx.sparkle(); } catch { /* ignore */ }

  try {
    if (scene) {
      const beats = Array.isArray(node?.beats) ? node.beats : [];
      await scene.performLine({
        nodeId: state.nodeId,
        lineIndex: state.lineIndex,
        text,
        beat: beats[state.lineIndex] || node?.beat || 'investigate',
      });
    } else {
      // Scoped by settingId — see the theater-scene.js performLine() note:
      // forest/castle/outer-space share node ids, so an unscoped key collides.
      await voice.say(`line:${state.settingId}:${state.nodeId}:${state.lineIndex}`, text);
    }
  } catch (err) {
    console.warn('[tiny-reader-theater] performance failed', err);
  } finally {
    dom.line.dataset.performing = 'false';
    // Only OUR flow may clear the flag. A line interrupted by Back/Replay
    // resolves late (voice-clips resolves a cut-off clip on its safety timeout),
    // and by then `busy` may belong to whatever the child started next.
    if (token === flowToken) state.busy = false;
  }
  // Back / Replay / a new node landed while the line was performing — that
  // navigation wins; do not paint the next line over the top of it.
  if (token !== flowToken || state.screen !== 'read') return;
  await advanceLine();
}

async function advanceLine() {
  const world = currentSetting();
  const lines = getLines(world, state.nodeId);
  state.lineIndex += 1;
  if (state.lineIndex < lines.length) {
    await renderLine();
    return;
  }
  await finishNode();
}

async function finishNode() {
  const world = currentSetting();
  if (getChoices(world, state.nodeId).length) {
    showChoice();
  } else if (isEnding(world, state.nodeId)) {
    await showComplete();
  } else {
    // A node with neither choices nor an ending shape is a data bug; fail into
    // the picker rather than stranding the child on a finished line.
    console.warn('[tiny-reader-theater] node has no exit', state.nodeId);
    toSetup();
  }
}

// ---- choice screen --------------------------------------------------------

function showChoice() {
  const world = currentSetting();
  const choices = getChoices(world, state.nodeId);
  showScreen('choice');
  backButton(dom.choiceHud, () => toSetup());
  if (dom.choiceProgress) {
    const beginning = state.path.length === 0;
    dom.choiceProgress.textContent = beginning
      ? 'Beginning ✓  →  Middle 1 / 3'
      : 'Middle ✓  →  Ending 1 / 3';
  }

  dom.choiceCards.textContent = '';
  dom.choiceCards.dataset.nodeId = state.nodeId;
  for (const choice of choices) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'trt-choice-card';
    btn.dataset.choice = choice.id;
    btn.dataset.next = choice.next || '';
    btn.dataset.target = `choice-${choice.id}`;
    btn.dataset.role = 'choice';
    btn.setAttribute('aria-label', choice.label || choice.id);

    const art = document.createElement('img');
    art.className = 'trt-choice-art';
    art.src = CHOICE_ART(choice.id);
    art.alt = '';
    const label = document.createElement('span');
    label.className = 'trt-choice-label';
    label.textContent = choice.label || '';
    btn.append(art, label);

    dom.choiceCards.appendChild(btn);
    screenBag.add(onTap(btn, () => pickChoice(choice.id), { feedback: () => sfx.tick() }));
  }

  voice.say('ui:choicePrompt', 'What happens next?');
}

async function pickChoice(choiceId) {
  if (state.busy) return;
  const world = currentSetting();
  const next = nextNodeId(world, state.nodeId, choiceId);
  if (!next) return;
  state.busy = true;
  const card = dom.choiceCards.querySelector(`[data-choice="${choiceId}"]`);
  if (card) card.dataset.picked = 'true';
  try { sfx.whoosh(); } catch { /* ignore */ }
  state.path.push(choiceId);
  try {
    await enterNode(next);
  } finally {
    state.busy = false;
  }
}

// ---- complete screen ------------------------------------------------------

async function showComplete() {
  const world = currentSetting();
  const summary = getSummary(world, state.nodeId);
  const isNew = !state.endings.has(state.nodeId);
  if (isNew) {
    state.endings.add(state.nodeId);
    saveEndings(world.id, state.endings);
  }

  showScreen('complete');
  backButton(dom.completeHud, () => toSetup());
  dom.summary.textContent = summary;
  dom.summary.dataset.endingId = state.nodeId;
  dom.summary.dataset.new = String(isNew);
  renderEndings(world);

  screenBag.add(onTap(dom.replay, soundDebounce(() => replayStory(), 700), { feedback: () => sfx.pop() }));
  screenBag.add(onTap(dom.newPath, soundDebounce(() => toSetup({ speak: 'ui:newPath' }), 700), { feedback: () => sfx.pop() }));

  try { tada(); } catch { /* ignore */ }
  if (scene) scene.bow();
  // Scoped by settingId: ending ids (ending-1-1, ...) repeat across settings,
  // so an unscoped `summary:` key would collide the same way `line:` did.
  await voice.say(`summary:${world.id}:${state.nodeId}`, summary);
  const total = listEndingIds(world).length;
  // Keyed per setting: the recorded count clips name the world ("Castle
  // endings, two of nine found!"), so forest's clips must never play here.
  await voice.say(`ui:endingsFound:${world.id}:${state.endings.size}`,
    `${world.title} endings, ${state.endings.size} of ${total} found!`);
}

function renderEndings(world) {
  const ids = listEndingIds(world);
  dom.endingsStamps.textContent = '';
  for (const id of ids) {
    const found = state.endings.has(id);
    const stamp = document.createElement('span');
    stamp.className = 'trt-stamp';
    stamp.dataset.ending = id;
    stamp.dataset.found = String(found);
    if (id === state.nodeId) stamp.dataset.current = 'true';
    const img = document.createElement('img');
    img.className = 'trt-stamp-art';
    img.src = found ? STAMP_ART.found : STAMP_ART.missing;
    img.alt = '';
    stamp.appendChild(img);
    dom.endingsStamps.appendChild(stamp);
  }
  dom.endingsTracker.dataset.found = String(state.endings.size);
  dom.endingsTracker.dataset.total = String(ids.length);
  dom.endingsCount.textContent = `${world.title} endings — ${state.endings.size} of ${ids.length} found`;
}

// ---- navigation -----------------------------------------------------------

/**
 * Replay: same world, same puppets, straight back to the story's first line —
 * Setup is skipped entirely, because a child who just said "again!" should not
 * have to re-pick two puppets to get it.
 */
async function replayStory() {
  if (state.busy) return;
  state.busy = true;
  try {
    voice.say('ui:replay', "Let's tell it again!");
    const world = currentSetting();
    if (scene) await scene.resetStage();
    state.path = [];
    await enterNode(startNodeId(world), { fresh: true });
  } finally {
    state.busy = false;
  }
}

/**
 * Back to Setup with the world and both puppets still selected, so "choose a
 * new path" is one tap on Start away — but changing either is still possible.
 */
function toSetup({ speak = null } = {}) {
  flowToken += 1;
  if (scene) scene.interrupt();
  voice.stop();
  state.busy = false;
  state.nodeId = null;
  state.lineIndex = 0;
  state.path = [];
  if (wordLine) { wordLine.destroy(); wordLine = null; }
  renderSetup();
  if (speak) voice.say(speak, speak === 'ui:newPath' ? 'Pick a new path!' : '');
}

// ---- debug hook -----------------------------------------------------------

function snapshot() {
  return {
    screen: state.screen,
    setting: state.settingId,
    cast: state.cast.slice(),
    nodeId: state.nodeId,
    lineIndex: state.lineIndex,
    line: wordLine ? wordLine.text : null,
    words: wordLine ? wordLine.tokens.map((t) => t.key) : [],
    tappedWords: wordLine ? wordLine.tappedWords() : [],
    wordsRemaining: wordLine ? wordLine.remaining() : 0,
    lineComplete: wordLine ? wordLine.isComplete() : false,
    choices: getChoices(currentSetting(), state.nodeId).map((c) => c.id),
    path: state.path.slice(),
    endingsFound: [...state.endings],
    endingsTotal: listEndingIds(currentSetting()).length,
    busy: state.busy,
    stageMounted: Boolean(scene),
    stageProps: scene ? scene.listProps() : [],
  };
}

/** Deterministic start used by QA: pick a world and a pair, skip the picker. */
async function startMode(settingId = DEFAULT_SETTING, opts = {}) {
  const world = setting(settingId);
  if (!world || world.locked) return { ok: false, reason: 'locked-or-unknown-setting' };
  state.settingId = world.id;
  state.endings = loadEndings(world.id);
  const wanted = Array.isArray(opts.cast) ? opts.cast.filter((id) => cast.includes(id)) : [];
  state.cast = wanted.length === 2 ? wanted.slice() : shuffle(cast, rng).slice(0, 2);
  syncSetupSelection();
  await startStory();
  return { ok: true, setting: world.id, cast: state.cast.slice(), nodeId: state.nodeId };
}

function tapByTarget(id) {
  const target = String(id || '');
  if (target.startsWith('word-')) return tapWord(Number(target.slice(5)));
  if (target.startsWith('choice-')) return chooseNext(target.slice(7));
  if (target.startsWith('world-')) { pickWorld(target.slice(6)); return true; }
  if (target.startsWith('cast-')) { pickCast(target.slice(5)); return true; }
  if (target === 'start') { startStory(); return true; }
  if (target === 'replay') { replayStory(); return true; }
  if (target === 'new-path') { toSetup({ speak: 'ui:newPath' }); return true; }
  if (target === 'back') { toSetup(); return true; }
  return false;
}

function tapWord(index) {
  return wordLine ? wordLine.tap(Number(index)) : false;
}

function tapAllWords() {
  return wordLine ? wordLine.tapAll() : 0;
}

function chooseNext(choiceId) {
  // Truthful for a QA driver: `false` means the tap was NOT accepted, so a
  // reviewer retries instead of asserting against a node that never changed.
  if (state.screen !== 'choice' || state.busy) return false;
  if (!getChoice(currentSetting(), state.nodeId, choiceId)) return false;
  pickChoice(choiceId);
  return true;
}

function endingsFound() {
  return [...state.endings];
}

function resetEndings() {
  state.endings = new Set();
  const id = state.settingId || DEFAULT_SETTING;
  try { localStorage.removeItem(endingsKey(id)); } catch { /* ignore */ }
  if (state.screen === 'complete') renderEndings(currentSetting());
  return [];
}

// ---- boot -----------------------------------------------------------------

async function boot() {
  installKioskGuards();

  await voice.init('./assets/audio/manifest.json', './data/lines.json', {
    'ui:setupPrompt': 'Pick a world, then pick two puppet stars!',
    'ui:lockedWorld': 'That world is still being built. Try Forest!',
    'ui:tapPrompt': 'Tap each word to hear it!',
    'ui:choicePrompt': 'What happens next?',
    'ui:replay': "Let's tell it again!",
    'ui:newPath': 'Pick a new path!',
  });

  const first = unlockedSettings()[0] || settings[0];
  state.settingId = first ? first.id : null;
  if (state.settingId) state.endings = loadEndings(state.settingId);
  renderSetup();

  // Installed only once the manifest is loaded and something is actually
  // tappable. A greeting fired before init() has no recorded clip to find and
  // would slip out as system TTS — the platform's "voice before unlock" trap.
  installUnlockOnGesture({
    onFirst: () => voice.say('ui:setupPrompt', 'Pick a world, then pick two puppet stars!'),
  });

  installDebug({
    gameId: GAME_ID,
    engine: 'tiny-reader-theater',
    ready,
    listModes: () => unlockedSettings().map((s) => s.id),
    startMode,
    getState: snapshot,
    state: snapshot,
    tap: tapByTarget,
    tapWord,
    tapAllWords,
    chooseNext,
    endingsFound,
    resetEndings,
    winRound: () => { tapAllWords(); return snapshot(); },
    home: () => toSetup(),
    // extras a reviewer needs to prove the audio and the data are sound
    getAudioLog: () => voice.getAudioLog(),
    validateTree: () => settings.flatMap((s) => (s.locked ? [] : validateTree(s))),
    // reserved deps
    timers,
    voice,
    sfx,
    onSeed: (seeded) => { rng = seeded; },
    fastTimers: (scale = 0.05) => {
      const n = Number(scale);
      const raw = Number.isFinite(n) && n > 0 ? (n > 1 ? 1 / n : n) : 0.05;
      const multiplier = Math.min(1, Math.max(0.01, raw));
      timers.setScale(1 / multiplier);
      // The puppets are on the theater's own clock, not timers.js — scale it
      // too or a QA drive still waits out every walk cycle in real time.
      if (scene) scene.setTimeScale(1 / multiplier);
      fastScale = 1 / multiplier;
      return multiplier;
    },
  });

  readyResolve({ gameId: GAME_ID, settings: settings.map((s) => s.id) });
}

boot().catch((err) => {
  console.error('[tiny-reader-theater] boot failed', err);
  readyResolve({ gameId: GAME_ID, error: String(err && err.message ? err.message : err) });
});
