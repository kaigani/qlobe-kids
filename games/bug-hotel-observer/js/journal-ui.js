// journal-ui.js — the 4 × 3 sticker grid, and the flight that fills a slot.
//
// game-design.md §2.6 (reward), §2.7 (My Bug Book), §9.6 (the sticker) and
// §8.2 rows 11–15. The RECORD lives in `shared/js/journal.js`; this file only
// draws it. That split is why the same grid can be mounted twice at once (the
// reward spread and the end screen) without the two ever disagreeing: both
// grids subscribe to the one journal's `onChange`.
//
// A slot is either
//   filled: <button class="sticker"> — backing art + that bug's HAPPY frame,
//           tappable forever, replays name → fact;
//   empty:  <div class="sticker is-empty"> — the same backing at 26 %, a dashed
//           cut-paper outline, NO handler at all. An empty slot that wiggled or
//           spoke would be a scold for not having found something yet.
//
// The grid order is `config.bugs`' canonical order, NOT earned order: the book
// is a map of the hotel (room by room, three to a room), so the same bug is
// always in the same square and a child can point at the gap they are missing.

import { onTap } from '../../../shared/js/tap.js';
import { imgEl } from './art.js';

/**
 * @param {object} o
 * @param {object} o.config     parsed config.json
 * @param {object} o.journal    a shared/js/journal.js instance
 * @param {(bugId: string) => void} [o.onSticker]  a filled sticker was tapped
 * @param {() => void} [o.feedback] runs on press (audio unlock + tick)
 */
