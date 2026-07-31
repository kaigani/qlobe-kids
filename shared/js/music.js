// music.js — WebAudio band engine for instrument-sample games.
//
// Loads the shared instrument library (shared/assets/instruments/ — one
// sustained note per tonal instrument, hit pairs for percussion) and turns it
// into a band: any 2–5 instruments map onto a song's melody/bass/chord/perc
// parts, notes are pitch-shifted from each sample's measured baseMidi via
// playbackRate, and every part is OCTAVE-FOLDED into its instrument's natural
// register (so a mis-measured octave or an odd band mix still sounds right —
// octaves are consonant, chipmunk shifts are not).
//
// Song data (lives in game configs):
//   { id, title, bpm, beatsPerBar, bars, swing?: 0..1, scale: [midi...],
//     parts: { melody: [[beat, midi, durBeats]...],
//              bass:   [[beat, midi, durBeats]...],
//              chord:  [[beat, [midis], durBeats]...],
//              perc:   [[beat, 'a'|'b']...] } }
// Beats are 0-based across the whole song (bar 2 beat 1 = beatsPerBar + 1)
// and may be fractional. Songs loop until stop().
//
// iOS/autoplay: the AudioContext is created suspended at init; call unlock()
// from the first user gesture (alongside sfx/speech unlocks).

let ctx = null;
let master = null;
let manifest = null;
let buffers = {};        // instr -> [AudioBuffer]
let baseUrl = '';
let muted = false;
let duckGain = 1;        // duck() target — persists across mute toggles
let notesScheduled = 0;
let selfHealAttached = false;

const LOOKAHEAD_MS = 25;
const HORIZON_S = 0.14;
// How far past its last lookahead horizon the scheduler has to be before a wake
// re-anchors the song. Comfortably above a few missed lookahead ticks and normal
// main-thread jank, well under the ~1s a throttled background tab drifts.
const BACKLOG_S = 0.35;

export const ready = { loaded: false };

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    attachSelfHeal();
  }
  return ctx;
}

// iPadOS parks the context on 'interrupted' (non-standard) after a call, Siri,
// or another app taking the audio session, and on 'suspended' when the page is
// backgrounded — neither recovers on its own, so resume on anything that isn't
// 'running'. Once the resume lands, re-anchor only if the scheduler is actually
// behind (below): every wake path funnels through here, so this is the single
// place a song gets re-anchored.
function resumeCtx() {
  if (!ctx) return;
  if (ctx.state === 'running') { reanchorIfBehind(); return; }
  const p = ctx.resume();
  if (p && typeof p.then === 'function') p.then(reanchorIfBehind, () => {});
  else reanchorIfBehind();
}

// A song that was parked (or whose lookahead timer was throttled by a hidden
// tab) can come back holding events whose time has already passed; scheduling
// them dumps a bar of music into one chord. Skip to the next event still ahead
// of the horizon instead — but ONLY then. A plain resume (the statechange
// listener fires on every one) usually leaves no backlog at all, because a
// suspended context's currentTime stops with it and the song's timeline is in
// context time; re-anchoring anyway would throw away the HORIZON_S of notes
// sitting in front of the playhead each time.
function reanchorIfBehind() {
  if (!current || !ctx || ctx.state !== 'running') return;
  if (ctx.currentTime - current.horizon > BACKLOG_S) resync(current);
}

// Attached once, with the context: recover as soon as the page is back in
// front, so the band plays again before the next touch rather than because
// of it.
function attachSelfHeal() {
  if (selfHealAttached) return;
  selfHealAttached = true;
  const wake = () => resumeCtx();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  window.addEventListener('pageshow', wake);
  // catches an interruption that happens while the page stays foregrounded
  if (ctx.addEventListener) {
    ctx.addEventListener('statechange', () => { if (!document.hidden) wake(); });
  }
}

/** Load the instrument manifest + decode every sample. Never rejects. */
export async function init(manifestUrl) {
  try {
    baseUrl = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
    manifest = await (await fetch(manifestUrl)).json();
    ensureCtx();
    await Promise.all(Object.entries(manifest).map(async ([id, def]) => {
      buffers[id] = await Promise.all(def.files.map(async (f) => {
        const ab = await (await fetch(baseUrl + f.file)).arrayBuffer();
        return ctx.decodeAudioData(ab);
      }));
    }));
    ready.loaded = true;
  } catch { manifest = manifest || {}; }
}

/** Resume the context — cheap, call from every user gesture (iOS autoplay policy). */
export function unlock() {
  if (!ctx) ensureCtx();
  resumeCtx();
}

