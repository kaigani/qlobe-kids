// main.js — boot Counting Treasure Cups: load config + voice, unlock audio and
// video on the first gesture, route splash ⇄ play ⇄ end, wire the HUD, and
// install the window.QLOBE_DEBUG v1 contract.
//
// Navigation follows docs/interaction-patterns.md §8: the splash carries the
// round HOME button to the catalog (../../) and nothing else does; play and end
// carry BACK, which returns to the splash in-page.

import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import { onTap } from '../../../shared/js/tap.js';
import { renderModeCards } from '../../../shared/js/mode-select.js';
import { soundDebounce } from '../../../shared/js/hud.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import * as voice from './voice.js';
import { loadPoseActors } from '../../../shared/js/stage/pose-sprite-dom.js';
import { Game, CONFETTI_COLORS } from './game.js';
import { blessMedia } from './stage.js';

const mount = document.getElementById('game');

const UI = {
  home: new URL('../../../shared/assets/ui/btn-home.png', import.meta.url).href,
  back: new URL('../../../shared/assets/ui/btn-back.png', import.meta.url).href,
  sound: new URL('../../../shared/assets/ui/btn-sound.png', import.meta.url).href,
  play: new URL('../../../shared/assets/ui/btn-play.png', import.meta.url).href,
};

let game = null;
let actors = {};
let currentMode = null;
let starting = false;
let greeted = false;
let screen = 'splash';
let endBurst = null;

const ready = (async () => {
  await voice.init(config.voice);
})();

// ---- audio + video unlock on the first gesture -----------------------------

// The shared listener fans out to sfx/speech/voice-clips/audio and reopens its
// latch whenever the page comes back to the foreground, so an iPad app-switch
// can no longer leave the game silent for the rest of the session.
installUnlockOnGesture({
  onFirst: () => {
    // Once only, and only for a video that is NOT already running — see blessMedia.
    // A muted loop autoplays unaided; this just covers a browser that blocked it.
    for (const v of document.querySelectorAll('video')) blessMedia(v);
    // User activation does not survive a page load, so the welcome usually cannot
    // play until something is touched. Deliver it on that first touch instead of
    // dropping it — a child who lands on the splash always gets greeted.
    if (!greeted && screen === 'splash') {
      greeted = true;
      voice.say('cap-welcome');
      actors.captain?.show('enter');
      setTimeout(() => actors.captain?.hide(), 4200);
    }
  },
});

// voice.unlock() stays armed until the clip channel has actually PLAYED, so it
// runs on every gesture rather than only while the shared latch is open —
// otherwise a first attempt the browser refuses is never retried and recorded
// voice falls back to Web Speech for the rest of the session.
window.addEventListener('pointerdown', () => voice.unlock(), { passive: true });

// ---- screens ---------------------------------------------------------------

/** The mode icon is the game's own art wherever possible — an emoji stand-in
 *  (a toolbox for "Big Treasure") misleads a child who cannot read the label. */
function modeFace(m) {
  return m.iconArt
    ? `<span class="ctc-mode-icon"><img src="${m.iconArt}" alt="" draggable="false" />` +
      (m.iconText ? `<span class="ctc-mode-icon-text">${m.iconText}</span>` : '') + '</span>'
    : `<span class="ctc-mode-icon" aria-hidden="true">${m.icon || '⭐'}</span>`;
}

function splashHTML() {
  return `
    <section class="ctc-screen ctc-splash">
      <img class="ctc-splash-art" src="./assets/splash.jpg" alt="" draggable="false" />
      <a class="hud-button hud-img hud-home" href="../../" aria-label="${config.copy.home}"
         style="background-image:url('${UI.home}')"></a>
      <h1 class="ctc-title">${config.title}</h1>
      <div class="ctc-modes"></div>
    </section>`;
}

