// main.js — Sink or Float Lab.
//
// Screen map (games/sink-or-float/game-design.md):
//   splash (home → catalog) → mode picker → play → journal celebration → again/back
//
// The play screen is a DOM shell (shelf / journal / badges / HUD) with ONE
// persistent Pixi canvas host carrying the jar and the live water. The host is
// moved between screens instead of being rebuilt, so a session never leaks a
// WebGL context.
//
// Two rules this file exists to keep:
//   1. Nothing is ever spoken before the first real gesture. `intro` is queued
//      at boot and only released by installUnlockOnGesture's onFirst callback.
//   2. A missed prediction is not an error. Same sparkle, same energy, warm
//      "surprise" framing — the truth is what gets celebrated.

import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as speech from '../../../shared/js/speech.js';
import * as voice from '../../../shared/js/voice-clips.js';
import { onTap } from '../../../shared/js/tap.js';
import { shuffle, mulberry32 } from '../../../shared/js/rng.js';
import { unlockAll, installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { renderModeCards } from '../../../shared/js/mode-select.js';
import { createLab } from './lab.js';
import * as art from './art.js';

const REAL_ART = !config.placeholderArt;
art.useRealArt(REAL_ART);
// One class drives every "painted plate vs. code-drawn stand-in" rule in the
// stylesheet, so the dev fallback stays one flag away and stays 404-free.
document.body.classList.toggle('real-art', REAL_ART);

const mount = document.getElementById('game');
// createNarrator makes its own <p class="visually-hidden" aria-live="polite">
// announcer (appended to document.body), so the hand-rolled #announcer node
// that used to live in index.html is gone — narrator.announcer replaces it.
const narrator = createNarrator();
const LINES = config.voice.lines || {};
const OBJECTS = config.objects || [];
const MODES = config.modes || [];
const BY_ID = new Map(OBJECTS.map((obj) => [obj.id, obj]));

const UI = {
  home: new URL('../../../shared/assets/ui/btn-home.png', import.meta.url).href,
  back: new URL('../../../shared/assets/ui/btn-back.png', import.meta.url).href,
  sound: new URL('../../../shared/assets/ui/btn-sound.png', import.meta.url).href,
  play: new URL('../../../shared/assets/ui/btn-play.png', import.meta.url).href,
};

// The end screen's "again" button borrows the shared play plate, so the four
// round buttons in the game are one family. Handed to CSS as a custom property
// because the stylesheet can't resolve a shared/ path from a game folder.
document.documentElement.style.setProperty('--again-art', `url('${UI.play}')`);

const DRAG_SLOP = 8;
const IDLE_MS = 11000;
// Headless sweep of all 18 densities settles in 1.3–3.2s; this is the safety
// net for a stalled ticker (backgrounded tab), not the expected path.
const SETTLE_TIMEOUT_MS = 4600;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  screen: 'splash',
  mode: null,
  step: 'idle',        // name | predict | drop | falling | result (predict modes)
  round: 0,
  roundsTotal: 0,
  guess: null,
  awaitingInput: false,
  inputLocked: false,
  selected: null,      // playground: the shelf chip waiting for a jar tap
  results: [],
  muted: false,
  fast: false,
  seed: 42,
};

let mode = null;
let queue = [];          // the round's objects, in order
let shelfItems = [];     // what the shelf shows (the round's 6 / the pond's 16)
let lastRoundKey = '';   // the previous round's set, so "again" deals a new one
let current = null;      // the object under test
let currentItem = null;  // its lab handle once dropped
let rng = mulberry32(state.seed);
let disposers = [];
let drag = null;
let lab = null;
let labReady = null;
let settleWaiter = null;

// One-shot idle re-prompt (docs/shared-platform-refactor.md's example is this
// exact ladder): a single nudge after IDLE_MS of quiet, then silence until the
// next scheduleIdle() call rearms it. onNudge stops itself after firing so a
// child who stays quiet longer than that is never nagged a second time.
const nudger = createNudger({
  first: IDLE_MS,
  repeat: IDLE_MS,
  onNudge: () => {
    if (state.screen !== 'play' || !state.awaitingInput) return;
    repeatPrompt();
    nudger.stop();
  },
});

// The Pixi host outlives every screen. Parked offscreen (not display:none —
// a zero-sized host makes Pixi resize the renderer to nothing).
const labHost = document.createElement('div');
labHost.className = 'jar-stage';
const labPark = document.createElement('div');
labPark.className = 'lab-park';
labPark.setAttribute('aria-hidden', 'true');
labPark.appendChild(labHost);
document.body.appendChild(labPark);

// --------------------------------------------------------------------- boot

function ensureLab() {
  if (!labReady) {
    labReady = createLab(labHost, {
      theme: config.theme,
      reducedMotion: reducedMotion(),
      artRefs: OBJECTS.map((obj) => obj.art),
    })
      .then((made) => {
        lab = made;
        lab.canvas.addEventListener('pointerdown', onCanvasDown, { passive: false });
        lab.onSettle(onItemSettled);
        return lab;
      });
  }
  return labReady;
}

const ready = (async () => {
  // 37 recorded teacher-voice clips ship in assets/audio/. `hasClips` gates the
  // two manifest fetches so the flag can be dropped back to false (and the game
  // falls through to Web Speech with ZERO fetches) if the clips ever come out.
  // Nothing is SPOKEN here — the intro stays queued until the first gesture.
  if (config.voice.hasClips) {
    await voice.init(config.voice.manifest, config.voice.linesFile, LINES);
  }
  await ensureLab();
})();

// ------------------------------------------------------------------- audio

// One window-level pointerdown listener does the whole fan-out (sfx + speech +
// voice-clips + audio, each try/caught) and — the iPadOS fix — the unlock latch
// REOPENS on visibilitychange/pageshow, so a child coming back from another app
// still gets working audio on the next touch instead of a silent session.
// `onFirst` is the deferred "intro" greeting: fires once, ever, after the
// unlock fan-out has already run for that same gesture.
installUnlockOnGesture({
  onFirst: (event) => {
    if (state.screen !== 'splash') return;
    // Don't talk over the tap that is already leaving the splash.
    if (event && event.target && event.target.closest && event.target.closest('.mode-card, .home-button')) return;
    say('intro');
  },
});
installKioskGuards();
window.addEventListener('blur', cancelDrag);
window.addEventListener('pointercancel', onPointerCancel, { passive: true });

function say(key, text) {
  return narrator.say(key, text || LINES[key] || '');
}

function playSfx(name) {
  if (state.muted) return;
  if (typeof sfx[name] === 'function') sfx[name]();
}