export function setMuted(m) {
  muted = m;
  if (master) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.value = m ? 0 : duckGain;
  }
}

/**
 * Duck the whole music bus (e.g. under a spoken line) and restore it:
 * duck(0.25) before the voice, duck(1) after. Ramps over `ms`; respects
 * setMuted (a muted bus stays silent, but the level is remembered).
 */
export function duck(level = 1, ms = 200) {
  duckGain = Math.max(0, Math.min(1, level));
  if (!master || muted) return;
  const g = master.gain;
  const now = ctx.currentTime;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(duckGain, now + Math.max(0.01, ms / 1000));
}

export function instrumentIds() { return Object.keys(manifest || {}); }
export function instrumentDef(id) { return manifest && manifest[id]; }
export function stats() { return { notesScheduled, playing: !!current }; }

/** QA hook: an AnalyserNode fed from the master bus (proves audio renders). */
export function attachAnalyser() {
  ensureCtx();
  const an = ctx.createAnalyser();
  an.fftSize = 2048;
  master.connect(an);
  return an;
}

// Fold a target midi note into the octave closest to the instrument's own
// register — keeps playbackRate within ~±6 semitones of 1.0.
function fold(midi, base) {
  return midi + 12 * Math.round((base - midi) / 12);
}

/**
 * Play one note (or percussion hit). `when` is an absolute ctx time (0 = now).
 * Tonal: midi target, folded to register unless opts.noFold. Perc: hit 'a'|'b'.
 */
export function note(instr, midi, { when = 0, durBeats = 1, bpm = 100, gain = 1, hit = 'a', noFold = false } = {}) {
  const def = manifest && manifest[instr];
  if (!def || !ctx || !buffers[instr]) return;
  const t = Math.max(ctx.currentTime, when || ctx.currentTime);
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  src.connect(g);
  g.connect(master);

  let dur;
  if (def.role === 'tonal') {
    src.buffer = buffers[instr][0];
    const target = noFold ? midi : fold(midi, def.baseMidi);
    src.playbackRate.value = Math.pow(2, (target - def.baseMidi) / 12);
    dur = Math.min((60 / bpm) * durBeats, src.buffer.duration / src.playbackRate.value);
  } else {
    const idx = hit === 'b' && buffers[instr].length > 1 ? 1 : 0;
    src.buffer = buffers[instr][idx];
    // long texture samples (e.g. maracas shakes) get gated to the beat
    dur = Math.min(src.buffer.duration, Math.max(0.28, (60 / bpm) * durBeats));
  }
  const a = 0.008, r = 0.09;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + a);
  g.gain.setValueAtTime(gain, t + Math.max(a, dur - r));
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  src.start(t);
  src.stop(t + dur + 0.05);
  notesScheduled += 1;
}

// --- band → parts mapping ---------------------------------------------------------

/**
 * Map band members (array of { instr }) to song parts, arrangement-aware.
 * A song may declare `lead: 'keys'|'wind'|'strings'|'perc'` — the melody goes
 * to ONE instrument (preferring the lead family), the remaining tonals take
 * bass (lowest) and chord pads at reduced gain, and a perc-led song boosts
 * percussion while trimming the tune. This is what makes the same band sound
 * keyboard-led on one song and drum-driven on another.
 */
export function mapBand(band, song) {
  const lead = song && song.lead;
  const fam = (m) => (manifest[m.instr] || {}).family;
  const out = band.map((m, i) => ({ index: i, instr: m.instr, part: null, percSlot: 0, gain: 1 }));
  const percs = out.filter((m) => (manifest[m.instr] || {}).role === 'perc');
  const tonals = out.filter((m) => (manifest[m.instr] || {}).role === 'tonal')
    .sort((a, b) => manifest[a.instr].baseMidi - manifest[b.instr].baseMidi);

  percs.forEach((m, i) => { m.part = 'perc'; m.percSlot = i; m.gain = lead === 'perc' ? 1.0 : 0.8; });
  if (!tonals.length) return out;

  // one melody carrier: the song's lead family if present, else the highest voice
  let melody = (lead && lead !== 'perc') ? tonals.find((m) => fam(m) === lead) : null;
  if (!melody) melody = tonals[tonals.length - 1];
  melody.part = 'melody';
  melody.gain = lead === 'perc' ? 0.7 : 1.0;

  const rest = tonals.filter((m) => m !== melody);   // still sorted low→high
  if (rest.length) { rest[0].part = 'bass'; rest[0].gain = 0.8; }
  for (let i = 1; i < rest.length; i++) { rest[i].part = 'chord'; rest[i].gain = 0.45; }
  return out;
}

