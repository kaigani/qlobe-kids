// journal.js — the small pile of things a child has collected, remembered.
//
// Sticker books, bug books, rock collections, "my songs": the same shape every
// time — a set of ids the child has earned, in the order they earned them, with
// a little metadata attached to each, surviving a reload. It was written once
// per game (`games/world-music-dance/js/collection.js` is the proven original)
// and it is written here once instead, because ten `observe-journal` stubs in
// the catalogue all want exactly this and none of them should have to get the
// storage failure modes right again.
//
// IT NEVER THROWS INTO THE GAME LOOP
// That is the whole point of the module and the only rule that matters. Safari
// in private mode throws on `setItem`. Some devices throw `QuotaExceededError`.
// A storage partition can be disabled entirely, so even `getItem` throws. A
// previous version of the game can have left a payload this one cannot read.
// Every one of those degrades to an IN-MEMORY store: the child finishes the
// session with a full book and simply starts fresh next time. One `console.info`
// marks the moment for QA; nothing else surfaces, and never to the child.
//
// ONE STORE PER KEY
// `createJournal('bug-hotel-observer')` called from main.js and again from
// journal-ui.js must not produce two records that drift apart, so instances are
// cached by storage key and the second call returns the FIRST journal. Two
// modules therefore share one `onChange` stream, which is the behaviour a game
// would have had to build by hand anyway.
//
// ORDER IS EARNED ORDER
// `all()` returns entries oldest-first by an explicit monotonic `seq`, not by
// object key order and not by `at` (two stickers earned in the same millisecond
// are common in a celebration sweep). `seq` is persisted, so the order survives
// a reload.

/** key -> journal, so a second createJournal for the same game shares state. */
const INSTANCES = new Map();

const KEY_PREFIX = 'qlobe:journal:';

/**
 * @typedef {object} JournalEntry
 * @property {string} id       the collected thing
 * @property {number} at       ms epoch when it was first added
 * @property {number} seq      monotonic order, 1-based
 * @property {string} [mode]   which mode earned it (games pass this in `meta`)
 */

/**
 * Open (or re-open) a persisted collection.
 *
 * @param {string} gameId              e.g. 'bug-hotel-observer'
 * @param {object} [opts]
 * @param {number} [opts.version=1]    bump to invalidate an old payload shape
 * @returns {object} the journal
 */