function feedback(event) {
  if (event && event.preventDefault) event.preventDefault();
  // Unlock BEFORE the tick, exactly as the pre-migration feedback() did. The
  // window-level installUnlockOnGesture listener runs on the bubble phase —
  // i.e. after this handler — so relying on it alone would leave the first
  // tick of a session (and the first after an iPadOS app-switch, when the
  // audio context comes back 'interrupted') playing into a locked channel.
  // The event is deliberately NOT stopPropagation'd any more, so that window
  // listener still gets it and still owns the latch and the deferred intro.
  unlockAll();
  playSfx('tick');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, state.fast ? Math.min(12, ms) : ms));
}

// ------------------------------------------------------------------ screens

function clearScreen() {
  nudger.stop();
  cancelPops();
  narrator.stop();
  cancelDrag();
  // Never leave a drop awaiting a settle that can no longer happen — the
  // awaiting call checks `state.screen` and bails, but only once it resumes.
  if (settleWaiter) settleWaiter.resolve();
  document.querySelectorAll('.drag-ghost').forEach((node) => node.remove());
  disposers.forEach((dispose) => dispose());
  disposers = [];
  if (labHost.parentElement !== labPark) labPark.appendChild(labHost);
}

function parkLab() {
  if (lab) lab.clear();
  currentItem = null;
}

function hudMarkup({ back = true, sound = true } = {}) {
  return `
    ${back ? `<button class="round-button back-button" type="button" data-action="back"
            data-target="back" aria-label="Back to the lab menu"
            style="background-image:url('${UI.back}')"></button>` : ''}
    ${sound ? `<button class="round-button sound-button" type="button" data-action="sound"
            data-target="sound" aria-label="Hear that again"
            style="background-image:url('${UI.sound}')"></button>` : ''}`;
}

function wireCommon() {
  const back = mount.querySelector('[data-action="back"]');
  const sound = mount.querySelector('[data-action="sound"]');
  if (back) disposers.push(onTap(back, () => showSplash(), { feedback }));
  if (sound) disposers.push(onTap(sound, () => { repeatPrompt(); scheduleIdle(); }, { feedback }));
}

function showSplash() {
  clearScreen();
  parkLab();
  state.screen = 'splash';
  state.mode = null;
  state.step = 'idle';
  state.round = 0;
  state.roundsTotal = 0;
  state.guess = null;
  state.selected = null;
  state.results = [];
  state.awaitingInput = true;
  state.inputLocked = false;
  mode = null;
  current = null;
  queue = [];

  mount.innerHTML = `
    <section class="screen splash" aria-label="Sink or Float Lab">
      <a class="round-button home-button" href="../../index.html" aria-label="Back to all games"
         style="background-image:url('${UI.home}')"></a>
      <header class="title-lockup">
        <h1 class="visually-hidden">Sink or Float Lab</h1>
        <img class="title-art" src="./assets/title.webp" width="620" height="560"
             alt="" aria-hidden="true" decoding="async">
      </header>
      <div class="mode-grid" role="list" aria-label="Choose an experiment"></div>
    </section>`;

  // debugTap() already has a dedicated `mode-` prefix branch calling
  // startMode() directly (see below) — no patch needed for renderModeCards()
  // to slot in here.
  const { dispose: disposeModeCards } = renderModeCards({
    host: mount.querySelector('.mode-grid'),
    modes: MODES.map(({ icon, ...item }) => item), // icon stripped: modeFace()
      // resolves it itself (through modeById() below); left in scope,
      // modeCard()'s own icon fallback would print the raw path as text
      // since this game has no `art` field to short-circuit it first.
    skin: false, // .mode-card keeps its own pixel-for-pixel look; only the
                 // shared .qk-mode-card touch-floor contract is added (a
                 // no-op — .mode-card's own 152px min-height clears it).
    cardClass: 'mode-card',
    showTitle: false, // decorate() builds .mode-art + .mode-title itself
    decorate(btn, mode) {
      const original = modeById(mode.id);
      const face = document.createElement('span');
      face.className = 'mode-art';
      face.setAttribute('aria-hidden', 'true');
      face.innerHTML = art.modeFace(original);
      btn.append(face);
      const title = document.createElement('span');
      title.className = 'mode-title';
      title.textContent = mode.title;
      btn.append(title);
    },
    onPick: (id) => startMode(id),
    feedback: (e, mode) => { feedback(e); say(mode.menuLine); },
  });
  disposers.push(disposeModeCards);
  const home = mount.querySelector('.home-button');
  if (home) home.addEventListener('pointerdown', feedback, { passive: false });
}

function modeById(id) {
  return MODES.find((item) => item.id === id) || null;
}

function poolFor(item) {
  if (item.pool === 'all') return OBJECTS.slice();
  return OBJECTS.filter((obj) => obj.pool === item.pool);
}

/**
 * Deal one round: `count` objects from `pool`, balanced exactly half floaters
 * and half sinkers, never the same object twice, and never the same SET twice
 * running (playing again in the same session gets a genuinely new experiment).
 *
 * The balance is the pedagogy, not decoration. An unbalanced draw teaches the
 * child a shortcut — after four sinkers in a row the right move is to stop
 * thinking and keep saying "sink" — which is the exact opposite of the skill.
 * Three and three means the guess is always worth making.
 *
 * Every draw comes off the mode's seeded generator, so QLOBE_DEBUG.setSeed(n)
 * still makes an entire session reproducible for QA.
 */
function drawBalancedRound(pool, count, random) {
  const floats = pool.filter((obj) => obj.truth === 'float');
  const sinks = pool.filter((obj) => obj.truth === 'sink');
  // With 27 of each in the catalogue both halves are always deep enough; the
  // clamps only bite on a hand-cut pool, where "balanced" degrades to "as
  // balanced as this pool can be" rather than dealing short.
  let wantFloat = Math.min(Math.ceil(count / 2), floats.length);
  let wantSink = Math.min(count - wantFloat, sinks.length);
  wantFloat = Math.min(floats.length, count - wantSink);
  let picked = [];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    picked = shuffle([
      ...shuffle(floats, random).slice(0, wantFloat),
      ...shuffle(sinks, random).slice(0, wantSink),
    ], random);
    if (setKey(picked) !== lastRoundKey) break;
  }
  lastRoundKey = setKey(picked);
  return picked;
}

/**
 * The playground shelf: a seeded draw of `count` from everything we have, half
 * floaters and half sinkers so no visit is accidentally all one answer, then
 * shuffled together so the two are interleaved rather than sorted. The rail
 * already scrolls, so this is about variety per visit, not about fitting.
 */
