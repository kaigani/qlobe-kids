import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as speech from '../../../shared/js/speech.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as content from '../../../shared/js/content.js';
import { onTap } from '../../../shared/js/tap.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createRollDough, createTraceDough, createFreeDough } from './clay-dough.js';

const $ = (selector) => document.querySelector(selector);
const els = {
  splash: $('#splash'),
  game: $('#game-screen'),
  reveal: $('#reveal'),
  cards: $('#mode-cards'),
  back: $('#back'),
  sound: $('#sound'),
  splashSound: $('.splash-sound'),
  revealBack: $('#reveal-back'),
  revealSound: $('#reveal-sound'),
  phaseDots: $('#phase-dots'),
  prompt: $('#prompt'),
  promptIcon: $('#prompt-icon'),
  promptText: $('#prompt-text'),
  playfield: $('#playfield'),
  revealCard: $('#reveal-card'),
  confetti: $('#confetti'),
  again: $('#again'),
  next: $('#next'),
};

const MODE_COLORS = [
  ['#ef7048', '#c34631'],
  ['#418fd1', '#235e9b'],
  ['#8063bf', '#533794'],
];
const MODE_TITLES = {
  letters: ['Make a Letter', 'A'],
  words: ['Build a Word', 'CAT'],
  free: ['Free Dough', ''],
};
const SHORT_PROMPTS = {
  welcome: 'Pick a way to play',
  color: 'Pick a dough color',
  roll: 'Roll the dough',
  trace: 'Press along the letter groove',
  nudge: 'Start at the glowing dot',
  'word-cat': 'Build CAT',
  'word-dog': 'Build DOG',
  'word-sun': 'Build SUN',
  free: 'Squish, stamp, and draw',
};
const PROMPT_ICONS = {
  welcome: '●',
  color: '●',
  roll: '↔',
  trace: '•',
  nudge: '•',
  words: 'A',
  free: '∿',
};
const CONFETTI_COLORS = ['#ef5b4f', '#f5ba35', '#3d8fd5', '#73b94d', '#9164c7', '#22a99c'];
const TUB_HUES = {
  coral: '0deg',
  sunny: '43deg',
  blue: '185deg',
  green: '92deg',
  purple: '248deg',
};

const state = {
  screen: 'splash',
  mode: null,
  phase: null,
  promptKey: 'welcome',
  selectedColor: null,
  letterIndex: 0,
  wordIndex: 0,
  rollCount: 0,
  strokeIndex: 0,
  strokeProgress: 0,
  placed: 0,
  freeMarks: 0,
  awaitingInput: true,
  muted: false,
  timeScale: 1,
  transition: false,
};

// The one platform RNG (shared/js/rng.js), replacing this game's own private
// LCG — the cross-game seed-divergence fix: seed(42) now means the same
// sequence here as on every other migrated game. A module variable, not
// something startMode()/render*() capture once, so a seed set on the splash
// (before any mode is chosen) still reaches whichever mode gets built next.
// Swapped in by window.QLOBE_DEBUG's default seed() via onSeed below.
let rng = mulberry32(42);

let transitionPromise = Promise.resolve();
let currentActions = new Map();
let rollController = null;
let traceController = null;
let freeController = null;
let lastNudge = 0;

// The three live height-field surfaces (clay-dough.js), one non-null at a
// time — whichever phase is currently on screen. resetTransient() destroys
// and nulls all three on every screen change, and applyColor() retints
// whichever one is live, so no canvas or ResizeObserver ever survives past
// the phase that created it.
let rollDough = null;
let traceDough = null;
let freeDough = null;

const ready = Promise.all([
  voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
  content.ready(),
]).then(() => {
  renderModeCards();
  wirePermanentControls();
  buildConfetti();
  return true;
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(1, ms * state.timeScale)));
}

// The shared first-gesture unlock (sfx + speech + voice-clips + audio, each
// try/caught) replaces this game's own unlockAudio() fan-out, and its latch
// reopens on visibilitychange/pageshow — an iPad app-switch can no longer
// leave the factory silent for the rest of the session. Every control here
// used to call unlockAudio() again from its own pointerdown feedback too;
// that per-button re-unlock is exactly what audio-unlock.js's docs warn
// against, so those calls are gone below — the one global listener already
// fires on the same gesture.
installUnlockOnGesture();
installKioskGuards();

function playSfx(name) {
  if (!state.muted && typeof sfx[name] === 'function') sfx[name]();
}

function speak(key, fallback = config.voice[key]) {
  state.promptKey = key;
  if (state.muted) return Promise.resolve();
  return voice.say(key, fallback);
}

function setPrompt(key, icon = PROMPT_ICONS[key] || PROMPT_ICONS.words) {
  state.promptKey = key;
  els.promptIcon.textContent = icon;
  els.promptText.textContent = SHORT_PROMPTS[key] || config.voice[key] || key;
}

function showScreen(name) {
  state.screen = name;
  els.splash.classList.toggle('hidden', name !== 'splash');
  els.game.classList.toggle('hidden', name !== 'play');
  els.reveal.classList.toggle('hidden', name !== 'reveal');
}

function resetTransient() {
  rollController?.destroy();
  traceController?.destroy();
  freeController?.destroy();
  rollDough?.destroy();
  traceDough?.destroy();
  freeDough?.destroy();
  rollController = null;
  traceController = null;
  freeController = null;
  rollDough = null;
  traceDough = null;
  freeDough = null;
  voice.stop();
  currentActions = new Map();
  state.transition = false;
  state.awaitingInput = true;
  els.playfield.replaceChildren();
}

