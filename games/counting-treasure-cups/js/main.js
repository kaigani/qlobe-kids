// main.js — boot Counting Treasure Cups: load config + voice, unlock audio and
// video on the first gesture, route splash ⇄ play ⇄ end, wire the HUD, and
// install the window.QLOBE_DEBUG v1 contract.
//
// Navigation follows docs/interaction-patterns.md §8: the splash carries the
// round HOME button to the catalog (../../) and nothing else does; play and end
// carry BACK, which returns to the splash in-page.

import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as speech from '../../../shared/js/speech.js';
import { onTap } from '../../../shared/js/tap.js';
import * as voice from './voice.js';
import { loadActors } from './actor.js';
import { Game } from './game.js';
import { initConfetti, clearConfetti, burst } from './confetti.js';
import { blessMedia } from './stage.js';

const mount = document.getElementById('game');
initConfetti(document.getElementById('confetti-canvas'));

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
let audioUnlocked = false;
let greeted = false;
let screen = 'splash';

const ready = (async () => {
  await voice.init(config.voice);
})();

// ---- audio + video unlock on the first gesture -----------------------------

function unlockAudio() {
  // voice.unlock() stays armed until the clip channel has actually played, so it
  // runs on every gesture — otherwise recorded voice can fail on iPad and fall
  // back to Web Speech for the whole session.
  voice.unlock();
  if (audioUnlocked) return;
  audioUnlocked = true;
  sfx.unlock();
  speech.unlock();
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
}
window.addEventListener('pointerdown', unlockAudio);

// ---- screens ---------------------------------------------------------------

function splashHTML() {
  // The mode icon is the game's own art wherever possible — an emoji stand-in
  // (a toolbox for "Big Treasure") misleads a child who cannot read the label.
  const buttons = config.modes.map((m) => {
    const icon = m.iconArt
      ? `<span class="ctc-mode-icon"><img src="${m.iconArt}" alt="" draggable="false" />` +
        (m.iconText ? `<span class="ctc-mode-icon-text">${m.iconText}</span>` : '') + '</span>'
      : `<span class="ctc-mode-icon" aria-hidden="true">${m.icon || '⭐'}</span>`;
    return `
    <button class="ctc-mode" type="button" data-mode="${m.id}">
      ${icon}
      <span class="ctc-mode-title">${m.title}</span>
    </button>`;
  }).join('');
  return `
    <section class="ctc-screen ctc-splash">
      <img class="ctc-splash-art" src="./assets/splash.jpg" alt="" draggable="false" />
      <a class="hud-button hud-img hud-home" href="../../" aria-label="${config.copy.home}"
         style="background-image:url('${UI.home}')"></a>
      <h1 class="ctc-title">${config.title}</h1>
      <div class="ctc-modes">${buttons}</div>
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

function showSplash() {
  teardownGame();
  starting = false;
  screen = 'splash';
  voice.stop();
  clearConfetti();
  mount.innerHTML = splashHTML();
  for (const btn of mount.querySelectorAll('.ctc-mode')) {
    onTap(btn, () => startMode(btn.dataset.mode), {
      feedback: (e) => { e.preventDefault(); unlockAudio(); sfx.tick(); },
    });
  }
  hostActors();
  // Try to greet immediately; if the browser blocks it (no user activation yet)
  // unlockAudio() delivers the same line on the first touch.
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
  burst(window.innerWidth / 2, window.innerHeight * 0.42, 150);
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
    let last = 0;
    onTap(sound, () => {
      const now = performance.now();
      if (now - last < 600) return;   // debounce so rapid taps can't stack
      last = now;
      sfx.tick();
      game?.replayPrompt();
    });
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
  actors = await loadActors(host, config.actors);
  host.remove();
  showSplash();
})();

// ---- window.QLOBE_DEBUG v1 (review automation depends on this) -------------

window.QLOBE_DEBUG = {
  version: 1,
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
  mute: () => {
    voice.setMuted(true);
    speech.stop();
    voice.stop();
    window.speechSynthesis && window.speechSynthesis.cancel();
    document.querySelectorAll('audio, video').forEach((el) => { el.muted = true; });
    window.QLOBE_DEBUG.muted = true;
  },
  seed: (n) => {
    let s = n >>> 0 || 1;
    const rng = () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
    window.QLOBE_DEBUG._rng = rng;
    if (game) game.rng = rng;
  },
  /** Compress every timed beat so QA does not sit through celebrations. */
  fastTimers: (scale = 0.05) => { if (game) game.timeScale = scale; return scale; },
  home: () => showSplash(),
};

// ---- iPad niceties ---------------------------------------------------------

window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    try { window.speechSynthesis && window.speechSynthesis.resume(); } catch { /* ignore */ }
  }
});