// --- song scheduler ---------------------------------------------------------------

let current = null;   // { song, events, startTime, nextIdx, timer, cbs, loop }
let soloUntil = 0;    // ctx time: while in the future, song notes are muted so
                      // a tapped solo plays as a true spotlight

function swingBeat(beat, swing) {
  // push the off-beat eighths late for a jazzy feel
  const frac = beat % 1;
  if (swing && Math.abs(frac - 0.5) < 0.01) return beat + swing * 0.17;
  return beat;
}

function expandEvents(song, assignments) {
  const events = [];
  const percMembers = assignments.filter((m) => m.part === 'perc');
  for (const m of assignments) {
    if (!m.part) continue;
    if (m.part === 'perc') continue;   // handled below (round-robin)
    const part = song.parts[m.part] || [];
    for (const ev of part) {
      const [beat, val, dur] = ev;
      const notes = Array.isArray(val) ? val : [val];
      for (const n of notes) {
        events.push({ beat: swingBeat(beat, song.swing), member: m.index, instr: m.instr, midi: n, durBeats: dur || 1, gain: m.gain });
      }
    }
  }
  if (percMembers.length) {
    (song.parts.perc || []).forEach(([beat, hit], i) => {
      const m = percMembers[i % percMembers.length];
      events.push({ beat: swingBeat(beat, song.swing), member: m.index, instr: m.instr, hit, gain: m.gain, durBeats: 0.9 });
    });
  }
  events.sort((a, b) => a.beat - b.beat);
  return events;
}

/**
 * Start a song with a band. cbs.onNote(memberIndex, atCtxTime, event) fires (via
 * setTimeout, ~on the beat) for visuals; cbs.onLoop() at each loop point.
 * Returns { stop() }.
 */
export function playSong(song, band, cbs = {}) {
  stopSong();
  if (!ctx) ensureCtx();
  const assignments = mapBand(band, song);
  const events = expandEvents(song, assignments);
  if (!events.length) return { stop() {} };
  const beatDur = 60 / song.bpm;
  const totalBeats = song.beatsPerBar * song.bars;
  const state = {
    song, events, beatDur, totalBeats, cbs,
    startTime: ctx.currentTime + 0.15,
    // horizon: how far ahead the last tick scheduled — how far behind we are
    // after a park or a throttled timer is measured against it
    loopN: 0, nextIdx: 0, timer: 0, timeouts: new Set(), horizon: ctx.currentTime,
  };
  current = state;

  const tick = () => {
    if (current !== state) return;
    const horizon = ctx.currentTime + HORIZON_S;
    state.horizon = horizon;
    let guard = 0;
    while (guard++ < 200) {
      if (!state.events.length) return;
      if (state.nextIdx >= state.events.length) {
        state.nextIdx = 0;
        state.loopN += 1;
        if (cbs.onLoop) cbs.onLoop(state.loopN);
      }
      const ev = state.events[state.nextIdx];
      const t = state.startTime + (state.loopN * totalBeats + ev.beat) * beatDur;
      if (t > horizon) break;
      state.nextIdx += 1;
      if (t < soloUntil) continue;          // spotlight: the band lays out for the solo
      if (mutedMembers.has(ev.member)) continue;   // sitting on their chair
      note(ev.instr, ev.midi, { when: t, durBeats: ev.durBeats, bpm: song.bpm, gain: ev.gain, hit: ev.hit });
      if (cbs.onNote) {
        const delay = Math.max(0, (t - ctx.currentTime) * 1000);
        const visualEvent = { ...ev, bpm: song.bpm, atContextTime: t, loop: state.loopN };
        const to = setTimeout(() => {
          state.timeouts.delete(to);
          cbs.onNote(ev.member, t, visualEvent);
        }, delay);
        state.timeouts.add(to);
      }
    }
  };
  state.timer = setInterval(tick, LOOKAHEAD_MS);
  tick();
  return { stop: stopSong };
}

export function stopSong() {
  if (!current) return;
  clearInterval(current.timer);
  current.timeouts.forEach(clearTimeout);
  current = null;
}

// --- live band changes -----------------------------------------------------------

const mutedMembers = new Set();

/** Sit a member down (their scheduled events are skipped) or stand them up. */
export function setMemberMuted(index, muted) {
  if (muted) mutedMembers.add(index);
  else mutedMembers.delete(index);
}
export function clearMemberMutes() { mutedMembers.clear(); }
export function mutedMemberCount() { return mutedMembers.size; }

