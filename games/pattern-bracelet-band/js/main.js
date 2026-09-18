import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as bgm from '../../../shared/js/bgm.js';
import { onTap } from '../../../shared/js/tap.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';
import { createScreens } from '../../../shared/js/screens.js';
import { progressDots } from '../../../shared/js/hud.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createTimers } from '../../../shared/js/timers.js';
import { shuffle } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';

const $ = (selector) => document.querySelector(selector);
const root = $('#game');
const els = {
  splash: $('#splash'), cards: $('#mode-cards'), splashSound: $('#splash-sound'),
  play: $('#play'), back: $('#back'), sound: $('#sound'), progress: $('#progress'),
  prompt: $('#prompt'), promptText: $('#prompt-text'), board: $('#board'),
  boardStar: $('#board-star'), slots: $('#slots'), playhead: $('#playhead'), tray: $('#tray'),
  playButton: $('#play-button'), slower: $('#slower'), faster: $('#faster'), clear: $('#clear'),
  save: $('#save'), tempo: $('#tempo-readout'), tempoValue: $('#tempo-value'), jewelryBox: $('#jewelry-box'),
  saveSlots: $('#save-slots'), concert: $('#concert'), concertBack: $('#concert-back'),
  concertSlots: $('#concert-slots'), concertPlayhead: $('#concert-playhead'),
  replay: $('#replay'), makeAnother: $('#make-another'),
};

const SLOT_COUNT = 8;
const BEAD_KEYS = Object.keys(config.beads);
const BPM_MIN = 72;
const BPM_MAX = 168;
const BPM_STEP = 18;
const DEFAULT_BPM = 108;
const STORAGE_KEY = 'qlo.be/pattern-bracelet-band/jewelry-v1';
const LEGACY_STORAGE_KEY = 'qlo.be/pattern-bracelet-band/jams';
const timers = createTimers();
const pageDisposers = [];
let slotDisposers = [];
let saveDisposers = [];
let audioContext = null;
let audioMaster = null;
let sequenceToken = 0;

const emptySlots = () => Array(SLOT_COUNT).fill(null);

function validSequence(value) {
  if (!Array.isArray(value)) return null;
  const next = value.slice(0, SLOT_COUNT).map((key) => (BEAD_KEYS.includes(key) ? key : null));
  while (next.length < SLOT_COUNT) next.push(null);
  return next;
}

function loadLibrary() {
  const blank = { version: 1, slots: Array(4).fill(null), current: emptySlots() };
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (parsed && Array.isArray(parsed.slots)) {
      blank.slots = Array.from({ length: 4 }, (_, index) => validSequence(parsed.slots[index]));
      blank.current = validSequence(parsed.current) || emptySlots();
      return blank;
    }
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || 'null');
    const legacySequence = validSequence(legacy);
    if (legacySequence) {
      blank.current = [...legacySequence];
      if (legacySequence.some(Boolean)) blank.slots[0] = [...legacySequence];
    }
  } catch {
    // Corrupt child-local state should behave like a fresh jewelry box.
  }
  return blank;
}

const state = {
  mode: null, roundIndex: 0, rounds: [], sequence: emptySlots(), boardSlots: emptySlots(),
  missing: [], nextMissing: 0, selected: null, bpm: DEFAULT_BPM, playing: false,
  awaitingPlay: false, wrongAttempts: 0, saving: false, library: loadLibrary(),
  concertSequence: emptySlots(), seed: null, rng: Math.random, muted: false, firstGesture: false,
};

function persistLibrary() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.library)); }
  catch { /* Storage pressure must never stop the instrument. */ }
}

function modeById(id) {
  const alias = id === 'guided' ? 'pop' : (id === 'free' ? 'jam' : id);
  return config.modes.find((mode) => mode.id === alias) || null;
}

function beadImage(key, className = '') {
  const img = document.createElement('img');
  const bead = config.beads[key];
  img.src = bead.art;
  img.alt = `${bead.label} bead, ${bead.cue}`;
  if (className) img.className = className;
  img.draggable = false;
  return img;
}

function say(key) { return bgm.duckDuring(voice.say(key, config.voice[key] || '')); }
function setPrompt(text) { els.promptText.textContent = text; }
function hasMusic(sequence = state.boardSlots) { return sequence.some(Boolean); }

