// pose-conductor.js — the pose-actor ↔ music-sync bridge for Stage v2.
//
// WHY THIS EXISTS
// ---------------
// `music-sync.js` drives *puppets*: it expects `setClipPhase(clip, phase)` and
// `playClip(name)`, the bone-rig vocabulary. A **pose actor**
// (`pose-sprite.js`) has neither — it only knows `setPose(name)`, a whole-
// illustration swap with a 220ms paper-pop. So every game that wants a cut-paper
// character to dance on the beat has to write the same adapter: a fake puppet
// whose `setClipPhase` becomes a groove bob, plus a `bar` hook that snaps the
// next pose on the bar line (where a paper-pop reads as choreography rather
// than a glitch). This module is that adapter, once.
//
// REUSE
// -----
// Any rhythm/dance/marching game with a pose actor and a beat clock:
//
//   const conductor = createPoseConductor({
//     actor,                                   // from loadPoseActor()
//     schedule: { order: ['neutral','move-1','move-2','move-3'],
//                 barsPerPose: 2, celebrateOnLoop: true },
//     latencyMs: 80,                           // visual-vs-audio trim
//     reducedMotion: prefersReducedMotion,
//     onBeat: (d) => pulseStepRail(d),         // step rails, metronomes
//   });
//   conductor.start(() => {
//     const s = music.songNow();
//     return s ? { beat: s.loopBeat, bpm: s.bpm, song: s.song } : null;
//   });
//   music.playSong(song, band, { onLoop: conductor.notifyLoop });
//
// POSITIONING CONTRACT: the conductor writes `actor.view.y` and
// `actor.view.rotation` every frame for the bob/sway. Parent `actor.view` in a
// wrapper container that the game positions, and leave the view itself at its
// local origin — then the bob is relative to 0 and layout can never fight it.
// If you must move the view directly, call `rebase()` after each layout pass.

import { createMusicSync } from './music-sync.js';

/** Peak of the groove bob, in view-local px. */
const BOB_PX = 10;
/** Peak of the groove sway, in radians (~1.5°). */
const SWAY_RAD = 0.026;

/** Which pose the schedule wants at a given bar. Pure — see `__test`. */
function poseIndex(barIndex, barsPerPose, orderLength) {
  if (!Number.isFinite(orderLength) || orderLength < 1) return 0;
  const bars = Math.max(1, Math.floor(Number(barsPerPose) || 1));
  const bar = Math.max(0, Math.floor(Number(barIndex) || 0));
  return Math.floor(bar / bars) % orderLength;
}

/** Vertical groove offset for a 0..1 phase (always ≤ 0 — the bob lifts). */
function bobOffset(phase, amplitude = BOB_PX) {
  const p = phase - Math.floor(phase);
  return -amplitude * Math.abs(Math.sin(Math.PI * p));
}

/** Rotation sway for a 0..1 phase. */
function swayAt(phase, amplitude = SWAY_RAD) {
  const p = phase - Math.floor(phase);
  return amplitude * Math.sin(2 * Math.PI * p);
}

function normalizeSchedule(schedule) {
  const raw = schedule && typeof schedule === 'object' ? schedule : {};
  const order = Array.isArray(raw.order) && raw.order.length ? raw.order.slice() : ['neutral'];
  return {
    order,
    barsPerPose: Math.max(1, Math.floor(Number(raw.barsPerPose) || 1)),
    celebrateOnLoop: raw.celebrateOnLoop !== false,
    celebratePose: raw.celebratePose || 'celebrate',
  };
}

/**
 * Bridge a pose actor to a musical clock.
 *
 * @param {object}   opts
 * @param {object}   opts.actor              `{ view, setPose(name, {instant}) }`
 * @param {object}   [opts.schedule]         `{ order[], barsPerPose, celebrateOnLoop }`
 * @param {number}   [opts.latencyMs=0]      visual lead/lag trim (audio is sample-accurate)
 * @param {boolean}  [opts.reducedMotion]    no bob/sway, instant swaps, no loop celebrate
 * @param {Function} [opts.onBeat]           (detail) once per beat — step rails etc.
 * @param {Function} [opts.onPoseChange]     (poseName) after a swap actually lands
 * @returns {{start:Function, stop:Function, setSchedule:Function, hold:Function,
 *            release:Function, notifyLoop:Function, rebase:Function,
 *            destroy:Function, pose:string|null}}
 */
