// main.js — Rhyming Detective: screens, HUD, transitions and QLOBE_DEBUG.
//
// The play field (rooms, hotspots, rhyme logic, tap choreography) is js/game.js.
// This file owns the five screens of game-design.md §2, the CSS-px HUD of §2.5,
// the voice sequencing that is not tied to a tap (§3.4), and the debug surface
// of §7. Every reference below is to games/rhyming-detective/game-design.md.

import config from '../config.js';
import * as rawSfx from '../../../shared/js/sfx.js';
import * as speech from '../../../shared/js/speech.js';
import { onTap } from '../../../shared/js/tap.js';
import { installUnlockOnGesture } from '../../../shared/js/audio-unlock.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createTimers } from '../../../shared/js/timers.js';
import * as voice from './voice.js';
import { createPlayfield, createDeck } from './game.js';
import { renderModeCards } from '../../../shared/js/mode-select.js';

const cases = config.cases || [];
const tuning = config.tuning || {};
const modes = config.modes || [];
const SPRITE_DIR = (config.sprites && config.sprites.dir) || 'assets/sprites/';
const SPRITE_FALLBACK = (config.sprites && config.sprites.fallbackDir) || '../../shared/assets/objects/';

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

const state = {
  screen: 'splash',
  mode: null,
  modeDef: null,
  caseIndex: -1,
  timeScale: 1,
  seed: Date.now() & 0xffff,
  muted: false,
  welcomeSpoken: false,
  modeRowOpen: false,
  sweptThisSession: false,
  introToken: 0,
  layout: 'wide',
};

let yesDeck = createDeck((config.voice && config.voice.decks && config.voice.decks.yes) || [], state.seed);
let idleDeck = createDeck((config.voice && config.voice.decks && config.voice.decks.idle) || [], state.seed);
let lastReflow = null;

// The one cancellable, fastTimers()-scalable timer group (shared/js/timers.js)
// — mirrors bug-hotel-observer's main.js. `state.timeScale` stays the source
// of truth for the two non-scheduling consumers that read it directly
// (voice.seq()'s gap multiplier, the `--ts` CSS custom property, and
// game.js's own T()); fastTimers() keeps both in sync (see the debug hook).
const timerGroup = createTimers();
const wait = (ms) => timerGroup.wait(ms);

// SFX facade — one place to gate every effect on mute(). sfx.js has no gain
// export, so the mute happens at the call site (§7.4 "sfx gain to 0").
const SFX_KEYS = ['pop', 'sparkle', 'whoosh', 'boing', 'tada', 'tick'];
const sfx = { unlock: () => { try { rawSfx.unlock(); } catch { /* ignore */ } } };
for (const key of SFX_KEYS) {
  sfx[key] = () => {
    if (state.muted) return;
    try { rawSfx[key](); } catch { /* an effect must never break a tap */ }
  };
}

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const els = {
  app: $('app'),
  stage: $('stage'),
  dim: $('dim'),
  hud: $('hud'),
  back: $('btn-back'),
  sound: $('btn-sound'),
  banner: $('banner'),
  bottomStack: $('bottom-stack'),
  card: $('word-card'),
  tray: $('tray'),
  dots: $('dots'),
  splash: $('splash'),
  splashHome: $('splash-home'),
  splashSound: $('splash-sound'),
  splashTitle: $('splash-title'),
  play: $('btn-play'),
  modeRow: $('mode-row'),
  celebration: $('celebration'),
  celebrationBack: $('celebration-back'),
  confetti: $('confetti'),
  greatJob: $('great-job'),
  pairLeft: $('pair-left'),
  pairPlus: $('pair-plus'),
  pairRight: $('pair-right'),
  ribbon: $('they-rhyme'),
  catCheer: $('cat-cheer'),
  batCheer: $('bat-cheer'),
  finds: $('finds'),
  next: $('btn-next'),
  celebrationDots: $('celebration-dots'),
  end: $('end'),
  endBack: $('end-back'),
  endRow: $('end-row'),
  endDots: $('end-dots'),
  again: $('btn-again'),
};

const traySlots = [];

// The three-arc sound glyph (§2.3, §10). Inline SVG, no asset.
function soundGlyph(size) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('class', 'glyph');
  svg.setAttribute('aria-hidden', 'true');
  if (size) svg.setAttribute('width', String(size));
  if (size) svg.setAttribute('height', String(size));
  for (const r of [9, 17, 25]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M 14 ${24 - r} A ${r} ${r} 0 0 1 14 ${24 + r}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '5');
    path.setAttribute('stroke-linecap', 'round');
    svg.appendChild(path);
  }
  return svg;
}

