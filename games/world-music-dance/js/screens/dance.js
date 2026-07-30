// screens/dance.js — meet the dancer, feel the beat, copy three moves.
//
// Pixi for the world (stage backdrop + the cut-paper dancer), DOM for the
// furniture (step rail, move cards, your-turn button). The dancer is a POSE
// ACTOR: whole-illustration swaps with a 220ms paper-pop, driven onto bar lines
// by shared/js/stage/pose-conductor.js so the swap reads as choreography.
//
// THE SILENT CLOCK. The beat position normally comes from music.songNow(),
// which is sample-accurate. But the dance must still read when the instrument
// library is missing or the audio context never unlocked, so the position
// provider falls back to a wall clock at the song's own bpm. The dancer grooves
// and the poses land on bars either way — only the sound is absent.
//
// GREY-BOX DANCER. Until the pose packs are assembled the actor is an inline
// placeholder exposing the same tiny surface pose-sprite does ({ view, setPose,
// pose, preload, destroy }), so every screen, every timing and every debug hook
// can be built and verified before a single dancer has been generated.

import { loadPoseActor } from '../../../../shared/js/stage/pose-sprite.js';
import { createPoseConductor } from '../../../../shared/js/stage/pose-conductor.js';
import { sparkle } from '../../../../shared/js/stage/particles.js';
import { ease, popIn, to } from '../../../../shared/js/stage/tween.js';
import { onTap } from '../../../../shared/js/tap.js';
import { glyphText, hexInt, loadTexture, makeCard, NOTE_SVG, poseGlyph } from '../art.js';

const TOP_RESERVE = 124;
const STEPS = 3;

// COPY PHASE, LANDSCAPE. A bottom row of move cards sits exactly where the
// dancer's feet are on a wide screen, so the child copies a dancer they can only
// see from the knees up. In landscape the copy phase therefore goes SIDE-BY-SIDE:
// the dancer slides to a third of the way across (still standing on the painted
// floor line) and the cards stack into a column on the right. Portrait keeps the
// row — a tall window has room under the dancer and no room beside her.
const SIDE_DANCER_X = 0.34;
const SIDE_CARDS_X = 0.76;
const SIDE_CARD_GAP = 12;
/** Card height bounds for the column: the low end IS the touch-target floor
 *  (a 4:5 card 150px tall is 120px wide), the high end keeps three on screen. */
const SIDE_CARD_MIN = 150;
const SIDE_CARD_MAX = 185;
/** Rail height before it has ever been measured (2×14 padding + 44 dot + border). */
const RAIL_H = 76;

// Where the two horizon lines of stage-night.webp sit, as fractions of the
// BACKGROUND's own height — not the viewport's. The art is cover-fitted, so a
// viewport fraction drifts off the painted stage the moment the window changes
// shape and the dancer starts levitating. Measured off the file: the platform's
// top edge runs at 0.798 (feet land a hair past it, onto the boards), and the
// bunting's lowest flag hem clears by 0.215.
const FLOOR_RATIO = 0.802;
const SKY_RATIO = 0.215;

