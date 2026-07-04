// game.js — the Lunchbox Pack round engine for all three modes (pack /
// healthy / count). One Game instance per session (3 boxes). All drag, tap-tap
// and programmatic (debug) packing funnel through attemptPack().

import * as sfx from '../../../shared/js/sfx.js';
import * as voice from './voice.js';
import {
  GROUPS,
  GROUP_EMOJI,
  GROUP_COLORS,
  COLOR_SWATCH,
  makeSession,
  matchesRequest,
  pick,
} from './requests.js';
import { burst, clearConfetti } from './confetti.js';

// Compartment slot centers, measured against lunchbox-open.png (900×745,
// layered-extraction art). x,y = center as % of the image; s = food scale.
// THE tunable const. Slots: green (large, holds 3), pink top-right, yellow
// bottom-right.
export const SLOTS = [
  { x: 36, y: 60, s: 1.0 },
  { x: 62, y: 55, s: 0.75 },
  { x: 57, y: 76, s: 0.75 },
  { x: 28, y: 54, s: 0.65 },
  { x: 44, y: 66, s: 0.65 },
];

const BASE_FOOD_PCT = 30; // packed food width at s=1, as % of box width
const IDLE_NUDGE_MS = 10000;
const CHEER_MS = 1600;

const foodImg = (id) => `../../shared/assets/foods/${id}.png`;
const portraitImg = (id) => `../../shared/characters/${id}/portrait.png`;

const GROUP_REQ_LINES = {
  fruit: 'Can you pack a fruit?',
  veggie: 'Can you pack a veggie?',
  main: 'Can you pack a main dish?',
  drink: 'Can you pack a drink?',
  treat: 'Can you pack a little treat?',
};
const NUM_WORDS = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five' };

export class Game {
  /**
   * @param {'pack'|'healthy'|'count'} mode
   * @param {{foods: object[], characters: object[]}} data
   */
  constructor(mode, data) {
    this.mode = mode;
    this.data = data;
    this.els = {
      game: document.getElementById('game'),
      stage: document.getElementById('stage'),
      shelf: document.getElementById('shelf'),
      portrait: document.getElementById('portrait'),
      bubble: document.getElementById('bubble'),
      boxArea: document.getElementById('box-area'),
      boxOpen: document.getElementById('box-open'),
      packedLayer: document.getElementById('packed-layer'),
      lid: document.getElementById('lid'),
      meter: document.getElementById('healthy-meter'),
      starRow: document.getElementById('star-row'),
      endScreen: document.getElementById('end-screen'),
    };
    this.reducedMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.session = null;
    this.boxIndex = 0;
    this.stars = 0;
    this.screen = 'game'; // 'game' | 'end'
    this.phase = 'boot'; // 'request' | 'lid' | 'cheer'
    this.reqIndex = 0;
    this.packedIds = [];
    this.filled = {}; // healthy-mode group meter
    this.yumIdx = 0;
    this.selected = null; // { card, food } tap-tap selection
    this.speakToken = 0;
    this.idleTimer = 0;
    this.nextTimer = 0;
    this.destroyed = false;

    this.onLidTap = this.onLidTap.bind(this);
    this.onBoxTap = this.onBoxTap.bind(this);
    this.onBubbleTap = this.onBubbleTap.bind(this);
    this.onStageTap = this.onStageTap.bind(this);
    this.els.lid.addEventListener('click', this.onLidTap);
    this.els.boxArea.addEventListener('pointerdown', this.onBoxTap);
    this.els.bubble.addEventListener('click', this.onBubbleTap);
    this.els.portrait.addEventListener('click', this.onBubbleTap);
    this.els.stage.addEventListener('pointerdown', this.onStageTap, true);
  }

  start() {
    this.session = makeSession(this.mode, this.data);
    this.boxIndex = 0;
    this.stars = 0;
    this.renderStars();
    this.startBox();
  }

