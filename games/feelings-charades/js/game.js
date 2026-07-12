// game.js — Feelings Charades core: the Act It Out loop (grid → demo →
// act-along → affirm → coping pivot → star) and the Guess the Feeling quiz.
// Custom game per docs/polish-process.md; voice via shared voice-clips.

import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';

// ---------- data -------------------------------------------------------

export const FEELINGS = [
  { key: 'happy',      label: 'Happy',      actor: 'maya', emoji: '😊', accent: '#f4c53d', cope: null },
  { key: 'proud',      label: 'Proud',      actor: 'maya', emoji: '🥳', accent: '#e8543a', cope: null },
  { key: 'frustrated', label: 'Frustrated', actor: 'leo',  emoji: '😤', accent: '#8a5bc4', cope: 'breathe' },
  { key: 'excited',    label: 'Excited',    actor: 'leo',  emoji: '🤩', accent: '#f08a24', cope: null },
  { key: 'sad',        label: 'Sad',        actor: 'nia',  emoji: '😢', accent: '#2d7dd2', cope: 'hug' },
  { key: 'calm',       label: 'Calm',       actor: 'nia',  emoji: '😌', accent: '#58a945', cope: null },
  { key: 'worried',    label: 'Worried',    actor: 'sam',  emoji: '😨', accent: '#d9a01d', cope: 'talk' },
  { key: 'shy',        label: 'Shy',        actor: 'sam',  emoji: '🙈', accent: '#e77fb3', cope: null },
];

// Guess mode: audio riddle + neutral actor art; answers are posed thumbnails.
const GUESS_ITEMS = [
  { answer: 'frustrated', options: ['frustrated', 'happy', 'calm', 'proud'] },
  { answer: 'happy',      options: ['happy', 'sad', 'worried', 'frustrated'] },
  { answer: 'sad',        options: ['sad', 'proud', 'calm', 'happy'] },
  { answer: 'worried',    options: ['worried', 'happy', 'frustrated', 'proud'] },
  { answer: 'calm',       options: ['calm', 'sad', 'worried', 'proud'] },
  { answer: 'proud',      options: ['proud', 'frustrated', 'sad', 'calm'] },
];

const CARD_ART = (key) => `./assets/cards/${key}.png`;
const VIDEO_SRC = (key) => `./assets/video/${key}.mp4`;
const PORTRAIT = (actor) => `../../shared/characters/${actor}/portrait.png`;

const CONFETTI_COLORS = ['#e23d3d', '#f4c53d', '#58a945', '#2d7dd2', '#8a5bc4', '#f08a24'];

// ---------- game -------------------------------------------------------

export class Game {
  constructor(mode, els, callbacks) {
    this.mode = mode;               // 'act' | 'guess'
    this.els = els;
    this.cb = callbacks;            // { onEnd(kind) }
    this.destroyed = false;
    this.phase = null;              // grid|demo|act|cope|affirm | round
    this.feeling = null;            // active FEELINGS entry
    this.stars = new Set();
    this.round = 0;
    this.roundsTotal = GUESS_ITEMS.length;
    this.awaitingInput = false;
    this.speakToken = 0;
    this.timers = new Set();
    this.timeScale = 1;             // fastTimers() sets 0.02 for QA drives
    this.reducedMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.guessOrder = [...GUESS_ITEMS];
    this.rng = Math.random;
  }

  start() {
    if (this.mode === 'guess') {
      this.startGuessRound(0);
    } else {
      this.showGrid();
      this.speak(['mode-act']);
    }
  }

  destroy() {
    this.destroyed = true;
    this.speakToken++;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    voice.stop();
    const v = this.els.demoVideo;
    try { v.pause(); v.removeAttribute('src'); v.load(); } catch { /* ignore */ }
  }

  // ---------- helpers ----------

  wait(ms) {
    return new Promise((resolve) => {
      const t = setTimeout(() => { this.timers.delete(t); resolve(); }, ms * this.timeScale);
      this.timers.add(t);
    });
  }

  async speak(keys) {
    if (window.__qkMuted) return; // QA drives silence the voice channel
    const token = ++this.speakToken;
    for (const key of keys) {
      if (token !== this.speakToken || this.destroyed) return;
      await voice.say(key);
    }
  }

