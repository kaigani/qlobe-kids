// hub.js — the single-level QLOBE Kids library.
// The hash is a lightweight category filter. Every playable game stays on the
// landing page, so a child can scan the whole library without entering a
// second chooser screen.

import { loadRegistry } from './registry.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const PLAYABLE_STATUSES = new Set(['live', 'beta']);
const FEATURED_IDS = [
  'blend-train',
  'letter-treasure-hunt',
  'flashlight-cave',
  'sound-sprouts',
  'sound-basket',
  'tangram-tales',
  'counting-treasure-cups',
  'sand-tray-letters',
  'name-puzzle',
  'lunchbox-pack',
];

const CATEGORY_LABELS = {
  'reading-phonics': 'Reading & Phonics',
  'writing-fine-motor': 'Writing & Fine Motor',
  'math-number-sense': 'Math & Number Sense',
  'practical-life': 'Practical Life',
  'sensorial-science': 'Science & Discovery',
  'oral-storytelling': 'Stories & Language',
  'culture-geography': 'World & Culture',
  'art-music': 'Creativity & Art',
  'movement-outdoor': 'Movement & Outdoor',
  'social-emotional': 'Social & Emotional',
};

const FEATURED_SUMMARY = 'Build words and take the train to new places!';
const FEATURED_HERO_ART = 'games/blend-train/assets/art/splash.webp';
const CATEGORY_ORDER = [
  'reading-phonics',
  'math-number-sense',
  'practical-life',
  'writing-fine-motor',
  'social-emotional',
  'art-music',
  'sensorial-science',
  'movement-outdoor',
  'culture-geography',
  'oral-storytelling',
];

// Small original SVG emblems keep the category row crisp and consistent at
// every zoom level. Each emblem gets a two-stop gradient from its section key.
const CATEGORY_ICONS = {
  featured: '<path d="m24 3.5 5.9 11.9 13.2 1.9-9.5 9.3 2.2 13.1L24 33.5l-11.8 6.2 2.2-13.1-9.5-9.3 13.2-1.9z"/>',
  'reading-phonics': '<path d="M5.5 9.2c5-2.3 10.1-1.9 15.7 1.2v29c-5.6-3.1-10.7-3.5-15.7-1.2zM42.5 9.2c-5-2.3-10.1-1.9-15.7 1.2v29c5.6-3.1 10.7-3.5 15.7-1.2z"/><path d="M24 10.7v28.8" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"/>',
  'math-number-sense': '<rect x="5" y="7" width="15" height="15" rx="3"/><rect x="28" y="7" width="15" height="15" rx="3"/><rect x="16.5" y="26" width="15" height="15" rx="3"/><path d="M10 14.5h5M12.5 12v5M33 14.5h5M24 33.5h5" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"/>',
  'practical-life': '<path d="M7 17h22v17H7zM29 20h8c3.3 0 5 2.1 5 5.1S40.3 30 37 30h-8zM12 13V8h12v5M34 9l7 4-2.1 3.6-7-4z"/><path d="M13 22h10M13 27h7" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"/>',
  'writing-fine-motor': '<path d="m9 34 2.4-8.8L32.8 3.8l8.1 8.1-21.4 21.4zM31.1 5.5l8.1 8.1M9 34l8.7-2.3"/><path d="m6 41 6.2-1.7" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"/>',
  'social-emotional': '<path d="M24 40S6.5 30.2 6.5 17.8C6.5 11.9 10.6 8 16 8c3.4 0 6.3 1.8 8 4.5C25.7 9.8 28.6 8 32 8c5.4 0 9.5 3.9 9.5 9.8C41.5 30.2 24 40 24 40z"/>',
  'art-music': '<path d="M24 7.2c10.7 0 18.8 5.2 18.8 12.1 0 5-4.6 8.6-10.8 8.6h-3.2c-2.8 0-4.2 1.2-4.2 3.2 0 1.8 1.2 2.8 2.7 3.6-1 .8-2.4 1.3-4.1 1.3C13.2 36 5.2 29.2 5.2 21 5.2 13.4 13.5 7.2 24 7.2z"/><circle cx="14" cy="19" r="2.1" fill="white"/><circle cx="21" cy="14.5" r="2.1" fill="white"/><circle cx="30" cy="14.5" r="2.1" fill="white"/><circle cx="36" cy="20" r="2.1" fill="white"/>',
  'sensorial-science': '<circle cx="20.5" cy="20.5" r="12.5"/><path d="m30 30 10.5 10.5" fill="none" stroke="white" stroke-width="5" stroke-linecap="round"/><path d="m20.5 14.5 1.8 4.1 4.2.4-3.2 2.8.9 4.2-3.7-2.2-3.7 2.2.9-4.2-3.2-2.8 4.2-.4z" fill="white"/>',
  'movement-outdoor': '<circle cx="29" cy="8" r="5" fill="currentColor"/><path d="M27 14 21 24l9 4 5-8 5 7M22 17l-8 4 3 5M21 24 11 38M30 28l11 8" fill="none" stroke="currentColor" stroke-width="4.8" stroke-linecap="round" stroke-linejoin="round"/>',
  'culture-geography': '<circle cx="24" cy="24" r="18"/><path d="M6 24h36M24 6c5 5.2 7.5 11.2 7.5 18S29 36.8 24 42M24 6c-5 5.2-7.5 11.2-7.5 18S19 36.8 24 42M8.5 15h31M8.5 33h31" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"/>',
  'oral-storytelling': '<path d="M7 9h34v24H22l-9 8v-8H7z"/><path d="M15 17h18M15 23h12" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"/>',
};

