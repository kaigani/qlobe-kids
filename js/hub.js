// hub.js — the kid-first launcher.
// Loads the registry and renders category sections of game tiles into #games.
// No router, no state — a tile is just a link. Understandable in 5 seconds,
// no reading required: the art is the interface.

import { loadRegistry } from './registry.js';

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

// A playable game: a big tappable link with its art on an accent-colored frame.
function liveTile(game) {
  const a = el('a', 'tile');
  a.href = game.path;
  a.setAttribute('aria-label', game.title);
  if (game.accent) a.style.setProperty('--accent', game.accent);

  const frame = el('span', 'tile-frame');
  const img = el('img');
  img.src = game.icon;
  img.alt = '';
  img.decoding = 'async';
  img.loading = 'lazy';
  img.draggable = false;
  frame.appendChild(img);

  const label = el('span', 'tile-label');
  label.textContent = game.title;

  a.append(frame, label);
  return a;
}

// A game that's still growing — greyed, non-interactive, with a friendly sprout
// badge instead of the words "coming soon".
function soonTile(game) {
  const div = el('div', 'tile tile-soon');
  div.setAttribute('aria-disabled', 'true');
  if (game.accent) div.style.setProperty('--accent', game.accent);

  const frame = el('span', 'tile-frame');
  const img = el('img');
  img.src = game.icon;
  img.alt = '';
  img.draggable = false;
  frame.appendChild(img);

  const badge = el('span', 'tile-badge');
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = '🌱';
  frame.appendChild(badge);

  const label = el('span', 'tile-label');
  label.textContent = game.title;

  div.append(frame, label);
  return div;
}

function tile(game) {
  return game.status === 'live' && game.path ? liveTile(game) : soonTile(game);
}

function section(category, games) {
  const sec = el('section', 'cat');
  sec.setAttribute('aria-label', category.title);

  const header = el('h2', 'cat-title');
  // Decorative for kids, readable for grown-ups.
  header.textContent = category.title;
  sec.appendChild(header);

  const grid = el('div', 'grid');
  games.forEach((g) => grid.appendChild(tile(g)));
  sec.appendChild(grid);
  return sec;
}

function render(root, { categories, games }) {
  root.textContent = '';
  const ordered = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));
  const frag = document.createDocumentFragment();

  for (const cat of ordered) {
    const inCat = games.filter((g) => g.category === cat.id);
    if (inCat.length === 0) continue; // skip empty categories
    frag.appendChild(section(cat, inCat));
  }
  root.appendChild(frag);
}

async function init() {
  const root = document.getElementById('games');
  if (!root) return;
  const registry = await loadRegistry();
  render(root, registry);
}

init();
