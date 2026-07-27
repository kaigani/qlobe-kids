// game.js — the round machine: pick a target, hide it among decoys in the dark,
// wait for a LIT tap, reveal, cheer, repeat. Three modes, one code path.
//
// THE ONE ATTEMPT PATH. A finger tap, a keyboard Enter, a DOM letter on the
// no-WebGL screen and window.QLOBE_DEBUG.tap() all funnel into `resolveTap()` →
// `attempt()`. There is no test-only path, which is why the QA gate can assert on
// the real behaviour.
//
// THE RULE THAT MAKES THE GAME REAL (§6.4). A tap on an UNLIT letter is a MOVE,
// not an answer. The child cannot see it, so they cannot have meant it. Without
// this a child sweep-and-jabs and scores by luck, and the lesson evaporates.
// `resolveTap()` is where it lives, and it is three lines.
//
// THE RULE THAT STOPS A CORRECT ANSWER BEING MARKED WRONG (§2.2). A decoy must
// never also answer the prompt. In `sound` and `picture` the prompt is a sound,
// and shared/data/letters.json gives C and K the identical phonic "kuh" — the
// only collision in the 26-letter table. `sameAnswerAs()` computes it from the
// data, so a future data edit cannot silently reintroduce the bug.

import * as sfx from '../../../shared/js/sfx.js';
import * as speech from '../../../shared/js/speech.js';
import { onTap } from '../../../shared/js/tap.js';
import * as content from '../../../shared/js/content.js';
import { burst, sparkle } from '../../../shared/js/stage/particles.js';
import * as voice from './voice.js';
import { createTransform, layoutLetters, objectImageSrc } from './cave.js';
import { createLetter, revealObject, ledgeSprite, destroyDisplay } from './letters.js';
import { BeamController } from './beam.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Thresholds — §6.3. `isLit()`'s own default is 0.35 ("drawn as found"); these
// are the two the game logic uses.
const LIT_ANSWER = 0.50;      // a tap counts as an answer
const LIT_HINT = 0.60;        // ari-hint-tap arms, held 600 ms

const HINT_TAP_HOLD_MS = 600;
const HINT_MOVE_MS = 4000;    // first play screen of a session, no touch at all
const IDLE_MS = 12000;
const IDLE_REPROMPT_MS = 15000;   // +15 s → 27 s
const IDLE_DARK_MS = 20000;       // +20 s → 47 s
const AUTO_NEXT_MS = 6000;        // the reveal's auto-advance
const SEQ_GAP_MS = 120;           // between two clips of one spoken sentence
const RADIUS_MS = 420;            // the round-start beam narrowing
const FLOOD_MS = 380;             // the reveal's beam widening
const END_FLOOD_MS = 900;
const CHEERS = ['ari-cheer-1', 'ari-cheer-2', 'ari-cheer-3', 'ari-cheer-4'];
const NUDGES = ['ari-nudge-1', 'ari-nudge-2', 'ari-nudge-3'];

const reducedMotion = () =>
  !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

export class Game {
  /**
   * @param {object} o
   * @param {object} o.config      config.json
   * @param {string} o.modeId
   * @param {HTMLElement} o.root   the mounted `.fc-play` section
   * @param {object} o.actors      role → Actor (DOM pose actors)
   * @param {object|null} o.cave   the Pixi field, or null for the §3.5 static screen
   * @param {object} o.session     page-lifetime flags shared across mode plays
   * @param {Promise} [o.introDone] the mode-intro line already speaking on the splash
   * @param {() => void} o.onExit  the end screen's play button → the splash
   */
  constructor({ config, modeId, root, actors, cave, session, introDone, onExit }) {
    this.config = config;
    this.mode = config.modes.find((m) => m.id === modeId) || config.modes[0];
    this.root = root;
    this.actors = actors || {};
    this.cave = cave || null;
    this.session = session;
    this.introDone = introDone || Promise.resolve();
    this.onExit = onExit || (() => {});

    this.rounds = config.rounds || [];
    this.roundIndex = -1;
    this.solved = 0;
    this.wrongThisRound = 0;
    this.busy = false;
    this.awaitingInput = false;
    this.finished = false;
    this.screen = 'play';
    this.timeScale = 1;
    this.rng = Math.random;
    this.timers = new Set();
    this.waiters = new Set();
    this.disposers = [];
    this.letters = [];
    this.trophies = [];
    this.voiceToken = 0;
    this.ledge = null;
    this.target = null;
    this.roundObject = null;

    this.els = {
      stage: root.querySelector('.fc-stage'),
      pips: root.querySelector('.fc-pips'),
      button: root.querySelector('.fc-round-btn'),
      sound: root.querySelector('.hud-sound'),
      live: root.querySelector('.fc-sr-only'),
    };

    // The no-WebGL screen has no cave, so it owns its own copy of the transform.
    this.tf = this.cave ? this.cave.transform : createTransform(config.art.space);
    if (!this.cave) {
      this.onWinResize = () => { this.tf.update(window.innerWidth, window.innerHeight); this.reflow(); };
      window.addEventListener('resize', this.onWinResize);
    }

    if (this.cave) {
      this.beam = new BeamController({
        host: this.els.stage,
        spotlight: this.cave.spotlight,
        transform: this.tf,
        clampRect: () => this.cave.clampRect(),
        onTap: (art) => { this.resolveTap(art); },
        onGesture: () => this.onGesture(),
        onUnlock: () => this.session.unlockAudio?.(),
        onKeyAnswer: () => this.keyAnswer(),
      });
      this.disposers.push(this.cave.onResize(() => this.reflow()));
      this.disposers.push(this.cave.onVisible(() => { if (this.awaitingInput) this.armIdle(); }));
      // The ONE reactive surface: letter visuals and the hint-tap watcher are
      // driven from here and never from a ticker (§4.4).
      this.disposers.push(this.cave.spotlight.onChange(() => this.onLight()));
    }

    // Ari enters from the left edge, and the sound button lives in that corner.
    // Shift him clear of it: the actor layer is pointer-events:none, so the
    // button stayed tappable, but a five-year-old cannot tap what an armadillo
    // is standing in front of.
    if (this.actors.ari) {
      this.actors.ari.el.style.left =
        'calc(max(12px, env(safe-area-inset-left)) + var(--hud) + 2vmin)';
    }

    if (this.els.button) {
      this.disposers.push(onTap(this.els.button, () => this.roundButton(), {
        feedback: (e) => { e.preventDefault(); sfx.tick(); },
      }));
      this.els.button.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
  }

  // ---- lifecycle -----------------------------------------------------------

  async start() {
    await content.ready();
    this.bag = this.makeBag();
    await this.nextRound();
  }

  destroy() {
    this.finished = true;
    this.awaitingInput = false;
    this.clearIdle();
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const done of [...this.waiters]) { try { done(); } catch { /* ignore */ } }
    this.waiters.clear();
    if (this.veilRaf) { cancelAnimationFrame(this.veilRaf); this.veilRaf = 0; }
    this.voiceToken += 1;
    voice.stop();
    speech.stop();
    if (this.beam) { this.beam.destroy(); this.beam = null; }
    if (this.onWinResize) window.removeEventListener('resize', this.onWinResize);
    for (const d of this.disposers) { try { d(); } catch { /* ignore */ } }
    this.disposers = [];
    this.clearLetters();
    this.clearTrophies();
    this.hideLedge();
    for (const a of Object.values(this.actors)) a.hide();
  }

