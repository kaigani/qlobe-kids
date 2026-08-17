#!/usr/bin/env node
// Real-Chrome smoke, interaction, and visual-QC capture for Name Puzzle.
//
//   python3 -m http.server 8000
//   node games/name-puzzle/tools/qa.mjs [--base http://127.0.0.1:8000]

import {
  baseUrl, launchChrome, createReporter, openSession, checkSessionClean,
  resolveShots, ensureShots, shooter, debug, dragBetween,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const shots = resolveShots('qa-shots/name-puzzle');
const shot = shooter(shots);
const reporter = createReporter();
const { check, finish } = reporter;
const sessions = [];
const PLATFORM_ANALYTICS = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
];

async function openGame(browser, viewport, reducedMotion = 'no-preference', mute = true) {
  const session = await openSession(browser, {
    url: `${base}/games/name-puzzle/`,
    base,
    viewport,
    reducedMotion,
    seed: 42,
    fastTimers: 0.1,
    mute,
    allowAbortedMedia: true,
    allowRemote: PLATFORM_ANALYTICS,
  });
  sessions.push(session);
  return session;
}

async function targetSizes(page, selector) {
  return page.locator(selector).evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { id: node.dataset.target || node.dataset.hud, w: rect.width, h: rect.height };
  }));
}

async function noViewportOverflow(page) {
  return page.evaluate(() => ({
    x: document.documentElement.scrollWidth - innerWidth,
    y: document.documentElement.scrollHeight - innerHeight,
  }));
}

async function nextPieceTarget(page) {
  return page.evaluate(() => {
    const state = window.QLOBE_DEBUG.getState();
    const index = state.placed.findIndex((value) => value === null);
    if (index < 0) return null;
    const letter = state.name[index];
    const button = [...document.querySelectorAll('.np-letter-piece:not(.is-used)')]
      .find((node) => node.textContent.trim() === letter);
    return button?.dataset.target || null;
  });
}

async function pieceTargetForLetter(page, letter) {
  return page.evaluate((expected) => {
    const piece = window.QLOBE_DEBUG.getState().pieces
      .find((item) => !item.used && item.letter === expected);
    return piece ? `letter-${piece.id}` : null;
  }, letter);
}

async function waitForSettledReveal(page) {
  await page.locator('.np-reveal-character, .np-medal, .np-reveal-copy').evaluateAll(async (nodes) => {
    const animations = nodes.flatMap((node) => node.getAnimations());
    await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
  });
  await page.waitForFunction(() => {
    const character = document.querySelector('.np-reveal-character');
    const medal = document.querySelector('.np-medal');
    return character?.complete && character.naturalWidth > 0
      && Number.parseFloat(getComputedStyle(character).opacity) >= 0.99
      && Number.parseFloat(getComputedStyle(medal).opacity) >= 0.99;
  });
}

