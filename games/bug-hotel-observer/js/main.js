// main.js — Bug Hotel Observer: the seven screens, the HUD, the voice
// sequencing that is not tied to a tap, and the whole QLOBE_DEBUG surface.
//
// The play field (the hotel, the rooms, the lens ↔ hotspot reveal contract,
// seeded placement) is js/game.js. The sticker grid is js/journal-ui.js. The
// record behind it is shared/js/journal.js. This file is the thing that knows
// what screen we are on and what should be speaking.
//
// Every reference below is to games/bug-hotel-observer/game-design.md.

import config from '../config.js';
import * as rawSfx from '../../../shared/js/sfx.js';
import * as speech from '../../../shared/js/speech.js';
import { onTap } from '../../../shared/js/tap.js';
import { createJournal } from '../../../shared/js/journal.js';
import * as voice from './voice.js';
import { createField, createDeck, deriveRound, targetForRoom } from './game.js';
import { createJournalUI } from './journal-ui.js';
import { createAmbience } from './ambience.js';
import { imgEl, applyFallback, resolveArt } from './art.js';

const rooms = config.rooms || [];
const bugs = config.bugs || [];
const modes = config.modes || [];
const tuning = config.tuning || {};
const bugById = new Map(bugs.map((b) => [b.id, b]));
const roomById = new Map(rooms.map((r) => [r.id, r]));

/**
 * §2.3's mode-tile faces. They are NOT in config.json because §6 froze that
 * schema before the splash composition existed, and a face path is a splash
 * detail, not game data. If P6 wants them tunable it adds a `modes[].face` key
 * there and deletes this map; nothing else changes.
 */
const MODE_FACE = {
  'bug-hunt': 'assets/props/mode-hunt.webp',
  'bug-detective': 'assets/props/mode-detective.webp',
  'my-bug-book': 'assets/props/mode-book.webp',
};

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

const state = {
  screen: 'splash',
  mode: null,
  modeDef: null,
  roomId: null,
  timeScale: 1,
  seed: Date.now() & 0xffff,
  muted: false,
  welcomeSpoken: false,
  modeRowOpen: false,
  journalFrom: null,       // which screen the journal overlay was opened from
  rewardBug: null,
  layout: 'wide',
  introToken: 0,
  roundAtEntry: 0,         // the round this visit to the hotel is playing
};

/** Rooms finished THIS round. In memory only (§10) — a reload restarts the
 *  round at the leaf room with every sticker kept. */
const roomsDone = new Set();
/** The bugs collected in this round, in order — the celebration lifts these. */
const roundBugs = [];

const journal = createJournal(config.id || 'bug-hotel-observer', {
  version: Number((config.journal && config.journal.version)) || 1,
});

let yesDeck = createDeck((config.voice && config.voice.decks && config.voice.decks.yes) || [], state.seed);
let idleDeck = createDeck((config.voice && config.voice.decks && config.voice.decks.idle) || [], state.seed);

const T = (ms) => ms * state.timeScale;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

// SFX facade — one place to gate every effect on mute(). sfx.js has no gain
// export, so the mute happens at the call site.
const SFX_KEYS = ['pop', 'sparkle', 'whoosh', 'boing', 'tada', 'tick'];
const sfx = { unlock: () => { try { rawSfx.unlock(); } catch { /* ignore */ } } };
for (const key of SFX_KEYS) {
  sfx[key] = () => {
    if (state.muted) return;
    try { rawSfx[key](); } catch { /* an effect must never break a tap */ }
  };
}

const ambience = createAmbience({ isMuted: () => state.muted });

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const els = {
  app: $('app'),
  stage: $('stage'),
  hud: $('hud'),
  back: $('btn-back'),
  sound: $('btn-sound'),
  banner: $('banner'),
  plaque: $('target-plaque'),
  journalTab: $('btn-journal'),
  pips: $('pips'),
  splash: $('splash'),
  splashHome: $('splash-home'),
  splashSound: $('splash-sound'),
  splashTitle: $('splash-title'),
  play: $('btn-play'),
  modeRow: $('mode-row'),
  spread: $('spread'),
  spreadBack: $('spread-back'),
  spreadPaper: $('spread-paper'),
  factFound: $('fact-found'),
  factRow: $('fact-row'),
  factBug: $('fact-bug'),
  factCard: $('fact-card'),
  factText: $('fact-text'),
  grid: $('sticker-grid'),
  flyLayer: $('fly-layer'),
  next: $('btn-next'),
  confetti: $('confetti'),
  end: $('end'),
  endBack: $('end-back'),
  endGrid: $('end-grid'),
  again: $('btn-again'),
};

// ---------------------------------------------------------------------------
// timers
// ---------------------------------------------------------------------------

const timers = { idle: null, auto: null, intro: null };
const beats = new Set();

