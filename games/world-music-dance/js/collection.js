// collection.js — which dance cards the child has pinned home.
//
// The only persistent state this game has. localStorage, one JSON blob, no
// accounts, no network. Private-browsing Safari throws on setItem and some
// devices throw QuotaExceededError, so every access is wrapped and a failure
// degrades to an in-memory store: the child still finishes the session with a
// full map, they just start fresh next time. Never let a storage error reach
// the game loop.

const KEY = 'qlobe:world-music-dance:v1';
const VERSION = 1;

/** Set once a storage call throws — after that we stop trying to write. */
let memoryOnly = false;
/** The authoritative in-process copy; localStorage is the mirror. */
let state = null;

function blank() {
  return { version: VERSION, placed: {} };
}

function normalize(raw) {
  if (!raw || typeof raw !== 'object') return blank();
  const placed = {};
  const source = raw.placed && typeof raw.placed === 'object' ? raw.placed : {};
  for (const [id, value] of Object.entries(source)) {
    if (typeof id === 'string' && id && value) placed[id] = true;
  }
  return { version: VERSION, placed };
}

function load() {
  if (state) return state;
  if (memoryOnly) { state = blank(); return state; }
  try {
    const raw = window.localStorage.getItem(KEY);
    state = raw ? normalize(JSON.parse(raw)) : blank();
  } catch {
    memoryOnly = true;
    state = blank();
  }
  return state;
}

function save() {
  if (memoryOnly || !state) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Quota, private mode, or a disabled storage partition. Keep playing.
    memoryOnly = true;
  }
}

/** A defensive copy of the whole record: `{ version, placed: {id: true} }`. */
export function get() {
  const current = load();
  return { version: current.version, placed: { ...current.placed } };
}

/** Mark a culture's card as pinned home. Returns true if this was new. */
export function place(id) {
  if (typeof id !== 'string' || !id) return false;
  const current = load();
  if (current.placed[id]) return false;
  current.placed[id] = true;
  save();
  return true;
}

export function isPlaced(id) {
  return Boolean(load().placed[id]);
}

export function count() {
  return Object.keys(load().placed).length;
}

/** Wipe the collection (debug surface + a future grown-up settings screen). */
export function reset() {
  state = blank();
  if (!memoryOnly) {
    try { window.localStorage.removeItem(KEY); } catch { memoryOnly = true; }
  }
}

/** True when persistence is unavailable (private mode, quota) — QA signal. */
export function isMemoryOnly() {
  load();
  return memoryOnly;
}

export const STORAGE_KEY = KEY;