// Point the scheduler at the first event past its lookahead horizon, keeping the
// song's own timeline (startTime/beatDur) intact. Anything already scheduled sits
// before that horizon, so nothing double-fires and nothing overdue back-fires.
function resync(state) {
  const beatPos = (ctx.currentTime + HORIZON_S - state.startTime) / state.beatDur;
  // The song hasn't started yet (playSong anchors startTime 0.15s out, and a
  // context parked between the two can leave the horizon further back still):
  // the first event is already the next one. Wrapping a negative position would
  // land near the END of the loop, miss every event, and skip a whole loop.
  if (beatPos < 0) { state.loopN = 0; state.nextIdx = 0; return; }

  const prevLoop = state.loopN;
  const within = ((beatPos % state.totalBeats) + state.totalBeats) % state.totalBeats;
  state.loopN = Math.floor(beatPos / state.totalBeats);
  const idx = state.events.findIndex((e) => e.beat >= within);
  if (idx >= 0) state.nextIdx = idx;
  else { state.nextIdx = 0; state.loopN += 1; }
  // resync owns the wrap here, so tick's own loop branch won't fire for it —
  // tell the visuals about it instead of swallowing the loop point.
  if (state.loopN !== prevLoop && state.cbs && state.cbs.onLoop) state.cbs.onLoop(state.loopN);
}

/**
 * Swap the band mid-song without dropping the beat: recompute the lead-aware
 * assignments + event list for the CURRENT song and resync the scheduler to
 * just past its lookahead horizon (so nothing already scheduled double-fires).
 */
export function updateBand(band) {
  if (!current || !ctx) return;
  const song = current.song;
  const assignments = mapBand(band, song);
  current.events = expandEvents(song, assignments);
  resync(current);
}

/** Current song beat position (for quantizing solos); null when idle. */
export function songNow() {
  if (!current || !ctx) return null;
  const beat = (ctx.currentTime - current.startTime) / current.beatDur;
  const totalBeats = current.totalBeats;
  const loopBeat = ((beat % totalBeats) + totalBeats) % totalBeats;
  return {
    beat, loopBeat, totalBeats, beatDur: current.beatDur,
    bpm: current.song.bpm, contextTime: ctx.currentTime, song: current.song,
  };
}

/**
 * A little quantized solo: a pentatonic run on the song's scale starting at
 * the next beat (or immediately when no song is playing). Returns the solo
 * duration in ms so callers can time an animation.
 */
export function soloRiff(instr, fallbackSong) {
  const def = manifest && manifest[instr];
  if (!def || !ctx) return 0;
  const nowInfo = songNow();
  const song = nowInfo ? nowInfo.song : fallbackSong;
  const scale = (song && song.scale) || [60, 62, 64, 67, 69];
  const beatDur = nowInfo ? nowInfo.beatDur : 60 / ((song && song.bpm) || 104);
  const startBeatOffset = nowInfo ? Math.ceil(nowInfo.beat + 0.05) - nowInfo.beat : 0.05;
  const start = ctx.currentTime + startBeatOffset * beatDur;

  const stepDur = beatDur / 2;
  const n = 6;
  // mute the rest of the band for the duration of the riff (+ a short tail so
  // the re-entry lands on a beat, not mid-phrase)
  soloUntil = Math.max(soloUntil, start + n * stepDur + stepDur * 0.5);
  let idx = Math.floor(Math.random() * scale.length);
  for (let i = 0; i < n; i++) {
    const t = start + i * stepDur;
    if (def.role === 'perc') {
      note(instr, 0, { when: t, durBeats: 0.5, bpm: 60 / beatDur, gain: 0.95, hit: i % 2 ? 'b' : 'a' });
    } else {
      idx = Math.max(0, Math.min(scale.length - 1, idx + (Math.floor(Math.random() * 3) - 1)));
      const midi = i === n - 1 ? scale[0] + 12 : scale[idx];   // land somewhere sweet
      note(instr, midi, { when: t, durBeats: 0.6, bpm: 60 / beatDur, gain: 0.95 });
    }
  }
  return Math.round((startBeatOffset * beatDur + n * stepDur) * 1000);
}

/** One preview note (build screen tap): the instrument's own base pitch. */
export function preview(instr) {
  const def = manifest && manifest[instr];
  if (!def) return;
  unlock();
  if (def.role === 'perc') {
    note(instr, 0, { durBeats: 1, bpm: 100, gain: 1, hit: 'a' });
    note(instr, 0, { when: ctx.currentTime + 0.28, durBeats: 1, bpm: 100, gain: 1, hit: 'b' });
  } else {
    note(instr, def.baseMidi, { durBeats: 2, bpm: 100, gain: 1, noFold: true });
  }
}