export function createPoseConductor({
  actor,
  schedule = {},
  latencyMs = 0,
  reducedMotion = false,
  onBeat = null,
  onPoseChange = null,
} = {}) {
  let plan = normalizeSchedule(schedule);
  let destroyed = false;
  let held = null;          // pose pinned by hold(), or null
  let celebrateBars = 0;    // bars of loop-celebrate still owed
  let currentPose = null;
  let token = 0;            // supersedes in-flight setPose awaits
  let baseY = 0;
  let baseRot = 0;
  let based = false;

  const gone = () => destroyed || !actor || !actor.view || actor.view.destroyed;

  async function apply(name) {
    if (destroyed || !actor || typeof actor.setPose !== 'function') return;
    if (name === currentPose) return;
    currentPose = name;
    const mine = ++token;
    try {
      await actor.setPose(name, reducedMotion ? { instant: true } : undefined);
    } catch (err) {
      console.warn('[pose-conductor] setPose threw', err);
      return;
    }
    if (destroyed || mine !== token) return;   // a newer swap (or destroy) won
    try { onPoseChange?.(name); } catch (err) { console.warn('[pose-conductor] onPoseChange threw', err); }
  }

  const poseAtBar = (barIndex) => plan.order[poseIndex(barIndex, plan.barsPerPose, plan.order.length)];

  // The fake puppet music-sync drives. setClipPhase becomes the groove.
  const shim = {
    setClipPhase(_clip, phase) {
      if (gone()) return;
      const view = actor.view;
      if (!based) { baseY = view.y || 0; baseRot = view.rotation || 0; based = true; }
      if (reducedMotion) { view.y = baseY; view.rotation = baseRot; return; }
      view.y = baseY + bobOffset(phase);
      view.rotation = baseRot + swayAt(phase);
    },
    playClip() { /* pose actors have no clips — swaps happen on bar lines */ },
  };

  const sync = createMusicSync({
    puppet: shim,
    profile: { baseClip: 'groove', cycleBeats: 1, latencyMs: Number(latencyMs) || 0 },
    onHook: (kind, detail) => {
      if (destroyed) return;
      if (kind === 'beat') {
        try { onBeat?.(detail); } catch (err) { console.warn('[pose-conductor] onBeat threw', err); }
        return;
      }
      if (kind !== 'bar') return;
      if (celebrateBars > 0) { celebrateBars -= 1; if (celebrateBars > 0 || held) return; }
      if (held) return;
      apply(poseAtBar(detail.barIndex));
    },
  });

  function restBase() {
    if (gone() || !based) return;
    actor.view.y = baseY;
    actor.view.rotation = baseRot;
  }

  return {
    get pose() { return currentPose; },
    /** @param {Function} positionProvider `() => ({beat, bpm, song}) | null` */
    start(positionProvider) {
      if (destroyed) return;
      sync.start(positionProvider);
    },
    stop() { sync.stop(); restBase(); },
    setSchedule(next) {
      plan = normalizeSchedule(next);
      celebrateBars = 0;
    },
    /** Pin one pose (the copy phase) — the groove bob keeps running under it. */
    hold(poseName) {
      if (destroyed) return;
      held = poseName;
      celebrateBars = 0;
      apply(poseName);
    },
    /** Resume schedule-following on the next bar line. */
    release() { held = null; },
    /** Call from music.playSong's onLoop: one bar of celebrate, then resume. */
    notifyLoop() {
      if (destroyed || reducedMotion || held || !plan.celebrateOnLoop) return;
      celebrateBars = 1;
      apply(plan.celebratePose);
    },
    /** Re-read the view's resting y/rotation after the game repositions it. */
    rebase() { based = false; },
    destroy() {
      destroyed = true;
      token += 1;
      sync.destroy();
      restBase();
    },
  };
}

export const __test = { poseIndex, bobOffset, swayAt, normalizeSchedule };