function clearTimer(name) {
  if (timers[name]) { clearTimeout(timers[name]); timers[name] = null; }
}

function beat(ms, fn) {
  const id = setTimeout(() => { beats.delete(id); fn(); }, Math.max(0, T(ms)));
  beats.add(id);
  return id;
}

function clearBeats() {
  for (const id of beats) clearTimeout(id);
  beats.clear();
}

function clearAllTimers() {
  for (const name of Object.keys(timers)) clearTimer(name);
  clearBeats();
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
// §2.5 HUD reserve — the one bridge between CSS px and art space
// ---------------------------------------------------------------------------

function reserves() {
  if (els.hud.hidden) return [];
  const list = [];
  for (const el of [els.banner, els.plaque, els.pips, els.back, els.sound, els.journalTab]) {
    if (!el || el.hidden) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) list.push(r);
  }
  return list;
}

// ---------------------------------------------------------------------------
// the play field and the book
// ---------------------------------------------------------------------------

const field = createField({
  mount: els.stage,
  config,
  voice,
  sfx,
  ctx: {
    timeScale: () => state.timeScale,
    seed: () => state.seed,
    mode: () => state.mode,
    modeDef: () => state.modeDef,
    round: () => state.roundAtEntry,
    screen: () => state.screen,
    reserves,
    yesKey: () => yesDeck.next(),
  },
  on: {
    reflow(payload, layout) {
      state.layout = layout;
      els.app.classList.toggle('compact', layout === 'compact');
    },
    /** §2.5a — the plate the framed stage is showing, so the surround can be a
     *  blurred duplicate of it. ABSOLUTE, for the same reason --splash-plate is:
     *  a relative url() inside a custom property resolves against the
     *  STYLESHEET, and css/style.css would fetch it as 'css/assets/…'. */
    plate(url) {
      if (!url) return;
      const abs = new URL(url, document.baseURI).href;
      document.documentElement.style.setProperty('--stage-plate', `url('${abs}')`);
    },
    room(roomId) { void enterRoom(roomId); },
    reveal() { armIdle(); },
    target(bugId) { void openReward(bugId); },
    roommate() { armIdle(); },
  },
});

const book = createJournalUI({
  config,
  journal,
  onSticker: (bugId) => { void tapSticker(bugId); },
  feedback: () => { unlockAudio(); sfx.pop(); },
});

const gridSpread = book.createGrid(els.grid, { interactive: true });
const gridEnd = book.createGrid(els.endGrid, { interactive: true });

// ---------------------------------------------------------------------------
// HUD rendering
// ---------------------------------------------------------------------------

function currentRoom() {
  return state.roomId ? roomById.get(state.roomId) : null;
}

function currentTarget() {
  const room = currentRoom();
  return room ? targetForRoom(room, state.roundAtEntry, Number(tuning.targetCycle) || 3) : null;
}

function isDetective() {
  return Boolean(state.modeDef && state.modeDef.wrongTapRepeatsPrompt);
}

function buildPips() {
  els.pips.replaceChildren();
  for (let i = 0; i < rooms.length; i += 1) {
    const pip = document.createElement('i');
    pip.className = 'pip';
    els.pips.appendChild(pip);
  }
}

function renderPips() {
  [...els.pips.children].forEach((pip, i) => {
    pip.classList.toggle('filled', roomsDone.has(rooms[i] && rooms[i].id));
  });
}

/**
 * The banner is an ADULT CAPTION (§2.5, §8.2 row 21): it prints the sentence
 * the child is hearing so a grown-up across the table can follow. It is
 * `pointer-events: none` and it is never the instruction — the voice is.
 */
function renderBanner(key) {
  const line = key ? voice.text(key) : '';
  els.banner.textContent = line;
  els.banner.hidden = !line;
}

function renderTargetPlaque() {
  const targetId = currentTarget();
  const show = state.screen === 'room' && Boolean(state.modeDef && state.modeDef.showsTargetPlaque) && targetId;
  els.plaque.hidden = !show;
  if (!show) { els.plaque.removeAttribute('src'); return; }
  const bug = bugById.get(targetId);
  applyFallback(els.plaque, (bug && bug.sprites && bug.sprites.idle) || '');
}

// ---------------------------------------------------------------------------
// §2.1 screens
// ---------------------------------------------------------------------------

function setScreen(name) {
  state.screen = name;
  els.app.dataset.screen = name;
  els.splash.hidden = name !== 'splash';
  els.end.hidden = name !== 'end';
  els.spread.hidden = !(name === 'reward' || name === 'journal' || name === 'celebration');
  els.hud.hidden = !(name === 'hotel' || name === 'room');
  els.spread.classList.toggle('is-journal', name === 'journal');
  els.spread.classList.toggle('is-celebration', name === 'celebration');
  renderTargetPlaque();
  field.reflow();
}