function playHTML() {
  return `
    <section class="ctc-screen ctc-play">
      <div class="ctc-stage"></div>
      <div class="ctc-actors"></div>
      <button class="hud-button hud-img hud-back" type="button" aria-label="${config.copy.back}"
              style="background-image:url('${UI.back}')"></button>
      <div class="ctc-banner">
        <span class="ctc-target">0</span>
        <span class="ctc-pips"></span>
      </div>
      <button class="hud-button hud-img hud-sound" type="button" aria-label="${config.copy.replay}"
              style="background-image:url('${UI.sound}')"></button>
      <div class="ctc-tray"></div>
      <div class="ctc-choices hidden"></div>
      <button class="ctc-again hud-img hidden" type="button" aria-label="${config.copy.playAgain}"
              style="background-image:url('${UI.play}')"></button>
    </section>`;
}

function endHTML() {
  return `
    <section class="ctc-screen ctc-end">
      <img class="ctc-end-bg" src="./assets/beach-poster.jpg" alt="" draggable="false" />
      <img class="ctc-end-art" src="./assets/chest-full.png" alt="" draggable="false" />
      <button class="hud-button hud-img hud-back" type="button" aria-label="${config.copy.back}"
              style="background-image:url('${UI.back}')"></button>
      <div class="ctc-end-buttons">
        <button class="ctc-again ctc-end-again hud-img" type="button" aria-label="${config.copy.playAgain}"
                style="background-image:url('${UI.play}')"></button>
      </div>
    </section>`;
}

function teardownGame() {
  if (game) { game.destroy(); game = null; }
}

/** Take down the end-screen burst (the in-round one belongs to the Game). */
function clearConfetti() {
  if (endBurst) { endBurst(); endBurst = null; }
}

function showSplash() {
  teardownGame();
  starting = false;
  screen = 'splash';
  voice.stop();
  clearConfetti();
  mount.innerHTML = splashHTML();
  renderModeCards({
    host: mount.querySelector('.ctc-modes'),
    // Strip icon/iconArt/iconText from the copy passed in so modeCard()'s own
    // no-art-then-icon fallback never fires — modeFace() (via decorate) is
    // the only thing that renders the icon, unchanged from before.
    modes: config.modes.map(({ icon, iconArt, iconText, ...mode }) => mode),
    skin: false, // .ctc-mode keeps its own pixel-for-pixel look; only the
                 // shared .qk-mode-card touch-floor contract is added (a
                 // no-op — .ctc-mode's own 150px/96px mins already clear it).
    cardClass: 'ctc-mode',
    showTitle: false, // decorate() builds the .ctc-mode-title span itself —
                       // the built-in title uses a different class name.
    targetPrefix: null, // unchanged QA-target surface: these tiles never had one
    decorate(btn, mode, index) {
      const original = config.modes[index];
      btn.insertAdjacentHTML('afterbegin', modeFace(original));
      const title = document.createElement('span');
      title.className = 'ctc-mode-title';
      title.textContent = original.title;
      btn.append(title);
    },
    onPick: (id) => startMode(id),
    feedback: (e) => { e.preventDefault(); sfx.tick(); },
  });
  hostActors();
  // Try to greet immediately; if the browser blocks it (no user activation yet)
  // the first-gesture handler above delivers the same line on the first touch.
  voice.trySay('cap-welcome').then((played) => {
    if (!played) return;
    greeted = true;
    actors.captain?.show('enter');
    setTimeout(() => actors.captain?.hide(), 4200);
  });
}

async function startMode(modeId) {
  if (starting) return;
  starting = true;
  await ready;
  teardownGame();
  currentMode = modeId;
  screen = 'play';
  voice.stop();
  clearConfetti();
  mount.innerHTML = playHTML();
  hostActors();

  const root = mount.querySelector('.ctc-play');
  wireHud(root);
  game = new Game({
    config,
    modeId,
    root,
    actors,
    onFinish: () => showEnd(),
  });
  // A seed set on the splash has to reach the Game this mode is about to build,
  // not just one that already existed when seed() was called.
  if (seedRng) game.rng = seedRng;
  // try/finally: if start() ever throws, `starting` must not latch on and lock
  // the child out of every mode for the rest of the session.
  try {
    await game.start();
  } finally {
    starting = false;
  }
}

