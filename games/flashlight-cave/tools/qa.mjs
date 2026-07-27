#!/usr/bin/env node
// games/flashlight-cave/tools/qa.mjs — the Stage 5 QA gate for Flashlight Cave.
//
// Forked from games/counting-treasure-cups/tools/qa.mjs: same CLI, same
// console/request error collection with the expected-abort allowance, same
// screenshot handling, same non-zero exit. Everything drives the game through
// window.QLOBE_DEBUG (§16) and therefore through the REAL input handlers —
// resolveTap() → attempt() — because there is no test-only path in this game.
//
// REAL CHROME, NOT HEADLESS-SHELL. channel: 'chrome', headless: false.
// headless-shell cannot decode AAC, so every recorded-clip assertion would pass
// on a Web Speech fallback and prove nothing. It also has no real GPU, so the
// perf number would be a SwiftShader number.
//
//   python3 -m http.server 8000                       # from the repo root
//   npm install playwright@1.52.0                     # in a scratch dir, NOT the repo
//   node games/flashlight-cave/tools/qa.mjs --playwright /tmp/pw/node_modules
//
// Checks, in order:
//   A. boot / navigation / voice
//      1. three modes registered; splash carries exactly one a.hud-home
//      2. the font is resolvable BEFORE the first PIXI.Text is baked (§4.4's trap)
//      3. recorded clips actually PLAY (via the voice onClip hook — a Web Speech
//         fallback looks identical in a screenshot), with a recorded control key
//         and letter-l degrading to speech WITHOUT a failed request
//   B. the beam — the checks this game exists for
//      4. a real 12-step pointer drag moves the beam and it ENDS where the finger
//         was released, and STAYS there 800 ms later (§6.2 — the beam persists)
//      5. tap-to-move: a tap on empty dark glides the beam there (§6.4)
//      6. a tap on an UNLIT correct letter is a MOVE, not an answer (§6.4) — the
//         one rule that makes the game real
//      7. a lit correct tap advances; a lit wrong tap is gentle and never locks
//      8. pointercancel mid-drag / window blur mid-drag / a second finger
//   C. content selection (seeded, so it is reproducible)
//      9. no decoy ever shares the target's phonic in `sound`/`picture` (C↔K)
//     10. X is never a target in `picture`
//   D. robustness
//     11. all three modes end-to-end, every round, with wrong-input probes
//     12. back returns to the splash from play / reveal / end; the end button
//         returns to the SPLASH, not into the same mode
//     13. nothing stranded: repeated mount/unmount grows no nodes, canvases,
//         listeners or timers
//     14. animation survives teardown (back mid-reveal / mid-ledge / mid-drag)
//     15. a hide/show cycle leaves the canvas repainting and the ticker stopped
//     16. quality 'flat' still completes; no WebGL still completes (§3.5)
//     17. every target and every .hud-button is ≥ 96 px, both orientations
//     18. perf: a 3 s scripted drag, mean frame interval
//   E. review artefacts
//     19. portrait + landscape + reduced-motion + dpr 1/2/3 screenshots
//   F. the four post-sign-off regressions — all four were live on an iPad while
//      this gate was 95/95 green, which is the real failure they document
//     20. the flashlight always points back INTO its own beam — asserted as the
//         relationship, never as a hard-coded sign, swept across the width
//     21. the ledge object is fully on screen in landscape, in portrait, and in
//         the wide-short 1180×520 that actually cropped it — and it stays on
//         screen across a resize (the reflow() path)
//     22. the ledge carries a real picture (a halo with no object shipped), and
//         that picture is genuinely PAINTED with no interaction at all: an
//         on-demand render pump has to be DRIVEN, not poked once
//     23. the object is on the ledge BEFORE the prompt says "this"
//
// Exit code is non-zero if any check fails.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
// fileURLToPath, not URL.pathname: the repo lives under a path with a space in
// it, and a raw pathname is percent-encoded — which silently writes every
// screenshot into a brand-new "…260703%20QLOBE Kids/…" tree beside the repo.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME_DIR = path.resolve(HERE, '..');

const BASE = flag('base', 'http://localhost:8000');
const URL_GAME = `${BASE}/games/flashlight-cave/`;
const SHOTS = flag('shots', path.join(GAME_DIR, 'qa-shots'));
const pwDir = flag('playwright', process.env.PLAYWRIGHT_MODULE_PATH);
if (!pwDir) {
  console.error('need --playwright <node_modules dir holding playwright@1.52.0>');
  process.exit(2);
}
const require = createRequire(path.join(pwDir, 'noop.js'));
const { chromium } = require('playwright');

const results = [];
const notes = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  return !!ok;
};
const note = (text) => { notes.push(text); console.log(`  note  ${text}`); };
const head = (t) => console.log(`\n=== ${t}`);