/** §2.9 — ONE teardown. The back button on every screen and `home()` run it. */
function goSplash() {
  voice.stop();
  try { speech.stop(); } catch { /* ignore */ }
  ambience.stop();
  state.introToken += 1;
  clearAllTimers();
  field.clearRoom();
  field.setEnabled(true);
  state.mode = null;
  state.modeDef = null;
  state.roomId = null;
  state.rewardBug = null;
  state.journalFrom = null;
  els.confetti.replaceChildren();
  els.spread.classList.remove('show');
  gridSpread.clearRise();
  renderBanner(null);
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
  state.welcomeSpoken = true;    // a greeting the child has walked past is noise
  sfx.tick();
  voice.say(next.intro);

  if (next.review) {
    openJournal('splash');
    return true;
  }
  await goHotel({ fresh: true });
  return true;
}

// §2.4 HOTEL SELECT
async function goHotel({ fresh = false } = {}) {
  state.introToken += 1;
  clearAllTimers();
  state.roomId = null;
  state.rewardBug = null;
  if (fresh) {
    roomsDone.clear();
    roundBugs.length = 0;
    field.clearRoomsDone();
    state.roundAtEntry = deriveRound(config, journal);
  }
  renderPips();
  // The hotel is a CHOICE, not a search. `prompt-look` ("Somebody tiny is
  // hiding in this room") only makes sense once the child is INSIDE a room —
  // printed over the four plaques it read like a broken state, because there is
  // no "this room" yet. `pick-room` is the hotel's own line; `prompt-look`
  // keeps its in-room job in speakRoomIntro's detective sequence.
  renderBanner('pick-room');
  setScreen('hotel');
  await field.showHotel();
  if (state.screen !== 'hotel') return false;
  field.pulseRooms();
  ambience.start('hotel');
  armIdle();
  return true;
}

// §9.2 entering a room
async function enterRoom(roomId) {
  const token = ++state.introToken;
  clearAllTimers();
  const room = roomById.get(String(roomId));
  if (!room) return false;
  state.roomId = room.id;
  setScreen('room');
  renderBanner(promptKeyForBanner());
  renderTargetPlaque();
  renderPips();
  ambience.start(room.id);

  await field.enterRoom(room.id);
  if (token !== state.introToken) return false;
  renderBanner(promptKeyForBanner());

  const spoken = speakRoomIntro();
  await Promise.race([spoken, wait(T(4200))]);
  if (token !== state.introToken) return false;
  await wait(T(Number(tuning.roomIntroTailMs) || 350));
  if (token !== state.introToken) return false;
  armIdle();
  return true;
}

/** The line the banner prints — the same line the sound button replays. */
function promptKeyForBanner() {
  const targetId = currentTarget();
  const bug = targetId ? bugById.get(targetId) : null;
  if (!bug) return null;
  return isDetective() ? bug.voice.clue : bug.voice.find;
}

/** §3.5 — the room intro, in both play modes. */
function speakRoomIntro() {
  const room = currentRoom();
  const targetId = currentTarget();
  const bug = targetId ? bugById.get(targetId) : null;
  if (!room || !bug) return Promise.resolve();
  const gap = Number(tuning.promptGapMs) || 260;
  const steps = isDetective()
    ? [room.voice.intro, { key: 'prompt-look', gap }, { key: bug.voice.clue, gap }]
    : [room.voice.intro, { key: bug.voice.find, gap }];
  // §3.5 — the lens gesture is taught once per session, on the first room.
  if (!field.seenAnyRoom) {
    field.markSeenRoom();
    steps.push({ key: 'prompt-lens', gap: 400 });
  }
  return voice.seq(steps, state.timeScale);
}

