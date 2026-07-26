// game.js — the three counting modes.
//
//   cup      produce a set of N gems            (counting out a quantity)
//   chest    produce a set of N coins, gems are distractors (counting + sorting)
//   howmany  the container starts full; name the total       (cardinality)
//
// Input has exactly one attempt path, `attempt()`. A tap calls it, a drag calls
// it, and window.QLOBE_DEBUG.tap() calls it, so automated QA exercises the real
// handler. Dragging follows interaction-pattern #11 to the letter: window-level
// listeners filtered by pointerId, a single-drag lock, pointercancel AND blur
// treated as "glide home", the drop wrapped in try/finally, and a stray-clone
// sweep on every drag start and on destroy.

import * as sfx from '../../../shared/js/sfx.js';
import { onTap } from '../../../shared/js/tap.js';
import * as voice from './voice.js';
import { Stage } from './stage.js';
import { burst, clearConfetti } from './confetti.js';

const DRAG_SLOP = 10;          // px before a press becomes a drag
const FLIGHT_MS = 300;         // treasure arc into the container
const COUNT_TAIL_MS = 650;     // pacing for the count-along in How Many?
const IDLE_HINT_MS = 12000;
const IDLE_REPROMPT_MS = 15000;
const AUTO_NEXT_MS = 6000;
const CHEERS = ['cap-cheer-1', 'cap-cheer-2', 'cap-cheer-3', 'cap-cheer-4'];