// §8.5 — try the game's own room-style sprite, fall back to the shared Toy
// Table cut-out. Used for the tray, the celebration and the end screen; the
// hotspots do the same thing through the scene's setSprite promise.
function spriteImg(word, className) {
  const img = document.createElement('img');
  img.className = className;
  img.alt = '';
  img.decoding = 'async';
  img.draggable = false;
  img.src = `${SPRITE_DIR}${word}.webp`;
  const onError = () => {
    img.removeEventListener('error', onError);
    img.classList.add('rd-fallback-sprite');
    img.src = `${SPRITE_FALLBACK}${word}.webp`;
  };
  img.addEventListener('error', onError);
  return img;
}

// ---------------------------------------------------------------------------
// timers
// ---------------------------------------------------------------------------

const timers = { idle: null, intro: null, auto: null, card: null };

function clearTimer(name) {
  if (timers[name] != null) { timerGroup.clear(timers[name]); timers[name] = null; }
}

/** A scaled, fire-once beat — not individually cancellable, swept by clearAllTimers(). */
function beat(ms, fn) {
  return timerGroup.after(ms, fn);
}

function clearAllTimers() {
  for (const name of Object.keys(timers)) timers[name] = null;
  timerGroup.clearAll();
}

function debounced(ms, fn) {
  let until = 0;
  return (...args) => {
    const now = performance.now();
    if (now < until) return;
    until = now + ms;
    fn(...args);
  };
}

// ---------------------------------------------------------------------------
// HUD reserve (§2.5) — the one bridge between CSS px and art space
// ---------------------------------------------------------------------------

// #bottom-stack stands in for the word card + tray on purpose. A parent's
// border box does not include its children's transforms, and the card slides
// up 60 px on every case intro (§2.4). Measuring the card directly would feed
// the scene a rect that moves for 280 ms, and in `compact` — where placements
// are derived from the reserve — the objects would drift with it. The stack's
// own box is static, and it encloses both.
function reserves() {
  if (els.hud.hidden) return [];
  const list = [];
  for (const el of [els.banner, els.bottomStack, els.dots, els.back, els.sound]) {
    if (!el || el.hidden) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) list.push(r);
  }
  return list;
}

// ---------------------------------------------------------------------------
// the play field
// ---------------------------------------------------------------------------

const playfield = createPlayfield({
  mount: els.stage,
  config,
  voice,
  sfx,
  ctx: {
    timeScale: () => state.timeScale,
    seed: () => state.seed,
    screen: () => state.screen,
    reserves,
    traySlot: (i) => traySlots[i] || null,
    yesKey: () => yesDeck.next(),
  },
  on: {
    reflow(payload, layout) {
      lastReflow = payload;
      const wasCompact = els.app.classList.contains('compact');
      const isCompact = layout === 'compact';
      state.layout = layout;
      if (wasCompact !== isCompact) {
        els.app.classList.toggle('compact', isCompact);
        // The HUD stack moves in compact, so the reserve rects changed under
        // the scene. One extra reflow settles it; the layout hint is derived
        // from the viewport, not the HUD, so this can never ping-pong.
        requestAnimationFrame(() => playfield.reflow());
      }
    },
    found(word, slot) {
      fillTraySlot(slot, word);
      armIdle();
    },
    wrong() {
      // §3.6 — after three non-rhyme taps the idle tier comes early.
      armIdle(playfield.wrongTaps >= 3);
    },
    complete(lastFound, all) {
      showCelebration(lastFound, all);
    },
  },
});

// ---------------------------------------------------------------------------
// HUD rendering
// ---------------------------------------------------------------------------

function currentCase() {
  return state.caseIndex >= 0 ? cases[state.caseIndex] : null;
}

function labelsOn() {
  return !state.modeDef || state.modeDef.labels !== false;
}

function renderDots(container, filled) {
  if (!container) return;
  const total = Number(tuning.dotCount) || cases.length;
  if (container.childElementCount !== total) {
    container.replaceChildren();
    for (let i = 0; i < total; i += 1) {
      const dot = document.createElement('i');
      dot.className = 'dot';
      container.appendChild(dot);
    }
  }
  [...container.children].forEach((dot, i) => {
    dot.classList.toggle('filled', i < filled);
  });
}

