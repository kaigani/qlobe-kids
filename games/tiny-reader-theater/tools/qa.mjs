#!/usr/bin/env node
// games/tiny-reader-theater/tools/qa.mjs — real-Chrome smoke and visual-QC driver.
//
//   python3 -m http.server 8000
//   caffeinate -dims node games/tiny-reader-theater/tools/qa.mjs [--base …] [--shots …] [--playwright …]
//
// Covers, per the GDD screen map (Setup -> Read -> Choice -> Complete):
//   - Setup boots: all 3 worlds (Forest + Castle + Outer Space) unlocked and
//     pickable, zero "Coming soon" badges, 8 cast portraits.
//   - Every world target (world-forest/world-castle/world-outer-space) is a real,
//     tappable 'world' role and selects without navigating away from Setup.
//   - Deterministic forest start via QLOBE_DEBUG.startMode('forest', {cast:[...]}).
//   - Read: word-by-word tap, line completion (sparkle), narrator+puppet beat as a
//     REAL recorded clip (audio.heardClip), not the Web Speech fallback.
//   - A full Beginning -> Middle -> Ending path to Complete; endings tracker "1 of 9".
//   - Reload persistence (localStorage), then a SECOND, fully different path to "2 of 9"
//     without double-counting a repeat of the same ending via Replay.
//   - "Choose a new path" returns to a playable Setup with world/cast preserved.
//   - Castle setting: a second full Beginning -> Middle -> Ending path
//     (startMode('castle', ...)), a recorded clip for a new castle word + a new
//     castle line key, and its own "1 of 9 found" endings tracker.
//   - Outer Space setting: a third full Beginning -> Middle -> Ending path
//     (startMode('outer-space', ...)), a recorded clip for a new space word + a
//     new space line key, and its own "1 of 9 found" endings tracker.
//   - Landscape + portrait + prefers-reduced-motion passes, each session-clean.
//
// channel: 'chrome' is load-bearing: this game plays recorded .m4a clips and the
// bundled Chromium cannot decode AAC at all — every clip assertion would silently
// pass against the Web Speech fallback instead. See tools/qa/README.md.
//
// SILENCE: the operator may be on a call. Chrome is launched with --mute-audio
// (hard OS-level mute) AND the game's own QLOBE_DEBUG.mute(true) is set on every
// session before any interaction. getAudioLog()/heardClip() still record whether a
// real clip element started, independent of whether it produced sound.

import {
  baseUrl, launchChrome, createReporter, openSession, checkSessionClean,
  resolveShots, ensureShots, shooter, debug, audio, targetSizes, undersized,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const shots = resolveShots('qa-shots/tiny-reader-theater');
const shot = shooter(shots);
const { check, head, finish } = createReporter();

const GAME_URL = `${base}/games/tiny-reader-theater/`;
const CAST_IDS = ['bear', 'doggy', 'fox', 'frog', 'rabbit', 'unicorn', 'princess-lily', 'princess-zoe'];
const FAST = 0.05; // matches the game's own default fastTimers() scale — a boolean `true` does NOT speed it up

// The platform's one deliberate remote-call exception (CLAUDE.md): every game
// links shared/js/analytics.js, a GA4 pageview tag. It shows up both as a
// "remote" request (openSession's own origin check) and, because the browser
// context often closes mid-flight, as an aborted "failed" request. Neither is
// a game bug — see games/button-zipper-lab/tools/qa.mjs for the same pattern.
const PLATFORM_ANALYTICS = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];
const isPlatformAnalytics = (url) => PLATFORM_ANALYTICS.some((prefix) => url.startsWith(prefix));

/**
 * checkSessionClean(), but blind to the platform analytics tag and to
 * page-local blob: object URLs (PixiJS texture decoding creates these; they
 * never leave the page, so they are not a "remote request" in any meaningful
 * sense — the shared lib's remote/failed capture only special-cases data:).
 */
function checkClean(session, label) {
  const remote = session.remote.filter((url) => !isPlatformAnalytics(url) && !url.startsWith('blob:'));
  const failed = session.failed.filter((entry) => !isPlatformAnalytics(entry) && !/(^|\s)blob:/.test(entry));
  checkSessionClean({ check }, { ...session, remote, failed }, label);
}