function goSplash({ greet = false } = {}) {
  resetTransient();
  state.mode = null;
  state.phase = null;
  state.selectedColor = null;
  showScreen('splash');
  if (greet) speak('again');
}

function registerTap(element, id, action, feedback = true) {
  element.dataset.targetId = id;
  currentActions.set(id, action);
  onTap(element, action, {
    feedback: () => {
      if (feedback) playSfx('tick');
    },
  });
}

function renderModeCards() {
  els.cards.replaceChildren();
  config.modes.forEach((mode, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mode-card';
    button.style.setProperty('--card-top', MODE_COLORS[index][0]);
    button.style.setProperty('--card-bottom', MODE_COLORS[index][1]);
    button.style.setProperty('--tilt', `${[-2.5, 1.8, -1.2][index]}deg`);
    button.style.setProperty('--i', index);
    button.setAttribute('aria-label', mode.title);

    const art = document.createElement('span');
    art.className = `mode-art mode-art-${mode.id === 'letters' ? 'letter' : mode.id === 'words' ? 'word' : 'free'}`;
    art.setAttribute('aria-hidden', 'true');
    if (mode.id === 'letters') {
      art.textContent = MODE_TITLES[mode.id][1];
    } else if (mode.id === 'words') {
      [...MODE_TITLES[mode.id][1]].forEach((letter) => {
        const part = document.createElement('span');
        part.textContent = letter;
        art.append(part);
      });
    } else {
      art.append(document.createElement('i'));
    }

    const label = document.createElement('span');
    label.className = 'mode-label';
    label.textContent = MODE_TITLES[mode.id][0];
    button.append(art, label);
    els.cards.append(button);
    onTap(button, () => startMode(mode.id), {
      feedback: () => playSfx('pop'),
    });
  });
}

function wirePermanentControls() {
  onTap(els.splashSound, () => speak('welcome'));
  onTap(els.back, () => goSplash({ greet: true }), { feedback: () => playSfx('unpop') });
  onTap(els.revealBack, () => goSplash({ greet: true }), { feedback: () => playSfx('unpop') });
  onTap(els.sound, () => repeatPrompt());
  onTap(els.revealSound, () => repeatReveal());
  onTap(els.again, () => replayCurrent(), { feedback: () => playSfx('pop') });
  onTap(els.next, () => nextRound(), { feedback: () => playSfx('sparkle') });
}

function repeatPrompt() {
  const fallback = config.voice[state.promptKey];
  if (fallback) speak(state.promptKey, fallback);
}

function repeatReveal() {
  if (state.mode === 'letters') return speakLetterReward();
  if (state.mode === 'words') return speak('word-done');
  return speak('free');
}

async function startMode(modeId) {
  resetTransient();
  state.mode = modeId;
  state.letterIndex = randomIndex(config.letters.length);
  state.wordIndex = randomIndex(config.words.length);
  showScreen('play');
  if (modeId === 'letters') return renderColorShop();
  if (modeId === 'words') return renderWordMaker();
  return renderFreeDough();
}

function randomIndex(length) {
  return Math.floor(rng() * length);
}

function phaseRail(count, active) {
  els.phaseDots.replaceChildren();
  for (let index = 0; index < count; index += 1) {
    const dot = document.createElement('i');
    dot.className = 'phase-dot';
    if (index < active) dot.classList.add('done');
    if (index === active) dot.classList.add('active');
    els.phaseDots.append(dot);
  }
}

function activeLetter() {
  return config.letters[state.letterIndex % config.letters.length];
}

function activeWord() {
  return config.words[state.wordIndex % config.words.length];
}

function colorById(id = state.selectedColor) {
  return config.colors.find((color) => color.id === id) || config.colors[0];
}

function applyColor(color) {
  document.documentElement.style.setProperty('--dough', color.value);
  document.documentElement.style.setProperty('--dough-dark', color.dark);
  // Retint whichever height field is currently mounted — the field itself is
  // untouched, so a colour change never costs the child their in-progress
  // roll, groove, or free-play shape.
  (rollDough || traceDough || freeDough)?.setColor(color.value);
}

/* Letter factory: choose, roll, trace, reveal */

function renderColorShop() {
  resetTransient();
  state.mode = 'letters';
  state.phase = 'color';
  state.selectedColor = null;
  state.awaitingInput = true;
  showScreen('play');
  phaseRail(3, 0);
  setPrompt('color');

  const shop = document.createElement('div');
  shop.className = 'color-shop';

  const mascot = document.createElement('img');
  mascot.className = 'color-mascot';
  mascot.src = './assets/ui/mascot.webp';
  mascot.alt = '';

  const machine = document.createElement('div');
  machine.className = 'target-machine';
  machine.textContent = activeLetter().letter;
  machine.setAttribute('aria-label', `Today we are making ${activeLetter().letter}`);

  const belt = document.createElement('div');
  belt.className = 'color-belt';
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'clay-action color-go';
  go.innerHTML = '<span aria-hidden="true">➜</span>';
  go.setAttribute('aria-label', 'Start rolling');
  go.disabled = true;

  config.colors.forEach((color) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'color-tub';
    button.style.setProperty('--swatch', color.value);
    button.style.setProperty('--swatch-dark', color.dark);
    button.style.setProperty('--tub-hue', TUB_HUES[color.id] || '0deg');
    button.setAttribute('aria-label', color.label);
    button.innerHTML = '<span class="dough-lump"></span><span class="tub-body"></span><span class="tub-check">✓</span>';
    registerTap(button, `color-${color.id}`, () => {
      state.selectedColor = color.id;
      applyColor(color);
      belt.querySelectorAll('.color-tub').forEach((tub) => {
        tub.classList.toggle('selected', tub === button);
        tub.setAttribute('aria-pressed', String(tub === button));
      });
      go.disabled = false;
      playSfx('pop');
      return true;
    });
    belt.append(button);
  });

  registerTap(go, 'color-go', () => {
    if (!state.selectedColor) return false;
    return renderRolling();
  });
  belt.append(go);
  shop.append(mascot, machine, belt);
  els.playfield.append(shop);
  transitionPromise = speak('color');
  return transitionPromise;
}

