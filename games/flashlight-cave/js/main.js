// main.js — boot Flashlight Cave: load config + voice, unlock audio on the first
// gesture, route splash ⇄ play/reveal/end, wire the HUD, mount the static screen
// when there is no WebGL, and install window.QLOBE_DEBUG v1.
//
// NAVIGATION (docs/interaction-patterns.md §8, game-design.md §3):
//   splash  → HOME only (../../, the catalog). No back, no sound.
//   play / reveal / end → BACK only, returning to the splash IN PAGE.
//   the end screen's big play button → the SPLASH, not into the mode just played,
//   so the child re-chooses rather than being trapped in a loop.
//
// AUDIO UNLOCK (§3.0): no recorded line is ever spoken on page load. `ari-welcome`
// is ARMED and delivered on the first gesture — a clip played before the unlock
// silently degrades to the system speech voice, which is exactly the bug this
// block exists to prevent. If the child's first gesture is a mode tile the
// welcome is skipped entirely: a welcome they have already walked past is noise.
//
// PIXI IS NOT ON THE BOOT PATH. stage.js:loadPixi() is lazy and is only reached
// from createCave(), so the splash paints before the 798 KB vendor bundle is
// touched and the download overlaps the child looking at the tiles.

import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as speech from '../../../shared/js/speech.js';
import { onTap } from '../../../shared/js/tap.js';
import * as voice from './voice.js';
import { loadActors } from './actor.js';
import { createCave, createTransform } from './cave.js';
import { Game } from './game.js';

const mount = document.getElementById('game');

const UI = {
  home: new URL('../../../shared/assets/ui/btn-home.png', import.meta.url).href,
  back: new URL('../../../shared/assets/ui/btn-back.png', import.meta.url).href,
  sound: new URL('../../../shared/assets/ui/btn-sound.png', import.meta.url).href,
  play: new URL('../../../shared/assets/ui/btn-play.png', import.meta.url).href,
};
const APPLE = '../../shared/assets/objects/apple.png';

const SPLASH_IDLE_1 = 15000;
const SPLASH_IDLE_2 = 35000;

let game = null;
let cave = null;
let actors = {};
let currentMode = null;
let starting = false;
let audioUnlocked = false;
let greeted = false;
let screen = 'splash';
let timeScale = 1;
let rng = Math.random;
let splashTimers = [];

/** Page-lifetime state: which one-per-session lines have been spoken. */
const session = {
  saidDark: false,
  saidHintMove: false,
  touched: false,
  firstSuccess: true,
  unlockAudio: () => unlockAudio(),
};

const ready = (async () => { await voice.init(config.voice); })();

// ---- audio unlock on the first gesture -------------------------------------

function unlockAudio() {
  // voice.unlock() stays armed until the clip channel has actually played, so it
  // runs on every gesture — otherwise recorded voice can fail on iPad and fall
  // back to Web Speech for the whole session.
  voice.unlock();
  if (audioUnlocked) return;
  audioUnlocked = true;
  sfx.unlock();
  speech.unlock();
  if (!greeted && screen === 'splash') {
    greeted = true;
    voice.say('ari-welcome');
    splashSpeak('enter');
  }
}
window.addEventListener('pointerdown', unlockAudio);

// ---- screens ----------------------------------------------------------------

function modeFace(m) {
  // No tile carries a word. The circle-of-light motif is shared by all three, so
  // the row reads as "three ways to play the same game" (§3.1).
  if (m.id === 'picture') {
    return `<span class="fc-mode-icon"><img src="${APPLE}" alt="" draggable="false" /></span>`;
  }
  const waves = m.id === 'sound'
    ? `<svg class="fc-mode-waves" viewBox="0 0 60 100" aria-hidden="true">
         <path d="M10 30 Q26 50 10 70" /><path d="M26 20 Q48 50 26 80" />
         <path d="M42 12 Q70 50 42 88" /></svg>`
    : '';
  return `<span class="fc-mode-icon"><span class="fc-mode-letter">A</span>${waves}</span>`;
}