function drawShelf(pool, count, random) {
  const total = Math.min(count, pool.length);
  const floats = shuffle(pool.filter((obj) => obj.truth === 'float'), random);
  const sinks = shuffle(pool.filter((obj) => obj.truth === 'sink'), random);
  const takeFloat = Math.min(Math.ceil(total / 2), floats.length);
  const takeSink = Math.min(total - takeFloat, sinks.length);
  const picked = [...floats.slice(0, takeFloat), ...sinks.slice(0, takeSink)];
  // Only reachable with a lopsided custom pool: top up from whatever is left.
  if (picked.length < total) {
    const rest = [...floats.slice(takeFloat), ...sinks.slice(takeSink)];
    picked.push(...rest.slice(0, total - picked.length));
  }
  return shuffle(picked, random);
}

function setKey(objects) {
  return objects.map((obj) => obj.id).sort().join(',');
}

async function startMode(modeId) {
  const next = modeById(modeId);
  if (!next) return false;
  await ready;
  clearScreen();
  parkLab();
  mode = next;
  state.mode = mode.id;
  state.screen = 'play';
  state.round = 0;
  state.guess = null;
  state.selected = null;
  state.results = [];
  state.inputLocked = false;
  state.awaitingInput = false;
  rng = mulberry32(state.seed);
  // One object under test wants to fill the glass; eight in the playground want
  // to fit in it. Same jar, two readings of "life size".
  if (lab) lab.setBodyScale(mode.kind === 'sandbox' ? 1.3 : 1.5);
  const pool = poolFor(mode);
  if (mode.kind === 'predict') {
    state.roundsTotal = Math.min(mode.rounds || 6, pool.length);
    queue = drawBalancedRound(pool, state.roundsTotal, rng);
    state.roundsTotal = queue.length;
    shelfItems = queue.slice();
  } else {
    queue = [];
    state.roundsTotal = 0;
    shelfItems = drawShelf(pool, mode.shelf || 16, rng);
  }
  current = null;
  currentItem = null;

  renderPlay();
  if (mode.introLine) say(mode.introLine);
  await delay(mode.introLine ? 1500 : 120);
  if (state.screen !== 'play') return true;
  if (mode.kind === 'predict') await nextObject();
  else {
    state.step = 'play';
    state.awaitingInput = true;
    scheduleIdle();
  }
  return true;
}

function renderPlay() {
  const shelf = shelfItems;
  mount.innerHTML = `
    <section class="screen play-screen" data-mode="${mode.id}" data-kind="${mode.kind}"
             aria-label="${mode.title}">
      ${hudMarkup()}
      <div class="lab-layout">
        <aside class="shelf" aria-label="${mode.kind === 'predict' ? 'Things to test this round' : 'Things you can drop in'}">
          <div class="shelf-rail">
            ${shelf.map((obj) => chipMarkup(obj, mode.kind === 'sandbox')).join('')}
          </div>
        </aside>
        <div class="jar-col">
          <div class="focus-slot" data-target="focus-slot"></div>
          <div class="jar-slot"></div>
          <div class="badge-well">
            <!-- SPOKEN ORDER, and it is not cosmetic: the prompt says "Will it
                 sink, or will it float?", so sink is on the LEFT and float on
                 the RIGHT. A pre-reader maps the two badges by hearing them in
                 the order they are laid out (each one pops as its own clause is
                 spoken — see speakPrompt), and a row that contradicts the
                 sentence teaches the mapping backwards. One row serves both
                 orientations; portrait only restyles it. -->
            <div class="guess-row" data-target="guess-row" hidden>
              <button class="badge" type="button" data-guess="sink" data-target="guess-sink"
                      aria-label="${config.badges.sink.alt}">${art.badgeFace('sink', config.badges)}</button>
              <button class="badge" type="button" data-guess="float" data-target="guess-float"
                      aria-label="${config.badges.float.alt}">${art.badgeFace('float', config.badges)}</button>
            </div>
          </div>
        </div>
        <aside class="journal ${mode.kind === 'sandbox' ? 'is-quiet' : ''}" aria-label="Your field journal">
          <button class="journal-tab" type="button" data-action="journal" data-target="journal-tab"
                  aria-label="Open or close your field journal"><span aria-hidden="true">📔</span></button>
          ${journalMarkup()}
        </aside>
      </div>
      ${mode.kind === 'predict' ? `<div class="progress" aria-label="0 of ${state.roundsTotal} tested">
        ${Array.from({ length: state.roundsTotal }, () => '<span class="progress-dot"></span>').join('')}
      </div>` : ''}
    </section>`;

  mount.querySelector('.jar-slot').appendChild(labHost);
  if (lab) lab.refit();
  wireCommon();

  mount.querySelectorAll('.guess-row .badge').forEach((badge) => {
    disposers.push(onTap(badge, () => predict(badge.dataset.guess), { feedback }));
  });
  const tab = mount.querySelector('.journal-tab');
  if (tab) {
    disposers.push(onTap(tab, () => {
      const panel = mount.querySelector('.journal');
      panel.classList.toggle('is-open');
      if (lab) lab.refit();
    }, { feedback }));
  }
  if (mode.kind === 'sandbox') {
    mount.querySelectorAll('.obj-chip').forEach((chip) => {
      chip.addEventListener('pointerdown', onChipDown, { passive: false });
    });
  }
  redrawJournal();
}

function chipMarkup(obj, interactive) {
  const tag = interactive ? 'button' : 'span';
  const attrs = interactive
    ? `type="button" data-target="chip-${obj.id}" aria-label="${obj.name}"`
    : 'aria-hidden="true"';
  return `<${tag} class="obj-chip${interactive ? '' : ' is-static'}" data-obj="${obj.id}" ${attrs}>
      ${art.objFace(obj)}
    </${tag}>`;
}

/**
 * The field journal panel. In production it is one painted plate — an open
 * notebook whose upper half is air and lower half is underwater — carried as a
 * CSS background so the two stamp zones can be positioned as PERCENTAGES of the
 * same box. That is the point: however the panel is squeezed, a floater's stamp
 * still lands above the painted water line and a sinker's still lands below it.
 * (`.journal-water` is the code-drawn water line; the plate replaces it.)
 */
function journalMarkup() {
  return `<div class="journal-page">
      <div class="journal-zone zone-float" data-zone="float"></div>
      <div class="journal-water" aria-hidden="true"></div>
      <div class="journal-zone zone-sink" data-zone="sink"></div>
    </div>`;
}

// ------------------------------------------------------------- predict loop

