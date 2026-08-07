// main.js — World Music Dance: boot, screen router, audio, HUD.
//
// A bespoke Stage v2 game (no archetype engine fits map-choose → beat-synced
// dance → copy loop → map placement → persistent collection). Modelled on
// games/red-green-light/js/game.js (router + debug surface) and
// games/story-stones/js/main.js (DOM screens over one Pixi stage).
//
// Ownership split:
//   main.js   — config, audio unlock, the ONE Pixi stage (created lazily and
//               reused), screen routing, HUD, idle prompts, voice, music
//               transport, seeded RNG, fast timers.
//   screens/* — everything a screen draws and everything it lets a child do.
//               Each exports create(ctx) -> { name, destroy, getTargets, tap,
//               winRound, ready? } and touches the world only through `ctx`.
//
// No recorded line is ever spoken before the first gesture: the splash's intro
// is deferred to the Dance-button tap (see the voice-before-unlock rule).

import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as speech from '../../../shared/js/speech.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import * as music from '../../../shared/js/music.js';
import { createStage } from '../../../shared/js/stage/stage.js';
import { shuffle as rngShuffle } from '../../../shared/js/rng.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { unlockAll, installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { LINES } from './lines.js';
import { songById } from './songs.js';
import * as collection from './collection.js';
import { installDebug } from './debug.js';
import { createSplashScreen } from './screens/splash.js';
import { createMapScreen } from './screens/map.js';
import { createDanceScreen } from './screens/dance.js';

const GAME_BASE = new URL('../', import.meta.url);
const FONT_URL = new URL('../../../shared/fonts/fredoka-latin-600-normal.woff2', import.meta.url).href;
const HOME_IMG = new URL('../../../shared/assets/ui/btn-home.png', import.meta.url).href;
const BACK_IMG = new URL('../../../shared/assets/ui/btn-back.png', import.meta.url).href;
const PLAY_IMG = new URL('../../../shared/assets/ui/btn-play.png', import.meta.url).href;
const INSTRUMENTS_URL = new URL('../../../shared/assets/instruments/manifest.json', import.meta.url).href;
/** Which cultures have an assembled pose pack. Written by the art pipeline. */
const POSE_INDEX_URL = new URL('./assets/pose-actors/index.json', GAME_BASE).href;

const IDLE_MS = 14000;

const theme = config.theme || {};
const NIGHT = theme.night || '#141c33';
const PANEL = theme.panel || '#223052';
const GLOW = theme.glow || '#ffd98a';
const CREAM = theme.cream || '#fff3d6';

// --------------------------------------------------------------------- state

const mount = document.getElementById('game');
const cultures = Array.isArray(config.cultures) ? config.cultures : [];

let stage = null;              // the one Pixi stage, created on first need
let stagePromise = null;
let screen = null;             // the live screen object
let screenName = 'splash';
let muted = false;
// Seeded via QLOBE_DEBUG's onSeed (mulberry32, the platform's one PRNG — see
// shared/js/rng.js). Starts on Math.random so unseeded play is still random.
let rng = Math.random;
let destroyed = false;
let poseReady = new Set();     // culture ids with a real pose pack on disk

