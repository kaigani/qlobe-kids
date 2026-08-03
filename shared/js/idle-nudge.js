// idle-nudge.js — "still there?" without nagging.
//
// A five-year-old who stops touching the screen has usually not quit; they are
// looking at the picture, or talking to whoever is next to them. Our answer is a
// gentle nudge on a timer that ANY player action pushes back — never a countdown,
// never a failure, never a sound that says they were too slow. Half a dozen games
// grew their own version of this (rhyming-detective's tiered idle ladder,
// sink-or-float's one-shot re-prompt); the timing policy is theirs to choose, the
// bookkeeping is not worth writing twice.
//
// Contract (docs/shared-platform-refactor.md):
//   createNudger({ first = 11000, repeat = first, onNudge }) -> { arm, poke, stop }
//
// The nudge index is handed to onNudge so a game can build a ladder from it —
// nudge 0 re-reads the prompt, nudge 1 highlights, nudge 2 models the answer —
// exactly as rhyming-detective does, but without owning the timers.

/**
 * @param {object} [opts]
 * @param {number} [opts.first=11000] ms of quiet before the FIRST nudge.
 * @param {number} [opts.repeat=first] ms between later nudges.
 * @param {(count: number) => void} [opts.onNudge] called with 0, then 1, 2, …
 *   Throwing is swallowed: a broken hint must not stop the game.
 * @returns {{arm: () => void, poke: () => void, stop: () => void}}
 */
export function createNudger({ first = 11000, repeat = first, onNudge } = {}) {
  const firstMs = Math.max(0, Number(first) || 0);
  const repeatMs = Math.max(0, Number(repeat != null ? repeat : first) || 0);

  let timer = null;
  let armed = false;
  let count = 0;

  function clear() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule(ms) {
    clear();
    if (!armed) return;
    timer = setTimeout(fire, ms);
  }

  function fire() {
    timer = null;
    if (!armed) return;
    // Backgrounded: nudging into a tab nobody is looking at just burns the
    // ladder, so wait it out and try again when the page is in front.
    if (typeof document !== 'undefined' && document.hidden) {
      schedule(repeatMs);
      return;
    }
    const n = count;
    count += 1;
    if (typeof onNudge === 'function') {
      try {
        onNudge(n);
      } catch { /* a broken hint must never stop the game */ }
    }
    schedule(repeatMs);
  }

  // Any touch anywhere counts as "the child is still with us". Installed only
  // while armed, so a stopped nudger costs nothing and holds no listener.
  const onPointerDown = () => poke();

  /**
   * Start (or restart) the idle countdown from the top: the ladder resets to
   * nudge 0 and the first wait is `first` again. Safe to call when already armed.
   */
  function arm() {
    if (!armed) {
      armed = true;
      if (typeof window !== 'undefined') {
        window.addEventListener('pointerdown', onPointerDown, { passive: true });
      }
    }
    count = 0;
    schedule(firstMs);
  }

  /**
   * The child did something. Push the nudge back and reset the ladder. A no-op
   * when not armed, so game code can poke() unconditionally from its input path.
   */
  function poke() {
    if (!armed) return;
    count = 0;
    schedule(firstMs);
  }

  /** Disarm completely. Idempotent — calling it twice, or before arm(), is fine. */
  function stop() {
    clear();
    if (!armed) return;
    armed = false;
    count = 0;
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', onPointerDown, { passive: true });
    }
  }

  return { arm, poke, stop };
}