async function nextObject() {
  if (state.screen !== 'play') return;
  if (state.round >= state.roundsTotal) { showEnd(); return; }
  current = queue[state.round];
  currentItem = null;
  state.guess = null;
  state.step = 'name';
  state.awaitingInput = false;
  if (lab) lab.clear();

  const slot = mount.querySelector('.focus-slot');
  if (slot) {
    // The star of the predict step: shown BIG (~150–170px on a tablet), as the
    // bare painted cutout rather than a card, so the child is looking at the
    // thing itself when they decide what the water will do with it.
    // A gentle nod to the object's real size — a whole watermelon shows bigger
    // than a pebble, which is half of what Tricky Ones is teaching. Floored well
    // above the 96px target rule so the smallest object is still easy to grab.
    const fit = clamp(0.62 + 0.3 * (current.scale || 1), 0.74, 1);
    slot.innerHTML = `<button class="obj-chip focus-chip" type="button" data-obj="${current.id}"
        data-target="focus" aria-label="${current.name}"
        style="--focus-fit:${fit.toFixed(2)}">${art.objFace(current, 'focus-art')}</button>`;
    const chip = slot.querySelector('.obj-chip');
    chip.addEventListener('pointerdown', onChipDown, { passive: false });
  }
  setBadgesVisible(false);
  playSfx('pop');
  say(current.voice);
  await delay(1100);
  if (state.screen !== 'play' || state.step !== 'name') return;
  askPrediction();
}

function askPrediction() {
  state.step = 'predict';
  state.awaitingInput = true;
  setBadgesVisible(true);
  speakPrompt();
  scheduleIdle();
}

function setBadgesVisible(on) {
  cancelPops();
  const row = mount.querySelector('.guess-row');
  if (!row) return;
  row.hidden = !on;
  row.querySelectorAll('.badge').forEach((badge) => {
    badge.classList.remove('is-chosen', 'is-pop', 'is-cued');
  });
}

// -------------------------------------------------- the prompt, badge-synced
//
// "Will it sink," → "or will it float?" is spoken as TWO lines, and each guess
// badge pops as its own line starts. That pairing is the whole point: a child
// who cannot read learns which button is which by hearing one and watching the
// other move, in the order they are laid out (sink left, float right).
//
// Three ways the words can arrive, one way the pops are driven:
//   1. Both clause clips recorded — the pop fires from voice-clips' onClip hook
//      at the exact frame the clip starts.
//   2. A clause falls through to Web Speech (or QA has muted the game) — the
//      pop fires as that utterance is handed over, which is the same instant.
//   3. Neither clause is recorded yet — we keep the ONE recorded sentence
//      ("What do you think? Will it sink, or will it float?") rather than drop
//      into the synth voice mid-round, and place the two pops inside it from
//      the clip's own manifest duration. Approximate by construction; it is the
//      transitional path while those two clips are in production.
// The idle re-prompt always takes path 3 on purpose — the nudge stays one clip.
const PROMPT_PARTS = [
  { key: 'predict-sink', guess: 'sink' },
  { key: 'predict-float', guess: 'float' },
];
const PART_BY_KEY = new Map(PROMPT_PARTS.map((part) => [part.key, part]));
const POP_MS = 360;          // must outlast the CSS badge-pop animation (.35s)
const CUE_MS = 900;          // reduced motion: how long the outline cue holds
const PART_GAP_MS = 120;     // a breath between "will it sink," and "or…"
// Where the two clauses fall inside the whole-sentence fallback clip, as a
// fraction of its duration, and the estimates used when there is no clip to
// measure (Web Speech reads it in a shade over three seconds).
const WHOLE_SPLIT = [0.32, 0.62];
const WHOLE_ESTIMATE_MS = [1150, 2350];

let promptRun = 0;       // bumped by cancelPops(); every pending pop checks it
let popTimers = [];
let clipStarted = null;  // set synchronously by the onClip hook inside say()
let partsForced = null;  // QLOBE_DEBUG override so QA can drive either path
const popLog = [];       // last few pops, for QA to assert the pairing

voice.onClip((key) => {
  clipStarted = key;
  const part = PART_BY_KEY.get(key);
  if (part) popBadge(part.guess);
});

function cancelPops() {
  promptRun += 1;
  popTimers.forEach((timer) => clearTimeout(timer));
  popTimers = [];
}

/**
 * "This one." A short scale-up and settle on one badge. Under reduced motion
 * the scale is replaced by a brief painted outline — same message, nothing
 * moves.
 */
function popBadge(guess) {
  const badge = mount.querySelector(`.guess-row .badge[data-guess="${guess}"]`);
  if (!badge) return;
  const reduced = reducedMotion();
  const cls = reduced ? 'is-cued' : 'is-pop';
  badge.classList.remove('is-pop', 'is-cued');
  void badge.offsetWidth;   // restart the animation when the prompt repeats
  badge.classList.add(cls);
  popTimers.push(setTimeout(() => badge.classList.remove(cls), reduced ? CUE_MS : POP_MS));
  popLog.push({ guess, at: Math.round(performance.now()) });
  if (popLog.length > 8) popLog.shift();
}

/** Do we have both clause clips, so the exact per-clip path is available? */
function promptPartsReady() {
  if (partsForced !== null) return partsForced;
  return PROMPT_PARTS.every((part) => !!voice.clipInfo(part.key));
}

/** Ask the question and light the badges up with it. */
async function speakPrompt() {
  cancelPops();
  const run = promptRun;
  if (!promptPartsReady()) return speakWholePrompt(run);
  for (const part of PROMPT_PARTS) {
    if (run !== promptRun || state.screen !== 'play' || state.step !== 'predict') return undefined;
    clipStarted = null;
    const spoken = say(part.key);
    // onClip fires synchronously from inside say() when a recorded clip starts,
    // so this only pops the paths where it did not: Web Speech, or muted QA.
    if (clipStarted !== part.key) popBadge(part.guess);
    await spoken;
    if (run !== promptRun) return undefined;
    await delay(PART_GAP_MS);
  }
  return undefined;
}

/** The one-clip line, with both pops placed inside it. Also the idle nudge. */
function speakWholePrompt(run) {
  const info = state.muted ? null : voice.clipInfo(mode ? mode.promptLine : 'predict-prompt');
  const dur = info && info.dur ? info.dur * 1000 : 0;
  PROMPT_PARTS.forEach((part, index) => {
    const at = dur ? dur * WHOLE_SPLIT[index] : WHOLE_ESTIMATE_MS[index];
    popTimers.push(setTimeout(() => {
      if (run !== promptRun || state.screen !== 'play' || state.step !== 'predict') return;
      popBadge(part.guess);
    }, state.fast ? 12 * (index + 1) : at));
  });
  return say(mode ? mode.promptLine : 'predict-prompt');
}