function renderRolling() {
  resetTransient();
  state.phase = 'roll';
  state.rollCount = 0;
  state.awaitingInput = true;
  showScreen('play');
  phaseRail(3, 1);
  setPrompt('roll');
  applyColor(colorById());

  const stage = document.createElement('div');
  stage.className = 'roll-stage';
  const tray = document.createElement('div');
  tray.className = 'work-tray roll-tray';
  const zone = document.createElement('div');
  zone.className = 'roll-zone';
  zone.dataset.targetId = 'roll-zone';
  const roller = document.createElement('div');
  roller.className = 'rolling-pin';
  const cue = document.createElement('div');
  cue.className = 'swipe-cue';
  zone.append(roller, cue);
  tray.append(zone);

  const meter = document.createElement('div');
  meter.className = 'roll-meter';
  for (let index = 0; index < 3; index += 1) {
    const bead = document.createElement('i');
    bead.className = 'roll-bead';
    bead.textContent = '✓';
    meter.append(bead);
  }
  stage.append(tray, meter);
  els.playfield.append(stage);

  // zone is attached to the document before the field mounts, so its first
  // getBoundingClientRect (inside createRollDough) already has real layout.
  rollDough = createRollDough(zone, { color: colorById().value });

  let pointerId = null;
  let startX = 0;
  let latestX = 0;
  let maximumTravel = 0;
  const requiredTravel = () => Math.min(115, zone.clientWidth * .2);
  const pointX = (event) => {
    const rect = zone.getBoundingClientRect();
    return Math.max(0, Math.min(rect.width, event.clientX - rect.left));
  };
  const onDown = (event) => {
    if (pointerId !== null || state.transition || event.isPrimary === false) return;
    pointerId = event.pointerId;
    startX = pointX(event);
    latestX = startX;
    maximumTravel = 0;
    try { zone.setPointerCapture?.(pointerId); } catch { /* window listeners still cover it */ }
    cue.classList.add('fade');
    rollDough?.begin(event.clientX, event.clientY);
  };
  const onMove = (event) => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    latestX = pointX(event);
    maximumTravel = Math.max(maximumTravel, Math.abs(latestX - startX));
    const percent = 12 + (latestX / Math.max(1, zone.clientWidth)) * 76;
    zone.style.setProperty('--roller-x', `${percent}%`);
    // Coalesced samples so a fast real swipe still lengthens/flattens the
    // dough smoothly instead of only on the throttled move events the OS
    // chooses to dispatch.
    const samples = event.getCoalescedEvents?.() || [event];
    samples.forEach((sample) => rollDough?.moveTo(sample.clientX, sample.clientY));
  };
  // A pointercancel (iPadOS palm rejection) or a window blur mid-swipe must
  // let go of the dough without ever crediting a roll. The old version bound
  // `finish` to pointercancel directly, which meant a palm-rejection cancel
  // could fill a bead and advance rollCount for a swipe the child never
  // completed — this replaces that with a real release-only path.
  const releaseGesture = () => {
    if (pointerId === null) return;
    pointerId = null;
    rollDough?.release();
    cue.classList.remove('fade');
  };
  const onCancel = (event) => {
    if (event.pointerId !== pointerId) return;
    releaseGesture();
  };
  const onBlur = () => releaseGesture();
  const finish = (event) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    rollDough?.release();
    if (maximumTravel < requiredTravel()) {
      cue.classList.remove('fade');
      gentleNudge(tray);
      return;
    }
    state.rollCount = Math.min(3, state.rollCount + 1);
    meter.children[state.rollCount - 1]?.classList.add('done');
    playSfx(state.rollCount === 3 ? 'sparkle' : 'pop');
    if (state.rollCount >= 3) {
      state.awaitingInput = false;
      state.transition = true;
      transitionPromise = wait(500).then(renderTracing);
    }
  };
  // pointerdown stays on the zone itself (the gesture's natural start
  // target); move/up/cancel move to window, filtered by the captured
  // pointerId, per docs/interaction-patterns.md #11 — this game re-renders
  // its whole screen on every phase change, which would otherwise strand a
  // listener bound to an element mid-gesture.
  zone.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('blur', onBlur);
  rollController = {
    destroy() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onBlur);
    },
  };
  currentActions.set('roll-zone', () => false);
  transitionPromise = speak('roll');
  return transitionPromise;
}