/** The sound button: replays whatever the child is being asked RIGHT NOW. */
function speakCurrentPrompt() {
  const targetId = currentTarget();
  const bug = targetId ? bugById.get(targetId) : null;
  switch (state.screen) {
    case 'splash':
      state.welcomeSpoken = true;
      return voice.say('welcome');
    case 'hotel':
      return voice.say('pick-room');
    case 'room':
      if (!bug) return Promise.resolve();
      return isDetective()
        ? voice.seq(['prompt-again', { key: bug.voice.clue, gap: Number(tuning.clipGapMs) || 140 }], state.timeScale)
        : voice.say(bug.voice.find);
    case 'reward': {
      const rewardBug = state.rewardBug ? bugById.get(state.rewardBug) : null;
      return rewardBug ? voice.say(rewardBug.voice.fact) : Promise.resolve();
    }
    case 'journal':
      return voice.say(journal.count() ? 'journal-tap' : 'journal-empty');
    default:
      return Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// §3.6 the idle ladder — 12 s, then every 15 s, and NEVER a hint that points
// at the answer. Searching is the skill.
// ---------------------------------------------------------------------------

let idleTier = 0;

function armIdle() {
  clearTimer('idle');
  if (document.hidden) return;
  if (state.screen !== 'room' && state.screen !== 'hotel') return;
  idleTier = 0;
  timers.idle = setTimeout(runIdleTier, T(Number(tuning.idleMs) || 12000));
}

function runIdleTier() {
  timers.idle = null;
  if (state.screen !== 'room' && state.screen !== 'hotel') return;
  // Never talk over a line the child is still hearing. The prompt itself can
  // run longer than the idle window under `fastTimer` (game beats scale, a
  // speech engine does not), and an idle nudge that cuts the question in half
  // is the one thing this ladder must not do. Wait a beat and ask again.
  if (voice.isSpeaking()) {
    timers.idle = setTimeout(runIdleTier, Math.max(200, T(2000)));
    return;
  }
  const tier = idleTier;
  idleTier += 1;
  if (state.screen === 'hotel') {
    voice.say(idleDeck.next());
    field.pulseRooms();
  } else if (tier % 2 === 0) {
    voice.say(idleDeck.next());
    if (field.lens) field.lens.glint();
  } else {
    void speakCurrentPrompt();
  }
  timers.idle = setTimeout(runIdleTier, T(Number(tuning.idleRepeatMs) || 15000));
}

// ---------------------------------------------------------------------------
// §2.6 / §9.5–9.6 the REWARD spread
// ---------------------------------------------------------------------------

async function openReward(bugId) {
  const token = ++state.introToken;
  clearAllTimers();
  const bug = bugById.get(bugId);
  if (!bug) return false;
  state.rewardBug = bugId;
  if (field.lens) field.lens.setEnabled(false);
  field.setEnabled(false);

  // §9.6 says the record is written at the start of the sticker flight, "so a
  // back-tap mid-animation still keeps the sticker". THE SAME ARGUMENT PUSHES
  // IT EARLIER STILL: the bug was earned the moment the child greeted it, and
  // between here and the flight sit a 520 ms slide and a whole spoken fact. A
  // Next Room press anywhere in there must not cost a five-year-old their
  // ladybug. So the book is written first, synchronously, before any await —
  // and the flight below is only the animation of a fact already recorded.
  const owned = journal.has(bugId);
  const room = currentRoom();
  if (!owned) {
    journal.add(bugId, { room: room ? room.id : null, round: state.roundAtEntry, mode: state.mode });
  }
  if (!roundBugs.includes(bugId)) roundBugs.push(bugId);
  gridSpread.clearRise();
  gridSpread.refresh();
  gridEnd.refresh();
  showFact(bug);
  setScreen('reward');
  requestAnimationFrame(() => els.spread.classList.add('show'));

  beat(120, () => els.factFound.classList.add('in'));
  beat(200, () => els.factRow.classList.add('in'));

  await wait(T(Number(tuning.factOpenMs) || 520));
  if (token !== state.introToken) return false;
  const spoken = voice.speakFor(bug.voice.fact, 2400, state.timeScale);
  await spoken;
  if (token !== state.introToken) return false;

  const slot = gridSpread.slotOf(bugId);
  if (owned) {
    gridSpread.pulse(bugId);
  } else if (slot) {
    sfx.whoosh();
    const from = els.factBug.getBoundingClientRect();
    els.factBug.classList.add('flying');
    await book.flyTo({
      layer: els.flyLayer,
      from,
      slot,
      sprite: bug.sprites && bug.sprites.happy,
      ms: T(Number(tuning.stickerFlyMs) || 700),
      reducedMotion: field.scene.reducedMotion,
    });
    els.factBug.classList.remove('flying');
    if (token !== state.introToken) return false;
    sfx.pop();
    voice.say('sticker');
  }
  gridEnd.refresh();

  // THE TAIL MUST NOT OUTLIVE ITS OWN BEAT. A child who presses Next Room
  // while the sticker is still flying leaves this function suspended at an
  // await; when it resumes, the celebration is already up and arming a reward
  // auto-advance here would silently CANCEL the celebration's own. Every beat
  // that supersedes a reward bumps `introToken`, and this is where that is
  // checked.
  if (token !== state.introToken) return false;
  clearTimer('auto');
  timers.auto = setTimeout(() => {
    timers.auto = null;
    void leaveReward();
  }, T(Number(tuning.rewardAutoAdvanceMs) || 14000));
  return true;
}

function showFact(bug) {
  els.factFound.classList.remove('in');
  els.factRow.classList.remove('in');
  els.factFound.hidden = false;
  els.factRow.hidden = false;
  applyFallback(els.factFound, (config.journal && config.journal.factFoundLockup) || '');
  applyFallback(els.factBug, (bug.sprites && bug.sprites.happy) || '');
  els.factBug.classList.remove('flying');
  // Adult-facing garnish (§8.2 row 14): the exact sentence the child hears.
  els.factText.textContent = voice.text(bug.voice.fact);
  els.next.setAttribute('aria-label', 'Next room');
}

// §9.7 leaving the reward
async function leaveReward() {
  if (state.screen !== 'reward') return false;
  state.introToken += 1;
  clearAllTimers();
  const room = currentRoom();
  if (room) {
    roomsDone.add(room.id);
    if (state.rewardBug) field.markRoomDone(room.id, state.rewardBug);
  }
  renderPips();
  voice.say('next-room');
  els.spread.classList.remove('show');
  await wait(T(380));
  if (state.screen !== 'reward') return false;   // back was pressed mid-slide
  state.rewardBug = null;
  field.setEnabled(true);

  const next = rooms.find((r) => !roomsDone.has(r.id));
  if (next) {
    await goHotelThenRoom(next.id);
    return true;
  }
  showCelebration();
  return true;
}

/** The pips live on the hotel HUD, so the room-to-room hop lands there for a
 *  beat: the child sees their progress fill before the next plate arrives. */
async function goHotelThenRoom(roomId) {
  setScreen('hotel');
  await field.showHotel();
  if (state.screen !== 'hotel') return;
  await wait(T(520));
  if (state.screen !== 'hotel') return;
  await enterRoom(roomId);
}

// ---------------------------------------------------------------------------
// §2.8 CELEBRATION and END
// ---------------------------------------------------------------------------

function fillConfetti() {
  els.confetti.replaceChildren();
  if (field.scene.reducedMotion) return;         // §9.10 — no confetti at all
  const colors = ['#d94d62', '#e8b64a', '#5f8f3a', '#8ec44a', '#c9a15f', '#7b4fa0'];
  for (let i = 0; i < 30; i += 1) {
    const bit = document.createElement('i');
    bit.style.left = `${(i * 37 + state.seed * 11) % 100}%`;
    bit.style.setProperty('--c', colors[i % colors.length]);
    bit.style.setProperty('--d', `${2.4 + (i % 6) * 0.4}s`);
    bit.style.setProperty('--delay', `${-(i % 9) * 0.3}s`);
    bit.style.setProperty('--sway', `${18 + (i % 4) * 12}px`);
    els.confetti.appendChild(bit);
  }
}

function showCelebration() {
  state.introToken += 1;
  clearAllTimers();
  field.setEnabled(false);
  els.factFound.hidden = true;
  els.factRow.hidden = true;
  gridSpread.refresh();
  setScreen('celebration');
  els.next.setAttribute('aria-label', 'Keep exploring');
  requestAnimationFrame(() => els.spread.classList.add('show'));

  renderPips();
  beat(120, fillConfetti);
  beat(240, () => { sfx.tada(); voice.say('round-done'); });
  beat(600, () => gridSpread.rise(roundBugs.slice()));

  clearTimer('auto');
  timers.auto = setTimeout(() => {
    timers.auto = null;
    showEnd();
  }, T(Number(tuning.celebrationAutoAdvanceMs) || 16000));
}

function showEnd() {
  state.introToken += 1;
  clearAllTimers();
  voice.stop();
  ambience.stop();
  field.clearRoom();
  gridSpread.clearRise();
  els.spread.classList.remove('show');
  els.confetti.replaceChildren();
  gridEnd.refresh();
  setScreen('end');
  voice.say('cheer-end');
  // §2.8 — the end screen holds indefinitely. A resting place, not a timeout.
}

// ---------------------------------------------------------------------------
// §2.7 JOURNAL / MY BUG BOOK
// ---------------------------------------------------------------------------

function openJournal(from) {
  state.introToken += 1;
  clearAllTimers();
  state.journalFrom = from;
  if (field.lens) field.lens.setEnabled(false);
  els.factFound.hidden = true;
  els.factRow.hidden = true;
  gridSpread.clearRise();
  gridSpread.refresh();
  setScreen('journal');
  requestAnimationFrame(() => els.spread.classList.add('show'));
  const gap = 600;
  if (journal.count()) voice.seq(['journal-open', { key: 'journal-tap', gap }], state.timeScale);
  else voice.say('journal-empty');
}

async function closeJournal() {
  if (state.screen !== 'journal') return;
  const from = state.journalFrom;
  voice.stop();
  els.spread.classList.remove('show');
  await wait(T(380));
  state.journalFrom = null;
  if (from === 'room' && state.roomId) {
    setScreen('room');
    field.setEnabled(true);
    if (field.lens) field.lens.setEnabled(true);
    armIdle();
  } else if (from === 'hotel') {
    setScreen('hotel');
    armIdle();
  } else {
    goSplash();
  }
}

/** §2.7 — a filled sticker replays its own name and fact. */
async function tapSticker(bugId) {
  const bug = bugById.get(String(bugId));
  if (!bug || !journal.has(bug.id)) return { accepted: false, role: 'none' };
  const grid = state.screen === 'end' ? gridEnd : gridSpread;
  grid.pulse(bug.id);
  await voice.seq([bug.voice.name, { key: bug.voice.fact, gap: 240 }], state.timeScale);
  return { accepted: true, role: 'sticker' };
}

// ---------------------------------------------------------------------------
// controls — every one through tap.js (§9.1)
// ---------------------------------------------------------------------------

function unlockAudio() {
  sfx.unlock();
  try { speech.unlock(); } catch { /* ignore */ }
  voice.unlock();
  ambience.unlock();
}

function press(el, action) {
  if (!el) return;
  onTap(el, (ev) => action(ev), {
    feedback: () => { unlockAudio(); sfx.pop(); },
  });
}

// §3.1 — unlock on EVERY gesture, not just the first. A single unlock can be
// lost to a tab switch or an interrupted gesture, and a recorded line spoken
// before the unlock silently degrades to the system speech voice.
window.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });

