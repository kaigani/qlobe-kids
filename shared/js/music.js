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
let notesScheduled = 0;

const LOOKAHEAD_MS = 25;
const HORIZON_S = 0.14;

export const ready = { loaded: false };

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  return ctx;
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

/** Resume the context from the first user gesture (iOS autoplay policy). */
export function unlock() {
  if (!ctx) ensureCtx();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 1;
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
 * Map band members (array of { instr }) to song parts.
 * Returns per-member assignments: { member, part: 'melody'|'bass'|'chord'|'perc',
 * percSlot } — percussion events round-robin across perc members; the lowest
 * tonal takes bass, a middle one takes chords (3+ tonals), the rest play melody.
 */
export function mapBand(band) {
  const out = band.map((m, i) => ({ index: i, instr: m.instr, part: null, percSlot: 0 }));
  const percs = out.filter((m) => (manifest[m.instr] || {}).role === 'perc');
  const tonals = out.filter((m) => (manifest[m.instr] || {}).role === 'tonal')
    .sort((a, b) => manifest[a.instr].baseMidi - manifest[b.instr].baseMidi);
  percs.forEach((m, i) => { m.part = 'perc'; m.percSlot = i; });
  if (tonals.length === 1) tonals[0].part = 'melody';
  else if (tonals.length === 2) { tonals[0].part = 'bass'; tonals[1].part = 'melody'; }
  else if (tonals.length >= 3) {
    tonals[0].part = 'bass';
    tonals[1].part = 'chord';
    for (let i = 2; i < tonals.length; i++) tonals[i].part = 'melody';
  }
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
        events.push({ beat: swingBeat(beat, song.swing), member: m.index, instr: m.instr, midi: n, durBeats: dur || 1, gain: m.part === 'chord' ? 0.5 : m.part === 'bass' ? 0.85 : 0.9 });
      }
    }
  }
  if (percMembers.length) {
    (song.parts.perc || []).forEach(([beat, hit], i) => {
      const m = percMembers[i % percMembers.length];
      events.push({ beat: swingBeat(beat, song.swing), member: m.index, instr: m.instr, hit, gain: 0.8, durBeats: 0.9 });
    });
  }
  events.sort((a, b) => a.beat - b.beat);
  return events;
}

/**
 * Start a song with a band. cbs.onNote(memberIndex, atCtxTime) fires (via
 * setTimeout, ~on the beat) for visuals; cbs.onLoop() at each loop point.
 * Returns { stop() }.
 */
export function playSong(song, band, cbs = {}) {
  stopSong();
  if (!ctx) ensureCtx();
  const assignments = mapBand(band);
  const events = expandEvents(song, assignments);
  if (!events.length) return { stop() {} };
  const beatDur = 60 / song.bpm;
  const totalBeats = song.beatsPerBar * song.bars;
  const state = {
    song, events, beatDur, totalBeats, cbs,
    startTime: ctx.currentTime + 0.15,
    loopN: 0, nextIdx: 0, timer: 0, timeouts: new Set(),
  };
  current = state;

  const tick = () => {
    if (current !== state) return;
    const horizon = ctx.currentTime + HORIZON_S;
    let guard = 0;
    while (guard++ < 200) {
      if (state.nextIdx >= events.length) {
        state.nextIdx = 0;
        state.loopN += 1;
        if (cbs.onLoop) cbs.onLoop(state.loopN);
      }
      const ev = events[state.nextIdx];
      const t = state.startTime + (state.loopN * totalBeats + ev.beat) * beatDur;
      if (t > horizon) break;
      state.nextIdx += 1;
      if (t < soloUntil) continue;   // spotlight: the band lays out for the solo
      note(ev.instr, ev.midi, { when: t, durBeats: ev.durBeats, bpm: song.bpm, gain: ev.gain, hit: ev.hit });
      if (cbs.onNote) {
        const delay = Math.max(0, (t - ctx.currentTime) * 1000);
        const to = setTimeout(() => { state.timeouts.delete(to); cbs.onNote(ev.member); }, delay);
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

/** Current song beat position (for quantizing solos); null when idle. */
function songNow() {
  if (!current || !ctx) return null;
  const beat = (ctx.currentTime - current.startTime) / current.beatDur;
  return { beat, beatDur: current.beatDur, song: current.song };
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
