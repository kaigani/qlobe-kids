import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as speech from '../../../shared/js/speech.js';
import * as voice from '../../../shared/js/voice-clips.js';
import { onTap } from '../../../shared/js/tap.js';
import { installUnlockOnGesture } from '../../../shared/js/audio-unlock.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createTimers } from '../../../shared/js/timers.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';

const $ = (s) => document.querySelector(s);
const els = {
  splash: $('#splash'),
  play: $('#play'),
  celebrate: $('#celebrate'),
  cards: $('#mode-cards'),
  back: $('#back'),
  sound: $('#sound'),
  celebrateBack: $('#celebrate-back'),
  rail: $('#step-rail'),
  promptCard: $('#prompt-card'),
  promptIcon: $('#prompt-icon'),
  promptText: $('#prompt-text'),
  board: $('#board'),
  slotsEl: $('#slots'),
  tray: $('#tray'),
  playBtn: $('#play-btn'),
  slower: $('#slower'),
  faster: $('#faster'),
  tempoLabel: $('#tempo-label'),
  clearBtn: $('#clear-btn'),
  ribbon: $('#ribbon'),
  stars: $('#stars'),
  celebrateBoardWrap: $('#celebrate-board-wrap'),
  recap: $('#recap'),
  again: $('#again'),
  choose: $('#choose'),
  confetti: $('#confetti'),
};

const BEAD_ORDER = ['red','yellow','blue','purple','teal','coral'];
const BPM_MIN = 72, BPM_MAX = 168, BPM_STEP = 18;
const SLOT_COUNT = 8;
const SLOT_RADIUS_PCT = 36; // percent of board to center of slot

let state = {
  mode: null,
  roundIndex: 0,
  rounds: [],
  boardSlots: Array(SLOT_COUNT).fill(null), // bead key or null
  expected: [], // expected fill order for guided
  nextFillIdx: 0,
  bpm: 108,
  playing: false,
  completed: 0,
  seedVal: null,
  rng: Math.random,
  muted: false,
  timers: createTimers(),
  sequenceTimer: null,
  idleTimer: null,
};

let audioCtx = null;
let teardown = [];

function hexFor(k){
  const map={red:'#e85a4a', yellow:'#f6d24a', blue:'#5aa8e8', purple:'#9b7ed8', teal:'#58c4b8', coral:'#f08a6a'};
  return map[k]||'#ccc';
}

function ensureAudio(){
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext||window.webkitAudioContext)(); } catch {}
  }
  if (audioCtx && audioCtx.state==='suspended') audioCtx.resume();
}

function playTone(hz, dur=0.32){
  ensureAudio();
  if (!audioCtx) { sfx.pop(); return; }
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filt = audioCtx.createBiquadFilter();
  filt.type='lowpass'; filt.frequency.value=3800;
  osc.type='sine';
  osc.frequency.value=hz;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.45, now+0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now+dur);
  osc.connect(filt); filt.connect(gain); gain.connect(audioCtx.destination);
  osc.start(now); osc.stop(now+dur+0.05);
}

function playBeadSound(key){
  const bead = config.beads[key];
  if (!bead) { sfx.pop(); return; }
  playTone(bead.hz, key==='red' ? 0.38 : 0.32);
  if (key==='yellow') sfx.sparkle();
}

function unlockAudio(){
  sfx.unlock(); speech.unlock(); voice.unlock(); ensureAudio();
  if (audioCtx) audioCtx.resume();
}

function press(el, action){
  return onTap(el, action, { feedback: () => { unlockAudio(); sfx.tick(); } });
}

installUnlockOnGesture({
  extra: () => unlockAudio(),
  onFirst: () => say('welcome', config.voice.welcome),
});

