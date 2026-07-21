// puppet-band.js — Stage v2 archetype for "build a puppet band, stage a concert".
//
// Three screens, tuned for fast time-to-fun:
//   splash  — logo + Tap to Play (+ live waving mascot greeters)
//   build   — grid of the rigged puppets; tap a friend to add them to the band
//             (max 5, show starts at 2), tap their instrument badge to cycle
//             instruments (preview note on every tap; one-press-path, no drag)
//   concert — the band stands on the rainbow stage playing a real song
//             (shared/js/music.js schedules pitch-shifted samples); every
//             member grooves and accents on their own notes; tapping a member
//             triggers a beat-quantized solo riff, and the round badge above
//             each performer cycles their instrument live. Next-song cycles
//             the set list. No fail states — it's a sandbox.
//
// Reuses: theater.js (cast on stage, props pinned to paws), music.js (band
// audio), voice-clips.js (recorded narrator), sfx/speech unlocks.
//
// config shape (see games/my-puppet-band/config.js):
// { id, engine:'puppet-band', title, menu:{backdrop,mascots:[ids]},
//   cast:[charIds], instruments:[{id,emoji,floor?}],
//   defaultInstrumentByChar:{char:instrId}, defaultBand:[{char,instr}],
//   props:{instrId:'./assets/props/x.png'},   // art (emoji badge fallback)
//   voice:{...}, songs:[{id,title,bpm,beatsPerBar,bars,swing?,scale,parts}] }

import * as sfx from '../sfx.js';
import * as speech from '../speech.js';
import * as voiceClips from '../voice-clips.js';
import * as music from '../music.js';
import { createStage } from '../stage/stage.js';
import { createTheater } from '../stage/theater.js';
import { createPuppet, loadRigArt } from '../stage/puppet.js';
import { to, ease } from '../stage/tween.js';
import { burst } from '../stage/particles.js';

const FONT_URL = new URL('../../fonts/fredoka-latin-600-normal.woff2', import.meta.url).href;
const HOME_IMG = new URL('../../assets/ui/btn-home.png', import.meta.url).href;
const BACK_IMG = new URL('../../assets/ui/btn-back.png', import.meta.url).href;
const SOUND_IMG = new URL('../../assets/ui/btn-sound.png', import.meta.url).href;
const SHUFFLE_IMG = new URL('../../assets/ui/btn-shuffle.png', import.meta.url).href;
const CHAR_BASE = new URL('../../characters/', import.meta.url);
const INSTRUMENTS_MANIFEST = new URL('../../assets/instruments/manifest.json', import.meta.url).href;

const MAX_BAND = 5;
const MIN_BAND = 2;
const IDLE_HINT_MS = 12000;
const ACTOR_SCALE = 0.8;          // playtest: puppets ~30% bigger, feet on the floor
const DEFAULT_FLOOR_Y = 0.88;     // per-song override via song.floorY

// which performance animation each instrument plays (acting-clips pack)
const PLAY_CLIPS = {
  drum: 'play-drum', bongos: 'play-drum',
  guitar: 'play-strum',
  trumpet: 'play-blow', saxophone: 'play-blow', clarinet: 'play-blow', flute: 'play-blow', horn: 'play-blow',
  piano: 'play-keys', vibraphone: 'play-keys',
  maracas: 'play-shake', cymbal: 'play-shake',
};

let styleInstalled = false;

export function createGame(config, mountEl) {
  if (!mountEl) throw new Error('puppet-band requires a mount element');
  installStyle();
  return new PuppetBandGame(config, mountEl);
}

class PuppetBandGame {
  constructor(config, mountEl) {
    this.config = normalizeConfig(config);
    this.mountEl = mountEl;
    this.destroyed = false;
    this.previousDebug = window.QLOBE_DEBUG;

    this.screen = 'splash';        // splash | build | concert
    this.band = [];                // [{ char, instr }] in stage order
    this.songIndex = 0;
    this.audioUnlocked = false;
    this.muted = false;
    this.targetMap = new Map();
    this.targetSeq = 0;
    this.rng = Math.random;
    this.idleTimer = 0;
    this.hintGiven = false;
    this.soloToken = 0;

    this.stage = null;
    this.theater = null;
    this.members = [];             // concert actors [{ actor, instr, target }]
    this.playing = null;           // music controller
    this.removeResize = null;
    this.badgeTicker = null;
    this.stageGeneration = 0;
    this.songGeneration = 0;
    this.activeBackdrop = null;
    this.mascotGeneration = 0;
    this.mascots = null;
    this.activeTweens = new Set();

    this.onFirstPointer = () => this.unlockAudio();
    this.onContextMenu = (e) => e.preventDefault();
    this.onGestureStart = (e) => e.preventDefault();
    window.addEventListener('pointerdown', this.onFirstPointer);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('gesturestart', this.onGestureStart);

    this.mountEl.addEventListener('click', (event) => {
      if (event.target && event.target.closest && event.target.closest('.qk-pb-back')) {
        this.renderBuild();
      }
    });

    this.ready = Promise.all([
      voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', {}).catch(() => {}),
      music.init(INSTRUMENTS_MANIFEST),
    ]).then(() => {});
    this.renderSplash();
    this.installDebugHook();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopConcert();
    this.disposeStage();
    voiceClips.stop();
    speech.stop();
    window.removeEventListener('pointerdown', this.onFirstPointer);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('gesturestart', this.onGestureStart);
    this.mountEl.innerHTML = '';
    this.targetMap.clear();
    if (window.QLOBE_DEBUG === this.debugHook) {
      if (this.previousDebug) window.QLOBE_DEBUG = this.previousDebug;
      else delete window.QLOBE_DEBUG;
    }
  }

  unlockAudio() {
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;
    sfx.unlock();
    speech.unlock();
    voiceClips.unlock();
    music.unlock();
  }

  installDebugHook() {
    this.debugHook = {
      version: 1,
      gameId: this.config.id,
      engine: 'puppet-band',
      ready: this.ready,
      listModes: () => this.config.songs.map((s) => ({ id: s.id, title: s.title })),
      startMode: (id) => this.debugStart(id),
      getState: () => this.getState(),
      getTargets: () => this.getTargets(),
      tap: (targetId) => this.tapTarget(targetId),
      winRound: () => this.debugStart(this.config.songs[this.songIndex].id),
      mute: () => this.mute(),
      seed: (n) => { this.rng = mulberry32(Number(n) || 0); },
      // additive
      getBand: () => this.band.slice(),
      musicStats: () => music.stats(),
      attachAnalyser: () => music.attachAnalyser(),
      _theater: () => this.theater,
    };
    window.QLOBE_DEBUG = this.debugHook;
  }

  async debugStart(songId) {
    await this.ready;
    if (this.destroyed) return;
    const idx = this.config.songs.findIndex((s) => s.id === songId);
    if (idx >= 0) this.songIndex = idx;
    if (this.band.length < MIN_BAND) {
      this.band = this.config.defaultBand.slice(0, MAX_BAND)
        .map((m) => ({ char: m.char, instr: m.instr }));
    }
    await this.renderConcert();
  }

  // --- splash ---------------------------------------------------------------------