// §3.6 — any pointerdown in the play field restarts the idle ladder from zero.
window.addEventListener('pointerdown', () => {
  if (state.screen === 'room' || state.screen === 'hotel') armIdle();
}, { capture: true, passive: true });

/** §2.9 — back is one screen out, and it NEVER navigates. */
function goBack() {
  switch (state.screen) {
    case 'room': void goHotel(); break;
    case 'reward': void goHotel(); break;
    case 'journal': void closeJournal(); break;
    case 'celebration': showEnd(); break;
    case 'hotel':
    case 'end':
    default: goSplash(); break;
  }
}

press(els.splashHome, () => { window.location.href = '../../index.html'; });

press(els.play, () => {
  if (!state.modeRowOpen) {
    state.modeRowOpen = true;
    els.modeRow.hidden = false;
    // The column has to give the three tiles their height BEFORE they animate
    // in, or the row arrives already clipped by the bottom of the screen.
    els.splash.classList.add('modes-open');
    requestAnimationFrame(() => els.modeRow.classList.add('show'));
  }
  if (!state.welcomeSpoken) {
    state.welcomeSpoken = true;
    voice.say('welcome');
  }
});

const soundDebounceMs = Number(tuning.soundDebounceMs) || 600;
press(els.splashSound, debounced(soundDebounceMs, () => { void speakCurrentPrompt(); }));
press(els.sound, debounced(soundDebounceMs, () => { void speakCurrentPrompt(); }));

