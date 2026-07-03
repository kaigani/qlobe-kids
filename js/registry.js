// registry.js — the single source that drives the QLOBE Kids hub.
// Fetches games.json, validates its shape, and always returns something
// renderable. If anything goes wrong, we fall back to the one live game so the
// kid page never shows a blank screen.

// The ten learning categories, in canonical order — used by the fallback so the
// hub still has structure even offline.
const FALLBACK_CATEGORIES = [
  { id: 'reading-phonics',    title: 'Reading & Phonics',                  order: 1, color: '#58a945', emoji: '📖' },
  { id: 'writing-fine-motor', title: 'Writing & Fine Motor',               order: 2 },
  { id: 'math-number-sense',  title: 'Math & Number Sense',                order: 3 },
  { id: 'practical-life',     title: 'Practical Life & Independence',       order: 4 },
  { id: 'sensorial-science',  title: 'Sensorial & Early Science',           order: 5 },
  { id: 'oral-storytelling',  title: 'Oral Language & Storytelling',        order: 6 },
  { id: 'culture-geography',  title: 'Culture, Geography & History',        order: 7 },
  { id: 'art-music',          title: 'Art & Music',                         order: 8 },
  { id: 'movement-outdoor',   title: 'Movement & Outdoor Learning',         order: 9 },
  { id: 'social-emotional',   title: 'Social-Emotional & Self-Regulation',  order: 10 }
];

// The one game that is always available, hardcoded so a fetch failure can never
// leave a child looking at nothing to play.
const FALLBACK_GAMES = [
  {
    id: 'sound-sprouts',
    title: 'Sound Sprouts',
    category: 'reading-phonics',
    path: 'games/sound-sprouts/',
    icon: 'games/sound-sprouts/assets/gen/ui/splash/title.png',
    iconBg: 'games/sound-sprouts/assets/gen/bg.jpg',
    iconFit: 'contain',
    age: { min: 4, max: 6 },
    status: 'live',
    accent: '#58a945',
    uses: [],
    modes: [
      { id: 'guided',   title: 'Make a Word',     skill: 'onset-rime blending' },
      { id: 'mystery',  title: 'Mystery Picture', skill: 'sound-to-letter matching' },
      { id: 'freeplay', title: 'Word Mixer',      skill: 'free phonics exploration' }
    ]
  }
];

function fallback() {
  return { categories: FALLBACK_CATEGORIES, games: FALLBACK_GAMES };
}

/**
 * Load the game registry.
 * @returns {Promise<{categories: Array, games: Array}>}
 */
export async function loadRegistry() {
  try {
    const res = await fetch('./games.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (
      !data ||
      data.schemaVersion !== 1 ||
      !Array.isArray(data.categories) ||
      !Array.isArray(data.games)
    ) {
      throw new Error('unexpected shape');
    }
    return { categories: data.categories, games: data.games };
  } catch (err) {
    console.warn('QLOBE Kids: using fallback registry —', err.message);
    return fallback();
  }
}