function say(key, fallback){
  if (state.muted) return;
  const text = fallback || (config.voice && config.voice[key]) || key;
  // try voice clips first if manifest exists
  // fallback to speech
  if (voice.say) {
    try { voice.say(key, text); } catch {}
  }
  // always have speech fallback if voice not ready
  // Use speech.speak as secondary after a tiny delay to avoid double
  // Prefer voice clips; speech will be fallback if no clip.
  // If voice clips manifest not loaded, just use speech
  if (!voice.clipInfo || !voice.clipInfo(key)) {
    speech.speak(text);
  }
}

function setPrompt(key, icon='🔮'){
  const text = (config.voice && config.voice[key]) || key;
  els.promptText.textContent = text;
  els.promptIcon.textContent = icon;
  els.promptCard.dataset.voiceKey = key;
}

function buildSplash(){
  els.cards.innerHTML='';
  const modes = config.modes;
  modes.forEach(m=>{
    const card = document.createElement('button');
    card.className='mode-card';
    card.dataset.mode=m.id;
    card.setAttribute('data-target', `mode-${m.id}`);
    card.setAttribute('aria-label', m.title);
    const accent = m.accent || config.theme.accent;
    card.innerHTML=`
      <span class="mode-card-accent" style="background:${accent}"></span>
      <div class="mode-card-preview" aria-hidden="true">${previewFor(m)}</div>
      <div class="mode-card-title">${m.title}</div>
      <div class="mode-card-skill">${m.skill}</div>
      <span class="mode-card-go">Play ▶</span>`;
    const disp = press(card, ()=> startMode(m.id));
    teardown.push(disp);
    els.cards.appendChild(card);
  });
}

function previewFor(mode){
  // show tiny beads as example
  const seq = mode.patterns ? mode.patterns[0].sequence.slice(0,4) : ['red','yellow','blue','purple'];
  return seq.map(k=>`<img src="${config.beads[k].art}" alt="" loading="eager" onerror="this.style.background='${hexFor(k)}';this.style.borderRadius='50%'">`).join('');
}

function showScreen(name){
  ['splash','play','celebrate'].forEach(id=>{
    const el = els[id==='splash'? 'splash' : id==='play' ? 'play' : 'celebrate'];
    if (id===name) el.hidden=false; else el.hidden=true;
  });
  // home invariant: only splash has home link
}

function buildSlots(){
  els.slotsEl.innerHTML='';
  const n = SLOT_COUNT;
  const boardRect = els.board.getBoundingClientRect();
  const size = Math.min(boardRect.width, boardRect.height) || 520;
  // center
  const cx = 50, cy=50;
  for (let i=0;i<n;i++){
    const angle = -90 + (360/n)*i; // start at top
    const rad = Math.PI*angle/180;
    const r = SLOT_RADIUS_PCT;
    const x = cx + Math.cos(rad)*r;
    const y = cy + Math.sin(rad)*r;
    const slot = document.createElement('button');
    slot.className='slot empty';
    slot.dataset.index=i;
    slot.setAttribute('aria-label', `slot ${i+1}`);
    slot.setAttribute('data-target', `slot-${i}`);
    slot.style.left = x+'%';
    slot.style.top = y+'%';
    // hit handlers (drag-over highlight is owned by createDragToSlotDom's hoverClass)
    const tapDisp = onTap(slot, ()=> handleSlotTap(i));
    teardown.push(tapDisp);
    els.slotsEl.appendChild(slot);
  }
}

