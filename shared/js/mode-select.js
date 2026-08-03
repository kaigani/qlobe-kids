// mode-select.js — the splash's row of mode cards, once.
//
// Every game's splash is the same object: `config.modes` rendered as big
// tappable cards, wired through tap.js with an sfx tick on press, each one
// starting its mode. The nine copies in the audit differ only in their skin —
// `.qk-choose-mode`, `.ctc-mode`, `.mode-card`, `.recipe-card` — and in whether
// the card shows art, an emoji, a title, or all three.
//
// So the split here is: **structure and press path are shared, paint is opt-in**.
//   - `.qk-mode-card` is applied always. It carries the identity (`data-mode`),
//     the QA hook (`data-target`), and the platform's ≥96px touch floor.
//   - `.qk-mode-list` is applied to the host only when `skin` is on, and every
//     painted rule in shared/css/screens.css is scoped under it. A game with
//     its own card skin passes `skin: false` and keeps every pixel it had.
//
// Imports are limited to shared/js siblings. Notably NOT audio-unlock: unlocking
// is the one global first-gesture listener's job (see hud.js for the same note),
// and a game that needs to unlock from the card press passes its own `feedback`.

import { onTap } from './tap.js';
import * as sfx from './sfx.js';

/** `mode.art` may be a url, a ready-made node, or absent. Normalise it. */
function buildArt(value, mode) {
  if (!value) return null;
  if (typeof value === 'object' && value.nodeType === 1) return value;
  const img = document.createElement('img');
  img.className = 'qk-mode-art';
  img.src = String(value);
  img.alt = '';
  img.draggable = false;
  return img;
}

/**
 * Build one mode card. Exported because a game that lays its own splash out
 * still wants the same button.
 *
 * @param {object} mode  `{ id, title, art?, icon? }` — extra keys are ignored
 * @param {object} [opts]  see renderModeCards; the per-card subset
 * @param {number} [index=0]
 * @returns {HTMLButtonElement}
 */
export function modeCard(mode, opts = {}, index = 0) {
  const {
    cardClass, art, showTitle = true, label, vars, decorate,
    targetPrefix = 'mode-',
  } = opts;

  const btn = document.createElement('button');
  btn.type = 'button';
  const extra = typeof cardClass === 'function' ? cardClass(mode, index) : cardClass;
  btn.className = extra ? `qk-mode-card ${extra}` : 'qk-mode-card';
  btn.dataset.mode = mode.id;
  if (targetPrefix) btn.dataset.target = `${targetPrefix}${mode.id}`;
  btn.setAttribute('aria-label', (label ? label(mode, index) : mode.title) || mode.id);
  // Staggered entrance animations key off this; harmless when nothing reads it.
  btn.style.setProperty('--qk-mode-i', String(index));

  if (vars) {
    for (const [prop, value] of Object.entries(vars(mode, index) || {})) {
      if (value == null) continue;
      btn.style.setProperty(prop, String(value));
    }
  }

  const artValue = art ? art(mode, index) : mode.art;
  const artNode = buildArt(artValue, mode);
  if (artNode) {
    btn.append(artNode);
  } else if (mode.icon) {
    const icon = document.createElement('span');
    icon.className = 'qk-mode-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = String(mode.icon);
    btn.append(icon);
  }

  if (showTitle && mode.title) {
    const title = document.createElement('span');
    title.className = 'qk-mode-title';
    title.textContent = mode.title;
    btn.append(title);
  }

  if (decorate) decorate(btn, mode, index);
  return btn;
}

/**
 * Render `config.modes` into `host` as tappable cards.
 *
 * @param {object} opts
 * @param {Element} opts.host  the container (gets `.qk-mode-list` when skinned)
 * @param {Array<{id: string, title?: string, art?: string|Node, icon?: string}>} opts.modes
 * @param {(id: string, mode: object, index: number, e: Event) => any} opts.onPick
 * @param {(e: PointerEvent, mode: object, index: number) => void} [opts.feedback]
 *   pointerdown feedback. Default: `preventDefault()` + `sfx.tick()`. Pass your
 *   own to add `unlockAll()` or to drop the preventDefault.
 * @param {boolean} [opts.skin=true]  apply the shared card look (screens.css)
 * @param {string|((mode, i) => string)} [opts.cardClass]  extra class(es) per card
 * @param {(mode, i) => string|Node|null} [opts.art]  default `mode.art`
 * @param {boolean} [opts.showTitle=true]  false when the title is baked into the art
 * @param {(mode, i) => string} [opts.label]  aria-label; default `mode.title`
 * @param {(mode, i) => Record<string, string|number>} [opts.vars]  custom properties
 * @param {(button: HTMLButtonElement, mode, i) => void} [opts.decorate]  badges etc.
 * @param {boolean} [opts.replace=true]  clear `host` first
 * @param {string|null} [opts.targetPrefix='mode-']  `data-target`; null to omit
 * @returns {{ host: Element, cards: HTMLButtonElement[], dispose: () => void }}
 */
export function renderModeCards(opts = {}) {
  const { host, modes = [], onPick, feedback, skin = true, replace = true } = opts;
  if (!host) throw new Error('renderModeCards: `host` is required');

  if (replace) host.replaceChildren();
  if (skin) host.classList.add('qk-mode-list');

  const press = (e, mode, index) => {
    if (feedback) { feedback(e, mode, index); return; }
    e.preventDefault?.();
    try { sfx.tick(); } catch { /* audio is never load-bearing */ }
  };

  const cards = [];
  const disposers = [];
  modes.forEach((mode, index) => {
    const btn = modeCard(mode, opts, index);
    host.append(btn);
    cards.push(btn);
    disposers.push(onTap(btn, (e) => onPick && onPick(mode.id, mode, index, e), {
      feedback: (e) => press(e, mode, index),
    }));
  });

  return {
    host,
    cards,
    /** Remove the tap listeners. The cards themselves stay — the caller owns the DOM. */
    dispose() { for (const fn of disposers) fn(); disposers.length = 0; },
  };
}