async function predict(guess) {
  if (state.screen !== 'play' || !mode || mode.kind !== 'predict') return false;
  if (state.step !== 'predict' || state.inputLocked) {
    nudge(state.step === 'drop' ? 'nudge-drop' : mode.nudgeLine, '.focus-chip');
    return false;
  }
  state.guess = guess;
  // The question has been answered — no pop may land on a badge the child has
  // already chosen (it would read as the game correcting them).
  cancelPops();
  narrator.stop();
  playSfx('pop');
  const chosen = mount.querySelector(`.badge[data-guess="${guess}"]`);
  if (chosen) chosen.classList.add('is-chosen');
  await delay(420);
  if (state.screen !== 'play') return true;
  setBadgesVisible(false);
  state.step = 'drop';
  state.awaitingInput = true;
  const chip = mount.querySelector('.focus-chip');
  if (chip) chip.classList.add('is-live');
  say('drop-cue');
  scheduleIdle();
  return true;
}

/**
 * The child performs the experiment: release point becomes the fall point.
 * Called from a drag release over the jar, from a tap on the dangling object,
 * and from QLOBE_DEBUG.drop().
 */
async function dropCurrent(clientX, clientY) {
  if (state.screen !== 'play' || !mode || mode.kind !== 'predict' || !current || !lab) return false;
  if (state.step !== 'drop' || state.inputLocked) {
    if (state.step === 'predict') nudge(mode.nudgeLine, '.guess-row');
    return false;
  }
  state.inputLocked = true;
  state.awaitingInput = false;
  state.step = 'falling';
  nudger.stop();
  const slot = mount.querySelector('.focus-slot');
  const chip = slot ? slot.querySelector('.obj-chip') : null;
  let point = { x: clientX, y: clientY };
  if (clientX === undefined && chip) {
    const rect = chip.getBoundingClientRect();
    point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  if (slot) slot.innerHTML = '';
  playSfx('whoosh');
  currentItem = lab.addObject(current, point.x, point.y, { vy: 260 });
  await waitForSettle(currentItem);
  if (state.screen !== 'play') return true;
  await revealResult();
  return true;
}

function waitForSettle(item) {
  if (!item) return Promise.resolve();
  if (state.fast) { lab.settleNow(); return Promise.resolve(); }
  return new Promise((resolve) => {
    const done = () => {
      if (!settleWaiter) return;
      clearTimeout(settleWaiter.timer);
      settleWaiter = null;
      resolve();
    };
    settleWaiter = { item, resolve: done, timer: setTimeout(() => { lab.settleNow(); done(); }, SETTLE_TIMEOUT_MS) };
  });
}

function onItemSettled(item) {
  if (settleWaiter && settleWaiter.item === item) settleWaiter.resolve();
}

async function revealResult() {
  state.step = 'result';
  const truth = current.truth;
  const hit = state.guess === truth;
  state.results.push({ id: current.id, name: current.name, emoji: current.emoji, truth, guess: state.guess, hit });
  playSfx(truth === 'float' ? 'sparkle' : 'boing');
  lab.celebrate(currentItem);
  await say(truth === 'float' ? 'result-float' : 'result-sink');
  if (state.screen !== 'play') return;
  await delay(260);
  // A miss is a SURPRISE, never a failure: identical sfx, identical pacing.
  playSfx('sparkle');
  const key = hit
    ? (state.round % 2 === 0 ? 'praise-1' : 'praise-2')
    : (state.round % 2 === 0 ? 'surprise-1' : 'surprise-2');
  await say(key);
  if (state.screen !== 'play') return;
  stampJournal(current, truth);
  playSfx('pop');
  await delay(500);
  if (state.screen !== 'play') return;
  state.round += 1;
  updateProgress();
  state.inputLocked = false;
  await nextObject();
}

function updateProgress() {
  mount.querySelectorAll('.progress-dot').forEach((dot, index) => {
    dot.classList.toggle('is-done', index < state.round);
  });
  const bar = mount.querySelector('.progress');
  if (bar) bar.setAttribute('aria-label', `${state.round} of ${state.roundsTotal} tested`);
  mount.querySelectorAll('.shelf .obj-chip').forEach((chip, index) => {
    chip.classList.toggle('is-done', mode.kind === 'predict' && index < state.round);
  });
}

// ----------------------------------------------------------------- journal

/**
 * Press one discovery into the notebook: a small painted mini of the object,
 * dropped into the plate's air zone if it floated and its underwater zone if it
 * sank. The tilt and the nudge are derived from the object's own id, so a
 * relayout (or the end-screen redraw) puts every stamp back exactly where the
 * child last saw it — jitter that changes on redraw reads as a glitch, not as
 * a hand.
 */
function stampJournal(obj, truth) {
  const zone = mount.querySelector(`.journal-zone[data-zone="${truth}"]`);
  if (!zone) return;
  const stamp = document.createElement('span');
  stamp.className = 'journal-stamp';
  stamp.dataset.obj = obj.id;
  stamp.setAttribute('aria-hidden', 'true');
  const jitter = hashOf(obj.id || '');
  stamp.style.setProperty('--rot', `${(jitter % 19) - 9}deg`);
  // A floater is pressed onto the painted waterline, so its bob offset is what
  // keeps six of them from reading as a ruled row of icons.
  stamp.style.setProperty('--dy', `${((jitter >> 5) % 15) - 7}px`);
  const objArt = BY_ID.get(obj.id);
  stamp.innerHTML = art.objFace(objArt || obj, 'stamp-art');
  zone.appendChild(stamp);
  if (!reducedMotion()) stamp.classList.add('is-new');
}

function hashOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 4096;
}

function redrawJournal() {
  ['float', 'sink'].forEach((truth) => {
    const zone = mount.querySelector(`.journal-zone[data-zone="${truth}"]`);
    if (zone) zone.innerHTML = '';
  });
  state.results.forEach((entry) => stampJournal(BY_ID.get(entry.id) || entry, entry.truth));
}

// ---------------------------------------------------------------- playground

function selectChip(objId) {
  if (mode.kind !== 'sandbox') return false;
  const obj = BY_ID.get(objId);
  if (!obj) return false;
  state.selected = state.selected === objId ? null : objId;
  playSfx(state.selected ? 'pop' : 'unpop');
  mount.querySelectorAll('.shelf .obj-chip').forEach((chip) => {
    chip.classList.toggle('is-selected', chip.dataset.obj === state.selected);
  });
  if (state.selected) say(obj.voice);
  scheduleIdle();
  return true;
}