  /** setTimeout that honours timeScale and is cleared on destroy. */
  after(ms, fn) {
    const t = setTimeout(() => { this.timers.delete(t); fn(); }, Math.max(0, ms * this.timeScale));
    this.timers.add(t);
    return t;
  }

  /**
   * A cancellable pause. Every waiter is remembered, because destroy() clears the
   * timers and an `await this.wait()` whose timer was cleared would otherwise
   * never settle — hanging whatever awaited it (the reveal, a voice sequence,
   * winRound) for the life of the page. Back mid-reveal hits this every time.
   */
  wait(ms) {
    return new Promise((resolve) => {
      const done = () => { this.waiters.delete(done); resolve(); };
      this.waiters.add(done);
      this.after(ms, done);
    });
  }

  /** Keep the render pump alive for exactly as long as something is moving. */
  track(p) { return this.cave ? this.cave.track(p) : Promise.resolve(p); }

  // ---- letter selection (§2.2) ---------------------------------------------

  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  eligible() {
    return this.mode.eligibleLetters === 'all-except-x'
      ? ALPHABET.filter((L) => L !== 'X')     // §9.12 — X cannot honestly prompt an initial sound
      : ALPHABET.slice();
  }

  /** A seedable bag, so no letter is the target twice in one mode play. */
  makeBag() { return this.shuffle(this.eligible()); }

  phonic(letter) {
    const info = content.letterInfo(letter);
    return info ? info.phonic : null;
  }

  /**
   * Letters that ALSO answer the prompt the child just heard, and so must never
   * be decoys. Computed from letters.json, never hard-coded — today it fires
   * exactly on C↔K, in `sound` and `picture`.
   */
  sameAnswerAs(T) {
    if (this.mode.id === 'find') return [];   // no two letters share a NAME
    const p = this.phonic(T);
    if (!p) return [];
    return ALPHABET.filter((L) => L !== T && this.phonic(L) === p);
  }

  /** The round-1 vowel softener (§2.2). A tuning knob, not a rule. */
  neighboursOf(T) {
    if (!this.mode.phonicNeighboursRound1Only || this.roundIndex !== 0) return [];
    const groups = this.config.phonicNeighbours || [];
    const g = groups.find((grp) => grp.includes(T));
    return g ? g.filter((L) => L !== T) : [];
  }

  pickDistinct(pool, n) {
    return this.shuffle(pool).slice(0, Math.max(0, n));
  }

  /** The round's letters: the target plus c confusable and n non-confusable decoys. */
  chooseLetters(T, round) {
    const conf = (this.config.confusables && this.config.confusables[T]) || [];
    const banned = new Set([T, ...this.sameAnswerAs(T), ...this.neighboursOf(T)]);
    const confPool = conf.filter((L) => !banned.has(L));
    const nonConf = ALPHABET.filter((L) => !banned.has(L) && !conf.includes(L));

    const c = round.confusableDecoys ?? 0;
    const n = this.config.nonConfusableDecoysPerRound ?? 2;
    const picked = this.pickDistinct(confPool, c);
    // Should conf − banned ever hold fewer than c, take the shortfall from
    // nonConf, so a future confusables edit cannot silently produce a
    // four-letter round 3.
    const shortfall = c - picked.length;
    const nonPicked = this.pickDistinct(nonConf, n + shortfall);
    return this.shuffle([T, ...picked, ...nonPicked]);
  }

  // ---- rounds --------------------------------------------------------------

  async nextRound() {
    if (this.finished) return;
    this.cancelAutoNext();
    this.clearIdle();
    this.hideButton();
    this.stowTrophies();
    this.clearLetters();
    this.hideLedge();
    this.wrongThisRound = 0;
    this.hintTapDone = false;
    this.roundIndex += 1;
    if (this.roundIndex >= this.rounds.length) { this.finish(); return; }

    this.screen = 'play';
    this.busy = false;
    this.awaitingInput = false;
    this.beam?.setEnabled(true);
    this.els.sound?.classList.remove('hidden');

    const round = this.rounds[this.roundIndex];
    this.target = this.bag[this.roundIndex] || this.bag[0];

    // The reveal object is drawn independently of the letter, so a replayed A
    // gives ant, then alligator, then apple (§2.3).
    const objects = content.letterObjects(this.target);
    this.roundObject = objects.length
      ? objects[Math.floor(this.rng() * objects.length)]
      : null;

    const chars = this.chooseLetters(this.target, round);
    await this.placeLetters(chars);

    // The beam is already on, centred — the child never faces a black screen.
    if (this.beam) {
      const start = this.config.layout.beamStart;
      this.beam.moveTo(start.x, start.y);
      await this.track(this.cave.spotlight.setRadius(round.radius, { ms: RADIUS_MS }));
      this.onLight();
    }

    this.awaitingInput = true;
    this.renderPips();
    this.openRound();
  }