/** Re-run the QLOBE_DEBUG handshake after a full page navigation (reload). */
async function primePage(page) {
  await debug.waitForReady(page);
  await debug.mute(page, true);
  await debug.fastTimers(page, FAST);
}

/**
 * Tap every remaining word of the CURRENT line, then wait until the game moves
 * on (next line renders, or the node finishes into Choice/Complete). Used for
 * lines we are fast-forwarding through rather than screenshotting mid-tap.
 */
async function finishCurrentLine(page, { timeout = 15000 } = {}) {
  const before = await debug.getState(page);
  await debug.call(page, 'tapAllWords');
  await page.waitForFunction(([node, line]) => {
    const s = window.QLOBE_DEBUG.getState();
    return s.screen !== 'read' || s.nodeId !== node || s.lineIndex !== line;
  }, [before.nodeId, before.lineIndex], { timeout });
  return debug.getState(page);
}

/** Read every remaining line of the current Read node until Choice/Complete. */
async function readOutNode(page, { guard = 8 } = {}) {
  let state = await debug.getState(page);
  let steps = 0;
  while (state.screen === 'read' && steps < guard) {
    state = await finishCurrentLine(page);
    steps += 1;
  }
  return state;
}

async function readEndingsText(page) {
  return page.$eval('#trt-endings-count', (el) => el.textContent).catch(() => '');
}

// ─────────────────────────────────────────────────────────────── Setup / boot ──