press(els.back, goBack);
press(els.spreadBack, goBack);
press(els.endBack, goSplash);

press(els.journalTab, () => {
  if (state.screen === 'journal') void closeJournal();
  else openJournal(state.screen);
});

press(els.next, () => {
  if (state.screen === 'celebration') showEnd();
  else void leaveReward();
});

press(els.again, () => { goSplash(); });

// §2.3 — the mode row, built from config so listModes() and the tiles agree.
function buildModeRow() {
  els.modeRow.replaceChildren();
  for (const mode of modes) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = `mode-tile mode-${mode.id}`;
    tile.dataset.mode = mode.id;
    tile.setAttribute('aria-label', mode.title);

    const face = document.createElement('span');
    face.className = 'tile-face';
    face.appendChild(imgEl(MODE_FACE[mode.id] || '', 'tile-art'));
    tile.appendChild(face);

    const label = document.createElement('span');
    label.className = 'tile-label';
    label.textContent = mode.title;
    tile.appendChild(label);

    press(tile, () => { void startMode(mode.id); });
    els.modeRow.appendChild(tile);
  }
}

// §2.9 backgrounding: stop voice and ambience, pause every timer; re-arm from
// zero on return. Nothing auto-advances while hidden.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    voice.stop();
    ambience.suspend();
    clearTimer('idle');
    clearTimer('auto');
  } else {
    ambience.resume();
    if (state.screen === 'room' || state.screen === 'hotel') armIdle();
    else if (state.screen === 'reward' && !timers.auto) {
      timers.auto = setTimeout(() => { timers.auto = null; void leaveReward(); },
        T(Number(tuning.rewardAutoAdvanceMs) || 14000));
    } else if (state.screen === 'celebration' && !timers.auto) {
      timers.auto = setTimeout(() => { timers.auto = null; showEnd(); },
        T(Number(tuning.celebrationAutoAdvanceMs) || 16000));
    }
  }
});

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