async function openMissingArtGame(browser, characterId, missingAudioId = 'ezra') {
  const session = await openSession(browser, {
    url: `${base}/games/name-puzzle/`,
    base,
    viewport: { width: 1180, height: 820 },
    goto: false,
    ready: false,
    allowAbortedMedia: true,
    allowRemote: PLATFORM_ANALYTICS,
  });
  sessions.push(session);
  await session.page.route(`**/characters/${characterId}.webp`, (route) => route.fulfill({
    status: 200,
    contentType: 'image/webp',
    body: 'intentionally invalid image bytes',
  }));
  await session.page.route('**/assets/audio/manifest.json', async (route) => {
    const response = await route.fetch();
    const manifest = await response.json();
    delete manifest[`reveal-${missingAudioId}`];
    await route.fulfill({ response, json: manifest });
  });
  await session.page.goto(`${base}/games/name-puzzle/`, { waitUntil: 'networkidle' });
  await debug.waitForReady(session.page);
  await debug.seed(session.page, 42);
  await debug.fastTimers(session.page, 0.1);
  await debug.mute(session.page, true);
  return session;
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome({ channel: 'chrome' });

  const landscape = await openGame(browser, { width: 1180, height: 820 });
  const page = landscape.page;
  const modes = await debug.listModes(page);
  check('twenty selectable names are registered', modes.length === 20, String(modes.length));
  check('BELLE is present', modes.some(({ id, title }) => id === 'belle' && title === 'Belle'));
  const roster = await debug.call(page, 'listNames');
  check('name-specific debug extensions are published', await page.evaluate(() => [
    'listNames', 'selectName', 'place', 'triggerNudge', 'clearAudioLog',
    'getPlaybackLog', 'clearPlaybackLog',
  ].every((key) => typeof window.QLOBE_DEBUG[key] === 'function')));
  check('all twenty names and reveal friends are unique', new Set(roster.map(({ id }) => id)).size === 20
    && new Set(roster.map(({ letters }) => letters)).size === 20
    && new Set(roster.map(({ friend }) => friend)).size === 20, JSON.stringify(roster));
  check('all configured names have four or five letters', await page.evaluate(async () => {
    const data = await fetch('./config.json').then((response) => response.json());
    return data.names.every(({ letters }) => /^[A-Z]{4,5}$/.test(letters));
  }));
  check('all shipped narration is Qwen teacher narration, never system speech', await page.evaluate(async () => {
    const receipts = await fetch('./assets/audio/qa.json').then((response) => response.json());
    const entries = Object.values(receipts);
    return entries.length === 45 && entries.every((entry) => entry.valid === true
      && entry.engine === 'qwen3-tts-voiceclone'
      && entry.voice === 'platform-teacher-narrator'
      && typeof entry.referenceSha256 === 'string'
      && /^[0-9a-f]{64}$/.test(entry.referenceSha256));
  }));
  check('all transparent source art publishes Qwen layer_2 provenance', await page.evaluate(async () => {
    const [report, jobs, pending] = await Promise.all([
      fetch('./assets/source/qwen-layer-report.json').then((response) => response.json()),
      fetch('./assets/source/qwen-jobs.json').then((response) => response.json()),
      fetch('./assets/source/qwen-pending-jobs.json').then((response) => response.json()),
    ]);
    const entries = Object.entries(report);
    return entries.length === 33 && Object.keys(jobs).length === 33
      && Object.keys(pending).length === 0
      && entries.every(([key, entry]) => entry.workflow === 'qwen-image-layered'
      && entry.selectedOutput === 'layer_2'
      && /^[0-9a-f]{64}$/.test(entry.sourceSha256)
      && /^[0-9a-f]{64}$/.test(entry.rawLayerSha256)
      && /no flood fill/i.test(entry.matteAuthority)
      && entry.acceptedJobId === jobs[key]?.jobId
      && entry.seed === jobs[key]?.seed)
      && Object.values(jobs).every((entry) => /^[0-9a-f]{32}$/.test(entry.jobId)
        && Number.isInteger(entry.seed));
  }));
  check('picker shows five choices per page', await page.locator('.np-name-card').count() === 5);
  const cards = await targetSizes(page, '.np-name-card');
  check('picker cards meet the 96px target', cards.every(({ w, h }) => w >= 96 && h >= 96), JSON.stringify(cards));
  check('picker title and character art decode', await page.locator('.np-title, .np-name-card-character').evaluateAll(
    (images) => images.every((image) => image.complete && image.naturalWidth > 100),
  ));
  const pickerOverflow = await noViewportOverflow(page);
  check('landscape picker stays inside the viewport', pickerOverflow.x <= 1 && pickerOverflow.y <= 1, JSON.stringify(pickerOverflow));
  check('picker pager uses authored felt raster arrows', await page.locator('.np-page-button img').evaluateAll(
    (images) => images.length === 2 && images.every((image) => image.complete
      && image.naturalWidth > 50 && /pager-(?:prev|next)\.webp$/.test(image.src)),
  ));
  check('all twenty authored character files decode', await page.evaluate(async () => {
    const data = await fetch('./config.json').then((response) => response.json());
    const results = await Promise.all(data.names.map(({ id }) => new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image.naturalWidth >= 600 && image.naturalHeight >= 700);
      image.onerror = () => resolve(false);
      image.src = `./assets/characters/${id}.webp`;
    })));
    return results.every(Boolean);
  }));
  await shot(page, '01-picker-landscape');

  const pagedNames = [];
  for (let pageIndex = 0; pageIndex < 4; pageIndex += 1) {
    pagedNames.push(...await page.locator('.np-name-card').evaluateAll(
      (cards) => cards.map((card) => card.dataset.target),
    ));
    if (pageIndex > 0) await shot(page, `01-picker-page-${pageIndex + 1}`);
    if (pageIndex < 3) await page.locator('[data-target="next-page"]').click();
  }
  check('four picker pages expose all twenty names exactly once', pagedNames.length === 20
    && new Set(pagedNames).size === 20, JSON.stringify(pagedNames));
  for (let pageIndex = 3; pageIndex > 0; pageIndex -= 1) {
    await page.locator('[data-target="previous-page"]').click();
  }
  check('picker paging returns to names 1–5', (await page.locator('#page-label').textContent()).includes('1–5'));

  await debug.clearAudioLog(page);
  await page.locator('[data-target="name-belle"]').click();
  await debug.waitForScreen(page, 'build');
  check('BELLE opens a five-slot build', await page.locator('.np-slot').count() === 5);
  check('BELLE opens five draggable letter tiles', await page.locator('.np-letter-piece').count() === 5);
  const pieces = await targetSizes(page, '.np-letter-piece');
  check('landscape letter tiles meet the 96px target', pieces.every(({ w, h }) => w >= 96 && h >= 96), JSON.stringify(pieces));
  check('build prompt names BELLE', (await page.locator('#build-prompt').textContent()).trim() === 'Build BELLE');
  check('all empty BELLE slots show their matching clues', await page.locator('.np-slot-clue').allTextContents()
    .then((letters) => letters.join('') === 'BELLE'));
  const buildAudio = await debug.getAudioLog(page);
  check('build prompt selects its recorded clip', buildAudio.some(({ key, kind }) => key === 'build-belle' && kind === 'clip'), JSON.stringify(buildAudio));
  const buildHud = await page.locator('#screen-build [data-hud]').evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { kind: node.dataset.hud, x: rect.x, y: rect.y, w: rect.width, h: rect.height };
  }));
  check('build HUD stays in the two top corners', buildHud.length === 2
    && buildHud.every(({ y }) => y < 130)
    && buildHud.some(({ kind, x }) => kind === 'back' && x < 130)
    && buildHud.some(({ kind, x }) => kind === 'sound' && x > 1000), JSON.stringify(buildHud));
  check('build HUD uses local felt raster controls', await page.locator('#screen-build .qk-hud-btn').evaluateAll(
    (nodes) => nodes.length === 2 && nodes.every((node) => /hud-(?:back|sound)\.webp/.test(getComputedStyle(node).backgroundImage)),
  ));
  await shot(page, '02-belle-build');

  const beforeWrong = await debug.getState(page);
  const bPieceId = beforeWrong.pieces.find(({ letter }) => letter === 'B').id;
  check('debug placement rejects B in an E slot through the real attempt path', await debug.call(
    page, 'place', bPieceId, 1,
  ) === false && (await debug.getState(page)).placed.every((value) => value === null));
  const wrongTarget = await pieceTargetForLetter(page, 'B');
  const wrongSource = await page.locator(`[data-target="${wrongTarget}"]`).boundingBox();
  const wrongSlot = await page.locator('[data-slot="1"]').boundingBox();
  await dragBetween(page, wrongSource, wrongSlot, { steps: 12 });
  const afterWrong = await debug.getState(page);
  check('an incorrect real drop never sticks', afterWrong.placed.every((value) => value === null), JSON.stringify(afterWrong.placed));
  check('an incorrect real drop leaves every letter available', afterWrong.remaining.length === beforeWrong.remaining.length);

  await debug.clearAudioLog(page);
  check('first idle nudge repeats the build prompt', await debug.call(page, 'triggerNudge', 0) === true);
  check('second idle nudge highlights a matching tile without placing it', await debug.call(page, 'triggerNudge', 1) === true
    && await page.locator('.np-letter-piece.is-nudge').count() === 1
    && (await debug.getState(page)).placed.every((value) => value === null));
  const nudgeAudio = await debug.getAudioLog(page);
  check('nudge ladder uses recorded prompts', nudgeAudio.some(({ key, kind }) => key === 'build-belle' && kind === 'clip')
    && nudgeAudio.some(({ key, kind }) => key === 'nudge' && kind === 'clip'), JSON.stringify(nudgeAudio));

  const finalETarget = await pieceTargetForLetter(page, 'E');
  const finalESource = await page.locator(`[data-target="${finalETarget}"]`).boundingBox();
  const finalESlot = await page.locator('[data-slot="4"]').boundingBox();
  await dragBetween(page, finalESource, finalESlot, { steps: 12 });
  check('real pointer drag accepts an out-of-order final E', (await debug.getState(page)).placed[4] === 'E');

  const lTarget = await pieceTargetForLetter(page, 'L');
  await debug.tap(page, lTarget);
  check('tap still finds a valid repeated-letter slot after out-of-order drag', (await debug.getState(page)).placed[2] === 'L');

  const bTarget = await pieceTargetForLetter(page, 'B');
  const source = await page.locator(`[data-target="${bTarget}"]`).boundingBox();
  const slot = await page.locator('[data-slot="0"]').boundingBox();
  await dragBetween(page, source, slot, { steps: 12 });
  check('real pointer drag places the first B', (await debug.getState(page)).placed[0] === 'B');

  while ((await debug.getState(page)).screen === 'build') {
    const target = await nextPieceTarget(page);
    if (!target) break;
    await debug.tap(page, target);
    await page.waitForTimeout(30);
  }
  await debug.waitForScreen(page, 'reveal');
  const revealState = await debug.getState(page);
  check('repeated L and E tiles complete BELLE correctly', revealState.placed.join('') === 'BELLE', revealState.placed.join(''));
  check('Belle reveal line is exact', (await page.locator('#reveal-line').textContent()).trim() === 'Meet Belle the Rainbow Princess!');
  check('Belle reveal uses the authored rainbow princess', await page.locator('#reveal-character').evaluate(
    (image) => image.complete && image.naturalWidth >= 600 && image.src.endsWith('/characters/belle.webp'),
  ));
  const revealAudio = await debug.getAudioLog(page);
  check('Belle reveal selects its recorded clip', revealAudio.some(({ key, kind }) => key === 'reveal-belle' && kind === 'clip'), JSON.stringify(revealAudio));
  await waitForSettledReveal(page);
  await shot(page, '03-belle-reveal');

  await page.locator('[data-target="play-again"]').click();
  await debug.waitForScreen(page, 'build');
  check('Build Again resets every slot', (await debug.getState(page)).placed.every((value) => value === null));
  await page.locator('#screen-build:not([hidden]) [data-hud="back"]').click();
  await debug.waitForScreen(page, 'picker');
  check('deeper-screen Back returns in-page to the picker', (await debug.getState(page)).screen === 'picker');
  check('Home exists only on the picker', await page.locator('[data-hud="home"]').count() === 1
    && await page.locator('#screen-picker [data-hud="home"]').count() === 1);

  const portrait = await openGame(browser, { width: 600, height: 900 });
  await debug.startMode(portrait.page, 'sofia');
  await debug.waitForScreen(portrait.page, 'build');
  const portraitOverflow = await noViewportOverflow(portrait.page);
  check('portrait build stays inside the viewport', portraitOverflow.x <= 1 && portraitOverflow.y <= 1, JSON.stringify(portraitOverflow));
  check('portrait keeps all five Sofia slots visible', await portrait.page.locator('.np-slot').count() === 5);
  await shot(portrait.page, '04-sofia-build-portrait');
  await debug.winRound(portrait.page);
  await debug.waitForScreen(portrait.page, 'reveal');
  check('Sofia has her unique Swan reveal', (await portrait.page.locator('#reveal-line').textContent()).trim() === 'Meet Sofia the Swan!');
  await waitForSettledReveal(portrait.page);
  await shot(portrait.page, '05-sofia-reveal-portrait');

  const reduced = await openGame(browser, { width: 1180, height: 820 }, 'reduce');
  await debug.startMode(reduced.page, 'emma');
  await debug.winRound(reduced.page);
  await debug.waitForScreen(reduced.page, 'reveal');
  check('reduced-motion reveal remains complete and readable', await reduced.page.locator('#reveal-character').isVisible()
    && (await reduced.page.locator('#reveal-line').textContent()).includes('Emma'));
  await shot(reduced.page, '06-emma-reveal-reduced-motion');

  const playback = await openGame(browser, { width: 900, height: 700 }, 'no-preference', false);
  await debug.fastTimers(playback.page, 1);
  await debug.call(playback.page, 'clearPlaybackLog');
  await playback.page.locator('[data-target="name-belle"]').click();
  await debug.waitForScreen(playback.page, 'build');
  await playback.page.waitForFunction(() => window.QLOBE_DEBUG.getPlaybackLog().some(
    ({ key, event }) => key === 'build-belle' && event === 'ended',
  ));
  const buildPlayback = await debug.call(playback.page, 'getPlaybackLog');
  check('real unmuted Chrome decodes and finishes the build recording', buildPlayback.some(
    ({ key, event, src, readyState, duration }) => key === 'build-belle' && event === 'ended'
      && src.endsWith('/assets/audio/build-belle.m4a') && readyState >= 2 && duration > 0.6,
  ), JSON.stringify(buildPlayback));
  await debug.call(playback.page, 'clearPlaybackLog');
  await debug.winRound(playback.page);
  await debug.waitForScreen(playback.page, 'reveal');
  await playback.page.waitForFunction(() => window.QLOBE_DEBUG.getPlaybackLog().some(
    ({ key, event }) => key === 'reveal-belle' && event === 'ended',
  ));
  const revealPlayback = await debug.call(playback.page, 'getPlaybackLog');
  check('real unmuted Chrome decodes and finishes the reveal recording', revealPlayback.some(
    ({ key, event, src, readyState, duration }) => key === 'reveal-belle' && event === 'ended'
      && src.endsWith('/assets/audio/reveal-belle.m4a') && readyState >= 2 && duration > 0.6,
  ), JSON.stringify(revealPlayback));

  const narrow = await openGame(browser, { width: 390, height: 844 });
  await debug.startMode(narrow.page, 'liam');
  await debug.waitForScreen(narrow.page, 'build');
  const narrowTargets = await targetSizes(narrow.page, '.np-slot, .np-letter-piece');
  check('390px build keeps every slot and tile at least 96px', narrowTargets.length === 8
    && narrowTargets.every(({ w, h }) => w >= 96 && h >= 96), JSON.stringify(narrowTargets));
  const narrowOverflow = await noViewportOverflow(narrow.page);
  check('390×844 build stays inside the viewport', narrowOverflow.x <= 1 && narrowOverflow.y <= 1, JSON.stringify(narrowOverflow));
  const liftTarget = await pieceTargetForLetter(narrow.page, 'L');
  const liftBox = await narrow.page.locator(`[data-target="${liftTarget}"]`).boundingBox();
  await narrow.page.mouse.move(liftBox.x + liftBox.width / 2, liftBox.y + liftBox.height / 2);
  await narrow.page.mouse.down();
  await narrow.page.mouse.move(liftBox.x + liftBox.width / 2 + 24, liftBox.y + liftBox.height / 2 - 18);
  await narrow.page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', {
    pointerId: 1,
    pointerType: 'mouse',
    bubbles: true,
    cancelable: true,
  })));
  await narrow.page.mouse.up();
  check('pointercancel safely abandons a live drag', await narrow.page.locator('.np-letter-ghost').count() === 0
    && await narrow.page.locator('.np-letter-piece.is-lifting').count() === 0
    && (await debug.getState(narrow.page)).placed.every((value) => value === null));
  await narrow.page.mouse.move(liftBox.x + liftBox.width / 2, liftBox.y + liftBox.height / 2);
  await narrow.page.mouse.down();
  await narrow.page.mouse.move(liftBox.x + liftBox.width / 2 + 24, liftBox.y + liftBox.height / 2 - 18);
  await narrow.page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await narrow.page.mouse.up();
  check('window blur safely cancels a live drag', await narrow.page.locator('.np-letter-ghost').count() === 0
    && await narrow.page.locator('.np-letter-piece.is-lifting').count() === 0);
  await shot(narrow.page, '07-liam-build-narrow');
  await narrow.page.mouse.move(liftBox.x + liftBox.width / 2, liftBox.y + liftBox.height / 2);
  await narrow.page.mouse.down();
  await narrow.page.mouse.move(liftBox.x + liftBox.width / 2 + 24, liftBox.y + liftBox.height / 2 - 18);
  await narrow.page.setViewportSize({ width: 420, height: 820 });
  await narrow.page.mouse.up();
  const resizedOverflow = await noViewportOverflow(narrow.page);
  check('viewport resize cancels an airborne drag and reflows cleanly', resizedOverflow.x <= 1 && resizedOverflow.y <= 1
    && await narrow.page.locator('.np-slot').count() === 4
    && await narrow.page.locator('.np-letter-ghost').count() === 0
    && await narrow.page.locator('.np-letter-piece.is-lifting').count() === 0
    && (await debug.getState(narrow.page)).placed.every((value) => value === null), JSON.stringify(resizedOverflow));

  const compact = await openGame(browser, { width: 1180, height: 520 });
  await debug.startMode(compact.page, 'hazel');
  await debug.waitForScreen(compact.page, 'build');
  const compactTargets = await targetSizes(compact.page, '.np-slot, .np-letter-piece');
  check('1180×520 build keeps every slot and tile at least 96px', compactTargets.length === 10
    && compactTargets.every(({ w, h }) => w >= 96 && h >= 96), JSON.stringify(compactTargets));
  const compactOverflow = await noViewportOverflow(compact.page);
  check('1180×520 build stays inside the viewport', compactOverflow.x <= 1 && compactOverflow.y <= 1, JSON.stringify(compactOverflow));
  await shot(compact.page, '08-hazel-build-compact-landscape');

  const missingArt = await openMissingArtGame(browser, 'noah');
  await debug.call(missingArt.page, 'nextPage');
  await debug.call(missingArt.page, 'nextPage');
  await missingArt.page.waitForFunction(() => document.querySelector('[data-target="name-noah"] .np-name-card-character')?.src.endsWith('/assets/ui/star-medal.webp'));
  check('missing picker character art also uses the neutral felt medal', await missingArt.page.locator(
    '[data-target="name-noah"] .np-name-card-character.is-fallback',
  ).count() === 1);
  await debug.startMode(missingArt.page, 'noah');
  await debug.winRound(missingArt.page);
  await debug.waitForScreen(missingArt.page, 'reveal');
  check('missing character art falls back to the neutral felt medal', await missingArt.page.locator('#reveal-character').evaluate(
    (image) => image.complete && image.naturalWidth > 100 && image.src.endsWith('/assets/ui/star-medal.webp'),
  ));
  check('missing-art reward avoids promising the absent character', (await missingArt.page.locator('#reveal-line').textContent()).trim() === 'You built Noah!'
    && await missingArt.page.locator('.np-medal').isHidden());
  const fallbackArtAudio = await debug.getAudioLog(missingArt.page);
  check('missing-art reward uses its recorded generic celebration', fallbackArtAudio.some(
    ({ key, kind }) => key === 'celebrate' && kind === 'clip',
  ), JSON.stringify(fallbackArtAudio));
  await waitForSettledReveal(missingArt.page);
  await shot(missingArt.page, '09-missing-art-fallback');
  await debug.call(missingArt.page, 'home');
  await debug.clearAudioLog(missingArt.page);
  await debug.startMode(missingArt.page, 'ezra');
  await debug.winRound(missingArt.page);
  await debug.waitForScreen(missingArt.page, 'reveal');
  const fallbackAudio = await debug.getAudioLog(missingArt.page);
  check('missing reveal recording selects the speech fallback', fallbackAudio.some(
    ({ key, kind, text }) => key === 'reveal-ezra' && kind === 'speech' && text === 'Meet Ezra the Eagle!',
  ), JSON.stringify(fallbackAudio));

  for (const session of sessions) {
    session.failed = session.failed.filter((entry) => !PLATFORM_ANALYTICS.some((prefix) => entry.startsWith(prefix)));
  }
  checkSessionClean(reporter, landscape, 'landscape session');
  checkSessionClean(reporter, portrait, 'portrait session');
  checkSessionClean(reporter, reduced, 'reduced-motion session');
  checkSessionClean(reporter, playback, 'unmuted-playback session');
  checkSessionClean(reporter, narrow, 'narrow session');
  checkSessionClean(reporter, compact, 'compact-landscape session');
  checkSessionClean(reporter, missingArt, 'missing-art fallback session');

  for (const session of sessions) await session.close();
  await browser.close();
  finish({ suffix: `; shots in ${shots}` });
}

main().catch(async (error) => {
  console.error(error);
  for (const session of sessions) await session.close().catch(() => {});
  process.exitCode = 1;
});