function renderTracing() {
  resetTransient();
  state.phase = 'trace';
  state.strokeIndex = 0;
  state.strokeProgress = 0;
  state.awaitingInput = true;
  showScreen('play');
  phaseRail(3, 2);
  setPrompt('trace');
  applyColor(colorById());

  const letter = activeLetter();
  const stage = document.createElement('div');
  stage.className = 'trace-stage';
  const tray = document.createElement('div');
  tray.className = 'work-tray trace-tray';
  const side = document.createElement('aside');
  side.className = 'trace-side';
  side.innerHTML = `
    <div class="target-letter-chip" aria-label="Letter ${letter.letter}">${letter.letter}</div>
    <div class="trace-color-chip" aria-hidden="true"><i></i></div>
    <div class="stroke-meter" aria-hidden="true">${letter.paths.map(() => '<i class="stroke-dot"></i>').join('')}</div>`;
  stage.append(tray, side);
  els.playfield.append(stage);

  // tray is attached to the document before the field mounts, same reason
  // as roll's zone above.
  traceDough = createTraceDough(tray, { color: colorById().value });

  traceController = createTraceSurface(tray, letter.paths, {
    onProgress: (value) => { state.strokeProgress = value; },
    onStrokeComplete: (index) => {
      state.strokeIndex = index + 1;
      state.strokeProgress = 0;
      side.querySelectorAll('.stroke-dot')[index]?.classList.add('done');
      playSfx('pop');
    },
    onWrongStart: () => {
      gentleNudge(tray);
      const now = performance.now();
      if (now - lastNudge > 1200) {
        lastNudge = now;
        setPrompt('nudge');
        speak('nudge').finally(() => {
          if (state.phase === 'trace') setPrompt('trace');
        });
      }
    },
    onComplete: () => {
      state.awaitingInput = false;
      state.transition = true;
      playSfx('sparkle');
      transitionPromise = wait(480).then(showLetterReveal);
    },
    // Pure observer of the SVG layer's own credited-progress decision below —
    // it never influences whether a stroke counts, only how the dough looks.
    onCarve: (points) => traceDough?.carve(points),
  });
  currentActions.set('trace-surface', () => false);
  transitionPromise = speak('trace');
  return transitionPromise;
}

function createTraceSurface(mount, pathData, callbacks) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.classList.add('letter-svg');
  svg.setAttribute('viewBox', '0 0 600 600');
  svg.dataset.targetId = 'trace-surface';
  const guides = [];
  const clays = [];
  pathData.forEach((data) => {
    const guide = document.createElementNS(svgNS, 'path');
    guide.setAttribute('d', data);
    guide.setAttribute('class', 'letter-guide');
    const clay = document.createElementNS(svgNS, 'path');
    clay.setAttribute('d', data);
    clay.setAttribute('class', 'letter-clay');
    svg.append(guide, clay);
    guides.push(guide);
    clays.push(clay);
  });
  const start = document.createElementNS(svgNS, 'circle');
  start.setAttribute('r', '26');
  start.setAttribute('class', 'trace-start');
  svg.append(start);
  const finger = document.createElement('div');
  finger.className = 'trace-finger';
  mount.append(svg, finger);

  const lengths = clays.map((path) => path.getTotalLength());
  lengths.forEach((length, index) => {
    clays[index].style.strokeDasharray = `${length}`;
    clays[index].style.strokeDashoffset = `${length}`;
  });

  let index = 0;
  let progressLength = 0;
  let pointerId = null;
  let destroyed = false;

  const pointAt = (pathIndex, length) => clays[pathIndex].getPointAtLength(length);
  const updateCue = () => {
    if (index >= clays.length) {
      start.style.display = 'none';
      finger.style.display = 'none';
      return;
    }
    const point = pointAt(index, progressLength);
    start.setAttribute('cx', point.x);
    start.setAttribute('cy', point.y);
    const clientPoint = svg.createSVGPoint();
    clientPoint.x = point.x;
    clientPoint.y = point.y;
    const screenPoint = clientPoint.matrixTransform(svg.getScreenCTM());
    const mountRect = mount.getBoundingClientRect();
    finger.style.left = `${screenPoint.x - mountRect.left}px`;
    finger.style.top = `${screenPoint.y - mountRect.top}px`;
  };
  updateCue();

  const localPoint = (event) => {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
  };
  // The forward half of localPoint's transform: turns a path-length sample
  // back into client space so the height field (which only understands
  // pointer-style client coordinates) can carve exactly what the SVG layer
  // above just credited.
  const clientAt = (pathIndex, length) => {
    const point = pointAt(pathIndex, length);
    const svgPoint = svg.createSVGPoint();
    svgPoint.x = point.x;
    svgPoint.y = point.y;
    const screen = svgPoint.matrixTransform(svg.getScreenCTM());
    return { x: screen.x, y: screen.y };
  };
  // Every ~8 SVG user units between `from` and `to`, always including both
  // ends. Called only with a span that has just newly become credited —
  // re-sampling the same span on a later call would carve the same groove
  // twice and dig a hole straight through the dough.
  const sampleSpan = (pathIndex, from, to) => {
    const points = [];
    for (let cursor = from; cursor < to; cursor += 8) points.push(clientAt(pathIndex, cursor));
    points.push(clientAt(pathIndex, to));
    return points;
  };
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const onDown = (event) => {
    if (pointerId !== null || index >= clays.length || destroyed || event.isPrimary === false) return;
    const local = localPoint(event);
    const expected = pointAt(index, progressLength);
    if (distance(local, expected) > 88) {
      callbacks.onWrongStart();
      return;
    }
    pointerId = event.pointerId;
    try { svg.setPointerCapture?.(pointerId); } catch { /* window listeners still cover it */ }
    finger.style.display = 'none';
  };
  const onMove = (event) => {
    if (event.pointerId !== pointerId || index >= clays.length) return;
    event.preventDefault();
    const local = localPoint(event);
    const total = lengths[index];
    let best = progressLength;
    const from = Math.max(0, progressLength - 24);
    const to = Math.min(total, progressLength + Math.max(125, total * .2));
    for (let cursor = from; cursor <= to; cursor += 5) {
      if (distance(local, pointAt(index, cursor)) < 82) best = Math.max(best, cursor);
    }
    if (best > progressLength) {
      const carvedFrom = progressLength;
      progressLength = best;
      clays[index].style.strokeDashoffset = `${Math.max(0, total - progressLength)}`;
      callbacks.onProgress(progressLength / total);
      callbacks.onCarve(sampleSpan(index, carvedFrom, best));
      updateCue();
    }
  };
  // pointerup credits a finished stroke below; pointercancel (palm rejection,
  // an app-switch blur) must not — it only releases whatever is mid-drag,
  // same rule as the roll zone above.
  const releaseStroke = () => {
    if (pointerId === null) return;
    pointerId = null;
    finger.style.display = '';
    updateCue();
  };
  const onUp = (event) => {
    if (event.pointerId !== pointerId || index >= clays.length) return;
    pointerId = null;
    const total = lengths[index];
    if (progressLength / total >= .82) {
      // Carve the remaining tail so an accepted stroke that stopped short of
      // the literal path end still reads as a fully-pressed groove.
      if (progressLength < total) callbacks.onCarve(sampleSpan(index, progressLength, total));
      clays[index].style.strokeDashoffset = '0';
      callbacks.onStrokeComplete(index);
      index += 1;
      progressLength = 0;
      if (index >= clays.length) callbacks.onComplete();
      else {
        finger.style.display = '';
        updateCue();
      }
    } else {
      finger.style.display = '';
      updateCue();
    }
  };
  const onCancel = (event) => {
    if (event.pointerId !== pointerId) return;
    releaseStroke();
  };
  const onBlur = () => releaseStroke();
  // pointerdown stays on the svg (the natural start target); move/up/cancel
  // move to window, filtered by pointerId, matching the roll-zone contract.
  svg.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('blur', onBlur);

  return {
    complete() {
      if (destroyed) return;
      while (index < clays.length) {
        const total = lengths[index];
        if (progressLength < total) callbacks.onCarve(sampleSpan(index, progressLength, total));
        clays[index].style.strokeDashoffset = '0';
        callbacks.onStrokeComplete(index);
        index += 1;
        progressLength = 0;
      }
      callbacks.onComplete();
    },
    destroy() {
      destroyed = true;
      svg.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onBlur);
    },
  };
}