// Drag: shared/js/stage/drag-to-slot-dom.js — owns the pointerdown -> move ->
// up/cancel lifecycle, slot hit testing, and the "pointercancel is never a
// drop" rule (iPadOS palm rejection can fire pointercancel with coordinates
// over a slot; committing that as a placement would put a bead the child
// never chose).
const beadDrag = createDragToSlotDom({
  getPiece: (key) => els.tray.querySelector(`[data-bead="${key}"]`),
  slotSelector: '.slot',
  hoverClass: 'drag-over',
  ghostOn: 'press',
  slop: 10,
  canStart: () => !state.playing,
  makeGhost: (piece, record) => {
    const key = record.id;
    const ghost = document.createElement('div');
    ghost.style.width='86px';
    ghost.style.height='86px';
    ghost.style.borderRadius='50%';
    ghost.style.background=`#fff url(${config.beads[key].art}) center/78px 78px no-repeat`;
    ghost.style.border='3px solid #fff';
    ghost.style.boxShadow='0 12px 28px rgba(74,47,24,.28)';
    ghost.style.transform='translate(-50%,-50%) scale(1.08)';
    return ghost;
  },
  onGrab: (piece) => {
    unlockAudio();
    piece.classList.add('dragging');
    return true;
  },
  // A press that never moved is a tap: same select-then-place flow the game
  // always had (guided auto-fills the next slot; jam selects, then a tap on
  // an empty slot places it).
  onTap: (piece, record) => {
    piece.classList.remove('dragging');
    const key = record.id;
    const existingSel = els.tray.querySelector('.tray-bead.selected');
    if (existingSel) existingSel.classList.remove('selected');
    if (state.mode && !state.mode.free) {
      const idx = nextExpectedEmpty();
      if (idx!==-1) tryPlace(key, idx);
    } else {
      piece.classList.add('selected');
      say(key, key);
      playBeadSound(key);
    }
  },
  onDrop: (piece, record) => {
    piece.classList.remove('dragging');
    if (record.slot) {
      const idx = parseInt(record.slot.dataset.index, 10);
      tryPlace(record.id, idx);
    }
  },
  onCancel: (piece) => {
    piece.classList.remove('dragging');
  },
});

function buildTray(){
  els.tray.innerHTML='';
  const showKeys = BEAD_ORDER; // keep stable layout across modes
  showKeys.forEach(k=>{
    const btn = document.createElement('button');
    btn.className='tray-bead';
    btn.dataset.bead=k;
    btn.setAttribute('data-target', `bead-${k}`);
    btn.setAttribute('aria-label', k+' bead');
    btn.innerHTML=`<img src="${config.beads[k].art}" alt="${config.beads[k].alt}" draggable="false">`;
    btn.addEventListener('pointerdown', (e)=>{
      e.preventDefault();
      beadDrag.begin(e, k);
    });
    els.tray.appendChild(btn);
  });
}

function handleSlotTap(idx){
  const cur = state.boardSlots[idx];
  if (state.mode?.free){
    if (cur !== null){
      // remove bead
      state.boardSlots[idx]=null;
      renderBoard();
      sfx.unpop();
      const sel = els.tray.querySelector('.tray-bead.selected');
      if (sel) sel.classList.remove('selected');
      saveJam();
      return;
    }
    const sel = els.tray.querySelector('.tray-bead.selected');
    if (sel){
      const k = sel.dataset.bead;
      tryPlace(k, idx);
      sel.classList.remove('selected');
    } else {
      // no selection: pulse hint
      say('empty-slot', config.voice['empty-slot']);
    }
  } else {
    // guided: tapping empty slot hints, tapping filled does nothing
    if (state.boardSlots[idx]!==null) return;
    // if bead selected in tray, place there; otherwise use next pending bead? but we require tray selection
    const sel = els.tray.querySelector('.tray-bead.selected');
    if (sel){
      tryPlace(sel.dataset.bead, idx);
      sel.classList.remove('selected');
    } else {
      // no selection -> treat as hint, but guided expects next slot only
      // if this is the next empty, nudge
      const next = nextExpectedEmpty();
      if (idx===next) {
        // user tapped correct empty but no bead selected -> prompt choose
        say('prompt-choose', config.voice['prompt-choose']);
      }
    }
  }
}

function nextExpectedEmpty(){
  // guided mode: the first null in board that is within gap positions
  // we pre-filled pattern's prefix; gaps are at tail
  for (let i=0;i<SLOT_COUNT;i++) if (state.boardSlots[i]===null) return i;
  return -1;
}