function showEnd() {
  teardownGame();
  screen = 'end';
  mount.innerHTML = endHTML();
  hostActors();
  wireHud(mount.querySelector('.ctc-end'));
  // The end-of-game button returns to the SPLASH, not into the same mode again:
  // after finishing a stage the child should get the choice of all three.
  const again = mount.querySelector('.ctc-end-again');
  onTap(again, () => { sfx.tick(); showSplash(); },
    { feedback: (e) => { e.preventDefault(); sfx.tick(); } });
  sfx.tada();
  clearConfetti();
  endBurst = burstConfetti({ host: mount, count: 150, palette: CONFETTI_COLORS });
  actors.captain?.show('celebrate');
  voice.say('cap-end');
}

/** Move the actor layer into whichever screen is mounted. */
function hostActors() {
  const host = mount.querySelector('.ctc-actors') || ensureActorHost();
  for (const actor of Object.values(actors)) {
    host.appendChild(actor.el);
    actor.hide();
  }
}

function ensureActorHost() {
  let host = mount.querySelector('.ctc-actors');
  if (!host) {
    host = document.createElement('div');
    host.className = 'ctc-actors';
    mount.querySelector('.ctc-screen')?.appendChild(host);
  }
  return host;
}

function wireHud(root) {
  const back = root.querySelector('.hud-back');
  if (back) onTap(back, () => { sfx.tick(); showSplash(); });

  const sound = root.querySelector('.hud-sound');
  if (sound) {
    // soundDebounce: swallow presses inside 600ms so rapid taps can't stack.
    onTap(sound, soundDebounce(() => {
      sfx.tick();
      game?.replayPrompt();
    }));
  }
  // A corner tap must never also reach the play field.
  for (const el of root.querySelectorAll('.hud-button')) {
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
}

// ---- boot ------------------------------------------------------------------

const booted = (async () => {
  await ready;
  const host = document.createElement('div');
  host.className = 'ctc-actor-preload';
  document.body.appendChild(host);
  // `ctc-actor` is this game's own skin (css/style.css owns the edge slide-in,
  // the foot line and the per-side transforms); the shared module owns the pack
  // format and the paper-pop. `side` and `scale` come from each config entry.
  actors = await loadPoseActors(host, config.actors, { className: 'ctc-actor' });
  host.remove();
  showSplash();
})();

// ---- window.QLOBE_DEBUG v1 (review automation depends on this) -------------

// `seedRng` outlives any one Game: seed(42) is normally called BEFORE
// startMode(), and the generator has to survive into the instance that mode
// creates or the run is not reproducible after all.
let seedRng = null;

installDebug({
  gameId: config.id,
  engine: config.engine,
  ready: booted,
  listModes: () => config.modes.map((m) => ({ id: m.id, title: m.title })),
  startMode: async (id) => {
    await startMode(id);
    return game?.debugState();
  },
  getState: () => (game ? game.debugState() : { screen, mode: currentMode, round: 0, roundsTotal: 0, awaitingInput: false }),
  getTargets: () => (game ? game.getTargets() : []),
  tap: async (id) => {
    if (!game) return { accepted: false, reason: 'no-game' };
    return game.attempt(id);
  },
  winRound: async () => { await game?.winRound(); return game?.debugState(); },
  home: () => showSplash(),
  /** Compress every timed beat so QA does not sit through celebrations. */
  fastTimers: (scale = 0.05) => { if (game) game.timeScale = scale; return scale; },
  // channels the default mute() fans out to
  voice,
  sfx,
  // where the seeded generator lands (mulberry32 now, not this game's xorshift)
  onSeed: (rng) => { seedRng = rng; if (game) game.rng = rng; },
});

// ---- iPad niceties ---------------------------------------------------------

// contextmenu + gesturestart; visibilitychange -> speechSynthesis.resume() is
// wired by installUnlockOnGesture above.
installKioskGuards();