const reduced = Boolean(window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// The one cancellable, fastTimers()-scalable timer group (shared/js/timers.js)
// — replaces the old hand-rolled `timers` Set + `timeScale` variable.
const timerGroup = createTimers();
const musicState = { songId: null, loopCount: 0, notesScheduled: 0 };
let songHandle = null;

/** The card the child has earned but not yet pinned home: `{ cultureId }`. */
let pending = null;

// ----------------------------------------------------------------- utilities

const cultureById = (id) => cultures.find((c) => c.id === id) || null;

/** Resolve a config-relative asset path ('./assets/x.webp') to a real URL. */
function assetUrl(rel) {
  if (!rel) return '';
  try { return new URL(rel, GAME_BASE).href; } catch { return rel; }
}

/** setTimeout that honours fastTimers() and can be swept on teardown. */
function wait(ms) {
  return timerGroup.wait(ms);
}

/** Scale a tween/animation duration the same way wait() scales a delay. */
function ms(value) {
  return timerGroup.ms(value);
}

/** Cancellable setTimeout that honours fastTimers() — pair with clear(). */
function after(delayMs, fn) {
  return timerGroup.after(delayMs, fn);
}

/** Cancel a pending after() by the id it returned. */
function clear(id) {
  timerGroup.clear(id);
}

/** Fisher–Yates on a copy, using the (optionally seeded) game RNG. */
function shuffle(list) {
  return rngShuffle(list, rng);
}

// --------------------------------------------------------------------- audio

// Every unlock/resume call runs on every qualifying gesture — iPadOS can
// suspend the AudioContext after an app switch, notification, lock, or media
// interruption, and a stale unlock guard would leave later touches resuming
// nothing. shared/js/audio-unlock.js owns that latch (and reopens it on
// visibilitychange/pageshow — the story-stones stale-guard fix); this game
// adds the music engine + the instrument-library load as extras so both ride
// the same fan-out. `ensureInstruments()` stays idempotent on its own promise,
// so calling it again on every re-unlock costs nothing.
const unlockExtras = [() => music.unlock(), () => ensureInstruments()];

/** Manual unlock for call sites that stop propagation before it reaches the
 * window listener below (the HUD home/back buttons) or that want to unlock
 * synchronously inside their own gesture handler. */
function unlockAudio() {
  unlockAll(unlockExtras);
}

let instrumentsPromise = null;
/** Load the shared instrument library once, lazily (it is ~15 decoded files). */
function ensureInstruments() {
  if (!instrumentsPromise) instrumentsPromise = music.init(INSTRUMENTS_URL);
  return instrumentsPromise;
}

// How far the band drops while a voice line plays (1 = full volume).
const VOICE_DUCK_LEVEL = 0.25;
let voiceDuckToken = 0;

/**
 * Speak one line. Recorded clip when the manifest has it, else Web Speech with
 * the frozen script text. Resolves when the line finishes (bounded).
 *
 * The "what was asked, and when" log lives entirely in shared/js/voice-clips.js
 * now (QLOBE_DEBUG's getAudioLog points straight at it) — say()/sayFile() log
 * unconditionally, muted or not, so this function no longer needs its own
 * ring buffer or a `recorded` lookup just to feed one.
 */
function say(key, fallback) {
  if (destroyed) return Promise.resolve();
  const text = fallback || LINES[key] || '';
  // Muted still logs (voice-clips' own contract) but must not duck the band —
  // there is nothing to duck under, and an unduck later would be a stray
  // "restore" with no matching line.
  if (voiceClips.isMuted()) return voiceClips.say(key, text);
  // The band sits back while the teacher talks: duck under the line, restore
  // when it resolves — unless a newer line (or stopVoice) took the bus over.
  const token = ++voiceDuckToken;
  music.duck(VOICE_DUCK_LEVEL, 120);
  const line = voiceClips.say(key, text);
  const restore = () => { if (token === voiceDuckToken) music.duck(1, 350); };
  line.then(restore, restore);
  return line;
}

function stopVoice() {
  voiceClips.stop();
  speech.stop();
  ++voiceDuckToken;   // orphan any pending restore; it must not double-fire
  music.duck(1, 200);
}

function playSfx(name) {
  if (muted || destroyed) return;
  const fn = sfx[name];
  if (typeof fn === 'function') { try { fn(); } catch { /* audio must never throw into play */ } }
}

// --------------------------------------------------------------------- music

/** Band members whose sample exists; missing ones swap in positionally. */
function resolveBand(culture) {
  const have = new Set(music.instrumentIds());
  const band = Array.isArray(culture && culture.band) ? culture.band : [];
  const fallback = Array.isArray(culture && culture.bandFallback) ? culture.bandFallback : [];
  const out = [];
  band.forEach((member, index) => {
    if (member && have.has(member.instr)) { out.push(member); return; }
    const sub = fallback[index];
    if (sub && have.has(sub.instr) && !out.some((m) => m.instr === sub.instr)) out.push(sub);
  });
  if (out.length) return out;
  // Last resort (an unexpected manifest): any three instruments beat silence.
  return [...have].slice(0, 3).map((instr) => ({ instr }));
}

function startSong(culture, { onLoop, onNote } = {}) {
  stopSong();
  const song = songById(culture && culture.song);
  if (!song) return null;
  musicState.songId = song.id;
  musicState.loopCount = 0;
  musicState.notesScheduled = 0;
  songHandle = music.playSong(song, resolveBand(culture), {
    onLoop: (n) => {
      musicState.loopCount = n;
      try { onLoop?.(n); } catch (err) { console.warn('[wmd] onLoop threw', err); }
    },
    onNote: (index, at, event) => {
      musicState.notesScheduled += 1;
      try { onNote?.(index, at, event); } catch (err) { console.warn('[wmd] onNote threw', err); }
    },
  });
  return song;
}

function stopSong() {
  if (songHandle) { try { songHandle.stop(); } catch { /* already stopped */ } }
  songHandle = null;
  music.stopSong();
}

function musicStats() {
  const now = music.songNow();
  return {
    playing: Boolean(music.stats().playing),
    songId: musicState.songId,
    beat: now ? now.loopBeat : null,
    loopCount: musicState.loopCount,
    notesScheduled: musicState.notesScheduled,
  };
}

// ---------------------------------------------------------------------- idle

/** Which phase the countdown below is currently reminding about, and whether
 * that reminder has already fired once for it. */
let idle = { key: null, fired: false };

// "Still there?" on shared/js/idle-nudge.js's timer bookkeeping. This game's
// own ladder is ONE rung, not idle-nudge's repeat: a phase gets reminded
// once, never twice — a child re-shown the same copy prompt a third time in a
// row is nagging, not helping. `nudger.stop()` inside onNudge is what makes
// it one-shot; `armIdle()` below is what gives the NEXT phase a fresh chance.
const nudger = createNudger({
  first: IDLE_MS,
  repeat: IDLE_MS,
  onNudge: () => {
    if (destroyed) return;
    idle.fired = true;
    say('nudge-idle');
    nudger.stop();
  },
});

/** Re-prompt once per phase, never twice. Any gesture restarts the clock. */
function armIdle(key) {
  if (idle.key !== key) idle = { key, fired: false };
  if (idle.fired) return;
  nudger.arm();
}

function pokeIdle() {
  nudger.poke(); // no-op once stopped, i.e. once this phase has already fired
}

function disarmIdle() {
  nudger.stop();
  idle = { key: null, fired: false };
}

// --------------------------------------------------------------------- stage

function getStage() {
  if (!stagePromise) {
    stagePromise = createStage(els.stage).then((created) => { stage = created; return created; });
  }
  return stagePromise;
}

function showStage(visible) {
  els.stage.style.visibility = visible ? 'visible' : 'hidden';
}

// -------------------------------------------------------------------- router

/**
 * Swap screens. `splash` is DOM only; `map` and `dance` are Pixi scenes on the
 * shared stage plus DOM overlays. Always tears the old screen down first so a
 * stale ticker/tween/drag can never outlive it.
 */
async function goto(name, opts = {}) {
  if (destroyed) return null;
  timerGroup.clearAll();
  disarmIdle();
  stopVoice();
  if (screen) {
    const old = screen;
    screen = null;
    try { old.destroy(); } catch (err) { console.warn('[wmd] screen destroy threw', err); }
  }
  els.layer.replaceChildren();
  screenName = name;
  updateHud();
  let next = null;
  if (name === 'dance') next = await createDanceScreen(ctx, opts);
  else if (name === 'map') next = await createMapScreen(ctx, opts);
  else next = await createSplashScreen(ctx, opts);
  if (destroyed) { try { next.destroy(); } catch { /* nothing to keep */ } return null; }
  screen = next;
  screenName = next.name || name;
  updateHud();
  return next;
}

function onBack() {
  playSfx('tick');
  if (screen && typeof screen.onBack === 'function') { screen.onBack(); return; }
  goto('splash');
}

// ------------------------------------------------------------------ DOM shell

const els = { root: null, stage: null, layer: null, hud: null, home: null, back: null };

function buildShell() {
  const style = document.createElement('style');
  style.id = 'wmd-style';
  style.textContent = STYLE;
  document.head.appendChild(style);

  mount.classList.add('wmd-root');
  mount.innerHTML = `
    <div class="wmd">
      <div class="wmd-stage-host"></div>
      <div class="wmd-layer"></div>
      <div class="wmd-hud">
        <a class="wmd-btn wmd-home" href="../../" aria-label="Home"></a>
        <button class="wmd-btn wmd-back" type="button" aria-label="Back" hidden></button>
      </div>
    </div>`;
  els.root = mount.querySelector('.wmd');
  els.stage = mount.querySelector('.wmd-stage-host');
  els.layer = mount.querySelector('.wmd-layer');
  els.hud = mount.querySelector('.wmd-hud');
  els.home = mount.querySelector('.wmd-home');
  els.back = mount.querySelector('.wmd-back');
  els.back.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); unlockAudio(); });
  els.back.addEventListener('click', (e) => { e.preventDefault(); onBack(); });
  els.home.addEventListener('pointerdown', (e) => { e.stopPropagation(); unlockAudio(); playSfx('tick'); });
}

