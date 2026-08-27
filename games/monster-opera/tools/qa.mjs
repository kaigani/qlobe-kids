#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  baseUrl,
  createReporter,
  ensureShots,
  launchChrome,
  openSession,
  resolveShots,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl('http://127.0.0.1:8127');
const url = `${base}/games/monster-opera/`;
const shots = resolveShots('qa-shots/monster-opera');
const root = path.resolve(new URL('..', import.meta.url).pathname);
const assets = path.join(root, 'assets');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const { check, finish, head } = createReporter({ collapse: true, detailLimit: 260 });

function exists(relativePath) {
  return fs.existsSync(path.join(assets, relativePath));
}

function unexpectedDiagnostics(session) {
  const expected = (line) => line.includes('google-analytics.com') || line.includes('googletagmanager.com');
  return [...session.errors, ...session.failed].filter((line) => !expected(line));
}

async function waitForGame(page) {
  await page.waitForFunction(() => window.QLOBE_DEBUG?.getState?.().screen === 'splash');
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
}

async function settleImages(page, selector) {
  await page.evaluate(async (imageSelector) => {
    const images = [...document.querySelectorAll(imageSelector)];
    await Promise.all(images.map((node) => node.decode?.().catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, selector);
}

async function setSyntheticVisibility(page, hidden) {
  await page.evaluate((nextHidden) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => nextHidden });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

async function assertLayout(page, name) {
  const result = await page.evaluate(() => {
    const lanes = [...document.querySelectorAll('.timeline-lane')]
      .map((node) => node.getBoundingClientRect())
      .map((rect) => ({ top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }));
    const targets = window.QLOBE_DEBUG.getTargets()
      .filter(({ rect }) => rect.x + rect.w > 0 && rect.x < innerWidth && rect.y + rect.h > 0 && rect.y < innerHeight);
    return {
      lanes,
      undersized: targets.filter(({ rect }) => rect.w < 95.5 || rect.h < 95.5),
      assetErrors: window.QLOBE_DEBUG.getState().assetErrors,
    };
  });
  check(`${name}: three timeline lanes`, result.lanes.length === 3);
  check(`${name}: lanes have usable geometry`, result.lanes.every((lane) => lane.width > 300 && lane.height > 25));
  check(`${name}: lanes do not overlap`, result.lanes.every((lane, index) => index === 0 || lane.top >= result.lanes[index - 1].bottom - 0.5));
  check(`${name}: visible targets are at least 96px`, result.undersized.length === 0, JSON.stringify(result.undersized));
  check(`${name}: assets loaded`, result.assetErrors.length === 0, result.assetErrors.join(' | '));
}

head('Static package');
check('16-second loop', config.timing.loopSeconds === 16 && config.timing.laneSeconds === 16);
check('four-second monster blocks', config.timing.clipSeconds === 4);
check('three ordered lanes', config.lanes.map(({ id }) => id).join(',') === 'white,yellow,teal');
check('twelve monsters', config.monsters.length === 12);
for (const relativePath of [
  'ui/title.png', 'ui/back.png', 'ui/sound-on.png', 'ui/sound-off.png',
  'ui/drum-on.png', 'ui/drum-off.png', 'ui/go.png', 'ui/new-song.png',
  'ui/play.png', 'ui/playhead.png', 'ui/dot-white.png', 'ui/dot-yellow.png',
  'ui/dot-teal.png', 'ambience/sound-loop.m4a', 'concept/blackboard.jpg',
]) check(`asset ${relativePath}`, exists(relativePath));
for (let monster = 1; monster <= 12; monster += 1) {
  const id = `monster-${String(monster).padStart(2, '0')}`;
  check(`asset ${id}/still.webp`, exists(`monsters/${id}/still.webp`));
  for (const lane of ['01', '02', '03']) {
    check(`asset ${id}/noise-${lane}.mp4`, exists(`monsters/${id}/noise-${lane}.mp4`));
    check(`asset ${id}/noise-${lane}.m4a`, exists(`monsters/${id}/noise-${lane}.m4a`));
  }
}
const activeSource = [
  'index.html', 'config.js', 'config.json', 'css/style.css',
  'js/main.js', 'js/audio-engine.js', 'js/transport.js',
].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
check('active runtime never loads archive', !activeSource.includes('/_archive') && !activeSource.includes('../_archive'));
check('no SVG artwork', !activeSource.includes('<svg') && !activeSource.includes('.svg'));
check('no CSS gradient artwork', !/gradient\s*\(/i.test(activeSource));

await ensureShots(shots);
const browser = await launchChrome({ headless: true });
const sessions = [];

try {
  head('Landscape interaction');
  const session = await openSession(browser, {
    url,
    base,
    viewport: { width: 1280, height: 800 },
    mute: true,
    allowAbortedMedia: true,
    allowRemote: ['https://www.google-analytics.com/', 'https://www.googletagmanager.com/'],
  });
  sessions.push(session);
  const page = session.page;
  await waitForGame(page);
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  check('debug contract v1', await page.evaluate(() => QLOBE_DEBUG.version === 1 && QLOBE_DEBUG.gameId === 'monster-opera'));
  check('splash has only Home and Play', await page.evaluate(() => QLOBE_DEBUG.getTargets().map(({ id }) => id).sort().join(',') === 'home-catalog,start'));
  await page.locator('#start-song').click();
  await page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'composer');
  check('real Start gesture enters composer', true);
  check('beat starts enabled', await page.evaluate(() => QLOBE_DEBUG.getState().beatEnabled));
  check('twelve monster targets', await page.locator('[data-monster-id]').count() === 12);
  await assertLayout(page, 'landscape');
  await page.waitForFunction(() => {
    const { loaded, loading } = QLOBE_DEBUG.getState().audio;
    return loading === 0 && loaded >= 37;
  }, null, { timeout: 30000 });
  const decodedAudio = await page.evaluate(() => QLOBE_DEBUG.getState().audio);
  check('beat and all 36 monster sounds decode', decodedAudio.loaded >= 37 && decodedAudio.errors.length === 0, JSON.stringify(decodedAudio));
  check('looping beat is running by default', decodedAudio.beatPlaying);

  await page.locator('#go-concert').click({ force: true });
  check('Go is gated until a monster is recorded', await page.evaluate(() => QLOBE_DEBUG.getState().screen === 'composer'));

  const tapAt = (time, monsterId) => page.evaluate(({ time, monsterId }) => {
    QLOBE_DEBUG.setComposerTime(time);
    return QLOBE_DEBUG.tap(monsterId);
  }, { time, monsterId });

  check('first seam event accepted', await tapAt(15, 'monster-01'));
  check('same monster inside four-second loop seam rejected', !(await tapAt(1, 'monster-01')));
  check('same monster exactly four seconds across seam accepted', await tapAt(3, 'monster-01'));
  check('different monster may overlap', await tapAt(3, 'monster-02'));
  check('same monster may overlap on another lane', await tapAt(19, 'monster-01'));
  const authored = await page.evaluate(() => QLOBE_DEBUG.getSong().events);
  check('authored song has four events', authored.length === 4, JSON.stringify(authored));
  check('yellow lane uses continuous local time', authored.some((event) => event.laneId === 'yellow' && event.at === 3));
  await page.evaluate(() => QLOBE_DEBUG.setComposerTime(7.2));
  await page.waitForFunction(() => !document.querySelector('.flying-dot'));
  await page.evaluate(() => document.querySelector('.monster-lineup').scrollTo({ left: 0, behavior: 'instant' }));
  await settleImages(page, '.composer-monster .monster-still');
  await page.screenshot({ path: path.join(shots, '02-composer-authored-landscape.png') });

  await page.locator('#go-concert').click();
  await page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'concert');
  check('Go enters concert', true);
  check('concert has three seamless panels', await page.locator('.song-panel').count() === 3);
  check('every event is copied into every panel', await page.locator('.concert-event').count() === authored.length * 3);
  check('concert starts at zero', await page.evaluate(() => QLOBE_DEBUG.getState().concertPhase < 0.6));
  await page.evaluate(() => QLOBE_DEBUG.setConcertTime(5.2));
  await settleImages(page, '.concert-track-art, .concert-event .monster-still');
  await page.screenshot({ path: path.join(shots, '03-concert-landscape.png') });

  const soloPoint = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll('.concert-event')]
      .map((node) => ({ node, rect: node.getBoundingClientRect() }))
      .filter(({ rect }) => rect.right > 120 && rect.left < innerWidth - 120 && rect.bottom > 100 && rect.top < innerHeight - 100)
      .sort((a, b) => Math.abs(a.rect.left + a.rect.width / 2 - innerWidth / 2) - Math.abs(b.rect.left + b.rect.width / 2 - innerWidth / 2));
    const rect = candidates[0]?.rect;
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  });
  check('visible concert solo target found', Boolean(soloPoint), JSON.stringify(soloPoint));
  if (soloPoint) await page.mouse.click(soloPoint.x, soloPoint.y);
  check('real concert tap starts an independent manual solo', await page.evaluate(() => QLOBE_DEBUG.getAudioLog().some(({ kind }) => kind === 'manual')));

  await page.evaluate(() => QLOBE_DEBUG.setConcertTime(5));
  const scheduledBeforeHide = await page.evaluate(() => QLOBE_DEBUG.getAudioLog().filter(({ kind }) => kind === 'scheduled').length);
  await setSyntheticVisibility(page, true);
  const hiddenTransport = await page.evaluate(() => QLOBE_DEBUG.getTransportState());
  check('hidden page pauses concert transport', !hiddenTransport.concertRunning && hiddenTransport.scheduled === 0, JSON.stringify(hiddenTransport));
  await setSyntheticVisibility(page, false);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const resumedTransport = await page.evaluate(() => QLOBE_DEBUG.getTransportState());
  const scheduledAfterResume = await page.evaluate(() => QLOBE_DEBUG.getAudioLog().filter(({ kind }) => kind === 'scheduled').length);
  check('visible page resumes from preserved phase', resumedTransport.concertRunning && Math.abs(resumedTransport.concertElapsed - 5) < 0.35, JSON.stringify(resumedTransport));
  check('resume does not emit a catch-up burst', scheduledAfterResume - scheduledBeforeHide <= 1, `${scheduledBeforeHide} → ${scheduledAfterResume}`);
  await page.evaluate(() => { delete document.hidden; });

  const initialSound = await page.evaluate(() => QLOBE_DEBUG.getState().muted);
  await page.locator('#concert-sound').click();
  check('sound control toggles global mute', await page.evaluate((before) => QLOBE_DEBUG.getState().muted !== before, initialSound));
  const initialBeat = await page.evaluate(() => QLOBE_DEBUG.getState().beatEnabled);
  await page.locator('#concert-beat').click();
  check('drum control toggles the looping beat', await page.evaluate((before) => QLOBE_DEBUG.getState().beatEnabled !== before, initialBeat));

  await page.locator('#concert-back').click();
  await page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'composer');
  check('Back preserves the authored song', await page.evaluate(() => QLOBE_DEBUG.getSong().events.length === 4));
  await page.evaluate(() => {
    QLOBE_DEBUG.tap('go');
    QLOBE_DEBUG.home();
    QLOBE_DEBUG.startMode('composer');
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  check('abandoned Go cannot reopen a stale concert', await page.evaluate(() => QLOBE_DEBUG.getState().screen === 'composer' && !QLOBE_DEBUG.getState().concertStarting));
  await page.locator('#go-concert').click();
  await page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'concert');
  await page.locator('#new-song').click();
  await page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'composer');
  const fresh = await page.evaluate(() => QLOBE_DEBUG.getState());
  check('New Song clears every event', fresh.song.events.length === 0);
  check('New Song returns to white at zero', fresh.activeLaneId === 'white' && fresh.composerPhase < 0.5, JSON.stringify(fresh));
  check('no runtime asset errors', fresh.assetErrors.length === 0, fresh.assetErrors.join(' | '));
  const unexpected = unexpectedDiagnostics(session);
  check('no console or local HTTP failures', unexpected.length === 0, unexpected.join(' | '));

  head('Responsive layouts');
  for (const spec of [
    { width: 768, height: 1024, name: 'portrait', shot: '04-composer-portrait.png' },
    { width: 1180, height: 520, name: 'short landscape', shot: '05-composer-short-landscape.png' },
  ]) {
    const responsive = await openSession(browser, {
      url,
      base,
      viewport: { width: spec.width, height: spec.height },
      mute: true,
      allowAbortedMedia: true,
      allowRemote: ['https://www.google-analytics.com/', 'https://www.googletagmanager.com/'],
    });
    sessions.push(responsive);
    await waitForGame(responsive.page);
    await responsive.page.locator('#start-song').click();
    await responsive.page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'composer');
    await responsive.page.evaluate(() => {
      QLOBE_DEBUG.setComposerTime(2);
      QLOBE_DEBUG.tap('monster-01');
      QLOBE_DEBUG.setComposerTime(19);
      QLOBE_DEBUG.tap('monster-02');
      QLOBE_DEBUG.setComposerTime(36);
      QLOBE_DEBUG.tap('monster-03');
      QLOBE_DEBUG.setComposerTime(7);
    });
    await responsive.page.waitForFunction(() => !document.querySelector('.flying-dot'));
    await settleImages(responsive.page, '.composer-monster .monster-still');
    await responsive.page.screenshot({ path: path.join(shots, spec.shot) });
    await assertLayout(responsive.page, spec.name);
    const responsiveUnexpected = unexpectedDiagnostics(responsive);
    check(`${spec.name}: no console or local HTTP failures`, responsiveUnexpected.length === 0, responsiveUnexpected.join(' | '));
  }

  head('Unmuted media and overlap');
  const audible = await openSession(browser, {
    url,
    base,
    viewport: { width: 1280, height: 800 },
    mute: false,
    allowAbortedMedia: true,
    allowRemote: ['https://www.google-analytics.com/', 'https://www.googletagmanager.com/'],
  });
  sessions.push(audible);
  await waitForGame(audible.page);
  await audible.page.locator('#start-song').click();
  await audible.page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'composer');
  await audible.page.evaluate(() => QLOBE_DEBUG.setComposerTime(3));
  await audible.page.locator('[data-monster-id="monster-01"]').click();
  await audible.page.locator('#go-concert').click();
  await audible.page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'concert');
  const coldStart = await audible.page.evaluate(() => QLOBE_DEBUG.getState());
  check('cold concert waits for its authored sound', !coldStart.concertStarting && coldStart.audio.loaded >= 2 && coldStart.audio.errors.length === 0, JSON.stringify(coldStart.audio));
  check('unmuted beat is running', !coldStart.muted && coldStart.audio.contextState === 'running' && coldStart.audio.beatPlaying, JSON.stringify(coldStart.audio));
  await audible.page.evaluate(() => QLOBE_DEBUG.setConcertTime(2.9));
  const overlapPoint = await audible.page.evaluate(() => {
    const rect = [...document.querySelectorAll('.concert-event')]
      .map((node) => node.getBoundingClientRect())
      .find((item) => item.right > 120 && item.left < innerWidth - 120 && item.bottom > 100 && item.top < innerHeight - 100);
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  });
  if (overlapPoint) await audible.page.mouse.click(overlapPoint.x, overlapPoint.y);
  await audible.page.waitForFunction(() => QLOBE_DEBUG.getState().audio.voices >= 2);
  const overlap = await audible.page.evaluate(() => ({ state: QLOBE_DEBUG.getState(), log: QLOBE_DEBUG.getAudioLog() }));
  check('manual and scheduled copies overlap as separate voices', overlap.state.audio.voices >= 2 && overlap.state.activeManualVoices >= 1, JSON.stringify(overlap.state.audio));
  check('same event logs both scheduled and manual playback', ['scheduled', 'manual'].every((kind) => overlap.log.some((entry) => entry.kind === kind && entry.eventId === 'event-1')), JSON.stringify(overlap.log));
  const audibleUnexpected = unexpectedDiagnostics(audible);
  check('unmuted session has no media or console failures', audibleUnexpected.length === 0 && overlap.state.audio.errors.length === 0, audibleUnexpected.join(' | '));

  head('Reduced motion');
  const reduced = await openSession(browser, {
    url,
    base,
    viewport: { width: 1280, height: 800 },
    reducedMotion: 'reduce',
    mute: true,
    allowAbortedMedia: true,
    allowRemote: ['https://www.google-analytics.com/', 'https://www.googletagmanager.com/'],
  });
  sessions.push(reduced);
  await waitForGame(reduced.page);
  await reduced.page.locator('#start-song').click();
  await reduced.page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'composer');
  await reduced.page.evaluate(() => {
    QLOBE_DEBUG.setComposerTime(3);
    QLOBE_DEBUG.tap('monster-01');
  });
  await reduced.page.locator('#go-concert').click();
  await reduced.page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'concert');
  await reduced.page.evaluate(() => QLOBE_DEBUG.setConcertTime(7));
  await settleImages(reduced.page, '.concert-track-art, .concert-event .monster-still');
  const reducedState = await reduced.page.evaluate(() => ({
    matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
    transform: document.querySelector('.concert-world').style.transform,
    screen: QLOBE_DEBUG.getState().screen,
  }));
  check('reduced-motion preference is active', reducedState.matches);
  check('reduced-motion concert uses a stable center panel', reducedState.screen === 'concert' && reducedState.transform.includes('-100vw'), JSON.stringify(reducedState));
  await reduced.page.screenshot({ path: path.join(shots, '06-concert-reduced-motion.png') });
  const reducedUnexpected = unexpectedDiagnostics(reduced);
  check('reduced-motion session has no console or local HTTP failures', reducedUnexpected.length === 0, reducedUnexpected.join(' | '));
} finally {
  await Promise.all(sessions.map((session) => session.context.close()));
  await browser.close();
}

await finish({ suffix: `; shots in ${shots}` });
