// main.js — Tweezer Rescue orchestration: screens, audio, HUD, the four
// rescue modes, idle-nudge ladder and the QLOBE_DEBUG v1 surface.
//
// game-design.md is the authority. Nothing speaks at page load — the welcome
// line rides the shared first-gesture unlock (audio-unlock.js onFirst).

import config from '../config.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as bgm from '../../../shared/js/bgm.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { createScreens } from '../../../shared/js/screens.js';
import { onTap } from '../../../shared/js/tap.js';
import { tada, burstConfetti } from '../../../shared/js/celebrate.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createTimers } from '../../../shared/js/timers.js';
import { mulberry32 } from '../../../shared/js/rng.js';
import { prefersReducedMotion } from '../../../shared/js/dom.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createScene } from './critters.js';
import { createTweezers } from './tweezers.js';

const LINES = config.lines || {};
const MODES = config.modes || [];
const reducedMotion = () => prefersReducedMotion();

// ---- elements --------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const els = {
  scene: $('scene'),
  backdrop: $('scene-backdrop'),
  props: $('scene-props'),
  targets: $('scene-targets'),
  critters: $('scene-critters'),
  fly: $('fly-layer'),
  fx: $('fx-layer'),
  tweezerLayer: $('tweezer-layer'),
  splash: $('screen-splash'),
  play: $('screen-play'),
  celebration: $('screen-celebration'),
  splashBackdrop: $('splash-backdrop'),
  splashTitle: $('splash-title'),
  cardRow: $('card-row'),
  btnHome: $('btn-home'),
  btnSoundSplash: $('btn-sound-splash'),
  btnBack: $('btn-back'),
  btnSoundPlay: $('btn-sound-play'),
  chip: $('chip'),
  chipCount: $('chip-count'),
  banner: $('banner'),
  badge: $('badge'),
  btnNext: $('btn-next'),
  btnCeleBack: $('btn-cele-back'),
};

els.splashBackdrop.src = config.assets.splashBackdrop;
els.splashTitle.src = config.assets.title;
els.banner.src = config.assets.banner;
els.badge.src = config.assets.badge;

// ---- audio -----------------------------------------------------------------

const narrator = createNarrator();
const timers = createTimers();

bgm.preload(config.bgm.track);
bgm.setVolume(config.bgm.volume ?? 0.3);

/** speak one GDD line, ducking the music under it */
function say(key) {
  return bgm.duckDuring(narrator.say(key, LINES[key]));
}
function saySeq(parts) {
  return bgm.duckDuring(narrator.saySequence(
    parts.map((p) => (typeof p === 'string' ? { key: p, text: LINES[p] } : { text: LINES[p.key], ...p })),
  ));
}

// ---- state -----------------------------------------------------------------

const state = {
  modeId: null,
  rescued: 0,
  sinceLastPraise: 0,
  praiseGap: 2,
  praiseIdx: 0,
  celebrations: 0,
  muted: false,
  playedAnyMode: false,
  transitioning: false,
  rng: mulberry32(1234),
};

function modeById(id) { return MODES.find((m) => m.id === id) || null; }
function nextModeId() {
  const i = MODES.findIndex((m) => m.id === state.modeId);
  return MODES[(i + 1) % MODES.length].id;
}

// ---- screens ---------------------------------------------------------------

const screens = createScreens({
  screens: { splash: els.splash, play: els.play, celebration: els.celebration },
  initial: 'splash',
  voice: narrator,
});

// ---- scene + tweezers ------------------------------------------------------

const scene = createScene({
  sceneEl: els.scene,
  backdropEl: els.backdrop,
  propsEl: els.props,
  targetsEl: els.targets,
  crittersEl: els.critters,
  flyLayer: els.fly,
  fxLayer: els.fx,
  sceneW: config.scene.w,
  sceneH: config.scene.h,
  reducedMotion,
});

const tweezers = createTweezers({
  layer: els.tweezerLayer,
  topSrc: config.tweezers.top,
  bottomSrc: config.tweezers.bottom,
  metaUrl: config.tweezers.meta,
  angleDeg: config.tweezers.angleDeg,
  openDeg: config.tweezers.openDeg,
  closedDeg: config.tweezers.closedDeg,
  getDisplayLength: () => scene.px(config.tweezers.lengthScene || 620),
  canStart: () => screens.is('play') && !state.transitioning,
  reducedMotion,
  pick: (x, y) => scene.pickAt(x, y),
  onGrab: (handle) => {
    nudger.poke();
    scene.beginCarry(handle);
    sfx.silly(); // the squish
    const key = handle.critter.cfg.promptKey;
    if (key) say(key);
  },
  onRelease: (handle, x, y) => { resolveDrop(handle, x, y); },
  onCancel: (handle) => { scene.floatBack(handle, null); },
});

function layoutAll() {
  scene.layout();
  tweezers.layout();
}
window.addEventListener('resize', layoutAll);
layoutAll();

// ---- drop resolution -------------------------------------------------------