let registry = { categories: [], games: [] };

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function assetUrl(path) {
  if (!path) return './assets/hub/placeholder-tile.svg';
  return `./${String(path).replace(/^\.\//, '')}`;
}

function isPlayable(game) {
  return Boolean(game.path) && PLAYABLE_STATUSES.has(game.status);
}

function categoryById(id) {
  return registry.categories.find((category) => category.id === id) || null;
}

function categoryTitle(category) {
  return CATEGORY_LABELS[category.id] || category.title;
}

function gamesForCategory(categoryId) {
  return registry.games
    .filter((game) => game.category === categoryId && isPlayable(game))
    .sort(gameSort);
}

function gameSort(a, b) {
  const statusRank = { live: 0, beta: 1 };
  const statusDelta = (statusRank[a.status] ?? 2) - (statusRank[b.status] ?? 2);
  if (statusDelta) return statusDelta;
  return (a.title || '').localeCompare(b.title || '');
}

function featuredGames() {
  const byId = new Map(registry.games.map((game) => [game.id, game]));
  const chosen = FEATURED_IDS
    .map((id) => byId.get(id))
    .filter((game) => game && isPlayable(game));
  const chosenIds = new Set(chosen.map((game) => game.id));
  const fill = registry.games
    .filter((game) => isPlayable(game) && !chosenIds.has(game.id))
    .sort(gameSort);
  return [...chosen, ...fill].slice(0, Math.max(FEATURED_IDS.length, 10));
}

function tileArt(game, { eager = false } = {}) {
  const art = el('span', 'game-art');
  if (game.iconBg) art.style.backgroundImage = `url("${assetUrl(game.iconBg)}")`;

  const img = el('img');
  img.src = assetUrl(game.icon);
  img.alt = '';
  img.decoding = 'async';
  img.loading = eager ? 'eager' : 'lazy';
  img.draggable = false;
  if (game.iconFit === 'contain' || game.iconBg) img.className = 'contain';
  art.appendChild(img);
  return art;
}

function categoryIcon(id, color) {
  const icon = el('span', 'chip-icon');
  const gradientId = `chip-gradient-${id || 'featured'}`;
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = `<svg class="chip-svg" viewBox="0 0 48 48" focusable="false" aria-hidden="true"><defs><linearGradient id="${gradientId}" x1="7" y1="6" x2="39" y2="42" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#ffffff" stop-opacity=".82"/></linearGradient></defs><g fill="url(#${gradientId})" stroke="rgba(23,81,126,.18)" stroke-width="1.3" stroke-linejoin="round">${CATEGORY_ICONS[id || 'featured'] || CATEGORY_ICONS.featured}</g></svg>`;
  return icon;
}