  renderSplash() {
    this.disposeStage();
    this.screen = 'splash';
    this.targetMap.clear();
    voiceClips.stop();
    speech.stop();

    this.mountEl.innerHTML = `
      <section class="qk-pb qk-pb-splash" aria-label="${escapeAttr(this.config.title)}">
        ${backdropMarkup(this.config, 'splash')}
        <div class="qk-pb-scrim" aria-hidden="true"></div>
        <div class="qk-pb-mascot-stage" aria-hidden="true"></div>
        <a class="qk-pb-home qk-pb-img-btn" href="../../" aria-label="Home"></a>
        <div class="qk-pb-center">
          <div class="qk-pb-logo">${titleMarkup(this.config.title)}</div>
          <button class="qk-pb-play-big" type="button">Tap to Play</button>
        </div>
        <div class="qk-pb-instrument-deco" aria-hidden="true">
          ${['trumpet', 'piano'].map((id) => this.config.props[id]
            ? `<span><img src="${escapeAttr(this.config.props[id])}" alt="" draggable="false" /></span>` : '').join('')}
        </div>
      </section>
    `;
    const play = this.mountEl.querySelector('.qk-pb-play-big');
    play.addEventListener('pointerdown', (e) => { e.preventDefault(); this.unlockAudio(); this.playSfx('tick'); });
    play.addEventListener('click', () => this.renderBuild());
    this.bootMascots();
  }