async function resolveDrop(handle, x, y) {
  const { result, target } = scene.dropAt(handle, x, y);
  const from = { x, y };
  if (result === 'correct') {
    const landing = scene.land(handle, target, from);
    sfx.whoosh();
    landing.then(() => {
      sfx.pop();
      sfx.sparkle();
      const slot = scene.toClient(handle.critter.slot.x, handle.critter.slot.y);
      scene.sparkleAt(slot.x, slot.y);
    });
    await landing;
    state.rescued += 1;
    updateChip();
    speakRescueFeedback(handle.critter);
    if (scene.remaining() === 0) {
      state.transitioning = true;
      timers.after(900, () => { celebrate(); });
    }
    nudger.poke();
  } else {
    sfx.boing();
    say(result === 'wrong-target' ? 'nudge-wrong' : 'nudge-miss');
    await scene.floatBack(handle, from);
  }
}

function speakRescueFeedback(critter) {
  const mode = modeById(state.modeId);
  const left = scene.remaining();
  if (mode.feedback === 'count') {
    const n = (mode.critters || []).length - left;
    say(`count-${n}`);
    return;
  }
  if (mode.feedback === 'match') {
    say(`match-${critter.kind}`);
    return;
  }
  // praise ladder: every 2nd–3rd rescue, "one more" when one remains
  if (left === 1) { say('one-more'); state.sinceLastPraise = 0; return; }
  if (left === 0) return; // the celebration line covers the last one
  state.sinceLastPraise += 1;
  if (state.sinceLastPraise >= state.praiseGap) {
    state.sinceLastPraise = 0;
    state.praiseGap = state.rng() < 0.5 ? 2 : 3;
    state.praiseIdx = (state.praiseIdx % 5) + 1;
    say(`praise-${state.praiseIdx}`);
  }
}

// ---- chip ------------------------------------------------------------------

els.chip.style.backgroundImage = `url("${config.assets.chip}")`;
function updateChip() {
  els.chipCount.textContent = String(scene.remaining());
}

// ---- idle nudge ------------------------------------------------------------

const nudger = createNudger({
  first: 11000,
  repeat: 12000,
  onNudge: (n) => {
    if (!screens.is('play') || state.transitioning || tweezers.carrying) return;
    if (n === 0) { say('nudge-idle'); return; }
    runGhostDemo();
  },
});

async function runGhostDemo() {
  const critter = scene.critters.find((c) => c.status === 'rest');
  if (!critter) return;
  const target = scene.homeFor(critter);
  if (!target) return;
  const fromRect = critter.el.getBoundingClientRect();
  const from = { x: fromRect.left + fromRect.width / 2, y: fromRect.top + fromRect.height / 2 };
  const to = scene.toClient(target.cfg.x, target.cfg.y);
  const ghost = document.createElement('img');
  ghost.src = critter.cfg.sprite;
  ghost.alt = '';
  ghost.className = 'tw-ghost';
  ghost.style.width = `${fromRect.width}px`;
  ghost.style.transform = `translate(${from.x}px, ${from.y}px) translate(-50%, -50%)`;
  els.fly.append(ghost);
  await tweezers.demo({ fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, ghostEl: ghost });
  nudger.arm(); // the ladder resets after modelling the answer
}

// ---- mode lifecycle --------------------------------------------------------

async function startMode(id) {
  const mode = modeById(id);
  if (!mode) return;
  state.modeId = id;
  state.rescued = 0;
  state.sinceLastPraise = 0;
  state.praiseGap = state.rng() < 0.5 ? 2 : 3;
  state.transitioning = false;
  scene.loadMode(mode);
  layoutAll();
  updateChip();
  screens.show('play');
  screens.hold(
    () => { tweezers.detach(); nudger.stop(); timers.clearAll(); },
  );
  tweezers.attach();
  const parts = [mode.introKey];
  if (!state.playedAnyMode) { state.playedAnyMode = true; parts.push({ key: 'how', gap: 350 }); }
  saySeq(parts);
  nudger.arm();
}

function celebrate() {
  state.transitioning = false;
  screens.show('celebration');
  // tada({ confetti: false }): the sound only. A bare tada() would ALSO fire
  // its own default confetti burst on document.body, unheld and uncancelled —
  // a second, orphaned layer alongside the properly scoped one below that
  // outlives this screen (its own ~2.7s timer, not screens.hold()) and bleeds
  // into whatever screen the child taps to next.
  tada({ confetti: false });
  const cancelConfetti = burstConfetti({
    host: els.celebration, count: 40, rng: state.rng,
  });
  screens.hold(cancelConfetti);
  state.celebrations += 1;
  const line = state.celebrations % 2 === 1 ? 'celebrate' : 'celebrate-2';
  saySeq([line, { key: 'next-prompt', gap: 700 }]);
}

function goSplash() {
  scene.clear();
  screens.show('splash');
}

// ---- splash cards ----------------------------------------------------------