async function driveSetupAndLocked(browser) {
  head('Setup boots');
  // Deliberately NOT fastTimers here yet: the very first Read line (below) is
  // driven at the game's normal pace so there is a real wall-clock window to
  // catch the "performing" (sparkle + puppet beat) state in a screenshot.
  // voice.say() resolves INSTANTLY while muted (see voice-clips.js `if (muted)
  // return Promise.resolve()`), so under fastTimers the whole tap->perform->
  // advance cycle can complete in under one Node<->browser round trip. Once
  // that one demonstration line is captured, driveFirstReadLine() switches on
  // fastTimers for the rest of the drive.
  const session = await openSession(browser, {
    url: GAME_URL, base,
    viewport: { width: 1180, height: 820 },
    reducedMotion: 'no-preference',
    seed: 42, mute: true,
  });
  const { page } = session;

  const state0 = await debug.getState(page);
  check('boots on Setup', state0.screen === 'setup', JSON.stringify(state0));

  const modes = await debug.listModes(page);
  check('listModes returns all three settings (forest, castle, outer-space)', JSON.stringify(modes) === JSON.stringify(['forest', 'castle', 'outer-space']), JSON.stringify(modes));

  const targets = await debug.getTargets(page);
  const byId = (id) => targets.find((t) => t.id === id);
  check('world-forest target present and unlocked role', byId('world-forest')?.role === 'world', JSON.stringify(byId('world-forest')));
  check('world-castle target present and unlocked role', byId('world-castle')?.role === 'world', JSON.stringify(byId('world-castle')));
  check('world-outer-space target present and unlocked role', byId('world-outer-space')?.role === 'world', JSON.stringify(byId('world-outer-space')));

  const castTargets = targets.filter((t) => t.id.startsWith('cast-'));
  check('8 puppet portraits present', castTargets.length === 8, JSON.stringify(castTargets.map((t) => t.id)));
  const missingCast = CAST_IDS.filter((id) => !castTargets.some((t) => t.id === `cast-${id}`));
  check('all 8 expected cast ids present', missingCast.length === 0, JSON.stringify(missingCast));

  const badgeCount = await page.$$eval('.trt-lock-badge', (els) => els.length);
  check('no "Coming soon" badges remain — all three worlds are shipped', badgeCount === 0, String(badgeCount));

  const setupSizes = await targetSizes(page);
  check('Setup targets meet 96px minimum', undersized(setupSizes).length === 0, JSON.stringify(undersized(setupSizes)));

  await shot(page, '01-setup-landscape');

  head('All worlds pickable (no locked worlds remain)');
  // Outer Space unlocked this pass — there is no locked world left to probe,
  // so the old "locked world tap" check (recipe step 6.4) is replaced with a
  // check that every world is genuinely pickable via QLOBE_DEBUG.tap.
  for (const id of ['world-forest', 'world-castle', 'world-outer-space']) {
    const tapResult = await debug.tap(page, id);
    check(`QLOBE_DEBUG.tap('${id}') accepted`, tapResult === true, String(tapResult));
    const after = await debug.getState(page);
    check(`tapping '${id}' selects it on Setup without navigating away`,
      after.screen === 'setup' && after.setting === id.slice('world-'.length),
      JSON.stringify(after));
  }
  // Leave Setup on forest for the rest of this drive.
  await debug.tap(page, 'world-forest');

  const validation = await debug.call(page, 'validateTree');
  check('all three story trees (forest + castle + outer-space) have no structural problems', Array.isArray(validation) && validation.length === 0, JSON.stringify(validation));

  head('Physical pointer routing');
  await page.click('[data-target="cast-bear"]');
  await page.click('[data-target="cast-fox"]');
  const afterRealCastTaps = await debug.getState(page);
  check('real DOM clicks select Bear then Fox',
    JSON.stringify(afterRealCastTaps.cast) === JSON.stringify(['bear', 'fox']),
    JSON.stringify(afterRealCastTaps));
  const orderBadges = await page.$$eval('.trt-cast-order:not([hidden])', (els) => els.map((el) => el.textContent));
  check('selection-order badges show 1 then 2', JSON.stringify(orderBadges) === JSON.stringify(['1', '2']), JSON.stringify(orderBadges));

  await page.$eval('[data-target="cast-frog"]', (el) => {
    const rect = el.getBoundingClientRect();
    const init = { bubbles: true, pointerId: 77, isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', {
      ...init, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
    }));
    // Deliver move/up back to the original element, as touch implicit pointer
    // capture does even though the release coordinates are outside its bounds.
    el.dispatchEvent(new PointerEvent('pointermove', {
      ...init, clientX: rect.right + 40, clientY: rect.bottom + 40,
    }));
    el.dispatchEvent(new PointerEvent('pointerup', {
      ...init, clientX: rect.right + 40, clientY: rect.bottom + 40,
    }));
    el.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true, detail: 1,
    }));
  });
  const afterDragOff = await debug.getState(page);
  check('press-drag-off-release does not select a cast card',
    JSON.stringify(afterDragOff.cast) === JSON.stringify(['bear', 'fox']),
    JSON.stringify(afterDragOff));

  await page.click('#trt-start');
  await page.$eval('[data-target="cast-rabbit"]', (el) => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 91, isPrimary: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 91, isPrimary: true }));
  });
  const duringMount = await debug.getState(page);
  check('cast cannot change while Start is mounting the stage',
    JSON.stringify(duringMount.cast) === JSON.stringify(['bear', 'fox']),
    JSON.stringify(duringMount));
  await debug.waitForScreen(page, 'read', { timeout: 12000 });
  const afterPhysicalStart = await debug.getState(page);
  check('real Start activation reaches Read with the same cast',
    afterPhysicalStart.screen === 'read'
      && JSON.stringify(afterPhysicalStart.cast) === JSON.stringify(['bear', 'fox']),
    JSON.stringify(afterPhysicalStart));
  // The stage dress (beginNode) is async and deliberately overlaps the Read
  // screen — poll briefly instead of asserting the instant the screen lands.
  let propState = afterPhysicalStart;
  for (let i = 0; i < 20 && !(propState.stageProps || []).includes('map'); i += 1) {
    await new Promise((r) => setTimeout(r, 150));
    propState = await debug.getState(page);
  }
  check('Beginning scene map prop loaded from the layered WebP',
    Array.isArray(propState.stageProps) && propState.stageProps.includes('map'),
    JSON.stringify(propState.stageProps));

  return session;
}

// ─────────────────────────────────────────────────────────────────── Read ──

