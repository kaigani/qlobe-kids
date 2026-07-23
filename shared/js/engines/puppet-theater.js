// puppet-theater.js — Stage v2 archetype for "watch puppets act out a problem
// AND a choice, then JUDGE the choice that was made".
//
// The pedagogical core is SHOW, DON'T TELL — and keep the child's hands busy:
// each scenario acts its problem, then ONE of its authored choices plays out
// at random (consequence included), the show pauses, and the child judges it
// with two big buttons — red unhappy face ("I didn't like that") or green
// happy face ("I liked that"). Kind choice → green is right; unkind → red.
// A correct judgment of an unkind choice is followed by the puppets acting a
// kind repair, so every scenario ends warm. A session's scenarios play as one
// continuous show — the only pauses are the judgment moments; one big
// celebration at the end. Wrong judgments get a gentle nudge + re-ask; there
// is no fail state.
//
// Structure mirrors choose-one.js (splash/HUD/debug/normalize conventions) on
// top of the theater substrate (../stage/theater.js) which owns the puppets,
// props and beat sequencing. The child casts the two puppets themselves from
// the rigged character set — every scenario is written for roles 'a' and 'b'.
//
// config shape (see games/puppet-problem-solvers/config.js for the exemplar):
// {
//   id, engine: 'puppet-theater', title, splashEmoji,
//   cast: ['bear','doggy',…],              // pickable rigged characters
//   backdrops: { playroom: './assets/bg/playroom.png', … },
//   clips: {},                             // extra clip overrides (rarely used)
//   copy: { home, replay, playAgain, castPrompt },
//   voice: { intro, castPrompt, watchWhat, judge, judgeNudge, judgeYesKind,
//            judgeYesUnkind, tryKinder, andThen, cheer },
//   modes: [{ id, title, rounds, scenarios: [{
//     id, backdrop: 'playroom',
//     props: { truck: { art, scale, holder:'a', handBone, handOffset } },
//     setup: [beat, …],                    // ends ON the frozen problem tableau
//     choices: [{ id, kind, card: { art, alt },   // card/ask/preview kept as
//                 ask: { narrator, text },        // authoring data; judge flow
//                 preview: [beat,…],              // acts `resolution` only and
//                 resolution: [beat,…] }],        // speaks its final narrator
//   }]}],                                         // line as the confirmation
// }
// Beat grammar is theater.js's: {actor, enter/to/clip/pose/say/text},
// {narrator, text}, {prop, holder/to}, {fx, at}, {wait}, {parallel:[…]}.

import * as sfx from '../sfx.js';
import * as speech from '../speech.js';
import * as voiceClips from '../voice-clips.js';
import { createStage } from '../stage/stage.js';
import { createTheater } from '../stage/theater.js';
import { createPuppet, loadRigArt } from '../stage/puppet.js';
import { to, ease, popIn, wiggle } from '../stage/tween.js';
import { burst, sparkle } from '../stage/particles.js';
import { artObj } from '../stage/art-pixi.js';
import { loadPropPack, propRuntimeDefinition } from '../stage/prop-pack.js';
import { loadScenePack, applyScenePack } from '../stage/scene-pack.js';

const FONT_URL = new URL('../../fonts/fredoka-latin-600-normal.woff2', import.meta.url).href;
const HOME_IMG = new URL('../../assets/ui/btn-home.png', import.meta.url).href;
const BACK_IMG = new URL('../../assets/ui/btn-back.png', import.meta.url).href;
const SOUND_IMG = new URL('../../assets/ui/btn-sound.png', import.meta.url).href;
const PLAY_IMG = new URL('../../assets/ui/btn-play.png', import.meta.url).href;
const CHAR_BASE = new URL('../../characters/', import.meta.url);

const IDLE_MS = 10000;
const REPLAY_DEBOUNCE_MS = 600;
const JUDGE_SIZE = 170;              // judge button diameter (min 96 enforced in layout)
const ACTOR_SCALE = 0.88;            // puppets sit large in the room (worldScale below matches)
const WORLD_SCALE = 2;               // props/fx grow with the cast (theater.js worldScale)
const MARK_A = 0.28;
const MARK_B = 0.72;
const CAST_PITCHES = [0.95, 1.18];   // TTS fallback voices for picks 1 & 2

let styleInstalled = false;

export function createGame(config, mountEl) {
  if (!mountEl) throw new Error('puppet-theater requires a mount element');
  installStyle();
  return new PuppetTheaterGame(config, mountEl);
}

class PuppetTheaterGame {
  constructor(config, mountEl) {
    this.config = normalizeConfig(config);
    this.propPack = null;
    this.scenePack = null;
    this.mountEl = mountEl;
    this.destroyed = false;
    this.previousDebug = window.QLOBE_DEBUG;

    this.screen = 'splash';   // splash | cast | play | end
    this.phase = null;        // setup | acting | judge | confirm | repair | celebrate
    this.mode = null;
    this.cast = [];           // [charId, charId] in pick order → roles a, b
    this.roundScenarios = [];
    this.roundIndex = 0;
    this.roundsTotal = 0;
    this.currentScenario = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.audioUnlocked = false;
    this.muted = false;
    this.timeScaleWanted = 1;
    this.yumIndex = 0;
    this.lastReplay = 0;
    this.idleTimer = 0;
    this.idlePrompted = false;
    this.targetMap = new Map();
    this.targetSeq = 0;
    this.rng = Math.random;

    this.stage = null;
    this.theater = null;
    this.cardLayer = null;
    this.cardViews = [];
    this.removeResize = null;
    this.stageGeneration = 0;
    this.roundGeneration = 0;
    this.mascotGeneration = 0;
    this.mascots = null;
    this.activeTweens = new Set();

    this.onFirstPointer = () => this.unlockAudio();
    this.onContextMenu = (e) => e.preventDefault();
    this.onGestureStart = (e) => e.preventDefault();
    window.addEventListener('pointerdown', this.onFirstPointer);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('gesturestart', this.onGestureStart);

    // delegated back button — screens rebuild innerHTML, the listener survives
    this.mountEl.addEventListener('click', (event) => {
      if (event.target && event.target.closest && event.target.closest('.qk-pt-back')) {
        voiceClips.stop();
        this.renderSplash();
      }
    });

    // narrator manifest (recorded teacher voice; missing file = speech fallback)
    this.ready = Promise.all([
      voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', {}).catch(() => {}),
      loadPropPack(this.config.propPack).then((pack) => { this.propPack = pack; }).catch(() => {}),
      loadScenePack(this.config.scenePack, this.config.id).then((pack) => {
        this.scenePack = pack;
        applyScenePack(this.config, pack);
      }).catch(() => {}),
    ]).then(() => {});
    this.renderSplash();
    this.installDebugHook();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearIdleTimer();
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
  }

  installDebugHook() {
    this.debugHook = {
      version: 1,
      gameId: this.config.id,
      engine: 'puppet-theater',
      ready: this.ready,
      listModes: () => this.config.modes.map((mode) => ({ id: mode.id, title: mode.title })),
      startMode: (id) => this.startMode(id, { autoCast: true }),
      getState: () => this.getState(),
      getTargets: () => this.getTargets(),
      tap: (targetId) => this.tapTarget(targetId),
      winRound: () => this.winRound(),
      mute: () => this.mute(),
      seed: (n) => this.seed(n),
      // additive (not in v1 contract): theater controls for automation
      setTimeScale: (n) => this.setTimeScale(n),
      skipToChoice: () => { if (this.theater) this.theater.timeScale = 24; },
      setCast: (ids) => { this.cast = (ids || []).slice(0, 2); },
      _theater: () => this.theater,   // internal: automation/QA inspection only
    };
    window.QLOBE_DEBUG = this.debugHook;
  }