export function createJournal(gameId, { version = 1 } = {}) {
  const id = String(gameId || '').trim();
  if (!id) throw new TypeError('createJournal: gameId is required');
  const v = Number.isFinite(Number(version)) && Number(version) > 0 ? Math.floor(Number(version)) : 1;
  const KEY = `${KEY_PREFIX}${id}:v${v}`;

  const existing = INSTANCES.get(KEY);
  if (existing) return existing;

  /** Set once any storage call throws — after that we stop trying. */
  let memoryOnly = false;
  /** The authoritative in-process copy; localStorage is only the mirror. */
  let state = null;
  const subs = [];

  const blank = () => ({ version: v, seq: 0, items: {} });

  function warnOnce(why) {
    if (memoryOnly) return;
    memoryOnly = true;
    // Exactly one line, at info level: QA needs the signal, the child never
    // sees anything, and a five-year-old's session is not interrupted.
    try { console.info(`[journal] ${KEY} is memory-only for this session (${why})`); } catch { /* no console */ }
  }

  /**
   * Anything at all can be in localStorage — an old shape, a truncated write, a
   * different game's payload after a key collision. Rebuild a clean record from
   * whatever is recognisable and silently drop the rest.
   */
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return blank();
    if (Number(raw.version) !== v) return blank();
    const src = raw.items && typeof raw.items === 'object' && !Array.isArray(raw.items) ? raw.items : {};
    const out = blank();
    let maxSeq = 0;
    for (const [key, value] of Object.entries(src)) {
      const eid = String(key || '');
      if (!eid || !value || typeof value !== 'object') continue;
      const seq = Number.isFinite(Number(value.seq)) && Number(value.seq) > 0 ? Math.floor(Number(value.seq)) : 0;
      const at = Number.isFinite(Number(value.at)) ? Number(value.at) : 0;
      out.items[eid] = { ...value, id: eid, at, seq };
      if (seq > maxSeq) maxSeq = seq;
    }
    // A payload written before `seq` existed, or one whose seqs were lost, is
    // renumbered in `at` order so `all()` still reads as earned order.
    const unseq = Object.values(out.items).filter((e) => !e.seq).sort((a, b) => a.at - b.at);
    for (const e of unseq) e.seq = ++maxSeq;
    out.seq = maxSeq;
    return out;
  }

  /**
   * A payload we cannot parse and a storage we cannot reach are DIFFERENT
   * failures and must not share a fallback. Unreadable storage is permanent for
   * the session; unreadable JSON is just garbage in a writable slot, so the
   * record starts blank and persistence keeps working — the next sticker
   * overwrites the garbage. Conflating the two would silently cost a child
   * every future session over one truncated write.
   */
  function load() {
    if (state) return state;
    if (memoryOnly) { state = blank(); return state; }
    let raw = null;
    try {
      raw = window.localStorage.getItem(KEY);
    } catch {
      state = blank();
      warnOnce('read failed');
      return state;
    }
    if (!raw) { state = blank(); return state; }
    try {
      state = normalize(JSON.parse(raw));
    } catch {
      state = blank();
      try { console.info(`[journal] ${KEY} held an unreadable payload; starting fresh`); } catch { /* no console */ }
    }
    return state;
  }

  function save() {
    if (memoryOnly || !state) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Quota, private mode, or a disabled storage partition. Keep playing.
      warnOnce('write failed');
    }
  }

  /** A defensive copy — a caller that mutates what it gets back cannot corrupt
   *  the record, which matters because the sticker grid holds these for a whole
   *  screen's lifetime. */
  const copy = (e) => (e ? { ...e } : null);

  function emit(event, entry) {
    const snapshot = journal.all();
    for (const cb of subs.slice()) {
      try { cb(snapshot, { event, entry: copy(entry) }); } catch (err) {
        console.warn('[journal] onChange threw', err);
      }
    }
  }

  const journal = {
    /** The localStorage key, for QA and for a grown-up "forget everything". */
    get key() { return KEY; },
    get gameId() { return id; },
    get version() { return v; },
    /** True when persistence is unavailable — a QA signal, never a game rule. */
    get memoryOnly() { load(); return memoryOnly; },

    /** @param {string} entryId */
    has(entryId) {
      const k = String(entryId ?? '');
      return !!(k && load().items[k]);
    },

    /**
     * Add one thing. IDEMPOTENT: re-adding something already owned changes
     * nothing and returns false, so a double-tap or a replayed round cannot
     * reorder the book or bump a timestamp.
     *
     * @param {string} entryId
     * @param {object} [meta]   merged into the entry (`mode`, `room`, `round`…)
     * @returns {boolean} true only if this was new
     */
    add(entryId, meta) {
      const k = String(entryId ?? '');
      if (!k) return false;
      const s = load();
      if (s.items[k]) return false;
      const extra = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
      const entry = {
        ...extra,
        id: k,
        at: Number.isFinite(Number(extra.at)) ? Number(extra.at) : Date.now(),
        seq: ++s.seq,
      };
      s.items[k] = entry;
      save();
      emit('add', entry);
      return true;
    },

    /** @returns {?JournalEntry} a copy, or null */
    get(entryId) {
      const k = String(entryId ?? '');
      return k ? copy(load().items[k]) : null;
    },

    /** @returns {JournalEntry[]} oldest-first, all copies */
    all() {
      return Object.values(load().items)
        .sort((a, b) => (a.seq - b.seq) || (a.at - b.at))
        .map((e) => ({ ...e }));
    },

    count() { return Object.keys(load().items).length; },

    /** Wipe the book. The debug surface and a future grown-up settings screen. */
    clear() {
      state = blank();
      if (!memoryOnly) {
        try { window.localStorage.removeItem(KEY); } catch { warnOnce('remove failed'); }
      }
      emit('clear', null);
      return true;
    },

    /**
     * @param {(all: JournalEntry[], info: {event: string, entry: ?JournalEntry}) => void} cb
     * @returns {() => void} unsubscribe
     */
    onChange(cb) {
      if (typeof cb !== 'function') return () => {};
      subs.push(cb);
      return () => { const i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); };
    },
  };

  INSTANCES.set(KEY, journal);
  return journal;
}

/** The key a given game's journal lives at, without opening it. */
export function journalKey(gameId, version = 1) {
  return `${KEY_PREFIX}${String(gameId || '')}:v${version}`;
}