  destroy() {
    this.destroyed = true;
    this.speakToken++;
    clearTimeout(this.idleTimer);
    clearTimeout(this.nextTimer);
    if (this.dragCleanup) this.dragCleanup(); // end any in-flight drag
    this.sweepStrayClones();
    voice.stop();
    clearConfetti();
    this.els.lid.removeEventListener('click', this.onLidTap);
    this.els.boxArea.removeEventListener('pointerdown', this.onBoxTap);
    this.els.bubble.removeEventListener('click', this.onBubbleTap);
    this.els.portrait.removeEventListener('click', this.onBubbleTap);
    this.els.stage.removeEventListener('pointerdown', this.onStageTap, true);
    this.els.shelf.innerHTML = '';
    this.els.packedLayer.innerHTML = '';
    this.els.endScreen.classList.add('hidden');
  }

  // ---- box lifecycle ---------------------------------------------------

  box() {
    return this.session.boxes[this.boxIndex];
  }

  currentRequest() {
    if (this.phase !== 'request') return null;
    return this.box().requests[this.reqIndex] || null;
  }

  startBox() {
    const box = this.box();
    this.reqIndex = 0;
    this.packedIds = [];
    this.filled = {};
    for (const req of box.requests) delete req.done;

    // reset the stage
    this.els.packedLayer.innerHTML = '';
    this.els.lid.classList.add('hidden');
    this.els.lid.classList.remove('dropped');
    this.clearSelection();

    // character slides in
    this.els.portrait.src = portraitImg(box.character.id);
    this.els.portrait.alt = box.character.name;
    this.els.portrait.classList.remove('slide-in');
    // restart the CSS animation
    void this.els.portrait.offsetWidth;
    this.els.portrait.classList.add('slide-in');

    this.buildShelf(box.shelf);

    if (this.mode === 'healthy') {
      this.els.meter.classList.remove('hidden');
      this.renderMeter();
    } else {
      this.els.meter.classList.add('hidden');
    }

    this.phase = 'request';
    const intro = [
      'intro-' + box.character.id,
      `Hi, I'm ${box.character.name}! Can you pack my lunch?`,
    ];
    this.presentRequest([intro]);
  }

  /** Activate box.requests[reqIndex]: verify solvable, show art, speak. */
  presentRequest(prefixLines = []) {
    const box = this.box();
    let req = box.requests[this.reqIndex];
    if (!req) return;

    // Guarantee solvable: if free choices consumed every candidate, swap the
    // request for a specific food that IS still on the shelf. Invisible, gentle.
    if (!this.isSolvable(req)) {
      const left = this.shelfFoods().filter((f) => !this.packedIds.includes(f.id));
      const swap = pick(left.length ? left : this.shelfFoods());
      if (swap) {
        req = { type: 'food', food: swap.id, voice: 'req-' + swap.id };
        box.requests[this.reqIndex] = req;
      }
    }

    this.renderBubble(req);
    this.speakSeq([...prefixLines, [req.voice, this.requestFallback(req)]]);
    this.armIdleNudge(req);
  }

  isSolvable(req) {
    const shelf = this.shelfFoods();
    if (req.type === 'healthy') {
      return GROUPS.some((g) => !this.filled[g] && shelf.some((f) => f.group === g));
    }
    if (req.type === 'food' || req.type === 'count') {
      return shelf.some((f) => f.id === req.food);
    }
    return shelf.some((f) => matchesRequest(f, req, this.packedIds));
  }

  // ---- the one packing code path ----------------------------------------

  /**
   * Attempt to pack a food (drag drop, tap-tap, or window.LUNCH.pack).
   * @param {string} foodId
   * @param {{clone?: HTMLElement, card?: HTMLElement}} [src] visual source
   * @returns {{ok: boolean, reason?: string}}
   */
  attemptPack(foodId, src = {}) {
    if (this.destroyed || this.screen !== 'game' || this.phase !== 'request') {
      return { ok: false, reason: 'not-accepting' };
    }
    const food = this.data.foods.find((f) => f.id === foodId);
    if (!food) return { ok: false, reason: 'unknown-food' };
    const card = src.card || this.cardFor(foodId);
    if (!card) return { ok: false, reason: 'not-on-shelf' };

    const req = this.currentRequest();
    const ok = this.isCorrect(food, req);
    if (ok) {
      this.handleCorrect(food, req, src);
    } else {
      this.handleWrong(food, card);
    }
    return { ok };
  }

  isCorrect(food, req) {
    if (!req) return false;
    if (req.type === 'healthy') return !this.filled[food.group];
    return matchesRequest(food, req, this.packedIds);
  }