  showPhase(name) {
    for (const p of ['grid', 'demo', 'act', 'cope', 'affirm', 'guess']) {
      this.els[p].classList.toggle('hidden', p !== name);
    }
    this.phase = name;
  }

  confetti(count = 28) {
    if (this.reducedMotion) return;
    const layer = this.els.confetti;
    for (let i = 0; i < count; i++) {
      const bit = document.createElement('span');
      bit.className = 'confetti-bit';
      bit.style.left = Math.random() * 100 + 'vw';
      bit.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      bit.style.animationDuration = 1.6 + Math.random() * 1.6 + 's';
      bit.style.animationDelay = Math.random() * 0.4 + 's';
      layer.appendChild(bit);
      setTimeout(() => bit.remove(), 4000);
    }
  }

  // ---------- Act It Out: grid ----------

  showGrid() {
    this.showPhase('grid');
    this.awaitingInput = true;
    const grid = this.els.grid;
    grid.innerHTML = '';
    for (const f of FEELINGS) {
      const card = document.createElement('button');
      card.className = 'feel-card';
      card.type = 'button';
      card.dataset.feeling = f.key;
      card.style.setProperty('--accent', f.accent);
      card.setAttribute('aria-label', f.label);
      const img = document.createElement('img');
      img.src = CARD_ART(f.key);
      img.alt = '';
      img.draggable = false;
      img.addEventListener('error', () => { img.remove(); card.prepend(emojiSpan(f.emoji)); }, { once: true });
      const label = document.createElement('span');
      label.className = 'feel-label';
      label.textContent = f.label;
      card.append(img, label);
      if (this.stars.has(f.key)) {
        const star = document.createElement('span');
        star.className = 'star';
        star.textContent = '⭐';
        card.appendChild(star);
      }
      card.addEventListener('pointerdown', (e) => e.preventDefault());
      card.addEventListener('pointerup', () => this.pickFeeling(f.key));
      grid.appendChild(card);
    }
  }

  pickFeeling(key) {
    if (this.destroyed || this.phase !== 'grid' || !this.awaitingInput) return;
    const f = FEELINGS.find((x) => x.key === key);
    if (!f) return;
    this.awaitingInput = false;
    this.feeling = f;
    sfx.pop();
    this.startDemo();
  }

  // ---------- Act It Out: demo ----------

  async startDemo() {
    const f = this.feeling;
    this.showPhase('demo');
    this.els.demoTitle.textContent = f.label;
    const video = this.els.demoVideo;
    const art = this.els.demoArt;
    video.classList.add('hidden');
    art.classList.add('hidden');

    // try the vignette; fall back to posed art on any error
    let usedVideo = false;
    if (!this.reducedMotion) {
      usedVideo = await new Promise((resolve) => {
        const onOk = () => { cleanup(); resolve(true); };
        const onErr = () => { cleanup(); resolve(false); };
        const cleanup = () => {
          video.removeEventListener('canplay', onOk);
          video.removeEventListener('error', onErr);
        };
        video.addEventListener('canplay', onOk, { once: true });
        video.addEventListener('error', onErr, { once: true });
        video.src = VIDEO_SRC(f.key);
        video.load();
        setTimeout(() => { cleanup(); resolve(video.readyState >= 3); }, 2500);
      });
    }
    if (this.destroyed || this.phase !== 'demo') return;
    if (usedVideo) {
      video.classList.remove('hidden');
      video.currentTime = 0;
      video.loop = true;
      const p = video.play();
      if (p && p.catch) p.catch(() => { /* poster is fine */ });
    } else {
      art.src = CARD_ART(f.key);
      art.classList.remove('hidden');
    }
    this.awaitingInput = true;
    await this.speak([`${f.key}-label`, `${f.key}-demo`, 'your-turn']);
  }

  yourTurn() {
    if (this.destroyed || this.phase !== 'demo' || !this.awaitingInput) return;
    this.awaitingInput = false;
    try { this.els.demoVideo.pause(); } catch { /* ignore */ }
    sfx.whoosh();
    this.startAct();
  }

  // ---------- Act It Out: act-along ----------