function gentleNudge(element) {
  playSfx('silly');
  element.classList.remove('nudge');
  void element.offsetWidth;
  element.classList.add('nudge');
}

function showLetterReveal() {
  resetTransient();
  state.phase = 'reveal';
  state.awaitingInput = true;
  showScreen('reveal');
  const letter = activeLetter();
  const color = colorById();
  applyColor(color);
  els.revealCard.replaceChildren();

  const wrap = document.createElement('div');
  wrap.className = 'reveal-letter-wrap';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('reveal-letter-svg');
  svg.setAttribute('viewBox', '0 0 600 600');
  letter.paths.forEach((data) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', data);
    path.setAttribute('class', 'letter-clay-finished');
    svg.append(path);
  });
  const face = document.createElement('span');
  face.className = 'reveal-face';
  face.innerHTML = '<i></i><i></i>';
  const smile = document.createElement('span');
  smile.className = 'reveal-smile';
  wrap.append(svg, face, smile);

  const object = document.createElement('img');
  object.className = 'phonics-object';
  object.src = letter.object;
  object.alt = letter.word;
  const label = document.createElement('div');
  label.className = 'phonics-label';
  label.innerHTML = `<strong>${letter.letter}</strong> is for ${letter.word.toUpperCase()}`;
  els.revealCard.append(wrap, object, label);
  playSfx('tada');
  transitionPromise = speakLetterReward();
  return transitionPromise;
}

async function speakLetterReward() {
  const letter = activeLetter();
  await speak('letter-done');
  if (state.muted || state.screen !== 'reveal') return;
  const clip = content.isforAudio?.(letter.word);
  if (clip) await voice.sayFile(clip, `${letter.letter} is for ${letter.word}.`);
  else await speech.speak(`${letter.letter} is for ${letter.word}.`);
}

/* Word maker */