  // --- splash -------------------------------------------------------------------

  renderSplash() {
    this.clearIdleTimer();
    this.disposeStage();
    this.screen = 'splash';
    this.phase = null;
    this.mode = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.targetMap.clear();
    voiceClips.stop();
    speech.stop();

    const buttons = this.config.modes.map((mode) => `
      <button class="qk-pt-mode" type="button" data-mode="${escapeAttr(mode.id)}"
              aria-label="${escapeAttr(`${mode.title}: ${mode.menuHint || 'Kind ideas'}`)}">
        <span class="qk-pt-mode-art" aria-hidden="true">
          ${mode.menuArt ? `<img src="${escapeAttr(mode.menuArt)}" alt="" draggable="false" />` : `<span>${escapeHtml(mode.emoji || '⭐')}</span>`}
        </span>
        <span class="qk-pt-mode-copy">
          <span class="qk-pt-mode-title">${escapeHtml(mode.title)}</span>
          <span class="qk-pt-mode-hint">${escapeHtml(mode.menuHint || 'Kind ideas')}</span>
        </span>
      </button>
    `).join('');
    this.mountEl.innerHTML = `
      <section class="qk-pt qk-pt-splash" aria-label="${escapeAttr(this.config.title)}">
        ${menuBackdropMarkup(this.config)}
        <div class="qk-pt-menu-scrim" aria-hidden="true"></div>
        <div class="qk-pt-mascot-stage" aria-hidden="true"></div>
        <a class="qk-pt-home qk-pt-img-btn" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
        <div class="qk-pt-splash-center">
          <div class="qk-pt-logo" aria-label="${escapeAttr(this.config.title)}">${titleMarkup(this.config.title)}</div>
          <div class="qk-pt-menu-prompt">${escapeHtml(this.config.menu?.prompt || 'Choose a story')}</div>
          <div class="qk-pt-mode-list">${buttons}</div>
          <p class="qk-pt-menu-helper">${escapeHtml(this.config.menu?.helper || 'Pick a story for the puppets!')}</p>
        </div>
      </section>
    `;

    this.mountEl.querySelectorAll('.qk-pt-mode').forEach((button) => {
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.unlockAudio();
        this.playSfx('tick');
      });
      button.addEventListener('click', () => this.startMode(button.dataset.mode));
    });

    this.bootMascots();
  }

  // Live greeter puppets flanking the menu: full rigs standing in idle, each
  // taking an occasional friendly wave. Pure decoration (pointer-events: none).
  async bootMascots() {
    const ids = (this.config.menu?.mascots || []).slice(0, 2);
    const host = this.mountEl.querySelector('.qk-pt-mascot-stage');
    if (!ids.length || !host) return;
    const generation = ++this.mascotGeneration;
    let stage;
    try {
      stage = await createStage(host);
    } catch { return; }
    if (this.destroyed || this.screen !== 'splash' || generation !== this.mascotGeneration) {
      stage.destroy();
      return;
    }
    const puppets = [];
    const timers = [];
    this.mascots = {
      destroy() {
        timers.forEach(clearTimeout);
        puppets.forEach((p) => p.puppet.destroy());
        stage.destroy();
      },
    };

    for (let i = 0; i < ids.length; i++) {
      try {
        const base = new URL(`${ids[i]}/`, CHAR_BASE);
        const rig = await (await fetch(new URL('rig.json', base))).json();
        if (this.destroyed || generation !== this.mascotGeneration) return;
        const factory = await loadRigArt(stage.PIXI, rig, base.href);
        if (this.destroyed || generation !== this.mascotGeneration) return;
        const puppet = createPuppet(stage.PIXI, rig, { partFactory: factory });   // auto-idles
        stage.root.addChild(puppet.view);
        puppets.push({ puppet, rig, side: i === 0 ? -1 : 1 });
      } catch { /* a missing mascot never blocks the menu */ }
    }
    if (!puppets.length) return;

    const place = (w, h) => {
      for (const m of puppets) {
        // full-size greeters standing at the stage edges, in front of the card
        // row (the canvas is click-through, so cards stay fully tappable)
        const k = (Math.min(w, h) / (m.rig.canvas || 1024)) * 0.55;
        m.puppet.view.scale.set(m.side === 1 ? -k : k, k);
        const drop = ((m.rig.ground || (m.rig.canvas || 1024) * 0.9) - m.rig.anchor.y) * k;
        m.puppet.view.position.set(m.side === -1 ? w * 0.06 : w * 0.94, h * 1.0 - drop);
      }
    };
    const offResize = stage.onResize(place);
    const prevDestroy = this.mascots.destroy;
    this.mascots.destroy = () => { offResize(); prevDestroy(); };

    // intermittent waves (skipped under reduced motion — puppets hold a calm pose)
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
    this.mascotGeneration = (this.mascotGeneration || 0) + 1;
    if (this.mascots) { this.mascots.destroy(); this.mascots = null; }
  }

  // --- cast picker -----------------------------------------------------------------

  renderCastScreen(mode) {
    this.screen = 'cast';
    this.pendingCast = [];
    const heads = this.config.cast.map((id) => `
      <button class="qk-pt-puppet" type="button" data-char="${escapeAttr(id)}" aria-label="${escapeAttr(id)}">
        <span class="qk-pt-puppet-portrait">
          <img src="${escapeAttr(new URL(`${id}/anim/head-ts.png`, CHAR_BASE).href)}"
               onerror="this.onerror=null;this.src='${escapeAttr(new URL(`${id}/parts/head.png`, CHAR_BASE).href)}'"
               alt="" draggable="false" />
        </span>
        <span class="qk-pt-puppet-name">${escapeHtml(characterName(id))}</span>
        <span class="qk-pt-pick-badge" aria-hidden="true"></span>
      </button>
    `).join('');

    this.mountEl.innerHTML = `
      <section class="qk-pt qk-pt-cast" aria-label="${escapeAttr(this.config.copy.castPrompt)}">
        ${menuBackdropMarkup(this.config)}
        <div class="qk-pt-menu-scrim" aria-hidden="true"></div>
        <button class="qk-pt-back qk-pt-img-btn" type="button" aria-label="Back to the game menu"></button>
        <div class="qk-pt-cast-center">
          <div class="qk-pt-cast-title">
            <span class="qk-pt-cast-kicker">${escapeHtml(mode?.title || 'Puppet show')}</span>
            <h1>${escapeHtml(this.config.copy.castPrompt)}</h1>
          </div>
          <div class="qk-pt-cast-progress" aria-label="Two puppets needed">
            <span class="is-current" data-cast-step="1">1</span><i aria-hidden="true"></i><span data-cast-step="2">2</span>
          </div>
          <p class="qk-pt-cast-status" aria-live="polite">Choose your first puppet</p>
          <div class="qk-pt-cast-grid">${heads}</div>
        </div>
      </section>
    `;

    this.speakNarr('cast-prompt', this.config.voice.castPrompt);

    return new Promise((resolve) => {
      this.mountEl.querySelectorAll('.qk-pt-puppet').forEach((button) => {
        button.addEventListener('pointerdown', (e) => { e.preventDefault(); this.unlockAudio(); });
        button.addEventListener('click', async () => {
          if (this.screen !== 'cast') return;
          const id = button.dataset.char;
          if (this.pendingCast.includes(id)) return;
          this.pendingCast.push(id);
          button.classList.add('is-picked');
          button.querySelector('.qk-pt-pick-badge').textContent = this.pendingCast.length;
          const firstStep = this.mountEl.querySelector('[data-cast-step="1"]');
          const secondStep = this.mountEl.querySelector('[data-cast-step="2"]');
          firstStep.classList.add('is-filled'); firstStep.classList.remove('is-current');
          if (this.pendingCast.length === 1) {
            secondStep.classList.add('is-current');
            this.mountEl.querySelector('.qk-pt-cast-status').textContent = 'Great! Now choose their friend';
          } else {
            secondStep.classList.add('is-filled'); secondStep.classList.remove('is-current');
            this.mountEl.querySelector('.qk-pt-cast-status').textContent = 'Your puppet stars are ready!';
          }
          this.playSfx('pop');
          // each pick says hello in its own recorded voice (existing intro line)
          this.playIntro(id);
          if (this.pendingCast.length >= 2) {
            this.mountEl.querySelectorAll('.qk-pt-puppet').forEach((b) => { b.disabled = true; });
            await this.delay(this.muted ? 50 : 900);
            if (this.destroyed || this.screen !== 'cast') return;
            this.cast = this.pendingCast.slice(0, 2);
            resolve(true);
          }
        });
      });
    });
  }

  playIntro(charId) {
    if (this.muted) return;
    const base = new URL(`${charId}/voice/`, CHAR_BASE);
    fetch(new URL('manifest.json', base))
      .then((r) => (r.ok ? r.json() : null))
      .then((manifest) => {
        const line = manifest && manifest.lines && manifest.lines.find((l) => l.id === 'intro');
        if (line) voiceClips.sayFile(new URL(line.audio, base).href, line.text || '', line.dur);
        else voiceClips.sayFile(new URL('intro.m4a', base).href, `Hello! Let's play!`);
      })
      .catch(() => {});
  }

  // --- mode / play -----------------------------------------------------------------

  async startMode(modeId, { autoCast = false } = {}) {
    await this.ready;
    if (this.destroyed) return;
    const mode = this.config.modes.find((m) => m.id === modeId) || this.config.modes[0];
    if (!mode) return;

    this.clearIdleTimer();
    voiceClips.stop();
    speech.stop();
    this.mode = mode;

    if (this.cast.length < 2) {
      if (autoCast) {
        this.cast = shuffle(this.config.cast.slice(), this.rng).slice(0, 2);
      } else {
        this.disposeStage();
        const picked = await this.renderCastScreen(mode);
        if (!picked || this.destroyed) return;
      }
    }

    this.disposeStage();
    this.screen = 'play';
    this.phase = 'setup';
    this.roundIndex = 0;
    this.yumIndex = 0;
    const pool = shuffle(mode.scenarios.slice(), this.rng);
    this.roundScenarios = pool.slice(0, Math.min(mode.rounds || 3, pool.length));
    this.roundsTotal = this.roundScenarios.length;

    // Draw ONE choice per scenario for the puppets to act out. Guarantee the
    // show has both flavors — at least one kind and one unkind draw — so every
    // session exercises both judgments.
    this.drawnChoices = this.roundScenarios.map((sc) => shuffle(sc.choices.slice(), this.rng)[0]);
    const flavors = this.drawnChoices.map((c) => !!c.kind);
    const forceFlavor = (wantKind) => {
      const i = this.roundScenarios.findIndex((sc) => sc.choices.some((c) => !!c.kind === wantKind));
      if (i >= 0) this.drawnChoices[i] = shuffle(this.roundScenarios[i].choices.filter((c) => !!c.kind === wantKind), this.rng)[0];
    };
    if (this.roundsTotal > 1) {
      if (flavors.every(Boolean)) forceFlavor(false);
      else if (flavors.every((k) => !k)) forceFlavor(true);
    }

    this.renderPlayShell();
    if (!this.roundsTotal) { await this.finishGame(); return; }
    const ok = await this.createPlayStage();
    if (!ok) return;
    await this.playRound(0);   // resolves when the first choice opens
  }

  renderPlayShell() {
    const dots = Array.from({ length: this.roundsTotal }, (_, i) => `
      <span class="qk-pt-dot" data-dot="${i}" aria-hidden="true"></span>
    `).join('');

    this.mountEl.innerHTML = `
      <section class="qk-pt qk-pt-play" aria-label="${escapeAttr(this.mode.title)}">
        <header class="qk-pt-hud">
          <button class="qk-pt-back qk-pt-img-btn" type="button" aria-label="Back to the game menu"></button>
          <div class="qk-pt-progress" aria-hidden="true">${dots}</div>
        </header>
        <main class="qk-pt-stagehost" aria-label="${escapeAttr(this.mode.title)}"></main>
        <button class="qk-pt-sound qk-pt-img-btn" type="button" aria-label="${escapeAttr(this.config.copy.replay)}"></button>
      </section>
    `;
    const sound = this.mountEl.querySelector('.qk-pt-sound');
    sound.addEventListener('pointerdown', (e) => e.stopPropagation());
    sound.addEventListener('click', () => this.replayFromHud());
  }

  async createPlayStage() {
    const host = this.mountEl.querySelector('.qk-pt-stagehost');
    if (!host) return false;
    const generation = ++this.stageGeneration;
    const stage = await createStage(host);
    if (this.destroyed || this.screen !== 'play' || generation !== this.stageGeneration) {
      stage.destroy();
      return false;
    }
    this.stage = stage;

    const theater = await createTheater(stage, {
      floorY: (this.config.stage && this.config.stage.floorY) || 0.84,
      worldScale: WORLD_SCALE,
      gameClips: this.config.clips,
      narrate: (key, text) => this.speakNarr(key, text),
    });
    if (this.destroyed || generation !== this.stageGeneration) { theater.destroy(); stage.destroy(); return false; }
    this.theater = theater;
    theater.muted = this.muted;
    theater.timeScale = this.effectiveTimeScale();
    stage.root.addChild(theater.view);

    // cast the two chosen puppets as roles a (left) and b (right)
    const [aId, bId] = this.cast;
    await theater.addActor('a', aId, { x: MARK_A, flip: false, scale: ACTOR_SCALE, fallbackPitch: CAST_PITCHES[0] });
    await theater.addActor('b', bId, { x: MARK_B, flip: true, scale: ACTOR_SCALE, fallbackPitch: CAST_PITCHES[1] });
    if (this.destroyed || generation !== this.stageGeneration) return false;

    this.cardLayer = new stage.PIXI.Container();
    stage.root.addChild(this.cardLayer);
    this.removeResize = stage.onResize(() => this.layoutJudgeButtons());
    return true;
  }

  runTween(tween) {
    this.activeTweens.add(tween);
    const done = () => this.activeTweens.delete(tween);
    tween.then(done, done);
    return tween;
  }

  cancelTweens() {
    this.activeTweens.forEach((t) => t.cancel && t.cancel());
    this.activeTweens.clear();
  }

  disposeStage() {
    this.disposeMascots();
    this.cancelTweens();
    this.stageGeneration += 1;
    this.roundGeneration += 1;
    if (this.theater) { this.theater.destroy(); this.theater = null; }
    if (this.removeResize) { this.removeResize(); this.removeResize = null; }
    if (this.stage) { this.stage.destroy(); this.stage = null; }
    this.cardLayer = null;
    this.cardViews = [];
  }

  roundIsCurrent(generation) {
    return !this.destroyed && this.screen === 'play' && this.theater && generation === this.roundGeneration;
  }

  async playRound(index) {
    if (this.destroyed || this.screen !== 'play' || !this.theater) return;
    const generation = ++this.roundGeneration;
    const T = this.theater;
    this.clearIdleTimer();
    this.roundIndex = index;
    this.currentScenario = this.roundScenarios[index];
    this.targetMap.clear();
    this.targetSeq = 0;
    this.awaitingInput = false;
    this.inputLocked = true;
    this.idlePrompted = false;
    this.cardViews = [];
    this.cancelTweens();
    if (this.cardLayer) this.cardLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.updateDots();

    const sc = this.currentScenario;
    const drawn = this.drawnChoices[index];

    // stage the set: backdrop (crossfades between scenarios) + this scenario's props
    T.interrupt();
    T.clearProps();
    T.setFloorY(sc.floorY ?? this.config.stage?.floorY ?? 0.84);
    await T.setBackdrop(this.config.backdrops[sc.backdrop] || sc.backdrop || null);
    for (const [id, def] of Object.entries(sc.props || {})) {
      const charId = def.holder ? T.actors[def.holder]?.char : null;
      const scenePlacement = this.propPack?.props?.[id] ? {
        holder: def.holder, fx: def.fx, fy: def.fy,
        characterSocket: def.characterSocket,
        handBone: def.handBone, handOffset: def.handOffset,
        presentation: def.presentation,
      } : def;
      await T.addProp(id, propRuntimeDefinition(this.propPack, id, scenePlacement, charId));
    }
    // reset actors to their marks
    for (const [name, snap] of [['a', sc.actors?.a?.x ?? MARK_A], ['b', sc.actors?.b?.x ?? MARK_B]]) {
      const actor = T.actors[name];
      if (!actor) continue;
      T.resetActorPose(actor);
      actor.fx = snap;
      T.placeActor(actor);
      actor.puppet.playClip('idle');
    }
    if (!this.roundIsCurrent(generation)) return;

    // --- setup: act the problem, freeze on the tableau -------------------------
    this.phase = 'setup';
    if (index === 0) await this.speakNarr('intro', this.config.voice.intro);
    else await this.speakNarr('and-then', this.config.voice.andThen);
    if (!this.roundIsCurrent(generation)) return;
    await T.runBeats(sc.setup);
    if (!this.roundIsCurrent(generation)) return;
    this.tableau = T.captureTableau();

    // --- acting: ONE drawn choice plays out, consequence and all ----------------
    this.phase = 'acting';
    await this.speakNarr('watch-what', this.config.voice.watchWhat);
    if (!this.roundIsCurrent(generation)) return;
    await T.runBeats(actedBeats(drawn.resolution).beats);
    if (!this.roundIsCurrent(generation)) return;

    // --- judge: the show pauses; red or green? -----------------------------------
    this.phase = 'judge';
    await this.buildJudgeButtons(drawn, generation);
    if (!this.roundIsCurrent(generation)) return;
    this.layoutJudgeButtons();
    this.playSfx('tick');
    await Promise.all(this.cardViews.filter(Boolean).map((b, i) =>
      this.delay(i * 110).then(() => this.runTween(popIn(b.motion, 320)))));
    this.awaitingInput = true;
    this.inputLocked = false;
    if (this.theater) this.theater.timeScale = this.effectiveTimeScale();  // undo skipToChoice
    await this.speakNarr('judge', this.config.voice.judge);
    this.scheduleIdlePrompt();
  }

  // Two round judgment buttons: red unhappy (left) and green happy (right).
  // Roles are truthful for the drawn choice: green='correct' iff it was kind.
  async buildJudgeButtons(drawn, generation) {
    const { PIXI } = this.stage;
    const defs = [
      { judgment: 'sad', emoji: '😞', fill: 0xe05252, alt: 'I did not like that choice', correct: !drawn.kind },
      { judgment: 'happy', emoji: '😊', fill: 0x58b368, alt: 'I liked that choice', correct: !!drawn.kind },
    ];
    this.cardViews = [];
    for (let i = 0; i < defs.length; i++) {
      const def = defs[i];
      // config.judgeArt supplies full round button images (plush faces); the
      // drawn circle + emoji remain as the never-404 fallback
      let art = null;
      const artSrc = this.config.judgeArt && this.config.judgeArt[def.judgment];
      if (artSrc) {
        const tex = await PIXI.Assets.load(new URL(artSrc, document.baseURI).href).catch(() => null);
        if (tex) {
          art = new PIXI.Sprite(tex);
          art.anchor.set(0.5);
          art.scale.set(JUDGE_SIZE / Math.max(tex.width, tex.height));
        }
      }
      if (!art) art = await artObj(PIXI, `emoji:${def.emoji}`, JUDGE_SIZE * 0.66, def.alt);
      if (!this.roundIsCurrent(generation)) { art.destroy({ children: true }); return; }
      const imageButton = art instanceof PIXI.Sprite;
      const id = this.nextTargetId('judge');
      const view = new PIXI.Container();
      const motion = new PIXI.Container();
      const r = JUDGE_SIZE / 2;
      const glow = new PIXI.Graphics();
      glow.circle(0, 0, r + 12).fill({ color: 0xffd75e, alpha: 0.85 });
      glow.alpha = 0;
      const shadow = new PIXI.Graphics();
      shadow.circle(0, 8, r).fill({ color: 0x17517e, alpha: 0.17 });
      motion.addChild(glow, shadow);
      if (!imageButton) {
        const backing = new PIXI.Graphics();
        backing.circle(0, 0, r).fill(def.fill).stroke({ width: 7, color: 0xffffff });
        motion.addChild(backing);
      }
      motion.addChild(art);
      view.addChild(motion);
      view.motion = motion;
      view.hitArea = new PIXI.Circle(0, 0, r);
      view.eventMode = 'static';
      view.cursor = 'pointer';
      view.accessible = true;
      view.accessibleType = 'button';
      view.accessibleTitle = def.alt;
      motion.scale.set(0.01);
      view.on('pointerdown', (event) => {
        if (event && event.preventDefault) event.preventDefault();
        this.unlockAudio();
        this.tapTarget(id);
      });
      const target = {
        id, view, motion, glow,
        judgment: def.judgment,
        role: def.correct ? 'correct' : 'wrong',
        size: JUDGE_SIZE,
        action: () => this.handleJudgment(id),
      };
      this.cardViews[i] = target;
      this.targetMap.set(id, target);
      this.cardLayer.addChild(view);
    }
  }

  layoutJudgeButtons() {
    if (!this.stage || !this.cardViews.length) return;
    const { w, h } = this.stage.size();
    if (!w || !h) return;
    const buttons = this.cardViews.filter(Boolean);
    const pad = Math.max(10, Math.min(24, Math.min(w, h) * 0.025));
    const size = Math.max(96, Math.min(JUDGE_SIZE, w * 0.2, h * 0.24));
    const gap = Math.max(size * 0.35, w * 0.06);
    const firstX = w / 2 - gap / 2 - size / 2;
    const y = h - pad - size / 2;
    buttons.forEach((b, i) => {
      b.view.position.set(firstX + i * (size + gap), y);
      b.view.scale.set(size / JUDGE_SIZE);
    });
  }

  // Fade the judge buttons away once a judgment lands (they return next pause).
  dismissJudgeButtons() {
    this.cardViews.filter(Boolean).forEach((b) => {
      to(b.view, { alpha: 0 }, { ms: 260, easing: ease.outCubic }).then(() => {
        if (b.view && !b.view.destroyed) b.view.visible = false;
      });
    });
  }

  async handleJudgment(targetId) {
    const target = this.targetMap.get(targetId);
    if (!target || !this.awaitingInput || this.inputLocked || this.phase !== 'judge') return;
    const generation = this.roundGeneration;
    const drawn = this.drawnChoices[this.roundIndex];
    const sc = this.currentScenario;
    this.clearIdleTimer();

    if (target.role !== 'correct') {
      // gentle nudge: point back at the puppets' faces and re-ask
      this.playSfx('boing');
      await wiggle(target.motion);
      await this.speakNarr('judge-nudge', this.config.voice.judgeNudge);
      if (!this.roundIsCurrent(generation) || this.phase !== 'judge') return;
      this.idlePrompted = false;
      this.scheduleIdlePrompt();
      return;
    }

    this.awaitingInput = false;
    this.inputLocked = true;
    this.phase = 'confirm';
    this.playSfx('pop');
    this.playSfx('sparkle');
    target.motion.scale.set(1.08);
    await Promise.all([
      this.bounce(target.motion),
      sparkle(this.stage.PIXI, this.cardLayer, target.view.x, target.view.y),
    ]);
    target.motion.scale.set(1);
    this.dismissJudgeButtons();

    // confirmation = the drawn choice's own final narrator line (stripped from
    // the acted resolution), falling back to the generic judge confirmations
    const { finale } = actedBeats(drawn.resolution);
    if (finale) await this.speakNarr(finale.narrator, finale.text);
    else if (drawn.kind) await this.speakNarr('judge-yes-kind', this.config.voice.judgeYesKind);
    else await this.speakNarr('judge-yes-unkind', this.config.voice.judgeYesUnkind);
    if (!this.roundIsCurrent(generation)) return;

    // an unkind draw ends with the puppets acting a kind repair, so every
    // scenario closes warm
    if (!drawn.kind) {
      this.phase = 'repair';
      const T = this.theater;
      T.restoreTableau(this.tableau);
      await this.speakNarr('try-kinder', this.config.voice.tryKinder);
      if (!this.roundIsCurrent(generation)) return;
      const kind = shuffle(sc.choices.filter((c) => c.kind), this.rng)[0];
      if (kind) {
        const repair = actedBeats(kind.resolution);
        await T.runBeats(repair.beats);
        if (!this.roundIsCurrent(generation)) return;
        if (repair.finale) await this.speakNarr(repair.finale.narrator, repair.finale.text);
      }
      if (!this.roundIsCurrent(generation)) return;
    }

    await this.delay(350);
    const next = this.roundIndex + 1;
    if (next >= this.roundsTotal) await this.finishShow(generation);
    else await this.playRound(next);
  }

  // One big celebration at the end of the whole show (never mid-scene).
  async finishShow(generation) {
    this.phase = 'celebrate';
    this.playSfx('tada');
    const { w, h } = this.stage.size();
    await Promise.all([
      burst(this.stage.PIXI, this.theater.view, w / 2, h * 0.4, { count: 40, power: 8 }),
      this.theater.runBeats([{ parallel: [{ actor: 'a', clip: 'cheer' }, { actor: 'b', clip: 'cheer' }] }]),
    ]);
    if (!this.roundIsCurrent(generation)) return;
    await this.delay(300);
    await this.finishGame();
  }

  async finishGame() {
    this.clearIdleTimer();
    this.screen = 'end';
    this.phase = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.targetMap.clear();
    this.playSfx('tada');
    this.disposeStage();
    const stars = this.cast.map((id) => `
      <img src="${escapeAttr(new URL(`${id}/anim/head-ts.png`, CHAR_BASE).href)}"
           onerror="this.onerror=null;this.src='${escapeAttr(new URL(`${id}/parts/head.png`, CHAR_BASE).href)}'"
           alt="${escapeAttr(characterName(id))}" draggable="false" />
    `).join('');
    this.mountEl.innerHTML = `
      <section class="qk-pt qk-pt-end" aria-label="${escapeAttr(this.config.voice.cheer)}">
        ${menuBackdropMarkup(this.config)}
        <div class="qk-pt-menu-scrim" aria-hidden="true"></div>
        <button class="qk-pt-back qk-pt-img-btn" type="button" aria-label="Back to the game menu"></button>
        <div class="qk-pt-end-center">
          <div class="qk-pt-finale-stars">${stars}</div>
          <div class="qk-pt-finale-badge" aria-hidden="true">★</div>
          <h1>${escapeHtml(this.config.voice.cheer)}</h1>
          <p>Three problems solved with kind ideas!</p>
          <button class="qk-pt-again" type="button">
            <span class="qk-pt-play-icon" aria-hidden="true"></span>
            <span>${escapeHtml(this.config.copy.playAgain)}</span>
          </button>
        </div>
      </section>
    `;
    const again = this.mountEl.querySelector('.qk-pt-again');
    again.addEventListener('pointerdown', (e) => { e.preventDefault(); this.unlockAudio(); this.playSfx('tick'); });
    again.addEventListener('click', () => {
      this.cast = [];                       // fresh show, fresh casting
      if (this.mode) this.startMode(this.mode.id);
      else this.renderSplash();
    });
    this.speakNarr('cheer', this.config.voice.cheer);
  }

  // --- HUD / prompts -----------------------------------------------------------------

  replayFromHud() {
    const now = performance.now();
    if (now - this.lastReplay < REPLAY_DEBOUNCE_MS) return;
    this.lastReplay = now;
    this.playSfx('tick');
    this.replayChoices();
  }

  /** Re-ask the judgment question, glancing at each button (no re-acting —
   *  the acted memory is fresh; this is a pointer back to it). */
  async replayChoices() {
    if (this.screen !== 'play' || this.phase !== 'judge' || !this.currentScenario) return;
    this.clearIdleTimer();
    for (const b of this.cardViews) {
      if (!b || this.phase !== 'judge') break;
      b.glow.alpha = 0.8;
      await this.delay(260);
      b.glow.alpha = 0;
    }
    await this.speakNarr('judge', this.config.voice.judge);
    this.scheduleIdlePrompt();
  }

  scheduleIdlePrompt() {
    this.clearIdleTimer();
    if (this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = 0;
      if (this.destroyed || this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
      this.idlePrompted = true;
      this.replayChoices();
    }, IDLE_MS);
  }

  clearIdleTimer() {
    if (!this.idleTimer) return;
    window.clearTimeout(this.idleTimer);
    this.idleTimer = 0;
  }

  updateDots() {
    this.mountEl.querySelectorAll('.qk-pt-dot').forEach((dot, index) => {
      dot.classList.toggle('is-filled', index < this.roundIndex);
      dot.classList.toggle('is-current', index === this.roundIndex);
    });
  }

  // --- debug contract -----------------------------------------------------------------

  getState() {
    return {
      screen: this.screen,
      mode: this.mode ? this.mode.id : null,
      round: this.screen === 'play' ? this.roundIndex : this.roundsTotal,
      roundsTotal: this.roundsTotal,
      awaitingInput: this.awaitingInput,
      phase: this.phase,
      cast: this.cast.slice(),
      drawnKind: this.screen === 'play' && this.drawnChoices && this.drawnChoices[this.roundIndex]
        ? !!this.drawnChoices[this.roundIndex].kind : null,
    };
  }

  getTargets() {
    if (this.screen !== 'play' || !this.stage || this.phase !== 'judge') return [];
    const canvasRect = this.stage.app.canvas.getBoundingClientRect();
    const stageSize = this.stage.size();
    const scaleX = stageSize.w ? canvasRect.width / stageSize.w : 1;
    const scaleY = stageSize.h ? canvasRect.height / stageSize.h : 1;
    const { PIXI } = this.stage;
    return Array.from(this.targetMap.values()).filter((t) => t.view).map((target) => {
      const half = target.size / 2;
      const corners = [
        target.view.toGlobal(new PIXI.Point(-half, -half)),
        target.view.toGlobal(new PIXI.Point(half, -half)),
        target.view.toGlobal(new PIXI.Point(half, half)),
        target.view.toGlobal(new PIXI.Point(-half, half)),
      ];
      const xs = corners.map((c) => c.x);
      const ys = corners.map((c) => c.y);
      return {
        id: target.id,
        role: target.role,
        rect: {
          x: canvasRect.left + Math.min(...xs) * scaleX,
          y: canvasRect.top + Math.min(...ys) * scaleY,
          w: (Math.max(...xs) - Math.min(...xs)) * scaleX,
          h: (Math.max(...ys) - Math.min(...ys)) * scaleY,
        },
      };
    });
  }

  async tapTarget(targetId) {
    const target = this.targetMap.get(targetId);
    if (!target || this.destroyed) return { accepted: false };
    if (!this.awaitingInput || this.inputLocked || this.phase !== 'judge') return { accepted: false };
    await target.action();
    return { accepted: true };
  }

  async winRound() {
    if (this.screen !== 'play') return;
    if (this.phase !== 'judge') await this.waitForChoice();
    const target = Array.from(this.targetMap.values()).find((t) => t.role === 'correct');
    if (target) await this.tapTarget(target.id);
  }

  waitForChoice() {
    return new Promise((resolve) => {
      const check = () => {
        if (this.destroyed || this.screen !== 'play' || (this.phase === 'judge' && this.awaitingInput)) { resolve(); return; }
        setTimeout(check, 120);
      };
      check();
    });
  }

  mute() {
    this.muted = true;
    this.timeScaleWanted = Math.max(this.timeScaleWanted, 8);
    if (this.theater) { this.theater.muted = true; this.theater.timeScale = this.effectiveTimeScale(); }
    voiceClips.stop();
    speech.stop();
  }

  setTimeScale(n) {
    this.timeScaleWanted = Math.max(1, Number(n) || 1);
    if (this.theater) this.theater.timeScale = this.effectiveTimeScale();
  }

  effectiveTimeScale() { return this.timeScaleWanted; }

  seed(n) {
    this.rng = mulberry32(Number(n) || 0);
  }

  // --- helpers ------------------------------------------------------------------------

  async speakNarr(key, text) {
    if (this.muted || (!key && !text)) return;
    await voiceClips.say(key || 'x-missing', text || '');
  }

  playSfx(name) {
    if (this.muted || !sfx[name]) return;
    sfx[name]();
  }

  async bounce(motion) {
    await to(motion, { y: -10 }, { ms: 140, easing: ease.outCubic });
    await to(motion, { y: 0 }, { ms: 220, easing: ease.outBack });
  }

  nextTargetId(prefix) {
    this.targetSeq += 1;
    return `${prefix}-${this.roundIndex + 1}-${this.targetSeq}`;
  }

  delay(ms) {
    const scaled = this.theater ? ms / this.theater.timeScale : ms;
    return new Promise((resolve) => setTimeout(resolve, scaled));
  }
}