function splashHTML() {
  const tiles = config.modes.map((m) => `
    <button class="fc-mode" type="button" data-mode="${m.id}" aria-label="${m.title}">
      ${modeFace(m)}
    </button>`).join('');
  return `
    <section class="fc-screen fc-splash">
      <img class="fc-splash-art" src="${config.art.splash}" alt="" draggable="false" />
      <a class="hud-button hud-img hud-home" href="../../" aria-label="${config.copy.home}"
         style="background-image:url('${UI.home}')"></a>
      <h1 class="fc-title"><span>Flashlight</span><span>Cave</span></h1>
      <div class="fc-modes">${tiles}</div>
      <div class="fc-actors"></div>
    </section>`;
}

function playHTML() {
  return `
    <section class="fc-screen fc-play">
      <!-- DOM order is the tab order §15 asks for: back → sound → canvas →
           (on reveal) the play button. The stage still paints underneath,
           because every HUD control carries a z-index and it does not. -->
      <button class="hud-button hud-img hud-back" type="button" aria-label="${config.copy.back}"
              style="background-image:url('${UI.back}')"></button>
      <button class="hud-button hud-img hud-sound" type="button" aria-label="${config.copy.replay}"
              style="background-image:url('${UI.sound}')"></button>
      <div class="fc-stage" tabindex="0" role="application"
           aria-label="Dark cave. Move the light to find letters."></div>
      <div class="fc-actors"></div>
      <div class="fc-pips"></div>
      <button class="fc-round-btn hidden" type="button" aria-label="${config.copy.playAgain}"
              style="background-image:url('${UI.play}')"></button>
      <p class="fc-sr-only" aria-live="polite"></p>
    </section>`;
}

function teardown() {
  clearSplashIdle();
  if (game) { game.destroy(); game = null; }
  if (cave) { cave.destroy(); cave = null; }
}

function clearSplashIdle() {
  for (const t of splashTimers) clearTimeout(t);
  splashTimers = [];
}

/**
 * §3.6 "Back, from anywhere": stop all audio, clear every timer, end any drag,
 * dispose the round's handlers and the spotlight subscriber, clearTargets(), and
 * mount the splash. Safe mid-drag, mid-reveal and mid-animation, and it never
 * navigates. Session state survives; round state does not.
 */
function showSplash() {
  teardown();
  starting = false;
  screen = 'splash';
  currentMode = null;
  voice.stop();
  speech.stop();
  mount.innerHTML = splashHTML();
  for (const btn of mount.querySelectorAll('.fc-mode')) {
    onTap(btn, () => startMode(btn.dataset.mode), {
      // Marking `greeted` here is what makes the welcome skip when the child's
      // very first gesture is a mode tile.
      feedback: (e) => { e.preventDefault(); greeted = true; unlockAudio(); sfx.tick(); },
    });
  }
  hostActors();

  // Only attempt a recorded greeting once the page HAS an unlocked channel —
  // a play() before that is what slips a line into the synth voice.
  if (audioUnlocked && !greeted) {
    greeted = true;
    voice.say('ari-welcome');
    splashSpeak('enter');
  }

  // If the child does nothing: a paw at 15 s, one more line at 35 s. Nothing
  // else, ever — no attract loop that steals the screen.
  splashTimers.push(setTimeout(() => {
    if (screen !== 'splash') return;
    voice.say('ari-idle-1');
    splashSpeak('notice');
  }, SPLASH_IDLE_1 * timeScale));
  splashTimers.push(setTimeout(() => {
    if (screen !== 'splash') return;
    voice.say('ari-idle-2');
    splashSpeak('notice');
  }, SPLASH_IDLE_2 * timeScale));
}

/**
 * §3.1 has Ari standing lower-left for the whole splash, and taken literally that
 * is wrong: the splash lays the three mode tiles across the bottom, so a
 * bottom-left-anchored armadillo stands squarely on the `find` tile's glowing A
 * — the one thing on that screen the child has to be able to see. So he keeps the
 * left edge but stands ABOVE the tile row, in the free cave rock, which is also
 * where mockup 01 puts him. The row's top is measured rather than guessed,
 * because it moves between row (landscape) and column (portrait) layouts.
 */
