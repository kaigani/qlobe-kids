// timers.js — a cancellable, time-scalable group of setTimeout calls.
//
// Two patterns that every game re-derives, joined into one object:
//
//   1. The timer registry (`this.timers = new Set()` + `clearTimers()`), so a
//      screen change cannot be interrupted by a celebration scheduled by the
//      screen before it.
//   2. The `fastTimers()` QA scale factor, which today is a `state.timeScale`
//      that each game has to remember to multiply into every single delay.
//
// A group owns its scale, so `group.after(1200, …)` is already fast when QA has
// asked for fast — nothing at the call site changes.
//
// Zero imports, by design.

/**
 * @returns {{
 *   wait(ms: number): Promise<void>,
 *   after(ms: number, fn: () => void): number,
 *   every(ms: number, fn: () => void): number,
 *   clear(id: number): void,
 *   clearAll(): void,
 *   setScale(s: number): number,
 *   getScale(): number,
 *   ms(n: number): number,
 *   size(): number
 * }}
 */
export function createTimers() {
  const pending = new Map(); // id -> 'timeout' | 'interval'
  let scale = 1;

  /** Scale a delay. s > 1 means faster, so the delay is divided by it. */
  function scaled(n) {
    const value = Number(n);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return value / scale;
  }

  const group = {
    /**
     * Scale a duration without scheduling anything — for CSS transition times,
     * tween lengths, and anything else that has to move at the same rate as
     * the timers around it.
     * @param {number} n  milliseconds at scale 1
     * @returns {number} scaled milliseconds
     */
    ms(n) {
      return scaled(n);
    },

    /**
     * A scaled delay.
     *
     * A wait cancelled by `clearAll()` NEVER SETTLES — the awaiting flow simply
     * stops there, which is what cancelling it means. Do not put teardown after
     * `await timers.wait(…)`; put it in `destroy()`.
     * @param {number} ms
     * @returns {Promise<void>}
     */
    wait(ms) {
      return new Promise((resolve) => {
        const id = window.setTimeout(() => {
          pending.delete(id);
          resolve();
        }, scaled(ms));
        pending.set(id, 'timeout');
      });
    },

    /**
     * Run `fn` once after a scaled delay.
     * @param {number} ms
     * @param {() => void} fn
     * @returns {number} id for `clear`
     */
    after(ms, fn) {
      const id = window.setTimeout(() => {
        pending.delete(id);
        fn();
      }, scaled(ms));
      pending.set(id, 'timeout');
      return id;
    },

    /**
     * Run `fn` on a scaled repeat. Rescaling does not re-time a running
     * interval — stop it and start it again if that matters.
     * @param {number} ms
     * @param {() => void} fn
     * @returns {number} id for `clear`
     */
    every(ms, fn) {
      const id = window.setInterval(fn, scaled(ms));
      pending.set(id, 'interval');
      return id;
    },

    /** Cancel one timer by id. Unknown ids are ignored. */
    clear(id) {
      const kind = pending.get(id);
      if (!kind) return;
      pending.delete(id);
      if (kind === 'interval') window.clearInterval(id);
      else window.clearTimeout(id);
    },

    /** Cancel everything this group scheduled. Safe to call repeatedly. */
    clearAll() {
      for (const [id, kind] of pending) {
        if (kind === 'interval') window.clearInterval(id);
        else window.clearTimeout(id);
      }
      pending.clear();
    },

    /**
     * @param {number} s  > 1 = faster (delays divided by s). Non-finite or
     *   non-positive values reset to 1. Only affects timers scheduled AFTER
     *   the call — already-pending ones keep the delay they were given.
     * @returns {number} the applied scale
     */
    setScale(s) {
      const value = Number(s);
      scale = Number.isFinite(value) && value > 0 ? Math.min(1000, value) : 1;
      return scale;
    },

    /** @returns {number} the current scale */
    getScale() {
      return scale;
    },

    /** @returns {number} how many timers are outstanding (QA/leak checks) */
    size() {
      return pending.size;
    },
  };

  return group;
}