  async bootMascots() {
    const ids = (this.config.menu.mascots || []).slice(0, 2);
    const host = this.mountEl.querySelector('.qk-pb-mascot-stage');
    if (!ids.length || !host) return;
    const generation = ++this.mascotGeneration;
    let stage;
    try { stage = await createStage(host); } catch { return; }
    if (this.destroyed || this.screen !== 'splash' || generation !== this.mascotGeneration) { stage.destroy(); return; }
    const puppets = [];
    const timers = [];
    this.mascots = { destroy() { timers.forEach(clearTimeout); puppets.forEach((p) => p.puppet.destroy()); stage.destroy(); } };
    for (let i = 0; i < ids.length; i++) {
      try {
        const base = new URL(`${ids[i]}/`, CHAR_BASE);
        const rig = await (await fetch(new URL('rig.json', base))).json();
        if (this.destroyed || generation !== this.mascotGeneration) return;
        const factory = await loadRigArt(stage.PIXI, rig, base.href);
        if (this.destroyed || generation !== this.mascotGeneration) return;
        const puppet = createPuppet(stage.PIXI, rig, { partFactory: factory });
        stage.root.addChild(puppet.view);
        puppets.push({ puppet, rig, side: i === 0 ? -1 : 1 });
      } catch { /* decoration never blocks */ }
    }
    if (!puppets.length) return;
    const place = (w, h) => {
      for (const m of puppets) {
        const k = (Math.min(w, h) / (m.rig.canvas || 1024)) * 0.55;
        m.puppet.view.scale.set(m.side === 1 ? -k : k, k);
        const drop = ((m.rig.ground || (m.rig.canvas || 1024) * 0.9) - m.rig.anchor.y) * k;
        m.puppet.view.position.set(m.side === -1 ? w * 0.06 : w * 0.94, h * 1.0 - drop);
      }
    };
    const offResize = stage.onResize(place);
    const prevDestroy = this.mascots.destroy;
    this.mascots.destroy = () => { offResize(); prevDestroy(); };
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const waveLoop = (m, first) => {
        const t = setTimeout(() => {
          if (this.destroyed || generation !== this.mascotGeneration) return;
          m.puppet.playClip('wave', { loop: false, onDone: () => m.puppet.playClip('idle') });
          waveLoop(m, false);
        }, (first ? 1800 : 4200) + Math.random() * 4200);
        timers.push(t);
      };
      puppets.forEach((m, i) => waveLoop(m, i === 0));
    }
  }

  disposeMascots() {
    this.mascotGeneration += 1;
    if (this.mascots) { this.mascots.destroy(); this.mascots = null; }
  }

  // --- build your band ---------------------------------------------------------------

  renderBuild() {
    this.stopConcert();
    this.disposeStage();
    this.screen = 'build';
    this.targetMap.clear();
    this.targetSeq = 0;
    voiceClips.stop();

    const tiles = this.config.cast.map((id) => {
      const instr = this.instrFor(id);
      return `
      <div class="qk-pb-tile" data-char="${escapeAttr(id)}">
        <button class="qk-pb-puppet" type="button" data-char="${escapeAttr(id)}" aria-label="${escapeAttr(id)} joins the band">
          <img src="${escapeAttr(new URL(`${id}/anim/head-ts.png`, CHAR_BASE).href)}"
               onerror="this.onerror=null;this.src='${escapeAttr(new URL(`${id}/parts/head.png`, CHAR_BASE).href)}'"
               alt="" draggable="false" />
          <span class="qk-pb-puppet-name">${escapeHtml(characterName(id))}</span>
          <span class="qk-pb-order" aria-hidden="true"></span>
        </button>
        <button class="qk-pb-badge" type="button" data-char="${escapeAttr(id)}"
                aria-label="change instrument">${this.badgeMarkup(instr)}</button>
      </div>`;
    }).join('');

    this.mountEl.innerHTML = `
      <section class="qk-pb qk-pb-build" aria-label="Build your band">
        ${backdropMarkup(this.config, 'build')}
        <div class="qk-pb-scrim" aria-hidden="true"></div>
        <button class="qk-pb-back qk-pb-img-btn" type="button" aria-label="Back to the title"></button>
        <button class="qk-pb-build-sound qk-pb-img-btn" type="button" aria-label="Hear the instructions again"></button>
        <div class="qk-pb-center">
          <div class="qk-pb-build-title">
            <h1>Build your band</h1>
            <div class="qk-pb-pill" aria-live="polite"><span id="qk-pb-count">0</span> of ${MAX_BAND} friends</div>
          </div>
          <div class="qk-pb-grid">${tiles}</div>
          <div class="qk-pb-build-footer">
            <div class="qk-pb-build-help"><span aria-hidden="true">♫</span> Tap an instrument to hear it</div>
            <button class="qk-pb-show" type="button" disabled>Play Show!</button>
          </div>
        </div>
      </section>
    `;

    // back on build goes to splash (delegated handler targets qk-pb-back → build; override here)
    this.mountEl.querySelector('.qk-pb-back').addEventListener('click', (e) => {
      e.stopPropagation();
      this.renderSplash();
    }, { capture: true });
    this.mountEl.querySelector('.qk-pb-build-sound').addEventListener('click', () => {
      this.unlockAudio();
      this.speakNarr('build-join', this.config.voice.buildJoin);
    });

    this.mountEl.querySelectorAll('.qk-pb-puppet').forEach((btn) => {
      const id = this.nextTargetId('puppet');
      this.targetMap.set(id, { id, el: btn, role: 'neutral', action: () => this.toggleMember(btn.dataset.char) });
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.unlockAudio(); });
      btn.addEventListener('click', () => this.tapTarget(id));
    });
    this.mountEl.querySelectorAll('.qk-pb-badge').forEach((btn) => {
      const id = this.nextTargetId('badge');
      this.targetMap.set(id, { id, el: btn, role: 'neutral', action: () => this.cycleInstrument(btn.dataset.char) });
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.unlockAudio(); });
      btn.addEventListener('click', () => this.tapTarget(id));
    });
    const show = this.mountEl.querySelector('.qk-pb-show');
    const showId = this.nextTargetId('show');
    this.targetMap.set(showId, { id: showId, el: show, role: 'correct', action: () => this.startShow() });
    show.addEventListener('pointerdown', (e) => { e.preventDefault(); this.unlockAudio(); this.playSfx('tick'); });
    show.addEventListener('click', () => this.tapTarget(showId));

    this.refreshBuild();
    this.speakNarr('build-join', this.config.voice.buildJoin);
  }

  instrFor(char) {
    const m = this.band.find((b) => b.char === char);
    return m ? m.instr : (this.config.defaultInstrumentByChar[char] || this.config.instruments[0].id);
  }

  badgeMarkup(instrId) {
    const def = this.config.instruments.find((i) => i.id === instrId) || {};
    const art = this.config.props[instrId];
    if (art) {
      return `<img src="${escapeAttr(art)}" alt="" draggable="false"
        onerror="this.onerror=null;this.replaceWith(document.createTextNode('${escapeAttr(def.emoji || '🎵')}'))" />`;
    }
    return escapeHtml(def.emoji || '🎵');
  }

  toggleMember(char) {
    const i = this.band.findIndex((b) => b.char === char);
    if (i >= 0) {
      this.band.splice(i, 1);
      this.playSfx('unpop');
    } else {
      if (this.band.length >= MAX_BAND) { this.playSfx('boing'); return; }
      this.band.push({ char, instr: this.instrFor(char) });
      this.playSfx('pop');
      music.preview(this.band[this.band.length - 1].instr);
      if (this.band.length === MAX_BAND) this.speakNarr('full-band', this.config.voice.fullBand);
      else if (this.band.length === MIN_BAND) this.speakNarr('build-ready', this.config.voice.buildReady);
    }
    this.refreshBuild();
  }

  cycleInstrument(char) {
    const taken = new Set(this.band.filter((b) => b.char !== char).map((b) => b.instr));
    const list = this.config.instruments.map((i) => i.id).filter((id) => !taken.has(id));
    const cur = this.instrFor(char);
    const next = list[(list.indexOf(cur) + 1) % list.length] || cur;
    const member = this.band.find((b) => b.char === char);
    if (member) member.instr = next;
    else this.config.defaultInstrumentByChar[char] = next;
    music.preview(next);
    this.playSfx('tick');
    this.refreshBuild();
  }

  refreshBuild() {
    if (this.screen !== 'build') return;
    this.mountEl.querySelectorAll('.qk-pb-tile').forEach((tile) => {
      const char = tile.dataset.char;
      const idx = this.band.findIndex((b) => b.char === char);
      tile.classList.toggle('is-in', idx >= 0);
      tile.querySelector('.qk-pb-order').textContent = idx >= 0 ? String(idx + 1) : '';
      tile.querySelector('.qk-pb-badge').innerHTML = this.badgeMarkup(this.instrFor(char));
    });
    const count = this.mountEl.querySelector('#qk-pb-count');
    if (count) count.textContent = String(this.band.length);
    const show = this.mountEl.querySelector('.qk-pb-show');
    if (show) show.disabled = this.band.length < MIN_BAND;
  }

  startShow() {
    if (this.band.length < MIN_BAND) return;
    this.renderConcert();
  }

  // --- concert -----------------------------------------------------------------------

  async renderConcert() {
    this.disposeStage();
    this.screen = 'concert';
    this.targetMap.clear();
    this.targetSeq = 0;
    this.hintGiven = false;

    this.mountEl.innerHTML = `
      <section class="qk-pb qk-pb-concert" aria-label="${escapeAttr(this.config.title)}">
        <header class="qk-pb-hud">
          <button class="qk-pb-back qk-pb-img-btn" type="button" aria-label="Back to band building"></button>
          <div class="qk-pb-songpill" aria-live="polite"></div>
          <button class="qk-pb-next qk-pb-img-btn" type="button" aria-label="Next song"></button>
        </header>
        <main class="qk-pb-stagehost"></main>
        <div class="qk-pb-carousel" aria-label="Swap band members"></div>
        <button class="qk-pb-sound qk-pb-img-btn" type="button" aria-label="Hear the hint again"></button>
      </section>
    `;
    const next = this.mountEl.querySelector('.qk-pb-next');
    next.addEventListener('pointerdown', (e) => { e.preventDefault(); this.unlockAudio(); this.playSfx('tick'); });
    next.addEventListener('click', () => this.nextSong());
    const sound = this.mountEl.querySelector('.qk-pb-sound');
    sound.addEventListener('pointerdown', (e) => e.stopPropagation());
    sound.addEventListener('click', () => this.speakNarr('solo-hint', this.config.voice.soloHint));

    const host = this.mountEl.querySelector('.qk-pb-stagehost');
    const generation = ++this.stageGeneration;
    const stage = await createStage(host);
    if (this.destroyed || this.screen !== 'concert' || generation !== this.stageGeneration) { stage.destroy(); return; }
    this.stage = stage;
    const initialBackdrop = this.currentSong().backdrop || this.config.stageBackdrop;
    const theater = await createTheater(stage, {
      backdrop: initialBackdrop,
      floorY: this.currentSong().floorY || DEFAULT_FLOOR_Y,
      worldScale: 1.4,
    });
    if (this.destroyed || generation !== this.stageGeneration) { theater.destroy(); stage.destroy(); return; }
    this.theater = theater;
    this.activeBackdrop = initialBackdrop;
    stage.root.addChild(theater.view);

    // the band takes the stage (slot ids stay stable across joins/removals)
    this.members = [];
    this.memberSlot = 0;
    music.clearMemberMutes();
    for (let i = 0; i < this.band.length; i++) {
      await this.addMemberToStage(this.band[i], generation);
      if (this.destroyed || generation !== this.stageGeneration) return;
    }
    this.layoutBand(false);
    this.renderCarousel();
    this.badgeTicker = () => this.positionStageInstrumentBadges();
    stage.app.ticker.add(this.badgeTicker);
    this.positionStageInstrumentBadges();
    this.removeResize = stage.onResize(() => {});

    await this.playCurrentSong();
    this.scheduleHint();
  }

  // Mount one band member on stage: puppet + instrument prop + stool (behind).
  async addMemberToStage(bandEntry, generation, { enter = false } = {}) {
    const T = this.theater;
    const slot = ++this.memberSlot;
    const name = `m${slot}`;
    const actor = await T.addActor(name, bandEntry.char, {
      x: enter ? 1.25 : 0.5, flip: false, scale: ACTOR_SCALE,
      widthShare: Math.min(0.4, 1.15 / Math.max(1, this.band.length)),
    });
    if (this.destroyed || generation !== this.stageGeneration) return null;

    await T.addProp(`s${slot}`, {
      art: this.config.props.stool, color: '#a8763e', scale: 0.34,
      fx: 0.5, fy: T.floorY - 0.02, layer: 'back',
    });
    const instrDef = this.config.instruments.find((x) => x.id === bandEntry.instr) || {};
    const propDef = this.performancePropDef(name, bandEntry.instr, 0.5);
    await T.addProp(`p${slot}`, propDef);
    if (this.destroyed || generation !== this.stageGeneration) return null;

    const id = this.nextTargetId('member');
    const member = { actor, slot, name, char: bandEntry.char, instr: bandEntry.instr, floor: !!instrDef.floor, sitting: false, id };
    actor.puppet.playClip(this.playClipFor(member));
    actor.puppet.view.eventMode = 'static';
    actor.puppet.view.cursor = 'pointer';
    actor.puppet.view.on('pointerdown', (e) => {
      if (e && e.preventDefault) e.preventDefault();
      this.unlockAudio();
      this.tapTarget(id);
    });
    this.targetMap.set(id, { id, member, role: 'neutral', action: () => this.solo(member) });

    // the stool is the sit/stand toggle
    const stool = T.props[`s${slot}`];
    const stoolId = this.nextTargetId('stool');
    stool.sprite.eventMode = 'static';
    stool.sprite.cursor = 'pointer';
    stool.sprite.on('pointerdown', (e) => {
      if (e && e.preventDefault) e.preventDefault();
      this.unlockAudio();
      this.tapTarget(stoolId);
    });
    this.targetMap.set(stoolId, { id: stoolId, member, stool: true, role: 'neutral', action: () => this.toggleSit(member) });
    member.stoolId = stoolId;
    this.addStageInstrumentBadge(member);
    this.members.push(member);
    return member;
  }

  performancePropDef(holder, instrId, fx = 0.5) {
    const def = this.config.instruments.find((instrument) => instrument.id === instrId) || {};
    const prop = {
      art: this.config.props[instrId],
      color: def.color || '#e8b23a',
      scale: def.floor ? 0.5 : 0.3,
    };
    if (def.floor) { prop.fx = fx; prop.fy = this.theater.floorY + 0.03; }
    else { prop.holder = holder; prop.handBone = 'arm-lower.R'; prop.handOffset = [0, 110]; }
    return prop;
  }

  addStageInstrumentBadge(member) {
    const host = this.mountEl.querySelector('.qk-pb-stagehost');
    if (!host) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'qk-pb-stage-instrument';
    button.dataset.slot = String(member.slot);
    button.innerHTML = this.badgeMarkup(member.instr);
    this.updateStageInstrumentBadge(member, button);
    host.appendChild(button);
    const id = this.nextTargetId('instrument');
    this.targetMap.set(id, {
      id, el: button, kind: 'instrument', member, role: 'neutral',
      action: () => this.cycleStageInstrument(member),
    });
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.unlockAudio();
    });
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.tapTarget(id);
    });
    member.instrumentBadgeId = id;
    member.instrumentBadgeEl = button;
  }

  updateStageInstrumentBadge(member, button = member.instrumentBadgeEl) {
    if (!button) return;
    button.innerHTML = this.badgeMarkup(member.instr);
    button.setAttribute('aria-label', `Change ${characterName(member.char)}'s instrument. Current: ${member.instr}`);
  }

  positionStageInstrumentBadges() {
    if (!this.stage || this.screen !== 'concert') return;
    const host = this.mountEl.querySelector('.qk-pb-stagehost');
    const canvas = this.stage.app.canvas;
    if (!host || !canvas) return;
    const hostRect = host.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const { w, h } = this.stage.size();
    const sx = w ? canvasRect.width / w : 1;
    const sy = h ? canvasRect.height / h : 1;
    this.members.forEach((member) => {
      const button = member.instrumentBadgeEl;
      if (!button || !member.actor || !member.actor.puppet) return;
      const bounds = member.actor.puppet.view.getBounds();
      const x = canvasRect.left - hostRect.left + (bounds.x + bounds.width / 2) * sx;
      const y = canvasRect.top - hostRect.top + Math.max(34, bounds.y * sy - 12);
      button.style.left = `${x}px`;
      button.style.top = `${y}px`;
    });
  }

  async cycleStageInstrument(member) {
    if (this.screen !== 'concert' || !this.theater || member.instrumentBusy || !this.members.includes(member)) return;
    const taken = new Set(this.members.filter((item) => item !== member).map((item) => item.instr));
    const choices = this.config.instruments.map((instrument) => instrument.id).filter((id) => !taken.has(id));
    const next = choices[(choices.indexOf(member.instr) + 1) % choices.length] || member.instr;
    if (next === member.instr) return;
    const generation = this.stageGeneration;
    member.instrumentBusy = true;
    if (member.instrumentBadgeEl) member.instrumentBadgeEl.disabled = true;
    try {
      this.theater.removeProp(`p${member.slot}`);
      const fx = member.actor.fx == null ? 0.5 : member.actor.fx;
      const prop = await this.theater.addProp(`p${member.slot}`, this.performancePropDef(member.name, next, fx));
      if (this.destroyed || generation !== this.stageGeneration || !this.members.includes(member)) {
        this.theater && this.theater.removeProp(`p${member.slot}`);
        return;
      }
      const def = this.config.instruments.find((instrument) => instrument.id === next) || {};
      member.instr = next;
      member.floor = !!def.floor;
      prop.sprite.visible = !member.sitting;
      this.config.defaultInstrumentByChar[member.char] = next;
      this.updateStageInstrumentBadge(member);
      member.actor.puppet.playClip(this.playClipFor(member));
      this.layoutBand(false);
      this.syncMusic();
      music.preview(next);
      this.playSfx('tick');
      this.theater.playFx('sparkle', member.actor.name);
    } finally {
      member.instrumentBusy = false;
      if (member.instrumentBadgeEl) member.instrumentBadgeEl.disabled = false;
    }
  }

  playClipFor(member) {
    if (member.sitting) return 'sit-nod';
    return PLAY_CLIPS[member.instr] || 'groove';
  }

  // Recompute stage marks for the current band size; puppets/props slide over.
  layoutBand(animate = true) {
    const T = this.theater;
    if (!T) return;
    const n = this.members.length;
    const spread = Math.min(0.21, 0.8 / Math.max(1, n - 1));
    this.members.forEach((m, i) => {
      const fx = 0.5 + (i - (n - 1) / 2) * spread;
      m.actor.widthShare = Math.min(0.4, 1.15 / Math.max(1, n));
      if (animate) T.moveActor(m.actor, fx, { ms: 700 });
      else { m.actor.fx = fx; T.placeActor(m.actor); }
      T.placeProp(`s${m.slot}`, fx + 0.005, T.floorY - 0.02, { ms: animate ? 700 : 0 });
      if (m.floor) T.placeProp(`p${m.slot}`, fx, T.floorY + 0.03, { ms: animate ? 700 : 0 });
    });
  }

  // --- live roster (carousel) --------------------------------------------------------

  renderCarousel() {
    const host = this.mountEl.querySelector('.qk-pb-carousel');
    if (!host) return;
    host.innerHTML = this.config.cast.map((id) => `
      <button class="qk-pb-caro" type="button" data-char="${escapeAttr(id)}" aria-label="${escapeAttr(id)}">
        <img src="${escapeAttr(new URL(`${id}/anim/head-ts.png`, CHAR_BASE).href)}"
             onerror="this.onerror=null;this.src='${escapeAttr(new URL(`${id}/parts/head.png`, CHAR_BASE).href)}'"
             alt="" draggable="false" />
        <span class="qk-pb-caro-order" aria-hidden="true"></span>
      </button>
    `).join('');
    host.querySelectorAll('.qk-pb-caro').forEach((btn) => {
      const id = this.nextTargetId('caro');
      this.targetMap.set(id, { id, el: btn, role: 'neutral', action: () => this.handleRosterTap(btn.dataset.char) });
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.unlockAudio(); });
      btn.addEventListener('click', () => this.tapTarget(id));
    });
    this.refreshCarousel();
  }

  refreshCarousel() {
    this.mountEl.querySelectorAll('.qk-pb-caro').forEach((btn) => {
      const idx = this.members.findIndex((m) => m.char === btn.dataset.char);
      btn.classList.toggle('is-in', idx >= 0);
      btn.querySelector('.qk-pb-caro-order').textContent = idx >= 0 ? String(idx + 1) : '';
    });
  }

  async handleRosterTap(char) {
    if (this.screen !== 'concert' || this.rosterBusy) return;
    const generation = this.stageGeneration;
    const existing = this.members.findIndex((m) => m.char === char);
    this.rosterBusy = true;
    try {
      if (existing >= 0) {
        // tapping an on-stage member's tile removes them (keep at least two)
        if (this.members.length <= MIN_BAND) { this.playSfx('boing'); return; }
        this.playSfx('unpop');
        await this.removeMemberFromStage(existing, generation);
      } else if (this.members.length < MAX_BAND) {
        this.playSfx('pop');
        await this.joinMember(char, generation);
      } else {
        // full house: the newcomer swaps in for a random member
        const r = Math.floor(this.rng() * this.members.length);
        this.playSfx('whoosh');
        await this.removeMemberFromStage(r, generation);
        if (this.destroyed || generation !== this.stageGeneration) return;
        await this.joinMember(char, generation);
      }
    } finally {
      this.rosterBusy = false;
    }
  }

  async joinMember(char, generation) {
    const taken = new Set(this.members.map((m) => m.instr));
    let instr = this.config.defaultInstrumentByChar[char];
    if (!instr || taken.has(instr)) {
      instr = this.config.instruments.map((i) => i.id).find((id) => !taken.has(id)) || instr;
    }
    const entry = { char, instr };
    const member = await this.addMemberToStage(entry, generation, { enter: true });
    if (!member || this.destroyed || generation !== this.stageGeneration) return;
    music.preview(instr);
    this.layoutBand(true);
    this.refreshCarousel();
    this.syncMusic();
  }

  async removeMemberFromStage(index, generation) {
    const T = this.theater;
    const m = this.members[index];
    if (!m || !T) return;
    this.members.splice(index, 1);
    this.targetMap.delete(m.id);
    this.targetMap.delete(m.stoolId);
    this.targetMap.delete(m.instrumentBadgeId);
    if (m.instrumentBadgeEl) m.instrumentBadgeEl.remove();
    this.syncMusic();               // band shrinks immediately; walk-off is visual
    this.layoutBand(true);
    this.refreshCarousel();
    const name = m.name, slot = m.slot;
    await T.moveActor(m.actor, 1.3, { ms: 700 });
    if (this.destroyed || generation !== this.stageGeneration) return;
    T.removeActor(name);
    T.removeProp(`p${slot}`);
    T.removeProp(`s${slot}`);
  }

  // Push the CURRENT members into the scheduler without dropping the beat,
  // and re-derive the per-member mute set from who is sitting.
  syncMusic() {
    this.band = this.members.map((m) => ({ char: m.char, instr: m.instr }));
    music.clearMemberMutes();
    this.members.forEach((m, i) => { if (m.sitting) music.setMemberMuted(i, true); });
    music.updateBand(this.members.map((m) => ({ instr: m.instr })));
  }

  // --- chairs: sit a member down to mute their part ------------------------------------

  toggleSit(member) {
    if (this.screen !== 'concert' || !this.theater) return;
    member.sitting = !member.sitting;
    const idx = this.members.indexOf(member);
    music.setMemberMuted(idx, member.sitting);
    const instrProp = this.theater.props[`p${member.slot}`];
    if (instrProp) instrProp.sprite.visible = !member.sitting;
    member.actor.puppet.playClip(this.playClipFor(member));
    this.playSfx(member.sitting ? 'unpop' : 'pop');
    if (!member.sitting) this.theater.playFx('sparkle', member.actor.name);
  }

  currentSong() { return this.config.songs[this.songIndex % this.config.songs.length]; }

  async playCurrentSong() {
    const generation = ++this.songGeneration;
    const song = this.currentSong();
    const pill = this.mountEl.querySelector('.qk-pb-songpill');
    if (pill) pill.textContent = song.title;
    music.stopSong();
    const backdrop = song.backdrop || this.config.stageBackdrop;
    if (this.theater && backdrop && backdrop !== this.activeBackdrop) {
      this.activeBackdrop = backdrop;
      await this.theater.setBackdrop(backdrop);
    }
    if (generation !== this.songGeneration || this.destroyed || this.screen !== 'concert') return;
    if (this.theater) {
      this.theater.setFloorY(song.floorY || DEFAULT_FLOOR_Y);
      this.layoutBand(false);   // stools/floor instruments re-seat on the new floor
    }
    this.preloadNextBackdrop();
    await this.speakNarr(`song-${song.id}`, song.introText || `Here comes ${song.title}!`);
    if (generation !== this.songGeneration || this.destroyed || this.screen !== 'concert') return;
    this.playing = music.playSong(song, this.members.map((m) => ({ instr: m.instr })), {
      onNote: (memberIndex) => this.accent(memberIndex),
      onLoop: () => this.loopSparkle(),
    });
  }

  nextSong() {
    this.songIndex = (this.songIndex + 1) % this.config.songs.length;
    this.playCurrentSong();
  }

  preloadNextBackdrop() {
    const songs = this.config.songs;
    if (songs.length < 2) return;
    const next = songs[(this.songIndex + 1) % songs.length];
    const src = next.backdrop || this.config.stageBackdrop;
    if (!src) return;
    const image = new Image();
    image.decoding = 'async';
    image.src = new URL(src, document.baseURI).href;
  }

  stopConcert() {
    music.stopSong();
    this.playing = null;
  }

  accent(memberIndex) {
    const m = this.members[memberIndex];
    if (!m || m.sitting || this.destroyed || !this.theater) return;
    this.theater.setActorPose(m.actor, { torso: { scaleY: 1.07 } });
    setTimeout(() => {
      if (!this.destroyed && this.theater && this.members[memberIndex] === m) {
        this.theater.setActorPose(m.actor, { torso: { scaleY: 1 } });
      }
    }, 110);
  }

  loopSparkle() {
    if (!this.theater || this.muted) return;
    const { w, h } = this.stage.size();
    burst(this.stage.PIXI, this.theater.view, w / 2, h * 0.25, { count: 14, power: 5, life: 800 });
  }

  solo(member) {
    if (this.screen !== 'concert') return;
    if (member.sitting) { this.toggleSit(member); return; }   // tap a sitter → they stand back in
    this.playSfx('sparkle');
    const ms = music.soloRiff(member.instr, this.currentSong());
    this.theater.playFx('sparkle', member.actor.name);
    member.actor.puppet.playClip('cheer', {
      loop: false,
      onDone: () => { if (!this.destroyed && this.screen === 'concert') member.actor.puppet.playClip(this.playClipFor(member)); },
    });
    // the rest of the band lays out (audio is muted by music.js; visually they
    // drop to a polite idle and pick their instruments back up after)
    const token = ++this.soloToken;
    this.members.forEach((m) => { if (m !== member && !m.sitting) m.actor.puppet.playClip('idle'); });
    setTimeout(() => {
      if (this.destroyed || this.screen !== 'concert' || token !== this.soloToken) return;
      this.members.forEach((m) => { if (m !== member) m.actor.puppet.playClip(this.playClipFor(m)); });
      if (this.theater) this.theater.playFx('sparkle', member.actor.name);
    }, ms + 100);
  }

  scheduleHint() {
    clearTimeout(this.idleTimer);
    if (this.hintGiven) return;
    this.idleTimer = setTimeout(() => {
      if (this.destroyed || this.screen !== 'concert' || this.hintGiven) return;
      this.hintGiven = true;
      this.speakNarr('solo-hint', this.config.voice.soloHint);
    }, IDLE_HINT_MS);
  }

  // --- shared plumbing -----------------------------------------------------------------

  disposeStage() {
    this.disposeMascots();
    this.stageGeneration += 1;
    this.songGeneration += 1;
    this.activeBackdrop = null;
    clearTimeout(this.idleTimer);
    this.activeTweens.forEach((t) => t.cancel && t.cancel());
    this.activeTweens.clear();
    this.stopConcert();
    this.members.forEach((member) => { if (member.instrumentBadgeEl) member.instrumentBadgeEl.remove(); });
    if (this.stage && this.badgeTicker) this.stage.app.ticker.remove(this.badgeTicker);
    this.badgeTicker = null;
    if (this.theater) { this.theater.destroy(); this.theater = null; }
    if (this.removeResize) { this.removeResize(); this.removeResize = null; }
    if (this.stage) { this.stage.destroy(); this.stage = null; }
    this.members = [];
  }

  getState() {
    return {
      screen: this.screen,
      mode: this.currentSong().id,
      round: 0,
      roundsTotal: this.config.songs.length,
      awaitingInput: this.screen === 'build' || this.screen === 'concert',
      band: this.band.map((b) => `${b.char}:${b.instr}`),
      backdrop: this.currentSong().backdrop || this.config.stageBackdrop,
      notesScheduled: music.stats().notesScheduled,
    };
  }

  getTargets() {
    if (this.screen === 'build') {
      return Array.from(this.targetMap.values()).map((t) => {
        const r = t.el.getBoundingClientRect();
        return { id: t.id, role: t.el.disabled ? 'neutral' : t.role, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
      });
    }
    if (this.screen === 'concert' && this.stage) {
      const canvasRect = this.stage.app.canvas.getBoundingClientRect();
      const out = [];
      for (const t of this.targetMap.values()) {
        if (t.el) {   // carousel tiles + stage instrument badges (DOM)
          const r = t.el.getBoundingClientRect();
          out.push({ id: t.id, role: t.role, kind: t.kind || 'roster', rect: { x: r.x, y: r.y, w: r.width, h: r.height } });
        } else if (t.stool) {
          const s = this.theater && this.theater.props[`s${t.member.slot}`];
          if (!s) continue;
          const b = s.sprite.getBounds();
          out.push({ id: t.id, role: t.role, kind: 'stool', rect: { x: canvasRect.left + b.x, y: canvasRect.top + b.y, w: b.width, h: b.height } });
        } else if (t.member) {
          const b = t.member.actor.puppet.view.getBounds();
          out.push({ id: t.id, role: t.role, kind: 'member', rect: { x: canvasRect.left + b.x, y: canvasRect.top + b.y, w: b.width, h: b.height } });
        }
      }
      return out;
    }
    return [];
  }

  async tapTarget(targetId) {
    const target = this.targetMap.get(targetId);
    if (!target || this.destroyed) return { accepted: false };
    if (target.el && target.el.disabled) return { accepted: false };
    this.scheduleHint();
    await target.action();
    return { accepted: true };
  }

  mute() {
    this.muted = true;
    music.setMuted(true);
    voiceClips.stop();
    speech.stop();
  }

  async speakNarr(key, text) {
    if (this.muted || (!key && !text)) return;
    await voiceClips.say(key || 'x', text || '');
  }

  playSfx(name) {
    if (this.muted || !sfx[name]) return;
    sfx[name]();
  }

  nextTargetId(prefix) {
    this.targetSeq += 1;
    return `${prefix}-${this.targetSeq}`;
  }
}

