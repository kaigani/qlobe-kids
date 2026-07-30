// screens/map.js — the cut-paper night world map: choose a culture, then pin
// its earned dance card home.
//
// TWO MODES, ONE SCENE. 'choose' lights every unplaced lantern and sends a tap
// to the dance screen. 'place' lights exactly one lantern and puts the earned
// card in a dock the child drags from. They share a scene because they share a
// map: rebuilding it would re-letterbox, re-tween and re-fetch between two
// halves of the same 60-second loop.
//
// WHY CONTAIN-FIT. The map is authored in a fixed art space (config.map.space)
// and contain-fitted into the play band, letterboxed on ink-blue. Cover-fit
// would crop the edges — and the edges are where Mexico and Japan live. A pin
// that walks off screen in portrait is a country a child cannot visit, so pin
// positions are recomputed from the contain transform on every resize.
//
// WHY THE DROP TEST IS max(art-radius, 120px). The art radius alone shrinks
// with the map: on a phone-shaped viewport it becomes a ~40px target, well
// under what a five-year-old can hit. The 120px screen floor is the real
// contract; the art radius only ever makes the target bigger.
//
// Tap-tap is an equal path to dragging (interaction pattern #11 rule 7): a tap
// on the active lantern runs the exact same attemptPlace() the drop runs.

import { createDragToSlot } from '../../../../shared/js/stage/drag-to-slot.js';
import { burst, sparkle } from '../../../../shared/js/stage/particles.js';
import { ease, to } from '../../../../shared/js/stage/tween.js';
import { hexInt, loadTexture, makeCard, makeStamp, neutralPoseUrl } from '../art.js';

/** Screen px kept clear at the top for the HUD button and its glow. */
const TOP_RESERVE = 124;
/** Extra screen px reserved at the bottom while the card dock is showing. */
const DOCK_RESERVE = 216;
/** Local (unscaled) pin size; the container is scaled to the screen floor. */
const PIN_LOCAL = 100;
/** Authored card size; every card scale in here is relative to this. */
const CARD_W = 240;
const CARD_H = 300;
/** How long the placement payoff holds before auto-returning to choose mode. */
const CELEBRATE_MS = 5000;