function tryPlace(key, idx){
  // validate
  const isFree = !!(state.mode && state.mode.free);
  if (!isFree){
    // must match expected at this position
    // expected array holds the full sequence padded to SLOT_COUNT? Actually we set boardSlots with pattern prefix, remaining slots are expected in order.
    // So expected is array of keys for empty positions in order.
    // The idx must be the next empty, and key must equal expected[nextFillIdx]
    const nextIdx = nextExpectedEmpty();
    if (idx !== nextIdx){
      wiggleSlot(idx);
      say('nudge', config.voice.nudge);
      return;
    }
    const exp = state.expected[state.nextFillIdx];
    if (key !== exp){
      wiggleSlot(idx);
      sfx.unpop();
      say('nudge', config.voice.nudge);
      return;
    }
    // correct
    state.boardSlots[idx]=key;
    state.nextFillIdx++;
    renderBoard();
    playBeadSound(key);
    sfx.pop();
    if (state.nextFillIdx >= state.expected.length){
      // round complete
      onRoundComplete();
    } else {
      // progress
      updateRail();
      // highlight next
      highlightNextPulse();
    }
  } else {
    // free jam: any bead anywhere
    state.boardSlots[idx]=key;
    renderBoard();
    playBeadSound(key);
    sfx.pop();
    saveJam();
  }
}

function wiggleSlot(idx){
  const el = els.slotsEl.querySelector(`[data-index="${idx}"]`);
  if (!el) return;
  el.classList.remove('wiggle');
  void el.offsetWidth;
  el.classList.add('wiggle');
  state.timers.after(420, ()=> el.classList.remove('wiggle'));
}

function renderBoard(){
  const slots = els.slotsEl.querySelectorAll('.slot');
  slots.forEach((el,i)=>{
    const key = state.boardSlots[i];
    el.classList.remove('empty','filled','pulse','hit');
    if (key){
      el.classList.add('filled');
      el.innerHTML=`<img src="${config.beads[key].art}" alt="${key} bead">`;
    } else {
      el.classList.add('empty');
      el.innerHTML='';
    }
  });
  highlightNextPulse();
  updateRail();
  updatePlayButton();
}

function highlightNextPulse(){
  const slots = els.slotsEl.querySelectorAll('.slot');
  slots.forEach(el=> el.classList.remove('pulse'));
  if (state.playing) return;
  const isFree = !!(state.mode && state.mode.free);
  if (!isFree){
    const next = nextExpectedEmpty();
    if (next!==-1 && state.nextFillIdx < state.expected.length){
      const el = els.slotsEl.querySelector(`[data-index="${next}"]`);
      if (el) el.classList.add('pulse');
    }
  } else {
    // free: no pulse unless board empty then pulse first empty
    const anyPlaced = state.boardSlots.some(v=>v!==null);
    if (!anyPlaced){
      const el = els.slotsEl.querySelector('[data-index="0"]');
      if (el) el.classList.add('pulse');
    }
  }
}

function updateRail(){
  if (!state.mode) return;
  els.rail.innerHTML='';
  const isFree = !!state.mode.free;
  if (isFree){
    for (let i=0;i<SLOT_COUNT;i++){
      const d=document.createElement('span');
      d.className='step-dot'+(state.boardSlots[i]?' done':'');
      els.rail.appendChild(d);
    }
    return;
  }
  // guided: dots for rounds
  const total = state.rounds.length;
  const done = state.completed;
  // also show per-round progress pill: filled vs missing
  const dots = total;
  for (let i=0;i<dots;i++){
    const d=document.createElement('span');
    d.className='step-dot'+(i<done?' done':'')+(i===done?' active':'');
    els.rail.appendChild(d);
  }
  // add mini fill for current round
  const sub = document.createElement('span');
  sub.style.marginLeft='8px';
  sub.style.fontSize='13px';
  sub.style.color='#7a5a3a';
  sub.textContent = state.expected.length ? `${state.nextFillIdx}/${state.expected.length} beads` : '';
  els.rail.appendChild(sub);
}

