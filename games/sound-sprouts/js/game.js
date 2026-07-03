// game.js — round logic for all three modes. Owns the active tiles, the bench,
// the shared build mechanic (tap -> speak -> fly to slot -> evaluate), and the
// celebration / bonus / silly responses. One Game instance at a time.

import {
  WORDS, ONSETS, RIMES, BONUS_WORDS, FREEPLAY_SETS, PHRASES,
} from './data.js';
import {
  visibleSize, tween, Ease, pick, getCamera,
} from './scene.js';
import * as THREE from 'three';
import {
  makeTile, setTileHome, startIdle, bounceTile, jiggleTile, flyTo,
  disposeTile, makeBench, makeCard, setCardContent, popCard, showGoalCard,
  hideCard,
} from './tiles.js';
import * as speech from '../../../shared/js/speech.js';
import * as audio from '../../../shared/js/audio.js';
import * as sfx from '../../../shared/js/sfx.js';
import { burst } from './confetti.js';

const BONUS_SET = new Set(BONUS_WORDS);
const WORD_BY_KEY = new Map(WORDS.map((w) => [w.word, w]));

function rand(arr) { return arr[(Math.random() * arr.length) | 0]; }
function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : ''));
}
function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
function wait(ms) { return new Promise((res) => setTimeout(res, ms)); }

export class Game {
  /**
   * @param {'guided'|'mystery'|'freeplay'} mode
   * @param {object} hud DOM refs { btnSpeaker, btnShuffle, btnAgain, gardenRow }
   */
  constructor(mode, hud) {
    this.mode = mode;
    this.hud = hud;
    this.tiles = [];
    this.bench = null;
    this.card = null;       // celebration / reveal picture card
    this.goalCard = null;   // small translucent goal card (guided/mystery)
    this.idleStop = null;
    this.lastWord = null;       // avoid immediate repeats (guided/mystery)
    this.freeplayIndex = -1;    // rotate FREEPLAY_SETS
    this.found = new Set();     // free play collection
    this.prompt = null;         // current prompt descriptor (for the 🔊 replay button)
    this.busy = false;          // global input lock during animations
    this.awaitingAgain = false; // round solved, showing result, waiting for Again
    this.advanceTimer = null;
    this.destroyed = false;
    this.lastResult = null;     // 'word' | 'bonus' | 'silly' | null (debug hook)
  }

  // ---- lifecycle -----------------------------------------------------