// ---------------------------------------------------------------------------
// Seeds. QLOBE_DEBUG.seed(n) installs the xorshift below and Game.makeBag() is
// its FIRST consumer, so bag[0..2] — the three round targets — is a pure
// function of the seed. These seeds were found by replaying that exact rng in
// node and are the ones that put C and/or K in the first three draws, which is
// the only way to exercise the same-phonic decoy rule (§2.2) in a real play.
// The gate re-derives the prediction at run time and asserts the game agrees,
// so a change to the shuffle can never silently make this sweep vacuous.
// ---------------------------------------------------------------------------
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const PHONIC = {
  A: 'ah', B: 'buh', C: 'kuh', D: 'duh', E: 'eh', F: 'fuh', G: 'guh', H: 'huh',
  I: 'ih', J: 'juh', K: 'kuh', L: 'luh', M: 'muh', N: 'nuh', O: 'oh', P: 'puh',
  Q: 'kwuh', R: 'ruh', S: 'suh', T: 'tuh', U: 'uh', V: 'vuh', W: 'wuh',
  X: 'kss', Y: 'yuh', Z: 'zuh',
};
function xorshift(n) {
  let s = (n >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
function predictBag(seed, eligible) {
  const rng = xorshift(seed);
  const a = eligible.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, 3);
}
const ELIGIBLE = { find: ALPHABET, sound: ALPHABET, picture: ALPHABET.filter((L) => L !== 'X') };
const SEEDS = {
  sound: [3, 6, 13, 30, 31, 36],            // C in 30/36, K in 3/6/13/31
  picture: [8, 14, 21, 32, 33, 34, 41, 55], // C in 8/21/32/34, K in 8/14/33
};

// ---------------------------------------------------------------------------
// Page-side instrumentation. Installed with addInitScript so it wraps the real
// timer/listener APIs before a single module of the game runs — that is what
// makes check 13 (nothing stranded) an actual measurement rather than a guess.
// ---------------------------------------------------------------------------
const INSTRUMENT = `
(() => {
  const inst = { timers: new Set(), adds: 0, removes: 0 };
  window.__inst = inst;
  const st = window.setTimeout.bind(window);
  const ct = window.clearTimeout.bind(window);
  window.setTimeout = function (fn, ms, ...rest) {
    let id;
    const wrapped = typeof fn === 'function'
      ? function (...a) { inst.timers.delete(id); return fn.apply(this, a); }
      : fn;
    id = st(wrapped, ms, ...rest);
    inst.timers.add(id);
    return id;
  };
  window.clearTimeout = function (id) { inst.timers.delete(id); return ct(id); };
  // Only window/document are counted. A listener on an element that innerHTML
  // threw away is not a leak — the node goes with it — and counting those would
  // make the measurement grow by design every time the splash re-renders. The
  // leak class that matters is exactly the long-lived one: cave.js's
  // visibilitychange, beam.js's window blur, main.js's resize.
  const longLived = (t) => t === window || t === document;
  const AEL = EventTarget.prototype.addEventListener;
  const REL = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (...a) {
    if (longLived(this)) inst.adds++;
    return AEL.apply(this, a);
  };
  EventTarget.prototype.removeEventListener = function (...a) {
    if (longLived(this)) inst.removes++;
    return REL.apply(this, a);
  };
})();
`;

// ---------------------------------------------------------------------------
// The driver. Runs inside the page so every tap goes through the real handler.
// ---------------------------------------------------------------------------
const DRIVER = `
window.__qa = {
  clips: [],
  // The same clip stream as clips[], but stamped — check 23 is about ORDER, so
  // it needs a clock on the prompt, not just the fact that it fired.
  clipLog: [],
  lastPointerId: 1,
  fontAtFirstText: null,
  textCount: 0,

  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),

  /** Resolve when the game is next actually waiting for a child's input, or
   *  when it has left the play/reveal cycle entirely. 'reveal' is transient. */
  settle: async function (ms = 20000) {
    const D = window.QLOBE_DEBUG;
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      const s = D.getState();
      if (s.screen === 'end' || s.screen === 'splash') return s;
      if (s.screen === 'play' && s.awaitingInput) return s;
      await window.__qa.sleep(25);
    }
    return Object.assign(D.getState(), { _timedOut: true });
  },

  /** One whole mode, round by round, through lightTarget + tap. */
  drive: async function (modeId, { probeWrong = true, seed = null, quality = null } = {}) {
    const D = window.QLOBE_DEBUG;
    const log = [];
    const rounds = [];
    let wrongProbes = 0;
    let gentle = 0;
    let notLocked = 0;
    if (seed !== null) D.seed(seed);
    await D.startMode(modeId);
    // startMode builds a fresh cave at the default rung, so a forced quality has
    // to be re-applied after the mount, not before it.
    if (quality) D.setQuality(quality);
    let guard = 0;
    while (guard++ < 12) {
      const s = await window.__qa.settle();
      if (s.screen === 'end') { log.push('-> end'); break; }
      if (s.screen === 'splash') { log.push('LEFT TO SPLASH'); break; }
      if (s._timedOut) { log.push('STUCK ' + JSON.stringify(s)); break; }
      const before = s.round;
      const targets = D.getTargets();
      rounds.push({
        mode: modeId, seed, round: before, target: s.target,
        chars: targets.map((t) => ({ char: t.char, role: t.role })),
      });

      if (probeWrong) {
        const wrong = targets.find((t) => t.role === 'wrong');
        if (wrong) {
          wrongProbes++;
          await D.lightTarget(wrong.id);
          const r = await D.tap(wrong.id);
          if (r.accepted === false) gentle++;
          else log.push('r' + before + ' WRONG ACCEPTED ' + JSON.stringify(r));
          // §6.5 rule 4 — input is back within 1.5 s and the round did not move.
          const t0 = performance.now();
          let back = false;
          while (performance.now() - t0 < 1500) {
            const st = D.getState();
            if (st.screen === 'play' && st.awaitingInput) { back = true; break; }
            await window.__qa.sleep(25);
          }
          if (back && D.getState().round === before) notLocked++;
          else log.push('r' + before + ' LOCKED AFTER WRONG');
        }
      }

      const c = D.getTargets().find((t) => t.role === 'correct');
      if (!c) { log.push('r' + before + ' NO CORRECT TARGET'); break; }
      const litOk = await D.lightTarget(c.id);
      if (!litOk) log.push('r' + before + ' COULD NOT LIGHT THE TARGET');
      const rr = await D.tap(c.id);
      if (!rr.accepted) { log.push('r' + before + ' CORRECT REFUSED ' + JSON.stringify(rr)); break; }
      const after = await window.__qa.settle();
      log.push('r' + before + ' ' + s.target + '(' + targets.map((t) => t.char).join('') + ') -> r'
        + after.round + ' ' + after.screen);
      if (after.screen === 'end') break;
      if (after._timedOut) { log.push('STUCK after reveal'); break; }
      if (after.round === before) { log.push('NO PROGRESS'); break; }
    }
    const st = D.getState();
    return {
      log, rounds, wrongProbes, gentle, notLocked,
      screen: st.screen,
      solved: st.solved,
      catalogLinks: document.querySelectorAll('a.hud-home').length,
      canvases: document.querySelectorAll('canvas').length,
    };
  },

  /** The empty-dark point furthest from every letter, in art AND screen px. */
  emptySpot: function () {
    const D = window.QLOBE_DEBUG;
    const o = D.toScreen(0, 0);
    const u = D.toScreen(100, 0);
    const scale = (u.x - o.x) / 100;
    const letters = D.getTargets().map((t) => ({ x: t.rect.x + t.rect.w / 2, y: t.rect.y + t.rect.h / 2 }));
    const beam = D.getBeam();
    const W = window.innerWidth;
    const H = window.innerHeight;
    let best = null;
    for (let ax = 320; ax <= 1280; ax += 40) {
      for (let ay = 340; ay <= 940; ay += 40) {
        const p = D.toScreen(ax, ay);
        if (p.x < 200 || p.x > W - 200 || p.y < 190 || p.y > H - 230) continue;
        if (Math.hypot(ax - beam.x, ay - beam.y) < 240) continue;
        let d = Infinity;
        for (const l of letters) d = Math.min(d, Math.hypot(p.x - l.x, p.y - l.y));
        if (!best || d > best.d) best = { d, ax, ay, sx: p.x, sy: p.y };
      }
    }
    return best ? Object.assign(best, { artClear: best.d / scale }) : null;
  },

  /** What the page is holding on to right now. */
  snapshot: function () {
    return {
      nodes: document.getElementsByTagName('*').length,
      canvases: document.querySelectorAll('canvas').length,
      audio: document.querySelectorAll('audio').length,
      timers: window.__inst.timers.size,
      // Net goes NEGATIVE over time and that is correct: teardown removes
      // defensively (beam.release() drops pointermove/up/cancel whether or not a
      // drag was live), so idempotent removes outnumber adds. What must not grow
      // is the net; what must stay CONSTANT per cycle is adds, which is what
      // proves a mount is not registering more listeners each time.
      listeners: window.__inst.adds - window.__inst.removes,
      adds: window.__inst.adds,
      removes: window.__inst.removes,
    };
  },

  /**
   * Is shared/js/stage/tween.js's single rAF pump still alive? One throw used to
   * stop every animation on the page forever; the pump now drops the offending
   * tween and keeps running, and this probe is the regression guard for that:
   * run a real tween on a plain object and see whether it lands.
   */
  tweenAlive: async function () {
    const t = await import('/shared/js/stage/tween.js');
    const obj = { x: 0 };
    const p = t.to(obj, { x: 100 }, { ms: 140 });
    const ok = await Promise.race([
      p.then(() => true),
      new Promise((r) => setTimeout(() => r(false), 3000)),
    ]);
    return { ok, x: Math.round(obj.x) };
  },

  /** A synthetic PointerEvent, for the paths a Playwright mouse cannot make. */
  pev: function (type, { id, primary = true, x = 0, y = 0, onWindow = false }) {
    const target = onWindow ? window : document.querySelector('.fc-stage');
    if (!target) return false;
    target.dispatchEvent(new PointerEvent(type, {
      pointerId: id, isPrimary: primary, pointerType: 'touch',
      bubbles: true, cancelable: true, clientX: x, clientY: y,
    }));
    return true;
  },
};
window.addEventListener('pointerdown', (e) => { window.__qa.lastPointerId = e.pointerId; }, true);
`;

const FONT_SPEC = '600 120px Fredoka';

// ---------------------------------------------------------------------------
// harness
// ---------------------------------------------------------------------------

function attachWatchers(page, bag) {
  // Two kinds of abort are by design, counted separately rather than ignored:
  //   .m4a  — say() src-swaps the one unlocked <audio> element, cancelling the
  //           clip it superseded. That IS the voice channel working.
  //   .webp — a pose swap can land while another pose is still being fetched.
  // Anything else failing is a genuine broken asset and fails the run.
  const isExpectedAbort = (url, err) => /\.(m4a|webp)(\?|$)/.test(url) && /ABORTED/i.test(err || '');
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    const where = m.location()?.url || '';
    if (bag.allow.some((rx) => rx.test(t) || rx.test(where))) { bag.allowed.push(`${t} @ ${where}`); return; }
    bag.errors.push(`${t} @ ${where}`);
  });
  page.on('pageerror', (e) => {
    const t = String(e);
    if (bag.allow.some((rx) => rx.test(t))) { bag.allowed.push(t); return; }
    bag.errors.push(t);
  });
  page.on('requestfailed', (r) => {
    const err = r.failure()?.errorText;
    const line = `${r.url()} ${err}`;
    if (bag.allow.some((rx) => rx.test(r.url()))) bag.allowed.push(line);
    else if (isExpectedAbort(r.url(), err)) bag.aborted.push(line);
    else bag.failed.push(line);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !bag.allow.some((rx) => rx.test(r.url()))) {
      bag.failed.push(`${r.url()} ${r.status()}`);
    }
  });
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin !== new URL(BASE).origin) return;
    bag.urls.add(u.pathname);
  });
}

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.viewport || { width: 1180, height: 820 },
    reducedMotion: opts.reducedMotion || 'no-preference',
    deviceScaleFactor: opts.dpr || 2,
  });
  const bag = { errors: [], failed: [], aborted: [], allowed: [], urls: new Set(), allow: opts.allow || [] };
  await ctx.addInitScript({ content: INSTRUMENT });
  const page = await ctx.newPage();
  attachWatchers(page, bag);
  return { ctx, page, bag };
}