function dropInPond(obj, clientX, clientY) {
  if (!lab || !obj) return false;
  if (lab.count() >= (mode.maxInJar || 8)) {
    // The jar is full. No scolding line for it — a full jar is a fine thing to
    // have made. Just a soft bump so the tap did something.
    playSfx('unpop');
    wiggle(mount.querySelector('.jar-slot'));
    return false;
  }
  const item = lab.addObject(obj, clientX, clientY, { vy: 220 });
  if (!item) return false;
  playSfx('whoosh');
  state.results.push({ id: obj.id, name: obj.name, emoji: obj.emoji, truth: obj.truth, guess: null, hit: null });
  stampJournal(obj, obj.truth);
  state.selected = null;
  mount.querySelectorAll('.shelf .obj-chip').forEach((chip) => chip.classList.remove('is-selected'));
  scheduleIdle();
  return true;
}

// ------------------------------------------------------------- drag & taps

function sweepGhosts() {
  document.querySelectorAll('.drag-ghost').forEach((node) => node.remove());
}

function onChipDown(event) {
  if (drag || event.isPrimary === false || state.inputLocked) return;
  const source = event.currentTarget;
  const obj = BY_ID.get(source.dataset.obj);
  if (!obj) return;
  if (source.classList.contains('is-static')) return;
  event.preventDefault();
  sweepGhosts();
  const rect = source.getBoundingClientRect();
  // Every chip is draggable, so it carries `touch-action: none` — which also
  // kills the browser's native scroll of the 18-object playground shelf. The
  // rail would be unscrollable unless the child happened to press an 8px gap.
  // So the first movement decides: along the rail = scroll it ourselves,
  // across the rail = pick the object up.
  const rail = source.closest('.shelf-rail');
  let scrollAxis = null;
  if (rail && rail.scrollHeight > rail.clientHeight + 2) scrollAxis = 'y';
  else if (rail && rail.scrollWidth > rail.clientWidth + 2) scrollAxis = 'x';
  drag = {
    kind: 'chip',
    pointerId: event.pointerId,
    obj,
    source,
    rect,
    rail,
    scrollAxis,
    scrollFrom: scrollAxis === 'y' ? rail.scrollTop : (scrollAxis === 'x' ? rail.scrollLeft : 0),
    scrolling: false,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    moved: false,
    ghost: null,
  };
  addDragListeners();
}

function onCanvasDown(event) {
  if (drag || event.isPrimary === false) return;
  event.preventDefault();
  const item = lab ? lab.itemAt(event.clientX, event.clientY) : null;
  if (item && mode && mode.kind === 'sandbox') {
    sweepGhosts();
    lab.lift(item);
    drag = {
      kind: 'body',
      pointerId: event.pointerId,
      item,
      obj: item.obj,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    playSfx('pop');
    addDragListeners();
    return;
  }
  // A tap on the water itself: the tap-tap half of every interaction.
  if (mode && mode.kind === 'sandbox' && state.selected) {
    dropInPond(BY_ID.get(state.selected), event.clientX, event.clientY);
    return;
  }
  if (mode && mode.kind === 'predict') {
    if (state.step === 'drop') dropCurrent(event.clientX, event.clientY);
    else if (state.step === 'predict') nudge(mode.nudgeLine, '.guess-row');
  }
  if (lab) lab.disturb(event.clientX, 220);
}

function addDragListeners() {
  window.addEventListener('pointermove', onDragMove, { passive: false });
  window.addEventListener('pointerup', onDragUp, { passive: false });
}

function removeDragListeners() {
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragUp);
}

function onDragMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  event.preventDefault();
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (drag.scrollAxis && !drag.moved) {
    const along = drag.scrollAxis === 'y' ? dy : dx;
    const across = drag.scrollAxis === 'y' ? dx : dy;
    if (!drag.scrolling && Math.abs(along) >= DRAG_SLOP && Math.abs(along) > Math.abs(across) * 1.4) {
      drag.scrolling = true;
    }
    if (drag.scrolling) {
      if (drag.scrollAxis === 'y') drag.rail.scrollTop = drag.scrollFrom - dy;
      else drag.rail.scrollLeft = drag.scrollFrom - dx;
      return;
    }
  }
  const distance = Math.hypot(dx, dy);
  if (!drag.moved && distance >= DRAG_SLOP) beginDragVisual();
  if (!drag.moved) return;
  if (drag.kind === 'body') {
    lab.moveLifted(drag.item, event.clientX, event.clientY);
    return;
  }
  const left = event.clientX - drag.offsetX;
  const top = event.clientY - drag.offsetY;
  const tilt = clamp((event.clientX - drag.startX) * 0.06, -11, 11);
  drag.ghost.style.setProperty('--ghost-x', `${left}px`);
  drag.ghost.style.setProperty('--ghost-y', `${top}px`);
  drag.ghost.style.setProperty('--ghost-tilt', `${tilt}deg`);
  const over = lab && lab.overWater(event.clientX, event.clientY);
  drag.ghost.classList.toggle('is-over', !!over);
  const slot = mount.querySelector('.jar-slot');
  if (slot) slot.classList.toggle('is-target', !!over);
}

function beginDragVisual() {
  if (!drag || drag.moved) return;
  drag.moved = true;
  if (drag.kind === 'body') return;
  const ghost = document.createElement('span');
  ghost.className = 'drag-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.innerHTML = art.objFace(drag.obj, 'ghost-art');
  ghost.style.setProperty('--ghost-size', `${drag.rect.width}px`);
  ghost.style.setProperty('--ghost-x', `${drag.rect.left}px`);
  ghost.style.setProperty('--ghost-y', `${drag.rect.top}px`);
  document.body.appendChild(ghost);
  drag.ghost = ghost;
  drag.source.classList.add('is-drag-source');
  playSfx('pop');
}

function onDragUp(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  event.preventDefault();
  const held = drag;
  const x = event.clientX;
  const y = event.clientY;
  finishDrag();
  if (held.scrolling || !mode || !lab) return;
  try {
    if (held.kind === 'body') {
      // A tap (no movement) on something already in the jar just names it —
      // but the body was lifted out of the sim on pointerdown, so it MUST go
      // back or it hangs there frozen for the rest of the session.
      if (!held.moved) { lab.releaseInPlace(held.item); say(held.obj.voice); return; }
      const kept = lab.dropLifted(held.item, x, y);
      if (!kept) { lab.removeItem(held.item); playSfx('unpop'); }
      return;
    }
    if (!held.moved) {
      // tap-tap path
      if (mode.kind === 'sandbox') selectChip(held.obj.id);
      else if (state.step === 'drop') dropCurrent();
      else if (state.step === 'predict') nudge(mode.nudgeLine, '.guess-row');
      else say(held.obj.voice);
      return;
    }
    const over = lab && lab.overWater(x, y);
    if (!over) {
      wiggle(held.source);
      say('nudge-drop');
      return;
    }
    if (mode.kind === 'sandbox') dropInPond(held.obj, x, y);
    else dropCurrent(x, y);
  } catch (error) {
    // Rule 4 of pattern #11: an exception mid-drop still ends with cleanup.
    console.error('[sink-or-float] drop failed', error);
  }
}

