#!/usr/bin/env node
// games/tweezer-rescue/tools/smoke-test.mjs — real-Chrome smoke suite.
//
// Drives splash -> each of the 4 rescue modes -> a real grab/carry/drop
// (correct AND a deliberate wrong-drop probe) -> celebration -> NEXT/back
// navigation, in both landscape and portrait, plus a reduced-motion pass, plus
// a real (non-debug-shortcut) window-level pointercancel probe. Asserts zero
// page errors and zero failed requests — a missing voice manifest/clip is
// handled gracefully by voice-clips.js, not a failure, so aborted .m4a
// requests are explicitly allowed (see openSession's allowAbortedMedia).
// Screenshots every screen plus a mid-drag peak-motion frame per mode into
// repo-root qa-shots/tweezer-rescue/.
//
//   node games/tweezer-rescue/tools/smoke-test.mjs
//   node games/tweezer-rescue/tools/smoke-test.mjs --base http://127.0.0.1:8899
//   node games/tweezer-rescue/tools/smoke-test.mjs --shots /tmp/shots --headed
//
// channel: 'chrome' is load-bearing — Playwright's bundled Chromium has no
// AAC decoder, so every .m4a would silently fail and voice assertions would
// quietly pass against the Web Speech fallback instead. Run under
// `caffeinate -dims` — a sleeping Mac freezes Chrome without failing the run.

import path from 'node:path';
import {
  baseUrl, launchChrome, openSession, checkSessionClean,
  createReporter, resolveShots, ensureShots, shooter,
} from '../../../tools/qa/lib/driver.mjs';

const BASE = baseUrl();
const URL_ = `${BASE}/games/tweezer-rescue/`;
const SHOTS = resolveShots(path.join(process.cwd(), 'qa-shots', 'tweezer-rescue'));

const reporter = createReporter({ style: 'ok' });
const { check: ok, head, finish } = reporter;

const MODES = ['ladybugs', 'bees', 'fish', 'pompoms'];

// The platform's one deliberate remote exception (CLAUDE.md): the shared GA4
// pageview tag every game links. Not a bug.
const PLATFORM_ANALYTICS = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
];

// Assets this placeholder-era build legitimately does not ship yet, and
// which the game's own code already handles gracefully rather than treating
// as an error: js/tweezers.js merges hinge metadata over defaults on a 404
// (a separate BUILDER pass owns assets/), and voice-clips.js runs in Web
// Speech fallback mode when its manifest/lines files are missing — see
// game-design.md's "Voice ... Web Speech fallback" and the task's own
// "missing voice manifest must be handled, not a failure."
const EXPECTED_MISSING = [
  '/games/tweezer-rescue/assets/sprites/tweezers.json',
  '/games/tweezer-rescue/assets/audio/voice/manifest.json',
  '/games/tweezer-rescue/assets/audio/voice/lines.json',
];

function openTweezerSession(browser, options) {
  return openSession(browser, {
    base: BASE,
    allowRemote: PLATFORM_ANALYTICS,
    allowAbortedMedia: true,
    // Chrome also echoes a generic "Failed to load resource: ... 404" line to
    // the console for each of the EXPECTED_MISSING 404s above (with no URL in
    // the text, so it can't be matched per-file here). The precise, per-URL
    // check already lives in reportSessionClean()'s network-level `failed`
    // filter; divert this duplicate generic line to diagnostics so it can't
    // mask a REAL page error underneath it.
    ignoreConsole: ['Failed to load resource'],
    ...options,
  });
}

/** checkSessionClean, with the two known-expected categories above filtered
 * out first so the assertion only fires on genuine regressions. */
function reportSessionClean(session, label) {
  const failed = session.failed.filter((entry) => !PLATFORM_ANALYTICS.some((p) => entry.includes(p))
    && !EXPECTED_MISSING.some((p) => entry.includes(p)));
  const remote = session.remote.filter((entry) => !PLATFORM_ANALYTICS.some((p) => entry.startsWith(p)));
  checkSessionClean(reporter, { ...session, failed, remote }, label);
}

async function main() {
  await ensureShots(SHOTS);
  const shot = shooter(SHOTS);
  const browser = await launchChrome();

  try {
    await landscapeDrive(browser, shot);
    await portraitDrive(browser, shot);
    await reducedMotionDrive(browser, shot);
  } finally {
    await browser.close();
  }

  finish({ suffix: `; shots in ${SHOTS}`, exit: true });
}

// ============================================================================
// LANDSCAPE — the full drive: splash, all 4 modes (grab/carry/drop correct +
// wrong-drop probe), a real pointercancel probe, celebration, NEXT wrap, back.
// ============================================================================

