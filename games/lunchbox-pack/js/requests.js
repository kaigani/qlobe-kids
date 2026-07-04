// requests.js — pure request/session generation for Lunchbox Pack.
// No DOM, no imports: every export is a plain function over plain data, so the
// round logic is unit-testable in node. game.js consumes makeSession().

export const GROUPS = ['fruit', 'veggie', 'main', 'drink', 'treat'];

export const GROUP_EMOJI = {
  fruit: '🍎',
  veggie: '🥦',
  main: '🥪',
  drink: '🥤',
  treat: '🍪',
};

export const GROUP_COLORS = {
  fruit: '#e0402a',
  veggie: '#3faf4e',
  main: '#f2a03d',
  drink: '#2d7dd2',
  treat: '#8e5bc0',
};

export const COLOR_SWATCH = {
  red: '#e0402a',
  yellow: '#f5c518',
  green: '#3faf4e',
  orange: '#f28a1e',
  purple: '#8e5bc0',
};

// Per-session difficulty ramp for pack mode (round 1 easiest).
const PACK_PLANS = [
  ['food', 'food', 'group'],
  ['food', 'group', 'attr'],
  ['group', 'attr', 'attr'],
];

// Count mode quantities per box, ramping 2 → 5 across the session.
const COUNT_PLANS = [
  [2, 3],
  [3, 4],
  [4, 5],
];

const SHELF_SIZE = 10;
const FAVORITE_WEIGHT = 0.6;
const BOXES_PER_SESSION = 3;

// ---- small utilities ---------------------------------------------------