async function driveFirstReadLine(page) {
  head('Deterministic forest start (bear + fox)');
  const started = await debug.call(page, 'startMode', 'forest', { cast: ['bear', 'fox'] });
  check('startMode(forest, [bear,fox]) accepted', started && started.ok === true, JSON.stringify(started));

  await debug.waitForScreen(page, 'read', { timeout: 10000 });
  const s1 = await debug.getState(page);
  check('landed on Read', s1.screen === 'read', JSON.stringify(s1));
  check('setting is forest', s1.setting === 'forest', String(s1.setting));
  check('cast is exactly [bear, fox]', JSON.stringify(s1.cast) === JSON.stringify(['bear', 'fox']), JSON.stringify(s1.cast));
  check('starts at the beginning node, line 0', s1.nodeId === 'beginning' && s1.lineIndex === 0, JSON.stringify(s1));
  check('first line NOT all tapped yet', s1.tappedWords.length === 0 && s1.wordsRemaining === s1.words.length && s1.words.length > 0, JSON.stringify(s1));
  check('line not yet complete', s1.lineComplete === false, JSON.stringify(s1));

  const readSizes = await targetSizes(page);
  check('Read word-chip targets meet 96px minimum', undersized(readSizes).length === 0, JSON.stringify(undersized(readSizes)));

  // Tap every word but the last one — a genuine mid-tap state.
  const wordCount = s1.words.length;
  for (let i = 0; i < wordCount - 1; i += 1) {
    const tapped = await debug.call(page, 'tapWord', i);
    check(`tapWord(${i}) accepted`, tapped === true, String(tapped));
  }
  const mid = await debug.getState(page);
  check('mid-tap: some words tapped, at least one not', mid.tappedWords.length === wordCount - 1 && mid.wordsRemaining === 1, JSON.stringify(mid));
  const midAudio = await debug.getAudioLog(page);
  check("word 'an' uses its recorded clip", audio.heardClip(midAudio, 'word:an'), audio.describe(midAudio));
  await shot(page, '02-read-mid-tap-landscape');

  // Tap the final word: line should complete and the narrator+puppet beat should
  // play line:beginning:0 as a real recorded clip. (No clearAudioLog hook is
  // wired on this game's QLOBE_DEBUG — see the driver header note — so we
  // check for the entry's presence in the growing log instead of isolating it.)
  const tappedLast = await debug.call(page, 'tapWord', wordCount - 1);
  check(`tapWord(${wordCount - 1}) (final word) accepted`, tappedLast === true, String(tappedLast));

  await page.waitForFunction(
    () => document.getElementById('trt-line')?.dataset.performing === 'true',
    null, { timeout: 5000 },
  ).catch(() => {});
  await shot(page, '03-read-line-complete-sparkle-landscape');
  const afterLast = await debug.getState(page);
  check('line completes (sparkle state) once every word is tapped', afterLast.lineComplete === true, JSON.stringify(afterLast));

  await debug.waitForAudio(page, 'line:forest:beginning:0', { timeout: 12000 });
  const perfLog = await debug.getAudioLog(page);
  check("narrator line 'line:forest:beginning:0' heard as a real clip (not speech fallback)", audio.heardClip(perfLog, 'line:forest:beginning:0'), audio.describe(perfLog));

  // The one demonstration line is captured — switch on fastTimers for the rest
  // of the drive (remaining lines, other nodes, endings, replay, ...).
  await debug.fastTimers(page, FAST);

  // Let the rest of the Beginning node's lines play out (fast-forwarded).
  const afterNode = await readOutNode(page);
  check('Beginning node finishes into Choice (3 lines)', afterNode.screen === 'choice', JSON.stringify(afterNode));
  const beginningAudio = await debug.getAudioLog(page);
  check("word 'round' uses its recorded clip", audio.heardClip(beginningAudio, 'word:round'), audio.describe(beginningAudio));
  return afterNode;
}

// ───────────────────────────────────────────────────────────────── Choice ──

async function driveChoice(page, expectedNodeId, expectedChoiceIds, { screenshot = null } = {}) {
  const state = await debug.getState(page);
  check(`Choice screen shows ${expectedNodeId}'s three choices`, state.screen === 'choice' && JSON.stringify(state.choices.slice().sort()) === JSON.stringify(expectedChoiceIds.slice().sort()), JSON.stringify(state));

  await debug.waitForAudio(page, 'ui:choicePrompt', { timeout: 8000 }).catch(() => {});
  const promptLog = await debug.getAudioLog(page);
  check("'what happens next?' heard as a real clip", audio.heardClip(promptLog, 'ui:choicePrompt'), audio.describe(promptLog));

  const choiceSizes = await targetSizes(page);
  check('Choice card targets meet 96px minimum', undersized(choiceSizes).length === 0, JSON.stringify(undersized(choiceSizes)));

  if (screenshot) await shot(page, screenshot);
}