function fillDot(container, index) {
  if (!container || !container.children[index]) return;
  const dot = container.children[index];
  dot.classList.add('filled');
  dot.classList.add('pop');
}

function buildTray() {
  els.tray.replaceChildren();
  traySlots.length = 0;
  const total = (cases[0] && cases[0].rhymes.length) || 3;
  for (let i = 0; i < total; i += 1) {
    const slot = document.createElement('span');
    slot.className = 'slot';
    els.tray.appendChild(slot);
    traySlots.push(slot);
  }
}

function resetTray() {
  for (const slot of traySlots) {
    slot.replaceChildren();
    slot.classList.remove('filled', 'pop');
  }
}

function fillTraySlot(index, word) {
  const slot = traySlots[index];
  if (!slot) return;
  slot.replaceChildren(spriteImg(word, 'slot-sprite'));
  slot.classList.add('filled');
  slot.classList.remove('pop');
  void slot.offsetWidth;
  slot.classList.add('pop');
}

function renderBanner(caseDef) {
  els.banner.replaceChildren();
  const lead = document.createElement('span');
  lead.textContent = 'Find a word that rhymes with ';
  els.banner.appendChild(lead);
  if (labelsOn()) {
    const word = document.createElement('b');
    word.className = 'banner-word';
    word.textContent = caseDef.target;
    els.banner.appendChild(word);
  } else {
    const glyph = soundGlyph(44);
    glyph.classList.add('banner-glyph');
    els.banner.appendChild(glyph);
  }
}

function renderWordCard(caseDef) {
  els.card.replaceChildren();
  if (labelsOn()) {
    const word = document.createElement('span');
    word.className = 'card-word';
    word.textContent = caseDef.target;
    els.card.appendChild(word);
  } else {
    const img = document.createElement('img');
    img.className = 'card-glyph-img';
    img.alt = '';
    img.src = 'assets/props/magnifier.webp';
    img.addEventListener('error', () => {
      const glyph = soundGlyph(88);
      glyph.classList.add('card-glyph');
      img.replaceWith(glyph);
    });
    els.card.appendChild(img);
  }
  els.card.setAttribute('aria-label', 'Hear the word again');
}

function renderHudForCase(caseDef) {
  renderBanner(caseDef);
  renderWordCard(caseDef);
  resetTray();
  renderDots(els.dots, state.caseIndex);
  renderDots(els.celebrationDots, state.caseIndex);
  els.card.classList.remove('in');
}

function resetHud() {
  resetTray();
  els.banner.replaceChildren();
  els.card.replaceChildren();
  renderDots(els.dots, 0);
}

// ---------------------------------------------------------------------------
// screens (§2.1)
// ---------------------------------------------------------------------------

function setScreen(name) {
  state.screen = name;
  els.app.dataset.screen = name;
  els.splash.hidden = name !== 'splash';
  els.celebration.hidden = name !== 'celebration';
  els.end.hidden = name !== 'end';
  els.hud.hidden = name === 'splash' || name === 'end';
  els.hud.classList.toggle('stage-intro', name === 'case-intro');
  els.hud.classList.toggle('stage-play', name === 'play' || name === 'celebration');
  playfield.reflow();
}

// §2.8 — one teardown, used by the back button on every screen and by home().
function goSplash() {
  voice.stop();
  try { speech.stop(); } catch { /* ignore */ }
  state.introToken += 1;
  clearAllTimers();
  playfield.clearCase();
  playfield.setEnabled(true);
  state.mode = null;
  state.modeDef = null;
  state.caseIndex = -1;
  els.celebration.classList.remove('show');
  els.dim.classList.remove('on');
  resetHud();
  setScreen('splash');
}

async function startMode(id) {
  await ready;
  const next = modes.find((m) => m.id === id);
  if (!next) return false;
  voice.stop();
  clearAllTimers();
  state.mode = next.id;
  state.modeDef = next;
  state.welcomeSpoken = true;   // a greeting the child has walked past is noise
  sfx.tick();
  voice.say(next.intro);
  await startCase(0);
  return true;
}