function updatePlayButton(){
  const hasAny = state.boardSlots.some(v=>v!==null);
  els.playBtn.disabled = !hasAny || state.playing;
  els.playBtn.textContent = state.playing ? 'Playing…' : '▶ Play';
  els.playBtn.classList.toggle('playing', state.playing);
  els.clearBtn.hidden = !(state.mode && state.mode.free);
}

function buildTrayAndSlotsForMode(){
  buildSlots();
  buildTray();
  // fill boardSlots per mode
  state.boardSlots = Array(SLOT_COUNT).fill(null);
  state.nextFillIdx=0;
  state.expected=[];
  if (!state.mode) return;
  if (state.mode.free){
    // try load saved jam
    const saved = loadJam();
    if (saved && saved.length===SLOT_COUNT) state.boardSlots = saved.slice();
    setPrompt('intro-jam','🎶');
    say('intro-jam', config.voice['intro-jam']);
  } else {
    // guided: current round pattern
    const round = state.rounds[state.roundIndex];
    if (!round) return;
    const seq = round.sequence;
    const missing = round.missing;
    // Patterns are 6 long, the board has 8 slots: fill the first (6 - missing)
    // slots with the visible prefix, expect the pattern's tail in the rest.
    // The 2 slots beyond seq.length stay empty deco (no pulse, not required)
    // so the bracelet always reads as a full 8-bead loop once played back.
    const showCount = seq.length - missing;
    for (let i=0;i<showCount;i++) state.boardSlots[i]=seq[i];
    state.expected = seq.slice(showCount);
    setPrompt(state.mode.id==='pop'?'intro-pop':'intro-star', state.mode.id==='pop'?'🟢':'⭐');
    const key = state.mode.id==='pop'?'intro-pop':'intro-star';
    say(key, config.voice[key]);
  }
  renderBoard();
  resetIdle();
}

function onRoundComplete(){
  sfx.tada();
  updateRail();
  // sparkle current beads
  const total = state.expected.length;
  state.completed = Math.min(state.completed+1, state.rounds.length);
  // brief pause then play concert
  state.timers.wait(420).then(()=>{
    playSequence(()=> {
      // after sequence, if more rounds, advance else celebrate
      if (state.roundIndex +1 < state.rounds.length){
        state.roundIndex++;
        buildTrayAndSlotsForMode();
      } else {
        showCelebrate();
      }
    });
  });
}

function showCelebrate(){
  // copy board to celebrate
  els.celebrateBoardWrap.innerHTML='';
  const clone = els.board.cloneNode(true);
  clone.id='celebrate-board';
  // remove ids inside to avoid dup
  clone.querySelectorAll('[id]').forEach(el=> el.removeAttribute('id'));
  els.celebrateBoardWrap.appendChild(clone);
  // recap dots
  els.recap.innerHTML='';
  const total = state.rounds.length;
  for (let i=0;i<total;i++){
    const d=document.createElement('span');
    d.className='recap-dot done';
    els.recap.appendChild(d);
  }
  showScreen('celebrate');
  // confetti
  burstConfetti();
  // stars already animate via css
  const cheerKey = state.mode.id==='pop'?'cheer-pop': state.mode.id==='star'?'cheer-star':'cheer-jam';
  say(cheerKey, config.voice[cheerKey]);
  // auto play celebrate board
  state.timers.after(700, ()=> playSequenceOn(clone, null));
}

function burstConfetti(){
  els.confetti.innerHTML='';
  const colors = BEAD_ORDER.map(hexFor);
  for (let i=0;i<28;i++){
    const p=document.createElement('span');
    p.className='confetti-piece';
    p.style.left = (Math.random()*100)+'%';
    p.style.top = '-10px';
    p.style.background = colors[Math.floor(Math.random()*colors.length)];
    p.style.transform=`rotate(${Math.random()*360}deg)`;
    p.style.animationDelay=(Math.random()*0.4)+'s';
    p.style.animationDuration=(0.9+Math.random()*0.6)+'s';
    els.confetti.appendChild(p);
    state.timers.after(1800, ()=> p.remove());
  }
}