function currentExpected() {
  if (!state.mode || state.mode.free || state.nextMissing >= state.missing.length) return null;
  return state.sequence[state.missing[state.nextMissing]] || null;
}

function currentTargetSlot() {
  if (!state.mode || state.mode.free || state.nextMissing >= state.missing.length) return -1;
  return state.missing[state.nextMissing];
}

function setMuted(on = true) {
  state.muted = Boolean(on);
  voice.setMuted(state.muted);
  sfx.setMuted(state.muted);
  bgm.setMuted(state.muted);
  if (audioMaster) audioMaster.gain.value = state.muted ? 0 : 0.42;
  return state.muted;
}

function ensureAudio() {
  try {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      audioContext = new AudioContextClass();
      audioMaster = audioContext.createGain();
      audioMaster.gain.value = state.muted ? 0 : 0.42;
      audioMaster.connect(audioContext.destination);
    }
    if (audioContext.state !== 'running') audioContext.resume().catch(() => {});
  } catch { return null; }
  return audioContext;
}

function tone({ type = 'sine', start, end = start, duration = 0.26, gain = 0.18, delay = 0 }) {
  const ctx = ensureAudio();
  if (!ctx || !audioMaster || state.muted) return;
  const at = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(Math.max(1, start), at);
  if (end !== start) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, end), at + duration);
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.018, duration * 0.2));
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(envelope);
  envelope.connect(audioMaster);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.04);
}

function playBeadSound(key) {
  const hz = Number(config.beads[key]?.hz) || 330;
  if (!ensureAudio()) { sfx.pop(); return; }
  switch (key) {
    case 'red':
      tone({ type: 'sine', start: 135, end: 56, duration: 0.3, gain: 0.34 });
      tone({ type: 'triangle', start: 82, end: 62, duration: 0.18, gain: 0.12, delay: 0.015 });
      break;
    case 'yellow':
      tone({ start: hz, duration: 0.58, gain: 0.18 });
      tone({ start: hz * 2.01, duration: 0.42, gain: 0.1 });
      tone({ start: hz * 3.02, duration: 0.28, gain: 0.055 });
      break;
    case 'blue':
      tone({ type: 'triangle', start: hz * 1.04, end: hz, duration: 0.27, gain: 0.22 });
      tone({ start: hz * 2, duration: 0.13, gain: 0.06 });
      break;
    case 'purple':
      tone({ start: hz, duration: 0.7, gain: 0.15 });
      tone({ start: hz * 2.4, duration: 0.52, gain: 0.08 });
      tone({ start: hz * 3.8, duration: 0.38, gain: 0.04 });
      break;
    case 'teal':
      tone({ type: 'triangle', start: hz * 1.08, end: hz * 0.96, duration: 0.24, gain: 0.2 });
      tone({ start: hz * 2, duration: 0.12, gain: 0.05, delay: 0.01 });
      break;
    case 'coral':
      tone({ type: 'square', start: hz * 1.1, end: hz * 0.88, duration: 0.1, gain: 0.11 });
      tone({ type: 'triangle', start: hz * 1.62, duration: 0.075, gain: 0.08, delay: 0.035 });
      break;
    default: tone({ start: hz, duration: 0.24, gain: 0.17 });
  }
}

function positionOnRing(node, index, count, radius = 36) {
  const angle = (-90 + (360 / count) * index) * Math.PI / 180;
  node.style.left = `${50 + Math.cos(angle) * radius}%`;
  node.style.top = `${50 + Math.sin(angle) * radius}%`;
}