// §2.4 CASE-INTRO
async function startCase(index) {
  const token = ++state.introToken;
  clearAllTimers();
  state.caseIndex = index;
  const caseDef = cases[index];
  if (!caseDef) return false;

  renderHudForCase(caseDef);
  setScreen('case-intro');
  els.dim.classList.add('on');
  playfield.setEnabled(true);

  await playfield.loadCase(caseDef, state.modeDef);
  if (token !== state.introToken) return false;

  // t = 180 ms — the target word card slides up into its HUD slot (§2.4).
  // Its reserve rect only settles when that transition ends, so re-measure
  // once afterwards; the target sprite is placed against it.
  beat(180, () => els.card.classList.add('in'));
  beat(520, () => playfield.reflow());
  await wait(260);
  if (token !== state.introToken) return false;

  // The prompt is a composed stem + shared word clip (§3.4). We race it against
  // a bound so a missing/blocked clip can never strand the child on the intro.
  const spoken = speakCasePrompt();
  await Promise.race([spoken, wait(2600)]);
  if (token !== state.introToken) return false;
  await wait(Number(tuning.caseIntroTailMs) || 350);
  if (token !== state.introToken) return false;
  enterPlay();
  return true;
}

function enterPlay() {
  if (state.screen !== 'case-intro') return;
  state.introToken += 1;
  setScreen('play');
  els.dim.classList.remove('on');
  if (!state.sweptThisSession) {
    state.sweptThisSession = true;
    beat(200, () => playfield.pulseSweep());
  }
  armIdle();
}

// §3.4 — the case prompt, in both modes.
function speakCasePrompt() {
  const caseDef = currentCase();
  if (!caseDef) return Promise.resolve();
  const key = voice.keyForWord(caseDef.target);
  const gap = Number(tuning.clipGapMs) || 120;
  const steps = labelsOn()
    ? ['case-stem', { key, gap }]
    : ['sound-listen', { key, gap }, { key, gap: 400 }];
  return voice.seq(steps, state.timeScale);
}

function speakSoundButton() {
  const caseDef = currentCase();
  if (!caseDef) return Promise.resolve();
  if (labelsOn()) return speakCasePrompt();
  const key = voice.keyForWord(caseDef.target);
  const gap = Number(tuning.clipGapMs) || 120;
  return voice.seq(['sound-again', { key, gap }, { key, gap: 400 }], state.timeScale);
}

// ---------------------------------------------------------------------------
// idle ladder (§3.6)
// ---------------------------------------------------------------------------

let idleTier = 0;

function armIdle(early = false) {
  clearTimer('idle');
  if (state.screen !== 'play' || document.hidden) return;
  idleTier = 0;
  // "fires immediately on the next settle" — the wrong sequence settles at
  // ~1.6 s, so an early tier lands after it rather than on top of no-N.
  const first = early ? 1600 : (Number(tuning.idleMs) || 8000);
  timers.idle = timerGroup.after(first, runIdleTier);
}

function runIdleTier() {
  timers.idle = null;
  if (state.screen !== 'play') return;
  const tier = idleTier;
  idleTier += 1;
  const idleMs = Number(tuning.idleMs) || 8000;
  const hintMs = Number(tuning.hintMs) || 18000;
  const repromptMs = Number(tuning.repromptMs) || 30000;
  const repeatMs = Number(tuning.idleRepeatMs) || 15000;
  let next = repeatMs;
  if (tier === 0) {
    voice.say(idleDeck.next());
    playfield.pulseSweep();
    next = Math.max(1000, hintMs - idleMs);
  } else if (tier === 1) {
    voice.say('hint-look');
    playfield.pulseSweep();
    next = Math.max(1000, repromptMs - hintMs);
  } else if (tier === 2) {
    speakCasePrompt();
  } else if (tier % 2 === 1) {
    playfield.pulseSweep();
    voice.say(idleDeck.next());
  } else {
    speakCasePrompt();
  }
  timers.idle = timerGroup.after(next, runIdleTier);
}

// ---------------------------------------------------------------------------
// CELEBRATION (§2.6, §9.5)
// ---------------------------------------------------------------------------