/** Home lives ONLY on the splash; every deeper screen shows back instead. */
function updateHud() {
  const onSplash = screenName === 'splash';
  els.home.hidden = !onSplash;
  els.back.hidden = onSplash;
}

// ------------------------------------------------------------------- context

const ctx = {
  config,
  cultures,
  theme: { night: NIGHT, panel: PANEL, glow: GLOW, cream: CREAM },
  images: { home: HOME_IMG, back: BACK_IMG, play: PLAY_IMG },
  collection,
  get reduced() { return reduced; },
  get muted() { return muted; },
  get screenName() { return screenName; },
  get layer() { return els.layer; },
  get pending() { return pending; },
  setPending(value) { pending = value; },
  cultureById,
  assetUrl,
  poseReady: (id) => poseReady.has(id),
  unlockAudio,
  say,
  stopVoice,
  sfx: playSfx,
  wait,
  ms,
  after,
  clear,
  rng: () => rng(),
  shuffle,
  getStage,
  showStage,
  goto,
  armIdle,
  pokeIdle,
  disarmIdle,
  startSong,
  stopSong,
  songNow: () => music.songNow(),
  musicStats,
  resolveBand,
  songById,
};

// ---------------------------------------------------------------------- boot

async function boot() {
  buildShell();

  // The shared first-gesture unlock (shared/js/audio-unlock.js): fans out to
  // sfx/speech/voice-clips (+ this game's music engine and instrument load,
  // as extras) on the first pointerdown, and REOPENS the latch on
  // visibilitychange/pageshow so a touch after an iPad app-switch genuinely
  // re-unlocks instead of going silent (the story-stones stale-guard fix).
  installUnlockOnGesture({ extra: unlockExtras });
  installKioskGuards();
  // Idle-poke is a separate concern from audio unlock — every pointerdown
  // counts as "still here" regardless of which unlock latch is open.
  window.addEventListener('pointerdown', () => pokeIdle(), { passive: true });
  window.addEventListener('pagehide', () => { stopSong(); stopVoice(); });

  // Both of these are absent until their production phase lands; voice-clips
  // treats a null manifest as "nothing recorded yet" and speaks the frozen
  // script from LINES instead, so the game talks either way.
  const voice = (config.voice && config.voice.clips) || {};
  await voiceClips.init(
    assetUrl(voice.manifest || './assets/audio/manifest.json'),
    assetUrl(voice.lines || './data/lines.json'),
    LINES,
  );
  poseReady = await loadPoseIndex();

  await goto('splash');
  installDebug(ctx, {
    get screen() { return screen; },
    get screenName() { return screenName; },
    timers: timerGroup,
    onSeed(nextRng) { rng = nextRng; },
    setMuted(value) {
      muted = Boolean(value);
      music.setMuted(muted);
      voiceClips.setMuted(muted);
      if (muted) stopVoice();
    },
    goto,
    // Soft, in-page "back to splash" — deliberately NOT the real Home
    // button's hard `../../` navigation (that stays exactly as it was, on
    // els.home below). A debug hook that navigates the page away takes
    // window.QLOBE_DEBUG with it, so a second seeded probe on the same page
    // (QLOBE_DEBUG.seed(42) -> startMode() again, the way a QA driver proves
    // determinism) finds no hook at all. That was the actual cause of this
    // game's `seedDeterministic: false` in the pre-migration baseline — not
    // the RNG. Fixed here; the LCG -> mulberry32 swap below is the other,
    // independently-required half of the fix (cross-game seed comparability).
    home() { goto('splash'); },
  });
}