function renderWordMaker() {
  resetTransient();
  state.mode = 'words';
  state.phase = 'word';
  state.placed = 0;
  state.awaitingInput = true;
  showScreen('play');
  phaseRail(3, state.wordIndex % 3);
  const word = activeWord();
  setPrompt(`word-${word.id}`, PROMPT_ICONS.words);

  const stage = document.createElement('div');
  stage.className = 'word-stage';
  const clue = document.createElement('aside');
  clue.className = 'word-clue';
  clue.innerHTML = `<img src="${word.object}" alt="${word.id}"><div class="word-stars" aria-hidden="true"><i></i><i></i><i></i></div>`;
  const machine = document.createElement('div');
  machine.className = 'word-machine';
  const slots = document.createElement('div');
  slots.className = 'word-slots';
  const tray = document.createElement('div');
  tray.className = 'letter-tray';
  const letters = [...word.word];

  letters.forEach((letter, index) => {
    const slot = document.createElement('div');
    slot.className = `word-slot${index === 0 ? ' current' : ''}`;
    slot.textContent = letter;
    slot.dataset.targetId = `slot-${index}`;
    slots.append(slot);
  });

  const shuffled = shuffle(letters.map((letter, index) => ({ letter, original: index })), rng);
  shuffled.forEach((item, tokenIndex) => {
    const color = config.colors[(tokenIndex + state.wordIndex) % config.colors.length];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'letter-token';
    button.textContent = item.letter;
    button.dataset.letter = item.letter;
    button.dataset.targetId = `token-${tokenIndex}`;
    button.style.setProperty('--token-color', color.value);
    button.style.setProperty('--token-dark', color.dark);
    wireWordToken(button, () => placeWordToken(button, color));
    tray.append(button);
  });

  machine.append(slots, tray);
  stage.append(clue, machine);
  els.playfield.append(stage);
  transitionPromise = speak(`word-${word.id}`);
  return transitionPromise;
}

function wireWordToken(button, action) {
  const id = button.dataset.targetId;
  currentActions.set(id, action);
  let pointerId = null;
  let start = null;
  let moved = false;
  let suppressClickUntil = 0;
  const resetTransform = () => {
    button.classList.remove('dragging');
    button.style.transform = '';
  };
  button.addEventListener('pointerdown', (event) => {
    if (button.classList.contains('used') || pointerId !== null) return;
    playSfx('tick');
    pointerId = event.pointerId;
    start = { x: event.clientX, y: event.clientY };
    moved = false;
    button.setPointerCapture?.(pointerId);
  });
  button.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId || !start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > 8) moved = true;
    if (moved) {
      event.preventDefault();
      button.classList.add('dragging');
      button.style.transform = `translate(${dx}px, ${dy}px) scale(1.08) rotate(-3deg)`;
    }
  });
  const finish = (event) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    suppressClickUntil = performance.now() + 650;
    const current = els.playfield.querySelector('.word-slot.current');
    const rect = current?.getBoundingClientRect();
    const droppedOnCurrent = moved && rect
      && event.clientX >= rect.left - 28 && event.clientX <= rect.right + 28
      && event.clientY >= rect.top - 28 && event.clientY <= rect.bottom + 28;
    resetTransform();
    if (!moved || droppedOnCurrent) action();
    else wrongWordToken(button);
  };
  button.addEventListener('pointerup', finish);
  button.addEventListener('pointercancel', (event) => {
    if (event.pointerId === pointerId) {
      pointerId = null;
      resetTransform();
    }
  });
  button.addEventListener('click', () => {
    if (performance.now() < suppressClickUntil) return;
    action();
  });
}

function placeWordToken(button, color) {
  if (state.transition || button.classList.contains('used')) return false;
  const word = activeWord();
  const expected = word.word[state.placed];
  if (button.dataset.letter !== expected) {
    wrongWordToken(button);
    return false;
  }
  const slots = [...els.playfield.querySelectorAll('.word-slot')];
  const slot = slots[state.placed];
  slot.classList.remove('current');
  slot.classList.add('filled');
  slot.style.setProperty('--slot-color', color.value);
  slot.style.setProperty('--slot-dark', color.dark);
  button.classList.add('used');
  els.playfield.querySelectorAll('.word-stars i')[state.placed]?.classList.add('done');
  state.placed += 1;
  playSfx(state.placed === word.word.length ? 'sparkle' : 'pop');
  if (state.placed < word.word.length) {
    slots[state.placed].classList.add('current');
  } else {
    state.awaitingInput = false;
    state.transition = true;
    transitionPromise = wait(520).then(showWordReveal);
  }
  return true;
}

function wrongWordToken(button) {
  button.classList.remove('wrong');
  void button.offsetWidth;
  button.classList.add('wrong');
  playSfx('silly');
  return false;
}

function showWordReveal() {
  resetTransient();
  state.phase = 'reveal';
  state.awaitingInput = true;
  showScreen('reveal');
  const word = activeWord();
  els.revealCard.replaceChildren();
  const row = document.createElement('div');
  row.className = 'word-reveal';
  [...word.word].forEach((letter, index) => {
    const color = config.colors[(index + state.wordIndex) % config.colors.length];
    const part = document.createElement('span');
    part.textContent = letter;
    part.style.setProperty('--letter-color', color.value);
    part.style.setProperty('--letter-dark', color.dark);
    part.style.setProperty('--i', index);
    row.append(part);
  });
  const object = document.createElement('img');
  object.className = 'word-reveal-object';
  object.src = word.object;
  object.alt = word.id;
  const label = document.createElement('div');
  label.className = 'phonics-label';
  label.textContent = word.word;
  els.revealCard.append(row, object, label);
  playSfx('tada');
  transitionPromise = speak('word-done');
  return transitionPromise;
}

/* Free play */