async function landscapeDrive(browser, shot) {
  head('landscape drive (1180x820)');
  const session = await openTweezerSession(browser, {
    url: URL_,
    viewport: { width: 1180, height: 820 },
  });
  const { page } = session;

  ok('QLOBE_DEBUG v1 installed', await page.evaluate(() => window.QLOBE_DEBUG && window.QLOBE_DEBUG.version === 1));
  ok('boots on the splash screen', await page.evaluate(() => window.QLOBE_DEBUG.getState().screen === 'splash'));
  ok('lists exactly the 4 designed modes', await page.evaluate(
    () => window.QLOBE_DEBUG.listModes().map((m) => m.id).join(',') === 'ladybugs,bees,fish,pompoms',
  ), JSON.stringify(await page.evaluate(() => window.QLOBE_DEBUG.listModes())));
  ok('nothing spoke before a gesture',
    await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog().length === 0),
    JSON.stringify(await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog())));

  await shot(page, '00-splash-landscape');

  const cardBox = await page.locator('#card-row .mode-card').first().boundingBox();
  ok('splash card is a real >=96px touch target',
    Boolean(cardBox) && cardBox.width >= 96 && cardBox.height >= 96, JSON.stringify(cardBox));

  for (const modeId of MODES) {
    await driveMode(page, shot, modeId, { probeWrongDrop: true, probeCancel: modeId === MODES[0] });
  }

  head('NEXT wraps around');
  const beforeWrap = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  ok('final celebration is showing', beforeWrap.screen === 'celebration', JSON.stringify(beforeWrap));
  await page.click('#btn-next');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'play', null, { timeout: 8000 });
  const wrapped = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  ok('NEXT from the last mode wraps to the first mode', wrapped.mode === MODES[0], JSON.stringify(wrapped));

  await page.click('#btn-back');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'splash', null, { timeout: 8000 });
  ok('back from play returns to splash', await page.evaluate(() => window.QLOBE_DEBUG.getState().screen === 'splash'));

  const homeCount = await page.evaluate(() => document.querySelectorAll('#btn-home').length);
  ok('exactly one home button, and it is on the splash screen',
    homeCount === 1
    && (await page.evaluate(() => Boolean(document.getElementById('screen-splash').querySelector('#btn-home')))),
    String(homeCount));

  reportSessionClean(session, 'landscape session');
  await session.close();
}

/** Drive one mode end-to-end: intro, a correct grab/carry/drop (with a
 * mid-drag screenshot), an optional wrong-drop probe, an optional real
 * pointercancel probe, then winRound() to finish the mode. */