  async startAct() {
    const f = this.feeling;
    this.showPhase('act');
    this.els.actTitle.textContent = `Show me ${f.label.toLowerCase()}!`;
    this.els.actEmoji.textContent = f.emoji;
    this.els.actArt.src = CARD_ART(f.key);
    this.els.actArt.alt = `${f.label} pose`;
    this.awaitingInput = true;
    this.actToken = (this.actToken || 0) + 1;
    const token = this.actToken;

    const DUR = 10000;
    const ring = this.els.actRing.querySelector('.ring-fg');
    ring.style.transition = 'none';
    ring.style.strokeDashoffset = '553';
    if (!this.reducedMotion) {
      requestAnimationFrame(() => {
        ring.style.transition = `stroke-dashoffset ${DUR * this.timeScale}ms linear`;
        ring.style.strokeDashoffset = '0';
      });
    } else {
      ring.style.strokeDashoffset = '0';
    }

    this.speak([`${f.key}-invite`]);
    this.wait(3000).then(() => {
      if (token === this.actToken && this.phase === 'act' && !this.destroyed) this.speak([`${f.key}-enc1`]);
    });
    this.wait(7000).then(() => {
      if (token === this.actToken && this.phase === 'act' && !this.destroyed) this.speak([`${f.key}-enc2`]);
    });
    await this.wait(DUR);
    if (token === this.actToken && this.phase === 'act' && !this.destroyed) this.finishAct(false);
  }

  finishAct(early) {
    if (this.destroyed || this.phase !== 'act') return;
    this.actToken++;
    this.awaitingInput = false;
    sfx.tada();
    if (early) this.speak(['done-early']);
    this.startAffirm();
  }

  // ---------- Act It Out: affirmation ----------

  async startAffirm() {
    const f = this.feeling;
    this.showPhase('affirm');
    this.confetti();
    this.els.affirmText.textContent = '';
    this.els.affirmNext.textContent = f.cope ? '💙 One more thing…' : '💛 Try another feeling';
    this.awaitingInput = true;
    await this.speak([`${f.key}-affirm`]);
    if (this.destroyed || this.phase !== 'affirm') return;
    this.els.affirmText.textContent = lineFor(`${f.key}-learn`);
    await this.speak([`${f.key}-learn`]);
  }

  affirmNext() {
    if (this.destroyed || this.phase !== 'affirm' || !this.awaitingInput) return;
    this.awaitingInput = false;
    sfx.tick();
    if (this.feeling.cope) this.startCope();
    else this.earnStar();
  }

  // ---------- Act It Out: coping pivots ----------

  async startCope() {
    const f = this.feeling;
    this.showPhase('cope');
    const wrap = this.els.breathWrap;
    const steps = this.els.breathSteps;
    const artWrap = this.els.copeArtWrap;
    const done = this.els.copeDone;
    wrap.classList.add('hidden');
    steps.classList.add('hidden');
    artWrap.classList.add('hidden');
    done.classList.add('hidden');
    this.els.copeTitle.textContent =
      f.cope === 'breathe' ? "Let's breathe it smaller" :
      f.cope === 'talk' ? 'Tell someone you trust' : 'A hug helps';
    // the copy block is per-feeling — a hardcoded "frustrated" here once
    // greeted sad and worried kids with the wrong feeling
    this.els.copeCopyTitle.textContent = `It's okay to feel ${f.label.toLowerCase()}.`;
    this.els.copeCopySub.textContent =
      f.cope === 'breathe' ? "Let's take one slow breath." :
      f.cope === 'talk' ? 'Talking to someone helps.' : 'A big hug helps.';

    if (f.cope === 'breathe') {
      // Keep both the character/rings and the three-step visual sequence on
      // screen. Preschoolers can follow the pictograms while the voice guides
      // each timed phase; reduced-motion simply disables the ring transition.
      wrap.classList.remove('hidden');
      steps.classList.remove('hidden');
      await this.speak([`${f.key}-cope-intro`]);
      for (let cycle = 0; cycle < 3 && !this.destroyed && this.phase === 'cope'; cycle++) {
        await this.breathPhase('inhale', 'Breathe in…', 'in', `${f.key}-breathe-in`, 4000);
        await this.breathPhase('hold', 'Hold…', 'hold', `${f.key}-hold`, 2000);
        await this.breathPhase('', 'Breathe out…', 'out', `${f.key}-breathe-out`, 4000);
      }
      if (this.destroyed || this.phase !== 'cope') return;
      await this.speak([`${f.key}-cope-done`]);
    } else {
      artWrap.classList.remove('hidden');
      this.els.copeArt.src = CARD_ART(f.key);
      await this.speak([`${f.key}-cope-intro`]);
      await this.wait(600);
      await this.speak([`${f.key}-cope-action`]);
      await this.wait(f.cope === 'hug' ? 3000 : 1500);
      if (this.destroyed || this.phase !== 'cope') return;
      await this.speak([`${f.key}-cope-done`]);
    }
    if (this.destroyed || this.phase !== 'cope') return;
    this.awaitingInput = true;
    done.classList.remove('hidden');
  }