/**
 * Which cultures have an assembled pose pack. A tiny index file (rather than
 * probing each poses.json) keeps the grey-box build free of 404s: before the
 * art pipeline runs, every culture falls back to the placeholder dancer.
 */
async function loadPoseIndex() {
  try {
    const res = await fetch(POSE_INDEX_URL, { cache: 'no-store' });
    if (!res.ok) return new Set();
    const data = await res.json();
    return new Set(Array.isArray(data && data.ready) ? data.ready : []);
  } catch {
    return new Set();
  }
}

// ----------------------------------------------------------------- stylesheet

/** The cut-paper card face, shared by the splash hero and the move cards. */
const CARD_IMG = assetUrl((config.assets || {}).cardBacking || './assets/ui/card-backing.webp');

const STYLE = `
@font-face { font-family:'Fredoka'; src:url('${FONT_URL}') format('woff2'); font-weight:600; font-style:normal; font-display:swap; }
.wmd-root, .wmd-root * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
.wmd {
  --night:${NIGHT}; --panel:${PANEL}; --glow:${GLOW}; --cream:${CREAM};
  position:relative; width:100%; height:100dvh; min-height:100%; overflow:hidden;
  font-family:'Fredoka','Arial Rounded MT Bold',sans-serif; font-weight:600;
  color:var(--cream);
  background:radial-gradient(120% 90% at 50% 8%, #24305a 0%, var(--night) 62%, #0d1426 100%);
  touch-action:none; user-select:none; -webkit-user-select:none; -webkit-touch-callout:none;
}
.wmd-stage-host { position:absolute; inset:0; }
.wmd-stage-host canvas { display:block; touch-action:none; }
.wmd-layer { position:absolute; inset:0; pointer-events:none; }
.wmd-layer > * { pointer-events:auto; }
.wmd-hud { position:absolute; inset:0; pointer-events:none; z-index:20; }
.wmd-btn {
  position:absolute; top:calc(env(safe-area-inset-top, 0px) + 12px);
  left:calc(env(safe-area-inset-left, 0px) + 12px);
  display:block; width:96px; height:96px; border:0; padding:0;
  background:transparent center/contain no-repeat; pointer-events:auto;
  touch-action:manipulation; cursor:pointer;
  filter:drop-shadow(0 0 14px rgba(255,217,138,.35));
}
.wmd-btn[hidden] { display:none; }
.wmd-btn:active { transform:scale(.94); }
.wmd-home { background-image:url('${HOME_IMG}'); }
.wmd-back { background-image:url('${BACK_IMG}'); }

/* ---- splash ----
   The vertical vignette is doing real work: it darkens top and bottom so the
   title lockup's own gold reads as glow rather than as a flat sticker. The
   title's max-height (not its max-width) is what keeps the CTA on screen at
   820px landscape, so the two caps are deliberately both present. */
.wmd-splash {
  position:absolute; inset:0; display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:clamp(10px,2.4vh,26px);
  padding:calc(env(safe-area-inset-top, 0px) + 24px) 16px calc(env(safe-area-inset-bottom, 0px) + 20px);
  text-align:center;
  background:linear-gradient(180deg,
    rgba(5,9,20,.58) 0%, rgba(5,9,20,.14) 17%, rgba(5,9,20,0) 41%,
    rgba(5,9,20,.20) 72%, rgba(5,9,20,.64) 100%);
}
.wmd-title-art {
  flex:0 1 auto; min-height:0;
  max-width:min(70vw,700px); max-height:min(30vh,260px); object-fit:contain;
  filter:drop-shadow(0 6px 22px rgba(0,0,0,.5)) drop-shadow(0 0 30px rgba(255,217,138,.22));
}
.wmd-title-text {
  margin:0; font-size:clamp(34px,7.6vw,74px); line-height:1.02; letter-spacing:.01em;
  color:var(--cream); text-shadow:0 0 26px rgba(255,217,138,.5), 0 6px 0 rgba(0,0,0,.28);
}
.wmd-title-text span { display:block; color:var(--glow); }
/* The hero keeps the card art's own 512:708 proportion — stretching a stitched
   paper border to a tidier ratio is exactly the tell that gives away fake art. */
.wmd-hero {
  position:relative; flex:0 1 auto; min-height:0;
  height:clamp(240px,44vh,400px); aspect-ratio:512/708;
  display:flex; align-items:center; justify-content:center;
  transform:rotate(-3deg);
  filter:drop-shadow(0 14px 24px rgba(0,0,0,.55)) drop-shadow(0 0 36px rgba(255,217,138,.4));
}
.wmd-hero-card { position:absolute; inset:0; width:100%; height:100%; object-fit:fill; }
/* Square pose canvas, tall narrow dancer: sizing by height overhangs the card
   sideways, but only with transparent margin, so the dancer fills the mount. */
.wmd-hero-pose {
  position:absolute; left:50%; top:6%; height:87%; width:auto; max-width:none;
  transform:translateX(-50%);
}
.wmd-hero-glyph { position:relative; display:none; font-size:clamp(54px,11vh,92px); }
.wmd-hero.no-card {
  border-radius:22px; background:linear-gradient(160deg, #2c3c6b, var(--panel));
  border:3px solid rgba(255,217,138,.55);
}
.wmd-hero.no-card .wmd-hero-card { display:none; }
.wmd-hero.no-pose .wmd-hero-pose { display:none; }
.wmd-hero.no-pose .wmd-hero-glyph { display:block; }
.wmd-cta {
  display:inline-flex; align-items:center; justify-content:center; gap:16px;
  min-width:200px; min-height:104px; padding:0 40px;
  border:0; border-radius:56px; cursor:pointer; touch-action:manipulation;
  font:inherit; font-size:clamp(24px,4.4vw,38px); color:#3a2408;
  background:linear-gradient(180deg,#ffe6ae,var(--glow));
  box-shadow:0 8px 0 #b8873a, 0 0 40px rgba(255,217,138,.4);
}
/* The shared btn-play.png is painted white for dark HUD discs and disappears
   completely on these cream buttons, so the glyph is inline SVG in the same
   brown as the label — one icon that cannot 404 and cannot vanish. */
.wmd-note { flex:0 0 auto; width:34px; height:34px; display:block; color:#7a4a1f; }
.wmd-cta:active { transform:translateY(4px); box-shadow:0 4px 0 #b8873a, 0 0 30px rgba(255,217,138,.4); }

/* ---- dance overlays ---- */
.wmd-dance-dom { position:absolute; inset:0; pointer-events:none; }
.wmd-dance-dom > * { pointer-events:auto; }
/* A class rule with display:flex outranks the UA [hidden] rule, so say it here. */
.wmd-rail[hidden], .wmd-cards[hidden], .wmd-turn[hidden] { display:none; }
/* --wmd-rail-top is written by dance.js from the cover-fitted backdrop rect, so
   the rail lands in the calm sky UNDER the bunting whatever shape the window
   is. The literal here is only the pre-first-layout value. */
.wmd-rail {
  position:absolute; left:50%; transform:translateX(-50%);
  top:var(--wmd-rail-top, calc(env(safe-area-inset-top, 0px) + 120px));
  display:flex; gap:20px; padding:14px 26px; border-radius:44px;
  background:rgba(20,28,51,.66); border:2px solid rgba(255,217,138,.34);
  box-shadow:0 6px 22px rgba(0,0,0,.4);
  backdrop-filter:blur(3px);
}
/* Three readings at a glance: done is solid gold, the step you are on is a lit
   ring, still-to-come is a pale paper disc. All three have to survive being
   laid over lantern light, so none of them may be a dark hole. */
.wmd-dot {
  width:44px; height:44px; border-radius:50%;
  background:rgba(255,243,214,.4); border:3px solid rgba(255,217,138,.62);
  transition:background-color .2s ease, border-color .2s ease, box-shadow .2s ease;
}
.wmd-dot.active {
  background:rgba(255,217,138,.5); border-color:var(--glow);
  box-shadow:0 0 18px rgba(255,217,138,.6);
}
.wmd-dot.beat { animation:wmd-dot-beat .36s ease-out; }
.wmd-dot.done {
  background:var(--glow); border-color:var(--glow);
  box-shadow:0 0 22px rgba(255,217,138,.9);
}
@keyframes wmd-dot-beat {
  0% { transform:scale(1); box-shadow:0 0 0 0 rgba(255,217,138,.75); }
  42% { transform:scale(1.32); box-shadow:0 0 0 12px rgba(255,217,138,0); }
  100% { transform:scale(1); box-shadow:0 0 0 0 rgba(255,217,138,0); }
}
.wmd-cards {
  position:absolute; left:0; right:0; bottom:calc(env(safe-area-inset-bottom, 0px) + 18px);
  display:flex; justify-content:center; align-items:flex-end; gap:clamp(12px,3vw,34px);
  padding:0 12px; flex-wrap:wrap;
}
/* LANDSCAPE COPY PHASE: a row along the bottom of a wide window lands exactly
   on the dancer's shins. The cards become a column beside her instead — every
   number here is written by dance.js layoutCards() off the real stage rect, so
   the column tracks a resize or an orientation flip mid-phase. Portrait keeps
   the row above and never sees this rule (dance.js only sets .side when w > h). */
.wmd-cards.side {
  left:var(--wmd-cards-x, 76%); right:auto;
  top:var(--wmd-cards-y, 50%); bottom:auto;
  transform:translate(-50%,-50%);
  flex-direction:column; flex-wrap:nowrap; align-items:center; justify-content:center;
  gap:var(--wmd-card-gap, 12px); padding:0;
}
/* Height-driven, so the 4:5 aspect-ratio derives the width: a 150px card is
   120px wide, which is the touch-target floor dance.js clamps to. */
.wmd-cards.side .wmd-move {
  width:auto; min-width:0; height:var(--wmd-card-h, 170px); min-height:150px;
}
/* Paper cards, not UI panels: the same stitched cream backing the hero and the
   earned card use, so against the night stage they read as things you could
   pick up. The face is the art itself, which means the drop shadow has to be a
   filter — a box-shadow would trace the square element through the card's
   transparent rounded corners. */
.wmd-move {
  position:relative; width:clamp(120px,17vw,168px); min-width:120px; min-height:150px;
  aspect-ratio:4/5; border:0; padding:0; cursor:pointer; touch-action:manipulation;
  font:inherit; color:#5a4118; font-size:clamp(13px,1.5vw,17px);
  display:flex; align-items:center; justify-content:center;
  background:url('${CARD_IMG}') center/100% 100% no-repeat;
  filter:drop-shadow(0 7px 7px rgba(0,0,0,.5)) drop-shadow(0 0 18px rgba(255,217,138,.2));
}
/* Sized against the card, not the pose canvas: the art is a square with wide
   transparent margins, so the box overhangs a little and the DANCER fills. */
.wmd-move img {
  position:absolute; left:50%; top:52%; transform:translate(-50%,-50%);
  width:104%; height:82%; object-fit:contain; pointer-events:none;
}
.wmd-move .wmd-move-glyph { font-size:clamp(48px,7.4vw,72px); line-height:1; }
.wmd-move:active { transform:translateY(3px); }
.wmd-move.wrong { animation:wmd-wiggle .42s ease; }
.wmd-move.hint { animation:wmd-hint 1.5s ease-in-out infinite; }
.wmd-move[disabled] { opacity:.55; cursor:default; }
@keyframes wmd-wiggle {
  0%,100% { transform:rotate(0); } 20% { transform:rotate(-5deg); }
  45% { transform:rotate(5deg); } 70% { transform:rotate(-3deg); }
}
@keyframes wmd-hint {
  0%,100% { filter:drop-shadow(0 7px 7px rgba(0,0,0,.5)) drop-shadow(0 0 12px rgba(255,217,138,.4)); }
  50% { filter:drop-shadow(0 7px 7px rgba(0,0,0,.5)) drop-shadow(0 0 30px rgba(255,217,138,1)); }
}
.wmd-turn {
  position:absolute; left:50%; bottom:calc(env(safe-area-inset-bottom, 0px) + 26px);
  transform:translateX(-50%);
  display:flex; align-items:center; justify-content:center; gap:16px;
  min-width:200px; min-height:110px; padding:0 38px;
  border:0; border-radius:56px; cursor:pointer; touch-action:manipulation;
  font:inherit; font-size:clamp(22px,4vw,34px); color:#3a2408;
  background:linear-gradient(180deg,#ffe6ae,var(--glow));
  box-shadow:0 8px 0 #b8873a, 0 0 40px rgba(255,217,138,.45);
  animation:wmd-pulse 1.4s ease-in-out infinite;
}
/* landscape: sit beside the dancer (where the copy-phase card column lands),
   clear of her feet on the platform */
@media (orientation: landscape) {
  .wmd-turn { left:76%; bottom:auto; top:50%; transform:translate(-50%,-50%); }
  @keyframes wmd-pulse { 0%,100% { transform:translate(-50%,-50%) scale(1); } 50% { transform:translate(-50%,-50%) scale(1.05); } }
}
@keyframes wmd-pulse { 0%,100% { transform:translateX(-50%) scale(1); } 50% { transform:translateX(-50%) scale(1.05); } }
@media (prefers-reduced-motion: reduce) {
  .wmd-turn, .wmd-move.hint, .wmd-dot.beat { animation:none; }
  .wmd-dot { transition:none; }
}
`;

// ------------------------------------------------------------------ liftoff

boot().catch((error) => {
  console.error('[world-music-dance] boot failed', error);
  destroyed = true;
  if (mount) {
    mount.innerHTML = '<p style="padding:2rem;color:#fff3d6;font-family:sans-serif">'
      + 'World Music Dance could not start.</p>';
  }
});