function renderModeCards() {
  els.cards.replaceChildren();
  for (const mode of config.modes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mode-card';
    button.dataset.target = `mode-${mode.id}`;
    button.dataset.role = 'neutral';
    button.setAttribute('aria-label', `${mode.spokenTitle}. ${mode.skill}`);
    const plaque = document.createElement('img');
    plaque.className = 'plaque-art';
    plaque.src = config.art.modePlaque;
    plaque.alt = '';
    plaque.setAttribute('aria-hidden', 'true');
    const content = document.createElement('span');
    content.className = 'mode-card-content';
    const preview = document.createElement('span');
    preview.className = 'mode-preview';
    const cord = document.createElement('img');
    cord.className = 'preview-cord';
    cord.src = config.art.cord;
    cord.alt = '';
    cord.setAttribute('aria-hidden', 'true');
    preview.append(cord);
    const sample = mode.patterns?.[0]?.sequence || ['red', 'yellow', 'blue', 'purple', 'teal', 'coral'];
    sample.forEach((key, index) => {
      const img = beadImage(key, 'preview-bead');
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      positionOnRing(img, index, sample.length, 35);
      preview.append(img);
    });
    const labels = document.createElement('span');
    labels.className = 'mode-labels';
    const title = document.createElement('span');
    title.className = 'mode-title';
    title.textContent = mode.title;
    const skill = document.createElement('span');
    skill.className = 'mode-skill';
    skill.textContent = mode.free ? 'Make your own bracelet song' : (mode.id === 'pop' ? 'A B · A B · A B' : 'A B C · A B C');
    labels.append(title, skill);
    content.append(preview, labels);
    button.append(plaque, content);
    els.cards.append(button);
    pageDisposers.push(onTap(button, () => startMode(mode.id), { feedback: () => sfx.tick() }));
  }
}

function slotRole(index) {
  if (!state.mode || state.mode.free) return 'neutral';
  return index === currentTargetSlot() ? 'correct' : 'neutral';
}

function renderSlots(host, sequence, { interactive = false, prefix = 'slot' } = {}) {
  if (interactive && host === els.slots) {
    slotDisposers.splice(0).forEach((dispose) => dispose());
  }
  host.replaceChildren();
  sequence.forEach((key, index) => {
    const slot = document.createElement(interactive ? 'button' : 'span');
    if (interactive) slot.type = 'button';
    slot.className = `bead-slot${key ? ' is-filled' : ''}`;
    slot.dataset.slot = String(index);
    if (interactive) {
      slot.dataset.target = `${prefix}-${index}`;
      slot.dataset.role = slotRole(index);
    }
    slot.setAttribute('aria-label', key
      ? `Step ${index + 1}: ${config.beads[key].label} ${config.beads[key].cue} bead`
      : `Step ${index + 1}: empty`);
    positionOnRing(slot, index, SLOT_COUNT, 35);
    if (key) {
      slot.append(beadImage(key, 'slot-bead-art'));
    } else {
      const well = document.createElement('img');
      well.className = 'slot-well-art';
      well.src = config.art.surfaces.slotWell;
      well.alt = '';
      well.setAttribute('aria-hidden', 'true');
      slot.append(well);
    }
    if (interactive && index === currentTargetSlot()) {
      slot.classList.add('is-next');
      const cue = document.createElement('img');
      cue.className = 'slot-cue';
      cue.src = config.art.star;
      cue.alt = '';
      cue.setAttribute('aria-hidden', 'true');
      slot.append(cue);
    }
    if (interactive) slotDisposers.push(onTap(slot, () => handleSlotTap(index), { feedback: () => sfx.tick() }));
    host.append(slot);
  });
}

function renderBoard() {
  renderSlots(els.slots, state.boardSlots, { interactive: true });
  els.boardStar.hidden = !state.awaitingPlay;
  updateControls();
  updateTargetRoles();
}

function renderConcertBoard() { renderSlots(els.concertSlots, state.concertSequence); }