const ready = (async () => {
  buildPips();
  buildModeRow();
  renderPips();
  document.documentElement.style.setProperty('--ts', '1');
  applyFallback(els.splashTitle, (config.splash && config.splash.title) || '');
  // The journal tab's face is an authored cutout carried as a CSS background
  // (the button IS the substrate, §8.2 row 16), so it is resolved rather than
  // given an onerror handler — a background image has no error event.
  resolveArt((config.journal && config.journal.tabSprite) || '').then((src) => {
    if (src) els.journalTab.style.backgroundImage = `url('${src}')`;
  });
  // §2.3 / §2.8 — the splash floats the title over the hotel plate itself,
  // blurred, and the end screen dims the same plate behind a cream veil. The
  // custom property lands on the ROOT so both screens read the one resolved
  // url; a decorative backdrop, so a failure just leaves paper cream showing.
  resolveArt((config.splash && config.splash.bg) || '').then((src) => {
    if (!src) return;
    // ABSOLUTE ON PURPOSE. This custom property is substituted into a rule that
    // lives in css/style.css, and a relative url() inside a custom property
    // resolves against the STYLESHEET, not the document — so 'assets/…' would
    // be fetched as 'css/assets/…' and 404. Inline background-images set on an
    // element (the spread, the fact card, the journal tab) resolve against the
    // document and are left relative.
    const abs = new URL(src, document.baseURI).href;
    document.documentElement.style.setProperty('--splash-plate', `url('${abs}')`);
  });
  // §8.2 rows 11 and 13 — the spread's spiral kraft and the fact-card plate.
  // The END screen prints the SAME spread (§2.8), so the one resolved url also
  // lands on the root as --journal-plate. Absolute for the same reason as
  // --splash-plate: it is substituted into a rule that lives in css/style.css.
  resolveArt((config.journal && config.journal.bg) || '').then((src) => {
    if (!src) return;
    els.spreadPaper.style.backgroundImage = `url('${src}')`;
    document.documentElement.style.setProperty(
      '--journal-plate', `url('${new URL(src, document.baseURI).href}')`);
  });
  resolveArt((config.journal && config.journal.factCard) || '').then((src) => {
    if (!src) return;
    els.factCard.style.backgroundImage = `url('${src}')`;
    els.factCard.classList.add('has-plate');
  });
  state.roundAtEntry = deriveRound(config, journal);
  // §8.1 — the first frame must not render in the fallback face. This never
  // gates input: the splash is already mounted and tappable.
  try { await document.fonts.load('600 44px Fredoka'); } catch { /* the fallback face is legible */ }
  setScreen('splash');
  await voice.init(config);
  return true;
})();

// ---------------------------------------------------------------------------
// window.QLOBE_DEBUG — v1 (§7) plus this game's declared extras
// ---------------------------------------------------------------------------

/** The last recorded clip's media element — see `getClipMedia` below. */
let lastClipEl = null;
let lastClipKey = null;
voice.onClip((key, el) => { lastClipKey = key; lastClipEl = el; });

/** Every debug tap goes through the SAME handler a finger does (§7.3). */
async function debugTap(id) {
  const key = String(id);
  if (state.screen === 'journal' || state.screen === 'reward' || state.screen === 'end') {
    return tapSticker(key);
  }
  return field.handleTap(key);
}

async function winRound() {
  await ready;
  if (state.screen === 'splash') await startMode(modes.find((m) => m.default) ? modes.find((m) => m.default).id : modes[0].id);
  if (state.screen === 'hotel') {
    const next = rooms.find((r) => !roomsDone.has(r.id)) || rooms[0];
    await enterRoom(next.id);
  }
  if (state.screen !== 'room') return state.screen === 'reward';
  const targetId = field.targetId;
  if (!targetId) return false;
  await field.reveal(targetId);
  await debugTap(targetId);
  // The greeting resolves before the spread mounts; give the beat a frame.
  for (let i = 0; i < 40 && state.screen !== 'reward'; i += 1) await wait(T(60));
  return state.screen === 'reward';
}