async function driveMode(page, shot, modeId, {
  probeWrongDrop = false, probeCancel = false, shotPrefix = '',
} = {}) {
  head(`mode: ${modeId}`);
  await page.evaluate((id) => window.QLOBE_DEBUG.startMode(id), modeId);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'play', null, { timeout: 8000 });
  const st0 = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  ok(`${modeId}: play screen shows the right mode`, st0.mode === modeId, JSON.stringify(st0));
  ok(`${modeId}: critters are present`, Array.isArray(st0.critters) && st0.critters.length > 0, String(st0.critters?.length));

  await page.waitForTimeout(150); // let the scene/tweezer layout settle
  await shot(page, `01-${shotPrefix}${modeId}-play`);

  const t0 = await page.evaluate(() => window.QLOBE_DEBUG.targets());
  ok(`${modeId}: targets() reports grab and drop anchors`,
    Array.isArray(t0.grab) && t0.grab.length > 0 && Array.isArray(t0.drop) && t0.drop.length > 0,
    JSON.stringify(t0).slice(0, 200));

  // ---- a correct grab/carry/drop, routed through the real pointer handlers
  // (grabAt/dragTo/dropAt call tweezers.js's down/move/up directly — the same
  // functions the window pointer listeners call). ---------------------------
  const critter = t0.grab.find((c) => c.status === 'rest');
  ok(`${modeId}: at least one critter at rest to grab`, Boolean(critter));
  if (critter) {
    const home = await page.evaluate((kind) => {
      const targets = window.QLOBE_DEBUG.targets().drop;
      return targets.find((x) => (x.accepts || []).includes(kind)) || null;
    }, critter.kind);
    ok(`${modeId}: a matching target exists for kind "${critter.kind}"`, Boolean(home), JSON.stringify(home));

    if (home) {
      await page.evaluate(([x, y]) => window.QLOBE_DEBUG.grabAt(x, y), [critter.x, critter.y]);
      const carriedAfterGrab = await page.evaluate(() => window.QLOBE_DEBUG.getState().carried);
      ok(`${modeId}: grabAt attaches the critter`, carriedAfterGrab === critter.id, String(carriedAfterGrab));

      // Drag in steps toward a point past the target, then settle briefly, so
      // the velocity-driven pendulum wobble has time to build — the mid-drag
      // peak-motion frame the task asks for.
      const steps = 6;
      const midX = (critter.x + home.x) / 2 + 60;
      const midY = Math.min(critter.y, home.y) - 40;
      for (let i = 1; i <= steps; i += 1) {
        const p = i / steps;
        const x = critter.x + (midX - critter.x) * p;
        const y = critter.y + (midY - critter.y) * p;
        await page.evaluate(([px, py]) => window.QLOBE_DEBUG.dragTo(px, py), [x, y]);
        await page.waitForTimeout(16);
      }
      await page.waitForTimeout(140);
      const wobbleState = await page.evaluate(() => window.QLOBE_DEBUG.getState());
      ok(`${modeId}: pendulum wobble is non-zero mid-drag`, Math.abs(wobbleState.wobbleDeg || 0) > 0.5,
        String(wobbleState.wobbleDeg));
      await shot(page, `02-${shotPrefix}${modeId}-mid-drag`);

      if (probeWrongDrop) {
        const wrongSpot = { x: 40, y: 40 }; // off every target, top-left corner
        await page.evaluate(([x, y]) => window.QLOBE_DEBUG.dropAt(x, y), [wrongSpot.x, wrongSpot.y]);
        await page.waitForTimeout(700); // float-back animation
        const afterWrong = await page.evaluate(() => window.QLOBE_DEBUG.getState());
        ok(`${modeId}: a wrong drop does not rescue the critter`,
          afterWrong.critters.find((c) => c.id === critter.id)?.status !== 'homed',
          JSON.stringify(afterWrong.critters.find((c) => c.id === critter.id)));
        ok(`${modeId}: wrong drop leaves the round awaiting input, no crash`, afterWrong.awaitingInput === true);

        // re-grab and carry it home for real, proving retry is genuinely free.
        const t1 = await page.evaluate(() => window.QLOBE_DEBUG.targets());
        const c1 = t1.grab.find((c) => c.id === critter.id);
        await page.evaluate(([x, y]) => window.QLOBE_DEBUG.grabAt(x, y), [c1.x, c1.y]);
        await page.evaluate(([x, y]) => window.QLOBE_DEBUG.dragTo(x, y), [home.x, home.y]);
        await page.evaluate(([x, y]) => window.QLOBE_DEBUG.dropAt(x, y), [home.x, home.y]);
      } else {
        await page.evaluate(([x, y]) => window.QLOBE_DEBUG.dropAt(x, y), [home.x, home.y]);
      }

      await page.waitForTimeout(700); // land animation
      const afterCorrect = await page.evaluate(() => window.QLOBE_DEBUG.getState());
      ok(`${modeId}: the correct drop rescues the critter`,
        afterCorrect.critters.find((c) => c.id === critter.id)?.status === 'homed',
        JSON.stringify(afterCorrect.critters.find((c) => c.id === critter.id)));
    }
  }

  if (probeCancel) await pointerCancelProbe(page, modeId);

  const finished = await page.evaluate(() => window.QLOBE_DEBUG.winRound());
  ok(`${modeId}: winRound() completes the round`, finished === true);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'celebration', null, { timeout: 8000 });
  const celState = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  ok(`${modeId}: celebration screen reached`, celState.screen === 'celebration');
  ok(`${modeId}: remaining is 0 at celebration`, celState.remaining === 0, String(celState.remaining));
  await shot(page, `03-${shotPrefix}${modeId}-celebration`);
}

/** A REAL window-level pointer sequence (not the grabAt/dragTo/dropAt debug
 * shortcuts) proving pointercancel is a cancel, never a drop-success, through
 * the actual `window.addEventListener('pointercancel', ...)` wiring. */