function fillConfetti() {
  els.confetti.replaceChildren();
  if (playfield.scene.reducedMotion) {
    for (let i = 0; i < 12; i += 1) {
      const dot = document.createElement('i');
      dot.className = 'static';
      dot.style.left = `${(i * 41 + state.seed * 7) % 96 + 2}%`;
      dot.style.top = `${(i * 29 + state.seed * 3) % 70 + 8}%`;
      els.confetti.appendChild(dot);
    }
    return;
  }
  const colors = ['#d94d62', '#405aa5', '#f4cc54', '#75a93c', '#ee8b38', '#7b4fa0'];
  for (let i = 0; i < 34; i += 1) {
    const bit = document.createElement('i');
    bit.style.left = `${(i * 37 + state.seed * 11) % 100}%`;
    bit.style.setProperty('--c', colors[i % colors.length]);
    bit.style.setProperty('--d', `${2.2 + (i % 6) * 0.4}s`);
    bit.style.setProperty('--delay', `${-(i % 9) * 0.28}s`);
    bit.style.setProperty('--sway', `${18 + (i % 4) * 12}px`);
    els.confetti.appendChild(bit);
  }
}

function pairBubble(el, word) {
  el.replaceChildren();
  const span = document.createElement('span');
  span.textContent = word;
  el.appendChild(span);
  el.classList.add('in');
}

function liftFinds(found) {
  els.finds.replaceChildren();
  const reveal = state.modeDef && state.modeDef.revealAtCelebration;
  found.forEach((word, i) => {
    const cell = document.createElement('span');
    cell.className = 'find';
    cell.appendChild(spriteImg(word, 'find-sprite'));
    if (reveal) {
      const label = document.createElement('b');
      label.className = 'find-label';
      label.textContent = word;
      label.style.animationDelay = `calc(${140 * i}ms * var(--ts, 1))`;
      cell.appendChild(label);
    }
    cell.style.animationDelay = `calc(${60 * i}ms * var(--ts, 1))`;
    els.finds.appendChild(cell);
  });
  els.finds.classList.add('in');
}

function showCelebration(lastFound, found) {
  const caseDef = currentCase();
  if (!caseDef) return;
  clearAllTimers();
  playfield.setEnabled(false);
  setScreen('celebration');

  for (const el of [els.greatJob, els.ribbon, els.pairLeft, els.pairRight, els.pairPlus,
    els.catCheer, els.batCheer, els.finds, els.next]) {
    el.classList.remove('in');
  }
  els.finds.replaceChildren();
  els.pairLeft.replaceChildren();
  els.pairRight.replaceChildren();
  requestAnimationFrame(() => els.celebration.classList.add('show'));

  beat(120, fillConfetti);
  beat(200, () => {
    sfx.tada();
    els.greatJob.classList.add('in');
    // §3.4 chain — great-job -> target -> last found -> they-rhyme -> case-closed.
    // Voice runs on its own gaps; the visuals run on the §9.5 clock.
    voice.seq([
      'great-job',
      { key: voice.keyForWord(caseDef.target), gap: 260 },
      { key: voice.keyForWord(lastFound), gap: 200 },
      { key: 'they-rhyme', gap: 200 },
      { key: 'case-closed', gap: 300 },
    ], state.timeScale);
  });
  beat(700, () => pairBubble(els.pairLeft, caseDef.target));
  beat(900, () => els.pairPlus.classList.add('in'));
  beat(980, () => pairBubble(els.pairRight, lastFound));
  beat(1300, () => els.ribbon.classList.add('in'));
  beat(1500, () => {
    els.catCheer.classList.add('in');
    beat(90, () => els.batCheer.classList.add('in'));
  });
  beat(1750, () => liftFinds(found));
  beat(2000, () => {
    fillDot(els.dots, state.caseIndex);
    fillDot(els.celebrationDots, state.caseIndex);
  });
  beat(2300, () => els.next.classList.add('in'));

  clearTimer('auto');
  timers.auto = timerGroup.after(Number(tuning.celebrationAutoAdvanceMs) || 12000, () => {
    timers.auto = null;
    void nextCase();
  });
}

async function nextCase() {
  if (state.screen !== 'celebration') return false;
  clearAllTimers();
  voice.say('next-case');
  els.celebration.classList.remove('show');
  await wait(260);
  if (state.screen !== 'celebration') return false;   // back was pressed mid-fade
  if (state.caseIndex + 1 < cases.length) {
    await startCase(state.caseIndex + 1);
    return true;
  }
  showEnd();
  return true;
}

// ---------------------------------------------------------------------------
// END (§2.7)
// ---------------------------------------------------------------------------