async function boot(page, { hookFont = false } = {}) {
  await page.goto(URL_GAME, { waitUntil: 'networkidle' });
  await page.addScriptTag({ content: DRIVER });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  // A real gesture, so the clip channel unlocks exactly as a child's tap would —
  // on bare splash art, well clear of the mode tiles at the bottom.
  await page.mouse.click(page.viewportSize().width / 2, 130);
  await page.evaluate(() => {
    window.__qa.clips = [];
    window.__qa.clipLog = [];
    return import('./js/voice.js').then((v) => v.onClip((key) => {
      window.__qa.clips.push(key);
      window.__qa.clipLog.push({ key, t: performance.now() });
    }));
  });
  if (hookFont) {
    // §4.4's trap: Pixi bakes a Text to a texture at construction, so if the font
    // is not resolvable yet every letter in the cave is permanently Arial.
    // loadPixi() caches on window.PIXI and cave.js reads PIXI.Text at call time,
    // so subclassing it here — before any mode starts — catches the FIRST letter
    // the game ever builds. This is the only way to assert the ordering rather
    // than the end state.
    await page.evaluate(async (spec) => {
      const stage = await import('/shared/js/stage/stage.js');
      const PIXI = await stage.loadPixi();
      if (PIXI.__qaTextHooked) return;
      PIXI.__qaTextHooked = true;
      const Base = PIXI.Text;
      PIXI.Text = class QAText extends Base {
        constructor(...args) {
          if (window.__qa.fontAtFirstText === null) {
            window.__qa.fontAtFirstText = document.fonts.check(spec);
          }
          window.__qa.textCount += 1;
          super(...args);
        }
      };
    }, FONT_SPEC);
  }
}

const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), ...opts });

/** Drag the mouse from a→b in `steps` interpolated moves. */
async function drag(page, a, b, { steps = 12, gap = 40, hold = false } = {}) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps);
    await page.waitForTimeout(gap);
  }
  // The follow is a critically-damped lerp on its own rAF and release() cancels
  // it, so give it a beat to land before the finger lifts — otherwise the test
  // measures the lerp's residual rather than where the finger actually was.
  await page.waitForTimeout(150);
  if (!hold) await page.mouse.up();
}

const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

// ---------------------------------------------------------------------------
// The picture-mode ledge (checks 21–23). Its screen rect is the thing that
// walked off the top of a wide, short window, and `objectBounds` is the sprite's
// REAL painted box — the rect is derived from ledgeSpot() and would look healthy
// even if reflow() forgot to move the sprite, so both are asserted.
// ---------------------------------------------------------------------------

/**
 * Wait until the ledge exists AND its 380 ms pop-in has settled. `objectAlpha`
 * alone is not enough: the picture sprite is opaque from birth and it is the
 * GROUP that scales up from 0.01, so a naive wait reports a picture 1 % of its
 * final size.
 */
async function waitForLedge(page, ms = 25000) {
  await page.waitForFunction(() => {
    const l = window.QLOBE_DEBUG.getLedge();
    if (!l) return false;
    if (l.dom) return true;
    return !!l.hasObject && l.objectAlpha > 0 && (l.groupScale === null || l.groupScale > 0.9);
  }, null, { timeout: ms });
  return page.evaluate(() => window.QLOBE_DEBUG.getLedge());
}

/** Is every edge of a SCREEN rect inside the viewport? Half a pixel of slack. */
const insideViewport = (r, vp) => !!r
  && r.x >= -0.5 && r.y >= -0.5
  && r.x + r.w <= vp.width + 0.5 && r.y + r.h <= vp.height + 0.5;

const rectStr = (r) => (r
  ? `${r.x.toFixed(0)},${r.y.toFixed(0)} ${r.w.toFixed(0)}×${r.h.toFixed(0)}`
  : 'none');

/** The two assertions every viewport has to satisfy once the ledge is up. */
function checkLedge(label, l, vp) {
  check(`${label}: the ledge object is fully on screen`,
    insideViewport(l.rect, vp) && insideViewport(l.objectBounds, vp),
    `slot ${rectStr(l.rect)}, painted ${rectStr(l.objectBounds)} in ${vp.width}×${vp.height}`);
  check(`${label}: the ledge carries an actual picture, not just a halo`,
    l.hasObject === true && l.objectAlpha > 0 && !!(l.objectTex && l.objectTex.valid),
    `word ${l.word}, alpha ${l.objectAlpha}, tex ${l.objectTex ? `${l.objectTex.w}×${l.objectTex.h} valid=${l.objectTex.valid}` : 'none'}`);
  return l;
}