for (const mode of MODES) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'mode-card';
  card.dataset.target = `mode-${mode.id}`;
  card.setAttribute('aria-label', mode.title);
  const img = document.createElement('img');
  img.src = mode.card;
  img.alt = '';
  img.draggable = false;
  card.append(img);
  onTap(card, () => {
    screens.start(() => startMode(mode.id), { busy: false });
  }, {
    feedback: (e) => { e.preventDefault(); sfx.tick(); },
  });
  els.cardRow.append(card);
}

// ---- HUD buttons -----------------------------------------------------------

function setMuted(on) {
  state.muted = !!on;
  narrator.setMuted(state.muted);
  voiceClips.setMuted(state.muted);
  sfx.setMuted(state.muted);
  bgm.setMuted(state.muted);
  for (const btn of [els.btnSoundSplash, els.btnSoundPlay]) {
    btn.classList.toggle('is-off', state.muted);
  }
}

const hudFeedback = { feedback: (e) => { e.preventDefault(); e.stopPropagation(); sfx.tick(); } };
const hudTap = (el, action) => onTap(el, (e) => { e.stopPropagation(); action(); }, hudFeedback);

hudTap(els.btnHome, () => { bgm.stop({ fadeOutMs: 300 }); window.location.assign('../../'); });
hudTap(els.btnSoundSplash, () => setMuted(!state.muted));
hudTap(els.btnSoundPlay, () => setMuted(!state.muted));
hudTap(els.btnBack, goSplash);
hudTap(els.btnCeleBack, goSplash);
hudTap(els.btnNext, () => {
  screens.start(() => startMode(nextModeId()), { busy: false });
});

// ---- first gesture ---------------------------------------------------------

installKioskGuards();
installUnlockOnGesture({
  extra: [() => bgm.unlock()],
  onFirst: () => {
    if (!state.muted) bgm.play(config.bgm.track, { key: 'tweezer-rescue' });
    // the welcome belongs to the splash; a card tap's own mode intro wins
    if (screens.is('splash') && !screens.starting) {
      saySeq(['welcome', { key: 'pick', gap: 300 }]);
    }
  },
});

// ---- teardown --------------------------------------------------------------

window.addEventListener('pagehide', () => { bgm.stop({ fadeOutMs: 0 }); });

// ---- boot ------------------------------------------------------------------

const ready = (async () => {
  await voiceClips.init(config.voice.manifest, config.voice.lines, LINES);
  await preloadImages([
    config.assets.splashBackdrop,
    config.assets.title,
    ...MODES.map((m) => m.card),
    config.tweezers.top,
    config.tweezers.bottom,
  ]);
  preloadImages(MODES.flatMap((m) => [
    m.backdrop,
    ...(m.props || []).map((p) => p.sprite),
    ...(m.targets || []).filter((t) => t.sprite).map((t) => t.sprite),
    ...(m.critters || []).map((c) => c.sprite),
  ]), { idle: true });
  await tweezers.metaReady;
  layoutAll();
  return true;
})();

// ---- QLOBE_DEBUG v1 --------------------------------------------------------

installDebug({
  gameId: config.id,
  ready,
  timers,
  narrator,
  sfx,
  voice: voiceClips,
  // Default mute() fans out only to narrator/voice/sfx — bgm.js is a fourth,
  // separate channel this game owns, so reuse the HUD's own setMuted() (which
  // already covers it) rather than leave the music playing under a "muted" game.
  mute: (on) => { setMuted(on === undefined ? !state.muted : Boolean(on)); return state.muted; },
  onSeed: (rng) => { state.rng = rng; },
  listModes: () => MODES.map(({ id, title }) => ({ id, title })),
  startMode: (id) => screens.start(() => startMode(id), { busy: false }),
  getState: () => ({
    screen: screens.current,
    mode: state.modeId,
    remaining: screens.is('splash') ? null : scene.remaining(),
    carried: tweezers.carrying ? tweezers.carrying.id : null,
    wobbleDeg: Math.round(tweezers.wobbleDeg * 10) / 10,
    awaitingInput: screens.is('play') && !state.transitioning,
    muted: state.muted,
    critters: scene.state().critters,
  }),
  // truthful grab/drop anchors in client px
  targets: () => ({ grab: scene.crittersClient(), drop: scene.targetsClient() }),
  // routed through the REAL pointer handlers
  grabAt: (x, y) => tweezers.down(x, y, '__debug'),
  dragTo: (x, y) => { tweezers.move(x, y, '__debug'); },
  dropAt: (x, y) => { tweezers.move(x, y, '__debug'); tweezers.up(x, y, '__debug'); },
  winRound: async () => {
    if (!screens.is('play')) return false;
    tweezers.detach();
    tweezers.attach();
    const pending = scene.critters.filter((c) => c.status !== 'homed');
    await Promise.all(pending.map((critter) => {
      const target = scene.homeFor(critter);
      if (!target) return Promise.resolve();
      const rect = critter.el.getBoundingClientRect();
      return scene.land({ critter }, target, {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    }));
    updateChip();
    if (scene.remaining() === 0) {
      state.transitioning = true;
      timers.after(200, () => celebrate());
    }
    return true;
  },
  home: () => { goSplash(); },
  getAudioLog: () => voiceClips.getAudioLog(),
});