function showEnd() {
  clearAllTimers();
  playfield.clearCase();
  els.endRow.replaceChildren();
  cases.forEach((caseDef, i) => {
    const cell = document.createElement('span');
    cell.className = 'end-cell';
    cell.style.animationDelay = `calc(${120 * i}ms * var(--ts, 1))`;
    cell.appendChild(spriteImg(caseDef.target, 'end-sprite'));
    const label = document.createElement('b');
    label.className = 'end-label';
    label.textContent = caseDef.target;
    cell.appendChild(label);
    els.endRow.appendChild(cell);
  });
  renderDots(els.endDots, cases.length);
  setScreen('end');
  voice.seq(['end', { key: 'end-tip', gap: 500 }], state.timeScale);
}

// ---------------------------------------------------------------------------
// controls — every one through tap.js (§2.8, §9.1)
// ---------------------------------------------------------------------------

function unlockAudio() {
  sfx.unlock();
  try { speech.unlock(); } catch { /* ignore */ }
  voice.unlock();
}

function press(el, action) {
  if (!el) return;
  onTap(el, (ev) => action(ev), {
    feedback: () => { unlockAudio(); sfx.pop(); },
  });
}

// §3.1 — unlock on EVERY gesture, not just the first.
window.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
// Calling unlockAudio() on every gesture still isn't enough on its own: the
// channels it fans out to (voice-clips.js, speech.js) each latch "unlocked"
// permanently once true, so a call after an iPadOS app-switch can be a no-op
// even though the OS actually revoked the permission it represents.
// installUnlockOnGesture's own latch resets on visibilitychange/pageshow and
// resumes a paused speechSynthesis — the one recovery step this game's
// backgrounding handler (below) didn't have.
installUnlockOnGesture({ extra: [unlockAudio] });

// §3.6 — any pointerdown restarts the idle ladder from zero; a pointerdown
// during the case-intro is the escape hatch into play.
window.addEventListener('pointerdown', () => {
  if (state.screen === 'case-intro') enterPlay();
  else if (state.screen === 'play') armIdle();
}, { capture: true, passive: true });

press(els.splashHome, () => { window.location.href = '../../'; });

press(els.play, () => {
  if (!state.modeRowOpen) {
    state.modeRowOpen = true;
    els.modeRow.hidden = false;
    requestAnimationFrame(() => els.modeRow.classList.add('show'));
  }
  if (!state.welcomeSpoken) {
    state.welcomeSpoken = true;
    voice.say('welcome');
  }
});

const splashSound = debounced(Number(tuning.soundDebounceMs) || 600, () => {
  state.welcomeSpoken = true;
  voice.say('welcome');
});
press(els.splashSound, splashSound);

press(els.back, goSplash);
press(els.celebrationBack, goSplash);
press(els.endBack, goSplash);

const hudSound = debounced(Number(tuning.soundDebounceMs) || 600, () => { void speakSoundButton(); });
press(els.sound, hudSound);

press(els.card, () => {
  const caseDef = currentCase();
  if (caseDef) voice.sayWord(caseDef.target);
});

press(els.next, () => { void nextCase(); });

press(els.again, () => {
  voice.say('again');
  goSplash();
});

// §2.3 — the mode row, built from config so listModes() and the tiles agree.
function buildModeRow() {
  renderModeCards({
    host: els.modeRow,
    modes,
    skin: false, // .mode-tile keeps its own pixel-for-pixel look; only the
                 // shared .qk-mode-card touch-floor contract is added (a
                 // no-op — .mode-tile's own size already clears it).
    cardClass: (mode) => `mode-tile mode-${mode.id}`,
    showTitle: false, // decorate() builds .tile-face + .tile-label itself
    decorate(tile, mode) {
      const face = document.createElement('span');
      face.className = 'tile-face';
      if (mode.id === 'sound-detective') {
        face.appendChild(soundGlyph(0));
      } else {
        const img = document.createElement('img');
        img.className = 'tile-art';
        img.alt = '';
        img.src = 'assets/props/magnifier.webp';
        img.addEventListener('error', () => { img.hidden = true; });
        face.appendChild(img);
      }
      tile.appendChild(face);

      const label = document.createElement('span');
      label.className = 'tile-label';
      label.textContent = mode.title;
      tile.appendChild(label);
    },
    onPick: (id) => { void startMode(id); },
    feedback: () => { unlockAudio(); sfx.pop(); },
  });
}