function playSequence(done){
  playSequenceOn(els.board, done);
}

function playSequenceOn(boardEl, done){
  if (state.playing) return;
  state.playing=true;
  updatePlayButton();
  highlightNextPulse();
  const order = [...Array(SLOT_COUNT).keys()]; // 0..7 in circular order already placed clockwise
  const actualStep = Math.max(220, Math.min(620, 60000/state.bpm * 0.65));
  let idx=0;
  let loops=0;
  function step(){
    if (idx>=order.length){
      idx=0;
      loops++;
      if (loops>= (state.mode && state.mode.free ? 2 : 1)){
        state.playing=false;
        updatePlayButton();
        highlightNextPulse();
        // clear hits
        boardEl.querySelectorAll('.slot.hit').forEach(el=> el.classList.remove('hit'));
        if (done) done();
        return;
      }
    }
    const slotIdx = order[idx];
    const key = state.boardSlots[slotIdx];
    const el = boardEl.querySelector(`[data-index="${slotIdx}"]`);
    // highlight
    boardEl.querySelectorAll('.slot.hit').forEach(e=> e.classList.remove('hit'));
    if (el){
      el.classList.add('hit');
      state.timers.after(actualStep*0.7, ()=> el.classList.remove('hit'));
    }
    if (key){
      playBeadSound(key);
      if (el) {
        el.animate([{transform:'translate(-50%,-50%) scale(1)'},{transform:'translate(-50%,-50%) scale(1.18)'},{transform:'translate(-50%,-50%) scale(1)'}],{duration:actualStep*0.8, easing:'cubic-bezier(.2,.9,.25,1.2)'});
      }
    }
    idx++;
    state.sequenceTimer = state.timers.after(actualStep, step);
  }
  // small lead-in
  state.sequenceTimer = state.timers.after(300, step);
}

function resetIdle(){
  state.timers.clear(state.idleTimer);
  state.idleTimer = state.timers.after(10000, ()=>{
    // nudge
    if (state.mode && !state.mode.free && state.expected.length){
      say('nudge', config.voice.nudge);
      // also speak pattern
      const seq = state.rounds[state.roundIndex]?.sequence || [];
      // speak first 4
    } else if (state.mode && state.mode.free){
      say('play', config.voice.play);
    }
  });
}

function saveJam(){
  try{
    localStorage.setItem('qlo.be/pattern-bracelet-band/jams', JSON.stringify(state.boardSlots));
    // also keep up to 4 saves? For now single
  }catch{}
}
function loadJam(){
  try{
    const v = JSON.parse(localStorage.getItem('qlo.be/pattern-bracelet-band/jams')||'null');
    if (Array.isArray(v) && v.length===SLOT_COUNT) return v;
  }catch{}
  return null;
}

// Controls
function wireControls(){
  teardown.push(press(els.back, ()=> showSplash()));
  teardown.push(press(els.sound, ()=> {
    const k = els.promptCard.dataset.voiceKey || 'prompt-choose';
    say(k, config.voice[k] || k);
  }));
  teardown.push(onTap(els.promptCard, ()=> {
    const k = els.promptCard.dataset.voiceKey || 'prompt-choose';
    say(k, config.voice[k] || k);
  }));
  teardown.push(press(els.playBtn, ()=> {
    if (state.playing) return;
    playSequence();
    say('play', config.voice.play);
  }));
  teardown.push(press(els.slower, ()=> {
    state.bpm = Math.max(BPM_MIN, state.bpm - BPM_STEP);
    els.tempoLabel.textContent = state.bpm + ' bpm';
    say('slower', config.voice.slower);
  }));
  teardown.push(press(els.faster, ()=> {
    state.bpm = Math.min(BPM_MAX, state.bpm + BPM_STEP);
    els.tempoLabel.textContent = state.bpm + ' bpm';
    say('faster', config.voice.faster);
  }));
  teardown.push(press(els.clearBtn, ()=> {
    if (state.mode && state.mode.free){
      state.boardSlots = Array(SLOT_COUNT).fill(null);
      renderBoard();
      saveJam();
      sfx.whoosh();
    }
  }));
  teardown.push(press(els.celebrateBack, ()=> showSplash()));
  teardown.push(press(els.again, ()=>{
    // replay same mode from start? For guided, restart same mode at round 0. For jam, keep board.
    if (state.mode && state.mode.free){
      showScreen('play');
      playSequence();
    } else {
      state.roundIndex=0; state.completed=0;
      buildTrayAndSlotsForMode();
      showScreen('play');
    }
  }));
  teardown.push(press(els.choose, ()=> showSplash()));
  window.addEventListener('blur', ()=> {
    if (state.playing){
      state.timers.clear(state.sequenceTimer);
      state.playing=false;
      updatePlayButton();
    }
  });
}