export async function createMapScreen(ctx, opts = {}) {
  const stage = await ctx.getStage();
  const { PIXI, app } = stage;
  ctx.showStage(true);
  ctx.stopSong();

  const cfg = ctx.config.map || {};
  const space = Array.isArray(cfg.space) && cfg.space.length === 2 ? cfg.space : [2048, 1280];
  const pinMinPx = Number(cfg.pinMinScreenPx) || 120;
  const pinRadiusArt = Number(cfg.pinRadiusArt) || 150;
  const assets = ctx.config.assets || {};

  let activeId = opts.cultureId || (ctx.pending && ctx.pending.cultureId) || null;
  let mode = opts.mode === 'place' && activeId ? 'place' : 'choose';
  let dead = false;
  let busy = false;
  let skippable = false;
  let selected = false;
  let piece = null;          // { view, homeX, homeY, homeScale, hitLocalSize }
  let mapScale = 1;
  let mapX = 0;
  let mapY = 0;
  let dockX = 0;
  let dockY = 0;
  let cardHome = 1;
  let pulseT = 0;
  const skippers = new Set();

  const [mapTex, lanternTex, cardTex] = await Promise.all([
    loadTexture(PIXI, ctx.assetUrl(assets.mapBackground)),
    loadTexture(PIXI, ctx.assetUrl(assets.lantern)),
    loadTexture(PIXI, ctx.assetUrl(assets.cardBacking)),
  ]);

  // ------------------------------------------------------------ scene graph

  const scene = new PIXI.Container();
  const mapArt = new PIXI.Container();
  const stampLayer = new PIXI.Container();
  const pinLayer = new PIXI.Container();
  const cardLayer = new PIXI.Container();
  const dragLayer = new PIXI.Container();
  const fxLayer = new PIXI.Container();
  scene.addChild(mapArt, stampLayer, pinLayer, cardLayer, dragLayer, fxLayer);

  const pins = new Map();
  const stamps = new Map();

  buildMapArt();
  ctx.cultures.forEach((culture, index) => pins.set(culture.id, buildPin(culture, index)));
  ctx.cultures.forEach((culture) => { if (ctx.collection.isPlaced(culture.id)) addStamp(culture, false); });

  stage.setScene(scene);

  // ---------------------------------------------------------------- helpers

  const toScreen = (point) => ({
    x: mapX + (Number(point && point.x) || 0) * mapScale,
    y: mapY + (Number(point && point.y) || 0) * mapScale,
  });

  const liveCard = () => (piece && piece.view && !piece.view.destroyed ? piece.view : null);

  function layoutNow() {
    const size = stage.size();
    layout(size.w, size.h);
  }

  function layout(w, h) {
    if (dead) return;
    const bottom = mode === 'place' ? DOCK_RESERVE : 28;
    const availW = Math.max(120, w - 28);
    const availH = Math.max(120, h - TOP_RESERVE - bottom);
    mapScale = Math.min(availW / space[0], availH / space[1]);
    const drawnH = space[1] * mapScale;
    mapX = (w - space[0] * mapScale) / 2;
    mapY = TOP_RESERVE + (availH - drawnH) / 2;
    mapArt.position.set(mapX, mapY);
    mapArt.scale.set(mapScale);

    const pinScale = Math.max(pinMinPx, pinRadiusArt * mapScale) / PIN_LOCAL;
    for (const pin of pins.values()) {
      const at = toScreen(pin.culture.pin);
      pin.view.position.set(at.x, at.y);
      pin.view.scale.set(pinScale);
      const stamp = stamps.get(pin.culture.id);
      if (stamp) {
        stamp.position.set(at.x + pinMinPx * 0.44, at.y + pinMinPx * 0.36);
        stamp.scale.set(Math.max(0.5, pinScale * 0.6));
      }
    }

    const cardH = Math.min(232, Math.max(150, h * 0.26));
    cardHome = (cardH / CARD_H) * (mode === 'place' ? 1 : 0.62);
    dockX = mode === 'place' ? w / 2 : w - (CARD_W * cardHome) / 2 - 20;
    dockY = h - (CARD_H * cardHome) / 2 - 18;
    if (piece) {
      piece.homeX = dockX;
      piece.homeY = dockY;
      piece.homeScale = cardHome;
      const view = liveCard();
      if (view && !drag.active) {
        view.position.set(dockX, dockY);
        view.scale.set(cardHome * (selected ? 1.06 : 1));
      }
    }
    drag.reproject();
  }

  // -------------------------------------------------------------- scene art

  function buildMapArt() {
    if (mapTex) {
      const sprite = new PIXI.Sprite(mapTex);
      sprite.width = space[0];
      sprite.height = space[1];
      mapArt.addChild(sprite);
      return;
    }
    // Grey-box map: an ink-blue paper sea with rounded kraft "continents"
    // roughly where the real ones are, so the authored pin coords stay
    // meaningful before the painted map lands.
    const sea = new PIXI.Graphics();
    sea.roundRect(0, 0, space[0], space[1], 48).fill(hexInt(ctx.theme.panel, 0x223052));
    mapArt.addChild(sea);
    const stars = new PIXI.Graphics();
    for (let i = 0; i < 44; i += 1) {
      stars.circle((i * 613) % space[0], (i * 271) % space[1], 4).fill({ color: 0xfff3d6, alpha: 0.22 });
    }
    mapArt.addChild(stars);
    const land = new PIXI.Graphics();
    // Continent-sized, not pin-sized: every authored pin must land ON one of
    // these, so a grey-box QA pass still tells you whether a coordinate is
    // plausible before the painted map arrives.
    const blobs = [
      [420, 470, 560, 440, 0x6fae58],   // North America
      [660, 900, 320, 440, 0x4f9f6a],   // South America
      [960, 370, 280, 240, 0x7ab7d8],   // Europe
      [1010, 780, 400, 500, 0xd8a24a],  // Africa
      [1440, 470, 800, 540, 0xe0895a],  // Asia
      [1720, 1010, 320, 230, 0xc46f8c], // Oceania
    ];
    for (const [x, y, rw, rh, color] of blobs) {
      land.ellipse(x, y, rw / 2, rh / 2).fill({ color, alpha: 0.82 });
    }
    mapArt.addChild(land);
  }

  function buildPin(culture, index) {
    const accent = hexInt(culture.accent);
    const view = new PIXI.Container();
    const glow = new PIXI.Graphics();
    glow.circle(0, 0, PIN_LOCAL * 0.52).fill({ color: accent, alpha: 0.5 });
    glow.circle(0, 0, PIN_LOCAL * 0.34).fill({ color: 0xffd98a, alpha: 0.45 });
    view.addChild(glow);

    let body;
    if (lanternTex) {
      body = new PIXI.Sprite(lanternTex);
      body.anchor.set(0.5);
      body.height = PIN_LOCAL * 0.86;
      body.width = body.height * (lanternTex.width / Math.max(1, lanternTex.height));
      body.tint = accent;
    } else {
      body = new PIXI.Graphics();
      body.moveTo(0, -PIN_LOCAL * 0.52).lineTo(0, -PIN_LOCAL * 0.36)
        .stroke({ width: 5, color: 0xfff3d6, alpha: 0.7 });
      body.roundRect(-PIN_LOCAL * 0.21, -PIN_LOCAL * 0.36, PIN_LOCAL * 0.42, PIN_LOCAL * 0.52, 14)
        .fill({ color: accent })
        .stroke({ width: 4, color: 0xfff3d6, alpha: 0.85 });
      body.circle(0, PIN_LOCAL * 0.22, PIN_LOCAL * 0.07).fill(0xfff3d6);
    }
    view.addChild(body);

    view.eventMode = 'static';
    view.cursor = 'pointer';
    view.hitArea = new PIXI.Circle(0, 0, PIN_LOCAL * 0.6);
    view.on('pointertap', () => onPinTap(culture.id));
    pinLayer.addChild(view);
    return { culture, view, glow, body, phase: index * 0.9, boost: 0 };
  }

  function addStamp(culture, animate = true) {
    if (stamps.has(culture.id)) return stamps.get(culture.id);
    const stamp = makeStamp(PIXI, culture, 86, { poseUrl: neutralPoseUrl(ctx, culture) });
    stampLayer.addChild(stamp);
    stamps.set(culture.id, stamp);
    if (animate && !ctx.reduced) {
      stamp.alpha = 0;
      to(stamp, { alpha: 1 }, { ms: ctx.ms(260) });
    }
    return stamp;
  }

  function tickPulse(ticker) {
    if (dead) return;
    const dt = (ticker && ticker.deltaMS ? ticker.deltaMS : 16) / 1000;
    pulseT += dt;
    for (const pin of pins.values()) {
      const placed = ctx.collection.isPlaced(pin.culture.id);
      const live = mode === 'place' ? pin.culture.id === activeId : !placed;
      if (pin.boost > 0) pin.boost = Math.max(0, pin.boost - dt);
      if (!live) {
        // In place mode there is exactly one right answer, so the other five
        // lanterns go properly dark — the target has to be unmistakable.
        pin.glow.alpha = mode === 'place' ? 0.1 : (placed ? 0.16 : 0.3);
        pin.glow.scale.set(1);
        pin.body.alpha = mode === 'place' ? 0.42 : (placed ? 0.55 : 0.92);
        continue;
      }
      pin.body.alpha = 1;
      if (ctx.reduced) { pin.glow.alpha = 0.8; pin.glow.scale.set(1.06); continue; }
      const wave = 0.5 + 0.5 * Math.sin(pulseT * 2.3 + pin.phase);
      const boost = pin.boost > 0 ? 1 : 0;
      pin.glow.alpha = Math.min(1, 0.34 + wave * 0.34 + boost * 0.3);
      pin.glow.scale.set(1 + wave * 0.09 + boost * 0.08);
    }
  }

  // ------------------------------------------------------------------- card

  function buildPiece() {
    const culture = ctx.cultureById(activeId);
    if (!culture) return null;
    const view = makeCard(PIXI, {
      culture, width: CARD_W, height: CARD_H, backing: cardTex,
      poseUrl: neutralPoseUrl(ctx, culture),
    });
    view.eventMode = 'static';
    view.cursor = 'grab';
    view.on('pointerdown', (event) => {
      ctx.unlockAudio();
      ctx.pokeIdle();
      if (dead || busy) return;
      if (mode !== 'place') {
        // The banked card sitting in the corner: tapping it resumes placement.
        ctx.sfx('tick');
        toPlaceMode(activeId || (ctx.pending && ctx.pending.cultureId));
        return;
      }
      selected = true;
      ctx.sfx('tick');
      drag.begin(event, 'card');
    });
    cardLayer.addChild(view);
    return { view, homeX: dockX, homeY: dockY, homeScale: cardHome, hitLocalSize: CARD_H };
  }

  const drag = createDragToSlot({
    stage,
    dragLayer: () => dragLayer,
    getPiece: (id) => (id === 'card' && liveCard() ? piece : null),
    canStart: () => !dead && !busy && mode === 'place',
    onLift: () => ctx.sfx('whoosh'),
    onDrop: async (_p, record) => { await attemptPlace(record.stageX, record.stageY); },
    onCancel: async () => { await glideHome(); },
    reducedMotion: () => ctx.reduced,
    grabOffset: 0,
  });
  app.ticker.add(drag.tick);
  app.ticker.add(tickPulse);
  const onBlur = () => { drag.cancel(); };
  window.addEventListener('blur', onBlur);

  async function glideHome() {
    const view = liveCard();
    if (!view) return;
    cardLayer.addChild(view);
    await to(view, {
      x: dockX, y: dockY, rotation: 0, scale: { x: cardHome, y: cardHome },
    }, { ms: ctx.ms(320), easing: ease.outCubic });
  }

  // -------------------------------------------------------------- placement

  async function attemptPlace(x, y) {
    if (dead || busy || !liveCard() || !activeId) return false;
    const pin = pins.get(activeId);
    if (!pin) return false;
    const at = toScreen(pin.culture.pin);
    const radius = Math.max(pinRadiusArt * mapScale, pinMinPx);
    if (Math.hypot(x - at.x, y - at.y) <= radius) { await succeed(pin); return true; }
    await miss(pin);
    return false;
  }

  async function miss(pin) {
    busy = true;
    selected = false;
    ctx.sfx('boing');
    pin.boost = 3.2;
    await glideHome();
    busy = false;
    if (dead) return;
    ctx.say('nudge-map');
    ctx.armIdle('map-place');
  }

  async function succeed(pin) {
    busy = true;
    selected = false;
    const culture = pin.culture;
    const at = toScreen(culture.pin);
    ctx.sfx('tada');
    burst(PIXI, fxLayer, at.x, at.y, { count: 34, power: 8 });

    const view = liveCard();
    if (view) {
      cardLayer.addChild(view);
      const shrink = Math.max(0.3, cardHome * 0.42);
      await to(view, {
        x: at.x, y: at.y, rotation: -0.06, alpha: 0.85,
        scale: { x: shrink, y: shrink },
      }, { ms: ctx.ms(480), easing: ease.outCubic });
      if (!view.destroyed) view.destroy();
    }
    piece = null;
    if (dead) return;

    addStamp(culture);
    const isNew = ctx.collection.place(culture.id);
    ctx.setPending(null);
    layoutNow();

    await ctx.say('placed-cheer');
    if (dead) return;
    await ctx.say(`fact-${culture.id}`);
    if (dead) return;

    if (isNew && ctx.collection.count() >= ctx.cultures.length) {
      ctx.sfx('tada');
      const size = stage.size();
      burst(PIXI, fxLayer, size.w / 2, size.h * 0.42, { count: 70, power: 11, life: 1600 });
      for (const other of pins.values()) {
        const spot = toScreen(other.culture.pin);
        sparkle(PIXI, fxLayer, spot.x, spot.y, hexInt(other.culture.accent));
      }
      await ctx.say('collection-complete');
      if (dead) return;
    }

    skippable = true;
    await waitOrTap(CELEBRATE_MS);
    skippable = false;
    busy = false;
    if (dead) return;
    toChooseMode();
  }

  /** Hold the payoff for a beat, but let an impatient child tap straight past. */
  function waitOrTap(delay) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        skippers.delete(finish);
        window.removeEventListener('pointerdown', finish);
        resolve();
      };
      skippers.add(finish);
      window.addEventListener('pointerdown', finish, { passive: true });
      ctx.wait(delay).then(finish);
    });
  }

  function toChooseMode() {
    if (dead) return;
    mode = 'choose';
    activeId = null;
    selected = false;
    const view = liveCard();
    if (view) view.destroy();
    piece = null;
    layoutNow();
    ctx.say('again-prompt');
    ctx.armIdle('map-choose');
  }

  function toPlaceMode(cultureId) {
    if (dead || !cultureId) return;
    mode = 'place';
    activeId = cultureId;
    if (!liveCard()) piece = buildPiece();
    layoutNow();
    ctx.say('map-prompt');
    ctx.armIdle('map-place');
  }

  // ------------------------------------------------------------------ input

  function onPinTap(id) {
    ctx.unlockAudio();
    ctx.pokeIdle();
    if (dead || busy) return;
    if (mode === 'choose') {
      ctx.sfx('pop');
      ctx.goto('dance', { cultureId: id });
      return;
    }
    if (!liveCard()) return;
    if (id === activeId) {
      const at = toScreen(pins.get(id).culture.pin);
      attemptPlace(at.x, at.y);
      return;
    }
    ctx.sfx('boing');
    const target = pins.get(activeId);
    if (target) target.boost = 3.2;
    ctx.say('nudge-map');
  }

  if (mode === 'place') piece = buildPiece();
  const offResize = stage.onResize(layout);

  // ---------------------------------------------------------- opening lines

  const greeting = opts.greeting || (mode === 'place' ? 'map-prompt' : 'choose-prompt');
  ctx.armIdle(mode === 'place' ? 'map-place' : 'map-choose');
  const ready = (async () => {
    await ctx.wait(160);
    if (dead) return;
    await ctx.say(greeting);
    if (dead || greeting !== 'intro') return;
    await ctx.say('choose-prompt');
  })();

  // -------------------------------------------------------------------- API

  function clientRect(view) {
    const bounds = view.getBounds();
    const rect = app.canvas.getBoundingClientRect();
    const size = stage.size();
    const sx = size.w ? rect.width / size.w : 1;
    const sy = size.h ? rect.height / size.h : 1;
    return {
      x: rect.left + bounds.x * sx, y: rect.top + bounds.y * sy,
      w: bounds.width * sx, h: bounds.height * sy,
    };
  }

  return {
    name: 'map',
    ready,
    getState: () => ({
      culture: activeId,
      phase: mode,
      step: 0,
      awaitingInput: !dead && (!busy || skippable),
    }),
    getTargets() {
      if (dead) return [];
      const out = [];
      for (const pin of pins.values()) {
        const role = mode === 'place'
          ? (pin.culture.id === activeId ? 'correct' : 'wrong')
          : 'correct';
        out.push({ id: `lantern:${pin.culture.id}`, role, rect: clientRect(pin.view) });
      }
      const view = liveCard();
      if (view) out.push({ id: 'card', role: 'neutral', rect: clientRect(view) });
      return out;
    },
    tap(id) {
      if (dead) return { accepted: false };
      if (typeof id === 'string' && id.startsWith('lantern:')) {
        onPinTap(id.slice('lantern:'.length));
        return { accepted: true };
      }
      if (id === 'card') {
        ctx.sfx('tick');
        if (mode !== 'place' && ctx.pending) { toPlaceMode(ctx.pending.cultureId); return { accepted: true }; }
        if (!liveCard()) return { accepted: false };
        selected = !selected;
        layoutNow();
        return { accepted: true };
      }
      return { accepted: false };
    },
    /** Finish the current phase legitimately: pin the card on its own lantern. */
    async winRound() {
      if (dead) return;
      if (mode !== 'place') {
        if (!ctx.pending) return;
        toPlaceMode(ctx.pending.cultureId);
      }
      const pin = pins.get(activeId);
      if (!pin) return;
      const at = toScreen(pin.culture.pin);
      await attemptPlace(at.x, at.y);
    },
    onBack() {
      if (mode === 'place' && activeId) {
        // Bank the card rather than lose it: it waits in the corner dock.
        ctx.setPending({ cultureId: activeId });
        mode = 'choose';
        selected = false;
        activeId = null;
        layoutNow();
        return;
      }
      ctx.goto('splash');
    },
    destroy() {
      dead = true;
      skippers.forEach((finish) => { try { finish(); } catch { /* already settled */ } });
      skippers.clear();
      window.removeEventListener('blur', onBlur);
      try { drag.detach(); } catch { /* nothing attached */ }
      app.ticker.remove(drag.tick);
      app.ticker.remove(tickPulse);
      offResize();
      piece = null;
      stage.setScene(null);
    },
  };
}
