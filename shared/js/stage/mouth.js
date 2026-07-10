// mouth.js — viseme-driven talking mouths for the character cast (Stage v2).
//
// Overlays viseme mouth patches (shared/characters/<id>/anim/mouth-<shape>.png)
// on top of a character portrait <img>, and swaps them in sync with a playing
// audio clip using a Rhubarb Lip Sync timeline
// ({ mouthCues: [{ start, end, value: 'A'..'H'|'X' }] }).
//
// Renderer-agnostic: works over any positioned <img>. A Pixi adapter can reuse
// the same cue-walking core (exported as followCues).

const SHAPES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'x'];

/**
 * Walk a Rhubarb cue list against an <audio> element's clock.
 * Calls setShape('a'..'x') as cues change; returns a stop() function.
 * Resolves shape to 'x' when the audio ends/pauses.
 */
export function followCues(audioEl, cues, setShape) {
  let raf = 0;
  let last = '';
  const tick = () => {
    const t = audioEl.currentTime;
    let shape = 'x';
    // cue lists are short (dozens) — linear walk is fine and allocation-free
    for (let i = 0; i < cues.length; i++) {
      if (t >= cues[i].start && t < cues[i].end) { shape = cues[i].value.toLowerCase(); break; }
    }
    if (shape !== last) { last = shape; setShape(shape); }
    if (!audioEl.paused && !audioEl.ended) raf = requestAnimationFrame(tick);
    else { setShape('x'); raf = 0; }
  };
  raf = requestAnimationFrame(tick);
  return () => { if (raf) cancelAnimationFrame(raf); setShape('x'); };
}

/**
 * Random mouth flap for voices with no timeline (Web Speech fallback).
 * Flaps until stop() is called.
 */
export function flap(setShape) {
  const talky = ['b', 'c', 'd', 'e'];
  let timer = 0;
  const step = () => {
    setShape(talky[Math.floor(Math.random() * talky.length)]);
    timer = setTimeout(step, 90 + Math.random() * 120);
  };
  step();
  return () => { clearTimeout(timer); setShape('x'); };
}

/**
 * Attach a talking mouth to a portrait <img>.
 * Resolves to null (harmless no-op object) if the character has no mouth
 * assets yet — callers never need to special-case.
 *
 * @param {HTMLImageElement} portraitEl rendered portrait
 * @param {string} characterId e.g. 'maya'
 * @param {string} sharedBase document-relative path to shared/, e.g. '../../shared/'
 */
export async function createTalkingMouth(portraitEl, characterId, sharedBase) {
  const animBase = `${sharedBase}characters/${characterId}/anim/`;
  let meta;
  try {
    const res = await fetch(`${animBase}mouths.json`);
    if (!res.ok) throw new Error('no mouths');
    meta = await res.json();
  } catch {
    return null; // character not rigged yet — that's fine
  }

  // preload all shapes so swaps never flicker
  const urls = {};
  for (const s of meta.shapes || SHAPES) {
    urls[s] = `${animBase}mouth-${s}.png`;
    const img = new Image();
    img.src = urls[s];
  }

  const overlay = document.createElement('img');
  overlay.className = 'qk-mouth';
  overlay.alt = '';
  overlay.draggable = false;
  overlay.style.position = 'absolute';
  overlay.style.pointerEvents = 'none';
  overlay.src = urls.x;
  const parent = portraitEl.parentElement;
  if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
  parent.appendChild(overlay);

  const { rect, portrait } = meta; // rect in source-portrait pixels
  function layout() {
    const w = portraitEl.clientWidth || portraitEl.width;
    const h = portraitEl.clientHeight || portraitEl.height;
    if (!w) return;
    const scaleX = w / portrait;
    const scaleY = h / portrait;
    overlay.style.left = `${portraitEl.offsetLeft + rect.x * scaleX}px`;
    overlay.style.top = `${portraitEl.offsetTop + rect.y * scaleY}px`;
    overlay.style.width = `${rect.w * scaleX}px`;
    overlay.style.height = `${rect.h * scaleY}px`;
  }
  layout();
  const ro = new ResizeObserver(layout);
  ro.observe(portraitEl);
  if (!portraitEl.complete) portraitEl.addEventListener('load', layout);

  let stopCurrent = null;
  const setShape = (s) => { overlay.src = urls[s] || urls.x; };

  return {
    /** Sync to an <audio> element with a Rhubarb viseme JSON url. */
    async syncTo(audioEl, visemeUrl) {
      this.stop();
      try {
        const cues = (await (await fetch(visemeUrl)).json()).mouthCues;
        stopCurrent = followCues(audioEl, cues, setShape);
      } catch {
        stopCurrent = flap(setShape); // no timeline — flap while it plays
        audioEl.addEventListener('ended', () => this.stop(), { once: true });
      }
    },
    /** Flap without a timeline (Web Speech). Returns when stopped. */
    startFlap() { this.stop(); stopCurrent = flap(setShape); },
    stop() { if (stopCurrent) { stopCurrent(); stopCurrent = null; } },
    setShape,
    destroy() { this.stop(); ro.disconnect(); overlay.remove(); },
  };
}