// --- config / helpers -------------------------------------------------------------

function normalizeConfig(config) {
  const voice = {
    intro: 'Welcome to your puppet band!',
    buildJoin: 'Tap a friend to join the band!',
    buildInstrument: 'Tap an instrument to hear it!',
    buildReady: 'Ready? Tap Play Show!',
    fullBand: 'Your band is full! Tap Play Show!',
    soloHint: 'Tap a puppet for a solo!',
    showCheer: 'What a wonderful band!',
    ...(config.voice || {}),
  };
  return {
    id: config.id || 'puppet-band',
    title: config.title || 'My Puppet Band',
    menu: config.menu || {},
    cast: config.cast || [],
    instruments: config.instruments || [],
    defaultInstrumentByChar: { ...(config.defaultInstrumentByChar || {}) },
    defaultBand: config.defaultBand || [],
    props: config.props || {},
    stageBackdrop: config.stageBackdrop || null,
    songs: config.songs || [],
    ...{},
    voice,
  };
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function backdropMarkup(config, screen = 'splash') {
  const menu = config.menu || {};
  const src = screen === 'build'
    ? (menu.buildBackdrop || menu.backdrop)
    : (menu.splashBackdrop || menu.backdrop);
  return src ? `<img class="qk-pb-backdrop" src="${escapeAttr(src)}" alt="" draggable="false" aria-hidden="true" />` : '';
}

function titleMarkup(title) {
  const words = String(title).split(' ');
  const rainbow = ['#ff8238', '#ffd326', '#72cf35', '#35b9ed', '#9b66e7', '#f064b6'];
  return words.map((word, wi) => `
    <span class="qk-pb-logo-word qk-pb-logo-word-${wi}">${[...word].map((ch, i) => {
      const color = wi === 0 ? '#fffdf3' : wi === words.length - 1 ? (i % 2 ? '#ff9b14' : '#ffc526') : rainbow[i % rainbow.length];
      return `<span style="color:${color}">${escapeHtml(ch)}</span>`;
    }).join('')}</span>
  `).join(' ');
}

function characterName(id) {
  return String(id || '').split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}
function escapeAttr(value) { return escapeHtml(value); }

function installStyle() {
  if (styleInstalled || document.getElementById('qk-pb-style')) { styleInstalled = true; return; }
  const style = document.createElement('style');
  style.id = 'qk-pb-style';
  style.textContent = `
    @font-face {
      font-family: 'Fredoka';
      src: url('${FONT_URL}') format('woff2');
      font-weight: 600; font-style: normal; font-display: swap;
    }
    .qk-pb, .qk-pb * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    .qk-pb {
      --navy: #17517e; --white: #fff;
      --shadow: 0 6px 0 rgba(23,81,126,.18), 0 14px 30px rgba(23,81,126,.18);
      position: relative; height: 100dvh; width: 100%; overflow: hidden;
      color: var(--navy);
      font-family: 'Fredoka', 'Arial Rounded MT Bold', 'Trebuchet MS', sans-serif;
      font-weight: 600;
      background: linear-gradient(#bee3f5, #e8f6ff 70%);
      touch-action: manipulation; user-select: none; -webkit-user-select: none;
      -webkit-touch-callout: none; overscroll-behavior: none;
    }
    .qk-pb button { font: inherit; color: inherit; border: 0; cursor: pointer; touch-action: manipulation; }
    .qk-pb button:focus-visible, .qk-pb a:focus-visible { outline: 5px solid rgba(45,125,210,.65); outline-offset: 4px; }
    .qk-pb-backdrop { position: absolute; z-index: 0; inset: 0; width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
    .qk-pb-scrim { position: absolute; z-index: 1; inset: 0; pointer-events: none;
      background: radial-gradient(circle at 50% 43%, rgba(255,255,255,.13), rgba(255,255,255,0) 44%); }
    .qk-pb-mascot-stage { position: absolute; z-index: 2; inset: 0; pointer-events: none; }
    .qk-pb-mascot-stage canvas { display: block; width: 100%; height: 100%; pointer-events: none; }
    .qk-pb-img-btn {
      display: grid; place-items: center; width: 96px; height: 96px; border-radius: 50%;
      background: transparent center / 84px 84px no-repeat; text-decoration: none;
      filter: drop-shadow(0 5px 0 rgba(14,63,130,.18)) drop-shadow(0 8px 8px rgba(6,44,113,.18));
    }
    .qk-pb-img-btn:active { transform: scale(.93); }
    .qk-pb-home { background-image: url('${HOME_IMG}'); }
    .qk-pb-back { background-image: url('${BACK_IMG}'); }
    .qk-pb-sound { background-image: url('${SOUND_IMG}'); }
    .qk-pb-next { background-image: url('${SHUFFLE_IMG}'); }
    .qk-pb-home, .qk-pb-back { position: absolute; top: max(12px, env(safe-area-inset-top)); left: max(12px, env(safe-area-inset-left)); z-index: 6; }
    .qk-pb-center {
      position: relative; z-index: 3; height: 100%;
      display: grid; align-content: center; justify-items: center;
      gap: clamp(10px, 2vmin, 22px); text-align: center;
      padding: max(18px, env(safe-area-inset-top)) 18px max(18px, env(safe-area-inset-bottom));
    }
    .qk-pb-splash .qk-pb-center { align-content: center; gap: clamp(26px, 5vmin, 52px); transform: translateY(-4vh); }
    .qk-pb-logo {
      position: relative; display: grid; justify-items: center;
      min-width: min(570px, 66vw); padding: 24px 54px 30px;
      font-size: clamp(48px, 8.5vmin, 94px); line-height: .72; letter-spacing: -.045em;
      transform: rotate(-1.5deg);
      filter: drop-shadow(0 10px 0 rgba(20,62,133,.26)) drop-shadow(0 18px 20px rgba(11,61,133,.25));
    }
    .qk-pb-logo::before {
      content: ''; position: absolute; z-index: -1; inset: 4% -2% -2%;
      border-radius: 46% 52% 43% 50%;
      background: linear-gradient(180deg, #168be4, #075db9);
      border: clamp(5px, .75vmin, 9px) solid #fff;
      box-shadow: inset 0 -10px 0 rgba(0,43,119,.24), 0 0 0 6px #004ca7;
    }
    .qk-pb-logo-word { display: block; margin: 0; -webkit-text-stroke: clamp(2px,.42vmin,5px) #173e82; paint-order: stroke fill; text-shadow: 0 .08em 0 rgba(0,42,104,.2); }
    .qk-pb-logo-word-0 { font-size: .68em; margin-bottom: .23em; }
    .qk-pb-logo-word-1 { font-size: 1.08em; }
    .qk-pb-logo-word-2 { font-size: 1.02em; margin-top: .2em; }
    .qk-pb button.qk-pb-play-big {
      min-height: clamp(88px, 13vmin, 122px); min-width: min(440px, 72vw); border-radius: 999px;
      border: 7px solid var(--white); padding: 18px 46px 23px; color: var(--white);
      background: linear-gradient(180deg, #ffbd31, #f27712 62%, #ed6210);
      box-shadow: inset 0 5px 0 rgba(255,255,255,.35), 0 8px 0 #b94b0b, 0 17px 24px rgba(14,69,136,.28);
      color: #fff; font-size: clamp(30px, 5.4vmin, 51px); text-transform: uppercase;
      text-shadow: 0 4px 0 rgba(137,56,6,.28);
    }
    .qk-pb button.qk-pb-play-big:active { transform: translateY(4px) scale(.98); box-shadow: inset 0 4px 0 rgba(255,255,255,.28), 0 3px 0 #b94b0b; }
    .qk-pb-instrument-deco { position: absolute; z-index: 3; right: clamp(18px, 4vw, 58px); top: 22%; display: grid; gap: clamp(12px, 2.5vh, 24px); pointer-events: none; }
    .qk-pb-instrument-deco span { width: clamp(78px, 10vw, 126px); aspect-ratio: 1; display: grid; place-items: center; border-radius: 50%; border: 6px solid #fff; background: rgba(244,251,255,.94); box-shadow: 0 7px 0 rgba(16,77,153,.2), 0 13px 20px rgba(20,71,145,.2); }
    .qk-pb-instrument-deco img { width: 72%; height: 72%; object-fit: contain; filter: drop-shadow(0 4px 3px rgba(38,54,86,.18)); }
    .qk-pb h1 { margin: 0; font-size: clamp(30px, 5.6vmin, 60px); text-shadow: 0 4px 0 rgba(255,255,255,.72); }
    .qk-pb-build .qk-pb-scrim { background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(0,37,160,.06)); }
    .qk-pb-build .qk-pb-center {
      width: min(1040px, 100%); margin: 0 auto; align-content: center;
      gap: clamp(6px, 1.2vmin, 12px); padding: max(10px, env(safe-area-inset-top)) 20px max(10px, env(safe-area-inset-bottom));
    }
    .qk-pb-build-title { display: grid; justify-items: center; gap: 0; z-index: 2; }
    .qk-pb-build-title h1 {
      min-width: min(560px, 72vw); padding: 9px 54px 15px; color: #103b82;
      border: 5px solid #fff; border-radius: 32px;
      background: linear-gradient(180deg, rgba(244,255,255,.98), rgba(207,250,255,.95));
      box-shadow: 0 6px 0 rgba(0,67,157,.26), 0 12px 22px rgba(0,41,136,.18);
      font-size: clamp(29px, 4.5vmin, 50px); line-height: 1;
    }
    .qk-pb-pill {
      margin-top: -10px; z-index: 2; padding: 6px 28px 8px; border-radius: 999px;
      border: 4px solid #fff; color: #fff; background: linear-gradient(#2fd2df, #0797b3);
      font-size: clamp(16px, 2.3vmin, 23px); box-shadow: 0 4px 0 #08788f, 0 8px 14px rgba(0,43,120,.18);
    }
    .qk-pb-build-sound { position: absolute; top: max(12px, env(safe-area-inset-top)); right: max(12px, env(safe-area-inset-right)); z-index: 6; background-image: url('${SOUND_IMG}'); }
    .qk-pb-grid {
      display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr));
      gap: clamp(8px, 1.4vmin, 14px); width: min(900px, 100%);
    }
    .qk-pb-tile { position: relative; }
    .qk-pb-puppet {
      width: 100%; height: clamp(138px, 22vh, 180px); display: grid;
      grid-template-rows: minmax(0, 1fr) auto; place-items: center;
      border-radius: 24px; border: 5px solid var(--white);
      background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(221,247,255,.97));
      box-shadow: 0 6px 0 rgba(0,47,137,.22), 0 11px 18px rgba(0,34,112,.2); padding: 7px 8px 10px;
      transition: transform .12s ease-out;
    }
    .qk-pb-puppet img { width: 100%; height: 100%; min-height: 0; object-fit: contain; pointer-events: none; }
    .qk-pb-puppet-name { color: #123d7b; font-size: clamp(14px, 2vmin, 20px); line-height: 1; }
    .qk-pb-puppet:active { transform: scale(.94); }
    .qk-pb-tile.is-in .qk-pb-puppet { border-color: #ffd44a; background: linear-gradient(180deg, #ffffff, #fff8d8); box-shadow: 0 0 0 4px #f4a81e, 0 7px 0 #b8750d, 0 13px 22px rgba(0,34,112,.22); transform: translateY(-2px); }
    .qk-pb-order {
      position: absolute; top: 8px; left: 9px; width: 36px; height: 36px;
      display: grid; place-items: center; border-radius: 50%;
      border: 4px solid #fff; background: #62b631; color: #fff; font-size: 19px;
      box-shadow: 0 3px 0 #397c1d;
    }
    .qk-pb-order:empty { display: none; }
    .qk-pb-badge {
      position: absolute; right: -7px; top: -7px; width: clamp(58px, 8vmin, 76px); height: clamp(58px, 8vmin, 76px);
      display: grid; place-items: center; border-radius: 50%;
      border: 5px solid var(--white); background: linear-gradient(#fffceb, #dff6ff); font-size: 38px;
      box-shadow: 0 5px 0 rgba(0,52,135,.2), 0 9px 14px rgba(0,38,122,.18);
    }
    .qk-pb-badge img { width: 76%; height: 76%; object-fit: contain; pointer-events: none; }
    .qk-pb-badge:active { transform: scale(.92); }
    .qk-pb-build-footer { width: min(900px, 100%); display: flex; align-items: center; justify-content: space-between; gap: 14px; }
    .qk-pb-build-help {
      min-height: 48px; display: flex; align-items: center; gap: 9px; padding: 7px 20px;
      color: #123d7b; background: rgba(231,255,255,.94); border: 4px solid #fff; border-radius: 999px;
      box-shadow: 0 4px 0 rgba(0,59,146,.2); font-size: clamp(14px, 2vmin, 20px);
    }
    .qk-pb-build-help span { width: 31px; height: 31px; display: grid; place-items: center; border-radius: 50%; color: #fff; background: #0878cb; }
    .qk-pb button.qk-pb-show {
      min-height: clamp(66px, 9vmin, 82px); min-width: min(330px, 45vw); border-radius: 999px;
      border: 6px solid var(--white); color: var(--white);
      background: linear-gradient(#ffad31, #f06f11 65%);
      box-shadow: inset 0 4px 0 rgba(255,255,255,.3), 0 6px 0 #b74808, 0 12px 19px rgba(0,32,111,.22);
      color: #fff; font-size: clamp(25px, 4vmin, 39px); text-transform: uppercase; text-shadow: 0 3px 0 rgba(133,52,3,.25);
    }
    .qk-pb-show:disabled { opacity: .45; cursor: default; }
    .qk-pb-show:not(:disabled):active { transform: scale(.96); }
    .qk-pb-concert { display: grid; grid-template-rows: auto 1fr; padding: max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left)); background:#47baf1; }
    .qk-pb-hud { position: relative; z-index: 3; display: grid; grid-template-columns: 96px 1fr 96px; align-items: center; min-height: 100px; }
    .qk-pb-hud .qk-pb-back { position: static; grid-column: 1; }
    .qk-pb-hud .qk-pb-next { grid-column: 3; }
    .qk-pb-songpill {
      grid-column: 2; justify-self: center; min-width: min(360px, 56vw); padding: 8px 30px 10px;
      border: 5px solid #fff; border-radius: 999px; color: #543274;
      background: linear-gradient(#fff, #fff0fc); font-size: clamp(20px, 3vmin, 30px);
      box-shadow: 0 5px 0 #8d63b2, 0 10px 18px rgba(25,53,128,.2);
    }
    .qk-pb-stagehost { min-height: 0; position: relative; overflow: hidden; border-radius: 34px; border: 5px solid rgba(255,255,255,.8); box-shadow: 0 7px 0 rgba(24,71,149,.2); touch-action: none; }
    .qk-pb-stagehost canvas { display: block; width: 100%; height: 100%; touch-action: none; }
    .qk-pb-stage-instrument {
      position: absolute; z-index: 4; transform: translate(-50%, -50%);
      width: clamp(52px, 7vmin, 72px); height: clamp(52px, 7vmin, 72px);
      display: grid; place-items: center; padding: 6px; border-radius: 50%;
      border: 5px solid #fff; background: linear-gradient(180deg, #fffef2, #dff6ff);
      box-shadow: 0 5px 0 rgba(0,52,135,.24), 0 9px 16px rgba(0,38,122,.24);
      transition: transform .12s ease-out, opacity .12s ease-out;
    }
    .qk-pb-stage-instrument::after {
      content: '↻'; position: absolute; right: -5px; bottom: -4px;
      width: 23px; height: 23px; display: grid; place-items: center;
      border: 3px solid #fff; border-radius: 50%; background: #0c8ed8; color: #fff;
      font: 700 15px/1 system-ui, sans-serif; box-shadow: 0 2px 0 rgba(0,52,135,.28);
    }
    .qk-pb-stage-instrument img { width: 82%; height: 82%; object-fit: contain; pointer-events: none; }
    .qk-pb-stage-instrument:active { transform: translate(-50%, -50%) scale(.9); }
    .qk-pb-stage-instrument:disabled { opacity: .62; }
    .qk-pb-sound { position: absolute; left: max(14px, env(safe-area-inset-left)); bottom: max(12px, env(safe-area-inset-bottom)); z-index: 4; }
    .qk-pb-carousel {
      position: absolute;
      z-index: 5;
      left: 50%; transform: translateX(-50%);
      bottom: max(10px, env(safe-area-inset-bottom));
      display: flex; gap: 8px;
      max-width: min(96vw, 1000px);
      overflow-x: auto;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(255,255,255,.55);
      backdrop-filter: blur(4px);
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }
    .qk-pb-carousel::-webkit-scrollbar { display: none; }
    .qk-pb-caro {
      position: relative;
      flex: 0 0 auto;
      width: 96px; height: 96px;
      border-radius: 50%;
      border: 5px solid var(--white);
      background: linear-gradient(180deg, #ffffff, #eaf6ff);
      box-shadow: 0 4px 0 rgba(23,81,126,.15);
      display: grid; place-items: center;
      padding: 6px;
      opacity: .82;
    }
    .qk-pb-caro img { width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
    .qk-pb-caro:active { transform: scale(.92); }
    .qk-pb-caro.is-in { border-color: #81d6a3; opacity: 1; background: linear-gradient(180deg, #ffffff, #e2ffe9); }
    .qk-pb-caro-order {
      position: absolute; top: -4px; right: -2px;
      width: 28px; height: 28px; border-radius: 50%;
      display: grid; place-items: center;
      background: #81d6a3; color: #fff; font-size: 16px;
    }
    .qk-pb-caro-order:empty { display: none; }
    @media (max-width: 700px) {
      .qk-pb-grid { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
      .qk-pb-mascot-stage { opacity: .5; }
      .qk-pb-instrument-deco { display: none; }
      .qk-pb-build { overflow-y: auto; }
      .qk-pb-build .qk-pb-center { height: auto; min-height: 100%; padding-top: 110px; }
      .qk-pb-build-footer { flex-direction: column; }
      .qk-pb-show { width: min(360px, 90vw); }
    }
    @media (max-height: 650px) and (min-width: 701px) {
      .qk-pb-splash .qk-pb-center { transform: translateY(-2vh) scale(.86); }
      .qk-pb-instrument-deco { transform: scale(.84); transform-origin: right center; }
      .qk-pb-build .qk-pb-center { transform: scale(.82); width: 100%; }
      .qk-pb-puppet { height: 132px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .qk-pb * { transition: none !important; animation: none !important; }
    }
  `;
  document.head.appendChild(style);
  styleInstalled = true;
}
