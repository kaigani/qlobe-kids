// screens/splash.js — the festival-night front door. Pure DOM (no Pixi): a
// title lockup, one hero dance card, and one enormous Dance button.
//
// The title is a GENERATED GRAPHIC LOCKUP (house rule: splash titles are art in
// the game's own art world, never HTML type). Until that art lands the <img>
// fails over to styled Fredoka so the screen is never blank — the fallback is
// scaffolding, not the design.
//
// The hero is the real thing too: the shared cut-paper card backing with the
// first ready culture's neutral pose standing inside it, tilted off-square so it
// reads as a card someone just put down rather than a UI panel. Both layers fail
// over independently (backing → painted panel, pose → glyph), so a repo mid-art-
// production still shows a hero instead of a hole.
//
// Nothing speaks here. The intro line is deferred to the Dance tap: a recorded
// clip fired at page load has no user gesture behind it, gets blocked, and
// slips to the robot synth voice.

import { onTap } from '../../../../shared/js/tap.js';
import { NOTE_SVG } from '../art.js';

export async function createSplashScreen(ctx) {
  ctx.showStage(false);
  ctx.stopSong();

  const root = document.createElement('section');
  root.className = 'wmd-splash';
  root.setAttribute('aria-label', ctx.config.title || 'World Music Dance');
  root.innerHTML = `
    <img class="wmd-title-art" alt="${escapeAttr(ctx.config.title || 'World Music Dance')}" draggable="false" />
    <div class="wmd-hero" aria-hidden="true">
      <img class="wmd-hero-card" alt="" draggable="false" />
      <img class="wmd-hero-pose" alt="" draggable="false" />
      <span class="wmd-hero-glyph">💃</span>
    </div>
    <button class="wmd-cta" type="button" aria-label="Dance">${NOTE_SVG}<span>Dance</span></button>`;

  const titleImg = root.querySelector('.wmd-title-art');
  titleImg.addEventListener('error', () => {
    const heading = document.createElement('h1');
    heading.className = 'wmd-title-text';
    heading.innerHTML = 'World Music<span>Dance</span>';
    titleImg.replaceWith(heading);
  }, { once: true });
  const titleSrc = ctx.assetUrl((ctx.config.assets || {}).title);
  if (titleSrc) titleImg.src = titleSrc;
  else titleImg.dispatchEvent(new Event('error'));

  buildHero(ctx, root.querySelector('.wmd-hero'));

  const cta = root.querySelector('.wmd-cta');
  let dead = false;

  const start = () => {
    if (dead) return;
    ctx.unlockAudio();
    ctx.sfx('pop');
    // The map speaks the intro: goto() stops voice as it swaps screens, so a
    // line started here would be cut off mid-word one frame later.
    ctx.goto('map', { greeting: 'intro' });
  };

  const disposers = [onTap(cta, start, {
    feedback: (e) => { e.preventDefault(); ctx.unlockAudio(); ctx.sfx('tick'); },
  })];

  ctx.layer.appendChild(root);
  ctx.armIdle('splash');

  return {
    name: 'splash',
    ready: Promise.resolve(),
    getState: () => ({ culture: null, phase: null, step: 0, awaitingInput: true }),
    getTargets() {
      if (dead || !cta.isConnected) return [];
      const r = cta.getBoundingClientRect();
      return [{ id: 'dance', role: 'correct', rect: { x: r.x, y: r.y, w: r.width, h: r.height } }];
    },
    tap(id) {
      if (id !== 'dance') return { accepted: false };
      start();
      return { accepted: true };
    },
    async winRound() { start(); },
    onBack() { ctx.goto('splash'); },
    destroy() {
      dead = true;
      disposers.forEach((dispose) => { try { dispose(); } catch { /* already gone */ } });
      root.remove();
    },
  };
}

/**
 * Compose the hero dance card in place: card backing + a real neutral pose.
 *
 * Each layer degrades on its own. `no-card` repaints the old cut-paper panel,
 * `no-pose` brings the glyph stand-in back — so a missing file costs one layer,
 * never the hero. Only a culture whose pose pack the index calls ready is asked
 * for art; the rest never get a 404 spent on them.
 */
function buildHero(ctx, hero) {
  if (!hero) return;
  const card = hero.querySelector('.wmd-hero-card');
  const pose = hero.querySelector('.wmd-hero-pose');

  card.addEventListener('error', () => hero.classList.add('no-card'), { once: true });
  const cardSrc = ctx.assetUrl((ctx.config.assets || {}).cardBacking);
  if (cardSrc) card.src = cardSrc;
  else hero.classList.add('no-card');

  const star = ctx.cultures.find((c) => c && c.dancer && c.dancer.base && ctx.poseReady(c.id));
  const poseSrc = star ? ctx.assetUrl(`${star.dancer.base}poses/neutral.webp`) : '';
  pose.addEventListener('error', () => hero.classList.add('no-pose'), { once: true });
  if (poseSrc) pose.src = poseSrc;
  else hero.classList.add('no-pose');
}

function escapeAttr(value) {
  return String(value).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}