window.QLOBE_DEBUG = {
  version: 1,
  gameId: config.id,
  engine: 'bug-hotel-observer (game-local js/game.js + shared/js/{hotspot-scene,magnifier-lens,journal}.js)',
  ready,

  listModes: () => modes.map(({ id, title }) => ({ id, title })),
  startMode,

  getState: () => ({
    screen: state.screen,
    mode: state.mode,
    roomId: state.roomId,
    roomIndex: state.roomId ? rooms.findIndex((r) => r.id === state.roomId) : -1,
    roomsDone: [...roomsDone],
    round: state.roundAtEntry,
    /** The screen name flips first so the HUD paints; this says the plate, the
     *  hotspots and the lens are really live. A harness waits on THIS. */
    roomReady: field.mounted,
    awaitingInput: (state.screen === 'room' || state.screen === 'hotel') && field.mounted,
    targetId: field.targetId,
    revealed: field.revealed,
    found: journal.all().map((e) => e.id),
    placements: field.placements,
    wrongTaps: field.wrongTaps,
    reducedMotion: field.scene.reducedMotion,
    muted: state.muted,
    seed: state.seed,
    seedValue: state.seed,
    layout: state.layout,
    timeScale: state.timeScale,
  }),

  /** `role` is TRUTHFUL: 'target' | 'bug' | 'room' | 'sticker'. Screen px. */
  getTargets: () => {
    if (state.screen === 'journal' || state.screen === 'reward'
      || state.screen === 'celebration' || state.screen === 'end') {
      const grid = state.screen === 'end' ? gridEnd : gridSpread;
      return bugs
        .filter((b) => journal.has(b.id))
        .map((b) => {
          const node = grid.slotOf(b.id);
          const r = node ? node.getBoundingClientRect() : null;
          return {
            id: b.id,
            role: 'sticker',
            rect: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : { x: 0, y: 0, w: 0, h: 0 },
            enabled: Boolean(node && node.tagName === 'BUTTON'),
          };
        });
    }
    if (state.screen === 'hotel' || state.screen === 'room') return field.targets();
    return [];
  },

  tap: debugTap,
  winRound,

  mute(value = true) {
    state.muted = Boolean(value);
    voice.setMuted(state.muted);
    ambience.setMuted(state.muted);
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

  home: () => { goSplash(); },

  // ---- declared extras (§7) ----

  /** Moves the lens through `lens.moveTo` — the SAME code path as a drag, so a
   *  QA move exercises the real dwell machinery rather than a shortcut. */
  setLens(artX, artY, opts) {
    if (!field.lens) return null;
    return field.lens.moveTo(Number(artX), Number(artY), opts || {}).then(() => field.lens.getCentre());
  },

  getLens() {
    if (!field.lens) return null;
    const s = field.lens.getState();
    return {
      x: s.x, y: s.y, enabled: s.enabled, visible: s.visible,
      // §11 row 23 — a pointer down on the drag surface is a TRACKED PRESS
      // (`pressing`); it only becomes `dragging` once it crosses `slopPx`.
      // A harness that waits on the old meaning of `dragging` has to wait on
      // `pressing` for the pointerdown and on `dragging` for the move.
      pressing: s.pressing, dragging: s.dragging, slopPx: s.slopPx,
      lastTapThrough: s.lastTapThrough,
      zoom: s.zoom, glassD: field.lens.glassD, dwell: s.dwell, sprites: s.sprites,
    };
  },

  /**
   * Divides every timed beat: `fastTimer(10)` takes the 600 ms dwell to 60 ms
   * and the 14 s auto-advance to 1.4 s. A value in (0, 1] is read as a direct
   * multiplier instead, so the rhyming-detective habit of `fastTimers(0.05)`
   * does the expected thing here too.
   */
  fastTimer(scale = 10) {
    const n = Number(scale);
    const value = !Number.isFinite(n) || n <= 0 ? 0.1 : (n > 1 ? 1 / n : n);
    state.timeScale = Math.min(1, Math.max(0.005, value));
    document.documentElement.style.setProperty('--ts', String(state.timeScale));
    field.retuneDwell();
    return state.timeScale;
  },

  getJournal: () => book.entries(),

  resetJournal() {
    journal.clear();
    roomsDone.clear();
    roundBugs.length = 0;
    field.clearRoomsDone();
    state.roundAtEntry = deriveRound(config, journal);
    gridSpread.refresh();
    gridEnd.refresh();
    renderPips();
    return state.roundAtEntry;
  },

  getAudioLog: () => voice.getLog(),
  clearAudioLog: () => voice.clearLog(),

  /**
   * §7 QA extra — PROOF that a recorded clip decoded, not merely that the
   * manifest had an entry for it. voice-clips plays every line through one
   * detached `<audio>` (an element in the document would be re-created per
   * clip and lose its iOS unlock), so a harness cannot reach it from the DOM.
   * `readyState >= 2` with a finite duration is the difference between "the
   * m4a really played" and "the browser has no AAC decoder and the child
   * silently got the system speech voice instead".
   */
  getClipMedia: () => (lastClipEl ? {
    key: lastClipKey,
    src: lastClipEl.currentSrc || lastClipEl.src || '',
    readyState: lastClipEl.readyState,
    duration: lastClipEl.duration,
    currentTime: lastClipEl.currentTime,
    paused: lastClipEl.paused,
  } : null),

  // ---- handy, not contractual ----
  getLayout: () => ({
    layout: state.layout,
    scale: field.scene.scale,
    visibleArt: field.scene.visibleArt(),
    reserves: reserves().map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })),
  }),
  reveal: (bugId) => field.reveal(String(bugId)),
  nextRoom: leaveReward,
};