async function pickChoiceAndAdvance(page, choiceId, expectedNextNode) {
  const result = await debug.call(page, 'chooseNext', choiceId);
  check(`chooseNext('${choiceId}') accepted`, result === true, String(result));
  await debug.waitForScreen(page, 'read', { timeout: 8000 });
  const after = await debug.getState(page);
  check(`advanced into ${expectedNextNode}`, after.nodeId === expectedNextNode, JSON.stringify(after));
  return after;
}

// ──────────────────────────────────────────────────────────────── Complete ──

async function driveComplete(page, { expectEndingId, expectFoundCount, expectTotal = 9, expectIsNew }) {
  await debug.waitForScreen(page, 'complete', { timeout: 8000 });
  const state = await debug.getState(page);
  check('landed on Complete', state.screen === 'complete', JSON.stringify(state));
  check(`ending is ${expectEndingId}`, state.nodeId === expectEndingId, JSON.stringify(state));
  check(`endingsFound has ${expectFoundCount} entries`, state.endingsFound.length === expectFoundCount, JSON.stringify(state.endingsFound));
  check(`endingsTotal is ${expectTotal}`, state.endingsTotal === expectTotal, String(state.endingsTotal));

  const summaryText = await page.$eval('#trt-summary', (el) => el.textContent).catch(() => null);
  check('summary text is present and non-empty', typeof summaryText === 'string' && summaryText.trim().length > 0, String(summaryText));

  const isNewAttr = await page.$eval('#trt-summary', (el) => el.dataset.new).catch(() => null);
  if (expectIsNew !== undefined) {
    check(`summary dataset.new is "${expectIsNew}"`, isNewAttr === String(expectIsNew), String(isNewAttr));
  }

  const trackerText = await readEndingsText(page);
  check(`endings tracker text reads "${expectFoundCount} of ${expectTotal} found"`, trackerText.includes(`${expectFoundCount} of ${expectTotal} found`), trackerText);

  const completeSizes = await targetSizes(page);
  check('Complete action targets meet 96px minimum', undersized(completeSizes).length === 0, JSON.stringify(undersized(completeSizes)));

  return state;
}

// ─────────────────────────────────────────────────────────────────── Main ──