  start() {
    this.bench = makeBench(this.benchY());
    this.card = makeCard();
    if (this.mode !== 'freeplay') this.goalCard = makeCard();
    this.idleStop = startIdle(this.tiles);

    if (this.mode === 'freeplay') {
      this.hud.btnShuffle.classList.remove('hidden');
      this.hud.gardenRow.classList.remove('hidden');
      this.hud.gardenRow.innerHTML = '';
      this.dealFreeplay();
    } else {
      this.newRound();
    }
  }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.advanceTimer);
    speech.stop();
    audio.stop();
    if (this.idleStop) this.idleStop();
    for (const t of this.tiles) disposeTile(t);
    this.tiles = [];
    if (this.bench) { this.bench.group.parent && this.bench.group.parent.remove(this.bench.group); }
    if (this.card) this.card.parent && this.card.parent.remove(this.card);
    if (this.goalCard) this.goalCard.parent && this.goalCard.parent.remove(this.goalCard);
    this.hud.btnShuffle.classList.add('hidden');
    this.hud.btnAgain.classList.add('hidden');
    this.hud.gardenRow.classList.add('hidden');
  }

  // ---- layout helpers ------------------------------------------------

  benchY() {
    // The illustrated background plate (background-position: center bottom) puts
    // the wooden podium across the lower portion of the viewport. We sit the slot
    // drop-targets low so tiles land "on the stage": at -0.30*height the slot
    // centers are at screen-ndcy ≈ -0.60 (~80% down), over the podium top, while
    // the picture card (benchY + ~2.7) sits just above, centered on the stage.
    const { height } = visibleSize(0);
    return -height * 0.30;
  }

  /** Scale the whole layout group to fit narrow viewports (portrait). */
  fitScale() {
    const { width } = visibleSize(0);
    // we design for ~9 units wide; shrink if the viewport is narrower
    return Math.min(1, width / 9.2);
  }

  /** Lay tiles in an arc above the bench. */
  arcLayout(tiles, baseY, radius = 3.6, spread = 0.5) {
    const n = tiles.length;
    const s = this.fitScale();
    const startA = Math.PI / 2 + (n - 1) * spread / 2;
    tiles.forEach((tile, i) => {
      tile.scale.setScalar(s);
      tile.userData.baseScale = s;
      const a = startA - i * spread;
      const x = Math.cos(a) * radius * s;
      const y = baseY + Math.sin(a) * radius * 0.45 * s;
      setTileHome(tile, x, y, 0);
    });
  }

  // ---- tile factory --------------------------------------------------

  addOnset(letter) {
    const t = makeTile('onset', letter, ONSETS[letter].spoken);
    this.tiles.push(t);
    return t;
  }
  addRime(rime) {
    const t = makeTile('rime', rime, RIMES[rime].spoken);
    this.tiles.push(t);
    return t;
  }

  clearTiles() {
    for (const t of this.tiles) disposeTile(t);
    this.tiles = [];
    this.awaitingAgain = false;
    if (this.bench) for (const s of this.bench.slots) { s.tile = null; if (s.panel) s.panel.visible = true; }
  }

  // ===================================================================
  //  GUIDED + MYSTERY round
  // ===================================================================

  newRound() {
    this.clearTiles();
    this.hud.btnAgain.classList.add('hidden');
    clearTimeout(this.advanceTimer);

    // pick a target word (no immediate repeat)
    let target;
    do { target = rand(WORDS); } while (WORDS.length > 1 && target.word === this.lastWord);
    this.lastWord = target.word;
    this.target = target;

    // distractors that *also* tend to form real words
    const distractorOnset = this.pickDistractorOnset(target);
    const distractorRime = this.pickDistractorRime(target);

    const onsetTile = this.addOnset(target.onset);
    const rimeTile = this.addRime(target.rime);
    const dOn = this.addOnset(distractorOnset);
    const dRi = this.addRime(distractorRime);

    const ordered = shuffle([onsetTile, rimeTile, dOn, dRi]);
    // radius 4.0 / spread 0.64 keeps a ≥0.4u (landscape) / ≥0.28u (portrait) gap
    // between adjacent tile edges so 4 tiles never touch, even with idle sway.
    this.arcLayout(ordered, this.benchY() + 3.2, 4.0, 0.64);

    // goal card
    const baseY = this.benchY() + 1.9;
    setCardContent(this.goalCard, {
      codepoint: target.emoji,
      char: target.char,
      word: target.word,
      onsetLen: target.onset.length,
      mystery: this.mode === 'mystery',
    }).then(() => {
      if (this.destroyed) return;
      showGoalCard(this.goalCard, 0, baseY, 0.6);
    });

    // prompt descriptor (drives both the initial speak and the 🔊 replay)
    if (this.mode === 'mystery') {
      this.prompt = {
        kind: 'mystery',
        word: target.word,
        onsetKey: target.onset,
        rimeKey: target.rime,
        onsetSpoken: ONSETS[target.onset].spoken,
        rimeSpoken: RIMES[target.rime].spoken,
      };
    } else {
      this.prompt = { kind: 'guided', word: target.word };
    }
    this.speakPrompt();
  }

  pickDistractorOnset(target) {
    // onsets that form a real picture word with the target's rime (≠ target onset)
    const candidates = WORDS
      .filter((w) => w.rime === target.rime && w.onset !== target.onset)
      .map((w) => w.onset);
    if (candidates.length) return rand(candidates);
    const all = Object.keys(ONSETS).filter((o) => o !== target.onset);
    return rand(all);
  }

  pickDistractorRime(target) {
    const candidates = WORDS
      .filter((w) => w.onset === target.onset && w.rime !== target.rime)
      .map((w) => w.rime);
    if (candidates.length) return rand(candidates);
    const all = Object.keys(RIMES).filter((r) => r !== target.rime);
    return rand(all);
  }

  // ===================================================================
  //  FREE PLAY
  // ===================================================================

  dealFreeplay() {
    // ignore shuffle while a tile is animating or a found-word card is up, so
    // rapid taps can't dispose tiles mid-flight or strand a card
    if (this.busy || this.freeplayCardUp) return;
    this.clearTiles();
    this.hud.btnAgain.classList.add('hidden');
    this.freeplayIndex = (this.freeplayIndex + 1) % FREEPLAY_SETS.length;
    const set = FREEPLAY_SETS[this.freeplayIndex];

    const onsetTiles = set.onsets.map((o) => this.addOnset(o));
    const rimeTiles = set.rimes.map((r) => this.addRime(r));

    const s = this.fitScale();
    // top arc: 4 onsets
    this.rowLayout(onsetTiles, this.benchY() + 4.2, s, 2.0);
    // lower arc: 3 rimes
    this.rowLayout(rimeTiles, this.benchY() + 2.4, s, 2.0);

    this.prompt = { kind: 'mixer' };
    this.speakPrompt();
  }

  rowLayout(tiles, y, s, gap = 2.0) {
    const n = tiles.length;
    const totalW = (n - 1) * gap * s;
    tiles.forEach((tile, i) => {
      tile.scale.setScalar(s);
      tile.userData.baseScale = s;
      const x = -totalW / 2 + i * gap * s;
      setTileHome(tile, x, y, 0);
    });
  }

  // ===================================================================
  //  Prompt / speaker
  // ===================================================================

  speakPrompt() {
    const p = this.prompt;
    if (!p) return;
    if (p.kind === 'guided') {
      audio.play('prompts', p.word, { fallbackText: 'Can you make ' + p.word + '?', rate: 0.8, pitch: 1.05 });
    } else if (p.kind === 'mystery') {
      audio.playSeq([
        { cat: 'misc', key: 'mystery-intro', fallbackText: 'Mystery word! Listen.', rate: 0.8, pitch: 1.05 },
        { cat: 'fragments', key: p.onsetKey, fallbackText: p.onsetSpoken, rate: 0.8, pitch: 1.05 },
        { cat: 'fragments', key: p.rimeKey, fallbackText: p.rimeSpoken, rate: 0.8, pitch: 1.05 },
        { cat: 'misc', key: 'mystery-outro', fallbackText: 'What does it make?', rate: 0.8, pitch: 1.05 },
      ], { gap: 300 });
    } else if (p.kind === 'mixer') {
      audio.play('misc', 'mixer-intro', { fallbackText: 'Mix the sounds! What can you make?', rate: 0.8, pitch: 1.05 });
    }
  }

  // ===================================================================
  //  Input — pointerdown raycast
  // ===================================================================

  /** Called by main.js on pointerdown over the canvas. */
  onPointer(clientX, clientY) {
    // Ignore taps during any animation OR while a solved round is showing its
    // result (so rapid taps can't pop a tile out mid-celebration).
    if (this.busy || this.awaitingAgain) return;
    const hit = pick(clientX, clientY, this.tiles);
    if (!hit) return;
    const d = hit.userData;
    if (d.busy) return;

    if (d.slotted) {
      this.unslot(hit);
    } else {
      this.slot(hit);
    }
  }

  /** Move a tile into its type's slot. */
  async slot(tile) {
    const d = tile.userData;
    const slotIndex = d.type === 'onset' ? 0 : 1;
    const slot = this.bench.slots[slotIndex];

    // if that slot already holds a different tile, pop the old one back first
    if (slot.tile && slot.tile !== tile) {
      await this.popOut(slot.tile, false);
    }

    this.busy = true;
    d.busy = true; // pause idle so the bounce isn't overwritten
    sfx.pop();
    await bounceTile(tile);
    audio.play('fragments', d.text, { fallbackText: d.spoken });
    sfx.whoosh();
    d.slotted = true;
    slot.tile = tile;
    if (slot.panel) slot.panel.visible = false; // no ghost box around a filled slot
    await flyTo(tile, slot.world.x, slot.world.y, slot.world.z); // flyTo clears d.busy
    this.busy = false;

    if (this.bench.slots[0].tile && this.bench.slots[1].tile) {
      this.evaluate();
    }
  }

  /** Tap a slotted tile -> pop it back out to the arc. */
  async unslot(tile) {
    await this.popOut(tile, true);
  }

  async popOut(tile, speakIt) {
    const d = tile.userData;
    this.busy = true;
    const slotIndex = d.type === 'onset' ? 0 : 1;
    const sl = this.bench.slots[slotIndex];
    if (sl.tile === tile) { sl.tile = null; if (sl.panel) sl.panel.visible = true; }
    d.slotted = false;
    if (speakIt) {
      sfx.unpop();
      audio.play('fragments', d.text, { fallbackText: d.spoken });
    }
    await flyTo(tile, d.home.x, d.home.y, d.home.z);
    this.busy = false;
  }

  // ===================================================================
  //  Evaluate the built word
  // ===================================================================

  async evaluate() {
    const left = this.bench.slots[0].tile;
    const right = this.bench.slots[1].tile;
    if (!left || !right) return;
    const blend = left.userData.text + right.userData.text;

    this.busy = true;

    if (WORD_BY_KEY.has(blend)) {
      this.lastResult = 'word';
      await this.celebrate(WORD_BY_KEY.get(blend), left, right);
    } else if (BONUS_SET.has(blend)) {
      this.lastResult = 'bonus';
      await this.bonus(blend, left, right);
    } else {
      this.lastResult = 'silly';
      await this.silly(blend, left, right);
    }
  }

  /** Picture word found. */
  async celebrate(wordObj, left, right) {
    // slide the two tiles together to "touch"
    await Promise.all([
      tween(left.position, { x: -0.85 }, 220, Ease.inOut),
      tween(right.position, { x: 0.85 }, 220, Ease.inOut),
    ]);
    await audio.play('words', wordObj.word, { fallbackText: wordObj.word, rate: 0.7, pitch: 1.05 });

    sfx.tada();
    const cardY = this.benchY() + 2.6;
    burst({ x: 0, y: cardY, z: 1 }, { count: 130, power: this.mode === 'mystery' ? 1.25 : 1 });

    if (this.goalCard) hideCard(this.goalCard);

    await setCardContent(this.card, {
      codepoint: wordObj.emoji,
      char: wordObj.char,
      word: wordObj.word,
      onsetLen: wordObj.onset.length,
      mystery: false,
    });
    if (this.destroyed) return;
    await popCard(this.card, 0, cardY, 1.0, this.mode === 'mystery' ? 1.05 : 1);

    if (wordObj.animal) sfx.boing();
    audio.play('celebrate', wordObj.word, {
      fallbackText: fill(rand(PHRASES.celebrate), { word: wordObj.word }),
      rate: 0.85, pitch: 1.1,
    });

    if (this.mode === 'freeplay') {
      this.addToGarden(wordObj);
      // free play: dismiss on tap (handled in main via card pick) or after a beat
      this.busy = false;
      this.awaitFreeplayDismiss();
    } else {
      this.awaitingAgain = true;   // lock tile input; only Again/auto-advance proceeds
      this.showAgain();
      // auto-advance after ~6s
      this.advanceTimer = setTimeout(() => {
        if (!this.destroyed) this.again();
      }, 6000);
      this.busy = false;
    }
  }

  /** Bonus (real, no picture) word found. */
  async bonus(blend, left, right) {
    sfx.sparkle();
    const y = this.benchY() + 2.4;
    burst({ x: 0, y, z: 1 }, { count: 50, gold: true, spread: 0.7 });
    // bonus words have no picture and no per-word recording — voice the specific
    // word via TTS, then play the recorded generic "real word!" praise on top.
    await speech.speak(blend, { rate: 0.8, pitch: 1.1 });
    await audio.play('misc', 'realword', {
      fallbackText: fill(rand(PHRASES.bonus), { word: blend }),
      rate: 0.85, pitch: 1.1,
    });
    await wait(500);
    await this.returnTiles(left, right);
    this.busy = false;
  }

  /** Not a word — silly, warm response. */
  async silly(blend, left, right) {
    sfx.silly();
    await Promise.all([jiggleTile(left), jiggleTile(right)]);
    // the blend is arbitrary nonsense with no recording — voice it via TTS,
    // then play a recorded silly phrase on top.
    await speech.speak(blend, { rate: 0.7, pitch: 1.0 });
    const sillyKey = 'silly-' + (1 + ((Math.random() * 3) | 0));
    audio.play('misc', sillyKey, {
      fallbackText: fill(rand(PHRASES.silly), { blend }),
      rate: 0.85, pitch: 1.1,
    });
    await wait(400);
    await this.returnTiles(left, right);
    this.busy = false;
  }

  /** Send both bench tiles back to their arc homes. */
  async returnTiles(left, right) {
    for (const t of [left, right]) {
      const slotIndex = t.userData.type === 'onset' ? 0 : 1;
      const sl = this.bench.slots[slotIndex];
      if (sl.tile === t) { sl.tile = null; if (sl.panel) sl.panel.visible = true; }
      t.userData.slotted = false;
    }
    await Promise.all([
      flyTo(left, left.userData.home.x, left.userData.home.y, left.userData.home.z),
      flyTo(right, right.userData.home.x, right.userData.home.y, right.userData.home.z),
    ]);
  }

  // ---- free play card dismiss + collection ---------------------------

  awaitFreeplayDismiss() {
    // tapping anywhere (handled in main as a fallback) or the tiles dismisses.
    // We expose a flag main.js checks; simplest: auto-return after a short window
    // but ALSO allow immediate dismissal via dismissCard().
    this.freeplayCardUp = true;
  }

  /** main.js calls this on any pointer while a free-play card is showing. */
  async dismissCard() {
    if (!this.freeplayCardUp || this.busy) return;
    this.freeplayCardUp = false;
    this.busy = true;
    await hideCard(this.card);
    const left = this.bench.slots[0].tile;
    const right = this.bench.slots[1].tile;
    if (left && right) await this.returnTiles(left, right);
    this.busy = false;
  }

  addToGarden(wordObj) {
    if (this.found.has(wordObj.word)) return;
    this.found.add(wordObj.word);
    const el = document.createElement('div');
    el.className = 'garden-card';
    el.textContent = wordObj.char || '⭐';
    this.hud.gardenRow.appendChild(el);
    // keep the strip from overflowing: drop oldest beyond ~10
    while (this.hud.gardenRow.children.length > 12) {
      this.hud.gardenRow.removeChild(this.hud.gardenRow.firstChild);
    }
  }

  // ---- Again / replay -------------------------------------------------

  showAgain() {
    this.hud.btnAgain.classList.remove('hidden');
  }

  /** Advance to the next round (guided/mystery) — hide card, new round.
   *  Re-entrancy guarded: rapid Again taps and the auto-advance timer can both
   *  call this, but only the first proceeds. */
  async again() {
    if (this.busy || !this.awaitingAgain) return;
    this.busy = true;
    this.awaitingAgain = false;
    clearTimeout(this.advanceTimer);
    this.advanceTimer = null;
    this.hud.btnAgain.classList.add('hidden');
    await hideCard(this.card);
    if (this.destroyed) return;
    this.busy = false;
    this.newRound();
  }

  // ---- Read-only debug snapshot (window.SPROUTS) ----------------------

  /** Current mode + slotted fragment ids + last evaluation result. */
  debugState() {
    const slots = this.bench ? this.bench.slots : [null, null];
    return {
      mode: this.mode,
      slots: {
        onset: slots[0] && slots[0].tile ? slots[0].tile.userData.text : null,
        rime: slots[1] && slots[1].tile ? slots[1].tile.userData.text : null,
      },
      lastResult: this.lastResult,
    };
  }

  /**
   * Project every active, tappable (non-slotted) tile center to CSS pixel canvas
   * coordinates. Returns [{ label, type, x, y }].
   */
  debugTileXY() {
    const cam = getCamera();
    const w = window.innerWidth;
    const h = window.innerHeight;
    const v = new THREE.Vector3();
    return this.tiles.map((t) => {
      t.getWorldPosition(v);
      v.project(cam);
      return {
        label: t.userData.text,
        type: t.userData.type,
        x: (v.x * 0.5 + 0.5) * w,
        y: (-v.y * 0.5 + 0.5) * h,
      };
    });
  }
}