  async breathPhase(cls, labelText, stepKey, sayKey, ms) {
    if (this.destroyed || this.phase !== 'cope') return;
    const wrap = this.els.breathWrap;
    wrap.classList.remove('inhale', 'hold');
    if (cls) wrap.classList.add(cls);
    this.els.breathLabel.textContent = labelText;
    for (const s of this.els.breathSteps.querySelectorAll('span')) {
      s.classList.toggle('active', s.dataset.step === stepKey);
    }
    this.speak([sayKey]);
    await this.wait(ms);
  }

  copeDone() {
    if (this.destroyed || this.phase !== 'cope' || !this.awaitingInput) return;
    this.awaitingInput = false;
    sfx.sparkle();
    this.earnStar();
  }

  // ---------- Act It Out: star + completion ----------

  earnStar() {
    this.stars.add(this.feeling.key);
    sfx.pop();
    if (this.stars.size >= FEELINGS.length) {
      this.confetti(60);
      this.speak(['all-stars']);
      this.cb.onEnd('act');
      return;
    }
    this.showGrid();
    this.speak(['try-another']);
  }

  // ---------- Guess the Feeling ----------

  async startGuessRound(index) {
    this.round = index;
    this.showPhase('guess');
    const item = this.guessOrder[index];
    const f = FEELINGS.find((x) => x.key === item.answer);
    this.currentGuess = item;

    const dots = this.els.guessDots;
    dots.innerHTML = '';
    for (let i = 0; i < this.roundsTotal; i++) {
      const d = document.createElement('span');
      if (i < index) d.classList.add('done');
      dots.appendChild(d);
    }
    this.els.guessArt.src = PORTRAIT(f.actor);

    const answers = this.els.guessAnswers;
    answers.innerHTML = '';
    item.options.forEach((key, i) => {
      const opt = FEELINGS.find((x) => x.key === key);
      const card = document.createElement('button');
      card.className = 'answer-card';
      card.type = 'button';
      card.dataset.answer = key;
      card.dataset.index = String(i);
      card.style.setProperty('--accent', opt.accent);
      card.setAttribute('aria-label', opt.label);
      const img = document.createElement('img');
      img.src = CARD_ART(key);
      img.alt = '';
      img.draggable = false;
      img.addEventListener('error', () => { img.replaceWith(emojiSpan(opt.emoji)); }, { once: true });
      const label = document.createElement('span');
      label.className = 'a-label';
      label.textContent = opt.label;
      card.append(img, label);
      card.addEventListener('pointerdown', (e) => e.preventDefault());
      card.addEventListener('pointerup', () => this.answerGuess(key, card));
      answers.appendChild(card);
    });

    this.awaitingInput = true;
    await this.speak([`guess-${item.answer}`]);
  }

  async answerGuess(key, card) {
    if (this.destroyed || this.phase !== 'guess' || !this.awaitingInput) return;
    if (key === this.currentGuess.answer) {
      this.awaitingInput = false;
      sfx.pop();
      this.confetti(14);
      await this.speak([`${key}-label`, `yum-${(this.round % 4) + 1}`]);
      if (this.destroyed) return;
      const next = this.round + 1;
      if (next >= this.roundsTotal) {
        this.speak(['cheer-guess']);
        this.confetti(50);
        this.cb.onEnd('guess');
      } else {
        this.startGuessRound(next);
      }
    } else {
      sfx.boing();
      if (card) { card.classList.remove('wrong'); void card.offsetWidth; card.classList.add('wrong'); }
      this.speak(['nudge-guess', `guess-${this.currentGuess.answer}`]);
    }
  }

  // ---------- replay (sound button) ----------