async function driveLandscape(browser) {
  const session = await driveSetupAndLocked(browser);
  const { page } = session;

  head('First playthrough: Beginning -> map -> middle-1 -> dig-log -> ending-1-1');
  await driveFirstReadLine(page);
  await driveChoice(page, 'beginning', ['map', 'bird', 'door'], { screenshot: '03b-choice-beginning-landscape' });
  await pickChoiceAndAdvance(page, 'map', 'middle-1');
  const afterMiddle1 = await readOutNode(page);
  check('middle-1 finishes into Choice', afterMiddle1.screen === 'choice', JSON.stringify(afterMiddle1));
  await driveChoice(page, 'middle-1', ['dig-log', 'hop-mud', 'climb-tree']);
  await pickChoiceAndAdvance(page, 'dig-log', 'ending-1-1');
  await readOutNode(page);
  await driveComplete(page, { expectEndingId: 'ending-1-1', expectFoundCount: 1, expectIsNew: true });
  await shot(page, '04-complete-landscape');

  head('Reload persistence check');
  await page.reload({ waitUntil: 'networkidle' });
  await primePage(page);
  const bootedAfterReload = await debug.getState(page);
  check('post-reload boots on Setup', bootedAfterReload.screen === 'setup', JSON.stringify(bootedAfterReload));
  const storedRaw = await page.evaluate(() => localStorage.getItem('qk:tiny-reader-theater:forest:endings'));
  let stored = [];
  try { stored = JSON.parse(storedRaw || '[]'); } catch { /* leave empty */ }
  check('localStorage persisted exactly ["ending-1-1"]', Array.isArray(stored) && stored.length === 1 && stored[0] === 'ending-1-1', String(storedRaw));

  const restarted = await debug.call(page, 'startMode', 'forest', { cast: ['bear', 'fox'] });
  check('startMode again after reload', restarted && restarted.ok === true, JSON.stringify(restarted));
  await debug.waitForScreen(page, 'read', { timeout: 10000 });
  const endingsAfterReload = await debug.call(page, 'endingsFound');
  check('endingsFound() persisted across reload', Array.isArray(endingsAfterReload) && endingsAfterReload.length === 1 && endingsAfterReload[0] === 'ending-1-1', JSON.stringify(endingsAfterReload));

  head('Second, fully different path: Beginning -> bird -> middle-2 -> sing-bird -> ending-2-2');
  await readOutNode(page); // finish the fresh Beginning read
  await driveChoice(page, 'beginning', ['map', 'bird', 'door']);
  await pickChoiceAndAdvance(page, 'bird', 'middle-2');
  await readOutNode(page);
  await driveChoice(page, 'middle-2', ['make-nest', 'sing-bird', 'share-nut']);
  await pickChoiceAndAdvance(page, 'sing-bird', 'ending-2-2');
  await readOutNode(page);
  await driveComplete(page, { expectEndingId: 'ending-2-2', expectFoundCount: 2, expectIsNew: true });
  await shot(page, '05-complete-second-ending-landscape');

  head('Replay: repeats the same second path — ending must NOT double-count');
  const replayTapped = await debug.tap(page, 'replay');
  check('Replay tap accepted', replayTapped === true, String(replayTapped));
  await debug.waitForAudio(page, 'ui:replay', { timeout: 8000 }).catch(() => {});
  await debug.waitForScreen(page, 'read', { timeout: 8000 });
  const afterReplay = await debug.getState(page);
  check('Replay lands back in a playable Read state at the beginning', afterReplay.screen === 'read' && afterReplay.nodeId === 'beginning' && afterReplay.lineIndex === 0, JSON.stringify(afterReplay));

  await readOutNode(page);
  await driveChoice(page, 'beginning', ['map', 'bird', 'door']);
  await pickChoiceAndAdvance(page, 'bird', 'middle-2');
  await readOutNode(page);
  await driveChoice(page, 'middle-2', ['make-nest', 'sing-bird', 'share-nut']);
  await pickChoiceAndAdvance(page, 'sing-bird', 'ending-2-2');
  await readOutNode(page);
  await driveComplete(page, { expectEndingId: 'ending-2-2', expectFoundCount: 2, expectIsNew: false });

  head('"Choose a new path" lands back in a playable Setup');
  const newPathTapped = await debug.tap(page, 'new-path');
  check('"Choose a new path" tap accepted', newPathTapped === true, String(newPathTapped));
  await debug.waitForAudio(page, 'ui:newPath', { timeout: 8000 }).catch(() => {});
  await debug.waitForScreen(page, 'setup', { timeout: 8000 });
  const backAtSetup = await debug.getState(page);
  check('back on Setup with world + cast preserved', backAtSetup.screen === 'setup' && backAtSetup.setting === 'forest' && JSON.stringify(backAtSetup.cast) === JSON.stringify(['bear', 'fox']), JSON.stringify(backAtSetup));
  const startReady = await page.$eval('#trt-start', (el) => el.dataset.ready).catch(() => null);
  check('Start button is ready (playable) at the new Setup', startReady === 'true', String(startReady));
  await shot(page, '06-setup-after-new-path-landscape');

  const startTapped = await debug.tap(page, 'start');
  check('Start tap from the restored Setup is accepted', startTapped === true, String(startTapped));
  await debug.waitForScreen(page, 'read', { timeout: 10000 });
  const playableAgain = await debug.getState(page);
  check('Starting again lands in a genuinely playable Read screen', playableAgain.screen === 'read' && playableAgain.nodeId === 'beginning', JSON.stringify(playableAgain));

  checkClean(session, 'landscape session');
  await session.close();
}