  async placeLetters(chars) {
    const pts = this.cave
      ? this.cave.layout(chars.length, this.rng)
      : layoutLetters(chars.length, this.rng, this.config, this.tf);

    const capHeight = this.config.layout.letterCapHeight || 170;
    const hitR = this.config.layout.hitRadius || 110;

    this.letters = chars.map((ch, i) => {
      const p = pts[i] || pts[0] || { x: 800, y: 640 };
      const rec = {
        id: `letter-${this.roundIndex}-${ch}`,
        char: ch,
        role: ch === this.target ? 'correct' : 'wrong',
        x: p.x,
        y: p.y,
        hitR,
        view: null,
        el: null,
      };
      if (this.cave) {
        const L = createLetter(this.cave.PIXI, ch, { capHeight });
        L.setPosition(p.x, p.y);
        this.cave.scene.addChild(L.view);
        rec.view = L;
        // r: 0 — litness is sampled at the registered CENTRE (§6.3). The hit
        // radius decides whether the child touched the letter; the centre decides
        // whether the letter is visible. §4.3's `r: 110` would widen litness to
        // 240 art px at R 165 and quietly gut the unlit-tap rule of §6.4.
        this.cave.spotlight.register(rec.id, { x: p.x, y: p.y, r: 0 });
      } else {
        rec.el = this.makeDomLetter(rec, capHeight);
      }
      return rec;
    });

    if (this.cave) this.cave.requestRender();
    else this.reflow();
    return this.letters;
  }