export async function createDanceScreen(ctx, opts = {}) {
  const culture = ctx.cultureById(opts.cultureId) || ctx.cultures[0];
  if (!culture) throw new Error('world-music-dance: no cultures configured');

  const stage = await ctx.getStage();
  const { PIXI, app } = stage;
  ctx.showStage(true);

  const assets = ctx.config.assets || {};
  const listenCfg = ctx.config.listen || {};
  const minLoops = Math.max(1, Number(listenCfg.minLoops) || 1);
  const autoLoops = Math.max(minLoops, Number(listenCfg.autoAdvanceLoops) || 3);
  const barsPerPose = Math.max(1, Number(listenCfg.barsPerPose) || 2);
  const latencyMs = Number((ctx.config.sync || {}).latencyMs) || 0;
  const accent = hexInt(culture.accent);
  const moves = Array.isArray(culture.moves) ? culture.moves.slice(0, STEPS) : [];

  let dead = false;
  let phase = 'listen';
  let step = 0;
  let wrongCount = 0;
  let praiseIndex = 0;
  let busy = false;
  let awaiting = false;
  let loops = 0;
  let syntheticLoops = 0;
  const loopWaiters = new Set();

  let readyResolve = null;
  const ready = new Promise((resolve) => { readyResolve = resolve; });

  // ------------------------------------------------------------------ scene

  const [stageTex, cardTex] = await Promise.all([
    loadTexture(PIXI, ctx.assetUrl(assets.stageBackground)),
    loadTexture(PIXI, ctx.assetUrl(assets.cardBacking)),
  ]);
  const actor = await makeActor();
  const nominal = actorNominalHeight(actor);

  const scene = new PIXI.Container();
  const bgLayer = new PIXI.Container();
  const dancerAnchor = new PIXI.Container();   // positioned by layout()
  const dancerRoot = new PIXI.Container();     // bobbed by the conductor
  const dancerScale = new PIXI.Container();    // sized by layout()
  const fxLayer = new PIXI.Container();
  dancerScale.addChild(actor.view);
  dancerRoot.addChild(dancerScale);
  dancerAnchor.addChild(dancerRoot);
  scene.addChild(bgLayer, dancerAnchor, fxLayer);

  const bgSprite = stageTex ? new PIXI.Sprite(stageTex) : null;
  const bgFallback = stageTex ? null : new PIXI.Graphics();
  const accentGlow = new PIXI.Graphics();
  if (bgSprite) bgLayer.addChild(bgSprite);
  if (bgFallback) bgLayer.addChild(bgFallback);
  bgLayer.addChild(accentGlow);

  stage.setScene(scene);

  // ------------------------------------------------------------------- DOM

  const dom = document.createElement('div');
  dom.className = 'wmd-dance-dom';
  dom.innerHTML = `
    <div class="wmd-rail" role="progressbar" aria-valuemin="0" aria-valuemax="${STEPS}" aria-valuenow="0" hidden>
      ${Array.from({ length: STEPS }, () => '<span class="wmd-dot"></span>').join('')}
    </div>
    <div class="wmd-cards" hidden></div>
    <button class="wmd-turn" type="button" aria-label="Your turn" hidden>${NOTE_SVG}<span>My turn!</span></button>`;
  const railEl = dom.querySelector('.wmd-rail');
  const dotEls = Array.from(dom.querySelectorAll('.wmd-dot'));
  const cardsEl = dom.querySelector('.wmd-cards');
  const turnEl = dom.querySelector('.wmd-turn');
  ctx.layer.appendChild(dom);

  const disposers = [onTap(turnEl, () => { if (!dead && phase === 'listen') startCopy(); }, {
    feedback: (e) => { e.preventDefault(); ctx.unlockAudio(); ctx.sfx('tick'); },
  })];

  // ----------------------------------------------------------------- layout

  /** Where the cover-fitted backdrop actually lands, in stage coordinates. */
  function bgRect(w, h) {
    if (!stageTex) return { x: 0, y: 0, w, h };
    const cover = Math.max(w / stageTex.width, h / stageTex.height);
    const bw = stageTex.width * cover;
    const bh = stageTex.height * cover;
    return { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh };
  }

  function layout(w, h) {
    if (dead) return;
    const bg = bgRect(w, h);
    if (bgSprite && stageTex) {
      bgSprite.width = bg.w;
      bgSprite.height = bg.h;
      bgSprite.position.set(bg.x, bg.y);
    }
    if (bgFallback) {
      bgFallback.clear();
      bgFallback.rect(0, 0, w, h).fill(hexInt(ctx.theme.night, 0x141c33));
      bgFallback.roundRect(w * 0.04, h * 0.1, w * 0.92, h * 0.82, 36)
        .fill(hexInt(ctx.theme.panel, 0x223052));
      bgFallback.roundRect(0, h * 0.8, w, h * 0.2, 0).fill({ color: 0x2e3f6d, alpha: 0.9 });
      for (let i = 0; i < 9; i += 1) {
        const x = (w / 10) * (i + 1);
        const y = h * 0.09 + Math.sin(i * 0.9) * h * 0.03;
        bgFallback.moveTo(x, 0).lineTo(x, y).stroke({ width: 3, color: 0xfff3d6, alpha: 0.25 });
        bgFallback.circle(x, y + 16, 16).fill({ color: 0xffd98a, alpha: 0.85 });
      }
    }
    // The floor line, and the dancer standing ON it. The pose actor's origin is
    // its own anchor (0.5, 0.949) — the soles — so putting the anchor container
    // on the floor y is the whole trick. In the landscape copy phase she stands
    // further left; the floor line never moves, so the feet stay planted.
    const side = isSideLayout(w, h);
    const floorY = clamp(bg.y + bg.h * FLOOR_RATIO, TOP_RESERVE + 150, h - 24);
    const dancerX = side ? Math.round(w * SIDE_DANCER_X) : w / 2;
    const availH = Math.max(120, floorY - TOP_RESERVE);
    const targetH = Math.max(140, Math.min(availH, h * 0.6));
    dancerAnchor.position.set(dancerX, floorY);
    dancerScale.scale.set(targetH / nominal);

    // Spotlight, pooled at the feet: a wide soft halo that lifts the dancer off
    // the painted wall, plus a tight warm puddle that says "standing here". It
    // narrows in the side layout so its far edge stops short of the card column.
    const haloW = w * (side ? 0.26 : 0.36);
    accentGlow.clear();
    accentGlow.ellipse(dancerX, floorY, haloW, Math.max(120, h * 0.22))
      .fill({ color: accent, alpha: 0.15 });
    accentGlow.ellipse(dancerX, floorY, haloW * 0.53, Math.max(26, h * 0.045))
      .fill({ color: 0xffd98a, alpha: 0.2 });

    // The rail rides just under the bunting rather than through it.
    const railTop = clamp(bg.y + bg.h * SKY_RATIO, 92, h * 0.3);
    dom.style.setProperty('--wmd-rail-top', `${Math.round(railTop)}px`);
    layoutCards(w, h, side, railTop);
  }

  /** Side-by-side only while the child is copying, and only on a wide window. */
  function isSideLayout(w, h) { return phase === 'copy' && w > h; }

  /**
   * The landscape card column: three cards stacked at SIDE_CARDS_X, centred in
   * the band between the step rail and the bottom of the stage. Cards shrink to
   * fit that band and stop at SIDE_CARD_MIN — below that the column would rather
   * hang off the bottom than hand a five-year-old a target she cannot hit.
   */
  function layoutCards(w, h, side, railTop) {
    cardsEl.classList.toggle('side', side);
    if (!side) return;
    const railH = (!railEl.hidden && railEl.offsetHeight) || RAIL_H;
    const bandTop = railTop + railH + 10;
    const bandBottom = h - 12;
    const fits = Math.floor((bandBottom - bandTop - SIDE_CARD_GAP * 2) / 3);
    const cardH = clamp(fits, SIDE_CARD_MIN, SIDE_CARD_MAX);
    const columnH = cardH * 3 + SIDE_CARD_GAP * 2;
    const lo = TOP_RESERVE + columnH / 2;
    const hi = h - 10 - columnH / 2;
    const midY = (bandTop + bandBottom) / 2;
    const centerY = lo <= hi ? clamp(midY, lo, hi) : h / 2;
    dom.style.setProperty('--wmd-card-h', `${cardH}px`);
    dom.style.setProperty('--wmd-card-gap', `${SIDE_CARD_GAP}px`);
    dom.style.setProperty('--wmd-cards-x', `${Math.round(w * SIDE_CARDS_X)}px`);
    dom.style.setProperty('--wmd-cards-y', `${Math.round(centerY)}px`);
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function layoutNow() {
    const size = stage.size();
    layout(size.w, size.h);
  }
  const offResize = stage.onResize(layout);

  // ------------------------------------------------- conductor, then music
  //
  // Order matters: playSong's onLoop lands in handleLoop, which touches the
  // conductor. Building the conductor first means the callback can never fire
  // into a temporal dead zone, however early the first loop point arrives.

  const conductor = createPoseConductor({
    actor: { view: dancerRoot, setPose: (name, options) => actor.setPose(name, options) },
    schedule: {
      order: (culture.poseSchedule && culture.poseSchedule.order) || ['neutral', 'move-1', 'move-2', 'move-3'],
      barsPerPose,
      celebrateOnLoop: !(culture.poseSchedule && culture.poseSchedule.celebrateOnLoop === false),
    },
    latencyMs,
    reducedMotion: ctx.reduced,
    onBeat: pulseRail,
  });

  const song = ctx.startSong(culture, { onLoop: handleLoop })
    || { id: culture.song, bpm: 100, beatsPerBar: 4, bars: 8 };
  const totalBeats = Math.max(1, (song.beatsPerBar || 4) * (song.bars || 8));
  const barMs = ((60 / (song.bpm || 100)) * (song.beatsPerBar || 4)) * 1000;
  const clockStart = performance.now();
  conductor.start(positionProvider);

  function positionProvider() {
    const now = ctx.songNow();
    if (now) return { beat: now.loopBeat, bpm: now.bpm, song: now.song };
    // Silent fallback clock (see the header note).
    const beats = ((performance.now() - clockStart) / 1000) * ((song.bpm || 100) / 60);
    const loop = Math.floor(beats / totalBeats);
    if (loop > syntheticLoops) { syntheticLoops = loop; handleLoop(loop); }
    return { beat: beats % totalBeats, bpm: song.bpm, song };
  }

  function handleLoop(n) {
    if (dead) return;
    loops = Math.max(loops, Number(n) || 0);
    conductor.notifyLoop();
    for (const waiter of [...loopWaiters]) if (loops >= waiter.n) waiter.resolve();
  }

  /** Resolve after `n` song loops, or after a wall-clock backstop. */
  function waitLoops(n) {
    if (loops >= n) return Promise.resolve();
    return new Promise((resolve) => {
      const waiter = { n, resolve: () => { loopWaiters.delete(waiter); resolve(); } };
      loopWaiters.add(waiter);
      ctx.wait(barMs * (song.bars || 8) * n + 2000).then(waiter.resolve);
    });
  }

  // ------------------------------------------------------------- DOM detail

  let beatTimer = 0;
  /**
   * One dot pulses, not three: the step the child is on. A rail that flashes
   * everything says "music is playing"; a rail that flashes one dot says
   * "you are here, and here is the beat you are copying".
   */
  function pulseRail() {
    if (dead || railEl.hidden || ctx.reduced) return;
    const dot = dotEls[Math.min(step, dotEls.length - 1)];
    if (!dot) return;
    dot.classList.remove('beat');
    void dot.offsetWidth;   // reflow, so the animation restarts on every beat
    dot.classList.add('beat');
    clearTimeout(beatTimer);
    beatTimer = setTimeout(() => dot.classList.remove('beat'), 380);
  }

  function poseArtUrl(pose) {
    const manifest = actor.manifest;
    if (!manifest || !manifest.poses || !manifest.poses[pose]) return null;
    try {
      return new URL(manifest.poses[pose].art, ctx.assetUrl(culture.dancer.base)).href;
    } catch { return null; }
  }

  function renderCards() {
    const order = ctx.shuffle(moves);
    cardsEl.hidden = false;
    cardsEl.replaceChildren();
    for (const move of order) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'wmd-move';
      button.dataset.pose = move.pose;
      button.setAttribute('aria-label', String(move.name || move.pose).replace(/-/g, ' '));
      const art = poseArtUrl(move.pose);
      if (art) {
        const img = document.createElement('img');
        img.alt = '';
        img.draggable = false;
        img.addEventListener('error', () => img.replaceWith(glyphSpan(move.pose)), { once: true });
        img.src = art;
        button.appendChild(img);
      } else {
        button.appendChild(glyphSpan(move.pose));
      }
      disposers.push(onTap(button, () => onCardTap(move.pose, button), {
        feedback: (e) => { e.preventDefault(); ctx.unlockAudio(); },
      }));
      cardsEl.appendChild(button);
    }
  }

  function glyphSpan(pose) {
    const span = document.createElement('span');
    span.className = 'wmd-move-glyph';
    span.textContent = poseGlyph(pose);
    return span;
  }

  function fillDots() {
    dotEls.forEach((dot, index) => {
      dot.classList.toggle('done', index < step);
      dot.classList.toggle('active', index === step);
    });
    railEl.setAttribute('aria-valuenow', String(step));
  }

  // ------------------------------------------------------------- the phases

  async function runListen() {
    await ctx.say(`greet-${culture.id}`);
    if (dead || phase !== 'listen') return;
    await waitLoops(minLoops);
    if (dead || phase !== 'listen') return;
    turnEl.hidden = false;
    awaiting = true;
    ctx.armIdle('dance-listen');
    readyResolve();
    await waitLoops(autoLoops);
    if (dead || phase !== 'listen') return;
    startCopy();
  }

  async function startCopy() {
    if (dead || phase !== 'listen') return;
    phase = 'copy';
    awaiting = false;
    turnEl.hidden = true;
    railEl.hidden = false;
    step = 0;
    wrongCount = 0;
    fillDots();
    layoutNow();
    readyResolve();
    await ctx.say('your-turn');
    if (dead || phase !== 'copy') return;
    await runStep();
  }

  async function runStep() {
    if (dead || phase !== 'copy') return;
    const move = moves[step];
    if (!move) { await finishRound(); return; }
    wrongCount = 0;
    conductor.hold(move.pose);
    renderCards();
    busy = false;
    awaiting = true;
    ctx.armIdle(`dance-copy-${step}`);
    ctx.say(`move-${culture.id}-${step + 1}`);
  }

  async function onCardTap(pose, button) {
    if (dead || busy || !awaiting || phase !== 'copy') return;
    ctx.unlockAudio();
    ctx.pokeIdle();
    const move = moves[step];
    if (!move) return;
    if (pose === move.pose) await correct(button);
    else await wrong(button);
  }

  async function correct(button) {
    busy = true;
    awaiting = false;
    ctx.sfx('pop');
    if (button) {
      const rect = button.getBoundingClientRect();
      const at = clientToStage(rect.left + rect.width / 2, rect.top + rect.height / 2);
      sparkle(PIXI, fxLayer, at.x, at.y, accent);
    }
    step += 1;
    fillDots();
    cardsEl.querySelectorAll('.wmd-move').forEach((el) => { el.disabled = true; });
    conductor.hold('celebrate');
    ctx.say(`praise-${1 + (praiseIndex++ % 4)}`);
    await ctx.wait(barMs);
    if (dead || phase !== 'copy') return;
    if (step >= STEPS) { await finishRound(); return; }
    await runStep();
  }

  async function wrong(button) {
    busy = true;
    awaiting = false;
    wrongCount += 1;
    ctx.sfx('boing');
    if (button) {
      button.classList.add('wrong');
      setTimeout(() => button.classList.remove('wrong'), 460);
    }
    const move = moves[step];
    ctx.say('nudge-copy');
    // Re-demo: drop to neutral for a beat, then pop the move back so the child
    // sees the swap happen rather than staring at a pose that never moved.
    conductor.hold('neutral');
    await ctx.wait(Math.max(240, barMs / 2));
    if (dead || phase !== 'copy') return;
    conductor.hold(move.pose);
    // Second miss on the same step: model the answer. Never a lockout.
    if (wrongCount >= 2) {
      const hint = cardsEl.querySelector(`.wmd-move[data-pose="${cssEscape(move.pose)}"]`);
      if (hint) hint.classList.add('hint');
    }
    busy = false;
    awaiting = true;
    ctx.armIdle(`dance-copy-${step}`);
  }

  async function finishRound() {
    if (dead || phase === 'earn') return;
    phase = 'earn';
    awaiting = false;
    busy = true;
    ctx.sfx('tada');
    conductor.hold('celebrate');
    cardsEl.hidden = true;
    cardsEl.replaceChildren();
    // Copying is over, so the side layout is too: the dancer walks back to
    // centre stage before the earned card pops in front of her.
    layoutNow();

    // The earned card composes itself in front of the dancer, then whooshes to
    // the corner the map dock will hold it in.
    const size = stage.size();
    const card = makeCard(PIXI, {
      culture, width: 240, height: 300, backing: cardTex, poseUrl: poseArtUrl('neutral'),
    });
    card.position.set(size.w / 2, size.h * 0.5);
    card.scale.set(0.01);
    fxLayer.addChild(card);
    await popIn(card, ctx.ms(360));
    if (dead) return;
    ctx.sfx('whoosh');
    await to(card, {
      x: size.w - 96, y: size.h - 96, rotation: 0.12, alpha: 0.9,
      scale: { x: 0.32, y: 0.32 },
    }, { ms: ctx.ms(520), easing: ease.outCubic });
    if (dead) return;

    conductor.stop();
    ctx.stopSong();
    const alreadyPlaced = ctx.collection.isPlaced(culture.id);
    if (alreadyPlaced) {
      // Replay: the card is already home, so skip placement and cheer instead.
      ctx.setPending(null);
      ctx.goto('map', { mode: 'choose', greeting: 'placed-cheer' });
      return;
    }
    ctx.setPending({ cultureId: culture.id });
    ctx.goto('map', { mode: 'place', cultureId: culture.id, greeting: 'map-prompt' });
  }

  function clientToStage(clientX, clientY) {
    const rect = app.canvas.getBoundingClientRect();
    const size = stage.size();
    return {
      x: rect.width ? (clientX - rect.left) * size.w / rect.width : clientX,
      y: rect.height ? (clientY - rect.top) * size.h / rect.height : clientY,
    };
  }

  function domRect(el) {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }

  layoutNow();
  runListen();

  // -------------------------------------------------------------------- API

  return {
    name: 'dance',
    ready,
    getState: () => ({
      culture: culture.id,
      phase,
      step,
      awaitingInput: awaiting && !busy && !dead,
    }),
    getTargets() {
      if (dead) return [];
      if (phase === 'listen') {
        return turnEl.hidden ? [] : [{ id: 'your-turn', role: 'correct', rect: domRect(turnEl) }];
      }
      if (phase !== 'copy') return [];
      const want = moves[step] ? moves[step].pose : null;
      return Array.from(cardsEl.querySelectorAll('.wmd-move')).map((el) => ({
        id: `move:${el.dataset.pose}`,
        role: el.dataset.pose === want ? 'correct' : 'wrong',
        rect: domRect(el),
      }));
    },
    tap(id) {
      if (dead) return { accepted: false };
      if (id === 'your-turn' && phase === 'listen') { startCopy(); return { accepted: true }; }
      if (typeof id === 'string' && id.startsWith('move:')) {
        const pose = id.slice('move:'.length);
        const button = cardsEl.querySelector(`.wmd-move[data-pose="${cssEscape(pose)}"]`);
        onCardTap(pose, button);
        return { accepted: true };
      }
      return { accepted: false };
    },
    /** Complete the current phase through the real handlers, never a shortcut. */
    async winRound() {
      if (dead) return;
      if (phase === 'listen') await startCopy();
      const deadline = Date.now() + 20000;
      while (!dead && phase === 'copy' && Date.now() < deadline) {
        if (awaiting && !busy && moves[step]) {
          const pose = moves[step].pose;
          const button = cardsEl.querySelector(`.wmd-move[data-pose="${cssEscape(pose)}"]`);
          await onCardTap(pose, button);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
      }
    },
    onBack() {
      ctx.stopSong();
      // Bank a card the child already earned rather than silently losing it.
      ctx.goto('map', { mode: ctx.pending ? 'place' : 'choose' });
    },
    destroy() {
      dead = true;
      clearTimeout(beatTimer);
      loopWaiters.forEach((waiter) => { try { waiter.resolve(); } catch { /* settled */ } });
      loopWaiters.clear();
      disposers.forEach((dispose) => { try { dispose(); } catch { /* already gone */ } });
      try { conductor.destroy(); } catch { /* already down */ }
      ctx.stopSong();
      offResize();
      dom.remove();
      try { actor.destroy(); } catch { /* the scene teardown may have it */ }
      stage.setScene(null);
    },
  };

  // ------------------------------------------------------------ actor build

  async function makeActor() {
    if (ctx.poseReady(culture.id) && culture.dancer) {
      try {
        const url = ctx.assetUrl(String(culture.dancer.base || '') + String(culture.dancer.manifest || 'poses.json'));
        return await loadPoseActor(PIXI, url);
      } catch (error) {
        console.warn('[world-music-dance] pose pack unavailable, using placeholder', error);
      }
    }
    return placeholderActor(PIXI, culture);
  }
}

function actorNominalHeight(actor) {
  if (actor && Number.isFinite(actor.nominalHeight)) return actor.nominalHeight;
  const canvas = actor && actor.manifest && actor.manifest.canvas;
  if (Number.isFinite(canvas)) return canvas;
  if (Array.isArray(canvas) && Number.isFinite(canvas[1])) return canvas[1];
  return 1024;
}

/**
 * The grey-box dancer: a cut-paper silhouette plus a per-pose glyph, exposing
 * exactly the surface pose-sprite's actor does. Origin is at the FEET (matching
 * the pose-actor anchor of [0.5, 0.94]) so layout can stand it on the floor.
 */
function placeholderActor(PIXI, culture) {
  const accent = hexInt(culture.accent);
  const H = 520;
  const view = new PIXI.Container();

  const body = new PIXI.Graphics();
  body.ellipse(0, -6, 120, 22).fill({ color: 0x000000, alpha: 0.28 });
  body.roundRect(-96, -H * 0.64, 192, H * 0.64, 54).fill({ color: accent, alpha: 0.92 });
  body.roundRect(-96, -H * 0.64, 192, H * 0.64, 54).stroke({ width: 6, color: 0xfff3d6, alpha: 0.55 });
  body.circle(0, -H * 0.68, 70).fill(0xfff3d6);
  body.circle(0, -H * 0.68, 70).stroke({ width: 5, color: accent, alpha: 0.6 });
  view.addChild(body);

  const label = glyphText(PIXI, poseGlyph('neutral'), 132);
  label.position.set(0, -H * 0.36);
  view.addChild(label);

  let pose = 'neutral';
  let destroyed = false;
  return {
    view,
    manifest: null,
    nominalHeight: H,
    get pose() { return pose; },
    setPose(name) {
      if (destroyed) return Promise.resolve(false);
      pose = name || 'neutral';
      label.text = poseGlyph(pose);
      return Promise.resolve(true);
    },
    preload() { return Promise.resolve(); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (!view.destroyed) view.destroy({ children: true });
    },
  };
}

/** Minimal CSS.escape for our own kebab-case pose ids (older Safari lacks it). */
function cssEscape(value) {
  const text = String(value);
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(text);
  return text.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