function onPointerCancel(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  cancelDrag();
}

function cancelDrag() {
  if (!drag) return;
  const held = drag;
  finishDrag();
  // Pattern #11 rule 3: blur / pointercancel must land the piece somewhere
  // sane, never strand it. Inside the jar it simply resumes floating; dragged
  // clear of the jar when the OS took over, it goes back to the shelf.
  if (held.kind === 'body' && lab) {
    if (lab.insideJar(held.item)) lab.releaseInPlace(held.item);
    else lab.removeItem(held.item);
  }
}

function finishDrag() {
  if (!drag) return;
  if (drag.ghost) drag.ghost.remove();
  if (drag.source) drag.source.classList.remove('is-drag-source');
  drag = null;
  removeDragListeners();
  sweepGhosts();
  const slot = mount.querySelector('.jar-slot');
  if (slot) slot.classList.remove('is-target');
}

// ------------------------------------------------------------ nudges & idle

function wiggle(node) {
  if (!node || reducedMotion() || state.fast) return;
  node.classList.remove('is-wiggle');
  void node.offsetWidth;
  node.classList.add('is-wiggle');
  setTimeout(() => node.classList.remove('is-wiggle'), 520);
}

function nudge(key, selector) {
  playSfx('silly');
  wiggle(mount.querySelector(selector));
  say(key);
  scheduleIdle();
}

function repeatPrompt() {
  if (state.screen === 'splash') { say('intro'); return; }
  if (state.screen === 'end') { say('again-prompt'); return; }
  if (!mode) return;
  if (mode.kind === 'sandbox') { say(mode.promptLine); return; }
  // The nudge stays ONE clip — a child who has gone quiet gets the whole
  // question back in a single breath, not two clauses with a gap in them.
  if (state.step === 'predict') { cancelPops(); speakWholePrompt(promptRun); }
  else if (state.step === 'drop') say('drop-cue');
  else if (current) say(current.voice);
}

function scheduleIdle() {
  if (state.fast || state.screen !== 'play') { nudger.stop(); return; }
  nudger.arm();
}

// ---------------------------------------------------------------- end screen

function recapText() {
  const floats = state.results.filter((entry) => entry.truth === 'float').map((entry) => entry.name);
  const sinks = state.results.filter((entry) => entry.truth === 'sink').map((entry) => entry.name);
  const parts = [];
  if (floats.length) parts.push(`The ${listOf(floats)} floated.`);
  if (sinks.length) parts.push(`The ${listOf(sinks)} sank.`);
  return parts.join(' ');
}