async function pointerCancelProbe(page, modeId) {
  head(`${modeId}: real pointercancel probe`);
  const targets = await page.evaluate(() => window.QLOBE_DEBUG.targets());
  const critter = targets.grab.find((c) => c.status === 'rest');
  if (!critter) { ok(`${modeId}: pointercancel probe skipped (no critter at rest)`, true); return; }

  const pid = 424242;
  await page.evaluate(([x, y, id]) => {
    window.dispatchEvent(new PointerEvent('pointerdown', {
      pointerId: id, clientX: x, clientY: y, isPrimary: true, bubbles: true,
    }));
  }, [critter.x, critter.y, pid]);
  await page.evaluate(([x, y, id]) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      pointerId: id, clientX: x + 40, clientY: y - 25, isPrimary: true, bubbles: true,
    }));
  }, [critter.x, critter.y, pid]);
  await page.waitForTimeout(80);
  const midCancel = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  ok(`${modeId}: a real pointerdown+move grabs through the actual window listener`,
    midCancel.carried === critter.id, JSON.stringify(midCancel.carried));

  await page.evaluate((id) => {
    window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: id, bubbles: true }));
  }, pid);
  await page.waitForTimeout(400); // float-back on cancel
  const afterCancel = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  ok(`${modeId}: pointercancel releases the drag`, afterCancel.carried === null, String(afterCancel.carried));
  ok(`${modeId}: pointercancel never homes the critter`,
    afterCancel.critters.find((c) => c.id === critter.id)?.status !== 'homed',
    JSON.stringify(afterCancel.critters.find((c) => c.id === critter.id)));
}

// ============================================================================
// PORTRAIT — a lighter pass: boot, splash card sizes, one full mode, nav.
// ============================================================================

async function portraitDrive(browser, shot) {
  head('portrait drive (834x1194)');
  const session = await openTweezerSession(browser, {
    url: URL_,
    viewport: { width: 834, height: 1194 },
  });
  const { page } = session;

  ok('portrait: boots on splash', await page.evaluate(() => window.QLOBE_DEBUG.getState().screen === 'splash'));
  await shot(page, '10-splash-portrait');

  const cards = await page.locator('#card-row .mode-card').all();
  ok('portrait: 4 splash cards present', cards.length === 4, String(cards.length));
  for (const card of cards) {
    const box = await card.boundingBox();
    ok('portrait: card meets the 96px touch floor', Boolean(box) && box.width >= 96 && box.height >= 96,
      JSON.stringify(box));
  }

  await driveMode(page, shot, 'ladybugs', { probeWrongDrop: false, probeCancel: false, shotPrefix: 'portrait-' });

  await page.evaluate(() => window.QLOBE_DEBUG.startMode('bees'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'play', null, { timeout: 8000 });
  const hudBoxes = await Promise.all(['#btn-back', '#btn-sound-play'].map(async (sel) => {
    const box = await page.locator(sel).boundingBox();
    return { sel, box };
  }));
  ok('portrait: back and sound HUD buttons are >=96px',
    hudBoxes.every(({ box }) => box && box.width >= 96 && box.height >= 96),
    JSON.stringify(hudBoxes));
  await shot(page, '11-portrait-play-bees');

  await page.click('#btn-back');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'splash', null, { timeout: 8000 });
  ok('portrait: back returns to splash', true);

  reportSessionClean(session, 'portrait session');
  await session.close();
}

// ============================================================================
// REDUCED MOTION — no wobble/arc; critters fade-move; splash + one drop.
// ============================================================================

async function reducedMotionDrive(browser, shot) {
  head('reduced motion pass');
  const session = await openTweezerSession(browser, {
    url: URL_,
    viewport: { width: 1180, height: 820 },
    reducedMotion: 'reduce',
  });
  const { page } = session;

  ok('reduced-motion: boots fine', await page.evaluate(() => window.QLOBE_DEBUG.getState().screen === 'splash'));
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('fish'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'play', null, { timeout: 8000 });
  await page.waitForTimeout(150);
  await shot(page, '20-reduced-motion-play');

  const t0 = await page.evaluate(() => window.QLOBE_DEBUG.targets());
  const critter = t0.grab.find((c) => c.status === 'rest');
  if (critter) {
    await page.evaluate(([x, y]) => window.QLOBE_DEBUG.grabAt(x, y), [critter.x, critter.y]);
    await page.evaluate(([x, y]) => window.QLOBE_DEBUG.dragTo(x, y), [critter.x + 40, critter.y - 10]);
    await page.waitForTimeout(120);
    const midState = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    ok('reduced-motion: wobble stays at (or near) 0 while dragging',
      Math.abs(midState.wobbleDeg || 0) < 1, String(midState.wobbleDeg));
    await shot(page, '21-reduced-motion-mid-drag');

    const home = t0.drop.find((x) => (x.accepts || []).includes(critter.kind));
    if (home) {
      await page.evaluate(([x, y]) => window.QLOBE_DEBUG.dropAt(x, y), [home.x, home.y]);
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => window.QLOBE_DEBUG.getState());
      ok('reduced-motion: the drop still rescues the critter (fade-move path)',
        after.critters.find((c) => c.id === critter.id)?.status === 'homed');
    }
  }

  reportSessionClean(session, 'reduced-motion session');
  await session.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