function placeSplashActor() {
  const a = actors.ari;
  const modes = mount.querySelector('.fc-modes');
  if (!a || !modes) return;
  const top = modes.getBoundingClientRect().top;
  const foot = Math.max(0, window.innerHeight - top) + 10;
  a.el.style.setProperty('--actor-foot', `${Math.round(foot)}px`);
}

function splashSpeak(pose) {
  const a = actors.ari;
  if (!a) return;
  placeSplashActor();
  a.show(pose);
  splashTimers.push(setTimeout(() => { if (screen === 'splash') a.hide(); }, 4600 * timeScale));
}

async function startMode(modeId, { fallback = false } = {}) {
  if (starting) return;
  starting = true;
  await ready;
  teardown();
  currentMode = modeId;
  screen = 'play';
  voice.stop();
  mount.innerHTML = playHTML();
  hostActors();

  const root = mount.querySelector('.fc-play');
  const stage = root.querySelector('.fc-stage');
  wireHud(root);

  // The mode intro speaks over the mount, so Pixi and the plate download while
  // Ari is still talking (§3.1).
  const mode = config.modes.find((m) => m.id === modeId) || config.modes[0];
  const introDone = speakIntro(mode);

  if (!fallback) {
    try {
      cave = await createCave(stage, config, {
        onContextLost: () => {
          if (screen === 'splash') return;
          starting = false;
          startMode(currentMode, { fallback: true });
        },
      });
    } catch {
      cave = null;                                  // no WebGL → the §3.5 screen
    }
  }
  if (!cave) mountFallbackPlate(stage);

  game = new Game({
    config, modeId, root, actors, cave, session, introDone,
    // The splash mounts FIRST — showSplash() stops all audio, so a line spoken
    // before it never gets past its first syllable.
    onExit: () => { showSplash(); voice.say('ari-again'); splashSpeak('celebrate'); },
  });
  game.rng = rng;
  game.timeScale = timeScale;
  try {
    await game.start();
  } finally {
    starting = false;
  }
}

function speakIntro(mode) {
  if (!mode.introKey) return Promise.resolve();
  const cap = Math.max(1200, voice.duration(mode.introKey) * 1000 + 300);
  actors.ari?.show('enter');
  const said = voice.say(mode.introKey);
  return Promise.race([said, new Promise((r) => setTimeout(r, cap * timeScale))]);
}

/** §3.5: the plate at 55 % darkness under DOM letters. ~40 lines, same game. */
function mountFallbackPlate(stage) {
  const img = document.createElement('img');
  img.className = 'fc-fallback-plate';
  img.alt = '';
  img.draggable = false;
  img.src = config.art.play;
  stage.appendChild(img);
  stage.classList.add('is-fallback');
}

/** Move the DOM actor layer into whichever screen is mounted. */
function hostActors() {
  const host = mount.querySelector('.fc-actors');
  if (!host) return;
  for (const actor of Object.values(actors)) {
    host.appendChild(actor.el);
    actor.el.style.left = '';
    actor.el.style.removeProperty('--actor-foot');
    actor.hide();
  }
}

// The tile row moves when the orientation changes, so the splash actor's perch
// has to be re-measured. Cheap, and only while the splash is up.
window.addEventListener('resize', () => { if (screen === 'splash') placeSplashActor(); });