async function drivePortrait(browser) {
  head('Portrait pass');
  const session = await openSession(browser, {
    url: GAME_URL, base,
    viewport: { width: 820, height: 1180 },
    reducedMotion: 'no-preference',
    seed: 42, fastTimers: FAST, mute: true,
  });
  const { page } = session;
  const state = await debug.getState(page);
  check('portrait: boots on Setup', state.screen === 'setup', JSON.stringify(state));
  const targets = await debug.getTargets(page);
  check('portrait: 8 cast portraits present', targets.filter((t) => t.id.startsWith('cast-')).length === 8, String(targets.filter((t) => t.id.startsWith('cast-')).length));
  const sizes = await targetSizes(page);
  check('portrait: Setup targets meet 96px minimum', undersized(sizes).length === 0, JSON.stringify(undersized(sizes)));
  await shot(page, '07-setup-portrait');

  checkClean(session, 'portrait session');
  await session.close();
}

// ─────────────────────────────────────────────────────────────────── Castle ──

/**
 * Castle setting smoke: one full path (Beginning -> crown -> middle-1 ->
 * throne -> ending-1-1), a real recorded clip for a new castle word AND a
 * new castle line key, and an endings tracker read of "1 of 9 found".
 * Mirrors the forest drive's helpers rather than re-implementing them.
 */
async function driveCastle(browser) {
  head('Castle: full path — beginning -> crown -> middle-1 -> throne -> ending-1-1');
  const session = await openSession(browser, {
    url: GAME_URL, base,
    viewport: { width: 1180, height: 820 },
    reducedMotion: 'no-preference',
    seed: 42, fastTimers: FAST, mute: true,
  });
  const { page } = session;

  const started = await debug.call(page, 'startMode', 'castle', { cast: ['bear', 'fox'] });
  check('startMode(castle, [bear,fox]) accepted', started && started.ok === true, JSON.stringify(started));
  await debug.waitForScreen(page, 'read', { timeout: 10000 });
  const s1 = await debug.getState(page);
  check('castle: landed on Read at beginning:0',
    s1.screen === 'read' && s1.setting === 'castle' && s1.nodeId === 'beginning' && s1.lineIndex === 0,
    JSON.stringify(s1));

  // Line 0 is "The two friends see a big castle." — tap it out and confirm
  // BOTH a new castle word clip and the castle line clip played for real.
  await finishCurrentLine(page);
  const line0Log = await debug.getAudioLog(page);
  check("castle word 'castle' uses its recorded clip", audio.heardClip(line0Log, 'word:castle'), audio.describe(line0Log));
  check("castle narrator line 'line:castle:beginning:0' heard as a real clip", audio.heardClip(line0Log, 'line:castle:beginning:0'), audio.describe(line0Log));

  const afterBeginning = await readOutNode(page);
  check('castle Beginning finishes into Choice (3 lines)', afterBeginning.screen === 'choice', JSON.stringify(afterBeginning));
  await driveChoice(page, 'beginning', ['crown', 'dragon', 'ball'], { screenshot: '09-castle-choice-beginning-landscape' });
  await pickChoiceAndAdvance(page, 'crown', 'middle-1');

  const afterMiddle1 = await readOutNode(page);
  check('castle middle-1 finishes into Choice (3 lines)', afterMiddle1.screen === 'choice', JSON.stringify(afterMiddle1));
  await driveChoice(page, 'middle-1', ['throne', 'tower', 'mouse']);
  await pickChoiceAndAdvance(page, 'throne', 'ending-1-1');

  await readOutNode(page);
  await driveComplete(page, { expectEndingId: 'ending-1-1', expectFoundCount: 1, expectIsNew: true });
  await shot(page, '10-castle-complete-landscape');

  checkClean(session, 'castle session');
  await session.close();
}

// ────────────────────────────────────────────────────────────── Outer Space ──

/**
 * Outer Space setting smoke: one full path (Beginning -> bounce -> middle-1 ->
 * crater -> ending-1-1), a real recorded clip for a new space word AND a new
 * space line key, and an endings tracker read of "1 of 9 found". Mirrors the
 * forest/castle drive helpers rather than re-implementing them.
 */