const reducedMotion = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Game {
  /**
   * @param {object} opts
   * @param {object} opts.config      the whole config.json
   * @param {string} opts.modeId
   * @param {HTMLElement} opts.root   the `.ctc-play` screen
   * @param {Record<string,import('./actor.js').Actor>} opts.actors
   * @param {() => void} opts.onFinish called after the last round
   */
  constructor({ config, modeId, root, actors, onFinish }) {
    this.config = config;
    this.mode = config.modes.find((m) => m.id === modeId);
    this.root = root;
    this.actors = actors || {};
    this.onFinish = onFinish;

    this.rounds = this.mode.rounds.slice();
    this.roundIndex = -1;
    this.target = 0;
    this.placed = 0;
    this.claimed = 0;   // accepted, including still in flight — the over-count guard
    this.busy = false;
    this.awaitingInput = false;
    this.finished = false;
    this.timeScale = 1;
    this.rng = Math.random;
    this.disposers = [];
    this.timers = new Set();
    this.actorHides = new Map();
    this.drag = null;

    this.els = {
      stage: root.querySelector('.ctc-stage'),
      banner: root.querySelector('.ctc-banner'),
      target: root.querySelector('.ctc-target'),
      pips: root.querySelector('.ctc-pips'),
      tray: root.querySelector('.ctc-tray'),
      choices: root.querySelector('.ctc-choices'),
      again: root.querySelector('.ctc-again'),
    };

    this.stage = new Stage(this.els.stage, config.stages);
    this.stage.onMeasure = () => this.stage.relayout();

    this.disposers.push(onTap(this.els.again, () => { sfx.tick(); this.nextRound(); }));

    this.onWindowBlur = () => this.cancelDrag();
    window.addEventListener('blur', this.onWindowBlur);
  }

  // ---- lifecycle ----------------------------------------------------------

  async start() {
    this.sweepClones();
    // The field is built FIRST and the mode intro speaks over it. Awaiting the
    // intro before building would leave a 4-year-old looking at an empty stage
    // for the length of a sentence.
    await this.nextRound();
  }

  destroy() {
    this.finished = true;
    this.cancelDrag();
    this.sweepClones();
    this.sweepFliers();
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const d of this.disposers) { try { d(); } catch { /* ignore */ } }
    this.disposers = [];
    window.removeEventListener('blur', this.onWindowBlur);
    this.stage.destroy();
    clearConfetti();
    for (const a of Object.values(this.actors)) a.hide();
  }

  /** setTimeout that respects timeScale and is cleared on destroy. */
  after(ms, fn) {
    const t = setTimeout(() => { this.timers.delete(t); fn(); }, Math.max(0, ms * this.timeScale));
    this.timers.add(t);
    return t;
  }

  wait(ms) { return new Promise((r) => this.after(ms, r)); }

  // ---- rounds -------------------------------------------------------------

  async nextRound() {
    this.clearIdle();
    this.hideAgain();
    clearConfetti();
    this.roundIndex += 1;
    if (this.roundIndex >= this.rounds.length) { this.finish(); return; }

    this.target = this.rounds[this.roundIndex];
    this.placed = 0;
    this.claimed = 0;
    this.busy = false;
    this.awaitingInput = false;
    this.els.stage.classList.remove('is-won');

    await this.stage.show(this.stageName());
    this.stage.clear();

    if (this.mode.id === 'howmany') await this.setupHowMany();
    else await this.setupCollect();
  }

  stageName() {
    if (this.mode.stage !== 'alternate') return this.mode.stage;
    return this.roundIndex % 2 === 0 ? 'ship' : 'beach';
  }

  /** In `howmany` the treasure kind follows the stage. */
  wantKind() {
    if (this.mode.want) return this.mode.want;
    return this.stageName() === 'ship' ? 'gem' : 'coin';
  }

  otherKind() { return this.wantKind() === 'gem' ? 'coin' : 'gem'; }

  artFor(kind, i) {
    const list = this.config.treasures[kind];
    return list[Math.floor(this.rng() * list.length + i) % list.length];
  }

  // ---- modes 1 & 2: count a set out ---------------------------------------

  async setupCollect() {
    this.els.choices.classList.add('hidden');
    this.els.choices.replaceChildren();
    this.els.tray.classList.remove('hidden');
    this.buildTray();
    this.renderBanner();

    // The stage was laid out before this row existed, so its reserved heights were
    // guesses. Re-measure now that the tray is real.
    this.stage.measure();

    this.promptKey = `${this.mode.promptPrefix}${this.target}`;
    this.awaitingInput = true;
    this.openRound();
  }

  buildTray() {
    const n = this.mode.trayCount || 6;
    const kinds = [];
    for (let i = 0; i < n; i++) kinds.push(this.pickKind(i, n));
    // Sorting is the skill in chest mode, so a round that rolled no distractor
    // at all would quietly stop teaching it. Guarantee one.
    if (this.distractorsActive() && !kinds.includes(this.otherKind())) {
      kinds[n - 1] = this.otherKind();
    }
    shuffle(kinds, this.rng);
    this.els.tray.replaceChildren(...kinds.map((k, i) => this.makeTile(k, i)));
  }

  distractorsActive() {
    return (this.mode.distractorRate || 0) > 0
      && this.roundIndex + 1 >= (this.mode.distractorFromRound || 1);
  }

  /** Distractors only appear from the configured round on, and never crowd out
   *  the correct treasure — at least half the tray is always the right kind. */
  pickKind(index, total) {
    const rate = this.mode.distractorRate || 0;
    if (!this.distractorsActive()) return this.wantKind();
    const maxDistractors = Math.floor(total / 2);
    if (index >= maxDistractors) return this.wantKind();
    return this.rng() < rate ? this.otherKind() : this.wantKind();
  }

  makeTile(kind, i) {
    const tile = document.createElement('button');
    tile.className = 'ctc-tile';
    tile.type = 'button';
    tile.dataset.kind = kind;
    tile.dataset.id = `tile-${this.roundIndex}-${i}-${Math.floor(this.rng() * 1e6)}`;
    tile.setAttribute('aria-label', kind === 'gem' ? 'A gem' : 'A gold coin');
    const art = this.artFor(kind, i);
    tile.dataset.art = art;
    tile.innerHTML =
      `<img class="ctc-tile-card" src="${this.config.tileArt || './assets/tile.png'}" alt="" draggable="false" />` +
      `<img class="ctc-tile-art" src="${art}" alt="" draggable="false" />`;
    tile.addEventListener('pointerdown', (e) => this.onTilePointerDown(e, tile));
    // Pointer input runs through the drag path above (interaction-pattern #11),
    // which deliberately never uses `click`. Keep `click` for keyboard and
    // assistive tech only — detail === 0 means it was not a real pointer press.
    tile.addEventListener('click', (e) => { if (e.detail === 0) this.attempt(tile.dataset.id); });
    return tile;
  }

  /** Swap a consumed tile for a fresh one so the tray never runs dry. */
  refillTray(usedTile) {
    const i = [...this.els.tray.children].indexOf(usedTile);
    const remaining = this.target - this.placed;
    const correctLeft = [...this.els.tray.children]
      .filter((t) => t !== usedTile && t.dataset.kind === this.wantKind()).length;
    // Guarantee the child can always finish the round from what is on screen.
    const kind = correctLeft < remaining
      ? this.wantKind()
      : this.pickKind(this.els.tray.children.length, this.mode.trayCount || 6);
    const fresh = this.makeTile(kind, i < 0 ? 0 : i);
    fresh.classList.add('is-fresh');
    usedTile.replaceWith(fresh);
    this.after(30, () => fresh.classList.remove('is-fresh'));
  }

  // ---- mode 3: how many? --------------------------------------------------

  async setupHowMany() {
    this.els.tray.classList.add('hidden');
    this.els.tray.replaceChildren();
    this.els.choices.classList.remove('hidden');

    const kind = this.wantKind();
    for (let i = 0; i < this.target; i++) {
      const img = this.stage.placeTreasure(this.artFor(kind, i), i);
      img.dataset.index = String(i);
      img.classList.add('is-tappable');
      img.addEventListener('pointerdown', (e) => this.onCountTap(e, img));
    }

    this.renderBanner(true);
    this.buildChoices();
    this.stage.measure();      // see setupCollect — the choice row now exists

    this.promptKey = kind === 'gem' ? 'cap-howmany-gems' : 'cap-howmany-coins';
    this.awaitingInput = true;
    this.openRound();
  }

  buildChoices() {
    const n = this.mode.choices || 3;
    const opts = new Set([this.target]);
    const pool = [this.target - 1, this.target + 1, this.target - 2, this.target + 2];
    for (const v of pool) {
      if (opts.size >= n) break;
      if (v >= 1 && v <= 8) opts.add(v);
    }
    let v = 1;
    while (opts.size < n && v <= 8) { opts.add(v); v += 1; }
    const values = shuffle([...opts], this.rng);
    this.els.choices.replaceChildren(...values.map((value) => {
      const card = document.createElement('button');
      card.className = 'ctc-choice';
      card.type = 'button';
      card.dataset.value = String(value);
      card.dataset.id = `choice-${value}`;
      card.setAttribute('aria-label', `${value}`);
      card.innerHTML =
        `<img class="ctc-tile-card" src="./assets/tile.png" alt="" draggable="false" />` +
        `<span class="ctc-choice-num">${value}</span>`;
      this.disposers.push(onTap(card, () => this.attempt(card.dataset.id), {
        feedback: (e) => { e.preventDefault(); sfx.tick(); },
      }));
      return card;
    }));
  }

  /** Free touch-counting: tapping a treasure in the container names its ordinal. */
  onCountTap(e, img) {
    if (this.busy || !this.awaitingInput) return;
    e.preventDefault();
    e.stopPropagation();
    this.clearIdle();
    const n = Number(img.dataset.index) + 1;
    sfx.pop();
    img.classList.remove('is-bounce');
    void img.offsetWidth;
    img.classList.add('is-bounce');
    this.speakAs(`par-${n}`, 'notice');
    this.armIdle();
  }

  /** Light each treasure in turn while the parrot counts — the modelling beat. */
  async countAlong() {
    const items = [...this.stage.treasureEl.children];
    for (let i = 0; i < items.length; i++) {
      if (this.finished) return;
      items[i].classList.add('is-counting');
      await Promise.race([voice.say(`par-${i + 1}`), this.wait(COUNT_TAIL_MS)]);
      await this.wait(90);
    }
    await this.wait(240);
    for (const el of items) el.classList.remove('is-counting');
  }

  // ---- the one attempt path ------------------------------------------------

  /**
   * The single place an input is judged. Tap, drag-drop and QLOBE_DEBUG.tap()
   * all land here.
   * @param {string} id tile id (modes 1–2) or choice id (mode 3)
   */
  async attempt(id) {
    // Two different refusals, reported honestly: the round is already satisfied
    // (the common one, a child tapping past the target), or a teaching sequence
    // is mid-flight. Neither is "the tap was too fast" any more.
    if (!this.awaitingInput) return { accepted: false, reason: 'round-complete' };
    if (this.busy) return { accepted: false, reason: 'busy' };
    this.clearIdle();

    if (this.mode.id === 'howmany') {
      const card = this.els.choices.querySelector(`[data-id="${cssEscape(id)}"]`);
      if (!card) return { accepted: false, reason: 'no-target' };
      if (Number(card.dataset.value) === this.target) {
        this.busy = true;
        this.awaitingInput = false;
        card.classList.add('is-right');
        sfx.sparkle();
        await this.countAlong();
        await this.celebrate();
        return { accepted: true };
      }
      return this.softNoCard(card);
    }

    const tile = this.els.tray.querySelector(`[data-id="${cssEscape(id)}"]`);
    if (!tile) return { accepted: false, reason: 'no-target' };
    if (tile.dataset.kind !== this.wantKind()) {
      return this.softNo(tile, this.mode.nudgeKey);
    }
    return this.collect(tile);
  }

  /**
   * A wrong pick on a tray tile: playful, never punitive, nothing lost — and
   * NOT blocking. A child who reaches straight for the right treasure must not
   * have that tap swallowed by the nudge that is still being spoken.
   */
  softNo(el, nudgeKey) {
    sfx.silly();
    el.classList.remove('is-wobble');
    void el.offsetWidth;
    el.classList.add('is-wobble');
    this.after(560, () => el.classList.remove('is-wobble'));
    this.speakAs(this.rng() < 0.5 ? 'par-squawk-1' : 'par-squawk-2', 'react');
    this.after(620, () => {
      if (this.awaitingInput && !this.busy) this.speakAs(nudgeKey, 'interact');
    });
    this.armIdle();
    return { accepted: false, reason: 'wrong-kind' };
  }

  /**
   * A wrong numeral card in How Many?: this one DOES hold input, because the
   * response is a teaching sequence (count the set together) rather than a
   * throwaway nudge.
   */
  async softNoCard(card) {
    this.busy = true;
    sfx.silly();
    card.classList.remove('is-wobble');
    void card.offsetWidth;
    card.classList.add('is-wobble');
    this.speakAs(this.rng() < 0.5 ? 'par-squawk-1' : 'par-squawk-2', 'react');
    await this.wait(520);
    card.classList.remove('is-wobble', 'is-right');
    await Promise.race([this.speakAs('cap-nudge-count', 'interact'), this.wait(2600)]);
    await this.countAlong();
    await Promise.race([this.speakAs(this.promptKey, 'interact'), this.wait(3000)]);
    this.busy = false;
    this.awaitingInput = true;
    this.armIdle();
    return { accepted: false, reason: 'wrong-kind' };
  }

  /**
   * A correct pick. Accepted and returned SYNCHRONOUSLY; the arc, the landing and
   * the count word all happen afterwards, concurrently with any further taps.
   *
   * This used to hold a global `busy` lock across the flight plus the count word
   * — up to a second per treasure, during which a child's taps were silently
   * discarded. Over-counting is prevented instead by `claimed`, a reservation
   * taken the instant a pick is accepted: several pieces may be in the air at
   * once, but never more than the round asks for.
   */
  collect(tile) {
    const index = this.claimed;        // this piece's slot, and its count word
    this.claimed += 1;
    if (this.claimed >= this.target) this.awaitingInput = false;

    sfx.pop();
    const art = tile.dataset.art;
    const from = tile.getBoundingClientRect();
    tile.classList.add('is-spent');
    this.refillTray(tile);
    this.renderPips();                 // fills on the tap, not on the landing
    sfx.whoosh();

    this.flyIn(art, from).then(() => {
      if (this.finished) return;
      this.placed += 1;
      this.stage.placeTreasure(art, index).classList.add('is-landing');
      // Newest count word wins. A child tapping faster than speech will not hear
      // every number, but always hears the one they just reached.
      this.speakAs(`par-${index + 1}`, 'notice');
      if (this.placed >= this.target) this.celebrate();
      else this.armIdle();
    });

    return { accepted: true };
  }

  /** Arc a treasure sprite from the tray into the container mouth. */
  flyIn(art, fromRect) {
    const to = this.stage.dropPoint();
    const size = this.stage.itemSize();
    const flier = document.createElement('img');
    flier.className = 'ctc-flier';
    flier.src = art;
    flier.alt = '';
    flier.draggable = false;
    const x0 = fromRect.left + fromRect.width / 2;
    const y0 = fromRect.top + fromRect.height / 2;
    flier.style.width = `${size}px`;
    flier.style.left = `${x0 - size / 2}px`;
    flier.style.top = `${y0 - size / 2}px`;
    document.body.appendChild(flier);

    if (reducedMotion()) { flier.remove(); return Promise.resolve(); }

    const dx = to.x - x0;
    const dy = to.y - y0;
    const lift = Math.min(160, Math.abs(dy) * 0.45 + 60);
    const ms = FLIGHT_MS * this.timeScale;
    const anim = flier.animate(
      [
        { transform: 'translate(0px, 0px) scale(1) rotate(0deg)' },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(1.16) rotate(12deg)`, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.98) rotate(-4deg)` },
      ],
      { duration: ms, easing: 'cubic-bezier(.34,.9,.4,1)', fill: 'forwards' }
    );
    // Never await an animation unconditionally: in a backgrounded tab the
    // compositor throttles and `finished` can stall indefinitely, which would
    // leave input locked forever. The timeout always wins eventually.
    const settled = Promise.race([
      anim.finished.catch(() => {}),
      new Promise((r) => this.after(FLIGHT_MS + 260, r)),
    ]);
    return settled.then(() => flier.remove());
  }

  async celebrate() {
    this.clearIdle();
    this.els.stage.classList.add('is-won');
    sfx.tada();
    const p = this.stage.dropPoint();
    burst(p.x, p.y, 110);
    this.actors.parrot?.show('celebrate');
    this.actors.captain?.show('celebrate');
    await Promise.race([voice.say('par-full'), this.wait(1400)]);
    const cheer = CHEERS[Math.floor(this.rng() * CHEERS.length)];
    await Promise.race([this.speakAs(cheer, 'celebrate'), this.wait(3200)]);
    if (this.finished) return;
    this.showAgain();
    this.autoNext = this.after(AUTO_NEXT_MS, () => this.nextRound());
  }

  finish() {
    this.awaitingInput = false;
    this.clearIdle();
    if (this.onFinish) this.onFinish();
  }

  // ---- banner -------------------------------------------------------------

  renderBanner(question = false) {
    this.els.target.textContent = question ? '?' : String(this.target);
    this.els.banner.classList.toggle('is-question', question);
    this.renderPips();
  }

  renderPips() {
    if (this.mode.id === 'howmany') { this.els.pips.replaceChildren(); return; }
    const pips = [];
    for (let i = 0; i < this.target; i++) {
      const pip = document.createElement('span');
      // Driven by `claimed`, not `placed`, so the pip lights on the tap rather
      // than when the treasure finishes its arc — immediate acknowledgement.
      pip.className = `ctc-pip${i < this.claimed ? ' is-on' : ''}`;
      pips.push(pip);
    }
    this.els.pips.replaceChildren(...pips);
  }

  showAgain() { this.els.again.classList.remove('hidden'); }

  hideAgain() {
    this.els.again.classList.add('hidden');
    if (this.autoNext) { clearTimeout(this.autoNext); this.timers.delete(this.autoNext); this.autoNext = null; }
  }

  // ---- speech + actors ----------------------------------------------------

  /** Speak a line and put the matching actor on screen in a matching pose. */
  speakAs(key, pose = 'interact') {
    const role = voice.speaker(key);
    const actor = this.actors[role];
    if (actor) {
      actor.show(pose);
      // One hide timer PER actor. A single shared timer meant the parrot's line
      // replaced the captain's timer and left her standing there for the rest of
      // the round.
      const prev = this.actorHides.get(role);
      if (prev) { clearTimeout(prev); this.timers.delete(prev); }
      this.actorHides.set(role, this.after(3200, () => actor.hide()));
    }
    return voice.say(key);
  }

  /**
   * Open a round out loud: on the first round the mode intro leads in, then the
   * prompt. Input is already live throughout — an eager child never has to wait
   * for the voice to finish before touching anything.
   */
  async openRound() {
    if (this.roundIndex === 0) {
      await Promise.race([this.speakAs(this.mode.introKey, 'enter'), this.wait(4500)]);
      if (this.finished || !this.awaitingInput) return;
    }
    this.speakAs(this.promptKey, 'interact');
    this.armIdle();
  }

  replayPrompt() {
    if (!this.promptKey) return;
    this.clearIdle();
    this.speakAs(this.promptKey, 'interact');
    this.armIdle();
  }

  armIdle() {
    this.clearIdle();
    this.idleA = this.after(IDLE_HINT_MS, () => {
      if (!this.awaitingInput || this.busy) return;
      this.speakAs(this.rng() < 0.5 ? 'cap-idle-1' : 'cap-idle-2', 'notice');
      this.idleB = this.after(IDLE_REPROMPT_MS, () => {
        if (this.awaitingInput && !this.busy) this.replayPrompt();
      });
    });
  }

  clearIdle() {
    for (const t of [this.idleA, this.idleB]) {
      if (t) { clearTimeout(t); this.timers.delete(t); }
    }
    this.idleA = this.idleB = null;
  }

  // ---- drag (interaction-pattern #11) --------------------------------------

  onTilePointerDown(e, tile) {
    if (this.busy || !this.awaitingInput) return;
    if (e.isPrimary === false) return;      // second finger
    if (this.drag) return;                  // one drag at a time
    e.preventDefault();
    this.sweepClones();
    sfx.tick();

    this.drag = {
      id: e.pointerId,
      tile,
      x0: e.clientX,
      y0: e.clientY,
      clone: null,
      moved: false,
    };
    const move = (ev) => this.onDragMove(ev);
    const up = (ev) => this.onDragUp(ev);
    const cancel = (ev) => { if (ev.pointerId === this.drag?.id) this.cancelDrag(); };
    // Listeners live on window, never on the tile: the tile is replaced the
    // moment a drop is accepted, and the stream has to survive that.
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    this.drag.off = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }

  onDragMove(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    if (!d.moved) {
      d.moved = true;
      d.clone = this.makeClone(d.tile);
      d.tile.classList.add('is-held');
    }
    const size = this.stage.itemSize();
    d.clone.style.left = `${e.clientX - size / 2}px`;
    d.clone.style.top = `${e.clientY - size / 2}px`;
  }

  onDragUp(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const { tile, moved, clone } = d;
    d.off();
    this.drag = null;
    tile.classList.remove('is-held');

    try {
      if (!moved) {
        // A press that never travelled is a tap — the equal, easier path.
        clone?.remove();
        if (tile.isConnected) this.attempt(tile.dataset.id);
        return;
      }
      const overStage = this.isOverContainer(e.clientY);
      clone?.remove();
      if (overStage && tile.isConnected) this.attempt(tile.dataset.id);
      else sfx.unpop();
    } finally {
      this.sweepClones();
    }
  }

  cancelDrag() {
    const d = this.drag;
    if (!d) return;
    d.off();
    d.tile.classList.remove('is-held');
    d.clone?.remove();
    this.drag = null;
    this.sweepClones();
  }

  makeClone(tile) {
    const clone = document.createElement('img');
    clone.className = 'ctc-flier drag-clone';
    clone.src = tile.dataset.art;
    clone.alt = '';
    clone.draggable = false;
    clone.style.width = `${this.stage.itemSize()}px`;
    document.body.appendChild(clone);
    return clone;
  }

  /** Very forgiving drop zone: anywhere above the tile tray counts as "in". */
  isOverContainer(clientY) {
    const tray = this.els.tray.getBoundingClientRect();
    return clientY < (tray.top || window.innerHeight * 0.72);
  }

  /** Should be dead code. Kept anyway — a stuck piece is never acceptable. */
  sweepClones() {
    for (const el of document.querySelectorAll('.drag-clone')) el.remove();
  }

  /** Drop any treasure still mid-arc. Several can be in the air at once now, so
   *  leaving a screen without this would strand them over the next one. */
  sweepFliers() {
    for (const el of document.querySelectorAll('.ctc-flier')) el.remove();
  }

  // ---- debug surface -------------------------------------------------------

  debugState() {
    return {
      screen: 'play',
      mode: this.mode.id,
      stage: this.stageName(),
      round: this.roundIndex + 1,
      roundsTotal: this.rounds.length,
      target: this.target,
      // `placed` is what the child has put in; in howmany the set is pre-filled,
      // so report the count that is actually on screen.
      placed: this.mode.id === 'howmany' ? this.stage.treasureEl.children.length : this.placed,
      claimed: this.claimed,
      awaitingInput: this.awaitingInput && !this.busy,
      busy: this.busy,
      promptKey: this.promptKey || null,
      promptText: voice.text(this.promptKey),
    };
  }

  getTargets() {
    const out = [];
    const push = (el, role) => {
      const r = el.getBoundingClientRect();
      out.push({ id: el.dataset.id, role, rect: { x: r.x, y: r.y, w: r.width, h: r.height } });
    };
    if (this.mode.id === 'howmany') {
      for (const c of this.els.choices.children) {
        push(c, Number(c.dataset.value) === this.target ? 'correct' : 'wrong');
      }
    } else {
      for (const t of this.els.tray.children) {
        push(t, t.dataset.kind === this.wantKind() ? 'correct' : 'wrong');
      }
    }
    return out;
  }

  /** Complete the current round through the real input path. */
  async winRound() {
    const startRound = this.roundIndex;
    for (let guard = 0; guard < 60 && !this.finished; guard++) {
      for (let w = 0; w < 80 && this.busy; w++) await this.wait(25);
      if (this.roundIndex !== startRound || !this.awaitingInput) break;
      const target = this.getTargets().find((t) => t.role === 'correct');
      if (!target) break;
      await this.attempt(target.id);
    }
    // Picks are accepted before their treasure lands, so wait for the round to
    // actually resolve before reporting it done.
    for (let w = 0; w < 120 && !this.finished
         && this.roundIndex === startRound && this.placed < this.target; w++) {
      await this.wait(25);
    }
  }
}

// ---- helpers ---------------------------------------------------------------

function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cssEscape(s) {
  return String(s).replace(/["\\]/g, '\\$&');
}
