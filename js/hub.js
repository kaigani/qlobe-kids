// hub.js — the Game Chooser, two tiers deep.
// Tier 1: one big tile per learning category (art + badge, no card behind).
// Tier 2: tap a category to see its games as smaller tiles.
// Routing is the URL hash (#category-id) so the browser back button works and
// a category can be linked directly. No framework, no state beyond the hash.

import { loadRegistry } from './registry.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let registry = { categories: [], games: [] };

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function badge(category) {
  const b = el('span', 'badge');
  if (category.emoji) {
    const emoji = el('span', 'badge-emoji');
    emoji.textContent = category.emoji;
    emoji.setAttribute('aria-hidden', 'true');
    b.appendChild(emoji);
  }
  b.appendChild(document.createTextNode(category.title));
  return b;
}

function tileArt(item) {
  const art = el('span', 'tile-art');
  if (item.iconBg) art.style.backgroundImage = `url("${item.iconBg}")`;
  const img = el('img');
  img.src = item.icon;
  img.alt = '';
  img.decoding = 'async';
  img.loading = 'lazy';
  img.draggable = false;
  if (item.iconFit === 'contain') img.className = 'contain';
  art.appendChild(img);
  return art;
}

function tileLabel(text) {
  const label = el('span', 'tile-label');
  label.textContent = text;
  return label;
}

// ---------- tier 1: categories ----------

function categorySlide(category, games) {
  const sec = el('section', 'slide slide-cat');
  if (category.color) sec.style.setProperty('--cat', category.color);

  // "1/10 games" — how many are playable today out of everything planned here
  const live = games.filter((g) => g.status === 'live' && g.path).length;
  const count = `${live}/${games.length} game${games.length === 1 ? '' : 's'}`;

  const a = el('a', 'tile tile-big');
  a.href = `#${category.id}`;
  a.setAttribute('aria-label', `${category.title} — ${live} of ${games.length} games ready to play`);
  a.append(tileArt(category), tileLabel(count));

  sec.append(badge(category), a);
  return sec;
}

// ---------- tier 2: games in a category ----------

function gameSlide(game) {
  const sec = el('section', 'slide slide-game');

  let tile;
  if (game.status === 'live' && game.path) {
    tile = el('a', 'tile');
    tile.href = game.path;
    tile.setAttribute('aria-label', game.title);
  } else {
    tile = el('div', 'tile tile-soon');
    tile.setAttribute('aria-disabled', 'true');
  }
  tile.append(tileArt(game), tileLabel(game.title));
  sec.appendChild(tile);
  return sec;
}

// ---------- rendering ----------

function clearSlides(carousel) {
  carousel.querySelectorAll('.slide').forEach((s) => s.remove());
}

function currentCategory() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return null;
  return registry.categories.find((c) => c.id === id) || null;
}

function gamesIn(category) {
  return registry.games.filter((g) => g.category === category.id);
}

function renderView() {
  const carousel = document.getElementById('carousel');
  const context = document.getElementById('context');
  const cat = currentCategory();

  clearSlides(carousel);
  context.textContent = '';
  const frag = document.createDocumentFragment();

  if (cat) {
    // tier 2 — this category's games
    carousel.classList.add('tier-games');
    document.body.style.setProperty('--cat', cat.color || '');
    const back = el('a', 'back-btn');
    back.href = '#';
    back.setAttribute('aria-label', 'Back to all categories');
    back.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4.5 7.5 12 15 19.5" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    context.append(back, badge(cat));
    context.hidden = false;
    gamesIn(cat).forEach((g) => frag.appendChild(gameSlide(g)));
    carousel.setAttribute('aria-label', `${cat.title} games — swipe or use the arrows`);
  } else {
    // tier 1 — all categories that have games
    carousel.classList.remove('tier-games');
    document.body.style.removeProperty('--cat');
    context.hidden = true;
    const ordered = [...registry.categories].sort((a, b) => (a.order || 0) - (b.order || 0));
    for (const c of ordered) {
      const inCat = gamesIn(c);
      if (inCat.length === 0) continue;
      frag.appendChild(categorySlide(c, inCat));
    }
    carousel.setAttribute('aria-label', 'Game categories — swipe or use the arrows');
  }

  carousel.appendChild(frag);
  updateCarousel();
}

// ---------- carousel driving ----------

const nav = {
  carousel: null,
  slides: [],
  dots: [],
};

function currentIndex() {
  const mid = nav.carousel.scrollLeft + nav.carousel.clientWidth / 2;
  let best = 0;
  let bestDist = Infinity;
  nav.slides.forEach((s, i) => {
    const c = s.offsetLeft + s.offsetWidth / 2;
    const dist = Math.abs(c - mid);
    if (dist < bestDist) { bestDist = dist; best = i; }
  });
  return best;
}

function goTo(i, instant) {
  const s = nav.slides[Math.max(0, Math.min(nav.slides.length - 1, i))];
  if (!s) return;
  const left = s.offsetLeft + s.offsetWidth / 2 - nav.carousel.clientWidth / 2;
  nav.carousel.scrollTo({ left, behavior: instant || reducedMotion ? 'auto' : 'smooth' });
}

function refresh() {
  const prev = document.querySelector('.arrow-prev');
  const next = document.querySelector('.arrow-next');
  const i = currentIndex();
  const atEnd = nav.carousel.scrollLeft + nav.carousel.clientWidth >= nav.carousel.scrollWidth - 4;
  const atStart = nav.carousel.scrollLeft <= 4;
  prev.classList.toggle('is-off', atStart);
  next.classList.toggle('is-off', atEnd);
  nav.dots.forEach((d, di) => d.classList.toggle('is-active', di === i));
}

function updateCarousel() {
  nav.slides = [...nav.carousel.querySelectorAll('.slide')];
  const dotsBox = document.getElementById('dots');
  dotsBox.textContent = '';
  nav.dots = nav.slides.map((s, i) => {
    const d = el('button', 'dot');
    d.type = 'button';
    d.tabIndex = -1;
    d.addEventListener('click', () => goTo(i));
    dotsBox.appendChild(d);
    return d;
  });
  goTo(0, true);
  refresh();
}

function setupChrome() {
  const prev = document.querySelector('.arrow-prev');
  const next = document.querySelector('.arrow-next');
  prev.hidden = false;
  next.hidden = false;
  prev.addEventListener('click', () => goTo(currentIndex() - 1));
  next.addEventListener('click', () => goTo(currentIndex() + 1));
  nav.carousel.addEventListener('scroll', () => requestAnimationFrame(refresh), { passive: true });
  addEventListener('resize', refresh);

  nav.carousel.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(currentIndex() - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(currentIndex() + 1); }
  });

  // The Game Chooser pill is "home": leave a category, or rewind to the start.
  const home = document.getElementById('home-pill');
  home.addEventListener('click', () => {
    if (currentCategory()) {
      location.hash = '';
    } else {
      goTo(0);
    }
  });

  addEventListener('hashchange', renderView);
}

async function init() {
  nav.carousel = document.getElementById('carousel');
  if (!nav.carousel) return;
  registry = await loadRegistry();
  setupChrome();
  renderView();
}

init();