  replay() {
    if (this.destroyed) return;
    if (this.mode === 'guess' && this.currentGuess) {
      this.speak([`guess-${this.currentGuess.answer}`]);
      return;
    }
    const f = this.feeling;
    switch (this.phase) {
      case 'grid': this.speak(['grid-prompt']); break;
      case 'demo': this.speak([`${f.key}-demo`, 'your-turn']); break;
      case 'act': this.speak([`${f.key}-invite`]); break;
      case 'affirm': this.speak([`${f.key}-learn`]); break;
      case 'cope': this.speak([`${f.key}-cope-intro`]); break;
      default: this.speak(['mode-act']);
    }
  }

  // ---------- debug support ----------

  getState() {
    return {
      screen: 'play',
      mode: this.mode,
      phase: this.phase,
      feeling: this.feeling ? this.feeling.key : null,
      stars: this.stars.size,
      round: this.round,
      roundsTotal: this.mode === 'guess' ? this.roundsTotal : FEELINGS.length,
      awaitingInput: this.awaitingInput,
    };
  }

  getTargets() {
    const rectOf = (el, id, role) => {
      const r = el.getBoundingClientRect();
      return { id, role, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
    };
    const out = [];
    if (this.phase === 'grid') {
      for (const c of this.els.grid.querySelectorAll('.feel-card')) {
        out.push(rectOf(c, `card:${c.dataset.feeling}`, this.stars.has(c.dataset.feeling) ? 'neutral' : 'correct'));
      }
    } else if (this.phase === 'demo') {
      out.push(rectOf(this.els.yourTurnBtn, 'your-turn', 'correct'));
    } else if (this.phase === 'act') {
      out.push(rectOf(this.els.actDone, 'act-done', 'correct'));
    } else if (this.phase === 'affirm') {
      out.push(rectOf(this.els.affirmNext, 'affirm-next', 'correct'));
    } else if (this.phase === 'cope') {
      if (!this.els.copeDone.classList.contains('hidden')) out.push(rectOf(this.els.copeDone, 'cope-done', 'correct'));
    } else if (this.phase === 'guess') {
      for (const c of this.els.guessAnswers.querySelectorAll('.answer-card')) {
        out.push(rectOf(c, `answer:${c.dataset.answer}`,
          c.dataset.answer === this.currentGuess.answer ? 'correct' : 'wrong'));
      }
    }
    return out;
  }

  tap(id) {
    const target = this.getTargets().find((t) => t.id === id);
    if (!target) return { accepted: false };
    if (id.startsWith('card:')) this.pickFeeling(id.slice(5));
    else if (id === 'your-turn') this.yourTurn();
    else if (id === 'act-done') this.finishAct(true);
    else if (id === 'affirm-next') this.affirmNext();
    else if (id === 'cope-done') this.copeDone();
    else if (id.startsWith('answer:')) {
      const card = this.els.guessAnswers.querySelector(`[data-answer="${id.slice(7)}"]`);
      this.answerGuess(id.slice(7), card);
    }
    return { accepted: true };
  }

  /** Complete the current feeling / guess round via real input paths.
   *  Concurrency-safe: waits between retries, bounded at ~20s. */
  async winRound() {
    const deadline = Date.now() + 20000;
    const step = async () => {
      const targets = this.getTargets();
      const go = targets.find((t) => t.role === 'correct');
      if (go) this.tap(go.id);
      await new Promise((r) => setTimeout(r, 120));
    };
    if (this.mode === 'guess') {
      const startRound = this.round;
      while (!this.destroyed && this.round === startRound && this.phase === 'guess' && Date.now() < deadline) {
        await step();
      }
      return;
    }
    const startStars = this.stars.size;
    while (!this.destroyed && this.stars.size === startStars && Date.now() < deadline) {
      await step();
    }
  }
}

// ---------- module helpers ----------

function emojiSpan(emoji) {
  const s = document.createElement('span');
  s.style.fontSize = 'clamp(40px, 8vh, 70px)';
  s.textContent = emoji;
  return s;
}

// Default spoken lines (safety net + pre-recording playthrough); the recorded
// manifest and lines.json replace these at runtime when present.
import { DEFAULT_LINES } from './lines.js';
function lineFor(key) { return DEFAULT_LINES[key] || ''; }
export { DEFAULT_LINES };
