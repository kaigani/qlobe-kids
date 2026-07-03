// hub.js — the Game Chooser.
// Loads the registry and renders one carousel slide per category: a badge pill
// over a white card of game tiles. Swipe, arrows, or dots to move between
// categories. No router, no state — a tile is just a link.

import { loadRegistry } from './registry.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function tileArt(game) {
  const art = el('span', 'tile-art');
  if (game.iconBg) art.style.backgroundImage = `url("${game.iconBg}")`;
  const img = el('img');
  img.src = game.icon;
  img.alt = '';
  img.decoding = 'async';
  img.loading = 'lazy';
  img.draggable = false;
  // wordmark-style icons (transparent PNGs) sit contained over their backdrop;
  // full-bleed illustrations cover the whole art area
  if (game.iconFit === 'contain') img.className = 'contain';
  art.appendChild(img);
  return art;
}

function tileLabel(game) {
  const label = el('span', 'tile-label');
  label.textContent = game.title;
  return label;
}

// A playable game: a big tappable link.
function liveTile(game) {
  const a = el('a', 'tile');
  a.href = game.path;
  a.setAttribute('aria-label', game.title);
  a.append(tileArt(game), tileLabel(game));
  return a;
}

// A game that's still growing — full color per the concept, sprout chip,
// not tappable.
function soonTile(game) {
  const div = el('div', 'tile tile-soon');
  div.setAttribute('aria-disabled', 'true');
  div.append(tileArt(game), tileLabel(game));
  return div;
}

function slide(category, games) {
  const sec = el('section', 'slide');
  sec.setAttribute('aria-label', category.title);
  if (category.color) sec.style.setProperty('--cat', category.color);

  const badge = el('h2', 'badge');
  if (category.emoji) {
    const emoji = el('span', 'badge-emoji');
    emoji.textContent = category.emoji;
    emoji.setAttribute('aria-hidden', 'true');
    badge.appendChild(emoji);
  }
  badge.appendChild(document.createTextNode(category.title));

  const card = el('div', 'card');
  if (games.length === 1) card.classList.add('single');
  games.forEach((g) => card.appendChild(
    g.status === 'live' && g.path ? liveTile(g) : soonTile(g)
  ));

  sec.append(badge, card);
  return sec;
}

function render(carousel, { categories, games }) {
  const ordered = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));
  const frag = document.createDocumentFragment();
  for (const cat of ordered) {
    const inCat = games.filter((g) => g.category === cat.id);
    if (inCat.length === 0) continue;
    frag.appendChild(slide(cat, inCat));
  }
  carousel.appendChild(frag);
}

// ---------- carousel driving ----------

function setupCarousel(carousel) {
  const slides = [...carousel.querySelectorAll('.slide')];
  const prev = document.querySelector('.arrow-prev');
  const next = document.querySelector('.arrow-next');
  const dotsBox = document.getElementById('dots');
  if (!slides.length) return;

  const dots = slides.map((s, i) => {
    const d = el('button', 'dot');
    d.type = 'button';
    d.tabIndex = -1;
    d.addEventListener('click', () => goTo(i));
    dotsBox.appendChild(d);
    return d;
  });

  function current() {
    // the slide whose center is nearest the viewport center
    const mid = carousel.scrollLeft + carousel.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    slides.forEach((s, i) => {
      const c = s.offsetLeft + s.offsetWidth / 2;
      const dist = Math.abs(c - mid);
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    return best;
  }

  function goTo(i) {
    const s = slides[Math.max(0, Math.min(slides.length - 1, i))];
    const left = s.offsetLeft + s.offsetWidth / 2 - carousel.clientWidth / 2;
    carousel.scrollTo({ left, behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  function refresh() {
    const i = current();
    const end = carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - 4;
    const start = carousel.scrollLeft <= 4;
    prev.classList.toggle('is-off', start);
    next.classList.toggle('is-off', end);
    dots.forEach((d, di) => d.classList.toggle('is-active', di === i));
  }

  prev.hidden = false;
  next.hidden = false;
  prev.addEventListener('click', () => goTo(current() - 1));
  next.addEventListener('click', () => goTo(current() + 1));
  carousel.addEventListener('scroll', () => requestAnimationFrame(refresh), { passive: true });
  addEventListener('resize', refresh);

  carousel.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(current() - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(current() + 1); }
  });

  const home = document.getElementById('home-pill');
  if (home) home.addEventListener('click', () => goTo(0));

  refresh();
}

async function init() {
  const carousel = document.getElementById('carousel');
  if (!carousel) return;
  const registry = await loadRegistry();
  render(carousel, registry);
  setupCarousel(carousel);
}

init();