// --- config -----------------------------------------------------------------------

function normalizeConfig(config) {
  const copy = {
    home: 'Home',
    replay: 'Hear the choices again',
    playAgain: 'Play Again',
    castPrompt: 'Pick two puppets for the show!',
    ...(config.copy || {}),
  };
  const voice = {
    intro: 'The puppets have a problem! Watch what happens.',
    castPrompt: copy.castPrompt,
    watchWhat: 'Watch what they do!',
    judge: 'Did you like that choice? Tap the happy face or the sad face.',
    judgeNudge: 'Hmm, look at their faces. Are they happy or sad?',
    judgeYesKind: 'Yes! That was a kind choice!',
    judgeYesUnkind: 'You’re right. That choice made their friend feel sad.',
    tryKinder: 'Let’s watch them try a kinder way!',
    andThen: 'And then...',
    cheer: 'You are a peace helper!',
    yums: ['Great choice!', 'So kind!', 'What a good idea!'],
    ...(config.voice || {}),
  };
  if (!Array.isArray(voice.yums)) voice.yums = [String(voice.yums || 'Great choice!')];

  return {
    id: config.id || 'puppet-theater',
    title: config.title || 'Puppet Theater',
    splashEmoji: config.splashEmoji || '🎭',
    cast: config.cast && config.cast.length ? config.cast
      : ['bear', 'doggy', 'fox', 'frog', 'rabbit', 'unicorn', 'princess-lily', 'princess-zoe'],
    backdrops: config.backdrops || {},
    clips: config.clips || {},
    ...config,
    copy,
    voice,
    modes: (config.modes || []).map((mode) => ({
      ...mode,
      scenarios: (mode.scenarios || []).filter((s) => s
        && Array.isArray(s.setup) && Array.isArray(s.choices)
        && s.choices.length >= 2 && s.choices.some((c) => c.kind)),
    })).filter((mode) => mode.scenarios.length),
  };
}