function renderCategoryNav() {
  const nav = document.getElementById('category-nav');
  nav.textContent = '';

  const featured = featuredGames();
  const featuredChip = categoryChip({
    id: '',
    iconId: 'featured',
    label: 'Featured',
    count: featured.length,
    color: '#6840a6',
  });
  nav.appendChild(featuredChip);

  const categoryRank = new Map(CATEGORY_ORDER.map((id, index) => [id, index]));
  const categories = [...registry.categories]
    .sort((a, b) => (categoryRank.get(a.id) ?? 99) - (categoryRank.get(b.id) ?? 99));
  for (const category of categories) {
    const games = gamesForCategory(category.id);
    if (!games.length) continue;
    nav.appendChild(categoryChip({
      id: category.id,
      iconId: category.id,
      label: categoryTitle(category),
      count: games.length,
      color: category.color || '#2d7dd2',
    }));
  }
}

function categoryChip({ id, iconId, label, count, color }) {
  const button = el('button', 'category-chip');
  button.type = 'button';
  button.dataset.category = id;
  button.style.setProperty('--chip-color', color);
  button.setAttribute('aria-pressed', 'false');

  const icon = categoryIcon(iconId || id, color);
  const title = el('span', 'chip-title');
  title.textContent = label;
  const number = el('span', 'chip-count');
  number.textContent = count;
  number.setAttribute('aria-label', `${count} games`);
  button.append(icon, title, number);
  button.addEventListener('click', () => selectCategory(id));
  return button;
}

function gameCard(game, index, accent) {
  const card = el('a', 'game-card');
  card.href = assetUrl(game.path);
  card.setAttribute('aria-label', game.status === 'beta' ? `${game.title} — beta` : game.title);
  card.dataset.gameId = game.id;
  card.style.setProperty('--card-accent', accent);
  const art = tileArt(game, { eager: index < 10 });
  if (game.status === 'beta') {
    const badge = el('span', 'beta-badge');
    badge.textContent = '🏗️ Beta';
    badge.setAttribute('aria-hidden', 'true');
    art.appendChild(badge);
  }
  card.append(art);

  const label = el('span', 'game-title');
  label.textContent = game.title;
  card.appendChild(label);
  return card;
}

function currentFilter() {
  const value = decodeURIComponent(location.hash.slice(1));
  if (!value || value === 'featured') return '';
  return categoryById(value) ? value : '';
}

function selectedGames() {
  const categoryId = currentFilter();
  return categoryId ? gamesForCategory(categoryId) : featuredGames();
}

function renderGames() {
  const filter = currentFilter();
  const games = selectedGames();
  const grid = document.getElementById('game-grid');
  const empty = document.getElementById('empty-state');
  const count = document.getElementById('game-count');
  const category = filter ? categoryById(filter) : null;
  const cardAccent = category?.color || '#6840a6';

  grid.textContent = '';
  games.forEach((game, index) => grid.appendChild(gameCard(game, index, cardAccent)));
  empty.hidden = games.length > 0;
  count.textContent = `${games.length} ${games.length === 1 ? 'game' : 'games'}`;

  document.querySelectorAll('.category-chip').forEach((chip) => {
    const selected = chip.dataset.category === filter;
    chip.classList.toggle('is-selected', selected);
    chip.setAttribute('aria-pressed', String(selected));
  });

  const heading = document.getElementById('library-title');
  heading.textContent = category ? `${categoryTitle(category)} games` : 'Featured games';
}

function selectCategory(categoryId) {
  const nextHash = categoryId ? `#${encodeURIComponent(categoryId)}` : '';
  if (location.hash === nextHash) {
    renderGames();
    return;
  }
  if (nextHash) location.hash = nextHash;
  else history.replaceState(null, '', `${location.pathname}${location.search}`);
  renderGames();
}

function setupFeatured() {
  const game = registry.games.find((item) => item.id === 'blend-train') || featuredGames()[0];
  if (!game) return;

  const image = document.getElementById('featured-art');
  image.src = assetUrl(game.id === 'blend-train' ? FEATURED_HERO_ART : game.icon);
  image.alt = `${game.title} game artwork`;

  const title = document.getElementById('featured-title');
  title.textContent = game.title;
  document.getElementById('featured-summary').textContent = game.id === 'blend-train'
    ? FEATURED_SUMMARY
    : (game.summary || 'A little game to play, learn, and grow!');

  const play = document.getElementById('featured-play');
  play.href = assetUrl(game.path);
  play.setAttribute('aria-label', `Play ${game.title}`);
}

async function init() {
  registry = await loadRegistry();
  setupFeatured();
  renderCategoryNav();
  renderGames();
  addEventListener('hashchange', renderGames);

  if (!reducedMotion) {
    document.querySelector('.featured')?.classList.add('is-ready');
  }
}

init();