// ---------------------------------------------------------------------------

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const collected = { rounds: [], runs: {}, perf: null };

  // =========================================================================
  head('A · boot, navigation, voice — landscape 1180×820');
  // =========================================================================
  const A = await newPage(browser);
  await boot(A.page, { hookFont: true });

  const modes = await A.page.evaluate(() => window.QLOBE_DEBUG.listModes());
  check('three modes registered', modes.length === 3, modes.map((m) => m.id).join(', '));
  check('splash carries exactly one catalog link',
    (await A.page.evaluate(() => document.querySelectorAll('a.hud-home').length)) === 1);
  await shot(A.page, 'land-01-splash');

  // --- recorded clips actually PLAY ---------------------------------------
  // Every letter name is recorded, including letter-l — it was the one that
  // resisted the voice clone (20 takes, all mistranscribed) until it was made
  // via kokoro phoneme mode + chatterbox voice conversion. It is checked
  // explicitly rather than folded into the control, because it is the clip most
  // likely to regress: any re-run of gen-voice.py goes back through the clone.
  const failedBefore = A.bag.failed.length;
  const clipProbe = await A.page.evaluate(async () => {
    const v = await import('./js/voice.js');
    window.__qa.clips = [];
    await Promise.race([v.say('letter-a'), window.__qa.sleep(2500)]);
    const afterControl = window.__qa.clips.slice();
    v.stop();
    await window.__qa.sleep(150);
    window.__qa.clips = [];
    await Promise.race([v.say('letter-l'), window.__qa.sleep(2500)]);
    const afterL = window.__qa.clips.slice();
    v.stop();
    return { afterControl, afterL };
  });
  check('recorded control clip plays (onClip fired for letter-a)',
    clipProbe.afterControl.includes('letter-a'), clipProbe.afterControl.join(','));
  check('letter-l plays its recording (kokoro→chatterbox take)',
    clipProbe.afterL.includes('letter-l'), clipProbe.afterL.join(','));
  check('no failed request while playing the letter clips',
    A.bag.failed.length === failedBefore,
    A.bag.failed.slice(failedBefore).join(' | '));

  // =========================================================================
  head('B · the beam (mode `find`, real time — timers NOT compressed)');
  // =========================================================================
  await A.page.evaluate(() => window.QLOBE_DEBUG.startMode('find'));
  await A.page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput,
    null, { timeout: 20000 });
  check('font resolvable before the first PIXI.Text',
    (await A.page.evaluate(() => window.__qa.fontAtFirstText)) === true,
    `first of ${await A.page.evaluate(() => window.__qa.textCount)} Text objects`);
  await shot(A.page, 'land-02-play');

  // --- 4. a real drag, and the beam persists after release ------------------
  const dragRun = await A.page.evaluate(() => {
    const D = window.QLOBE_DEBUG;
    const b = D.getBeam();
    const from = D.toScreen(b.x, b.y);
    const to = D.toScreen(520, 470);
    return { fromArt: { x: b.x, y: b.y }, toArt: { x: 520, y: 470 }, from, to };
  });
  await drag(A.page, dragRun.from, dragRun.to, { steps: 12, gap: 40 });
  await A.page.waitForTimeout(250);
  const afterDrag = await A.page.evaluate(() => window.QLOBE_DEBUG.getBeam());
  check('beam follows a real 12-step drag and ends at the release point',
    dist(afterDrag, dragRun.toArt) < 45,
    `art ${afterDrag.x.toFixed(0)},${afterDrag.y.toFixed(0)} vs 520,470 (${dist(afterDrag, dragRun.toArt).toFixed(0)} art px)`);
  await A.page.waitForTimeout(800);
  const persisted = await A.page.evaluate(() => window.QLOBE_DEBUG.getBeam());
  check('beam PERSISTS 800 ms after release (§6.2)',
    dist(persisted, afterDrag) < 1.5,
    `moved ${dist(persisted, afterDrag).toFixed(2)} art px`);

  // --- 5. tap-to-move -------------------------------------------------------
  const spot = await A.page.evaluate(() => window.__qa.emptySpot());
  check('found a patch of empty dark to tap', !!spot && spot.artClear > 150,
    spot ? `${spot.artClear.toFixed(0)} art px clear of every letter` : 'none');
  if (spot) {
    await A.page.mouse.click(spot.sx, spot.sy);
    await A.page.waitForTimeout(500);
    const moved = await A.page.evaluate(() => window.QLOBE_DEBUG.getBeam());
    check('tap on empty dark moves the beam there (§6.4)',
      dist(moved, { x: spot.ax, y: spot.ay }) < 30,
      `${dist(moved, { x: spot.ax, y: spot.ay }).toFixed(0)} art px off`);
  }

  // --- 6. an UNLIT letter is NOT tappable ----------------------------------
  // The load-bearing rule (§6.4): the child cannot see it, so they cannot have
  // meant it — the tap must move the light and nothing else.
  const unlit = await A.page.evaluate(async () => {
    const D = window.QLOBE_DEBUG;
    const c0 = D.getTargets().find((t) => t.role === 'correct');
    // Park the beam in the opposite corner of the field so the answer is dark.
    D.moveBeam(c0.rect.x > window.innerWidth / 2 ? 300 : 1300, 900);
    await window.__qa.sleep(120);
    const t = D.getTargets().find((x) => x.role === 'correct');
    const s0 = D.getState();
    const b0 = D.getBeam();
    return {
      lit: t.lit, litness: t.litness, id: t.id,
      cx: t.rect.x + t.rect.w / 2, cy: t.rect.y + t.rect.h / 2,
      round: s0.round, solved: s0.solved, screen: s0.screen, beam: b0,
    };
  });
  check('the correct letter can be made genuinely unlit', unlit.lit === false,
    `litness ${unlit.litness.toFixed(3)}`);
  await A.page.mouse.click(unlit.cx, unlit.cy);
  await A.page.waitForTimeout(600);
  const afterUnlit = await A.page.evaluate(() => ({
    s: window.QLOBE_DEBUG.getState(), b: window.QLOBE_DEBUG.getBeam(),
  }));
  check('tapping an UNLIT correct letter does not answer (§6.4)',
    afterUnlit.s.round === unlit.round && afterUnlit.s.solved === unlit.solved
      && afterUnlit.s.screen === 'play',
    `round ${unlit.round}→${afterUnlit.s.round}, solved ${unlit.solved}→${afterUnlit.s.solved}, ${afterUnlit.s.screen}`);
  check('tapping an UNLIT letter moves the beam instead',
    dist(afterUnlit.b, unlit.beam) > 50,
    `beam moved ${dist(afterUnlit.b, unlit.beam).toFixed(0)} art px`);

  // --- 7. lit correct advances; lit wrong is gentle -------------------------
  const gentleProbe = await A.page.evaluate(async () => {
    const D = window.QLOBE_DEBUG;
    const w = D.getTargets().find((t) => t.role === 'wrong');
    const before = D.getState();
    await D.lightTarget(w.id);
    const litNow = D.getTargets().find((t) => t.id === w.id).lit;
    const r = await D.tap(w.id);
    const t0 = performance.now();
    let backMs = -1;
    while (performance.now() - t0 < 1500) {
      const s = D.getState();
      if (s.screen === 'play' && s.awaitingInput) { backMs = Math.round(performance.now() - t0); break; }
      await window.__qa.sleep(20);
    }
    const after = D.getState();
    return { litNow, r, backMs, sameRound: after.round === before.round, screen: after.screen };
  });
  check('a lit WRONG tap is refused, gently', gentleProbe.litNow === true
    && gentleProbe.r.accepted === false && gentleProbe.r.reason === 'wrong-letter',
    JSON.stringify(gentleProbe.r));
  check('a lit WRONG tap never locks the game (input back < 1.5 s, round unchanged)',
    gentleProbe.backMs >= 0 && gentleProbe.sameRound,
    `awaiting again after ${gentleProbe.backMs} ms, screen ${gentleProbe.screen}`);

  const correctProbe = await A.page.evaluate(async () => {
    const D = window.QLOBE_DEBUG;
    const c = D.getTargets().find((t) => t.role === 'correct');
    await D.lightTarget(c.id);
    return { id: c.id, cx: c.rect.x + c.rect.w / 2, cy: c.rect.y + c.rect.h / 2 };
  });
  await A.page.mouse.click(correctProbe.cx, correctProbe.cy);
  await A.page.waitForTimeout(700);
  const revealState = await A.page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('a lit CORRECT tap (real click on the rect) reveals',
    revealState.screen === 'reveal' || revealState.solved === 1,
    `${revealState.screen}, solved ${revealState.solved}`);
  await shot(A.page, 'land-03-reveal');

  // --- back from reveal, and the tween pump survives it ---------------------
  await A.page.click('.hud-back');
  await A.page.waitForTimeout(400);
  check('back from REVEAL returns to the splash',
    (await A.page.evaluate(() => document.querySelectorAll('.fc-splash').length)) === 1);
  let tw = await A.page.evaluate(() => window.__qa.tweenAlive());
  check('animation survives back mid-reveal', tw.ok && tw.x === 100, JSON.stringify(tw));

  // --- 8. pointercancel / blur / second finger ------------------------------
  await A.page.evaluate(() => window.QLOBE_DEBUG.startMode('find'));
  await A.page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 20000 });

  for (const [label, kill] of [
    ['pointercancel', async (p) => p.evaluate(() => window.__qa.pev('pointercancel',
      { id: window.__qa.lastPointerId, onWindow: true }))],
    ['window blur', async (p) => p.evaluate(() => window.dispatchEvent(new Event('blur')))],
  ]) {
    const start = await A.page.evaluate(() => {
      const D = window.QLOBE_DEBUG;
      D.moveBeam(800, 640);
      const b = D.getBeam();
      return D.toScreen(b.x, b.y);
    });
    const mid = await A.page.evaluate(() => window.QLOBE_DEBUG.toScreen(1050, 760));
    await drag(A.page, start, mid, { steps: 6, gap: 40, hold: true });
    await A.page.waitForTimeout(150);
    const atKill = await A.page.evaluate(() => window.QLOBE_DEBUG.getBeam());
    await kill(A.page);
    // Keep dragging: after the kill nothing may follow the finger any more.
    await A.page.mouse.move(mid.x - 220, mid.y - 180);
    await A.page.mouse.move(mid.x - 400, mid.y - 300);
    await A.page.waitForTimeout(350);
    const afterKill = await A.page.evaluate(() => window.QLOBE_DEBUG.getBeam());
    await A.page.mouse.up();
    await A.page.waitForTimeout(150);
    check(`${label} mid-drag leaves the beam exactly where it was`,
      dist(afterKill, atKill) < 1.5, `${dist(afterKill, atKill).toFixed(2)} art px`);
    // and a fresh drag still works
    const s2 = await A.page.evaluate(() => {
      const b = window.QLOBE_DEBUG.getBeam();
      return window.QLOBE_DEBUG.toScreen(b.x, b.y);
    });
    const d2 = await A.page.evaluate(() => window.QLOBE_DEBUG.toScreen(620, 520));
    await drag(A.page, s2, d2, { steps: 10, gap: 40 });
    await A.page.waitForTimeout(200);
    const b2 = await A.page.evaluate(() => window.QLOBE_DEBUG.getBeam());
    check(`a new drag still works after ${label}`,
      dist(b2, { x: 620, y: 520 }) < 45, `${dist(b2, { x: 620, y: 520 }).toFixed(0)} art px off`);
  }

  const twoFinger = await A.page.evaluate(async () => {
    const D = window.QLOBE_DEBUG;
    D.moveBeam(800, 640);
    await window.__qa.sleep(60);
    const b0 = D.getBeam();
    const a = D.toScreen(800, 640);
    const bpt = D.toScreen(500, 500);
    window.__qa.pev('pointerdown', { id: 21, primary: true, x: a.x, y: a.y });
    window.__qa.pev('pointerdown', { id: 22, primary: false, x: bpt.x, y: bpt.y });
    // the SECOND finger travels first — it must be ignored entirely
    for (let i = 1; i <= 8; i++) {
      window.__qa.pev('pointermove', { id: 22, primary: false, onWindow: true,
        x: bpt.x - i * 20, y: bpt.y - i * 15 });
      await window.__qa.sleep(20);
    }
    const b1 = D.getBeam();
    // now the primary finger travels — it must drive
    const t = D.toScreen(1150, 830);
    for (let i = 1; i <= 10; i++) {
      window.__qa.pev('pointermove', { id: 21, primary: true, onWindow: true,
        x: a.x + ((t.x - a.x) * i) / 10, y: a.y + ((t.y - a.y) * i) / 10 });
      await window.__qa.sleep(30);
    }
    await window.__qa.sleep(180);
    const b2 = D.getBeam();
    window.__qa.pev('pointerup', { id: 21, primary: true, onWindow: true, x: t.x, y: t.y });
    return { b0, b1, b2 };
  });
  check('a second finger never moves the beam',
    dist(twoFinger.b1, twoFinger.b0) < 1.5,
    `${dist(twoFinger.b1, twoFinger.b0).toFixed(2)} art px`);
  check('the primary finger still drives while a second is down',
    dist(twoFinger.b2, { x: 1150, y: 830 }) < 60,
    `${dist(twoFinger.b2, { x: 1150, y: 830 }).toFixed(0)} art px off`);

  // --- 18. perf: a 3 s scripted drag ---------------------------------------
  await A.page.evaluate(() => window.QLOBE_DEBUG.perf());          // start the monitor
  const centre = await A.page.evaluate(() => window.QLOBE_DEBUG.toScreen(800, 640));
  const rx = await A.page.evaluate(() => {
    const a = window.QLOBE_DEBUG.toScreen(800, 640);
    const b = window.QLOBE_DEBUG.toScreen(1120, 640);
    return b.x - a.x;
  });
  await A.page.mouse.move(centre.x + rx, centre.y);
  await A.page.mouse.down();
  const tEnd = Date.now() + 3000;
  let ang = 0;
  while (Date.now() < tEnd) {
    ang += 0.11;
    await A.page.mouse.move(centre.x + Math.cos(ang) * rx, centre.y + Math.sin(ang) * rx * 0.6);
    await A.page.waitForTimeout(8);
  }
  await A.page.mouse.up();
  const perf = await A.page.evaluate(() => window.QLOBE_DEBUG.perf());
  collected.perf = perf;
  check('perf: mean frame interval under a 3 s scripted drag < 24 ms',
    perf.ms > 0 && perf.ms < 24,
    `${perf.ms} ms mean, ${perf.fps} fps, quality ${perf.quality}, ${perf.draws} spotlight draws`);
  if (perf.ms >= 18) note(`perf WARN: ${perf.ms} ms ≥ 18 ms — desktop/SwiftShader numbers are advisory; the iPad spike is the real gate`);

  // --- 17. ≥ 96 px targets, landscape --------------------------------------
  const sizeLand = await A.page.evaluate(() => {
    const D = window.QLOBE_DEBUG;
    const t = D.getTargets().map((x) => ({ id: x.id, w: Math.round(x.rect.w), h: Math.round(x.rect.h) }));
    const hud = [...document.querySelectorAll('.hud-button')]
      .filter((e) => e.offsetParent !== null && !e.classList.contains('hidden'))
      .map((e) => { const r = e.getBoundingClientRect(); return { c: e.className, w: Math.round(r.width), h: Math.round(r.height) }; });
    return { t, hud };
  });
  check('landscape: every letter target ≥ 96 px',
    sizeLand.t.length > 0 && sizeLand.t.every((x) => x.w >= 96 && x.h >= 96),
    sizeLand.t.map((x) => `${x.w}×${x.h}`).join(' '));
  check('landscape: every .hud-button ≥ 96 px',
    sizeLand.hud.length > 0 && sizeLand.hud.every((x) => x.w >= 96 && x.h >= 96),
    sizeLand.hud.map((x) => `${x.w}×${x.h}`).join(' '));

  // --- animation survives back mid-drag and mid-ledge -----------------------
  {
    const s = await A.page.evaluate(() => {
      const b = window.QLOBE_DEBUG.getBeam();
      return window.QLOBE_DEBUG.toScreen(b.x, b.y);
    });
    await A.page.mouse.move(s.x, s.y);
    await A.page.mouse.down();
    await A.page.mouse.move(s.x + 90, s.y + 60);
    await A.page.mouse.move(s.x + 190, s.y + 130);
    await A.page.evaluate(() => window.QLOBE_DEBUG.home());     // back, mid-drag
    await A.page.mouse.move(s.x + 260, s.y + 190);
    await A.page.mouse.up();
    await A.page.waitForTimeout(250);
    tw = await A.page.evaluate(() => window.__qa.tweenAlive());
    check('animation survives back mid-drag', tw.ok && tw.x === 100, JSON.stringify(tw));
  }
  {
    // The picture-mode ledge pops in over 380 ms with input live throughout —
    // the exact window that used to kill the shared tween pump, before the pump
    // learned to drop a bad tween and letters.js learned to cancel before it
    // destroys.
    await A.page.evaluate(() => window.QLOBE_DEBUG.startMode('picture'));
    await A.page.waitForTimeout(220);
    await A.page.evaluate(() => window.QLOBE_DEBUG.home());
    await A.page.waitForTimeout(250);
    tw = await A.page.evaluate(() => window.__qa.tweenAlive());
    check('animation survives back mid-ledge', tw.ok && tw.x === 100, JSON.stringify(tw));
  }

  // =========================================================================
  head('C · all three modes, end to end, with wrong-input probes');
  // =========================================================================
  await A.page.evaluate(() => window.QLOBE_DEBUG.fastTimers(0.05));
  for (const m of ['find', 'sound', 'picture']) {
    await A.page.evaluate(() => window.QLOBE_DEBUG.home());
    const run = await A.page.evaluate((id) => window.__qa.drive(id), m);
    collected.runs[m] = run;
    collected.rounds.push(...run.rounds);
    console.log(`\n[${m}]`);
    run.log.forEach((l) => console.log('     ' + l));
    check(`${m}: reaches the end screen`, run.screen === 'end', run.screen);
    check(`${m}: every round solved through the real handler`, run.solved === 3, `solved ${run.solved}`);
    check(`${m}: no stuck round`, !run.log.some((l) => /STUCK|NO PROGRESS|NO CORRECT|REFUSED|LOCKED|ACCEPTED/.test(l)));
    check(`${m}: wrong picks take the gentle path`,
      run.wrongProbes > 0 && run.gentle === run.wrongProbes && run.notLocked === run.wrongProbes,
      `${run.gentle}/${run.wrongProbes} refused, ${run.notLocked}/${run.wrongProbes} recovered`);
    check(`${m}: no catalog link outside the splash`, run.catalogLinks === 0);
    check(`${m}: exactly one canvas`, run.canvases === 1, String(run.canvases));
    await shot(A.page, `land-04-end-${m}`);
    if (m === 'find') {
      // back from the END screen
      await A.page.click('.hud-back');
      await A.page.waitForTimeout(400);
      check('back from END returns to the splash',
        (await A.page.evaluate(() => document.querySelectorAll('.fc-splash').length)) === 1);
    }
  }

  // the end-screen play button → the SPLASH, not into the same mode
  await A.page.evaluate(() => window.QLOBE_DEBUG.home());
  await A.page.evaluate(() => window.__qa.drive('find', { probeWrong: false }));
  await A.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end', null, { timeout: 30000 });
  await A.page.click('.fc-round-btn');
  await A.page.waitForTimeout(700);
  const afterEnd = await A.page.evaluate(() => ({
    splash: document.querySelectorAll('.fc-splash').length,
    modes: document.querySelectorAll('.fc-mode').length,
    screen: window.QLOBE_DEBUG.getState().screen,
    homeLinks: document.querySelectorAll('a.hud-home').length,
  }));
  check('the end-screen button returns to the SPLASH, not into the same mode',
    afterEnd.splash === 1 && afterEnd.modes === 3 && afterEnd.screen === 'splash',
    JSON.stringify(afterEnd));
  check('the catalog link is back, and only on the splash', afterEnd.homeLinks === 1);

  // back from PLAY
  await A.page.evaluate(() => window.QLOBE_DEBUG.startMode('sound'));
  await A.page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 20000 });
  check('play screen has no catalog link',
    (await A.page.evaluate(() => document.querySelectorAll('a.hud-home').length)) === 0);
  await A.page.click('.hud-back');
  await A.page.waitForTimeout(400);
  check('back from PLAY returns to the splash',
    (await A.page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'splash');

  // =========================================================================
  head('D · nothing stranded after repeated mount / unmount');
  // =========================================================================
  await A.page.evaluate(() => window.QLOBE_DEBUG.mute());
  const cycles = [];
  for (let i = 0; i < 4; i++) {
    await A.page.evaluate(() => window.__qa.drive('find', { probeWrong: true }));
    await A.page.evaluate(() => window.QLOBE_DEBUG.home());
    // Long enough for both splash idle timers (15 s / 35 s × the 0.05 scale) to
    // have fired, so the timer count is measured in the same steady state each
    // cycle rather than mid-countdown.
    await A.page.waitForTimeout(2300);
    cycles.push(await A.page.evaluate(() => window.__qa.snapshot()));
  }
  cycles.forEach((c, i) => console.log(`     cycle ${i + 1}: ${JSON.stringify(c)}`));
  const first = cycles[1];
  const last = cycles[3];
  check('no stranded DOM nodes across mount/unmount cycles',
    last.nodes - first.nodes === 0, `${first.nodes} → ${last.nodes}`);
  check('no stranded canvases', last.canvases === 0 && first.canvases === 0,
    `${first.canvases} → ${last.canvases}`);
  check('no stranded timers', last.timers - first.timers <= 1, `${first.timers} → ${last.timers}`);
  check('no stranded window/document listeners (net does not grow)',
    last.listeners - first.listeners <= 0, `${first.listeners} → ${last.listeners} net`);
  const addsPerCycle = [cycles[2].adds - cycles[1].adds, cycles[3].adds - cycles[2].adds];
  check('each mount registers the same number of listeners as the last',
    addsPerCycle[0] === addsPerCycle[1] && addsPerCycle[0] > 0,
    `${addsPerCycle.join(' then ')} adds per cycle`);

  // =========================================================================
  head('E · visibilitychange');
  // =========================================================================
  await A.page.evaluate(() => window.QLOBE_DEBUG.startMode('find'));
  await A.page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 20000 });
  const stageBox = await A.page.locator('.fc-stage').boundingBox();
  const before = await A.page.screenshot({ clip: stageBox });
  const other = await A.ctx.newPage();
  await other.goto('about:blank');
  await other.bringToFront();                     // page A really goes hidden
  await A.page.waitForTimeout(600);
  await A.page.bringToFront();
  await A.page.waitForTimeout(400);
  await other.close();
  const tickerAfter = await A.page.evaluate(() => window.QLOBE_DEBUG.tickerStarted());
  check('ticker is still stopped after a hide/show cycle (§4.1)', tickerAfter === false,
    `tickerStarted=${tickerAfter}`);
  await A.page.evaluate(() => window.QLOBE_DEBUG.moveBeam(420, 880));
  await A.page.waitForTimeout(350);
  const after = await A.page.screenshot({ clip: stageBox });
  check('canvas still repaints after a hide/show cycle',
    Buffer.compare(before, after) !== 0, `${before.length} vs ${after.length} bytes`);
  await A.page.evaluate(() => window.QLOBE_DEBUG.home());

  // =========================================================================
  head('F · every request path is lowercase');
  // =========================================================================
  const upper = [...A.bag.urls].filter((p) => /[A-Z]/.test(p));
  check('every request path is lowercase', upper.length === 0, upper.slice(0, 5).join(' '));

  check('landscape: no console errors', A.bag.errors.length === 0, A.bag.errors.slice(0, 3).join(' | '));
  check('landscape: no failed requests', A.bag.failed.length === 0, A.bag.failed.slice(0, 5).join(' | '));
  note(`${A.bag.aborted.length} interrupted clip/pose load(s) — expected, see isExpectedAbort`);
  await A.ctx.close();

  // =========================================================================
  head('G · seeded content sweep — same-phonic decoys and X');
  // =========================================================================
  const S = await newPage(browser);
  await boot(S.page);
  await S.page.evaluate(() => { window.QLOBE_DEBUG.mute(); window.QLOBE_DEBUG.fastTimers(0.02); });
  const sweep = [];
  const mismatches = [];
  for (const [mode, seeds] of Object.entries(SEEDS)) {
    for (const seed of seeds) {
      await S.page.evaluate(() => window.QLOBE_DEBUG.home());
      const run = await S.page.evaluate(
        ([m, n]) => window.__qa.drive(m, { probeWrong: false, seed: n }), [mode, seed]);
      sweep.push(...run.rounds);
      const predicted = predictBag(seed, ELIGIBLE[mode]);
      const actual = run.rounds.map((r) => r.target);
      if (actual.join('') !== predicted.slice(0, actual.length).join('')) {
        mismatches.push(`${mode}/${seed}: predicted ${predicted.join('')} got ${actual.join('')}`);
      }
      if (run.screen !== 'end') mismatches.push(`${mode}/${seed}: ended on ${run.screen}`);
    }
  }
  collected.rounds.push(...sweep);
  check('seeded runs are reproducible (the gate can predict every target)',
    mismatches.length === 0, mismatches.slice(0, 3).join(' | '));

  const scored = collected.rounds.filter((r) => r.mode === 'sound' || r.mode === 'picture');
  const badDecoys = [];
  for (const r of scored) {
    for (const c of r.chars) {
      if (c.role === 'wrong' && PHONIC[c.char] === PHONIC[r.target]) {
        badDecoys.push(`${r.mode}/seed ${r.seed} r${r.round}: ${r.target} with decoy ${c.char}`);
      }
    }
  }
  const targetsSeen = { sound: new Set(), picture: new Set() };
  for (const r of scored) targetsSeen[r.mode].add(r.target);
  const ck = (m) => ['C', 'K'].filter((L) => targetsSeen[m].has(L));
  check('the sweep actually put C and K on screen as targets in `sound`',
    ck('sound').length === 2, `saw ${ck('sound').join('/') || 'neither'} across ${[...targetsSeen.sound].length} distinct targets`);
  check('the sweep actually put C and K on screen as targets in `picture`',
    ck('picture').length === 2, `saw ${ck('picture').join('/') || 'neither'}`);
  check('no decoy ever shares the target phonic in `sound`/`picture` (§2.2)',
    badDecoys.length === 0,
    `${scored.length} scored rounds checked${badDecoys.length ? ': ' + badDecoys.slice(0, 3).join(' | ') : ''}`);

  const pictureTargets = collected.rounds.filter((r) => r.mode === 'picture').map((r) => r.target);
  check('X is never a target in `picture` (§9.12)',
    pictureTargets.length > 0 && !pictureTargets.includes('X'),
    `${pictureTargets.length} picture rounds: ${pictureTargets.join('')}`);

  check('seeded sweep: no console errors', S.bag.errors.length === 0, S.bag.errors.slice(0, 3).join(' | '));
  check('seeded sweep: no failed requests', S.bag.failed.length === 0, S.bag.failed.slice(0, 5).join(' | '));
  await S.ctx.close();

  // =========================================================================
  head('H · portrait 834×1194');
  // =========================================================================
  const B = await newPage(browser, { viewport: { width: 834, height: 1194 } });
  await boot(B.page);
  await shot(B.page, 'port-01-splash');
  await B.page.evaluate(() => window.QLOBE_DEBUG.fastTimers(0.05));
  for (const m of ['find', 'sound', 'picture']) {
    await B.page.evaluate(() => window.QLOBE_DEBUG.home());
    await B.page.evaluate((id) => window.QLOBE_DEBUG.startMode(id), m);
    await B.page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 20000 });
    // Check 21/22 in portrait — folded in here rather than in its own sweep,
    // because this is already the portrait mount. The crop that shipped was a
    // wide-short one, so §M drives that shape separately; portrait is the case
    // that must keep working.
    if (m === 'picture') {
      checkLedge('portrait/picture', await waitForLedge(B.page), B.page.viewportSize());
    }
    await shot(B.page, `port-02-play-${m}`);
    const size = await B.page.evaluate(() => {
      const t = window.QLOBE_DEBUG.getTargets().map((x) => ({ w: Math.round(x.rect.w), h: Math.round(x.rect.h) }));
      const hud = [...document.querySelectorAll('.hud-button')]
        .filter((e) => e.offsetParent !== null && !e.classList.contains('hidden'))
        .map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
      return { t, hud };
    });
    check(`portrait/${m}: every letter target ≥ 96 px`,
      size.t.length > 0 && size.t.every((x) => x.w >= 96 && x.h >= 96),
      size.t.map((x) => `${x.w}×${x.h}`).join(' '));
    check(`portrait/${m}: every .hud-button ≥ 96 px`,
      size.hud.length > 0 && size.hud.every((x) => x.w >= 96 && x.h >= 96),
      size.hud.map((x) => `${x.w}×${x.h}`).join(' '));
  }
  const portraitRun = await B.page.evaluate(() => window.__qa.drive('picture'));
  check('portrait: a mode still completes', portraitRun.screen === 'end', portraitRun.log.slice(-2).join(' | '));
  await shot(B.page, 'port-04-end');
  check('portrait: no console errors', B.bag.errors.length === 0, B.bag.errors.slice(0, 3).join(' | '));
  check('portrait: no failed requests', B.bag.failed.length === 0, B.bag.failed.slice(0, 5).join(' | '));
  await B.ctx.close();

  // =========================================================================
  head('I · reduced motion');
  // =========================================================================
  const C = await newPage(browser, { reducedMotion: 'reduce' });
  await boot(C.page);
  await C.page.evaluate(() => window.QLOBE_DEBUG.fastTimers(0.05));
  await C.page.evaluate(() => window.QLOBE_DEBUG.startMode('find'));
  await C.page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 20000 });
  check('reduced motion: the game knows',
    (await C.page.evaluate(() => window.QLOBE_DEBUG.getState().reducedMotion)) === true);
  const rmFrom = await C.page.evaluate(() => {
    const b = window.QLOBE_DEBUG.getBeam();
    return window.QLOBE_DEBUG.toScreen(b.x, b.y);
  });
  const rmTo = await C.page.evaluate(() => window.QLOBE_DEBUG.toScreen(1100, 800));
  await drag(C.page, rmFrom, rmTo, { steps: 12, gap: 30 });
  await C.page.waitForTimeout(200);
  const rmBeam = await C.page.evaluate(() => window.QLOBE_DEBUG.getBeam());
  check('reduced motion: the beam is still draggable (it snaps, it does not stop)',
    dist(rmBeam, { x: 1100, y: 800 }) < 45,
    `${dist(rmBeam, { x: 1100, y: 800 }).toFixed(0)} art px off`);
  await shot(C.page, 'reduced-motion-play');
  const rmRun = await C.page.evaluate(() => window.__qa.drive('sound'));
  check('reduced motion: a mode still completes', rmRun.screen === 'end', rmRun.log.slice(-2).join(' | '));
  check('reduced motion: no console errors', C.bag.errors.length === 0, C.bag.errors.slice(0, 3).join(' | '));
  await shot(C.page, 'reduced-motion-end');
  await C.ctx.close();

  // =========================================================================
  head('J · quality ladder — `flat`');
  // =========================================================================
  const Q = await newPage(browser);
  await boot(Q.page);
  await Q.page.evaluate(() => { window.QLOBE_DEBUG.mute(); window.QLOBE_DEBUG.fastTimers(0.05); });
  await Q.page.evaluate(() => window.QLOBE_DEBUG.startMode('find'));
  await Q.page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 20000 });
  const q = await Q.page.evaluate(() => window.QLOBE_DEBUG.setQuality('flat'));
  check('quality can be forced to `flat`', q === 'flat', String(q));
  await shot(Q.page, 'quality-flat');
  const qRun = await Q.page.evaluate(() => window.__qa.drive('find', { quality: 'flat' }));
  check('quality `flat`: the mode still completes through attempt()',
    qRun.screen === 'end' && qRun.solved === 3, `${qRun.screen}, solved ${qRun.solved}`);
  check('quality `flat`: wrong picks are still refused',
    qRun.wrongProbes > 0 && qRun.gentle === qRun.wrongProbes, `${qRun.gentle}/${qRun.wrongProbes}`);
  check('quality `flat`: the run really ran at `flat`',
    (await Q.page.evaluate(() => window.QLOBE_DEBUG.getState().quality)) === 'flat');
  check('quality `flat`: no console errors', Q.bag.errors.length === 0, Q.bag.errors.slice(0, 3).join(' | '));
  await Q.ctx.close();

  // =========================================================================
  head('K · no WebGL — the §3.5 static screen');
  // =========================================================================
  // Blocking the vendor bundle is the honest way to reach it: createCave()
  // rejects and main.js mounts the DOM screen. The block itself is a deliberate
  // failure, so it is allow-listed rather than counted.
  const N = await newPage(browser, { allow: [/pixi\.min\.js/] });
  await N.page.route('**/pixi.min.js', (r) => r.abort());
  await boot(N.page);
  await N.page.evaluate(() => { window.QLOBE_DEBUG.mute(); window.QLOBE_DEBUG.fastTimers(0.05); });
  await N.page.evaluate(() => window.QLOBE_DEBUG.startMode('find'));
  await N.page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 25000 });
  const fb = await N.page.evaluate(() => ({
    plate: document.querySelectorAll('.fc-fallback-plate').length,
    letters: document.querySelectorAll('.fc-fallback-letter').length,
    canvases: document.querySelectorAll('canvas').length,
    quality: window.QLOBE_DEBUG.getState().quality,
  }));
  check('no WebGL: the static screen mounts',
    fb.plate === 1 && fb.letters === 3 && fb.canvases === 0 && fb.quality === 'dom',
    JSON.stringify(fb));
  await shot(N.page, 'no-webgl');
  const fbRun = await N.page.evaluate(() => window.__qa.drive('find'));
  check('no WebGL: the mode still completes',
    fbRun.screen === 'end' && fbRun.solved === 3, `${fbRun.screen}, solved ${fbRun.solved}`);
  check('no WebGL: wrong picks are still refused',
    fbRun.wrongProbes > 0 && fbRun.gentle === fbRun.wrongProbes, `${fbRun.gentle}/${fbRun.wrongProbes}`);
  check('no WebGL: no console errors', N.bag.errors.length === 0, N.bag.errors.slice(0, 3).join(' | '));
  check('no WebGL: no failed requests beyond the blocked bundle',
    N.bag.failed.length === 0, N.bag.failed.slice(0, 3).join(' | '));
  await N.ctx.close();

  // =========================================================================
  head('L · dpr seam — the hole/strip join at 1×, 2×, 3× (human review)');
  // =========================================================================
  for (const dpr of [1, 2, 3]) {
    const P = await newPage(browser, { dpr });
    await boot(P.page);
    await P.page.evaluate(() => { window.QLOBE_DEBUG.mute(); window.QLOBE_DEBUG.fastTimers(0.05); });
    await P.page.evaluate(() => window.QLOBE_DEBUG.startMode('find'));
    await P.page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 20000 });
    await P.page.evaluate(() => window.QLOBE_DEBUG.moveBeam(800, 620));
    await P.page.waitForTimeout(400);
    await shot(P.page, `dpr-${dpr}x-seam`);
    check(`dpr ${dpr}×: no console errors`, P.bag.errors.length === 0, P.bag.errors.slice(0, 2).join(' | '));
    await P.ctx.close();
  }
  note('dpr-1x/2x/3x-seam.png are for HUMAN review of the hole↔strip join — no automated assertion');

  // =========================================================================
  head('M · the four post-sign-off regressions (found on an iPad while this gate was 95/95)');
  // =========================================================================

  // --- 20. the flashlight points back INTO its own beam ---------------------
  // The torch rides beside the beam and is mirrored so it points back at it. The
  // scale/rotation sign pairing was inverted, so the lamp faced away from the
  // light it was casting. The assertion is the RELATIONSHIP — right of the beam
  // means facing left, and vice versa — because a hard-coded sign would have to
  // be rewritten (and could be rewritten wrong) the day the art is redrawn.
  const R = await newPage(browser);
  await boot(R.page);
  await R.page.evaluate(async () => {
    window.QLOBE_DEBUG.mute();
    await window.QLOBE_DEBUG.startMode('find');
  });
  await R.page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput, null, { timeout: 20000 });
  const torchSweep = await R.page.evaluate(async () => {
    const D = window.QLOBE_DEBUG;
    // Art coords for a fraction of the VIEWPORT, by inverting toScreen() — the
    // same trick emptySpot() uses. Sweeping the screen rather than art space is
    // what guarantees both edges are reached whatever the aspect ratio crops.
    const o = D.toScreen(0, 0);
    const u = D.toScreen(100, 100);
    const s = (u.x - o.x) / 100;
    const art = (sx, sy) => ({ x: (sx - o.x) / s, y: (sy - o.y) / s });
    const out = [];
    for (const f of [0.04, 0.2, 0.35, 0.5, 0.65, 0.82, 0.96]) {
      const p = art(window.innerWidth * f, window.innerHeight * 0.5);
      D.moveBeam(p.x, p.y);
      await window.__qa.sleep(180);
      out.push({ f, torch: D.getTorch() });
    }
    return out;
  });
  const torchBad = torchSweep.filter(({ torch: t }) => !t
    || (t.x > t.beamX && t.facesRight) || (t.x < t.beamX && !t.facesRight));
  check('the flashlight always points back INTO its own beam (7 beam positions)',
    torchBad.length === 0,
    torchSweep.map(({ f, torch: t }) => (t
      ? `${Math.round(f * 100)}%:${t.x > t.beamX ? 'right-of' : 'left-of'}/${t.facesRight ? 'faces-right' : 'faces-left'}`
      : `${Math.round(f * 100)}%:NO TORCH`)).join(' '));
  const facings = new Set(torchSweep.filter((r) => r.torch).map((r) => r.torch.facesRight));
  check('the torch sweep exercises BOTH facings (the mirrored branch is live)',
    facings.size === 2, `${facings.size} distinct facing(s) across the width`);

  // --- 21 / 22, landscape --------------------------------------------------
  await R.page.evaluate(() => window.QLOBE_DEBUG.startMode('picture'));
  const landLedge = checkLedge('landscape', await waitForLedge(R.page), R.page.viewportSize());
  await shot(R.page, 'land-05-ledge');

  // --- 21, the reflow() path: the ledge is re-clamped on every resize ------
  for (const vp of [{ width: 1180, height: 520 }, { width: 834, height: 1194 }, { width: 1180, height: 820 }]) {
    await R.page.setViewportSize(vp);
    await R.page.waitForTimeout(500);
    const l = await R.page.evaluate(() => window.QLOBE_DEBUG.getLedge());
    check(`the ledge survives a resize to ${vp.width}×${vp.height} mid-round`,
      !!l && insideViewport(l.rect, vp) && insideViewport(l.objectBounds, vp),
      l ? `slot ${rectStr(l.rect)}, painted ${rectStr(l.objectBounds)}` : 'the ledge vanished');
  }
  await shot(R.page, 'land-06-ledge-after-resize');
  check('torch + ledge sweep: no console errors', R.bag.errors.length === 0, R.bag.errors.slice(0, 3).join(' | '));
  await R.ctx.close();

  // --- 21 at 1180×520 — the shape that actually cropped it -----------------
  // A 4:3-ish viewport does NOT reproduce this: the ledge is authored at art
  // y 190, above the playable band and inside the top HUD reserve, and only
  // cover-fit on a wide, short window pushes that off the top of the screen.
  const WS = await newPage(browser, { viewport: { width: 1180, height: 520 } });
  await boot(WS.page);
  check('wide-short 1180×520: the audio-unlock gesture did not start a mode',
    (await WS.page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'splash');
  await WS.page.evaluate(() => {
    window.QLOBE_DEBUG.mute();
    return window.QLOBE_DEBUG.startMode('picture');
  });
  checkLedge('wide-short 1180×520', await waitForLedge(WS.page), WS.page.viewportSize());
  await shot(WS.page, 'wide-short-ledge');
  check('wide-short 1180×520: no console errors', WS.bag.errors.length === 0, WS.bag.errors.slice(0, 3).join(' | '));
  await WS.ctx.close();

  // --- 22. the object is really PAINTED, with zero interaction -------------
  // The pop-in was registered with the game's tween tracker (for cancellation)
  // but never with cave.track(), so nothing drove the on-demand render pump: the
  // single frame that drew the sprite performed the texture's GPU upload and
  // drew before the pixels were resident, and no frame followed. The object then
  // stayed invisible until the child moved the light and incidentally caused a
  // repaint. NOTHING in the debug surface can see that — the sprite exists, its
  // texture is valid, its alpha is 1. Only pixels can, so this check is pixels.
  //
  // page.screenshot({clip}) composites the real canvas correctly. Reading the
  // WebGL canvas back with drawImage/getImageData does not: preserveDrawingBuffer
  // is false and it hands back all zeroes.
  const V = await newPage(browser);
  // Hold the object image back so there is a wide, reliable window in which the
  // play screen is up and the ledge is not. That window is the baseline.
  await V.page.route('**/shared/assets/objects/*.png', async (r) => {
    await new Promise((res) => setTimeout(res, 1200));
    await r.continue();
  });
  await boot(V.page);
  await V.page.evaluate(() => {
    window.QLOBE_DEBUG.mute();
    window.QLOBE_DEBUG.startMode('picture');       // deliberately NOT awaited
  });
  // Wait for the CAVE, not just for the stage element: getBeam() answers
  // {0,0,radius:0} until there is one, and a baseline captured before that is a
  // picture of the splash.
  await V.page.waitForFunction(() => window.QLOBE_DEBUG.getBeam().radius > 0, null, { timeout: 20000 });
  const clip = { x: landLedge.rect.x, y: landLedge.rect.y, width: landLedge.rect.w, height: landLedge.rect.h };
  const baseline = [];
  let appeared = null;
  // The beam as of the LAST baseline frame — the light parks itself at
  // layout.beamStart while the round opens, so "the beam never moved" can only
  // honestly be measured from the baseline forward, not from the mount.
  let beamAtBaseline = null;
  const paintDeadline = Date.now() + 25000;
  while (Date.now() < paintDeadline) {
    const st = await V.page.evaluate(() => ({
      ledge: window.QLOBE_DEBUG.getLedge(), beam: window.QLOBE_DEBUG.getBeam(),
    }));
    if (st.ledge) { appeared = st.ledge; break; }
    const frame = await V.page.screenshot({ clip });
    // The ledge can be born BETWEEN the poll and the shot, and that frame then
    // already has the object in it — which is a real sighting, not a baseline.
    // Re-read after the shot and throw the straddling frame away.
    appeared = await V.page.evaluate(() => window.QLOBE_DEBUG.getLedge());
    if (appeared) break;
    beamAtBaseline = st.beam;
    baseline.push(frame);
    if (baseline.length > 2) baseline.shift();
    await V.page.waitForTimeout(70);
  }
  const settled = appeared ? await waitForLedge(V.page) : null;
  await V.page.waitForTimeout(400);                // one clear beat past the pop-in
  const painted = await V.page.screenshot({ clip });
  const beamAtEnd = await V.page.evaluate(() => window.QLOBE_DEBUG.getBeam());
  await writeFile(path.join(SHOTS, 'paint-before.png'), baseline[baseline.length - 1] || Buffer.alloc(0));
  await writeFile(path.join(SHOTS, 'paint-after.png'), painted);
  check('the clipped region really is the ledge slot (same rect as the measured one)',
    !!settled && Math.abs(settled.rect.x - clip.x) < 1 && Math.abs(settled.rect.y - clip.y) < 1,
    settled ? `${rectStr(settled.rect)} vs clip ${rectStr(landLedge.rect)}` : 'the ledge never appeared');
  check('the ledge region is STATIC before the object arrives (a real baseline)',
    baseline.length === 2 && Buffer.compare(baseline[0], baseline[1]) === 0,
    `${baseline.length} baseline frames of ${rectStr(landLedge.rect)}`);
  check('the object is genuinely PAINTED with no interaction at all',
    baseline.length > 0 && Buffer.compare(baseline[baseline.length - 1], painted) !== 0,
    `${baseline[baseline.length - 1]?.length} → ${painted.length} bytes over the same clip`);
  check('nothing was touched: the beam never moved between baseline and paint',
    !!beamAtBaseline && dist(beamAtBaseline, beamAtEnd) < 0.5,
    beamAtBaseline ? `${dist(beamAtBaseline, beamAtEnd).toFixed(2)} art px` : 'no baseline frame');
  check('paint probe: no console errors', V.bag.errors.length === 0, V.bag.errors.slice(0, 3).join(' | '));
  await V.ctx.close();

  // --- 23. the object is on the ledge BEFORE the prompt names it -----------
  // "Which letter does this start with?" is meaningless if `this` is not there
  // yet: openRound() used to fire showLedge() and walk straight into the prompt.
  // Portrait on purpose — and note the trap when writing a probe like this: the
  // audio-unlock gesture must NOT be a click at screen centre, because the mode
  // tiles sit at y≈449 here and a centre click starts `find` before the probe
  // ever asks for `picture`. boot() clicks near the TOP centre for that reason,
  // and the check above this one asserts it worked.
  const O = await newPage(browser, { viewport: { width: 834, height: 1194 } });
  await boot(O.page);
  check('portrait: the audio-unlock gesture did not start a mode',
    (await O.page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'splash');
  const order = await O.page.evaluate(async () => {
    const D = window.QLOBE_DEBUG;
    window.__qa.clipLog = [];
    D.startMode('picture');                        // deliberately NOT awaited
    let ledgeAt = -1;
    const t0 = performance.now();
    while (performance.now() - t0 < 25000) {
      if (ledgeAt < 0 && D.getLedge()) ledgeAt = performance.now();
      if (window.__qa.clipLog.some((c) => c.key === 'starts-intro')) break;
      await window.__qa.sleep(16);
    }
    const p = window.__qa.clipLog.find((c) => c.key === 'starts-intro');
    return { ledgeAt, promptAt: p ? p.t : -1, keys: window.__qa.clipLog.map((c) => c.key) };
  });
  check('picture round 1 really plays the recorded prompt clip',
    order.promptAt > 0, order.keys.join(',') || 'no clips');
  check('the object is on the ledge BEFORE the prompt names it (§3.2)',
    order.ledgeAt > 0 && order.promptAt > 0 && order.ledgeAt <= order.promptAt,
    `ledge at ${Math.round(order.ledgeAt)} ms, "starts-intro" at ${Math.round(order.promptAt)} ms`);
  check('clip-order probe: no console errors', O.bag.errors.length === 0, O.bag.errors.slice(0, 3).join(' | '));
  await O.ctx.close();

  await browser.close();

  const failedChecks = results.filter((r) => !r.ok);
  await writeFile(path.join(SHOTS, 'qa.json'),
    JSON.stringify({ results, notes, perf: collected.perf, runs: collected.runs, rounds: collected.rounds }, null, 1));
  console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed; shots in ${SHOTS}`);
  console.log(`perf: ${collected.perf ? `${collected.perf.ms} ms mean frame interval, ${collected.perf.fps} fps, quality ${collected.perf.quality}` : 'not measured'}`);
  if (failedChecks.length) {
    console.log('FAILED: ' + failedChecks.map((f) => f.name).join(', '));
    process.exit(1);
  }
  console.log('ALL GREEN — status stays `beta` until the iPad sign-off (polish-process.md §5).');
}

main().catch((e) => { console.error(e); process.exit(1); });