function renderFreeDough() {
  resetTransient();
  state.mode = 'free';
  state.phase = 'free';
  state.freeMarks = 0;
  state.awaitingInput = true;
  state.selectedColor = config.colors[0].id;
  applyColor(config.colors[0]);
  showScreen('play');
  phaseRail(1, 0);
  setPrompt('free');

  const stage = document.createElement('div');
  stage.className = 'free-stage';
  const tray = document.createElement('div');
  tray.className = 'work-tray free-tray';
  const tools = document.createElement('div');
  tools.className = 'free-tools';
  const palette = document.createElement('div');
  palette.className = 'free-palette';

  ['A', 'O', 'S', '★'].forEach((stamp) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stamp-button';
    button.textContent = stamp;
    button.setAttribute('aria-label', `Stamp ${stamp === '★' ? 'a star' : stamp}`);
    registerTap(button, `stamp-${stamp}`, () => {
      freeController?.stamp(stamp);
      return true;
    });
    tools.append(button);
  });

  config.colors.forEach((color, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `palette-dot${index === 0 ? ' selected' : ''}`;
    button.style.setProperty('--swatch', color.value);
    button.style.setProperty('--swatch-dark', color.dark);
    button.setAttribute('aria-label', color.label);
    registerTap(button, `palette-${color.id}`, () => {
      state.selectedColor = color.id;
      applyColor(color);
      // applyColor() already pushes into whichever field is live, but the
      // free tray is the one screen where the child picks colour mid-play —
      // spelling the retint out here keeps it correct even if a future edit
      // narrows applyColor()'s job back down to CSS chrome only.
      freeDough?.setColor(color.value);
      palette.querySelectorAll('.palette-dot').forEach((dot) => dot.classList.toggle('selected', dot === button));
      return true;
    });
    palette.append(button);
  });

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'clay-action free-clear';
  clear.innerHTML = '<span aria-hidden="true">↺</span>';
  clear.setAttribute('aria-label', 'Clear the tray');
  registerTap(clear, 'free-clear', () => {
    freeController?.clear();
    playSfx('unpop');
    return true;
  });
  palette.append(clear);
  stage.append(tray, tools, palette);
  els.playfield.append(stage);

  // tray is attached to the document before the field mounts, same reason
  // as roll's zone and trace's tray above.
  freeDough = createFreeDough(tray, { color: colorById().value });
  // tools/qa.mjs and QLOBE_DEBUG's tap() both locate the free surface by
  // this id; the SVG it replaces used to set it directly on itself too.
  freeDough.canvas.dataset.targetId = 'free-canvas';

  freeController = createFreeSurface(tray, freeDough, {
    onMark: () => {
      state.freeMarks += 1;
      playSfx(state.freeMarks % 4 === 0 ? 'sparkle' : 'pop');
    },
    onClear: () => { state.freeMarks = 0; },
  });
  currentActions.set('free-canvas', () => {
    freeController?.stamp('★');
    return true;
  });
  transitionPromise = speak('free');
  return transitionPromise;
}

// doughSurface is the createFreeDough() handle mounted by renderFreeDough()
// above — this function owns only the gesture/stamp/hint wiring on top of
// it, not the field itself.
function createFreeSurface(mount, doughSurface, callbacks) {
  const hint = document.createElement('div');
  hint.className = 'free-hint';
  hint.textContent = '∿';
  mount.append(hint);

  let pointerId = null;
  let destroyed = false;

  const markMade = () => {
    hint.classList.add('fade');
    callbacks.onMark();
  };
  const onDown = (event) => {
    if (pointerId !== null || destroyed || event.isPrimary === false) return;
    pointerId = event.pointerId;
    try { doughSurface.canvas.setPointerCapture?.(pointerId); } catch { /* window listeners still cover it */ }
    doughSurface.beginRope(event.clientX, event.clientY);
  };
  const onMove = (event) => {
    if (event.pointerId !== pointerId || destroyed) return;
    event.preventDefault();
    const samples = event.getCoalescedEvents?.() || [event];
    samples.forEach((sample) => doughSurface.extendRope(sample.clientX, sample.clientY));
  };
  // pointerup below counts as a completed mark; pointercancel/blur must
  // release the rope in place without counting one — same rule as roll and
  // trace above.
  const releaseRope = () => {
    if (pointerId === null) return;
    pointerId = null;
    doughSurface.endRope();
  };
  const onUp = (event) => {
    if (event.pointerId !== pointerId) return;
    releaseRope();
    markMade();
  };
  const onCancel = (event) => {
    if (event.pointerId !== pointerId) return;
    releaseRope();
  };
  const onBlur = () => releaseRope();
  // pointerdown stays on the canvas (the natural start target); move/up/
  // cancel move to window, filtered by pointerId, matching the roll-zone
  // and trace-surface contracts above.
  doughSurface.canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('blur', onBlur);

  return {
    stamp(mark) {
      if (destroyed) return;
      doughSurface.stamp(mark);
      markMade();
    },
    clear() {
      if (destroyed) return;
      doughSurface.clear();
      hint.classList.remove('fade');
      callbacks.onClear();
    },
    destroy() {
      destroyed = true;
      doughSurface.canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onBlur);
    },
  };
}

function replayCurrent() {
  if (state.mode === 'letters') return renderColorShop();
  if (state.mode === 'words') return renderWordMaker();
  return renderFreeDough();
}

function nextRound() {
  if (state.mode === 'letters') {
    state.letterIndex = (state.letterIndex + 1) % config.letters.length;
    return renderColorShop();
  }
  if (state.mode === 'words') {
    state.wordIndex = (state.wordIndex + 1) % config.words.length;
    return renderWordMaker();
  }
  return renderFreeDough();
}