// §2.8 — backgrounding: stop voice, pause every timer; re-arm from zero on return.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    voice.stop();
    clearTimer('idle');
    clearTimer('auto');
  } else if (state.screen === 'play') {
    armIdle();
  } else if (state.screen === 'celebration' && !timers.auto) {
    timers.auto = timerGroup.after(Number(tuning.celebrationAutoAdvanceMs) || 12000,
      () => { timers.auto = null; void nextCase(); });
  }
});

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

const ready = (async () => {
  buildTray();
  buildModeRow();
  renderDots(els.dots, 0);
  renderDots(els.celebrationDots, 0);
  renderDots(els.endDots, 0);
  document.documentElement.style.setProperty('--ts', '1');
  // §8.1 — the first frame must not render in the fallback face. This never
  // gates input: the splash is already mounted and tappable.
  try { await document.fonts.load('600 84px Fredoka'); } catch { /* fallback face is legible */ }
  setScreen('splash');
  await voice.init(config);
  return true;
})();

// ---------------------------------------------------------------------------
// window.QLOBE_DEBUG — v1 + the five declared extensions (§7)
// ---------------------------------------------------------------------------

function debugTap(id) {
  return playfield.handleTap(String(id));
}

async function winRound() {
  await ready;
  for (let i = 0; i < 20; i += 1) {
    if (state.screen === 'celebration') return true;
    const remaining = playfield.unfoundRhymes();
    if (!remaining.length) break;
    await debugTap(remaining[0]);
  }
  return state.screen === 'celebration';
}

installDebug({
  gameId: config.id,
  engine: 'rhyming-detective (game-local js/game.js + shared/js/hotspot-scene.js)',
  ready,

  listModes: () => modes.map(({ id, title }) => ({ id, title })),
  startMode,

  getState: () => ({
    screen: state.screen,
    mode: state.mode,
    caseIndex: state.caseIndex,
    casesTotal: cases.length,
    found: playfield.found,
    rhymesTotal: (currentCase() && currentCase().rhymes.length) || 3,
    awaitingInput: state.screen === 'play' && !playfield.busy,
    target: (currentCase() && currentCase().target) || null,
    wrongTaps: playfield.wrongTaps,
    reducedMotion: playfield.scene.reducedMotion,
    muted: state.muted,
    seedValue: state.seed,
    layout: state.layout,
  }),

  getTargets: () => (
    (state.screen === 'play' || state.screen === 'celebration') ? playfield.targets() : []
  ),

  tap: debugTap,
  winRound,

  // Our own, not the harness default: `state.muted` also gates the sfx facade
  // above (sfx.js has no gain export, so the mute happens at the call site).
  mute(value = true) {
    state.muted = Boolean(value);
    voice.setMuted(state.muted);
    if (state.muted) {
      try { speech.stop(); } catch { /* ignore */ }
      try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    }
    for (const audio of document.querySelectorAll('audio')) audio.muted = state.muted;
    return state.muted;
  },

  seed(value) {
    const n = Number(value);
    state.seed = Number.isFinite(n) ? Math.trunc(n) : 42;
    yesDeck = createDeck((config.voice && config.voice.decks && config.voice.decks.yes) || [], state.seed);
    idleDeck = createDeck((config.voice && config.voice.decks && config.voice.decks.idle) || [], state.seed);
    return state.seed;
  },

  fastTimers(scale = 0.05) {
    const n = Number(scale);
    state.timeScale = Math.min(1, Math.max(0.01, Number.isFinite(n) ? n : 0.05));
    document.documentElement.style.setProperty('--ts', String(state.timeScale));
    // timerGroup's convention is the inverse of state.timeScale's (higher =
    // faster there; lower = faster here) — see the const timerGroup comment.
    timerGroup.setScale(1 / state.timeScale);
    playfield.retuneTimers();
    return state.timeScale;
  },

  home: () => { goSplash(); },

  // ---- declared extensions ----
  getZones: () => playfield.zones(),

  getLayout: () => ({
    layout: state.layout,
    scale: lastReflow ? lastReflow.scale : playfield.scene.scale,
    offsetX: lastReflow ? lastReflow.offsetX : 0,
    offsetY: lastReflow ? lastReflow.offsetY : 0,
    visibleArt: playfield.scene.visibleArt(),
    reserves: reserves().map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height })),
  }),

  getAudioLog: voice.getAudioLog,
  clearAudioLog: voice.clearAudioLog,
  nextCase,
});
