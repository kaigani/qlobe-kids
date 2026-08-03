// debug.js — window.QLOBE_DEBUG for World Music Dance, on the platform's
// shared harness (shared/js/debug-harness.js) instead of a hand-rolled hook.
//
// The QA contract, and the rule that makes it worth anything: every method here
// goes through the SAME code a child's finger goes through. `tap()` calls the
// screen's real tap handler, `winRound()` completes the phase by tapping the
// right things in order, `placeCard()` drops the card on its own lantern via
// the real placement path. Nothing here sets a "done" flag directly — a debug
// surface that can win a round the game itself cannot is a harness that proves
// nothing.
//
// `getTargets()` is likewise TRUTHFUL: in the copy phase it reports the two
// wrong move cards as `wrong`, so a smoke test can deliberately mis-tap and
// assert the game stayed winnable. A harness that is only ever handed the right
// answer never exercises the forgiveness path, which is most of this game.
//
// `seed` and `fastTimers` are the harness's own defaults now: `onSeed` and
// `timers` (reserved keys, see shared/js/debug-harness.js) hand it this game's
// live RNG slot and its shared/js/timers.js group, so `seed(42)` swaps in a
// real mulberry32 generator and `fastTimers()` scales the same group `ctx.wait`
// and `ctx.ms` already read from — no game-local seed()/setTimeScale() left to
// drift from the platform's version.
//
// Beyond the v1 floor: fastTimers (compress waits so a six-culture pass runs in
// seconds), getAudioLog (proves recorded clips played rather than Web Speech —
// now shared/js/voice-clips.js's own ring buffer; this game's fork of it is
// gone), and getMusicStats (proves the beat clock actually ran — the one thing
// a state assertion cannot see about a beat-synced dancer).

import { installDebug as installDebugHarness } from '../../../shared/js/debug-harness.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';

const STEPS_TOTAL = 3;

/**
 * @param {object} ctx   the game context from main.js
 * @param {object} host  live hooks main.js keeps to itself:
 *   { screen, screenName, timers, onSeed, setMuted, goto, home }
 */
export function installDebug(ctx, host) {
  const current = () => host.screen || null;

  return installDebugHarness({
    version: 1,
    gameId: ctx.config.id || 'world-music-dance',
    engine: 'dance-cards',
    ready: Promise.resolve(),

    // reserved deps consumed by the harness's defaults, never published:
    timers: host.timers,
    onSeed: host.onSeed,

    // ---- modes (one per culture) -----------------------------------------
    listModes: () => ctx.cultures.map((culture) => ({ id: culture.id, title: culture.label })),

    /** Enter a culture's dance and resolve once the listen phase wants input. */
    async startMode(id) {
      const culture = ctx.cultureById(id) || ctx.cultures[0];
      if (!culture) return { started: false };
      const screen = await host.goto('dance', { cultureId: culture.id });
      if (screen && screen.ready) await screen.ready;
      return { started: true, culture: culture.id };
    },

    // ---- state -----------------------------------------------------------
    getState() {
      const screen = current();
      const sub = (screen && typeof screen.getState === 'function') ? screen.getState() : {};
      return {
        screen: host.screenName,
        culture: sub.culture == null ? null : sub.culture,
        phase: sub.phase == null ? null : sub.phase,
        step: Number(sub.step) || 0,
        stepsTotal: STEPS_TOTAL,
        placedCount: ctx.collection.count(),
        awaitingInput: Boolean(sub.awaitingInput),
      };
    },

    /** Everything tappable right now, with an honest role. Client-space rects. */
    getTargets() {
      const screen = current();
      if (!screen || typeof screen.getTargets !== 'function') return [];
      try { return screen.getTargets(); } catch (error) {
        console.warn('[wmd-debug] getTargets threw', error);
        return [];
      }
    },

    /** Tap a target through the screen's real handler. */
    tap(targetId) {
      const screen = current();
      if (!screen || typeof screen.tap !== 'function') return { accepted: false };
      try { return screen.tap(targetId); } catch (error) {
        console.warn('[wmd-debug] tap threw', error);
        return { accepted: false };
      }
    },

    /** Complete the current phase legitimately. */
    async winRound() {
      const screen = current();
      if (!screen || typeof screen.winRound !== 'function') return false;
      await screen.winRound();
      return true;
    },

    // ---- audio -------------------------------------------------------
    mute(on = true) {
      const value = Boolean(on);
      host.setMuted(value);
      window.__qkMuted = value;
      return value;
    },
    unmute() {
      host.setMuted(false);
      window.__qkMuted = false;
      return false;
    },
    /** Last 80 requested lines, oldest first: `{ key, text, at }` (voice-clips'
     *  own shape — `at` is ms since page load). This game used to keep a
     *  separate `{ t, kind, key }` ring buffer distinguishing recorded clips
     *  from Web Speech fallback; shared/js/voice-clips.js logs every say()
     *  unconditionally (muted or not) but does not carry that clip/speech
     *  distinction, so it no longer appears here. */
    getAudioLog: () => voiceClips.getAudioLog(),
    clearAudioLog: () => { voiceClips.clearAudioLog(); return true; },
    /** Proof the beat clock ran: notes scheduled, loops turned, live beat. */
    getMusicStats: () => ctx.musicStats(),

    // ---- collection ------------------------------------------------------
    getCollection: () => ctx.collection.get(),
    resetCollection() { ctx.collection.reset(); return true; },
    /**
     * Pin a culture's card home through the real placement path: bank the card,
     * open the map in place mode, then let the map screen drop it on its own
     * lantern. Deliberately NOT a direct collection.place() — that would prove
     * the storage layer works and nothing about the game.
     */
    async placeCard(id) {
      const culture = ctx.cultureById(id);
      if (!culture) return false;
      ctx.setPending({ cultureId: culture.id });
      const screen = await host.goto('map', { mode: 'place', cultureId: culture.id });
      if (!screen || typeof screen.winRound !== 'function') return false;
      await screen.winRound();
      return ctx.collection.isPlaced(culture.id);
    },

    // ---- navigation ------------------------------------------------------
    home() { host.home(); return true; },
    goto: (name, opts) => host.goto(name, opts),
  });
}