  handleCorrect(food, req, src) {
    this.clearIdleNudge();
    this.clearSelection();
    sfx.pop();
    this.packedIds.push(food.id);
    this.placeFood(food, src);
    if (this.mode !== 'count') this.removeCard(food.id);

    if (req.type === 'healthy') {
      this.filled[food.group] = true;
      this.renderMeter();
      this.renderBubble(req);
      const done = GROUPS.every((g) => this.filled[g]);
      if (done) {
        this.speakSeq([['grp-' + food.group], ['yum-' + this.nextYum()]]);
        this.toLid();
      } else {
        this.speakSeq([['grp-' + food.group], ['yum-' + this.nextYum()]]);
        this.armIdleNudge(req);
      }
      return;
    }

    if (req.type === 'count') {
      req.done = (req.done || 0) + 1;
      this.renderBubble(req);
      if (req.done >= req.n) {
        this.speakSeq([['count-' + req.done], ['yum-' + this.nextYum()]]);
        this.advanceRequest(true);
      } else {
        this.speakSeq([['count-' + req.done]]);
        this.armIdleNudge(req);
      }
      return;
    }

    // pack mode: food / group / attr
    this.advanceRequest(false, ['yum-' + this.nextYum()]);
  }

  handleWrong(food, card) {
    sfx.boing();
    this.clearSelection();
    if (card) {
      card.classList.remove('wiggle');
      void card.offsetWidth;
      card.classList.add('wiggle');
    }
    this.speakSeq([['hint-wrong']]);
  }

  /** Move to the next request in this box, or to the lid step. */
  advanceRequest(spokeAlready, prefixKeys = []) {
    this.reqIndex++;
    if (this.reqIndex >= this.box().requests.length) {
      if (!spokeAlready && prefixKeys.length) this.speakSeq(prefixKeys.map((k) => [k]));
      this.toLid();
    } else {
      this.presentRequest(prefixKeys.map((k) => [k]));
    }
  }

  nextYum() {
    this.yumIdx = (this.yumIdx % 4) + 1;
    return this.yumIdx;
  }

  // ---- lid / cheer / session end ----------------------------------------

  toLid() {
    this.phase = 'lid';
    this.clearIdleNudge();
    this.els.bubble.classList.add('hidden');
    this.els.lid.classList.remove('hidden');
    void this.els.lid.offsetWidth;
    this.els.lid.classList.add('dropped');
    // let the yum/count line finish, then ask for the lid
    this.speakLater([['lid']], 900);
  }

