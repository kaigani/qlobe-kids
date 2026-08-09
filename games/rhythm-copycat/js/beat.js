// beat.js — Rhythm Copycat's timed rhythm core.
//
// One "round" is a pattern of pads on a fixed beat grid:
//   demo(t0): each beat i sounds at t0 + i*beatMs while its tray slot lights
//   copy(t0): slot i is ARMED from t0 + i*beatMs until +beatMs + graceMs;
//             a tap on the correct pad fills it and advances the cursor; a
//             wrong pad is rejected; an expired slot replays once, then an
//             exhausted slot is auto-filled (the game never dead-ends).
//
// Timing rides the shared timers group, and all time values are expressed in
// the group's SCALED clock (performance.now() / scale), so QLOBE_DEBUG
// fastTimers() scales the whole loop including the beat grid.

const GRACE_MS = 400;   // extra forgiveness past the beat edge
const REARM_BEATS = 1;  // extra whole beats a missed slot stays armed

export function makePattern(rng, length, pads) {
  const out = [];
  for (let i = 0; i < length; i++) {
    let pick = null;
    let guard = 0;
    do {
      pick = pads[Math.floor(rng() * pads.length)];
      guard += 1;
    } while (
      guard < 12 &&
      (pick === out[i - 1] || (pick === out[i - 2] && out[i - 1] === out[i - 2]))
    );
    out.push(pick);
  }
  return out;
}

/** Refuses the exact previous pattern, else ok. */
export function nextPattern(rng, length, pads, previous) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const pattern = makePattern(rng, length, pads);
    if (!previous || pattern.join(',') !== previous.join(',')) return pattern;
  }
  return makePattern(rng, length, pads);
}

export class BeatRound {
  /**
   * @param {object} o
   * @param {object} o.timers          shared timers group (createTimers)
   * @param {number} o.beatMs          beat length in scaled ms (timers.ms(60000/bpm))
   * @param {string[]} o.pattern
   * @param {(i:number, pad:string, off?:boolean) => void} o.onLight  tray slot
   * @param {(i:number, pad:string) => void} o.onSound                 voice/sfx beat
   * @param {(i:number, pad:string) => void} [o.onFill]  slot filled during copy
   * @param {(i:number, pad:string) => void} [o.onArm]   cursor armed slot
   * @param {(pad:string) => void} [o.onWrong]           rejected pad
   * @param {(i:number, pad:string) => void} [o.onMiss]  slot expired once (replay)
   * @param {(i:number, pad:string) => void} [o.onAuto]  slot auto-filled
   * @param {(stats:object) => void} [o.onDone]          phase finished
   */
  constructor(o) {
    this.timers = o.timers;
    this.beatMs = o.beatMs;
    this.pattern = o.pattern;
    this.onLight = o.onLight;
    this.onSound = o.onSound;
    this.onFill = o.onFill;
    this.onArm = o.onArm;
    this.onWrong = o.onWrong;
    this.onMiss = o.onMiss;
    this.onAuto = o.onAuto;
    this.onDone = o.onDone;
    this.phase = 'idle';
    this.stats = { firstTry: 0, slots: this.pattern.length, assists: 0, misses: 0 };
  }

  get length() { return this.pattern.length; }

  _now() {
    return performance.now() / this.timers.getScale();
  }

  demo() {
    if (this.phase !== 'idle') return this;
    this.phase = 'demo';
    const { timers, pattern, beatMs } = this;
    for (let i = 0; i < pattern.length; i++) {
      timers.after(beatMs * i, () => {
        if (this.phase !== 'demo') return;
        this.onSound(i, pattern[i]);
        this.onLight(i, pattern[i], false);
        timers.after(Math.min(beatMs * 0.55, 320), () => {
          if (this.phase !== 'demo' || this.slotUnlit) return;
          this.onLight(i, pattern[i], true);
        });
      });
    }
    timers.after(beatMs * pattern.length + beatMs * 0.35, () => {
      if (this.phase !== 'demo') return;
      this.phase = 'demo-done';
      this.onDone?.({ ...this.stats, phase: 'demo' });
    });
    return this;
  }

  copy() {
    if (this.phase !== 'demo-done' && this.phase !== 'idle') return this;
    this.phase = 'copy';
    this.slot = 0;
    this.armGuards = 0;
    this.startMs = this._now() + 300; // a beat of "steady" before slot 0
    this._armCurrent();
    return this;
  }

  _armCurrent() {
    const { timers, pattern, beatMs } = this;
    const i = this.slot;
    if (i >= pattern.length) return;
    this.armedUntil = this.startMs + i * beatMs + beatMs + GRACE_MS +
      this.armGuards * REARM_BEATS * beatMs;
    this.onArm?.(i, pattern[i]);
    const armMs = Math.max(0, this.armedUntil - this._now());
    timers.after(armMs + 10, () => {
      if (this.phase !== 'copy' || this.slot !== i) return;
      if (this._now() < this.armedUntil) return;
      this._expire(i);
    });
  }

  _expire(i) {
    const pad = this.pattern[i];
    if (this.armGuards < 1) {
      this.armGuards += 1;
      this.stats.misses += 1;
      this.onMiss?.(i, pad);
      this._armCurrent();
    } else {
      this.stats.assists += 1;
      this.onAuto?.(i, pad);
      this._advance(true);
    }
  }

  /** Chid tapped a pad during copy: 'ok' | 'wrong' | 'idle' | 'late'. */
  tap(pad) {
    if (this.phase !== 'copy') return 'idle';
    const i = this.slot;
    if (pad !== this.pattern[i]) {
      this.onWrong?.(pad);
      return 'wrong';
    }
    if (this._now() > this.armedUntil + 120) {
      this.onWrong?.(pad);
      return 'late';
    }
    this.onFill?.(i, pad);
    this._advance(this.armGuards > 0);
    return 'ok';
  }

  _advance(assisted) {
    if (!assisted) this.stats.firstTry += 1;
    this.slot += 1;
    this.armGuards = 0;
    if (this.slot >= this.pattern.length) {
      this.phase = 'copy-done';
      this.onDone?.({ ...this.stats, phase: 'copy' });
      return;
    }
    this._armCurrent();
  }

  /** Replay the finished pattern (song mode). Needs copy-done or demo-done. */
  replay() {
    if (this.phase !== 'copy-done' && this.phase !== 'demo-done') return this;
    this.phase = 'song';
    const { timers, pattern, beatMs } = this;
    for (let i = 0; i < pattern.length; i++) {
      timers.after(beatMs * i, () => {
        if (this.phase !== 'song') return;
        this.onSound(i, pattern[i]);
        this.onLight(i, pattern[i], false);
      });
    }
    timers.after(beatMs * pattern.length + beatMs * 0.45, () => {
      if (this.phase !== 'song') return;
      this.phase = 'song-done';
      this.onDone?.({ ...this.stats, phase: 'song' });
    });
    return this;
  }

  cancel() {
    this.phase = 'idle';
    return this;
  }
}