function wireHud(root) {
  const back = root.querySelector('.hud-back');
  if (back) onTap(back, () => { sfx.tick(); showSplash(); });

  const sound = root.querySelector('.hud-sound');
  if (sound) {
    let last = 0;
    onTap(sound, () => {
      const now = performance.now();
      if (now - last < 600) return;              // debounce so rapid taps can't stack
      last = now;
      sfx.tick();
      game?.replayPrompt();
    });
  }
  // A corner tap must never also move the beam.
  for (const el of root.querySelectorAll('.hud-button')) {
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
}

// ---- boot -------------------------------------------------------------------

const booted = (async () => {
  await ready;
  const host = document.createElement('div');
  host.className = 'fc-actors';
  host.style.display = 'none';
  document.body.appendChild(host);
  actors = await loadActors(host, {
    ari: { pack: './assets/pose-actors/ari/poses.json', side: 'left', scale: 1 },
  });
  host.remove();
  showSplash();
})();

// ---- window.QLOBE_DEBUG v1 + the four beam extensions (§16) -----------------

window.QLOBE_DEBUG = {
  version: 1,
  gameId: config.id,
  engine: config.engine,
  ready: booted,
  listModes: () => config.modes.map((m) => ({ id: m.id, title: m.title })),
  startMode: async (id) => { await startMode(id); return window.QLOBE_DEBUG.getState(); },
  getState: () => (game && screen !== 'splash'
    ? game.debugState()
    : {
      screen,
      mode: currentMode,
      round: 0,
      roundsTotal: config.rounds.length,
      awaitingInput: false,
      reducedMotion: !!(window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
      quality: 'none',
    }),
  // `rect` is in SCREEN px so the gate can click it; `lit`/`litness` are art-space
  // truths and are the point of the whole surface — they are what let the gate
  // assert that a tap on an UNLIT correct target is not an attempt (§6.4).
  getTargets: () => (game ? game.getTargets() : []),
  tap: async (id) => (game ? game.tapById(id) : { accepted: false, reason: 'no-game' }),
  winRound: async () => { await game?.winRound(); return window.QLOBE_DEBUG.getState(); },
  mute: () => {
    voice.setMuted(true);
    speech.stop();
    voice.stop();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    document.querySelectorAll('audio, video').forEach((el) => { el.muted = true; });
    window.QLOBE_DEBUG.muted = true;
  },
  seed: (n) => {
    let s = (n >>> 0) || 1;
    rng = () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
    window.QLOBE_DEBUG._rng = rng;
    if (game) game.rng = rng;
    return n;
  },
  /** Compress every timed beat so QA does not sit through celebrations. */
  fastTimers: (scale = 0.05) => {
    timeScale = scale;
    if (game) game.timeScale = scale;
    return scale;
  },
  home: () => showSplash(),

  // --- beam extensions. ART space (§4.2), so QA is resolution-independent. ---
  getBeam: () => (game ? game.getBeam() : { x: 0, y: 0, radius: 0, quality: 'none' }),
  /** The picture-mode ledge object's art position + screen rect, or null. */
  getLedge: () => (game ? game.getLedge() : null),
  /** The flashlight decoration: its art position and which way it faces. */
  getTorch: () => (game && game.cave ? game.cave.torchState() : null),
  moveBeam: (x, y) => (game ? game.moveBeam(x, y) : null),
  lightTarget: async (id) => (game ? game.lightTarget(id) : false),
  perf: () => (cave ? cave.metrics() : { fps: 0, ms: 0, quality: 'none', draws: 0 }),
  // The runtime only ever DEMOTES down the quality ladder, and only on a slow
  // device, so the 'flat' look would otherwise be unreachable from a desktop
  // gate. This forces a rung so QA can prove the game still completes there.
  // Read-only in spirit: it drives the same spotlight.setQuality() the auto
  // ladder drives, and nothing else in the game consults it.
  setQuality: (q) => {
    cave?.spotlight.setQuality(q);
    return cave ? cave.spotlight.quality : 'none';
  },

  // Handy for a resolution-independent gate; not part of the v1 contract.
  toScreen: (x, y) => (cave ? cave.transform.toScreen(x, y) : createTransform(config.art.space).toScreen(x, y)),
  tickerStarted: () => !!(cave && cave.app.ticker.started),
};

// ---- iPad niceties ----------------------------------------------------------

window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  try { if (window.speechSynthesis) window.speechSynthesis.resume(); } catch { /* ignore */ }
});