export function createJournalUI({ config, journal, onSticker, feedback }) {
  const bugs = config.bugs || [];
  const jcfg = config.journal || {};
  const grids = new Set();

  /**
   * One mounted grid. A game screen owns the element; this owns what is in it.
   * @param {HTMLElement} el
   * @param {{interactive?: boolean}} [opts]
   */
  function createGrid(el, { interactive = true } = {}) {
    const slots = new Map();          // bugId -> the slot element currently there
    const grid = {
      el,
      /** Rebuild from the record. Cheap enough to call on every screen entry. */
      refresh() {
        el.replaceChildren();
        slots.clear();
        const cols = (jcfg.grid && jcfg.grid.cols) || 4;
        el.style.setProperty('--cols', String(cols));
        for (const bug of bugs) {
          const owned = journal.has(bug.id);
          const node = owned && interactive
            ? document.createElement('button')
            : document.createElement('div');
          node.className = `sticker${owned ? '' : ' is-empty'}`;
          node.dataset.bug = bug.id;
          if (owned && interactive) {
            node.type = 'button';
            node.setAttribute('aria-label', bug.id);
            onTap(node, () => { if (onSticker) onSticker(bug.id); }, { feedback });
          } else {
            node.setAttribute('aria-hidden', 'true');
          }
          node.appendChild(imgEl(jcfg.stickerBacking, 'sticker-backing'));
          if (owned) {
            node.appendChild(imgEl(bug.sprites && bug.sprites.happy, 'sticker-face'));
          }
          el.appendChild(node);
          slots.set(bug.id, node);
        }
      },
      slotOf(bugId) { return slots.get(String(bugId)) || null; },
      /** §9.6 — an already-owned bug pulses in place instead of flying in. */
      pulse(bugId) {
        const node = slots.get(String(bugId));
        if (!node) return;
        node.classList.remove('pulse');
        void node.offsetWidth;                    // restart the animation
        node.classList.add('pulse');
      },
      /** §9.8 — the round's stickers rise out of the grid, 120 ms apart. */
      rise(ids) {
        [...slots.values()].forEach((node) => node.classList.remove('rise'));
        (ids || []).forEach((id, i) => {
          const node = slots.get(String(id));
          if (!node) return;
          node.style.setProperty('--rise-delay', `calc(${120 * i}ms * var(--ts, 1))`);
          node.classList.add('rise');
        });
      },
      clearRise() {
        [...slots.values()].forEach((node) => {
          node.classList.remove('rise');
          node.style.removeProperty('--rise-delay');
        });
      },
      destroy() { grids.delete(grid); el.replaceChildren(); slots.clear(); },
    };
    grids.add(grid);
    grid.refresh();
    return grid;
  }

  // One subscription for every mounted grid: a sticker added anywhere (a room
  // reward, a debug call) repaints all of them in the same frame.
  const off = journal.onChange(() => {
    for (const grid of grids) grid.refresh();
  });

  /**
   * §9.6 — the happy sprite flies from wherever it is on screen into its slot,
   * with a small arc, and lands with a squash. `journal.add()` is the CALLER's
   * job and happens at the START of the flight, so a back-tap mid-animation
   * still keeps the sticker.
   *
   * Under reduced motion it cross-fades into the slot instead of arcing —
   * §9.10, same duration, same sound, same outcome.
   *
   * @param {object} o
   * @param {HTMLElement} o.layer  a positioned layer to animate inside
   * @param {DOMRect|{x,y,width,height}} o.from  where the sprite is now
   * @param {HTMLElement} o.slot   the destination slot element
   * @param {?string} o.sprite     the happy-frame path
   * @param {number} [o.ms=700]
   * @param {boolean} [o.reducedMotion=false]
   * @returns {Promise<void>} resolves when the flight has landed
   */
  function flyTo({ layer, from, slot, sprite, ms = 700, reducedMotion = false }) {
    if (!layer || !slot || !from) return Promise.resolve();
    const to = slot.getBoundingClientRect();
    const origin = layer.getBoundingClientRect();
    const fx = (from.x ?? from.left ?? 0) + (from.width ?? from.w ?? 0) / 2 - origin.left;
    const fy = (from.y ?? from.top ?? 0) + (from.height ?? from.h ?? 0) / 2 - origin.top;
    const tx = to.x + to.width / 2 - origin.left;
    const ty = to.y + to.height / 2 - origin.top;
    const size = Math.max(48, (from.width ?? from.w ?? 120));
    const endScale = to.width > 0 ? (to.width * 0.82) / size : 0.5;

    const flyer = imgEl(sprite, 'sticker-flyer');
    flyer.style.width = `${size}px`;
    flyer.style.height = `${size}px`;
    flyer.style.left = `${fx - size / 2}px`;
    flyer.style.top = `${fy - size / 2}px`;
    layer.appendChild(flyer);

    // THE SLOT IS EMPTY UNTIL THE STICKER LANDS IN IT.
    // The caller writes the record BEFORE the flight on purpose (§9.6: a back
    // tap mid-animation must not cost a child their ladybug), and every mounted
    // grid repaints off that write — so the destination slot was already
    // wearing the bug while a second copy of the same bug flew towards it. The
    // record still exists the whole time; only the FACE waits, so the flight is
    // the moment the sticker arrives instead of a decoration on top of it.
    const face = slot.querySelector('.sticker-face');
    if (face) face.style.opacity = '0';

    return new Promise((resolve) => {
      const done = () => {
        if (face) face.style.opacity = '';
        flyer.remove();
        slot.classList.remove('land');
        void slot.offsetWidth;
        slot.classList.add('land');
        resolve();
      };
      if (reducedMotion) {
        flyer.style.transition = `opacity ${ms}ms ease`;
        requestAnimationFrame(() => { flyer.style.opacity = '0'; });
        setTimeout(done, ms);
        return;
      }
      const t0 = performance.now();
      const arc = Math.min(160, Math.abs(tx - fx) * 0.35 + 60);
      const step = (now) => {
        const t = Math.max(0, Math.min(1, (now - t0) / ms));
        const e = 1 - Math.pow(1 - t, 3);
        const x = fx + (tx - fx) * e;
        const y = fy + (ty - fy) * e - 4 * arc * e * (1 - e);
        const s = 1 + (endScale - 1) * e;
        flyer.style.transform = `translate3d(${x - fx}px, ${y - fy}px, 0) scale(${s})`;
        if (t >= 1) { done(); return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  return {
    createGrid,
    flyTo,
    /** Everything the child owns, oldest first — QLOBE_DEBUG.getJournal(). */
    entries() {
      return journal.all().map((e) => ({
        id: e.id, room: e.room ?? null, round: e.round ?? null, mode: e.mode ?? null, foundAt: e.at,
      }));
    },
    count() { return journal.count(); },
    total() { return bugs.length; },
    destroy() {
      off();
      for (const grid of [...grids]) grid.destroy();
    },
  };
}