  /**
   * §3.5's static screen. Every letter is visible, so every tap on one is a real
   * answer — the unlit-tap rule has nothing to apply to. Same `onTap` press path,
   * same `attempt()`, same voice, same HUD, same QLOBE_DEBUG. The child loses the
   * search; they do not lose the game.
   */
  makeDomLetter(rec, capHeight) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'fc-fallback-letter';
    el.textContent = rec.char;
    el.setAttribute('aria-label', rec.char);
    el.dataset.id = rec.id;
    this.els.stage.appendChild(el);
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.disposers.push(onTap(el, () => this.attempt(rec.id), {
      feedback: (e) => { e.preventDefault(); this.session.unlockAudio?.(); this.onGesture(); },
    }));
    rec.capHeight = capHeight;
    return el;
  }

  /** Resize / orientation change: only the transform moved. */
  reflow() {
    if (this.cave) {
      // Cover-fit crops the sides hard in portrait, so a letter authored inside
      // the playable band can end up off screen. Nudge it back and re-register;
      // nothing is reshuffled and no round state changes.
      const band = this.cave.band();
      for (const rec of this.letters) {
        const x = Math.min(Math.max(rec.x, band.x0), band.x1);
        const y = Math.min(Math.max(rec.y, band.y0), band.y1);
        if (x !== rec.x || y !== rec.y) {
          rec.x = x; rec.y = y;
          rec.view?.setPosition(x, y);
          this.cave.spotlight.register(rec.id, { x, y, r: 0 });
        }
      }
      // The ledge is clamped to the VISIBLE rect, so an orientation change or a
      // resized window moves where it may sit. Same nudge, no state change.
      if (this.ledge && !(this.ledge instanceof HTMLElement)) {
        const spot = this.cave.ledgeSpot();
        this.ledge.position.set(spot.x, spot.y);
      }
      this.cave.requestRender();
      return;
    }
    for (const rec of this.letters) {
      if (!rec.el) continue;
      const p = this.tf.toScreen(rec.x, rec.y);
      rec.el.style.left = `${p.x}px`;
      rec.el.style.top = `${p.y}px`;
      rec.el.style.fontSize = `${this.tf.toScreenLen(rec.capHeight || 170) / 0.72}px`;
    }
  }

  clearLetters() {
    if (this.cave) this.cave.spotlight.clearTargets();
    for (const rec of this.letters) {
      rec.view?.destroy();
      rec.el?.remove();
    }
    this.letters = [];
    this.cave?.requestRender();
  }

  // ---- light ---------------------------------------------------------------

  litness(id) {
    if (!this.cave) return 1;                      // §3.5: everything is lit, honestly
    return this.cave.spotlight.litness(id);
  }

  byId(id) { return this.letters.find((l) => l.id === id) || null; }

  /** Every letter's look, plus the hint-tap watcher. Fired by spotlight.onChange. */
  onLight() {
    if (!this.cave) return;
    for (const rec of this.letters) rec.view?.setLitness(this.litness(rec.id));
    this.watchHintTap();
  }

  watchHintTap() {
    if (this.hintTapDone || !this.awaitingInput || this.busy || this.screen !== 'play') return;
    const correct = this.letters.find((l) => l.role === 'correct');
    if (!correct) return;
    if (this.litness(correct.id) >= LIT_HINT) {
      if (this.hintTapTimer) return;
      this.hintTapTimer = this.after(HINT_TAP_HOLD_MS, () => {
        this.hintTapTimer = null;
        if (this.hintTapDone || !this.awaitingInput || this.busy) return;
        if (this.litness(correct.id) < LIT_HINT) return;
        this.hintTapDone = true;
        this.speakAs('ari-hint-tap', 'notice');
      });
    } else if (this.hintTapTimer) {
      clearTimeout(this.hintTapTimer);
      this.timers.delete(this.hintTapTimer);
      this.hintTapTimer = null;
    }
  }

  // ---- input ---------------------------------------------------------------

  /**
   * §6.4's decision tree, in one place. A lit letter under the point is an
   * answer; ANYTHING else — including an unlit letter — moves the light.
   */
  resolveTap(art) {
    const id = this.pickTarget(art);
    if (id && this.litness(id) >= LIT_ANSWER) return this.attempt(id);
    this.beam?.glideTo(art.x, art.y);
    return Promise.resolve({ accepted: false, reason: id ? 'unlit' : 'moved', moved: true });
  }

  /** Nearest registered letter whose hit circle contains the art point. */
  pickTarget(art) {
    let best = null;
    let bestD = Infinity;
    for (const rec of this.letters) {
      const d = Math.hypot(rec.x - art.x, rec.y - art.y);
      if (d <= rec.hitR && d < bestD) { best = rec.id; bestD = d; }
    }
    return best;
  }

  /** QLOBE_DEBUG.tap(id) — the exact handler a real pointerup reaches. */
  tapById(id) {
    const rec = this.byId(id);
    if (!rec) return Promise.resolve({ accepted: false, reason: 'no-target' });
    if (!this.cave) return this.attempt(id);
    return this.resolveTap({ x: rec.x, y: rec.y });
  }

  /** Enter / Space: answer the brightest lit target (§15). */
  keyAnswer() {
    if (!this.cave || !this.awaitingInput || this.busy) return;
    const lit = this.cave.spotlight.litTargets(LIT_ANSWER);
    if (!lit.length) { this.speakAs('ari-hint-move', 'interact'); return; }
    this.attempt(lit[0]);
  }

  /**
   * THE one place an input is judged.
   * @returns {Promise<{accepted:boolean, reason?:string}>}
   */
  async attempt(id) {
    if (this.screen !== 'play') return { accepted: false, reason: 'not-playing' };
    if (!this.awaitingInput) return { accepted: false, reason: 'round-complete' };
    if (this.busy) return { accepted: false, reason: 'busy' };
    const rec = this.byId(id);
    if (!rec) return { accepted: false, reason: 'no-target' };
    // Defence in depth: resolveTap() already refuses an unlit tap, but the DOM
    // and keyboard paths land here too and the rule must hold for all of them.
    if (this.litness(id) < LIT_ANSWER) return { accepted: false, reason: 'unlit' };

    this.onGesture();
    let ok = false;
    try {
      if (rec.role === 'correct') {
        await this.reveal(rec);
        ok = true;
        return { accepted: true };
      }
      await this.softNo(rec);
      ok = true;
      return { accepted: false, reason: 'wrong-letter' };
    } catch {
      return { accepted: false, reason: 'error' };
    } finally {
      // An exception mid-reveal must still release busy — the child is never
      // locked out (§6.5 rule 4), and `awaitingInput` is back within 1.5 s.
      if (!ok && !this.finished) {
        this.screen = 'play';
        this.busy = false;
        this.awaitingInput = true;
        this.beam?.setEnabled(true);
        this.armIdle();
      }
    }
  }

  /** §6.6 — no loss, no score, no streak, nothing removed, never a buzzer. */
  async softNo(rec) {
    this.wrongThisRound += 1;
    sfx.boing();
    this.track(rec.view ? rec.view.wobble() : this.domWobble(rec));
    const key = NUDGES[Math.min(this.wrongThisRound, NUDGES.length) - 1];
    this.speakAs(key, 'notice');
    // Input is never held: a child who reaches straight for the right letter must
    // not have that tap swallowed by the nudge still being spoken.
    this.after(900, () => {
      if (this.awaitingInput && !this.busy && this.screen === 'play') this.replayPrompt();
    });
    // After the third wrong attempt the beam-glide hint fires immediately rather
    // than waiting out the idle timer.
    if (this.wrongThisRound >= 3) this.after(1200, () => this.hintDark());
    this.armIdle();
  }

  domWobble(rec) {
    if (!rec.el || reducedMotion()) return Promise.resolve();
    rec.el.animate(
      [{ transform: 'translate(-50%,-50%) rotate(0deg)' },
        { transform: 'translate(-50%,-50%) rotate(6deg)' },
        { transform: 'translate(-50%,-50%) rotate(-6deg)' },
        { transform: 'translate(-50%,-50%) rotate(3deg)' },
        { transform: 'translate(-50%,-50%) rotate(0deg)' }],
      { duration: 320, easing: 'ease-in-out' },
    );
    return Promise.resolve();
  }

  // ---- the reveal (§3.3) ----------------------------------------------------

  async reveal(rec) {
    this.busy = true;
    this.awaitingInput = false;
    this.screen = 'reveal';
    this.clearIdle();
    this.beam?.setEnabled(false);
    this.solved += 1;
    this.renderPips();

    sfx.tada();
    const word = this.roundObject ? this.roundObject.word : null;
    // §2.3: in picture mode the prompt sprite and the reveal sprite are the SAME
    // object — "it springs into the alcove as the payoff". Leaving the ledge copy
    // up puts two identical watermelons on screen and turns the payoff into a
    // duplicate. The ledge goes as the alcove one arrives.
    this.hideLedge();

    if (this.cave) {
      this.track(rec.view.bloomFull());
      const PIXI = this.cave.PIXI;
      if (reducedMotion()) {
        this.track(sparkle(PIXI, this.cave.above, rec.x, rec.y, 0xffd75e));
      } else {
        this.track(burst(PIXI, this.cave.above, rec.x, rec.y, { count: 34 }));
      }
      // The alcove floods: "you found it, and now you can see."
      const R = this.rounds[this.roundIndex].radius;
      this.track(this.cave.spotlight.moveTo(rec.x, rec.y, { ms: FLOOD_MS }));
      this.track(this.cave.spotlight.setRadius(R * 1.9, { ms: FLOOD_MS }));
      await this.wait(FLOOD_MS * 0.6);
      // wait() settles immediately when destroy() runs (back mid-reveal), so
      // everything after it has to check that there is still a cave to draw in.
      if (this.finished || !this.cave) return;

      const tex = word ? await this.cave.loadObjectTexture(this.objectUrl(word)) : null;
      if (this.finished || !this.cave) return;
      // Above the letter, not on top of it: the child has to see BOTH, or the
      // letter↔object pairing the whole reveal teaches is lost. The letter is
      // 1.25× its cap height by now (bloomFull), so the clearance has to be
      // half the bloomed letter plus half the object, or they collide.
      const cap = this.config.layout.letterCapHeight || 170;
      const objH = cap * 1.25;
      const spot = this.objectSpot(rec.x, rec.y, cap, objH);
      const { sprite, done } = revealObject(PIXI, this.cave.above, tex, {
        x: spot.x, y: spot.y, height: objH,
      });
      if (sprite) this.trophies.push(sprite);
      await this.track(done);
    } else {
      await this.domReveal(rec, word);
    }

    this.announce(word ? voice.text(`isfor-${word}`) : '');
    this.showButton();
    this.autoNext = this.after(AUTO_NEXT_MS, () => this.nextRound());

    if (word) await this.speakFully(`isfor-${word}`, null, 1600);
    if (this.finished || this.screen !== 'reveal') return;
    const cheer = this.session.firstSuccess
      ? 'ari-found'
      : CHEERS[Math.floor(this.rng() * CHEERS.length)];
    this.session.firstSuccess = false;
    this.speakAs(cheer, 'celebrate');
  }

  /**
   * Where the reveal object sits, in art y. Above the letter by preference — the
   * child has to see BOTH, or the letter↔object pairing the whole reveal teaches
   * is lost — but never inside the HUD bands (§4.3: top 0–260, bottom 1000–1200),
   * or a letter high in the field parks its prize under the back button. When
   * there is no room above, it goes below instead.
   */
  /**
   * Where the revealed object stands, in art space.
   *
   * Beside the letter, never on it: the child has to see BOTH, or the
   * letter↔object pairing the whole reveal teaches is lost. Above by preference
   * (letter, then friend), below when the letter sits near the top of the field,
   * and stepped sideways if a friend from an earlier round is already standing
   * there — all three are on screen together on the end screen, and two sprites
   * sharing one alcove reads as clutter, not as a payoff.
   *
   * Everything is clamped into the letter band widened by half a letter, which
   * is what keeps a friend off the back button, the pips and the centre-bottom
   * play button in every viewport.
   */
  objectSpot(letterX, letterY, cap, objH) {
    const gap = cap * 0.66 + objH * 0.5;
    const band = this.cave ? this.cave.band() : { x0: 300, x1: 1300, y0: 300, y1: 980 };
    const pad = cap * 0.62 - objH * 0.5;
    const clampY = (y) => Math.min(Math.max(y, band.y0 + pad), Math.max(band.y0 + pad, band.y1 - pad));
    const clampX = (x) => Math.min(Math.max(x, band.x0 - objH * 0.4), Math.max(band.x0, band.x1 + objH * 0.4));
    const ys = [clampY(letterY - gap), clampY(letterY + gap)];
    const xs = [letterX, letterX - objH * 0.95, letterX + objH * 0.95].map(clampX);

    const spots = [];
    for (const x of xs) for (const y of ys) spots.push({ x, y });
    const readable = spots.filter((s) => Math.hypot(s.x - letterX, s.y - letterY) >= gap * 0.6);
    return readable.find((s) => !this.trophyNear(s.x, s.y, objH))
      || readable[0] || spots[0];
  }

  /** Is a friend from an earlier round already standing at (x, y)? */
  trophyNear(x, y, objH) {
    return this.trophies.some((s) => s && typeof s.x === 'number'
      && Math.abs(s.x - x) < objH * 0.9 && Math.abs(s.y - y) < objH * 0.9);
  }

  objectUrl(word) {
    // Document-relative, per §12.1: Pixi Assets.load and <img> resolve against
    // /games/flashlight-cave/index.html, not against this module.
    return `../../shared/assets/objects/${word}.png`;
  }

  async domReveal(rec, word) {
    if (rec.el) rec.el.classList.add('is-found');
    if (!word) return;
    const img = document.createElement('img');
    img.className = 'fc-ledge-object';
    img.alt = '';
    img.draggable = false;
    // Keyed, like the Pixi path — nine of the shared sprites have no alpha and
    // would otherwise be a white box on the darkened plate (see cave.js).
    objectImageSrc(this.objectUrl(word)).then((src) => { img.src = src; });
    img.style.position = 'absolute';
    img.style.width = `${this.tf.toScreenLen(240)}px`;
    img.style.transform = 'translate(-50%, -50%)';
    img.style.pointerEvents = 'none';
    img.style.filter = 'drop-shadow(0 0 2vmin rgba(255,196,106,.9))';
    const p = this.tf.toScreen(rec.x, rec.y - 120);
    img.style.left = `${p.x}px`;
    img.style.top = `${p.y}px`;
    this.els.stage.appendChild(img);
    this.trophies.push(img);
    await this.wait(120);
  }

  /**
   * Between rounds a found object leaves `above` (where the veil cannot dim it)
   * for the darkened scene, and goes invisible there. It has to: a bright cut-out
   * sprite left floating over the next round's dark cave clutters exactly the
   * field the child is searching. It comes back when the end screen lifts the
   * dark, which is what makes "look at all our friends" land.
   */
  stowTrophies() {
    if (!this.cave) return;
    for (const s of this.trophies) {
      if (!s || !s.parent) continue;
      if (s.parent !== this.cave.scene) this.cave.scene.addChild(s);
      s.visible = false;
    }
    this.cave.requestRender();
  }

  showTrophies() {
    for (const s of this.trophies) { if (s && 'visible' in s) s.visible = true; }
    this.cave?.requestRender();
  }

  clearTrophies() {
    for (const s of this.trophies) {
      if (!s) continue;
      if (s instanceof HTMLElement) s.remove();     // the §3.5 screen's <img>
      else destroyDisplay(s);                       // cancels the spring first
    }
    this.trophies = [];
  }

  // ---- the end screen (§3.4) ------------------------------------------------

  async finish() {
    this.screen = 'end';
    this.busy = true;
    this.awaitingInput = false;
    this.beam?.setEnabled(false);
    this.clearIdle();
    this.stowTrophies();
    this.showTrophies();
    this.renderPips();
    this.showButton();
    // §3.6: no sound button on the end screen — there is no prompt left to hear.
    this.els.sound?.classList.add('hidden');

    if (this.cave) {
      const spot = this.cave.spotlight;
      this.track(spot.moveTo(this.config.art.space.w / 2, this.config.art.space.h / 2,
        { ms: reducedMotion() ? 0 : END_FLOOD_MS }));
      this.track(spot.setRadius(1400, { ms: reducedMotion() ? 0 : END_FLOOD_MS }));
      await this.track(this.fadeVeil(this.config.spotlight?.veilAlpha ?? 0.9, 0.12, END_FLOOD_MS));
      if (this.finished || this.screen !== 'end') return;
      const PIXI = this.cave.PIXI;
      const cx = this.config.art.space.w / 2;
      const cy = this.config.art.space.h * 0.42;
      if (reducedMotion()) this.track(sparkle(PIXI, this.cave.above, cx, cy, 0xffd75e));
      else this.track(burst(PIXI, this.cave.above, cx, cy, { count: 40, power: 9 }));
    } else if (this.els.stage) {
      const plate = this.els.stage.querySelector('.fc-fallback-plate');
      if (plate) plate.style.filter = 'brightness(1)';
    }

    sfx.tada();
    this.holdActor();
    this.speakAs('ari-end', 'celebrate', { hold: true });
    await this.wait(voice.duration('ari-end') * 1000 + 400 || 2600);
    if (this.screen !== 'end') return;
    this.speakAs('ari-replay-tip', 'celebrate', { hold: true });
  }

  /**
   * setVeil is not animatable, so drive it from one small rAF — and cancel that
   * rAF in destroy(). Back can be pressed mid-fade, and a frame that lands after
   * the spotlight is destroyed throws inside Pixi.
   */
  fadeVeil(from, to, ms) {
    const spot = this.cave.spotlight;
    if (reducedMotion()) { spot.setVeil({ alpha: to }); return Promise.resolve(); }
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now) => {
        this.veilRaf = 0;
        if (this.finished) { resolve(); return; }
        const p = Math.min(1, (now - t0) / ms);
        spot.setVeil({ alpha: from + (to - from) * p });
        if (p >= 1) resolve();
        else this.veilRaf = requestAnimationFrame(step);
      };
      this.veilRaf = requestAnimationFrame(step);
    });
  }

  // ---- HUD ------------------------------------------------------------------

  renderPips() {
    if (!this.els.pips) return;
    const pips = [];
    for (let i = 0; i < this.rounds.length; i++) {
      const el = document.createElement('span');
      el.className = `fc-pip${i < this.solved ? ' is-on' : ''}`;
      pips.push(el);
    }
    this.els.pips.replaceChildren(...pips);
  }

  showButton() { this.els.button?.classList.remove('hidden'); }

  hideButton() { this.els.button?.classList.add('hidden'); }

  cancelAutoNext() {
    if (this.autoNext) { clearTimeout(this.autoNext); this.timers.delete(this.autoNext); this.autoNext = null; }
  }

  /** The reveal's button advances; the end screen's returns to the splash. */
  roundButton() {
    // `ari-again` belongs to the splash, not to this screen: onExit() tears the
    // mode down and mounting the splash calls voice.stop(), so a line started
    // here is cut off mid-word. main.js speaks it after the splash is up.
    if (this.screen === 'end') { this.onExit(); return; }
    this.cancelAutoNext();
    this.speakAs('ari-next', 'enter');
    this.nextRound();
  }

  /**
   * Ari holds the end screen instead of sliding out after a line.
   *
   * §3.4 asks for him CENTRE, and that is not taken: the big btn-play.png is
   * centre-bottom on the same screen, so a centred Ari sits directly under it
   * and the button lands on his face. He keeps his usual edge position, where
   * the sound button has just been hidden, and nothing overlaps.
   */
  holdActor() {
    const a = this.actors.ari;
    if (!a) return;
    this.clearActorHide();
    a.show('celebrate');
  }

  // ---- voice ----------------------------------------------------------------

  /** Mirror the prompt into the aria-live region. Never rendered — §15. */
  announce(text) { if (this.els.live) this.els.live.textContent = text || ''; }

  speakAs(key, pose = 'interact', { hold = false } = {}) {
    const actor = this.actors[voice.speaker(key)];
    if (actor) {
      actor.show(pose);
      this.clearActorHide();
      if (!hold) this.actorHide = this.after(3400, () => actor.hide());
    }
    return voice.say(key);
  }

  clearActorHide() {
    if (this.actorHide) { clearTimeout(this.actorHide); this.timers.delete(this.actorHide); this.actorHide = null; }
  }

  /**
   * Speak and wait, bounded by the line's OWN recorded length plus a beat — a
   * fixed timeout starts clipping lines the moment a voice is re-recorded slower.
   */
  speakFully(key, pose, minMs) {
    const cap = Math.max(minMs, voice.duration(key) * 1000 + 400);
    const said = pose ? this.speakAs(key, pose) : voice.say(key);
    return Promise.race([said, this.wait(cap)]);
  }

  /** The prompt sequence for this mode (§7.2). Stem + token, never a whole sentence. */
  promptKeys() {
    // `target` is null between startMode() and the round being built, and
    // debugState() -> promptText() -> here, so an observer that polls
    // QLOBE_DEBUG.getState() without awaiting startMode() used to crash the
    // page. The debug surface has to be safe to poll at any instant.
    const lower = (this.target || '').toLowerCase();
    if (!lower) return [];
    if (this.mode.id === 'find') return [this.mode.promptStemKey, `letter-${lower}`];
    if (this.mode.id === 'sound') {
      return [this.mode.listenKey, this.mode.promptStemKey,
        (this.config.phonics?.map || {})[lower]].filter(Boolean);
    }
    return [this.mode.promptStemKey];
  }

  promptText() {
    return this.promptKeys().map((k) => voice.text(k)).filter(Boolean).join(' ');
  }

  async saySequence(keys, pose) {
    const token = ++this.voiceToken;
    for (let i = 0; i < keys.length; i++) {
      if (token !== this.voiceToken || this.finished) return;
      await this.speakFully(keys[i], i === 0 ? pose : null, 900);
      if (i < keys.length - 1) await this.wait(SEQ_GAP_MS);
    }
  }

  /** Hear it → see it → do it. Input is live throughout; nothing waits for audio. */
  async openRound() {
    const round1 = this.roundIndex === 0;
    if (round1) await this.introDone;
    if (this.finished || this.screen !== 'play') return;

    // The one line that explains the premise, spoken once per session.
    if (!this.session.saidDark) {
      this.session.saidDark = true;
      await this.speakFully('ari-dark', 'interact', 3200);
      if (this.finished || this.screen !== 'play') return;
    }

    if (this.mode.id === 'picture') {
      // ari-look is skipped on round 1 — ari-mode-picture has just said the same
      // thing on the splash; rounds 2 and 3 use it as the "here comes a new one" cue.
      if (!(round1 && this.mode.skipLookOnRound1) && this.mode.lookKey) {
        await this.speakFully(this.mode.lookKey, 'react', 1800);
      }
      // The prompt is "Which letter does THIS start with?" — so the object has
      // to be on the ledge, and finished popping in, BEFORE the line refers to
      // it. Only the speech waits: input has been live since openRound began,
      // and showLedge() bails on its own if the round moves on underneath it.
      await this.showLedge();
      if (this.finished || this.screen !== 'play') return;
    }

    this.announce(this.promptText());
    await this.saySequence(this.promptKeys(), 'interact');
    this.armIdle();
    this.hintMove();
  }

  /** The sound button: re-speak the whole prompt (play) or the reveal line. */
  replayPrompt() {
    this.clearIdle();
    if (this.screen === 'reveal') {
      const word = this.roundObject?.word;
      if (word) this.speakAs(`isfor-${word}`, 'celebrate');
      return;
    }
    if (this.screen !== 'play') return;
    this.saySequence(this.promptKeys(), 'interact');
    this.armIdle();
  }

  // ---- the picture-mode ledge (§3.2) ---------------------------------------

  async showLedge() {
    if (!this.roundObject) return;
    // openRound awaits this so the object is on screen before the prompt names
    // it, but input stays live throughout — so the round can still move on
    // underneath us while the texture loads.
    const round = this.roundIndex;
    const stale = () => this.finished || this.screen !== 'play' || this.roundIndex !== round;
    if (this.cave) {
      const tex = await this.cave.loadObjectTexture(this.objectUrl(this.roundObject.word));
      if (stale() || !this.cave) return;
      this.hideLedge();
      // Clamped into the visible art rect, not placed at the authored art-space
      // point — cover-fit on a wide, short window crops y 190 off the top.
      const spot = this.cave.ledgeSpot();
      const { group, done } = ledgeSprite(this.cave.PIXI, this.cave.above, tex, spot);
      this.ledge = group;
      // cave.track(), not a bare requestRender(): the pop-in has to DRIVE the
      // pump. A single render is the frame that performs the texture's GPU
      // upload, and it draws before the pixels are resident — so with nothing
      // scheduling the next frame the object stayed invisible until the child
      // moved the light and incidentally caused a repaint.
      await this.cave.track(done);
      return;
    }
    // The no-WebGL fallback ledge is CSS-positioned, so it never had the
    // art-space cropping problem the Pixi one did.
    if (stale()) return;
    this.hideLedge();
    const host = document.createElement('div');
    host.className = 'fc-ledge';
    host.innerHTML = '<img alt="" draggable="false" />';
    objectImageSrc(this.objectUrl(this.roundObject.word))
      .then((src) => { const i = host.querySelector('img'); if (i) i.src = src; });
    this.els.stage.appendChild(host);
    this.ledge = host;
  }

  hideLedge() {
    if (!this.ledge) return;
    // The ledge pops in over 380 ms and input is live the whole time (§3.0), so
    // this runs mid-tween routinely — cancel before destroying or the shared
    // tween pump dies (see the note at the head of letters.js).
    if (this.ledge instanceof HTMLElement) this.ledge.remove();
    else destroyDisplay(this.ledge, { children: true });
    this.ledge = null;
  }

  // ---- idle and hints (§3.2, §13) ------------------------------------------

  onGesture() {
    this.session.touched = true;
    if (this.hintMoveTimer) { clearTimeout(this.hintMoveTimer); this.timers.delete(this.hintMoveTimer); this.hintMoveTimer = null; }
    this.clearIdle();
    if (this.awaitingInput && !this.busy) this.armIdle();
  }

  /** 4 s on the first play screen of a session with no touch at all. Once. */
  hintMove() {
    if (this.session.saidHintMove || this.session.touched) return;
    this.hintMoveTimer = this.after(HINT_MOVE_MS, () => {
      this.hintMoveTimer = null;
      if (this.session.touched || this.session.saidHintMove) return;
      if (!this.awaitingInput || this.busy) return;
      this.session.saidHintMove = true;
      this.speakAs('ari-hint-move', 'interact');
    });
  }

  armIdle() {
    this.clearIdle();
    if (this.screen !== 'play') return;
    this.idleA = this.after(IDLE_MS, () => {
      if (!this.awaitingInput || this.busy) return;
      this.idleFlip = !this.idleFlip;
      this.speakAs(this.idleFlip ? 'ari-idle-1' : 'ari-idle-2', 'notice');
      this.idleB = this.after(IDLE_REPROMPT_MS, () => {
        if (!this.awaitingInput || this.busy) return;
        this.saySequence(this.promptKeys(), 'interact');
        this.idleC = this.after(IDLE_DARK_MS, () => this.hintDark());
      });
    });
  }

  clearIdle() {
    for (const t of [this.idleA, this.idleB, this.idleC, this.hintTapTimer]) {
      if (t) { clearTimeout(t); this.timers.delete(t); }
    }
    this.idleA = this.idleB = this.idleC = this.hintTapTimer = null;
  }

  /**
   * Tier 3: point, never solve. The beam glides toward the correct letter and
   * stops 1.2 R short of it — the child still has to close the distance and tap.
   */
  hintDark() {
    if (!this.awaitingInput || this.busy || this.screen !== 'play') return;
    this.speakAs('ari-hint-dark', 'notice');
    if (!this.cave || !this.beam) return;
    const correct = this.letters.find((l) => l.role === 'correct');
    if (!correct) return;
    const spot = this.cave.spotlight;
    const R = spot.radius;
    const dx = correct.x - spot.x;
    const dy = correct.y - spot.y;
    const d = Math.hypot(dx, dy) || 1;
    const stop = Math.max(0, d - R * 1.2);
    this.track(this.beam.moveTo(spot.x + (dx / d) * stop, spot.y + (dy / d) * stop,
      { ms: reducedMotion() ? 0 : 900 }));
  }

  // ---- the debug surface (§16) ---------------------------------------------

  debugState() {
    return {
      screen: this.screen,
      mode: this.mode.id,
      // Clamped: the end screen runs with roundIndex === rounds.length, and a
      // `round` of 4 out of a `roundsTotal` of 3 is not a state the v1 contract
      // can describe.
      round: Math.min(this.rounds.length, Math.max(1, this.roundIndex + 1)),
      roundsTotal: this.rounds.length,
      awaitingInput: this.awaitingInput && !this.busy,
      reducedMotion: reducedMotion(),
      quality: this.cave ? this.cave.spotlight.quality : 'dom',
      target: this.target,
      solved: this.solved,
      object: this.roundObject ? this.roundObject.word : null,
      promptText: this.promptText(),
    };
  }

  getTargets() {
    const hitR = this.config.layout.hitRadius || 110;
    return this.letters.map((rec) => {
      const c = this.tf.toScreen(rec.x, rec.y);
      const r = this.tf.toScreenLen(hitR);
      const litness = this.litness(rec.id);
      return {
        id: rec.id,
        char: rec.char,
        role: rec.role,
        rect: { x: c.x - r, y: c.y - r, w: r * 2, h: r * 2 },
        lit: litness >= LIT_ANSWER,
        litness,
      };
    });
  }

  getBeam() {
    if (!this.cave) return { x: 0, y: 0, radius: 0, quality: 'dom' };
    const s = this.cave.spotlight;
    return { x: s.x, y: s.y, radius: s.radius, quality: s.quality };
  }

  /**
   * The picture-mode ledge object: its ART position and its SCREEN rect, or null
   * when nothing is on the ledge. The screen rect is the point — the ledge is
   * authored above the playable band, so it is the one element that can walk off
   * the top of a wide, short viewport, and nothing in the debug surface could
   * previously observe that.
   */
  getLedge() {
    if (!this.ledge) return null;
    if (this.ledge instanceof HTMLElement) {
      const r = this.ledge.getBoundingClientRect();
      return { dom: true, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
    }
    if (!this.cave) return null;
    const spot = this.cave.ledgeSpot();
    const p = this.cave.transform.toScreen(spot.x, spot.y);
    const half = this.cave.transform.toScreenLen(spot.height / 2);
    // The group always has its halo; `hasObject` is whether the PICTURE made it.
    // Without this the gate can only prove a glow exists, which is exactly how a
    // ledge with no object on it shipped unnoticed.
    const kids = this.ledge.children || [];
    const pic = kids.find((c) => c.texture && c.texture !== this.cave.PIXI.Texture.EMPTY
      && c.blendMode !== 'add');
    return {
      dom: false,
      art: { x: spot.x, y: spot.y, height: spot.height },
      rect: { x: p.x - half, y: p.y - half, w: half * 2, h: half * 2 },
      hasObject: !!pic,
      objectAlpha: pic ? pic.alpha : 0,
      objectBounds: pic ? (() => { const b = pic.getBounds(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })() : null,
      objectTex: pic ? { w: pic.texture.width, h: pic.texture.height, valid: !!pic.texture.source } : null,
      groupScale: this.ledge.scale ? this.ledge.scale.x : null,
      word: this.roundObject?.word || null,
    };
  }

  moveBeam(x, y) {
    if (!this.beam) return this.getBeam();
    this.beam.moveTo(x, y);
    return this.getBeam();
  }

  /** Move the beam onto a target; resolves once it is lit. */
  async lightTarget(id) {
    const rec = this.byId(id);
    if (!rec) return false;
    if (!this.cave) return true;
    this.beam.moveTo(rec.x, rec.y);
    for (let i = 0; i < 40 && this.litness(id) < LIT_ANSWER; i++) await this.wait(16);
    return this.litness(id) >= LIT_ANSWER;
  }

  /** Complete the current round through the real input path. */
  async winRound() {
    const start = this.roundIndex;
    for (let guard = 0; guard < 40; guard++) {
      if (this.finished) break;
      if (this.busy || !this.awaitingInput) { await this.wait(25); continue; }
      const correct = this.letters.find((l) => l.role === 'correct');
      if (!correct) break;
      await this.lightTarget(correct.id);
      const r = await this.tapById(correct.id);
      if (r.accepted) break;
    }
    // Resolve once the round has actually moved on — the reveal auto-advances at
    // 6 s (scaled by fastTimers), so a QA loop can just call winRound() again.
    for (let w = 0; w < 400; w++) {
      if (this.finished || this.screen === 'end') break;
      if (this.roundIndex !== start && this.awaitingInput) break;
      await this.wait(25);
    }
    return this.debugState();
  }
}