  onLidTap() {
    if (this.destroyed || this.phase !== 'lid') return;
    this.phase = 'cheer';
    sfx.tada();
    const r = this.els.boxArea.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2);
    this.stars++;
    this.renderStars();
    this.speakSeq([[this.mode === 'healthy' ? 'cheer-healthy' : 'cheer']]);
    this.nextTimer = setTimeout(() => {
      if (this.destroyed) return;
      this.boxIndex++;
      if (this.boxIndex >= this.session.boxes.length) {
        this.endSession();
      } else {
        this.startBox();
      }
    }, CHEER_MS);
  }

  endSession() {
    this.screen = 'end';
    this.phase = 'done';
    this.speakSeq([['bite']]);
    this.els.endScreen.classList.remove('hidden');
    burst(window.innerWidth / 2, window.innerHeight * 0.4, 120);
  }

  // ---- shelf + drag / tap-tap -------------------------------------------

  shelfFoods() {
    return [...this.els.shelf.querySelectorAll('.food-card:not(.vanish)')].map((c) =>
      this.data.foods.find((f) => f.id === c.dataset.id)
    );
  }

  cardFor(id) {
    return this.els.shelf.querySelector(`.food-card[data-id="${id}"]:not(.vanish)`);
  }

  buildShelf(ids) {
    this.els.shelf.innerHTML = '';
    for (const id of ids) {
      const food = this.data.foods.find((f) => f.id === id);
      const card = document.createElement('div');
      card.className = 'food-card';
      card.dataset.id = id;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', food.name);
      const img = document.createElement('img');
      img.src = foodImg(id);
      img.alt = '';
      img.draggable = false;
      const label = document.createElement('span');
      label.className = 'food-name';
      label.textContent = food.name;
      card.append(img, label);
      card.addEventListener('pointerdown', (e) => this.onCardDown(e, card, food));
      this.els.shelf.appendChild(card);
    }
  }

  removeCard(id) {
    const card = this.cardFor(id);
    if (!card) return;
    if (this.reducedMotion) {
      card.remove();
      return;
    }
    card.classList.add('vanish');
    setTimeout(() => card.remove(), 220);
  }

  onCardDown(e, card, food) {
    if (this.destroyed || this.phase !== 'request') return;
    // One drag at a time, primary pointer only — kids use both hands, and a
    // second simultaneous drag is how clones used to get stranded.
    if (this.dragCleanup || e.isPrimary === false) return;
    e.preventDefault();
    e.stopPropagation();
    this.sweepStrayClones();
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    let clone = null;
    let dragging = false;

    // Listeners live on window, not the card: if the card is removed from the
    // DOM mid-drag (multi-touch race, round advance), the stream survives and
    // finish() still runs — the clone can never be orphaned.
    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 10) {
        dragging = true;
        clone = this.makeDragClone(card, food);
        card.classList.add('drag-src');
      }
      if (dragging && clone) {
        clone.style.left = ev.clientX + 'px';
        clone.style.top = ev.clientY + 'px';
      }
    };
    const finish = (ev, cancelled) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      card.classList.remove('drag-src');
      if (!dragging) {
        if (!cancelled) this.toggleSelect(card, food);
        return;
      }
      if (cancelled || !this.pointOverBox(ev.clientX, ev.clientY)) {
        this.glideBack(clone, card);
        return;
      }
      let res;
      try {
        res = this.attemptPack(food.id, { clone, card });
      } catch (err) {
        console.warn('lunchbox: pack failed', err);
        res = { ok: false };
      }
      if (res.ok) {
        clone.remove();
      } else {
        this.glideBack(clone, card);
      }
    };
    const onUp = (ev) => finish(ev, false);
    const onCancel = (ev) => finish(ev, true);
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onBlur);
      this.dragCleanup = null;
    };
    // Window blur (system gesture, notification, app switch) can eat the
    // pointerup entirely — treat it as a cancel so the food glides home.
    const onBlur = () => {
      cleanup();
      card.classList.remove('drag-src');
      if (dragging) this.glideBack(clone, card);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onBlur);
    this.dragCleanup = onBlur; // doubles as "drag in progress" flag
  }

  /** Remove any drag clones that lost their event stream (should be
   *  impossible now, but a stuck food on a kid's screen is never acceptable). */
  sweepStrayClones() {
    document.querySelectorAll('.drag-clone').forEach((c) => c.remove());
  }

  makeDragClone(card, food) {
    const rect = card.getBoundingClientRect();
    const clone = document.createElement('img');
    clone.className = 'drag-clone';
    clone.src = foodImg(food.id);
    clone.draggable = false;
    clone.style.width = rect.width * 0.9 + 'px';
    clone.style.left = rect.left + rect.width / 2 + 'px';
    clone.style.top = rect.top + rect.height / 2 + 'px';
    document.body.appendChild(clone);
    return clone;
  }

  glideBack(clone, card) {
    if (!clone) return;
    if (this.reducedMotion || !clone.animate) {
      clone.remove();
      return;
    }
    const rect = card.getBoundingClientRect();
    const anim = clone.animate(
      [
        { left: clone.style.left, top: clone.style.top },
        { left: rect.left + rect.width / 2 + 'px', top: rect.top + rect.height / 2 + 'px' },
      ],
      { duration: 240, easing: 'ease-out' }
    );
    anim.onfinish = () => clone.remove();
    anim.oncancel = () => clone.remove();
  }

  pointOverBox(x, y) {
    const r = this.els.boxArea.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  toggleSelect(card, food) {
    if (this.selected && this.selected.card === card) {
      this.clearSelection();
      return;
    }
    this.clearSelection();
    this.selected = { card, food };
    card.classList.add('selected');
    sfx.tick();
  }

  clearSelection() {
    if (this.selected) {
      this.selected.card.classList.remove('selected');
      this.selected = null;
    }
  }

  /** Tap-tap fallback: tap a lifted food, then tap the box. */
  onBoxTap(e) {
    if (this.selected && this.phase === 'request') {
      e.stopPropagation();
      const { card, food } = this.selected;
      this.attemptPack(food.id, { card });
    }
  }

  /** A tap anywhere that is not a card or the box cancels the selection. */
  onStageTap(e) {
    if (!this.selected) return;
    if (e.target.closest && (e.target.closest('.food-card') || e.target.closest('#box-area'))) {
      return;
    }
    this.clearSelection();
  }

  onBubbleTap() {
    this.replayRequest();
  }

  /** Replay the current voice line (bubble, character, or HUD sound button). */
  replayRequest() {
    if (this.destroyed) return;
    if (this.phase === 'lid') {
      this.speakSeq([['lid']]);
      return;
    }
    const req = this.currentRequest();
    if (req) this.speakSeq([[req.voice, this.requestFallback(req)]]);
  }

  // ---- placing food in the box -------------------------------------------

  placeFood(food, src = {}) {
    const idx = this.packedIds.length - 1;
    const slot = SLOTS[idx % SLOTS.length];
    const overflow = Math.floor(idx / SLOTS.length);
    // count mode stacks repeats: jitter overflow copies so they stay visible
    const dx = overflow ? (idx % 2 ? 7 : -7) * overflow : 0;
    const dy = overflow ? (idx % 3 ? -4 : 5) * overflow : 0;
    const scale = this.mode === 'count' ? slot.s * 0.75 : slot.s;

    const img = document.createElement('img');
    img.className = 'packed-food';
    img.src = foodImg(food.id);
    img.draggable = false;
    img.style.left = slot.x + dx + '%';
    img.style.top = slot.y + dy + '%';
    img.style.width = BASE_FOOD_PCT * scale + '%';
    this.els.packedLayer.appendChild(img);

    // fly from the source card/clone to the slot
    const from = src.clone
      ? src.clone.getBoundingClientRect()
      : src.card
        ? src.card.getBoundingClientRect()
        : null;
    if (this.reducedMotion || !from || !img.animate) return;

    const boxRect = this.els.boxArea.getBoundingClientRect();
    const tx = boxRect.left + (boxRect.width * (slot.x + dx)) / 100;
    const ty = boxRect.top + (boxRect.height * (slot.y + dy)) / 100;
    const tw = (boxRect.width * BASE_FOOD_PCT * scale) / 100;

    img.style.visibility = 'hidden';
    const flyer = document.createElement('img');
    flyer.className = 'drag-clone';
    flyer.src = foodImg(food.id);
    flyer.draggable = false;
    flyer.style.left = from.left + from.width / 2 + 'px';
    flyer.style.top = from.top + from.height / 2 + 'px';
    flyer.style.width = from.width + 'px';
    document.body.appendChild(flyer);
    const anim = flyer.animate(
      [
        { left: flyer.style.left, top: flyer.style.top, width: flyer.style.width },
        { left: tx + 'px', top: ty + 'px', width: tw + 'px' },
      ],
      { duration: 320, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1.1)' }
    );
    const land = () => {
      flyer.remove();
      img.style.visibility = '';
      img.classList.add('pop-in');
    };
    anim.onfinish = land;
    anim.oncancel = land;
  }

  // ---- request art (bubble) ----------------------------------------------

  renderBubble(req) {
    const b = this.els.bubble;
    b.innerHTML = '';
    b.classList.remove('hidden');

    if (req.type === 'food') {
      b.appendChild(this.foodChip(req.food));
    } else if (req.type === 'group') {
      b.appendChild(this.groupChip(req.group));
    } else if (req.type === 'attr') {
      b.appendChild(this.attrChip(req.attr));
    } else if (req.type === 'count') {
      const wrap = document.createElement('div');
      wrap.className = 'chip chip-count';
      const img = document.createElement('img');
      img.src = foodImg(req.food);
      img.alt = '';
      img.draggable = false;
      const times = document.createElement('span');
      times.className = 'count-times';
      times.textContent = '×' + req.n;
      wrap.append(img, times);
      const dots = document.createElement('div');
      dots.className = 'count-dots';
      for (let i = 0; i < req.n; i++) {
        const d = document.createElement('span');
        d.className = 'count-dot' + (i < (req.done || 0) ? ' filled' : '');
        dots.appendChild(d);
      }
      b.append(wrap, dots);
    } else if (req.type === 'healthy') {
      const row = document.createElement('div');
      row.className = 'bubble-groups';
      for (const g of GROUPS) {
        const chip = this.groupChip(g, true);
        if (this.filled[g]) chip.classList.add('dimmed');
        row.appendChild(chip);
      }
      b.appendChild(row);
    }
  }

  foodChip(id) {
    const chip = document.createElement('div');
    chip.className = 'chip chip-food';
    const img = document.createElement('img');
    img.src = foodImg(id);
    img.alt = '';
    img.draggable = false;
    chip.appendChild(img);
    return chip;
  }

  groupChip(group, small) {
    const chip = document.createElement('div');
    chip.className = 'chip chip-group' + (small ? ' small' : '');
    chip.style.background = GROUP_COLORS[group];
    chip.textContent = GROUP_EMOJI[group];
    return chip;
  }

  attrChip(attr) {
    const chip = document.createElement('div');
    if (attr === 'crunchy') {
      chip.className = 'chip chip-crunchy';
      const img = document.createElement('img');
      img.src = foodImg('carrot');
      img.alt = '';
      img.draggable = false;
      chip.appendChild(img);
    } else {
      chip.className = 'chip chip-color';
      chip.style.background = COLOR_SWATCH[attr];
    }
    return chip;
  }

  // ---- meter / stars -------------------------------------------------------

  renderMeter() {
    const m = this.els.meter;
    m.innerHTML = '';
    for (const g of GROUPS) {
      const chip = document.createElement('span');
      chip.className = 'meter-chip' + (this.filled[g] ? ' lit' : '');
      chip.style.setProperty('--grp', GROUP_COLORS[g]);
      chip.textContent = GROUP_EMOJI[g];
      m.appendChild(chip);
    }
  }

  renderStars() {
    const row = this.els.starRow;
    row.innerHTML = '';
    for (let i = 0; i < this.session.boxes.length; i++) {
      const s = document.createElement('span');
      s.className = 'star' + (i < this.stars ? ' filled' : '');
      s.textContent = '⭐';
      row.appendChild(s);
    }
  }

  // ---- voice sequencing / idle nudge --------------------------------------

  /** Speak [key, fallback?] pairs in order; a newer sequence cancels this one. */
  async speakSeq(items) {
    const token = ++this.speakToken;
    for (const item of items) {
      if (token !== this.speakToken || this.destroyed) return;
      const [key, fallback] = Array.isArray(item) ? item : [item];
      await voice.say(key, fallback);
    }
  }

  speakLater(items, ms) {
    const token = this.speakToken;
    setTimeout(() => {
      if (this.destroyed || token !== this.speakToken) return;
      this.speakSeq(items);
    }, ms);
  }

  requestFallback(req) {
    switch (req.type) {
      case 'food': {
        const f = this.data.foods.find((x) => x.id === req.food);
        return `Can you pack the ${f ? f.name : req.food}?`;
      }
      case 'group':
        return GROUP_REQ_LINES[req.group];
      case 'attr':
        return `Can you find something ${req.attr}?`;
      case 'count':
        return `Can you pack ${NUM_WORDS[req.n] || req.n} of these?`;
      default:
        return undefined; // voice.js DEFAULT_LINES covers 'mode-healthy'
    }
  }

  armIdleNudge(req) {
    this.clearIdleNudge();
    if (req._nudged) return; // once per request, never nag
    this.idleTimer = setTimeout(() => {
      if (this.destroyed || this.currentRequest() !== req) return;
      req._nudged = true;
      this.speakSeq([[req.voice, this.requestFallback(req)]]);
    }, IDLE_NUDGE_MS);
  }

  clearIdleNudge() {
    clearTimeout(this.idleTimer);
    this.idleTimer = 0;
  }

  // ---- debug hook -----------------------------------------------------------

  debugState() {
    const box = this.session ? this.box() : null;
    const req = this.currentRequest();
    return {
      screen: this.screen,
      mode: this.mode,
      phase: this.phase,
      character: box ? box.character.id : null,
      requests: box ? box.requests.map((r) => ({ ...r })) : [],
      currentRequest: req ? { ...req } : null,
      packed: [...this.packedIds],
      shelf: this.shelfFoods().map((f) => f.id),
      filledGroups: { ...this.filled },
      stars: this.stars,
    };
  }
}