function renderTray() {
  els.tray.replaceChildren();
  for (const key of BEAD_KEYS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tray-bead${state.selected === key ? ' is-selected' : ''}`;
    button.dataset.bead = key;
    button.dataset.target = `bead-${key}`;
    button.dataset.role = !state.mode || state.mode.free ? 'neutral' : (key === currentExpected() ? 'correct' : 'wrong');
    button.setAttribute('aria-label', `${config.beads[key].label} bead, ${config.beads[key].cue}, ${config.beads[key].sound} sound`);
    button.append(beadImage(key));
    button.addEventListener('pointerdown', (event) => dragController.begin(event, key));
    button.addEventListener('click', (event) => { if (event.detail === 0) handleBeadTap(key); });
    els.tray.append(button);
  }
}

function updateTargetRoles() {
  els.tray.querySelectorAll('[data-bead]').forEach((button) => {
    button.dataset.role = !state.mode || state.mode.free ? 'neutral' : (button.dataset.bead === currentExpected() ? 'correct' : 'wrong');
  });
  els.slots.querySelectorAll('[data-slot]').forEach((slot) => {
    slot.dataset.role = slotRole(Number(slot.dataset.slot));
    slot.classList.toggle('is-next', Number(slot.dataset.slot) === currentTargetSlot());
  });
}

function renderProgress() {
  els.progress.replaceChildren();
  if (state.mode && !state.mode.free) els.progress.append(progressDots(state.rounds.length, state.roundIndex));
}

function renderSaveSlots() {
  saveDisposers.splice(0).forEach((dispose) => dispose());
  els.saveSlots.replaceChildren();
  els.jewelryBox.classList.toggle('is-saving', state.saving);
  state.library.slots.forEach((sequence, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `save-slot${sequence ? '' : ' is-empty'}${state.saving ? ' is-saving' : ''}`;
    button.dataset.target = `save-${index}`;
    button.dataset.role = 'neutral';
    button.setAttribute('aria-label', sequence ? `Jewelry box spot ${index + 1}, saved bracelet` : `Jewelry box spot ${index + 1}, empty`);
    if (sequence) {
      const preview = document.createElement('span');
      preview.className = 'save-preview';
      sequence.forEach((key) => {
        if (!key) return;
        const img = beadImage(key);
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        preview.append(img);
      });
      button.append(preview);
    } else {
      const empty = document.createElement('img');
      empty.className = 'empty-jewel';
      empty.src = config.art.star;
      empty.alt = '';
      empty.setAttribute('aria-hidden', 'true');
      button.append(empty);
    }
    els.saveSlots.append(button);
    saveDisposers.push(onTap(button, () => handleSaveSlot(index), { feedback: () => sfx.tick() }));
  });
}

function updateControls() {
  const free = Boolean(state.mode?.free);
  for (const control of [els.slower, els.faster, els.clear, els.save]) control.hidden = !free;
  els.tempo.hidden = !free;
  els.jewelryBox.hidden = !free;
  els.tempoValue.textContent = `${state.bpm} BPM`;
  els.playButton.disabled = state.playing || !hasMusic();
  els.playButton.classList.toggle('is-ready', state.awaitingPlay && !state.playing);
  els.playButton.dataset.role = state.awaitingPlay ? 'correct' : 'neutral';
  els.save.classList.toggle('is-ready', state.saving);
  if (free) renderSaveSlots();
}

function saveCurrentAsDraft() {
  if (!state.mode?.free) return;
  state.library.current = [...state.boardSlots];
  persistLibrary();
}

function selectJamBead(key) {
  if (state.playing) return false;
  state.selected = state.selected === key ? null : key;
  renderTray();
  if (state.selected) say(`color-${key}`);
  nudger.poke();
  return true;
}

function animateWrong(index = currentTargetSlot()) {
  const slot = els.slots.querySelector(`[data-slot="${index}"]`) || els.slots.querySelector(`[data-slot="${currentTargetSlot()}"]`);
  if (!slot) return;
  slot.classList.remove('is-wrong');
  void slot.offsetWidth;
  slot.classList.add('is-wrong');
  timers.after(480, () => slot.classList.remove('is-wrong'));
}

async function handleWrong(index) {
  state.wrongAttempts += 1;
  animateWrong(index);
  sfx.unpop();
  if (state.wrongAttempts >= 2) {
    await say('hint');
    if (screens.is('play') && !state.playing) await playSequence(state.sequence, { model: true });
    state.wrongAttempts = 0;
  } else await say('nudge');
  nudger.poke();
  return false;
}

async function attemptPlacement(key, index) {
  if (!state.mode || state.playing || !BEAD_KEYS.includes(key)) return false;
  const slotIndex = Number(index);
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= SLOT_COUNT) return false;
  if (!state.mode.free) {
    const target = currentTargetSlot();
    if (target < 0 || slotIndex !== target || key !== currentExpected()) return handleWrong(slotIndex);
    state.boardSlots[target] = key;
    state.nextMissing += 1;
    state.wrongAttempts = 0;
    state.awaitingPlay = state.nextMissing >= state.missing.length;
    playBeadSound(key);
    sfx.pop();
    renderBoard();
    renderTray();
    if (state.awaitingPlay) {
      setPrompt('Your bracelet is ready. Press Play!');
      await say('ready-play');
    } else setPrompt('What comes next?');
    nudger.poke();
    return true;
  }
  state.boardSlots[slotIndex] = key;
  state.selected = null;
  state.saving = false;
  playBeadSound(key);
  sfx.pop();
  saveCurrentAsDraft();
  renderBoard();
  renderTray();
  setPrompt('Add more beads, leave a rest, or press Play!');
  nudger.poke();
  return true;
}

function handleBeadTap(key) {
  if (!state.mode || state.playing) return false;
  if (state.mode.free) return selectJamBead(key);
  const target = currentTargetSlot();
  if (target < 0) { say('ready-play'); return false; }
  return attemptPlacement(key, target);
}

function handleSlotTap(index) {
  if (!state.mode || state.playing) return false;
  const key = state.boardSlots[index];
  if (!state.mode.free) {
    if (key) { playBeadSound(key); return true; }
    say('prompt-choose');
    return false;
  }
  if (state.selected) return attemptPlacement(state.selected, index);
  if (key) {
    state.boardSlots[index] = null;
    sfx.unpop();
    saveCurrentAsDraft();
    renderBoard();
    renderTray();
    return true;
  }
  say('prompt-place');
  return false;
}

const dragController = createDragToSlotDom({
  getPiece: (key) => {
    const el = els.tray.querySelector(`[data-bead="${key}"]`);
    return el ? { el, key } : null;
  },
  root: els.board,
  slotSelector: '#slots [data-slot]',
  slotPad: 34,
  hoverClass: 'is-drag-over',
  canStart: () => screens.is('play') && Boolean(state.mode) && !state.playing,
  makeGhost: (piece) => beadImage(piece.key, 'bead-drag-ghost'),
  onGrab: (piece) => { piece.el.classList.add('is-dragging'); nudger.poke(); return true; },
  onTap: (piece) => handleBeadTap(piece.key),
  onDrop: async (piece, drag) => {
    piece.el.classList.remove('is-dragging');
    if (!drag.slot) { sfx.unpop(); return; }
    await attemptPlacement(piece.key, Number(drag.slot.dataset.slot));
  },
  onCancel: (piece) => piece.el.classList.remove('is-dragging'),
});

function cancelPerformance() {
  sequenceToken += 1;
  timers.clearAll();
  dragController.cancel();
  state.playing = false;
  els.playhead.classList.remove('is-playing');
  els.concertPlayhead.classList.remove('is-playing');
  document.querySelectorAll('.bead-slot.is-hit').forEach((slot) => slot.classList.remove('is-hit'));
  updateControls();
}

const screens = createScreens({
  root, initial: 'splash', voice,
  onExit: (name) => {
    if (name === 'play' || name === 'concert') cancelPerformance();
    if (name === 'play') nudger.stop();
  },
});

async function playSequence(sequence, { host = els.slots, playhead = els.playhead, model = false } = {}) {
  if (state.playing || !Array.isArray(sequence)) return false;
  const token = ++sequenceToken;
  state.playing = true;
  updateControls();
  playhead.classList.add('is-playing');
  const stepMs = Math.round((60000 / state.bpm) * 0.72);
  for (let index = 0; index < SLOT_COUNT; index += 1) {
    if (token !== sequenceToken) return false;
    const slot = host.querySelector(`[data-slot="${index}"]`);
    slot?.classList.add('is-hit');
    const key = sequence[index];
    if (key) playBeadSound(key);
    await timers.wait(stepMs);
    slot?.classList.remove('is-hit');
    if (model && !key) sfx.tick();
  }
  if (token !== sequenceToken) return false;
  playhead.classList.remove('is-playing');
  state.playing = false;
  updateControls();
  return true;
}

function setupGuidedRound() {
  const pattern = state.rounds[state.roundIndex];
  state.sequence = [...pattern.sequence];
  state.missing = [...pattern.missing].sort((a, b) => a - b);
  state.nextMissing = 0;
  state.boardSlots = state.sequence.map((key, index) => (state.missing.includes(index) ? null : key));
  state.selected = null;
  state.awaitingPlay = false;
  state.wrongAttempts = 0;
  setPrompt('What comes next?');
  renderProgress(); renderBoard(); renderTray();
}

function setupJam() {
  state.sequence = emptySlots();
  state.boardSlots = validSequence(state.library.current) || emptySlots();
  state.missing = [];
  state.nextMissing = 0;
  state.selected = null;
  state.awaitingPlay = false;
  state.saving = false;
  state.wrongAttempts = 0;
  setPrompt('Tap a bead, then a spot. Gaps make rests!');
  renderProgress(); renderBoard(); renderTray();
}

async function startMode(id, { announce = true } = {}) {
  const mode = modeById(id);
  if (!mode) return false;
  return screens.start(async () => {
    cancelPerformance();
    state.mode = mode;
    state.roundIndex = 0;
    state.bpm = DEFAULT_BPM;
    state.saving = false;
    state.concertSequence = emptySlots();
    state.rounds = mode.free ? [] : shuffle(mode.patterns, state.rng).slice(0, mode.rounds);
    screens.show('play', { force: screens.is('play') });
    if (mode.free) setupJam(); else setupGuidedRound();
    nudger.arm();
    if (announce) await say(`intro-${mode.id}`);
    return true;
  }, { busy: false });
}

async function finishGuidedPlayback() {
  if (state.roundIndex + 1 < state.rounds.length) {
    burstConfetti({ host: els.play, count: 20, duration: 1500, rng: state.rng });
    sfx.sparkle();
    state.roundIndex += 1;
    setupGuidedRound();
    await say('next-round');
    nudger.arm();
    return true;
  }
  state.concertSequence = [...state.boardSlots];
  return showConcert();
}

async function handlePlay() {
  if (!state.mode || state.playing || !hasMusic()) {
    if (!hasMusic()) say('prompt-place');
    return false;
  }
  nudger.poke();
  if (!state.mode.free && !state.awaitingPlay) {
    await say('hint');
    return playSequence(state.sequence, { model: true });
  }
  const played = await playSequence(state.boardSlots);
  if (!played || !screens.is('play')) return false;
  if (state.mode.free) {
    state.concertSequence = [...state.boardSlots];
    return showConcert();
  }
  return finishGuidedPlayback();
}

async function showConcert({ announce = true } = {}) {
  if (!hasMusic(state.concertSequence)) state.concertSequence = [...state.boardSlots];
  screens.show('concert');
  renderConcertBoard();
  screens.hold(burstConfetti({ host: els.concert, count: 38, duration: 4100, loop: true, rng: state.rng, drift: 70 }));
  sfx.tada();
  if (announce) await say(`cheer-${state.mode?.id || 'jam'}`);
  if (!screens.is('concert')) return false;
  return playSequence(state.concertSequence, { host: els.concertSlots, playhead: els.concertPlayhead });
}

async function replayConcert() {
  if (state.playing) return false;
  return playSequence(state.concertSequence, { host: els.concertSlots, playhead: els.concertPlayhead });
}

function changeTempo(direction) {
  if (!state.mode?.free || state.playing) return false;
  const previous = state.bpm;
  state.bpm = Math.max(BPM_MIN, Math.min(BPM_MAX, state.bpm + direction * BPM_STEP));
  updateControls();
  say(state.bpm !== previous ? (direction > 0 ? 'faster' : 'slower') : 'tempo');
  nudger.poke();
  return state.bpm;
}

function setTempo(value) {
  state.bpm = Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(Number(value) || DEFAULT_BPM)));
  updateControls();
  return state.bpm;
}

function clearCurrentJam({ announce = true } = {}) {
  if (!state.mode?.free || state.playing) return false;
  state.boardSlots = emptySlots();
  state.selected = null;
  state.saving = false;
  saveCurrentAsDraft();
  sfx.whoosh();
  renderBoard(); renderTray();
  setPrompt('A fresh bracelet. Pick any bead!');
  if (announce) say('clear');
  return true;
}

function saveJam(index, { announce = true } = {}) {
  if (!state.mode?.free || !hasMusic() || index < 0 || index > 3) return false;
  state.library.slots[index] = [...state.boardSlots];
  state.library.current = [...state.boardSlots];
  state.saving = false;
  persistLibrary(); renderSaveSlots(); sfx.sparkle();
  if (announce) say('save');
  return true;
}

function loadJam(index, { announce = true } = {}) {
  const saved = state.library.slots[index];
  if (!state.mode?.free || !saved) return false;
  state.boardSlots = [...saved];
  state.library.current = [...saved];
  state.selected = null;
  state.saving = false;
  persistLibrary(); renderBoard(); renderTray();
  if (announce) say('load');
  return true;
}

function clearSavedJam(index) {
  if (index < 0 || index > 3) return false;
  state.library.slots[index] = null;
  persistLibrary(); renderSaveSlots();
  return true;
}

function handleSaveSlot(index) {
  if (state.saving) return saveJam(index);
  if (state.library.slots[index]) return loadJam(index);
  state.saving = true;
  renderSaveSlots(); say('save-prompt');
  return true;
}

function toggleSaveMode() {
  if (!state.mode?.free || !hasMusic()) { say('prompt-place'); return false; }
  state.saving = !state.saving;
  renderSaveSlots();
  if (state.saving) say('save-prompt');
  return state.saving;
}

function showSplash({ announce = true } = {}) {
  cancelPerformance();
  nudger.stop();
  state.mode = null;
  state.selected = null;
  state.saving = false;
  screens.show('splash');
  if (announce && state.firstGesture) say('welcome');
  return true;
}

function replayInstruction() {
  if (screens.is('splash')) return say('welcome');
  if (screens.is('concert')) return say(`cheer-${state.mode?.id || 'jam'}`);
  if (state.mode?.free) return say('intro-jam');
  return say(state.awaitingPlay ? 'ready-play' : 'prompt-choose');
}

const nudger = createNudger({
  first: 11500, repeat: 9500,
  onNudge: async (count) => {
    if (!screens.is('play') || state.playing) return;
    if (state.mode?.free) { await say(hasMusic() ? 'tempo' : 'intro-jam'); return; }
    if (state.awaitingPlay) { await say('ready-play'); return; }
    if (count < 1) await say('prompt-choose');
    else {
      await say('hint');
      if (screens.is('play') && !state.playing) await playSequence(state.sequence, { model: true });
    }
  },
});

function wireTap(element, target, action) {
  element.dataset.target = target;
  element.dataset.role = 'neutral';
  pageDisposers.push(onTap(element, action, { feedback: () => { sfx.tick(); nudger.poke(); } }));
}

function wireControls() {
  wireTap(els.splashSound, 'listen', () => say('welcome'));
  wireTap(els.back, 'back', () => showSplash());
  wireTap(els.sound, 'sound', replayInstruction);
  wireTap(els.prompt, 'prompt', replayInstruction);
  wireTap(els.playButton, 'play', handlePlay);
  wireTap(els.slower, 'slower', () => changeTempo(-1));
  wireTap(els.faster, 'faster', () => changeTempo(1));
  wireTap(els.clear, 'clear', () => clearCurrentJam());
  wireTap(els.save, 'save', toggleSaveMode);
  wireTap(els.concertBack, 'concert-back', () => showSplash());
  wireTap(els.replay, 'replay', replayConcert);
  wireTap(els.makeAnother, 'make-another', () => showSplash());
}

function semanticTap(targetId) {
  if (targetId.startsWith('mode-')) return startMode(targetId.slice(5));
  if (targetId.startsWith('bead-')) return handleBeadTap(targetId.slice(5));
  if (targetId.startsWith('slot-')) return handleSlotTap(Number(targetId.slice(5)));
  if (targetId.startsWith('save-')) return handleSaveSlot(Number(targetId.slice(5)));
  const actions = {
    listen: () => say('welcome'), back: () => showSplash({ announce: false }),
    sound: replayInstruction, prompt: replayInstruction, play: handlePlay,
    slower: () => changeTempo(-1), faster: () => changeTempo(1),
    clear: () => clearCurrentJam(), save: toggleSaveMode,
    'concert-back': () => showSplash({ announce: false }), replay: replayConcert,
    'make-another': () => showSplash({ announce: false }),
  };
  return actions[targetId] ? actions[targetId]() : false;
}

function collectGameTargets() {
  const targets = [];
  for (const node of root.querySelectorAll('[data-target]')) {
    if (node.closest('[hidden]')) continue;
    const rect = node.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) continue;
    const width = Math.min(innerWidth, Math.max(96, rect.width));
    const height = Math.min(innerHeight, Math.max(96, rect.height));
    const x = Math.max(0, Math.min(innerWidth - width, rect.x - (width - rect.width) / 2));
    const y = Math.max(0, Math.min(innerHeight - height, rect.y - (height - rect.height) / 2));
    targets.push({ id: String(node.dataset.target), role: String(node.dataset.role || 'neutral'), rect: {
      x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100,
      w: Math.round(width * 100) / 100, h: Math.round(height * 100) / 100,
    } });
  }
  return targets;
}

async function debugWinRound() {
  if (!state.mode) await startMode('pop', { announce: false });
  if (state.mode.free) {
    if (!hasMusic()) {
      state.boardSlots = ['red', 'yellow', 'blue', null, 'purple', 'teal', 'coral', null];
      saveCurrentAsDraft(); renderBoard();
    }
    return handlePlay();
  }
  while (currentTargetSlot() >= 0) {
    state.boardSlots[currentTargetSlot()] = currentExpected();
    state.nextMissing += 1;
  }
  state.awaitingPlay = true;
  renderBoard(); renderTray();
  return handlePlay();
}

function snapshot() {
  return {
    screen: screens.current, mode: state.mode?.id || null, roundIndex: state.roundIndex,
    roundCount: state.rounds.length, completed: state.roundIndex, boardSlots: [...state.boardSlots],
    placed: state.boardSlots.map((key, index) => (key ? index : null)).filter((index) => index !== null),
    expected: currentExpected(), expectedSequence: [...state.sequence], targetSlot: currentTargetSlot(),
    bpm: state.bpm, playing: state.playing,
    awaitingInput: Boolean(state.mode && !state.awaitingPlay && !state.playing),
    awaitingPlay: state.awaitingPlay, selected: state.selected, saving: state.saving,
    saves: state.library.slots.map((sequence) => (sequence ? [...sequence] : null)),
    muted: state.muted, seed: state.seed,
  };
}

renderModeCards();
wireControls();
renderSlots(els.slots, emptySlots(), { interactive: true });
renderTray();
renderSaveSlots();
updateControls();
bgm.preload(config.music.track);
bgm.setVolume(config.music.volume);

const ready = Promise.all([
  voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
  preloadImages([
    config.theme.background, config.theme.concertBackground, config.art.title,
    config.art.board, config.art.cord, config.art.tray, config.art.modePlaque, config.art.star,
    ...Object.values(config.art.surfaces), ...Object.values(config.art.controls),
    ...BEAD_KEYS.map((key) => config.beads[key].art),
  ]),
]).then(() => true);

pageDisposers.push(installUnlockOnGesture({
  extra: [ensureAudio, bgm.unlock],
  onFirst: () => {
    state.firstGesture = true;
    bgm.play(config.music.track, { key: config.id, fadeInMs: 700, loopFadeOutMs: 2300 });
    ready.then(() => { if (screens.is('splash')) say('welcome'); });
  },
}));
pageDisposers.push(installKioskGuards());

const disposeDebug = installDebug({
  gameId: config.id, engine: config.engine, version: 1, ready, timers, voice, sfx,
  listModes: () => config.modes.map((mode) => ({ id: mode.id, title: mode.title, skill: mode.skill })),
  startMode: async (id) => { await ready; return startMode(id, { announce: false }); },
  getState: snapshot, getTargets: collectGameTargets,
  tap: async (targetId) => ({ accepted: Boolean(await semanticTap(String(targetId))) }),
  winRound: debugWinRound,
  place: (bead, slot) => attemptPlacement(String(bead), Number(slot)),
  setTempo, playOnce: () => playSequence(state.boardSlots),
  saveJam: (index) => saveJam(Number(index), { announce: false }),
  loadJam: (index) => loadJam(Number(index), { announce: false }),
  clearJam: (index) => clearSavedJam(Number(index)),
  clearCurrentJam: () => clearCurrentJam({ announce: false }),
  mute: setMuted,
  onSeed: (rng, value) => { state.rng = rng; state.seed = value; },
  home: () => showSplash({ announce: false }),
  getAudioLog: voice.getAudioLog, clearAudioLog: voice.clearAudioLog,
  getLayout: () => ({ viewport: { width: innerWidth, height: innerHeight },
    orientation: innerWidth >= innerHeight ? 'landscape' : 'portrait', targets: collectGameTargets() }),
});

window.addEventListener('pagehide', () => {
  cancelPerformance(); nudger.stop(); voice.stop(); bgm.stop({ fadeOutMs: 0 }); disposeDebug();
  slotDisposers.splice(0).forEach((dispose) => dispose());
  saveDisposers.splice(0).forEach((dispose) => dispose());
  pageDisposers.splice(0).forEach((dispose) => { try { dispose(); } catch { /* best effort */ } });
}, { once: true });

window._braceletState = state;