async function driveOuterSpace(browser) {
  head('Outer Space: full path — beginning -> bounce -> middle-1 -> crater -> ending-1-1');
  const session = await openSession(browser, {
    url: GAME_URL, base,
    viewport: { width: 1180, height: 820 },
    reducedMotion: 'no-preference',
    seed: 42, fastTimers: FAST, mute: true,
  });
  const { page } = session;

  const started = await debug.call(page, 'startMode', 'outer-space', { cast: ['bear', 'fox'] });
  check('startMode(outer-space, [bear,fox]) accepted', started && started.ok === true, JSON.stringify(started));
  await debug.waitForScreen(page, 'read', { timeout: 10000 });
  const s1 = await debug.getState(page);
  check('outer-space: landed on Read at beginning:0',
    s1.screen === 'read' && s1.setting === 'outer-space' && s1.nodeId === 'beginning' && s1.lineIndex === 0,
    JSON.stringify(s1));

  // Line 0 is "Three, two, one... Blast off!" — tap it out and confirm BOTH a
  // new space word clip and the space line clip played for real.
  await finishCurrentLine(page);
  const line0Log = await debug.getAudioLog(page);
  check("space word 'blast' uses its recorded clip", audio.heardClip(line0Log, 'word:blast'), audio.describe(line0Log));
  check("space narrator line 'line:outer-space:beginning:0' heard as a real clip", audio.heardClip(line0Log, 'line:outer-space:beginning:0'), audio.describe(line0Log));

  const afterBeginning = await readOutNode(page);
  check('outer-space Beginning finishes into Choice (3 lines)', afterBeginning.screen === 'choice', JSON.stringify(afterBeginning));
  await driveChoice(page, 'beginning', ['bounce', 'star', 'visit'], { screenshot: '11-space-choice-beginning-landscape' });
  await pickChoiceAndAdvance(page, 'bounce', 'middle-1');

  const afterMiddle1 = await readOutNode(page);
  check('outer-space middle-1 finishes into Choice (3 lines)', afterMiddle1.screen === 'choice', JSON.stringify(afterMiddle1));
  await driveChoice(page, 'middle-1', ['crater', 'flag', 'jump']);
  await pickChoiceAndAdvance(page, 'crater', 'ending-1-1');

  await readOutNode(page);
  await driveComplete(page, { expectEndingId: 'ending-1-1', expectFoundCount: 1, expectIsNew: true });
  await shot(page, '12-space-complete-landscape');

  checkClean(session, 'outer-space session');
  await session.close();
}

async function driveReducedMotion(browser) {
  head('Reduced-motion pass');
  const session = await openSession(browser, {
    url: GAME_URL, base,
    viewport: { width: 1180, height: 820 },
    reducedMotion: 'reduce',
    seed: 42, fastTimers: FAST, mute: true,
  });
  const { page } = session;

  const started = await debug.call(page, 'startMode', 'forest', { cast: ['bear', 'fox'] });
  check('reduced-motion: startMode accepted', started && started.ok === true, JSON.stringify(started));
  await debug.waitForScreen(page, 'read', { timeout: 10000 });
  const s1 = await debug.getState(page);
  check('reduced-motion: lands on Read at beginning:0', s1.screen === 'read' && s1.nodeId === 'beginning' && s1.lineIndex === 0, JSON.stringify(s1));

  // Tap a couple of words but not all, for a genuine mid-tap reduced-motion shot.
  const toTap = Math.max(1, Math.min(2, s1.words.length - 1));
  for (let i = 0; i < toTap; i += 1) await debug.call(page, 'tapWord', i);
  const mid = await debug.getState(page);
  check('reduced-motion: mid-tap state (some tapped, some not)', mid.tappedWords.length === toTap && mid.wordsRemaining > 0, JSON.stringify(mid));
  await shot(page, '08-read-reduced-motion');

  checkClean(session, 'reduced-motion session');
  await session.close();
}

async function main() {
  await ensureShots(shots);
  // Software compositing keeps the visual suite deterministic on shared Macs
  // where another long-running image job may occupy the GPU process.
  const browser = await launchChrome({ channel: 'chrome', args: ['--mute-audio', '--disable-gpu'] });
  try {
    await driveLandscape(browser);
    await driveCastle(browser);
    await driveOuterSpace(browser);
    await drivePortrait(browser);
    await driveReducedMotion(browser);
  } finally {
    await browser.close();
    finish({ suffix: `; shots in ${shots}` });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