// A resolution's final narrator beat is the emotional wrap-up line. In judge
// flow it is NOT acted — it plays as the confirmation after a correct
// judgment. Split it off here.
function actedBeats(resolution) {
  const beats = resolution || [];
  const last = beats[beats.length - 1];
  if (last && last.narrator) return { beats: beats.slice(0, -1), finale: last };
  return { beats, finale: null };
}

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
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

function menuBackdropMarkup(config) {
  const src = config.menu && config.menu.backdrop;
  return src ? `<img class="qk-pt-menu-backdrop" src="${escapeAttr(src)}" alt="" draggable="false" aria-hidden="true" />` : '';
}

function titleMarkup(title) {
  const words = String(title || 'Puppet Theater').trim().split(/\s+/);
  const last = words.pop() || '';
  return `<span>${escapeHtml(words.join(' '))}</span><strong>${escapeHtml(last)}</strong>`;
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
  if (styleInstalled || document.getElementById('qk-pt-style')) {
    styleInstalled = true;
    return;
  }
  const style = document.createElement('style');
  style.id = 'qk-pt-style';
  style.textContent = `
    @font-face {
      font-family: 'Fredoka';
      src: url('${FONT_URL}') format('woff2');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }

    .qk-pt, .qk-pt * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    .qk-pt {
      --navy: #17517e;
      --blue: #2d7dd2;
      --purple: #7c4fc4;
      --mint: #81d6a3;
      --peach: #ffad7a;
      --white: #ffffff;
      --shadow: 0 6px 0 rgba(23, 81, 126, .18), 0 14px 30px rgba(23, 81, 126, .18);
      position: relative;
      height: 100dvh;
      min-height: 100%;
      width: 100%;
      overflow: hidden;
      color: var(--navy);
      font-family: 'Fredoka', 'Arial Rounded MT Bold', 'Trebuchet MS', sans-serif;
      font-weight: 600;
      background-color: #bee3f5;
      background-image:
        radial-gradient(circle at 18% 18%, rgba(255,255,255,.45) 0 7px, transparent 8px),
        radial-gradient(circle at 72% 22%, rgba(255,255,255,.38) 0 10px, transparent 11px),
        radial-gradient(circle at 42% 82%, rgba(255,255,255,.30) 0 8px, transparent 9px);
      background-size: 170px 170px, 240px 240px, 210px 210px;
      touch-action: manipulation;
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
      overscroll-behavior: none;
    }

    .qk-pt button, .qk-pt a { font: inherit; color: inherit; touch-action: manipulation; }
    .qk-pt button { border: 0; cursor: pointer; }
    .qk-pt button:focus-visible, .qk-pt a:focus-visible {
      outline: 5px solid rgba(45, 125, 210, .65);
      outline-offset: 4px;
    }

    .qk-pt-img-btn {
      display: grid;
      place-items: center;
      width: 96px;
      height: 96px;
      border-radius: 50%;
      background: transparent center / 84px 84px no-repeat;
      text-decoration: none;
      box-shadow: none;
    }
    .qk-pt-img-btn:active { transform: scale(.93); }
    .qk-pt-home { background-image: url('${HOME_IMG}'); }
    .qk-pt-back { background-image: url('${BACK_IMG}'); }
    .qk-pt-sound { background-image: url('${SOUND_IMG}'); }

    .qk-pt-splash, .qk-pt-cast, .qk-pt-end {
      display: grid;
      place-items: center;
      padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right))
        max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
    }
    .qk-pt-menu-backdrop {
      position: absolute;
      z-index: 0;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      pointer-events: none;
    }
    .qk-pt-menu-scrim {
      position: absolute;
      z-index: 1;
      inset: 0;
      pointer-events: none;
      background: linear-gradient(90deg, rgba(255,246,210,.18), rgba(255,255,255,.10) 28% 72%, rgba(255,246,210,.16));
    }
    .qk-pt-mascot-stage {
      position: absolute;
      z-index: 4;   /* in front of the card row; canvas is click-through */
      inset: 0;
      pointer-events: none;
    }
    .qk-pt-mascot-stage canvas {
      display: block;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    .qk-pt-home, .qk-pt-back {
      position: absolute;
      top: max(12px, env(safe-area-inset-top));
      left: max(12px, env(safe-area-inset-left));
      z-index: 6;
    }

    .qk-pt-splash-center, .qk-pt-cast-center, .qk-pt-end-center {
      position: relative;
      z-index: 3;
      width: min(1040px, 100%);
      display: grid;
      justify-items: center;
      gap: clamp(8px, 1.6vmin, 16px);
      text-align: center;
      padding-top: 6px;
    }

    .qk-pt-logo {
      position: relative;
      display: grid;
      justify-items: center;
      transform: rotate(-1.5deg);
      font-size: clamp(38px, 6.7vmin, 76px);
      line-height: .78;
      letter-spacing: -.035em;
      filter: drop-shadow(0 8px 0 rgba(69,48,20,.18)) drop-shadow(0 14px 15px rgba(85,48,9,.18));
    }
    .qk-pt-logo::before {
      content: '';
      position: absolute;
      z-index: -1;
      inset: -12% -10% -17%;
      border-radius: 42% 51% 44% 49%;
      background: #0877c9;
      border: clamp(4px, .7vmin, 8px) solid #fff5d2;
      box-shadow: inset 0 -8px 0 rgba(0,52,122,.2), 0 0 0 5px #005199;
    }
    .qk-pt-logo span, .qk-pt-logo strong {
      display: block;
      -webkit-text-stroke: clamp(2px, .35vmin, 4px) #674413;
      paint-order: stroke fill;
      text-shadow: 0 .07em 0 rgba(83,44,4,.22);
    }
    .qk-pt-logo span { color: #ffd331; }
    .qk-pt-logo strong {
      color: #fffdf4;
      font-size: 1.08em;
      margin-top: .16em;
      -webkit-text-stroke-color: #063d78;
    }
    .qk-pt-menu-prompt, .qk-pt-cast-kicker {
      color: #fff;
      background: linear-gradient(#31a9ef, #0878cb);
      border: 4px solid #fff;
      border-radius: 999px;
      padding: 7px 34px 8px;
      box-shadow: 0 5px 0 #075b9d, 0 9px 18px rgba(59,45,16,.18);
      font-size: clamp(20px, 2.9vmin, 32px);
      line-height: 1;
    }

    .qk-pt h1 {
      margin: 0;
      font-size: clamp(34px, 6.4vmin, 70px);
      line-height: .98;
      color: var(--navy);
      text-shadow: 0 4px 0 rgba(255,255,255,.72);
      max-width: 16ch;
    }

    .qk-pt-mode-list {
      display: grid;
      grid-template-columns: repeat(3, minmax(190px, 1fr));
      gap: clamp(10px, 1.8vmin, 18px);
      width: min(900px, 92%);
      margin-top: 2px;
    }
    .qk-pt-mode, .qk-pt-again {
      border-radius: clamp(18px, 2.7vmin, 29px);
      border: 6px solid #a96bdd;
      box-shadow: 0 7px 0 rgba(69,48,20,.22), 0 15px 25px rgba(76,46,11,.18);
      line-height: 1;
    }
    .qk-pt-mode {
      position: relative;
      height: clamp(178px, 27vh, 230px);
      min-height: 0;
      padding: 8px 8px 11px;
      color: #51336e;
      background: linear-gradient(180deg, #fff, #fff8eb);
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 5px;
      overflow: hidden;
      transition: transform .14s ease-out, filter .14s ease-out;
    }
    .qk-pt-mode:nth-child(2) { border-color: #69b63f; color: #36721f; }
    .qk-pt-mode:nth-child(3) { border-color: #f39a31; color: #a7520d; }
    .qk-pt-mode-art {
      min-height: 0;
      display: grid;
      place-items: center;
      overflow: hidden;
      border-radius: calc(clamp(18px, 2.7vmin, 29px) - 8px);
      background: radial-gradient(circle at 50% 42%, #fff 0 22%, #dff2ff 72%);
    }
    .qk-pt-mode:nth-child(2) .qk-pt-mode-art { background: radial-gradient(circle, #fff 0 22%, #eaffdd 72%); }
    .qk-pt-mode:nth-child(3) .qk-pt-mode-art { background: radial-gradient(circle, #fff 0 22%, #fff0d7 72%); }
    .qk-pt-mode-art img { width: auto; height: clamp(72px, 16vh, 120px); max-width: 86%; object-fit: contain; filter: drop-shadow(0 7px 5px rgba(61,42,19,.2)); }
    .qk-pt-mode-art > span { font-size: clamp(54px, 9vmin, 96px); }
    .qk-pt-mode-copy { display: grid; gap: 3px; }
    .qk-pt-mode-title { font-size: clamp(23px, 3.5vmin, 36px); }
    .qk-pt-mode-hint { font-size: clamp(13px, 1.7vmin, 18px); opacity: .75; }
    .qk-pt-mode:hover { transform: translateY(-3px); filter: saturate(1.08); }
    .qk-pt-mode:active, .qk-pt-again:active { transform: scale(.96); }

    .qk-pt-menu-helper {
      margin: -2px 0 0;
      padding: 4px 16px;
      border-radius: 999px;
      color: #5d431d;
      background: rgba(255,251,232,.84);
      font-size: clamp(14px, 1.8vmin, 20px);
    }
    .qk-pt-cast-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(110px, 1fr));
      gap: clamp(8px, 1.5vmin, 15px);
      width: min(860px, 100%);
    }
    .qk-pt-puppet {
      min-width: 110px;
      min-height: clamp(130px, 19vmin, 190px);
      display: grid;
      grid-template-rows: 1fr auto;
      place-items: center;
      border-radius: 24px;
      border: 5px solid #fff;
      background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(232,246,255,.96));
      box-shadow: 0 6px 0 rgba(79,54,24,.2), 0 11px 20px rgba(81,47,12,.15);
      padding: 7px 7px 10px;
      transition: transform .12s ease-out;
      position: relative;
    }
    .qk-pt-puppet-portrait { min-height: 0; width: 100%; height: 100%; display: grid; place-items: center; overflow: hidden; }
    .qk-pt-puppet img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      pointer-events: none;
    }
    .qk-pt-puppet-name { font-size: clamp(14px, 2vmin, 21px); line-height: 1; }
    .qk-pt-pick-badge {
      position: absolute; top: -10px; right: -10px; width: 40px; height: 40px;
      display: grid; place-items: center; border-radius: 50%; border: 4px solid #fff;
      color: #fff; background: #62b631; box-shadow: 0 3px 0 #3f821f; font-size: 22px;
      transform: scale(0); transition: transform .14s ease-out;
    }
    .qk-pt-puppet:active { transform: scale(.94); }
    .qk-pt-puppet.is-picked {
      border-color: #62b631;
      background: linear-gradient(180deg, #ffffff, #e2ffe9);
      transform: scale(1.06);
    }
    .qk-pt-puppet.is-picked .qk-pt-pick-badge { transform: scale(1); }
    .qk-pt-puppet:disabled:not(.is-picked) { opacity: .45; }

    .qk-pt-cast-center { gap: clamp(5px, 1vmin, 10px); }
    .qk-pt-cast-title {
      display: grid;
      justify-items: center;
      gap: 9px;
      padding: 12px 34px 14px;
      border: 5px solid #fff;
      border-radius: 30px;
      background: rgba(255,252,232,.94);
      box-shadow: 0 7px 0 rgba(92,57,14,.18), 0 12px 24px rgba(80,47,12,.14);
    }
    .qk-pt-cast-title h1 { font-size: clamp(27px, 4.6vmin, 52px); max-width: none; }
    .qk-pt-cast-kicker {
      margin-top: -29px;
      padding: 6px 28px 7px;
      font-size: clamp(16px, 2.2vmin, 24px);
    }
    .qk-pt-cast-progress { display: flex; align-items: center; gap: 8px; }
    .qk-pt-cast-progress span {
      width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%;
      color: #789; background: rgba(255,255,255,.88); border: 3px solid #fff; box-shadow: 0 3px 0 rgba(72,49,20,.16);
    }
    .qk-pt-cast-progress span.is-current { color: #fff; background: #ef8b27; transform: scale(1.12); }
    .qk-pt-cast-progress span.is-filled { color: #fff; background: #62b631; }
    .qk-pt-cast-progress i { display: block; width: 45px; height: 6px; border-radius: 9px; background: rgba(255,255,255,.82); }
    .qk-pt-cast-status {
      margin: 0;
      color: #60471e;
      background: rgba(255,252,232,.9);
      border-radius: 999px;
      padding: 4px 18px;
      font-size: clamp(15px, 2vmin, 21px);
    }

    .qk-pt-play {
      display: grid;
      grid-template-rows: auto 1fr;
      padding: max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right))
        max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left));
    }
    .qk-pt-hud {
      position: relative;
      z-index: 3;
      display: grid;
      grid-template-columns: 96px 1fr 96px;
      align-items: center;
      min-height: 100px;
    }
    .qk-pt-hud .qk-pt-back { position: static; grid-column: 1; }
    .qk-pt-progress {
      grid-column: 2;
      justify-self: center;
      display: flex;
      align-items: center;
      gap: 11px;
      min-height: 32px;
      padding: 6px 16px;
      border-radius: 999px;
      background: rgba(255,255,255,.38);
    }
    .qk-pt-dot {
      width: 18px; height: 18px;
      border-radius: 50%;
      background: rgba(255,255,255,.9);
      box-shadow: inset 0 -2px 0 rgba(23,81,126,.12);
      opacity: .8;
    }
    .qk-pt-dot.is-filled { background: var(--mint); opacity: 1; }
    .qk-pt-dot.is-current { background: var(--peach); opacity: 1; transform: scale(1.16); }

    .qk-pt-stagehost {
      min-height: 0;
      position: relative;
      overflow: hidden;
      border-radius: 28px;
      touch-action: none;
    }
    .qk-pt-stagehost canvas {
      display: block;
      width: 100%;
      height: 100%;
      touch-action: none;
    }

    .qk-pt-sound {
      position: absolute;
      left: max(14px, env(safe-area-inset-left));
      bottom: max(12px, env(safe-area-inset-bottom));
      z-index: 4;
    }

    .qk-pt-again {
      display: inline-grid;
      grid-template-columns: 72px auto;
      align-items: center;
      gap: 14px;
      min-width: min(420px, 100%);
      min-height: 92px;
      padding: 10px 32px 12px;
      color: #fff;
      background: linear-gradient(#31a9ef, #0878cb);
      font-size: clamp(24px, 3.5vmin, 38px);
    }
    .qk-pt-play-icon {
      display: block;
      width: 72px; height: 72px;
      background: transparent url('${PLAY_IMG}') center / contain no-repeat;
    }

    .qk-pt-end-center {
      width: min(720px, 94%);
      padding: clamp(24px, 5vmin, 52px);
      border: 6px solid #fff;
      border-radius: 42px;
      background: rgba(255,252,232,.94);
      box-shadow: 0 9px 0 rgba(91,56,13,.2), 0 18px 35px rgba(74,41,8,.18);
    }
    .qk-pt-end-center h1 { color: #3b7f20; max-width: none; }
    .qk-pt-end-center p { margin: 0; color: #765322; font-size: clamp(18px, 2.6vmin, 27px); }
    .qk-pt-finale-stars { display: flex; align-items: center; justify-content: center; margin-bottom: -18px; }
    .qk-pt-finale-stars img {
      width: clamp(130px, 20vmin, 210px); aspect-ratio: 1; object-fit: contain;
      filter: drop-shadow(0 8px 8px rgba(68,41,10,.22));
    }
    .qk-pt-finale-stars img + img { margin-left: -28px; }
    .qk-pt-finale-badge {
      width: 58px; height: 58px; display: grid; place-items: center; border-radius: 50%;
      color: #fff; background: #62b631; border: 5px solid #fff; box-shadow: 0 4px 0 #3c851c;
      font-size: 34px;
    }

    @media (max-width: 560px) {
      .qk-pt-hud { grid-template-columns: 96px 1fr; }
      .qk-pt-progress { justify-self: end; }
      .qk-pt-cast-grid { grid-template-columns: repeat(2, minmax(110px, 1fr)); }
      .qk-pt-mode-list { grid-template-columns: 1fr; width: min(360px, 82%); }
      .qk-pt-mascot-stage { opacity: .5; }
      .qk-pt-splash { overflow-y: auto; place-items: start center; }
      .qk-pt-splash-center { padding: 32px 0; }
      .qk-pt-mode { height: 150px; grid-template-columns: 42% 1fr; grid-template-rows: 1fr; align-items: center; }
    }
    @media (max-height: 690px) and (min-width: 700px) {
      .qk-pt-splash-center { gap: 6px; transform: scale(.91); width: min(1080px, 108%); }
      .qk-pt-mode { height: 168px; }
      .qk-pt-menu-helper { display: none; }
      .qk-pt-cast-center { transform: scale(.88); width: min(980px, 110%); }
    }
    @media (prefers-reduced-motion: reduce) {
      .qk-pt * { transition: none !important; animation: none !important; }
    }
  `;
  document.head.appendChild(style);
  styleInstalled = true;
}