function showSplash(){
  state.timers.clear(state.sequenceTimer);
  state.timers.clear(state.idleTimer);
  state.playing=false;
  state.mode=null;
  showScreen('splash');
  say('welcome', config.voice.welcome);
}

function startMode(id){
  const mode = config.modes.find(m=> m.id===id);
  if (!mode) return;
  state.mode=mode;
  state.roundIndex=0;
  state.completed=0;
  state.bpm=108;
  els.tempoLabel.textContent='108 bpm';
  state.rounds = mode.patterns || [];
  showScreen('play');
  buildTrayAndSlotsForMode();
}

function installGameDebug(){
  const spec = {
    gameId: config.id,
    engine: 'custom-bracelet',
    ready: Promise.resolve(),
    listModes: ()=> config.modes.map(m=>({id:m.id,title:m.title})),
    startMode: (id)=> startMode(id),
    getState: ()=> ({
      screen: els.splash.hidden ? (els.play.hidden ? 'celebrate' : 'play') : 'splash',
      mode: state.mode?.id || null,
      roundIndex: state.roundIndex,
      completed: state.completed,
      boardSlots: [...state.boardSlots],
      expected: [...state.expected],
      bpm: state.bpm,
      playing: state.playing,
    }),
    getTargets: ()=> {
      const targets=[];
      // mode cards
      document.querySelectorAll('[data-target]').forEach(el=>{
        const r=el.getBoundingClientRect();
        if (r.width>0 && r.height>0) targets.push({id:el.getAttribute('data-target'), rect:{x:r.x,y:r.y,w:r.width,h:r.height}});
      });
      // slots
      els.slotsEl.querySelectorAll('.slot').forEach(el=>{
        const r=el.getBoundingClientRect();
        targets.push({id:el.getAttribute('data-target'), rect:{x:r.x,y:r.y,w:r.width,h:r.height}});
      });
      return targets;
    },
    tap: (targetId)=>{
      const el=document.querySelector(`[data-target="${targetId}"]`);
      if (el) el.click();
    },
    winRound: ()=>{
      if (!state.mode || state.mode.free) return;
      // fill all expected
      const next = nextExpectedEmpty();
      if (next===-1) return;
      // place correct beads automatically
      for (let i=0;i<state.expected.length - state.nextFillIdx; i++){
        const idx = nextExpectedEmpty();
        const key = state.expected[state.nextFillIdx];
        if (idx===-1) break;
        state.boardSlots[idx]=key;
        state.nextFillIdx++;
      }
      renderBoard();
      onRoundComplete();
    },
    mute: ()=> { state.muted=!state.muted; },
    seed: (n)=> { state.seedVal=n; state.rng=mulberry32(n); },
    timers: state.timers,
  };
  return installDebug(spec);
}

let disposeDebug=null;

function init(){
  buildSplash();
  buildSlots(); // empty for splash? but build anyway
  wireControls();
  showScreen('splash');
  setPrompt('welcome','👋');
  els.tempoLabel.textContent='108 bpm';
  disposeDebug = installGameDebug();
  // gentle idle for splash?
}

init();

// expose for debug
window._braceletState = state;
