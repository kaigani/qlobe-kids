// debug.js — window.QLOBE_DEBUG for World Music Dance.
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
// Beyond the v1 floor: fastTimers (compress waits so a six-culture pass runs in
// seconds), getAudioLog (proves recorded clips played rather than Web Speech),
// and getMusicStats (proves the beat clock actually ran — the one thing a state
// assertion cannot see about a beat-synced dancer).

const STEPS_TOTAL = 3;

/**
 * @param {object} ctx   the game context from main.js
 * @param {object} host  live hooks main.js keeps to itself:
 *   { screen, screenName, audioLog, clearAudioLog, setMuted, setTimeScale,
 *     seed, goto, home }
 */
export function installDebug(ctx, host) {
  const clamp = (value, lo, hi) => (value < lo ? lo : (value > hi ? hi : value));
  const current = () => host.screen || null;

  const debug = {
    version: 1,
    gameId: ctx.config.id || 'world-music-dance',
    engine: 'dance-cards',
    ready: Promise.resolve(),

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

    // ---- audio -----------------------------------------------------------
    mute() {
      host.setMuted(true);
      window.__qkMuted = true;
      return true;
    },
    unmute() {
      host.setMuted(false);
      window.__qkMuted = false;
      return true;
    },
    /** Last 80 spoken lines: `{ t, kind: 'clip' | 'speech', key }`. */
    getAudioLog: () => host.audioLog.slice(),
    clearAudioLog: () => { host.clearAudioLog(); return true; },
    /** Proof the beat clock ran: notes scheduled, loops turned, live beat. */
    getMusicStats: () => ctx.musicStats(),

    // ---- determinism + pacing -------------------------------------------
    seed(n) { host.seed(n); return true; },
    /** Compress every wait, tween and idle timer. Clamped to 0.01 – 1. */
    fastTimers(scale = 0.05) {
      const value = clamp(Number(scale) || 0.05, 0.01, 1);
      host.setTimeScale(value);
      return value;
    },

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
  };

  window.QLOBE_DEBUG = debug;
  return debug;
}