/** Fisher–Yates shuffle into a new array. */
export function shuffle(arr, rng = Math.random) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Random element (undefined on empty). */
export function pick(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Does a food match an attribute id ('crunchy' or a color name)? */
export function matchesAttr(food, attr) {
  return attr === 'crunchy' ? !!food.crunchy : food.color === attr;
}

/** Is this food one of the character's favorites (group or attr)? */
export function isFavorite(food, character) {
  const fav = character.favorites || { groups: [], attrs: [] };
  return (
    (fav.groups || []).includes(food.group) ||
    (fav.attrs || []).some((a) => matchesAttr(food, a))
  );
}

/**
 * Does `food` satisfy `req` right now? group/attr requests accept ANY matching
 * food that is not already packed. (healthy requests are checked in game.js
 * against the filled-groups meter.)
 */
export function matchesRequest(food, req, packedIds = []) {
  switch (req.type) {
    case 'food':
    case 'count':
      return food.id === req.food;
    case 'group':
      return food.group === req.group && !packedIds.includes(food.id);
    case 'attr':
      return matchesAttr(food, req.attr) && !packedIds.includes(food.id);
    default:
      return false;
  }
}

/** 60% of the time, narrow a pool to the character's favorites (if any). */
function favoredPool(pool, character, rng) {
  if (rng() < FAVORITE_WEIGHT) {
    const fav = pool.filter((f) => isFavorite(f, character));
    if (fav.length) return fav;
  }
  return pool;
}

// ---- box generation ----------------------------------------------------

function makePackBox(character, foods, roundIndex, rng) {
  const plan = PACK_PLANS[Math.min(roundIndex, PACK_PLANS.length - 1)];
  const used = new Set(); // guaranteed-answer foods reserved so far
  const usedGroups = new Set();
  const usedAttrs = new Set();
  const requests = [];
  const guarantees = [];

  for (const type of plan) {
    if (type === 'food') {
      const pool = foods.filter((f) => !used.has(f.id));
      const f = pick(favoredPool(pool, character, rng), rng);
      used.add(f.id);
      guarantees.push(f.id);
      requests.push({ type: 'food', food: f.id, voice: 'req-' + f.id });
    } else if (type === 'group') {
      // any group with an unreserved candidate, not already asked this box
      const options = shuffle(
        GROUPS.filter(
          (g) => !usedGroups.has(g) && foods.some((f) => f.group === g && !used.has(f.id))
        ),
        rng
      );
      let group = options[0];
      if (rng() < FAVORITE_WEIGHT) {
        const fav = options.filter((g) => (character.favorites.groups || []).includes(g));
        if (fav.length) group = fav[0];
      }
      usedGroups.add(group);
      const cands = foods.filter((f) => f.group === group && !used.has(f.id));
      const g = pick(favoredPool(cands, character, rng), rng);
      used.add(g.id);
      guarantees.push(g.id);
      requests.push({ type: 'group', group, voice: 'req-cat-' + group });
    } else {
      // attr: any color present in the data, plus 'crunchy'
      const attrs = [...Object.keys(COLOR_SWATCH), 'crunchy'];
      const options = shuffle(
        attrs.filter(
          (a) => !usedAttrs.has(a) && foods.some((f) => matchesAttr(f, a) && !used.has(f.id))
        ),
        rng
      );
      let attr = options[0];
      if (rng() < FAVORITE_WEIGHT) {
        const fav = options.filter((a) => (character.favorites.attrs || []).includes(a));
        if (fav.length) attr = fav[0];
      }
      usedAttrs.add(attr);
      const cands = foods.filter((f) => matchesAttr(f, attr) && !used.has(f.id));
      const g = pick(cands, rng);
      used.add(g.id);
      guarantees.push(g.id);
      requests.push({ type: 'attr', attr, voice: 'req-attr-' + attr });
    }
  }

  return { character, requests, shelf: buildShelf(foods, guarantees, requests, rng) };
}

function makeHealthyBox(character, foods, rng) {
  const ids = new Set();
  // one guaranteed food per group (weighted toward favorites)
  for (const g of GROUPS) {
    const cands = foods.filter((f) => f.group === g);
    if (cands.length) ids.add(pick(favoredPool(cands, character, rng), rng).id);
  }
  // a second helping of each group where the data has one (free choice)
  for (const g of shuffle(GROUPS, rng)) {
    if (ids.size >= SHELF_SIZE) break;
    const extra = foods.filter((f) => f.group === g && !ids.has(f.id));
    if (extra.length) ids.add(pick(extra, rng).id);
  }
  const rest = shuffle(foods.filter((f) => !ids.has(f.id)), rng);
  while (ids.size < SHELF_SIZE && rest.length) ids.add(rest.pop().id);

  const requests = [{ type: 'healthy', voice: 'mode-healthy' }];
  return { character, requests, shelf: shuffle([...ids], rng) };
}

function makeCountBox(character, foods, roundIndex, rng) {
  const ns = COUNT_PLANS[Math.min(roundIndex, COUNT_PLANS.length - 1)];
  const used = new Set();
  const requests = ns.map((n) => {
    const pool = foods.filter((f) => !used.has(f.id));
    const f = pick(favoredPool(pool, character, rng), rng);
    used.add(f.id);
    return { type: 'count', food: f.id, n, voice: 'req-count-' + n };
  });
  return { character, requests, shelf: buildShelf(foods, [...used], requests, rng) };
}

/**
 * Build a 10-food shelf that always contains every guaranteed answer, plus one
 * extra candidate per group/attr request (so free choice never dead-ends),
 * topped up with random foods and shuffled.
 */
function buildShelf(foods, guarantees, requests, rng) {
  const ids = new Set(guarantees);
  for (const req of requests) {
    if (req.type === 'group' || req.type === 'attr') {
      const extra = foods.filter((f) => !ids.has(f.id) && matchesRequest(f, req));
      if (extra.length) ids.add(pick(extra, rng).id);
    }
  }
  const rest = shuffle(foods.filter((f) => !ids.has(f.id)), rng);
  while (ids.size < SHELF_SIZE && rest.length) ids.add(rest.pop().id);
  return shuffle([...ids], rng);
}

// ---- session -----------------------------------------------------------

/**
 * Build a full session: 3 boxes, characters drawn without repeat.
 * @param {'pack'|'healthy'|'count'} mode
 * @param {{foods: object[], characters: object[]}} data  parsed foods.json
 * @param {() => number} [rng]
 */
export function makeSession(mode, data, rng = Math.random) {
  const chars = shuffle(data.characters, rng).slice(0, BOXES_PER_SESSION);
  const boxes = chars.map((c, i) => {
    if (mode === 'healthy') return makeHealthyBox(c, data.foods, rng);
    if (mode === 'count') return makeCountBox(c, data.foods, i, rng);
    return makePackBox(c, data.foods, i, rng);
  });
  return { mode, boxes };
}