function listOf(names) {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

async function showEnd() {
  const finished = mode;
  const results = state.results.slice();
  clearScreen();
  parkLab();
  state.screen = 'end';
  state.step = 'idle';
  state.awaitingInput = true;
  state.inputLocked = false;

  mount.innerHTML = `
    <section class="screen end-screen" aria-label="${finished.title} — your journal page">
      ${hudMarkup()}
      <div class="end-card">
        ${journalMarkup()}
        <button class="again-button" type="button" data-action="again" data-target="again"
                aria-label="Test more things">
          <span class="again-glyph" aria-hidden="true">🔁</span>
        </button>
      </div>
    </section>`;

  results.forEach((entry) => stampJournal(BY_ID.get(entry.id) || entry, entry.truth));
  wireCommon();
  const again = mount.querySelector('[data-action="again"]');
  if (again) disposers.push(onTap(again, () => startMode(finished.id), { feedback }));

  playSfx('tada');
  // burstConfetti() is a no-op under prefers-reduced-motion on its own, so the
  // only local gate left is the QA fast-mode skip.
  if (!state.fast) burstConfetti({ host: mount.querySelector('.end-card'), count: 22, palette: CONFETTI });
  await say(finished.cheerLine);
  if (state.screen !== 'end') return;
  const recap = recapText();
  if (recap) await say('recap', recap);
  if (state.screen !== 'end') return;
  say('again-prompt');
}

// Confetti in the game's own paintbox. A hue wheel gives you neon magentas and
// electric limes, which is a different game landing on top of this one — these
// are the watercolours the plates are actually painted in. Passed through to
// shared/js/celebrate.js's burstConfetti() as `palette:` — its own QK_PALETTE
// is a different game's paintbox, not this one's.
const CONFETTI = [
  '#7fbcd2', '#4f95b8', '#a9cfd0', '#8fb06a',
  '#6f9f5c', '#e8956f', '#d9c16a', '#c6e0e6',
];

// -------------------------------------------------------------- QLOBE_DEBUG

function targetFor(id, role) {
  const element = mount.querySelector(`[data-target="${cssEscape(id)}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { id, role, rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } };
}

function getTargets() {
  if (state.screen === 'splash') return MODES.map((item) => targetFor(`mode-${item.id}`, 'neutral')).filter(Boolean);
  if (state.screen === 'end') return [targetFor('again', 'correct'), targetFor('back', 'neutral')].filter(Boolean);
  if (state.screen !== 'play') return [];
  if (mode.kind === 'sandbox') {
    return shelfItems.map((obj) => targetFor(`chip-${obj.id}`, 'neutral')).filter(Boolean);
  }
  if (state.step === 'predict') {
    // Both guesses are legal moves. `correct` marks the one the water will
    // agree with, so a reviewer can drive either the praise or the surprise
    // path. Listed in the order they are laid out and spoken: sink, then float.
    return [
      targetFor('guess-sink', current && current.truth === 'sink' ? 'correct' : 'wrong'),
      targetFor('guess-float', current && current.truth === 'float' ? 'correct' : 'wrong'),
    ].filter(Boolean);
  }
  if (state.step === 'drop') return [targetFor('focus', 'correct')].filter(Boolean);
  return [];
}

async function debugTap(targetId) {
  if (typeof targetId !== 'string') return { accepted: false };
  if (targetId.startsWith('mode-')) return { accepted: await startMode(targetId.slice(5)) };
  if (targetId === 'back') { showSplash(); return { accepted: true }; }
  if (targetId === 'again' && state.screen === 'end') return { accepted: await startMode(mode.id) };
  if (targetId === 'guess-float') return { accepted: await predict('float') };
  if (targetId === 'guess-sink') return { accepted: await predict('sink') };
  if (targetId === 'focus') return { accepted: await dropCurrent() };
  if (targetId.startsWith('chip-')) {
    const objId = targetId.slice(5);
    if (mode && mode.kind === 'sandbox') return { accepted: selectChip(objId) };
    return { accepted: false };
  }
  return { accepted: false };
}

function waitFor(test, timeout = 8000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (test()) { resolve(true); return; }
      if (Date.now() - start > timeout) { resolve(false); return; }
      setTimeout(tick, 24);
    };
    tick();
  });
}

async function winRound() {
  if (state.screen !== 'play' || !mode) return false;
  if (mode.kind === 'sandbox') {
    for (const obj of shelfItems.slice(0, mode.maxInJar || 8)) dropInPond(obj);
    lab.settleNow();
    return true;
  }
  const guard = Date.now() + 30000;
  while (state.screen === 'play' && Date.now() < guard) {
    await waitFor(() => state.step === 'predict' && state.awaitingInput, 6000);
    if (state.screen !== 'play' || state.step !== 'predict') break;
    const truth = current.truth;
    await predict(truth);
    await waitFor(() => state.step === 'drop' && state.awaitingInput, 4000);
    if (state.step !== 'drop') break;
    const before = state.round;
    await dropCurrent();
    await waitFor(() => state.round > before || state.screen !== 'play', 12000);
  }
  return state.screen === 'end';
}

// installDebug (shared/js/debug-harness.js) owns the version/timers/reserved-key
// bookkeeping; everything below is a declared extension or an explicit override
// of one of its optional defaults.
//
// getTargets is passed through as this game's own `targetFor`-based lookup
// rather than the module's default `collectTargets()`: the default reads every
// `[data-target]` element present regardless of game state, but this game's
// contract is a CURATED, ROLE-ANNOTATED set of the currently-legal moves (e.g.
// only guess-sink/guess-float during the predict step, each tagged
// correct/wrong against the object's real truth) — collectTargets has no way
// to know which guess the water will agree with, and returning every
// `[data-target]` node on the play screen (HUD back/sound, the journal tab,
// the focus chip, the whole guess-row container, …) would both change the
// target list's shape and break `seeded run targets` parity.
//
// mute/seed/fastTimers are also passed through rather than defaulted:
//   - mute() here always forces muted=true (there is no in-game unmute UI —
//     this is a QA-only lever) and must keep syncing the local `state.muted`
//     flag that playSfx() reads directly; the default's channel fan-out has no
//     way to reach that.
//   - seed()/setSeed() already reshuffle for real (rng = mulberry32(seed);
//     lastRoundKey reset) and return the same numeric value setSeed always
//     did; the default's onSeed hand-off isn't needed on top of that.
//   - fastTimers() drives this game's own `state.fast` boolean, which many
//     functions (delay(), waitForSettle(), scheduleIdle(), wiggle()) already
//     check directly — a working timeScale of its own, per the migration's
//     "pass your own fastTimers" allowance.
installDebug({
  gameId: config.id,
  engine: 'custom-water-lab',
  ready,
  listModes: () => MODES.map(({ id, title }) => ({ id, title })),
  startMode,
  getState: () => ({
    screen: state.screen,
    mode: state.mode,
    step: state.step,
    round: state.round,
    roundsTotal: state.roundsTotal,
    guess: state.guess,
    selected: state.selected,
    inJar: lab ? lab.count() : 0,
    results: state.results.slice(),
    muted: state.muted,
    fast: state.fast,
    reducedMotion: reducedMotion(),
    placeholderArt: !!config.placeholderArt,
    dragging: !!drag,
    awaitingInput: state.awaitingInput && !state.inputLocked,
  }),
  getTargets,
  tap: debugTap,
  winRound,
  mute: muteAll,
  seed: setSeed,
  fastTimers: (on = true) => { state.fast = !!on; return state.fast; },
  home: () => { showSplash(); return true; },
  // ---- declared extensions (not in the v1 contract; passed through as-is) --
  getTarget: () => (current
    ? { id: current.id, name: current.name, density: current.density, truth: current.truth, guess: state.guess, step: state.step }
    : null),
  // What this run was dealt, so QA can assert the 3-and-3 balance and the shelf
  // size without scraping the DOM.
  getRound: () => ({
    queue: queue.map((obj) => ({ id: obj.id, truth: obj.truth })),
    shelf: shelfItems.map((obj) => obj.id),
    floats: queue.filter((obj) => obj.truth === 'float').length,
    sinks: queue.filter((obj) => obj.truth === 'sink').length,
  }),
  // The prompt sequence: which path is live, and the badge pops it has fired.
  getPrompt: () => ({
    parts: promptPartsReady(),
    keys: PROMPT_PARTS.map((part) => part.key),
    recorded: PROMPT_PARTS.map((part) => !!voice.clipInfo(part.key)),
    pops: popLog.slice(),
  }),
  // Force the two-clip path on/off (null = follow the manifest), so a reviewer
  // can drive both the clause-by-clause and the whole-sentence timing before
  // the clause clips have landed.
  forcePromptParts: (on) => { partsForced = on === null ? null : !!on; return promptPartsReady(); },
  sayPrompt: () => speakPrompt(),
  predict,
  drop: (x, y) => dropCurrent(x, y),
  settleNow: () => { if (lab) lab.settleNow(); if (settleWaiter) settleWaiter.resolve(); return true; },
  // Re-seeding also forgets the previous round's set — otherwise the
  // don't-repeat-yourself rule would make the FIRST draw after a fresh seed
  // depend on what the session had already dealt, and QA could not reproduce it.
  setSeed: setSeed,
  water: () => (lab ? lab.state() : null),
});

// ------------------------------------------------------------------ helpers

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function muteAll() {
  state.muted = true;
  narrator.setMuted(true);
  speech.stop();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  document.querySelectorAll('audio, video').forEach((el) => { el.muted = true; });
  return true;
}

function setSeed(n) {
  state.seed = Number(n) >>> 0;
  rng = mulberry32(state.seed);
  lastRoundKey = '';
  return state.seed;
}

function cssEscape(value) {
  return window.CSS && window.CSS.escape
    ? window.CSS.escape(String(value))
    : String(value).replace(/["\\]/g, '\\$&');
}

window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (event) => {
  if (lab) lab.setReducedMotion(event.matches);
});

showSplash();