// NOT shared/js/celebrate.js on purpose. That module's burstConfetti() is a
// one-shot burst that sweeps itself up after `duration`; this is ambient —
// 28 pieces on an `infinite` CSS fall (css/style.css `.confetti i`) that keeps
// going for as long as the reveal screen stays up, laid out deterministically
// from the piece index (not the RNG) so it never needs reseeding.
function buildConfetti() {
  els.confetti.replaceChildren();
  for (let index = 0; index < 28; index += 1) {
    const piece = document.createElement('i');
    piece.style.left = `${3 + (index * 37) % 94}%`;
    piece.style.setProperty('--confetti', CONFETTI_COLORS[index % CONFETTI_COLORS.length]);
    piece.style.setProperty('--duration', `${2.8 + (index % 7) * .23}s`);
    piece.style.setProperty('--delay', `${-(index % 11) * .31}s`);
    els.confetti.append(piece);
  }
}

function targetRole(element) {
  const id = element.dataset.targetId || '';
  if (state.mode === 'words' && id.startsWith('token-')) {
    return element.dataset.letter === activeWord().word[state.placed] ? 'correct' : 'wrong';
  }
  if (id === 'color-go') return state.selectedColor ? 'correct' : 'neutral';
  if (id.startsWith('color-') || id.startsWith('palette-') || id.startsWith('stamp-')) return 'neutral';
  if (['roll-zone', 'trace-surface', 'free-canvas'].includes(id)) return 'correct';
  return 'neutral';
}

function doughDebugState() {
  const active = rollDough || traceDough || freeDough;
  if (!active) return null;
  const metrics = active.metrics();
  const round = (value, places) => {
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
  };
  return {
    revision: metrics.revision,
    volume: round(metrics.volume, 2),
    peak: round(metrics.peak, 2),
    spreadX: round(metrics.spreadX, 3),
    spreadY: round(metrics.spreadY, 3),
    renders: metrics.renders,
  };
}

async function debugTap(targetId) {
  const action = currentActions.get(targetId);
  if (!action) return { accepted: false };
  const result = await action();
  return { accepted: result !== false };
}

async function debugWinRound() {
  if (state.mode === 'letters') {
    if (state.phase === 'color') {
      state.selectedColor = config.colors[0].id;
      applyColor(config.colors[0]);
      await renderRolling();
    }
    if (state.phase === 'roll') {
      state.rollCount = 3;
      await renderTracing();
    }
    if (state.phase === 'trace') traceController?.complete();
    await transitionPromise;
    return true;
  }
  if (state.mode === 'words' && state.phase === 'word') {
    const word = activeWord();
    for (const letter of word.word) {
      const token = [...els.playfield.querySelectorAll('.letter-token:not(.used)')]
        .find((candidate) => candidate.dataset.letter === letter);
      if (token) {
        const index = [...token.parentElement.children].indexOf(token);
        const color = config.colors[(index + state.wordIndex) % config.colors.length];
        placeWordToken(token, color);
      }
    }
    await transitionPromise;
    return true;
  }
  if (state.mode === 'free') {
    freeController?.stamp('A');
    freeController?.stamp('★');
    return true;
  }
  return false;
}

// Two-way now — the old version only ever muted, never back. voice.setMuted()
// is voice-clips.js's own gate (it cuts the current line, and its internal
// stop() already cancels speechSynthesis), so this is state.muted — which
// speak()/playSfx() already gate on — plus the one channel that needed a
// direct call.
function setMuted(on = true) {
  const muted = Boolean(on);
  state.muted = muted;
  voice.setMuted(muted);
  document.querySelectorAll('audio, video').forEach((media) => { media.muted = muted; });
  return muted;
}

installDebug({
  gameId: config.id,
  engine: 'custom-playdough-factory',
  ready,
  listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
  startMode,
  getState: () => ({
    screen: state.screen,
    mode: state.mode,
    phase: state.phase,
    round: state.mode === 'letters' ? state.letterIndex : state.wordIndex,
    roundsTotal: state.mode === 'letters' ? config.letters.length : state.mode === 'words' ? config.words.length : 1,
    awaitingInput: state.awaitingInput,
    selectedColor: state.selectedColor,
    letter: state.mode === 'letters' ? activeLetter().letter : null,
    word: state.mode === 'words' ? activeWord().word : null,
    rollCount: state.rollCount,
    stroke: state.strokeIndex,
    strokeProgress: state.strokeProgress,
    placed: state.placed,
    freeMarks: state.freeMarks,
    muted: state.muted,
    // The live height field's own numbers, straight from clay-dough.js's
    // metrics() — null when no field is on screen (color shop, word maker,
    // reveal). Rounded for readability only; never smoothed or faked, so QA
    // can assert on it directly.
    dough: doughDebugState(),
  }),
  getTargets: () => [...document.querySelectorAll('[data-target-id]')]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        id: element.dataset.targetId,
        role: targetRole(element),
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      };
    }),
  tap: debugTap,
  winRound: debugWinRound,
  mute: setMuted,
  // This game's own wait()-based timers already scale by state.timeScale —
  // a caller-supplied fastTimers always wins over installDebug's default, so
  // passing it through here keeps it working instead of losing it to the
  // generic timers.js scale (which nothing here is wired to).
  fastTimers: (scale = .05) => {
    state.timeScale = Math.max(.01, Math.min(1, Number(scale) || .05));
    return state.timeScale;
  },
  home: () => goSplash(),
  // Where the seeded generator lands: mulberry32 (rng.js) now, not this
  // game's old LCG. The default seed() is inert without this.
  onSeed: (nextRng) => { rng = nextRng; },
});
